import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 4B.2 Phase 4: „Prüfen & Speichern“ und die Weitergabe.
 *
 * Drei Dinge, die sich nur im echten Browser zeigen:
 *
 * 1. Ob das Beschreibungsfeld wirklich **wächst**. In jsdom gibt es kein
 *    Layout; dort ist `scrollHeight` immer 0, und ein Test darauf würde eine
 *    Zahl prüfen, die im Browser ganz anders ausfällt.
 * 2. Ob die Übersichtszeile hält, was sie verspricht – Englisch über Deutsch,
 *    ein kurzer Status, der Grund darunter.
 * 3. Ob die drei Wege der Weitergabe dort stehen, wo man nach dem Speichern
 *    hinsieht: unter dem Satz, der sie erklärt.
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

const LISTE = [
  'crowded\tüberfüllt',
  'neighbourhood\tNachbarschaft',
  'to apologise\tsich entschuldigen',
].join('\n');

/** Bis in den Prüfschritt: Liste einfügen, Vorschau öffnen. */
async function toReview(page: Page): Promise<void> {
  await page.goto('/#/material/import');
  await page.getByLabel('Vokabelliste einfügen').fill(LISTE);
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
  await expect(page.getByRole('table')).toBeVisible();
}

/** … und weiter bis auf die gespeicherte Paketseite. */
async function toPack(page: Page, title = 'Unit 3 – City life'): Promise<void> {
  await toReview(page);
  await page.getByLabel('Titel', { exact: true }).fill(title);
  await page.getByLabel('Jahrgang').selectOption('8');
  await page.getByRole('button', { name: /Paket speichern/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

test.describe('Das Beschreibungsfeld wächst mit', () => {
  test('beginnt einzeilig und wird höher, wenn der Text länger wird', async ({ page }) => {
    await toReview(page);

    const feld = page.getByLabel('Beschreibung (optional)');
    await expect(feld).toHaveAttribute('rows', '1');
    const leer = (await feld.boundingBox())!.height;

    await feld.fill(
      'Diese Liste gehört zu Unit 3 und übt vor allem die Wörter rund um das Leben in der Stadt. ' +
        'Achtet besonders auf die Schreibung von „neighbourhood“ und darauf, dass „to apologise“ ' +
        'im britischen Englisch mit s geschrieben wird.',
    );
    const voll = (await feld.boundingBox())!.height;
    expect(voll).toBeGreaterThan(leer);

    // Und wieder zurück: Das Feld schrumpft, wenn der Text weg ist.
    await feld.fill('');
    expect((await feld.boundingBox())!.height).toBeCloseTo(leer, 0);
  });

  test('hat keinen Ziehgriff, der nichts bewirkt', async ({ page }) => {
    /*
      Ein Ziehgriff würde die gemessene Höhe beim nächsten Tastendruck wieder
      überschreiben – ein Bedienelement, das nichts bewirkt, ist schlimmer als
      keines.
    */
    await toReview(page);
    const feld = page.getByLabel('Beschreibung (optional)');
    expect(await feld.evaluate((node) => getComputedStyle(node).resize)).toBe('none');
  });
});

test.describe('Die Übersichtszeile', () => {
  test('stellt Englisch über Deutsch', async ({ page }) => {
    await toReview(page);

    const englisch = await page.getByLabel('Englisch, Zeile 1').boundingBox();
    const deutsch = await page.getByLabel('Deutsch, Zeile 1').boundingBox();

    expect(deutsch!.y).toBeGreaterThan(englisch!.y);
    // Gleiche linke Kante: eine Spalte, nicht zwei.
    expect(Math.abs(deutsch!.x - englisch!.x)).toBeLessThan(2);
  });

  test('sagt den Status kurz und den Grund am Feld', async ({ page }) => {
    await toReview(page);
    await expect(page.getByText('OK').first()).toBeVisible();

    // Eine Zeile ohne deutsche Antwort ist „Bitte prüfen“ – kein „Fehler“.
    await page.getByLabel('Deutsch, Zeile 1').fill('');
    await expect(page.getByText('Bitte prüfen').first()).toBeVisible();
    // Kein Etikett „Fehler“ mehr in der Tabelle – der Status sagt „Bitte prüfen“.
    await expect(page.getByRole('table').getByText('Fehler', { exact: true })).toHaveCount(0);
  });

  test('zeigt den Beispielsatz erst auf Klick, dann über die volle Breite', async ({ page }) => {
    await toReview(page);

    const knopf = page.getByRole('button', { name: 'Beispielsatz für crowded anzeigen' });
    await expect(knopf).toHaveText('Beispielsatz anzeigen (0)');
    await expect(knopf).toHaveAttribute('aria-expanded', 'false');

    await knopf.click();

    const details = page.locator('.details');
    await expect(details).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Beispielsatz für crowded ausblenden' }),
    ).toHaveText('Beispielsatz ausblenden');

    // Volle Breite heißt: so breit wie die Tabelle selbst.
    const tabelle = (await page.getByRole('table').boundingBox())!;
    const bereich = (await details.boundingBox())!;
    expect(bereich.width).toBeGreaterThan(tabelle.width * 0.8);
  });
});

test.describe('Weitergeben an die Lerngruppe', () => {
  test('bietet die drei Wege direkt unter dem Satz an, der sie erklärt', async ({ page }) => {
    await toPack(page);

    const karte = page.locator('.card', { hasText: 'Weitergeben an die Lerngruppe' }).first();
    await expect(karte).toBeVisible();

    await expect(
      karte.getByRole('button', { name: 'Als Lerndatei herunterladen (.html)' }),
    ).toBeVisible();
    await expect(
      karte.getByRole('button', { name: 'Als LexiFlow-Paket herunterladen (.vocabpack.json)' }),
    ).toBeVisible();
    await expect(karte.getByRole('link', { name: 'Im Lernbereich ansehen' })).toBeVisible();

    // Und der gefährliche Knopf steht **nicht** dabei.
    await expect(karte.getByRole('button', { name: 'Paket löschen' })).toHaveCount(0);
  });

  test('lädt das LexiFlow-Paket wirklich herunter', async ({ page }) => {
    await toPack(page);

    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Als LexiFlow-Paket herunterladen (.vocabpack.json)' })
      .click();
    expect((await download).suggestedFilename()).toMatch(/\.vocabpack\.json$/);
  });

  test('führt „Im Lernbereich ansehen“ in den Lernbereich', async ({ page }) => {
    await toPack(page);
    await page.getByRole('link', { name: 'Im Lernbereich ansehen' }).click();
    await expect(page.getByRole('button', { name: 'Lernrunde starten' })).toBeVisible();
  });

  test('@a11y Prüfschritt und Paketseite ohne schwerwiegende Befunde', async ({ page }) => {
    await toReview(page);
    await expectNoSeriousViolations(page, 'Prüfen & Speichern');

    await page.getByLabel('Titel', { exact: true }).fill('Unit 3 – City life');
    await page.getByLabel('Jahrgang').selectOption('8');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Unit 3 – City life' })).toBeVisible();
    await expectNoSeriousViolations(page, 'Paketseite mit Weitergabe');
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 780 } });

    test('@a11y kein horizontaler Überlauf auf der Paketseite', async ({ page }) => {
      await toPack(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
});
