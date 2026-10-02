/*
  Die neuen Bildschirme, gemessen statt behauptet — Start (5B.3) und Üben (5B.5).

  ## Warum ein eigener Lauf

  `huelle-messen.mjs` misst die Hülle mit einem Platzhalter darin. Ob der
  Inhalt des Starts bei 390 px überläuft, ob seine Verweise als Tippziele
  taugen, sagt das nicht — das hängt an diesem Bildschirm.

  ## Was gerendert wird

  `StartInhalt` aus `StartPage.tsx`, mit festen Daten: der ausgeführte Teil
  ohne Hooks und Speicher. Ein von Hand nachgebautes Markup wäre eine zweite
  Quelle und liefe irgendwann auseinander.

      node scripts/start-messen.mjs

  Braucht einen Browser; `LEXIFLOW_CHROMIUM` setzt einen vorinstallierten.
*/

import { chromium } from '@playwright/test';
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
import { StartInhalt } from ${JSON.stringify(resolve(WURZEL, 'src/hosted/teacher/StartPage.tsx'))};
import { UebenInhalt } from ${JSON.stringify(resolve(WURZEL, 'src/hosted/learner/UebenPage.tsx'))};

const kurs = (id, title, mitglieder) => ({
  kurs: { id, title, archived: false, createdAt: '2026-09-01T08:00:00.000Z' },
  mitglieder,
});

/* Lange Namen gehören zum Fall: Sie sind der übliche Grund für Überlauf. */
const KURSE = [
  kurs('k-1', 'Englisch 7b', 24),
  kurs('k-2', 'Wahlpflicht Englisch Jahrgangsstufe 9 — Donnerstagsgruppe', 1),
  kurs('k-3', 'Förderkurs', 0),
];

const paket = (id, title, entryCount, publishedRevision, hasUnpublishedChanges) => ({
  id,
  title,
  grade: '7',
  entryCount,
  ...(publishedRevision === undefined ? {} : { publishedRevision }),
  hasUnpublishedChanges,
  updatedAt: '2026-09-01T08:00:00.000Z',
});

const PAKETE = [
  paket('p-1', 'Unit 1 — At the coast', 42, 1, false),
  paket('p-2', 'Unit 2', 0, undefined, false),
  paket('p-3', 'Unerhört langer Pakettitel ohne jede Trennmöglichkeit zwischendrin', 12, undefined, false),
];

const seite = (inhalt) =>
  renderToStaticMarkup(
    h(MemoryRouter, null, h('main', { className: 'huelle__inhalt' }, h('div', { className: 'stack' }, inhalt))),
  );

const karte = (form, titel, satz, ziele) => ({ form, titel, satz, ziele, gesamt: ziele.reduce((s, z) => s + z.anzahl, 0) });

const UEBUNGSKARTEN = [
  karte('faellig', 'Fällige Wiederholungen', 'Wörter, die heute wieder dran sind. Danach ist Ruhe — nicht mehr.', [
    { courseId: 'k-1', packId: 'p-1', titel: 'Unit 1 — At the coast', anzahl: 12 },
    { courseId: 'k-2', packId: 'p-3', titel: 'Unerhört langer Pakettitel ohne jede Trennmöglichkeit zwischendrin', anzahl: 3 },
  ]),
  karte('schwierig', 'Schwierige Wörter', 'Die, bei denen es mehrmals danebenging und die noch nicht sitzen.', [
    { courseId: 'k-1', packId: 'p-1', titel: 'Unit 1 — At the coast', anzahl: 4 },
  ]),
  karte('en-de', 'Englisch → Deutsch', 'Nur verstehen: Du siehst das englische Wort und nennst die deutsche Bedeutung.', [
    { courseId: 'k-1', packId: 'p-1', titel: 'Unit 1 — At the coast', anzahl: 42 },
  ]),
];

export const faelle = [
  {
    name: 'Üben, mehrere Karten',
    markup: seite(h(UebenInhalt, { karten: UEBUNGSKARTEN })),
  },
  {
    name: 'voll, ohne KI-Zugang',
    markup: seite(h(StartInhalt, { kurse: KURSE, pakete: PAKETE, kiEingerichtet: false })),
  },
  {
    name: 'leeres Konto',
    markup: seite(h(StartInhalt, { kurse: [], pakete: [], kiEingerichtet: true })),
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

const TOKEN = readFileSync(resolve(WURZEL, 'src/styles/tokens.css'), 'utf8');
const GLOBAL = readFileSync(resolve(WURZEL, 'src/styles/global.css'), 'utf8');
const ZUSTAENDE = readFileSync(resolve(WURZEL, 'src/ui/zustaende.css'), 'utf8').replace(
  /@import[^;]+;/g,
  '',
);
const HUELLE = readFileSync(resolve(WURZEL, 'src/ui/huelle.css'), 'utf8').replace(
  /@import[^;]+;/g,
  '',
);
/* Der Bildschirm bringt seinen eigenen Stil mit — wie die Hülle den ihren. */
const START = readFileSync(resolve(WURZEL, 'src/hosted/teacher/start.css'), 'utf8');
const UEBEN = readFileSync(resolve(WURZEL, 'src/hosted/learner/ueben.css'), 'utf8');

const browser = await chromium.launch(
  process.env['LEXIFLOW_CHROMIUM'] ? { executablePath: process.env['LEXIFLOW_CHROMIUM'] } : {},
);

const BREITEN = [390, 768, 1024, 1440];

console.log('Die neuen Bildschirme, gemessen in Chromium:\n');

for (const fall of faelle) {
  console.log(fall.name);
  for (const breite of BREITEN) {
    const kontext = await browser.newContext({ viewport: { width: breite, height: 900 } });
    const blatt = await kontext.newPage();
    await blatt.setContent(
      `<!doctype html><html lang="de"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>*{box-sizing:border-box}body{margin:0}${TOKEN}${GLOBAL}${ZUSTAENDE}${HUELLE}${START}${UEBEN}</style>
<body>${fall.markup}</body></html>`,
    );

    const ueberlauf = await blatt.evaluate(
      (b) => document.documentElement.scrollWidth - b,
      breite,
    );
    if (ueberlauf > 1) melde(`${fall.name} @ ${breite} px: ${ueberlauf} px waagerechter Überlauf`);

    /* Jedes Bedienelement im Inhalt: mindestens 44 px hoch. */
    const zuKlein = await blatt.evaluate(() => {
      const klein = [];
      for (const el of document.querySelectorAll('main a, main button')) {
        const k = el.getBoundingClientRect();
        if (k.width === 0 && k.height === 0) continue;
        if (Math.ceil(k.height) < 44) klein.push(`${el.textContent.trim().slice(0, 30)} ${Math.round(k.height)}`);
      }
      return [...new Set(klein)];
    });
    if (zuKlein.length) melde(`${fall.name} @ ${breite} px: zu flach — ${zuKlein.join(', ')}`);

    const zahlen = await blatt.evaluate(() => ({
      verweise: document.querySelectorAll('main a').length,
      ueberschriften: [...document.querySelectorAll('main h2')].map((h) => h.textContent.trim()),
    }));
    if (zahlen.verweise === 0) melde(`${fall.name} @ ${breite} px: keine Verweise gerendert`);

    console.log(
      '  %d px  kein Überlauf · %d Verweise · Abschnitte: %s',
      breite,
      zahlen.verweise,
      zahlen.ueberschriften.join(', ') || '—',
    );

    await kontext.close();
  }
  console.log('');
}

await browser.close();

if (befunde.length) {
  console.error('\n%d Befunde:\n', befunde.length);
  for (const b of befunde) console.error('  ' + b);
  process.exit(1);
}

console.log('Bestanden: vier Breiten, kein Überlauf, keine Bedienelemente unter 44 px Höhe.');
