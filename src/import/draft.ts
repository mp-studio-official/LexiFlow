import { newId } from '../domain/ids';
import { formatAnswers, normalizeAnswer, splitAnswers, splitList } from '../domain/normalize';
import { sentenceContainsHeadword } from '../domain/wordMatch';
import {
  PART_OF_SPEECH,
  type GrammaticalNumber,
  type PartOfSpeech,
  type SourceType,
  type VocabEntry,
} from '../domain/schema';
import type { ColumnMapping, ColumnRole } from './columnDetect';
import type { DraftSuggestion } from './suggestions';

export interface DraftIssue {
  level: 'error' | 'warning';
  field?: 'english' | 'german' | 'example' | 'accepted';
  message: string;
  /**
   * Ein **konkreter offener fachlicher Befund** – einer, den nur die Lehrkraft
   * entscheiden kann (Sprint 4B.5).
   *
   * Der Unterschied zu einer gewöhnlichen Warnung ist die Frage, ob es etwas
   * zu **entscheiden** gibt. „Gehört das `on` in `depend on` zur Vokabel?“ ist
   * eine Frage; „Kein Beispielsatz enthält das Stichwort“ ist eine Auskunft.
   * Nur die Frage hält das Speichern auf, und nur sie bekommt die Aktion „Als
   * geprüft bestätigen“.
   *
   * Warum das überhaupt getrennt wird: Bis 4B.4 stand über jeder Zeile mit
   * irgendeiner Warnung „Bitte prüfen“. Bei zwanzig Empfehlungen waren das
   * zwölf Zeilen, von denen elf nichts zu entscheiden hatten – und die zwölfte
   * ging darin unter.
   */
  review?: true;
}

/**
 * Herkunft einer Zeile aus der Textwerkstatt.
 *
 * Bleibt **nur** im Entwurfsmodell: Das Austauschformat `.vocabpack.json`
 * ändert sich dadurch nicht, und der Quelltext wandert nie ins Paket.
 */
export interface DraftProvenance {
  origin: 'text-extraction';
  /** Wie oft die Vokabel im Quelltext vorkam – über alle Formen zusammen. */
  occurrences: number;
  /** Der Originalsatz, aus dem der Beispielsatz stammt. */
  sourceSentence: string;
  /** Stand der maschinellen Übersetzung für diese Zeile. */
  translation: 'none' | 'accepted' | 'edited';
  /**
   * „Im Text: island, islands · insgesamt 18-mal“.
   *
   * Reine Information für die Lehrkraft. Sie wandert bewusst **nicht** in
   * `acceptedEnglish`: `islands` ist keine richtige Antwort auf „die Insel“.
   */
  formSummary?: string;
  /** „Plural: islands“ – dieselbe Zurückhaltung gilt. */
  inflections?: readonly string[];
  /** Hinweis zu einer Abkürzung, z. B. „Abkürzung – Langform prüfen“. */
  abbreviationHint?: string;
}

/** Ein bearbeitbarer Beispielsatz mit optionaler deutscher Entsprechung. */
export interface DraftSentence {
  id: string;
  english: string;
  german: string;
}

/**
 * Bearbeitbare Zwischenstufe zwischen Rohdaten und validiertem Eintrag.
 *
 * Das Modell bildet **alle** Felder von `VocabEntry` ab. Nur so kann ein Paket
 * geöffnet und wieder gespeichert werden, ohne dass Felder verloren gehen.
 */
export interface DraftRow {
  id: string;
  /** Die Lernform, so wie sie auf der Karte stehen soll. */
  english: string;
  /**
   * Freitext; mehrere Antworten durch **Semikolon** getrennt.
   *
   * Ein Komma gehört seit Sprint 4B.2 zur Antwort: „einen Begriff, eine
   * Redewendung prägen“ ist eine Bedeutung, keine zwei.
   */
  german: string;
  /** Zusätzlich akzeptierte englische Antworten, ebenfalls als Freitext. */
  acceptedEnglish: string;
  partOfSpeech: PartOfSpeech | '';
  /**
   * Die strukturierten Anteile der Lernform (Sprint 4B.2). Leer heißt
   * „nicht bekannt“ – und nicht „gibt es nicht“: Ein leeres Valenzmuster wird
   * nie erfunden, sondern bleibt leer.
   */
  lemma: string;
  complementPattern: string;
  grammaticalNumber: GrammaticalNumber | '';
  /** Verbindet verwandte Lernformen; leer heißt: steht für sich. */
  lexicalGroupId: string;
  /**
   * Ist an der **Lernform** noch etwas offen? (Sprint 4B.3, Block A)
   *
   * Gesetzt, wenn der Empfehlungsschritt eine Frage nicht abschließend
   * beantworten konnte – etwa, ob das `on` in „depend on“ zur Vokabel gehört.
   * Der Entwurf trägt sie weiter, statt sie beim Übergang zu verlieren: Wer
   * die Empfehlungen überflogen hat, sieht die Frage sonst nie wieder.
   *
   * Es ist eine **Warnung**, kein Fehler. Die Zeile lässt sich speichern; sie
   * sagt nur, dass jemand hinsehen sollte.
   */
  formNeedsReview?: boolean;
  /** Warum – derselbe Satz, den schon der Empfehlungsschritt gezeigt hat. */
  formReviewReason?: string;
  /**
   * Der Stand der Dinge, für den die Lehrkraft „Als geprüft bestätigen“
   * gedrückt hat (Sprint 4B.5).
   *
   * Gespeichert wird nicht „bestätigt: ja“, sondern **wofür**: ein
   * Fingerabdruck aus englischer Lernform, Übersetzung und Wortart
   * (`reviewFingerprint`). Ändert sich einer dieser Werte, stimmt der
   * Fingerabdruck nicht mehr, und die Bestätigung verfällt.
   *
   * Der Grund ist der Sinn einer Bestätigung: Sie ist eine fachliche
   * Entscheidung über einen bestimmten Sachverhalt. Wer nach der Bestätigung
   * die Übersetzung austauscht, hat einen anderen Sachverhalt vor sich – und
   * eine Bestätigung, die das überdauerte, wäre eine Unterschrift unter etwas,
   * das man nie gelesen hat.
   *
   * Rein für die Erstellung: `draftsToEntries` liest das Feld nicht, und im
   * `.vocabpack.json` steht es nie.
   */
  reviewConfirmedFor?: string;
  sentences: DraftSentence[];
  tags: string;
  notes: string;
  /** '' = nicht gesetzt, sonst 1–5. */
  difficulty: '' | 1 | 2 | 3 | 4 | 5;
  /** Herkunft dieser Zeile; überschreibt die Herkunft des Imports. */
  sourceType?: SourceType;
  /** Zusatzinformation für die Review-Oberfläche; nicht Teil des Pakets. */
  provenance?: DraftProvenance;
  /**
   * Ungeprüfte Vorschläge für einzelne Felder – ausschließlich im Entwurf.
   * `draftsToEntries` liest sie nicht; im `.vocabpack.json` stehen sie nie.
   */
  suggestions?: DraftSuggestion[];
  include: boolean;
  issues: DraftIssue[];
  /** ID der ersten Zeile mit demselben englischen Stichwort. */
  duplicateOf?: string;
}

export interface BuildDraftOptions {
  /** Mehrfachbedeutungen in der Deutsch-Spalte trennen. */
  splitMultipleMeanings: boolean;
}

const POS_ALIASES: Record<string, PartOfSpeech> = {
  n: 'noun',
  noun: 'noun',
  substantiv: 'noun',
  nomen: 'noun',
  v: 'verb',
  verb: 'verb',
  adj: 'adjective',
  adjective: 'adjective',
  adjektiv: 'adjective',
  adv: 'adverb',
  adverb: 'adverb',
  phrase: 'phrase',
  wendung: 'phrase',
  redewendung: 'phrase',
  prep: 'preposition',
  preposition: 'preposition',
  präposition: 'preposition',
  praeposition: 'preposition',
};

export function parsePartOfSpeech(value: string): PartOfSpeech | '' {
  const key = value.trim().toLocaleLowerCase('de-DE').replace(/\.$/, '');
  if (!key) return '';
  const alias = POS_ALIASES[key];
  if (alias) return alias;
  return (PART_OF_SPEECH as readonly string[]).includes(key) ? (key as PartOfSpeech) : '';
}

export function parseDifficulty(value: string | number | undefined): DraftRow['difficulty'] {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) return '';
  return numeric as 1 | 2 | 3 | 4 | 5;
}

function cell(row: readonly string[], roles: readonly ColumnRole[], role: ColumnRole): string {
  const index = roles.indexOf(role);
  return index >= 0 ? (row[index] ?? '').trim() : '';
}

export function newSentence(english = '', german = ''): DraftSentence {
  return { id: newId(), english, german };
}

// ---------------------------------------------------------------------------
// Beispielsätze bearbeiten
// ---------------------------------------------------------------------------

export function addSentence(draft: DraftRow): DraftRow {
  return { ...draft, sentences: [...draft.sentences, newSentence()] };
}

export function updateSentence(
  draft: DraftRow,
  sentenceId: string,
  changes: Partial<Omit<DraftSentence, 'id'>>,
): DraftRow {
  return {
    ...draft,
    sentences: draft.sentences.map((sentence) =>
      sentence.id === sentenceId ? { ...sentence, ...changes } : sentence,
    ),
  };
}

export function removeSentence(draft: DraftRow, sentenceId: string): DraftRow {
  return { ...draft, sentences: draft.sentences.filter((sentence) => sentence.id !== sentenceId) };
}

/** Verschiebt einen Beispielsatz um `offset` Positionen (−1 = nach oben). */
export function moveSentence(draft: DraftRow, sentenceId: string, offset: number): DraftRow {
  const index = draft.sentences.findIndex((sentence) => sentence.id === sentenceId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= draft.sentences.length) return draft;

  const sentences = [...draft.sentences];
  const moved = sentences[index] as DraftSentence;
  const displaced = sentences[target] as DraftSentence;
  sentences[target] = moved;
  sentences[index] = displaced;
  return { ...draft, sentences };
}

// ---------------------------------------------------------------------------
// Aufbau
// ---------------------------------------------------------------------------

/** Wandelt Rohzeilen anhand der Spaltenzuordnung in bearbeitbare Entwürfe. */
export function buildDrafts(
  rows: readonly string[][],
  mapping: ColumnMapping,
  options: BuildDraftOptions,
): DraftRow[] {
  const body = mapping.hasHeader ? rows.slice(1) : rows;
  const drafts = body
    .filter((row) => row.some((value) => value.trim().length > 0))
    .map<DraftRow>((row) => {
      const german = cell(row, mapping.roles, 'german');
      const example = cell(row, mapping.roles, 'example');
      const exampleGerman = cell(row, mapping.roles, 'exampleGerman');
      return {
        ...emptyDraft(),
        english: cell(row, mapping.roles, 'english'),
        german: options.splitMultipleMeanings ? formatAnswers(splitAnswers(german)) : german,
        partOfSpeech: parsePartOfSpeech(cell(row, mapping.roles, 'partOfSpeech')),
        sentences: example || exampleGerman ? [newSentence(example, exampleGerman)] : [],
        tags: cell(row, mapping.roles, 'tags'),
        notes: cell(row, mapping.roles, 'notes'),
        sourceType: 'import',
      };
    });

  return validateDrafts(drafts);
}

export function emptyDraft(): DraftRow {
  return {
    id: newId(),
    english: '',
    german: '',
    acceptedEnglish: '',
    partOfSpeech: '',
    lemma: '',
    complementPattern: '',
    grammaticalNumber: '',
    lexicalGroupId: '',
    sentences: [],
    tags: '',
    notes: '',
    difficulty: '',
    sourceType: 'manual',
    include: true,
    issues: [],
  };
}

/** Vollständige Übernahme eines gespeicherten Eintrags – ohne Feldverlust. */
export function draftFromEntry(entry: VocabEntry): DraftRow {
  return {
    id: entry.id,
    english: entry.english,
    german: formatAnswers(entry.germanAnswers),
    acceptedEnglish: formatAnswers(entry.acceptedEnglishAnswers),
    partOfSpeech: entry.partOfSpeech ?? '',
    lemma: entry.lemma ?? '',
    complementPattern: entry.complementPattern ?? '',
    grammaticalNumber: entry.grammaticalNumber ?? '',
    lexicalGroupId: entry.lexicalGroupId ?? '',
    sentences: entry.exampleSentences.map((sentence) =>
      newSentence(sentence.english, sentence.german ?? ''),
    ),
    tags: entry.topicTags.join(', '),
    notes: entry.notes ?? '',
    difficulty: parseDifficulty(entry.difficulty),
    sourceType: entry.sourceType,
    include: true,
    issues: [],
  };
}


/**
 * Prüft alle Entwürfe und markiert Fehler, Warnungen und Duplikate.
 * Fehler verhindern die Übernahme einer Zeile, Warnungen nicht.
 */
export function validateDrafts(drafts: readonly DraftRow[]): DraftRow[] {
  const seen = new Map<string, string>();

  return drafts.map((draft) => {
    const issues: DraftIssue[] = [];
    const english = draft.english.trim();
    const meanings = splitAnswers(draft.german);
    const sentences = draft.sentences.filter(
      (sentence) => sentence.english.trim() || sentence.german.trim(),
    );

    if (!english) {
      issues.push({ level: 'error', field: 'english', message: 'Englisches Stichwort fehlt.' });
    } else if (english.length > 200) {
      issues.push({
        level: 'error',
        field: 'english',
        message: 'Stichwort ist zu lang (max. 200 Zeichen).',
      });
    }

    if (meanings.length === 0) {
      issues.push({ level: 'error', field: 'german', message: 'Deutsche Übersetzung fehlt.' });
    }

    /*
      Eine offene Frage zur Lernform überlebt die Übergabe.

      Sie entsteht im Empfehlungsschritt („Gehört das `on` zur Vokabel?“) und
      wäre hier ohne dieses Feld verschwunden – dieselbe Zeile, dieselbe
      Unsicherheit, nur ohne Hinweis. Warnung und nicht Fehler: Speichern
      bleibt möglich, aber die Zeile sagt „Bitte prüfen“.
    */
    if (draft.formNeedsReview && english) {
      issues.push({
        level: 'warning',
        field: 'english',
        review: true,
        message:
          draft.formReviewReason?.trim() ||
          'An der englischen Lernform ist etwas offen. Bitte prüfen.',
      });
    }

    if (english && meanings.some((meaning) => normalizeAnswer(meaning) === normalizeAnswer(english))) {
      issues.push({
        level: 'warning',
        field: 'german',
        review: true,
        message: 'Übersetzung stimmt mit dem englischen Stichwort überein.',
      });
    }

    if (sentences.some((sentence) => !sentence.english.trim())) {
      issues.push({
        level: 'error',
        field: 'example',
        message: 'Zu einer deutschen Satzentsprechung fehlt der englische Satz.',
      });
    } else if (
      english &&
      sentences.length > 0 &&
      !sentences.some((sentence) => sentenceContainsHeadword(sentence.english, english))
    ) {
      issues.push({
        level: 'warning',
        field: 'example',
        message: 'Kein Beispielsatz enthält das Stichwort – Lückensätze sind damit nicht möglich.',
      });
    }

    if (
      splitAnswers(draft.acceptedEnglish).some(
        (value) => normalizeAnswer(value) === normalizeAnswer(english),
      )
    ) {
      issues.push({
        level: 'warning',
        field: 'accepted',
        message: 'Eine Alternativantwort entspricht dem Stichwort und ist überflüssig.',
      });
    }

    let duplicateOf: string | undefined;
    if (english) {
      const key = normalizeAnswer(english);
      const first = seen.get(key);
      if (first && first !== draft.id) {
        duplicateOf = first;
        issues.push({
          level: 'warning',
          field: 'english',
          review: true,
          message: 'Dieses Stichwort kommt mehrfach vor.',
        });
      } else {
        seen.set(key, draft.id);
      }
    }

    /*
      Die Bestätigung überlebt nur, solange sie sich auf dasselbe bezieht.

      Geprüft wird bei **jedem** Durchlauf, also auch nach jedem Tastendruck in
      einem der drei Felder. Das ist der ganze Mechanismus: Nichts muss die
      Bestätigung aktiv zurücknehmen, sie passt einfach nicht mehr.
    */
    const { duplicateOf: _previous, reviewConfirmedFor, ...rest } = draft;
    const fingerprint = reviewFingerprint(draft);
    const stillConfirmed = reviewConfirmedFor === fingerprint;

    return {
      ...rest,
      issues,
      ...(duplicateOf ? { duplicateOf } : {}),
      ...(stillConfirmed ? { reviewConfirmedFor } : {}),
    };
  });
}

export function hasBlockingError(draft: DraftRow): boolean {
  return draft.issues.some((issue) => issue.level === 'error');
}

/* ------------------------------------------------------- Prüfen & Bestätigen */

/**
 * Der Sachverhalt, über den bei „Als geprüft bestätigen“ entschieden wurde.
 *
 * Drei Felder, und zwar genau die, um die es bei einem fachlichen Befund geht:
 * englische Lernform, deutsche Antwort, Wortart. Notiz, Themen-Tags oder ein
 * zusätzlicher Beispielsatz ändern nichts an der Frage, die beantwortet wurde –
 * sie sollen eine Bestätigung deshalb auch nicht ungültig machen.
 *
 * Verglichen wird über `normalizeAnswer`: Ein zusätzliches Leerzeichen ist
 * keine fachliche Änderung.
 */
export function reviewFingerprint(draft: DraftRow): string {
  return [
    normalizeAnswer(draft.english),
    normalizeAnswer(draft.german),
    draft.partOfSpeech,
  ].join('|');
}

/** Die Befunde, über die jemand entscheiden muss. */
export function reviewIssues(draft: DraftRow): DraftIssue[] {
  return draft.issues.filter((issue) => issue.review === true);
}

/**
 * Steht an dieser Zeile noch eine fachliche Frage offen?
 *
 * „Offen“ heißt: Es gibt einen Befund **und** keine gültige Bestätigung dafür.
 * Eine Zeile ohne Befund ist von selbst in Ordnung – bestätigen muss sie
 * niemand.
 */
export function needsReview(draft: DraftRow): boolean {
  if (reviewIssues(draft).length === 0) return false;
  return draft.reviewConfirmedFor !== reviewFingerprint(draft);
}

/** Bestätigt die offenen Befunde dieser Zeile – für diesen Stand der Dinge. */
export function confirmReview(draft: DraftRow): DraftRow {
  return { ...draft, reviewConfirmedFor: reviewFingerprint(draft) };
}

/**
 * Hält diese Zeile das Speichern auf?
 *
 * Nur, wenn sie überhaupt mitkommt. Eine abgewählte Zeile darf offen bleiben –
 * sie landet in keinem Paket, und jemanden zu einer Entscheidung über etwas zu
 * zwingen, das er gerade weggelegt hat, wäre Beschäftigung.
 */
export function blocksSaving(draft: DraftRow): boolean {
  if (!draft.include) return false;
  return hasBlockingError(draft) || needsReview(draft);
}

export interface DraftSummary {
  total: number;
  selected: number;
  errors: number;
  warnings: number;
  duplicates: number;
}

export function summarize(drafts: readonly DraftRow[]): DraftSummary {
  return {
    total: drafts.length,
    selected: drafts.filter((draft) => draft.include && !hasBlockingError(draft)).length,
    errors: drafts.filter(hasBlockingError).length,
    warnings: drafts.filter((draft) => draft.issues.some((issue) => issue.level === 'warning'))
      .length,
    duplicates: drafts.filter((draft) => draft.duplicateOf !== undefined).length,
  };
}

/** Wählt alle als Duplikat erkannten Zeilen ab. */
export function deselectDuplicates(drafts: readonly DraftRow[]): DraftRow[] {
  return drafts.map((draft) => (draft.duplicateOf ? { ...draft, include: false } : draft));
}

/** Erzeugt aus den ausgewählten, fehlerfreien Entwürfen gültige Einträge. */
export function draftsToEntries(
  drafts: readonly DraftRow[],
  sourceType: SourceType,
  extraTags: readonly string[] = [],
): VocabEntry[] {
  return drafts
    .filter((draft) => draft.include && !hasBlockingError(draft))
    .map<VocabEntry>((draft) => {
      const tags = [...splitList(draft.tags), ...extraTags]
        .map((tag) => tag.trim())
        .filter((tag, index, all) => tag.length > 0 && all.indexOf(tag) === index);

      const exampleSentences = draft.sentences
        .filter((sentence) => sentence.english.trim().length > 0)
        .map((sentence) => ({
          english: sentence.english.trim(),
          ...(sentence.german.trim() ? { german: sentence.german.trim() } : {}),
        }));

      return {
        id: draft.id,
        english: draft.english.trim(),
        germanAnswers: splitAnswers(draft.german),
        acceptedEnglishAnswers: splitAnswers(draft.acceptedEnglish),
        ...(draft.partOfSpeech ? { partOfSpeech: draft.partOfSpeech } : {}),
        // Leer heißt „nicht bekannt“ – dann steht das Feld gar nicht erst da.
        ...(draft.lemma.trim() ? { lemma: draft.lemma.trim() } : {}),
        ...(draft.complementPattern.trim()
          ? { complementPattern: draft.complementPattern.trim() }
          : {}),
        ...(draft.grammaticalNumber ? { grammaticalNumber: draft.grammaticalNumber } : {}),
        ...(draft.lexicalGroupId.trim() ? { lexicalGroupId: draft.lexicalGroupId.trim() } : {}),
        exampleSentences,
        topicTags: tags,
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        ...(draft.difficulty === '' ? {} : { difficulty: draft.difficulty }),
        sourceType: draft.sourceType ?? sourceType,
      };
    });
}
