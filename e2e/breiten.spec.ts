import { test } from '@playwright/test';

import { BREITEN_APP } from './adressen';
import { breiteAus, maschineAus } from './pruefbank';
import {
  fehlschlaegeBeobachten,
  fokusIndikatorIstSichtbar,
  keinQuerlauf,
  seiteIstDa,
  skiplinkKommtInsBild,
  tastaturErreichbarkeit,
  tippzieleGrossGenug,
  zoomProbe,
} from './layoutpruefungen';

/**
 * Die kontofreie Anwendung, auf vier Breiten und zwei Maschinen.
 *
 * ## Woran man diese Datei erkennt
 *
 * Jeder Prüfname trägt `@breiten`, und sie läuft nur unter
 * `playwright.breiten.config.ts` – mit eigenem Server auf Port 4291.
 *
 * ## Warum hier keine Abläufe stehen
 *
 * Weil sie achtmal liefen und achtmal dasselbe fänden. Diese Datei ruft
 * Ansichten auf und misst sie. Was die Ansichten tun, prüfen die anderen
 * Dateien – einmal.
 *
 * ## Warum Fokus und Tastatur zwei Prüfungen sind
 *
 * Weil es zwei Aussagen sind. Als sie eine waren, fiel sie unter WebKit
 * sechzehnmal durch – nicht wegen der Gestaltung, sondern weil Safari auf
 * macOS mit Tab standardmäßig keine Verweise anspringt. Die Begründung steht
 * in `e2e/fokus.ts`.
 */

const ANSICHTEN = [
  { name: 'Startseite', adresse: './' },
  { name: 'Lehrkraftbereich', adresse: './#/material' },
  { name: 'Lernbereich', adresse: './#/lernen' },
  { name: 'Datenschutz', adresse: './#/datenschutz' },
] as const;

/* Angetippt wird auf schmalen Geräten; auf 1024 und 1440 wird geklickt. */
const TIPPBREITEN = 768;

for (const ansicht of ANSICHTEN) {
  test.describe(ansicht.name, () => {
    test.beforeEach(async ({ page }) => {
      const fehlschlaege = fehlschlaegeBeobachten(page);
      await page.goto(ansicht.adresse);
      await seiteIstDa(page, BREITEN_APP.grundpfad, fehlschlaege);
    });

    test(`@breiten ${ansicht.name}: nichts läuft über den rechten Rand`, async ({ page }) => {
      await keinQuerlauf(page);
    });

    test(`@breiten ${ansicht.name}: Tippziele sind 44 × 44 px groß`, async ({ page }, info) => {
      test.skip(
        breiteAus(info.project.name) > TIPPBREITEN,
        'Auf breiten Fenstern wird geklickt, nicht getippt.',
      );
      await tippzieleGrossGenug(page);
    });

    test(`@breiten ${ansicht.name}: der Fokus ist zu sehen`, async ({ page }) => {
      await fokusIndikatorIstSichtbar(page);
    });

    test(`@breiten ${ansicht.name}: der Skip-Link kommt beim Fokussieren ins Bild`, async ({
      page,
    }) => {
      await skiplinkKommtInsBild(page);
    });

    test(`@breiten ${ansicht.name}: man kommt mit der Tastatur hin`, async ({ page }, info) => {
      await tastaturErreichbarkeit(page, maschineAus(info.project.name));
    });

    test(`@breiten ${ansicht.name}: hält auch die doppelte Vergrößerung aus`, async ({ page }) => {
      await zoomProbe(page);
    });
  });
}
