/*
  Die Rückfrage vor dem Verlassen einer Runde — Modalität, gemessen.

  ## Warum dieser Lauf existiert

  `aria-modal="true"` ist eine Zusage an eine Vorlesehilfe: Der Rest der Seite
  ist weg. Ob sie stimmt, entscheidet kein Attribut, sondern das Verhalten —
  und das kennt jsdom nicht: Dort gibt es weder `showModal()` noch eine
  Fokusfalle noch einen unbedienbaren Hintergrund (Stand jsdom 30.x).

  Gemessen wird deshalb hier, in Chromium, an der **echten** Komponente:
  `Rueckfrage.tsx` wird gebündelt, im Browser gerendert und bedient.

      node scripts/rueckfrage-messen.mjs

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

/*
  Die Seite rendert die Rückfrage **im Browser**, nicht als vorgefertigtes
  Markup: `showModal()` läuft in einem Effekt, und ein serverseitig erzeugter
  String hätte ihn nie ausgeführt.
*/
const EINSTIEG = `
import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Rueckfrage } from ${JSON.stringify(resolve(WURZEL, 'src/hosted/learner/Rueckfrage.tsx'))};

function Buehne() {
  const [offen, setzeOffen] = useState(false);
  const [geschlossenAls, setzeGrund] = useState('');
  return h('div', { className: 'huelle' },
    h('div', { className: 'huelle__arbeit' },
      h('header', { className: 'huelle__kopf' },
        h('a', { className: 'huelle__kopfmarke', href: '#/' }, 'LF'),
        h('button', { type: 'button', id: 'hintergrund-aktion' }, 'Abmelden'),
      ),
      h('main', { className: 'huelle__inhalt' },
        h('div', { className: 'stack' },
          h('input', { id: 'antwortfeld', type: 'text', defaultValue: 'hou' }),
          h('button', { type: 'button', id: 'oeffnen', onClick: () => setzeOffen(true) }, 'Runde beenden'),
          h('p', { id: 'grund' }, geschlossenAls),
          /*
            Dieselbe Verdrahtung wie in \`PracticePage\`: Der Fokus geht über
            \`nachBleiben\` zurück, also **nach** dem Schließen. Würde die Bühne
            hier früher fokussieren, überschriebe der Browser es beim
            Schließen — und gemessen würde die falsche Reihenfolge.
          */
          h(Rueckfrage, {
            offen,
            aufBleiben: () => { setzeOffen(false); setzeGrund('bleiben'); },
            aufBeenden: () => { setzeOffen(false); setzeGrund('beenden'); },
            nachBleiben: () => { document.getElementById('antwortfeld')?.focus(); },
          }),
        ),
      ),
    ),
  );
}

createRoot(document.getElementById('wurzel')).render(h(Buehne));
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

const TOKEN = readFileSync(resolve(WURZEL, 'src/styles/tokens.css'), 'utf8');
const GLOBAL = readFileSync(resolve(WURZEL, 'src/styles/global.css'), 'utf8');
const HUELLE = readFileSync(resolve(WURZEL, 'src/ui/huelle.css'), 'utf8').replace(/@import[^;]+;/g, '');
const RUNDE = readFileSync(resolve(WURZEL, 'src/hosted/learner/runde.css'), 'utf8');

const seite = `<!doctype html><html lang="de"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>*{box-sizing:border-box}body{margin:0}${TOKEN}${GLOBAL}${HUELLE}${RUNDE}</style>
<body><div id="wurzel"></div><script>${gebaut.outputFiles[0].text}</script></body></html>`;

const browser = await chromium.launch(
  process.env['LEXIFLOW_CHROMIUM'] ? { executablePath: process.env['LEXIFLOW_CHROMIUM'] } : {},
);

console.log('Die Rückfrage, gemessen in Chromium:\n');

for (const breite of [390, 768, 1024, 1440]) {
  const kontext = await browser.newContext({ viewport: { width: breite, height: 844 } });
  const blatt = await kontext.newPage();
  await blatt.setContent(seite);
  await blatt.waitForSelector('#oeffnen');

  const offen = async () => blatt.evaluate(() => document.querySelector('dialog')?.open === true);
  const aktiv = async () =>
    blatt.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}:${(el.textContent ?? '').trim().slice(0, 14)}` : 'keiner';
    });

  if (await offen()) melde(`${breite} px: der Dialog ist offen, bevor jemand ihn geöffnet hat`);

  await blatt.click('#oeffnen');
  if (!(await offen())) melde(`${breite} px: der Dialog öffnet nicht`);

  /* 1. `aria-modal` steht da — und `showModal()` ist gelaufen. */
  const modal = await blatt.evaluate(() => document.querySelector('dialog')?.getAttribute('aria-modal'));
  if (modal !== 'true') melde(`${breite} px: aria-modal fehlt (${modal})`);

  /* 2. Der Fokus liegt auf „Hierbleiben". */
  if (!(await aktiv()).includes('Hierbleiben')) {
    melde(`${breite} px: der Fokus liegt auf ${await aktiv()} statt auf „Hierbleiben"`);
  }

  /* 3. Tab vorwärts bleibt im Dialog — und zwar zyklisch. */
  const vorwaerts = [];
  for (let schritt = 0; schritt < 5; schritt += 1) {
    await blatt.keyboard.press('Tab');
    vorwaerts.push(await aktiv());
  }
  /*
    Geprüft wird, was zählt: dass **kein Bedienelement des Hintergrunds**
    erreicht wird. Chrome legt zwischen zwei Durchläufen durch den Dialog den
    Fokus kurz auf `body` — das ist kein Bedienelement und kein Ausbruch,
    sondern der Umschlagpunkt des Zyklus. Auf „nur innerhalb des Dialogs" zu
    bestehen, hieße, Chromes Fokusmodell für einen Fehler zu halten.
  */
  if (vorwaerts.some((stelle) => stelle.includes('hintergrund-aktion') || stelle.includes('antwortfeld'))) {
    melde(`${breite} px: Tab erreicht den Hintergrund — ${vorwaerts.join(' → ')}`);
  }
  if (!vorwaerts.some((stelle) => stelle.includes('Hierbleiben'))) {
    melde(`${breite} px: Tab läuft nicht zyklisch durch den Dialog — ${vorwaerts.join(' → ')}`);
  }

  /* 4. Und rückwärts ebenso. */
  const rueckwaerts = [];
  for (let schritt = 0; schritt < 5; schritt += 1) {
    await blatt.keyboard.press('Shift+Tab');
    rueckwaerts.push(await aktiv());
  }
  if (rueckwaerts.some((stelle) => stelle.includes('hintergrund-aktion') || stelle.includes('antwortfeld'))) {
    melde(`${breite} px: Shift+Tab erreicht den Hintergrund — ${rueckwaerts.join(' → ')}`);
  }
  if (!rueckwaerts.some((stelle) => stelle.includes('Runde beenden'))) {
    melde(`${breite} px: Shift+Tab läuft nicht zyklisch — ${rueckwaerts.join(' → ')}`);
  }

  /* 5. Der Hintergrund ist nicht zu treffen. */
  const getroffen = await blatt.evaluate(() => {
    const ziel = document.getElementById('hintergrund-aktion');
    const k = ziel.getBoundingClientRect();
    const oben = document.elementFromPoint(k.left + k.width / 2, k.top + k.height / 2);
    return oben === ziel || ziel.contains(oben);
  });
  if (getroffen) melde(`${breite} px: der Hintergrundknopf ist anklickbar`);

  /* 6. Ein Klick in den Hintergrund bestätigt nichts. */
  await blatt.mouse.click(5, 5);
  const grundNachKlick = await blatt.textContent('#grund');
  if (grundNachKlick === 'beenden') melde(`${breite} px: ein Klick daneben hat „beenden" bestätigt`);

  /*
    7. Der Hintergrund ist für Hilfsmittel nicht mehr bedienbar.

    Gemessen wird das am Verhalten und nicht an einer Baumausgabe: Ein
    Werkzeug, das Inertheit nicht modelliert, listete den Hintergrund auch
    dann, wenn der Browser ihn längst stillgelegt hat — dann prüfte man das
    Werkzeug.

    Der harte Beleg ist ein **programmatischer** `focus()` auf den
    Hintergrundknopf: Hinter einem modalen Dialog bewegt er den Fokus nicht.
    Genau diesen Weg nehmen auch Hilfsmittel, wenn sie einen Knopf ansteuern.
  */
  const hintergrundFokussierbar = await blatt.evaluate(() => {
    const vorher = document.activeElement;
    document.getElementById('hintergrund-aktion').focus();
    const bewegt = document.activeElement !== vorher;
    if (bewegt && vorher instanceof HTMLElement) vorher.focus();
    return bewegt;
  });
  if (hintergrundFokussierbar) {
    melde(`${breite} px: der Hintergrundknopf lässt sich fokussieren — keine echte Modalität`);
  }
  const baum = await blatt.locator('dialog').ariaSnapshot();
  if (!baum.includes('Hierbleiben')) melde(`${breite} px: die Rückfrage fehlt im Baum`);

  /* 8. Escape heißt „Hierbleiben" — Dialog zu, Fokus im Antwortfeld. */
  await blatt.keyboard.press('Escape');
  if (await offen()) melde(`${breite} px: Escape schließt nicht`);
  if ((await blatt.textContent('#grund')) !== 'bleiben') melde(`${breite} px: Escape bestätigt etwas anderes als „bleiben"`);
  if (!(await aktiv()).includes('antwortfeld')) {
    melde(`${breite} px: nach Escape liegt der Fokus auf ${await aktiv()}`);
  }

  /* 9. Nichts bleibt zurück: kein `inert`, kein offener zweiter Dialog. */
  const reste = await blatt.evaluate(() => ({
    dialoge: document.querySelectorAll('dialog').length,
    offene: document.querySelectorAll('dialog[open]').length,
    inert: document.querySelectorAll('[inert]').length,
  }));
  if (reste.offene !== 0) melde(`${breite} px: ${reste.offene} offene Dialoge nach dem Schließen`);
  if (reste.dialoge > 1) melde(`${breite} px: ${reste.dialoge} Dialoge im Baum`);
  if (reste.inert > 0) melde(`${breite} px: ${reste.inert} Elemente bleiben inert`);

  /* 10. „Runde beenden" bestätigt ausdrücklich. */
  await blatt.click('#oeffnen');
  await blatt.click('dialog .row button:last-of-type');
  if (await offen()) melde(`${breite} px: „Runde beenden" schließt den Dialog nicht`);
  if ((await blatt.textContent('#grund')) !== 'beenden') {
    melde(`${breite} px: „Runde beenden" bestätigt nicht`);
  }

  /* 11. Kein waagerechter Überlauf, und die Knöpfe sind zu treffen. */
  await blatt.click('#oeffnen');
  const ueberlauf = await blatt.evaluate((b) => document.documentElement.scrollWidth - b, breite);
  if (ueberlauf > 1) melde(`${breite} px: ${ueberlauf} px waagerechter Überlauf`);
  const zuKlein = await blatt.evaluate(() =>
    [...document.querySelectorAll('dialog button')]
      .filter((el) => Math.ceil(el.getBoundingClientRect().height) < 44)
      .map((el) => `${el.textContent.trim()} ${Math.round(el.getBoundingClientRect().height)}`),
  );
  if (zuKlein.length) melde(`${breite} px: zu flach — ${zuKlein.join(', ')}`);

  console.log(
    '  %d px  modal · Fokus auf „Hierbleiben" · Tab bleibt drin (%s) · Hintergrund unerreichbar · Escape = bleiben',
    breite,
    vorwaerts.length,
  );

  await kontext.close();
}

await browser.close();

if (befunde.length) {
  console.error('\n%d Befunde:\n', befunde.length);
  for (const b of befunde) console.error('  ' + b);
  process.exit(1);
}

console.log('\nBestanden: echte Modalität bei vier Breiten — Fokusfalle, unbedienbarer');
console.log('Hintergrund, Escape als „Hierbleiben", keine Reste nach dem Schließen.');
