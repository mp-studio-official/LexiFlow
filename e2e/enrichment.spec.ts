import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { VOCABPACK_FORMAT_VERSION } from '../src/domain/schema';

/**
 * Sprint 2B.1: Vorschläge beim Import – und der Nachweis, dass das fertige
 * Paket sie überlebt, ohne irgendeinen Anbieter zu brauchen.
 *
 * Die Browser-APIs für Übersetzung und Sprachmodell werden hier **nachgebaut**
 * in die Seite injiziert. Dadurch läuft der echte Anbietercode gegen eine
 * kontrollierte API – ohne Netz, ohne echten Modelldownload.
 */

const ENGLISH_ONLY = ['to apologise', 'crowded', 'neighbourhood', 'quickly'].join('\n');

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

/** Legt nachgebaute lokale Modelle in die Seite – vor jedem Skript der App. */
async function installFakeModels(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const dictionary: Record<string, string> = {
      'to apologise': 'sich entschuldigen',
      crowded: 'überfüllt',
      neighbourhood: 'Nachbarschaft',
      quickly: 'schnell',
    };

    Object.defineProperty(globalThis, 'Translator', {
      configurable: true,
      value: {
        availability: () => Promise.resolve('downloadable'),
        create: (options?: {
          monitor?: (monitor: {
            addEventListener: (type: string, listener: (event: unknown) => void) => void;
          }) => void;
        }) => {
          options?.monitor?.({
            addEventListener: (type, listener) => {
              if (type === 'downloadprogress') listener({ loaded: 1, total: 1 });
            },
          });
          return Promise.resolve({
            translate: (text: string) =>
              Promise.resolve(dictionary[text] ?? `${text} (deutsch)`),
            destroy: () => undefined,
          });
        },
      },
    });

    Object.defineProperty(globalThis, 'LanguageModel', {
      configurable: true,
      value: {
        availability: () => Promise.resolve('downloadable'),
        create: (options?: {
          monitor?: (monitor: {
            addEventListener: (type: string, listener: (event: unknown) => void) => void;
          }) => void;
        }) => {
          options?.monitor?.({
            addEventListener: (type, listener) => {
              if (type === 'downloadprogress') listener({ loaded: 1, total: 1 });
            },
          });
          return Promise.resolve({
            prompt: (input: string) => {
              const verb = input.includes('to apologise');
              return Promise.resolve(
                JSON.stringify({
                  partOfSpeech: verb ? 'verb' : 'adjective',
                  difficulty: 3,
                  topicTags: ['city'],
                }),
              );
            },
            destroy: () => undefined,
          });
        },
      },
    });
  });
}

/** Import bis zur Vorschau – nur englische Wörter, ohne Übersetzung. */
async function openPreview(page: Page): Promise<void> {
  await page.goto('/#/material/import');
  await page.getByLabel('Vokabelliste einfügen').fill(ENGLISH_ONLY);
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
  await expect(page.getByRole('heading', { name: 'Vorschläge ergänzen' })).toBeVisible();
}

test.describe('Vorschläge beim Import', () => {
  test('@smoke vom englischen Wort zum portablen Paket', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        externalRequests.push(request.url());
    });

    await installFakeModels(page);
    await openPreview(page);

    // Lernkontext – dieselben Felder wie später in den Metadaten.
    await page.getByLabel('Jahrgang').selectOption('7');
    await page.getByLabel('Thema').fill('City life');

    // Regelvorschläge sind sofort da, ohne Klick und ohne Download.
    await expect(page.getByText('Verb').first()).toBeVisible();
    await expect(page.getByLabel('Wortart, Zeile 1')).toHaveValue('');

    // Übersetzung und Sprachmodell erst nach ausdrücklichem Klick.
    await page.getByRole('button', { name: 'Sprachmodelle laden und Vorschläge erzeugen' }).click();
    await expect(page.getByText('sich entschuldigen')).toBeVisible();
    await expect(page.getByText(/liegen zur Prüfung bereit/)).toBeVisible();

    // Einzelne Übernahme …
    await page
      .getByRole('button', { name: 'Wortart für to apologise übernehmen' })
      .click();
    await expect(page.getByLabel('Wortart, Zeile 1')).toHaveValue('verb');

    // … und gebündelte Übernahme.
    await page.getByRole('button', { name: /Alle Deutsche Übersetzung übernehmen \(4\)/ }).click();
    await expect(page.getByLabel('Deutsch, Zeile 1')).toHaveValue('sich entschuldigen');
    await expect(page.getByLabel('Deutsch, Zeile 2')).toHaveValue('überfüllt');

    await page.getByRole('button', { name: /Alle Schwierigkeit übernehmen/ }).click();
    await page.getByRole('button', { name: /Alle Themen-Tags übernehmen/ }).click();
    // Beide stehen seit Sprint 4B.1 im aufgeklappten Bereich der Zeile, nicht
    // mehr als eigene Tabellenspalten.
    await page.getByRole('button', { name: 'Beispielsatz für to apologise bearbeiten' }).click();
    await expect(page.getByLabel('Schwierigkeit', { exact: true })).toHaveValue('3');
    await expect(page.getByLabel('Themen-Tags', { exact: true })).toHaveValue('City life, city');
    await page.getByRole('button', { name: 'Beispielsatz für to apologise schließen' }).click();

    // Speichern – der Lernkontext steht in demselben Schritt schon bereit.
    await expect(page.getByLabel('Jahrgang')).toHaveValue('7');
    await expect(page.getByLabel('Thema')).toHaveValue('City life');
    await page.getByLabel('Titel', { exact: true }).fill('Unit 3 – City life');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Unit 3 – City life' }),
    ).toBeVisible();

    // Exportieren und die Datei prüfen.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Als .vocabpack.json exportieren' }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as { formatVersion: number };

    expect(parsed.formatVersion).toBe(VOCABPACK_FORMAT_VERSION);
    expect(content).toContain('sich entschuldigen');
    expect(content).toContain('"difficulty": 3');
    for (const forbidden of ['suggestion', 'provider', 'LanguageModel', 'local-rule', 'confidence']) {
      expect(content.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }

    expect(externalRequests).toEqual([]);

    // ---- Zweites Szenario: ein Gerät ganz ohne Anbieter ----
    const receiver = await page.context().newPage();
    await receiver.addInitScript(() => {
      // Weder Übersetzung noch Sprachmodell vorhanden.
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
    await expect(receiver.getByRole('heading', { name: 'Unit 3 – City life' })).toBeVisible();

    // Alles ist vollständig erhalten – nachgesehen im Editor.
    await receiver.goto('/#/material');
    await receiver.getByRole('link', { name: 'Bearbeiten' }).click();
    await expect(receiver.getByLabel('Deutsch, Zeile 1')).toHaveValue('sich entschuldigen');
    await expect(receiver.getByLabel('Wortart, Zeile 1')).toHaveValue('verb');
    await receiver
      .getByRole('button', { name: 'Beispielsatz für to apologise bearbeiten' })
      .click();
    await expect(receiver.getByLabel('Schwierigkeit', { exact: true })).toHaveValue('3');
    await expect(receiver.getByLabel('Themen-Tags', { exact: true })).toHaveValue('City life, city');

    // Und es lässt sich sofort üben.
    await receiver.goto('/#/lernen');
    await receiver.getByRole('link', { name: 'Öffnen' }).click();
    await receiver.getByRole('button', { name: 'Lernrunde starten' }).click();
    await expect(receiver.getByText('Aufgabe 1 von 4')).toBeVisible();

    expect(receiverRequests).toEqual([]);
    await receiver.close();
  });

  test('@smoke ohne Anbieter bleibt der Import vollständig benutzbar', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined });
      Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: undefined });
    });
    await openPreview(page);

    await expect(
      page.getByText(/in diesem Browser nicht verfügbar\. Deutsche Antworten/),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Vorschläge erzeugen/ })).toBeDisabled();

    // Regelvorschläge gibt es trotzdem, und von Hand geht alles wie bisher.
    await page.getByRole('button', { name: 'Wortart für to apologise übernehmen' }).click();
    await expect(page.getByLabel('Wortart, Zeile 1')).toHaveValue('verb');

    await page.getByLabel('Deutsch, Zeile 1').fill('sich entschuldigen');
    await expect(page.getByLabel('Deutsch, Zeile 1')).toHaveValue('sich entschuldigen');
  });

  test('@a11y Vorschlagsbereich ohne schwerwiegende Befunde', async ({ page }) => {
    await installFakeModels(page);
    await openPreview(page);
    await expectNoSeriousViolations(page, 'Vorschläge vor der Erzeugung');

    await page.getByRole('button', { name: 'Sprachmodelle laden und Vorschläge erzeugen' }).click();
    await expect(page.getByText(/liegen zur Prüfung bereit/)).toBeVisible();
    await expectNoSeriousViolations(page, 'Vorschläge nach der Erzeugung');
  });

  test('@a11y Vorschläge sind mit der Tastatur bedienbar', async ({ page }) => {
    await installFakeModels(page);
    await openPreview(page);

    const accept = page.getByRole('button', { name: 'Wortart für to apologise übernehmen' });
    await accept.focus();
    await expect(accept).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Wortart, Zeile 1')).toHaveValue('verb');
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y Vorschlagsbereich ohne horizontalen Überlauf', async ({ page }) => {
      await installFakeModels(page);
      await openPreview(page);
      await page.getByRole('button', { name: 'Sprachmodelle laden und Vorschläge erzeugen' }).click();
      await expect(page.getByText(/liegen zur Prüfung bereit/)).toBeVisible();

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
