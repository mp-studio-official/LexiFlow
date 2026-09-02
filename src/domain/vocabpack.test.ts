import { describe, expect, it } from 'vitest';
import { countClozeReady, parsePackFile, serializePack, suggestFilename, toPackFile } from './vocabpack';
import { VOCABPACK_FORMAT_VERSION, VOCABPACK_KIND } from './schema';
import { makePack } from '../test/fixtures';

describe('Export/Import-Rundlauf', () => {
  it('erhält Metadaten und Einträge unverändert', () => {
    const pack = makePack();
    const parsed = parsePackFile(serializePack(pack));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.meta).toEqual(pack.meta);
    expect(parsed.pack.entries).toEqual(pack.entries);
    expect(parsed.pack.formatVersion).toBe(VOCABPACK_FORMAT_VERSION);
    expect(parsed.pack.kind).toBe(VOCABPACK_KIND);
  });

  it('exportiert keine Lernstände', () => {
    const serialized = serializePack(makePack());
    expect(serialized).not.toMatch(/box|dueAt|streak|correctCount/i);
  });

  it('meldet ungültiges JSON verständlich', () => {
    const result = parsePackFile('{ kaputt');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/JSON/);
  });

  it('meldet fehlende Pflichtfelder mit Pfad', () => {
    const broken = toPackFile(makePack()) as unknown as Record<string, unknown>;
    const entries = [...(broken['entries'] as unknown[])];
    entries[0] = { ...(entries[0] as object), germanAnswers: [] };
    const result = parsePackFile(JSON.stringify({ ...broken, entries }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/entries\.0\.germanAnswers/);
  });
});

describe('Migration älterer Dateien', () => {
  it('hebt ein Dokument ohne Format-Version auf die aktuelle Version', () => {
    const legacy = {
      title: 'Alte Liste',
      grade: '8',
      entries: [
        { en: 'crowded', german: 'überfüllt' },
        { en: 'litter', german: ['Müll', 'Abfall'] },
      ],
    };
    const result = parsePackFile(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.formatVersion).toBe(VOCABPACK_FORMAT_VERSION);
    expect(result.pack.meta.title).toBe('Alte Liste');
    expect(result.pack.meta.grade).toBe('8');
    expect(result.pack.meta.cefrLevel).toBe('A2/B1');
    expect(result.pack.entries[0]?.germanAnswers).toEqual(['überfüllt']);
    expect(result.pack.entries[1]?.germanAnswers).toEqual(['Müll', 'Abfall']);
    expect(result.pack.entries[0]?.sourceType).toBe('import');
  });

  it('lehnt neuere Format-Versionen ab, statt Daten zu verlieren', () => {
    const future = { ...toPackFile(makePack()), formatVersion: 99 };
    const result = parsePackFile(JSON.stringify(future));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/Version 99/);
  });

  it('akzeptiert Beispielsätze als einfache Zeichenkette', () => {
    const legacy = {
      title: 'Sätze',
      grade: '6',
      entries: [{ en: 'quiet', german: 'ruhig', examples: ['It is quiet here.'] }],
    };
    const result = parsePackFile(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.entries[0]?.exampleSentences[0]?.english).toBe('It is quiet here.');
  });
});

describe('suggestFilename', () => {
  it('erzeugt einen sprechenden, sicheren Dateinamen', () => {
    expect(suggestFilename({ title: 'Unit 3 – Sports & Fun', grade: 'Q1' })).toBe(
      'unit-3-sports-fun-q1.vocabpack.json',
    );
  });

  it('ersetzt Umlaute', () => {
    expect(suggestFilename({ title: 'Über Bäume', grade: '5' })).toBe('ueber-baeume-5.vocabpack.json');
  });
});

describe('countClozeReady', () => {
  it('zählt nur Einträge mit brauchbarem Beispielsatz', () => {
    expect(countClozeReady(makePack().entries)).toBe(4);
  });
});

describe('Formatversion 1 bleibt verlustfrei lesbar', () => {
  /*
    Sprint 4B.2 hebt das Austauschformat auf Version 2 – strukturierte
    Lernformen, verbundene Wortarten. Alle neuen Felder sind optional, eine
    Datei der Version 1 ist inhaltlich also bereits eine gültige Datei der
    Version 2.

    Diese Tests halten fest, dass die Migration genau das tut und **nichts
    weiter**: keine abgeleiteten Lemmata, keine geratenen Pluralformen, keine
    stillschweigend erzeugten Gruppen. Was in der alten Datei stand, steht
    hinterher unverändert da.
  */
  const v1Datei = {
    kind: 'lexiflow.vocabpack',
    formatVersion: 1,
    meta: {
      id: 'p1',
      title: 'Unit 3 – City life',
      topic: 'City life',
      grade: '7',
      cefrLevel: 'A2+',
      cefrLevelOverridden: false,
      direction: 'both',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-02T10:00:00.000Z',
    },
    entries: [
      {
        id: 'e1',
        english: 'to apologise',
        germanAnswers: ['sich entschuldigen'],
        acceptedEnglishAnswers: ['to apologize'],
        partOfSpeech: 'verb',
        exampleSentences: [{ english: 'You should apologise.' }],
        topicTags: ['school'],
        difficulty: 3,
        sourceType: 'import',
      },
      {
        id: 'e2',
        english: 'crowded',
        germanAnswers: ['überfüllt, voll besetzt'],
        acceptedEnglishAnswers: [],
        exampleSentences: [],
        topicTags: [],
        sourceType: 'manual',
      },
    ],
  };

  it('liest eine Version-1-Datei und hebt nur die Versionsnummer an', () => {
    const result = parsePackFile(JSON.stringify(v1Datei));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.formatVersion).toBe(VOCABPACK_FORMAT_VERSION);
    expect(result.pack.meta).toEqual(v1Datei.meta);
  });

  it('lässt jeden Eintragswert unverändert', () => {
    const result = parsePackFile(JSON.stringify(v1Datei));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [erster, zweiter] = result.pack.entries;

    expect(erster?.english).toBe('to apologise');
    expect(erster?.germanAnswers).toEqual(['sich entschuldigen']);
    expect(erster?.acceptedEnglishAnswers).toEqual(['to apologize']);
    expect(erster?.difficulty).toBe(3);

    // Und der Komma-Fall: Er war eine Antwort und bleibt eine.
    expect(zweiter?.germanAnswers).toEqual(['überfüllt, voll besetzt']);
  });

  it('erfindet keine neuen Felder', () => {
    const result = parsePackFile(JSON.stringify(v1Datei));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const entry of result.pack.entries) {
      expect(entry.lemma).toBeUndefined();
      expect(entry.complementPattern).toBeUndefined();
      expect(entry.grammaticalNumber).toBeUndefined();
      expect(entry.lexicalGroupId).toBeUndefined();
    }
  });

  it('überlebt einen vollständigen Rundlauf', () => {
    const gelesen = parsePackFile(JSON.stringify(v1Datei));
    expect(gelesen.ok).toBe(true);
    if (!gelesen.ok) return;
    const erneut = parsePackFile(
      serializePack({ meta: gelesen.pack.meta, entries: gelesen.pack.entries }),
    );
    expect(erneut.ok).toBe(true);
    if (!erneut.ok) return;
    expect(erneut.pack.entries).toEqual(gelesen.pack.entries);
  });
});

describe('Strukturierte Lernformen im Format', () => {
  it('nimmt Lemma, Valenzmuster, Zahl und Gruppe auf und gibt sie zurück', () => {
    const pack = makePack();
    const angereichert = {
      meta: pack.meta,
      entries: [
        {
          ...pack.entries[0]!,
          english: 'to accuse sb. of sth.',
          lemma: 'accuse',
          complementPattern: 'sb. of sth.',
          partOfSpeech: 'verb' as const,
          lexicalGroupId: 'g1',
        },
        {
          ...pack.entries[1]!,
          english: 'restraints (pl.)',
          lemma: 'restraint',
          grammaticalNumber: 'plural' as const,
          partOfSpeech: 'noun' as const,
          lexicalGroupId: 'g1',
        },
      ],
    };
    const result = parsePackFile(serializePack(angereichert));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.entries).toEqual(angereichert.entries);
  });
});
