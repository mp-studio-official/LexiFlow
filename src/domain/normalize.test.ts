import { describe, expect, it } from 'vitest';
import {
  acceptedForms,
  levenshtein,
  lenientKey,
  normalizeAnswer,
  splitMeanings,
  typoTolerance,
} from './normalize';

describe('normalizeAnswer', () => {
  it('ignoriert Groß-/Kleinschreibung', () => {
    expect(normalizeAnswer('Nachbarschaft')).toBe(normalizeAnswer('nachbarschaft'));
  });

  it('entfernt überflüssige Leerzeichen', () => {
    expect(normalizeAnswer('  sich   entschuldigen  ')).toBe('sich entschuldigen');
  });

  it('entfernt abschließende Satzzeichen', () => {
    expect(normalizeAnswer('Nachbarschaft.')).toBe('nachbarschaft');
    expect(normalizeAnswer('Wirklich?!')).toBe('wirklich');
  });

  it('vereinheitlicht typografische Zeichen', () => {
    expect(normalizeAnswer('don’t')).toBe("don't");
    expect(normalizeAnswer('well–known')).toBe('well-known');
  });

  it('behandelt geschützte Leerzeichen wie normale', () => {
    expect(normalizeAnswer('New York')).toBe('new york');
  });

  it('erhält Umlaute', () => {
    expect(normalizeAnswer('Überfüllt')).toBe('überfüllt');
  });

  it('verändert bedeutungstragende Unterschiede nicht', () => {
    expect(normalizeAnswer('house')).not.toBe(normalizeAnswer('mouse'));
  });
});

describe('lenientKey', () => {
  it('entfernt führende Artikel und „to“', () => {
    expect(lenientKey('to apologise')).toBe('apologise');
    expect(lenientKey('die Nachbarschaft')).toBe('nachbarschaft');
    expect(lenientKey('the neighbourhood')).toBe('neighbourhood');
  });

  it('entfernt Klammerzusätze', () => {
    expect(lenientKey('(sich) freuen')).toBe('freuen');
    expect(lenientKey('lorry [BE]')).toBe('lorry');
  });
});

describe('acceptedForms', () => {
  it('liefert kanonische und tolerante Form', () => {
    const forms = acceptedForms('(sich) entschuldigen');
    expect(forms).toContain('sich entschuldigen');
    expect(forms).toContain('entschuldigen');
  });
});

describe('splitMeanings', () => {
  it('trennt an Komma und Semikolon', () => {
    expect(splitMeanings('voll, überfüllt; gedrängt')).toEqual(['voll', 'überfüllt', 'gedrängt']);
  });

  it('lässt Schrägstriche ohne Leerzeichen unberührt', () => {
    expect(splitMeanings('der/die Angestellte')).toEqual(['der/die Angestellte']);
  });

  it('trennt an Schrägstrich mit Leerzeichen', () => {
    expect(splitMeanings('lorry / truck')).toEqual(['lorry', 'truck']);
  });
});

describe('levenshtein', () => {
  it('misst kleine Abweichungen', () => {
    expect(levenshtein('neighbour', 'neighbor')).toBe(1);
    expect(levenshtein('haus', 'haus')).toBe(0);
  });

  it('bricht oberhalb der Schranke ab', () => {
    expect(levenshtein('abcdefgh', 'zzzzzzzz', 2)).toBeGreaterThan(2);
  });
});

describe('typoTolerance', () => {
  it('ist bei kurzen Wörtern streng', () => {
    expect(typoTolerance(3)).toBe(0);
    expect(typoTolerance(6)).toBe(1);
    expect(typoTolerance(12)).toBe(2);
  });
});
