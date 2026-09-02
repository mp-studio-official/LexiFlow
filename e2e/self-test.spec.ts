import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Sprint 3B.2b: Selbsttest – der ganze Weg aus Sicht der Lernenden.
 *
 * Der Selbsttest ist eine Selbsteinschätzung. Deshalb prüft dieser Lauf nicht
 * nur die Bedienung, sondern vor allem zwei Zusagen: Der Lernstand in
 * IndexedDB bleibt Byte für Byte gleich – auch nach der Fehlerwiederholung –,
 * und die Seite spricht mit niemandem draußen.
 */

const VOCAB_LIST = [
  'island\tdie Insel',
  'bay\tdie Bucht',
  'cave\tdie Höhle',
  'boat\tdas Boot',
].join('\n');

/** Die Lösungen zu obiger Liste – der Test muss richtig antworten können. */
const SOLUTIONS: Readonly<Record<string, string>> = {
  island: 'die Insel',
  bay: 'die Bucht',
  cave: 'die Höhle',
  boat: 'das Boot',
  'die Insel': 'island',
  'die Bucht': 'bay',
  'die Höhle': 'cave',
  'das Boot': 'boat',
};

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

/** Kein eingebautes Browsermodell – der Selbsttest braucht ohnehin keins. */
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

async function seedPack(
  page: Page,
  { title = 'Halong Bay', direction = 'en-de' }: { title?: string; direction?: string } = {},
): Promise<void> {
  await withoutBrowserModels(page);
  await page.goto('/#/material/import');
  await page.getByLabel('Vokabelliste einfügen').fill(VOCAB_LIST);
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
  await page.getByLabel('Titel', { exact: true }).fill(title);
  await page.getByLabel('Jahrgang').selectOption('7');
  await page.getByLabel('Lernrichtung').selectOption(direction);
  await page.getByRole('button', { name: /Paket speichern/ }).click();
  await page.getByRole('link', { name: 'Im Lernbereich ansehen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/** Derselbe vollständige Abzug wie in `study-modes.spec.ts`. */
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

/**
 * Eine Aufgabe beantworten, ohne die Übungsform vorher zu kennen.
 *
 * Der Selbsttest mischt bewusst. Der Test liest deshalb die Frage und
 * entscheidet erst dann, ob er tippt oder auswählt.
 */
async function answerCurrent(page: Page, correct: boolean): Promise<void> {
  const prompt = ((await page.locator('.prompt').first().textContent()) ?? '').trim();
  const expected = SOLUTIONS[prompt] ?? '';

  const input = page.locator('form input[type="text"]');
  if (await input.count()) {
    await input.fill(correct ? expected : 'zzz');
    await page.getByRole('button', { name: 'Antwort prüfen' }).click();
    return;
  }

  const options = page.locator('.option');
  const total = await options.count();
  let chosen: Locator | null = null;
  for (let index = 0; index < total; index += 1) {
    const option = options.nth(index);
    const text = ((await option.textContent()) ?? '').includes(expected);
    if (text === correct) {
      chosen = option;
      break;
    }
  }
  await (chosen ?? options.first()).click();
}

async function playRound(
  page: Page,
  total: number,
  correct: (position: number) => boolean,
): Promise<void> {
  for (let position = 0; position < total; position += 1) {
    await expect(page.getByText(`Aufgabe ${position + 1} von ${total}`).first()).toBeVisible();
    await answerCurrent(page, correct(position));
  }
}

test.describe('Selbsttest', () => {
  test('@smoke einen ganzen Test spielen und die Auswertung lesen', async ({ page }) => {
    const externalRequests = watchExternalRequests(page);
    await seedPack(page);

    await page.getByRole('link', { name: 'Selbsttest starten' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Test zusammenstellen' })).toBeVisible();

    // Vier Vokabeln, eine Richtung – die Vorschau sagt das ehrlich.
    await expect(page.getByText(/4 Aufgaben werden zusammengestellt/)).toBeVisible();
    await page.getByRole('button', { name: 'Selbsttest starten' }).click();

    await playRound(page, 4, (position) => position < 3);

    await expect(page.getByRole('heading', { level: 2, name: 'Deine Auswertung' })).toBeVisible();
    await expect(page.getByText('3 von 4 richtig')).toBeVisible();
    // Keine Note, kein Bestanden.
    await expect(page.getByText(/bestanden|durchgefallen/i)).toHaveCount(0);

    expect(externalRequests).toEqual([]);
  });

  test('@smoke gemischte Richtungen fragen in beide Richtungen ab', async ({ page }) => {
    await seedPack(page, { direction: 'both' });

    await page.getByRole('link', { name: 'Selbsttest starten' }).click();
    await expect(page.getByRole('radio', { name: 'Gemischt' })).toBeChecked();
    await page.getByRole('radio', { name: 'Alle verfügbaren' }).check();
    await expect(page.getByText(/8 Aufgaben werden zusammengestellt/)).toBeVisible();

    await page.getByRole('button', { name: 'Selbsttest starten' }).click();

    const directions = new Set<string>();
    for (let position = 0; position < 8; position += 1) {
      const note = ((await page.locator('.prompt-note').first().textContent()) ?? '').trim();
      directions.add(note.split('·')[0]?.trim() ?? '');
      await answerCurrent(page, true);
    }

    // Die Aufgabe selbst sagt, was zu tun ist – nicht in Pfeilen, sondern in Worten.
    expect([...directions].sort()).toEqual(['Übersetze ins Deutsche', 'Übersetze ins Englische']);
    await expect(page.getByText('8 von 8 richtig')).toBeVisible();
  });

  test('@smoke Fehler ansehen und gezielt wiederholen', async ({ page }) => {
    await seedPack(page);

    await page.getByRole('link', { name: 'Selbsttest starten' }).click();
    await page.getByRole('button', { name: 'Selbsttest starten' }).click();
    await playRound(page, 4, (position) => position < 2);

    await expect(page.getByText('2 von 4 richtig')).toBeVisible();

    // Erst ansehen …
    await page.getByRole('button', { name: 'Fehler ansehen' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Das war noch nicht richtig' })).toBeVisible();
    await expect(page.getByText('Deine Antwort:')).toHaveCount(2);
    await expect(page.getByText('Richtig wäre:')).toHaveCount(2);

    // … dann wiederholen. Nur die Fehler, nicht der ganze Test.
    await page.getByRole('button', { name: 'Fehler noch einmal üben' }).click();
    await expect(page.getByText('Fehler wiederholen')).toBeVisible();
    await playRound(page, 2, () => true);

    await expect(page.getByRole('heading', { level: 2, name: 'Wiederholung ausgewertet' })).toBeVisible();
    await expect(page.getByText('2 von 2 richtig')).toBeVisible();
  });

  test('@smoke der Lernstand bleibt über beide Runden unverändert', async ({ page }) => {
    await seedPack(page);

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

    await page.getByRole('link', { name: 'Selbsttest starten' }).click();
    await page.getByRole('button', { name: 'Selbsttest starten' }).click();
    await playRound(page, 4, (position) => position < 2);
    await expect(page.getByText('2 von 4 richtig')).toBeVisible();

    // Zwischenstand: schon nach der ersten Runde darf sich nichts geändert haben.
    expect(await readProgress(page)).toBe(before);

    await page.getByRole('button', { name: 'Fehler noch einmal üben' }).click();
    await playRound(page, 2, () => true);
    await expect(page.getByText('2 von 2 richtig')).toBeVisible();

    expect(await readProgress(page)).toBe(before);
  });

  test('@smoke ein Neuladen setzt den Test zurück', async ({ page }) => {
    await seedPack(page);

    await page.getByRole('link', { name: 'Selbsttest starten' }).click();
    await page.getByRole('button', { name: 'Selbsttest starten' }).click();
    await answerCurrent(page, true);
    await expect(page.getByText('Aufgabe 2 von 4').first()).toBeVisible();

    await page.reload();

    // Kein Zwischenstand, keine Historie – die Auswahl steht wieder da.
    await expect(page.getByRole('heading', { level: 2, name: 'Test zusammenstellen' })).toBeVisible();
  });

  test('@a11y alle vier Zustände ohne schwerwiegende Befunde', async ({ page }) => {
    await seedPack(page);

    await page.getByRole('link', { name: 'Selbsttest starten' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Test zusammenstellen' })).toBeVisible();
    await expectNoSeriousViolations(page, 'Selbsttest einrichten');

    await page.getByRole('button', { name: 'Selbsttest starten' }).click();
    await expect(page.getByText('Aufgabe 1 von 4').first()).toBeVisible();
    await expectNoSeriousViolations(page, 'Selbsttest bearbeiten');

    await playRound(page, 4, (position) => position < 2);
    await expect(page.getByRole('heading', { level: 2, name: 'Deine Auswertung' })).toBeVisible();
    await expectNoSeriousViolations(page, 'Selbsttest auswerten');

    await page.getByRole('button', { name: 'Fehler ansehen' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Das war noch nicht richtig' })).toBeVisible();
    await expectNoSeriousViolations(page, 'Fehler ansehen');
  });

  test('@a11y mit der Tastatur bedienbar', async ({ page }) => {
    await seedPack(page);

    await page.getByRole('link', { name: 'Selbsttest starten' }).click();
    await page.getByRole('button', { name: 'Selbsttest starten' }).focus();
    await page.keyboard.press('Enter');

    await expect(page.getByText('Aufgabe 1 von 4').first()).toBeVisible();

    // Der Fokus steht dort, wo die Antwort beginnt – nie im Nichts.
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(['INPUT', 'H2']).toContain(focused);
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y kein horizontaler Überlauf im Selbsttest', async ({ page }) => {
      await seedPack(page);

      await page.getByRole('link', { name: 'Selbsttest starten' }).click();
      await page.getByRole('button', { name: 'Selbsttest starten' }).click();
      await expect(page.getByText('Aufgabe 1 von 4').first()).toBeVisible();

      const running = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(running.scrollWidth).toBeLessThanOrEqual(running.clientWidth);

      await playRound(page, 4, (position) => position < 2);
      await expect(page.getByRole('heading', { level: 2, name: 'Deine Auswertung' })).toBeVisible();

      const result = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
      await expectNoSeriousViolations(page, 'Auswertung auf 390 px');
    });
  });
});
