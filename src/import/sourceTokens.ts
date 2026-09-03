import type { TextCandidate } from '../domain/textExtraction';

/**
 * Den Quelltext in anklickbare Stücke zerlegen.
 *
 * ## Wozu
 *
 * Links in der Werkbank steht der analysierte Text. Bisher war er reiner
 * Lesestoff. Er weiß aber mehr, als er zeigt: Zu jedem gefundenen Wort gibt es
 * einen Kandidaten, und zu jedem Kandidaten steht rechts eine Zeile – oder
 * eben nicht.
 *
 * Sichtbar zu machen, **welche** Wörter schon aufgenommen sind, und ein Wort
 * mit einem Klick dazuzunehmen, macht aus dem Text ein Werkzeug. Wer den Text
 * liest und dabei denkt „das brauchen sie auch“, soll es nicht in einer
 * Zwanzigerliste rechts wiederfinden müssen.
 *
 * ## Warum das hier steht und nicht in der Ansicht
 *
 * Das Zerlegen ist die ganze Schwierigkeit: Wortgrenzen, Bindestriche,
 * Apostrophe, Groß-/Kleinschreibung und die Zuordnung gebeugter Formen zu
 * ihrem Kandidaten. Das lässt sich prüfen, ohne etwas zu rendern – und ohne
 * Prüfung wäre es eine Sammlung von Sonderfällen, die beim nächsten Text
 * anders aussieht.
 *
 * ## Was hier ausdrücklich nicht passiert
 *
 * Es wird nichts erkannt, was die Analyse nicht schon gefunden hat. Dieses
 * Modul **ordnet zu**, es analysiert nicht: Ein Wort ohne Kandidaten bleibt
 * gewöhnlicher Text. Eine zweite, eigene Worterkennung neben
 * `textExtraction.ts` wäre eine zweite Wahrheit.
 */

export interface SourceToken {
  /** Der Text genau so, wie er im Quelltext steht. */
  text: string;
  /** Zeichenoffset des ersten Zeichens im Quelltext. */
  start: number;
  /**
   * Wort oder Zwischenraum?
   *
   * Nur Wörter sind ansteuerbar. Der Unterschied steht hier und wird nicht in
   * der Ansicht neu berechnet: Sonst gäbe es zwei Vorstellungen davon, was ein
   * Wort ist, und die Tastaturbedienung liefe an einer davon vorbei.
   */
  isWord: boolean;
  /**
   * Der Kandidat, zu dem dieses Wort gehört – falls es einen gibt.
   *
   * Auch gebeugte Formen zeigen auf ihren Kandidaten: `islands` gehört zu
   * `island`, weil die Analyse beide zu einer Familie zusammengefasst hat.
   */
  candidateId?: string;
}

/**
 * Wortzeichen im Sinne dieses Moduls.
 *
 * Buchstaben, Ziffern, Apostroph und Bindestrich – `don't` und `well-known`
 * sind **ein** Wort. Wer am Apostroph trennte, bekäme `don` und `t`, und beide
 * stünden in keinem Wörterbuch.
 *
 * Der Unicode-Eigenschaftsausdruck statt `\w`: `\w` kennt kein `é` und kein
 * `ü`, und ein englischer Text zitiert durchaus einmal einen Namen.
 */
const WORD_CHARACTER = /[\p{L}\p{N}'’-]/u;

/**
 * Die Zuordnung Wortform → Kandidat, kleingeschrieben.
 *
 * Auch außerhalb der Anzeige gebraucht: Wer ein Wort im Text anklickt, muss
 * erfahren, ob es schon eine Zeile dafür gibt – und zwar nach **derselben**
 * Regel, nach der das Wort markiert ist. Zwei Regeln hieße: markiert, aber
 * beim Klicken doppelt angelegt.
 */
export function candidateFormIndex(candidates: readonly TextCandidate[]): Map<string, string> {
  const index = new Map<string, string>();

  for (const candidate of candidates) {
    /*
      Zuerst die beobachteten Formen, dann das Stichwort.

      Die Reihenfolge ist wichtig, wenn zwei Kandidaten dieselbe Form
      beanspruchen: Der erste Eintrag gewinnt, und das ist der frühere
      Kandidat in der Liste. Ein zufälliger Gewinner wäre schlimmer als ein
      erklärbarer.
    */
    const keys = [
      candidate.normalizedEnglish,
      ...(candidate.forms ?? []).map((form) => form.normalized),
      ...(candidate.literal ? [candidate.literal.toLowerCase()] : []),
    ];

    for (const key of keys) {
      const normalized = key.trim().toLowerCase();
      if (normalized && !index.has(normalized)) index.set(normalized, candidate.id);
    }
  }

  return index;
}

/**
 * Zerlegt den Text in Wörter und Zwischenräume und hängt an jedes Wort den
 * Kandidaten, zu dem es gehört.
 *
 * Die Stücke zusammengesetzt ergeben **exakt** den Eingabetext – kein Zeichen
 * geht verloren und keines kommt hinzu. Das ist die Zusage, an der ein
 * Anzeigetext steht oder fällt: Wer ihn liest, soll den Text lesen, den er
 * eingefügt hat.
 */
export function tokenizeSource(
  text: string,
  candidates: readonly TextCandidate[],
): SourceToken[] {
  if (!text) return [];

  const index = candidateFormIndex(candidates);
  const tokens: SourceToken[] = [];

  let buffer = '';
  let bufferIsWord = false;
  let bufferStart = 0;
  let offset = 0;

  const flush = (): void => {
    if (!buffer) return;
    const id = bufferIsWord ? index.get(buffer.toLowerCase()) : undefined;
    const token: SourceToken = { text: buffer, start: bufferStart, isWord: bufferIsWord };
    tokens.push(id ? { ...token, candidateId: id } : token);
    buffer = '';
  };

  for (const character of text) {
    const isWord = WORD_CHARACTER.test(character);
    if (isWord !== bufferIsWord) {
      flush();
      bufferIsWord = isWord;
      bufferStart = offset;
    }
    buffer += character;
    offset += character.length;
  }
  flush();

  return tokens;
}

/**
 * Mehrwortbegriffe zusammenfassen: `sea wall` ist **ein** Kandidat.
 *
 * `tokenizeSource` arbeitet Zeichen für Zeichen und sieht deshalb nur einzelne
 * Wörter. Ein Kandidat aus mehreren Wörtern bliebe damit unmarkiert – oder,
 * schlimmer, seine Bestandteile zeigten auf andere Kandidaten.
 *
 * Zusammengefasst wird nur, was **genau** so im Text steht; geraten wird
 * nichts. Bleibt eine Lücke, bleibt sie.
 */
export function mergeMultiwordTokens(
  tokens: readonly SourceToken[],
  candidates: readonly TextCandidate[],
): SourceToken[] {
  const multiword = candidates.filter((candidate) => candidate.english.includes(' '));
  if (multiword.length === 0) return [...tokens];

  // Längste zuerst: `sea wall defence` vor `sea wall`.
  const phrases = multiword
    .map((candidate) => ({
      id: candidate.id,
      words: candidate.normalizedEnglish.split(' ').filter(Boolean),
    }))
    .filter((phrase) => phrase.words.length > 1)
    .sort((a, b) => b.words.length - a.words.length);

  const result: SourceToken[] = [];
  let index = 0;

  outer: while (index < tokens.length) {
    for (const phrase of phrases) {
      const span = matchPhrase(tokens, index, phrase.words);
      if (span > 0) {
        result.push({
          text: tokens
            .slice(index, index + span)
            .map((token) => token.text)
            .join(''),
          start: tokens[index]?.start ?? 0,
          isWord: true,
          candidateId: phrase.id,
        });
        index += span;
        continue outer;
      }
    }
    const token = tokens[index];
    if (token) result.push(token);
    index += 1;
  }

  return result;
}

/**
 * Passt die Wortfolge ab `start`? Gibt die Zahl der verbrauchten Stücke
 * zurück, sonst 0.
 *
 * Zwischen den Wörtern darf nur Zwischenraum stehen – „sea, wall“ ist kein
 * `sea wall`.
 */
function matchPhrase(
  tokens: readonly SourceToken[],
  start: number,
  words: readonly string[],
): number {
  let cursor = start;
  for (const [position, word] of words.entries()) {
    if (position > 0) {
      const gap = tokens[cursor];
      if (!gap || !/^\s+$/.test(gap.text)) return 0;
      cursor += 1;
    }
    const token = tokens[cursor];
    if (!token || token.text.toLowerCase() !== word) return 0;
    cursor += 1;
  }
  return cursor - start;
}
