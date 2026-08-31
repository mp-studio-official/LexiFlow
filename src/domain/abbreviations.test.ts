import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_ABBREVIATION_HINT,
  describeAbbreviation,
  findAbbreviations,
  maskEditorialMarkers,
} from './abbreviations';

/**
 * Sprint 3B.1: Abkürzungen sind Vokabeln, ihre Bruchstücke sind es nicht.
 *
 * Der Auslöser war „600 sq mi“: zwei Vorschläge, die beide nichts bedeuten.
 * Die Tests prüfen deshalb nicht nur, dass die Auflösung gelingt, sondern auch,
 * dass sie dort ausbleibt, wo sie raten müsste.
 */

function normalizedOf(sentence: string): string[] {
  return findAbbreviations(sentence).map((match) => match.normalized);
}

describe('findAbbreviations – Maßeinheiten', () => {
  it('erkennt „sq mi“ als eine Einheit statt als zwei Wörter', () => {
    const matches = findAbbreviations('The bay covers about 600 sq mi of water.');

    expect(matches).toHaveLength(1);
    expect(matches[0]?.abbreviation).toBe('sq mi');
    expect(matches[0]?.definition?.longForm).toBe('square mile');
    expect(matches[0]?.definition?.german).toBe('die Quadratmeile');
  });

  it('markiert genau die Zeichen der Abkürzung, nicht die Zahl', () => {
    const sentence = 'It covers 600 sq mi.';
    const match = findAbbreviations(sentence)[0];

    expect(match).toBeDefined();
    expect(sentence.slice(match?.offset ?? 0, (match?.offset ?? 0) + (match?.length ?? 0))).toBe(
      'sq mi',
    );
  });

  it('kennt die im Auftrag genannten Einheiten', () => {
    expect(normalizedOf('The road is 12 km long.')).toEqual(['km']);
    expect(normalizedOf('An area of 5 km² is protected.')).toEqual(['km²']);
    expect(normalizedOf('It is 30 cm wide.')).toEqual(['cm']);
    expect(normalizedOf('The box weighs 4 kg.')).toEqual(['kg']);
    expect(normalizedOf('They drive at 60 mph.')).toEqual(['mph']);
    expect(normalizedOf('The cliff is 200 ft high.')).toEqual(['ft']);
  });

  it('verlangt für Einheiten eine Zahl davor', () => {
    // Ohne Zahl ist „in“ eine Präposition und „ft“ gar nichts.
    expect(findAbbreviations('She lives in a small town.')).toEqual([]);
    expect(findAbbreviations('The km of coastline is unknown.')).toEqual([]);
  });

  it('erlaubt Punkte und fehlende Leerzeichen', () => {
    expect(normalizedOf('The area is 600 sq. mi. in total.')).toEqual(['sq mi']);
    expect(normalizedOf('The road is 12km long.')).toEqual(['km']);
  });

  it('bevorzugt die längere Abkürzung', () => {
    // „sq mi“ darf nicht in „sq“ plus „mi“ zerfallen.
    expect(normalizedOf('An area of 600 sq mi.')).toEqual(['sq mi']);
  });
});

describe('findAbbreviations – Akronyme', () => {
  it('löst bekannte Akronyme auf', () => {
    const matches = findAbbreviations('The bay is a UNESCO World Heritage Site.');

    expect(matches).toHaveLength(1);
    expect(matches[0]?.definition?.longForm).toContain('United Nations Educational');
  });

  it('erkennt Kürzel mit Punkten', () => {
    expect(normalizedOf('Many animals, e.g. monkeys, live here.')).toEqual(['eg']);
  });

  it('verwechselt kleingeschriebene Wörter nicht mit Akronymen', () => {
    // „un“, „ad“ und „bc“ stehen hier nicht als Abkürzung.
    expect(findAbbreviations('The un-named bay is quiet.')).toEqual([]);
    expect(findAbbreviations('He put an ad in the paper.')).toEqual([]);
  });
});

describe('findAbbreviations – unbekannte Abkürzungen', () => {
  it('meldet ein unbekanntes Kürzel, statt eine Langform zu erfinden', () => {
    const matches = findAbbreviations('The engine delivers 400 bhp.');

    expect(matches).toHaveLength(1);
    expect(matches[0]?.abbreviation).toBe('bhp');
    expect(matches[0]?.definition).toBeUndefined();
  });

  it('hält normale kurze Wörter hinter Zahlen für normale Wörter', () => {
    for (const sentence of ['There were 5 men.', 'She bought 3 cars.', 'It took 2 days.']) {
      expect(findAbbreviations(sentence), sentence).toEqual([]);
    }
  });

  it('erkennt Kürzel mit Binnenpunkten als klärungsbedürftig', () => {
    const matches = findAbbreviations('The tour starts at 9 a.m. sharp.');
    const dotted = matches.find((match) => match.normalized === 'am');

    expect(dotted).toBeDefined();
    expect(dotted?.definition).toBeUndefined();
  });

  it('löscht Abkürzungen nicht allein wegen ihrer Kürze', () => {
    expect(findAbbreviations('It is 600 sq mi and 400 bhp.')).toHaveLength(2);
  });
});

describe('maskEditorialMarkers', () => {
  it('blendet Fußnoten und Bearbeitungslinks aus', () => {
    const sentence = 'The bay is famous.[1] Local people fish here.[citation needed]';
    const masked = maskEditorialMarkers(sentence);

    expect(masked).not.toContain('[1]');
    expect(masked).not.toContain('citation needed');
    expect(masked).toContain('The bay is famous.');
  });

  it('bleibt längentreu, damit Fundstellen stimmen', () => {
    const sentence = 'Halong Bay[12] is in Vietnam. Jump to navigation';
    expect(maskEditorialMarkers(sentence)).toHaveLength(sentence.length);
  });

  it('entfernt weitere typische Wikipedia-Reste', () => {
    const masked = maskEditorialMarkers(
      'From Wikipedia, the free encyclopedia Categories: Bays ISBN 978-3-16-148410-0',
    );

    expect(masked).not.toContain('Wikipedia');
    expect(masked).not.toContain('Categories');
    expect(masked).not.toContain('ISBN');
  });

  it('macht aus einer Fußnote keine unbekannte Abkürzung', () => {
    expect(findAbbreviations('The bay has 1,969 islands.[1]')).toEqual([]);
  });
});

describe('describeAbbreviation', () => {
  it('zeigt bekannte Abkürzungen als „Langform (Abkürzung)“', () => {
    const match = findAbbreviations('An area of 600 sq mi.')[0];
    expect(match).toBeDefined();

    const suggestion = describeAbbreviation(match!);
    expect(suggestion.english).toBe('square mile (sq mi)');
    expect(suggestion.german).toBe('die Quadratmeile');
    expect(suggestion.resolved).toBe(true);
    // Für Lückentexte zählt, was im Satz steht.
    expect(suggestion.literal).toBe('sq mi');
  });

  it('kennzeichnet unbekannte Abkürzungen und erfindet nichts', () => {
    const match = findAbbreviations('The engine delivers 400 bhp.')[0];
    expect(match).toBeDefined();

    const suggestion = describeAbbreviation(match!);
    expect(suggestion.english).toBe('bhp');
    expect(suggestion.german).toBe('');
    expect(suggestion.hint).toBe(UNKNOWN_ABBREVIATION_HINT);
    expect(suggestion.resolved).toBe(false);
  });

  it('nennt bei Einheiten die Wortart im Hinweis', () => {
    const match = findAbbreviations('The road is 12 km long.')[0];
    expect(describeAbbreviation(match!).hint).toContain('Maßeinheit');
  });
});
