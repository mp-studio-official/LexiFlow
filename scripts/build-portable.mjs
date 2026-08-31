#!/usr/bin/env node
/**
 * Baut die beiden portablen Einzeldateien.
 *
 * Reihenfolge ist Pflicht: Erst die Schülerlaufzeit, dann die Lehrkraftdatei –
 * die trägt die Laufzeit als Zeichenkette bei sich. Zwei getrennte Vite-Läufe
 * statt eines Builds mit zwei Einstiegspunkten, weil beide vollständig
 * eigenständige Dokumente sind und `inlineDynamicImports` je Ausgabe gilt.
 *
 * ## Warum kein `npx` mehr (Sprint 4A.1a)
 *
 * Bis 4A.1 startete dieses Skript Vite über `execFileSync('npx', …)`. Aufgerufen
 * aus `npm run build:portable` ist das ein npm-Prozess, der einen npm-Prozess
 * startet, der wiederum das Paket auflösen will – auf echten Rechnern blieb der
 * Build dabei ohne Ausgabe hängen. Vite selbst war nie das Problem: Derselbe
 * Schritt lief direkt aufgerufen in Millisekunden durch.
 *
 * Jetzt wird Vites programmatische API benutzt (`await import('vite')`).
 * Kein zweiter Prozess, keine Shell, kein PATH, kein plattformabhängiger Pfad
 * nach `node_modules/.bin` – das läuft unter macOS, Linux und Windows gleich.
 *
 * Der normale Build (`npm run build`) bleibt davon unberührt.
 */
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { runBuildPipeline, BuildStepError } from './portableBuild.mjs';

const root = resolve(import.meta.dirname, '..');

/**
 * Das Ausgabeverzeichnis ist einstellbar, damit ein Regressionstest den echten
 * Build in einen eigenen Ordner laufen lassen kann, ohne `dist-portable/` zu
 * zerstören. Ohne die Variable bleibt alles beim Gewohnten.
 */
const outDir = resolve(root, process.env['LEXIFLOW_PORTABLE_OUT'] ?? 'dist-portable');

/** Die Vite-Konfigurationen lesen dieselbe Variable (siehe dort). */
process.env['LEXIFLOW_PORTABLE_OUT'] = relative(root, outDir) || 'dist-portable';

function kib(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

/**
 * Ein Vite-Build als Schritt – ohne Unterprozess.
 *
 * Vite wird **im Schritt** geladen, nicht oben in der Datei. Der Grund ist
 * praktisch: Fehlt in einer Installation die passende native Rolldown-Bibliothek
 * (das kommt vor, wenn `node_modules` von einem anderen Betriebssystem stammt),
 * scheitert schon der Import. Steht er oben, sieht man einen rohen Node-Stack;
 * hier drin wird daraus eine Meldung, die den Schritt benennt.
 */
function viteStep(label, configFile) {
  return {
    label,
    run: async () => {
      const { build } = await import('vite');
      await build({ root, configFile: resolve(root, configFile) });
    },
  };
}

try {
  const results = await runBuildPipeline({
    outDir,
    steps: [
      viteStep('Schülerlaufzeit', 'vite.student.config.ts'),
      viteStep('Lehrkraftdatei', 'vite.portable.config.ts'),
    ],
    outputs: [
      { from: resolve(outDir, 'student/student.html'), to: resolve(outDir, 'LexiFlow-Schuelerlaufzeit.html') },
      { from: resolve(outDir, 'teacher/index.html'), to: resolve(outDir, 'LexiFlow-Lehrkraft.html') },
    ],
    tempDirs: [resolve(outDir, 'student'), resolve(outDir, 'teacher')],
  });

  const runtimeFile = resolve(outDir, 'LexiFlow-Schuelerlaufzeit.html');
  // Eine erste, harte Zusicherung direkt im Build: Ohne die Einsetzstelle wäre
  // die Lehrkraftdatei nicht in der Lage, je eine Schülerdatei zu erzeugen.
  if (!readFileSync(runtimeFile, 'utf8').includes('"__LEXIFLOW_PACK__"')) {
    throw new Error('In der Schülerlaufzeit fehlt die Stelle für das Paket.');
  }

  process.stdout.write(`\nPortable Dateien in ${relative(root, outDir)}/:\n`);
  for (const result of results.toReversed()) {
    const name = relative(outDir, result.file).padEnd(34);
    process.stdout.write(`  ${name} ${kib(result.bytes)}\n`);
  }
} catch (error) {
  const message = error instanceof BuildStepError ? error.message : String(error);
  process.stderr.write(`\nDer portable Build ist fehlgeschlagen.\n  ${message}\n`);
  process.exitCode = 1;
}
