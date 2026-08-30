import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 2B.2b: Empfehlungen aus einem Text – und die gewünschte Anzahl
 * Vokabelvorschläge.
 *
 * Das injizierte Sprachmodell empfiehlt ausschließlich über die neutralen
 * Schlüssel, die es selbst bekommen hat. Der eingefügte Text erreicht es nie.
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

const TEXT =
  'The crowded bus was late again. Litter is a problem in the neighbourhood. ' +
  'A quiet pavement helps everyone here. The crowded street was noisy at night. ' +
  'Traffic makes the journey slow. A busy crossing needs patience.';

/**
 * Ein `LanguageModel`, das die ersten beiden Schlüssel empfiehlt – und einen
 * erfundenen dazu, den die lokale Prüfung wegwerfen muss.
 */
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
            if (input.includes('Kandidaten (Schlüssel')) {
              // Was dem Modell vorlag, merken wir uns für die Prüfung im Test.
              (globalThis as { __lastTextPrompt?: string }).__lastTextPrompt = input;
              return Promise.resolve(
                JSON.stringify({ recommendedKeys: ['c2', 'c1', 'c999', 'skyline'] }),
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

async function analyze(page: Page, count?: string): Promise<void> {
  await page.goto('/#/material/import?quelle=text');
  await page.getByLabel('Englischer Text').fill(TEXT);
  if (count) {
    await page.getByLabel('Gewünschte Anzahl Vokabelvorschläge').selectOption(count);
  }
  await page.getByRole('button', { name: 'Text lokal analysieren' }).click();
}

/** Die Namen aller angezeigten Kandidaten, in Anzeigereihenfolge. */
async function listedWords(page: Page): Promise<string[]> {
  const labels = await page.getByRole('checkbox', { name: /übernehmen$/ }).evaluateAll((boxes) =>
    boxes.map((box) => box.getAttribute('aria-label')?.replace(' übernehmen', '') ?? ''),
  );
  return labels;
}

async function selectedWords(page: Page): Promise<string[]> {
  return page.getByRole('checkbox', { name: /übernehmen$/ }).evaluateAll((boxes) =>
    boxes
      .filter((box) => (box as HTMLInputElement).checked)
      .map((box) => box.getAttribute('aria-label')?.replace(' übernehmen', '') ?? ''),
  );
}

test.describe('Empfehlungen aus einem Text', () => {
  test('@smoke empfehlen, auswählen, exportieren und ohne Modelle üben', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        externalRequests.push(request.url());
    });

    await installFakeLanguageModel(page);
    await analyze(page, '10');

    await expect(page.getByRole('heading', { name: /Gefundene Vokabelkandidaten/ })).toBeVisible();
    const before = await selectedWords(page);
    expect(before.length).toBeGreaterThan(2);

    await page
      .getByRole('button', { name: 'Lokales Sprachmodell laden und Empfehlungen erzeugen' })
      .click();

    // Zwei Empfehlungen – die erfundenen Schlüssel sind gefallen.
    await expect(page.getByText('Für Lerngruppe empfohlen')).toHaveCount(2);
    await expect(page.getByText(/2 von \d+ geprüften Kandidaten empfohlen\./).first()).toBeVisible();

    // **Die Auswahl ist unverändert.** Nur die Anzeigereihenfolge ändert sich.
    expect([...(await selectedWords(page))].sort()).toEqual([...before].sort());

    // Der Text hat das Modell nie erreicht.
    const prompt = await page.evaluate(
      () => (globalThis as { __lastTextPrompt?: string }).__lastTextPrompt ?? '',
    );
    expect(prompt).toContain('c1 | ');
    expect(prompt).not.toContain(TEXT);
    expect(prompt).not.toContain('A busy crossing needs patience. ');

    // Erst der ausdrückliche Klick verändert sie.
    await page.getByRole('button', { name: 'Nur Empfehlungen auswählen' }).click();
    const recommended = await selectedWords(page);
    expect(recommended).toHaveLength(2);

    // Empfehlungen stehen vorn.
    expect((await listedWords(page)).slice(0, 2)).toEqual(recommended);

    // Übersetzungen ergänzen und übernehmen.
    for (const word of recommended) {
      await page.getByLabel(`Deutsche Antwort für „${word}“`).fill(`Bedeutung von ${word}`);
    }
    await page.getByRole('button', { name: /2 Vokabeln in die Vorschau übernehmen/ }).click();

    await expect(page.getByText('2 Zeilen ·')).toBeVisible();
    await page.getByRole('button', { name: 'Weiter zu den Metadaten' }).click();
    await page.getByLabel('Titel', { exact: true }).fill('City life – Empfehlungen');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'City life – Empfehlungen' }),
    ).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Als .vocabpack.json exportieren' }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(filePath, 'utf8');

    expect(JSON.parse(content).formatVersion).toBe(1);
    for (const forbidden of [
      'recommendedKeys',
      'recommended',
      'LanguageModel',
      'responseConstraint',
      'provider',
    ]) {
      expect(content).not.toContain(forbidden);
    }
    // Auch die neutralen Schlüssel selbst stehen nirgends in der Datei.
    expect(content).not.toMatch(/"c\d+"/);
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
    await expect(receiver.getByRole('heading', { name: 'City life – Empfehlungen' })).toBeVisible();
    await receiver.getByRole('link', { name: 'Öffnen' }).click();
    await receiver.getByRole('button', { name: 'Lernrunde starten' }).click();
    await expect(receiver.getByText('Aufgabe 1 von 2')).toBeVisible();

    expect(receiverRequests).toEqual([]);
    await receiver.close();
  });

  test('@smoke die gewünschte Anzahl begrenzt die Kandidaten – auch ohne Modell', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined });
      Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: undefined });
    });

    await analyze(page, '5');
    await expect(page.getByRole('heading', { name: 'Gefundene Vokabelkandidaten (5)' })).toBeVisible();
    await expect(page.getByText('5 von 5 gewünschten Vokabelvorschlägen gefunden.')).toBeVisible();
    expect(await listedWords(page)).toHaveLength(5);

    // Ohne Sprachmodell bleibt alles benutzbar – nur eben ohne Priorisierung.
    await expect(page.getByText(/Dieser Browser bietet kein lokales Sprachmodell/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Empfehlungen erzeugen/ })).toHaveCount(0);
  });

  test('@smoke mehr gewünscht als im Text: ehrliche Zahl statt erfundener Vokabeln', async ({
    page,
  }) => {
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').fill('The bus was crowded. Litter is a problem.');
    await page.getByLabel('Gewünschte Anzahl Vokabelvorschläge').selectOption('30');
    await page.getByRole('button', { name: 'Text lokal analysieren' }).click();

    const found = (await listedWords(page)).length;
    expect(found).toBeGreaterThan(0);
    expect(found).toBeLessThan(30);
    await expect(
      page.getByText(`${found} von 30 gewünschten Vokabelvorschlägen gefunden.`),
    ).toBeVisible();
    await expect(page.getByText(/erfunden wird nichts/)).toBeVisible();
  });

  test('@smoke eine eigene Anzahl zwischen 1 und 50', async ({ page }) => {
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').fill(TEXT);
    await page.getByLabel('Gewünschte Anzahl Vokabelvorschläge').selectOption('custom');

    const field = page.getByLabel('Eigene Anzahl');
    await field.fill('3');
    await page.getByRole('button', { name: 'Text lokal analysieren' }).click();

    await expect(page.getByRole('heading', { name: 'Gefundene Vokabelkandidaten (3)' })).toBeVisible();
    await expect(page.getByText('3 von 3 gewünschten Vokabelvorschlägen gefunden.')).toBeVisible();
  });

  test('@a11y Priorisierung ohne schwerwiegende Befunde und mit der Tastatur bedienbar', async ({
    page,
  }) => {
    await installFakeLanguageModel(page);
    await analyze(page, '10');
    await expectNoSeriousViolations(page, 'Kandidaten mit Priorisierung');

    const button = page.getByRole('button', { name: /Empfehlungen erzeugen/ });
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByText('Für Lerngruppe empfohlen')).toHaveCount(2);
    await expectNoSeriousViolations(page, 'Kandidaten nach der Empfehlung');

    const only = page.getByRole('button', { name: 'Nur Empfehlungen auswählen' });
    await only.focus();
    await page.keyboard.press('Enter');
    expect(await selectedWords(page)).toHaveLength(2);
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y Priorisierung ohne horizontalen Überlauf', async ({ page }) => {
      await installFakeLanguageModel(page);
      await analyze(page, '10');
      await page.getByRole('button', { name: /Empfehlungen erzeugen/ }).click();
      await expect(page.getByText('Für Lerngruppe empfohlen')).toHaveCount(2);

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
