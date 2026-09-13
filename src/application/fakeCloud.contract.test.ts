// @vitest-environment node
import { describeCourseContract, type KursSzenario } from './courseContract';
import { createFakeCloud } from './fakeCloudRepositories';

/**
 * Der Kursvertrag gegen die kontrollierte Fälschung.
 *
 * Das ist die schnelle Abnahme – Millisekunden statt Sekunden, und deshalb
 * die, die beim Bauen der Oberfläche ständig mitläuft. Sie belegt, dass die
 * Verträge in sich stimmen.
 *
 * Sie belegt **nicht**, dass eine Datenbank dasselbe tut. Dafür läuft derselbe
 * Vertrag ein zweites Mal, gegen echtes PostgreSQL:
 * `src/cloud/courseRepositories.pglite.test.ts`.
 */

describeCourseContract('kontrollierte Fälschung', async (): Promise<KursSzenario> => {
  const cloud = createFakeCloud();

  return {
    repositories: () => cloud.repositories,
    async alsPerson(userId) {
      cloud.signInAs(userId);
    },
    async abmelden() {
      await cloud.repositories.auth!.signOut();
    },
    personen: {
      lehrerin: 'u-lehrerin',
      zweiteLehrkraft: 'u-verwaltung',
      lernende: 'u-lernend',
      zweiteLernende: 'u-lernend-2',
    },
    async lehrkraftEintragen(courseId, userId) {
      cloud.addTeacher(courseId, userId);
    },
  };
});
