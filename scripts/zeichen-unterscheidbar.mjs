/*
  Sind die Navigationszeichen bei ihrer tatsächlichen Größe auseinanderzuhalten?

  ## Warum das nicht in `vitest` steht

  Weil jsdom nichts zeichnet. Dort lässt sich prüfen, dass zwei Zeichen
  verschiedene Pfaddaten haben — und das ist die falsche Frage: Zwei
  verschiedene Pfade können dasselbe Bild ergeben, und zwei ähnliche Pfade
  können bei 23 px zu demselben grauen Fleck zusammenfallen. Entschieden wird
  das von Pixeln, also müssen Pixel her.

  ## Was gemessen wird

  Jedes Zeichen wird bei **23 px** gerendert — der Größe in der Icon-Leiste —
  und als Graustufenraster gelesen. Verglichen wird paarweise der Anteil der
  Bildpunkte, die sich unterscheiden. Zwei Zeichen gelten als unterscheidbar,
  wenn sich mindestens **18 %** der Fläche unterscheiden.

  Die Schranke ist nicht aus der Luft gegriffen: Zwei identische Zeichen
  ergeben 0 %, und das Paar, auf das es ankommt — Kurse, Lernpakete, Lernen —
  soll nicht knapp darüber liegen, sondern deutlich. Der Lauf meldet die
  tatsächlichen Werte, nicht nur bestanden oder nicht.

  ## Aufruf

      node scripts/zeichen-unterscheidbar.mjs

  Braucht einen Browser (`npx playwright install chromium`).
  `LEXIFLOW_CHROMIUM` setzt einen vorinstallierten.
*/

import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Die Zielgröße aus der Icon-Leiste. */
const GROESSE = 23;
/** Ab wie viel Unterschied zwei Zeichen als unterscheidbar gelten. */
const SCHRANKE = 0.18;

/*
  Die Geometrie wird aus der Quelle gelesen, nicht nachgebaut. Ein zweiter,
  hier abgeschriebener Satz Pfade wäre genau die Dopplung, die irgendwann
  auseinanderläuft — und dann prüfte dieser Lauf Zeichen, die es gar nicht
  mehr gibt.
*/
const QUELLE = readFileSync(resolve(WURZEL, 'src/ui/navigationsZeichen.tsx'), 'utf8');

function zeichnungen() {
  const anfang = QUELLE.indexOf('const ZEICHNUNG');
  const ende = QUELLE.indexOf('\n};', anfang);
  if (anfang < 0 || ende < 0) throw new Error('ZEICHNUNG nicht gefunden in navigationsZeichen.tsx');
  const block = QUELLE.slice(anfang, ende).replace(/\/\*[\s\S]*?\*\//g, '');

  const gefunden = new Map();
  /*
    Jeder Eintrag `name: [ … ],` auf der obersten Ebene des Blocks. Die
    Klammern werden gezählt statt gesucht: Eine erste Fassung verlangte das
    schließende `],` am Zeilenanfang und übersah damit `fortschritt`, das in
    eine Zeile passt. Gemeldet hat das die Zählprüfung darunter — acht
    Zeichen statt neun.
  */
  const eintraege = [];
  for (const kopf of block.matchAll(/^ {2}([a-z]+): \[/gm)) {
    let tiefe = 1;
    let i = kopf.index + kopf[0].length;
    while (tiefe > 0 && i < block.length) {
      if (block[i] === '[') tiefe += 1;
      else if (block[i] === ']') tiefe -= 1;
      i += 1;
    }
    eintraege.push([kopf[1], block.slice(kopf.index + kopf[0].length, i - 1)]);
  }

  for (const [name, inhalt] of eintraege) {
    const formen = [];
    for (const p of inhalt.matchAll(/pfad\(\s*'([^']+)'/g)) formen.push(`<path d="${p[1]}"/>`);
    for (const k of inhalt.matchAll(/art: 'kreis', cx: ([\d.]+), cy: ([\d.]+), r: ([\d.]+)/g)) {
      formen.push(`<circle cx="${k[1]}" cy="${k[2]}" r="${k[3]}"/>`);
    }
    for (const k of inhalt.matchAll(/art: 'punkt', cx: ([\d.]+), cy: ([\d.]+), r: ([\d.]+)/g)) {
      formen.push(`<circle cx="${k[1]}" cy="${k[2]}" r="${k[3]}" fill="currentColor" stroke="none"/>`);
    }
    for (const r of inhalt.matchAll(
      /art: 'rechteck',\s*x: ([\d.]+),\s*y: ([\d.]+),\s*breite: ([\d.]+),\s*hoehe: ([\d.]+),\s*rund: ([\d.]+)/g,
    )) {
      formen.push(`<rect x="${r[1]}" y="${r[2]}" width="${r[3]}" height="${r[4]}" rx="${r[5]}"/>`);
    }
    if (formen.length === 0) throw new Error(`${name}: keine Form erkannt`);
    gefunden.set(name, formen.join(''));
  }
  return gefunden;
}

const ZEICHEN = zeichnungen();
if (ZEICHEN.size !== 9) {
  console.error('Es wurden %d Zeichen gelesen, erwartet sind 9 — die Quelle hat sich geändert.', ZEICHEN.size);
  process.exit(1);
}

const seite = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; background: #fff; color: #121318; }
  svg { display: block; }
</style>${[...ZEICHEN]
  .map(
    ([name, formen]) =>
      `<svg id="z-${name}" viewBox="0 0 24 24" width="${GROESSE}" height="${GROESSE}" fill="none"
        stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${formen}</svg>`,
  )
  .join('')}`;

const browserPfad = process.env['LEXIFLOW_CHROMIUM'];
const browser = await chromium.launch(browserPfad ? { executablePath: browserPfad } : {});
const kontext = await browser.newContext({ deviceScaleFactor: 1 });
const blatt = await kontext.newPage();
await blatt.setContent(seite);

/** Graustufen eines Zeichens, gelesen aus dem gerenderten Bild. */
const raster = new Map();
for (const name of ZEICHEN.keys()) {
  const bild = await blatt.locator(`#z-${name}`).screenshot();
  raster.set(name, bild);
}
await browser.close();

/* Die PNGs sind gleich groß und gleich erzeugt; verglichen werden die Bytes
   der dekodierten Bilder. Dafür genügt ein zweiter, kurzer Lauf im Browser —
   dort gibt es einen Dekoder. */
const browser2 = await chromium.launch(browserPfad ? { executablePath: browserPfad } : {});
const blatt2 = await (await browser2.newContext()).newPage();
await blatt2.setContent('<canvas id="c"></canvas>');

async function alphaWerte(png) {
  const base64 = png.toString('base64');
  return blatt2.evaluate(async (daten) => {
    const bild = new Image();
    bild.src = `data:image/png;base64,${daten}`;
    await bild.decode();
    const leinwand = document.createElement('canvas');
    leinwand.width = bild.width;
    leinwand.height = bild.height;
    const stift = leinwand.getContext('2d');
    stift.drawImage(bild, 0, 0);
    const { data } = stift.getImageData(0, 0, bild.width, bild.height);
    /* Deckung je Bildpunkt: Tinte auf Weiß, also 255 minus Helligkeit. */
    const werte = [];
    for (let i = 0; i < data.length; i += 4) werte.push(255 - data[i]);
    return werte;
  }, base64);
}

const werte = new Map();
for (const [name, png] of raster) werte.set(name, await alphaWerte(png));
await browser2.close();

function unterschied(a, b) {
  const x = werte.get(a);
  const y = werte.get(b);
  if (!x || !y || x.length !== y.length) throw new Error(`${a} / ${b}: Bilder nicht vergleichbar`);
  let abweichend = 0;
  for (let i = 0; i < x.length; i += 1) {
    /* „Anders" heißt deutlich anders, nicht ein Pixel Kantenglättung. */
    if (Math.abs(x[i] - y[i]) > 48) abweichend += 1;
  }
  return abweichend / x.length;
}

const namen = [...ZEICHEN.keys()];
const befunde = [];
const kritisch = ['kurse', 'pakete', 'lernen'];

console.log('Unterschied je Paar bei %d px (Schranke %d %%):\n', GROESSE, SCHRANKE * 100);
for (let i = 0; i < namen.length; i += 1) {
  for (let j = i + 1; j < namen.length; j += 1) {
    const [a, b] = [namen[i], namen[j]];
    const wert = unterschied(a, b);
    const wichtig = kritisch.includes(a) && kritisch.includes(b);
    if (wichtig || wert < SCHRANKE) {
      console.log('  %s / %s  %s %%', a.padEnd(13), b.padEnd(13), (wert * 100).toFixed(1));
    }
    if (wert < SCHRANKE) {
      befunde.push(`${a} und ${b} unterscheiden sich nur um ${(wert * 100).toFixed(1)} %`);
    }
  }
}

if (befunde.length) {
  console.error('\n%d Befunde:\n', befunde.length);
  for (const b of befunde) console.error('  ' + b);
  process.exit(1);
}

console.log(
  '\nBestanden: %d Zeichen, alle Paare über %d %% Unterschied bei %d px.',
  namen.length,
  SCHRANKE * 100,
  GROESSE,
);
