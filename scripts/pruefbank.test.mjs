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
 * ## Und warum sie seit dem ersten echten Lauf auch die Server prüft
 *
 * Der erste Mac-Lauf hat keinen Layoutbefund geliefert, sondern einen Fehler
 * in der Prüfbank: Auf Port 4173 lief bereits eine fremde Vorschau, und
 * `reuseExistingServer` hat sie still übernommen. Die Suite war unterwegs zur
 * falschen Anwendung, und ihre 48 Fehlschläge sagten „element(s) not found".
 *
 * Der Nachweis „die Suite prüft acht Projekte" war damit richtig **und**
 * wertlos. Deshalb prüft diese Wache jetzt zwei Dinge: dass die Matrix steht,
 * und dass sie auf einen eigenen Server zeigt.
 *
 * ## Warum als Text
 *
 * Die Konfigurationen leben im Playwright-Laufzeitkontext; Vitest lädt sie
 * nicht. Die Frage lautet ohnehin „steht das da?" – dieselbe Überlegung wie in
 * `scripts/funktionskonfiguration.test.mjs`. Was sich *verhält*, steht in
 * `scripts/breitenaufbau.test.mjs` und wird dort ausgeführt.
 */

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lies = (pfad) => readFileSync(resolve(wurzel, pfad), 'utf8');

/** Kommentare raus – sonst prüft die Wache ihre eigene Begründung mit. */
function ohneKommentare(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const PRUEFBANK = ohneKommentare(lies('e2e/pruefbank.ts'));
const ADRESSEN = ohneKommentare(lies('e2e/adressen.ts'));

/** Die Ablaufsuiten: unverändert, jede auf ihrem alten Port. */
const ABLAUF = [
  { datei: 'playwright.config.ts', port: '4173' },
  { datei: 'playwright.portal.config.ts', port: '4183' },
];

/** Die Breitensuiten: eigene Konfiguration, eigener Server. */
const BREITEN = [
  { datei: 'playwright.breiten.config.ts', ziel: 'BREITEN_APP', verzeichnis: './e2e' },
  { datei: 'playwright.portal-breiten.config.ts', ziel: 'BREITEN_PORTAL', verzeichnis: './e2e-portal' },
];

const BREITENDATEIEN = ['e2e/breiten.spec.ts', 'e2e-portal/breiten.spec.ts'];

/** Die Ports aus `e2e/adressen.ts`, so wie sie dort stehen. */
function portZu(name) {
  const block = new RegExp(`export const ${name}: Breitenziel = \\{([\\s\\S]*?)\\};`).exec(ADRESSEN);
  expect(block, `${name} steht nicht mehr in e2e/adressen.ts`).not.toBeNull();
  const port = /port:\s*(\d+)/.exec(block[1]);
  const grundpfad = /grundpfad:\s*'([^']+)'/.exec(block[1]);
  const baseURL = /baseURL:\s*'([^']+)'/.exec(block[1]);
  expect(port, `${name} hat keinen Port`).not.toBeNull();
  return { port: port[1], grundpfad: grundpfad?.[1], baseURL: baseURL?.[1] };
}

describe('die Prüfbank führt vier Breiten und zwei Maschinen', () => {
  it('nennt genau die vier Breiten aus dem Konzept', () => {
    const block = /export const BREITEN = \[([\s\S]*?)\] as const;/.exec(PRUEFBANK);
    expect(block, '`BREITEN` steht nicht mehr in `e2e/pruefbank.ts`').not.toBeNull();

    const breiten = [...block[1].matchAll(/width:\s*(\d+)/g)].map((treffer) => Number(treffer[1]));
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
    expect(PRUEFBANK).toMatch(/\$\{maschine\.name\}-\$\{breite\.name\}/);
    expect(PRUEFBANK).toMatch(/MASCHINEN\.flatMap/);
    expect(PRUEFBANK).toMatch(/BREITEN\.map/);
  });

  it('trennt Ablaufprüfungen und Breitenprüfungen über dieselbe Marke', () => {
    expect(PRUEFBANK).toMatch(/export const BREITENMARKE = \/@breiten\//);
    expect(PRUEFBANK).toMatch(/grepInvert:\s*BREITENMARKE/);
    expect(PRUEFBANK).toMatch(/grep:\s*BREITENMARKE/);
  });
});

describe('die Ablaufsuiten bleiben, wie sie waren', () => {
  for (const { datei, port } of ABLAUF) {
    const text = ohneKommentare(lies(datei));

    it(`${datei} behält Port ${port}`, () => {
      expect(text).toContain(port);
    });

    it(`${datei} fährt nur das Ablaufprojekt`, () => {
      /*
        Die Breitenprojekte gehören hier **nicht** hin. Playwright startet je
        Konfiguration einen Server; stünden sie hier, teilten sie sich
        zwangsläufig den Port der Ablaufsuite – und damit das Problem, das
        behoben werden soll.
      */
      expect(text).toMatch(/ablaufProjekt\(\)/);
      expect(text, 'Breitenprojekte gehören in ihre eigene Konfiguration').not.toMatch(
        /breitenProjekte/,
      );
    });

    it(`${datei} schreibt keine Projektliste von Hand`, () => {
      const projektzeile = /projects:\s*\[([\s\S]*?)\]/.exec(text);
      expect(projektzeile, '`projects` fehlt').not.toBeNull();
      expect(projektzeile[1]).not.toMatch(/name:\s*'/);
    });
  }
});

describe('die Breitensuiten haben je einen eigenen, frischen Server', () => {
  const appPort = portZu('BREITEN_APP');
  const portalPort = portZu('BREITEN_PORTAL');

  it('beide Ports sind verschieden', () => {
    expect(appPort.port).not.toBe(portalPort.port);
  });

  it('keiner der beiden ist ein bestehender Port', () => {
    /* 4173 Ablauf, 4183 Portalablauf, 5173/5174 Vite-Entwicklung. */
    const belegt = ['4173', '4183', '5173', '5174'];
    expect(belegt).not.toContain(appPort.port);
    expect(belegt).not.toContain(portalPort.port);
  });

  it('die erwarteten Grundpfade stehen fest und sind verschieden', () => {
    // Genau hier lag der Fehlgriff: die kontofreie App unter `/LexiFlow/`.
    expect(appPort.grundpfad).toBe('/');
    expect(portalPort.grundpfad).toBe('/LexiFlow/portal/');
  });

  it('die Grundadressen tragen den eigenen Port', () => {
    expect(appPort.baseURL).toContain(`:${appPort.port}/`);
    expect(portalPort.baseURL).toContain(`:${portalPort.port}/`);
  });

  for (const { datei, ziel, verzeichnis } of BREITEN) {
    const text = ohneKommentare(lies(datei));

    it(`${datei} bezieht Port und Adresse aus e2e/adressen.ts`, () => {
      expect(text).toContain("from './e2e/adressen'");
      expect(text).toContain(`${ziel}.baseURL`);
      expect(text).toContain(`${ziel}.port`);
      expect(text).toContain(`testDir: '${verzeichnis}'`);
    });

    it(`${datei} übernimmt keinen fremden Server`, () => {
      /*
        Der Kern der Korrektur. `reuseExistingServer: !process.env['CI']`
        heißt auf einem Entwicklungsrechner: „nimm, was da ist" – und was da
        war, war der Staging-Bau.
      */
      expect(text).toMatch(/reuseExistingServer:\s*false/);
      expect(text, 'kein CI-abhängiges Wiederverwenden mehr').not.toMatch(
        /reuseExistingServer:\s*!/,
      );
      expect(text, 'ohne --strictPort weicht vite still auf den nächsten Port aus').toContain(
        '--strictPort',
      );
    });

    it(`${datei} prüft die Auslieferung, bevor ein Browser startet`, () => {
      expect(text).toMatch(/globalSetup:\s*'\.\/e2e\/auslieferung(\.ts)?'/);
    });

    it(`${datei} fährt nur die Breitenprojekte`, () => {
      expect(text).toMatch(/projects:\s*breitenProjekte\(\)/);
      expect(text).not.toMatch(/ablaufProjekt/);
    });
  }
});

describe('die Breitendateien tragen die Marke und prüfen die Adresse', () => {
  for (const datei of BREITENDATEIEN) {
    const text = lies(datei);

    it(`${datei}: jede Prüfung heißt @breiten`, () => {
      const titel = [...text.matchAll(/\btest\(\s*(`|')([^`']*)\1/g)].map((treffer) => treffer[2]);
      expect(titel.length, 'keine Prüfung gefunden').toBeGreaterThan(0);

      const ohneMarke = titel.filter((name) => !name.includes('@breiten'));
      expect(
        ohneMarke,
        'diese Prüfungen liefen nur auf einer Breite – und damit nirgends',
      ).toEqual([]);
    });

    it(`${datei}: Fokusgestaltung und Tastaturerreichbarkeit bleiben getrennt`, () => {
      /*
        Der Rückfall, den der zweite Mac-Lauf erzwungen hat. Solange beides
        eine Prüfung war, fiel sie unter WebKit durch, ohne dass an der
        Gestaltung etwas gewesen wäre: Safari auf macOS springt mit Tab
        standardmäßig keine Verweise an. Werden die beiden Aufrufe wieder
        zusammengelegt, misst eine Prüfung erneut zwei Dinge und benennt das
        falsche.
      */
      expect(text).toMatch(/fokusIndikatorIstSichtbar\(page\)/);
      expect(text).toMatch(/tastaturErreichbarkeit\(page, maschineAus\(info\.project\.name\)\)/);
      expect(
        text,
        'die Fokusprüfung darf nicht wieder an einem einzelnen Tab hängen',
      ).not.toMatch(/fokusIstSichtbar/);
    });

    it(`${datei}: jede Prüfung beginnt mit der Adressprüfung`, () => {
      /*
        `seiteIstDa` ist die Stelle, an der ein fremder Server auffliegt.
        Verschwindet der Aufruf, misst die Suite wieder eine leere Seite.
      */
      expect(text).toMatch(/seiteIstDa\(page, BREITEN_(APP|PORTAL)\.grundpfad/);
    });
  }
});
