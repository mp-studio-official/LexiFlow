/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// Die Marke liegt im Quellbaum, damit Tests und Build dasselbe Objekt lesen.
// (Die Endung bleibt weg – `allowImportingTsExtensions` ist bewusst aus.)
import { PWA_ASSETS, buildManifest } from './src/pwa/manifest';

/**
 * `LEXIFLOW_BASE` erlaubt das Deployment unter einem Unterpfad
 * (z. B. GitHub Pages: https://<user>.github.io/lexiflow/).
 * Lokal und in Tests bleibt es "/".
 */
const base = process.env['LEXIFLOW_BASE'] ?? '/';

export default defineConfig({
  base,
  define: {
    // Nur die portable Lehrkraftdatei bringt die Schülerlaufzeit mit; im
    // normalen Build bliebe sie ungenutztes Gewicht (siehe
    // `src/portable/studentRuntime.ts`).
    __LEXIFLOW_PORTABLE__: 'false',
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [...PWA_ASSETS],
      manifest: buildManifest(base),
      workbox: {
        // Seit Sprint 3A gehören die lokal gebündelten Schriften dazu: Ohne sie
        // fiele die App offline auf Systemschriften zurück, und das Layout
        // spränge beim ersten Start ohne Netz.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        // Bewusst kein Runtime-Caching fremder Hosts: die App lädt nichts aus dem Netz.
        runtimeCaching: [],
        navigateFallback: `${base}index.html`,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Die Bau-Orchestrierung gehört mit in die Standardsuite: Sie ist reine
    // Logik mit injizierbaren Seiteneffekten und braucht keinen Build.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    exclude: [
      'e2e/**',
      'e2e-portable/**',
      'node_modules/**',
      'dist/**',
      'dist-portable/**',
      // Artefakttests setzen einen vorherigen `npm run build:portable` voraus
      // und laufen deshalb ausschließlich in `npm run verify:portable`. Ohne
      // diese Zeile wären sie doppelt gezählt – und `npm run test` schlüge in
      // einem frischen Checkout fehl.
      'src/**/*.artifact.test.ts',
    ],
    restoreMocks: true,
  },
});
