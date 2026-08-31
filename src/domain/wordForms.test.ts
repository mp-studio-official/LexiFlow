import { describe, expect, it } from 'vitest';
import {
  analyzeForm,
  buildFamilies,
  describeForms,
  describeInflections,
  type FormObservation,
  type LexicalFamily,
} from './wordForms';

/**
 * Sprint 3B.1: Wortformen zusammenführen, ohne Wörter zu erfinden.
 *
 * Die Tests prüfen beides – dass zusammengehört, was zusammengehört, und dass
 * getrennt bleibt, was diese Datei ohne Wörterbuch nicht sicher entscheiden
 * kann. Der zweite Teil ist der wichtigere: `water` darf niemals zu `wat`
 * werden, auch nicht als Preis für eine schönere Vorschlagsliste.
 */

function observation(
  display: string,
  occurrences: number,
  overrides: Partial<FormObservation> = {},
): FormObservation {
  return {
    normalized: display.toLowerCase(),
    display,
    occurrences,
    firstOccurrence: 0,
    sentenceIndex: 0,
    sourceSentence: `A sentence with ${display}.`,
    ...overrides,
  };
}

/** Familie zu einer Grundform holen – die Reihenfolge ist hier nie das Thema. */
function family(families: readonly LexicalFamily[], lemma: string): LexicalFamily {
  const found = families.find((item) => item.lemma === lemma);
  expect(found, `keine Familie für „${lemma}“ in ${families.map((f) => f.lemma).join(', ')}`).toBeDefined();
  return found as LexicalFamily;
}

describe('analyzeForm', () => {
  it('erkennt reguläre Plurale auch ohne Beleg im Text', () => {
    expect(analyzeForm('islands')).toMatchObject({
      lemma: 'island',
      relation: 'plural',
      confident: true,
    });
    expect(analyzeForm('countries')).toMatchObject({ lemma: 'country', relation: 'plural' });
    expect(analyzeForm('boxes')).toMatchObject({ lemma: 'box', relation: 'plural' });
    expect(analyzeForm('beaches')).toMatchObject({ lemma: 'beach', relation: 'plural' });
  });

  it('kennt eine kurze Liste zuverlässiger unregelmäßiger Plurale', () => {
    expect(analyzeForm('children')).toMatchObject({ lemma: 'child', confident: true });
    expect(analyzeForm('women')).toMatchObject({ lemma: 'woman' });
    expect(analyzeForm('leaves')).toMatchObject({ lemma: 'leaf' });
  });

  it('löst Verbformen auf, ohne stumme e zu erfinden', () => {
    expect(analyzeForm('visited')).toMatchObject({ lemma: 'visit', relation: 'past' });
    expect(analyzeForm('visiting')).toMatchObject({ lemma: 'visit', relation: 'progressive' });
    expect(analyzeForm('liked')).toMatchObject({ lemma: 'like', relation: 'past' });
    expect(analyzeForm('making')).toMatchObject({ lemma: 'make', relation: 'progressive' });
    expect(analyzeForm('created')).toMatchObject({ lemma: 'create', relation: 'past' });
    expect(analyzeForm('stopped')).toMatchObject({ lemma: 'stop', relation: 'past' });
    expect(analyzeForm('running')).toMatchObject({ lemma: 'run', relation: 'progressive' });
    expect(analyzeForm('studied')).toMatchObject({ lemma: 'study', relation: 'past' });
  });

  it('behandelt Steigerungen als belegpflichtig', () => {
    expect(analyzeForm('larger')).toMatchObject({ relation: 'comparative', confident: false });
    expect(analyzeForm('larger').alternates).toContain('large');
    expect(analyzeForm('largest')).toMatchObject({ relation: 'superlative', confident: false });
    expect(analyzeForm('longer')).toMatchObject({ lemma: 'long', confident: false });
  });

  it('lässt Wörter auf -s in Ruhe, die keine Plurale sind', () => {
    for (const word of ['news', 'series', 'species', 'means', 'glasses', 'physics', 'analysis']) {
      expect(analyzeForm(word), word).toMatchObject({ lemma: word, relation: 'base' });
    }
  });

  it('zerlegt keine Wörter, die nur zufällig wie gebeugt aussehen', () => {
    for (const word of ['water', 'other', 'forest', 'building', 'thing', 'red', 'need', 'best']) {
      expect(analyzeForm(word), word).toMatchObject({ lemma: word, relation: 'base' });
    }
  });

  it('rührt sehr kurze Wörter grundsätzlich nicht an', () => {
    for (const word of ['is', 'as', 'his', 'bus']) {
      expect(analyzeForm(word), word).toMatchObject({ lemma: word, relation: 'base' });
    }
  });
});

describe('buildFamilies', () => {
  it('macht aus island und islands genau einen Vorschlag', () => {
    const families = buildFamilies([
      observation('island', 6, { firstOccurrence: 10 }),
      observation('islands', 12, { firstOccurrence: 40 }),
    ]);

    expect(families).toHaveLength(1);
    const island = family(families, 'island');
    expect(island.display).toBe('island');
    expect(island.merged).toBe(true);
    expect(island.forms.map((form) => form.normalized)).toEqual(['islands', 'island']);
  });

  it('summiert die Häufigkeiten aller Formen', () => {
    const families = buildFamilies([
      observation('island', 6, { firstOccurrence: 10 }),
      observation('islands', 12, { firstOccurrence: 40 }),
    ]);

    expect(family(families, 'island').occurrences).toBe(18);
  });

  it('behält die früheste Fundstelle samt Satz der ganzen Familie', () => {
    const families = buildFamilies([
      observation('islands', 12, {
        firstOccurrence: 40,
        sentenceIndex: 2,
        sourceSentence: 'The bay has many islands.',
      }),
      observation('island', 6, {
        firstOccurrence: 10,
        sentenceIndex: 0,
        sourceSentence: 'One island is famous.',
      }),
    ]);

    const island = family(families, 'island');
    expect(island.firstOccurrence).toBe(10);
    expect(island.sentenceIndex).toBe(0);
    expect(island.sourceSentence).toBe('One island is famous.');
  });

  it('führt Verbformen auf die Grundform zusammen und nennt sie richtig', () => {
    const families = buildFamilies([
      observation('visit', 3, { firstOccurrence: 0 }),
      observation('visits', 2, { firstOccurrence: 20 }),
      observation('visited', 4, { firstOccurrence: 50 }),
    ]);

    expect(families).toHaveLength(1);
    const visit = family(families, 'visit');
    expect(visit.occurrences).toBe(9);
    // Kein „Plural: visits“ – der Text belegt mit `visited`, dass es ein Verb ist.
    expect(describeInflections(visit)).toEqual(
      expect.arrayContaining(['3. Person Singular: visits', 'Vergangenheit: visited']),
    );
  });

  it('nennt -s ohne Verbbeleg weiterhin Plural', () => {
    const families = buildFamilies([
      observation('island', 6),
      observation('islands', 12, { firstOccurrence: 40 }),
    ]);

    expect(describeInflections(family(families, 'island'))).toEqual(['Plural: islands']);
  });

  it('führt larger auf large zusammen, weil large im Text steht', () => {
    const families = buildFamilies([
      observation('large', 3, { firstOccurrence: 5 }),
      observation('larger', 2, { firstOccurrence: 60 }),
    ]);

    expect(families).toHaveLength(1);
    const large = family(families, 'large');
    expect(large.occurrences).toBe(5);
    expect(describeInflections(large)).toEqual(['Steigerung: larger']);
  });

  it('lässt larger allein stehen, wenn large im Text fehlt', () => {
    const families = buildFamilies([observation('larger', 2)]);

    expect(families.map((item) => item.lemma)).toEqual(['larger']);
    expect(family(families, 'larger').merged).toBe(false);
  });

  it('macht aus water niemals wat', () => {
    const families = buildFamilies([observation('water', 9), observation('wat', 1)]);

    expect(families.map((item) => item.lemma).sort()).toEqual(['wat', 'water']);
  });

  it('zerlegt Sonderfälle auf -s auch im Text nicht', () => {
    const families = buildFamilies([
      observation('news', 2),
      observation('series', 3),
      observation('species', 4),
      observation('means', 2),
      observation('glasses', 5),
    ]);

    expect(families.map((item) => item.lemma).sort()).toEqual([
      'glasses',
      'means',
      'news',
      'series',
      'species',
    ]);
    for (const item of families) {
      expect(item.merged, item.lemma).toBe(false);
    }
  });

  it('trennt Homonyme, die sich nur ähnlich schreiben', () => {
    // `bank` und `banks` gehören zusammen, `banner` gehört nirgendwohin.
    const families = buildFamilies([
      observation('bank', 2),
      observation('banks', 3, { firstOccurrence: 30 }),
      observation('banner', 1, { firstOccurrence: 60 }),
    ]);

    expect(family(families, 'bank').forms).toHaveLength(2);
    expect(family(families, 'banner').merged).toBe(false);
  });

  it('baut keine Ketten über eine bereits gebeugte Form', () => {
    const families = buildFamilies([
      observation('study', 2),
      observation('studies', 3, { firstOccurrence: 20 }),
      observation('studied', 4, { firstOccurrence: 40 }),
    ]);

    expect(families).toHaveLength(1);
    expect(family(families, 'study').occurrences).toBe(9);
  });

  it('nutzt die Schreibweise aus dem Text als Stichwort', () => {
    const families = buildFamilies([
      observation('Islands', 12, { normalized: 'islands', firstOccurrence: 5 }),
      observation('Island', 3, { normalized: 'island', firstOccurrence: 40 }),
    ]);

    expect(family(families, 'island').display).toBe('Island');
  });

  it('rekonstruiert das Stichwort, wenn die Grundform nicht im Text steht', () => {
    const families = buildFamilies([observation('islands', 12)]);

    const island = family(families, 'island');
    expect(island.display).toBe('island');
    expect(island.merged).toBe(false);
    expect(island.forms.map((form) => form.display)).toEqual(['islands']);
  });

  it('sortiert die Formen nach Häufigkeit, bei Gleichstand nach Fundstelle', () => {
    const families = buildFamilies([
      observation('visits', 2, { firstOccurrence: 80 }),
      observation('visit', 2, { firstOccurrence: 10 }),
      observation('visited', 7, { firstOccurrence: 40 }),
    ]);

    expect(family(families, 'visit').forms.map((form) => form.normalized)).toEqual([
      'visited',
      'visit',
      'visits',
    ]);
  });

  it('kennzeichnet die Grundform selbst nie als gebeugt', () => {
    const families = buildFamilies([observation('child', 2), observation('children', 5)]);

    const child = family(families, 'child');
    expect(child.forms.find((form) => form.normalized === 'child')?.relation).toBe('base');
    expect(child.forms.find((form) => form.normalized === 'children')?.relation).toBe('plural');
  });

  it('bleibt bei leerer Eingabe leer', () => {
    expect(buildFamilies([])).toEqual([]);
  });
});

describe('describeForms', () => {
  it('nennt beobachtete Formen und die gemeinsame Häufigkeit', () => {
    const families = buildFamilies([
      observation('island', 6, { firstOccurrence: 10 }),
      observation('islands', 12, { firstOccurrence: 40 }),
    ]);

    expect(describeForms(family(families, 'island'))).toBe(
      'Im Text: islands, island · insgesamt 18-mal',
    );
  });

  it('funktioniert auch für eine einzelne Form', () => {
    const families = buildFamilies([observation('bay', 4)]);
    expect(describeForms(family(families, 'bay'))).toBe('Im Text: bay · insgesamt 4-mal');
  });
});

describe('describeInflections', () => {
  it('nennt nur die gebeugten Formen', () => {
    const families = buildFamilies([observation('child', 2), observation('children', 5)]);
    expect(describeInflections(family(families, 'child'))).toEqual(['Plural: children']);
  });

  it('bleibt leer, wenn nur die Grundform im Text steht', () => {
    const families = buildFamilies([observation('bay', 4)]);
    expect(describeInflections(family(families, 'bay'))).toEqual([]);
  });
});
