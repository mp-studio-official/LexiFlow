// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { describeProgressContract, type LernstandSzenario } from './progressContract';
import { createFakeCloud } from './fakeCloudRepositories';
import { makePack } from '../test/fixtures';

/**
 * Der Lernstandsvertrag gegen die kontrollierte Fälschung – die schnelle
 * Abnahme.
 *
 * Die inhaltliche steht daneben: derselbe Vertrag gegen echtes PostgreSQL in
 * `src/cloud/progressRepository.pglite.test.ts`.
 */
const aufbau = async (): Promise<LernstandSzenario> => {
  const cloud = createFakeCloud();
  let kursId = '';

  return {
    repositories: () => cloud.repositories,
    async alsPerson(userId) {
      cloud.signInAs(userId);
    },
    personen: {
      lernende: 'u-lernend',
      zweiteLernende: 'u-lernend-2',
    },
    async kursMitPaket() {
      cloud.signInAs('u-lehrerin');
      const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
      const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});
      const pack = makePack();
      await cloud.repositories.packs!.saveDraft(pack);
      const revision = await cloud.repositories.publication!.publish(pack.meta.id);
      await cloud.repositories.publication!.assignToCourse(
        kurs.id,
        pack.meta.id,
        revision.revision,
        0,
      );

      for (const person of ['u-lernend', 'u-lernend-2']) {
        cloud.signInAs(person);
        await cloud.repositories.invitations!.redeemCode(code);
      }

      kursId = kurs.id;
      return {
        courseId: kurs.id,
        packId: pack.meta.id,
        entryIds: pack.entries.map((eintrag) => eintrag.id),
      };
    },
    async archiviereKurs() {
      cloud.signInAs('u-lehrerin');
      await cloud.repositories.courses!.setArchived(kursId, true);
    },
  };
};

describeProgressContract('kontrollierte Fälschung', aufbau);

/*
  Was die Fälschung nicht kann – benannt, damit ihr Grün nicht mehr sagt, als
  es weiß.

  Der Vertrag enthält seit Migration 11 drei Prüfungen zum Entfernen aus einem
  Kurs. Sie hängen an zwei optionalen Haken, und diese Fassung bietet sie
  nicht an: Sie führt keine Mitgliedschaften, an denen der Lernstand hinge.
  Die drei Prüfungen laufen deshalb **nur** gegen PostgreSQL – dort, wo die
  Regel auch durchgesetzt wird.

  Diese Prüfung hält das fest. Bekäme die Fälschung eines Tages
  Mitgliedschaften, fiele sie auf, und jemand müsste die Haken nachreichen,
  statt sich auf ein Grün zu verlassen, hinter dem nichts steht.
*/
describe('Was die Fälschung beim Lernstand nicht abbildet', () => {
  it('führt keine Mitgliedschaft und bietet deshalb die Entfernen-Haken nicht an', async () => {
    const szenario = await aufbau();
    expect(szenario.entferneAusKurs).toBeUndefined();
    expect(szenario.nimmWiederAuf).toBeUndefined();
  });
});
