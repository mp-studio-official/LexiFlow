import type { ProviderState } from '../providers/state';
import {
  TranslationAbortedError,
  TranslationUnavailableError,
  type TranslationProvider,
} from './TranslationProvider';

/**
 * Übersetzung über die eingebaute Translator-API von Chrome.
 *
 * Das Modell läuft **auf dem Gerät**. Diese Datei ruft niemals selbst `fetch`
 * auf; den Modelldownload erledigt der Browser, und er startet erst nach einem
 * ausdrücklichen Klick der Lehrkraft. Erkannt wird die API ausschließlich über
 * Feature Detection – kein User-Agent-Sniffing.
 */

interface DownloadProgressEvent extends Event {
  readonly loaded: number;
  readonly total?: number;
}

interface CreateMonitor {
  addEventListener(type: 'downloadprogress', listener: (event: DownloadProgressEvent) => void): void;
}

interface TranslatorInstance {
  translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy?(): void;
}

interface TranslatorOptions {
  sourceLanguage: string;
  targetLanguage: string;
  monitor?: (monitor: CreateMonitor) => void;
  signal?: AbortSignal;
}

interface TranslatorApi {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(options: TranslatorOptions): Promise<TranslatorInstance>;
}

/**
 * Reine Feature Detection – der Zugriff bleibt an einer Stelle gebündelt.
 *
 * Ein Web-IDL-Interface-Objekt ist im Browser eine **Funktion** (eine
 * Konstruktorfunktion mit statischen Methoden), kein einfaches Objekt. Ein
 * `typeof === 'object'` würde die echte API also aussperren. Entscheidend ist
 * allein, ob `availability` und `create` aufrufbar sind.
 */
export function getTranslatorApi(scope: unknown = globalThis): TranslatorApi | undefined {
  const candidate = (scope as { Translator?: unknown }).Translator;
  if (!candidate) return undefined;
  if (typeof candidate !== 'object' && typeof candidate !== 'function') return undefined;
  const api = candidate as Partial<TranslatorApi>;
  if (typeof api.availability !== 'function' || typeof api.create !== 'function') return undefined;
  return api as TranslatorApi;
}

const KNOWN_STATES: ReadonlySet<string> = new Set([
  'unavailable',
  'downloadable',
  'downloading',
  'available',
]);

function toProviderState(value: string): ProviderState {
  return KNOWN_STATES.has(value) ? (value as ProviderState) : 'unavailable';
}

export const CHROME_TRANSLATION_NOTICE =
  'Die Übersetzung läuft lokal in Chrome. Der Text wird nicht an LexiFlow oder einen Cloud-Dienst übertragen.';

/**
 * Erzeugt den Chrome-Anbieter. `scope` ist nur für Tests gedacht; in der App
 * wird `globalThis` (also `self`) verwendet.
 */
export function createChromeTranslationProvider(scope: unknown = globalThis): TranslationProvider {
  let instance: TranslatorInstance | undefined;
  let instanceKey = '';
  /** Übersetzungen laufen streng nacheinander. */
  let queue: Promise<unknown> = Promise.resolve();

  function keyOf(source: string, target: string): string {
    return `${source}->${target}`;
  }

  async function getAvailability(source: string, target: string): Promise<ProviderState> {
    const api = getTranslatorApi(scope);
    if (!api) return 'unavailable';
    try {
      return toProviderState(await api.availability({ sourceLanguage: source, targetLanguage: target }));
    } catch {
      // Ein nicht unterstützter Browser ist ein normaler Zustand, kein Fehler.
      return 'unavailable';
    }
  }

  return {
    info: {
      id: 'chrome-translator',
      label: 'Chrome – lokale Übersetzung',
      dataNotice: CHROME_TRANSLATION_NOTICE,
      sendsDataOffDevice: false,
    },

    getAvailability,

    async prepare(source, target, onProgress, signal) {
      const api = getTranslatorApi(scope);
      if (!api) throw new TranslationUnavailableError('Dieser Browser bietet keine lokale Übersetzung.');
      if (signal?.aborted) throw new TranslationAbortedError();

      const key = keyOf(source, target);
      if (instance && instanceKey === key) return;

      instance?.destroy?.();
      instance = undefined;

      const options: TranslatorOptions = {
        sourceLanguage: source,
        targetLanguage: target,
        monitor: (monitor) => {
          monitor.addEventListener('downloadprogress', (event) => {
            const total = event.total ?? 1;
            const ratio = total > 0 ? event.loaded / total : event.loaded;
            onProgress?.(Math.max(0, Math.min(1, ratio)));
          });
        },
        ...(signal ? { signal } : {}),
      };

      instance = await api.create(options);
      instanceKey = key;
      onProgress?.(1);
    },

    async translate(text, signal) {
      if (!instance) throw new TranslationUnavailableError('Das Sprachmodell ist noch nicht geladen.');
      if (signal?.aborted) throw new TranslationAbortedError();

      // Sequentiell: an die Kette anhängen, Fehler brechen sie nicht ab.
      const run = queue.then(
        () => instance?.translate(text, signal ? { signal } : undefined),
        () => instance?.translate(text, signal ? { signal } : undefined),
      );
      queue = run.catch(() => undefined);

      const result = await run;
      if (typeof result !== 'string') throw new TranslationUnavailableError();
      return result;
    },

    destroy() {
      instance?.destroy?.();
      instance = undefined;
      instanceKey = '';
      queue = Promise.resolve();
    },
  };
}

/**
 * Der Anbieter, den die App verwendet: Chrome, wenn die API vorhanden ist –
 * die Verfügbarkeit für ein Sprachpaar wird davon unabhängig asynchron geprüft.
 */
export function detectTranslationProvider(scope: unknown = globalThis): TranslationProvider | undefined {
  return getTranslatorApi(scope) ? createChromeTranslationProvider(scope) : undefined;
}
