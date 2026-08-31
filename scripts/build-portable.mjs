#!/usr/bin/env node
/**
 * Baut die beiden portablen Einzeldateien.
 *
 * Reihenfolge ist Pflicht: Erst die Schülerlaufzeit, dann die Lehrkraftdatei –
 * die trägt die Laufzeit als Zeichenkette bei sich. Zwei getrennte Vite-Läufe
 * statt eines Builds mit zwei Einstiegspunkten, weil beide vollständig
 * eigenständige Dokumente sind und `inlineDynamicImports` je Ausgabe gilt.
 *
 * Der normale Build (`npm run build`) bleibt davon unberührt.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist-portable');

function run(args) {
  execFileSync('npx', args, { cwd: root, stdio: 'inherit' });
}

function kib(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

console.log('\n[1/2] Schülerlaufzeit …');
run(['vite', 'build', '--config', 'vite.student.config.ts']);

console.log('\n[2/2] Lehrkraftdatei …');
run(['vite', 'build', '--config', 'vite.portable.config.ts']);

const runtimeSource = resolve(out, 'student/student.html');
const teacherSource = resolve(out, 'teacher/index.html');

const runtimeTarget = resolve(out, 'LexiFlow-Schuelerlaufzeit.html');
const teacherTarget = resolve(out, 'LexiFlow-Lehrkraft.html');

copyFileSync(runtimeSource, runtimeTarget);
copyFileSync(teacherSource, teacherTarget);
rmSync(resolve(out, 'student'), { recursive: true, force: true });
rmSync(resolve(out, 'teacher'), { recursive: true, force: true });

const runtimeBytes = statSync(runtimeTarget).size;
const teacherBytes = statSync(teacherTarget).size;

console.log('\nPortable Dateien in dist-portable/:');
console.log(`  LexiFlow-Lehrkraft.html          ${kib(teacherBytes)}`);
console.log(`  LexiFlow-Schuelerlaufzeit.html   ${kib(runtimeBytes)}  (Vorlage ohne Paket)`);

// Eine erste, harte Zusicherung direkt im Build: Ohne die Einsetzstelle wäre
// die Lehrkraftdatei nicht in der Lage, je eine Schülerdatei zu erzeugen.
const runtime = readFileSync(runtimeTarget, 'utf8');
if (!runtime.includes('"__LEXIFLOW_PACK__"')) {
  console.error('\nFEHLER: In der Schülerlaufzeit fehlt die Stelle für das Paket.');
  process.exit(1);
}
