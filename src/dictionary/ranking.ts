import type { DictionaryEntry, DictionarySense, DictionarySuggestion } from './DictionaryProvider';

/**
 * Die Rangfolge der Vorschläge – bewusst konservativ.
 *
 * Es gibt in der Quelle **keine** Häufigkeitsangabe und keine Angabe darüber,
 * welche Übersetzung die gebräuchliche ist. Die einzige belegte Reihenfolge ist
 * die der Quelle selbst. Deshalb sortiert dieses Modul nicht um, sondern
 * **stuft zurück**: Was erkennbar ein Sonderfall ist, rutscht nach hinten;
 * alles Übrige behält die Reihenfolge, in der es im Wiktionary steht.
 *
 * Der Unterschied ist wichtig. Eine erfundene Rangfolge sähe klüger aus und
 * wäre schlechter: Bei `limestone` stünde nach „kürzeste zuerst“ plötzlich
 * „Kalk“ vor „Kalkstein“.
 */

/** Zuschläge, die eine Übersetzung nach hinten schieben. Kleiner ist besser. */
const SUGGESTION_PENALTY = {
  /** Veraltet, umgangssprachlich, derb: sichtbar, aber nie die Standardantwort. */
  register: 4,
  /** Sehr lange Komposita sind fast immer die fachliche Nebenbedeutung. */
  longWord: 2,
  /** Ein Mehrwortausdruck ist als Vokabelantwort unhandlicher. */
  multiword: 2,
  /** Ein Klammerzusatz heißt: gilt nur unter einer Bedingung. */
  qualifier: 1,
} as const;

/** Ab dieser Länge gilt ein deutsches Wort als auffällig fachlich. */
export const LONG_WORD_THRESHOLD = 20;

export function suggestionPenalty(suggestion: DictionarySuggestion): number {
  let penalty = 0;
  if (suggestion.register?.length) penalty += SUGGESTION_PENALTY.register;
  if (suggestion.german.length > LONG_WORD_THRESHOLD) penalty += SUGGESTION_PENALTY.longWord;
  if (suggestion.multiword) penalty += SUGGESTION_PENALTY.multiword;
  if (suggestion.qualifier) penalty += SUGGESTION_PENALTY.qualifier;
  return penalty;
}

/**
 * Eine geerbte Bedeutung ist eine Schlussfolgerung, keine Auskunft – sie steht
 * hinter allem, was am Stichwort selbst belegt ist.
 */
export function sensePenalty(sense: DictionarySense): number {
  return sense.via ? 3 : 0;
}

/**
 * Stabil sortieren: Bei gleichem Zuschlag bleibt die Reihenfolge der Quelle.
 * `Array.prototype.sort` ist seit ES2019 stabil, darauf ist Verlass.
 */
function byPenalty<T>(items: readonly T[], penalty: (item: T) => number): T[] {
  return [...items].sort((left, right) => penalty(left) - penalty(right));
}

export function rankSuggestions(
  suggestions: readonly DictionarySuggestion[],
): readonly DictionarySuggestion[] {
  return byPenalty(suggestions, suggestionPenalty);
}

export function rankSenses(senses: readonly DictionarySense[]): readonly DictionarySense[] {
  return byPenalty(senses, sensePenalty).map((sense) => ({
    ...sense,
    suggestions: rankSuggestions(sense.suggestions),
  }));
}

/**
 * Trägt eine Bedeutung **nur** Auffälliges?
 *
 * Solche Bedeutungen dürfen angeboten werden, aber die Ansicht soll sie
 * kennzeichnen können – `shell shock` liefert einzig „Kriegszitterer“, und das
 * ist kein Wort, das jemand ungewarnt in ein Vokabelpaket übernehmen sollte.
 */
export function isQuestionable(sense: DictionarySense): boolean {
  if (!sense.suggestions.length) return true;
  return sense.suggestions.every(
    (suggestion) =>
      Boolean(suggestion.register?.length) ||
      suggestion.german.length > LONG_WORD_THRESHOLD ||
      Boolean(suggestion.qualifier),
  );
}

/**
 * Die Rangfolge über mehrere Einträge hinweg.
 *
 * Zuerst die Trefferart – ein exakter Treffer steht vor einer erschlossenen
 * Grundform. Dann, falls die Aufrufende eine Wortart erwartet, die passende.
 * Innerhalb dessen bleibt die Reihenfolge, in der die Suche geliefert hat.
 */
const QUALITY_ORDER = { exact: 0, phrase: 1, lemma: 2, rule: 3 } as const;

export function rankEntries(
  entries: readonly DictionaryEntry[],
  expectedPartOfSpeech?: string,
): readonly DictionaryEntry[] {
  return [...entries]
    .sort((left, right) => {
      const byQuality = QUALITY_ORDER[left.quality] - QUALITY_ORDER[right.quality];
      if (byQuality !== 0) return byQuality;
      if (!expectedPartOfSpeech) return 0;
      const leftFits = left.partOfSpeech === expectedPartOfSpeech ? 0 : 1;
      const rightFits = right.partOfSpeech === expectedPartOfSpeech ? 0 : 1;
      return leftFits - rightFits;
    })
    .map((entry) => ({ ...entry, senses: rankSenses(entry.senses) }));
}
