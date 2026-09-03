import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 4B.3, Block B: die Vokabelliste im Browser.
 *
 * Drei Dinge zeigen sich nur hier und in keinem Komponententest:
 *
 * 1. Ob der Ausdruck im **Druckmedium** wirklich das tut, was das Stylesheet
 *    verspricht – jsdom rechnet kein Seitenlayout, und `print.test.ts` kann
 *    nur prüfen, dass die Regeln dastehen.
 * 2. Ob die heruntergeladene `.csv` den Inhalt hat, den sie haben soll.
 * 3. Ob die Liste in **beiden** Bereichen erreichbar ist – und im Lernbereich
 *    erreichbar, ohne die Lernwege zu verdrängen.
 */

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

const LISTE = [
  'to depend on sb./sth.\tvon jdm./etw. abhängen',
  'restraints (pl.)\tdie Beschränkungen; die Auflagen',
  'attainable (adj.)\terreichbar',
  'to coin a phrase / term\teinen Begriff, eine Redewendung prägen',
].join('\n');

async function makePack(page: Page): Promise<string> {
  await page.goto('/#/material/import');
  await page.getByLabel('Vokabelliste einfügen').fill(LISTE);
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
  await page.getByLabel('Titel', { exact: true }).fill('Unit 7 – Coastal erosion');
  await page.getByLabel('Jahrgang').selectOption('9');
  await page.getByRole('button', { name: /Paket speichern/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Unit 7 – Coastal erosion' })).toBeVisible();
  return new URL(page.url()).hash.split('/')[2] ?? '';
}

test.describe('Vokabelliste', () => {
  test('@smoke der Weg aus dem Paket auf das Blatt', async ({ page }) => {
    await makePack(page);

    await page.getByRole('link', { name: 'Vokabelliste drucken / als PDF speichern' }).click();
    await expect(page.getByRole('table')).toBeVisible();

    // Die vollständigen Lernformen und die Übersetzungen stehen in der Tabelle.
    const tabelle = page.getByRole('table');
    await expect(tabelle).toContainText('to depend on sb./sth.');
    await expect(tabelle).toContainText('von jdm./etw. abhängen');
    await expect(tabelle).toContainText('restraints (pl.)');
    await expect(tabelle).toContainText('die Beschränkungen; die Auflagen');
    await expect(tabelle).toContainText('attainable (adj.)');
    await expect(tabelle).toContainText('to coin a phrase / term');

    // Und der Kopf sagt, worum es geht.
    await expect(page.getByRole('heading', { name: 'Unit 7 – Coastal erosion' })).toBeVisible();
    await expect(page.getByText(/4 Vokabeln · Klasse 9/)).toBeVisible();
  });

  test('@smoke lädt die Tabelle als .csv mit dem erwarteten Inhalt', async ({ page }) => {
    const id = await makePack(page);
    await page.goto(`/#/material/${id}/liste`);
    await expect(page.getByRole('table')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Als Tabelle herunterladen (.csv)' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('unit-7-coastal-erosion-9-vokabelliste.csv');

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);

    // Das Byte-Order-Mark steht wirklich am Anfang der **Bytes**, nicht nur
    // im String: Genau daran scheitert Excel unter Windows sonst.
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));

    const text = bytes.toString('utf8');
    expect(text).toContain('"Englisch";"Deutsch";"Wortart"');
    expect(text).toContain('"to depend on sb./sth."');
    // Das Komma in einer Bedeutung überlebt, das Semikolon trennt sie.
    expect(text).toContain('"einen Begriff, eine Redewendung prägen"');
    expect(text).toContain('"die Beschränkungen; die Auflagen"');
    expect(text).toContain('"Klasse 9"');
  });

  test('@smoke im Druck bleibt nur das Blatt', async ({ page }) => {
    const id = await makePack(page);
    await page.goto(`/#/material/${id}/liste`);
    await expect(page.getByRole('table')).toBeVisible();

    await page.emulateMedia({ media: 'print' });

    const gemessen = await page.evaluate(() => {
      const cell = document.querySelector('.sheet .sheet__table tbody td') as HTMLElement;
      const head = document.querySelector('.sheet .sheet__table thead') as HTMLElement;
      const row = document.querySelector('.sheet .sheet__table tbody tr') as HTMLElement;
      const nav = document.querySelector('.app-nav') as HTMLElement;
      const tools = document.querySelector('.print-hidden') as HTMLElement;
      return {
        kopfWiederholt: getComputedStyle(head).display,
        zeileBleibtGanz: getComputedStyle(row).breakInside,
        navigation: getComputedStyle(nav).display,
        werkzeuge: getComputedStyle(tools).display,
        linienfarbe: getComputedStyle(cell).borderBottomColor,
        linienbreite: getComputedStyle(cell).borderBottomWidth,
      };
    });

    // Der Tabellenkopf wiederholt sich auf jeder Seite – sonst rät, wer
    // Seite 3 in der Hand hält, welche Spalte welche ist.
    expect(gemessen.kopfWiederholt).toBe('table-header-group');
    expect(gemessen.zeileBleibtGanz).toBe('avoid');

    // Nichts Bedienbares auf dem Papier.
    expect(gemessen.navigation).toBe('none');
    expect(gemessen.werkzeuge).toBe('none');

    /*
      Und die Linie ist grau, nicht sandfarben: Weiter oben im Stylesheet steht
      eine Regel für die Entwurfstabelle, die jede Tabelle trifft und genug
      Gewicht hat, um eine Klasse zu schlagen. Diese Messung ist der Wächter
      darüber, dass die Vokabelliste ihr entkommt.
    */
    expect(gemessen.linienfarbe).toBe('rgb(153, 153, 153)');
    expect(gemessen.linienbreite).toBe('1px');

    await page.emulateMedia({ media: 'screen' });
  });

  test('@smoke die Einstellungen wirken auf Blatt und Datei', async ({ page }) => {
    const id = await makePack(page);
    await page.goto(`/#/material/${id}/liste`);
    await expect(page.getByRole('table')).toBeVisible();

    await page.getByLabel(/Reihenfolge/).selectOption('alphabetical');
    const ersteZelle = page.locator('.sheet__table tbody tr').first().locator('td').first();
    await expect(ersteZelle).toHaveText('attainable (adj.)');

    await page.getByLabel(/Zeilenhöhe/).selectOption('roomy');
    await expect(page.locator('.sheet')).toHaveAttribute('data-density', 'roomy');
  });

  test('@smoke im Lernbereich erreichbar, ohne die Lernwege zu verdrängen', async ({ page }) => {
    const id = await makePack(page);
    await page.goto(`/#/lernen/${id}`);

    /*
      Die Liste ist kein fünfter Lernweg. Sie steht als ruhige Zeile unter den
      vier Wegen – erreichbar, aber nicht so groß wie „Mit Karten lernen“.

      Seit 4B.6 sind die vier Wege Bildkarten (`.mode-card`); die Liste hat
      bewusst keine bekommen.
    */
    const wege = page.locator('.mode-card');
    await expect(wege).toHaveCount(4);

    const liste = page.getByRole('link', { name: 'Vokabelliste' });
    await expect(liste).toBeVisible();
    await liste.click();

    await expect(page.getByRole('table')).toContainText('to depend on sb./sth.');
    await expect(
      page.getByRole('button', { name: 'Als Tabelle herunterladen (.csv)' }),
    ).toBeVisible();
  });

  test('@a11y die Vokabelliste ohne schwerwiegende Befunde', async ({ page }) => {
    const id = await makePack(page);
    await page.goto(`/#/material/${id}/liste`);
    await expect(page.getByRole('table')).toBeVisible();

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

    test('@a11y die Tabelle sprengt das Fenster nicht', async ({ page }) => {
      const id = await makePack(page);
      await page.goto(`/#/material/${id}/liste`);
      await expect(page.getByRole('table')).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
});
