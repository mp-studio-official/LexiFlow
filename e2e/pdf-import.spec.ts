import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 4B.2: PDF-Import und gegliederte Listen im **normalen** Build.
 *
 * Der Unterschied zur portablen Suite ist nicht kosmetisch: Hier wird pdf.js
 * als eigener Chunk über HTTP nachgeladen (Codesplitting), dort steckt es in
 * einer einzigen Datei. Beide Wege müssen zum selben Ergebnis führen, und nur
 * einer davon lässt sich am anderen mitprüfen.
 *
 * Was hier zusätzlich geprüft wird und in der portablen Suite nicht: dass die
 * Ansicht **bedienbar** ist – Tastatur, Beschriftungen, keine schweren
 * Verstöße nach WCAG.
 */

const FIXTURES = resolve(import.meta.dirname, '../src/import/fixtures');

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
 * Genau die Form, die aus einem Vokabelanhang herausfällt.
 *
 * Aufzählungspunkte, Wortartkürzel in Klammern, „translation:“ und
 * „context/example:“ – und in der zweiten Übersetzung ein **Komma**, das ein
 * Komma bleiben muss.
 */
const GEGLIEDERT = [
  'Unit 7 – Vokabelanhang',
  'Seite 143',
  '',
  '• to coin a phrase / term (v.)',
  '  context/example: The term was coined in 1990.',
  '  translation: eine Wendung prägen',
  '',
  '• crowded (adj.)',
  '  translation: überfüllt, voll',
].join('\n');

test.describe('Eine PDF als Importquelle', () => {
  test('liest eine echte PDF und führt sie bis ins gespeicherte Paket', async ({ page }) => {
    await page.goto('/#/material/import?quelle=pdf');

    const chooser = page.getByLabel('PDF-Datei auswählen');
    await expect(chooser).toBeAttached();
    await expect(page.getByText(/nichts wird hochgeladen/)).toBeVisible();

    await chooser.setInputFiles(resolve(FIXTURES, 'text-sample.pdf'));

    const preview = page.getByLabel('Erkannter Text');
    await expect(preview).toBeVisible({ timeout: 30_000 });
    await expect(preview).toHaveValue(/to coin a phrase \/ term/);

    await expectNoSeriousViolations(page, 'PDF-Vorschau');

    // Die Vorschau ist bearbeitbar – hier fliegt die Kopfzeile raus.
    await preview.fill(
      ['to coin a phrase / term (v.)', 'translation: einen Begriff praegen'].join('\n'),
    );
    await page.getByRole('button', { name: 'Text übernehmen' }).click();

    await expect(page.getByLabel('Englisch, Zeile 1')).toHaveValue('to coin a phrase / term');
    await expect(page.getByLabel('Deutsch, Zeile 1')).toHaveValue('einen Begriff praegen');

    await page.getByLabel('Titel', { exact: true }).fill('Unit 7 – aus einer PDF');
    await page.getByLabel('Jahrgang').selectOption('9');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Unit 7 – aus einer PDF' }),
    ).toBeVisible();
  });

  test('lehnt eine gescannte PDF ehrlich ab', async ({ page }) => {
    await page.goto('/#/material/import?quelle=pdf');
    await page
      .getByLabel('PDF-Datei auswählen')
      .setInputFiles(resolve(FIXTURES, 'scanned-sample.pdf'));

    await expect(page.getByText(/kein auswählbarer Text/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/OCR/)).toBeVisible();
    await expect(page.getByLabel('Erkannter Text')).toHaveCount(0);

    // Die Meldung ist eine Meldung, kein Fehlerbild – und der Weg bleibt offen.
    await expect(page.getByLabel('PDF-Datei auswählen')).toBeAttached();
    await expectNoSeriousViolations(page, 'gescannte PDF abgelehnt');
  });

  test('ist mit der Tastatur erreichbar', async ({ page }) => {
    await page.goto('/#/material/import?quelle=pdf');
    await expect(page.getByRole('button', { name: 'PDF auswählen' })).toBeVisible();

    // Der sichtbare Knopf ist ein echter Knopf, kein angeklickter Kasten.
    await page.getByRole('button', { name: 'PDF auswählen' }).focus();
    await expect(page.getByRole('button', { name: 'PDF auswählen' })).toBeFocused();
  });
});

test.describe('Eine gegliederte Liste beim Einfügen', () => {
  test('erkennt Gliederung, Wortart und Beispielsatz – und schützt das Komma', async ({ page }) => {
    await page.goto('/#/material/import');
    await page.getByLabel('Vokabelliste einfügen').fill(GEGLIEDERT);
    await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();

    await expect(page.getByLabel('Englisch, Zeile 1')).toHaveValue('to coin a phrase / term');
    await expect(page.getByLabel('Deutsch, Zeile 1')).toHaveValue('eine Wendung prägen');
    await expect(page.getByLabel('Englisch, Zeile 2')).toHaveValue('crowded');
    /*
      Die Zusage aus Phase 1 am ganzen Weg: „überfüllt, voll“ ist **eine**
      Antwort. Getrennt wird ausschließlich am Semikolon.
    */
    await expect(page.getByLabel('Deutsch, Zeile 2')).toHaveValue('überfüllt, voll');
  });

  test('benennt die Zeilen, die es nicht zuordnen konnte', async ({ page }) => {
    await page.goto('/#/material/import');
    await page.getByLabel('Vokabelliste einfügen').fill(GEGLIEDERT);
    await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();

    // Kopfzeile und Seitenzahl gehören in keine Vokabel – und verschwinden
    // trotzdem nicht stillschweigend.
    await expect(page.getByRole('listitem').filter({ hasText: 'Seite 143' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Unit 7' })).toBeVisible();
  });

  test('lässt die einfache Tabulatorliste unverändert funktionieren', async ({ page }) => {
    await page.goto('/#/material/import');
    await page
      .getByLabel('Vokabelliste einfügen')
      .fill('to apologise\tsich entschuldigen\ncrowded\tvoll, überfüllt');
    await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();

    await expect(page.getByLabel('Englisch, Zeile 1')).toHaveValue('to apologise');
    await expect(page.getByLabel('Deutsch, Zeile 2')).toHaveValue('voll, überfüllt');
  });
});
