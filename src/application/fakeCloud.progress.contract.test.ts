// @vitest-environment node
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
describeProgressContract('kontrollierte Fälschung', async (): Promise<LernstandSzenario> => {
  const cloud = createFakeCloud();

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

      return { courseId: kurs.id, packId: pack.meta.id };
    },
  };
});
