import { expect, test, type Page } from '@playwright/test';

import { BREITEN_PORTAL } from '../e2e/adressen';
import { breiteAus } from '../e2e/pruefbank';
import {
  fehlschlaegeBeobachten,
  fokusIstSichtbar,
  keinQuerlauf,
  seiteIstDa,
  tippzieleGrossGenug,
  zoomProbe,
} from '../e2e/layoutpruefungen';

/**
 * Das Portal, auf vier Breiten und zwei Maschinen – und in beiden Rollen.
 *
 * ## Warum das Portal eine eigene Breitendatei braucht
 *
 * Weil es die Auslieferung ist, die umgebaut wird, und weil es die einzige
 * ist, in der die Navigation von der Rolle abhängt. Eine Lehrkraft sieht
 * andere Ziele als eine lernende Person; ein Layoutfehler in der einen
 * Navigation sagt nichts über die andere.
 *
 * ## Warum der Pfad mitgeprüft wird
 *
 * Das Portal liegt unter `/LexiFlow/portal/`, die kontofreie Anwendung unter
 * `/LexiFlow/`. Die Verwechslung sieht im Browser aus wie ein leerer
 * Bildschirm und meldete sich als „element(s) not found". Jede Prüfung hier
 * beginnt deshalb mit `seiteIstDa`.
 *
 * ## Warum angemeldet
 *
 * Hinter der Anmeldung liegt alles, worum es geht. Sie läuft gegen die
 * Testfassung ohne Server (`VITE_LEXIFLOW_FAKE_CLOUD=1`) – es verlässt keine
 * Anfrage das Gerät.
 */

const TIPPBREITEN = 768;

async function alsLernende(page: Page): Promise<void> {
  await page.goto('./portal/#/anmelden');
  await page.getByRole('button', { name: 'Ich lerne' }).click();
  await page.getByLabel('Lern-ID').fill('fuchs-7390');
  await page.getByLabel('Kennwort').fill('testkennwort');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Deine Kurse' })).toBeVisible();
}

async function alsLehrkraft(page: Page): Promise<void> {
  await page.goto('./portal/#/anmelden');
  await page.getByRole('button', { name: 'Ich unterrichte' }).click();
  await page.getByLabel('E-Mail-Adresse').fill('lehrerin@beispiel.invalid');
  await page.getByLabel('Kennwort').fill('testkennwort');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Kurse' })).toBeVisible();
}

const ANSICHTEN = [
  {
    name: 'Anmeldung',
    oeffne: async (page: Page): Promise<void> => {
      await page.goto('./portal/#/anmelden');
    },
  },
  { name: 'Lernbereich', oeffne: alsLernende },
  { name: 'Kursbereich der Lehrkraft', oeffne: alsLehrkraft },
  {
    name: 'Paketbereich der Lehrkraft',
    oeffne: async (page: Page): Promise<void> => {
      await alsLehrkraft(page);
      await page.goto('./portal/#/material');
    },
  },
] as const;

for (const ansicht of ANSICHTEN) {
  test.describe(ansicht.name, () => {
    test.beforeEach(async ({ page }) => {
      const fehlschlaege = fehlschlaegeBeobachten(page);
      /*
        Die Adresse wird **vor** der Anmeldung geprüft: Sonst scheiterte ein
        falscher Server an „Ich lerne" und nicht an dem, was er wirklich ist.
      */
      await page.goto('./portal/');
      await seiteIstDa(page, BREITEN_PORTAL.grundpfad, fehlschlaege);

      await ansicht.oeffne(page);
      await seiteIstDa(page, BREITEN_PORTAL.grundpfad, fehlschlaege);
    });

    test(`@breiten Portal – ${ansicht.name}: nichts läuft über den rechten Rand`, async ({
      page,
    }) => {
      await keinQuerlauf(page);
    });

    test(`@breiten Portal – ${ansicht.name}: Tippziele sind 44 × 44 px groß`, async ({
      page,
    }, info) => {
      test.skip(
        breiteAus(info.project.name) > TIPPBREITEN,
        'Auf breiten Fenstern wird geklickt, nicht getippt.',
      );
      await tippzieleGrossGenug(page);
    });

    test(`@breiten Portal – ${ansicht.name}: der Tastaturfokus ist zu sehen`, async ({ page }) => {
      await fokusIstSichtbar(page);
    });

    test(`@breiten Portal – ${ansicht.name}: hält die doppelte Vergrößerung aus`, async ({
      page,
    }) => {
      await zoomProbe(page);
    });
  });
}
