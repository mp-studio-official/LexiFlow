import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makePack, makeRichPack } from '../test/fixtures';
import type { Repositories } from './repositories';
import type { VocabPack } from '../domain/schema';

/**
 * Der Paketvertrag – wie der Kursvertrag zweimal erfüllt.
 *
 * Geprüft wird, was ADR-4 zusagt:
 *
 * - Ein Paket behält seine Kennung über jede Bearbeitung.
 * - Eine Veröffentlichung friert eine Fassung ein, die sich danach nicht mehr
 *   ändert – auch nicht, wenn der Entwurf weiterläuft.
 * - Kein Entwurf ist je für Lernende sichtbar.
 * - Veröffentlicht heißt nicht sichtbar: Erst die Zuweisung an einen Kurs
 *   macht eine Fassung für dessen Mitglieder lesbar.
 * - Zurückziehen wirkt – die Fassung verschwindet aus den Kursen.
 */

export interface PaketSzenario {
  repositories(): Repositories;
  alsPerson(userId: string): Promise<void>;
  personen: {
    lehrerin: string;
    zweiteLehrkraft: string;
    lernende: string;
  };
  /** Ein Kurs der ersten Lehrkraft, in dem die lernende Person Mitglied ist. */
  kursMitLernender(): Promise<string>;
}

export function describePackContract(
  name: string,
  aufbau: () => Promise<PaketSzenario>,
  abbau: () => Promise<void> = async () => undefined,
): void {
  describe(`Paketvertrag: ${name}`, () => {
    let szenario: PaketSzenario;

    const repos = () => szenario.repositories();
    const packs = () => repos().packs!;
    const publication = () => repos().publication!;

    beforeEach(async () => {
      szenario = await aufbau();
    });

    afterEach(async () => {
      await abbau();
    });

    async function fehlerVon(versprechen: Promise<unknown>): Promise<string> {
      try {
        await versprechen;
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }

    /** Ein gespeichertes Paket der ersten Lehrkraft. */
    async function neuesPaket(pack: VocabPack = makePack()) {
      await szenario.alsPerson(szenario.personen.lehrerin);
      await packs().saveDraft(pack);
      return pack;
    }

    describe('Entwürfe', () => {
      it('behalten ihre Kennung über das Speichern hinweg', async () => {
        const pack = await neuesPaket();
        const liste = await packs().list();
        expect(liste.map((eintrag) => eintrag.id)).toEqual([pack.meta.id]);
        expect(liste[0]!.entryCount).toBe(pack.entries.length);
      });

      it('lassen sich wieder vollständig lesen', async () => {
        const pack = await neuesPaket(makeRichPack());
        const gelesen = await packs().getDraft(pack.meta.id);

        expect(gelesen?.meta.title).toBe(pack.meta.title);
        expect(gelesen?.entries).toHaveLength(pack.entries.length);
        // Nicht nur die Anzahl: Was hineingeht, kommt heraus.
        expect(gelesen?.entries[0]?.english).toBe(pack.entries[0]?.english);
      });

      it('werden beim zweiten Speichern ersetzt, nicht verdoppelt', async () => {
        const pack = await neuesPaket();
        await packs().saveDraft({
          ...pack,
          meta: { ...pack.meta, title: 'Anders', updatedAt: new Date().toISOString() },
        });

        const liste = await packs().list();
        expect(liste).toHaveLength(1);
        expect(liste[0]!.title).toBe('Anders');
      });

      it('sind wiederholbar zu übernehmen – zweimal ergibt kein zweites Paket', async () => {
        const pack = makePack();
        await szenario.alsPerson(szenario.personen.lehrerin);
        await packs().importFromLocal(pack);
        await packs().importFromLocal(pack);

        expect(await packs().list()).toHaveLength(1);
      });

      it('gehören nur der Person, die sie angelegt hat', async () => {
        const pack = await neuesPaket();
        await szenario.alsPerson(szenario.personen.zweiteLehrkraft);

        expect(await packs().list()).toEqual([]);
        expect(await packs().getDraft(pack.meta.id)).toBeUndefined();
      });

      it('lassen sich löschen', async () => {
        const pack = await neuesPaket();
        await packs().deletePack(pack.meta.id);
        expect(await packs().list()).toEqual([]);
      });
    });

    describe('Veröffentlichen', () => {
      it('zählt die Revisionen von eins an hoch', async () => {
        const pack = await neuesPaket();
        const erste = await publication().publish(pack.meta.id);
        const zweite = await publication().publish(pack.meta.id);

        expect(erste.revision).toBe(1);
        expect(zweite.revision).toBe(2);
        expect((await publication().revisions(pack.meta.id)).map((r) => r.revision)).toEqual([1, 2]);
      });

      it('friert die Fassung ein – ein späterer Entwurf ändert sie nicht', async () => {
        /*
          Die Zusage aus ADR-4. Ohne sie bekäme eine Lerngruppe mitten im
          Halbjahr stillschweigend andere Vokabeln.
        */
        const pack = await neuesPaket();
        const revision = await publication().publish(pack.meta.id);

        await packs().saveDraft({
          ...pack,
          meta: { ...pack.meta, title: 'Ganz anders', updatedAt: new Date().toISOString() },
        });

        const nachher = await publication().publish(pack.meta.id);
        expect(revision.pack.meta.title).toBe(pack.meta.title);
        expect(nachher.pack.meta.title).toBe('Ganz anders');
      });

      it('merkt sich, dass es unveröffentlichte Änderungen gibt', async () => {
        const pack = await neuesPaket();
        expect((await packs().list())[0]!.hasUnpublishedChanges).toBe(true);

        await publication().publish(pack.meta.id);
        expect((await packs().list())[0]!.hasUnpublishedChanges).toBe(false);
        expect((await packs().list())[0]!.publishedRevision).toBe(1);
      });

      it('geht nicht ohne Entwurf', async () => {
        await szenario.alsPerson(szenario.personen.lehrerin);
        expect(await fehlerVon(publication().publish('00000000-0000-4000-8000-000000009999'))).not.toBe('');
      });

      it('gelingt einer fremden Lehrkraft nicht', async () => {
        const pack = await neuesPaket();
        await szenario.alsPerson(szenario.personen.zweiteLehrkraft);
        expect(await fehlerVon(publication().publish(pack.meta.id))).not.toBe('');
      });
    });

    describe('Zuweisen an einen Kurs', () => {
      it('macht die Fassung für die Lerngruppe lesbar', async () => {
        const kurs = await szenario.kursMitLernender();
        const pack = await neuesPaket();
        const revision = await publication().publish(pack.meta.id);
        await publication().assignToCourse(kurs, pack.meta.id, revision.revision, 0);

        await szenario.alsPerson(szenario.personen.lernende);
        const sichtbar = await publication().publishedForCourse(kurs);
        expect(sichtbar.map((eintrag) => eintrag.packId)).toEqual([pack.meta.id]);
        expect(sichtbar[0]!.pack.entries).toHaveLength(pack.entries.length);
      });

      it('veröffentlicht allein reicht nicht', async () => {
        const kurs = await szenario.kursMitLernender();
        const pack = await neuesPaket();
        await publication().publish(pack.meta.id);

        await szenario.alsPerson(szenario.personen.lernende);
        expect(await publication().publishedForCourse(kurs)).toEqual([]);
      });

      it('lässt Lernende weiterhin keinen Entwurf sehen', async () => {
        const kurs = await szenario.kursMitLernender();
        const pack = await neuesPaket();
        const revision = await publication().publish(pack.meta.id);
        await publication().assignToCourse(kurs, pack.meta.id, revision.revision, 0);

        await szenario.alsPerson(szenario.personen.lernende);
        expect(await packs().getDraft(pack.meta.id)).toBeUndefined();
        expect(await packs().list()).toEqual([]);
      });

      it('zeigt der Lerngruppe die zugewiesene Fassung, nicht die neueste', async () => {
        const kurs = await szenario.kursMitLernender();
        const pack = await neuesPaket();
        const erste = await publication().publish(pack.meta.id);
        await publication().assignToCourse(kurs, pack.meta.id, erste.revision, 0);

        await packs().saveDraft({
          ...pack,
          meta: { ...pack.meta, title: 'Neuere Fassung', updatedAt: new Date().toISOString() },
        });
        await publication().publish(pack.meta.id);

        await szenario.alsPerson(szenario.personen.lernende);
        const sichtbar = await publication().publishedForCourse(kurs);
        expect(sichtbar[0]!.pack.meta.title).toBe(pack.meta.title);
      });

      it('lässt sich auf eine neuere Fassung umstellen', async () => {
        const kurs = await szenario.kursMitLernender();
        const pack = await neuesPaket();
        const erste = await publication().publish(pack.meta.id);
        await publication().assignToCourse(kurs, pack.meta.id, erste.revision, 0);

        await packs().saveDraft({
          ...pack,
          meta: { ...pack.meta, title: 'Neuere Fassung', updatedAt: new Date().toISOString() },
        });
        const zweite = await publication().publish(pack.meta.id);
        await publication().assignToCourse(kurs, pack.meta.id, zweite.revision, 0);

        await szenario.alsPerson(szenario.personen.lernende);
        const sichtbar = await publication().publishedForCourse(kurs);
        expect(sichtbar).toHaveLength(1);
        expect(sichtbar[0]!.pack.meta.title).toBe('Neuere Fassung');
      });

      it('gelingt einer lernenden Person nicht', async () => {
        const kurs = await szenario.kursMitLernender();
        const pack = await neuesPaket();
        const revision = await publication().publish(pack.meta.id);

        await szenario.alsPerson(szenario.personen.lernende);
        expect(
          await fehlerVon(publication().assignToCourse(kurs, pack.meta.id, revision.revision, 0)),
        ).not.toBe('');
      });

      it('lässt sich wieder aufheben', async () => {
        const kurs = await szenario.kursMitLernender();
        const pack = await neuesPaket();
        const revision = await publication().publish(pack.meta.id);
        await publication().assignToCourse(kurs, pack.meta.id, revision.revision, 0);
        await publication().removeFromCourse(kurs, pack.meta.id);

        await szenario.alsPerson(szenario.personen.lernende);
        expect(await publication().publishedForCourse(kurs)).toEqual([]);
      });
    });

    describe('Zurückziehen', () => {
      it('nimmt die Fassung aus allen Kursen', async () => {
        // Sonst wäre „zurückgezogen" eine Beschriftung, die nichts tut.
        const kurs = await szenario.kursMitLernender();
        const pack = await neuesPaket();
        const revision = await publication().publish(pack.meta.id);
        await publication().assignToCourse(kurs, pack.meta.id, revision.revision, 0);

        await publication().withdraw(pack.meta.id, revision.revision);

        await szenario.alsPerson(szenario.personen.lernende);
        expect(await publication().publishedForCourse(kurs)).toEqual([]);
      });

      it('löscht die Revision nicht – sie bleibt in der Liste', async () => {
        const pack = await neuesPaket();
        const revision = await publication().publish(pack.meta.id);
        await publication().withdraw(pack.meta.id, revision.revision);

        expect((await publication().revisions(pack.meta.id)).map((r) => r.revision)).toEqual([1]);
      });

      it('verhindert eine erneute Zuweisung derselben Fassung', async () => {
        const kurs = await szenario.kursMitLernender();
        const pack = await neuesPaket();
        const revision = await publication().publish(pack.meta.id);
        await publication().withdraw(pack.meta.id, revision.revision);

        expect(
          await fehlerVon(publication().assignToCourse(kurs, pack.meta.id, revision.revision, 0)),
        ).not.toBe('');
      });
    });
  });
}
