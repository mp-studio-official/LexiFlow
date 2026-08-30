import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData } from './db';
import { countEntries, getPack, previewPackUpdate, savePack } from './packRepo';
import { getProgressIndex, recordAnswer } from './progressRepo';
import { summarizeDiff, describeUpdateSummary } from '../domain/packDiff';
import { directionKey } from '../domain/ids';
import { makeEntry, makeRichPack } from '../test/fixtures';
import type { VocabEntry, VocabPack } from '../domain/schema';

const NOW = new Date('2026-03-02T10:00:00.000Z');
const original = makeRichPack();

/** Lernstand für zwei Vokabeln in beiden Richtungen anlegen. */
async function seedProgress(packId: string): Promise<void> {
  await recordAnswer(packId, 'rich-1', 'en-de', 'correct', NOW);
  await recordAnswer(packId, 'rich-1', 'de-en', 'correct', NOW);
  await recordAnswer(packId, 'rich-2', 'en-de', 'correct', NOW);
  await recordAnswer(packId, 'rich-3', 'en-de', 'correct', NOW);
}

function updatedPack(): VocabPack {
  const [apologise, crowded] = original.entries as [VocabEntry, VocabEntry];
  return {
    meta: { ...original.meta, title: 'Neuer Titel', description: 'Andere Beschreibung' },
    entries: [
      apologise, // unverändert
      { ...crowded, germanAnswers: ['überfüllt', 'voll', 'gedrängt'] }, // inhaltlich geändert
      // rich-3 entfällt
      makeEntry({ id: 'rich-9', english: 'traffic', germanAnswers: ['Verkehr'] }), // neu
    ],
  };
}

beforeEach(async () => {
  await clearAllLocalData();
  await savePack(original);
  await seedProgress(original.meta.id);
});

describe('previewPackUpdate', () => {
  it('zeigt vor dem Speichern, was mit den Lernständen geschieht', async () => {
    const diff = await previewPackUpdate(updatedPack());
    expect(summarizeDiff(diff)).toEqual({ kept: 1, added: 1, changed: 1, removed: 1 });
  });

  it('verändert dabei noch nichts', async () => {
    await previewPackUpdate(updatedPack());
    expect(await countEntries(original.meta.id)).toBe(3);
    expect((await getProgressIndex(original.meta.id)).size).toBe(4);
  });
});

describe('savePack als Aktualisierung', () => {
  it('meldet das Paket als vorhanden und liefert die Zusammenfassung', async () => {
    const result = await savePack(updatedPack());
    expect(result.isNew).toBe(false);
    expect(result.summary).toEqual({ kept: 1, added: 1, changed: 1, removed: 1 });
    expect(describeUpdateSummary(result.summary)).toBe(
      '1 Lernstand erhalten, 1 neue Vokabel, 1 geänderte zurückgesetzt, 1 entfernte Vokabel gelöscht.',
    );
  });

  it('erhält den Lernstand unveränderter Vokabeln in beiden Richtungen', async () => {
    await savePack(updatedPack());
    const progress = await getProgressIndex(original.meta.id);
    expect(progress.get(directionKey('rich-1', 'en-de'))?.box).toBe(2);
    expect(progress.get(directionKey('rich-1', 'de-en'))?.box).toBe(2);
  });

  it('setzt den Lernstand inhaltlich geänderter Vokabeln zurück', async () => {
    await savePack(updatedPack());
    const progress = await getProgressIndex(original.meta.id);
    expect(progress.get(directionKey('rich-2', 'en-de'))).toBeUndefined();
  });

  it('löscht den Lernstand entfernter Vokabeln', async () => {
    await savePack(updatedPack());
    const progress = await getProgressIndex(original.meta.id);
    expect(progress.get(directionKey('rich-3', 'en-de'))).toBeUndefined();
  });

  it('legt neue Vokabeln ohne Lernstand an', async () => {
    await savePack(updatedPack());
    const pack = await getPack(original.meta.id);
    expect(pack?.entries.map((entry) => entry.id)).toEqual(['rich-1', 'rich-2', 'rich-9']);
    expect((await getProgressIndex(original.meta.id)).get(directionKey('rich-9', 'en-de'))).toBeUndefined();
  });

  it('übernimmt die neuen Metadaten', async () => {
    await savePack(updatedPack());
    const pack = await getPack(original.meta.id);
    expect(pack?.meta.title).toBe('Neuer Titel');
  });

  it('lässt Lernstände bei reinen Metadatenänderungen unberührt', async () => {
    const result = await savePack({
      meta: { ...original.meta, title: 'Nur ein anderer Titel', topic: 'Anderes Thema' },
      entries: original.entries,
    });
    expect(result.summary).toEqual({ kept: 3, added: 0, changed: 0, removed: 0 });
    expect((await getProgressIndex(original.meta.id)).size).toBe(4);
  });

  it('lässt Lernstände bei geänderten Notizen und Tags unberührt', async () => {
    const result = await savePack({
      meta: original.meta,
      entries: original.entries.map((entry) => ({
        ...entry,
        notes: 'überarbeitet',
        topicTags: ['neu'],
      })),
    });
    expect(result.summary.changed).toBe(0);
    expect((await getProgressIndex(original.meta.id)).size).toBe(4);
  });

  it('behält Lernstände der Gegenrichtung, wenn die Lernrichtung wechselt', async () => {
    await savePack({
      meta: { ...original.meta, direction: 'en-de' },
      entries: original.entries,
    });
    const progress = await getProgressIndex(original.meta.id);
    expect(progress.get(directionKey('rich-1', 'de-en'))?.box).toBe(2);
  });
});
