import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * Normalerweise nutzt Playwright den selbst heruntergeladenen Chromium
 * (`npx playwright install chromium`). In Umgebungen mit vorinstalliertem
 * Browser lässt sich der Pfad über `PLAYWRIGHT_CHROMIUM_PATH` setzen.
 */
const executablePath = process.env['PLAYWRIGHT_CHROMIUM_PATH'];

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'de-DE',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
