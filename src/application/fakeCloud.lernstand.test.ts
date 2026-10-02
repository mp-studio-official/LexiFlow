// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createFakeCloud } from './fakeCloudRepositories';
import type { EntryProgress } from '../domain/schema';

/**
 * `allMyEntryProgress` gegen die Fälschung — dieselbe Zusage wie in SQL.
 *
 * Die inhaltliche Prüfung steht gegen echtes PostgreSQL in
 * `src/cloud/learningDays.pglite.test.ts`' Nachbarn
 * `learnerSettings.pglite.test.ts`: dort trennt die Zugriffsregel die
 * Zeilen, hier der Schlüssel im Zustand.
 *
 * Diese Datei gibt es, weil die Prüfungen von „Mein Fortschritt" gegen die
 * Fälschung laufen. Verhielte sie sich anders als SQL, prüften sie einen
 * Lernstand, den es im Produkt nicht gibt.
 */

function stand(packId: string, entryId: string): EntryProgress {
  return {
    key: `${packId}::${entryId}::en-de`,
    packId,
    entryId,
    direction: 'en-de',
    box: 1,
    correctCount: 0,
    wrongCount: 0,
    streak: 0,
    dueAt: '2026-10-10T00:00:00.000Z',
    rev: 1,
  };
}

describe('allMyEntryProgress (Fälschung)', () => {
  it('gibt nur die Zeilen der angemeldeten Person heraus', async () => {
    const cloud = createFakeCloud();
    cloud.state.entryProgress.set('u-lernend::k-1::p-1', [stand('p-1', 'v-1')]);
    cloud.state.entryProgress.set('u-lernend::k-2::p-9', [stand('p-9', 'v-7')]);
    cloud.state.entryProgress.set('u-lernend-2::k-1::p-1', [stand('p-1', 'v-1')]);

    cloud.signInAs('u-lernend');
    const meins = await cloud.repositories.progressOverview!.allMyEntryProgress();
    expect(meins).toHaveLength(2);
    expect(meins.map((zeile) => zeile.courseId).sort()).toEqual(['k-1', 'k-2']);

    cloud.signInAs('u-lernend-2');
    const andere = await cloud.repositories.progressOverview!.allMyEntryProgress();
    expect(andere).toHaveLength(1);
    expect(andere[0]!.courseId).toBe('k-1');
  });

  it('ist bei einem frischen Konto leer und kein Fehler', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lernend');
    await expect(cloud.repositories.progressOverview!.allMyEntryProgress()).resolves.toEqual([]);
  });

  it('verlangt eine Anmeldung', async () => {
    const cloud = createFakeCloud();
    await expect(cloud.repositories.progressOverview!.allMyEntryProgress()).rejects.toThrow(
      /Nicht angemeldet/,
    );
  });

  it('nimmt keinen Parameter entgegen', async () => {
    const cloud = createFakeCloud();
    expect(cloud.repositories.progressOverview!.allMyEntryProgress.length).toBe(0);
    expect(Object.keys(cloud.repositories.progressOverview!).sort()).toEqual([
      'allMyEntryProgress',
      'myDueOverview',
    ]);
  });
});
