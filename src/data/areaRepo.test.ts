import { beforeEach, describe, expect, it } from 'vitest';

import { clearAllLocalData, db } from './db';
import { createArea, deleteArea, getArea, listAreas, updateArea } from './areaRepo';
import { savePack } from './packRepo';
import { getProgressIndex } from './progressRepo';
import { makeEntry, makeMeta } from '../test/fixtures';

/**
 * Der Speicher der Lernbereiche.
 *
 * Die Zusage, um die es hier geht, ist eine einzige und sie steht ganz unten:
 * **Die Kennung eines Bereichs ändert sich nie.** An ihr hängt der Name der
 * Datenbank auf den Geräten der Lernenden. Wer sie neu vergibt, setzt deren
 * Lernstand zurück – und merkt es erst, wenn achtundzwanzig Personen bei null
 * anfangen.
 */

beforeEach(async () => {
  await clearAllLocalData();
});

describe('Anlegen und Lesen', () => {
  it('legt einen Bereich mit Titel und Auswahl an', async () => {
    const area = await createArea({ title: 'Englisch 9b', packIds: ['p1', 'p2'] });

    expect(area.id).toBeTruthy();
    expect(area.title).toBe('Englisch 9b');
    expect(area.packIds).toEqual(['p1', 'p2']);

    expect(await getArea(area.id)).toEqual(area);
  });

  it('behält die Reihenfolge der Auswahl', async () => {
    // Sie ist die Reihenfolge auf dem Bildschirm der Lernenden.
    const area = await createArea({ title: 'B', packIds: ['p3', 'p1', 'p2'] });
    expect((await getArea(area.id))?.packIds).toEqual(['p3', 'p1', 'p2']);
  });

  it('schneidet Leerraum an Titel und Beschreibung ab', async () => {
    const area = await createArea({
      title: '  Englisch 9b  ',
      description: '  Halbjahr 1  ',
      packIds: ['p1'],
    });
    expect(area.title).toBe('Englisch 9b');
    expect(area.description).toBe('Halbjahr 1');
  });

  it('lässt eine leere Beschreibung ganz weg, statt sie leer zu speichern', async () => {
    const area = await createArea({ title: 'B', description: '   ', packIds: ['p1'] });
    expect('description' in area).toBe(false);
  });

  it('zeigt zuletzt Bearbeitetes zuerst', async () => {
    const alt = await createArea({ title: 'Alt', packIds: ['p1'] });
    // Ein Zeitstempel in der Zukunft ist verlässlicher als eine Wartezeit.
    await db.areas.put({ ...alt, updatedAt: '2020-01-01T00:00:00.000Z' });
    const neu = await createArea({ title: 'Neu', packIds: ['p2'] });

    expect((await listAreas()).map((area) => area.id)).toEqual([neu.id, alt.id]);
  });
});

describe('Ändern', () => {
  it('ändert Titel, Beschreibung und Auswahl', async () => {
    const area = await createArea({ title: 'Alt', packIds: ['p1'] });
    const geaendert = await updateArea(area.id, {
      title: 'Neu',
      description: 'Dazu',
      packIds: ['p2', 'p3'],
    });

    expect(geaendert.title).toBe('Neu');
    expect(geaendert.description).toBe('Dazu');
    expect(geaendert.packIds).toEqual(['p2', 'p3']);
  });

  it('entfernt eine geleerte Beschreibung, statt sie leer stehen zu lassen', async () => {
    const area = await createArea({ title: 'B', description: 'Dazu', packIds: ['p1'] });
    const geaendert = await updateArea(area.id, { title: 'B', description: '', packIds: ['p1'] });
    expect('description' in geaendert).toBe(false);
  });

  it('lässt Kennung und Anlagedatum unverändert – das ist die eigentliche Zusage', async () => {
    /*
      Der Datenbankname auf dem Gerät einer lernenden Person leitet sich aus
      dieser Kennung ab. Bleibt sie gleich, findet eine neu ausgegebene Datei
      den vorhandenen Lernstand und ergänzt ihn. Ändert sie sich, fängt jede
      Person bei null an – und niemand fände heraus, warum.
    */
    const area = await createArea({ title: 'Englisch 9b', packIds: ['p1'] });
    const geaendert = await updateArea(area.id, { title: 'Ganz anders', packIds: ['p2'] });

    expect(geaendert.id).toBe(area.id);
    expect(geaendert.createdAt).toBe(area.createdAt);
  });

  it('sagt es, statt einen fehlenden Bereich stillschweigend anzulegen', async () => {
    await expect(updateArea('gibt-es-nicht', { title: 'B', packIds: ['p1'] })).rejects.toThrow();
  });
});

describe('Löschen', () => {
  it('entfernt den Bereich', async () => {
    const area = await createArea({ title: 'B', packIds: ['p1'] });
    await deleteArea(area.id);
    expect(await getArea(area.id)).toBeUndefined();
  });

  it('rührt die Pakete und die Lernstände nicht an', async () => {
    /*
      Ein Lernbereich ist eine Zusammenstellung, kein Behälter. Wer ihn
      wegräumt, räumt eine Liste weg – nicht das Material und schon gar nicht
      das, was jemand daran gelernt hat.
    */
    await savePack({
      meta: makeMeta({ id: 'p1', title: 'Unit 3' }),
      entries: [makeEntry({ id: 'e1' })],
    });
    const vorher = await getProgressIndex('p1');

    const area = await createArea({ title: 'B', packIds: ['p1'] });
    await deleteArea(area.id);

    expect(await db.packs.get('p1')).toBeDefined();
    expect(await db.packEntries.where('packId').equals('p1').count()).toBe(1);
    expect(await getProgressIndex('p1')).toEqual(vorher);
  });
});

describe('Ein gelöschtes Paket', () => {
  it('bleibt als Kennung im Bereich stehen, statt still zu verschwinden', async () => {
    /*
      Eine Auswahl, die sich von selbst ändert, ist keine Auswahl mehr. Die
      Oberfläche zeigt, dass ein Paket fehlt; die Entscheidung darüber trifft
      die Lehrkraft und nicht der Speicher.
    */
    const area = await createArea({ title: 'B', packIds: ['p1', 'weg'] });
    expect((await getArea(area.id))?.packIds).toEqual(['p1', 'weg']);
  });
});
