// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  describeLearnerSettingsContract,
  type EinstellungsSzenario,
} from './learnerSettingsContract';
import { createFakeCloud } from './fakeCloudRepositories';

/**
 * Der Einstellungsvertrag gegen die kontrollierte Fälschung – die schnelle
 * Abnahme.
 *
 * Die inhaltliche steht daneben: derselbe Vertrag gegen echtes PostgreSQL in
 * `src/cloud/learnerSettings.pglite.test.ts`.
 */
const aufbau = async (): Promise<EinstellungsSzenario> => {
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
  };
};

describeLearnerSettingsContract('Lernendeneinstellungen (Fälschung)', aufbau);

describe('Die Fälschung legt nichts vorsorglich an', () => {
  it('hat nach dem Anmelden keinen Eintrag im Zustand', async () => {
    /*
      Der Blick an den Vertrag vorbei. Eine Fälschung, die beim Anmelden eine
      leere Zeile anlegte, bestünde den Vertrag oben – und verdeckte, dass
      „keine Zeile" in der Datenbank ein eigener Zustand ist.
    */
    const cloud = createFakeCloud();
    cloud.signInAs('u-lernend');
    await cloud.repositories.learnerSettings!.mySettings();
    expect(cloud.state.learnerSettings.size).toBe(0);
  });

  it('legt erst beim Bestätigen einen Eintrag an', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lernend');
    await cloud.repositories.learnerSettings!.confirmTimeZone('Europe/Berlin');
    expect(cloud.state.learnerSettings.get('u-lernend')).toEqual({ timeZone: 'Europe/Berlin' });
  });

  it('verlangt eine Anmeldung', async () => {
    const cloud = createFakeCloud();
    await expect(cloud.repositories.learnerSettings!.mySettings()).rejects.toThrow(
      /Nicht angemeldet/,
    );
  });
});
