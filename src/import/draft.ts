import { newId } from '../domain/ids';
import { normalizeAnswer, splitMeanings } from '../domain/normalize';
import {
  PART_OF_SPEECH,
  type PartOfSpeech,
  type SourceType,
  type VocabEntry,
} from '../domain/schema';
import type { ColumnMapping, ColumnRole } from './columnDetect';

export interface DraftIssue {
  level: 'error' | 'warning';
  field?: 'english' | 'german' | 'example' | 'accepted';
  message: string;
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
  english: string;
  /** Freitext; mehrere Bedeutungen durch Komma oder Semikolon getrennt. */
  german: string;
  /** Zusätzlich akzeptierte englische Antworten, ebenfalls als Freitext. */
  acceptedEnglish: string;
  partOfSpeech: PartOfSpeech | '';
  sentences: DraftSentence[];
  tags: string;
  notes: string;
  /** '' = nicht gesetzt, sonst 1–5. */
  difficulty: '' | 1 | 2 | 3 | 4 | 5;
  /** Herkunft dieser Zeile; überschreibt die Herkunft des Imports. */
  sourceType?: SourceType;
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
        german: options.splitMultipleMeanings ? splitMeanings(german).join(', ') : german,
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
    german: entry.germanAnswers.join(', '),
    acceptedEnglish: entry.acceptedEnglishAnswers.join(', '),
    partOfSpeech: entry.partOfSpeech ?? '',
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

function containsWord(sentence: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(sentence);
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
    const meanings = splitMeanings(draft.german);
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

    if (english && meanings.some((meaning) => normalizeAnswer(meaning) === normalizeAnswer(english))) {
      issues.push({
        level: 'warning',
        field: 'german',
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
      !sentences.some((sentence) => containsWord(sentence.english, english))
    ) {
      issues.push({
        level: 'warning',
        field: 'example',
        message: 'Kein Beispielsatz enthält das Stichwort – Lückensätze sind damit nicht möglich.',
      });
    }

    if (
      splitMeanings(draft.acceptedEnglish).some(
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
          message: 'Dieses Stichwort kommt mehrfach vor.',
        });
      } else {
        seen.set(key, draft.id);
      }
    }

    // `duplicateOf` wird bei jeder Prüfung neu bestimmt, nie fortgeschrieben.
    const { duplicateOf: _previous, ...rest } = draft;
    return { ...rest, issues, ...(duplicateOf ? { duplicateOf } : {}) };
  });
}

export function hasBlockingError(draft: DraftRow): boolean {
  return draft.issues.some((issue) => issue.level === 'error');
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
      const tags = [...splitMeanings(draft.tags), ...extraTags]
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
        germanAnswers: splitMeanings(draft.german),
        acceptedEnglishAnswers: splitMeanings(draft.acceptedEnglish),
        ...(draft.partOfSpeech ? { partOfSpeech: draft.partOfSpeech } : {}),
        exampleSentences,
        topicTags: tags,
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        ...(draft.difficulty === '' ? {} : { difficulty: draft.difficulty }),
        sourceType: draft.sourceType ?? sourceType,
      };
    });
}
