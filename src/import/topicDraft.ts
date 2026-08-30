import { newId } from '../domain/ids';
import { normalizeAnswer } from '../domain/normalize';
import { emptyDraft, newSentence, validateDrafts, type DraftRow } from './draft';
import type { AiVocabSuggestion } from '../ai/AiProvider';

/**
 * Fachliche Nachbearbeitung der Themenvorschläge.
 *
 * Das Modell hat sein Schema eingehalten – das heißt aber nur, dass die Form
 * stimmt. Alles Weitere prüfen wir hier selbst und rein: Dubletten, Leerwerte,
 * die gewünschte Anzahl und vor allem der Beispielsatz. Ein Satz, der das
 * Stichwort gar nicht enthält, wäre als Lückensatz wertlos und als Beleg
 * irreführend; er wird verworfen und die Zeile bekommt einen sichtbaren
 * Hinweis.
 *
 * IDs entstehen ausschließlich hier – das Modell erzeugt keine.
 */

export interface TopicDraftOptions {
  /** Bereits vorhandene englische Stichwörter, die nicht erneut vorkommen sollen. */
  existingEnglish?: readonly string[];
  /** Obergrenze; mehr Zeilen entstehen nie, auch wenn das Modell mehr liefert. */
  maxItems: number;
  /** Thema des Pakets – wird als Tag ergänzt, falls es fehlt. */
  topic?: string;
}

export interface TopicDraftResult {
  drafts: DraftRow[];
  /** Wie viele Einträge das Modell geliefert hat. */
  received: number;
  /** Wie viele davon übrig geblieben sind. */
  accepted: number;
  /** Wie viele Beispielsätze verworfen wurden, weil sie nicht passten. */
  droppedSentences: number;
}

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Enthält der Satz das Stichwort als eigenes Wort beziehungsweise die vollständige
 * Wendung? Groß-/Kleinschreibung spielt keine Rolle, Wortgrenzen schon – „cat"
 * darf nicht in „category" gefunden werden.
 */
export function sentenceContainsHeadword(sentence: string, english: string): boolean {
  const needle = collapse(english);
  if (needle.length === 0 || sentence.trim().length === 0) return false;

  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`,
    'iu',
  );
  if (pattern.test(sentence)) return true;

  // „to apologise" darf auch als „apologise" im Satz stehen.
  const withoutTo = needle.replace(/^to\s+/i, '');
  if (withoutTo === needle) return false;
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(withoutTo)}(?![\\p{L}\\p{N}])`,
    'iu',
  ).test(sentence);
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = collapse(value);
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/**
 * Macht aus geprüften Modellvorschlägen ganz normale Entwurfszeilen.
 *
 * Rein und deterministisch bis auf die IDs; die kommen aus `newId()`.
 */
export function topicSuggestionsToDrafts(
  suggestions: readonly AiVocabSuggestion[],
  options: TopicDraftOptions,
): TopicDraftResult {
  const taken = new Set(
    (options.existingEnglish ?? [])
      .map((value) => normalizeAnswer(collapse(value)))
      .filter((value) => value.length > 0),
  );

  const drafts: DraftRow[] = [];
  let droppedSentences = 0;

  for (const suggestion of suggestions) {
    if (drafts.length >= options.maxItems) break;

    const english = collapse(suggestion.english);
    if (english.length === 0) continue;

    // Dubletten – gegenüber vorhandenen Vokabeln und innerhalb der Antwort.
    const key = normalizeAnswer(english);
    if (key.length === 0 || taken.has(key)) continue;
    taken.add(key);

    const germanAnswers = uniqueStrings(suggestion.germanAnswers ?? []);
    if (germanAnswers.length === 0) continue; // ohne Bedeutung ist der Eintrag wertlos

    const tags = uniqueStrings([...(suggestion.topicTags ?? []), ...(options.topic ? [options.topic] : [])]);

    const sentence = suggestion.exampleSentences?.[0];
    const englishSentence = collapse(sentence?.english ?? '');
    const sentenceFits = englishSentence.length > 0 && sentenceContainsHeadword(englishSentence, english);
    if (englishSentence.length > 0 && !sentenceFits) droppedSentences += 1;

    const difficulty =
      typeof suggestion.difficulty === 'number' &&
      Number.isInteger(suggestion.difficulty) &&
      suggestion.difficulty >= 1 &&
      suggestion.difficulty <= 5
        ? (suggestion.difficulty as 1 | 2 | 3 | 4 | 5)
        : '';

    drafts.push({
      ...emptyDraft(),
      id: newId(),
      english,
      german: germanAnswers.join(', '),
      ...(suggestion.partOfSpeech ? { partOfSpeech: suggestion.partOfSpeech } : {}),
      sentences: sentenceFits
        ? [newSentence(englishSentence, collapse(sentence?.german ?? ''))]
        : [],
      tags: tags.join(', '),
      difficulty,
      // Herkunft: aus einem Thema erzeugt – geprüft wird trotzdem von Hand.
      sourceType: 'topic-ai',
      ...(englishSentence.length > 0 && !sentenceFits
        ? {
            issues: [
              {
                level: 'warning' as const,
                field: 'example' as const,
                message:
                  'Der vorgeschlagene Beispielsatz enthielt das Stichwort nicht und wurde entfernt.',
              },
            ],
          }
        : {}),
    });
  }

  // Die Prüfung ergänzt die üblichen Hinweise; unser Satzhinweis bleibt erhalten.
  const validated = validateDrafts(drafts).map((draft, index) => {
    const own = drafts[index]?.issues ?? [];
    const extra = own.filter((issue) => issue.message.includes('Beispielsatz enthielt'));
    return extra.length > 0 ? { ...draft, issues: [...extra, ...draft.issues] } : draft;
  });

  return {
    drafts: validated,
    received: suggestions.length,
    accepted: validated.length,
    droppedSentences,
  };
}

/** Eine einzelne leere Zeile, die das Thema schon als Tag mitbringt. */
export function emptyTopicDraft(topic: string): DraftRow[] {
  const tag = collapse(topic);
  return validateDrafts([
    { ...emptyDraft(), id: newId(), tags: tag, sourceType: 'manual' },
  ]);
}

/** Normalisierte englische Stichwörter – mehr geht nie an das Modell. */
export function existingHeadwords(entries: readonly { english: string }[]): string[] {
  return uniqueStrings(entries.map((entry) => entry.english));
}
