import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { VOCABPACK_FORMAT_VERSION } from '../src/domain/schema';

/**
 * Sprint 2B.2b: der Satzassistent – vom Vorschlag bis zur Lernrunde.
 *
 * Das Sprachmodell wird als echtes Web-IDL-Interface injiziert. Es antwortet je
 * nach Aufgabe; damit läuft der echte Anbietercode gegen eine kontrollierte
 * API, ohne Netz und ohne Modelldownload.
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
      elemente: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
}

/** Ein `LanguageModel`, das auf die Satzaufgabe antwortet. */
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
            if (input.includes('bei einem Beispielsatz')) {
              const einfacher = input.includes('einfacheren');
              return Promise.resolve(
                JSON.stringify(
                  einfacher
                    ? {
                        english: 'You should apologise now.',
                        german: 'Du solltest dich jetzt entschuldigen.',
                      }
                    : {
                        english: 'They apologise after every game.',
                        german: 'Sie entschuldigen sich nach jedem Spiel.',
                      },
                ),
              );
            }
            return Promise.resolve('{}');
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

const LISTE = 'to apologise\tsich entschuldigen\ncrowded\tvoll, überfüllt';

/** Führt bis in die Vorschau und öffnet den Detailbereich der ersten Zeile. */
async function openDetails(page: Page): Promise<void> {
  await page.goto('/#/material/import');
  await page.getByLabel('Vokabelliste einfügen').fill(LISTE);
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
  await expect(page.getByText('2 Zeilen ·')).toBeVisible();
  await page.getByRole('button', { name: 'Beispielsatz für to apologise bearbeiten' }).click();
}

test.describe('Satzassistent', () => {
  test('@smoke Satz vorschlagen, übernehmen und ohne Modelle wieder öffnen', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        externalRequests.push(request.url());
    });

    await installFakeLanguageModel(page);
    await openDetails(page);

    // Ohne Satz gibt es genau einen Modus.
    const vorschlagen = page.getByRole('button', { name: /Beispielsatz vorschlagen, to apologise/ });
    await expect(vorschlagen).toBeVisible();
    await vorschlagen.click();

    // Der Vorschlag steht getrennt und ist noch nicht übernommen.
    await expect(page.getByText('They apologise after every game.')).toBeVisible();
    await expect(page.getByText('ungeprüfter Vorschlag')).toBeVisible();
    await expect(page.getByLabel('Beispielsatz 1 Englisch, to apologise')).toHaveCount(0);

    await page.getByRole('button', { name: /als weiteren Satz übernehmen/ }).click();

    // Jetzt steht er im ganz normalen Feld und ist dort bearbeitbar.
    await expect(page.getByLabel('Beispielsatz 1 Englisch, to apologise')).toHaveValue(
      'They apologise after every game.',
    );
    await expect(page.getByLabel('Beispielsatz 1 Deutsch, to apologise')).toHaveValue(
      'Sie entschuldigen sich nach jedem Spiel.',
    );

    // Mit einem Satz gibt es die beiden Varianten – „einfacher“ ersetzt ihn.
    await page.getByRole('button', { name: /Einfacheren Satz vorschlagen, to apologise/ }).click();
    await expect(page.getByText('You should apologise now.')).toBeVisible();
    await page.getByRole('button', { name: /Vorhandenen Satz für to apologise ersetzen/ }).click();
    await expect(page.getByLabel('Beispielsatz 1 Englisch, to apologise')).toHaveValue(
      'You should apologise now.',
    );

    // Speichern und exportieren.
    await page.getByLabel('Titel', { exact: true }).fill('Höflichkeit');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Höflichkeit' })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Als .vocabpack.json exportieren' }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(filePath, 'utf8');

    expect(JSON.parse(content).formatVersion).toBe(VOCABPACK_FORMAT_VERSION);
    expect(content).toContain('You should apologise now.');
    for (const forbidden of ['LanguageModel', 'responseConstraint', 'simpler', 'provider']) {
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
    await expect(receiver.getByRole('heading', { name: 'Höflichkeit' })).toBeVisible();
    await receiver.getByRole('link', { name: 'Öffnen' }).click();
    await receiver.getByRole('button', { name: 'Lernrunde starten' }).click();
    await expect(receiver.getByText('Aufgabe 1 von 2')).toBeVisible();

    expect(receiverRequests).toEqual([]);
    await receiver.close();
  });

  test('@smoke steht auch im Paketeditor zur Verfügung', async ({ page }) => {
    await installFakeLanguageModel(page);

    // Erst ein Paket anlegen …
    await page.goto('/#/material/import');
    await page.getByLabel('Vokabelliste einfügen').fill(LISTE);
    await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
    await page.getByLabel('Titel', { exact: true }).fill('Höflichkeit');
    await page.getByRole('button', { name: /Paket speichern/ }).click();

    // Nach dem Speichern steht der Paketeditor offen – dieselbe DraftTable,
    // dieselbe Hilfe, anderer Bereich.
    await expect(page.getByRole('heading', { level: 2, name: 'Metadaten' })).toBeVisible();
    await page.getByRole('button', { name: 'Beispielsatz für to apologise bearbeiten' }).click();

    await page.getByRole('button', { name: /Beispielsatz vorschlagen, to apologise/ }).click();
    await expect(page.getByText('They apologise after every game.')).toBeVisible();
    await page.getByRole('button', { name: /als weiteren Satz übernehmen/ }).click();
    await expect(page.getByLabel('Beispielsatz 1 Englisch, to apologise')).toHaveValue(
      'They apologise after every game.',
    );
  });

  test('@smoke ohne Sprachmodell bleibt die Satzbearbeitung unverändert', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined });
      Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: undefined });
    });
    await openDetails(page);

    await expect(
      page.getByText(/Satzvorschläge sind in diesem Browser nicht verfügbar/),
    ).toBeVisible();

    // Von Hand geht alles wie bisher.
    await page.getByRole('button', { name: 'Beispielsatz hinzufügen, to apologise' }).click();
    await page
      .getByLabel('Beispielsatz 1 Englisch, to apologise')
      .fill('You should apologise now.');
    await expect(page.getByLabel('Beispielsatz 1 Englisch, to apologise')).toHaveValue(
      'You should apologise now.',
    );
  });

  test('@a11y Satzassistent ohne schwerwiegende Befunde und mit der Tastatur bedienbar', async ({
    page,
  }) => {
    await installFakeLanguageModel(page);
    await openDetails(page);
    await expectNoSeriousViolations(page, 'Detailbereich mit Satzassistent');

    const button = page.getByRole('button', { name: /Beispielsatz vorschlagen, to apologise/ });
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByText('They apologise after every game.')).toBeVisible();
    await expectNoSeriousViolations(page, 'Detailbereich mit Vorschlag');

    const accept = page.getByRole('button', { name: /als weiteren Satz übernehmen/ });
    await accept.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Beispielsatz 1 Englisch, to apologise')).toHaveValue(
      'They apologise after every game.',
    );
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y Satzassistent ohne horizontalen Überlauf', async ({ page }) => {
      await installFakeLanguageModel(page);
      await openDetails(page);
      await page.getByRole('button', { name: /Beispielsatz vorschlagen, to apologise/ }).click();
      await expect(page.getByText('They apologise after every game.')).toBeVisible();

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
