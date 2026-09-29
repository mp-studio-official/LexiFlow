import { expect, test } from '@playwright/test';

import { breiteAus } from './pruefbank';
import {
  fokusIstSichtbar,
  keinQuerlauf,
  tippzieleGrossGenug,
  zoomProbe,
} from './layoutpruefungen';

/**
 * Die kontofreie Anwendung, auf vier Breiten und zwei Maschinen.
 *
 * ## Woran man diese Datei erkennt
 *
 * Jeder Prüfname trägt `@breiten`. Das ist kein Schmuck: Die Marke entscheidet,
 * in welchem Projekt die Prüfung läuft (`e2e/pruefbank.ts`). Ohne Marke liefe
 * sie einmal auf 1280 px – also genau dort, wo sie nichts findet.
 *
 * ## Warum hier keine Abläufe stehen
 *
 * Weil sie achtmal liefen und achtmal dasselbe fänden. Diese Datei ruft
 * Ansichten auf und misst sie. Was die Ansichten tun, prüfen die anderen
 * Dateien – einmal.
 *
 * ## Was ein Fehlschlag hier bedeutet
 *
 * Nicht, dass die Prüfung falsch ist. Bis 5B gab es genau ein Projekt mit
 * einer Breite; über 390 px hat bisher **nichts** eine Aussage getroffen. Was
 * hier zuerst rot wird, ist deshalb die Bestandsaufnahme für den Umbau und
 * keine Regression.
 */

const ANSICHTEN = [
  { name: 'Startseite', adresse: '/' },
  { name: 'Lehrkraftbereich', adresse: '/#/material' },
  { name: 'Lernbereich', adresse: '/#/lernen' },
  { name: 'Datenschutz', adresse: '/#/datenschutz' },
] as const;

/* Angetippt wird auf schmalen Geräten; auf 1024 und 1440 wird geklickt. */
const TIPPBREITEN = 768;

for (const ansicht of ANSICHTEN) {
  test.describe(ansicht.name, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(ansicht.adresse);
      await expect(page.getByRole('main')).toBeVisible();
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

    test(`@breiten ${ansicht.name}: der Tastaturfokus ist zu sehen`, async ({ page }) => {
      await fokusIstSichtbar(page);
    });

    test(`@breiten ${ansicht.name}: hält auch die doppelte Vergrößerung aus`, async ({ page }) => {
      await zoomProbe(page);
    });
  });
}
