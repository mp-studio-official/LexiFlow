import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData } from '../data/db';
import { getPack, savePack } from '../data/packRepo';
import { parsePackFile, serializePack } from '../domain/vocabpack';
import { buildTask } from '../domain/exercises';
import { checkTaskAnswer } from '../domain/selfTest';
import { answersFor, buildStudyCard, matchesQuery } from '../domain/studyView';
import { checkAnswer } from '../domain/answerCheck';
import { mulberry32 } from '../domain/exercises';
import { draftsToEntries, emptyDraft, validateDrafts } from './draft';
import type { VocabEntry, VocabPack } from '../domain/schema';

/**
 * **Akzeptanzkriterium Block A: die vollständige englische Lernform.**
 *
 * Die Forderung war nicht „irgendwo steht die richtige Form“, sondern: sie
 * überlebt die **ganze Kette** – Entwurf, gespeichertes Paket, Karten,
 * Durchsehen, Selbsttest, Export und erneuter Import. Genau daran ist so
 * etwas sonst gescheitert: Eine Stelle baut `to depend on sb./sth.`, eine
 * andere speichert das Lemma, und auf der Karte steht am Ende `depend`.
 *
 * Die Beispiele sind wörtlich die aus der Anforderung. Wer diese Datei liest,
 * sieht, was das Produkt zusagt – und was es ausdrücklich nicht zusagt.
 */

/** Die acht Fälle der Anforderung, als fertige Lernformen. */
const CASES: readonly {
  english: string;
  lemma: string;
  german: string;
  /** Antworten, die gelten müssen. */
  gilt: readonly string[];
  /** Antworten, die **nicht** gelten dürfen. */
  giltNicht: readonly string[];
}[] = [
  {
    english: 'to coin a phrase / term',
    lemma: 'coin',
    german: 'einen Begriff, eine Redewendung prägen',
    gilt: ['to coin a phrase / term', 'to coin a phrase', 'coin a term', 'to coin a phrase/term'],
    giltNicht: ['to coin', 'coin'],
  },
  {
    english: 'to single out sb./sth.',
    lemma: 'single out',
    german: 'jdn./etw. herausgreifen',
    gilt: ['to single out sb./sth.', 'to single out', 'single out', 'to single out somebody/something'],
    giltNicht: ['to single', 'single'],
  },
  {
    english: 'to depend on sb./sth.',
    lemma: 'depend',
    german: 'von jdm./etw. abhängen',
    gilt: ['to depend on sb./sth.', 'to depend on', 'depend on'],
    giltNicht: ['to depend', 'depend'],
  },
  {
    english: 'to surmount obstacles',
    lemma: 'surmount',
    german: 'Hindernisse überwinden',
    gilt: ['to surmount obstacles', 'surmount obstacles'],
    giltNicht: ['to surmount', 'surmount'],
  },
  {
    english: 'to endure',
    lemma: 'endure',
    german: 'ertragen; aushalten',
    gilt: ['to endure', 'endure'],
    giltNicht: ['endurance'],
  },
  {
    english: 'restraints (pl.)',
    lemma: 'restraint',
    german: 'die Beschränkungen',
    gilt: ['restraints (pl.)', 'restraints'],
    giltNicht: ['restraint'],
  },
  {
    english: 'attainability (n.)',
    lemma: 'attainability',
    german: 'die Erreichbarkeit',
    gilt: ['attainability (n.)', 'attainability'],
    giltNicht: ['attainable'],
  },
  {
    english: 'attainable (adj.)',
    lemma: 'attainable',
    german: 'erreichbar',
    gilt: ['attainable (adj.)', 'attainable'],
    giltNicht: ['attainability'],
  },
];

const PACK_ID = 'pack-lernformen';

function draftsForCases() {
  return validateDrafts(
    CASES.map((row, index) => ({
      ...emptyDraft(),
      id: `e${index + 1}`,
      english: row.english,
      german: row.german,
      lemma: row.lemma,
      partOfSpeech: row.english.startsWith('to ')
        ? ('verb' as const)
        : row.english.endsWith('(adj.)')
          ? ('adjective' as const)
          : ('noun' as const),
      ...(row.english.endsWith('(pl.)') ? { grammaticalNumber: 'plural' as const } : {}),
      // `attainability` und `attainable` sind eine Familie und bleiben
      // getrennte, verbundene Einträge – nie zu einem verschmolzen.
      ...(row.lemma.startsWith('attainab') ? { lexicalGroupId: 'attain' } : {}),
    })),
  );
}

function entriesForCases(): VocabEntry[] {
  return draftsToEntries(draftsForCases(), 'manual');
}

function entryFor(entries: readonly VocabEntry[], english: string): VocabEntry {
  const hit = entries.find((entry) => entry.english === english);
  if (!hit) throw new Error(`Eintrag „${english}“ fehlt.`);
  return hit;
}

beforeEach(async () => {
  await clearAllLocalData();
});

describe('Der Entwurf trägt die Form unverändert ins Paket', () => {
  it('speichert jede Lernform so, wie sie dasteht', () => {
    const entries = entriesForCases();
    expect(entries.map((entry) => entry.english)).toEqual(CASES.map((row) => row.english));
  });

  it('hält Lernform und Lemma auseinander', () => {
    /*
      Die Trennung ist der Grund, warum beides überhaupt geht: Die Karte zeigt
      `to depend on sb./sth.`, gesucht und auf Dubletten geprüft wird über
      `depend`. Ein Feld für beides müsste sich für eine Seite entscheiden.
    */
    const entries = entriesForCases();
    for (const row of CASES) {
      expect(entryFor(entries, row.english).lemma).toBe(row.lemma);
    }
  });

  it('lässt gleiche Familien getrennt und verbunden', () => {
    const entries = entriesForCases();
    const nomen = entryFor(entries, 'attainability (n.)');
    const adjektiv = entryFor(entries, 'attainable (adj.)');

    expect(nomen.id).not.toBe(adjektiv.id);
    expect(nomen.lexicalGroupId).toBe(adjektiv.lexicalGroupId);
    expect(nomen.lexicalGroupId).toBeTruthy();
  });
});

describe('Die Antwortprüfung kennt die Grenze', () => {
  it.each(CASES)('$english', (row) => {
    const entries = entriesForCases();
    const entry = entryFor(entries, row.english);
    const { answer, alternatives } = answersFor(entry, 'de-en');
    const expected = [answer, ...alternatives];

    for (const gilt of row.gilt) {
      expect(checkAnswer(gilt, expected).verdict, `„${gilt}“ sollte gelten`).toBe('correct');
    }
    for (const giltNicht of row.giltNicht) {
      expect(
        checkAnswer(giltNicht, expected).verdict,
        `„${giltNicht}“ darf nicht als richtig gelten`,
      ).not.toBe('correct');
    }
  });
});

describe('Alle Lernansichten zeigen dieselbe Form', () => {
  it('Karten und Durchsehen zeigen die vollständige Form', () => {
    const entries = entriesForCases();
    for (const row of CASES) {
      const entry = entryFor(entries, row.english);
      const karte = buildStudyCard(entry, 'en-de');
      expect(karte.prompt).toBe(row.english);
    }
  });

  it('die Abfrage erwartet die vollständige Form', () => {
    const entries = entriesForCases();
    for (const row of CASES) {
      const task = buildTask(
        entryFor(entries, row.english),
        'open-translation',
        'de-en',
        entries,
        mulberry32(1),
      );
      expect(task?.expected).toContain(row.english);
    }
  });

  it('der Selbsttest wertet nach denselben Regeln', () => {
    const entries = entriesForCases();
    const entry = entryFor(entries, 'to depend on sb./sth.');
    const task = buildTask(entry, 'open-translation', 'de-en', entries, mulberry32(1));
    if (!task) throw new Error('keine Aufgabe');

    expect(checkTaskAnswer(task, 'to depend on')).toBe('correct');
    expect(checkTaskAnswer(task, 'depend')).not.toBe('correct');
  });

  it('gesucht wird über das Lemma, nicht über die Lernform', () => {
    /*
      Wer im Durchsehen „depend“ tippt, will die Karte finden – auch wenn dort
      `to depend on sb./sth.` steht. Suchen ist keine Prüfung: Hier ist das
      Lemma genau richtig, und in der Antwortprüfung genau falsch.
    */
    const entries = entriesForCases();
    expect(matchesQuery(entryFor(entries, 'to depend on sb./sth.'), 'depend')).toBe(true);
    expect(matchesQuery(entryFor(entries, 'restraints (pl.)'), 'restraint')).toBe(true);
  });
});

describe('Export und erneuter Import verlieren nichts', () => {
  it('bringt jede Form und jedes Feld unverändert zurück', async () => {
    const pack: VocabPack = {
      meta: {
        id: PACK_ID,
        title: 'Lernformen',
        topic: '',
        grade: '10',
        cefrLevel: 'B1',
        cefrLevelOverridden: false,
        direction: 'both',
        createdAt: '2026-09-03T00:00:00.000Z',
        updatedAt: '2026-09-03T00:00:00.000Z',
      },
      entries: entriesForCases(),
    };

    await savePack(pack);
    const gespeichert = await getPack(PACK_ID);
    expect(gespeichert?.entries.map((entry) => entry.english)).toEqual(
      CASES.map((row) => row.english),
    );

    const datei = serializePack(gespeichert as VocabPack);
    const gelesen = parsePackFile(datei);
    if (!gelesen.ok) throw new Error(`Export nicht lesbar: ${gelesen.errors.join(' · ')}`);

    for (const row of CASES) {
      const wieder = entryFor(gelesen.pack.entries, row.english);
      expect(wieder.english).toBe(row.english);
      expect(wieder.lemma).toBe(row.lemma);
    }

    // Und die Prüfung gilt nach dem Wiedereinlesen genauso.
    const wieder = entryFor(gelesen.pack.entries, 'to single out sb./sth.');
    const { answer, alternatives } = answersFor(wieder, 'de-en');
    expect(checkAnswer('to single out', [answer, ...alternatives]).verdict).toBe('correct');
    expect(checkAnswer('single', [answer, ...alternatives]).verdict).not.toBe('correct');
  });
});
