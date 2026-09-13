import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
// @ts-expect-error -- kleines Build-Hilfsmodul in JavaScript, absichtlich ohne Typdeklaration.
import { inlineFavicon } from './scripts/inline-favicon.mjs';

/**
 * Die generische Schülerlaufzeit: eine einzige HTML-Datei.
 *
 * Kein PWA-Plugin – unter `file://` kann kein Service Worker registriert
 * werden, und diese Datei braucht auch keinen: Sie trägt alles bei sich.
 *
 * `base: './'` ist wichtig, damit im Zwischenschritt keine absoluten Pfade
 * entstehen; `viteSingleFile` zieht anschließend JavaScript, CSS, Schriften
 * und Icons als Data-URLs in das Dokument. `assetsInlineLimit: Infinity`
 * sorgt dafür, dass auch die Schriftdateien mitkommen – sonst spränge das
 * Layout beim Öffnen.
 */
/** Gemeinsames Ausgabeverzeichnis; einstellbar für Tests (siehe build-portable.mjs). */
const outRoot = process.env['LEXIFLOW_PORTABLE_OUT'] ?? 'dist-portable';

export default defineConfig({
  base: './',
  define: {
    /*
      Die einzige gesetzte Fahne dieser Datei – und `__LEXIFLOW_PORTABLE__`
      bleibt bewusst ungesetzt. Es bedeutet „dieser Build trägt die
      Lernlaufzeit als Zeichenkette bei sich“; hier wäre das zirkulär, und
      `virtual:lexiflow-student-runtime` ist in dieser Konfiguration gar nicht
      aufgelöst. Aus der Lernfahne allein leitet `src/runtime/mode.ts` den
      Modus `portable-learner` ab – den engsten der drei.
    */
    __LEXIFLOW_LEARNER__: 'true',
  },
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true }), inlineFavicon(import.meta.dirname)],
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: `${outRoot}/student`,
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'student.html',
      output: { inlineDynamicImports: true },
    },
  },
});
