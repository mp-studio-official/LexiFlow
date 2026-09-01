import { normalizeToken, segmentSentences, segmentWords } from '../domain/textExtraction';

/**
 * Ein Themenvorschlag aus dem Text – offline, ohne Modell.
 *
 * Zwei Wege, in dieser Reihenfolge:
 *
 * 1. **Eine Überschrift.** Steht ganz oben eine kurze Zeile ohne Schlusspunkt,
 *    ist das mit hoher Wahrscheinlichkeit der Titel. Er ist besser als alles,
 *    was sich aus Wortzählungen ableiten ließe.
 * 2. **Wiederkehrende Inhaltsbegriffe.** Sonst werden die zwei häufigsten
 *    tragenden Wörter genommen und schlicht verbunden.
 *
 * Und ein dritter Fall, der genauso wichtig ist: **nichts vorschlagen.** Wenn
 * kein Wort deutlich heraussticht, ist „Text vom 3. September“ ehrlicher als
 * eine erfundene Präzision. Der Vorschlag ist ohnehin frei überschreibbar; ein
 * falscher Vorschlag kostet aber Vertrauen und muss weggeklickt werden.
 *
 * Ein lokales Sprachmodell darf das später verbessern – Voraussetzung ist es
 * ausdrücklich nicht.
 */

/** Länger als das ist keine Überschrift mehr, sondern ein Satz. */
const MAX_HEADING_LENGTH = 70;

/** Ab wie vielen Vorkommen ein Wort als tragend gilt. */
const MIN_OCCURRENCES = 2;

export interface TopicSuggestion {
  /** Der Vorschlag. Leer heißt: kein belastbarer Vorschlag. */
  topic: string;
  /** Woraus er entstanden ist – für eine ehrliche Beschriftung. */
  source: 'heading' | 'frequency' | 'none';
}

/**
 * Sieht die erste Zeile nach einer Überschrift aus?
 *
 * Kriterien: kurz, kein Satzschlusszeichen, mehr als ein Wort (ein einzelnes
 * Wort ist häufiger ein Listenkopf als ein Titel) und nicht komplett in
 * Großbuchstaben geschrieben – Letzteres wäre eher ein Hinweis oder ein Label.
 */
export function headingOf(text: string): string | undefined {
  const first = text.split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (!first || first.length > MAX_HEADING_LENGTH) return undefined;
  if (/[.!?:;]$/.test(first)) return undefined;
  const words = first.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 9) return undefined;
  return first;
}

/** Die tragenden Wörter des Textes, häufigste zuerst. */
export function keyTerms(text: string, limit = 4): string[] {
  const counts = new Map<string, { display: string; count: number }>();

  for (const sentence of segmentSentences(text)) {
    for (const token of segmentWords(sentence.text)) {
      const normalized = normalizeToken(token.text);
      // Kurze Wörter tragen kein Thema; Zahlen und Zeichen erst recht nicht.
      if (normalized.length < 4 || !/^[a-z][a-z'-]*$/.test(normalized)) continue;
      const known = counts.get(normalized);
      if (known) known.count += 1;
      else counts.set(normalized, { display: token.text, count: 1 });
    }
  }

  return [...counts.entries()]
    .filter(([, value]) => value.count >= MIN_OCCURRENCES)
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([, value]) => value.display);
}

export function suggestTopic(text: string): TopicSuggestion {
  const heading = headingOf(text);
  if (heading) return { topic: heading, source: 'heading' };

  const terms = keyTerms(text, 2);
  if (terms.length >= 2) {
    // Schlicht verbunden – „Traffic und Council“ behauptet weniger als eine
    // erfundene Kapitelüberschrift und ist trotzdem brauchbar.
    return { topic: `${terms[0]} und ${terms[1]}`, source: 'frequency' };
  }
  if (terms.length === 1) return { topic: terms[0] ?? '', source: 'frequency' };

  return { topic: '', source: 'none' };
}
