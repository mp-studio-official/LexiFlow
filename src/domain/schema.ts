import { z } from 'zod';
import { CEFR_LEVELS, GRADES } from './cefr';

/**
 * Versionierung des Austauschformats `.vocabpack.json`.
 * Wird bei jeder inkompatiblen Änderung erhöht; `migrations.ts` hebt ältere
 * Dateien auf die aktuelle Version an.
 */
export const VOCABPACK_FORMAT_VERSION = 2;
export const VOCABPACK_KIND = 'lexiflow.vocabpack' as const;

export const PART_OF_SPEECH = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'phrase',
  'preposition',
  'other',
] as const;
export type PartOfSpeech = (typeof PART_OF_SPEECH)[number];

export const PART_OF_SPEECH_LABELS: Readonly<Record<PartOfSpeech, string>> = {
  noun: 'Substantiv',
  verb: 'Verb',
  adjective: 'Adjektiv',
  adverb: 'Adverb',
  phrase: 'Wendung',
  preposition: 'Präposition',
  other: 'sonstige',
};

export const SOURCE_TYPES = ['manual', 'import', 'text-ai', 'topic-ai'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * Grammatische Zahl – nur bei Substantiven und nur, wenn sie etwas aussagt.
 *
 * `restraints (pl.)` ist eine andere Vokabel als `restraint`; ohne diese
 * Angabe stünde die Pluralform als vermeintlicher Singular im Paket.
 */
export const GRAMMATICAL_NUMBERS = ['singular', 'plural'] as const;
export type GrammaticalNumber = (typeof GRAMMATICAL_NUMBERS)[number];

export const GRAMMATICAL_NUMBER_LABELS: Readonly<Record<GrammaticalNumber, string>> = {
  singular: 'Singular',
  plural: 'Plural',
};

export const LEARNING_DIRECTIONS = ['en-de', 'de-en', 'both'] as const;
export type LearningDirection = (typeof LEARNING_DIRECTIONS)[number];

export const DIRECTION_LABELS: Readonly<Record<LearningDirection, string>> = {
  'en-de': 'Englisch → Deutsch',
  'de-en': 'Deutsch → Englisch',
  both: 'beide Richtungen',
};

/**
 * Konkrete Abfragerichtung einer einzelnen Aufgabe.
 * `en-de` ist rezeptiv (verstehen), `de-en` produktiv (selbst formulieren) –
 * Lückensätze zählen als produktiv.
 */
export const TASK_DIRECTIONS = ['en-de', 'de-en'] as const;
export type TaskDirection = (typeof TASK_DIRECTIONS)[number];

export const TASK_DIRECTION_LABELS: Readonly<Record<TaskDirection, string>> = {
  'en-de': 'Englisch → Deutsch (rezeptiv)',
  'de-en': 'Deutsch → Englisch (produktiv)',
};

/** Welche Richtungen ein Paket tatsächlich führt. */
export function activeDirections(direction: LearningDirection): TaskDirection[] {
  return direction === 'both' ? ['en-de', 'de-en'] : [direction];
}

const trimmed = z.string().trim();
const nonEmpty = trimmed.min(1);

/**
 * Beispielsätze werden als Objekt gespeichert. Ein einzelner String wird
 * akzeptiert und angehoben – so bleiben handgeschriebene JSON-Dateien gültig.
 */
export const exampleSentenceSchema = z.preprocess(
  (value) => (typeof value === 'string' ? { english: value } : value),
  z.object({
    english: nonEmpty.max(400),
    german: trimmed.max(400).optional(),
  }),
);
export type ExampleSentence = z.infer<typeof exampleSentenceSchema>;

export const vocabEntrySchema = z.object({
  id: nonEmpty,
  /**
   * Die **Lernform** – das, was auf der Karte steht und abgefragt wird.
   *
   * Seit Sprint 4B.2 darf das eine grammatisch vollständige Form sein:
   * `to accuse sb. of sth.`, `restraints (pl.)`, `to coin a phrase / term`.
   * Bestehende Pakete tragen hier weiterhin ein schlichtes `crowded`, und das
   * bleibt gültig – die Lernform **ist** dieses Feld, es gibt kein zweites
   * dekoratives daneben.
   */
  english: nonEmpty.max(200),
  /**
   * Das kanonische Lemma ohne `to`, ohne Ergänzungen, ohne Klammerzusätze:
   * zu `to accuse sb. of sth.` gehört `accuse`.
   *
   * Es dient dem Nachschlagen, der Dublettenprüfung und der Suche – nie der
   * Abfrage. Fehlt es, wird es bei Bedarf aus der Lernform abgeleitet; ein
   * gespeichertes Lemma ist eine Auskunft, ein abgeleitetes eine Vermutung.
   */
  lemma: trimmed.max(200).optional(),
  /**
   * Das Ergänzungs- oder Valenzmuster, **nur wenn belegt**: `sb. of sth.`,
   * `sb. with sth.`, `sb. from doing sth.`
   *
   * Belegt heißt: aus der Quelle, aus dem Wörterbuch oder aus eindeutigem
   * Kontext. Ein erfundenes Muster wäre schlimmer als gar keines – es sieht
   * geprüft aus und bringt jemandem eine falsche Rektion bei.
   */
  complementPattern: trimmed.max(120).optional(),
  /** Nur bei Substantiven und nur, wenn die Zahl zur Vokabel gehört. */
  grammaticalNumber: z.enum(GRAMMATICAL_NUMBERS).optional(),
  /**
   * Klammert verwandte Lernformen zusammen: `attainability (n.)` und
   * `attainable (adj.)` teilen eine Gruppe.
   *
   * Die Gruppe ist eine **Anzeigebeziehung**, kein gemeinsamer Lerngegenstand.
   * Jede Form bleibt ein eigener Eintrag mit eigener Wortart, eigener
   * Bedeutung und eigenem Lernstand; im Test muss erkennbar sein, welche
   * konkrete Form gefragt ist. Einträge ohne Gruppe funktionieren unverändert.
   */
  lexicalGroupId: trimmed.max(64).optional(),
  /** Mindestens eine, gerne mehrere gleichwertige deutsche Übersetzungen. */
  germanAnswers: z.array(nonEmpty.max(200)).min(1).max(20),
  /** Zusätzlich akzeptierte englische Schreibungen/Varianten (Richtung DE → EN). */
  acceptedEnglishAnswers: z.array(nonEmpty.max(200)).max(20).default([]),
  partOfSpeech: z.enum(PART_OF_SPEECH).optional(),
  exampleSentences: z.array(exampleSentenceSchema).max(10).default([]),
  topicTags: z.array(nonEmpty.max(60)).max(20).default([]),
  notes: trimmed.max(1000).optional(),
  /** 1 = sehr leicht … 5 = sehr schwer. */
  difficulty: z.number().int().min(1).max(5).optional(),
  sourceType: z.enum(SOURCE_TYPES),
});
export type VocabEntry = z.infer<typeof vocabEntrySchema>;

export const packMetaSchema = z.object({
  id: nonEmpty,
  title: nonEmpty.max(120),
  topic: trimmed.max(120).default(''),
  grade: z.enum(GRADES),
  cefrLevel: z.enum(CEFR_LEVELS),
  /** true, wenn das GeR-Niveau vom Vorschlag abweichend gesetzt wurde. */
  cefrLevelOverridden: z.boolean().default(false),
  direction: z.enum(LEARNING_DIRECTIONS),
  description: trimmed.max(2000).optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PackMeta = z.infer<typeof packMetaSchema>;

/** Datei-Repräsentation eines Pakets: das, was exportiert und importiert wird. */
export const vocabPackFileSchema = z.object({
  kind: z.literal(VOCABPACK_KIND),
  formatVersion: z.number().int().min(1),
  app: z
    .object({ name: trimmed.default('LexiFlow'), version: trimmed.default('0.1.0') })
    .optional(),
  meta: packMetaSchema,
  entries: z.array(vocabEntrySchema).min(1).max(5000),
});
export type VocabPackFile = z.infer<typeof vocabPackFileSchema>;

/** Ein Paket im Speicher inklusive Einträgen. */
export interface VocabPack {
  meta: PackMeta;
  entries: VocabEntry[];
}

// ---------------------------------------------------------------------------
// Lernstand (bleibt ausschließlich lokal, wird nie exportiert oder übertragen)
// ---------------------------------------------------------------------------

export const LEITNER_BOX_MIN = 1;
export const LEITNER_BOX_MAX = 5;

export const entryProgressSchema = z.object({
  /** `${packId}::${entryId}::${direction}` */
  key: nonEmpty,
  packId: nonEmpty,
  entryId: nonEmpty,
  /** Lernstände werden je Abfragerichtung getrennt geführt. */
  direction: z.enum(TASK_DIRECTIONS),
  box: z.number().int().min(LEITNER_BOX_MIN).max(LEITNER_BOX_MAX),
  correctCount: z.number().int().min(0),
  wrongCount: z.number().int().min(0),
  streak: z.number().int().min(0),
  lastAnsweredAt: z.iso.datetime().optional(),
  /** Zeitpunkt der nächsten Fälligkeit (ISO). */
  dueAt: z.iso.datetime(),
});
export type EntryProgress = z.infer<typeof entryProgressSchema>;

export const packProgressSchema = z.object({
  packId: nonEmpty,
  sessionCount: z.number().int().min(0),
  answeredCount: z.number().int().min(0),
  correctCount: z.number().int().min(0),
  lastPracticedAt: z.iso.datetime().optional(),
});
export type PackProgress = z.infer<typeof packProgressSchema>;
