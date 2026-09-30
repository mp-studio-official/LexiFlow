import { defineConfig } from '@playwright/test';

import { BREITEN_PORTAL } from './e2e/adressen';
import { breitenProjekte } from './e2e/pruefbank';

/**
 * Die Breitensuite des Portals – mit eigenem Server unter dem Unterpfad.
 *
 * ## Dieselben drei Zeilen wie nebenan, aus demselben Grund
 *
 * Eigener Port (4292), kein Wiederverwenden eines fremden Servers, Türprüfung
 * vor dem ersten Browser. Die Begründung steht in `e2e/adressen.ts`.
 *
 * ## Der Unterpfad ist hier keine Nebensache
 *
 * Das Portal liegt unter `/LexiFlow/portal/`, die kontofreie Anwendung unter
 * `/LexiFlow/`. Beide werden aus **einem** Bau ausgeliefert. Ein Server, der
 * unter `/` antwortet, liefert deshalb nicht dasselbe Produkt – und ein
 * Server, der unter `/LexiFlow/` die kontofreie Anwendung zeigt, ist genau die
 * Verwechslung, die den ersten Lauf gekostet hat. `globalSetup` prüft den Pfad
 * deshalb ausdrücklich.
 *
 * ## Warum weiterhin die Testfassung ohne Server
 *
 * `VITE_LEXIFLOW_FAKE_CLOUD=1` baut das Portal gegen die kontrollierte
 * Fälschung. Die Breitenprüfungen melden sich an – ohne dass je eine Anfrage
 * das Gerät verlässt.
 */
export default defineConfig({
  testDir: './e2e-portal',
  testMatch: 'breiten.spec.ts',
  globalSetup: './e2e/auslieferung.ts',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BREITEN_PORTAL.baseURL,
    trace: 'retain-on-failure',
    locale: 'de-DE',
  },
  projects: breitenProjekte(),
  webServer: {
    command:
      `LEXIFLOW_BASE=/LexiFlow/ VITE_LEXIFLOW_FAKE_CLOUD=1 npm run build && ` +
      `LEXIFLOW_BASE=/LexiFlow/ npx vite preview --port ${BREITEN_PORTAL.port} --strictPort --host 127.0.0.1`,
    url: BREITEN_PORTAL.baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
