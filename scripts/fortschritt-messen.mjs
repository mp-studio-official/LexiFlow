/*
  „Mein Fortschritt" (5B.6), gemessen statt behauptet — Chromium **und** WebKit.

  ## Warum zwei Browser

  Weil die Seite ein Raster und `min()`-Breiten benutzt und weil die Hälfte
  der Lernenden sie auf einem iPhone öffnet. Safari ist dort die einzige
  Engine; ein Überlauf, den nur WebKit zeigt, ist kein Randfall, sondern der
  Normalfall für diese Hälfte.

  ## Chromium ist Pflicht, WebKit läuft mit

  Dieselbe Regel wie in `playwright.portable.config.ts`: WebKit läuft, **wenn
  er in der Umgebung installiert ist**. `LEXIFLOW_WEBKIT` schaltet ihn ein –
  entweder mit dem Pfad zu einer vorinstallierten Fassung oder mit `1` für
  die von Playwright verwaltete.

  Fehlt er, sagt dieser Lauf das **deutlich** und behauptet keine Messung,
  die nicht stattgefunden hat. Das ist kein Schönheitsfehler: In einer
  Umgebung, deren Netzzugang `cdn.playwright.dev` nicht erreicht, lässt
  WebKit sich nicht nachinstallieren — und eine Ausgabe, die trotzdem
  „bestanden" sagt, wäre eine Behauptung über eine Engine, die niemand
  gestartet hat.

  ## Was gerendert wird

  `FortschrittInhalt` — der ausgeführte Teil ohne Hooks und ohne Speicher,
  mit festen Daten. Ein von Hand nachgebautes Markup wäre eine zweite Quelle
  und liefe irgendwann auseinander.

      node scripts/fortschritt-messen.mjs

  Braucht Browser; `LEXIFLOW_CHROMIUM` und `LEXIFLOW_WEBKIT` setzen
  vorinstallierte.
*/

import { chromium, webkit } from '@playwright/test';
import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const befunde = [];
const melde = (text) => befunde.push(text);

const EINSTIEG = `
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { FortschrittInhalt } from ${JSON.stringify(resolve(WURZEL, 'src/hosted/learner/FortschrittPage.tsx'))};
import { wochenaktivitaet, serieAm } from ${JSON.stringify(resolve(WURZEL, 'src/domain/lernserie.ts'))};

const HEUTE = '2026-10-08';
const MONTAG = '2026-10-05';
const TAGE = [
  { localDay: '2026-10-05', taskCount: 14 },
  { localDay: '2026-10-06', taskCount: 9 },
  { localDay: '2026-10-07', taskCount: 22 },
  { localDay: HEUTE, taskCount: 11 },
];

/*
  Lange Titel und lange Wörter gehören zum Fall: Sie sind der übliche Grund
  für Überlauf, und beides kommt aus Dateien, die jemand anderes geschrieben
  hat.
*/
const LANG = 'Wahlpflicht Englisch Jahrgangsstufe 9 — Donnerstagsgruppe';
const LANGES_WORT = 'Unerhörtlangeszusammengeschriebenesvokabelwortohnetrennung';

const stand = (beherrscht, gesamt) => ({ beherrscht, offen: gesamt - beherrscht, gesamt });

const schwierig = (i, wort) => ({
  schluessel: 'k-1::p-1::v-' + i + '::en-de',
  wort,
  richtung: i % 2 === 0 ? 'en-de' : 'de-en',
  paket: 'Unit 1 — At the coast',
  kurs: LANG,
  weg: '/lernen/kurs/k-1/ueben/p-1?auswahl=schwierig',
});

const VOLL = {
  serie: serieAm(TAGE, HEUTE, MONTAG),
  woche: wochenaktivitaet(TAGE, HEUTE, MONTAG),
  lerntageDerWoche: 3,
  wochenziel: 4,
  timeZone: 'Europe/Berlin',
  gesamt: stand(37, 104),
  kurse: [
    {
      courseId: 'k-1',
      titel: 'Englisch 7b',
      stand: stand(30, 72),
      pakete: [
        { courseId: 'k-1', packId: 'p-1', titel: 'Unit 1 — At the coast', stand: stand(18, 42) },
        { courseId: 'k-1', packId: 'p-2', titel: 'Unerhört langer Pakettitel ohne jede Trennmöglichkeit zwischendrin', stand: stand(12, 30) },
      ],
    },
    { courseId: 'k-2', titel: LANG, stand: stand(7, 32), pakete: [
      { courseId: 'k-2', packId: 'p-3', titel: 'Unit 4 — School', stand: stand(7, 32) },
    ] },
  ],
  schwierige: [schwierig(1, 'crowded'), schwierig(2, LANGES_WORT), schwierig(3, 'to accuse sb. of sth.')],
};

const LEER = {
  woche: [],
  gesamt: stand(0, 0),
  kurse: [],
  schwierige: [],
};

const seite = (inhalt) =>
  renderToStaticMarkup(
    h(MemoryRouter, null, h('main', { className: 'huelle__inhalt' }, h('div', { className: 'stack' }, inhalt))),
  );

const nichts = () => undefined;

export const faelle = [
  {
    name: 'Fortschritt, volles Konto',
    markup: seite(h(FortschrittInhalt, { bild: VOLL, zielSetzen: nichts, zoneSetzen: nichts })),
  },
  {
    name: 'Fortschritt, frisches Konto',
    markup: seite(h(FortschrittInhalt, { bild: LEER, zielSetzen: nichts, zoneSetzen: nichts })),
  },
];

`;

const gebaut = await esbuild.build({
  stdin: { contents: EINSTIEG, resolveDir: WURZEL, loader: 'ts' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  banner: {
    js:
      "import { createRequire as __erzeugeRequire } from 'node:module';\n" +
      `const require = __erzeugeRequire(${JSON.stringify(
        new URL(`file://${resolve(WURZEL, 'package.json')}`).href,
      )});`,
  },
  write: false,
  logLevel: 'silent',
  loader: { '.css': 'empty' },
});

const { faelle } = await import(
  `data:text/javascript;base64,${Buffer.from(gebaut.outputFiles[0].text).toString('base64')}`
);

const lies = (pfad) => readFileSync(resolve(WURZEL, pfad), 'utf8').replace(/@import[^;]+;/g, '');
const STIL = [
  'src/styles/tokens.css',
  'src/styles/global.css',
  'src/ui/zustaende.css',
  'src/ui/bausteine.css',
  'src/ui/huelle.css',
  /* Der Bildschirm bringt seinen eigenen Stil mit — wie die Hülle den ihren. */
  'src/hosted/learner/fortschritt.css',
]
  .map(lies)
  .join('\n');

const BREITEN = [390, 768, 1024, 1440];

/** Alles, was an einer Breite in einem Browser zu messen ist. */
async function miss(browser, name, fall, breite) {
  const kontext = await browser.newContext({ viewport: { width: breite, height: 900 } });
  const blatt = await kontext.newPage();
  await blatt.setContent(
    `<!doctype html><html lang="de"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>*{box-sizing:border-box}body{margin:0}${STIL}</style>
<body>${fall.markup}</body></html>`,
  );

  const ueberlauf = await blatt.evaluate((b) => document.documentElement.scrollWidth - b, breite);
  if (ueberlauf > 1) {
    melde(`${name} · ${fall.name} @ ${breite} px: ${ueberlauf} px waagerechter Überlauf`);
  }

  /*
    Jedes Bedienelement: mindestens 44 × 44 px. Auch die Breite — eine
    Auswahlliste, die 44 px hoch und 20 px breit ist, trifft niemand.
  */
  const zuKlein = await blatt.evaluate(() => {
    const klein = [];
    for (const el of document.querySelectorAll('main a, main button, main select, main input')) {
      const k = el.getBoundingClientRect();
      if (k.width === 0 && k.height === 0) continue;
      if (Math.ceil(k.height) < 44 || Math.ceil(k.width) < 44) {
        klein.push(`${(el.textContent || el.tagName).trim().slice(0, 28)} ${Math.round(k.width)}×${Math.round(k.height)}`);
      }
    }
    return [...new Set(klein)];
  });
  if (zuKlein.length) melde(`${name} · ${fall.name} @ ${breite} px: zu klein — ${zuKlein.join(', ')}`);

  const zahlen = await blatt.evaluate(() => ({
    bereiche: [...document.querySelectorAll('[data-bereich]')].map((el) => el.dataset.bereich),
    ueberschriften: [...document.querySelectorAll('main h2')].map((h) => h.textContent.trim()),
    bedienbar: document.querySelectorAll('main a, main button, main select').length,
    wochentage: document.querySelectorAll('.fortschritt-woche__tag').length,
  }));

  /*
    Die sieben Abschnitte sind nicht verhandelbar — auch nicht am Telefon und
    auch nicht bei leeren Daten. Eine Messung, die nur den Überlauf prüft,
    bliebe grün, wenn die halbe Seite fehlte.
  */
  const ERWARTET = ['serie', 'woche', 'ziel', 'beherrscht', 'kurse', 'schwierig', 'zeitzone'];
  const fehlend = ERWARTET.filter((k) => !zahlen.bereiche.includes(k));
  if (fehlend.length) melde(`${name} · ${fall.name} @ ${breite} px: Bereiche fehlen — ${fehlend.join(', ')}`);

  await kontext.close();
  return zahlen;
}

const motoren = [
  ['Chromium', chromium, 'LEXIFLOW_CHROMIUM', true],
  ['WebKit', webkit, 'LEXIFLOW_WEBKIT', false],
];

const uebersprungen = [];

for (const [name, motor, umgebung, pflicht] of motoren) {
  const pfad = process.env[umgebung];
  if (!pflicht && !pfad) {
    uebersprungen.push(name);
    continue;
  }

  let browser;
  try {
    browser = await motor.launch(pfad && pfad !== '1' ? { executablePath: pfad } : {});
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : String(fehler);
    if (pflicht) throw fehler;
    /*
      Nicht abbrechen, aber auch nicht verschweigen. Chromium hat dann schon
      gemessen, und das Ergebnis ist etwas wert — es ist nur nicht das
      vollständige.
    */
    uebersprungen.push(`${name} (${text.split('\n')[0]})`);
    continue;
  }
  console.log(`\n„Mein Fortschritt", gemessen in ${name}:\n`);

  for (const fall of faelle) {
    console.log(fall.name);
    for (const breite of BREITEN) {
      const zahlen = await miss(browser, name, fall, breite);
      console.log(
        '  %d px  kein Überlauf · %d Abschnitte · %d bedienbar · %d Wochentage',
        breite,
        zahlen.bereiche.length,
        zahlen.bedienbar,
        zahlen.wochentage,
      );
    }
    console.log('');
  }
  await browser.close();
}

if (befunde.length) {
  console.error('\n%d Befunde:\n', befunde.length);
  for (const b of befunde) console.error('  ' + b);
  process.exit(1);
}

const gelaufen = motoren
  .map(([name]) => name)
  .filter((name) => !uebersprungen.some((eintrag) => eintrag.startsWith(name)));

console.log(
  `\nBestanden in ${gelaufen.join(' und ')}: vier Breiten, kein Überlauf, ` +
    'nichts unter 44 × 44 px, sieben Abschnitte überall.',
);

if (uebersprungen.length) {
  /*
    Auf stderr und ausdrücklich: Dieser Lauf hat weniger geprüft, als er
    prüfen sollte. Wer die Ausgabe überfliegt, soll das sehen.
  */
  console.error(
    `\nNICHT gemessen: ${uebersprungen.join(', ')}. ` +
      'Mit `LEXIFLOW_WEBKIT=1` (oder dem Pfad zu einer Installation) läuft er mit.',
  );
}
