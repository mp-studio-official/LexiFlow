import { describe, expect, it } from 'vitest';
import {
  FELDGRENZEN,
  VOCABPACK_FORMAT_VERSION,
  VOCABPACK_KIND,
  vocabEntrySchema,
  vocabPackFileSchema,
  type VocabEntry,
  type VocabPack,
} from './schema';
import { FLEXION_GRENZEN, flexionSchema } from './flexion';
import { detectFormatVersion, migrateToCurrent, UnsupportedFormatVersionError } from './migrations';
import { parsePackFile, serializePack, toPackFile } from './vocabpack';
import { alsVersion2, VERLUSTARTEN, serialisiereAlsVersion2 } from './rueckwaertsexport';

/**
 * Schemafassung 3 (5B.8) — Modell, Migration, Export, Rückwärtsexport.
 *
 * Kein Bildschirm. Was hier geprüft wird, ist das Format: was es zulässt, was
 * es ablehnt, und was beim Weg zurück auf Fassung 2 verlorengeht.
 */

const JETZT = '2026-10-04T09:00:00.000Z';

function meta() {
  return {
    id: 'pack-told',
    title: 'Unit 3 – City life',
    topic: '',
    grade: '7' as const,
    cefrLevel: 'A2' as const,
    cefrLevelOverridden: false,
    direction: 'both' as const,
    createdAt: JETZT,
    updatedAt: JETZT,
  };
}

function eintrag(teil: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id: 'v-1',
    english: 'to tell sb. sth.',
    germanAnswers: ['jemandem etwas erzählen'],
    acceptedEnglishAnswers: [],
    exampleSentences: [],
    topicTags: [],
    sourceType: 'import',
    ...teil,
  } as VocabEntry;
}

/* ====================================== Die Versionskonstante =========== */

describe('Die aktuelle Fassung', () => {
  it('ist 3', () => {
    expect(VOCABPACK_FORMAT_VERSION).toBe(3);
  });
});

/* ====================================== Der Fall `told` ================= */

describe('Der Vertragsfall `told`', () => {
  /**
   * Das Beispiel aus dem Konzept, Feld für Feld.
   *
   * Es steht hier als **ein** Test und nicht verteilt über fünf: Was es
   * zeigt, ist das Zusammenspiel — die Lernform bleibt die Grundform, die
   * Fundstelle nennt die gefundene Form, der Hinweis erklärt sie in Worten,
   * die Flexion macht sie maschinenlesbar, und die Übersetzung hängt an
   * keinem davon.
   */
  const TOLD: VocabEntry = eintrag({
    english: 'to tell sb. sth.',
    germanAnswers: ['jemandem etwas erzählen'],
    partOfSpeech: 'verb',
    occurrence: 'told',
    grammarNote: 'Past Simple von to tell sb. sth.',
    sourceSentence: 'The man told a story.',
    inflection: {
      kind: 'verb',
      base: 'tell',
      pastSimple: 'told',
      pastParticiple: 'told',
      irregular: true,
    },
  });

  it('wird vollständig angenommen', () => {
    const geprueft = vocabEntrySchema.parse(TOLD);

    expect(geprueft.english).toBe('to tell sb. sth.');
    expect(geprueft.occurrence).toBe('told');
    expect(geprueft.grammarNote).toBe('Past Simple von to tell sb. sth.');
    expect(geprueft.sourceSentence).toBe('The man told a story.');
    expect(geprueft.partOfSpeech).toBe('verb');
    expect(geprueft.inflection).toEqual({
      kind: 'verb',
      base: 'tell',
      pastSimple: 'told',
      pastParticiple: 'told',
      irregular: true,
    });
  });

  it('lässt die Übersetzung unberührt', () => {
    // Die Grammatik hängt am Wort, nicht an seiner Bedeutung.
    expect(vocabEntrySchema.parse(TOLD).germanAnswers).toEqual(['jemandem etwas erzählen']);
  });

  it('überlebt einen vollständigen Umlauf durch Datei und Import', () => {
    const pack: VocabPack = { meta: meta(), entries: [TOLD] };
    const gelesen = parsePackFile(serializePack(pack));
    expect(gelesen.ok).toBe(true);
    if (!gelesen.ok) return;

    expect(gelesen.pack.formatVersion).toBe(3);
    expect(gelesen.pack.entries[0]).toMatchObject({
      english: 'to tell sb. sth.',
      occurrence: 'told',
      grammarNote: 'Past Simple von to tell sb. sth.',
      sourceSentence: 'The man told a story.',
      inflection: { kind: 'verb', base: 'tell', pastSimple: 'told', irregular: true },
    });
  });
});

/* ====================================== Die Wortarten =================== */

describe('Verb', () => {
  const vollstaendig = {
    kind: 'verb' as const,
    base: 'tell',
    pastSimple: 'told',
    pastParticiple: 'told',
    irregular: true,
  };

  it('nimmt die Zusatzformen und den Anhang an', () => {
    expect(
      flexionSchema.parse({
        ...vollstaendig,
        thirdPerson: 'tells',
        presentParticiple: 'telling',
        particle: 'up',
        preposition: 'forward to',
      }),
    ).toMatchObject({ thirdPerson: 'tells', particle: 'up', preposition: 'forward to' });
  });

  it('verlangt alle drei Pflichtformen', () => {
    for (const fehlt of ['base', 'pastSimple', 'pastParticiple'] as const) {
      const unvollstaendig: Record<string, unknown> = { ...vollstaendig };
      delete unvollstaendig[fehlt];
      expect(flexionSchema.safeParse(unvollstaendig).success, `${fehlt} fehlt`).toBe(false);
    }
  });

  it('nimmt eine leere Pflichtform nicht als Angabe', () => {
    expect(flexionSchema.safeParse({ ...vollstaendig, pastSimple: '   ' }).success).toBe(false);
  });

  it('verlangt `irregular` ausdrücklich', () => {
    const ohne: Record<string, unknown> = { ...vollstaendig };
    delete ohne['irregular'];
    expect(flexionSchema.safeParse(ohne).success).toBe(false);
  });
});

describe('Substantiv', () => {
  it('nimmt ein reguläres Substantiv mit Singular und Plural an', () => {
    expect(
      flexionSchema.parse({ kind: 'noun', singular: 'child', plural: 'children' }),
    ).toEqual({ kind: 'noun', singular: 'child', plural: 'children' });
  });

  it('verlangt beim regulären Substantiv beide Formen', () => {
    expect(flexionSchema.safeParse({ kind: 'noun', singular: 'child' }).success).toBe(false);
    expect(flexionSchema.safeParse({ kind: 'noun', plural: 'children' }).success).toBe(false);
  });

  it('nimmt ein unzählbares Substantiv ohne Plural an', () => {
    expect(
      flexionSchema.parse({ kind: 'noun', singular: 'information', uncountable: true }),
    ).toMatchObject({ singular: 'information', uncountable: true });
  });

  it('lehnt einen erfundenen Plural beim unzählbaren Substantiv ab', () => {
    /*
      `informations` ist genau die Form, die niemand lernen soll. Ein
      optionales Feld liesse sie durch; ein verbotenes macht aus dem
      Versehen einen Fehler.
    */
    const abgelehnt = flexionSchema.safeParse({
      kind: 'noun',
      singular: 'information',
      plural: 'informations',
      uncountable: true,
    });
    expect(abgelehnt.success).toBe(false);
  });

  it('nimmt ein Pluraliatantum ohne Singular an', () => {
    expect(
      flexionSchema.parse({ kind: 'noun', plural: 'restraints', pluralOnly: true }),
    ).toMatchObject({ plural: 'restraints', pluralOnly: true });
  });

  it('lehnt einen erfundenen Singular beim Pluraliatantum ab', () => {
    expect(
      flexionSchema.safeParse({
        kind: 'noun',
        singular: 'restraint',
        plural: 'restraints',
        pluralOnly: true,
      }).success,
    ).toBe(false);
  });

  it('lehnt `uncountable` und `pluralOnly` zusammen ab', () => {
    const abgelehnt = flexionSchema.safeParse({
      kind: 'noun',
      singular: 'information',
      uncountable: true,
      pluralOnly: true,
    });
    expect(abgelehnt.success).toBe(false);
    if (abgelehnt.success) return;
    expect(abgelehnt.error.issues[0]?.message).toMatch(/nicht gleichzeitig/);
  });
});

describe('Adjektiv', () => {
  it('nimmt beide Steigerungsformen an', () => {
    expect(
      flexionSchema.parse({ kind: 'adjective', comparative: 'better', superlative: 'best' }),
    ).toEqual({ kind: 'adjective', comparative: 'better', superlative: 'best' });
  });

  it('nimmt ein Adjektiv ohne Steigerung an', () => {
    // `unique` hat keine. Eine zu verlangen hiesse, sie zu erfinden.
    expect(flexionSchema.parse({ kind: 'adjective' })).toEqual({ kind: 'adjective' });
  });

  it('nimmt auch nur eine der beiden Formen an', () => {
    expect(flexionSchema.parse({ kind: 'adjective', comparative: 'further' })).toMatchObject({
      comparative: 'further',
    });
  });
});

describe('Die Flexionsart ist eine Vereinigung, kein Sack voller Felder', () => {
  it('kennt beim Substantiv keine Verbfelder', () => {
    expect(
      flexionSchema.safeParse({
        kind: 'noun',
        singular: 'child',
        plural: 'children',
        pastSimple: 'childed',
      }).success,
    ).toBe(false);
  });

  it('lehnt eine unbekannte Art ab', () => {
    expect(flexionSchema.safeParse({ kind: 'adverb', base: 'quickly' }).success).toBe(false);
  });
});

/* ====================================== Wortart und Flexion ============= */

describe('Wortart und Flexionsart', () => {
  const verbflexion = {
    kind: 'verb' as const,
    base: 'tell',
    pastSimple: 'told',
    pastParticiple: 'told',
    irregular: true,
  };

  it('dürfen sich nicht widersprechen', () => {
    const abgelehnt = vocabEntrySchema.safeParse(
      eintrag({ partOfSpeech: 'noun', inflection: verbflexion }),
    );
    expect(abgelehnt.success).toBe(false);
    if (abgelehnt.success) return;
    expect(abgelehnt.error.issues.some((i) => /passt nicht zur Flexionsangabe/.test(i.message))).toBe(
      true,
    );
  });

  it('passen zusammen, wenn sie dasselbe sagen', () => {
    expect(
      vocabEntrySchema.safeParse(eintrag({ partOfSpeech: 'verb', inflection: verbflexion })).success,
    ).toBe(true);
  });

  it('lassen einen Eintrag ohne Wortart gelten', () => {
    /*
      Bestehende Pakete tragen oft keine `partOfSpeech`. Eine Flexionsangabe
      ohne Wortart ist dort der Normalfall und kein Widerspruch.
    */
    expect(vocabEntrySchema.safeParse(eintrag({ inflection: verbflexion })).success).toBe(true);
  });

  it('lassen eine Wortart ohne Flexion gelten', () => {
    expect(vocabEntrySchema.safeParse(eintrag({ partOfSpeech: 'phrase' })).success).toBe(true);
  });
});

/* ====================================== Längen und leere Angaben ======== */

describe('Längen und leere Angaben', () => {
  it('hält die Grenzen an einer Stelle', () => {
    expect(FELDGRENZEN).toEqual({ occurrence: 200, grammarNote: 400, sourceSentence: 400 });
    expect(FLEXION_GRENZEN).toEqual({ form: 80, anhang: 40 });
  });

  it('lehnt zu lange Angaben ab', () => {
    for (const [feld, grenze] of Object.entries(FELDGRENZEN)) {
      const zuLang = 'x'.repeat(grenze + 1);
      expect(
        vocabEntrySchema.safeParse(eintrag({ [feld]: zuLang } as Partial<VocabEntry>)).success,
        `${feld} zu lang`,
      ).toBe(false);
    }
    expect(
      flexionSchema.safeParse({
        kind: 'noun',
        singular: 'x'.repeat(FLEXION_GRENZEN.form + 1),
        plural: 'xs',
      }).success,
    ).toBe(false);
  });

  it('speichert eine leere Zeichenkette nicht als Angabe', () => {
    /*
      Eine leere Zelle in einer Tabelle ist nicht die Aussage „hier steht
      nichts", sondern die Abwesenheit einer Aussage. Sie verschwindet,
      statt den Import scheitern zu lassen.
    */
    const geprueft = vocabEntrySchema.parse(
      eintrag({ occurrence: '', grammarNote: '   ', sourceSentence: '' } as Partial<VocabEntry>),
    );
    expect(geprueft.occurrence).toBeUndefined();
    expect(geprueft.grammarNote).toBeUndefined();
    expect(geprueft.sourceSentence).toBeUndefined();

    /*
      Und in der Datei steht der Schlüssel dann gar nicht. Am Ergebnis
      geprüft und nicht am Objekt: Zod lässt den Schlüssel mit dem Wert
      `undefined` stehen, `JSON.stringify` lässt ihn weg — und was gespeichert
      wird, ist die Datei.
    */
    const text = serializePack({ meta: meta(), entries: [geprueft] });
    expect(text).not.toContain('occurrence');
    expect(text).not.toContain('grammarNote');
    expect(text).not.toContain('sourceSentence');
  });

  it('trimmt, was stehen bleibt', () => {
    expect(vocabEntrySchema.parse(eintrag({ occurrence: '  told  ' })).occurrence).toBe('told');
  });
});

/* ====================================== Die Migrationskette ============= */

describe('Jede historische Fassung kommt bis 3', () => {
  it('hebt eine Datei der Fassung 0 an', () => {
    const alt = {
      title: 'Altes Paket',
      grade: '7',
      vocabulary: [{ en: 'crowded', de: 'überfüllt' }],
    };
    const gehoben = migrateToCurrent(alt) as Record<string, unknown>;
    expect(detectFormatVersion(gehoben)).toBe(3);
    expect(vocabPackFileSchema.safeParse(gehoben).success).toBe(true);
  });

  it('hebt eine Datei der Fassung 1 an', () => {
    const datei = {
      kind: VOCABPACK_KIND,
      formatVersion: 1,
      meta: meta(),
      entries: [eintrag()],
    };
    expect(detectFormatVersion(migrateToCurrent(datei))).toBe(3);
  });

  it('hebt eine Datei der Fassung 2 an – und ändert sonst nichts', () => {
    const datei = {
      kind: VOCABPACK_KIND,
      formatVersion: 2,
      meta: meta(),
      entries: [eintrag({ partOfSpeech: 'verb', lemma: 'tell' })],
    };
    const vorher = JSON.parse(JSON.stringify(datei)) as unknown;

    const gehoben = migrateToCurrent(datei) as Record<string, unknown>;
    expect(gehoben['formatVersion']).toBe(3);

    // Alles ausser der Versionsnummer ist Zeichen für Zeichen dasselbe.
    expect({ ...gehoben, formatVersion: 2 }).toEqual(vorher);
    // Und das Quelldokument selbst ist unberührt.
    expect(datei).toEqual(vorher);
  });

  it('erfindet beim Schritt 2 → 3 keine Grammatik', () => {
    /*
      Die Zeile, auf die es ankommt. Aus `to tell` liesse sich `telled`
      bilden, aus `information` ein `informations`, aus `to look up` eine
      Partikel. Jedes davon wäre geraten — und zwar still.
    */
    const datei = {
      kind: VOCABPACK_KIND,
      formatVersion: 2,
      meta: meta(),
      entries: [eintrag({ partOfSpeech: 'verb', english: 'to tell sb. sth.' })],
    };
    const gehoben = migrateToCurrent(datei) as { entries: Record<string, unknown>[] };
    const erster = gehoben.entries[0]!;

    for (const feld of ['occurrence', 'grammarNote', 'sourceSentence', 'inflection']) {
      expect(erster[feld], `${feld} wurde erfunden`).toBeUndefined();
    }
  });

  it('lehnt eine Zukunftsfassung ab', () => {
    const zukunft = { kind: VOCABPACK_KIND, formatVersion: 4, meta: meta(), entries: [eintrag()] };
    expect(() => migrateToCurrent(zukunft)).toThrow(UnsupportedFormatVersionError);
  });

  it('ist über den Importweg wiederholbar', () => {
    /*
      Idempotenz: Einmal gehoben und noch einmal gehoben ist dasselbe. Ohne
      diese Eigenschaft änderte ein zweiter Import eine Datei, die schon in
      Ordnung war.
    */
    const datei = {
      kind: VOCABPACK_KIND,
      formatVersion: 2,
      meta: meta(),
      entries: [eintrag()],
    };
    const einmal = migrateToCurrent(datei);
    const zweimal = migrateToCurrent(einmal);
    expect(zweimal).toEqual(einmal);
  });
});

/* ====================================== Export in Fassung 3 ============= */

describe('Der Standardexport', () => {
  it('schreibt Fassung 3 und erhält alle neuen Felder', () => {
    const pack: VocabPack = {
      meta: meta(),
      entries: [
        eintrag({
          occurrence: 'told',
          grammarNote: 'Past Simple von to tell sb. sth.',
          sourceSentence: 'The man told a story.',
          partOfSpeech: 'verb',
          inflection: {
            kind: 'verb',
            base: 'tell',
            pastSimple: 'told',
            pastParticiple: 'told',
            irregular: true,
          },
        }),
      ],
    };
    const datei = toPackFile(pack);
    expect(datei.formatVersion).toBe(3);
    expect(datei.entries[0]).toMatchObject({
      occurrence: 'told',
      grammarNote: 'Past Simple von to tell sb. sth.',
      sourceSentence: 'The man told a story.',
      inflection: { kind: 'verb', irregular: true },
    });
  });
});

/* ====================================== Rückwärtsexport 3 → 2 =========== */

describe('Der Rückwärtsexport auf Fassung 2', () => {
  function paketMitGrammatik(): VocabPack {
    return {
      meta: meta(),
      entries: [
        eintrag({
          id: 'v-told',
          english: 'to tell sb. sth.',
          partOfSpeech: 'verb',
          lemma: 'tell',
          complementPattern: 'sb. sth.',
          occurrence: 'told',
          grammarNote: 'Past Simple von to tell sb. sth.',
          sourceSentence: 'The man told a story.',
          exampleSentences: [{ english: 'The man told a story.' }],
          topicTags: ['city'],
          inflection: {
            kind: 'verb',
            base: 'tell',
            pastSimple: 'told',
            pastParticiple: 'told',
            irregular: true,
          },
        }),
        eintrag({
          id: 'v-child',
          english: 'child',
          germanAnswers: ['Kind'],
          partOfSpeech: 'noun',
          inflection: { kind: 'noun', singular: 'child', plural: 'children' },
        }),
        eintrag({ id: 'v-crowded', english: 'crowded', germanAnswers: ['überfüllt'] }),
      ],
    };
  }

  it('entfernt genau die vier Felder der Fassung 3', () => {
    const { datei } = alsVersion2(paketMitGrammatik());
    expect(datei.formatVersion).toBe(2);
    for (const eintragDerDatei of datei.entries) {
      for (const art of VERLUSTARTEN) {
        expect(art in eintragDerDatei, `${art} steht noch da`).toBe(false);
      }
    }
  });

  it('erhält Lernform, Übersetzungen, Wortart, Beispiele, Metadaten und Kennungen', () => {
    const pack = paketMitGrammatik();
    const { datei } = alsVersion2(pack);

    expect(datei.meta).toEqual(pack.meta);
    expect(datei.entries.map((e) => e.id)).toEqual(['v-told', 'v-child', 'v-crowded']);

    const told = datei.entries[0]!;
    expect(told.english).toBe('to tell sb. sth.');
    expect(told.germanAnswers).toEqual(['jemandem etwas erzählen']);
    expect(told.partOfSpeech).toBe('verb');
    expect(told.lemma).toBe('tell');
    expect(told.complementPattern).toBe('sb. sth.');
    expect(told.exampleSentences).toEqual([{ english: 'The man told a story.' }]);
    expect(told.topicTags).toEqual(['city']);
    expect(told.sourceType).toBe('import');
  });

  it('verändert das Ursprungspaket nicht', () => {
    const pack = paketMitGrammatik();
    const vorher = JSON.parse(JSON.stringify(pack)) as unknown;
    alsVersion2(pack);
    expect(JSON.parse(JSON.stringify(pack))).toEqual(vorher);
    expect(pack.entries[0]!.occurrence).toBe('told');
  });

  it('nennt die betroffenen Einträge und die Arten', () => {
    const { verlust } = alsVersion2(paketMitGrammatik());

    expect(verlust.verliert).toBe(true);
    expect(verlust.eintraege.map((e) => e.entryId)).toEqual(['v-told', 'v-child']);
    expect(verlust.eintraege[0]).toEqual({
      entryId: 'v-told',
      english: 'to tell sb. sth.',
      arten: ['occurrence', 'grammarNote', 'sourceSentence', 'inflection'],
    });
    expect(verlust.eintraege[1]!.arten).toEqual(['inflection']);
    expect(verlust.arten).toEqual([
      'occurrence',
      'grammarNote',
      'sourceSentence',
      'inflection',
    ]);
  });

  it('warnt nicht, wenn ein Fassung-3-Paket keine neuen Felder trägt', () => {
    /*
      Der häufigste Fall: ein altes Paket, durch die Migration auf 3
      gehoben, ohne eine einzige Grammatikangabe. Eine Warnung davor wäre
      falsch — und sie wäre die Warnung, die man nach dem dritten Mal
      wegklickt, ohne sie zu lesen.
    */
    const pack: VocabPack = { meta: meta(), entries: [eintrag(), eintrag({ id: 'v-2' })] };
    const { verlust, datei } = alsVersion2(pack);
    expect(verlust.verliert).toBe(false);
    expect(verlust.eintraege).toEqual([]);
    expect(verlust.arten).toEqual([]);
    expect(datei.formatVersion).toBe(2);
  });

  it('erzeugt eine Datei, die sich wieder importieren lässt', () => {
    const { text } = serialisiereAlsVersion2(paketMitGrammatik());
    const gelesen = parsePackFile(text);
    expect(gelesen.ok).toBe(true);
    if (!gelesen.ok) return;

    // Beim Import wird sie wieder auf 3 gehoben – ohne Grammatikangaben.
    expect(gelesen.pack.formatVersion).toBe(3);
    expect(gelesen.pack.entries[0]!.english).toBe('to tell sb. sth.');
    expect(gelesen.pack.entries[0]!.occurrence).toBeUndefined();
    expect(gelesen.pack.entries[0]!.inflection).toBeUndefined();
  });
});
