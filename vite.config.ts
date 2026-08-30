/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * `LEXIFLOW_BASE` erlaubt das Deployment unter einem Unterpfad
 * (z. B. GitHub Pages: https://<user>.github.io/lexiflow/).
 * Lokal und in Tests bleibt es "/".
 */
const base = process.env['LEXIFLOW_BASE'] ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'LexiFlow – Vokabeltrainer',
        short_name: 'LexiFlow',
        description:
          'Freiwillige Lernhilfe für englische Vokabeln. Alle Daten bleiben lokal im Browser.',
        lang: 'de',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f6f7f9',
        theme_color: '#1f4d6b',
        categories: ['education'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
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
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    restoreMocks: true,
  },
});
