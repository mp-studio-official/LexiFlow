import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData, db } from './db';
import { countEntries, deletePack, getPack, listPacks, savePack } from './packRepo';
import {
  getPackProgress,
  getProgressIndex,
  recordAnswer,
  resetPackProgress,
} from './progressRepo';
import { directionKey } from '../domain/ids';
import { makePack } from '../test/fixtures';

const NOW = new Date('2026-03-02T10:00:00.000Z');

beforeEach(async () => {
  await clearAllLocalData();
});

describe('packRepo', () => {
  it('speichert und liest ein Paket vollständig', async () => {
    const pack = makePack();
    await savePack(pack);
    const loaded = await getPack(pack.meta.id);
    expect(loaded?.entries).toEqual(pack.entries);
    expect(loaded?.meta.title).toBe(pack.meta.title);
  });

  it('meldet beim ersten Speichern ein neues Paket', async () => {
    const result = await savePack(makePack());
    expect(result.isNew).toBe(true);
    expect(result.summary).toEqual({ kept: 0, added: 5, changed: 0, removed: 0 });
  });

  it('erhält die Reihenfolge der Einträge', async () => {
    const pack = makePack();
    await savePack(pack);
    const loaded = await getPack(pack.meta.id);
    expect(loaded?.entries.map((entry) => entry.id)).toEqual(pack.entries.map((entry) => entry.id));
  });

  it('ersetzt beim erneuten Speichern alle Einträge', async () => {
    const pack = makePack();
    await savePack(pack);
    await savePack({ meta: pack.meta, entries: pack.entries.slice(0, 2) });
    expect(await countEntries(pack.meta.id)).toBe(2);
  });

  it('listet Pakete nach Änderungsdatum', async () => {
    const first = makePack();
    await savePack(first);
    const second = { ...makePack(), meta: { ...first.meta, id: 'pack-2', title: 'Zweites Paket' } };
    await savePack(second);
    const packs = await listPacks();
    expect(packs[0]?.id).toBe('pack-2');
  });

  it('löscht Paket, Einträge und Lernstand gemeinsam', async () => {
    const pack = makePack();
    await savePack(pack);
    await recordAnswer(pack.meta.id, 'e-crowded', 'en-de', 'correct', NOW);
    await deletePack(pack.meta.id);
    expect(await getPack(pack.meta.id)).toBeUndefined();
    expect(await db.packEntries.count()).toBe(0);
    expect(await db.directionProgress.count()).toBe(0);
  });
});

describe('progressRepo', () => {
  it('legt beim ersten Antworten einen Lernstand an', async () => {
    const pack = makePack();
    await savePack(pack);
    const progress = await recordAnswer(pack.meta.id, 'e-crowded', 'en-de', 'correct', NOW);
    expect(progress.box).toBe(2);
    expect(progress.correctCount).toBe(1);
    expect(progress.direction).toBe('en-de');
  });

  it('schreibt aufeinanderfolgende Antworten fort', async () => {
    const pack = makePack();
    await savePack(pack);
    await recordAnswer(pack.meta.id, 'e-crowded', 'en-de', 'correct', NOW);
    const second = await recordAnswer(pack.meta.id, 'e-crowded', 'en-de', 'wrong', NOW);
    expect(second.box).toBe(1);
    expect(second.correctCount).toBe(1);
    expect(second.wrongCount).toBe(1);
  });

  it('führt die beiden Richtungen unabhängig voneinander', async () => {
    const pack = makePack();
    await savePack(pack);
    await recordAnswer(pack.meta.id, 'e-crowded', 'en-de', 'correct', NOW);
    await recordAnswer(pack.meta.id, 'e-crowded', 'en-de', 'correct', NOW);

    const index = await getProgressIndex(pack.meta.id);
    expect(index.get(directionKey('e-crowded', 'en-de'))?.box).toBe(3);
    expect(index.get(directionKey('e-crowded', 'de-en'))).toBeUndefined();

    await recordAnswer(pack.meta.id, 'e-crowded', 'de-en', 'wrong', NOW);
    const updated = await getProgressIndex(pack.meta.id);
    expect(updated.get(directionKey('e-crowded', 'en-de'))?.box).toBe(3);
    expect(updated.get(directionKey('e-crowded', 'de-en'))?.box).toBe(1);
  });

  it('führt eine Paketstatistik über beide Richtungen', async () => {
    const pack = makePack();
    await savePack(pack);
    await recordAnswer(pack.meta.id, 'e-crowded', 'en-de', 'correct', NOW);
    await recordAnswer(pack.meta.id, 'e-litter', 'de-en', 'wrong', NOW);
    const packProgress = await getPackProgress(pack.meta.id);
    expect(packProgress.answeredCount).toBe(2);
    expect(packProgress.correctCount).toBe(1);
  });

  it('setzt den Lernstand zurück, ohne Vokabeln zu löschen', async () => {
    const pack = makePack();
    await savePack(pack);
    await recordAnswer(pack.meta.id, 'e-quiet', 'en-de', 'correct', NOW);
    await resetPackProgress(pack.meta.id);
    expect((await getProgressIndex(pack.meta.id)).size).toBe(0);
    expect(await countEntries(pack.meta.id)).toBe(pack.entries.length);
  });
});

describe('clearAllLocalData', () => {
  it('leert alle Tabellen', async () => {
    const pack = makePack();
    await savePack(pack);
    await recordAnswer(pack.meta.id, 'e-quiet', 'en-de', 'correct', NOW);
    await clearAllLocalData();
    expect(await db.packs.count()).toBe(0);
    expect(await db.packEntries.count()).toBe(0);
    expect(await db.directionProgress.count()).toBe(0);
    expect(await db.packProgress.count()).toBe(0);
  });
});
