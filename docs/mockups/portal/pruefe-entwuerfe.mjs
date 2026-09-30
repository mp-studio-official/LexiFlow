/*
  Die Prüfung der Entwürfe.

  ## Warum es sie gibt

  Ein Entwurf, der eine Aussage macht, muss sie halten. „Offline kann man
  weiterarbeiten" ist eine Aussage — und die erste Fassung dieses Entwurfs hat
  sie gebrochen, indem sie den Arbeitsbereich ausblendete. Solche Widersprüche
  sieht man im Bild nicht, weil dort nur zu sehen ist, was da ist, und nicht,
  was fehlt.

  Dieselbe Erfahrung wie bei der Prüfbank in P0: Was nicht geprüft wird, gilt
  irgendwann als geprüft.

  ## Was sie prüft

  Über alle Blätter und alle Zustände:

    1. kein waagerechter Überlauf im Telefonrahmen
    2. kein wahrnehmbares Tippziel unter 44 × 44 px
    3. keine Konsolenfehler, keine fehlenden Dateien
    4. die untere Navigation liegt vollständig im Telefonrahmen

  Dazu die drei Aussagen, die dieser Nachtrag eingelöst hat:

    5. Werkstatt offline: der Arbeitsbereich bleibt vorhanden und bedienbar
    6. Werkstatt: die Grammatikfelder stehen auf Desktop **und** am Telefon
    7. Werkstatt: der Titelbildweg ist vollständig

  ## Dieselbe Tippzielregel wie in der Prüfbank

  Ein visuell verstecktes Dateifeld ist kein Touchziel — angetippt wird sein
  `label`. Gemessen wird deshalb, was man sehen kann, und bei einem versteckten
  Bedienelement sein **deklarierter** Auslöser. Die Regel steht ausführlicher
  in `e2e/tippziele.ts`; hier ist sie nachgebaut, weil diese Datei ohne das
  Projektgerüst laufen soll.

  ## Aufruf

      node docs/mockups/portal/pruefe-entwuerfe.mjs

  Braucht die Browser des Projekts (`npx playwright install chromium`).
*/

import { chromium } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const MASS = 44;

const befunde = [];
function melde(blatt, zustand, satz) {
  befunde.push(`${blatt} [${zustand ?? '—'}] ${satz}`);
}

/** Die Messung im Bild — bewusst in sich geschlossen, sie wird serialisiert. */
function messen() {
  const benenne = (el) => {
    const kennung = el.id ? `#${el.id}` : '';
    const klassen =
      typeof el.className === 'string' && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
        : '';
    return `${el.tagName.toLowerCase()}${kennung}${klassen}`;
  };

  const gerendert = (el) => {
    if (el.getClientRects().length === 0) return false;
    const stil = getComputedStyle(el);
    return stil.display !== 'none' && stil.visibility !== 'hidden';
  };

  const nurTechnischDa = (el) => {
    const stil = getComputedStyle(el);
    if (Number.parseFloat(stil.opacity || '1') === 0) return true;
    if (stil.clip && stil.clip !== 'auto') return true;
    if (stil.clipPath && stil.clipPath !== 'none') return true;
    const k = el.getBoundingClientRect();
    if (k.width <= 4 || k.height <= 4) return true;
    return k.right <= 0 || k.bottom <= 0;
  };

  const wahrnehmbar = (el) => gerendert(el) && !nurTechnischDa(el);

  /*
    Die Suche bleibt **im selben Rahmen**.

    Ein Entwurfsblatt trägt dasselbe Markup zweimal — einmal für den Desktop,
    einmal fürs Telefon —, und damit jede Kennung doppelt. Eine Suche über das
    ganze Dokument fand deshalb für das Telefon den Auslöser des Desktops und
    maß ihn mit dem falschen Maßstab: 44 echte Pixel wurden als 34 gemeldet.

    Dieselbe Falle wie seinerzeit bei `document.getElementById` in
    `TextCandidateReview` — eine Suche im ganzen Dokument findet auch das, was
    nicht gemeint war.
  */
  const ausloeserZu = (el, rahmen) => {
    const kandidaten = [];
    const kennung = el.getAttribute('id');
    if (kennung) {
      kandidaten.push(...rahmen.querySelectorAll(`label[for="${CSS.escape(kennung)}"]`));
      kandidaten.push(
        ...rahmen.querySelectorAll(`[data-tippziel-fuer="${CSS.escape(kennung)}"]`),
      );
    }
    const umschliessend = el.closest('label');
    if (umschliessend) kandidaten.push(umschliessend);
    return kandidaten.find(wahrnehmbar);
  };

  const ergebnis = { ueberlauf: [], zuKlein: [], navImRahmen: null, gemessen: 0,
    rahmen: document.querySelectorAll('.geraet__flaeche').length };

  for (const rahmen of document.querySelectorAll('.geraet--telefon .geraet__flaeche')) {
    const grenze = rahmen.getBoundingClientRect();
    for (const el of rahmen.querySelectorAll('*')) {
      const k = el.getBoundingClientRect();
      if (k.width === 0 && k.height === 0) continue;
      if (getComputedStyle(el).position === 'absolute') continue;
      const ueber = Math.round(k.right - grenze.right);
      if (ueber > 1) ergebnis.ueberlauf.push(`${benenne(el)} +${ueber}px`);
    }

    const nav = rahmen.querySelector('.unten');
    if (nav) {
      ergebnis.navImRahmen =
        Math.round(nav.getBoundingClientRect().bottom) <= Math.round(grenze.bottom) + 1;
    }
  }

  /*
    Der Maßstab wird gemessen, nicht angenommen. Der Desktoprahmen wird je nach
    Fensterbreite unterschiedlich stark verkleinert (Medienabfrage); ein fester
    Wert rechnete dann falsch und meldete gültige 44-px-Ziele als zu klein.
  */
  const massstabVon = (el) => {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 1;
    const zahlen = t.match(/-?[\d.]+/g);
    const wert = zahlen ? Number.parseFloat(zahlen[0]) : 1;
    return Number.isFinite(wert) && wert > 0 ? wert : 1;
  };

  const auswahl = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button]';
  for (const rahmen of document.querySelectorAll('.geraet__flaeche')) {
    const skal = massstabVon(rahmen);
    const genannt = new Set();
    const miss = (el, zusatz = '') => {
      if (genannt.has(el)) return;
      genannt.add(el);
      ergebnis.gemessen += 1;
      const k = el.getBoundingClientRect();
      const b = k.width / skal;
      const h = k.height / skal;
      if (Math.ceil(b) < 44 || Math.ceil(h) < 44) {
        ergebnis.zuKlein.push(`${benenne(el)} ${Math.round(b)}×${Math.round(h)}${zusatz}`);
      }
    };

    const ziele = [...rahmen.querySelectorAll(auswahl)].filter(
      (el) => gerendert(el) && !el.hasAttribute('disabled'),
    );
    for (const el of ziele.filter(nurTechnischDa)) {
      const ausloeser = ausloeserZu(el, rahmen);
      if (ausloeser) miss(ausloeser, ` (Auslöser für ${benenne(el)})`);
    }
    for (const el of ziele.filter((e) => !nurTechnischDa(e))) miss(el);
  }

  ergebnis.ueberlauf = [...new Set(ergebnis.ueberlauf)].slice(0, 8);
  ergebnis.zuKlein = [...new Set(ergebnis.zuKlein)].slice(0, 8);
  return ergebnis;
}

/** Was auf der Werkstattseite je Zustand dastehen muss. */
function werkstattMessen() {
  const sichtbar = (el) => el && el.getClientRects().length > 0;
  const rahmen = [...document.querySelectorAll('.geraet__flaeche')];
  const sicht = rahmen.map((r) => {
    const aktiv = r.querySelector('[data-zustand].ist-sichtbar');
    if (!aktiv) return null;
    const felder = [...aktiv.querySelectorAll('.grammatik .feld__eingabe')];
    return {
      telefon: !!r.closest('.geraet--telefon'),
      quelltext: !!aktiv.querySelector('mark'),
      grammatikfaelle: aktiv.querySelectorAll('.grammatik').length,
      felder: felder.length,
      bedienbar: felder.filter((f) => !f.disabled && !f.readOnly).length,
      marken: [...aktiv.querySelectorAll('.feld__marke')].map((m) => m.textContent.trim()),
      gesperrt: [...aktiv.querySelectorAll('.gesperrt')].map((g) => g.textContent.trim()),
      spaeter: aktiv.querySelectorAll('.spaeter').length,
      band: sichtbar(aktiv.querySelector('.band')),
      bildflaeche: aktiv.querySelectorAll('.bildweg__flaeche').length,
      zuschnitt: aktiv.querySelectorAll('.bildweg__rahmen').length,
    };
  });
  return sicht.filter(Boolean);
}

/*
  Normalerweise nimmt Playwright den selbst heruntergeladenen Chromium. In
  Umgebungen mit vorinstalliertem Browser lässt sich der Pfad über
  `LEXIFLOW_CHROMIUM` setzen — dieselbe Vorkehrung wie in den
  Playwright-Konfigurationen des Projekts.
*/
const browserPfad = process.env['LEXIFLOW_CHROMIUM'];
const browser = await chromium.launch(browserPfad ? { executablePath: browserPfad } : {});
const kontext = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'de-DE' });
const seite = await kontext.newPage();
const konsole = [];
seite.on('console', (m) => {
  if (m.type() === 'error') konsole.push(m.text());
});
seite.on('pageerror', (e) => konsole.push(String(e)));

const blaetter = readdirSync(HIER).filter((d) => d.endsWith('.html'));
const werkstattGesehen = {};

for (const datei of blaetter) {
  await seite.goto(`file://${resolve(HIER, datei)}`);
  await seite.waitForTimeout(200);

  const zustaende = await seite.$$eval('[data-schaltet]', (knoepfe) =>
    knoepfe.map((k) => k.dataset.schaltet),
  );

  for (const z of zustaende.length ? zustaende : [null]) {
    if (z) await seite.click(`[data-schaltet="${z}"]`);
    await seite.waitForTimeout(120);

    const m = await seite.evaluate(messen);
    if (m.ueberlauf.length) melde(datei, z, `läuft über: ${m.ueberlauf.join(', ')}`);
    if (m.zuKlein.length) melde(datei, z, `zu klein: ${m.zuKlein.join(', ')}`);
    /*
      Die Übersicht hat keine Gerätrahmen — dort ist „nichts gemessen" richtig
      und kein Befund. Auf einem Entwurfsblatt wäre es einer.
    */
    if (m.rahmen > 0 && m.gemessen === 0) melde(datei, z, 'kein einziges Tippziel gemessen');
    if (m.navImRahmen === false) melde(datei, z, 'die untere Navigation liegt außerhalb des Rahmens');

    if (datei === 'werkstatt.html') werkstattGesehen[z] = await seite.evaluate(werkstattMessen);
  }
}

// ---------------------------------------------------- Die drei neuen Aussagen

function jeRahmen(zustand, name, pruefung) {
  const sichten = werkstattGesehen[zustand];
  if (!sichten || sichten.length < 2) {
    melde('werkstatt.html', zustand, `${name}: kein Desktop- und Telefonentwurf gefunden`);
    return;
  }
  for (const sicht of sichten) {
    const wo = sicht.telefon ? 'Telefon' : 'Desktop';
    const fehler = pruefung(sicht);
    if (fehler) melde('werkstatt.html', zustand, `${name} (${wo}): ${fehler}`);
  }
}

/* 1. Offline bleibt ein Arbeitsbereich. */
jeRahmen('offline', 'Offlinearbeit', (s) => {
  if (!s.band) return 'kein Offlineband';
  if (!s.quelltext) return 'der Quelltext ist ausgeblendet';
  if (s.grammatikfaelle < 2) return `nur ${s.grammatikfaelle} Grammatikfälle sichtbar`;
  if (s.bedienbar < s.felder || s.felder === 0) {
    return `${s.bedienbar} von ${s.felder} Feldern bedienbar`;
  }
  if (s.spaeter < 2) return 'nicht beides als „erst wieder online" markiert';
  if (s.gesperrt.length < 2) return 'weder Vorschläge noch Veröffentlichen gesperrt';
  return null;
});

/* 2. Die Grammatikfelder tragen auf beiden Breiten. */
const PFLICHTFELDER = [
  'Lernform', 'Wortart', 'Grundform', 'Past Simple', 'Past Participle',
  'Ergänzungsmuster', 'Übersetzung', 'Singular', 'Plural',
];
for (const zustand of ['normal', 'offline', 'fehler']) {
  jeRahmen(zustand, 'Grammatikfelder', (s) => {
    const fehlend = PFLICHTFELDER.filter((f) => !s.marken.some((m) => m.startsWith(f)));
    if (fehlend.length) return `fehlende Felder: ${fehlend.join(', ')}`;
    if (s.grammatikfaelle < 2) return 'Verb- und Substantivfall nicht beide da';
    return null;
  });
}

/* 3. Der Titelbildweg ist vollständig. */
const BILDWEG = {
  'bild-hochladen': (s) => (s.bildflaeche ? null : 'keine Bildfläche'),
  'bild-zuschnitt': (s) => (s.zuschnitt ? null : 'kein Zuschnittrahmen 16 : 10'),
  'bild-ersetzen': (s) => (s.bildflaeche ? null : 'keine Bildfläche'),
  'bild-entfernen': (s) => (s.bildflaeche ? null : 'keine Bildfläche'),
  'bild-standard': (s) => (s.bildflaeche ? null : 'kein Standardmotiv'),
};
for (const [zustand, pruefung] of Object.entries(BILDWEG)) {
  if (!werkstattGesehen[zustand]) {
    melde('werkstatt.html', zustand, 'Titelbildzustand fehlt');
    continue;
  }
  jeRahmen(zustand, 'Titelbildweg', pruefung);
}

await browser.close();

if (konsole.length) befunde.push(`Konsolenfehler: ${[...new Set(konsole)].join(' | ')}`);

if (befunde.length) {
  console.error('Entwurfsprüfung: %d Befunde\n', befunde.length);
  for (const b of befunde) console.error('  ' + b);
  process.exit(1);
}

console.log(
  'Entwurfsprüfung bestanden: %d Blätter, kein Überlauf, kein Tippziel unter %d px, ' +
    'Offlinearbeit, Grammatikfelder und Titelbildweg vollständig.',
  blaetter.length,
  MASS,
);
