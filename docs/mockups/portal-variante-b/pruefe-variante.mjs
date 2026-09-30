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
  /*
    Dieselbe Regel wie in der Pruefbank: Ein visuell verstecktes Dateifeld ist
    kein Touchziel — angetippt wird sein `label`. Gemessen wird, was man sehen
    kann, und bei einem versteckten Bedienelement sein deklarierter Ausloeser.
    Die Suche bleibt im selben Rahmen; ein Blatt traegt dasselbe Markup zweimal.
  */
  const gerendert = (el) => {
    if (el.getClientRects().length === 0) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const nurTechnischDa = (el) => {
    const s = getComputedStyle(el);
    if (Number.parseFloat(s.opacity || '1') === 0) return true;
    if (s.clip && s.clip !== 'auto') return true;
    if (s.clipPath && s.clipPath !== 'none') return true;
    const k = el.getBoundingClientRect();
    if (k.width <= 4 || k.height <= 4) return true;
    return k.right <= 0 || k.bottom <= 0;
  };
  const ausloeserZu = (el, rahmen) => {
    const kandidaten = [];
    const kennung = el.getAttribute('id');
    if (kennung) {
      kandidaten.push(...rahmen.querySelectorAll(`label[for="${CSS.escape(kennung)}"]`));
    }
    const huelle = el.closest('label');
    if (huelle) kandidaten.push(huelle);
    return kandidaten.find((k) => gerendert(k) && !nurTechnischDa(k));
  };

  const zuKlein = [];
  for (const bereich of bereiche) {
    const skal = massstab(bereich);
    const genannt = new Set();
    const miss = (el, zusatz = '') => {
      if (genannt.has(el)) return;
      genannt.add(el);
      const k = el.getBoundingClientRect();
      const breite = k.width / skal;
      const hoehe = k.height / skal;
      if (Math.ceil(breite) < 44 || Math.ceil(hoehe) < 44) {
        zuKlein.push(`${benenne(el)} ${Math.round(breite)}×${Math.round(hoehe)}${zusatz}`);
      }
    };
    const ziele = [...bereich.querySelectorAll('a[href], button, input, select, textarea')]
      .filter((el) => gerendert(el) && !el.hasAttribute('disabled'));
    for (const el of ziele.filter(nurTechnischDa)) {
      const a = ausloeserZu(el, bereich);
      if (a) miss(a, ` (Auslöser für ${benenne(el)})`);
    }
    for (const el of ziele.filter((e) => !nurTechnischDa(e))) miss(el);
  }

  const glasFalsch = [];
  for (const el of document.querySelectorAll('*')) {
    const stil = getComputedStyle(el);
    const filter = stil.backdropFilter || stil.webkitBackdropFilter;
    if (!filter || filter === 'none') continue;
    const klassen = (typeof el.className === 'string' ? el.className : '').split(/\s+/);
    if (!klassen.some((k) => erlaubt.includes(k))) glasFalsch.push(benenne(el));
  }

  let navImRahmen = null;
  for (const rahmen of document.querySelectorAll('.geraet--telefon .geraet__flaeche')) {
    const nav = rahmen.querySelector('.unten');
    if (!nav) continue;
    navImRahmen =
      Math.round(nav.getBoundingClientRect().bottom) <=
      Math.round(rahmen.getBoundingClientRect().bottom) + 1;
  }

  return {
    ueberlauf: [...new Set(ueberlauf)].slice(0, 6),
    zuKlein: [...new Set(zuKlein)].slice(0, 8),
    glasFalsch: [...new Set(glasFalsch)].slice(0, 6),
    navImRahmen,
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

  const zustaende = await seite.$$eval('[data-schaltet]', (k) => k.map((x) => x.dataset.schaltet));
  for (const z of zustaende.length ? zustaende : [null]) {
    if (z) await seite.click(`[data-schaltet="${z}"]`);
    await seite.waitForTimeout(120);
    const m = await seite.evaluate(messen, GLAS_ERLAUBT);
    const wo = `${datei}${z ? ` [${z}]` : ''}`;
    if (m.ueberlauf.length) befunde.push(`${wo} läuft über: ${m.ueberlauf.join(', ')}`);
    if (m.zuKlein.length) befunde.push(`${wo} zu klein: ${m.zuKlein.join(', ')}`);
    if (m.glasFalsch.length) befunde.push(`${wo} Glas an unerlaubter Stelle: ${m.glasFalsch.join(', ')}`);
    if (m.navImRahmen === false) befunde.push(`${wo} untere Navigation außerhalb des Rahmens`);
  }

  await pruefeLeiste(datei);
}

/*
  Die Icon-Leiste — vier Zusagen, die man ihr nicht ansieht.

  Eine Leiste ohne Beschriftung steht und fällt damit, dass der Name auf beiden
  Wegen ankommt: mit der Maus und mit der Tastatur. Und dass sie beim Zeigen
  nicht wächst — eine Navigation, die unter dem Zeiger breiter wird, verschiebt
  den Inhalt daneben.
*/
async function pruefeLeiste(datei) {
  /*
    Nur die Leiste im **sichtbaren** Zustandsblock. Ein Blatt trägt jeden
    Zustand einmal; die übrigen sind ausgeblendet, und auf einem
    ausgeblendeten Element kann man nicht zeigen.
  */
  /*
    Erst auf den ersten Zustand zurückschalten: Die Schleife oben endet beim
    letzten, und in den ausgeblendeten Blöcken kann man auf nichts zeigen.
  */
  const erster = await seite.$$eval('[data-schaltet]', (k) => (k[0] ? k[0].dataset.schaltet : null));
  if (erster) {
    await seite.click(`[data-schaltet="${erster}"]`);
    await seite.waitForTimeout(150);
  }
  const leiste = seite.locator('.geraet--desktop .rail:visible').first();
  if ((await leiste.count()) === 0) return;

  const ziele = leiste.locator('.rail__ziel');
  const anzahl = await ziele.count();
  if (anzahl < 6) {
    befunde.push(`${datei} Icon-Leiste: nur ${anzahl} Einträge (Navigation plus Konto und Abmelden erwartet)`);
    return;
  }

  /* Jeder Eintrag trägt einen zugänglichen Namen — unabhängig vom Tooltip. */
  const ohneNamen = await ziele.evaluateAll((els) =>
    els.filter((el) => !(el.getAttribute('aria-label') || '').trim()).length,
  );
  if (ohneNamen > 0) befunde.push(`${datei} Icon-Leiste: ${ohneNamen} Einträge ohne aria-label`);

  /*
    Der Desktoprahmen ist zur Ansicht verkleinert; gemessen wird in echten
    Pixeln. Ein fester Faktor rechnete falsch, sobald die Medienabfrage den
    Massstab aendert — derselbe Fehler wie in der P3-Pruefung.
  */
  const skal = await seite
    .locator('.geraet--desktop .geraet__flaeche')
    .first()
    .evaluate((el) => {
      const t = getComputedStyle(el).transform;
      if (!t || t === 'none') return 1;
      const z = t.match(/-?[\d.]+/g);
      const w = z ? Number.parseFloat(z[0]) : 1;
      return w > 0 ? w : 1;
    });

  const breiteVorher = ((await leiste.boundingBox())?.width ?? 0) / skal;
  if (Math.round(breiteVorher) < 72 || Math.round(breiteVorher) > 80) {
    befunde.push(`${datei} Icon-Leiste: ${Math.round(breiteVorher)} px breit, erwartet 72 bis 80`);
  }

  /* Keine sichtbare Beschriftung im Ruhezustand. */
  const sichtbareTipps = await leiste.locator('.rail__tipp').evaluateAll((els) =>
    els.filter((el) => getComputedStyle(el).visibility !== 'hidden').length,
  );
  if (sichtbareTipps > 0) {
    befunde.push(`${datei} Icon-Leiste: ${sichtbareTipps} Beschriftungen im Ruhezustand sichtbar`);
  }

  /* 1. Maus. */
  const erstes = ziele.nth(1);
  await erstes.hover();
  await seite.waitForTimeout(150);
  const beiMaus = await erstes.locator('.rail__tipp').evaluate((el) => ({
    sichtbar: getComputedStyle(el).visibility === 'visible' && Number(getComputedStyle(el).opacity) > 0.5,
    text: el.textContent.trim(),
  }));
  if (!beiMaus.sichtbar) befunde.push(`${datei} Icon-Leiste: kein Tooltip bei Hover`);
  if (!beiMaus.text) befunde.push(`${datei} Icon-Leiste: Tooltip ohne Text`);

  /*
    2. Tastatur.

    Erst den Zeiger wegnehmen. Bleibt er auf dem Element stehen, hält `:hover`
    den Tooltip sichtbar, und die Tastaturprüfung misst den Mausfall noch
    einmal — sie bestände auch dann, wenn `:focus-visible` gar nicht bedacht
    wäre. Genau das war beim ersten Gegenlauf der Fall.

    Der Tastendruck danach setzt die „Bedienung per Tastatur"-Merkung, an der
    `:focus-visible` hängt; ohne ihn wertet die Engine einen Fokus aus dem
    Skript auf einem Verweis nicht als sichtbar — dieselbe Falle wie in der
    Prüfbank.
  */
  await seite.mouse.move(0, 0);
  await seite.waitForTimeout(120);
  await seite.keyboard.press('Tab');
  await erstes.focus();
  await seite.waitForTimeout(150);
  const beiTastatur = await erstes.locator('.rail__tipp').evaluate(
    (el) => getComputedStyle(el).visibility === 'visible',
  );
  if (!beiTastatur) befunde.push(`${datei} Icon-Leiste: kein Tooltip bei Tastaturfokus`);

  const fokusSichtbar = await erstes.evaluate((el) => {
    const s = getComputedStyle(el);
    return (s.outlineStyle !== 'none' && Number.parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
  });
  if (!fokusSichtbar) befunde.push(`${datei} Icon-Leiste: kein sichtbarer Fokus`);

  /* 3. Kein Layoutsprung. */
  const breiteNachher = ((await leiste.boundingBox())?.width ?? 0) / skal;
  if (Math.round(breiteNachher) !== Math.round(breiteVorher)) {
    befunde.push(
      `${datei} Icon-Leiste: verbreitert sich von ${Math.round(breiteVorher)} auf ${Math.round(breiteNachher)} px`,
    );
  }

  /*
    4. Der aktive Zustand darf nicht nur an der Farbe hängen.

    Vorher Zeiger und Fokus wegnehmen. Sonst wird gegen ein Element verglichen,
    das noch unter dem Zeiger liegt — und dessen Hover-Fläche täuscht ein
    Merkmal vor, das der aktive Eintrag gar nicht hat. Genau so ist diese
    Prüfung beim ersten Gegenlauf auf fünf von sieben Blättern durchgefallen,
    ohne dass etwas in Ordnung gewesen wäre.
  */
  await seite.mouse.move(0, 0);
  await seite.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await seite.waitForTimeout(120);

  const aktiv = leiste.locator('.rail__ziel[aria-current="page"]');
  if ((await aktiv.count()) !== 1) {
    befunde.push(`${datei} Icon-Leiste: ${await aktiv.count()} Einträge mit aria-current`);
  } else {
    const merkmale = await aktiv.first().evaluate((el) => {
      const a = getComputedStyle(el);
      const anderer = el.parentElement.querySelector('.rail__ziel:not([aria-current])');
      if (!anderer) return { flaeche: false, tinte: false, strich: false };
      const ruhig = getComputedStyle(anderer);
      const strich = getComputedStyle(el, '::before');
      return {
        flaeche: a.backgroundColor !== ruhig.backgroundColor,
        tinte: a.color !== ruhig.color,
        strich: strich.content !== 'none' && Number.parseFloat(strich.width) > 0,
      };
    });
    const zahl = [merkmale.flaeche, merkmale.tinte, merkmale.strich].filter(Boolean).length;
    if (zahl < 2) {
      befunde.push(`${datei} Icon-Leiste: aktiver Zustand nur an einem Merkmal erkennbar`);
    }
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
