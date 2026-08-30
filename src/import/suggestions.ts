import { splitMeanings } from '../domain/normalize';
import { PART_OF_SPEECH, type PartOfSpeech } from '../domain/schema';
import type { DraftRow } from './draft';

/**
 * Vorschläge im Importentwurf.
 *
 * Ein Vorschlag ist eine **Anregung, kein Inhalt**. Er lebt ausschließlich im
 * Entwurf, wird nie exportiert und nie automatisch in ein Feld geschrieben.
 * Erst „Übernehmen" macht aus dem Vorschlag einen normalen Feldwert – ab dann
 * ist er ein ganz gewöhnlicher Eintrag, den niemand mehr von einer Handeingabe
 * unterscheiden kann (und muss).
 *
 * Drei Grundregeln, die alle Funktionen hier einhalten:
 *
 * 1. Vorhandene Angaben werden nie überschrieben.
 * 2. Was die Lehrkraft selbst geschrieben hat, hat Vorrang.
 * 3. Ein abgelehnter Vorschlag kommt im selben Entwurf nicht wieder.
 */

export const SUGGESTION_FIELDS = ['german', 'partOfSpeech', 'difficulty', 'topicTags'] as const;
export type SuggestionField = (typeof SUGGESTION_FIELDS)[number];

export const SUGGESTION_FIELD_LABELS: Readonly<Record<SuggestionField, string>> = {
  german: 'Deutsche Übersetzung',
  partOfSpeech: 'Wortart',
  difficulty: 'Schwierigkeit',
  topicTags: 'Themen-Tags',
};

export const SUGGESTION_SOURCES = ['local-rule', 'local-translator', 'local-language-model'] as const;
export type SuggestionSource = (typeof SUGGESTION_SOURCES)[number];

/** Verständlich statt technisch – kein Modellname als Hauptinformation. */
export const SUGGESTION_SOURCE_LABELS: Readonly<Record<SuggestionSource, string>> = {
  'local-rule': 'aus einer festen Regel',
  'local-translator': 'aus der lokalen Übersetzung',
  'local-language-model': 'aus dem lokalen Sprachmodell',
};

export type SuggestionStatus = 'suggested' | 'accepted' | 'rejected' | 'edited';

/** Verständliche Unsicherheit statt einer Prozentzahl, die nichts bedeutet. */
export type SuggestionConfidence = 'eindeutig' | 'unsicher';

export interface DraftSuggestion {
  field: SuggestionField;
  /** Immer als Text; `difficulty` als "1"–"5", `topicTags` kommagetrennt. */
  value: string;
  source: SuggestionSource;
  status: SuggestionStatus;
  confidence?: SuggestionConfidence;
}

/**
 * Priorität bei mehreren Quellen für dasselbe Feld: Das Sprachmodell weiß mehr
 * über den Kontext als eine feste Regel, die Übersetzung ist für ihr eigenes
 * Feld die zuständige Quelle. Ersetzt wird aber **nur**, solange der Vorschlag
 * unbearbeitet ist – eine Entscheidung der Lehrkraft überschreibt niemand.
 */
const SOURCE_PRIORITY: Readonly<Record<SuggestionSource, number>> = {
  'local-rule': 1,
  'local-translator': 2,
  'local-language-model': 3,
};

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export function suggestionsOf(draft: DraftRow): readonly DraftSuggestion[] {
  return draft.suggestions ?? [];
}

export function suggestionFor(draft: DraftRow, field: SuggestionField): DraftSuggestion | undefined {
  return suggestionsOf(draft).find((suggestion) => suggestion.field === field);
}

/** Wert, der im Entwurf steht – als Text, vergleichbar mit `value`. */
export function currentValue(draft: DraftRow, field: SuggestionField): string {
  switch (field) {
    case 'german':
      return draft.german.trim();
    case 'partOfSpeech':
      return draft.partOfSpeech;
    case 'difficulty':
      return draft.difficulty === '' ? '' : String(draft.difficulty);
    case 'topicTags':
      return draft.tags.trim();
  }
}

export function isFieldEmpty(draft: DraftRow, field: SuggestionField): boolean {
  return currentValue(draft, field).length === 0;
}

/** Offen = vorgeschlagen, noch nicht entschieden und das Feld ist frei. */
export function isOpen(draft: DraftRow, field: SuggestionField): boolean {
  const suggestion = suggestionFor(draft, field);
  return suggestion?.status === 'suggested' && isFieldEmpty(draft, field);
}

export function openSuggestions(draft: DraftRow): DraftSuggestion[] {
  return suggestionsOf(draft).filter((suggestion) => isOpen(draft, suggestion.field));
}

export function countOpen(drafts: readonly DraftRow[], field: SuggestionField): number {
  return drafts.filter((draft) => draft.include && isOpen(draft, field)).length;
}

// ---------------------------------------------------------------------------
// Schreiben – alle Funktionen sind rein und geben neue Zeilen zurück
// ---------------------------------------------------------------------------

/** Führt zwei Tag-Listen zusammen, ohne Dubletten und ohne Reihenfolgezufall. */
function mergeTags(first: string, second: string): string {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of [...splitMeanings(first), ...splitMeanings(second)]) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags.join(', ');
}

function withSuggestions(draft: DraftRow, suggestions: DraftSuggestion[]): DraftRow {
  return { ...draft, suggestions };
}

/**
 * Nimmt einen Vorschlag in den Entwurf auf.
 *
 * Nicht aufgenommen wird er, wenn das Feld bereits belegt ist, wenn derselbe
 * Vorschlag schon abgelehnt wurde oder wenn bereits eine gleichwertige oder
 * höherwertige Quelle vorliegt.
 */
export function addSuggestion(draft: DraftRow, suggestion: DraftSuggestion): DraftRow {
  const value = suggestion.value.trim();
  if (value.length === 0) return draft;
  if (!isFieldEmpty(draft, suggestion.field)) return draft;

  const existing = suggestionFor(draft, suggestion.field);
  let merged = value;

  if (existing) {
    // Ein abgelehnter Vorschlag kommt nicht wieder – wohl aber ein **anderer**
    // Wert für dasselbe Feld, etwa nach einem geänderten Paketthema.
    if (existing.status === 'rejected') {
      if (existing.value.toLowerCase() === value.toLowerCase()) return draft;
      const others = suggestionsOf(draft).filter((item) => item.field !== suggestion.field);
      return withSuggestions(draft, [...others, { ...suggestion, value, status: 'suggested' }]);
    }
    // Übernommenes und selbst Bearbeitetes bleibt unangetastet.
    if (existing.status !== 'suggested') return draft;
    if (SOURCE_PRIORITY[suggestion.source] <= SOURCE_PRIORITY[existing.source]) return draft;
    // Themen-Tags sind additiv: Zwei Quellen ergeben zusammen mehr Sachfeld,
    // nicht weniger. Bei allen anderen Feldern gäbe es dagegen nur einen Wert.
    if (suggestion.field === 'topicTags') merged = mergeTags(existing.value, value);
  }

  const rest = suggestionsOf(draft).filter((item) => item.field !== suggestion.field);
  return withSuggestions(draft, [...rest, { ...suggestion, value: merged, status: 'suggested' }]);
}

export function addSuggestions(
  draft: DraftRow,
  suggestions: readonly DraftSuggestion[],
): DraftRow {
  return suggestions.reduce(addSuggestion, draft);
}

/** Schreibt den vorgeschlagenen Wert in das echte Feld. */
function applyValue(draft: DraftRow, field: SuggestionField, value: string): DraftRow {
  switch (field) {
    case 'german':
      return { ...draft, german: value };
    case 'partOfSpeech':
      return PART_OF_SPEECH.includes(value as PartOfSpeech)
        ? { ...draft, partOfSpeech: value as PartOfSpeech }
        : draft;
    case 'difficulty': {
      const number = Number(value);
      return Number.isInteger(number) && number >= 1 && number <= 5
        ? { ...draft, difficulty: number as 1 | 2 | 3 | 4 | 5 }
        : draft;
    }
    case 'topicTags': {
      // Vorhandene Tags bleiben, Dubletten entstehen nicht.
      const existing = splitMeanings(draft.tags);
      const known = new Set(existing.map((tag) => tag.toLowerCase()));
      const added: string[] = [];
      for (const tag of splitMeanings(value)) {
        const key = tag.toLowerCase();
        if (known.has(key)) continue;
        known.add(key);
        added.push(tag);
      }
      return { ...draft, tags: [...existing, ...added].join(', ') };
    }
  }
}

/** Übernimmt den Vorschlag – nur, wenn er offen ist. */
export function acceptSuggestion(draft: DraftRow, field: SuggestionField): DraftRow {
  const suggestion = suggestionFor(draft, field);
  if (!suggestion || suggestion.status !== 'suggested') return draft;
  if (!isFieldEmpty(draft, field)) return draft;

  const applied = applyValue(draft, field, suggestion.value);
  if (applied === draft) return draft;

  return withSuggestions(
    applied,
    suggestionsOf(draft).map((item) =>
      item.field === field ? { ...item, status: 'accepted' } : item,
    ),
  );
}

/** Lehnt den Vorschlag ab; derselbe Wert wird nicht erneut angeboten. */
export function rejectSuggestion(draft: DraftRow, field: SuggestionField): DraftRow {
  const suggestion = suggestionFor(draft, field);
  if (!suggestion || suggestion.status !== 'suggested') return draft;

  return withSuggestions(
    draft,
    suggestionsOf(draft).map((item) =>
      item.field === field ? { ...item, status: 'rejected' } : item,
    ),
  );
}

/**
 * Vergleicht zwei Fassungen derselben Zeile und markiert jedes Feld, das die
 * Lehrkraft selbst verändert hat, als eigene Bearbeitung. Danach ist der
 * Vorschlag Geschichte: Er wird weder erneut angeboten noch erneut übernommen.
 */
export function markManualEdits(previous: DraftRow, next: DraftRow): DraftRow {
  const suggestions = suggestionsOf(next);
  if (suggestions.length === 0) return next;

  const changed = suggestions.map((suggestion) => {
    const before = currentValue(previous, suggestion.field);
    const after = currentValue(next, suggestion.field);
    if (before === after) return suggestion;
    if (suggestion.status === 'rejected') return suggestion;
    return { ...suggestion, status: 'edited' as const };
  });

  return changed.every((item, index) => item === suggestions[index])
    ? next
    : withSuggestions(next, changed);
}

/** Wendet `markManualEdits` auf zwei Listen an – Zeilen werden über `id` gepaart. */
export function syncManualEdits(
  previous: readonly DraftRow[],
  next: readonly DraftRow[],
): DraftRow[] {
  const before = new Map(previous.map((draft) => [draft.id, draft]));
  return next.map((draft) => {
    const old = before.get(draft.id);
    return old ? markManualEdits(old, draft) : draft;
  });
}

/**
 * Sammelaktion für ein Feld.
 *
 * Berücksichtigt werden ausschließlich ausgewählte Zeilen mit noch leerem Feld
 * und offenem Vorschlag. Bestehende Angaben ersetzt sie nie.
 */
export function acceptAllForField(
  drafts: readonly DraftRow[],
  field: SuggestionField,
): DraftRow[] {
  return drafts.map((draft) =>
    draft.include && isOpen(draft, field) ? acceptSuggestion(draft, field) : draft,
  );
}
