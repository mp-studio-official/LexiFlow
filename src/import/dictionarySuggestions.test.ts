import { describe, expect, it } from 'vitest';
import {
  MAX_AUTO_SYNONYMS,
  enrichWithDictionary,
  familyKeyOf,
  mayReceiveDictionarySuggestion,
  partOfSpeechOf,
  safeAutoAnswer,
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

describe('Wortart vorausfüllen', () => {
  it('übersetzt die Bezeichnungen der Quelle', () => {
    const adj = entry({ headword: 'crowded', partOfSpeech: 'adj', senses: insel.senses });
    expect(partOfSpeechOf(summarizeLookup([adj]))).toBe('adjective');
    expect(partOfSpeechOf(summarizeLookup([insel]))).toBe('noun');
  });

  it('fasst zusammen, was sich zusammenfassen lässt', () => {
    const spruch = entry({ headword: 'in the long run', partOfSpeech: 'prep_phrase', senses: insel.senses });
    expect(partOfSpeechOf(summarizeLookup([spruch]))).toBe('phrase');
  });

  it('nennt Unbekanntes „sonstige“ statt einer erfundenen Nachbarschaft', () => {
    const partikel = entry({ headword: 'up', partOfSpeech: 'particle', senses: insel.senses });
    expect(partOfSpeechOf(summarizeLookup([partikel]))).toBe('other');
  });

  it('füllt nichts vor, wenn das Wort mehrere Wortarten hat', () => {
    // `book` ist Substantiv **und** Verb – eine Münze zu werfen wäre keine Auskunft.
    const substantiv = entry({ headword: 'book', partOfSpeech: 'noun', senses: insel.senses });
    const verb = entry({ headword: 'book', partOfSpeech: 'verb', senses: insel.senses });
    expect(partOfSpeechOf(summarizeLookup([substantiv, verb]))).toBe('');
  });

  it('füllt ohne Treffer nichts vor', () => {
    expect(partOfSpeechOf(undefined)).toBe('');
  });
});

describe('Sichere Sammelübernahme', () => {
  it('nimmt eine einzelne, unmarkierte Entsprechung', () => {
    expect(safeAutoAnswer(summarizeLookup([insel]))).toBe('Insel');
  });

  it('nimmt zwei Entsprechungen einer Bedeutung als Alternativen', () => {
    const station = entry({
      headword: 'station',
      senses: [
        {
          sense: 'place',
          suggestions: [
            { german: 'Bahnhof', gender: 'm' },
            { german: 'Station', gender: 'f' },
          ],
        },
      ],
    });
    /*
      Getrennt wird mit **Semikolon**, seit Phase 1 dieses Sprints. Das ist
      keine Schreibvariante: „Bahnhof, Station“ wäre *eine* Antwort, die nur
      richtig ist, wenn jemand beide Wörter mit genau diesem Komma tippt. Als
      zwei Antworten zählt jede für sich.
    */
    expect(safeAutoAnswer(summarizeLookup([station]))).toBe('Bahnhof; Station');
    expect(MAX_AUTO_SYNONYMS).toBe(2);
  });

  it('nimmt bei drei Entsprechungen nur die erste', () => {
    /*
      `limestone` liefert *Kalkstein, Calciumcarbonat, Kalk*. Ab drei Einträgen
      ist das keine Liste von Synonymen mehr, sondern eine Aufzählung
      verwandter Begriffe – Calciumcarbonat ist ein anderer Stoff.
    */
    const limestone = entry({
      headword: 'limestone',
      senses: [
        {
          sense: 'rock',
          suggestions: [
            { german: 'Kalkstein', gender: 'm' },
            { german: 'Calciumcarbonat', gender: 'n' },
            { german: 'Kalk', gender: 'm' },
          ],
        },
      ],
    });
    expect(safeAutoAnswer(summarizeLookup([limestone]))).toBe('Kalkstein');
  });

  it('trägt bei mehreren Bedeutungen gar nichts ein', () => {
    /*
      `casualty`: *Unfall* ODER *Notaufnahme* ODER *Opfer*.

      Bis 4B.3 stand hier „Unfall; Unglück“ – die **erste** Bedeutungsgruppe.
      Hinter dem Knopf „Übersetzungsvorschläge eintragen“ war das vertretbar:
      Jemand hatte darum gebeten und sah gleich, was entstanden war.

      Seit der Schritt automatisch läuft, ist es eine Wette, die hinterher wie
      eine geprüfte Antwort aussieht. Die Füllquote stiege, die
      Verlässlichkeit fiele – und beides sähe von außen gleich aus. Also: Bei
      mehr als einer Bedeutung bleibt das Feld leer, und die Bedeutungen
      stehen als Chips daneben.
    */
    expect(safeAutoAnswer(summarizeLookup([casualty]))).toBe('');
  });

  it('trägt ein, worüber sich alle Bedeutungen einig sind', () => {
    /*
      Der Gegenfall zu `casualty` – und der Grund, warum „mehr als eine Gruppe
      heißt gar nichts“ als Regel zu grob war.

      Die Quelle führt fast jedes Wort in mehreren Bedeutungsgruppen, auch
      dort, wo alle dasselbe sagen: `engine` steht zweimal da und heißt beide
      Male „Motor“. Bliebe das Feld leer, wäre das keine Vorsicht, sondern
      Arbeit ohne Grund – die Regel füllte praktisch nichts mehr aus.

      Übernommen wird dabei **nur** das übereinstimmende Wort. Einig war man
      sich über „Motor“, nicht über „Triebwerk“.
    */
    const engine = entry({
      headword: 'engine',
      senses: [
        {
          sense: 'motor',
          suggestions: [
            { german: 'Motor', gender: 'm' },
            { german: 'Triebwerk', gender: 'n' },
          ],
        },
        { sense: 'locomotive', suggestions: [{ german: 'Motor', gender: 'm' }] },
      ],
    });
    expect(safeAutoAnswer(summarizeLookup([engine]))).toBe('Motor');
  });

  it('trägt nichts ein, wenn die Bedeutungen sich widersprechen', () => {
    // `problem` → „Problem“ und „Übung“. Beides steht in der Quelle, und
    // welches gemeint ist, entscheidet der Satz – nicht dieses Modul.
    const problem = entry({
      headword: 'problem',
      senses: [
        { sense: 'difficulty', suggestions: [{ german: 'Problem', gender: 'n' }] },
        { sense: 'exercise', suggestions: [{ german: 'Übung', gender: 'f' }] },
      ],
    });
    expect(safeAutoAnswer(summarizeLookup([problem]))).toBe('');
  });

  it('trägt nichts ein, wenn die Wortart offen ist', () => {
    /*
      `island` ist Substantiv **und** Verb. Welche Wortart gemeint ist,
      entscheidet der Satz. Selbst wenn die Substantivbedeutungen sich einig
      wären, bliebe die Frage offen – und eine offene Frage ist keine Antwort.
    */
    const substantiv = entry({
      headword: 'island',
      senses: [{ sense: 'land', suggestions: [{ german: 'Insel', gender: 'f' }] }],
    });
    const verb = entry({
      headword: 'island',
      partOfSpeech: 'verb',
      senses: [{ sense: 'to isolate', suggestions: [{ german: 'isolieren' }] }],
    });
    expect(safeAutoAnswer(summarizeLookup([substantiv, verb]))).toBe('');
  });

  it('trägt nichts ein, wenn nur Markiertes vorliegt', () => {
    // `shell shock` → nur der veraltete *Kriegszitterer*.
    expect(safeAutoAnswer(summarizeLookup([shellShock]))).toBe('');
  });

  it('trägt einen ungeprüften Verweis nicht als Standardantwort ein', () => {
    /*
      `medic` ist ebenfalls über `physician` erschlossen – aber diese Paarung
      steht nicht in der Tabelle der geprüften Verweise. Eine Schlussfolgerung
      bleibt sie damit, und Schlussfolgerungen werden nicht eingetragen.
    */
    const nurVia = entry({
      headword: 'medic',
      senses: [{ sense: 'medical doctor', via: 'physician', suggestions: [{ german: 'Arzt' }] }],
    });
    expect(safeAutoAnswer(summarizeLookup([nurVia]))).toBe('');
  });

  it('übergeht Entsprechungen mit Klammerbedingung', () => {
    const bedingt = entry({
      headword: 'lime',
      senses: [{ sense: 'mineral', suggestions: [{ german: 'Kalk', qualifier: 'gebrannt' }] }],
    });
    expect(safeAutoAnswer(summarizeLookup([bedingt]))).toBe('');
  });

  it('liefert für einen leeren Treffer nichts', () => {
    expect(safeAutoAnswer(undefined)).toBe('');
    expect(safeAutoAnswer(summarizeLookup([]))).toBe('');
  });
});
