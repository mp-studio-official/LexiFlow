import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 4B.7: Lernbereiche im Lehrkraftbereich.
 *
 * Der vollständige Weg – anlegen, ausgeben, per `file://` öffnen – steht in
 * `e2e-portable/portable.spec.ts`; nur dort gibt es die Schülerlaufzeit, die
 * in die Datei kommt.
 *
 * Hier geht es um das, was sich nur im echten Browser zeigt: dass die beiden
 * Listen mit der **Tastatur** bedienbar sind, dass die Seite auf einem Telefon
 * nicht seitlich ausbricht, und dass sie keine schwerwiegenden Befunde hat.
 */

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

const LISTE = ['erosion\tdie Erosion', 'tide\tdie Flut'].join('\n');
const LISTE_ZWEI = ['cliff\tdie Klippe'].join('\n');

async function makePack(page: Page, title: string, list: string): Promise<void> {
  await page.goto('/#/material/import');
  await page.getByLabel('Vokabelliste einfügen').fill(list);
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
  await page.getByLabel('Titel', { exact: true }).fill(title);
  await page.getByLabel('Jahrgang').selectOption('9');
  await page.getByRole('button', { name: /Paket speichern/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/** Zwei Pakete anlegen und den leeren Lernbereich öffnen. */
async function openPicker(page: Page): Promise<void> {
  await makePack(page, 'Unit 7 – Coastal erosion', LISTE);
  await makePack(page, 'Unit 8 – At the coast', LISTE_ZWEI);

  await page.goto('/#/material');
  await page.getByRole('link', { name: 'Lernbereich anlegen' }).click();
  await expect(page.getByRole('heading', { name: 'Neuer Lernbereich' })).toBeVisible();
  // Die Bibliothek kommt aus der Datenbank – erst warten, dann klicken.
  await expect(page.locator('ul.area-list .area-item')).toHaveCount(2);
}

/** „Hinzufügen“ in der Zeile eines bestimmten Pakets. */
function addButton(page: Page, title: string) {
  return page
    .locator('ul.area-list .area-item', { hasText: title })
    .getByRole('button', { name: 'Hinzufügen' });
}

test.describe('Lernbereich zusammenstellen', () => {
  test('@smoke der Weg vom Material in den Lernbereich', async ({ page }) => {
    await openPicker(page);

    await addButton(page, 'Unit 7 – Coastal erosion').click();
    await addButton(page, 'Unit 8 – At the coast').click();

    const gewaehlt = page.locator('ol.area-list .area-item');
    await expect(gewaehlt).toHaveCount(2);
    await expect(gewaehlt.nth(0)).toContainText('Unit 7 – Coastal erosion');
    await expect(gewaehlt.nth(1)).toContainText('Unit 8 – At the coast');

    // Die rechte Liste ist leer – jedes Paket steht genau einmal.
    await expect(page.locator('ul.area-list .area-item')).toHaveCount(0);
  });

  test('@smoke die Reihenfolge lässt sich umstellen und überlebt das Speichern', async ({
    page,
  }) => {
    await openPicker(page);
    await page.getByLabel('Titel').fill('Englisch 9b – Halbjahr 1');
    await addButton(page, 'Unit 7 – Coastal erosion').click();
    await addButton(page, 'Unit 8 – At the coast').click();

    await page.getByRole('button', { name: 'Unit 8 – At the coast nach oben' }).click();
    await expect(page.locator('ol.area-list .area-item').nth(0)).toContainText(
      'Unit 8 – At the coast',
    );

    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Lernbereich gespeichert.')).toBeVisible();

    /*
      Über die Materialseite zurück und wieder hinein: Das ist der Weg, den
      eine Lehrkraft nach den Ferien geht – und der Punkt, an dem eine
      verlorene Reihenfolge auffiele.
    */
    await page.goto('/#/material');
    await page
      .locator('.area-item', { hasText: 'Englisch 9b – Halbjahr 1' })
      .getByRole('link', { name: 'Öffnen' })
      .click();

    await expect(page.getByRole('heading', { name: 'Lernbereich bearbeiten' })).toBeVisible();
    await expect(page.locator('ol.area-list .area-item').nth(0)).toContainText(
      'Unit 8 – At the coast',
    );
  });

  test('@smoke sagt im Web-Build, wo die Datei entsteht', async ({ page }) => {
    /*
      Die Schülerlaufzeit steckt nur in der portablen Lehrkraftdatei. Ein Knopf,
      der hier still nichts täte, wäre schlimmer als einer, der den Grund nennt.
    */
    await openPicker(page);
    await page.getByLabel('Titel').fill('Englisch 9b');
    await addButton(page, 'Unit 7 – Coastal erosion').click();
    await page.getByRole('button', { name: /Lerndatei erzeugen/ }).click();

    await expect(page.getByText(/LexiFlow-Lehrkraft\.html/)).toBeVisible();
  });

  test('@a11y mit der Tastatur bedienbar', async ({ page }) => {
    /*
      Die Reihenfolge wird mit Pfeilknöpfen gestellt und nicht mit einer
      Ziehgeste – genau damit dieser Test möglich ist. Ziehen ist mit der
      Tastatur nicht bedienbar, und eine Reihenfolge, die nur mit der Maus
      entsteht, ist für einen Teil der Lehrkräfte keine.
    */
    await openPicker(page);
    await addButton(page, 'Unit 7 – Coastal erosion').click();
    await addButton(page, 'Unit 8 – At the coast').click();

    const hoch = page.getByRole('button', { name: 'Unit 8 – At the coast nach oben' });
    await hoch.focus();
    await expect(hoch).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.locator('ol.area-list .area-item').nth(0)).toContainText(
      'Unit 8 – At the coast',
    );

    // Der Pfeil nach oben ist an der ersten Position gesperrt – nichts rutscht raus.
    await expect(
      page.getByRole('button', { name: 'Unit 8 – At the coast nach oben' }),
    ).toBeDisabled();
  });

  test('@a11y ohne schwerwiegende Befunde', async ({ page }) => {
    await openPicker(page);
    await page.getByLabel('Titel').fill('Englisch 9b');
    await addButton(page, 'Unit 7 – Coastal erosion').click();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    expect(
      results.violations
        .filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ''))
        .map((violation) => ({ regel: violation.id, wirkung: violation.impact })),
    ).toEqual([]);
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y die beiden Listen sprengen das Fenster nicht', async ({ page }) => {
      /*
        Auf einem Telefon stehen sie untereinander, und zwar Auswahl zuerst:
        Wer dort ein Paket hinzufügt, will sehen, wo es gelandet ist.
      */
      await openPicker(page);
      await addButton(page, 'Unit 7 – Coastal erosion').click();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
});
