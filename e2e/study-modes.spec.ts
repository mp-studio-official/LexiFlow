import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 3B.2a: Durchsehen und Karten – der ganze Weg aus Sicht der Lernenden.
 *
 * Der wichtigste Test ist der dritte: Beide Ansichten dürfen den Lernstand
 * nicht anfassen. Geprüft wird das nicht an der Oberfläche, sondern direkt in
 * IndexedDB, vor und nach der Nutzung.
 */

const VOCAB_LIST = [
  'island\tdie Insel',
  'bay\tdie Bucht',
  'cave\tdie Höhle',
  'boat\tdas Boot',
].join('\n');

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

/** Kein eingebautes Browsermodell – die Schüleransicht braucht ohnehin keins. */
async function withoutBrowserModels(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined });
    Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: undefined });
  });
}

function watchExternalRequests(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') external.push(request.url());
  });
  return external;
}

/**
 * Legt ein Paket an und landet auf der Schüler-Paketseite.
 *
 * Die Richtung ist ausdrücklich wählbar: Ein Paket mit beiden Richtungen
 * ergibt im gemischten Kartensatz doppelt so viele Karten – für die
 * Bedienungstests ist eine Richtung übersichtlicher.
 */
async function seedPack(
  page: Page,
  { title = 'Halong Bay', direction = 'both' }: { title?: string; direction?: string } = {},
): Promise<void> {
  await withoutBrowserModels(page);
  await page.goto('/#/material/import');
  await page.getByLabel('Vokabelliste einfügen').fill(VOCAB_LIST);
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
  await page.getByLabel('Titel', { exact: true }).fill(title);
  await page.getByLabel('Jahrgang').selectOption('7');
  await page.getByLabel('Lernrichtung').selectOption(direction);
  await page.getByRole('button', { name: /Paket speichern/ }).click();
  await page.getByRole('link', { name: 'Im Schülerbereich ansehen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/**
 * Liest den vollständigen Lernstand aus IndexedDB – Richtungen und Paketzähler.
 * Genau das darf sich durch Durchsehen und Karten nicht ändern.
 */
async function readProgress(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const open = indexedDB.open('lexiflow');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });

    const read = (store: string): Promise<unknown[]> =>
      new Promise((resolve, reject) => {
        const request = database.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as unknown[]);
        request.onerror = () => reject(request.error);
      });

    const result = {
      directionProgress: await read('directionProgress'),
      packProgress: await read('packProgress'),
    };
    database.close();
    return JSON.stringify(result);
  });
}

test.describe('Auf eigene Weise lernen', () => {
  test('@smoke durchsehen: aufdecken, Richtung wechseln, suchen', async ({ page }) => {
    const externalRequests = watchExternalRequests(page);
    await seedPack(page);

    await page.getByRole('link', { name: 'Vokabeln durchsehen' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'island' })).toBeVisible();

    // Antworten sind zu.
    await expect(page.getByText('die Insel')).toBeHidden();

    // Eine einzelne aufdecken und wieder schließen.
    await page.getByRole('button', { name: 'Antwort für island anzeigen' }).click();
    await expect(page.getByText('die Insel')).toBeVisible();
    await page.getByRole('button', { name: 'Antwort für island verbergen' }).click();
    await expect(page.getByText('die Insel')).toBeHidden();

    // Alle auf einmal.
    await page.getByRole('button', { name: 'Alle Antworten anzeigen' }).click();
    await expect(page.getByText('die Höhle')).toBeVisible();
    await expect(page.getByText('das Boot')).toBeVisible();

    // Richtung wechseln: Seiten getauscht, alles wieder zu.
    await page.getByRole('radio', { name: 'Deutsch → Englisch' }).check();
    await expect(page.getByRole('heading', { level: 2, name: 'die Insel' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Antwort für die Insel anzeigen' }),
    ).toHaveAttribute('aria-expanded', 'false');

    // Suchen.
    await page.getByLabel('Suchen').fill('höhle');
    await expect(page.getByRole('heading', { level: 2, name: 'die Höhle' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'die Insel' })).toHaveCount(0);

    await page.getByLabel('Suchen').fill('Fahrrad');
    await expect(page.getByText('Keine passende Vokabel gefunden.')).toBeVisible();

    await page.getByLabel('Suchen').fill('');
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(4);

    expect(externalRequests).toEqual([]);
  });

  test('@smoke Karten: mit der Tastatur umdrehen, mischen, Durchgang beenden', async ({ page }) => {
    const externalRequests = watchExternalRequests(page);
    await seedPack(page, { direction: 'en-de' });

    await page.getByRole('link', { name: 'Mit Karten lernen' }).click();
    await expect(page.getByText('Karte 1 von 4')).toBeVisible();

    const deck = page.getByRole('group', { name: /^Karte 1 von 4/ });
    await deck.focus();

    // Umdrehen mit der Leertaste.
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Antwort verbergen' })).toBeVisible();

    // Weiter – die nächste Karte beginnt wieder verdeckt.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('Karte 2 von 4')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Antwort anzeigen' })).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(page.getByText('Karte 1 von 4')).toBeVisible();

    // Mischen setzt den Satz zurück, ohne Karten zu verlieren.
    await page.getByRole('button', { name: 'Karten mischen' }).click();
    await expect(page.getByText('Karte 1 von 4')).toBeVisible();

    // Vollständiger Durchgang.
    for (let step = 0; step < 4; step += 1) {
      await page.getByRole('button', { name: 'Nächste Karte' }).click();
    }
    await expect(
      page.getByRole('heading', { name: 'Du hast alle Karten angesehen.' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Noch einmal' })).toBeVisible();

    expect(externalRequests).toEqual([]);
  });

  test('@smoke beide Ansichten lassen den Lernstand unverändert', async ({ page }) => {
    await seedPack(page, { direction: 'en-de' });

    // Erst eine echte Lernrunde – damit es überhaupt einen Lernstand gibt.
    await page.getByRole('button', { name: 'Lernrunde starten' }).click();
    for (let step = 1; step <= 4; step += 1) {
      await expect(page.getByText(`Aufgabe ${step} von 4`)).toBeVisible();
      await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
      await page.getByRole('button', { name: 'Gewusst', exact: true }).click();
      await page.getByRole('button', { name: /^(Weiter|Runde beenden)$/ }).click();
    }
    await page.getByRole('link', { name: 'Zurück zum Paket' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Halong Bay' })).toBeVisible();

    const before = await readProgress(page);
    expect(before).toContain('directionProgress');

    // Durchsehen …
    await page.getByRole('link', { name: 'Vokabeln durchsehen' }).click();
    await page.getByRole('button', { name: 'Alle Antworten anzeigen' }).click();
    await page.getByRole('link', { name: 'Zurück zum Paket' }).click();

    // … und Karten.
    await page.getByRole('link', { name: 'Mit Karten lernen' }).click();
    await expect(page.getByText(/^Karte 1 von \d+$/)).toBeVisible();
    await page.getByRole('button', { name: 'Antwort anzeigen' }).click();
    await page.getByRole('button', { name: 'Nächste Karte' }).click();
    await page.getByRole('button', { name: 'Karten mischen' }).click();
    await page.getByRole('link', { name: 'Zurück zum Paket' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Halong Bay' })).toBeVisible();

    expect(await readProgress(page)).toBe(before);
  });

  test('@smoke der Kartensatz beginnt beim Neuladen von vorn', async ({ page }) => {
    await seedPack(page, { direction: 'en-de' });
    await page.getByRole('link', { name: 'Mit Karten lernen' }).click();

    await page.getByRole('button', { name: 'Nächste Karte' }).click();
    await expect(page.getByText('Karte 2 von 4')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Karte 1 von 4')).toBeVisible();
  });

  test('@a11y Durchsehen ohne schwerwiegende Befunde', async ({ page }) => {
    await seedPack(page);
    await page.getByRole('link', { name: 'Vokabeln durchsehen' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'island' })).toBeVisible();

    await expectNoSeriousViolations(page, 'Durchsehen, alles verborgen');

    await page.getByRole('button', { name: 'Alle Antworten anzeigen' }).click();
    await expectNoSeriousViolations(page, 'Durchsehen, alles aufgedeckt');
  });

  test('@a11y Karten ohne schwerwiegende Befunde', async ({ page }) => {
    await seedPack(page);
    await page.getByRole('link', { name: 'Mit Karten lernen' }).click();
    await expect(page.getByText(/^Karte 1 von \d+$/)).toBeVisible();

    await expectNoSeriousViolations(page, 'Karte verdeckt');

    await page.getByRole('button', { name: 'Antwort anzeigen' }).click();
    await expectNoSeriousViolations(page, 'Karte aufgedeckt');
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y kein horizontaler Überlauf beim Durchsehen', async ({ page }) => {
      await seedPack(page);
      await page.getByRole('link', { name: 'Vokabeln durchsehen' }).click();
      await page.getByRole('button', { name: 'Alle Antworten anzeigen' }).click();

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
      await expectNoSeriousViolations(page, 'Durchsehen auf 390 px');
    });

    test('@a11y Karten sind auf dem Telefon groß genug', async ({ page }) => {
      await seedPack(page);
      await page.getByRole('link', { name: 'Mit Karten lernen' }).click();
      await expect(page.getByText(/^Karte 1 von \d+$/)).toBeVisible();

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

      // Die drei zentralen Bedienelemente müssen sich treffen lassen.
      for (const name of ['Vorherige Karte', 'Antwort anzeigen', 'Nächste Karte']) {
        const box = await page.getByRole('button', { name }).boundingBox();
        expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
        expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44);
      }

      await expectNoSeriousViolations(page, 'Karten auf 390 px');
    });
  });
});
