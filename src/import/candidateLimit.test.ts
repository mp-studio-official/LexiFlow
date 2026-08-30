import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_COUNT_OPTIONS,
  DEFAULT_CANDIDATE_COUNT,
  MAX_CANDIDATE_COUNT,
  MIN_CANDIDATE_COUNT,
  clampCandidateCount,
  describeCandidateCount,
  limitCandidates,
} from './candidateLimit';
import { analyzeText } from '../domain/textExtraction';
import type { TextCandidate } from '../domain/textExtraction';

/**
 * Sprint 2B.2b: Die gewünschte Anzahl ist eine Obergrenze, kein Soll. Weniger
 * ist erlaubt – auffüllen wäre erfinden.
 */

function candidate(id: string, occurrences: number, firstOccurrence: number): TextCandidate {
  return {
    id,
    english: id,
    normalizedEnglish: id,
    occurrences,
    firstOccurrence,
    sourceSentence: `A sentence about ${id}.`,
    sentenceIndex: 0,
    isLikelyProperNoun: false,
  };
}

const CANDIDATES = [
  candidate('a', 1, 0),
  candidate('b', 5, 10),
  candidate('c', 3, 20),
  candidate('d', 2, 30),
];

describe('Erlaubte Anzahl', () => {
  it('bietet die vorgesehenen Stufen an', () => {
    expect([...CANDIDATE_COUNT_OPTIONS]).toEqual([5, 10, 15, 20, 30]);
    expect(MIN_CANDIDATE_COUNT).toBe(1);
    expect(MAX_CANDIDATE_COUNT).toBe(50);
  });

  it('hält eine freie Eingabe im Bereich 1 bis 50', () => {
    expect(clampCandidateCount(0)).toBe(1);
    expect(clampCandidateCount(-7)).toBe(1);
    expect(clampCandidateCount(1)).toBe(1);
    expect(clampCandidateCount(33)).toBe(33);
    expect(clampCandidateCount(50)).toBe(50);
    expect(clampCandidateCount(999)).toBe(50);
    expect(clampCandidateCount(12.4)).toBe(12);
  });

  it('fällt bei Unsinn auf den Standard zurück', () => {
    expect(clampCandidateCount(Number.NaN)).toBe(DEFAULT_CANDIDATE_COUNT);
    expect(clampCandidateCount(Number.POSITIVE_INFINITY)).toBe(DEFAULT_CANDIDATE_COUNT);
  });
});

describe('Begrenzung der Kandidaten', () => {
  it('behält die häufigsten Kandidaten', () => {
    const limited = limitCandidates(CANDIDATES, 2);
    expect(limited.map((item) => item.id)).toEqual(['b', 'c']);
  });

  it('behält die ursprüngliche Reihenfolge', () => {
    // b (5×) und c (3×) stehen im Text in dieser Reihenfolge – so bleibt es.
    const limited = limitCandidates(CANDIDATES, 3);
    expect(limited.map((item) => item.id)).toEqual(['b', 'c', 'd']);
  });

  it('erfindet nichts, wenn der Text weniger hergibt', () => {
    const limited = limitCandidates(CANDIDATES, 20);
    expect(limited).toHaveLength(4);
    expect(limited.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ist deterministisch', () => {
    expect(limitCandidates(CANDIDATES, 2)).toEqual(limitCandidates(CANDIDATES, 2));
  });

  it('entscheidet bei gleicher Häufigkeit nach der Reihenfolge im Text', () => {
    const tie = [candidate('x', 2, 50), candidate('y', 2, 10), candidate('z', 2, 30)];
    expect(limitCandidates(tie, 2).map((item) => item.id)).toEqual(['y', 'z']);
  });

  it('kommt ohne jedes Modell aus und arbeitet auf echter Analyse', () => {
    const analysis = analyzeText(
      'The crowded bus was late. Litter was everywhere. The crowded street was noisy. A quiet pavement helps.',
    );
    expect(analysis.candidates.length).toBeGreaterThan(3);

    const limited = limitCandidates(analysis.candidates, 3);
    expect(limited).toHaveLength(3);
    // „crowded“ kommt zweimal vor und ist damit gesetzt.
    expect(limited.some((item) => item.normalizedEnglish === 'crowded')).toBe(true);
    // Es bleiben ausschließlich echte Kandidaten aus dem Text.
    for (const item of limited) {
      expect(analysis.candidates).toContain(item);
    }
  });
});

describe('Ehrliche Anzeige', () => {
  it('nennt Fund und Wunsch', () => {
    expect(describeCandidateCount(20, 20)).toBe('20 von 20 gewünschten Vokabelvorschlägen gefunden.');
  });

  it('erklärt einen kleineren Fund, statt ihn zur Bezugsgröße zu machen', () => {
    const text = describeCandidateCount(12, 20);
    expect(text).toContain('12 von 20 gewünschten Vokabelvorschlägen gefunden.');
    expect(text).toContain('erfunden wird nichts');
    expect(text).not.toContain('12 von 12');
  });
});
