import { describe, expect, it } from 'vitest';
import {
  acceptedForms,
  levenshtein,
  lenientKey,
  normalizeAnswer,
  formatAnswers,
  splitAnswers,
  splitList,
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

describe('splitAnswers – nur das Semikolon trennt', () => {
  /*
    Der Fall, der diese Funktion verändert hat: `to coin a phrase / term` war
    korrekt mit „einen Begriff, eine Redewendung prägen“ beantwortet. Die alte
    Regel machte daraus zwei Antworten, und die Karte zeigte nur die erste.
    Die zweite Hälfte des Satzes war weg, ohne einen Hinweis darauf.
  */
  it('lässt ein Komma in der Antwort stehen', () => {
    expect(splitAnswers('einen Begriff, eine Redewendung prägen')).toEqual([
      'einen Begriff, eine Redewendung prägen',
    ]);
  });

  it('trennt am Semikolon', () => {
    expect(splitAnswers('dauerhaft; beständig; langanhaltend')).toEqual([
      'dauerhaft',
      'beständig',
      'langanhaltend',
    ]);
  });

  it('lässt jeden Schrägstrich unberührt', () => {
    // Beides verbindet Wortformen, statt Antworten zu trennen.
    expect(splitAnswers('der/die Angestellte')).toEqual(['der/die Angestellte']);
    expect(splitAnswers('a phrase / term')).toEqual(['a phrase / term']);
  });

  it('wirft Leerwerte weg, ohne den Rest anzufassen', () => {
    expect(splitAnswers(' ; voll, überfüllt ;; ')).toEqual(['voll, überfüllt']);
  });
});

describe('splitList – Aufzählungen wie Themen-Tags', () => {
  it('trennt weiterhin am Komma, weil ein Tag keines enthält', () => {
    expect(splitList('City life, transport; Alltag')).toEqual([
      'City life',
      'transport',
      'Alltag',
    ]);
  });
});

describe('formatAnswers', () => {
  it('schreibt mehrere Antworten mit Semikolon', () => {
    expect(formatAnswers(['dauerhaft', 'beständig'])).toBe('dauerhaft; beständig');
  });

  it('ist die Umkehrung von splitAnswers', () => {
    const answers = ['einen Begriff, eine Redewendung prägen', 'etwas prägen'];
    expect(splitAnswers(formatAnswers(answers))).toEqual(answers);
  });

  it('lässt Leerwerte weg', () => {
    expect(formatAnswers(['a', '  ', 'b'])).toBe('a; b');
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
