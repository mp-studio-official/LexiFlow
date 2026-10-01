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

/**
 * E19 — dieselben Zahlen wie im freigegebenen Entwurf.
 *
 * ## Warum das geprüft wird
 *
 * Die Palette ist zweimal aufgeschrieben: einmal in
 * `docs/mockups/portal-variante-b/variante.css`, wogegen Marc sie abgenommen
 * hat, und einmal hier, wo sie wirkt. Zwei Fassungen derselben Entscheidung
 * laufen auseinander — das ist keine Vermutung, genau so ist der
 * Navigationswiderspruch entstanden, den E23 aufräumen musste.
 *
 * Also: Wer hier eine Farbe ändert, ohne den Entwurf zu ändern, bekommt es
 * gesagt. Und wer den Entwurf ändert, ohne hier nachzuziehen, auch.
 *
 * ## Was ausdrücklich **nicht** übereinstimmen muss
 *
 * `--rand-bedienung` hat im Entwurf keine Entsprechung — der Entwurf setzt
 * dort `--rand-stark` ein, das die 3 : 1 für die Kontur eines Bedienelements
 * nicht erreicht (siehe `contrast.test.ts`). Die Abweichung ist Absicht und
 * steht deshalb hier, nicht in der Abgleichtabelle.
 */
const ENTWURF = lies('docs/mockups/portal-variante-b/variante.css');

/** Produktionsname → Name im Entwurf. Gleich, wo nicht anders vermerkt. */
const E19_ABGLEICH: ReadonlyArray<readonly [string, string]> = [
  ['--grund', '--grund'],
  ['--grund-tief', '--grund-tief'],
  ['--flaeche', '--flaeche'],
  ['--flaeche-stumpf', '--flaeche-stumpf'],
  ['--tinte', '--tinte'],
  ['--tinte-2', '--tinte-2'],
  ['--tinte-3', '--tinte-3'],
  ['--tinte-invers', '--tinte-invers'],
  ['--rand', '--rand'],
  ['--rand-stark', '--rand-stark'],
  ['--aurora-violett', '--aurora-violett'],
  ['--aurora-rosa', '--aurora-rosa'],
  ['--aurora-himmel', '--aurora-himmel'],
  ['--aurora-pfirsich', '--aurora-pfirsich'],
  ['--gut', '--gut'],
  ['--gut-weich', '--gut-weich'],
  ['--warn', '--warn'],
  ['--warn-weich', '--warn-weich'],
  ['--fehler', '--fehler'],
  ['--fehler-weich', '--fehler-weich'],
  ['--akzent', '--akzent'],
  ['--akzent-weich', '--akzent-weich'],
  // Radien: im Entwurf kürzer benannt, derselbe Wert.
  ['--rund-klein', '--r-klein'],
  ['--rund', '--r'],
  ['--rund-gross', '--r-gross'],
  ['--rund-xl', '--r-xl'],
];

function wert(css: string, name: string): string {
  const treffer = new RegExp(`${name}:\\s*([^;]+);`).exec(ohneKommentare(css));
  if (!treffer?.[1]) throw new Error(`${name} fehlt`);
  return treffer[1].trim();
}

describe('E19 steht in Produktion und Entwurf gleich', () => {
  it.each(E19_ABGLEICH)('%s entspricht %s im Entwurf', (hier, dort) => {
    expect(wert(TOKENS, hier)).toBe(wert(ENTWURF, dort));
  });

  it('die Abgleichtabelle deckt jede neue Farbe ab', () => {
    /*
      Die Gegenprobe zur Gegenprobe: Eine Tabelle, aus der jemand eine Zeile
      löscht, prüft weniger und bleibt grün. Gezählt wird deshalb, wie viele
      E19-Farbtoken es gibt — jedes muss abgeglichen sein oder begründet nicht.
    */
    const block = TOKENS.slice(TOKENS.indexOf('E19 — die Oberflächenpalette'));
    const farben = [...block.matchAll(/^\s*(--[a-z0-9-]+):\s*#[0-9a-f]{6};/gim)].map((t) => t[1]);
    const abgeglichen = new Set(E19_ABGLEICH.map(([hier]) => hier));
    const BEGRUENDET_ABWEICHEND = ['--rand-bedienung'];
    const offen = farben.filter((f) => !abgeglichen.has(f) && !BEGRUENDET_ABWEICHEND.includes(f));
    expect(offen, 'neue Farbe ohne Abgleich gegen den Entwurf').toEqual([]);
    expect(farben.length).toBeGreaterThanOrEqual(22);
  });

  it('--rand-bedienung weicht bewusst ab und ist dunkler als der Entwurfsrand', () => {
    expect(wert(TOKENS, '--rand-bedienung')).not.toBe(wert(ENTWURF, '--rand-stark'));
  });
});

describe('die E19-Token erreichen in 5B.1 noch keinen Bildschirm', () => {
  /*
    Dieselbe Zusicherung wie bei P1a, für die neue Palette: Sie ist angelegt
    und wirkt nirgends. Geprüft gegen die Stylesheets, die heute ausgeliefert
    werden — `global.css` und `portal.css` hängen an den Einstiegspunkten.
    Die Bausteine von 5B.1 bringen ihre eigenen Stylesheets mit und stehen
    deshalb hier nicht; dass **sie** keinen Bildschirm erreichen, prüft
    `src/ui/zustaende.unbenutzt.test.ts`.
  */
  const AUSGELIEFERT = ['global.css', 'portal.css']
    .map((datei) => ohneKommentare(lies(`src/styles/${datei}`)))
    .join('\n');

  const E19_TOKEN = E19_ABGLEICH.map(([hier]) => hier).concat([
    '--rand-bedienung',
    '--schatten-flach',
    '--schatten-schwebend',
    '--glas-grund',
    '--glas-grund-fest',
    '--glas-kante',
    '--glas-unschaerfe',
  ]);

  it.each(E19_TOKEN)('%s wirkt auf keinen heutigen Bildschirm', (token) => {
    const benutzungen = [...AUSGELIEFERT.matchAll(new RegExp(`var\\(${token}[,)]`, 'g'))];
    expect(benutzungen.length, `${token} gehört in den Umbau des Bildschirms, nicht nach 5B.1`).toBe(
      0,
    );
  });

  it('die alte Palette steht unverändert da', () => {
    /*
      5B.1 ist additiv. Würde hier `--canvas` auf den kühlen Grund gesetzt,
      änderte sich mit einer Zeile jede Ansicht des Produkts.
    */
    expect(wert(TOKENS, '--canvas')).toBe('var(--brand-parchment)');
    expect(wert(TOKENS, '--ink')).toBe('var(--brand-aubergine)');
    expect(wert(TOKENS, '--brand-parchment')).toBe('#f8efe3');
  });
});
