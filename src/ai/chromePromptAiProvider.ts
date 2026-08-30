import { z } from 'zod';
import { PART_OF_SPEECH } from '../domain/schema';
import type { ProviderState } from '../providers/state';
import {
  AiUnavailableError,
  MAX_CONTEXT_CANDIDATES,
  MAX_CONTEXT_HEADWORDS,
  MAX_RECOMMENDATIONS,
  type AiCapability,
  type AiGenerationContext,
  type AiProvider,
  type AiTextCandidate,
  type AiVocabSuggestion,
  type AlternativeSentenceRequest,
} from './AiProvider';

/**
 * Vorschläge über das eingebaute Sprachmodell des Browsers (Prompt-API).
 *
 * Das Modell läuft **auf dem Gerät**. Diese Datei ruft niemals `fetch` auf; den
 * Modelldownload erledigt der Browser, und er beginnt erst nach einem
 * ausdrücklichen Klick. Erkannt wird die API ausschließlich über Feature
 * Detection – kein User-Agent-Sniffing.
 *
 * Der Anbieter kann vier Dinge: einen vorhandenen Eintrag ergänzen
 * (`enrich-entry`), zu einem Thema Vokabelvorschläge erzeugen
 * (`suggest-from-topic`), einen Beispielsatz vorschlagen
 * (`alternative-sentence`) und aus **bereits lokal extrahierten** Kandidaten
 * eine Empfehlung geben (`suggest-from-text`).
 *
 * **Eine Sitzung je Fähigkeit.** Die Aufgaben brauchen unterschiedliche
 * Sprachkonfigurationen – `enrich-entry` antwortet englisch, Themenwerkstatt
 * und Satzassistent zweisprachig, die Textempfehlung nur mit Schlüsseln. Eine
 * gemeinsame Sitzung wäre für mindestens eine davon falsch konfiguriert. Jede
 * Fähigkeit hat deshalb ihre eigene Sitzung **und** ihre eigene Warteschlange;
 * ein Fehler der einen lässt die anderen unberührt.
 *
 * Die Ausgabe wird **erzwungen**, nicht erbeten: `responseConstraint` gibt dem
 * Modell ein JSON-Schema vor, und die Antwort läuft anschließend noch durch
 * Zod. Was dort durchfällt, wird nicht teilweise übernommen, sondern als Fehler
 * an genau dieser Zeile gemeldet.
 */

export const AI_CAPABILITY: AiCapability = 'enrich-entry';
export const TOPIC_CAPABILITY: AiCapability = 'suggest-from-topic';
export const SENTENCE_CAPABILITY: AiCapability = 'alternative-sentence';
export const TEXT_CAPABILITY: AiCapability = 'suggest-from-text';

/** Was dieser Anbieter kann – in dieser Reihenfolge auch nach außen gemeldet. */
export const SUPPORTED_CAPABILITIES: readonly AiCapability[] = [
  AI_CAPABILITY,
  TOPIC_CAPABILITY,
  SENTENCE_CAPABILITY,
  TEXT_CAPABILITY,
];

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
const CAPABILITY_LANGUAGES: Readonly<Record<AiCapability, { inputs: string[]; outputs: string[] }>> =
  {
    'enrich-entry': { inputs: ['en', 'de'], outputs: ['en'] },
    'suggest-from-topic': { inputs: ['de', 'en'], outputs: ['de', 'en'] },
    // Der Satzassistent liefert einen englischen Satz **und** dessen deutsche
    // Entsprechung – ein einsprachiges Modell wäre dafür unbrauchbar.
    'alternative-sentence': { inputs: ['en', 'de'], outputs: ['en', 'de'] },
    // Die Textempfehlung antwortet nur mit Schlüsseln, liest aber englische
    // Kandidaten und deutsche Anweisungen.
    'suggest-from-text': { inputs: ['en', 'de'], outputs: ['en'] },
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

/** Obergrenze für einen Satzvorschlag – dieselbe wie im Paketformat. */
export const MAX_SENTENCE_LENGTH = 400;

/** JSON-Schema für einen einzelnen Satzvorschlag. */
export const SENTENCE_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['english'],
  properties: {
    english: { type: 'string', minLength: 1, maxLength: MAX_SENTENCE_LENGTH },
    german: { type: 'string', maxLength: MAX_SENTENCE_LENGTH },
  },
} as const;

export const sentenceResponse = z.object({
  english: z.string().trim().min(1).max(MAX_SENTENCE_LENGTH),
  german: z.string().trim().max(MAX_SENTENCE_LENGTH).optional(),
});

/**
 * JSON-Schema für die Textempfehlung.
 *
 * Bewusst **nur Schlüssel**: Das Modell kann damit keine Vokabel erfinden, die
 * im Text nicht vorkam. Ein Freitextfeld gäbe es diese Möglichkeit zurück.
 */
export const TEXT_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recommendedKeys'],
  properties: {
    recommendedKeys: {
      type: 'array',
      maxItems: MAX_RECOMMENDATIONS,
      items: { type: 'string', minLength: 1, maxLength: 8 },
    },
  },
} as const;

export const textResponse = z.object({
  recommendedKeys: z.array(z.string().trim().min(1).max(8)).max(MAX_RECOMMENDATIONS),
});

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
 * Lerngruppe, gewünschte Schwierigkeit und Anzahl sowie ein **begrenzter
 * Auszug** bereits vorhandener englischer Stichwörter, damit das Modell die
 * offensichtlichsten Dubletten vermeidet. Keine Übersetzungen, keine
 * Lernstände, keine Paket-IDs, keine personenbezogenen Daten.
 *
 * Die Grenze wird hier noch einmal durchgesetzt – unabhängig davon, was der
 * Aufrufer übergibt. Sie ist eine Eigenschaft des Prompts, nicht der Ansicht.
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

  const existing = (context.existingEnglish ?? []).slice(0, MAX_CONTEXT_HEADWORDS);
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

const SENTENCE_TASK: Readonly<Record<AlternativeSentenceRequest['mode'], string>> = {
  create: 'Schreibe einen neuen Beispielsatz.',
  simpler:
    'Schreibe einen sprachlich einfacheren Beispielsatz als die vorhandenen: kürzer, mit häufigeren Wörtern und einfacherem Satzbau.',
  'different-context':
    'Schreibe einen Beispielsatz in einem erkennbar anderen Kontext als die vorhandenen – andere Situation, anderes Sachfeld.',
};

/**
 * Anweisung für den Satzassistenten.
 *
 * Übergeben wird ausschließlich die eine Vokabel mit ihren Bedeutungen, ihre
 * vorhandenen Sätze und der Lernkontext. Keine anderen Vokabeln, keine
 * Paket-IDs, keine Lernstände.
 */
export function buildSentencePrompt(
  request: AlternativeSentenceRequest,
  context: AiGenerationContext,
): string {
  const lines = [
    'Du hilfst einer Englischlehrkraft an einem deutschen Gymnasium bei einem Beispielsatz.',
    'Antworte ausschließlich im vorgegebenen JSON-Format.',
    '',
    `Englisches Stichwort: ${request.english}`,
  ];
  if (request.germanAnswers.length > 0) {
    lines.push(`Deutsche Bedeutung: ${request.germanAnswers.join(', ')}`);
  }
  if (request.partOfSpeech) lines.push(`Wortart: ${request.partOfSpeech}`);
  if (request.existingSentences.length > 0) {
    lines.push('Vorhandene Beispielsätze:');
    for (const sentence of request.existingSentences) lines.push(`- ${sentence}`);
  }
  lines.push(`Jahrgangsstufe: ${context.grade}`);
  lines.push(`Sprachniveau (GeR): ${context.cefrLevel}`);
  if (context.topic) lines.push(`Thema des Pakets: ${context.topic}`);

  lines.push(
    '',
    `Aufgabe: ${SENTENCE_TASK[request.mode]}`,
    '',
    'Regeln:',
    '- ein kurzer, natürlicher, schulgeeigneter Satz',
    '- er passt zur angegebenen deutschen Bedeutung',
    '- er verwendet genau dieses Stichwort beziehungsweise diese Wendung wörtlich',
    '- er ist nicht identisch mit einem der vorhandenen Sätze',
    '- keine Namen realer oder erfundener Personen und keine persönlichen Angaben',
    '- keine beleidigenden, gewalthaltigen oder sexualisierten Inhalte',
    '- english: der Satz selbst',
    '- german: die deutsche Entsprechung dieses Satzes',
    '- keine Erklärung, keine Anführungszeichen, kein Markdown',
  );
  return lines.join('\n');
}

/**
 * Anweisung für die Textempfehlung.
 *
 * Der eingefügte Rohtext geht hier **nicht** hinein – nur die schon lokal
 * gefundenen Kandidaten mit neutralem Schlüssel, Häufigkeit und genau einem
 * Originalsatz. Die Grenze wird hier noch einmal durchgesetzt, unabhängig vom
 * Aufrufer.
 */
export function buildTextPrompt(
  candidates: readonly AiTextCandidate[],
  context: AiGenerationContext,
): string {
  const limited = candidates.slice(0, MAX_CONTEXT_CANDIDATES);
  const wanted = Math.min(context.maxItems ?? 10, MAX_RECOMMENDATIONS);

  const lines = [
    'Du hilfst einer Englischlehrkraft an einem deutschen Gymnasium bei der Auswahl von Vokabeln.',
    'Antworte ausschließlich im vorgegebenen JSON-Format.',
    '',
    `Jahrgangsstufe: ${context.grade}`,
    `Sprachniveau (GeR): ${context.cefrLevel}`,
  ];
  if (context.topic) lines.push(`Thema des Pakets: ${context.topic}`);
  lines.push(
    `Anzahl: höchstens ${wanted} Empfehlungen.`,
    '',
    'Kandidaten (Schlüssel | Wort | Häufigkeit | Originalsatz):',
  );
  for (const candidate of limited) {
    lines.push(
      `${candidate.key} | ${candidate.english} | ${candidate.occurrences}× | ${candidate.sourceSentence}`,
    );
  }

  lines.push(
    '',
    'Aufgabe: Wähle die Kandidaten aus, die für genau diese Lerngruppe besonders lernenswert sind.',
    '',
    'Regeln:',
    '- gib ausschließlich Schlüssel aus der Liste zurück',
    '- erfinde keine neuen Wörter und keine neuen Schlüssel',
    '- jeder Schlüssel höchstens einmal',
    '- stärkste Empfehlung zuerst',
    '- lieber weniger Empfehlungen als unpassende',
    '- keine Erklärung, kein Freitext, kein Markdown',
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

    async alternativeSentence(request, context) {
      const parsed = await ask(
        SENTENCE_CAPABILITY,
        buildSentencePrompt(request, context),
        SENTENCE_RESPONSE_SCHEMA,
        context.signal,
      );

      const checked = sentenceResponse.safeParse(parsed);
      if (!checked.success) {
        throw new AiResponseError(
          'Der Satzvorschlag des Sprachmodells passte nicht zum erwarteten Format.',
        );
      }

      return {
        english: checked.data.english,
        ...(checked.data.german ? { german: checked.data.german } : {}),
      };
    },

    async suggestFromText(candidates, context) {
      const parsed = await ask(
        TEXT_CAPABILITY,
        buildTextPrompt(candidates, context),
        TEXT_RESPONSE_SCHEMA,
        context.signal,
      );

      const checked = textResponse.safeParse(parsed);
      if (!checked.success) {
        throw new AiResponseError(
          'Die Empfehlungsliste des Sprachmodells passte nicht zum erwarteten Format.',
        );
      }

      // Nur bekannte Schlüssel, keine Dubletten – der Anbieter erfindet nichts.
      // Die Reihenfolge des Modells bleibt erhalten: stärkste Empfehlung zuerst.
      const known = new Set(candidates.map((candidate) => candidate.key));
      const seen = new Set<string>();
      const recommendations: { key: string }[] = [];
      for (const key of checked.data.recommendedKeys) {
        if (!known.has(key) || seen.has(key)) continue;
        seen.add(key);
        recommendations.push({ key });
      }
      return recommendations;
    },

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
