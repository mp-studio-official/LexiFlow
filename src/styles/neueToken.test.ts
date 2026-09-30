import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * P1a: Was schon dasteht, und was noch nirgends wirkt.
 *
 * ## Die zwei Aussagen dieses Blocks
 *
 * 1. **Satoshi ist weg.** Es stand als unbestimmte Erstwahl in `--font-sans`
 *    und `--font-display`, wurde aber nie ausgeliefert: Die Lizenzlage der
 *    Fontshare-Datei ließ sich für die Weitergabe in einer portablen
 *    Einzel-HTML nicht zweifelsfrei klären. Damit sah dieselbe Oberfläche auf
 *    zwei Rechnern verschieden aus, und die Fassung, gegen die gestaltet
 *    wurde, war die, die niemand bekommt. E10 hat das entschieden.
 *
 * 2. **Die neuen Token sind angelegt und noch unbenutzt.** Das ist die
 *    eigentliche Zusicherung dieses Tests. Marc hat P1 in zwei Teile geteilt,
 *    weil die Umschaltung von `--font-display` auf Newsreader jeden
 *    bestehenden Bildschirm sichtbar ändern würde – vor der Freigabe der
 *    Entwürfe. P1a darf deshalb **nichts** gestalterisch verändern.
 *
 * Eine Zusage „ändert nichts" ist ohne Nachweis eine Behauptung. Hier steht
 * der Nachweis.
 *
 * ## Warum als Text
 *
 * Die Frage lautet „steht das da, und steht es sonst nirgends?". Sie ist über
 * den Quelltext zu beantworten; ein gerendertes Stylesheet beantwortete sie
 * nicht besser, nur langsamer.
 */

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lies = (pfad: string): string => readFileSync(resolve(wurzel, pfad), 'utf8');

const TOKENS = lies('src/styles/tokens.css');
const FONTS = lies('src/styles/fonts.css');

/*
  Alle Stylesheets, nicht eine Auswahl: Die Frage „wird dieses Token
  irgendwo benutzt?" ist nur so viel wert, wie sie vollständig ist.
*/
const STILDATEIEN = [
  'fonts.css',
  'global.css',
  'portal.css',
  'tokens.css',
];

/** Die Stylesheets ohne Kommentare – sonst prüft die Wache ihre Begründung mit. */
function ohneKommentare(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

const ALLE_STILE = STILDATEIEN.map((datei) => ohneKommentare(lies(`src/styles/${datei}`))).join('\n');

/** Die Token, die P1a anlegt – und die P1b und P2 erst benutzen werden. */
const NEUE_TOKEN = [
  '--font-editorial',
  '--cover-ratio',
  '--stack-tight',
  '--stack-snug',
  '--stack-normal',
  '--stack-loose',
  '--stack-section',
  '--surface-editorial',
  '--text-editorial',
];

describe('Satoshi ist keine Annahme mehr', () => {
  it('steht in keinem Stylesheet mehr', () => {
    expect(ALLE_STILE).not.toMatch(/satoshi/i);
  });

  it('die Oberflächenschrift ist Manrope, und zwar zuerst', () => {
    const stile = ohneKommentare(TOKENS);
    for (const token of ['--font-sans', '--font-display']) {
      const zeile = new RegExp(`${token}:\\s*([^;]+);`).exec(stile);
      expect(zeile, `${token} fehlt`).not.toBeNull();
      const erster = (zeile?.[1] ?? '').split(',')[0]?.trim();
      expect(erster, `${token} beginnt nicht mit Manrope`).toBe("'Manrope Variable'");
    }
  });

  it('Manrope wird weiterhin selbst mitgeliefert', () => {
    // Die Entscheidung hängt daran: Was vorn steht, muss auch da sein.
    expect(FONTS).toMatch(/Manrope Variable/);
    expect(FONTS).toMatch(/\.woff2/);
  });
});

describe('die neuen Token für 5B sind angelegt', () => {
  for (const token of NEUE_TOKEN) {
    it(`${token} ist definiert`, () => {
      expect(ohneKommentare(TOKENS)).toMatch(new RegExp(`${token}:\\s*[^;]+;`));
    });
  }

  it('--cover-ratio trägt das Verhältnis aus E4', () => {
    expect(ohneKommentare(TOKENS)).toMatch(/--cover-ratio:\s*16 \/ 10;/);
  });

  it('--font-editorial ist Newsreader – dieselbe Datei wie --font-quote', () => {
    const stile = ohneKommentare(TOKENS);
    expect(stile).toMatch(/--font-editorial:\s*'Newsreader Variable'/);
    expect(stile).toMatch(/--font-quote:\s*'Newsreader Variable'/);
  });
});

describe('und sie wirken noch nirgends', () => {
  /*
    Der Kern von P1a. Wird eines dieser Token irgendwo benutzt, ändert sich ein
    Bildschirm – und zwar vor der Freigabe der Entwürfe. Dann gehört die
    Änderung nach P1b oder P2, nicht hierher.
  */
  for (const token of NEUE_TOKEN) {
    it(`${token} wird von keiner Regel benutzt`, () => {
      const benutzungen = [...ALLE_STILE.matchAll(new RegExp(`var\\(${token}[,)]`, "g"))];
      expect(
        benutzungen.length,
        `${token} ist in Benutzung – das gehört nach P1b oder P2, nicht in P1a`,
      ).toBe(0);
    });
  }

  it('--font-display trägt noch nicht die editoriale Schrift', () => {
    /*
      Die Umschaltung ist P1b und wartet auf die Freigabe der Entwürfe. Sie
      hier vorwegzunehmen hieße, jeden bestehenden Bildschirm zu ändern, bevor
      jemand den neuen gesehen hat.
    */
    const stile = ohneKommentare(TOKENS);
    const zeile = /--font-display:\s*([^;]+);/.exec(stile);
    expect(zeile?.[1]).not.toMatch(/Newsreader/);
    expect(zeile?.[1]).not.toMatch(/--font-editorial/);
  });
});
