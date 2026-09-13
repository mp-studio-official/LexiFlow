import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env['PLAYWRIGHT_CHROMIUM_PATH'];

/**
 * Die Portalsuite – und der Grund, warum sie eine eigene ist.
 *
 * ## Getrennt von `playwright.config.ts`
 *
 * Die bestehenden 159 Prüfungen laufen gegen die kontofreie Anwendung unter
 * `/`. Sie sollen genau so bleiben: Sie beschreiben ein Produkt, das es
 * weiterhin gibt, und sie umzuschreiben hieße, die Absicherung der einen Sache
 * aufzugeben, um die andere zu prüfen.
 *
 * ## Warum unter `/LexiFlow/`
 *
 * Das ist der Punkt dieser Suite. Auf GitHub Pages liegt das Projekt unter
 * einem Unterpfad, und genau dort brechen fest geschriebene Adressen – lokal
 * unter `/` fällt das nie auf. Der Server unten wird deshalb mit
 * `LEXIFLOW_BASE=/LexiFlow/` gebaut und ausgeliefert.
 *
 * ## Warum mit der Testfassung ohne Server
 *
 * `VITE_LEXIFLOW_FAKE_CLOUD=1` baut das Portal gegen die kontrollierte
 * Fälschung aus `src/application/fakeCloudRepositories.ts`. Damit lässt sich
 * die Anmeldung wirklich durchspielen, ohne dass je eine Anfrage das Gerät
 * verlässt – es gibt in diesem Sprint kein Supabase-Projekt und keine
 * Schlüssel. Eine so gebaute Auslieferung trägt auf jeder Seite ein Band, das
 * sagt, was sie ist.
 */
export default defineConfig({
  testDir: 'e2e-portal',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:4183/LexiFlow/',
    trace: 'retain-on-failure',
    locale: 'de-DE',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    /*
      Bauen und ausliefern in einem Befehl, damit der Unterpfad in beiden
      Schritten derselbe ist. `vite preview` liest `vite.config.ts` und damit
      dieselbe `LEXIFLOW_BASE` – ein Server unter `/` würde genau die Fehler
      verdecken, die diese Suite sucht.
    */
    command:
      'LEXIFLOW_BASE=/LexiFlow/ VITE_LEXIFLOW_FAKE_CLOUD=1 npm run build && LEXIFLOW_BASE=/LexiFlow/ npx vite preview --port 4183 --strictPort',
    url: 'http://localhost:4183/LexiFlow/',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
