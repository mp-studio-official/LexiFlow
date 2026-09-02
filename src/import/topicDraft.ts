import { newId } from '../domain/ids';
import { formatAnswers, normalizeAnswer } from '../domain/normalize';
import { collapseWhitespace, sentenceContainsHeadword } from '../domain/wordMatch';
import { emptyDraft, newSentence, validateDrafts, type DraftRow } from './draft';
import { MAX_CONTEXT_HEADWORDS, type AiVocabSuggestion } from '../ai/AiProvider';

/**
 * Die Wortgrenzenprüfung wohnt seit Sprint 2B.2b im Domänenkern
 * (`domain/wordMatch`), weil auch der Satzassistent sie braucht. Sie bleibt
 * hier als Re-Export erreichbar – eine Implementierung, ein Verhalten.
 */
export { sentenceContainsHeadword } from '../domain/wordMatch';

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
  /**
   * **Alle** bereits vorhandenen englischen Stichwörter. Hier gilt kein Limit:
   * Dieser Filter ist die maßgebliche Garantie gegen Dubletten und muss deshalb
   * vollständig sein. Was das Sprachmodell davon zu sehen bekommt, regelt
   * `headwordsForPrompt`.
   */
  existingEnglish?: readonly string[];
  /** Obergrenze; mehr Zeilen entstehen nie, auch wenn das Modell mehr liefert. */
  maxItems: number;
  /** Thema des Pakets – wird als Tag ergänzt, falls es fehlt. */
  topic?: string;
}

/**
 * Vier Zahlen, die zusammen eine ehrliche Aussage ergeben.
 *
 * Sie sind bewusst getrennt, weil sie unterschiedliche Fragen beantworten:
 * Was wollte die Lehrkraft, was kam vom Modell, und was hat die lokale Prüfung
 * davon übrig gelassen. „8 von 8“ wäre keine Antwort auf die erste Frage.
 */
export interface TopicDraftResult {
  drafts: DraftRow[];
  /** Von der Lehrkraft gewählte Obergrenze. */
  requested: number;
  /**
   * Gültige Einträge aus der Modellantwort – gezählt **vor** der lokalen
   * Dubletten- und Satzprüfung. Gültig heißt: ein englisches Stichwort und
   * mindestens eine deutsche Bedeutung.
   */
  received: number;
  /** Tatsächlich in die Vorschau übernommene Zeilen. */
  accepted: number;
  /** Entfernte Beispielsätze, die das Stichwort nicht enthielten. */
  droppedSentences: number;
}

/** Fertige Textbausteine für die Vorschau – rein, damit Tests sie prüfen können. */
export interface TopicResultSummary {
  /** „8 von 10 gewünschten Vorschlägen übernommen.“ */
  headline: string;
  /** Warum es weniger wurden – leer, wenn nichts lokal entfernt wurde. */
  detail: string;
  /** Hinweis zu verworfenen Beispielsätzen – leer, wenn keiner betroffen war. */
  sentences: string;
}

/**
 * Formuliert das Ergebnis so, wie es eine Lehrkraft lesen will: gemessen an dem,
 * was sie angefordert hat. Weniger als gewünscht wird nie stillschweigend zur
 * neuen Bezugsgröße gemacht.
 */
export function summarizeTopicResult(result: TopicDraftResult): TopicResultSummary {
  const headline = `${result.accepted} von ${result.requested} gewünschten Vorschlägen übernommen.`;

  const filtered = result.received - result.accepted;
  const detail =
    result.accepted < result.requested && filtered > 0
      ? `Das Sprachmodell lieferte ${result.received}; ${filtered} ${
          filtered === 1 ? 'Eintrag wurde' : 'Einträge wurden'
        } bei der lokalen Prüfung entfernt.`
      : '';

  const sentences =
    result.droppedSentences > 0
      ? result.droppedSentences === 1
        ? 'Ein Beispielsatz wurde entfernt, weil er das Stichwort nicht enthielt.'
        : `${result.droppedSentences} Beispielsätze wurden entfernt, weil sie das Stichwort nicht enthielten.`
      : '';

  return { headline, detail, sentences };
}

const collapse = collapseWhitespace;

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
  let received = 0;

  for (const suggestion of suggestions) {
    const english = collapse(suggestion.english);
    if (english.length === 0) continue;

    const key = normalizeAnswer(english);
    if (key.length === 0) continue;

    const germanAnswers = uniqueStrings(suggestion.germanAnswers ?? []);
    if (germanAnswers.length === 0) continue; // ohne Bedeutung ist der Eintrag wertlos

    // Ab hier ist der Eintrag als Modellantwort brauchbar – das wird gezählt,
    // auch wenn ihn die lokale Prüfung gleich wieder aussortiert.
    received += 1;

    // Die Obergrenze beendet die Übernahme, nicht die Zählung.
    if (drafts.length >= options.maxItems) continue;

    // Dubletten – gegenüber vorhandenen Vokabeln und innerhalb der Antwort.
    if (taken.has(key)) continue;
    taken.add(key);

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
      german: formatAnswers(germanAnswers),
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
    requested: options.maxItems,
    received,
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

/** Normalisierte englische Stichwörter – mehr als diese geht nie an das Modell. */
export function existingHeadwords(entries: readonly { english: string }[]): string[] {
  return uniqueStrings(entries.map((entry) => entry.english));
}

/**
 * Wählt die Stichwörter aus, die das Sprachmodell als Hinweis erhält.
 *
 * Der Prompt ist **Hilfestellung, nicht Garantie**: Er soll dem Modell die
 * offensichtlichsten Dubletten ersparen, ohne den Kontext mit einem ganzen
 * Vokabelbestand zu fluten. Ob am Ende wirklich keine Dublette durchkommt,
 * entscheidet allein der vollständige lokale Filter in
 * `topicSuggestionsToDrafts`.
 *
 * Die Auswahl ist deterministisch: alphabetisch sortiert, dann die ersten
 * `limit`. Dieselbe Vokabelsammlung ergibt damit immer denselben Prompt –
 * unabhängig davon, in welcher Reihenfolge die Datenbank die Einträge liefert.
 */
export function headwordsForPrompt(
  existing: readonly string[],
  limit: number = MAX_CONTEXT_HEADWORDS,
): string[] {
  if (limit <= 0) return [];
  return uniqueStrings(existing)
    .sort((left, right) => {
      const a = left.toLowerCase();
      const b = right.toLowerCase();
      return a < b ? -1 : a > b ? 1 : 0;
    })
    .slice(0, limit);
}
