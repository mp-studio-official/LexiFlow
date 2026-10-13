#!/usr/bin/env node
/*
  Das Portal in Variante B — gemessen und aufgenommen.

  ## Was es misst

  Für jede produktive Portalroute, bei 390, 768, 1024 und 1440 px:

    1. kein waagerechter Überlauf
    2. kein sichtbares Tippziel unter 44 × 44 px
    3. eine Aufnahme, zum Vergleich mit `docs/mockups/portal-variante-b/`

  ## Warum gegen die Testfassung

  `VITE_LEXIFLOW_FAKE_CLOUD=1` baut das Portal gegen die kontrollierte
  Fälschung: erfundene Konten, nichts verlässt das Gerät. Anders wäre eine
  Aufnahme hinter der Anmeldung gar nicht zu bekommen, ohne ein echtes Konto
  zu benutzen.

  ## Aufruf

      LEXIFLOW_BASE=/LexiFlow/ VITE_LEXIFLOW_FAKE_CLOUD=1 npm run build
      LEXIFLOW_BASE=/LexiFlow/ npx vite preview --port 4183 --strictPort &
      node scripts/portal-variante-messen.mjs

  `LEXIFLOW_CHROMIUM` setzt einen vorinstallierten Browser,
  `LEXIFLOW_PORTAL_URL` eine andere Adresse,
  `LEXIFLOW_AUFNAHMEN` den Ordner für die Bilder.
*/

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASIS = process.env['LEXIFLOW_PORTAL_URL'] ?? 'http://localhost:4183/LexiFlow/';
const ORDNER = resolve(process.env['LEXIFLOW_AUFNAHMEN'] ?? '/tmp/portal-variante-b');
const BREITEN = [390, 768, 1024, 1440];
const befunde = [];

mkdirSync(ORDNER, { recursive: true });

/** Anmeldung als Lehrkraft — dieselben Schritte wie in `e2e-portal`. */
async function alsLehrkraft(seite) {
  await seite.goto(`${BASIS}portal/#/anmelden`);
  await seite.getByRole('button', { name: 'Ich unterrichte' }).click();
  await seite.getByLabel('E-Mail-Adresse').fill('lehrerin@beispiel.invalid');
  await seite.getByLabel('Kennwort').fill('testkennwort');
  await seite.getByRole('button', { name: 'Anmelden' }).click();
  await seite.getByRole('heading', { name: 'Kurse' }).first().waitFor();
}

async function alsLernende(seite) {
  await seite.goto(`${BASIS}portal/#/anmelden`);
  await seite.getByRole('button', { name: 'Ich lerne' }).click();
  await seite.getByLabel('Lern-ID').fill('fuchs-7390');
  await seite.getByLabel('Kennwort').fill('testkennwort');
  await seite.getByRole('button', { name: 'Anmelden' }).click();
  /*
    Seit 5B.4 landet eine lernende Person auf „Heute", nicht auf „Deine
    Kurse". Die Prüfungen in `e2e-portal` warten noch auf die alte
    Überschrift; sie laufen trotzdem, weil sie danach ohnehin navigieren.
    Hier wäre es ein Fehlschlag gewesen — und war es, bei der ersten
    Messung.
  */
  await seite.getByRole('heading', { name: 'Heute', exact: true }).first().waitFor();

  /*
    Die Zeitzone bestätigen — sonst misst die Aufnahme die halbe Seite.

    Ohne bestätigte Zone bleiben Woche, Serie, Wochenfortschritt **und**
    das Tagesziel unbeziffert (E27). Gemessen wurde dann vier Breiten lang
    eine Seite voller „zeigen wir erst, wenn …" — und die neuen Bausteine
    standen gar nicht erst im Baum. Eine Messung, die das Gemessene nicht
    zeichnet, ist keine.
  */
  const bestaetigen = seite.getByRole('button', { name: /Stimmt, bestätigen/ });
  if (await bestaetigen.count()) {
    await bestaetigen.first().click();
    await seite.waitForTimeout(400);
  }
}

/**
 * Die Routen, die es heute gibt.
 *
 * Bewusst **nicht** dabei: alles, was noch nicht gebaut ist. Eine Aufnahme
 * einer Werkstatt, die es nicht gibt, wäre kein Nachweis, sondern eine
 * Behauptung.
 */
const ROUTEN = [
  { name: 'anmelden', rolle: null, pfad: '#/anmelden' },
  { name: 'beitreten', rolle: null, pfad: '#/beitreten' },
  { name: 'datenschutz', rolle: null, pfad: '#/datenschutz' },
  { name: 'kennwort-vergessen', rolle: null, pfad: '#/kennwort-vergessen' },
  { name: 'lehrkraft-start', rolle: 'lehrkraft', pfad: '#/start' },
  { name: 'lehrkraft-kurse', rolle: 'lehrkraft', pfad: '#/kurse' },
  { name: 'lehrkraft-pakete', rolle: 'lehrkraft', pfad: '#/pakete' },
  /* Die Werkstatt: eine Handlung an den Lernpaketen, kein eigenes Ziel. */
  { name: 'lehrkraft-werkstatt', rolle: 'lehrkraft', pfad: '#/pakete/neu' },
  { name: 'lehrkraft-material', rolle: 'lehrkraft', pfad: '#/material' },
  { name: 'lehrkraft-ki', rolle: 'lehrkraft', pfad: '#/ki' },
  { name: 'lehrkraft-einstellungen', rolle: 'lehrkraft', pfad: '#/einstellungen' },
  { name: 'lehrkraft-verwaltung', rolle: 'lehrkraft', pfad: '#/verwaltung' },
  { name: 'lernende-lernen', rolle: 'lernende', pfad: '#/lernen' },
  { name: 'lernende-heute', rolle: 'lernende', pfad: '#/heute' },
  { name: 'lernende-ueben', rolle: 'lernende', pfad: '#/ueben' },
  { name: 'lernende-fortschritt', rolle: 'lernende', pfad: '#/fortschritt' },
  /*
    Die Absage, nicht ein Bildschirm — und deshalb unter ihrem richtigen
    Namen. `#/einstellungen` gehört dem Lehrkraftbereich; eine lernende
    Person bekommt dort den Riegel aus `RequireArea`. Als
    „lernende-einstellungen" gemessen behauptete die Liste vier Breiten
    lang eine Route, die es für Lernende nie gab.

    Sie steht wieder in der Liste, weil die Absage seit dem Abschluss in
    der Hülle der eigenen Rolle steht: Sie hat jetzt Navigation, Marke und
    Tippziele — also etwas zu messen. Vorher fiel sie aus der Hülle, und
    die Wache auf die leere Seite hat genau das gefunden.
  */
  { name: 'lernende-absage', rolle: 'lernende', pfad: '#/einstellungen' },
];

const browserPfad = process.env['LEXIFLOW_CHROMIUM'];
const browser = await chromium.launch(browserPfad ? { executablePath: browserPfad } : {});

console.log('Das Portal in Variante B — vier Breiten, %d Routen:\n', ROUTEN.length);

/*
  Nach Breite und Rolle gruppiert, nicht Route für Route: Eine Anmeldung je
  Route wären vierundsechzig Anmeldungen. Ein Kontext je Rolle und Breite
  sind acht — und es misst genau dasselbe, weil die Route über die Adresse
  gewechselt wird und nicht über den Zustand der vorherigen Seite.
*/
for (const breite of BREITEN) {
  for (const rolle of [null, 'lehrkraft', 'lernende']) {
    const routen = ROUTEN.filter((r) => r.rolle === rolle);
    if (routen.length === 0) continue;

    const kontext = await browser.newContext({ viewport: { width: breite, height: 900 } });
    const seite = await kontext.newPage();
    /*
      Konsolenfehler sind ein Befund, kein Rauschen: Eine Seite, die beim
      Zeichnen etwas wirft, hat an irgendeiner Stelle nicht getan, was sie
      sollte — und das sieht man ihr oft nicht an. Gesammelt wird je
      Kontext, zugeordnet wird beim Abschluss der Route.
    */
    const konsole = [];
    seite.on('console', (nachricht) => {
      if (nachricht.type() === 'error') konsole.push(`error: ${nachricht.text().slice(0, 160)}`);
    });
    seite.on('pageerror', (fehler) => konsole.push(`pageerror: ${String(fehler).slice(0, 160)}`));
    try {
      if (rolle === 'lehrkraft') await alsLehrkraft(seite);
      else if (rolle === 'lernende') await alsLernende(seite);
    } catch (fehler) {
      befunde.push(`Anmeldung als ${rolle} @ ${breite}px: ${fehler.message.split('\n')[0]}`);
      await kontext.close();
      continue;
    }

    for (const route of routen) {
      try {
        await seite.goto(`${BASIS}portal/${route.pfad}`);
        /*
          Der Zeiger steht sonst auf (0,0) — also auf der Marke in der
          Iconleiste, und deren Tooltip steht dann auf jeder Aufnahme.
        */
        await seite.mouse.move(breite - 2, 880);
        /* Kurz warten: Die Seiten laden ihre Daten erst nach dem ersten Bild. */
        await seite.waitForTimeout(600);

        /*
          Zuerst: Steht überhaupt etwas da?

          Ohne diese Prüfung meldete das Skript „ok" für eine weiße Seite.
          Eine Vorschau ohne `LEXIFLOW_BASE` liefert für jede Adresse die
          Ersatzseite des Solo-Teils aus; die Portalbündel laufen ins Leere,
          React rendert nie — und eine leere Seite hat weder waagerechten
          Überlauf noch zu kleine Tippziele. Beide Messungen waren grün,
          weil sie nichts zu messen hatten. Genau die Sorte Prüfung, die
          ihren Namen nicht verdient.
        */
        const gerendert = await seite.evaluate(() => ({
          huelle: Boolean(document.querySelector('.huelle')),
          zeichen: (document.body.innerText ?? '').trim().length,
        }));
        if (!gerendert.huelle || gerendert.zeichen < 40) {
          befunde.push(
            `${route.name} @ ${breite}px: leere Seite (.huelle ${gerendert.huelle ? 'da' : 'fehlt'}, ${gerendert.zeichen} Zeichen Text)`,
          );
          console.log('  %s @ %dpx  LEER', route.name, breite);
          continue;
        }

        const ueberlauf = await seite.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (ueberlauf > 0) {
          befunde.push(`${route.name} @ ${breite}px: ${ueberlauf}px waagerechter Überlauf`);
        }

        const zuKlein = await seite.evaluate(() => {
          const schlimm = [];
          for (const el of document.querySelectorAll('a[href], button, input, select, textarea')) {
            const kasten = el.getBoundingClientRect();
            if (kasten.width === 0 && kasten.height === 0) continue;
            const stil = getComputedStyle(el);
            if (stil.visibility === 'hidden' || stil.display === 'none') continue;
            /*
              Verweise **im Fliesstext** sind ausgenommen, und das ist keine
              Bequemlichkeit: WCAG 2.5.8 nimmt sie ausdrücklich aus. Ein
              Link mitten in einem Satz auf 44 px zu bringen hiesse, den
              Satz auseinanderzuziehen. Erkennbar sind sie daran, dass sie
              `inline` fliessen — alles, was `block`, `flex`, `grid` oder
              `inline-flex` ist, ist eine Schaltfläche und wird gemessen.
            */
            if (stil.display === 'inline') continue;
            if (kasten.height < 44 || kasten.width < 44) {
              schlimm.push(
                `${el.tagName.toLowerCase()}.${el.className || '—'} ${Math.round(kasten.width)}×${Math.round(kasten.height)}`,
              );
            }
          }
          return schlimm;
        });
        for (const eintrag of zuKlein) {
          befunde.push(`${route.name} @ ${breite}px: Tippziel ${eintrag}`);
        }

        /*
          Tastaturfokus — mit der Tastatur geprüft, nicht mit `el.focus()`.

          Die erste Fassung rief `focus()` und las die berechnete
          Umrandung. Das meldete auf **jeder** Route Befunde, und zwar zu
          Unrecht: Der Fokusring hängt an `:focus-visible`, und das setzt
          Chromium bei programmatischem Fokus absichtlich nicht. Gemessen
          wurde also eine Eigenschaft, die es unter diesen Bedingungen gar
          nicht geben kann.

          Dazu kam ein zweiter Fehler derselben Art: Elemente in einem
          nicht gerenderten Teilbaum (die Telefonnavigation am
          Schreibtisch) haben eine eigene berechnete `display`-Angabe und
          sahen sichtbar aus. `getClientRects()` sagt, was wirklich
          dasteht.

          Jetzt wird wirklich getabbt. Das ist langsamer und prüft dafür
          das, was eine Person mit der Tastatur erlebt.
        */
        const fokus = await (async () => {
          const ohne = [];
          const gesehen = new Set();
          await seite.evaluate(() => document.body.focus());
          for (let schritt = 0; schritt < 60; schritt += 1) {
            await seite.keyboard.press('Tab');
            const stand = await seite.evaluate(() => {
              const el = document.activeElement;
              if (!el || el === document.body) return undefined;
              const stil = getComputedStyle(el);
              const ring =
                (stil.outlineStyle !== 'none' && parseFloat(stil.outlineWidth) > 0) ||
                stil.boxShadow !== 'none';
              const kennung = `${el.tagName.toLowerCase()}.${el.className || '—'}`;
              return { kennung, ring, sichtbar: el.getClientRects().length > 0 };
            });
            if (!stand) break;
            if (gesehen.has(stand.kennung)) continue;
            gesehen.add(stand.kennung);
            if (stand.sichtbar && !stand.ring) {
              ohne.push(`ohne sichtbaren Fokus: ${stand.kennung}`);
            }
          }
          return { anzahl: gesehen.size, ohne: [...new Set(ohne)] };
        })();
        if (fokus.anzahl === 0) {
          befunde.push(`${route.name} @ ${breite}px: kein Element per Tabulator erreichbar`);
        }
        for (const eintrag of fokus.ohne) {
          befunde.push(`${route.name} @ ${breite}px: ${eintrag}`);
        }

        for (const eintrag of konsole.splice(0)) {
          befunde.push(`${route.name} @ ${breite}px: Konsole ${eintrag}`);
        }

        await seite.screenshot({ path: `${ORDNER}/${route.name}-${breite}.png` });
        console.log('  %s @ %dpx  ok', route.name, breite);
      } catch (fehler) {
        befunde.push(`${route.name} @ ${breite}px: ${fehler.message.split('\n')[0]}`);
        console.log('  %s @ %dpx  FEHLER', route.name, breite);
      }
    }
    await kontext.close();
  }
}

await browser.close();

console.log('\nAufnahmen in %s', ORDNER);
if (befunde.length > 0) {
  console.error('\nBefunde:');
  for (const text of befunde) console.error(`  - ${text}`);
  process.exit(1);
}
console.log('\nBestanden: kein Überlauf, kein Tippziel unter 44 px.');
