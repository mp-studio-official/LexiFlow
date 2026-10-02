import { z } from 'zod';
import { CEFR_LEVELS, GRADES } from './cefr';
import { flexionSchema } from './flexion';

/**
 * Versionierung des Austauschformats `.vocabpack.json`.
 * Wird bei jeder inkompatiblen Änderung erhöht; `migrations.ts` hebt ältere
 * Dateien auf die aktuelle Version an.
 *
 * **Fassung 3** (5B.8) bringt die grammatischen Angaben: `occurrence`,
 * `grammarNote`, `sourceSentence` und `inflection`. Alle vier sind optional,
 * eine Datei der Fassung 2 ist inhaltlich bereits eine gültige Datei der
 * Fassung 3.
 */
export const VOCABPACK_FORMAT_VERSION = 3;
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

/**
 * Die Obergrenzen der Fassung-3-Felder — einmal, an einer Stelle, geprüft.
 *
 * Verstreute Zahlen in Zod-Aufrufen sind schwer zu überblicken und noch
 * schwerer zu ändern: Wer eine davon anhebt, übersieht die anderen. Hier
 * stehen sie zusammen, und `schemafassung3.test.ts` prüft sie zusammen.
 */
export const FELDGRENZEN = {
  /** Die Fundstelle ist eine Wortform, keine Passage. */
  occurrence: 200,
  /** Ein Satz Einordnung, nicht ein Absatz Grammatikunterricht. */
  grammarNote: 400,
  /** Ein Satz aus dem Quelltext. Dieselbe Grenze wie bei Beispielsätzen. */
  sourceSentence: 400,
} as const;

/**
 * Ein optionales Textfeld, bei dem eine leere Eingabe **keine Angabe** ist.
 *
 * Eine leere Zelle aus einer Tabelle ist nicht die Aussage „hier steht
 * nichts", sondern die Abwesenheit einer Aussage. Sie abzulehnen machte aus
 * jeder nicht ausgefüllten Spalte einen Importfehler; sie zu speichern
 * machte aus ihr eine Auskunft. Sie verschwindet.
 */
function optionalText(max: number) {
  return z.preprocess(
    (wert) => (typeof wert === 'string' && wert.trim() === '' ? undefined : wert),
    z.string().trim().min(1).max(max).optional(),
  );
}

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
  /**
   * Die **Fundstelle**: die Form, in der das Wort im Quelltext stand.
   *
   * Zu `to tell sb. sth.` gehört die Fundstelle `told`, wenn der Satz
   * „The man told a story." die Quelle war. Die Lernform bleibt davon
   * unberührt — gelernt wird die Grundform, nachgeschlagen wird die Stelle.
   *
   * Das ist der Unterschied zu `lemma`: Das Lemma ist eine Eigenschaft des
   * Wortes, die Fundstelle eine Eigenschaft **dieses Fundes**.
   */
  occurrence: optionalText(FELDGRENZEN.occurrence),
  /**
   * Eine kurze grammatische Einordnung in ganzen Worten: „Past Simple von
   * to tell sb. sth."
   *
   * Für Menschen geschrieben und nicht für Maschinen geparst. Was eine
   * Maschine braucht, steht in `inflection`; was ein Mensch beim Lernen
   * liest, steht hier.
   */
  grammarNote: optionalText(FELDGRENZEN.grammarNote),
  /**
   * Der Satz, in dem das Wort gefunden wurde: „The man told a story."
   *
   * Nicht dasselbe wie `exampleSentences`: Die sind **ausgewählt**, um etwas
   * zu zeigen, dieser hier ist **vorgefunden**. Ein vorgefundener Satz darf
   * holprig sein; ein ausgewählter sollte es nicht.
   */
  sourceSentence: optionalText(FELDGRENZEN.sourceSentence),
  /**
   * Belegte Flexionsformen, nach Wortart unterschieden (siehe `flexion.ts`).
   *
   * Widerspricht die Art der Flexion der `partOfSpeech`, lehnt die Prüfung
   * unten ab — ein Eintrag, der als Substantiv geführt wird und eine
   * Verbflexion trägt, ist in einem der beiden Felder falsch, und welches es
   * ist, kann niemand raten.
   */
  inflection: flexionSchema.optional(),
  /** 1 = sehr leicht … 5 = sehr schwer. */
  difficulty: z.number().int().min(1).max(5).optional(),
  sourceType: z.enum(SOURCE_TYPES),
})
  .superRefine((eintrag, ctx) => {
    /*
      Wortart und Flexionsart dürfen sich nicht widersprechen.

      Nur wenn **beide** dastehen: Bestehende Einträge ohne `partOfSpeech`
      bleiben gültig, und eine Flexionsangabe ohne Wortart ist keine
      Nachlässigkeit, sondern der Normalfall in älteren Dateien.
    */
    if (eintrag.partOfSpeech === undefined || eintrag.inflection === undefined) return;
    if (eintrag.partOfSpeech !== eintrag.inflection.kind) {
      ctx.addIssue({
        code: 'custom',
        message:
          `Die Wortart „${eintrag.partOfSpeech}" passt nicht zur Flexionsangabe ` +
          `„${eintrag.inflection.kind}".`,
        path: ['inflection', 'kind'],
      });
    }
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
  /**
   * Die Fassung dieses Lernstands im Konto – der Schiedsrichter bei
   * gleichzeitigen Geräten.
   *
   * Sie zählt bei jeder übernommenen Änderung um eins hoch. Ein Gerät sendet
   * mit, von welcher Fassung es ausgegangen ist; stimmt sie nicht mehr, lehnt
   * der Server ab und nennt die aktuelle. Das Gerät lädt dann neu und rechnet
   * seine Bewertung mit derselben Domainfunktion noch einmal.
   *
   * **Warum nicht der Zeitstempel.** Geräteuhren sind nicht überprüfbar. Eine
   * falsch gestellte Uhr entschiede sonst darüber, wessen Lernstand gilt – und
   * zwar dauerhaft und unbemerkt.
   *
   * **Warum optional.** In einer portablen Datei gibt es genau ein Gerät und
   * genau einen Speicher. Dort gibt es nichts, womit eine Fassung in Konflikt
   * geraten könnte, und ein Pflichtfeld wäre eine Zahl ohne Bedeutung.
   */
  rev: z.number().int().min(0).optional(),
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
