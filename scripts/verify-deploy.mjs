#!/usr/bin/env node
/**
 * Die letzte Prüfung vor dem Netz.
 *
 * ## Warum es sie gibt
 *
 * Weil zwischen „alle Tests grün" und „das Richtige liegt im Netz" ein Schritt
 * liegt, den kein Test abdeckt: das gebaute Verzeichnis. Zwei Fehler wären
 * dort möglich, und beide sind still.
 *
 * **Der erste:** Die Testfassung wird deployt. `VITE_LEXIFLOW_FAKE_CLOUD=1`
 * baut das Portal gegen erfundene Konten (`fuchs-7390` / `testkennwort`). Eine
 * so gebaute Auslieferung im Netz sähe aus wie das Produkt, ließe sich mit
 * einem Kennwort aus dem Quelltext betreten und speicherte nichts. Dagegen
 * steht das rote Band auf jeder Seite – und diese Prüfung, die es im
 * Deployment sucht und **findet es, dann bricht sie ab**.
 *
 * **Der zweite:** Ein Geheimnis im Bündel. In ein Browserbündel gehören genau
 * zwei Werte, und beide dürfen öffentlich sein. Ein Secret Key, eine Service
 * Role oder ein Hauptschlüssel darin wäre keines mehr.
 *
 * ## Warum nicht als Vitest
 *
 * Weil sie ein **Verzeichnis** prüft, das es nur nach `npm run build` gibt.
 * Ein Test, der einen Build voraussetzt, ist in einer Testsuite an der
 * falschen Stelle: Er scheitert bei jedem, der nur `npm test` aufruft.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(wurzel, 'dist');

const fehler = [];
const hinweise = [];

function meckern(text) {
  fehler.push(text);
}

/** Alle Dateien unter einem Verzeichnis, rekursiv. */
function alleDateien(ordner) {
  const gefunden = [];
  for (const eintrag of readdirSync(ordner)) {
    const pfad = join(ordner, eintrag);
    if (statSync(pfad).isDirectory()) gefunden.push(...alleDateien(pfad));
    else gefunden.push(pfad);
  }
  return gefunden;
}

let dateien = [];
try {
  dateien = alleDateien(dist);
} catch {
  console.error('Es gibt kein `dist/`. Zuerst `npm run build` ausführen.');
  process.exit(1);
}

const textdateien = dateien.filter((pfad) => /\.(html|js|css|json|webmanifest|txt)$/.test(pfad));

/* ------------------------------------------------ 1. Beide Einstiege da -- */

const pflicht = ['index.html', 'portal/index.html'];
for (const name of pflicht) {
  if (!dateien.some((pfad) => relative(dist, pfad) === name)) {
    meckern(`\`dist/${name}\` fehlt.`);
  }
}

/*
  `portal.html` wäre das Zeichen dafür, dass das Umbenennen in `closeBundle`
  nicht gelaufen ist – und dann wäre das Portal nur unter `/portal/portal.html`
  erreichbar, nicht unter `/portal/`.
*/
if (dateien.some((pfad) => relative(dist, pfad) === 'portal/portal.html')) {
  meckern('`dist/portal/portal.html` liegt noch da – das Portal muss `index.html` heißen.');
}

/* ------------------------------------------- 2. Keine Testfassung im Netz - */

const TESTFASSUNG = [
  'Testfassung ohne Server',
  'fuchs-7390',
  'testkennwort',
  'beispiel.invalid',
  'TESTCODE-NUR-ZUM-PROBIEREN',
];

for (const pfad of textdateien) {
  const inhalt = readFileSync(pfad, 'utf8');
  for (const spur of TESTFASSUNG) {
    if (inhalt.includes(spur)) {
      meckern(
        `\`${relative(dist, pfad)}\` enthält „${spur}" – das ist eine Testfassung und gehört nicht ins Netz.`,
      );
    }
  }
}

/* --------------------------------------------- 3. Kein Geheimnis im Bündel */

/**
 * Was in einem Browserbündel nichts zu suchen hat.
 *
 * Gesucht wird nach einem **Wert**, nicht nach einem Wort. Der erste Entwurf
 * suchte `sb_secret` – und fand es sofort, nämlich in `@supabase/supabase-js`
 * selbst: Die Bibliothek erkennt daran den Schlüsseltyp, um einen falsch
 * eingesetzten Secret Key **abzulehnen**. Eine Wache, die den Türsteher für
 * den Einbrecher hält, wird beim ersten Lauf abgeschaltet, und dann bewacht
 * sie gar nichts mehr.
 *
 * Deshalb: Präfix **plus** genug Zeichen dahinter, dass es ein Schlüssel sein
 * könnte.
 */
const GEHEIM = [
  [/sb_secret_[A-Za-z0-9_-]{12,}/, 'ein Supabase Secret Key'],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'ein JWT'],
  [/"service_role"\s*:/, 'eine Service-Role-Angabe'],
  [/SUPABASE_SECRET_KEY\s*[:=]\s*["'][^"']+/, 'der Secret Key unter seinem Namen'],
  [/LEXIFLOW_AI_MASTER_KEY_V\d+\s*[:=]\s*["'][^"']+/, 'der Hauptschlüssel des KI-Tresors'],
];

for (const pfad of textdateien) {
  const inhalt = readFileSync(pfad, 'utf8');
  for (const [muster, was] of GEHEIM) {
    const treffer = muster.exec(inhalt);
    if (treffer) {
      /*
        Der Fund selbst wird **nicht** ausgegeben. Ein Protokoll einer
        fehlgeschlagenen Prüfung ist genau der Ort, an dem ein Schlüssel
        landen würde, den diese Prüfung verhindern soll – und CI-Protokolle
        sind oft öffentlich.
      */
      meckern(`\`${relative(dist, pfad)}\` enthält ${was}.`);
    }
  }
}

/* --------------------------------------- 4. Der Serverfunktionscode bleibt */

/*
  Die Adressprüfung und der Tresor gehören auf den Server. Nicht, weil ihr
  Quelltext geheim wäre, sondern weil eine Prüfung, die im Browser läuft,
  keine Prüfung ist. Ein Test am Importgraphen sagt dasselbe; hier steht es
  noch einmal am fertigen Bündel.
*/
for (const pfad of textdateien) {
  const inhalt = readFileSync(pfad, 'utf8');
  if (inhalt.includes('LEXIFLOW_AI_MASTER_KEY_V') || inhalt.includes('app_check_progress_events')) {
    meckern(`\`${relative(dist, pfad)}\` enthält Serverfunktionscode.`);
  }
}

/* ------------------------------------------------ 5. Der Grundpfad stimmt */

const base = process.env['LEXIFLOW_BASE'] ?? '/';
const startseite = readFileSync(join(dist, 'index.html'), 'utf8');
const portalseite = readFileSync(join(dist, 'portal', 'index.html'), 'utf8');

for (const [name, inhalt] of [
  ['index.html', startseite],
  ['portal/index.html', portalseite],
]) {
  /*
    Ein absoluter Pfad, der **nicht** mit dem Grundpfad beginnt, funktioniert
    lokal unter `/` tadellos und zeigt auf GitHub Pages ins Leere. Genau dieser
    Fehler fällt sonst erst nach dem Deployment auf.
  */
  const verweise = [...inhalt.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((treffer) => treffer[1]);
  const daneben = verweise.filter((pfad) => !pfad.startsWith(base));
  if (daneben.length > 0) {
    meckern(`\`${name}\` verweist außerhalb des Grundpfads ${base}: ${daneben.join(', ')}`);
  }
}

/* ------------------------------------------------------- 6. Kein Jekyll -- */

if (!dateien.some((pfad) => relative(dist, pfad) === '.nojekyll')) {
  meckern('`dist/.nojekyll` fehlt – GitHub Pages ließe sonst Dateien mit `_` am Anfang weg.');
}

/* ------------------------------------------------------- 7. Der Zustand -- */

/*
  Kein Fehler, sondern eine Ansage: Ohne Konfiguration zeigt das Portal seine
  Einrichtungsseite. Das ist der Normalfall beim ersten Deployment und soll
  im Protokoll stehen, damit niemand es für einen Defekt hält.
*/
if (!process.env['VITE_SUPABASE_URL']) {
  hinweise.push(
    'Ohne VITE_SUPABASE_URL zeigt das Portal seine Einrichtungsseite. Das ist kein Defekt, sondern der Zustand ohne Supabase-Projekt.',
  );
}

/* ------------------------------------------------------------- Ergebnis -- */

console.log(`Geprüft: ${dateien.length} Dateien in dist/ (Grundpfad ${base})`);
for (const hinweis of hinweise) console.log(`  Hinweis: ${hinweis}`);

if (fehler.length > 0) {
  console.error('\nDas Deployment wurde abgebrochen:');
  for (const text of fehler) console.error(`  - ${text}`);
  process.exit(1);
}

console.log('Die Auslieferung ist in Ordnung.');
