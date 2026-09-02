import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 4B.2 Phase 3: Der Empfehlungsschritt, kompakt.
 *
 * Was hier geprüft wird, ist der Unterschied zwischen **aufgeräumt** und
 * **versteckt**. Aufgeräumt heißt: Die Karte trägt das Nötige, alles Weitere
 * liegt hinter einem benannten Aufklapper, und der ist mit der Tastatur
 * erreichbar. Versteckt hieße: Es ist weg und niemand merkt es.
 *
 * Der zweite Gegenstand ist die Sichtbarkeit ohne Farbe. „Übernommen“ gegen
 * „offen“ steht als Zeichen **und** als Wort da; wer keine Farben
 * unterscheidet, liest dasselbe.
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

const TEXT = [
  'Coastal erosion threatens the settlement, and the evacuation of residents',
  'demonstrates the resilience of the local infrastructure in a way that nobody',
  'who lives along this shoreline had expected before the storms of last winter.',
  'Erosion and evacuation were discussed at length by the council.',
].join(' ');

async function recommend(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined });
    Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: undefined });
  });
  await page.goto('/#/material/import?quelle=text');
  await page.getByLabel('Englischer Text').fill(TEXT);
  await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();

  // `exact` ist hier nötig: Ohne das trifft der Name auch den Stepper-Knopf
  // „Schritt 2: Empfehlungen generieren“.
  const knopf = page.getByRole('button', { name: 'Empfehlungen generieren', exact: true });
  await expect(knopf).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel('Anzahl').selectOption('5');
  await knopf.click();
  await expect(page.getByRole('heading', { name: /Vorgeschlagene Vokabeln/ })).toBeVisible();
}

test.describe('Der Empfehlungsschritt ist kompakt', () => {
  test('zeigt die Hinweise erst unter den Ergebnissen und zugeklappt', async ({ page }) => {
    await recommend(page);

    const woher = page.getByRole('button', { name: /Woher die Vorschläge kommen/ });
    const modell = page.getByRole('button', { name: /Übersetzungsvorschläge aus dem Sprachmodell/ });

    await expect(woher).toHaveAttribute('aria-expanded', 'false');
    await expect(modell).toHaveAttribute('aria-expanded', 'false');
    // Zu heißt zu – der Text steht nicht im Dokument.
    await expect(page.getByText(/funktioniert auch in Safari/)).toHaveCount(0);

    /*
      Die Reihenfolge im Dokument ist der Punkt: Vor 4B.2 stand dieser Text
      **über** den Ergebnissen und schob sie aus dem Bild.
    */
    const positions = await page.evaluate(() => {
      const ergebnis = document.querySelector('#ergebnis-heading');
      const knoepfe = [...document.querySelectorAll('.disclosure__summary')].filter((node) =>
        (node.textContent ?? '').includes('Woher die Vorschläge kommen'),
      );
      const hinweis = knoepfe[0];
      if (!ergebnis || !hinweis) return null;
      return ergebnis.compareDocumentPosition(hinweis) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : 0;
    });
    expect(positions, 'Hinweis steht hinter der Ergebnisüberschrift').toBe(1);

    await woher.click();
    await expect(page.getByText(/funktioniert auch in Safari/)).toBeVisible();
  });

  test('sagt den Zustand mit Zeichen und Wort', async ({ page }) => {
    await recommend(page);

    const erste = page.locator('li.candidate').first();
    await expect(erste.locator('.candidate__state')).toHaveAttribute('data-state', 'open');
    await expect(erste.locator('.candidate__state')).toContainText('noch offen');

    const wort = (await erste.locator('.candidate__word').textContent()) ?? '';
    await page.getByLabel(`Deutsche Antwort für „${wort}“`).fill('eine Antwort');

    await expect(erste.locator('.candidate__state')).toHaveAttribute('data-state', 'taken');
    await expect(erste.locator('.candidate__state')).toContainText('wird übernommen');
  });

  test('legt die Formen hinter einen benannten Aufklapper – erreichbar mit der Tastatur', async ({
    page,
  }) => {
    await recommend(page);

    const erste = page.locator('li.candidate').first();
    const formen = erste.getByRole('button', { name: 'Formen im Text und Herkunft' });
    await expect(formen).toHaveAttribute('aria-expanded', 'false');

    await formen.focus();
    await page.keyboard.press('Enter');
    await expect(formen).toHaveAttribute('aria-expanded', 'true');
    await expect(erste.getByText(/Im Text:/)).toBeVisible();
  });

  test('kürzt einen langen Originalsatz und zeigt ihn auf Klick ganz', async ({ page }) => {
    /*
      Geprüft wird der Zustand, nicht die Pixelhöhe: Ob zwei Zeilen für einen
      Satz reichen, hängt an Fensterbreite und Schriftgröße – auf einem breiten
      Bildschirm ist derselbe Satz einzeilig. Was in jeder Breite gilt: Der
      Knopf schaltet die Kürzung ab und wieder an, und er sagt das über
      `aria-expanded`.
    */
    await recommend(page);

    /*
      Innerhalb **einer** Karte arbeiten. Ein `.first()` auf den Knopf würde
      nach dem Klick auf die nächste Karte weiterspringen – der Knopf dieser
      Karte heißt dann ja „Satz kürzen“.
    */
    const index = await page
      .locator('li.candidate')
      .evaluateAll((nodes) =>
        nodes.findIndex((node) => node.querySelector('.candidate__more') !== null),
      );
    expect(index, 'eine Karte mit langem Satz').toBeGreaterThanOrEqual(0);
    // Feste Position statt Filter: Der Filter wanderte nach dem Klick weiter,
    // weil der Knopf dieser Karte dann „Satz kürzen“ heißt.
    const karte = page.locator('li.candidate').nth(index);
    const knopf = karte.getByRole('button', { name: /Ganzen Satz zeigen/ });
    await expect(knopf).toHaveAttribute('aria-expanded', 'false');

    const satz = karte.locator('.candidate__sentence');
    await expect(satz).toHaveAttribute('data-clamped', '');
    // Die Kürzung kommt von CSS und ist wirklich aktiv.
    expect(await satz.evaluate((node) => getComputedStyle(node).webkitLineClamp)).toBe('2');

    await knopf.click();
    await expect(satz).not.toHaveAttribute('data-clamped', '');
    await expect(karte.getByRole('button', { name: 'Satz kürzen' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await karte.getByRole('button', { name: 'Satz kürzen' }).click();
    await expect(satz).toHaveAttribute('data-clamped', '');
  });

  test('bietet die Wörterbuchbedeutungen als echte Schaltflächen an', async ({ page }) => {
    await recommend(page);

    const chip = page.locator('.dictionary__chips .chip').first();
    await expect(chip).toBeVisible();

    // Eine Schaltfläche, kein Link – und ohne Unterstrich, der einen Ortswechsel verspräche.
    expect(await chip.evaluate((node) => node.tagName)).toBe('BUTTON');
    expect(await chip.evaluate((node) => getComputedStyle(node).textDecorationLine)).toBe('none');
    // Ein Ziel, das man auf einem Telefon trifft.
    const box = await chip.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(30);
  });

  test('trägt eine gewählte Bedeutung samt Wortart ein', async ({ page }) => {
    await recommend(page);

    const karte = page.locator('li.candidate').filter({ has: page.locator('.chip') }).first();
    const wort = (await karte.locator('.candidate__word').textContent()) ?? '';
    const wortart = page.getByLabel(`Wortart für „${wort}“`);
    const vorher = await wortart.inputValue();

    await karte.locator('.dictionary__chips .chip').first().click();

    await expect(page.getByLabel(`Deutsche Antwort für „${wort}“`)).not.toHaveValue('');
    // Die Wortart ist danach gesetzt – vorher gesetzte wird nicht überschrieben.
    const nachher = await wortart.inputValue();
    expect(vorher === '' ? nachher !== '' : nachher === vorher).toBe(true);
  });

  test('@a11y bleibt ohne schwerwiegende Befunde – zu und aufgeklappt', async ({ page }) => {
    await recommend(page);
    await expectNoSeriousViolations(page, 'Empfehlungen kompakt, zugeklappt');

    await page.getByRole('button', { name: /Woher die Vorschläge kommen/ }).click();
    await page.getByRole('button', { name: /Alle Bedeutungen anzeigen|Weitere Bedeutungen anzeigen/ })
      .first()
      .click();
    await expectNoSeriousViolations(page, 'Empfehlungen kompakt, aufgeklappt');
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 780 } });

    test('@a11y kein horizontaler Überlauf', async ({ page }) => {
      await recommend(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
});
