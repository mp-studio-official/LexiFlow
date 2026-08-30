/**
 * Enthält ein Satz ein Stichwort – als eigenes Wort, nicht als Wortteil?
 *
 * Diese Frage stellen inzwischen drei Stellen: die Prüfung der Entwurfszeilen
 * (`validateDrafts`), die Nachbearbeitung der Themenvorschläge und der
 * Satzassistent. Sie hat deshalb genau eine Antwort und genau eine
 * Implementierung – hier, im Domänenkern, ohne Abhängigkeit auf Import-,
 * KI- oder UI-Code.
 */

/** Trimmt und macht aus beliebigen Whitespace-Folgen ein einfaches Leerzeichen. */
export function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Steht `needle` als eigenständiges Wort beziehungsweise ganze Wendung im Satz? */
function containsAsWord(sentence: string, needle: string): boolean {
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`,
    'iu',
  ).test(sentence);
}

/**
 * Enthält der Satz das Stichwort beziehungsweise die vollständige Wendung?
 *
 * Groß-/Kleinschreibung spielt keine Rolle, Wortgrenzen schon: „cat“ darf nicht
 * in „category“ gefunden werden. Beim Infinitiv wird zusätzlich die Form ohne
 * „to“ akzeptiert – „to apologise“ steht im Satz nun einmal meist als
 * „apologise“.
 */
export function sentenceContainsHeadword(sentence: string, english: string): boolean {
  const needle = collapseWhitespace(english);
  if (needle.length === 0 || sentence.trim().length === 0) return false;
  if (containsAsWord(sentence, needle)) return true;

  const withoutTo = needle.replace(/^to\s+/i, '');
  if (withoutTo === needle) return false;
  return containsAsWord(sentence, withoutTo);
}
