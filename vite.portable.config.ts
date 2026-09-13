import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
// @ts-expect-error -- kleines Build-Hilfsmodul in JavaScript, absichtlich ohne Typdeklaration.
import { inlineFavicon } from './scripts/inline-favicon.mjs';

/**
 * Die portable Lehrkraftdatei: eine einzige HTML-Datei.
 *
 * Sie enthält zusätzlich die fertige Schülerlaufzeit als Zeichenkette – nur so
 * kann sie unter `file://` eine Schülerdatei erzeugen, ohne etwas nachzuladen.
 * Die Laufzeit wird zur Bauzeit über ein virtuelles Modul eingelesen; sie muss
 * deshalb vorher gebaut sein (siehe `scripts/build-portable.mjs`).
 */

/** Gemeinsames Ausgabeverzeichnis; einstellbar für Tests (siehe build-portable.mjs). */
const outRoot = process.env['LEXIFLOW_PORTABLE_OUT'] ?? 'dist-portable';

const RUNTIME_ID = 'virtual:lexiflow-student-runtime';
const RESOLVED_RUNTIME_ID = `\0${RUNTIME_ID}`;

function studentRuntime(file: string): Plugin {
  return {
    name: 'lexiflow-student-runtime',
    resolveId(id) {
      return id === RUNTIME_ID ? RESOLVED_RUNTIME_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_RUNTIME_ID) return null;
      // Absichtlich hart: Fehlt die Laufzeit, darf keine Lehrkraftdatei
      // entstehen, die den Export nur vortäuscht.
      const html = readFileSync(file, 'utf8');
      return `export default ${JSON.stringify(html)};`;
    },
  };
}

export default defineConfig({
  base: './',
  define: {
    // Der Schüler-Export ist genau dort verfügbar, wo die Laufzeit mitgebaut
    // wurde. Der normale Web-Build lässt die Aktion damit sauber weg, statt
    // einen Knopf anzubieten, der nichts erzeugen kann.
    __LEXIFLOW_PORTABLE__: 'true',
    // Die Lehrkraftdatei ist portabel, aber keine Lerndatei: Sie hat ihre
    // Werkstatt. `src/runtime/mode.ts` liest daraus `portable-teacher`.
    __LEXIFLOW_LEARNER__: 'false',
    // Und kein Portal: Diese Datei hat kein Backend und darf keines bekommen.
    __LEXIFLOW_PORTAL__: 'false',
  },
  plugins: [
    studentRuntime(`${outRoot}/student/student.html`),
    react(),
    viteSingleFile({ removeViteModuleLoader: true }),
    inlineFavicon(import.meta.dirname),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: `${outRoot}/teacher`,
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'index.html',
      output: { inlineDynamicImports: true },
    },
  },
});
