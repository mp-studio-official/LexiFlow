// @vitest-environment node
import {
  describeLearningDaysContract,
  type LerntagsSzenario,
} from './learningDaysContract';
import { createFakeCloud } from './fakeCloudRepositories';

/**
 * Der Lerntagsvertrag gegen die kontrollierte Fälschung – die schnelle
 * Abnahme.
 *
 * Die inhaltliche steht daneben: derselbe Vertrag gegen echtes PostgreSQL in
 * `src/cloud/learningDays.pglite.test.ts`.
 *
 * ## Die Uhr der Fälschung
 *
 * `createFakeCloud({ now })` bekommt hier eine Uhr, die der Prüfstand stellt.
 * Das ist **kein** Zeitparameter im Vertrag: Die Verträge selbst nehmen
 * nichts entgegen, und das Stellen passiert beim Aufbau, nicht beim Aufruf.
 * Dieselbe Rolle spielt in SQL die Tatsache, dass die Ereigniszeilen mit
 * einem festen `recorded_at` gesät werden.
 */
const aufbau = async (): Promise<LerntagsSzenario> => {
  let uhr = '2026-10-06T08:00:00Z';
  const cloud = createFakeCloud({ now: () => uhr });
  let ich = 'u-lernend';

  return {
    repositories: () => cloud.repositories,
    async alsPerson(userId) {
      ich = userId;
      cloud.signInAs(userId);
    },
    personen: { lernende: 'u-lernend', zweiteLernende: 'u-lernend-2' },
    async bestaetigeZeitzone(zone) {
      await cloud.repositories.learnerSettings!.confirmTimeZone(zone);
    },
    async spieleEin(zeitpunkt, anzahl, kennung) {
      uhr = zeitpunkt;
      cloud.spieleEreignisseEin({
        userId: ich,
        recordedAt: zeitpunkt,
        anzahl,
        kennung: `${ich}-${kennung}`,
      });
    },
  };
};

describeLearningDaysContract('Lokale Lerntage (Fälschung)', aufbau);
