#!/usr/bin/env node
/*
  Das Schaufenster als eine statische Datei.

  ## Warum nicht einfach eine Route

  Weil keiner der neuen Bausteine an einer produktiven Route hängt — das
  ist die Zusage dieses Zweigs. Gemessen werden müssen sie trotzdem in
  einem echten Browser: Tippziele, Überlauf und Fokus sind Eigenschaften
  einer Darstellung, und jsdom stellt nichts dar.

  Das Ergebnis liegt ausserhalb des Projekts und wird nicht ausgeliefert.

      node scripts/schaufenster-bauen.mjs [ziel.html]
*/

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ziel = process.argv[2] ?? '/tmp/schaufenster.html';

/* Die Stilblätter in der Reihenfolge, in der sie auch im Portal stehen. */
const BLAETTER = [
  'src/styles/tokens.css',
  'src/styles/global.css',
  'src/styles/glas.css',
  'src/ui/huelle.css',
  'src/ui/bausteine.css',
  'src/hosted/portal.css',
  'src/hosted/teacher/werkstatt/werkstatt.css',
  'src/hosted/learner/motivation/motivation.css',
  'src/hosted/learner/sprache/sprache.css',
  'src/hosted/learner/ki-ui/ki-ui.css',
];

/*
  Die Stilblätter werden als leere Module gebündelt und unten als Ganzes in
  die Seite geschrieben. Als `external` markiert scheiterte es: Node bekam
  dann ein `import './bausteine.css'` zu sehen und weiss damit nichts
  anzufangen.
*/
const bauordner = mkdtempSync(resolve(tmpdir(), 'lexiflow-schaufenster-'));
const bundle = resolve(bauordner, 'schaufenster.cjs');

await build({
  entryPoints: [resolve(wurzel, 'src/schaufenster/eintrag.tsx')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  /*
    CommonJS und nicht ESM: `react-dom/server` ist CJS und ruft darin
    `require('util')`. In ein ESM-Bündel gepackt landet das im
    `__require`-Ersatz von esbuild, und der kann keine eingebauten Module
    laden — „Dynamic require of \"util\" is not supported".
  */
  format: 'cjs',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
});

const modul = createRequire(import.meta.url)(bundle);
const rumpf = modul.rendern();

const stil = BLAETTER.map((blatt) => readFileSync(resolve(wurzel, blatt), 'utf8')).join('\n');

writeFileSync(
  ziel,
  `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Schaufenster der naechsten Stufe</title>
<style>${stil}</style>
</head>
<body>${rumpf}</body>
</html>
`,
  'utf8',
);

console.log('Schaufenster in %s', ziel);
