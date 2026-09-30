/*
  Die Prüfung der Variante B.

  ## Was sie prüft

  Die vier Zusagen, die diese Variante macht — und die man ihr nicht ansieht:

    1. kein waagerechter Überlauf im Telefonrahmen
    2. kein Tippziel unter 44 × 44 px
    3. Glas **nur** dort, wo es hingehört — und jede Glasregel hat einen
       deckenden Rückfall ohne `backdrop-filter`
    4. die Kontraste, gerechnet statt geschätzt

  Punkt 3 ist der eigentliche Grund für diese Datei. Ob Glas an der falschen
  Stelle liegt, sieht man nicht: Über einer weißen Fläche sieht Glas aus wie
  eine weiße Fläche. Auffallen würde es erst über einem Verlauf, und erst bei
  jemandem, dessen Browser `backdrop-filter` nicht kann — also nie bei dem, der
  den Entwurf abnimmt.

  ## Aufruf

      node docs/mockups/portal-variante-b/pruefe-variante.mjs

  Braucht die Browser des Projekts (`npx playwright install chromium`).
  `LEXIFLOW_CHROMIUM` setzt einen vorinstallierten Browser.
*/

import { chromium } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const befunde = [];

/* ------------------------------------------------ 3a. Der deckende Rückfall */

const CSS_ROH = readFileSync(resolve(HIER, 'variante.css'), 'utf8');
const CSS = CSS_ROH.replace(/\/\*[\s\S]*?\*\//g, '');

const rueckfall = [...CSS.matchAll(/@supports\s+not[^{]*\{([\s\S]*?)\n\}/g)]
  .map((t) => t[1])
  .join('\n');

const glasregeln = new Set();
for (const treffer of CSS.matchAll(/([^{}]+)\{([^{}]*backdrop-filter[^{}]*)\}/g)) {
  for (const wahl of treffer[1].split(',')) {
    const w = wahl.trim();
    if (w && !w.startsWith('@')) glasregeln.add(w);
  }
}
if (glasregeln.size === 0) befunde.push('variante.css: keine Glasregel gefunden — prüft die Prüfung noch etwas?');
for (const regel of glasregeln) {
  if (!rueckfall.includes(regel)) {
    befunde.push(`variante.css: ${regel} hat keinen deckenden Rückfall in @supports not`);
  }
}

/* ------------------------------------------------------------ 4. Kontraste */

function leuchtdichte(hex) {
  const h = hex.replace('#', '');
  const kanaele = [0, 2, 4]
    .map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * kanaele[0] + 0.7152 * kanaele[1] + 0.0722 * kanaele[2];
}
function kontrast(a, b) {
  const [x, y] = [leuchtdichte(a), leuchtdichte(b)];
  const [hoch, tief] = x > y ? [x, y] : [y, x];
  return (hoch + 0.05) / (tief + 0.05);
}
function token(name) {
  const treffer = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(CSS);
  if (!treffer) throw new Error(`Token ${name} fehlt in variante.css`);
  return treffer[1];
}

const PAARE = [
  ['Tinte auf Grund', '--tinte', '--grund', 4.5],
  ['Tinte 2 auf Grund', '--tinte-2', '--grund', 4.5],
  ['Tinte 3 auf Grund', '--tinte-3', '--grund', 4.5],
  ['Tinte auf Fläche', '--tinte', '--flaeche', 4.5],
  ['Weiß auf Tinte', '--tinte-invers', '--tinte', 4.5],
  ['Gut auf gut-weich', '--gut', '--gut-weich', 4.5],
  ['Warnung auf warn-weich', '--warn', '--warn-weich', 4.5],
  ['Fehler auf fehler-weich', '--fehler', '--fehler-weich', 4.5],
  ['Akzent auf akzent-weich', '--akzent', '--akzent-weich', 4.5],
];
for (const [name, vorne, hinten, mass] of PAARE) {
  const wert = kontrast(token(vorne), token(hinten));
  if (wert < mass) befunde.push(`Kontrast ${name}: ${wert.toFixed(2)} : 1, nötig ${mass} : 1`);
}

/* ------------------------------------------------- 1, 2, 3b. Im Browser */

/** Wo Glas liegen darf. Alles andere ist ein Befund. */
const GLAS_ERLAUBT = ['spalte', 'telefonkopf', 'unten', 'btn--glas', 'karte--glas', 'glas', 'glas--fest'];

function messen(erlaubt) {
  const benenne = (el) => {
    const kennung = el.id ? `#${el.id}` : '';
    const klassen =
      typeof el.className === 'string' && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
        : '';
    return `${el.tagName.toLowerCase()}${kennung}${klassen}`;
  };
  const massstab = (el) => {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 1;
    const zahlen = t.match(/-?[\d.]+/g);
    const wert = zahlen ? Number.parseFloat(zahlen[0]) : 1;
    return wert > 0 ? wert : 1;
  };

  const ueberlauf = [];
  for (const rahmen of document.querySelectorAll('.geraet--telefon .geraet__flaeche')) {
    const grenze = rahmen.getBoundingClientRect();
    for (const el of rahmen.querySelectorAll('*')) {
      const k = el.getBoundingClientRect();
      if (k.width === 0 && k.height === 0) continue;
      if (getComputedStyle(el).position === 'absolute') continue;
      const ueber = Math.round(k.right - grenze.right);
      if (ueber > 1) ueberlauf.push(`${benenne(el)} +${ueber}px`);
    }
  }

  /* Gemessen wird der Entwurf, nicht das Blatt drumherum. */
  const rahmen = [...document.querySelectorAll('.geraet__flaeche')];
  const bereiche = rahmen.length ? rahmen : [...document.querySelectorAll('.probe, .raster')];
  const zuKlein = [];
  for (const bereich of bereiche) {
    const skal = massstab(bereich);
    for (const el of bereich.querySelectorAll('a[href], button, input, select, textarea')) {
      const k = el.getBoundingClientRect();
      if (k.width === 0 || k.height === 0) continue;
      const breite = k.width / skal;
      const hoehe = k.height / skal;
      if (Math.ceil(breite) < 44 || Math.ceil(hoehe) < 44) {
        zuKlein.push(`${benenne(el)} ${Math.round(breite)}×${Math.round(hoehe)}`);
      }
    }
  }

  const glasFalsch = [];
  for (const el of document.querySelectorAll('*')) {
    const stil = getComputedStyle(el);
    const filter = stil.backdropFilter || stil.webkitBackdropFilter;
    if (!filter || filter === 'none') continue;
    const klassen = (typeof el.className === 'string' ? el.className : '').split(/\s+/);
    if (!klassen.some((k) => erlaubt.includes(k))) glasFalsch.push(benenne(el));
  }

  return {
    ueberlauf: [...new Set(ueberlauf)].slice(0, 6),
    zuKlein: [...new Set(zuKlein)].slice(0, 8),
    glasFalsch: [...new Set(glasFalsch)].slice(0, 6),
  };
}

const browserPfad = process.env['LEXIFLOW_CHROMIUM'];
const browser = await chromium.launch(browserPfad ? { executablePath: browserPfad } : {});
const kontext = await browser.newContext({
  viewport: { width: 1400, height: 1000 },
  locale: 'de-DE',
});
const seite = await kontext.newPage();
const konsole = [];
seite.on('console', (m) => {
  if (m.type() === 'error') konsole.push(m.text());
});
seite.on('pageerror', (e) => konsole.push(String(e)));

const blaetter = readdirSync(HIER).filter((d) => d.endsWith('.html'));
for (const datei of blaetter) {
  await seite.goto(`file://${resolve(HIER, datei)}`);
  await seite.waitForTimeout(300);
  const m = await seite.evaluate(messen, GLAS_ERLAUBT);
  if (m.ueberlauf.length) befunde.push(`${datei} läuft über: ${m.ueberlauf.join(', ')}`);
  if (m.zuKlein.length) befunde.push(`${datei} zu klein: ${m.zuKlein.join(', ')}`);
  if (m.glasFalsch.length) {
    befunde.push(`${datei} Glas an unerlaubter Stelle: ${m.glasFalsch.join(', ')}`);
  }
}
await browser.close();

if (konsole.length) befunde.push(`Konsolenfehler: ${[...new Set(konsole)].join(' | ')}`);

if (befunde.length) {
  console.error('Variante B: %d Befunde\n', befunde.length);
  for (const b of befunde) console.error('  ' + b);
  process.exit(1);
}

console.log(
  'Variante B bestanden: %d Blätter, kein Überlauf, kein Tippziel unter 44 px, ' +
    'Glas nur an erlaubten Stellen mit deckendem Rückfall, Kontraste gerechnet.',
  blaetter.length,
);
