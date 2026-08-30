/**
 * Normalisierung für die Antwortprüfung.
 *
 * Leitidee: Unterschiede, die nichts über das Vokabelwissen aussagen
 * (Groß-/Kleinschreibung, Leerzeichen, typografische Zeichen, abschließende
 * Satzzeichen), dürfen eine Antwort nicht falsch machen. Unterschiede, die
 * etwas aussagen (andere Buchstaben, anderes Wort), bleiben erhalten.
 */

const TRAILING_PUNCTUATION = /[.!?,;:]+$/u;
const LEADING_PUNCTUATION = /^[.!?,;:¡¿"'„“”»«]+/u;

/** Typografische Sonderzeichen auf ASCII-Entsprechungen abbilden. */
function foldTypography(value: string): string {
  return value
    .replace(/[‘’‚′ʼ]/g, "'")
    .replace(/[“”„″«»]/g, '"')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/g, ' ');
}

/**
 * Kanonische Form einer Antwort: Unicode-normalisiert, ohne Rand-Satzzeichen,
 * mit einfachen Leerzeichen, kleingeschrieben.
 */
export function normalizeAnswer(value: string): string {
  return foldTypography(value.normalize('NFC'))
    .replace(/\s+/g, ' ')
    .trim()
    .replace(TRAILING_PUNCTUATION, '')
    .replace(LEADING_PUNCTUATION, '')
    .trim()
    .toLocaleLowerCase('de-DE');
}

const EN_LEADING = ['to ', 'the ', 'a ', 'an ', 'i '];
const DE_LEADING = [
  'der ', 'die ', 'das ', 'den ', 'dem ', 'des ',
  'ein ', 'eine ', 'einen ', 'einem ', 'einer ', 'eines ',
  'sich ', 'zu ', 'etw. ', 'jdn. ', 'jdm. ',
];

/**
 * Zusätzlich toleranter Vergleichsschlüssel: ohne führende Artikel bzw.
 * Infinitivpartikel und ohne Klammerzusätze wie „(sich)“ oder „[BE]“.
 */
export function lenientKey(value: string): string {
  let text = normalizeAnswer(value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of [...EN_LEADING, ...DE_LEADING]) {
      if (text.startsWith(prefix)) {
        text = text.slice(prefix.length).trim();
        changed = true;
        break;
      }
    }
  }
  return text;
}

/**
 * Zerlegt eine importierte Zelle in einzelne Bedeutungen.
 * `;` und `,` trennen immer, `/` nur mit umgebenden Leerzeichen –
 * so bleibt „der/die Angestellte“ ein einziger Eintrag.
 */
export function splitMeanings(value: string): string[] {
  return foldTypography(value)
    .split(/\s*;\s*|\s*,\s*|\s+\/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Alle Formen, unter denen eine gespeicherte Antwort akzeptiert wird:
 * die kanonische Form, die tolerante Form und – bei Klammerzusätzen –
 * beide Lesarten („(sich) freuen“ → „sich freuen“ und „freuen“).
 */
export function acceptedForms(answer: string): string[] {
  const forms = new Set<string>();
  const canonical = normalizeAnswer(answer);
  if (canonical) forms.add(canonical);

  const withoutParenMarkers = normalizeAnswer(answer.replace(/[()]/g, ' '));
  if (withoutParenMarkers) forms.add(withoutParenMarkers);

  const lenient = lenientKey(answer);
  if (lenient) forms.add(lenient);

  return [...forms];
}

/** Levenshtein-Distanz, begrenzt auf `max` (Abbruch spart Rechenzeit). */
export function levenshtein(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0] ?? i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length] ?? 0;
}

/** Toleranzschwelle für „fast richtig“ – abhängig von der Wortlänge. */
export function typoTolerance(length: number): number {
  if (length <= 4) return 0;
  if (length <= 8) return 1;
  return 2;
}
