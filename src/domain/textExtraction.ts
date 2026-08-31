import { ENGLISH_STOPWORDS } from './stopwords';
import {
  describeAbbreviation,
  findAbbreviations,
  maskEditorialMarkers,
  type AbbreviationSuggestion,
} from './abbreviations';
import {
  buildFamilies,
  describeForms,
  describeInflections,
  type FamilyForm,
  type FormObservation,
} from './wordForms';

/**
 * Lokale Textanalyse: aus einem englischen Text Vokabelkandidaten gewinnen.
 *
 * Die Funktion ist rein, deterministisch und ohne jeden Netzwerkzugriff. Sie
 * erfindet nichts: keine Übersetzung, keine Wortart, keine GeR-Stufe. Der
 * Beispielsatz stammt exakt aus dem Quelltext.
 *
 * Die Reihenfolge ist seit Sprint 3B.1 festgelegt und steht bewusst als Kette
 * in `extractTextCandidates`:
 *
 * 1. Tokens und Wendungen bestimmen
 * 2. Wortformen zu lexikalischen Familien gruppieren
 * 3. Abkürzungen im Kontext auflösen
 * 4. unbrauchbare Textreste entfernen oder kennzeichnen
 * 5. Kandidaten sortieren
 * 6. **erst danach** auf die gewünschte Anzahl begrenzen (in `limitCandidates`)
 *
 * Der Grund für diese Reihenfolge ist ein handfester Fehler: Wer zuerst
 * begrenzt, füllt die Liste mit `sq`, `mi` und `islands` und verdrängt damit
 * genau die Wörter, wegen derer die Lehrkraft den Text überhaupt eingefügt hat.
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

/** Was eine Abkürzung zum Kandidaten beiträgt. */
export interface CandidateAbbreviation {
  /** Wie sie im Text steht, z. B. „sq mi“. */
  abbreviation: string;
  /** Aufgelöste Langform; fehlt, wenn das Lexikon sie nicht kennt. */
  longForm?: string;
  /** Vorgeschlagene deutsche Entsprechung; leer, wenn keine eindeutige existiert. */
  german: string;
  /** Hinweis für die Lehrkraft – bei Unbekanntem „Abkürzung – Langform prüfen“. */
  hint: string;
  resolved: boolean;
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
  /**
   * Alle im Text beobachteten Formen dieses Wortes, häufigste zuerst.
   *
   * Optional, damit Bestandscode und Testdaten ohne Wortformen gültig bleiben.
   */
  forms?: readonly FamilyForm[];
  /** Die Form, die im Beispielsatz steht – maßgeblich für Lückentexte. */
  literal?: string;
  /** Gesetzt, wenn dieser Kandidat aus einer Abkürzung entstanden ist. */
  abbreviation?: CandidateAbbreviation;
}

/** „Im Text: island, islands · insgesamt 18-mal“ – für die Review-Oberfläche. */
export function describeCandidateForms(candidate: TextCandidate): string {
  const forms = candidate.forms ?? [];
  if (forms.length === 0) {
    return `Im Text: ${candidate.english} · insgesamt ${candidate.occurrences}-mal`;
  }
  return describeForms({ forms, occurrences: candidate.occurrences });
}

/** „Plural: islands“ – leer, wenn nur die Grundform im Text stand. */
export function describeCandidateInflections(candidate: TextCandidate): string[] {
  const forms = candidate.forms ?? [];
  return forms.length === 0 ? [] : describeInflections({ forms });
}

/** Die Form, die im Beispielsatz steht – Rückfallebene ist das Stichwort. */
export function candidateLiteral(candidate: TextCandidate): string {
  return candidate.literal ?? candidate.english;
}

/**
 * Taugt der Kandidat ohne Nacharbeit als Vokabel?
 *
 * Eine ungeklärte Abkürzung taugt das nicht – sie bleibt in der Liste, damit
 * die Lehrkraft sie sieht, darf aber kein gutes Wort verdrängen.
 */
export function isUsableCandidate(candidate: TextCandidate): boolean {
  return candidate.abbreviation === undefined || candidate.abbreviation.resolved;
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

/** Eine im Text gefundene Abkürzung, über alle Sätze hinweg gezählt. */
interface AbbreviationAccumulator {
  normalized: string;
  suggestion: AbbreviationSuggestion;
  occurrences: number;
  firstOccurrence: number;
  sentenceIndex: number;
  sourceSentence: string;
}

/** Blendet einen Bereich längentreu aus, damit alle Offsets gültig bleiben. */
function blank(value: string, offset: number, length: number): string {
  return value.slice(0, offset) + ' '.repeat(length) + value.slice(offset + length);
}

/**
 * Extrahiert Vokabelkandidaten. Formen desselben Wortes werden zu einer
 * Familie zusammengeführt; gezählt werden alle Fundstellen.
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
  const abbreviations = new Map<string, AbbreviationAccumulator>();

  for (const sentence of segmentSentences(text)) {
    if (signal?.aborted) throw new AnalysisAbortedError();

    // Schritt 4 (vorgezogen, weil längentreu): URLs und redaktionelle Reste
    // aus Wikipedia dürfen gar nicht erst zu Tokens werden.
    let searchable = maskUrls(maskEditorialMarkers(sentence.text));

    // Schritt 3: Abkürzungen im Kontext. Sie werden als eigener Kandidat
    // gezählt und aus dem Satz ausgeblendet – sonst blieben `sq` und `mi`
    // als sinnlose Bruchstücke übrig.
    for (const match of findAbbreviations(searchable)) {
      const existing = abbreviations.get(match.normalized);
      if (existing) {
        existing.occurrences += 1;
      } else {
        abbreviations.set(match.normalized, {
          normalized: match.normalized,
          suggestion: describeAbbreviation(match),
          occurrences: 1,
          firstOccurrence: sentence.start + match.offset,
          sentenceIndex: sentence.index,
          sourceSentence: sentence.text,
        });
      }
      searchable = blank(searchable, match.offset, match.length);
    }

    // Schritt 1: Tokens und Wendungen.
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

  // Schritt 2: Wortformen zu lexikalischen Familien gruppieren. Erst hier
  // weiß die Analyse, welche Formen der Text überhaupt enthält – und nur mit
  // diesem Wissen darf sie `larger` auf `large` beziehen.
  const observations: FormObservation[] = [...accumulators.values()].map((item) => ({
    normalized: item.normalized,
    display: item.display,
    occurrences: item.occurrences,
    firstOccurrence: item.firstOccurrence,
    sentenceIndex: item.sentenceIndex,
    sourceSentence: item.sourceSentence,
  }));

  const candidates: TextCandidate[] = [];
  for (const family of buildFamilies(observations)) {
    // Schritt 4: aussortieren, was keine Vokabel ist. Eine Familie gilt als
    // Eigenname, wenn *alle* ihre Formen durchgehend großgeschrieben sind.
    const parts = family.forms.map((form) => accumulators.get(form.normalized));
    const isLikelyProperNoun = parts.every(
      (item) => item !== undefined && item.capitalizedEverywhere && item.seenMidSentence,
    );
    const isStopword =
      ENGLISH_STOPWORDS.has(family.lemma) ||
      family.forms.every((form) => ENGLISH_STOPWORDS.has(form.normalized));

    if (!includeStopwords && isStopword) continue;
    if (!includeProperNouns && isLikelyProperNoun) continue;

    // Die Form, die im Beispielsatz steht: die der frühesten Fundstelle.
    const atFirstOccurrence = family.forms.find(
      (form) => form.firstOccurrence === family.firstOccurrence,
    );

    candidates.push({
      id: `text:${family.lemma}`,
      english: family.display,
      normalizedEnglish: family.lemma,
      occurrences: family.occurrences,
      firstOccurrence: family.firstOccurrence,
      sourceSentence: family.sourceSentence,
      sentenceIndex: family.sentenceIndex,
      isLikelyProperNoun,
      forms: family.forms,
      literal: atFirstOccurrence?.display ?? family.display,
    });
  }

  for (const item of abbreviations.values()) {
    if (item.suggestion.literal.length < minLength) continue;
    const { suggestion } = item;
    candidates.push({
      id: `text:abbr:${item.normalized}`,
      english: suggestion.english,
      normalizedEnglish: item.normalized,
      occurrences: item.occurrences,
      firstOccurrence: item.firstOccurrence,
      sourceSentence: item.sourceSentence,
      sentenceIndex: item.sentenceIndex,
      isLikelyProperNoun: false,
      forms: [
        {
          normalized: item.normalized,
          display: suggestion.literal,
          occurrences: item.occurrences,
          relation: 'base',
          firstOccurrence: item.firstOccurrence,
          sourceSentence: item.sourceSentence,
        },
      ],
      literal: suggestion.literal,
      abbreviation: {
        abbreviation: suggestion.literal,
        ...(suggestion.resolved
          ? { longForm: suggestion.english.replace(/\s*\([^()]*\)$/, '') }
          : {}),
        german: suggestion.german,
        hint: suggestion.hint,
        resolved: suggestion.resolved,
      },
    });
  }

  // Schritt 5: sortieren.
  return sortCandidates(candidates, sort);
}

/**
 * Stabile, deterministische Sortierung.
 *
 * `frequency` ist zugleich die Rangfolge für die Begrenzung. Sie stellt
 * ungeklärte Abkürzungen ans Ende: Sie bleiben sichtbar, verdrängen aber kein
 * brauchbares Wort aus den gewünschten zehn Vorschlägen. `text-order` ist reine
 * Anzeigereihenfolge und bewertet nichts.
 */
export function sortCandidates(
  candidates: readonly TextCandidate[],
  sort: CandidateSort,
): TextCandidate[] {
  const copy = [...candidates];
  if (sort === 'frequency') {
    copy.sort(
      (a, b) =>
        Number(isUsableCandidate(b)) - Number(isUsableCandidate(a)) ||
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
