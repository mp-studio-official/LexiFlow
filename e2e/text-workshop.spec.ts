import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 2A: der Weg vom englischen Text zum fertigen Paket.
 *
 * Der Test läuft in einem gewöhnlichen Chromium **ohne** Translator-API. Genau
 * das ist der Normalfall: Die Textwerkstatt muss ohne jede Übersetzungs-API
 * vollständig benutzbar sein. Es wird nie ein echtes Browsermodell geladen.
 */

const TEXT = [
  'The neighbourhood is crowded today.',
  'Litter is a problem in the neighbourhood.',
  'Volunteers collect litter every Saturday.',
].join(' ');

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
      beschreibung: violation.help,
      elemente: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
}

/**
 * Entfernt die eingebauten Modell-APIs, bevor die App startet.
 *
 * Seit Sprint 2B.1a erkennt LexiFlow die echten Web-IDL-Interfaces – und je
 * nach Browserbuild ist `Translator` auf einer http-Herkunft tatsächlich
 * vorhanden. Dieser Test beschreibt aber ausdrücklich den Normalfall „Browser
 * ohne Übersetzungs-API", also wird sie hier verlässlich abgeschaltet.
 */
async function withoutBrowserModels(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined });
    Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: undefined });
  });
}

async function analyze(page: Page): Promise<void> {
  await withoutBrowserModels(page);
  await page.goto('/#/material/import?quelle=text');
  await expect(
    page.getByText(/vollständige eingefügte Text wird nicht als eigener Datensatz gespeichert/),
  ).toBeVisible();
  await page.getByLabel('Englischer Text').fill(TEXT);
  await page.getByRole('button', { name: 'Text lokal analysieren' }).click();
  await expect(page.getByRole('heading', { name: /Gefundene Vokabelkandidaten/ })).toBeVisible();
}

test.describe('Textwerkstatt', () => {
  test('@smoke Text lokal analysieren, Vokabeln übernehmen und üben', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        externalRequests.push(request.url());
    });

    await withoutBrowserModels(page);
    await page.goto('/#/material');
    await page.getByRole('button', { name: 'Aus englischem Text erstellen' }).click();
    await expect(page.getByLabel('Englischer Text')).toBeVisible();

    // Der Hinweis nennt beides: Gesamttext bleibt außen vor, Originalsätze nicht.
    await expect(
      page.getByText(/vollständige eingefügte Text wird nicht als eigener Datensatz gespeichert/),
    ).toBeVisible();
    await expect(
      page.getByText(/Originalsätze der übernommenen Vokabeln werden dagegen als Beispielsätze/),
    ).toBeVisible();

    await page.getByLabel('Englischer Text').fill(TEXT);
    await page.getByRole('button', { name: 'Text lokal analysieren' }).click();

    // Kandidaten mit Originalsatz, ohne erfundene Übersetzung.
    await expect(page.getByRole('heading', { name: /Gefundene Vokabelkandidaten/ })).toBeVisible();
    await expect(page.getByText('„The neighbourhood is crowded today.“').first()).toBeVisible();
    await expect(page.getByLabel('Deutsche Antwort für „crowded“')).toHaveValue('');

    // Ohne Translator-API bleibt alles benutzbar.
    await expect(page.getByText(/Dieser Browser bietet keine lokale Übersetzung/)).toBeVisible();

    // Drei Vokabeln von Hand übersetzen.
    await page.getByRole('button', { name: 'Keine auswählen' }).click();
    for (const [english, german] of [
      ['crowded', 'überfüllt'],
      ['litter', 'Müll'],
      ['neighbourhood', 'Nachbarschaft'],
    ] as const) {
      await page.getByLabel(`${english} übernehmen`).check();
      await page.getByLabel(`Deutsche Antwort für „${english}“`).fill(german);
    }

    await page.getByRole('button', { name: /3 Vokabeln in die Vorschau übernehmen/ }).click();

    // Übergabe an die bekannte Vorschau samt Beispielsatz aus dem Quelltext.
    await expect(page.getByText('3 Zeilen ·')).toBeVisible();
    // Reihenfolge wie im Text: neighbourhood, crowded, litter.
    await expect(page.getByLabel('Englisch, Zeile 1', { exact: true })).toHaveValue(
      'neighbourhood',
    );
    await expect(page.getByLabel('Deutsch, Zeile 1', { exact: true })).toHaveValue(
      'Nachbarschaft',
    );
    await expect(page.getByLabel('Englisch, Zeile 2', { exact: true })).toHaveValue('crowded');
    await expect(page.getByLabel('Deutsch, Zeile 2', { exact: true })).toHaveValue('überfüllt');
    await page.getByRole('button', { name: 'Details für crowded öffnen' }).click();
    await expect(page.getByLabel('Beispielsatz 1 Englisch, crowded')).toHaveValue(
      'The neighbourhood is crowded today.',
    );
    await page.getByRole('button', { name: 'Details für crowded schließen' }).click();

    // Metadaten und Speichern wie bisher.
    await page.getByRole('button', { name: 'Weiter zu den Metadaten' }).click();
    await page.getByLabel('Titel', { exact: true }).fill('Aus Text – City life');
    await page.getByLabel('Jahrgang').selectOption('7');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Aus Text – City life' }),
    ).toBeVisible();

    // Der Quelltext landet nicht im Paket.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Als .vocabpack.json exportieren' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const content = await (await import('node:fs/promises')).readFile(path, 'utf8');
    expect(content).not.toContain('Volunteers collect litter every Saturday.');
    expect(content).toContain('The neighbourhood is crowded today.');

    // Schülerbereich funktioniert unverändert.
    await page.getByRole('link', { name: 'Im Schülerbereich ansehen' }).click();
    await expect(page.getByText(/0 von 3 Vokabeln sicher/)).toBeVisible();
    await page.getByRole('button', { name: 'Lernrunde starten' }).click();
    await expect(page.getByText('Aufgabe 1 von 3')).toBeVisible();
    await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
    await page.getByRole('button', { name: 'Gewusst', exact: true }).click();

    // Kein einziger Zugriff auf einen fremden Host.
    expect(externalRequests).toEqual([]);
  });

  test('@smoke lehnt zu lange Texte ab, statt still zu kürzen', async ({ page }) => {
    await withoutBrowserModels(page);
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').fill('a '.repeat(11_000));
    await expect(page.getByText('22.000 von 20.000 Zeichen')).toBeVisible();
    await page.getByRole('button', { name: 'Text lokal analysieren' }).click();
    await expect(page.getByRole('alert')).toContainText('20.000 Zeichen');
    await expect(page.getByLabel('Englischer Text')).toBeVisible();
  });

  test('@a11y Kandidatenansicht ohne schwerwiegende Befunde', async ({ page }) => {
    await analyze(page);
    await expectNoSeriousViolations(page, 'Kandidaten');
  });

  test('@a11y Fokus liegt nach der Analyse auf der Ergebnisüberschrift', async ({ page }) => {
    await analyze(page);
    await expect(page.getByRole('heading', { name: /Gefundene Vokabelkandidaten/ })).toBeFocused();
  });

  test('@a11y Textwerkstatt ist mit der Tastatur bedienbar', async ({ page }) => {
    await withoutBrowserModels(page);
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').focus();
    await page.keyboard.type('The neighbourhood is crowded today.');
    await page.getByRole('button', { name: 'Text lokal analysieren' }).focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { name: /Gefundene Vokabelkandidaten/ })).toBeVisible();
    await page.getByLabel('Deutsche Antwort für „crowded“').focus();
    await page.keyboard.type('überfüllt');
    await expect(page.getByLabel('Deutsche Antwort für „crowded“')).toHaveValue('überfüllt');
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y Kandidatenansicht ohne horizontalen Überlauf', async ({ page }) => {
      await analyze(page);
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
