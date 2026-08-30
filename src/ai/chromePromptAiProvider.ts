import { z } from 'zod';
import { PART_OF_SPEECH } from '../domain/schema';
import type { ProviderState } from '../providers/state';
import {
  AiUnavailableError,
  type AiCapability,
  type AiGenerationContext,
  type AiProvider,
  type AiVocabSuggestion,
} from './AiProvider';

/**
 * Vorschläge über das eingebaute Sprachmodell des Browsers (Prompt-API).
 *
 * Das Modell läuft **auf dem Gerät**. Diese Datei ruft niemals `fetch` auf; den
 * Modelldownload erledigt der Browser, und er beginnt erst nach einem
 * ausdrücklichen Klick. Erkannt wird die API ausschließlich über Feature
 * Detection – kein User-Agent-Sniffing.
 *
 * In Sprint 2B.1 kann der Anbieter genau eine Sache: einen vorhandenen Eintrag
 * um Wortart, Schwierigkeit und Themen-Tags ergänzen. Alles andere meldet er
 * ehrlich als nicht verfügbar.
 *
 * Die Ausgabe wird **erzwungen**, nicht erbeten: `responseConstraint` gibt dem
 * Modell ein JSON-Schema vor, und die Antwort läuft anschließend noch durch
 * Zod. Was dort durchfällt, wird nicht teilweise übernommen, sondern als Fehler
 * an genau dieser Zeile gemeldet.
 */

export const AI_CAPABILITY: AiCapability = 'enrich-entry';

export const CHROME_PROMPT_NOTICE =
  'Das Sprachmodell läuft lokal in deinem Browser. Weder Vokabeln noch Texte werden an LexiFlow oder einen Cloud-Dienst übertragen.';

/** Sprachen, die der Anbieter für diese Aufgabe braucht. */
const INPUT_LANGUAGES = ['en', 'de'] as const;
const OUTPUT_LANGUAGE = 'en';

// ---------------------------------------------------------------------------
// Vertrag mit dem Modell
// ---------------------------------------------------------------------------

/** JSON-Schema für `responseConstraint` – die Ausgabe ist damit strukturiert. */
export const ENRICH_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['partOfSpeech', 'difficulty', 'topicTags'],
  properties: {
    partOfSpeech: { type: 'string', enum: [...PART_OF_SPEECH] },
    difficulty: { type: 'integer', minimum: 1, maximum: 5 },
    topicTags: {
      type: 'array',
      maxItems: 3,
      items: { type: 'string', maxLength: 24 },
    },
  },
} as const;

/** Zweite Verteidigungslinie: Auch strukturierte Ausgaben können falsch sein. */
export const enrichResponse = z.object({
  partOfSpeech: z.enum(PART_OF_SPEECH),
  difficulty: z.number().int().min(1).max(5),
  topicTags: z.array(z.string().trim().min(1).max(24)).max(3),
});

export type EnrichResponse = z.infer<typeof enrichResponse>;

export class AiResponseError extends Error {
  constructor(message = 'Die Antwort des Sprachmodells war nicht verwertbar.') {
    super(message);
    this.name = 'AiResponseError';
  }
}

/** Baut die Anweisung – nur die Daten, die für die Aufgabe nötig sind. */
export function buildEnrichPrompt(entry: AiVocabSuggestion, context: AiGenerationContext): string {
  const lines = [
    'Du hilfst einer Englischlehrkraft an einem deutschen Gymnasium.',
    'Ordne die folgende Vokabel ein. Antworte ausschließlich im vorgegebenen JSON-Format.',
    '',
    `Englisches Stichwort: ${entry.english}`,
  ];
  if (entry.germanAnswers.length > 0) {
    lines.push(`Deutsche Bedeutung: ${entry.germanAnswers.join(', ')}`);
  }
  const sentence = entry.exampleSentences?.[0]?.english;
  if (sentence) lines.push(`Beispielsatz: ${sentence}`);
  lines.push(`Jahrgangsstufe: ${context.grade}`);
  lines.push(`Sprachniveau (GeR): ${context.cefrLevel}`);
  if (context.topic) lines.push(`Thema des Pakets: ${context.topic}`);
  lines.push(
    '',
    'difficulty: 1 = für diese Lerngruppe sehr leicht, 5 = sehr schwer.',
    'topicTags: höchstens drei kurze englische Schlagwörter zum Sachfeld.',
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Browser-API
// ---------------------------------------------------------------------------

interface DownloadProgressEvent extends Event {
  readonly loaded: number;
  readonly total?: number;
}

interface CreateMonitor {
  addEventListener(type: 'downloadprogress', listener: (event: DownloadProgressEvent) => void): void;
}

interface LanguageModelSession {
  prompt(
    input: string,
    options?: { responseConstraint?: unknown; signal?: AbortSignal },
  ): Promise<string>;
  destroy?(): void;
}

interface LanguageModelOptions {
  monitor?: (monitor: CreateMonitor) => void;
  signal?: AbortSignal;
  expectedInputs?: Array<{ type: 'text'; languages: string[] }>;
  expectedOutputs?: Array<{ type: 'text'; languages: string[] }>;
}

interface LanguageModelApi {
  availability(options?: LanguageModelOptions): Promise<string>;
  create(options?: LanguageModelOptions): Promise<LanguageModelSession>;
}

/** Reine Feature Detection – der Zugriff bleibt an einer Stelle gebündelt. */
export function getLanguageModelApi(scope: unknown = globalThis): LanguageModelApi | undefined {
  const candidate = (scope as { LanguageModel?: unknown }).LanguageModel;
  if (!candidate || typeof candidate !== 'object') return undefined;
  const api = candidate as Partial<LanguageModelApi>;
  if (typeof api.availability !== 'function' || typeof api.create !== 'function') return undefined;
  return api as LanguageModelApi;
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

function languageOptions(): LanguageModelOptions {
  return {
    expectedInputs: [{ type: 'text', languages: [...INPUT_LANGUAGES] }],
    expectedOutputs: [{ type: 'text', languages: [OUTPUT_LANGUAGE] }],
  };
}

/**
 * Erzeugt den Anbieter. `scope` ist nur für Tests gedacht; in der App wird
 * `globalThis` (also `self`) verwendet.
 */
export function createChromePromptAiProvider(scope: unknown = globalThis): AiProvider {
  let session: LanguageModelSession | undefined;
  /** Anfragen laufen streng nacheinander – ein lokales Modell rechnet seriell. */
  let queue: Promise<unknown> = Promise.resolve();

  async function getAvailability(capability: AiCapability): Promise<ProviderState> {
    // Sprint 2B.1 kann genau eine Sache. Alles andere ist ehrlich unavailable.
    if (capability !== AI_CAPABILITY) return 'unavailable';
    const api = getLanguageModelApi(scope);
    if (!api) return 'unavailable';
    try {
      // Die Sprachprüfung gehört dazu: Ein einsprachiges Modell nützt hier nichts.
      return toProviderState(await api.availability(languageOptions()));
    } catch {
      // Ein nicht unterstützter Browser ist ein normaler Zustand, kein Fehler.
      return 'unavailable';
    }
  }

  function requireSession(): LanguageModelSession {
    if (!session) throw new AiUnavailableError('Das Sprachmodell ist noch nicht geladen.');
    return session;
  }

  async function runPrompt(
    entry: AiVocabSuggestion,
    context: AiGenerationContext,
  ): Promise<EnrichResponse> {
    const active = requireSession();
    if (context.signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');

    const prompt = buildEnrichPrompt(entry, context);
    const call = () =>
      active.prompt(prompt, {
        responseConstraint: ENRICH_RESPONSE_SCHEMA,
        ...(context.signal ? { signal: context.signal } : {}),
      });

    // An die Kette anhängen; ein Fehler bricht sie nicht ab.
    const run = queue.then(call, call);
    queue = run.catch(() => undefined);

    const raw = await run;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AiResponseError('Das Sprachmodell hat kein gültiges JSON geliefert.');
    }

    const checked = enrichResponse.safeParse(parsed);
    if (!checked.success) {
      // Nichts teilweise übernehmen: entweder alles gültig oder gar nichts.
      throw new AiResponseError('Die Antwort des Sprachmodells passte nicht zum erwarteten Format.');
    }
    return checked.data;
  }

  return {
    info: {
      id: 'chrome-prompt',
      label: 'Lokales Sprachmodell des Browsers',
      dataNotice: CHROME_PROMPT_NOTICE,
      sendsDataOffDevice: false,
      processing: 'on-device',
    },

    capabilities: () => [AI_CAPABILITY],

    getAvailability,

    async prepare(capability, onProgress, signal) {
      if (capability !== AI_CAPABILITY) {
        throw new AiUnavailableError('Diese Fähigkeit gibt es in dieser Fassung noch nicht.');
      }
      const api = getLanguageModelApi(scope);
      if (!api) {
        throw new AiUnavailableError('Dieser Browser bietet kein lokales Sprachmodell.');
      }
      if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      if (session) return;

      const options: LanguageModelOptions = {
        ...languageOptions(),
        monitor: (monitor) => {
          monitor.addEventListener('downloadprogress', (event) => {
            const total = event.total ?? 1;
            const ratio = total > 0 ? event.loaded / total : event.loaded;
            onProgress?.(Math.max(0, Math.min(1, ratio)));
          });
        },
        ...(signal ? { signal } : {}),
      };

      session = await api.create(options);
      onProgress?.(1);
    },

    async enrichEntry(entry, context) {
      const result = await runPrompt(entry, context);
      return {
        ...entry,
        partOfSpeech: result.partOfSpeech,
        difficulty: result.difficulty,
        topicTags: result.topicTags,
      };
    },

    suggestFromText: () =>
      Promise.reject(new AiUnavailableError('Vorschläge aus einem Text sind hier nicht vorgesehen.')),
    suggestFromTopic: () =>
      Promise.reject(new AiUnavailableError('Vorschläge zu einem Thema sind hier nicht vorgesehen.')),
    alternativeSentence: () =>
      Promise.reject(new AiUnavailableError('Alternative Beispielsätze sind hier nicht vorgesehen.')),

    destroy() {
      session?.destroy?.();
      session = undefined;
      queue = Promise.resolve();
    },
  };
}

/** Der Anbieter, den die App verwendet – oder `undefined` ohne Prompt-API. */
export function detectPromptAiProvider(scope: unknown = globalThis): AiProvider | undefined {
  return getLanguageModelApi(scope) ? createChromePromptAiProvider(scope) : undefined;
}
