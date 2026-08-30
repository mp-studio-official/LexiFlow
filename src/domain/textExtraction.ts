import { ENGLISH_STOPWORDS } from './stopwords';

/**
 * Lokale Textanalyse: aus einem englischen Text Vokabelkandidaten gewinnen.
 *
 * Die Funktion ist rein, deterministisch und ohne jeden Netzwerkzugriff. Sie
 * erfindet nichts: keine Übersetzung, keine Wortart, keine GeR-Stufe. Der
 * Beispielsatz stammt exakt aus dem Quelltext.
 */

export const MAX_TEXT_LENGTH = 20_000;

export class TextTooLongError extends Error {
  constructor(readonly length: number) {
    super(
      `Der Text ist ${length.toLocaleString('de-DE')} Zeichen lang. Erlaubt sind ${MAX_TEXT_LENGTH.toLocaleString('de-DE')} Zeichen.`,
    );
    this.name = 'TextTooLongError';
  }
}

export class AnalysisAbortedError extends Error {
  constructor() {
    super('Die Analyse wurde abgebrochen.');
    this.name = 'AnalysisAbortedError';
  }
}

export interface TextSentence {
  index: number;
  /** Exakt so wie im Quelltext, nur ohne umgebende Leerzeichen. */
  text: string;
  /** Zeichenoffset des ersten Zeichens im Quelltext. */
  start: number;
}

export interface TextCandidate {
  /** Stabil über Läufe hinweg: aus der normalisierten Form abgeleitet. */
  id: string;
  /** Anzeigeform aus dem Quelltext (Groß-/Kleinschreibung erhalten). */
  english: string;
  /** Kleingeschriebene Vergleichsform; Dubletten werden darüber zusammengeführt. */
  normalizedEnglish: string;
  occurrences: number;
  /** Zeichenoffset der ersten Fundstelle im Quelltext. */
  firstOccurrence: number;
  /** Der Satz der ersten Fundstelle – exakt aus dem Quelltext. */
  sourceSentence: string;
  sentenceIndex: number;
  /** Heuristik: durchgehend großgeschrieben und nicht nur am Satzanfang. */
  isLikelyProperNoun: boolean;
}

export type CandidateSort = 'text-order' | 'frequency';

export interface ExtractOptions {
  /** Funktionswörter mit aufnehmen (Standard: nein). */
  includeStopwords?: boolean;
  /** Wahrscheinliche Eigennamen mit aufnehmen (Standard: nein). */
  includeProperNouns?: boolean;
  /** Kürzere Tokens werden ausgelassen (Standard: 2). */
  minLength?: number;
  sort?: CandidateSort;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Satzsegmentierung
// ---------------------------------------------------------------------------

/** Abkürzungen, nach denen ein Punkt kein Satzende ist. */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'jr', 'sr', 'vs', 'etc', 'approx',
  'e.g', 'i.e', 'no', 'fig', 'dept', 'inc', 'ltd', 'co',
]);

function hasSentenceSegmenter(): boolean {
  return (
    typeof Intl !== 'undefined' &&
    typeof (Intl as { Segmenter?: unknown }).Segmenter === 'function'
  );
}

/** Fallback ohne `Intl.Segmenter` – bewusst einfach und getestet. */
export function segmentSentencesFallback(text: string): TextSentence[] {
  const sentences: TextSentence[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char !== '.' && char !== '!' && char !== '?' && char !== '…') continue;

    // Auf mehrfache Endzeichen ("?!") aufschließen.
    let end = i + 1;
    while (end < text.length && '.!?…'.includes(text[end] as string)) end += 1;
    // Schließende Anführungszeichen und Klammern gehören noch zum Satz.
    while (end < text.length && `"')]»“”`.includes(text[end] as string)) end += 1;

    const rest = text.slice(end);
    // Satzende nur, wenn Leerraum (oder Textende) folgt.
    if (rest.length > 0 && !/^\s/.test(rest)) continue;

    if (char === '.') {
      const before = text.slice(start, i);
      const lastWord = /([\p{L}.]+)$/u.exec(before)?.[1]?.toLowerCase() ?? '';
      if (ABBREVIATIONS.has(lastWord.replace(/\.$/, ''))) continue;
      // Einzelbuchstabe + Punkt ist meist eine Initiale.
      if (/(^|\s)\p{Lu}$/u.test(before)) continue;
    }

    pushSentence(sentences, text, start, end);
    start = end;
    i = end - 1;
  }

  pushSentence(sentences, text, start, text.length);
  return sentences;
}

function pushSentence(target: TextSentence[], text: string, from: number, to: number): void {
  const raw = text.slice(from, to);
  const leading = raw.length - raw.trimStart().length;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return;
  target.push({ index: target.length, text: trimmed, start: from + leading });
}

/** Nutzt `Intl.Segmenter`, wenn vorhanden, sonst den getesteten Fallback. */
export function segmentSentences(text: string): TextSentence[] {
  if (!hasSentenceSegmenter()) return segmentSentencesFallback(text);

  try {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const sentences: TextSentence[] = [];
    for (const segment of segmenter.segment(text)) {
      pushSentence(sentences, text, segment.index, segment.index + segment.segment.length);
    }
    return sentences;
  } catch {
    /* c8 ignore next */
    return segmentSentencesFallback(text);
  }
}

// ---------------------------------------------------------------------------
// Wortsegmentierung
// ---------------------------------------------------------------------------

export interface WordToken {
  /** Originalschreibung. */
  text: string;
  /** Offset innerhalb des übergebenen Satzes. */
  offset: number;
}

const APOSTROPHES = new Set(["'", '’', 'ʼ']);
const INNER_HYPHENS = new Set(['-', '‐', '‑']);

/** Fallback-Tokenizer: Buchstabenfolgen, innen verbunden durch ' oder -. */
export function segmentWordsFallback(sentence: string): WordToken[] {
  const pattern = /\p{L}[\p{L}\p{M}]*(?:['’ʼ\-‐‑]\p{L}[\p{L}\p{M}]*)*/gu;
  const tokens: WordToken[] = [];
  for (const match of sentence.matchAll(pattern)) {
    if (match.index === undefined) continue;
    tokens.push({ text: match[0], offset: match.index });
  }
  return tokens;
}

/**
 * Nutzt `Intl.Segmenter` (Wortgranularität) und fügt Teile wieder zusammen,
 * die durch Apostroph oder Bindestrich verbunden sind: ICU zerlegt
 * „well-known“ in drei Segmente, als Vokabel ist es aber ein Eintrag.
 */
export function segmentWords(sentence: string): WordToken[] {
  if (!hasSentenceSegmenter()) return segmentWordsFallback(sentence);

  let segments: Array<{ segment: string; index: number; isWordLike?: boolean }>;
  try {
    const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
    segments = [...segmenter.segment(sentence)];
  } catch {
    /* c8 ignore next */
    return segmentWordsFallback(sentence);
  }

  const tokens: WordToken[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const current = segments[i];
    if (!current?.isWordLike) continue;
    if (!/\p{L}/u.test(current.segment)) continue; // reine Zahlen überspringen

    let text = current.segment;
    let cursor = i;
    // Verbindungszeichen plus folgendes Wort anhängen, solange es passt.
    while (cursor + 2 < segments.length) {
      const joiner = segments[cursor + 1];
      const next = segments[cursor + 2];
      const isJoiner =
        joiner !== undefined &&
        joiner.segment.length === 1 &&
        (APOSTROPHES.has(joiner.segment) || INNER_HYPHENS.has(joiner.segment));
      if (!isJoiner || !next?.isWordLike || !/\p{L}/u.test(next.segment)) break;
      text += joiner.segment + next.segment;
      cursor += 2;
    }

    tokens.push({ text, offset: current.index });
    i = cursor;
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Kandidaten
// ---------------------------------------------------------------------------

const URL_PATTERN = /(?:https?:\/\/|www\.)\S+|\S+@\S+\.\p{L}{2,}/giu;

/** Ersetzt URLs und E-Mail-Adressen längentreu, damit Offsets stimmen. */
function maskUrls(sentence: string): string {
  return sentence.replace(URL_PATTERN, (match) => ' '.repeat(match.length));
}

export function normalizeToken(token: string): string {
  return token
    .normalize('NFC')
    .replace(/[’ʼ]/g, "'")
    .replace(/[‐‑]/g, '-')
    .toLowerCase();
}

interface Accumulator {
  normalized: string;
  occurrences: number;
  firstOccurrence: number;
  sentenceIndex: number;
  sourceSentence: string;
  /** Anzeigeform: erste Fundstelle, die nicht am Satzanfang steht. */
  display: string;
  displayFromMidSentence: boolean;
  capitalizedEverywhere: boolean;
  seenMidSentence: boolean;
}

function isCapitalized(token: string): boolean {
  const first = token[0] ?? '';
  return first !== first.toLowerCase() && first === first.toUpperCase();
}

/**
 * Extrahiert Vokabelkandidaten. Dubletten werden case-insensitiv
 * zusammengeführt; gezählt werden alle Fundstellen.
 */
export function extractTextCandidates(
  text: string,
  options: ExtractOptions = {},
): TextCandidate[] {
  if (text.length > MAX_TEXT_LENGTH) throw new TextTooLongError(text.length);

  const {
    includeStopwords = false,
    includeProperNouns = false,
    minLength = 2,
    sort = 'text-order',
    signal,
  } = options;

  const accumulators = new Map<string, Accumulator>();

  for (const sentence of segmentSentences(text)) {
    if (signal?.aborted) throw new AnalysisAbortedError();

    const searchable = maskUrls(sentence.text);
    const tokens = segmentWords(searchable);

    tokens.forEach((token, tokenIndex) => {
      const normalized = normalizeToken(token.text);
      if (normalized.length < minLength) return;
      if (!/\p{L}/u.test(normalized)) return;

      const midSentence = tokenIndex > 0;
      const capitalized = isCapitalized(token.text);
      const existing = accumulators.get(normalized);

      if (!existing) {
        accumulators.set(normalized, {
          normalized,
          occurrences: 1,
          firstOccurrence: sentence.start + token.offset,
          sentenceIndex: sentence.index,
          sourceSentence: sentence.text,
          display: token.text,
          displayFromMidSentence: midSentence,
          capitalizedEverywhere: capitalized,
          seenMidSentence: midSentence,
        });
        return;
      }

      existing.occurrences += 1;
      existing.capitalizedEverywhere = existing.capitalizedEverywhere && capitalized;
      existing.seenMidSentence = existing.seenMidSentence || midSentence;
      // Eine Fundstelle mitten im Satz zeigt die echte Schreibweise.
      if (midSentence && !existing.displayFromMidSentence) {
        existing.display = token.text;
        existing.displayFromMidSentence = true;
      }
    });
  }

  const candidates: TextCandidate[] = [];
  for (const item of accumulators.values()) {
    const isLikelyProperNoun = item.capitalizedEverywhere && item.seenMidSentence;
    if (!includeStopwords && ENGLISH_STOPWORDS.has(item.normalized)) continue;
    if (!includeProperNouns && isLikelyProperNoun) continue;

    candidates.push({
      id: `text:${item.normalized}`,
      english: item.display,
      normalizedEnglish: item.normalized,
      occurrences: item.occurrences,
      firstOccurrence: item.firstOccurrence,
      sourceSentence: item.sourceSentence,
      sentenceIndex: item.sentenceIndex,
      isLikelyProperNoun,
    });
  }

  return sortCandidates(candidates, sort);
}

/** Stabile, deterministische Sortierung. */
export function sortCandidates(
  candidates: readonly TextCandidate[],
  sort: CandidateSort,
): TextCandidate[] {
  const copy = [...candidates];
  if (sort === 'frequency') {
    copy.sort(
      (a, b) =>
        b.occurrences - a.occurrences ||
        a.firstOccurrence - b.firstOccurrence ||
        a.normalizedEnglish.localeCompare(b.normalizedEnglish),
    );
  } else {
    copy.sort(
      (a, b) =>
        a.firstOccurrence - b.firstOccurrence ||
        a.normalizedEnglish.localeCompare(b.normalizedEnglish),
    );
  }
  return copy;
}

export interface TextAnalysis {
  candidates: TextCandidate[];
  sentenceCount: number;
  /** Alle erkannten Wortformen, auch ausgeblendete. */
  tokenCount: number;
  hiddenStopwords: number;
  hiddenProperNouns: number;
}

/** Analyse inklusive der Zahlen, die die Oberfläche erklärt. */
export function analyzeText(text: string, options: ExtractOptions = {}): TextAnalysis {
  const all = extractTextCandidates(text, {
    ...options,
    includeStopwords: true,
    includeProperNouns: true,
  });
  const candidates = extractTextCandidates(text, options);
  const visible = new Set(candidates.map((candidate) => candidate.id));

  let hiddenStopwords = 0;
  let hiddenProperNouns = 0;
  for (const candidate of all) {
    if (visible.has(candidate.id)) continue;
    if (candidate.isLikelyProperNoun && options.includeProperNouns !== true) hiddenProperNouns += 1;
    else hiddenStopwords += 1;
  }

  return {
    candidates,
    sentenceCount: segmentSentences(text).length,
    tokenCount: all.reduce((sum, candidate) => sum + candidate.occurrences, 0),
    hiddenStopwords,
    hiddenProperNouns,
  };
}
