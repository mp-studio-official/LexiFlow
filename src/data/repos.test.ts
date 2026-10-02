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
    /*
      ## Warum hier an `updatedAt` gedreht wird
      
      `savePack` stempelt `new Date().toISOString()` – Millisekunden. Zwei
      Speicherungen hintereinander fielen auf diesem Rechner in rund einem
      Drittel der Läufe in **dieselbe** Millisekunde. `listPacks` sortiert
      dann zwei gleiche Zeichenketten, und was vorne steht, entscheidet die
      Reihenfolge aus der Datenbank – also der Schlüssel, also `pack-1`.

      Die alte Fassung nahm an, die zweite Speicherung sei immer später. Das
      ist keine Zusage des Produktivcodes, sondern ein Nebeneffekt der
      Ausführungsgeschwindigkeit: ein nicht deterministischer Test, kein
      Fehler im Produktivcode. Bei gleichem Zeitpunkt ist die Reihenfolge
      offen, und das soll sie bleiben – eine erfundene Zweitsortierung nach
      Schlüssel wäre eine Regel, die niemand entschieden hat.

      Deshalb wird die Frage hier eindeutig gestellt: Das erste Paket bekommt
      ausdrücklich einen älteren Zeitpunkt. Kein Warten, keine Schleife – die
      Zeit wird gesetzt, nicht abgewartet.
    */
    const first = makePack();
    await savePack(first);
    await db.packs.update(first.meta.id, { updatedAt: '2026-03-01T09:00:00.000Z' });

    const second = { ...makePack(), meta: { ...first.meta, id: 'pack-2', title: 'Zweites Paket' } };
    await savePack(second);
    await db.packs.update('pack-2', { updatedAt: '2026-03-02T09:00:00.000Z' });

    const packs = await listPacks();
    expect(packs.map((meta) => meta.id)).toEqual(['pack-2', first.meta.id]);
  });

  it('und bei gleichem Zeitpunkt sagt die Liste nichts über die Reihenfolge', async () => {
    /*
      Die Gegenrichtung, damit die Prüfung oben nicht mehr verspricht, als
      `listPacks` hält: Bei zwei gleichen Zeitpunkten ist jede Reihenfolge
      richtig. Wer das ändern will, ändert `packRepo` – und dann fällt diese
      Zeile auf, statt dass irgendwo ein Test stillschweigend fester wird.
    */
    const first = makePack();
    await savePack(first);
    const second = { ...makePack(), meta: { ...first.meta, id: 'pack-2', title: 'Zweites Paket' } };
    await savePack(second);

    const gleich = '2026-03-02T09:00:00.000Z';
    await db.packs.update(first.meta.id, { updatedAt: gleich });
    await db.packs.update('pack-2', { updatedAt: gleich });

    const packs = await listPacks();
    expect(packs).toHaveLength(2);
    expect(packs.map((meta) => meta.id).sort()).toEqual(['pack-1', 'pack-2']);
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
