import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 4B.2: Der PDF-Import in der **gebauten** Lehrkraftdatei, über
 * `file://` und mit gekapptem Netz.
 *
 * ## Warum dieser Test der eigentliche Beleg ist
 *
 * Die Unit-Tests prüfen den Quelltext, der Artefakttest
 * (`src/portable/pdfOffline.artifact.test.ts`) liest die gebaute Datei. Beide
 * können nur sagen: „Wir sehen keinen Weg nach draußen.“ Erst hier wird die
 * Datei wirklich geöffnet, wirklich benutzt und dabei **jede** Anfrage
 * abgewiesen, die nicht aus der Datei selbst kommt. Was das übersteht, braucht
 * kein Netz – das ist keine Zusage mehr, sondern ein Befund.
 *
 * Die Fallgrube, die genau das aufgedeckt hätte: pdf.js lädt seinen
 * Workercode normalerweise zur Laufzeit über eine URL nach. Der Fehler
 * erschiene nicht beim Öffnen der Datei, sondern erst in dem Moment, in dem
 * eine Lehrkraft eine PDF auswählt – in einem Klassenraum, ohne Netz.
 */

const root = resolve(import.meta.dirname, '..');
const TEACHER = resolve(root, 'dist-portable/LexiFlow-Lehrkraft.html');
const TEACHER_URL = pathToFileURL(TEACHER).href;
const FIXTURES = resolve(root, 'src/import/fixtures');

/**
 * Alles abweisen, was nicht `file:`, `data:` oder `blob:` ist.
 *
 * Zwei Netze übereinander, mit Absicht: Die Route **blockiert** wirklich (ein
 * Nachladeversuch schlägt also fehl statt heimlich zu gelingen), und die Liste
 * hält fest, was es versucht hat. Ohne das Blockieren könnte ein Test grün
 * sein, weil zufällig ein Server erreichbar war.
 */
function cutTheNetwork(page: Page): string[] {
  const attempts: string[] = [];
  page.route('**/*', async (route) => {
    const url = route.request().url();
    const protocol = new URL(url).protocol;
    if (['file:', 'data:', 'blob:'].includes(protocol)) {
      await route.continue();
      return;
    }
    attempts.push(url);
    await route.abort('failed');
  });
  return attempts;
}

function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test.beforeAll(() => {
  expect(
    existsSync(TEACHER),
    `${TEACHER} fehlt – bitte zuerst \`npm run build:portable\` ausführen.`,
  ).toBe(true);
});

test.describe('PDF-Import in der portablen Lehrkraftdatei @portable', () => {
  test('liest eine PDF über file:// ohne einen einzigen Netzzugriff', async ({ page }) => {
    const attempts = cutTheNetwork(page);
    const errors = watchPageErrors(page);

    await page.goto(`${TEACHER_URL}#/material/import?quelle=pdf`);

    // Die Ansicht wird nachgeladen – aus der Datei selbst, nicht aus dem Netz.
    const chooser = page.getByLabel('PDF-Datei auswählen');
    await expect(chooser).toBeAttached();

    await chooser.setInputFiles(resolve(FIXTURES, 'text-sample.pdf'));

    const preview = page.getByLabel('Erkannter Text');
    await expect(preview).toBeVisible({ timeout: 30_000 });
    await expect(preview).toHaveValue(/to coin a phrase \/ term/);
    await expect(preview).toHaveValue(/translation:/);

    /*
      Der Kern: Zwischen Öffnen und fertigem Text hat die Seite nichts
      angefordert. Hätte pdf.js seinen Worker nachladen wollen, stünde die URL
      hier – und der Import wäre gescheitert.
    */
    expect(attempts, 'Netzzugriffe während des PDF-Imports').toEqual([]);
    expect(errors, 'Fehler auf der Seite').toEqual([]);
  });

  test('führt den gelesenen Text bis in ein gespeichertes Paket', async ({ page }) => {
    const attempts = cutTheNetwork(page);

    await page.goto(`${TEACHER_URL}#/material/import?quelle=pdf`);
    await page.getByLabel('PDF-Datei auswählen').setInputFiles(resolve(FIXTURES, 'text-sample.pdf'));
    await expect(page.getByLabel('Erkannter Text')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Text übernehmen' }).click();

    await expect(page.getByLabel('Englisch, Zeile 1')).toHaveValue('to coin a phrase / term');
    /*
      Der Kommaschutz aus Phase 1, am längsten Weg geprüft: PDF → Text →
      gegliederte Liste → Entwurf. „einen Begriff, eine Redewendung praegen“
      ist **eine** Antwort.
    */
    await expect(page.getByLabel('Deutsch, Zeile 1')).toHaveValue(
      'einen Begriff, eine Redewendung praegen',
    );

    await page.getByLabel('Titel', { exact: true }).fill('Unit 7 – aus einer PDF');
    await page.getByLabel('Jahrgang').selectOption('9');
    await page.getByRole('button', { name: /Paket speichern/ }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Unit 7 – aus einer PDF' }),
    ).toBeVisible();
    expect(attempts, 'Netzzugriffe auf dem ganzen Weg').toEqual([]);
  });

  test('sagt bei einer gescannten PDF, was fehlt – und was hilft', async ({ page }) => {
    const attempts = cutTheNetwork(page);

    await page.goto(`${TEACHER_URL}#/material/import?quelle=pdf`);
    await page
      .getByLabel('PDF-Datei auswählen')
      .setInputFiles(resolve(FIXTURES, 'scanned-sample.pdf'));

    await expect(page.getByText(/kein auswählbarer Text/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/OCR/)).toBeVisible();
    // Kein erfundener Text, keine leere Vorschau, die nach Erfolg aussieht.
    await expect(page.getByLabel('Erkannter Text')).toHaveCount(0);
    expect(attempts).toEqual([]);
  });

  test('lässt sich zweimal hintereinander benutzen', async ({ page }) => {
    /*
      Die Wirkungsprobe zum `Promise.try`-Fehler: Beim ersten Dokument lief noch
      die native Fassung mit, beim zweiten die Ergänzung – und die verschluckte
      ihre Argumente. Ein Test mit einer einzigen Datei war grün.
    */
    const attempts = cutTheNetwork(page);
    await page.goto(`${TEACHER_URL}#/material/import?quelle=pdf`);

    for (const durchgang of [1, 2]) {
      await page
        .getByLabel('PDF-Datei auswählen')
        .setInputFiles(resolve(FIXTURES, 'text-sample.pdf'));
      await expect(page.getByLabel('Erkannter Text'), `Durchgang ${durchgang}`).toHaveValue(
        /to coin a phrase/,
        { timeout: 30_000 },
      );
      if (durchgang === 1) {
        await page.getByRole('button', { name: 'Andere Datei wählen' }).click();
        await expect(page.getByLabel('PDF-Datei auswählen')).toBeAttached();
      }
    }

    expect(attempts).toEqual([]);
  });

  test('nennt Herkunft und Lizenz von pdf.js in der Datei selbst', async ({ page }) => {
    cutTheNetwork(page);
    await page.goto(`${TEACHER_URL}#/datenschutz`);

    const karte = page.getByText('Mitgelieferte fremde Bestandteile');
    await expect(karte).toBeVisible();
    await expect(page.getByText(/pdf\.js/)).toBeVisible();
    await expect(page.getByText('Apache License 2.0').first()).toBeVisible();
  });
});
