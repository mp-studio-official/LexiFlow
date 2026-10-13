import type { PartOfSpeech } from '../domain/schema';

/**
 * Die Wortartbezeichnungen der Quelle auf die sieben von LexiFlow.
 *
 * ## Warum das eine eigene Datei ist
 *
 * Es ist eine Tabelle und eine Zeile Code — und stand bis hierher in
 * `dictionarySuggestions.ts`, mitten zwischen Wörterbuchlogik. Wer sie
 * benutzte, zog damit `src/dictionary/**` ins Bündel.
 *
 * Genau das ist passiert: `cognates.ts` braucht die Tabelle, `draft.ts`
 * braucht `cognates`, und über den Universalimport hing damit das
 * Wörterbuch am Portal. `portableIsolation.test.ts` hat es gefunden — die
 * Wache steht dort, seit einmal 6,3 MB Wiktionary in einem Bündel landeten,
 * das ohne sie 261 kB groß ist.
 *
 * Wiktionary kennt weit mehr Kategorien, als ein Vokabelpaket braucht.
 * Zusammengefasst wird nur, was sich zusammenfassen lässt; alles Übrige
 * landet bei `other` und nicht bei einer erfundenen Nachbarschaft.
 */
const PART_OF_SPEECH_BY_SOURCE: Readonly<Record<string, PartOfSpeech>> = {
  noun: 'noun',
  name: 'noun',
  verb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  phrase: 'phrase',
  proverb: 'phrase',
  prep_phrase: 'phrase',
  prep: 'preposition',
  postp: 'preposition',
  intj: 'other',
  num: 'other',
  pron: 'other',
  det: 'other',
  conj: 'other',
  particle: 'other',
  contraction: 'other',
};

export function partOfSpeechOfSource(source: string | undefined): PartOfSpeech | undefined {
  return source ? PART_OF_SPEECH_BY_SOURCE[source] : undefined;
}
