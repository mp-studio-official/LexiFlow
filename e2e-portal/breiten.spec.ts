import { expect, test, type Page } from '@playwright/test';

import { breiteAus } from '../e2e/pruefbank';
import {
  fokusIstSichtbar,
  keinQuerlauf,
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
 * ## Warum angemeldet
 *
 * Die Anmeldeseite ist die schmalste Ansicht des Portals und die einzige, die
 * heute unangemeldet erreichbar ist. Hinter ihr liegt alles, worum es geht.
 * Die Anmeldung läuft gegen die Testfassung ohne Server
 * (`VITE_LEXIFLOW_FAKE_CLOUD=1`) – es verlässt keine Anfrage das Gerät.
 *
 * ## Was ein Fehlschlag hier bedeutet
 *
 * Bestandsaufnahme, keine Regression: Vor 5B hat über 390 px nichts eine
 * Aussage getroffen.
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
  { name: 'Anmeldung', oeffne: async (page: Page) => void (await page.goto('./portal/#/anmelden')) },
  { name: 'Lernbereich', oeffne: alsLernende },
  { name: 'Kursbereich der Lehrkraft', oeffne: alsLehrkraft },
  {
    name: 'Paketbereich der Lehrkraft',
    oeffne: async (page: Page) => {
      await alsLehrkraft(page);
      await page.goto('./portal/#/material');
      await expect(page.getByRole('main')).toBeVisible();
    },
  },
] as const;

for (const ansicht of ANSICHTEN) {
  test.describe(ansicht.name, () => {
    test.beforeEach(async ({ page }) => {
      await ansicht.oeffne(page);
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
