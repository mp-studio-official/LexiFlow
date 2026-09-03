import { describe, expect, it } from 'vitest';

import { extractTextCandidates, segmentSentences } from '../domain/textExtraction';
import { describeSelection, pickFromSource } from './sourcePick';
import { tokenizeSource } from './sourceTokens';

/**
 * Aufnehmen aus dem Quelltext.
 *
 * Die Fälle stehen hier so, wie sie beim Ausprobieren aufgefallen sind: ein
 * Wort, eine Wendung, ein schon vorhandenes Wort, eine gebeugte Form. Jeder
 * einzelne hat eine Antwort, die sich begründen lässt – „macht irgendetwas“
 * ist bei einer Vokabel, die später jemand lernt, keine.
 */

const TEXT =
  'Islands depend on tourism. The islands are small. Litter covers the quiet street. ' +
  'The mayor promised to single out the worst offenders. Later the mayor left.';

function workbench(text: string = TEXT) {
  const candidates = extractTextCandidates(text);
  const tokens = tokenizeSource(text, candidates);
  const sentences = segmentSentences(text);
  return { text, candidates, tokens, sentences };
}

/** Den Index des n-ten Vorkommens eines Wortes finden. */
function at(tokens: ReturnType<typeof tokenizeSource>, word: string, nth = 0): number {
  let seen = -1;
  for (const [index, token] of tokens.entries()) {
    if (token.isWord && token.text.toLowerCase() === word.toLowerCase()) {
      seen += 1;
      if (seen === nth) return index;
    }
  }
  throw new Error(`„${word}“ steht nicht im Text.`);
}

describe('Zerlegung trägt Fundstelle und Wortgrenze', () => {
  it('gibt jedem Stück seinen Offset im Quelltext', () => {
    const { text, tokens } = workbench();
    for (const token of tokens) {
      expect(text.slice(token.start, token.start + token.text.length)).toBe(token.text);
    }
  });

  it('setzt zusammen wieder exakt den Eingabetext', () => {
    const { text, tokens } = workbench();
    expect(tokens.map((token) => token.text).join('')).toBe(text);
  });
});

describe('Ein Wort aufnehmen', () => {
  it('führt zur vorhandenen Zeile, statt eine zweite anzulegen', () => {
    const { tokens, candidates, text } = workbench();
    const index = at(tokens, 'tourism');
    const result = pickFromSource({ sourceText: text, tokens, from: index, to: index, candidates });

    expect(result.kind).toBe('existing');
    if (result.kind !== 'existing') return;
    expect(candidates.find((candidate) => candidate.id === result.candidateId)?.normalizedEnglish).toBe(
      'tourism',
    );
  });

  it('erkennt die gebeugte Form als dieselbe Vokabel', () => {
    /*
      `islands` und `Islands` gehören zu `island`. Wer die Pluralform anklickt,
      darf keine zweite Vokabel bekommen – die Lerngruppe lernte sonst dasselbe
      Wort zweimal, einmal falsch flektiert.
    */
    const { tokens, candidates, text } = workbench();
    const index = at(tokens, 'islands', 1);
    const result = pickFromSource({ sourceText: text, tokens, from: index, to: index, candidates });

    expect(result.kind).toBe('existing');
  });

  it('nimmt ein noch unbekanntes Wort mit Fundstelle und Satz auf', () => {
    const { tokens, text, sentences } = workbench();
    // Ohne Kandidaten: der Fall „die Analyse hat es nicht vorgeschlagen“.
    const index = at(tokens, 'offenders');
    const result = pickFromSource({
      sourceText: text,
      tokens,
      from: index,
      to: index,
      candidates: [],
      sentences,
    });

    expect(result.kind).toBe('new');
    if (result.kind !== 'new') return;
    expect(result.candidate.english).toBe('offenders');
    expect(result.candidate.sourceSentence).toContain('single out');
    // Der Satz der Fundstelle, nicht der erste Satz des Textes.
    expect(result.candidate.sourceSentence).not.toContain('Islands depend');
  });
});

describe('Groß- und Kleinschreibung', () => {
  it('nimmt die belegte Kleinschreibung, wenn sie im Text steht', () => {
    /*
      `Litter` steht am Satzanfang. Gäbe es sonst nichts, bliebe es groß.
      Hier steht `litter` aber mitten in einem anderen Satz – das ist ein Beleg,
      keine Vermutung.
    */
    const text = 'Litter covers the street. The wind spreads litter everywhere.';
    const { tokens, sentences } = workbench(text);
    const index = at(tokens, 'Litter');
    const result = pickFromSource({
      sourceText: text,
      tokens,
      from: index,
      to: index,
      candidates: [],
      sentences,
    });

    expect(result.kind).toBe('new');
    if (result.kind !== 'new') return;
    expect(result.candidate.english).toBe('litter');
  });

  it('lässt die Großschreibung stehen, wenn es keinen Gegenbeleg gibt', () => {
    const text = 'Litter covers the street. The wind was cold.';
    const { tokens, sentences } = workbench(text);
    const index = at(tokens, 'Litter');
    const result = pickFromSource({
      sourceText: text,
      tokens,
      from: index,
      to: index,
      candidates: [],
      sentences,
    });

    expect(result.kind).toBe('new');
    if (result.kind !== 'new') return;
    // Geraten wird nicht: Ohne zweite Fundstelle bleibt die Schreibung stehen.
    expect(result.candidate.english).toBe('Litter');
  });

  it('merkt sich den Verdacht auf einen Eigennamen', () => {
    const text = 'The ferry reaches Dover at noon. Dover was crowded.';
    const { tokens, sentences } = workbench(text);
    const index = at(tokens, 'Dover');
    const result = pickFromSource({
      sourceText: text,
      tokens,
      from: index,
      to: index,
      candidates: [],
      sentences,
    });

    expect(result.kind).toBe('new');
    if (result.kind !== 'new') return;
    expect(result.candidate.english).toBe('Dover');
    expect(result.candidate.isLikelyProperNoun).toBe(true);
  });
});

describe('Eine Wortgruppe aufnehmen', () => {
  it('nimmt `depend on` als eine Lernform', () => {
    const { tokens, text, sentences } = workbench();
    const from = at(tokens, 'depend');
    const to = at(tokens, 'on');
    const result = pickFromSource({
      sourceText: text,
      tokens,
      from,
      to,
      candidates: [],
      sentences,
    });

    expect(result.kind).toBe('new');
    if (result.kind !== 'new') return;
    expect(result.candidate.english).toBe('depend on');
    expect(result.candidate.normalizedEnglish).toBe('depend on');
    expect(result.candidate.literal).toBe('depend on');
  });

  it('nimmt `single out` auch dann, wenn nur die Einzelwörter Kandidaten sind', () => {
    const { tokens, candidates, text, sentences } = workbench();
    const from = at(tokens, 'single');
    const to = at(tokens, 'out');
    const result = pickFromSource({ sourceText: text, tokens, from, to, candidates, sentences });

    expect(result.kind).toBe('new');
    if (result.kind !== 'new') return;
    expect(result.candidate.normalizedEnglish).toBe('single out');
  });

  it('zählt nur Fundstellen, an denen die Wörter wirklich beieinanderstehen', () => {
    const text = 'They depend on rain. They depend, on the whole, on luck.';
    const { tokens, sentences } = workbench(text);
    const from = at(tokens, 'depend');
    const to = from + 2;
    const result = pickFromSource({
      sourceText: text,
      tokens,
      from,
      to,
      candidates: [],
      sentences,
    });

    expect(result.kind).toBe('new');
    if (result.kind !== 'new') return;
    // Das zweite `depend` steht vor einem Komma – das ist kein `depend on`.
    expect(result.candidate.occurrences).toBe(1);
  });

  it('führt auch bei einer Wortgruppe zur vorhandenen Zeile', () => {
    const { tokens, text, sentences } = workbench();
    const from = at(tokens, 'depend');
    const to = at(tokens, 'on');
    const first = pickFromSource({
      sourceText: text,
      tokens,
      from,
      to,
      candidates: [],
      sentences,
    });
    expect(first.kind).toBe('new');
    if (first.kind !== 'new') return;

    const again = pickFromSource({
      sourceText: text,
      tokens,
      from,
      to,
      candidates: [first.candidate],
      sentences,
    });
    expect(again).toEqual({ kind: 'existing', candidateId: first.candidate.id });
  });

  it('ignoriert Zwischenraum an den Rändern der Markierung', () => {
    const { tokens, text, sentences } = workbench();
    const from = at(tokens, 'depend');
    const to = at(tokens, 'on');
    const weit = pickFromSource({
      sourceText: text,
      tokens,
      from: from - 1,
      to: to + 1,
      candidates: [],
      sentences,
    });

    expect(weit.kind).toBe('new');
    if (weit.kind !== 'new') return;
    expect(weit.candidate.english).toBe('depend on');
  });
});

describe('Nichts markiert', () => {
  it('lehnt eine Markierung ohne Wort ab', () => {
    const { tokens, text } = workbench();
    const space = tokens.findIndex((token) => !token.isWord && /^\s+$/.test(token.text));
    const result = pickFromSource({
      sourceText: text,
      tokens,
      from: space,
      to: space,
      candidates: [],
    });

    expect(result.kind).toBe('rejected');
  });
});

describe('Ansage der Markierung', () => {
  it('nennt die Wörter ohne Satzzeichen dazwischen', () => {
    const { tokens } = workbench();
    const from = at(tokens, 'depend');
    const to = at(tokens, 'on');
    expect(describeSelection(tokens, from, to)).toBe('depend on');
  });
});
