import { describe, expect, it } from 'vitest';
import { mergeMultiwordTokens, tokenizeSource } from './sourceTokens';
import { extractTextCandidates } from '../domain/textExtraction';
import type { TextCandidate } from '../domain/textExtraction';

/**
 * Sprint 4B.4: Der Quelltext als Werkzeug.
 *
 * Die eine Zusage, an der alles hängt: Die Stücke wieder zusammengesetzt
 * ergeben **exakt** den Eingabetext. Wer ihn liest, soll den Text lesen, den
 * er eingefügt hat – kein Zeichen weniger, keines mehr.
 */

/** Ein Kandidat, so knapp wie dieses Modul ihn braucht. */
function candidate(partial: Partial<TextCandidate> & { english: string }): TextCandidate {
  return {
    occurrences: 1,
    firstOccurrence: 0,
    sourceSentence: '',
    sentenceIndex: 0,
    isLikelyProperNoun: false,
    ...partial,
    id: partial.id ?? partial.english,
    english: partial.english,
    normalizedEnglish: partial.normalizedEnglish ?? partial.english.toLowerCase(),
  };
}

/** Der Text, wie er aus den Stücken wieder entsteht. */
function rebuilt(text: string, candidates: readonly TextCandidate[]): string {
  return tokenizeSource(text, candidates)
    .map((token) => token.text)
    .join('');
}

describe('Kein Zeichen geht verloren', () => {
  it.each([
    'The bus was crowded today.',
    'Well-known problems don’t vanish.',
    '  Führende und folgende Leerzeichen  ',
    'Zeilen\numbruch\tund Tabulator',
    '„Typografische Anführungszeichen“ – und Gedankenstriche.',
    '',
  ])('setzt „%s“ unverändert wieder zusammen', (text) => {
    expect(rebuilt(text, [candidate({ english: 'crowded' })])).toBe(text);
  });

  it('gilt auch für einen echten analysierten Text', () => {
    const text =
      'Communities along the shore depend on natural barriers. The barriers endure.';
    expect(rebuilt(text, extractTextCandidates(text))).toBe(text);
  });
});

describe('Die Zuordnung', () => {
  it('findet das Stichwort selbst', () => {
    const tokens = tokenizeSource('The bus was crowded.', [candidate({ english: 'crowded' })]);
    expect(tokens.find((token) => token.text === 'crowded')?.candidateId).toBe('crowded');
  });

  it('achtet nicht auf Groß- und Kleinschreibung', () => {
    const tokens = tokenizeSource('Crowded buses.', [candidate({ english: 'crowded' })]);
    expect(tokens[0]?.candidateId).toBe('crowded');
    // Und die Anzeigeform bleibt die aus dem Text.
    expect(tokens[0]?.text).toBe('Crowded');
  });

  it('findet auch die gebeugte Form über die beobachteten Formen', () => {
    /*
      `islands` gehört zu `island` – nicht, weil dieses Modul das erkennt,
      sondern weil die Analyse beide zu einer Familie zusammengefasst hat.
      Hier wird nur zugeordnet.
    */
    const tokens = tokenizeSource('The islands are famous.', [
      candidate({
        english: 'island',
        forms: [
          { normalized: 'island', display: 'island', occurrences: 1, relation: 'base', firstOccurrence: 0, sourceSentence: '' },
          { normalized: 'islands', display: 'islands', occurrences: 2, relation: 'plural', firstOccurrence: 4, sourceSentence: '' },
        ],
      }),
    ]);
    expect(tokens.find((token) => token.text === 'islands')?.candidateId).toBe('island');
  });

  it('lässt Wörter ohne Kandidaten gewöhnlicher Text bleiben', () => {
    const tokens = tokenizeSource('The bus was crowded.', [candidate({ english: 'crowded' })]);
    expect(tokens.find((token) => token.text === 'bus')?.candidateId).toBeUndefined();
    expect(tokens.find((token) => token.text === 'The')?.candidateId).toBeUndefined();
  });

  it('hält Apostroph und Bindestrich im Wort', () => {
    // Am Apostroph zu trennen ergäbe `don` und `t` – beides steht in keinem
    // Wörterbuch.
    const tokens = tokenizeSource("They don't leave well-known paths.", []);
    const woerter = tokens.filter((token) => /\p{L}/u.test(token.text)).map((t) => t.text);
    expect(woerter).toContain("don't");
    expect(woerter).toContain('well-known');
  });

  it('gibt bei zwei Anwärtern demselben Wort immer denselben Kandidaten', () => {
    // Der erste in der Liste gewinnt. Ein zufälliger Gewinner wäre schlimmer
    // als ein erklärbarer.
    const kandidaten = [candidate({ id: 'a', english: 'lives' }), candidate({ id: 'b', english: 'lives' })];
    expect(tokenizeSource('She lives here.', kandidaten)[2]?.candidateId).toBe('a');
  });
});

describe('Mehrwortbegriffe', () => {
  const seeWall = candidate({ id: 'sw', english: 'sea wall' });

  it('fasst sie zu einem Stück zusammen', () => {
    const tokens = mergeMultiwordTokens(
      tokenizeSource('They build a sea wall.', [seeWall]),
      [seeWall],
    );
    const treffer = tokens.find((token) => token.candidateId === 'sw');
    expect(treffer?.text).toBe('sea wall');
  });

  it('setzt den Text trotzdem unverändert wieder zusammen', () => {
    const text = 'They build a sea wall today.';
    const tokens = mergeMultiwordTokens(tokenizeSource(text, [seeWall]), [seeWall]);
    expect(tokens.map((token) => token.text).join('')).toBe(text);
  });

  it('fasst nichts zusammen, was so nicht dasteht', () => {
    // „sea, wall“ ist kein „sea wall“.
    const tokens = mergeMultiwordTokens(
      tokenizeSource('The sea, wall and sky.', [seeWall]),
      [seeWall],
    );
    expect(tokens.some((token) => token.text === 'sea wall')).toBe(false);
  });

  it('nimmt den längeren Begriff, wenn beide passen', () => {
    const lang = candidate({ id: 'lang', english: 'sea wall defence' });
    const tokens = mergeMultiwordTokens(
      tokenizeSource('A sea wall defence works.', [lang, seeWall]),
      [lang, seeWall],
    );
    expect(tokens.find((token) => token.candidateId === 'lang')?.text).toBe('sea wall defence');
  });

  it('lässt einen Text ohne Mehrwortbegriffe unangetastet', () => {
    const einzeln = [candidate({ english: 'crowded' })];
    const tokens = tokenizeSource('The bus was crowded.', einzeln);
    expect(mergeMultiwordTokens(tokens, einzeln)).toEqual(tokens);
  });
});
