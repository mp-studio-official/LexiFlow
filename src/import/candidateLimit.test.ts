import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_COUNT_OPTIONS,
  DEFAULT_CANDIDATE_COUNT,
  MAX_CANDIDATE_COUNT,
  MIN_CANDIDATE_COUNT,
  clampCandidateCount,
  countCandidates,
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
    expect(describeCandidateCount(20, 20)).toBe('20 von 20 geeigneten Vokabeln gefunden.');
  });

  it('erklärt einen kleineren Fund, statt ihn zur Bezugsgröße zu machen', () => {
    const text = describeCandidateCount(12, 20);
    expect(text).toContain('12 von 20 geeigneten Vokabeln gefunden.');
    expect(text).toContain('erfunden wird nichts');
    expect(text).not.toContain('12 von 12');
  });
});

// ---------------------------------------------------------------------------
// Sprint 3B.1a: Geeignete Vokabeln und ungeklärte Abkürzungen getrennt zählen
// ---------------------------------------------------------------------------

/** Eine Abkürzung, deren Langform das Lexikon nicht kennt. */
function unresolved(id: string, occurrences = 1, firstOccurrence = 99): TextCandidate {
  return {
    ...candidate(id, occurrences, firstOccurrence),
    abbreviation: {
      abbreviation: id,
      german: '',
      hint: 'Abkürzung – Langform prüfen',
      resolved: false,
    },
  };
}

/** Eine erkannte Abkürzung – sie ist eine ganz normale Vokabel. */
function resolvedAbbreviation(id: string): TextCandidate {
  return {
    ...candidate(id, 1, 98),
    abbreviation: {
      abbreviation: id,
      longForm: 'square mile',
      german: 'die Quadratmeile',
      hint: 'Maßeinheit',
      resolved: true,
    },
  };
}

describe('Zählung geeigneter Kandidaten', () => {
  it('trennt geeignete Vokabeln von ungeklärten Abkürzungen', () => {
    const counts = countCandidates([...CANDIDATES, unresolved('bhp'), resolvedAbbreviation('sq mi')]);
    expect(counts).toEqual({ usable: 5, unresolved: 1 });
  });

  it('zählt eine leere Liste als leer', () => {
    expect(countCandidates([])).toEqual({ usable: 0, unresolved: 0 });
  });
});

describe('Begrenzung mit Abkürzungen', () => {
  it('füllt die gewünschte Zahl nicht mit ungeklärten Abkürzungen auf', () => {
    // Zwei geeignete Kandidaten, drei gewünscht – die Abkürzungen zählen nicht mit.
    const limited = limitCandidates(
      [candidate('a', 5, 0), candidate('b', 4, 10), unresolved('bhp'), unresolved('rpm', 1, 100)],
      3,
    );

    expect(countCandidates(limited).usable).toBe(2);
    // Sichtbar bleiben sie trotzdem – die Lehrkraft soll sie prüfen können.
    expect(limited).toHaveLength(4);
  });

  it('behält bei genau so vielen geeigneten Kandidaten alle', () => {
    const limited = limitCandidates([...CANDIDATES, unresolved('bhp')], 4);
    expect(countCandidates(limited)).toEqual({ usable: 4, unresolved: 1 });
  });

  it('begrenzt bei mehr geeigneten Kandidaten nur diese', () => {
    const limited = limitCandidates([...CANDIDATES, unresolved('bhp')], 2);

    expect(countCandidates(limited)).toEqual({ usable: 2, unresolved: 1 });
    // Ausgewählt werden die häufigsten geeigneten – b (5) und c (3).
    expect(limited.map((item) => item.id)).toEqual(['b', 'c', 'bhp']);
  });

  it('verdrängt keine gute Vokabel durch eine Abkürzung', () => {
    // Die Abkürzung ist häufiger als jedes echte Wort und dürfte trotzdem
    // keinen der gewünschten Plätze belegen.
    const limited = limitCandidates([candidate('a', 2, 0), unresolved('bhp', 99, 10)], 1);
    expect(limited.map((item) => item.id)).toEqual(['a', 'bhp']);
  });
});

describe('Ehrlicher Satz mit Abkürzungen', () => {
  it('nennt beide Zahlen, wenn Abkürzungen offen sind', () => {
    expect(describeCandidateCount(10, 10, 2)).toBe(
      '10 von 10 geeigneten Vokabeln gefunden · 2 Abkürzungen müssen geprüft werden.',
    );
  });

  it('beugt die eine Abkürzung richtig', () => {
    expect(describeCandidateCount(10, 10, 1)).toBe(
      '10 von 10 geeigneten Vokabeln gefunden · 1 Abkürzung muss geprüft werden.',
    );
  });

  it('bleibt ohne Abkürzungen beim bekannten Satz', () => {
    expect(describeCandidateCount(8, 10)).toBe(
      '8 von 10 geeigneten Vokabeln gefunden. ' +
        'Der Text enthält nicht mehr geeignete Kandidaten – erfunden wird nichts.',
    );
  });

  it('sagt bei zu wenigen Funden beides', () => {
    expect(describeCandidateCount(8, 10, 1)).toBe(
      '8 von 10 geeigneten Vokabeln gefunden · 1 Abkürzung muss geprüft werden. ' +
        'Der Text enthält nicht mehr geeignete Kandidaten – erfunden wird nichts.',
    );
  });
});
