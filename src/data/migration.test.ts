import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { LexiFlowDatabase } from './db';
import { makeMeta } from '../test/fixtures';

/**
 * Prüft die einmalige lokale Migration von Schema-Version 1 (Sprint 1) auf
 * Version 3 (Sprint 1.1): neue Tabellen `packEntries` und `directionProgress`,
 * alte Tabellen entfallen.
 */

const V1_STORES = {
  packs: 'id, updatedAt, grade, title',
  entries: 'id, packId, position, english',
  entryProgress: 'key, packId, dueAt, box',
  packProgress: 'packId, lastPracticedAt',
};

async function seedLegacyDatabase(name: string, direction: 'en-de' | 'de-en' | 'both'): Promise<void> {
  const legacy = new Dexie(name);
  legacy.version(1).stores(V1_STORES);
  await legacy.open();

  await legacy.table('packs').put(makeMeta({ id: 'pack-1', direction }));
  await legacy.table('entries').bulkPut([
    {
      id: 'e-1',
      packId: 'pack-1',
      position: 0,
      english: 'crowded',
      germanAnswers: ['überfüllt'],
      acceptedEnglishAnswers: [],
      exampleSentences: [],
      topicTags: [],
      sourceType: 'import',
    },
    {
      id: 'e-2',
      packId: 'pack-1',
      position: 1,
      english: 'litter',
      germanAnswers: ['Müll'],
      acceptedEnglishAnswers: [],
      exampleSentences: [],
      topicTags: [],
      sourceType: 'import',
    },
  ]);
  await legacy.table('entryProgress').put({
    key: 'pack-1::e-1',
    packId: 'pack-1',
    entryId: 'e-1',
    box: 3,
    correctCount: 4,
    wrongCount: 1,
    streak: 2,
    dueAt: '2026-03-05T10:00:00.000Z',
  });
  await legacy.table('packProgress').put({
    packId: 'pack-1',
    sessionCount: 2,
    answeredCount: 9,
    correctCount: 7,
  });

  legacy.close();
}

describe('Migration von Schema-Version 1', () => {
  it('überträgt Einträge in die Tabelle mit zusammengesetztem Schlüssel', async () => {
    const name = 'lexiflow-migration-entries';
    await seedLegacyDatabase(name, 'en-de');

    const db = new LexiFlowDatabase(name);
    await db.open();

    const entries = await db.packEntries.where('packId').equals('pack-1').toArray();
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.id).sort()).toEqual(['e-1', 'e-2']);
    expect(await db.packEntries.get(['pack-1', 'e-1'])).toMatchObject({ english: 'crowded' });
    db.close();
  });

  it('entfernt die alten Tabellen', async () => {
    const name = 'lexiflow-migration-drop';
    await seedLegacyDatabase(name, 'en-de');

    const db = new LexiFlowDatabase(name);
    await db.open();
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'directionProgress',
      'packEntries',
      'packProgress',
      'packs',
    ]);
    db.close();
  });

  it('ordnet bestehende Lernstände der Richtung des Pakets zu', async () => {
    const name = 'lexiflow-migration-direction';
    await seedLegacyDatabase(name, 'de-en');

    const db = new LexiFlowDatabase(name);
    await db.open();

    const rows = await db.directionProgress.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'pack-1::e-1::de-en',
      direction: 'de-en',
      box: 3,
      correctCount: 4,
    });
    db.close();
  });

  it('nutzt bei „beide Richtungen“ die rezeptive Richtung und lässt die Gegenrichtung neu beginnen', async () => {
    const name = 'lexiflow-migration-both';
    await seedLegacyDatabase(name, 'both');

    const db = new LexiFlowDatabase(name);
    await db.open();

    const rows = await db.directionProgress.toArray();
    expect(rows.map((row) => row.direction)).toEqual(['en-de']);
    db.close();
  });

  it('lässt Pakete und Paketstatistik unverändert', async () => {
    const name = 'lexiflow-migration-packs';
    await seedLegacyDatabase(name, 'en-de');

    const db = new LexiFlowDatabase(name);
    await db.open();

    expect(await db.packs.count()).toBe(1);
    expect(await db.packProgress.get('pack-1')).toMatchObject({ sessionCount: 2 });
    db.close();
  });

  it('legt eine frische Datenbank direkt im neuen Schema an', async () => {
    const db = new LexiFlowDatabase('lexiflow-migration-fresh');
    await db.open();
    expect(db.verno).toBe(3);
    expect(await db.packEntries.count()).toBe(0);
    db.close();
  });
});

describe('Einträge ohne die Felder aus Sprint 4B.2', () => {
  /*
    Die strukturierten Lernformen kamen mit 4B.2 dazu: `lemma`,
    `complementPattern`, `grammaticalNumber`, `lexicalGroupId`. Alle sind
    optional, und genau das muss die lokale Datenbank aushalten – ein Eintrag,
    der vor diesem Sprint gespeichert wurde, trägt keines davon.

    Wichtig ist dabei nicht nur, dass er sich lesen lässt, sondern dass sein
    **Lernstand** weiterhin zu ihm gehört: Der Schlüssel ist
    `packId::entryId::direction`, und an keinem der drei Teile hat sich etwas
    geändert. Wäre das anders, verlöre jede Schülerin beim Update ihren Stand.
  */
  it('liest sie unverändert und behält ihren Lernstand', async () => {
    const name = 'lexiflow-migration-4b2';
    await seedLegacyDatabase(name, 'both');

    const db = new LexiFlowDatabase(name);
    await db.open();

    const entry = await db.packEntries.get(['pack-1', 'e-1']);
    expect(entry?.english).toBe('crowded');
    expect(entry?.germanAnswers).toEqual(['überfüllt']);
    expect(entry?.lemma).toBeUndefined();
    expect(entry?.complementPattern).toBeUndefined();
    expect(entry?.grammaticalNumber).toBeUndefined();
    expect(entry?.lexicalGroupId).toBeUndefined();

    const stand = await db.directionProgress.get('pack-1::e-1::en-de');
    expect(stand?.entryId).toBe('e-1');
    expect(stand?.box).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it('nimmt die neuen Felder auf, ohne die alten anzurühren', async () => {
    const name = 'lexiflow-migration-4b2-neu';
    await seedLegacyDatabase(name, 'both');

    const db = new LexiFlowDatabase(name);
    await db.open();

    /*
      `e-1` trägt einen migrierten Lernstand. Die Vokabel bekommt jetzt eine
      vollständige Lernform – und der Stand muss trotzdem zu ihr gehören: Er
      hängt an der Eintrags-ID, nicht an der Schreibweise.
    */
    const vorher = await db.packEntries.get(['pack-1', 'e-1']);
    const standVorher = await db.directionProgress.get('pack-1::e-1::en-de');
    expect(standVorher?.box).toBe(3);

    await db.packEntries.put({
      ...vorher!,
      english: 'to accuse sb. of sth.',
      lemma: 'accuse',
      complementPattern: 'sb. of sth.',
      lexicalGroupId: 'g1',
    });

    const nachher = await db.packEntries.get(['pack-1', 'e-1']);
    expect(nachher?.lemma).toBe('accuse');
    expect(nachher?.lexicalGroupId).toBe('g1');
    expect(await db.directionProgress.get('pack-1::e-1::en-de')).toEqual(standVorher);
    db.close();
  });
});
