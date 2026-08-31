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
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true }), inlineFavicon(import.meta.dirname)],
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: 'dist-portable/student',
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'student.html',
      output: { inlineDynamicImports: true },
    },
  },
});
