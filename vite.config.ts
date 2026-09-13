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

/**
 * Ein Platzhalter für die Schülerlaufzeit – nur unter Vitest.
 *
 * `src/portable/studentRuntime.ts` importiert `virtual:lexiflow-student-runtime`
 * dynamisch. Im **Build** ist das folgenlos: `__LEXIFLOW_PORTABLE__` ist dort
 * `false`, der Zweig fällt vor der Auflösung weg, und die portable Datei bringt
 * über `vite.portable.config.ts` ihr eigenes Plugin mit, das die Kennung
 * wirklich auflöst.
 *
 * Vitest transformiert dagegen jede Datei einzeln und löst Importe auf, bevor
 * irgendetwas wegfällt. Bis 4B.2 fiel das nicht auf, weil nur `PackEditorPage`
 * an dieser Kette hing – und jeder Test dazu das Modul ohnehin ersetzte. Seit
 * die Materialseite dieselben Downloads anbietet, hängt sie an vielen Tests,
 * und jeder einzelne müsste sonst ein Modul ersetzen, das er gar nicht benutzt.
 *
 * Der Platzhalter liefert `undefined`. Das ist kein Trick, sondern genau die
 * Wahrheit dieses Builds: keine Laufzeit, also kein Export – und die Oberfläche
 * sagt das, statt einen wirkungslosen Knopf anzubieten.
 */
const RUNTIME_ID = 'virtual:lexiflow-student-runtime';
const runtimeStub = {
  name: 'lexiflow-student-runtime-stub',
  apply: () => process.env['VITEST'] === 'true',
  resolveId: (id: string) => (id === RUNTIME_ID ? `\0${RUNTIME_ID}` : null),
  load: (id: string) => (id === `\0${RUNTIME_ID}` ? 'export default undefined;' : null),
} as const;

export default defineConfig({
  base,
  define: {
    // Nur die portable Lehrkraftdatei bringt die Schülerlaufzeit mit; im
    // normalen Build bliebe sie ungenutztes Gewicht (siehe
    // `src/portable/studentRuntime.ts`).
    __LEXIFLOW_PORTABLE__: 'false',
    __LEXIFLOW_LEARNER__: 'false',
    /*
      Und ausdrücklich **nicht** das Portal. Dieser Build ist die kontofreie
      PWA unter `<base>/`; das Portal liegt daneben unter `<base>/portal/` und
      hat eine eigene Konfiguration (`vite.portal.config.ts`). Ohne diese
      Zeile wäre der Modus zwar ebenfalls `web-solo` – der Standard ist der
      engste Fall –, aber eine Fahne, die man liest, ist mehr wert als eine,
      deren Fehlen man richtig deuten muss.
    */
    __LEXIFLOW_PORTAL__: 'false',
    /*
      Die kontofreie PWA hat kein Portal und damit auch keine Fälschung.

      Unter Vitest gilt das Gegenteil: Dort wird nichts ausgeliefert, und die
      Prüfungen der Portaloberfläche brauchen die Fälschung. `define` gilt für
      den ganzen Lauf, und Vitest liest diese Datei mit – deshalb steht die
      Unterscheidung hier und nicht in einer zweiten Konfiguration.
    */
    __LEXIFLOW_FAKE_CLOUD__: process.env['VITEST'] ? 'true' : 'false',
  },
  plugins: [
    runtimeStub,
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
        /*
          Das Wörterbuch wird **nicht** vorab gecacht.

          Es ist mit gut 6 MB der größte Einzelposten der Auslieferung und wird
          nur im Lehrkraftbereich gebraucht. Es in den Precache zu legen hieße,
          jede Schülerin beim Installieren dafür zahlen zu lassen. Stattdessen
          holt der Service Worker es beim ersten Nachschlagen und behält es
          danach – ab dann arbeitet auch die installierte App damit offline.

          Die portable Lehrkraftdatei ist davon unberührt: Dort steckt das
          Wörterbuch fest im Dokument, ohne Service Worker und ohne Netz.
        */
        globIgnores: ['**/dictionary-*.js', 'portal/**'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/dictionary-[^/]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'lexiflow-dictionary',
              expiration: { maxEntries: 2 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        navigateFallback: `${base}index.html`,
        /*
          Das Portal liegt unter demselben Ursprung und wäre damit im
          Zuständigkeitsbereich dieses Service Workers. Ohne diese Ausnahme
          bekäme jemand, der `…/portal/` aufruft, die zwischengespeicherte
          Startseite der kontofreien Anwendung ausgeliefert – und zwar
          besonders zuverlässig dann, wenn die PWA schon installiert ist.

          Zusammen mit `globIgnores` oben heißt das: Der Service Worker kennt
          das Portal nicht und fasst es nicht an. Das Portal ist bewusst keine
          Offline-Anwendung (ADR-7).
        */
        navigateFallbackDenylist: [new RegExp(`^${base}portal/`)],
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
    include: [
      'src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.mjs',
      // Der Kern der Serverfunktionen. Er läuft später unter Deno, ist aber
      // reine Logik mit injizierten Seiteneffekten – und genau deshalb hier
      // prüfbar. Der Deno-Mantel (`index.ts`) bleibt außen vor.
      'supabase/functions/*/*.test.ts',
    ],
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
