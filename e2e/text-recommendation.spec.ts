import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { VOCABPACK_FORMAT_VERSION } from '../src/domain/schema';

/**
 * Sprint 4B.1: der Empfehlungsschritt im Import-Assistenten.
 *
 * Der Weg heißt jetzt **Text analysieren → Empfehlungen generieren → Prüfen &
 * Speichern**. Was hier geprüft wird, ist nicht die Rangfolge im Einzelnen –
 * dafür gibt es `recommendation.test.ts` –, sondern dass der Ablauf hält, was
 * er verspricht: dass Empfehlungen entstehen, dass die Zählung stimmt, dass
 * Ersetztes wiederfindbar bleibt und dass ein Sprung im Stepper keine Arbeit
 * kostet.
 *
 * Der Test läuft **ohne** Browsermodelle. Das Offline-Wörterbuch ist das echte
 * – es ist Teil des Pakets und braucht kein Netz.
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

/**
 * Ein Sachtext, dessen Anfang aus Alltagswörtern besteht und dessen lohnende
 * Vokabeln hinten stehen. Genau darum geht es: Die Standardsortierung darf
 * nicht die ersten Wörter des Textes liefern.
 */
const TEXT = [
  'The old house on the street was small and the people there were good.',
  'The day was long and the man went to work in the city.',
  'Coastal erosion threatens the settlement, and the evacuation of residents',
  'demonstrates the resilience of the local infrastructure.',
  'Erosion and evacuation were discussed at length by the council.',
].join(' ');

async function withoutBrowserModels(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined });
    Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: undefined });
  });
}

async function analyze(page: Page): Promise<void> {
  await withoutBrowserModels(page);
  await page.goto('/#/material/import?quelle=text');
  await page.getByLabel('Englischer Text').fill(TEXT);
  await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();
}

/** Der zweite Schritt: warten, bis das Wörterbuch durch ist, dann empfehlen. */
async function recommend(page: Page, count = '5'): Promise<void> {
  const knopf = page.getByRole('button', { name: /^Empfehlungen (generieren|neu berechnen)$/ });
  await expect(knopf).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel('Anzahl').selectOption(count);
  await knopf.click();
  await expect(page.getByRole('heading', { name: /Vorgeschlagene Vokabeln/ })).toBeVisible();
}

/** Die englischen Stichwörter der aktuellen Empfehlungen, in Anzeigereihenfolge. */
async function listedWords(page: Page): Promise<string[]> {
  return page
    .locator('.candidate__head strong')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
}

test.describe('Empfehlungen aus einem Text', () => {
  test('@smoke empfehlen, eintragen, ersetzen, speichern und üben', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        externalRequests.push(request.url());
    });

    await analyze(page);

    // 1. Vor dem Klick gibt es Einstellungen und noch keine Liste.
    await expect(page.getByLabel('Jahrgang')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Vorgeschlagene Vokabeln/ })).toHaveCount(0);

    await page.getByLabel('Jahrgang').selectOption('9');
    await expect(page.getByLabel('GeR-Niveau')).toHaveValue('B1');
    await recommend(page, '5');

    // 2. Fünf Empfehlungen – und der Bodensatz ist nicht dabei.
    const words = (await listedWords(page)).map((word) => word.toLowerCase());
    expect(words).toHaveLength(5);
    for (const alltag of ['old', 'street', 'people', 'day', 'house']) {
      expect(words).not.toContain(alltag);
    }

    // 3. Keine Häkchen: Die Zählung sagt, was passiert.
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByText('0 Vokabeln werden übernommen · 5 Empfehlungen sind noch offen.'))
      .toBeVisible();

    // 4. Die sichere Sammelübernahme trägt nur Unstrittiges ein.
    await page.getByRole('button', { name: 'Übersetzungsvorschläge eintragen' }).click();
    await expect(page.getByText(/Vokabeln werden übernommen/)).toBeVisible();

    // 5. Der Rest wird von Hand ergänzt, bis nichts mehr offen ist.
    for (const word of await listedWords(page)) {
      const field = page.getByLabel(`Deutsche Antwort für „${word}“`);
      if ((await field.inputValue()).trim() === '') await field.fill(`Bedeutung von ${word}`);
    }
    await expect(page.getByText(/Keine Empfehlung ist mehr offen\./)).toBeVisible();

    // 6. Prüfen & Speichern – Tabelle, Titel und Speichern in einem Schritt.
    await page.getByRole('button', { name: '5 Vokabeln prüfen & speichern' }).click();
    await expect(page.getByText('5 Zeilen ·')).toBeVisible();
    await expect(page.getByText(/Lernkontext:/)).toContainText('Klasse 9');

    await page.getByLabel('Titel', { exact: true }).fill('Coastal erosion – Empfehlungen');
    await page.getByLabel('Beschreibung (optional)').fill('Achte auf die Nomenendungen.');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Coastal erosion – Empfehlungen' }),
    ).toBeVisible();

    // 7. Die optionale Beschreibung übersteht den Weg in die Datei.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Als .vocabpack.json exportieren' }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(filePath, 'utf8');

    expect(JSON.parse(content).formatVersion).toBe(VOCABPACK_FORMAT_VERSION);
    expect(JSON.parse(content).meta.description).toBe('Achte auf die Nomenendungen.');
    // Der Quelltext bleibt draußen; nur die Originalsätze der Vokabeln gehen mit.
    expect(content).not.toContain('The old house on the street was small');
    expect(externalRequests).toEqual([]);

    // 8. Und das Paket lässt sich auf einem Gerät ganz ohne Modelle öffnen.
    const receiver = await page.context().newPage();
    await receiver.addInitScript(() => {
      Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined });
      Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: undefined });
    });
    await receiver.goto('/#/lernen');
    await receiver.getByLabel('Vokabelpaket auswählen').setInputFiles(filePath);
    await expect(
      receiver.getByRole('heading', { name: 'Coastal erosion – Empfehlungen' }),
    ).toBeVisible();
    await receiver.getByRole('link', { name: 'Öffnen' }).click();
    await receiver.getByRole('button', { name: 'Lernrunde starten' }).click();
    await expect(receiver.getByText('Aufgabe 1 von 5')).toBeVisible();
    await receiver.close();
  });

  test('@smoke offene Empfehlungen ersetzen, ohne Arbeit zu verlieren', async ({ page }) => {
    /*
      Seit 4B.2 gibt es dafür **einen** Knopf statt zweier. Was er tut, hängt
      daran, ob sich seit dem letzten Lauf etwas an den Einstellungen geändert
      hat: Hier hat es das nicht – also sollen ausdrücklich andere Wörter
      kommen, und die bisherigen wandern in die Rückschau.
    */
    await analyze(page);
    await recommend(page, '5');

    const erste = (await listedWords(page))[0]!;
    await page.getByLabel(`Deutsche Antwort für „${erste}“`).fill('meine Antwort');

    const vorher = await listedWords(page);
    await page.getByRole('button', { name: 'Offene Empfehlungen neu berechnen' }).click();

    // Die beantwortete Zeile steht noch da …
    await expect(page.getByLabel(`Deutsche Antwort für „${erste}“`)).toHaveValue('meine Antwort');
    // … die übrigen sind andere geworden …
    const nachher = await listedWords(page);
    expect(nachher).not.toEqual(vorher);
    // … und die alten sind wiederfindbar, nicht weg.
    const frueher = page.getByRole('button', { name: /Frühere Empfehlungen/ });
    await expect(frueher).toHaveAttribute('aria-expanded', 'false');
    await frueher.click();
    const zurueck = vorher.find((word) => word !== erste)!;
    await page.getByRole('button', { name: `${zurueck} wieder aufnehmen` }).click();
    await expect(page.getByLabel(`Deutsche Antwort für „${zurueck}“`)).toBeVisible();
  });

  test('@smoke der Stepper führt zurück, ohne die Arbeit zu verlieren', async ({ page }) => {
    await analyze(page);
    await recommend(page, '5');

    const erste = (await listedWords(page))[0]!;
    await page.getByLabel(`Deutsche Antwort für „${erste}“`).fill('meine Antwort');
    await page.getByRole('button', { name: '1 Vokabel prüfen & speichern' }).click();
    await expect(page.getByLabel('Titel', { exact: true })).toBeVisible();

    // Zurück in den zweiten Schritt – alles steht noch so da.
    await page.getByRole('button', { name: 'Schritt 2: Empfehlungen generieren' }).click();
    await expect(page.getByLabel(`Deutsche Antwort für „${erste}“`)).toHaveValue('meine Antwort');

    // Und in den ersten: der Text ist noch da.
    await page.getByRole('button', { name: 'Schritt 1: Text analysieren' }).click();
    await expect(page.getByLabel('Englischer Text')).toHaveValue(TEXT);
  });

  test('@smoke erfindet nichts, wenn der Text weniger hergibt', async ({ page }) => {
    await withoutBrowserModels(page);
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').fill('Coastal erosion threatens the settlement.');
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();
    await recommend(page, '20');

    const words = await listedWords(page);
    expect(words.length).toBeGreaterThan(0);
    expect(words.length).toBeLessThan(20);
  });

  test('@a11y Empfehlungsschritt ohne schwerwiegende Befunde und mit der Tastatur bedienbar', async ({
    page,
  }) => {
    await analyze(page);
    await expectNoSeriousViolations(page, 'Einstellungen vor der Empfehlung');

    const knopf = page.getByRole('button', { name: 'Empfehlungen generieren', exact: true });
    await expect(knopf).toBeEnabled({ timeout: 30_000 });
    await knopf.focus();
    await expect(knopf).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { name: /Vorgeschlagene Vokabeln/ })).toBeVisible();
    await expectNoSeriousViolations(page, 'Empfehlungen');

    // Der Fokus wandert ans Ergebnis, statt oben stehen zu bleiben.
    await expect(page.getByRole('heading', { name: /Vorgeschlagene Vokabeln/ })).toBeFocused();
  });

  test('@a11y der Stepper ist mit der Tastatur bedienbar', async ({ page }) => {
    await analyze(page);
    await recommend(page, '5');

    const erster = page.getByRole('button', { name: 'Schritt 1: Text analysieren' });
    await erster.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Englischer Text')).toBeVisible();
    await expect(erster).toHaveAttribute('aria-current', 'step');
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y Empfehlungen ohne horizontalen Überlauf', async ({ page }) => {
      await analyze(page);
      await recommend(page, '5');

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
