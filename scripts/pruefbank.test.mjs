// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Die Wache über der Prüfbank.
 *
 * ## Warum es sie gibt
 *
 * Die Prüfbank ist die einzige Stelle, an der LexiFlow überhaupt eine Aussage
 * über schmale Geräte und über WebKit trifft. Sie kostet Laufzeit, und alles,
 * was Laufzeit kostet, wird irgendwann „vorübergehend" kleiner gemacht: ein
 * Projekt weniger, eine Breite weniger, `webkit` auskommentiert, weil die
 * Runde zu lange dauerte. Das fällt niemandem auf, weil die Suite danach
 * **grün** ist – sie prüft nur weniger.
 *
 * Diese Wache macht daraus einen Fehlschlag statt einer stillen Lücke.
 *
 * ## Warum als Text
 *
 * `playwright.config.ts` und `e2e/pruefbank.ts` sind TypeScript und leben im
 * Playwright-Laufzeitkontext; Vitest lädt sie nicht. Die Frage lautet aber
 * ohnehin „steht das da?" – dieselbe Überlegung wie in
 * `scripts/funktionskonfiguration.test.mjs` und `scripts/ci.test.mjs`.
 *
 * ## Was sie ausdrücklich nicht prüft
 *
 * Ob die Prüfungen **bestehen**. Das kann nur ein Lauf mit echten Browsern
 * beantworten, und der läuft nicht hier.
 */

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lies = (pfad) => readFileSync(resolve(wurzel, pfad), 'utf8');

/** Kommentare raus – sonst prüft die Wache ihre eigene Begründung mit. */
function ohneKommentare(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const PRUEFBANK = ohneKommentare(lies('e2e/pruefbank.ts'));
const KONFIGURATIONEN = [
  ['playwright.config.ts', './e2e/pruefbank'],
  ['playwright.portal.config.ts', './e2e/pruefbank'],
];
const BREITENDATEIEN = ['e2e/breiten.spec.ts', 'e2e-portal/breiten.spec.ts'];

describe('die Prüfbank führt vier Breiten und zwei Maschinen', () => {
  it('nennt genau die vier Breiten aus dem Konzept', () => {
    const block = /export const BREITEN = \[([\s\S]*?)\] as const;/.exec(PRUEFBANK);
    expect(block, '`BREITEN` steht nicht mehr in `e2e/pruefbank.ts`').not.toBeNull();

    const breiten = [...block[1].matchAll(/width:\s*(\d+)/g)].map((treffer) =>
      Number(treffer[1]),
    );
    expect(breiten.sort((a, b) => a - b)).toEqual([390, 768, 1024, 1440]);
  });

  it('nennt beide Maschinen, und WebKit ist eine davon', () => {
    const block = /export const MASCHINEN = \[([\s\S]*?)\] as const;/.exec(PRUEFBANK);
    expect(block, '`MASCHINEN` steht nicht mehr in `e2e/pruefbank.ts`').not.toBeNull();

    const namen = [...block[1].matchAll(/name:\s*'([^']+)'/g)].map((treffer) => treffer[1]);
    expect(namen.sort()).toEqual(['chromium', 'webkit']);
    /*
      WebKit ausdrücklich: Es ist die Maschine jedes iPhones, unabhängig vom
      installierten Browser. Fällt sie weg, prüft niemand mehr die Geräte, auf
      denen die meisten Lernenden üben.
    */
    expect(block[1]).toContain("devices['Desktop Safari']");
  });

  it('ergibt acht Breitenprojekte mit sprechenden Namen', () => {
    // Vier Breiten mal zwei Maschinen. Die Namen entstehen aus beiden Teilen,
    // damit im Protokoll `webkit-390` steht und nicht „Projekt 7".
    expect(PRUEFBANK).toMatch(/\$\{maschine\.name\}-\$\{breite\.name\}/);
    expect(PRUEFBANK).toMatch(/MASCHINEN\.flatMap/);
    expect(PRUEFBANK).toMatch(/BREITEN\.map/);
  });

  it('trennt Ablaufprüfungen und Breitenprüfungen über dieselbe Marke', () => {
    expect(PRUEFBANK).toMatch(/export const BREITENMARKE = \/@breiten\//);
    // Das Ablaufprojekt schließt die Marke aus, die Breitenprojekte suchen sie.
    expect(PRUEFBANK).toMatch(/grepInvert:\s*BREITENMARKE/);
    expect(PRUEFBANK).toMatch(/grep:\s*BREITENMARKE/);
  });
});

describe('beide Playwright-Konfigurationen beziehen ihre Projekte aus der Prüfbank', () => {
  for (const [datei, herkunft] of KONFIGURATIONEN) {
    const text = ohneKommentare(lies(datei));

    it(`${datei} lädt die Prüfbank`, () => {
      expect(text).toContain(herkunft);
      expect(text).toMatch(/ablaufProjekt/);
      expect(text).toMatch(/breitenProjekte\(\)/);
    });

    it(`${datei} schreibt keine Projektliste von Hand`, () => {
      /*
        Der eigentliche Rückfall: nicht das Löschen der Prüfbank, sondern ein
        `projects: [{ name: 'chromium', … }]` daneben. Danach steht die
        Prüfbank unbenutzt im Repository und alles ist grün.
      */
      const projektzeile = /projects:\s*\[([\s\S]*?)\]/.exec(text);
      expect(projektzeile, '`projects` fehlt').not.toBeNull();
      expect(projektzeile[1]).not.toMatch(/name:\s*'/);
    });
  }
});

describe('die Breitendateien tragen die Marke', () => {
  for (const datei of BREITENDATEIEN) {
    it(`${datei}: jede Prüfung heißt @breiten`, () => {
      const text = lies(datei);
      const titel = [...text.matchAll(/\btest\(\s*(`|')([^`']*)\1/g)].map(
        (treffer) => treffer[2],
      );
      expect(titel.length, 'keine Prüfung gefunden').toBeGreaterThan(0);

      const ohneMarke = titel.filter((name) => !name.includes('@breiten'));
      expect(
        ohneMarke,
        'diese Prüfungen liefen nur auf einer Breite – und damit nirgends',
      ).toEqual([]);
    });
  }
});
