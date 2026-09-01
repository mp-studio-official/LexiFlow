import { describe, expect, it } from 'vitest';
import {
  bestMatchingSense,
  crossReferenceTarget,
  germanSenses,
  isAffixFragment,
  isMultiword,
  lemmaOfForm,
  mentions,
  normalizeTranslation,
  readEntry,
  readTags,
  resolveCrossReferences,
  splitParenthetical,
} from './wiktextract.mjs';

/**
 * Alle Vorlagen in dieser Datei stammen aus dem **echten** Datensatz
 * (enwiktionary-Dump 2026-08-05, extrahiert 2026-08-28) und wurden vor dem
 * Schreiben der Tests nachgesehen, nicht erfunden. Gekürzt ist nur, was für die
 * Umformung ohne Belang ist – Aussprache, Kategorien, Etymologie.
 */

const limestone = {
  word: 'limestone',
  lang: 'English',
  lang_code: 'en',
  pos: 'noun',
  senses: [
    {
      glosses: [
        'An abundant rock of marine and freshwater sediments; primarily composed of calcite (CaCO₃); and occurring in a variety of forms, both crystalline and amorphous.',
      ],
      tags: ['countable', 'uncountable'],
      links: [
        ['rock', 'rock'],
        ['calcite', 'calcite'],
      ],
    },
  ],
  translations: [
    {
      lang: 'German',
      code: 'de',
      lang_code: 'de',
      sense: 'abundant rock of marine and fresh-water sediments',
      tags: ['masculine'],
      word: 'Kalkstein',
    },
    {
      lang: 'German',
      code: 'de',
      lang_code: 'de',
      sense: 'abundant rock of marine and fresh-water sediments',
      tags: ['neuter'],
      word: 'Calciumcarbonat',
    },
    {
      lang: 'German',
      code: 'de',
      lang_code: 'de',
      sense: 'abundant rock of marine and fresh-water sediments',
      tags: ['masculine'],
      word: 'Kalk',
    },
    { lang: 'French', code: 'fr', lang_code: 'fr', sense: 'x', tags: ['masculine'], word: 'calcaire' },
  ],
};

/** `military` liefert echte Präfixfragmente – der Grund für `isAffixFragment`. */
const military = {
  word: 'military',
  lang_code: 'en',
  pos: 'adj',
  senses: [{ glosses: ['Characteristic of members of the armed forces.'], links: [['armed forces', 'armed forces']] }],
  translations: [
    { code: 'de', sense: 'characteristic of members of the armed forces', word: 'Militär-' },
    { code: 'de', sense: 'characteristic of members of the armed forces', word: 'militärisch' },
    { code: 'de', sense: 'characteristic of members of the armed forces', word: 'Kriegs-' },
    { code: 'de', sense: 'relating to war', word: 'Kriegs-' },
  ],
};

/** `doctor`: medizinische Bedeutung ohne eigenen Übersetzungsblock. */
const doctor = {
  word: 'doctor',
  lang_code: 'en',
  pos: 'noun',
  senses: [
    {
      glosses: [
        'A physician; a member of the medical profession; one who is trained and licensed to heal the sick or injured.',
      ],
      links: [
        ['physician', 'physician'],
        ['member', 'member'],
        ['medical', 'medical'],
      ],
    },
    {
      glosses: ['A person who has attained a doctorate, such as a Ph.D. or Th.D.'],
      links: [['doctorate', 'doctorate']],
    },
  ],
  translations: [
    { code: 'de', sense: 'person who has attained a doctorate', tags: ['masculine'], word: 'Doktor' },
    { code: 'de', sense: 'person who has attained a doctorate', tags: ['feminine'], word: 'Doktorin' },
  ],
};

const physician = {
  word: 'physician',
  lang_code: 'en',
  pos: 'noun',
  senses: [{ glosses: ['A medical doctor trained in human medicine.'], links: [['medical', 'medical']] }],
  translations: [
    { code: 'de', sense: 'medical doctor', tags: ['masculine'], word: 'Arzt' },
    { code: 'de', sense: 'medical doctor', tags: ['feminine'], word: 'Ärztin' },
    { code: 'de', sense: 'medical doctor', tags: ['masculine'], word: 'Mediziner' },
  ],
};

/** `islands`: Flexionsform mit `form_of`. */
const islands = {
  word: 'islands',
  lang_code: 'en',
  pos: 'noun',
  senses: [
    {
      links: [['island', 'island#English']],
      glosses: ['plural of island'],
      tags: ['form-of', 'plural'],
      form_of: [{ word: 'island' }],
    },
  ],
};

const shellShock = {
  word: 'shell shock',
  lang_code: 'en',
  pos: 'noun',
  senses: [{ glosses: ['A psychiatric condition characterized by fatigue.'], links: [['psychiatric', 'psychiatric']] }],
  translations: [
    {
      code: 'de',
      sense: 'psychiatric condition characterized by fatigue caused by battle',
      word: 'Kriegszitterer',
    },
  ],
};

describe('Einzelne Übersetzung lesen', () => {
  it('nimmt Wort und Genus', () => {
    expect(normalizeTranslation({ word: 'Kalkstein', tags: ['masculine'] })).toEqual({
      ok: true,
      german: 'Kalkstein',
      gender: 'm',
    });
  });

  it('erkennt Präfixfragmente und nennt den Grund', () => {
    expect(normalizeTranslation({ word: 'Kriegs-' })).toEqual({
      ok: false,
      reason: 'affix',
      word: 'Kriegs-',
    });
    expect(isAffixFragment('Militär-')).toBe(true);
    expect(isAffixFragment('-heit')).toBe(true);
    expect(isAffixFragment('militärisch')).toBe(false);
  });

  it('trennt Klammerzusätze vom Wort', () => {
    expect(splitParenthetical('Kalk (gebrannt)')).toEqual({ word: 'Kalk', qualifier: 'gebrannt' });
    expect(splitParenthetical('Kalkstein')).toEqual({ word: 'Kalkstein' });
    // Eine leere Klammer ist keine Angabe.
    expect(splitParenthetical('Kalk ()')).toEqual({ word: 'Kalk' });
  });

  it('kennzeichnet Mehrwortausdrücke', () => {
    expect(normalizeTranslation({ word: 'schwarzes Brett' }).multiword).toBe(true);
    expect(isMultiword('Kalkstein')).toBe(false);
  });

  it('trennt Genus, Register und übrige Marker', () => {
    expect(readTags(['feminine', 'colloquial', 'Latin'])).toEqual({
      gender: 'f',
      register: ['colloquial'],
      other: ['Latin'],
    });
    expect(readTags(undefined)).toEqual({ register: [], other: [] });
  });

  it('behält Registermarker, statt sie stillschweigend zu schlucken', () => {
    const result = normalizeTranslation({ word: 'Kittel', tags: ['masculine', 'dated'] });
    expect(result).toMatchObject({ ok: true, german: 'Kittel', gender: 'm', register: ['dated'] });
  });
});

describe('Deutsche Bedeutungen eines Eintrags', () => {
  it('nimmt nur Deutsch und gruppiert nach der Bedeutung der Quelle', () => {
    const { senses } = germanSenses(limestone);
    expect(senses).toHaveLength(1);
    expect(senses[0].sense).toBe('abundant rock of marine and fresh-water sediments');
    expect(senses[0].german.map((g) => g.german)).toEqual(['Kalkstein', 'Calciumcarbonat', 'Kalk']);
    expect(senses[0].german[0].gender).toBe('m');
  });

  it('behält die Reihenfolge der Quelle', () => {
    // Es gibt keine andere belegte Rangfolge. Eine eigene wäre erfunden.
    const { senses } = germanSenses(limestone);
    expect(senses[0].german[0].german).toBe('Kalkstein');
  });

  it('meldet verworfene Präfixfragmente statt sie zu verschweigen', () => {
    const { senses, dropped } = germanSenses(military);
    expect(dropped.map((d) => d.word)).toEqual(['Militär-', 'Kriegs-', 'Kriegs-']);
    expect(dropped.every((d) => d.reason === 'affix')).toBe(true);
    // Was übrig bleibt, ist brauchbar – und die zweite Bedeutung verliert alles.
    expect(senses).toHaveLength(1);
    expect(senses[0].german.map((g) => g.german)).toEqual(['militärisch']);
  });

  it('nimmt dieselbe Antwort innerhalb einer Bedeutung nur einmal', () => {
    const doubled = {
      ...limestone,
      translations: [
        { code: 'de', sense: 's', word: 'Kalkstein', tags: ['masculine'] },
        { code: 'de', sense: 's', word: 'Kalkstein', tags: ['masculine'] },
      ],
    };
    expect(germanSenses(doubled).senses[0].german).toHaveLength(1);
  });

  it('kommt mit einem Eintrag ohne Übersetzungen zurecht', () => {
    expect(germanSenses({ word: 'x', lang_code: 'en' })).toEqual({ senses: [], dropped: [] });
  });
});

describe('Verweise auf ein anderes Stichwort', () => {
  it('erkennt „A physician; …“ als Verweis auf physician', () => {
    expect(crossReferenceTarget(doctor.senses[0])).toBe('physician');
  });

  it('hält eine gewöhnliche Erklärung für keinen Verweis', () => {
    expect(crossReferenceTarget(limestone.senses[0])).toBeUndefined();
    expect(crossReferenceTarget(physician.senses[0])).toBeUndefined();
  });

  it('verlangt, dass der erste Teilsatz genau das Stichwort ist', () => {
    // „A physicist …“ darf nicht auf „physic“ zeigen.
    expect(
      crossReferenceTarget({ glosses: ['A physicist who studies matter.'], links: [['physic', 'physic']] }),
    ).toBeUndefined();
    // Und eine Erklärung, die mit dem Link *beginnt*, reicht ebenfalls nicht:
    // Genau daran ist ein lockererer Entwurf gescheitert.
    expect(
      crossReferenceTarget({
        glosses: ['A medical doctor trained in human medicine.'],
        links: [['medical', 'medical']],
      }),
    ).toBeUndefined();
  });

  it('lässt einen Mehrwortverweis zu, wenn der Teilsatz genau passt', () => {
    expect(
      crossReferenceTarget({ glosses: ['A shell shock case.'], links: [['shell shock', 'shell shock']] }),
    ).toBeUndefined();
    expect(
      crossReferenceTarget({ glosses: ['Shell shock.'], links: [['shell shock', 'shell shock']] }),
    ).toBe('shell shock');
  });

  it('übernimmt beim Auflösen die Bedeutungen des Ziels und merkt sich den Weg', () => {
    const entries = [readEntry(doctor), readEntry(physician)];
    const stats = resolveCrossReferences(entries);

    expect(stats.resolved).toBeGreaterThan(0);
    const arzt = entries[0].senses.find((s) => s.german.some((g) => g.german === 'Arzt'));
    expect(arzt).toBeDefined();
    expect(arzt.via).toBe('physician');
    // Die eigene Bedeutung bleibt erhalten und steht vorn.
    expect(entries[0].senses[0].german.map((g) => g.german)).toEqual(['Doktor', 'Doktorin']);
  });

  it('verlangt, dass das Ziel das verweisende Wort selbst nennt', () => {
    /*
      Die Gegenprobe auf ein echtes Synonym. `physician` wird erklärt als
      „A medical doctor trained in human medicine.“ und nennt damit `doctor`.
      Ein Oberbegriff tut das nicht – und genau daran ist ein früherer Entwurf
      gescheitert: `crow` („A bird of the genus Corvus“) erbte die
      Übersetzungen von `bird` und stand danach als „Vogel“ im Wörterbuch,
      `hour` als „Jahreszeit“ und `word` als „Bestellung“.
    */
    expect(mentions('a medical doctor trained in human medicine.', 'doctor')).toBe(true);
    expect(mentions('a member of the class aves.', 'crow')).toBe(false);
    // Wortgrenzen: „doctorate“ ist nicht „doctor“.
    expect(mentions('a doctorate holder', 'doctor')).toBe(false);
    expect(mentions('', 'doctor')).toBe(false);
  });

  it('lehnt einen Oberbegriff ab, statt ihn als Übersetzung zu übernehmen', () => {
    const crow = {
      word: 'crow',
      lang_code: 'en',
      pos: 'noun',
      // Der echte Wortlaut aus dem Datensatz – erst er erzeugt den Verweis.
      senses: [
        {
          glosses: ['A bird, usually black, of the genus Corvus, having a strong conical beak.'],
          links: [['bird', 'bird']],
        },
      ],
      translations: [{ code: 'de', sense: 'bird', tags: ['feminine'], word: 'Krähe' }],
    };
    const bird = {
      word: 'bird',
      lang_code: 'en',
      pos: 'noun',
      senses: [{ glosses: ['A member of the class Aves.'], links: [['class', 'class']] }],
      translations: [{ code: 'de', sense: 'animal', tags: ['masculine'], word: 'Vogel' }],
    };

    const entries = [readEntry(crow), readEntry(bird)];
    const stats = resolveCrossReferences(entries);

    expect(stats.rejected).toBe(1);
    expect(stats.resolved).toBe(0);
    expect(entries[0].senses.flatMap((s) => s.german.map((g) => g.german))).toEqual(['Krähe']);
  });

  it('bricht einen Zyklus ab, statt Bedeutungen im Kreis zu tauschen', () => {
    // Zwei Stichwörter, die sich gegenseitig als erste Bedeutung erklären.
    const macheteA = {
      word: 'sofa',
      lang_code: 'en',
      pos: 'noun',
      senses: [{ glosses: ['A couch, used for sitting.'], links: [['couch', 'couch']] }],
      translations: [{ code: 'de', sense: 'furniture', tags: ['neuter'], word: 'Sofa' }],
    };
    const macheteB = {
      word: 'couch',
      lang_code: 'en',
      pos: 'noun',
      senses: [{ glosses: ['A sofa, for reclining on.'], links: [['sofa', 'sofa']] }],
      translations: [{ code: 'de', sense: 'furniture', tags: ['feminine'], word: 'Couch' }],
    };

    const entries = [readEntry(macheteA), readEntry(macheteB)];
    const stats = resolveCrossReferences(entries);

    expect(stats.cycles).toBe(2);
    expect(stats.resolved).toBe(0);
    expect(entries[0].senses.every((s) => !('via' in s))).toBe(true);
    expect(entries[1].senses.every((s) => !('via' in s))).toBe(true);
  });

  it('erbt nur aus dem ursprünglichen Bestand, nicht aus Geerbtem', () => {
    /*
      A verweist auf B, B auf C. Ohne Schnappschuss könnte A – je nach
      Reihenfolge der Einträge – am Ende eine Bedeutung von C tragen. Das
      Ergebnis hinge dann daran, in welcher Reihenfolge die Quelle gelesen
      wurde, und wäre zwischen zwei Läufen nicht dasselbe.
    */
    const c = {
      word: 'gamma',
      lang_code: 'en',
      pos: 'noun',
      senses: [{ glosses: ['A third; the beta of the series.'], links: [['third', 'third']] }],
      translations: [{ code: 'de', sense: 'third', word: 'Gamma' }],
    };
    const b = {
      word: 'beta',
      lang_code: 'en',
      pos: 'noun',
      senses: [{ glosses: ['A gamma; another word for alpha.'], links: [['gamma', 'gamma']] }],
      translations: [{ code: 'de', sense: 'second', word: 'Beta' }],
    };
    const a = {
      word: 'alpha',
      lang_code: 'en',
      pos: 'noun',
      senses: [{ glosses: ['A beta; the alpha thing.'], links: [['beta', 'beta']] }],
      translations: [{ code: 'de', sense: 'first', word: 'Alpha' }],
    };

    const entries = [readEntry(a), readEntry(b), readEntry(c)];
    resolveCrossReferences(entries);

    const alphaGerman = entries[0].senses.flatMap((s) => s.german.map((g) => g.german));
    expect(alphaGerman).toContain('Alpha');
    expect(alphaGerman).toContain('Beta');
    // Aber nicht Gamma – das wäre Tiefe zwei.
    expect(alphaGerman).not.toContain('Gamma');
  });

  it('rät nicht, wenn keine Bedeutung erkennbar passt', () => {
    /*
      Aus der Messung am echten Datensatz: `fire` wird unter anderem als
      „A barrage.“ erklärt. `barrage` hat mehrere Bedeutungen, darunter das
      Stauwehr und das Sperrfeuer – und die kurze Glosse gibt kein einziges
      Wort her, an dem sich entscheiden ließe, welche gemeint ist. Der frühere
      Rückfall auf die erste Bedeutung machte aus `fire` ein „Stauwehr“.
    */
    const senses = [
      { sense: 'artificial obstruction such as a dam', german: [{ german: 'Stauwehr' }] },
      { sense: 'heavy curtain of artillery fire', german: [{ german: 'Sperrfeuer' }] },
    ];
    expect(bestMatchingSense('A barrage.', senses)).toBeUndefined();
    // Sobald ein Wort trägt, wird wieder entschieden.
    expect(bestMatchingSense('A barrage of artillery.', senses)?.german[0].german).toBe('Sperrfeuer');
    // Ein eindeutiges Ziel braucht keine Überschneidung.
    expect(bestMatchingSense('A barrage.', [senses[0]])?.german[0].german).toBe('Stauwehr');
  });

  it('erbt nichts über die Wortart hinweg', () => {
    const verb = { ...physician, pos: 'verb' };
    const entries = [readEntry(doctor), readEntry(verb)];
    const stats = resolveCrossReferences(entries);
    expect(stats.resolved).toBe(0);
    expect(stats.unresolved).toBe(1);
  });

  it('lässt einen unauflösbaren Verweis unauflösbar, statt zu raten', () => {
    const entries = [readEntry(doctor)];
    expect(resolveCrossReferences(entries)).toMatchObject({ resolved: 0, unresolved: 1, rejected: 0, cycles: 0 });
    expect(entries[0].senses.map((s) => s.sense)).toEqual(['person who has attained a doctorate']);
  });
});

describe('Flexionsformen', () => {
  it('erkennt islands als Form von island', () => {
    expect(lemmaOfForm(islands)).toEqual({ lemma: 'island', tags: ['plural'] });
  });

  it('liefert für ein Grundwort keine Form', () => {
    expect(lemmaOfForm(limestone)).toBeUndefined();
  });

  it('ignoriert einen Selbstverweis', () => {
    const self = { word: 'island', senses: [{ tags: ['form-of'], form_of: [{ word: 'island' }] }] };
    expect(lemmaOfForm(self)).toBeUndefined();
  });

  it('gibt die Form als eigene Art zurück', () => {
    expect(readEntry(islands)).toEqual({
      kind: 'form',
      word: 'islands',
      pos: 'noun',
      lemma: 'island',
      tags: ['plural'],
    });
  });

  it('hält ein Stichwort mit eigener Übersetzung nicht für eine Form', () => {
    /*
      Der echte Eintrag `island` (Substantiv) hat zehn Bedeutungen, davon eine
      als Ellipse von „kitchen island“ markiert. Ein früherer Entwurf prüfte
      zuerst auf `alt-of` und verlor darüber das ganze Stichwort samt „Insel“.
      Derselbe Fall trifft `casualty` („Verkürzung von casualty department“).
    */
    const islandNoun = {
      word: 'island',
      lang_code: 'en',
      pos: 'noun',
      senses: [
        { glosses: ['A contiguous area of land, smaller than a continent, surrounded by water.'] },
        {
          glosses: ['A bench, counter, etc., that is not connected to a wall or other furniture.'],
          tags: ['abbreviation', 'alt-of', 'broadly', 'ellipsis'],
          alt_of: [{ word: 'kitchen island' }],
        },
      ],
      translations: [
        {
          code: 'de',
          sense: 'area of land completely surrounded by water',
          tags: ['feminine'],
          word: 'Insel',
        },
      ],
    };

    const entry = readEntry(islandNoun);
    expect(entry.kind).toBe('entry');
    expect(entry.senses[0].german[0]).toMatchObject({ german: 'Insel', gender: 'f' });
  });
});

describe('Einen Rohsatz lesen', () => {
  it('übergeht alles, was nicht englisch ist', () => {
    expect(readEntry({ ...limestone, lang_code: 'de' })).toBeUndefined();
    expect(readEntry(undefined)).toBeUndefined();
    expect(readEntry({ lang_code: 'en' })).toBeUndefined();
  });

  it('übergeht englische Einträge ohne Deutsch und ohne Verweis', () => {
    expect(readEntry({ word: 'x', lang_code: 'en', pos: 'noun', translations: [{ code: 'fr', word: 'y' }] })).toBeUndefined();
  });

  it('kennzeichnet ein Mehrwortstichwort', () => {
    const entry = readEntry(shellShock);
    expect(entry.multiword).toBe(true);
    expect(entry.senses[0].german[0].german).toBe('Kriegszitterer');
  });

  it('überlebt einen fehlerhaften Eintrag, statt den Lauf abzubrechen', () => {
    expect(readEntry({ word: 'kaputt', lang_code: 'en', pos: 'noun', translations: 'keine Liste' })).toBeUndefined();
    expect(readEntry({ word: 'kaputt', lang_code: 'en', pos: 'noun', senses: 'keine Liste' })).toBeUndefined();
    expect(() => readEntry({ word: 'x', lang_code: 'en', translations: [null] })).not.toThrow();
  });
});
