import { defineConfig } from '@playwright/test';

import { BREITEN_APP } from './e2e/adressen';
import { breitenProjekte } from './e2e/pruefbank';

/**
 * Die Breitensuite der kontofreien Anwendung – mit eigenem Server.
 *
 * ## Warum eine eigene Konfiguration und nicht acht Projekte in der alten
 *
 * Weil der Server zur Konfiguration gehört und nicht zum Projekt. Playwright
 * startet **einen** `webServer` je Konfiguration; Ablauf- und Breitenprüfungen
 * hätten sich also zwangsläufig einen Port geteilt. Genau daran ist der erste
 * echte Lauf gescheitert: Auf 4173 lief bereits eine fremde Vorschau, und
 * `reuseExistingServer` hat sie stillschweigend genommen.
 *
 * Getrennte Konfigurationen heißt: getrennte Ports, getrennte Regeln.
 *
 * ## Die drei Zeilen, auf die es ankommt
 *
 *   - `port: 4291` – nicht 4173 (Ablauf), nicht 4183 (Portalablauf), nicht
 *     5173/5174 (Entwicklung).
 *   - `reuseExistingServer: false` – **immer**, auch außerhalb von CI. Ein
 *     fremder Server auf dem eigenen Port ist kein Glücksfall, sondern ein
 *     Grund abzubrechen.
 *   - `globalSetup` – die Türprüfung, bevor ein Browser startet.
 *
 * Die Ablaufsuite in `playwright.config.ts` bleibt unverändert, samt ihres
 * Ports und ihres `reuseExistingServer`.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'breiten.spec.ts',
  globalSetup: './e2e/auslieferung.ts',
  timeout: 45_000,
  /* Kurz, weil hier nichts lange dauern darf: Es wird gemessen, nicht bedient. */
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BREITEN_APP.baseURL,
    trace: 'retain-on-failure',
    locale: 'de-DE',
  },
  projects: breitenProjekte(),
  webServer: {
    command: `npm run build && npx vite preview --port ${BREITEN_APP.port} --strictPort --host 127.0.0.1`,
    url: BREITEN_APP.baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
