import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData, db } from './db';
import { countEntries, deletePack, getPack, savePack } from './packRepo';
import { getProgressIndex, recordAnswer } from './progressRepo';
import { directionKey } from '../domain/ids';
import { makeEntry, makeMeta } from '../test/fixtures';
import type { VocabPack } from '../domain/schema';

/**
 * Regressionstest zu Sprint 1: Damals war `entry.id` globaler Primärschlüssel
 * der Tabelle `entries`. Zwei Pakete mit denselben Entry-IDs – etwa zwei
 * Klassenlisten, die beide bei „1“ zu zählen beginnen – hätten sich
 * gegenseitig überschrieben.
 */

const NOW = new Date('2026-03-02T10:00:00.000Z');

function packWithSharedIds(packId: string, title: string, suffix: string): VocabPack {
  return {
    meta: makeMeta({ id: packId, title }),
    entries: [
      makeEntry({ id: '1', english: `first-${suffix}`, germanAnswers: [`Erstes ${suffix}`] }),
      makeEntry({ id: '2', english: `second-${suffix}`, germanAnswers: [`Zweites ${suffix}`] }),
      makeEntry({ id: '3', english: `third-${suffix}`, germanAnswers: [`Drittes ${suffix}`] }),
    ],
  };
}

const packA = packWithSharedIds('pack-a', 'Paket A', 'a');
const packB = packWithSharedIds('pack-b', 'Paket B', 'b');

beforeEach(async () => {
  await clearAllLocalData();
});

describe('Pakete mit identischen Entry-IDs', () => {
  it('speichert beide Pakete vollständig nebeneinander', async () => {
    await savePack(packA);
    await savePack(packB);

    expect(await db.packEntries.count()).toBe(6);
    expect(await countEntries('pack-a')).toBe(3);
    expect(await countEntries('pack-b')).toBe(3);
  });

  it('lässt das erste Paket beim Speichern des zweiten unverändert', async () => {
    await savePack(packA);
    await savePack(packB);

    const loadedA = await getPack('pack-a');
    expect(loadedA?.entries).toEqual(packA.entries);
    const loadedB = await getPack('pack-b');
    expect(loadedB?.entries).toEqual(packB.entries);
  });

  it('lässt das andere Paket beim Aktualisieren unberührt', async () => {
    await savePack(packA);
    await savePack(packB);

    await savePack({
      meta: packB.meta,
      entries: [makeEntry({ id: '1', english: 'changed-b', germanAnswers: ['Geändert'] })],
    });

    expect(await countEntries('pack-a')).toBe(3);
    expect((await getPack('pack-a'))?.entries).toEqual(packA.entries);
    expect(await countEntries('pack-b')).toBe(1);
  });

  it('lässt das andere Paket beim Löschen unberührt', async () => {
    await savePack(packA);
    await savePack(packB);

    await deletePack('pack-b');

    expect(await countEntries('pack-a')).toBe(3);
    expect((await getPack('pack-a'))?.entries).toEqual(packA.entries);
    expect(await getPack('pack-b')).toBeUndefined();
  });

  it('hält auch die Lernstände auseinander', async () => {
    await savePack(packA);
    await savePack(packB);

    await recordAnswer('pack-a', '1', 'en-de', 'correct', NOW);
    await recordAnswer('pack-a', '1', 'en-de', 'correct', NOW);

    const progressA = await getProgressIndex('pack-a');
    const progressB = await getProgressIndex('pack-b');
    expect(progressA.get(directionKey('1', 'en-de'))?.box).toBe(3);
    expect(progressB.size).toBe(0);
  });

  it('löscht beim Entfernen eines Pakets nur dessen Lernstände', async () => {
    await savePack(packA);
    await savePack(packB);
    await recordAnswer('pack-a', '1', 'en-de', 'correct', NOW);
    await recordAnswer('pack-b', '1', 'en-de', 'correct', NOW);

    await deletePack('pack-b');

    expect((await getProgressIndex('pack-a')).size).toBe(1);
    expect(await db.directionProgress.count()).toBe(1);
  });
});
