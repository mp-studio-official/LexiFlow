#!/usr/bin/env node
/*
  Die Textwerkstatt im Browser — der verbindliche Abnahmefall.

  ## Was gemessen wird

  Bei 390, 768, 1024 und 1440 px geht der Scotland/Wales-Text durch den
  ganzen Ablauf: einfügen, analysieren, Wörter aufnehmen, Bedeutungen
  eintragen, Entwurf anlegen. Dabei je Schritt:

    1. Die Seite ist wirklich gezeichnet (`.huelle` da, Text vorhanden)
    2. kein waagerechter Überlauf
    3. kein sichtbares Tippziel unter 44 × 44 px
    4. keine Konsolenfehler
    5. eine Aufnahme

  Dazu die Erkennung in beide Richtungen: einspaltige Liste und
  zweispaltige Tabelle dürfen **nicht** in der Textwerkstatt landen.

  ## Warum der Fokus mit der Tabulatortaste geprüft wird

  Weil `element.focus()` kein `:focus-visible` auslöst. Eine frühere
  Messung meldete damit auf jeder Route einen fehlenden Fokusrahmen —
  und lag auf jeder Route falsch. Hier wird wirklich getippt.

  ## Aufruf

      LEXIFLOW_BASE=/LexiFlow/ VITE_LEXIFLOW_FAKE_CLOUD=1 npm run build
      LEXIFLOW_BASE=/LexiFlow/ npx vite preview --port 4183 --strictPort &
      node scripts/textwerkstatt-messen.mjs
*/

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCOTLAND_WALES } from './scotland-wales.mjs';

const BASIS = process.env['LEXIFLOW_PORTAL_URL'] ?? 'http://localhost:4183/LexiFlow/';
const ORDNER = resolve(process.env['LEXIFLOW_AUFNAHMEN'] ?? '/tmp/textwerkstatt');
const BREITEN = [390, 768, 1024, 1440];
const befunde = [];
const zahlen = [];

mkdirSync(ORDNER, { recursive: true });

async function alsLehrkraft(seite) {
  await seite.goto(`${BASIS}portal/#/anmelden`);
  await seite.getByRole('button', { name: 'Ich unterrichte' }).click();
  await seite.getByLabel('E-Mail-Adresse').fill('lehrerin@beispiel.invalid');
  await seite.getByLabel('Kennwort').fill('testkennwort');
  await seite.getByRole('button', { name: 'Anmelden' }).click();
  await seite.getByRole('heading', { name: 'Kurse' }).first().waitFor();
}

/** Überlauf, Tippziele und leere Seite — die drei Dauerfragen. */
async function pruefe(seite, name, breite) {
  const gerendert = await seite.evaluate(() => ({
    huelle: Boolean(document.querySelector('.huelle')),
    zeichen: (document.body.innerText ?? '').trim().length,
  }));
  if (!gerendert.huelle || gerendert.zeichen < 40) {
    befunde.push(`${name} @ ${breite}px: leere Seite (${gerendert.zeichen} Zeichen)`);
    return;
  }

  const ueberlauf = await seite.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (ueberlauf > 0) befunde.push(`${name} @ ${breite}px: ${ueberlauf}px waagerechter Überlauf`);

  const zuKlein = await seite.evaluate(() => {
    const schlimm = [];
    for (const el of document.querySelectorAll('a[href], button, input, select, textarea')) {
      /*
        `getClientRects()` statt nur `getBoundingClientRect()`: Ein
        Element in einem nicht gezeichneten Teilbaum hat einen Kasten von
        null, aber auch keine Rechtecke — und nur das Zweite ist
        eindeutig.
      */
      if (el.getClientRects().length === 0) continue;
      const stil = getComputedStyle(el);
      if (stil.visibility === 'hidden' || stil.display === 'none') continue;
      /* Wörter im Quelltext sind Text, keine Bedienelemente. */
      if (el.closest('.werkstatt__quelltext')) continue;
      /*
        Verweise im Fliesstext sind ausgenommen — WCAG 2.5.8 nimmt sie
        ausdrücklich aus, und ein Link mitten im Satz auf 44 px zu
        bringen hiesse, den Satz auseinanderzuziehen. Dieselbe Regel
        wie in `portal-variante-messen.mjs`; ohne sie meldete diese
        Messung den Datenschutzverweis der Fusszeile als Befund.
      */
      if (stil.display === 'inline') continue;
      const kasten = el.getBoundingClientRect();
      const label = el.closest('label');
      const flaeche = label ? label.getBoundingClientRect() : kasten;
      if (flaeche.width < 44 || flaeche.height < 44) {
        schlimm.push(
          `${el.tagName.toLowerCase()} ${Math.round(flaeche.width)}×${Math.round(flaeche.height)} „${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 30)}"`,
        );
      }
    }
    return schlimm;
  });
  for (const treffer of zuKlein) befunde.push(`${name} @ ${breite}px: Tippziel ${treffer}`);
}

const browserPfad = process.env['LEXIFLOW_CHROMIUM'];
const browser = await chromium.launch(browserPfad ? { executablePath: browserPfad } : {});

console.log('Textwerkstatt — Scotland/Wales durch den ganzen Ablauf, vier Breiten:\n');

for (const breite of BREITEN) {
  const kontext = await browser.newContext({ viewport: { width: breite, height: 900 } });
  const seite = await kontext.newPage();
  const konsole = [];
  seite.on('console', (n) => {
    if (n.type() === 'error') konsole.push(`error: ${n.text().slice(0, 160)}`);
  });
  seite.on('pageerror', (f) => konsole.push(`pageerror: ${String(f).slice(0, 160)}`));

  try {
    await alsLehrkraft(seite);

    /* --- 1. Text einfügen ------------------------------------------- */
    await seite.goto(`${BASIS}portal/#/pakete/neu`);
    await seite.mouse.move(breite - 2, 880);
    await seite.waitForTimeout(500);
    await pruefe(seite, 'werkstatt-quelle', breite);
    await seite.screenshot({
      path: `${ORDNER}/${breite}-1-quelle.png`,
      fullPage: true,
    });

    const feld = seite.getByRole('textbox').first();
    await feld.fill(SCOTLAND_WALES);
    await seite.getByRole('button', { name: /Weiter|Text analysieren/ }).click();

    /* --- 2. Analysiert ---------------------------------------------- */
    await seite.getByRole('heading', { name: 'Wörter auswählen' }).waitFor({ timeout: 10_000 });
    await seite.waitForTimeout(400);
    await pruefe(seite, 'werkstatt-analysiert', breite);

    const bild = await seite.evaluate(() => {
      const bereich = document.querySelector('[aria-label="Analysierter Text"]');
      return {
        quelltext: bereich?.textContent ?? '',
        kandidaten: document.querySelectorAll('.werkstatt__kompaktzeile').length,
        angehakt: [
          ...document.querySelectorAll('.werkstatt__kompaktzeile input[type=checkbox]'),
        ].filter((k) => k.checked).length,
        details: document.querySelectorAll('.werkstatt__satz').length,
        markiert: document.querySelectorAll('.werkstatt__quelltext mark').length,
      };
    });

    if (bild.quelltext !== SCOTLAND_WALES) {
      befunde.push(`werkstatt-analysiert @ ${breite}px: Quelltext weicht vom eingefügten ab`);
    }
    if (bild.kandidaten !== 15) {
      befunde.push(`werkstatt-analysiert @ ${breite}px: ${bild.kandidaten} statt 15 kompakte Kandidaten`);
    }
    if (bild.angehakt !== 0) {
      befunde.push(`werkstatt-analysiert @ ${breite}px: ${bild.angehakt} vorausgewählt`);
    }
    if (bild.details !== 0) {
      befunde.push(`werkstatt-analysiert @ ${breite}px: Details stehen schon in der Auswahl`);
    }
    zahlen.push({ breite, kandidaten: bild.kandidaten });

    await seite.screenshot({ path: `${ORDNER}/${breite}-2-analysiert.png`, fullPage: true });

    /* --- 3. Fokus wirklich mit der Tabulatortaste -------------------- */
    await seite.evaluate(() => {
      document.querySelector('.werkstatt__quelltext')?.previousElementSibling?.focus?.();
    });
    await seite.keyboard.press('Tab');
    const fokus = await seite.evaluate(() => {
      const el = document.activeElement;
      if (!el || !el.matches(':focus-visible')) return { sichtbar: false, wort: false };
      const stil = getComputedStyle(el);
      return {
        wort: el.classList.contains('werkstatt__wort'),
        sichtbar:
          stil.outlineStyle !== 'none' && parseFloat(stil.outlineWidth) > 0,
      };
    });
    if (fokus.wort && !fokus.sichtbar) {
      befunde.push(`werkstatt-analysiert @ ${breite}px: Wort im Quelltext ohne sichtbaren Fokus`);
    }

    /* --- 4. Drei Wörter aufnehmen und übersetzen --------------------- */
    const kaestchen = seite.locator('.werkstatt__kompaktzeile input[type=checkbox]');
    for (const i of [0, 1, 2]) await kaestchen.nth(i).check();
    await seite.getByRole('button', { name: '3 Wörter übersetzen' }).click();
    await seite.getByRole('heading', { name: 'Übersetzungen' }).waitFor();
    const fachdetails = await seite.evaluate(() => ({
      gesamt: document.querySelectorAll('.werkstatt__details').length,
      offen: document.querySelectorAll('.werkstatt__details[open]').length,
      zitate: [...document.querySelectorAll('.werkstatt__details q')].map((q) => q.textContent),
    }));
    if (fachdetails.gesamt !== 3 || fachdetails.offen !== 0) {
      befunde.push(
        `werkstatt-ausgewaehlt @ ${breite}px: ${fachdetails.gesamt} Details, ${fachdetails.offen} offen`,
      );
    }
    const fremdeDetails = fachdetails.zitate.filter((zitat) => !SCOTLAND_WALES.includes(zitat ?? ''));
    if (fremdeDetails.length > 0) {
      befunde.push(
        `werkstatt-ausgewaehlt @ ${breite}px: ${fremdeDetails.length} Quellsätze nicht aus dem Text`,
      );
    }
    await seite.getByLabel(/Name des Lernpakets/).fill('Scotland and Wales');
    const felder = seite.getByLabel(/Deutsche Bedeutung für/);
    const wie = ['die eine', 'die zweite', 'die dritte'];
    for (const i of [0, 1, 2]) await felder.nth(i).fill(wie[i]);
    await seite.waitForTimeout(300);
    await pruefe(seite, 'werkstatt-ausgewaehlt', breite);
    await seite.screenshot({ path: `${ORDNER}/${breite}-3-ausgewaehlt.png`, fullPage: true });

    /* --- 5. Entwurf anlegen ----------------------------------------- */
    const anlegen = seite.getByRole('button', { name: 'Lernpaket anlegen' });
    if (await anlegen.isDisabled()) {
      befunde.push(`werkstatt-ausgewaehlt @ ${breite}px: Anlegen bleibt gesperrt`);
    } else {
      await anlegen.click();
      await seite.getByRole('heading', { name: 'Lernpaket angelegt' }).waitFor({ timeout: 10_000 });
      await pruefe(seite, 'werkstatt-angelegt', breite);
      const versprechen = await seite.evaluate(() =>
        (document.body.innerText ?? '').includes('gehört vorerst dir allein'),
      );
      if (!versprechen) {
        befunde.push(`werkstatt-angelegt @ ${breite}px: Entwurfszusage fehlt`);
      }
      await seite.screenshot({ path: `${ORDNER}/${breite}-4-angelegt.png`, fullPage: true });
    }

    /* --- 6. Gegenrichtung: Listen bleiben Listen --------------------- */
    for (const [name, inhalt] of [
      ['einspaltig', 'island\nparliament\ntradition\nsymbol\nchoir'],
      ['zweispaltig', 'island\tdie Insel\nchoir\tder Chor\nflag\tdie Flagge'],
    ]) {
      /*
        `goto` auf dieselbe Adresse tut nichts.

        Nach dem Anlegen steht die Seite auf der Erfolgsmeldung, und die
        Adresse ist immer noch `#/pakete/neu`. Ein `goto` dorthin ändert
        den Hash nicht, der Router meldet keinen Wechsel, und die Messung
        suchte ein Textfeld auf einer Seite, die keines hat.

        Ein `reload()` war der erste Versuch und der falsche: Damit war
        die Sitzung weg, die Anmeldeseite stand da, und die Vokabelliste
        landete im E-Mail-Feld. Der Umweg über `#/pakete` ist das, was
        eine Lehrkraft auch täte — und wechselt den Hash wirklich.
      */
      await seite.goto(`${BASIS}portal/#/pakete`);
      await seite.waitForTimeout(300);
      await seite.goto(`${BASIS}portal/#/pakete/neu`);
      await seite.waitForTimeout(600);
      await seite.getByRole('textbox').first().fill(inhalt);
      await seite.getByRole('button', { name: /Weiter|Text analysieren/ }).click();
      await seite.waitForTimeout(600);
      const inWerkstatt = await seite.evaluate(() =>
        Boolean(document.querySelector('[aria-label="Analysierter Text"]')),
      );
      if (inWerkstatt) {
        befunde.push(`${name} @ ${breite}px: Liste landete in der Textwerkstatt`);
      }
      await pruefe(seite, `liste-${name}`, breite);
      await seite.screenshot({ path: `${ORDNER}/${breite}-5-${name}.png`, fullPage: true });
    }

    for (const zeile of konsole) befunde.push(`@ ${breite}px Konsole: ${zeile}`);
    console.log('  %dpx  %d kompakte Vorschläge, Übersetzungen im zweiten Schritt', breite, bild.kandidaten);
  } catch (fehler) {
    befunde.push(`@ ${breite}px abgebrochen: ${fehler.message.split('\n').slice(0, 4).join(' | ')}`);
    console.log('  %dpx  ABBRUCH: %s', breite, fehler.message.split('\n').slice(0, 6).join('\n       '));
  }
  await kontext.close();
}

await browser.close();

console.log('\nAufnahmen in %s', ORDNER);
if (befunde.length === 0) {
  console.log('Keine Befunde.');
} else {
  console.log('\n%d Befunde:', befunde.length);
  for (const b of befunde) console.log('  - %s', b);
  process.exitCode = 1;
}
