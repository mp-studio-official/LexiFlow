/*
  Die vier wiederverwendeten Übungsansichten (5B.15), gemessen in Chromium.

  ## Warum ein eigener Lauf und warum im Browser gerendert

  `start-messen.mjs` rendert serverseitig. Diese vier Ansichten holen ihr
  Paket in einem Effekt — serverseitig läuft keiner, und gemessen würde das
  Skelett. Hier läuft deshalb React im Browser: `createRoot`, Paket als
  Eigenschaft, keine lokale Datei, kein Warten auf ein Netz.

      node scripts/uebungsformen-messen.mjs

  `LEXIFLOW_CHROMIUM` setzt einen vorinstallierten Browser.
*/

import { chromium } from '@playwright/test';
import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const befunde = [];
const melde = (text) => befunde.push(text);

const ANSICHTEN = [
  { schluessel: 'karten', name: 'Karteikarten' },
  { schluessel: 'selbsttest', name: 'Selbsttest' },
  { schluessel: 'liste', name: 'Vokabelliste' },
  { schluessel: 'frei', name: 'Frei üben' },
];

const EINSTIEG = `
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { CardStudyPage } from ${JSON.stringify(resolve(WURZEL, 'src/routes/student/CardStudyPage.tsx'))};
import { SelfTestPage } from ${JSON.stringify(resolve(WURZEL, 'src/routes/student/SelfTestPage.tsx'))};
import { VocabBrowsePage } from ${JSON.stringify(resolve(WURZEL, 'src/routes/student/VocabBrowsePage.tsx'))};
import { FreePracticeSetupPage } from ${JSON.stringify(resolve(WURZEL, 'src/routes/student/FreePracticeSetupPage.tsx'))};
import { makePack } from ${JSON.stringify(resolve(WURZEL, 'src/test/fixtures.ts'))};

const roh = makePack();
const PAKET = { ...roh, meta: { ...roh.meta, direction: 'both' } };

const ANSICHT = {
  karten: () => h(CardStudyPage, { pack: PAKET, zurueck: '/ueben' }),
  selbsttest: () => h(SelfTestPage, { pack: PAKET, zurueck: '/ueben' }),
  liste: () => h(VocabBrowsePage, { pack: PAKET, zurueck: '/ueben' }),
  frei: () => h(FreePracticeSetupPage, { pack: PAKET, staende: new Map(), zurueck: '/ueben' }),
};

window.zeige = (schluessel) => {
  createRoot(document.getElementById('wurzel')).render(
    h(MemoryRouter, null,
      h('div', { className: 'huelle' },
        h('div', { className: 'huelle__arbeit' },
          h('main', { className: 'huelle__inhalt' }, h('div', { className: 'ueben-ansicht stack' }, ANSICHT[schluessel]())),
        ),
      ),
    ),
  );
};
`;

const gebaut = await esbuild.build({
  stdin: { contents: EINSTIEG, resolveDir: WURZEL, loader: 'ts' },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  write: false,
  logLevel: 'silent',
  loader: { '.css': 'empty' },
});

/*
  Auch `ueben.css`: Dort stehen die Tippziele, die das Portal diesen Ansichten
  gibt. Ohne sie misst der Lauf die Fassung ohne Konto — und meldete Befunde,
  die im Portal nicht gelten.
*/
const stile = [
  'src/styles/tokens.css',
  'src/styles/global.css',
  'src/ui/huelle.css',
  'src/ui/zustaende.css',
  'src/hosted/learner/ueben.css',
]
  .map((datei) => readFileSync(resolve(WURZEL, datei), 'utf8').replace(/@import[^;]+;/g, ''))
  .join('\n');

const seite = `<!doctype html><html lang="de"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>*{box-sizing:border-box}body{margin:0}${stile}</style>
<body><div id="wurzel"></div><script>${gebaut.outputFiles[0].text}</script></body></html>`;

const browser = await chromium.launch(
  process.env['LEXIFLOW_CHROMIUM'] ? { executablePath: process.env['LEXIFLOW_CHROMIUM'] } : {},
);

console.log('Die wiederverwendeten Übungsansichten, gemessen in Chromium:\n');

for (const { schluessel, name } of ANSICHTEN) {
  console.log(name);
  for (const breite of [390, 768, 1024, 1440]) {
    const kontext = await browser.newContext({ viewport: { width: breite, height: 844 } });
    const blatt = await kontext.newPage();
    await blatt.setContent(seite);
    await blatt.evaluate((s) => window.zeige(s), schluessel);
    await blatt.waitForFunction(() => document.querySelector('main')?.textContent?.trim().length > 0);

    /*
      Die Ansicht muss wirklich dastehen — nicht ihr Ladezustand. Ein Lauf,
      der ein Skelett misst, findet nie einen Überlauf.
    */
    const inhalt = await blatt.evaluate(() => ({
      zeichen: (document.querySelector('main')?.textContent ?? '').trim().length,
      bedienelemente: document.querySelectorAll('main a, main button, main input, main select').length,
    }));
    if (inhalt.zeichen < 40) melde(`${name} @ ${breite} px: fast kein Inhalt (${inhalt.zeichen} Zeichen)`);
    if (inhalt.bedienelemente === 0) melde(`${name} @ ${breite} px: kein Bedienelement gerendert`);

    const ueberlauf = await blatt.evaluate((b) => document.documentElement.scrollWidth - b, breite);
    if (ueberlauf > 1) melde(`${name} @ ${breite} px: ${ueberlauf} px waagerechter Überlauf`);

    /*
      Gemessen wird, was der Finger trifft — nicht, was im Markup steht.

      Ein Auswahlknopf in einem `<label>` ist selbst 18 px groß; getroffen
      wird das Label, und das ist hoch genug. Den Knopf allein zu messen,
      meldete einen Fehler, den niemand erlebt, und lenkte von den echten ab.
    */
    const zuKlein = await blatt.evaluate(() =>
      [...document.querySelectorAll('main a, main button, main input, main select')]
        .map((el) => (el.tagName === 'INPUT' || el.tagName === 'SELECT' ? el.closest('label') ?? el : el))
        .filter((el) => {
          const k = el.getBoundingClientRect();
          return k.width + k.height > 0 && Math.ceil(k.height) < 44;
        })
        .map((el) => `${(el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24)} ${Math.round(el.getBoundingClientRect().height)}`),
    );
    if (zuKlein.length) melde(`${name} @ ${breite} px: zu flach — ${[...new Set(zuKlein)].join(', ')}`);

    /* Die Tastatur erreicht das erste Bedienelement. */
    await blatt.keyboard.press('Tab');
    const erreicht = await blatt.evaluate(() => document.querySelector('main')?.contains(document.activeElement) === true);
    if (!erreicht) melde(`${name} @ ${breite} px: die Tabulatortaste erreicht den Inhalt nicht`);

    console.log(
      '  %d px  kein Überlauf · %d Zeichen · %d Bedienelemente',
      breite,
      inhalt.zeichen,
      inhalt.bedienelemente,
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

console.log('Bestanden: vier Ansichten, vier Breiten, kein Überlauf, keine Bedienelemente');
console.log('unter 44 px Höhe, Tastatur erreicht den Inhalt.');
