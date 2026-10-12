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
  { name: 'lehrkraft-material', rolle: 'lehrkraft', pfad: '#/material' },
  { name: 'lehrkraft-ki', rolle: 'lehrkraft', pfad: '#/ki' },
  { name: 'lehrkraft-einstellungen', rolle: 'lehrkraft', pfad: '#/einstellungen' },
  { name: 'lehrkraft-verwaltung', rolle: 'lehrkraft', pfad: '#/verwaltung' },
  { name: 'lernende-lernen', rolle: 'lernende', pfad: '#/lernen' },
  { name: 'lernende-heute', rolle: 'lernende', pfad: '#/heute' },
  { name: 'lernende-ueben', rolle: 'lernende', pfad: '#/ueben' },
  { name: 'lernende-fortschritt', rolle: 'lernende', pfad: '#/fortschritt' },
  /*
    `#/einstellungen` stand hier als „lernende-einstellungen" — eine Route,
    die es für Lernende nicht gibt. Sie gehört dem Lehrkraftbereich; eine
    lernende Person bekommt dort den Riegel aus `RequireArea` zu sehen.
    Gemessen wurde also vier Breiten lang eine Absage, nicht ein Bildschirm.
    Aufgefallen ist es erst, als die Wache auf die leere Seite dazukam —
    der Riegel rendert ohne Hülle.
  */
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
