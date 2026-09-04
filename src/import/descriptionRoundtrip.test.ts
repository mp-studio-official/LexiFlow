import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData } from '../data/db';
import { getPack, getPackMeta, savePack } from '../data/packRepo';
import { packMetaSchema, vocabPackFileSchema } from '../domain/schema';
import { parsePackFile, serializePack } from '../domain/vocabpack';
import { newId } from '../domain/ids';
import type { VocabPack } from '../domain/schema';

/**
 * Die optionale Paketbeschreibung – ihr vollständiger Weg.
 *
 * Sie ist ein kleines Feld, und genau deshalb geht sie leicht verloren: Ein
 * Schema, das sie kennt, garantiert nicht, dass sie durch Speichern, Export,
 * Wiedereinlesen und die Lerndatei kommt. Diese Datei geht den Weg einmal
 * ganz ab.
 *
 * Und den wichtigsten Fall dazu: ein altes Paket **ohne** Beschreibung. Es
 * darf nicht ungültig werden, nur weil es das Feld nicht kennt.
 */

const BESCHREIBUNG = 'Achte auf die Nomenendungen; die Beispielsätze stammen aus dem Artikel.';

function packMit(description?: string): VocabPack {
  const now = new Date().toISOString();
  return {
    meta: {
      id: newId(),
      title: 'Coastal erosion',
      topic: 'Küste',
      grade: '9',
      cefrLevel: 'B1',
      cefrLevelOverridden: false,
      direction: 'both',
      ...(description === undefined ? {} : { description }),
      createdAt: now,
      updatedAt: now,
    },
    entries: [
      {
        id: newId(),
        english: 'erosion',
        germanAnswers: ['die Erosion'],
        acceptedEnglishAnswers: [],
        exampleSentences: [{ english: 'Coastal erosion threatens the settlement.' }],
        topicTags: [],
        sourceType: 'import',
      },
    ],
  };
}

beforeEach(async () => {
  await clearAllLocalData();
});

describe('Eingabe und IndexedDB', () => {
  it('speichert die Beschreibung und liest sie unverändert zurück', async () => {
    const pack = packMit(BESCHREIBUNG);
    await savePack(pack);

    const gelesen = await getPack(pack.meta.id);
    expect(gelesen?.meta.description).toBe(BESCHREIBUNG);

    // Auch die schlanke Metadatenabfrage kennt sie.
    const meta = await getPackMeta(pack.meta.id);
    expect(meta?.description).toBe(BESCHREIBUNG);
  });

  it('übersteht Öffnen und erneutes Speichern', async () => {
    const pack = packMit(BESCHREIBUNG);
    await savePack(pack);

    const geoeffnet = await getPack(pack.meta.id);
    expect(geoeffnet).toBeTruthy();
    // Unverändert wieder speichern – so, wie der Editor es täte.
    await savePack(geoeffnet!);

    expect((await getPack(pack.meta.id))?.meta.description).toBe(BESCHREIBUNG);
  });

  it('lässt sich leeren, ohne die anderen Angaben zu berühren', async () => {
    const pack = packMit(BESCHREIBUNG);
    await savePack(pack);

    const ohne = await getPack(pack.meta.id);
    const { description: _entfernt, ...restMeta } = ohne!.meta;
    await savePack({ ...ohne!, meta: restMeta });

    const danach = await getPack(pack.meta.id);
    expect(danach?.meta.description).toBeUndefined();
    expect(danach?.meta.title).toBe('Coastal erosion');
  });
});

describe('Export, Re-Import und portable Datei', () => {
  it('schreibt die Beschreibung in die .vocabpack.json', () => {
    const datei = serializePack(packMit(BESCHREIBUNG));
    expect(JSON.parse(datei).meta.description).toBe(BESCHREIBUNG);
  });

  it('liest sie beim Re-Import unverändert wieder ein', () => {
    const datei = serializePack(packMit(BESCHREIBUNG));
    const gelesen = parsePackFile(datei);
    expect(gelesen.ok).toBe(true);
    expect(gelesen.ok && gelesen.pack.meta.description).toBe(BESCHREIBUNG);
  });

  it('übersteht den vollen Rundlauf Datei → Datenbank → Datei', async () => {
    const original = packMit(BESCHREIBUNG);
    const gelesen = parsePackFile(serializePack(original));
    expect(gelesen.ok).toBe(true);
    if (!gelesen.ok) return;

    await savePack(gelesen.pack);
    const ausDb = await getPack(gelesen.pack.meta.id);
    const wiederDatei = JSON.parse(serializePack(ausDb!));

    expect(wiederDatei.meta.description).toBe(BESCHREIBUNG);
  });

  it('gilt für die Lerndatei genauso – sie ist dieselbe Datei', () => {
    /*
      Die portable Lerndatei ist keine zweite Sorte Paket: Es ist dasselbe
      `.vocabpack.json`, das die Lehrkraft exportiert. Was hier durchgeht,
      geht dort durch.
    */
    const datei = serializePack(packMit(BESCHREIBUNG));
    const geprueft = vocabPackFileSchema.safeParse(JSON.parse(datei));
    expect(geprueft.success).toBe(true);
    expect(geprueft.success && geprueft.data.meta.description).toBe(BESCHREIBUNG);
  });

  it('nimmt eine sehr lange Beschreibung nicht stillschweigend an', () => {
    const zuLang = 'x'.repeat(2001);
    expect(packMetaSchema.safeParse({ ...packMit(zuLang).meta }).success).toBe(false);
    expect(packMetaSchema.safeParse({ ...packMit('x'.repeat(2000)).meta }).success).toBe(true);
  });
});

describe('Alte Pakete ohne Beschreibung', () => {
  it('bleiben gültig', () => {
    const datei = serializePack(packMit(undefined));
    expect(JSON.parse(datei).meta.description).toBeUndefined();
    const gelesen = parsePackFile(datei);
    expect(gelesen.ok).toBe(true);
    expect(gelesen.ok && gelesen.pack.meta.description).toBeUndefined();
  });

  it('lassen sich speichern und wieder lesen', async () => {
    const pack = packMit(undefined);
    await savePack(pack);
    const gelesen = await getPack(pack.meta.id);
    expect(gelesen?.meta.description).toBeUndefined();
    expect(gelesen?.entries).toHaveLength(1);
  });

  it('bekommen beim Speichern keine erfundene Beschreibung', async () => {
    const pack = packMit(undefined);
    await savePack(pack);
    const datei = JSON.parse(serializePack((await getPack(pack.meta.id))!));
    expect('description' in datei.meta).toBe(false);
  });
});
