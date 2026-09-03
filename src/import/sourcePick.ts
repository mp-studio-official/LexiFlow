import {
  normalizeToken,
  segmentSentences,
  type TextCandidate,
  type TextSentence,
} from '../domain/textExtraction';
import { candidateFormIndex, type SourceToken } from './sourceTokens';

/**
 * Ein Wort oder eine Wortgruppe aus dem Quelltext aufnehmen.
 *
 * ## Wozu
 *
 * Die Empfehlung schlägt vor, was der Text häufig und passend hergibt. Sie
 * kennt aber nicht den Unterrichtsplan. Wer den Text liest und dabei denkt
 * „das brauchen sie auch“, soll das Wort dort aufnehmen können, wo es steht –
 * mit seiner Fundstelle und seinem Satz, nicht als leere Zeile.
 *
 * Mehrteilige Wendungen sind der eigentliche Grund für dieses Modul.
 * `depend on`, `single out`, `to coin a phrase`: Ein Klick auf ein einzelnes
 * Wort deckt sie nicht ab, und die Analyse findet nur, was mehrfach beieinander
 * steht. Markieren löst beides.
 *
 * ## Was hier nicht passiert
 *
 * Es wird nicht geraten. Dieses Modul erfindet keine Grundform, keine
 * Übersetzung und keine Wortart. Es liefert einen Kandidaten mit Beleg – alles
 * Weitere macht die Kette, die auch jede Empfehlung durchläuft
 * (`proposeLearningForm`, Wörterbuch, `applyDictionaryDefaults`). Zwei Wege in
 * dieselbe Liste dürfen nicht zu zwei Sorten Vokabeln führen.
 */

/** Was beim Aufnehmen herauskommt. */
export type SourcePick =
  /** Es gibt schon eine Zeile – dorthin springen, nicht verdoppeln. */
  | { kind: 'existing'; candidateId: string }
  /** Neu: ein Kandidat mit Fundstelle und Satz. */
  | { kind: 'new'; candidate: TextCandidate }
  /** Nichts Brauchbares markiert. */
  | { kind: 'rejected'; reason: string };

export interface PickRequest {
  /** Der Text, wie er in Schritt 1 eingefügt wurde. */
  sourceText: string;
  /** Die Stücke aus `tokenizeSource` – dieselbe Zerlegung, die angezeigt wird. */
  tokens: readonly SourceToken[];
  /** Erster und letzter markierter Token (Index in `tokens`, einschließlich). */
  from: number;
  to: number;
  /** Alle bekannten Kandidaten – gegen sie wird auf Dubletten geprüft. */
  candidates: readonly TextCandidate[];
  /** Sätze des Quelltextes; wird sonst hier berechnet. */
  sentences?: readonly TextSentence[];
}

/**
 * Der Satz, in dem ein Zeichenoffset liegt.
 *
 * Der Beispielsatz steht in der Vokabel und wird später zum Lückentext. Er
 * muss deshalb der Satz der **markierten** Fundstelle sein und nicht der
 * irgendeiner anderen: Wer `depend on` in Satz sieben markiert, prüft den Beleg
 * aus Satz sieben.
 */
function sentenceAt(
  sentences: readonly TextSentence[],
  offset: number,
): TextSentence | undefined {
  let found: TextSentence | undefined;
  for (const sentence of sentences) {
    if (sentence.start <= offset) found = sentence;
    else break;
  }
  return found;
}

/**
 * Alle Fundstellen einer Wortfolge – über die Zerlegung, nicht über `indexOf`.
 *
 * `indexOf` fände `on` in `only` und `depend on` nicht über einen Zeilenumbruch
 * hinweg. Die Zerlegung kennt beide Grenzen bereits.
 */
function occurrences(
  tokens: readonly SourceToken[],
  words: readonly string[],
): SourceToken[][] {
  const found: SourceToken[][] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const run: SourceToken[] = [];
    let cursor = index;
    let matched = true;

    for (const [position, word] of words.entries()) {
      if (position > 0) {
        const gap = tokens[cursor];
        if (!gap || gap.isWord || !/^\s+$/.test(gap.text)) {
          matched = false;
          break;
        }
        cursor += 1;
      }
      const token = tokens[cursor];
      if (!token || !token.isWord || normalizeToken(token.text) !== word) {
        matched = false;
        break;
      }
      run.push(token);
      cursor += 1;
    }

    if (matched && run.length === words.length) found.push(run);
  }

  return found;
}

/**
 * Die Anzeigeform: so, wie das Wort im Text steht – mit einer Ausnahme.
 *
 * Steht dasselbe Wort **im selben Text** auch mitten im Satz, ist dessen
 * Schreibung die belegte. `Litter` am Satzanfang und `litter` in Satz drei
 * heißt: die Vokabel ist `litter`, und das ist keine Vermutung, sondern eine
 * Fundstelle.
 *
 * Fehlt dieser Beleg, bleibt die Großschreibung stehen. Ein Wort, das nur am
 * Satzanfang vorkommt, klein zu schreiben, wäre geraten – und bei `London`
 * falsch.
 */
function displayForm(
  picked: readonly SourceToken[],
  all: readonly SourceToken[][],
  sentences: readonly TextSentence[],
): string {
  const literal = picked.map((token) => token.text).join(' ');
  if (literal === literal.toLowerCase()) return literal;

  for (const run of all) {
    const first = run[0];
    if (!first) continue;
    // Mitten im Satz heißt: nicht auf dem ersten Zeichen des Satzes. Nur dort
    // sagt die Großschreibung nichts über das Wort aus.
    const sentence = sentenceAt(sentences, first.start);
    if (sentence && sentence.start === first.start) continue;
    const text = run.map((token) => token.text).join(' ');
    if (text !== literal) return text;
  }

  return literal;
}

/**
 * Großgeschrieben an jeder Fundstelle, die nicht am Satzanfang steht?
 *
 * Dieselbe Heuristik wie in der Analyse. Sie entscheidet nichts allein: Ein
 * vermuteter Eigenname bekommt in der Zeile einen Hinweis, wird aber nicht
 * abgelehnt.
 */
function looksLikeProperNoun(
  runs: readonly SourceToken[][],
  sentences: readonly TextSentence[],
): boolean {
  let midSentence = 0;
  let capitalized = 0;

  for (const run of runs) {
    const first = run[0];
    if (!first) continue;
    const sentence = sentenceAt(sentences, first.start);
    if (sentence && sentence.start === first.start) continue;
    midSentence += 1;
    const initial = first.text[0] ?? '';
    if (initial !== initial.toLowerCase()) capitalized += 1;
  }

  return midSentence > 0 && capitalized === midSentence;
}

/**
 * Die Entscheidung: vorhanden, neu oder nichts.
 *
 * Die Dublettenprüfung läuft über **dieselbe** Zuordnung, die den Text
 * markiert (`candidateFormIndex`). Damit gilt: Was im Text als „schon dabei“
 * markiert ist, führt beim Klicken zur vorhandenen Zeile – und was nicht
 * markiert ist, legt eine an. Ein Auseinanderfallen dieser beiden Aussagen
 * wäre der Fehler, den niemand mehr erklären kann.
 */
export function pickFromSource(request: PickRequest): SourcePick {
  const { sourceText, tokens, candidates } = request;
  const from = Math.min(request.from, request.to);
  const to = Math.max(request.from, request.to);

  const picked = tokens.slice(from, to + 1).filter((token) => token.isWord);
  if (picked.length === 0) return { kind: 'rejected', reason: 'Kein Wort markiert.' };

  const words = picked.map((token) => normalizeToken(token.text));
  const normalized = words.join(' ');

  /*
    Zuerst die vorhandenen Zeilen – auch für Wortgruppen.

    Ein markiertes `single out` muss zur Zeile `single out` führen, wenn es sie
    gibt, und nicht zu einer zweiten. Für Einzelwörter zieht zusätzlich die
    Formenzuordnung: `islands` gehört zu `island`.
  */
  const direct = candidates.find((candidate) => candidate.normalizedEnglish === normalized);
  if (direct) return { kind: 'existing', candidateId: direct.id };

  if (picked.length === 1) {
    const known = candidateFormIndex(candidates).get(normalized);
    if (known) return { kind: 'existing', candidateId: known };
  }

  const sentences = request.sentences ?? segmentSentences(sourceText);
  const first = picked[0];
  if (!first) return { kind: 'rejected', reason: 'Kein Wort markiert.' };

  const runs = occurrences(tokens, words);
  const sentence = sentenceAt(sentences, first.start);

  return {
    kind: 'new',
    candidate: {
      id: `text:pick:${normalized.replace(/\s+/g, '_')}`,
      english: displayForm(picked, runs, sentences),
      normalizedEnglish: normalized,
      occurrences: Math.max(runs.length, 1),
      firstOccurrence: first.start,
      sourceSentence: sentence?.text ?? sourceText.trim(),
      sentenceIndex: sentence?.index ?? 0,
      isLikelyProperNoun: looksLikeProperNoun(runs, sentences),
      forms: [
        {
          display: picked.map((token) => token.text).join(' '),
          normalized,
          occurrences: Math.max(runs.length, 1),
          firstOccurrence: first.start,
          relation: 'base',
          sourceSentence: sentence?.text ?? sourceText.trim(),
        },
      ],
      literal: picked.map((token) => token.text).join(' '),
    },
  };
}

/**
 * Wie die Markierung heißt, wenn man sie ansagen muss.
 *
 * Getrennt von `pickFromSource`, weil die Ansage auch für eine Markierung
 * gebraucht wird, die noch niemand aufgenommen hat – beim Erweitern mit
 * Umschalt und Pfeiltaste steht sie nach jedem Tastendruck neu da.
 */
export function describeSelection(tokens: readonly SourceToken[], from: number, to: number): string {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return tokens
    .slice(start, end + 1)
    .filter((token) => token.isWord)
    .map((token) => token.text)
    .join(' ');
}
