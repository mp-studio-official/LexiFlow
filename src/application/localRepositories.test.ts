import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData } from '../data/db';
import { getPackProgress } from '../data/progressRepo';
import { makePack } from '../test/fixtures';
import { createLocalPackRepository, createLocalProgressRepository, createLocalRepositories } from './localRepositories';
import { LOCAL_SCOPE, type ProgressEvent } from './repositories';

/**
 * Die lokalen Adapter über den bestehenden Dexie-Repositories.
 *
 * Geprüft wird die Naht, nicht der Speicher: Dass `savePack` speichert, steht
 * seit Sprint 1 in `src/data/repos.test.ts`. Hier geht es darum, ob der
 * Vertrag über demselben Speicher dasselbe bedeutet – und ob die Idempotenz
 * hält, die er zusagt.
 */

const pack = makePack();

beforeEach(async () => {
  await clearAllLocalData();
});

function ereignis(over: Partial<ProgressEvent> = {}): ProgressEvent {
  const erster = pack.entries[0]!;
  return {
    eventId: 'e-1',
    courseId: LOCAL_SCOPE,
    packId: pack.meta.id,
    entryId: erster.id,
    direction: 'en-de',
    outcome: 'correct',
    occurredAt: '2026-09-01T10:00:00.000Z',
    ...over,
  };
}

describe('Pakete', () => {
  it('listet, was gespeichert wurde', async () => {
    const repo = createLocalPackRepository();
    await repo.saveDraft(pack);

    const liste = await repo.list();
    expect(liste).toHaveLength(1);
    expect(liste[0]!.title).toBe(pack.meta.title);
    expect(liste[0]!.entryCount).toBe(pack.entries.length);
  });

  it('kennt keine Veröffentlichung – und behauptet auch keine', async () => {
    const repo = createLocalPackRepository();
    await repo.saveDraft(pack);
    const [zusammenfassung] = await repo.list();

    expect(zusammenfassung!.publishedRevision).toBeUndefined();
    expect(zusammenfassung!.hasUnpublishedChanges).toBe(false);
  });

  it('nimmt ein Paket wiederholt entgegen, ohne es zu verdoppeln', async () => {
    const repo = createLocalPackRepository();
    await repo.importFromLocal(pack);
    await repo.importFromLocal(pack);
    expect(await repo.list()).toHaveLength(1);
  });

  it('löscht auf Verlangen', async () => {
    const repo = createLocalPackRepository();
    await repo.saveDraft(pack);
    await repo.deletePack(pack.meta.id);
    expect(await repo.list()).toEqual([]);
  });
});

describe('Lernstand', () => {
  it('zählt eine Antwort', async () => {
    const repo = createLocalProgressRepository();
    await repo.recordEvents([ereignis()]);

    const stand = await repo.myPackProgress(LOCAL_SCOPE, pack.meta.id);
    expect(stand?.answeredCount).toBe(1);
    expect(stand?.correctCount).toBe(1);
  });

  it('verwirft eine Wiederholung derselben Kennung', async () => {
    /*
      Der Kern der Zusage aus dem Vertrag. Lokal schützt das vor dem
      Doppelklick; im Portal vor der Antwort, die unterwegs verlorenging.
    */
    const repo = createLocalProgressRepository();
    await repo.recordEvents([ereignis()]);
    await repo.recordEvents([ereignis()]);

    expect((await repo.myPackProgress(LOCAL_SCOPE, pack.meta.id))?.answeredCount).toBe(1);
  });

  it('unterscheidet zwei verschiedene Kennungen', async () => {
    const repo = createLocalProgressRepository();
    await repo.recordEvents([ereignis(), ereignis({ eventId: 'e-2', outcome: 'wrong' })]);

    const stand = await repo.myPackProgress(LOCAL_SCOPE, pack.meta.id);
    expect(stand?.answeredCount).toBe(2);
    expect(stand?.correctCount).toBe(1);
  });

  it('führt Lernstände je Abfragerichtung getrennt', async () => {
    const repo = createLocalProgressRepository();
    await repo.recordEvents([
      ereignis(),
      ereignis({ eventId: 'e-2', direction: 'de-en' }),
    ]);

    const eintraege = await repo.myEntryProgress(LOCAL_SCOPE, pack.meta.id);
    expect(eintraege.map((eintrag) => eintrag.direction).sort()).toEqual(['de-en', 'en-de']);
  });

  it('zählt eine Runde, ohne eine Antwort zu erfinden', async () => {
    const repo = createLocalProgressRepository();
    await repo.beginSession(LOCAL_SCOPE, pack.meta.id);

    const stand = await getPackProgress(pack.meta.id);
    expect(stand.sessionCount).toBe(1);
    expect(stand.answeredCount).toBe(0);
  });

  it('setzt auf Verlangen zurück', async () => {
    const repo = createLocalProgressRepository();
    await repo.recordEvents([ereignis()]);
    await repo.resetMyProgress(LOCAL_SCOPE, pack.meta.id);

    expect((await repo.myPackProgress(LOCAL_SCOPE, pack.meta.id))?.answeredCount).toBe(0);
    expect(await repo.myEntryProgress(LOCAL_SCOPE, pack.meta.id)).toEqual([]);
  });

  it('ignoriert den Kurs, statt an ihm zu scheitern', async () => {
    // Eine portable Datei bekommt nie einen echten Kurs zu sehen – aber wenn
    // eine Ansicht einen mitgibt, darf das nichts kaputtmachen.
    const repo = createLocalProgressRepository();
    await repo.recordEvents([ereignis({ courseId: 'kurs-egal' })]);
    expect((await repo.myPackProgress('ein-ganz-anderer-kurs', pack.meta.id))?.answeredCount).toBe(1);
  });
});

describe('die Menge der lokalen Speicher', () => {
  it('enthält genau Pakete und Lernstände', () => {
    expect(Object.keys(createLocalRepositories()).sort()).toEqual(['packs', 'progress']);
  });
});
