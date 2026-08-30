import type { ProviderState } from '../providers/state';
import {
  TranslationAbortedError,
  TranslationUnavailableError,
  type TranslationProvider,
} from '../translation/TranslationProvider';

/**
 * Testdoubles für Übersetzung.
 *
 * Automatisierte Tests laden niemals ein echtes Browsermodell. Sie arbeiten
 * entweder gegen `createFakeTranslatorScope` (prüft den Chrome-Anbieter gegen
 * eine nachgebaute Translator-API) oder gegen `createFakeTranslationProvider`
 * (prüft die Oberfläche gegen einen beliebigen Anbieter).
 */

interface Listener {
  (event: { loaded: number; total?: number }): void;
}

export interface FakeTranslatorScope {
  Translator?: {
    availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
    create(options: {
      sourceLanguage: string;
      targetLanguage: string;
      monitor?: (monitor: {
        addEventListener(type: 'downloadprogress', listener: Listener): void;
      }) => void;
      signal?: AbortSignal;
    }): Promise<{
      translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
      destroy?(): void;
    }>;
  };
}

export interface FakeTranslatorOptions {
  /** Zustand, den `availability()` meldet. */
  availability?: ProviderState;
  /** Fortschrittswerte, die `create()` über den Monitor meldet. */
  progress?: readonly number[];
  /** Übersetzt einen Text; Standard: `[de] <text>`. */
  translate?: (text: string) => string | Promise<string>;
  /** Lässt `availability()` scheitern (nicht unterstützter Browser). */
  availabilityThrows?: boolean;
}

export interface FakeTranslatorHandle {
  scope: FakeTranslatorScope;
  /** Reihenfolge der tatsächlich übersetzten Texte. */
  readonly calls: string[];
  /** Wie oft `create()` aufgerufen wurde – der „Modelldownload“. */
  readonly createCount: () => number;
  readonly destroyCount: () => number;
  /** Zeitpunkte in Aufrufreihenfolge, um Sequentialität zu prüfen. */
  readonly overlaps: () => number;
}

/** Baut eine `self.Translator`-Attrappe – ohne Netzwerk, ohne echtes Modell. */
export function createFakeTranslatorScope(
  options: FakeTranslatorOptions = {},
): FakeTranslatorHandle {
  const {
    availability = 'downloadable',
    progress = [0.5, 1],
    translate = (text: string) => `[de] ${text}`,
    availabilityThrows = false,
  } = options;

  const calls: string[] = [];
  let createCount = 0;
  let destroyCount = 0;
  let active = 0;
  let overlaps = 0;

  const scope: FakeTranslatorScope = {
    Translator: {
      availability() {
        if (availabilityThrows) return Promise.reject(new Error('not supported'));
        return Promise.resolve(availability);
      },
      create(createOptions) {
        createCount += 1;
        createOptions.monitor?.({
          addEventListener(type, listener) {
            if (type !== 'downloadprogress') return;
            for (const value of progress) listener({ loaded: value, total: 1 });
          },
        });
        return Promise.resolve({
          async translate(text, translateOptions) {
            if (translateOptions?.signal?.aborted) throw new TranslationAbortedError();
            active += 1;
            if (active > 1) overlaps += 1;
            await Promise.resolve();
            const result = await translate(text);
            active -= 1;
            calls.push(text);
            return result;
          },
          destroy() {
            destroyCount += 1;
          },
        });
      },
    },
  };

  return {
    scope,
    calls,
    createCount: () => createCount,
    destroyCount: () => destroyCount,
    overlaps: () => overlaps,
  };
}

export interface FakeProviderOptions {
  availability?: ProviderState;
  translate?: (text: string) => string;
  /** Diese Texte scheitern beim ersten Versuch. */
  failFor?: readonly string[];
  progress?: readonly number[];
}

export interface FakeTranslationProviderHandle {
  provider: TranslationProvider;
  readonly translated: string[];
  readonly prepareCount: () => number;
}

/**
 * Ein vollständiger `TranslationProvider` für Komponententests: deterministisch,
 * ohne Modell, ohne Netzwerk.
 */
export function createFakeTranslationProvider(
  options: FakeProviderOptions = {},
): FakeTranslationProviderHandle {
  const {
    availability = 'downloadable',
    translate = (text: string) => `${text}-de`,
    failFor = [],
    progress = [0.4, 1],
  } = options;

  const translated: string[] = [];
  const failed = new Set<string>();
  let prepareCount = 0;
  let ready = false;

  const provider: TranslationProvider = {
    info: {
      id: 'fake',
      label: 'Testübersetzung',
      dataNotice: 'Testanbieter. Es werden keine Daten übertragen.',
      sendsDataOffDevice: false,
    },
    getAvailability: () => Promise.resolve(availability),
    async prepare(_source, _target, onProgress, signal) {
      if (availability === 'unavailable') throw new TranslationUnavailableError();
      if (signal?.aborted) throw new TranslationAbortedError();
      prepareCount += 1;
      for (const value of progress) onProgress?.(value);
      ready = true;
      await Promise.resolve();
    },
    async translate(text, signal) {
      // Gleiche Aussage wie der echte Chrome-Anbieter, damit Tests die
      // Verwechslung von „verfügbar“ und „vorbereitet“ sichtbar machen.
      if (!ready) throw new TranslationUnavailableError('Das Sprachmodell ist noch nicht geladen.');
      if (signal?.aborted) throw new TranslationAbortedError();
      await Promise.resolve();
      // Beim ersten Versuch scheitern, damit „Erneut versuchen“ prüfbar ist.
      if (failFor.includes(text) && !failed.has(text)) {
        failed.add(text);
        throw new Error('Übersetzung fehlgeschlagen.');
      }
      translated.push(text);
      return translate(text);
    },
    destroy() {
      ready = false;
    },
  };

  return { provider, translated, prepareCount: () => prepareCount };
}
