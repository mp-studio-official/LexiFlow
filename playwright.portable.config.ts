import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env['PLAYWRIGHT_CHROMIUM_PATH'];

/**
 * Die portable Suite prüft die **gebauten Einzeldateien** über `file://`.
 *
 * Deshalb kein `webServer` und keine `baseURL`: Genau das Fehlen eines Servers
 * ist hier der Prüfgegenstand. Voraussetzung ist ein vorheriges
 * `npm run build:portable`; fehlt die Datei, sagt der erste Test das deutlich.
 *
 * Chromium ist Pflicht. WebKit läuft mit, wenn er in der Umgebung installiert
 * ist – als technische Annäherung an Safari, nicht als Ersatz für einen echten
 * Safari-Test (siehe README).
 */
const projects = [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }];

if (process.env['LEXIFLOW_WEBKIT'] === '1') {
  projects.push({ name: 'webkit', use: { ...devices['Desktop Safari'] } });
}

export default defineConfig({
  testDir: 'e2e-portable',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    acceptDownloads: true,
    trace: 'retain-on-failure',
    locale: 'de-DE',
    // Wie in `playwright.config.ts`: erlaubt einen vorinstallierten Browser
    // in Umgebungen, die keinen herunterladen dürfen.
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects,
});
