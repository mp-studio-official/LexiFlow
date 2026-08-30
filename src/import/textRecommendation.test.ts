import { describe, expect, it } from 'vitest';
import {
  buildCandidateContext,
  describeRecommendations,
  orderByRecommendation,
  resolveRecommendations,
} from './textRecommendation';
import { MAX_CONTEXT_CANDIDATES, MAX_RECOMMENDATIONS } from '../ai/AiProvider';
import type { TextCandidate } from '../domain/textExtraction';

/**
 * Sprint 2B.2b: Das Modell sieht Schlüssel, nicht den Text – und es kann mit
 * Schlüsseln nichts erfinden, was nicht im Text stand.
 */

function candidate(overrides: Partial<TextCandidate> & { id: string }): TextCandidate {
  return {
    english: 'crowded',
    normalizedEnglish: 'crowded',
    occurrences: 1,
    firstOccurrence: 0,
    sourceSentence: 'The bus was crowded.',
    sentenceIndex: 0,
    isLikelyProperNoun: false,
    ...overrides,
  };
}

const CANDIDATES: TextCandidate[] = [
  candidate({ id: 'a', english: 'crowded', occurrences: 3, firstOccurrence: 10 }),
  candidate({
    id: 'b',
    english: 'litter',
    normalizedEnglish: 'litter',
    occurrences: 5,
    firstOccurrence: 40,
    sourceSentence: 'Do not drop litter.',
  }),
  candidate({
    id: 'c',
    english: 'pavement',
    normalizedEnglish: 'pavement',
    occurrences: 1,
    firstOccurrence: 70,
    sourceSentence: 'The pavement was wet.',
  }),
];

describe('Modellkontext', () => {
  it('vergibt neutrale Schlüssel und nennt keine internen IDs', () => {
    const context = buildCandidateContext(CANDIDATES);

    expect(context.payload.map((item) => item.key)).toEqual(['c1', 'c2', 'c3']);
    const serialized = JSON.stringify(context.payload);
    for (const internal of ['"a"', '"b"', '"c"', 'normalizedEnglish', 'firstOccurrence', 'sentenceIndex']) {
      expect(serialized).not.toContain(internal);
    }
  });

  it('übergibt je Kandidat genau vier Angaben', () => {
    const [first] = buildCandidateContext(CANDIDATES).payload;
    expect(first && Object.keys(first).sort()).toEqual([
      'english',
      'key',
      'occurrences',
      'sourceSentence',
    ]);
    // Stärkstes zuerst: „litter“ kommt fünfmal vor.
    expect(first).toEqual({
      key: 'c1',
      english: 'litter',
      occurrences: 5,
      sourceSentence: 'Do not drop litter.',
    });
  });

  it('übergibt höchstens 60 Kandidaten', () => {
    const many = Array.from({ length: 200 }, (_, index) =>
      candidate({
        id: `id-${index}`,
        english: `word${index}`,
        normalizedEnglish: `word${index}`,
        occurrences: 200 - index,
        firstOccurrence: index,
      }),
    );

    const context = buildCandidateContext(many);
    expect(context.payload).toHaveLength(MAX_CONTEXT_CANDIDATES);
    expect(context.total).toBe(200);
    expect(context.keyToId.size).toBe(MAX_CONTEXT_CANDIDATES);
  });

  it('wählt deterministisch aus', () => {
    const many = Array.from({ length: 100 }, (_, index) =>
      candidate({
        id: `id-${index}`,
        english: `word${index}`,
        normalizedEnglish: `word${index}`,
        occurrences: (index % 7) + 1,
        firstOccurrence: index,
      }),
    );

    const first = buildCandidateContext(many);
    const second = buildCandidateContext([...many].reverse());
    expect(second.payload).toEqual(first.payload);
  });

  it('enthält nur je einen Satz, nicht den ganzen Text', () => {
    const context = buildCandidateContext([
      candidate({
        id: 'a',
        sourceSentence: '  The   bus was crowded.  ',
      }),
    ]);
    expect(context.payload[0]?.sourceSentence).toBe('The bus was crowded.');
  });
});

describe('Antwort des Modells', () => {
  const context = buildCandidateContext(CANDIDATES);

  it('übersetzt Schlüssel zurück in Kandidaten', () => {
    // c1 = litter (b), c2 = crowded (a)
    const result = resolveRecommendations([{ key: 'c2' }, { key: 'c1' }], context);
    expect(result.ids).toEqual(['a', 'b']);
    expect(result.discarded).toBe(0);
  });

  it('verwirft unbekannte Schlüssel', () => {
    const result = resolveRecommendations(
      [{ key: 'c1' }, { key: 'c99' }, { key: 'skyline' }, { key: '' }],
      context,
    );
    expect(result.ids).toEqual(['b']);
    expect(result.received).toBe(4);
    expect(result.discarded).toBe(3);
  });

  it('verwirft Dubletten', () => {
    const result = resolveRecommendations([{ key: 'c1' }, { key: 'c1' }, { key: 'c2' }], context);
    expect(result.ids).toEqual(['b', 'a']);
    expect(result.discarded).toBe(1);
  });

  it('begrenzt auf die gewünschte Anzahl', () => {
    const result = resolveRecommendations([{ key: 'c1' }, { key: 'c2' }, { key: 'c3' }], context, 2);
    expect(result.ids).toEqual(['b', 'a']);
  });

  it('lässt die harte Obergrenze nie überschreiten', () => {
    const many = Array.from({ length: 100 }, (_, index) =>
      candidate({
        id: `id-${index}`,
        english: `word${index}`,
        normalizedEnglish: `word${index}`,
        occurrences: 100 - index,
        firstOccurrence: index,
      }),
    );
    const wide = buildCandidateContext(many);
    const all = wide.payload.map((item) => ({ key: item.key }));

    expect(resolveRecommendations(all, wide, 999).ids).toHaveLength(MAX_RECOMMENDATIONS);
  });

  it('liefert nichts, wenn kein Schlüssel bekannt ist', () => {
    const result = resolveRecommendations([{ key: 'c42' }], context);
    expect(result.ids).toEqual([]);
    expect(describeRecommendations(result, context)).toContain('keine verwertbare Empfehlung');
  });
});

describe('Reihenfolge und Anzeige', () => {
  it('sortiert Empfehlungen nach vorn und behält den Rest', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(orderByRecommendation(items, ['c', 'a'])).toEqual([
      { id: 'c' },
      { id: 'a' },
      { id: 'b' },
      { id: 'd' },
    ]);
  });

  it('holt entfernte Kandidaten nicht zurück', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    // „c“ war empfohlen, ist aber entfernt worden.
    expect(orderByRecommendation(items, ['c', 'b'])).toEqual([{ id: 'b' }, { id: 'a' }]);
  });

  it('lässt ohne Empfehlung alles, wie es war', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(orderByRecommendation(items, [])).toEqual(items);
  });

  it('sagt, wie viele Kandidaten das Modell gar nicht gesehen hat', () => {
    const many = Array.from({ length: 80 }, (_, index) =>
      candidate({
        id: `id-${index}`,
        english: `word${index}`,
        normalizedEnglish: `word${index}`,
        occurrences: 80 - index,
        firstOccurrence: index,
      }),
    );
    const wide = buildCandidateContext(many);
    const result = resolveRecommendations([{ key: 'c1' }, { key: 'c2' }], wide);

    const text = describeRecommendations(result, wide);
    expect(text).toContain('2 von 60 geprüften Kandidaten empfohlen.');
    expect(text).toContain('20 weitere Kandidaten');
    expect(text).toContain('von Hand auswählbar');
  });

  it('sagt nichts über nicht vorgelegte Kandidaten, wenn alle vorlagen', () => {
    const context = buildCandidateContext(CANDIDATES);
    const result = resolveRecommendations([{ key: 'c1' }], context);
    expect(describeRecommendations(result, context)).toBe(
      '1 von 3 geprüften Kandidaten empfohlen.',
    );
  });
});
