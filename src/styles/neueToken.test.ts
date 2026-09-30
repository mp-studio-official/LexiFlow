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

/**
 * Der Stilcode, der **heute einen Bildschirm trifft** – also alles außer dem
 * Block der Zustandsbausteine.
 *
 * ## Warum diese Unterscheidung nötig wurde
 *
 * P1a hat die Token angelegt und zugesichert: „wird von keiner Regel
 * benutzt". Das war für P1a richtig und für P2 zu eng. P2 legt `Skeleton`,
 * `PageTitle` und `ErrorState` an, gibt ihnen Stil – und benutzt dabei
 * `--cover-ratio` und die Stapelabstände. Kein Bildschirm setzt diese
 * Bausteine ein, also ändert sich nichts; die alte Formulierung fiel
 * trotzdem.
 *
 * Die Zusicherung ist deshalb nicht gelockert, sondern genauer gefasst: Die
 * Token dürfen **nur** im Block der Zustandsbausteine vorkommen. Dass diesen
 * Block kein Bildschirm erreicht, prüft `src/ui/zustaende.unbenutzt.test.ts`.
 */
const MARKE_ZUSTAENDE = 'Zustandsbausteine (5B.P2)';

function ohneZustandsblock(text: string): string {
  const anfang = text.indexOf(MARKE_ZUSTAENDE);
  return anfang < 0 ? text : text.slice(0, anfang);
}

const STILE_IM_EINSATZ = STILDATEIEN.map((datei) =>
  ohneKommentare(ohneZustandsblock(lies(`src/styles/${datei}`))),
).join('\n');

describe('und sie erreichen noch keinen Bildschirm', () => {
  /*
    Der Kern von P1a, in der Fassung, die P2 überlebt: Keines dieser Token
    darf in einer Regel stehen, die ein heutiger Bildschirm trifft. Steht es
    dort, ändert sich etwas – und zwar vor der Freigabe der Entwürfe.
  */
  for (const token of NEUE_TOKEN) {
    it(`${token} steht in keiner Regel, die heute greift`, () => {
      const benutzungen = [...STILE_IM_EINSATZ.matchAll(new RegExp(`var\\(${token}[,)]`, 'g'))];
      expect(
        benutzungen.length,
        `${token} wirkt auf einen bestehenden Bildschirm – das gehört in dessen Umbau`,
      ).toBe(0);
    });
  }

  it('--font-editorial wird überhaupt noch nirgends benutzt', () => {
    /*
      Bei dieser einen bleibt es hart. Sie ist die Schrift der Oberfläche; sie
      irgendwo einzusetzen ist P1b und wartet auf die Freigabe der Entwürfe –
      auch in einem Baustein, den noch niemand sieht.
    */
    const benutzungen = [...ALLE_STILE.matchAll(/var\(--font-editorial[,)]/g)];
    expect(benutzungen.length).toBe(0);
  });

  it('der Block der Zustandsbausteine ist überhaupt da', () => {
    // Sonst ginge die Unterscheidung oben ins Leere und prüfte scheinbar mehr.
    expect(lies('src/styles/global.css')).toContain(MARKE_ZUSTAENDE);
  });

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
