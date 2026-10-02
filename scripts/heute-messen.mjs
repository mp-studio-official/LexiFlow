/*
  „Heute" (5B.4), gemessen statt behauptet — in Chromium **und** WebKit.

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

  `HeuteInhalt` und `Zeitzonenfrage` — die ausgeführten Teile ohne Hooks und
  ohne Speicher, mit festen Daten. Ein von Hand nachgebautes Markup wäre eine
  zweite Quelle und liefe irgendwann auseinander.

      node scripts/heute-messen.mjs

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
import { HeuteInhalt } from ${JSON.stringify(resolve(WURZEL, 'src/hosted/learner/HeutePage.tsx'))};
import { Zeitzonenfrage } from ${JSON.stringify(resolve(WURZEL, 'src/hosted/learner/Zeitzonenfrage.tsx'))};
import { wochenaktivitaet, serieAm } from ${JSON.stringify(resolve(WURZEL, 'src/domain/lernserie.ts'))};

const paket = (packId, titel, kurstitel, dueCount, entryCount, lastPracticedAt) => ({
  courseId: 'k-1', packId, titel, kurstitel, dueCount, entryCount,
  ...(lastPracticedAt === undefined ? {} : { lastPracticedAt }),
});

/*
  Lange Titel gehören zum Fall: Sie sind der übliche Grund für Überlauf, und
  ein Pakettitel kommt aus einer Datei, die jemand anderes geschrieben hat.
*/
const LANG = 'Unerhört langer Pakettitel ohne jede Trennmöglichkeit zwischendrin';

const ZEILEN = [
  paket('p-1', 'Unit 1 — At the coast', 'Englisch 7b', 12, 42, '2026-10-05T18:00:00.000Z'),
  paket('p-2', LANG, 'Wahlpflicht Englisch Jahrgangsstufe 9 — Donnerstagsgruppe', 3, 18, '2026-10-04T18:00:00.000Z'),
  paket('p-3', 'Unit 3 — City life', 'Englisch 7b', 0, 30, '2026-10-03T18:00:00.000Z'),
  paket('p-4', 'Unit 4 — School', 'Englisch 7b', 7, 25, '2026-10-02T18:00:00.000Z'),
];

const HEUTE = '2026-10-08';
const MONTAG = '2026-10-05';
const TAGE = [
  { localDay: '2026-10-05', taskCount: 14 },
  { localDay: '2026-10-06', taskCount: 9 },
  { localDay: '2026-10-07', taskCount: 22 },
  { localDay: HEUTE, taskCount: 11 },
];

const VOLL = {
  weiterlernen: ZEILEN[0],
  faellig: [ZEILEN[0], ZEILEN[3], ZEILEN[1]],
  faelligGesamt: 22,
  kurse: [
    { id: 'k-1', title: 'Englisch 7b', schoolYear: '2026/27', archived: false, createdAt: '2026-09-01T08:00:00.000Z' },
    { id: 'k-2', title: 'Wahlpflicht Englisch Jahrgangsstufe 9 — Donnerstagsgruppe', archived: false, createdAt: '2026-09-01T08:00:00.000Z' },
  ],
  zuletzt: ZEILEN,
  woche: wochenaktivitaet(TAGE, HEUTE, MONTAG),
  serie: serieAm(TAGE, HEUTE, MONTAG),
  wochenziel: 4,
  lerntageDerWoche: 3,
};

const LEER = {
  faellig: [], faelligGesamt: 0, kurse: [], zuletzt: [], woche: [],
};

const seite = (...inhalt) =>
  renderToStaticMarkup(
    h(MemoryRouter, null, h('main', { className: 'huelle__inhalt' }, h('div', { className: 'stack' }, ...inhalt))),
  );

export const faelle = [
  {
    name: 'Heute, volles Konto',
    markup: seite(h(HeuteInhalt, { bild: VOLL, zeitzoneBestaetigt: true })),
  },
  {
    name: 'Heute, frisches Konto ohne Zeitzone',
    markup: seite(
      h(Zeitzonenfrage, { bestaetigen: () => undefined, vorschlag: 'Europe/Berlin' }),
      h(HeuteInhalt, { bild: LEER, zeitzoneBestaetigt: false }),
    ),
  },
  {
    name: 'Heute, Zeitzonenauswahl offen',
    markup: seite(
      h(Zeitzonenfrage, { bestaetigen: () => undefined, vorschlag: undefined }),
      h(HeuteInhalt, { bild: LEER, zeitzoneBestaetigt: false }),
    ),
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
  'src/hosted/learner/heute.css',
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
    wochentage: document.querySelectorAll('.heute-woche__tag').length,
  }));

  /*
    Die sieben Bereiche sind nicht verhandelbar — auch nicht am Telefon und
    auch nicht bei leeren Daten. Eine Messung, die nur den Überlauf prüft,
    bliebe grün, wenn die halbe Seite fehlte.
  */
  const ERWARTET = ['weiterlernen', 'faellig', 'kurse', 'zuletzt', 'woche', 'serie', 'ziele'];
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
  console.log(`\n„Heute", gemessen in ${name}:\n`);

  for (const fall of faelle) {
    console.log(fall.name);
    for (const breite of BREITEN) {
      const zahlen = await miss(browser, name, fall, breite);
      console.log(
        '  %d px  kein Überlauf · %d Bereiche · %d bedienbar · %d Wochentage',
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
    'nichts unter 44 × 44 px, sieben Bereiche überall.',
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
