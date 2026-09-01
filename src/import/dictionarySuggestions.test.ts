import { describe, expect, it } from 'vitest';
import {
  enrichWithDictionary,
  familyKeyOf,
  mayReceiveDictionarySuggestion,
  summarizeLookup,
} from './dictionarySuggestions';
import type { DictionaryEntry, DictionaryProvider } from '../dictionary/DictionaryProvider';

function entry(partial: Partial<DictionaryEntry> & Pick<DictionaryEntry, 'headword'>): DictionaryEntry {
  return {
    lemma: partial.lemma ?? partial.headword,
    partOfSpeech: 'noun',
    senses: [],
    quality: 'exact',
    source: 'wiktionary',
    ...partial,
  };
}

const insel = entry({
  headword: 'island',
  senses: [{ sense: 'land surrounded by water', suggestions: [{ german: 'Insel', gender: 'f' }] }],
});

const casualty = entry({
  headword: 'casualty',
  senses: [
    { sense: 'accident', suggestions: [{ german: 'Unfall', gender: 'm' }, { german: 'Unglück' }] },
    { sense: 'person', suggestions: [{ german: 'Opfer' }] },
  ],
});

const shellShock = entry({
  headword: 'shell shock',
  multiword: true,
  quality: 'phrase',
  senses: [{ sense: 'condition', suggestions: [{ german: 'Kriegszitterer', register: ['dated'] }] }],
});

describe('Einen Treffer zusammenfassen', () => {
  it('nimmt die erste Übersetzung der besten Bedeutung', () => {
    expect(summarizeLookup([insel])?.primary).toBe('Insel');
  });

  it('nennt eine einzelne, unmarkierte Bedeutung eindeutig', () => {
    expect(summarizeLookup([insel])?.unambiguous).toBe(true);
  });

  it('nennt mehrere Bedeutungen nicht eindeutig', () => {
    const summary = summarizeLookup([casualty]);
    expect(summary?.senseCount).toBe(2);
    expect(summary?.unambiguous).toBe(false);
  });

  it('nennt mehrere Wortarten nicht eindeutig', () => {
    const verb = entry({
      headword: 'island',
      partOfSpeech: 'verb',
      senses: [{ sense: 'isolate', suggestions: [{ german: 'isolieren' }] }],
    });
    expect(summarizeLookup([insel, verb])?.unambiguous).toBe(false);
  });

  it('nennt eine markierte Übersetzung nicht eindeutig, bietet sie aber an', () => {
    const summary = summarizeLookup([shellShock]);
    expect(summary?.primary).toBe('Kriegszitterer');
    expect(summary?.questionable).toBe(true);
    expect(summary?.unambiguous).toBe(false);
  });

  it('nennt eine geerbte Bedeutung nicht eindeutig', () => {
    const doctor = entry({
      headword: 'doctor',
      senses: [{ sense: 'medical doctor', via: 'physician', suggestions: [{ german: 'Arzt' }] }],
    });
    const summary = summarizeLookup([doctor]);
    expect(summary?.viaHeadword).toBe('physician');
    expect(summary?.unambiguous).toBe(false);
  });

  it('merkt sich die Grundform, über die gefunden wurde', () => {
    const plural = entry({ ...insel, lemma: 'island', quality: 'lemma' });
    expect(summarizeLookup([plural])?.viaLemma).toBe('island');
  });

  it('liefert für einen leeren Treffer nichts', () => {
    expect(summarizeLookup([])).toBeUndefined();
    expect(summarizeLookup([entry({ headword: 'x', senses: [] })])).toBeUndefined();
    expect(
      summarizeLookup([entry({ headword: 'x', senses: [{ sense: 'y', suggestions: [] }] })]),
    ).toBeUndefined();
  });
});

describe('Wann eine Zeile einen Vorschlag bekommen darf', () => {
  it('lässt eine getippte Antwort in Ruhe', () => {
    expect(mayReceiveDictionarySuggestion({ german: 'Insel' })).toBe(false);
    expect(mayReceiveDictionarySuggestion({ german: '   ' })).toBe(true);
  });

  it('verdrängt keinen lokalen Abkürzungsvorschlag', () => {
    expect(mayReceiveDictionarySuggestion({ german: '', suggestionSource: 'local' })).toBe(false);
  });

  it('darf einen Modellvorschlag ergänzen', () => {
    expect(mayReceiveDictionarySuggestion({ german: '', suggestionSource: 'model' })).toBe(true);
  });
});

describe('Alle Zeilen anreichern', () => {
  interface Row {
    key: string;
    german: string;
    suggestionSource?: 'local' | 'model' | 'dictionary' | undefined;
    suggestion?: string;
    family?: string | undefined;
  }

  function providerFor(map: Record<string, DictionaryEntry[]>): DictionaryProvider {
    return {
      id: 'test',
      label: 'Test',
      async isAvailable() {
        return true;
      },
      async meta() {
        return undefined;
      },
      async lookup(word) {
        return map[word.toLowerCase()] ?? [];
      },
    };
  }

  const apply = (row: Row, summary: { primary: string }, family: string | undefined): Row => ({
    ...row,
    suggestion: summary.primary,
    suggestionSource: 'dictionary',
    family,
  });

  it('füllt nur die Zeilen, die noch nichts haben', async () => {
    const rows: Row[] = [
      { key: 'island', german: '' },
      { key: 'casualty', german: 'Unfall' },
      { key: 'litter', german: '', suggestionSource: 'local' },
    ];
    const result = await enrichWithDictionary(
      rows,
      (row) => row.key,
      providerFor({ island: [insel], casualty: [casualty], litter: [] }),
      apply,
    );

    expect(result.filled).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.rows[0]?.suggestion).toBe('Insel');
    expect(result.rows[1]?.suggestion).toBeUndefined();
    expect(result.rows[2]?.suggestion).toBeUndefined();
  });

  it('zählt die eindeutigen Zeilen für die Sammelaktion', async () => {
    const result = await enrichWithDictionary(
      [
        { key: 'island', german: '' },
        { key: 'casualty', german: '' },
      ],
      (row) => row.key,
      providerFor({ island: [insel], casualty: [casualty] }),
      apply,
    );
    expect(result.filled).toBe(2);
    expect(result.unambiguous).toBe(1);
  });

  it('markiert die zweite Zeile derselben Wortfamilie', async () => {
    const plural = entry({ ...insel, quality: 'lemma' });
    const result = await enrichWithDictionary(
      [
        { key: 'island', german: '' },
        { key: 'islands', german: '' },
      ],
      (row) => row.key,
      providerFor({ island: [insel], islands: [plural] }),
      apply,
    );
    expect(result.rows[0]?.family).toBeUndefined();
    expect(result.rows[1]?.family).toBe('island');
    // Vorgeschlagen wird trotzdem – entfernt wird nichts.
    expect(result.rows[1]?.suggestion).toBe('Insel');
  });

  it('lässt einen Anbieterfehler die übrigen Zeilen nicht kosten', async () => {
    const kaputt: DictionaryProvider = {
      id: 'kaputt',
      label: 'kaputt',
      async isAvailable() {
        return true;
      },
      async meta() {
        return undefined;
      },
      async lookup(word) {
        if (word === 'boom') throw new Error('Fach beschädigt');
        return [insel];
      },
    };

    const result = await enrichWithDictionary(
      [
        { key: 'boom', german: '' },
        { key: 'island', german: '' },
      ],
      (row) => row.key,
      kaputt,
      apply,
    );

    expect(result.rows[0]?.suggestion).toBeUndefined();
    expect(result.rows[1]?.suggestion).toBe('Insel');
    expect(result.filled).toBe(1);
  });

  it('erfindet weder Schwierigkeitsgrad noch Thementags', async () => {
    const result = await enrichWithDictionary(
      [{ key: 'island', german: '' }],
      (row) => row.key,
      providerFor({ island: [insel] }),
      apply,
    );
    // Der Datensatz kennt beides nicht – und das Ergebnis erfindet es nicht.
    expect(Object.keys(result.rows[0] ?? {})).not.toContain('difficulty');
    expect(Object.keys(result.rows[0] ?? {})).not.toContain('topicTags');
  });

  it('bildet den Familienschlüssel aus dem Stichwort', () => {
    expect(familyKeyOf(summarizeLookup([insel]))).toBe('island');
    expect(familyKeyOf(undefined)).toBeUndefined();
  });
});
