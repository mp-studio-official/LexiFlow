import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 4B.5: Schritt 3 – **Prüfen & Speichern**.
 *
 * Was jsdom nicht beantworten kann und der Browser schon: ob die klebende
 * Leiste wirklich klebt, ob sie die untere Navigation verdeckt, und ob die
 * Stelle, zu der gesprungen wird, danach tatsächlich **sichtbar** ist. Genau
 * daran scheitert eine Fehlermeldung sonst: Sie zeigt hin, und die Leiste
 * steht davor.
 */

const LISTE = ['island\tdie Insel', 'bay\t', 'water\tdas Wasser', 'island\tdie Insel'].join('\n');

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
      elemente: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
}

async function toReview(page: Page, text = LISTE): Promise<void> {
  await page.goto('/#/material/import?quelle=paste');
  await page.getByLabel('Vokabelliste einfügen').fill(text);
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
  await expect(page.getByRole('table')).toBeVisible();
}

test.describe('Prüfen & Speichern', () => {
  test('@smoke die Leiste klebt und es gibt nur eine', async ({ page }) => {
    await toReview(page);

    const leiste = page.locator('.actionbar');
    await expect(leiste).toHaveCount(1);
    await expect(leiste).toBeVisible();

    // Auch ganz unten in einer langen Liste steht sie im Bild.
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(200);
    const box = await leiste.boundingBox();
    const hoehe = page.viewportSize()?.height ?? 0;
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(hoehe + 2);
  });

  test('@smoke ein blockiertes Speichern springt zur Stelle und setzt den Fokus', async ({
    page,
  }) => {
    await toReview(page);

    await page.getByRole('button', { name: /Paket speichern/ }).click();

    const meldung = page.getByRole('alert');
    await expect(meldung).toContainText('Speichern ist noch nicht möglich');
    await expect(meldung).toContainText('Das Paket braucht einen Titel');
    await expect(page.getByLabel('Titel', { exact: true })).toBeFocused();

    /*
      Und die Stelle steht **über** der Leiste, nicht dahinter.

      Das ist der Unterschied zwischen „hingesprungen“ und „hingesprungen und
      sichtbar“. Ohne diese Rechnung landet das Feld auf einem Telefon mit
      eingeblendeter Tastatur zuverlässig hinter der Leiste.
    */
    const feld = await page.getByLabel('Titel', { exact: true }).boundingBox();
    const leiste = await page.locator('.actionbar').boundingBox();
    expect(feld).not.toBeNull();
    expect(leiste).not.toBeNull();
    expect(feld!.y + feld!.height).toBeLessThanOrEqual(leiste!.y + 1);
    expect(feld!.y).toBeGreaterThanOrEqual(0);
  });

  test('@smoke arbeitet die Stellen in der vereinbarten Reihenfolge ab', async ({ page }) => {
    await toReview(page);

    await page.getByLabel('Titel', { exact: true }).fill('Unit 3');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(page.getByLabel('Deutsch, Zeile 2')).toBeFocused();

    await page.getByLabel('Deutsch, Zeile 2').fill('die Bucht');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    const bestaetigen = page.getByRole('button', {
      name: 'Befund zu „island“ als geprüft bestätigen',
    });
    await expect(bestaetigen).toBeFocused();

    // Bestätigt – und jetzt geht es durch.
    await bestaetigen.click();
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Unit 3' })).toBeVisible();
  });

  test('@smoke der Prüfstatus steht nicht im gespeicherten Paket', async ({ page }) => {
    /*
      „Der Prüfstatus ist reine Erstellungsinformation und darf nicht
      Bestandteil des exportierten Lernpakets werden.“ Geprüft wird am
      tatsächlich heruntergeladenen `.vocabpack.json` – die Zusage gilt für
      die Datei, nicht für ein Zwischenmodell.
    */
    await toReview(page);
    await page.getByLabel('Titel', { exact: true }).fill('Unit 3');
    await page.getByLabel('Deutsch, Zeile 2').fill('die Bucht');
    await page
      .getByRole('button', { name: 'Befund zu „island“ als geprüft bestätigen' })
      .click();
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Unit 3' })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Als LexiFlow-Paket herunterladen (.vocabpack.json)' })
      .click();
    const path = await (await downloadPromise).path();
    const fs = await import('node:fs/promises');
    const inhalt = await fs.readFile(path, 'utf8');

    expect(inhalt).not.toContain('reviewConfirmedFor');
    expect(inhalt).not.toContain('formNeedsReview');
    expect(inhalt).not.toContain('issues');
  });

  test('@a11y Schritt 3 ohne schwerwiegende Befunde – ruhig und blockiert', async ({ page }) => {
    await toReview(page);
    await expectNoSeriousViolations(page, 'Prüfen & Speichern');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expectNoSeriousViolations(page, 'Prüfen & Speichern, blockiert');
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y die Leiste verdeckt die untere Navigation nicht', async ({ page }) => {
      await toReview(page);

      const leiste = await page.locator('.actionbar').boundingBox();
      // Unter 62 rem ist die Bereichsnavigation die untere Leiste – dieselbe,
      // hinter der der Speichern-Knopf verschwände, wenn niemand rechnete.
      const navigation = await page.locator('.bottom-nav').boundingBox();
      expect(leiste).not.toBeNull();
      expect(navigation).not.toBeNull();
      // Die Leiste endet, wo die Navigation anfängt – keine Überschneidung.
      expect(leiste!.y + leiste!.height).toBeLessThanOrEqual(navigation!.y + 1);
    });

    test('@a11y kein horizontaler Überlauf', async ({ page }) => {
      await toReview(page);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  });

  test.describe('Mit eingeblendeter Tastatur', () => {
    /*
      390 × 420: die realistische Resthöhe, wenn auf einem Telefon die Tastatur
      offen steht. Hier entscheidet sich, ob die Leiste ein Werkzeug oder ein
      Vorhang ist.
    */
    test.use({ viewport: { width: 390, height: 420 } });

    test('@a11y die Stelle bleibt über der Leiste sichtbar', async ({ page }) => {
      await toReview(page);
      await page.getByRole('button', { name: /Paket speichern/ }).click();
      await expect(page.getByLabel('Titel', { exact: true })).toBeFocused();
      await page.waitForTimeout(500);

      const feld = await page.getByLabel('Titel', { exact: true }).boundingBox();
      const leiste = await page.locator('.actionbar').boundingBox();
      expect(feld).not.toBeNull();
      expect(leiste).not.toBeNull();
      expect(feld!.y).toBeGreaterThanOrEqual(0);
      expect(feld!.y + feld!.height).toBeLessThanOrEqual(leiste!.y + 1);
    });

    test('@a11y die Leiste nimmt höchstens die halbe Höhe ein', async ({ page }) => {
      await toReview(page);
      await page.getByRole('button', { name: /Paket speichern/ }).click();
      await expect(page.getByRole('alert')).toBeVisible();

      const leiste = await page.locator('.actionbar').boundingBox();
      expect(leiste).not.toBeNull();
      expect(leiste!.height).toBeLessThanOrEqual(420 * 0.5);
    });
  });
});
