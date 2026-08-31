/**
 * Enthält ein Satz ein Stichwort – als eigenes Wort, nicht als Wortteil?
 *
 * Diese Frage stellen inzwischen drei Stellen: die Prüfung der Entwurfszeilen
 * (`validateDrafts`), die Nachbearbeitung der Themenvorschläge und der
 * Satzassistent. Sie hat deshalb genau eine Antwort und genau eine
 * Implementierung – hier, im Domänenkern, ohne Abhängigkeit auf Import-,
 * KI- oder UI-Code.
 */

import { evidenceForPreceding, isFormOf, precedingWord } from './wordForms';

/** Trimmt und macht aus beliebigen Whitespace-Folgen ein einfaches Leerzeichen. */
export function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Steht `needle` als eigenständiges Wort beziehungsweise ganze Wendung im Satz? */
function findAsWord(sentence: string, needle: string): HeadwordMatch | undefined {
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${escapeRegExp(needle)})(?![\\p{L}\\p{N}])`,
    'iu',
  );
  const match = pattern.exec(sentence);
  if (!match) return undefined;
  const start = match.index + (match[1]?.length ?? 0);
  const end = start + (match[2]?.length ?? 0);
  return { start, end, text: sentence.slice(start, end) };
}

export interface HeadwordMatch {
  start: number;
  end: number;
  /** Die Zeichen, die tatsächlich im Satz stehen – nicht das Stichwort. */
  text: string;
}

/**
 * Schreibweisen, unter denen ein Stichwort im Satz stehen kann.
 *
 * „to apologise“ steht dort meist als „apologise“, und „square mile (sq mi)“
 * steht dort als „sq mi“. Beides sind keine anderen Vokabeln, sondern dasselbe
 * Wort in der Form, die der Text nun einmal benutzt.
 */
function variantsOf(needle: string): string[] {
  const variants = [needle];

  const withoutTo = needle.replace(/^to\s+/i, '');
  if (withoutTo !== needle) variants.push(withoutTo);

  // „square mile (sq mi)“ → zuerst das Kürzel, dann die Langform.
  const parenthesis = /^(.+?)\s*\(([^()]+)\)$/.exec(needle);
  if (parenthesis) {
    const [, longForm = '', short = ''] = parenthesis;
    variants.push(collapseWhitespace(short), collapseWhitespace(longForm));
  }

  return variants.filter((variant) => variant.length > 0);
}

/** Wortartige Tokens eines Satzes mit ihrer Position. */
function wordPositions(sentence: string): HeadwordMatch[] {
  const positions: HeadwordMatch[] = [];
  for (const match of sentence.matchAll(/\p{L}[\p{L}\p{M}'’-]*/gu)) {
    if (match.index === undefined) continue;
    positions.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }
  return positions;
}

/**
 * Findet das Stichwort im Satz – notfalls in einer gebeugten Form.
 *
 * Gesucht wird in drei Runden: die genaue Wendung, ihre Schreibvarianten und
 * erst zuletzt eine Beugung desselben Wortes. Zurückgegeben wird immer die
 * Stelle **im Satz**, samt der Zeichen, die dort stehen. Genau darauf beruht
 * der Lückentext: Die Lücke erwartet `islands`, wenn im Satz `islands` steht,
 * auch wenn die Vokabel `island` heißt.
 */
export function findHeadwordInSentence(
  sentence: string,
  english: string,
): HeadwordMatch | undefined {
  const needle = collapseWhitespace(english);
  if (needle.length === 0 || sentence.trim().length === 0) return undefined;

  const variants = variantsOf(needle);
  for (const variant of variants) {
    const direct = findAsWord(sentence, variant);
    if (direct) return direct;
  }

  // Beugungen gibt es nur bei Einzelwörtern; Wendungen bleiben wörtlich.
  //
  // Der Satz entscheidet mit: „She lives near the bay.“ gehört zu `live`,
  // „Their lives changed.“ zu `life`. Ausgewertet wird dasselbe Nachbarwort
  // wie in der Textanalyse – eine Sonderregel nur für `lives` und `leaves`
  // gibt es nirgends.
  for (const variant of variants) {
    if (/\s/.test(variant)) continue;
    for (const position of wordPositions(sentence)) {
      const evidence = evidenceForPreceding(precedingWord(sentence, position.start));
      if (isFormOf(position.text, variant, evidence)) return position;
    }
  }

  return undefined;
}

/**
 * Enthält der Satz das Stichwort beziehungsweise die vollständige Wendung?
 *
 * Groß-/Kleinschreibung spielt keine Rolle, Wortgrenzen schon: „cat“ darf nicht
 * in „category“ gefunden werden. Beim Infinitiv wird zusätzlich die Form ohne
 * „to“ akzeptiert – „to apologise“ steht im Satz nun einmal meist als
 * „apologise“ –, und seit Sprint 3B.1 zählt auch eine gebeugte Form.
 */
export function sentenceContainsHeadword(sentence: string, english: string): boolean {
  return findHeadwordInSentence(sentence, english) !== undefined;
}
