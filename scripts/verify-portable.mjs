#!/usr/bin/env node
/**
 * Prüft die gebauten portablen Dateien – bevor sie jemand weitergibt.
 *
 * Zwei Teile:
 * 1. Statische Zusicherungen an den Dateien selbst (hier): Wirklich alles drin?
 *    Kein Verweis nach draußen? Keine Stelle, an der etwas nachgeladen würde?
 * 2. Fachliche Zusicherungen an einem echten Export (`vitest.portable.config.ts`):
 *    genau ein Paket, keine Lernstände, sichere Einbettung, Unicode.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { startVitest } from 'vitest/node';
import { RUNTIME_LIMIT_KIB, TEACHER_LIMIT_MIB } from './portableLimits.mjs';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist-portable');

const teacher = resolve(out, 'LexiFlow-Lehrkraft.html');
const runtime = resolve(out, 'LexiFlow-Schuelerlaufzeit.html');

const problems = [];

function check(condition, message) {
  if (!condition) problems.push(message);
}

function kib(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

for (const file of [teacher, runtime]) {
  if (!existsSync(file)) {
    console.error(`FEHLT: ${file}\nBitte zuerst \`npm run build:portable\` ausführen.`);
    process.exit(1);
  }
}

/**
 * Verweise, die beim Öffnen etwas nachladen würden.
 *
 * Gesucht wird nach `src=` und `href=` mit einem Ziel, das kein `data:`,
 * kein `#` und kein `mailto:` ist. Ein einziger Treffer bedeutet: Die Datei ist
 * nicht portabel – unter `file://` bliebe an dieser Stelle ein Loch.
 */
function externalReferences(html) {
  const found = [];
  const pattern = /\s(?:src|href)\s*=\s*"([^"]*)"/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const target = (match[1] ?? '').trim();
    if (!target) continue;
    if (target.startsWith('data:')) continue;
    if (target.startsWith('#')) continue;
    if (target.startsWith('mailto:')) continue;
    found.push(target);
  }
  return found;
}

const report = [];

for (const [label, file] of [
  ['LexiFlow-Lehrkraft.html', teacher],
  ['LexiFlow-Schuelerlaufzeit.html', runtime],
]) {
  const html = readFileSync(file, 'utf8');
  report.push({ label, bytes: statSync(file).size });

  const refs = externalReferences(html);
  check(
    refs.length === 0,
    `${label}: verweist auf ${refs.length} externe Datei(en): ${refs.slice(0, 5).join(', ')}`,
  );

  check(!/serviceWorker\s*\.\s*register/.test(html), `${label}: registriert einen Service Worker.`);
  check(!/\beval\s*\(/.test(html), `${label}: enthält einen eval-Aufruf.`);
  check(!/document\s*\.\s*write\s*\(/.test(html), `${label}: enthält document.write.`);
  check(
    !/<link[^>]+rel="manifest"/i.test(html),
    `${label}: verweist auf ein Web-App-Manifest, das unter file:// nicht existiert.`,
  );
}

const runtimeHtml = readFileSync(runtime, 'utf8');
check(
  runtimeHtml.includes('"__LEXIFLOW_PACK__"'),
  'Schülerlaufzeit: die Einsetzstelle für das Paket fehlt.',
);
check(
  runtimeHtml.includes('<!--LEXIFLOW_TITLE-->'),
  'Schülerlaufzeit: die Einsetzstelle für den Titel fehlt.',
);
check(
  !/id="lexiflow-pack"[^>]*type="application\/json"[^>]*>\s*\{/.test(runtimeHtml),
  'Schülerlaufzeit: enthält bereits ein Paket – die Vorlage muss leer sein.',
);

const teacherHtml = readFileSync(teacher, 'utf8');
check(
  teacherHtml.includes('__LEXIFLOW_PACK__'),
  'Lehrkraftdatei: die Schülerlaufzeit ist nicht einkompiliert – der Export könnte nichts erzeugen.',
);

/*
 * Sprint 4B.2: Der PDF-Import muss **in** der Datei stecken.
 *
 * Der Verweisprüfer oben findet `src=`/`href=` im Markup. Der Ladepfad von
 * pdf.js steht aber nicht im Markup, sondern in einer Zeichenkette im
 * JavaScript (`workerSrc`) – er wäre dort unbemerkt durchgerutscht, und der
 * Fehlschlag käme erst in dem Moment, in dem jemand eine PDF auswählt.
 */
check(
  teacherHtml.includes('WorkerMessageHandler'),
  'Lehrkraftdatei: der pdf.js-Workercode fehlt – der PDF-Import würde ihn zur Laufzeit nachladen wollen.',
);
check(
  teacherHtml.includes('pdfjsWorker'),
  'Lehrkraftdatei: die Übergabestelle `globalThis.pdfjsWorker` fehlt.',
);
for (const [name, pattern] of [
  ['workerSrc', /workerSrc\s*[:=]\s*["'][^"']*\.m?js["']/i],
  ['cMapUrl', /cMapUrl\s*[:=]\s*["'][^"']+["']/i],
  ['standardFontDataUrl', /standardFontDataUrl\s*[:=]\s*["'][^"']+["']/i],
]) {
  const hit = teacherHtml.match(pattern);
  check(hit === null, `Lehrkraftdatei: ${name} zeigt nach draußen (${hit?.[0] ?? ''}).`);
}
check(
  teacherHtml.includes('Apache License 2.0') && teacherHtml.includes('Mozilla Foundation'),
  'Lehrkraftdatei: die Lizenzangabe zu pdf.js fehlt in der weitergegebenen Datei.',
);

/*
 * … und die Schülerdatei darf davon nichts abbekommen.
 *
 * Der PDF-Import ist eine Funktion des Lehrkraftbereichs. Drei Megabyte
 * Bibliothek in einer Datei, die an eine ganze Klasse geht, wären reine Last.
 */
for (const marker of ['WorkerMessageHandler', 'pdfjsWorker', 'InvalidPDFException']) {
  check(!runtimeHtml.includes(marker), `Schülerlaufzeit: enthält pdf.js-Code (${marker}).`);
}

/*
 * Größenschranken.
 *
 * Kein Selbstzweck: Eine Datei, die per E-Mail nicht mehr durchgeht, ist keine
 * portable Datei mehr. Die Zahlen stehen in `portableLimits.mjs` – **einmal**,
 * damit Prüfskript, Artefakttests und Dokumentation nicht auseinanderdriften.
 */
const teacherMiB = statSync(teacher).size / 1024 / 1024;
check(
  teacherMiB < TEACHER_LIMIT_MIB,
  `Lehrkraftdatei: ${teacherMiB.toFixed(2)} MiB – die Schranke liegt bei ${TEACHER_LIMIT_MIB} MiB.`,
);
const runtimeKiB = statSync(runtime).size / 1024;
check(
  runtimeKiB < RUNTIME_LIMIT_KIB,
  `Lernlaufzeit: ${runtimeKiB.toFixed(1)} KiB – die Schranke liegt bei ${RUNTIME_LIMIT_KIB} KiB.`,
);

console.log('\nGrößen:');
for (const entry of report) console.log(`  ${entry.label.padEnd(34)} ${kib(entry.bytes)}`);

if (problems.length > 0) {
  console.error('\nProbleme:');
  for (const problem of problems) console.error(`  – ${problem}`);
  process.exit(1);
}
console.log('\nStatische Prüfung bestanden. Jetzt der fachliche Teil …\n');

/*
 * Vitest in **diesem** Prozess starten, nicht über einen Paketmanager.
 *
 * Aus demselben Grund wie im Buildskript (Sprint 4A.1a): Ein `npx`-Aufruf aus
 * einem laufenden `npm run` heraus kann auf echten Rechnern hängen bleiben.
 * Die programmatische API kennt weder Shell noch PATH und verhält sich unter
 * macOS, Linux und Windows gleich.
 */
const vitest = await startVitest('test', [], {
  config: resolve(root, 'vitest.portable.config.ts'),
  watch: false,
  root,
});

const failed = vitest?.state.getCountOfFailedTests() ?? 0;
await vitest?.close();

if (failed > 0) {
  console.error(`\n${failed} Prüfung(en) fehlgeschlagen.`);
  process.exitCode = 1;
}
