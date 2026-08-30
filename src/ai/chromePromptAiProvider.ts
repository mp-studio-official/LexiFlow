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
 * Der Anbieter kann zwei Dinge: einen vorhandenen Eintrag um Wortart,
 * Schwierigkeit und Themen-Tags ergänzen (`enrich-entry`) und zu einem Thema
 * Vokabelvorschläge erzeugen (`suggest-from-topic`). Alles andere meldet er
 * ehrlich als nicht verfügbar.
 *
 * **Eine Sitzung je Fähigkeit.** Die beiden Aufgaben brauchen unterschiedliche
 * Sprachkonfigurationen – `enrich-entry` antwortet englisch, die Themenwerkstatt
 * zweisprachig. Eine gemeinsame Sitzung wäre für eine von beiden falsch
 * konfiguriert. Jede Fähigkeit hat deshalb ihre eigene Sitzung **und** ihre
 * eigene Warteschlange; ein Fehler der einen lässt die andere unberührt.
 *
 * Die Ausgabe wird **erzwungen**, nicht erbeten: `responseConstraint` gibt dem
 * Modell ein JSON-Schema vor, und die Antwort läuft anschließend noch durch
 * Zod. Was dort durchfällt, wird nicht teilweise übernommen, sondern als Fehler
 * an genau dieser Zeile gemeldet.
 */

export const AI_CAPABILITY: AiCapability = 'enrich-entry';
export const TOPIC_CAPABILITY: AiCapability = 'suggest-from-topic';

/** Was dieser Anbieter kann – in dieser Reihenfolge auch nach außen gemeldet. */
export const SUPPORTED_CAPABILITIES: readonly AiCapability[] = [AI_CAPABILITY, TOPIC_CAPABILITY];

/** Obergrenze für eine Themenanfrage – auch das Schema begrenzt darauf. */
export const MAX_TOPIC_ENTRIES = 20;

export const CHROME_PROMPT_NOTICE =
  'Das Sprachmodell läuft lokal in deinem Browser. Weder Vokabeln noch Texte werden an LexiFlow oder einen Cloud-Dienst übertragen.';

/**
 * Sprachen je Fähigkeit.
 *
 * `enrich-entry` bekommt englische Stichwörter und deutsche Bedeutungen herein
 * und antwortet mit englischen Schlagwörtern. Die Themenwerkstatt muss dagegen
 * auch **deutsche Übersetzungen erzeugen** – ein einsprachiges Modell wäre dafür
 * unbrauchbar, und genau das soll `availability` vorher erkennen.
 */
const CAPABILITY_LANGUAGES: Readonly<
  Record<'enrich-entry' | 'suggest-from-topic', { inputs: string[]; outputs: string[] }>
> = {
  'enrich-entry': { inputs: ['en', 'de'], outputs: ['en'] },
  'suggest-from-topic': { inputs: ['de', 'en'], outputs: ['de', 'en'] },
};

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

/** JSON-Schema für die Themenwerkstatt – erzwungen, nicht erbeten. */
export const TOPIC_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['entries'],
  properties: {
    entries: {
      type: 'array',
      maxItems: MAX_TOPIC_ENTRIES,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['english', 'germanAnswers', 'partOfSpeech', 'difficulty', 'topicTags'],
        properties: {
          english: { type: 'string', minLength: 1, maxLength: 60 },
          germanAnswers: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: { type: 'string', minLength: 1, maxLength: 60 },
          },
          partOfSpeech: { type: 'string', enum: [...PART_OF_SPEECH] },
          difficulty: { type: 'integer', minimum: 1, maximum: 5 },
          topicTags: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 24 } },
          exampleSentence: {
            type: 'object',
            additionalProperties: false,
            required: ['english'],
            properties: {
              english: { type: 'string', maxLength: 160 },
              german: { type: 'string', maxLength: 160 },
            },
          },
        },
      },
    },
  },
} as const;

/** Zweite Verteidigungslinie – dieselben Grenzen noch einmal in Zod. */
export const topicEntry = z.object({
  english: z.string().trim().min(1).max(60),
  germanAnswers: z.array(z.string().trim().min(1).max(60)).min(1).max(3),
  partOfSpeech: z.enum(PART_OF_SPEECH),
  difficulty: z.number().int().min(1).max(5),
  topicTags: z.array(z.string().trim().min(1).max(24)).max(3),
  exampleSentence: z
    .object({
      english: z.string().trim().max(160),
      german: z.string().trim().max(160).optional(),
    })
    .optional(),
});

export const topicResponse = z.object({
  entries: z.array(topicEntry).max(MAX_TOPIC_ENTRIES),
});

export type TopicEntry = z.infer<typeof topicEntry>;
export type TopicResponse = z.infer<typeof topicResponse>;

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

/**
 * Anweisung für die Themenwerkstatt.
 *
 * Übergeben wird ausschließlich, was für die Aufgabe nötig ist: Thema,
 * Lerngruppe, gewünschte Schwierigkeit und Anzahl sowie die bereits
 * vorhandenen englischen Stichwörter, damit nichts doppelt kommt. Keine
 * Lernstände, keine Paket-IDs, keine personenbezogenen Daten.
 */
export function buildTopicPrompt(topic: string, context: AiGenerationContext): string {
  const count = Math.min(context.maxItems ?? 10, MAX_TOPIC_ENTRIES);
  const lines = [
    'Du hilfst einer Englischlehrkraft an einem deutschen Gymnasium beim Erstellen einer Vokabelliste.',
    'Antworte ausschließlich im vorgegebenen JSON-Format.',
    '',
    `Thema: ${topic}`,
    `Jahrgangsstufe: ${context.grade}`,
    `Sprachniveau (GeR): ${context.cefrLevel}`,
    `Gewünschte Schwierigkeit: ${context.difficulty ?? 3} von 5 – bezogen auf genau diese Lerngruppe.`,
    `Anzahl: höchstens ${count} Vokabeln.`,
  ];

  const existing = context.existingEnglish ?? [];
  if (existing.length > 0) {
    lines.push(`Diese Stichwörter sind bereits vorhanden und dürfen nicht erneut vorkommen: ${existing.join(', ')}.`);
  }

  lines.push(
    '',
    'Regeln:',
    '- schulgeeignetes, gebräuchliches Englisch',
    '- jede Vokabel passt inhaltlich zum Thema',
    '- keine beleidigenden, gewalthaltigen oder sexualisierten Inhalte',
    '- keine Beispiele über reale oder erfundene Personen mit persönlichen Angaben',
    '- abwechslungsreiche Wortarten, nicht nur Substantive',
    '- keine bloßen Varianten desselben Wortes (nicht "run" und "running")',
    '- germanAnswers: die gebräuchlichste deutsche Bedeutung zuerst',
    '- exampleSentence.english: ein kurzer, verständlicher Satz, der das Stichwort wörtlich enthält',
    '- exampleSentence.german: die deutsche Entsprechung dieses Satzes',
    '- lieber weniger Vokabeln als unpassende',
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

/**
 * Reine Feature Detection – der Zugriff bleibt an einer Stelle gebündelt.
 *
 * Wichtig: Ein Web-IDL-Interface-Objekt ist im Browser eine **Funktion** (eine
 * Konstruktorfunktion mit statischen Methoden), kein einfaches Objekt. Ein
 * `typeof === 'object'` würde die echte API also aussperren. Entscheidend ist
 * allein, ob `availability` und `create` aufrufbar sind.
 */
export function getLanguageModelApi(scope: unknown = globalThis): LanguageModelApi | undefined {
  const candidate = (scope as { LanguageModel?: unknown }).LanguageModel;
  if (!candidate) return undefined;
  if (typeof candidate !== 'object' && typeof candidate !== 'function') return undefined;
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

/**
 * Die Sprachoptionen einer Fähigkeit – **dasselbe Objekt** geht an
 * `availability()` und an `create()`. Sonst prüfte man das eine und bekäme das
 * andere.
 */
function languageOptions(capability: AiCapability): LanguageModelOptions {
  const languages = CAPABILITY_LANGUAGES[capability as keyof typeof CAPABILITY_LANGUAGES];
  return {
    expectedInputs: [{ type: 'text', languages: [...languages.inputs] }],
    expectedOutputs: [{ type: 'text', languages: [...languages.outputs] }],
  };
}

function isSupported(capability: AiCapability): boolean {
  return SUPPORTED_CAPABILITIES.includes(capability);
}

/**
 * Erzeugt den Anbieter. `scope` ist nur für Tests gedacht; in der App wird
 * `globalThis` (also `self`) verwendet.
 */
export function createChromePromptAiProvider(scope: unknown = globalThis): AiProvider {
  /**
   * Je Fähigkeit eine eigene Sitzung und eine eigene Warteschlange. Ein Fehler
   * in der einen Kette lässt die andere unberührt – und `destroy()` räumt beide.
   */
  const sessions = new Map<AiCapability, LanguageModelSession>();
  const queues = new Map<AiCapability, Promise<unknown>>();

  async function getAvailability(capability: AiCapability): Promise<ProviderState> {
    if (!isSupported(capability)) return 'unavailable';
    const api = getLanguageModelApi(scope);
    if (!api) return 'unavailable';
    try {
      // Die Sprachprüfung gehört dazu: Ein einsprachiges Modell nützt hier nichts.
      return toProviderState(await api.availability(languageOptions(capability)));
    } catch {
      // Ein nicht unterstützter Browser ist ein normaler Zustand, kein Fehler.
      return 'unavailable';
    }
  }

  function requireSession(capability: AiCapability): LanguageModelSession {
    const session = sessions.get(capability);
    if (!session) throw new AiUnavailableError('Das Sprachmodell ist noch nicht geladen.');
    return session;
  }

  /** Hängt eine Anfrage an die Warteschlange **dieser** Fähigkeit. */
  async function ask(
    capability: AiCapability,
    prompt: string,
    constraint: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const active = requireSession(capability);
    if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');

    const call = () =>
      active.prompt(prompt, { responseConstraint: constraint, ...(signal ? { signal } : {}) });

    const queue = queues.get(capability) ?? Promise.resolve();
    const run = queue.then(call, call);
    queues.set(
      capability,
      run.catch(() => undefined),
    );

    const raw = await run;
    try {
      return JSON.parse(raw);
    } catch {
      throw new AiResponseError('Das Sprachmodell hat kein gültiges JSON geliefert.');
    }
  }

  async function runPrompt(
    entry: AiVocabSuggestion,
    context: AiGenerationContext,
  ): Promise<EnrichResponse> {
    const parsed = await ask(
      AI_CAPABILITY,
      buildEnrichPrompt(entry, context),
      ENRICH_RESPONSE_SCHEMA,
      context.signal,
    );
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

    capabilities: () => [...SUPPORTED_CAPABILITIES],

    getAvailability,

    async prepare(capability, onProgress, signal) {
      if (!isSupported(capability)) {
        throw new AiUnavailableError('Diese Fähigkeit gibt es in dieser Fassung noch nicht.');
      }
      const api = getLanguageModelApi(scope);
      if (!api) {
        throw new AiUnavailableError('Dieser Browser bietet kein lokales Sprachmodell.');
      }
      if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      // Dieselbe Fähigkeit wird nie zweimal vorbereitet.
      if (sessions.has(capability)) return;

      const options: LanguageModelOptions = {
        ...languageOptions(capability),
        monitor: (monitor) => {
          monitor.addEventListener('downloadprogress', (event) => {
            const total = event.total ?? 1;
            const ratio = total > 0 ? event.loaded / total : event.loaded;
            onProgress?.(Math.max(0, Math.min(1, ratio)));
          });
        },
        ...(signal ? { signal } : {}),
      };

      sessions.set(capability, await api.create(options));
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

    async suggestFromTopic(topic, context) {
      const wanted = Math.min(context.maxItems ?? 10, MAX_TOPIC_ENTRIES);
      const parsed = await ask(
        TOPIC_CAPABILITY,
        buildTopicPrompt(topic, context),
        TOPIC_RESPONSE_SCHEMA,
        context.signal,
      );

      const checked = topicResponse.safeParse(parsed);
      if (!checked.success) {
        // Keine halb reparierte Liste: entweder die ganze Antwort ist gültig
        // oder es gibt gar keine. Ein erneuter Versuch ist zumutbar.
        throw new AiResponseError(
          'Die Vorschlagsliste des Sprachmodells passte nicht zum erwarteten Format.',
        );
      }

      return checked.data.entries.slice(0, wanted).map((entry) => ({
        english: entry.english,
        germanAnswers: entry.germanAnswers,
        partOfSpeech: entry.partOfSpeech,
        difficulty: entry.difficulty,
        topicTags: entry.topicTags,
        ...(entry.exampleSentence
          ? {
              exampleSentences: [
                {
                  english: entry.exampleSentence.english,
                  ...(entry.exampleSentence.german ? { german: entry.exampleSentence.german } : {}),
                },
              ],
            }
          : {}),
      }));
    },

    suggestFromText: () =>
      Promise.reject(new AiUnavailableError('Vorschläge aus einem Text sind hier nicht vorgesehen.')),
    alternativeSentence: () =>
      Promise.reject(new AiUnavailableError('Alternative Beispielsätze sind hier nicht vorgesehen.')),

    destroy() {
      for (const session of sessions.values()) session.destroy?.();
      sessions.clear();
      queues.clear();
    },
  };
}

/** Der Anbieter, den die App verwendet – oder `undefined` ohne Prompt-API. */
export function detectPromptAiProvider(scope: unknown = globalThis): AiProvider | undefined {
  return getLanguageModelApi(scope) ? createChromePromptAiProvider(scope) : undefined;
}
