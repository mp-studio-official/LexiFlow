import { test } from '@playwright/test';

import { BREITEN_APP } from './adressen';
import { breiteAus } from './pruefbank';
import {
  fehlschlaegeBeobachten,
  fokusIstSichtbar,
  keinQuerlauf,
  seiteIstDa,
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
 * ## Warum jede Prüfung zuerst die Adresse prüft
 *
 * Der erste echte Lauf hat nie eine Layoutprüfung erreicht: Auf dem Port lief
 * eine fremde Vorschau unter `/LexiFlow/`, alle Bündel kamen als 404 zurück,
 * und die Ansicht blieb leer. Die Meldung lautete „element(s) not found".
 * `seiteIstDa` stellt die Frage, die dahinter lag, und stellt sie zuerst.
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

    test(`@breiten ${ansicht.name}: der Tastaturfokus ist zu sehen`, async ({ page }) => {
      await fokusIstSichtbar(page);
    });

    test(`@breiten ${ansicht.name}: hält auch die doppelte Vergrößerung aus`, async ({ page }) => {
      await zoomProbe(page);
    });
  });
}
