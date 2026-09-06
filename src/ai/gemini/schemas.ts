import { z } from 'zod';

import { PART_OF_SPEECH } from '../../domain/schema';
import { MAX_ITEMS } from './capabilities';

/**
 * Was zurückkommen darf – zweimal aufgeschrieben, mit Absicht.
 *
 * ## Warum zwei Schemata je Fähigkeit
 *
 * Das eine (`*_JSON_SCHEMA`) geht **mit** der Anfrage hinaus: Gemini kennt
 * `responseJsonSchema` und erzwingt die Form beim Erzeugen. Das andere (Zod)
 * prüft, was tatsächlich ankam.
 *
 * Das ist keine Doppelarbeit aus Vorsicht, sondern der Unterschied zwischen
 * einer Bitte und einer Bedingung. Das erste Schema steht auf einem fremden
 * Server und wird von einem Modell befolgt, das auch scheitern darf – bei
 * abgeschnittener Ausgabe (`MAX_TOKENS`), bei einem Sicherheitsstopp, bei einem
 * API-Fehler, der trotzdem `200` liefert. Das zweite läuft hier und entscheidet.
 *
 * ## Grenzen gehören ins Schema, nicht in den Prompt
 *
 * „Höchstens fünf Übersetzungen" im Prompt ist eine Bitte. Dieselbe Zahl in
 * `maxItems` und in `.max()` ist eine Grenze. Beide kommen aus `MAX_ITEMS` –
 * einer Stelle, damit Prompt, Anfrage und Prüfung nicht auseinanderlaufen
 * können.
 *
 * ## Was hier nicht steht
 *
 * Kein Feld ist ein Freitextfeld ohne Längengrenze, und kein Schema erlaubt
 * `additionalProperties`. Ein Modell, das auf einen manipulierten Quelltext
 * hereinfällt, kann seine Antwort damit zwar inhaltlich verbiegen – aber es
 * kann kein Feld erfinden, das die Anwendung anderswo als Anweisung liest.
 */

// ---------------------------------------------------------------------------
// Der Umschlag: was Gemini selbst um die Antwort legt
// ---------------------------------------------------------------------------

/**
 * Die Hülle einer `generateContent`-Antwort.
 *
 * `finishReason` wird mitgelesen und nicht ignoriert: Eine Antwort mit
 * `MAX_TOKENS` ist gültiges JSON von Gemini, enthält aber abgeschnittenes JSON
 * der Fähigkeit. Ohne diese Prüfung sähe man nur „ungültige Antwort" und
 * suchte den Fehler an der falschen Stelle.
 */
export const geminiEnvelope = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(z.object({ text: z.string().optional() })).optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

export type GeminiEnvelope = z.infer<typeof geminiEnvelope>;

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

/** Obergrenze für einen Satz – dieselbe wie im Paketformat. */
export const MAX_SENTENCE_LENGTH = 400;
/** Obergrenze für ein Stichwort oder eine Bedeutung. */
export const MAX_TERM_LENGTH = 60;
/** Obergrenze für eine kurze Begründung. */
export const MAX_NOTE_LENGTH = 160;

const term = z.string().trim().min(1).max(MAX_TERM_LENGTH);
const sentence = z.string().trim().min(1).max(MAX_SENTENCE_LENGTH);
const note = z.string().trim().max(MAX_NOTE_LENGTH);

const TERM_JSON = { type: 'string', minLength: 1, maxLength: MAX_TERM_LENGTH } as const;
const SENTENCE_JSON = { type: 'string', minLength: 1, maxLength: MAX_SENTENCE_LENGTH } as const;
const NOTE_JSON = { type: 'string', maxLength: MAX_NOTE_LENGTH } as const;

// ---------------------------------------------------------------------------
// translate-entry
// ---------------------------------------------------------------------------

/**
 * Mehrere Bedeutungen, **getrennt** – nicht eine Zeichenkette mit Semikola.
 *
 * Die sichtbare Kurzform mit Semikolon entsteht erst in der Oberfläche. Käme
 * sie schon so vom Modell, ließe sie sich nicht mehr zuverlässig zerlegen: Ein
 * Semikolon kann innerhalb einer Bedeutung stehen, und was einmal zusammen-
 * geklebt ist, wird nie wieder sauber getrennt.
 */
export const translateResponse = z.object({
  translations: z
    .array(z.object({ german: term, note: note.optional() }))
    .min(1)
    .max(MAX_ITEMS['translate-entry']),
});

export const TRANSLATE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['translations'],
  properties: {
    translations: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_ITEMS['translate-entry'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['german'],
        properties: { german: TERM_JSON, note: NOTE_JSON },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// enrich-entry
// ---------------------------------------------------------------------------

export const enrichResponse = z.object({
  partOfSpeech: z.enum(PART_OF_SPEECH),
  difficulty: z.number().int().min(1).max(5),
  topicTags: z.array(z.string().trim().min(1).max(24)).max(3),
});

export const ENRICH_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['partOfSpeech', 'difficulty', 'topicTags'],
  properties: {
    partOfSpeech: { type: 'string', enum: [...PART_OF_SPEECH] },
    difficulty: { type: 'integer', minimum: 1, maximum: 5 },
    topicTags: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 24 } },
  },
} as const;

// ---------------------------------------------------------------------------
// suggest-example-sentences und simplify-example-sentence
// ---------------------------------------------------------------------------

export const sentencesResponse = z.object({
  sentences: z
    .array(z.object({ english: sentence, german: sentence.optional() }))
    .min(1)
    .max(MAX_ITEMS['suggest-example-sentences']),
});

export const SENTENCES_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sentences'],
  properties: {
    sentences: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_ITEMS['suggest-example-sentences'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['english'],
        properties: { english: SENTENCE_JSON, german: SENTENCE_JSON },
      },
    },
  },
} as const;

export const singleSentenceResponse = z.object({
  english: sentence,
  german: sentence.optional(),
});

export const SINGLE_SENTENCE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['english'],
  properties: { english: SENTENCE_JSON, german: SENTENCE_JSON },
} as const;

// ---------------------------------------------------------------------------
// recommend-from-text
// ---------------------------------------------------------------------------

/**
 * Nur Schlüssel – dieselbe Entscheidung wie beim lokalen Modell.
 *
 * Das Modell bekommt Kandidaten mit neutralen Schlüsseln (`c1`, `c2` …) und
 * darf nur solche zurückgeben. Ein Freitextfeld gäbe ihm die Möglichkeit,
 * Wörter zu „empfehlen", die im Text nie standen – und genau das wäre der
 * Hebel für einen Quelltext, der dem Modell etwas einflüstert.
 */
export const recommendResponse = z.object({
  recommendedKeys: z.array(z.string().trim().min(1).max(8)).max(MAX_ITEMS['recommend-from-text']),
});

export const RECOMMEND_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recommendedKeys'],
  properties: {
    recommendedKeys: {
      type: 'array',
      maxItems: MAX_ITEMS['recommend-from-text'],
      items: { type: 'string', minLength: 1, maxLength: 8 },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// suggest-from-topic
// ---------------------------------------------------------------------------

export const topicEntry = z.object({
  english: term,
  germanAnswers: z.array(term).min(1).max(3),
  partOfSpeech: z.enum(PART_OF_SPEECH),
  difficulty: z.number().int().min(1).max(5),
  topicTags: z.array(z.string().trim().min(1).max(24)).max(3),
  exampleSentence: z
    .object({ english: sentence, german: sentence.optional() })
    .optional(),
});

export const topicResponse = z.object({
  entries: z.array(topicEntry).max(MAX_ITEMS['suggest-from-topic']),
});

export const TOPIC_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['entries'],
  properties: {
    entries: {
      type: 'array',
      maxItems: MAX_ITEMS['suggest-from-topic'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['english', 'germanAnswers', 'partOfSpeech', 'difficulty', 'topicTags'],
        properties: {
          english: TERM_JSON,
          germanAnswers: { type: 'array', minItems: 1, maxItems: 3, items: TERM_JSON },
          partOfSpeech: { type: 'string', enum: [...PART_OF_SPEECH] },
          difficulty: { type: 'integer', minimum: 1, maximum: 5 },
          topicTags: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 24 } },
          exampleSentence: {
            type: 'object',
            additionalProperties: false,
            required: ['english'],
            properties: { english: SENTENCE_JSON, german: SENTENCE_JSON },
          },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// review-learning-form
// ---------------------------------------------------------------------------

/**
 * Der Befund zu einer Lernform – bewusst **ohne** einen Wert namens „sicher".
 *
 * Es gibt `ok` und `pruefen`, und beides ist ein Vorschlag. Eine grammatische
 * Lernform gilt in LexiFlow nicht deshalb als richtig, weil ein Modell das
 * gesagt hat; die Herkunft (`provenance.ts`) hält jeden Befund als
 * „ungeprüft" fest, bis eine Lehrkraft ihn übernimmt.
 */
export const reviewResponse = z.object({
  verdict: z.enum(['ok', 'pruefen']),
  reason: note,
  suggestion: term.optional(),
});

export const REVIEW_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'reason'],
  properties: {
    verdict: { type: 'string', enum: ['ok', 'pruefen'] },
    reason: NOTE_JSON,
    suggestion: TERM_JSON,
  },
} as const;

export type TranslateResponse = z.infer<typeof translateResponse>;
export type EnrichResponse = z.infer<typeof enrichResponse>;
export type SentencesResponse = z.infer<typeof sentencesResponse>;
export type SingleSentenceResponse = z.infer<typeof singleSentenceResponse>;
export type RecommendResponse = z.infer<typeof recommendResponse>;
export type TopicResponse = z.infer<typeof topicResponse>;
export type ReviewResponse = z.infer<typeof reviewResponse>;
