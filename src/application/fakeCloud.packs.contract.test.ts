// @vitest-environment node
import { describePackContract, type PaketSzenario } from './packContract';
import { createFakeCloud } from './fakeCloudRepositories';

/**
 * Der Paketvertrag gegen die kontrollierte Fälschung – die schnelle Abnahme.
 *
 * Die inhaltliche steht daneben: derselbe Vertrag gegen echtes PostgreSQL in
 * `src/cloud/packRepositories.pglite.test.ts`.
 */
describePackContract('kontrollierte Fälschung', async (): Promise<PaketSzenario> => {
  const cloud = createFakeCloud();

  return {
    repositories: () => cloud.repositories,
    async alsPerson(userId) {
      cloud.signInAs(userId);
    },
    personen: {
      lehrerin: 'u-lehrerin',
      zweiteLehrkraft: 'u-verwaltung',
      lernende: 'u-lernend',
    },
    async kursMitLernender() {
      cloud.signInAs('u-lehrerin');
      const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
      const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});
      cloud.signInAs('u-lernend');
      await cloud.repositories.invitations!.redeemCode(code);
      cloud.signInAs('u-lehrerin');
      return kurs.id;
    },
  };
});
