import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 2B.2a: die Themenwerkstatt – vom Thema bis zur Lernrunde.
 *
 * Das Sprachmodell wird als **echtes Web-IDL-Interface** (eine Klasse mit
 * statischen Methoden) in die Seite injiziert. Damit läuft der echte
 * Anbietercode gegen eine kontrollierte API, ohne Netz und ohne Modelldownload.
 */

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

async function expectNoSeriousViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  const blocking = results.violations.filter((violation) =>
    BLOCKING_IMPACTS.has(violation.impact ?? ''),
  );

  expect(
    blocking.map((violation) => ({
      zustand: label,
      regel: violation.id,
      wirkung: violation.impact,
      beschreibung: violation.help,
      elemente: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
}

/** Ein nachgebautes `LanguageModel` – als Klasse, wie im echten Browser. */
async function installFakeLanguageModel(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined });

    class FakeLanguageModel {
      static availability(): Promise<string> {
        return Promise.resolve('downloadable');
      }

      static create(options?: {
        monitor?: (monitor: {
          addEventListener: (type: string, listener: (event: unknown) => void) => void;
        }) => void;
      }): Promise<{ prompt: (input: string) => Promise<string>; destroy: () => void }> {
        options?.monitor?.({
          addEventListener: (type, listener) => {
            if (type === 'downloadprogress') listener({ loaded: 1, total: 1 });
          },
        });
        return Promise.resolve({
          prompt: (input: string) => {
            const match = /Anzahl: höchstens (\d+)/.exec(input);
            const count = Number(match?.[1] ?? 10);
            const words = [
              ['crowded', 'überfüllt', 'adjective'],
              ['litter', 'Müll', 'noun'],
              ['neighbourhood', 'Nachbarschaft', 'noun'],
              ['quiet', 'ruhig', 'adjective'],
              ['to commute', 'pendeln', 'verb'],
              ['pavement', 'Gehweg', 'noun'],
              ['traffic', 'Verkehr', 'noun'],
              ['crossing', 'Übergang', 'noun'],
              ['skyline', 'Skyline', 'noun'],
              ['suburb', 'Vorort', 'noun'],
            ];
            return Promise.resolve(
              JSON.stringify({
                entries: words.slice(0, count).map(([english, german, pos]) => ({
                  english,
                  germanAnswers: [german],
                  partOfSpeech: pos,
                  difficulty: 3,
                  topicTags: ['city'],
                  exampleSentence: {
                    english: `We talked about ${english} yesterday.`,
                    german: `Wir sprachen gestern über ${german}.`,
                  },
                })),
              }),
            );
          },
          destroy: () => undefined,
        });
      }
    }

    Object.defineProperty(globalThis, 'LanguageModel', {
      configurable: true,
      value: FakeLanguageModel,
    });
  });
}

/** Das Thema-Eingabefeld – „Thema“ steckt auch in Quellenauswahl und Dateifeld. */
function topicField(page: Page) {
  return page.getByRole('textbox', { name: 'Thema', exact: true });
}

async function openTopicStudio(page: Page): Promise<void> {
  await page.goto('/#/material/import?quelle=thema');
  await expect(page.getByRole('heading', { name: 'Vokabeln zu einem Thema' })).toBeVisible();
}

test.describe('Themenwerkstatt', () => {
  test('@smoke vom Thema zum portablen Paket', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        externalRequests.push(request.url());
    });

    await installFakeLanguageModel(page);
    await page.goto('/#/material');
    await page.getByRole('button', { name: 'Zu einem Thema erstellen' }).click();
    await expect(page.getByRole('heading', { name: 'Vokabeln zu einem Thema' })).toBeVisible();

    // Lernkontext und Wünsche.
    await topicField(page).fill('City life');
    await page.getByLabel('Jahrgang').selectOption('7');
    await page.getByLabel('Gewünschte Schwierigkeit').selectOption('3');
    await page.getByLabel('Anzahl').selectOption('10');

    await page
      .getByRole('button', { name: 'Lokales Sprachmodell laden und Vorschläge erzeugen' })
      .click();

    // Direkt in der bekannten Vorschau, mit ehrlicher Zahl und Warnung.
    await expect(page.getByText('10 Zeilen ·')).toBeVisible();
    await expect(page.getByText(/Diese Vorschläge sind ungeprüft/)).toBeVisible();
    // Genau der Satz in der Vorschau – die Ansage für Screenreader trägt ihn zusätzlich.
    await expect(
      page.getByText('10 von 10 gewünschten Vorschlägen übernommen.', { exact: true }),
    ).toBeVisible();

    // Alles bearbeitbar.
    await expect(page.getByLabel('Englisch, Zeile 1', { exact: true })).toHaveValue('crowded');
    await expect(page.getByLabel('Deutsch, Zeile 1', { exact: true })).toHaveValue('überfüllt');
    await expect(page.getByLabel('Wortart, Zeile 1', { exact: true })).toHaveValue('adjective');
    await expect(page.getByLabel('Schwierigkeit, Zeile 1', { exact: true })).toHaveValue('3');

    await page.getByLabel('Deutsch, Zeile 2', { exact: true }).fill('Abfall');
    await page.getByLabel('quiet übernehmen').uncheck();
    await expect(page.getByText(/9 werden übernommen/)).toBeVisible();

    // Speichern.
    await page.getByRole('button', { name: 'Weiter zu den Metadaten' }).click();
    await expect(page.getByRole('textbox', { name: 'Thema', exact: true })).toHaveValue('City life');
    await page.getByLabel('Titel', { exact: true }).fill('City life – Vorschläge');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'City life – Vorschläge' }),
    ).toBeVisible();

    // Exportieren und die Datei prüfen.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Als .vocabpack.json exportieren' }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(filePath, 'utf8');

    expect(JSON.parse(content).formatVersion).toBe(1);
    expect(content).toContain('Abfall');
    expect(content).toContain('"sourceType": "topic-ai"');
    for (const forbidden of ['LanguageModel', 'responseConstraint', 'provider', 'Jahrgangsstufe']) {
      expect(content).not.toContain(forbidden);
    }

    expect(externalRequests).toEqual([]);

    // ---- Zweiter Kontext: ganz ohne Modelle ----
    const receiver = await page.context().newPage();
    await receiver.addInitScript(() => {
      Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined });
      Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: undefined });
    });
    const receiverRequests: string[] = [];
    receiver.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        receiverRequests.push(request.url());
    });

    await receiver.goto('/#/lernen');
    await receiver.getByLabel('Vokabelpaket auswählen').setInputFiles(filePath);
    await expect(receiver.getByRole('heading', { name: 'City life – Vorschläge' })).toBeVisible();

    // Paket öffnen: alles ist da, auch ohne jedes Modell.
    await receiver.getByRole('link', { name: 'Öffnen' }).click();
    await expect(receiver.getByText(/0 von 9 Vokabeln sicher/)).toBeVisible();

    await receiver.getByRole('button', { name: 'Lernrunde starten' }).click();
    await expect(receiver.getByText('Aufgabe 1 von 9')).toBeVisible();

    expect(receiverRequests).toEqual([]);
    await receiver.close();
  });

  test('@smoke weniger Vorschläge als gewünscht werden ehrlich benannt', async ({ page }) => {
    // Das nachgebaute Modell kennt nur zehn Wörter – angefordert werden 15.
    await installFakeLanguageModel(page);
    await openTopicStudio(page);

    await topicField(page).fill('City life');
    await page.getByLabel('Anzahl').selectOption('15');
    await page.getByRole('button', { name: /Vorschläge erzeugen/ }).click();

    await expect(page.getByText('10 Zeilen ·')).toBeVisible();
    // Bezugsgröße bleibt der Wunsch, nicht die Lieferung.
    await expect(
      page.getByText('10 von 15 gewünschten Vorschlägen übernommen.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/10 von 10/)).toHaveCount(0);
  });

  test('@smoke ohne Sprachmodell bleibt der Weg offen', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined });
      Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: undefined });
    });
    await openTopicStudio(page);

    await expect(
      page.getByText(/automatische Themenwerkstatt ist in diesem Browser nicht verfügbar/),
    ).toBeVisible();

    await topicField(page).fill('City life');
    await page.getByRole('button', { name: 'Leere Liste anlegen' }).click();

    // Eine normale, bearbeitbare Zeile mit dem Thema als Tag.
    await expect(page.getByText('1 Zeilen ·')).toBeVisible();
    await expect(page.getByLabel('Themen-Tags, Zeile 1', { exact: true })).toHaveValue('City life');
    await page.getByLabel('Englisch, Zeile 1', { exact: true }).fill('crowded');
    await page.getByLabel('Deutsch, Zeile 1', { exact: true }).fill('überfüllt');
    await expect(page.getByRole('button', { name: 'Weiter zu den Metadaten' })).toBeEnabled();
  });

  test('@a11y Themenwerkstatt ohne schwerwiegende Befunde und mit der Tastatur bedienbar', async ({
    page,
  }) => {
    await installFakeLanguageModel(page);
    await openTopicStudio(page);
    await expectNoSeriousViolations(page, 'Themenwerkstatt');

    // Pflichtfeld: ohne Thema passiert nichts, aber es gibt eine Erklärung.
    await page.getByRole('button', { name: /Vorschläge erzeugen/ }).click();
    await expect(page.getByText('Bitte gib ein Thema an.')).toBeVisible();

    await topicField(page).focus();
    await page.keyboard.type('City life');
    await page.getByLabel('Anzahl').selectOption('5');

    const button = page.getByRole('button', { name: /Vorschläge erzeugen/ });
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByText('5 Zeilen ·')).toBeVisible();
    await expectNoSeriousViolations(page, 'Vorschau nach der Themenwerkstatt');
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y Themenwerkstatt ohne horizontalen Überlauf', async ({ page }) => {
      await installFakeLanguageModel(page);
      await openTopicStudio(page);
      await topicField(page).fill('City life');
      await page.getByLabel('Anzahl').selectOption('5');
      await page.getByRole('button', { name: /Vorschläge erzeugen/ }).click();
      await expect(page.getByText('5 Zeilen ·')).toBeVisible();

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  });
});
