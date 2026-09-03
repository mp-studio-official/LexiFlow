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

/** Der Hinweis steht hinter einer Schaltfläche – aufklappen und lesen. */
async function readNotice(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Hinweis zur Textverarbeitung' }).click();
  await expect(
    page.getByText(/vollständige eingefügte Text wird nicht als eigener Datensatz gespeichert/),
  ).toBeVisible();
  await page.keyboard.press('Escape');
}

async function analyze(page: Page): Promise<void> {
  await withoutBrowserModels(page);
  await page.goto('/#/material/import?quelle=text');
  await readNotice(page);
  await page.getByLabel('Englischer Text').fill(TEXT);
  await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();
}

/** Und der zweite Schritt: Anzahl setzen, empfehlen lassen. */
async function recommend(page: Page, count = '20'): Promise<void> {
  const knopf = page.getByRole('button', { name: 'Empfehlungen generieren', exact: true });
  await expect(knopf).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel('Anzahl').selectOption(count);
  await knopf.click();
  await expect(page.getByRole('heading', { name: /Vorgeschlagene Vokabeln/ })).toBeVisible();
}

test.describe('Textwerkstatt', () => {
  test('@smoke Text analysieren, Vokabeln übernehmen und üben', async ({ page }) => {
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
    await page.getByRole('button', { name: 'Hinweis zur Textverarbeitung' }).click();
    await expect(
      page.getByText(/vollständige eingefügte Text wird nicht als eigener Datensatz gespeichert/),
    ).toBeVisible();
    await expect(
      page.getByText(/Originalsätze der übernommenen Vokabeln werden dagegen als Beispielsätze/),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByLabel('Englischer Text').fill(TEXT);
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();

    // Schritt 2: Jahrgang setzen, empfehlen lassen.
    await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();
    await page.getByLabel('Jahrgang').selectOption('7');
    await recommend(page);

    // Empfehlungen mit Originalsatz, ohne erfundene Übersetzung.
    await expect(page.getByText('„The neighbourhood is crowded today.“').first()).toBeVisible();
    await expect(page.getByLabel('Deutsche Antwort für „crowded“')).toHaveValue('');

    // Ohne Translator-API bleibt alles benutzbar. Die Begründung steht seit
    // 4B.2 im benannten Aufklapper unter den Ergebnissen statt als Kasten davor.
    await page
      .getByRole('button', { name: /Übersetzungsvorschläge aus dem Sprachmodell/ })
      .click();
    await expect(page.getByText(/Dieser Browser bietet keine lokale Übersetzung/)).toBeVisible();

    // Es gibt keine Häkchen – die Antwort entscheidet.
    await expect(page.getByRole('checkbox')).toHaveCount(0);

    // Drei Vokabeln von Hand übersetzen; der Rest bleibt offen und geht nicht mit.
    for (const [english, german] of [
      ['crowded', 'überfüllt'],
      ['litter', 'Müll'],
      ['neighbourhood', 'Nachbarschaft'],
    ] as const) {
      await page.getByLabel(`Deutsche Antwort für „${english}“`).fill(german);
    }
    await expect(page.getByText(/3 Vokabeln werden übernommen/)).toBeVisible();

    await page.getByRole('button', { name: '3 Vokabeln prüfen & speichern' }).click();

    /*
      Übergabe an die bekannte Tabelle samt Beispielsatz aus dem Quelltext.

      Die Zeilenreihenfolge folgt jetzt der Empfehlung, nicht mehr dem Text –
      deshalb wird hier auf Werte geprüft und nicht auf Zeilennummern.
    */
    await expect(page.getByText('3 Zeilen ·')).toBeVisible();
    const germanValues = await page
      .locator('table input[type="text"]')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value));
    for (const german of ['Nachbarschaft', 'überfüllt', 'Müll']) {
      expect(germanValues).toContain(german);
    }
    await page.getByRole('button', { name: 'Beispielsatz für crowded anzeigen' }).click();
    await expect(page.getByLabel('Beispielsatz 1 Englisch, crowded')).toHaveValue(
      'The neighbourhood is crowded today.',
    );
    await page.getByRole('button', { name: 'Beispielsatz für crowded ausblenden' }).click();

    // Titel und Speichern stehen in **demselben** Schritt wie die Tabelle.
    await page.getByLabel('Titel', { exact: true }).fill('Aus Text – City life');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Aus Text – City life' }),
    ).toBeVisible();

    // Der Quelltext landet nicht im Paket.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Als LexiFlow-Paket herunterladen (.vocabpack.json)' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const content = await (await import('node:fs/promises')).readFile(path, 'utf8');
    expect(content).not.toContain('Volunteers collect litter every Saturday.');
    expect(content).toContain('The neighbourhood is crowded today.');

    // Schülerbereich funktioniert unverändert.
    await page.getByRole('link', { name: 'Im Lernbereich ansehen' }).click();
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
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('20.000 Zeichen');
    await expect(page.getByLabel('Englischer Text')).toBeVisible();
  });

  /*
    Sprint 4B.3: Die Werkbank.

    Ob eine Spalte wirklich schmaler wird, wenn man am Griff zieht, lässt sich
    nur im echten Browser beantworten – jsdom rechnet kein Layout, und
    `SplitPane.test.tsx` prüft deshalb nur die Tastatur und die Ansage. Hier
    wird gemessen.
  */
  test('@smoke die Quellspalte lässt sich ziehen und mit den Pfeiltasten stellen', async ({
    page,
  }) => {
    await analyze(page);
    await recommend(page);

    const quelle = page.locator('.split__source');
    const griff = page.getByRole('separator', { name: 'Breite der Quellspalte' });

    // Der analysierte Text steht links zum Nachschlagen.
    await expect(page.getByRole('region', { name: 'Analysierter Text' })).toContainText(
      'crowded',
    );

    const vorher = (await quelle.boundingBox())?.width ?? 0;
    expect(vorher).toBeGreaterThan(0);

    // Ziehen: 80 px nach rechts. Die Bewegung geht in zwei Schritten, damit
    // ein `pointermove` zwischen Druck und Loslassen wirklich stattfindet.
    const box = await griff.boundingBox();
    if (!box) throw new Error('Der Griff hat keine Fläche.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + box.height / 2);
    await page.mouse.move(box.x + 80, box.y + box.height / 2);
    await page.mouse.up();

    const nachher = (await quelle.boundingBox())?.width ?? 0;
    expect(nachher).toBeGreaterThan(vorher + 40);

    // Und dasselbe ohne Maus.
    const gezogen = Number(await griff.getAttribute('aria-valuenow'));
    await griff.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(Number(await griff.getAttribute('aria-valuenow'))).toBe(gezogen - 2);
    expect((await quelle.boundingBox())?.width ?? 0).toBeLessThan(nachher);
  });

  test('@a11y Empfehlungsschritt ohne schwerwiegende Befunde', async ({ page }) => {
    await analyze(page);
    await recommend(page);
    await expectNoSeriousViolations(page, 'Empfehlungen');
  });

  test('@a11y Fokus liegt nach der Analyse auf der Schrittüberschrift', async ({ page }) => {
    await analyze(page);
    await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeFocused();
  });

  test('@a11y Fokus wandert nach dem Empfehlen ans Ergebnis', async ({ page }) => {
    await analyze(page);
    await recommend(page);
    await expect(page.getByRole('heading', { name: /Vorgeschlagene Vokabeln/ })).toBeFocused();
  });

  test('@a11y Der Stepper führt zurück, ohne die Arbeit zu verlieren', async ({ page }) => {
    await analyze(page);
    await recommend(page);
    await page.getByLabel('Deutsche Antwort für „crowded“').fill('überfüllt');

    await page.getByRole('button', { name: 'Schritt 1: Text analysieren' }).click();
    await expect(page.getByLabel('Englischer Text')).toHaveValue(TEXT);
    await page.getByRole('button', { name: 'Schritt 2: Empfehlungen generieren' }).click();
    await expect(page.getByLabel('Deutsche Antwort für „crowded“')).toHaveValue('überfüllt');
  });

  test('@a11y Textwerkstatt ist mit der Tastatur bedienbar', async ({ page }) => {
    await withoutBrowserModels(page);
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').focus();
    await page.keyboard.type('The neighbourhood is crowded today.');
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();
    await recommend(page);
    await page.getByLabel('Deutsche Antwort für „crowded“').focus();
    await page.keyboard.type('überfüllt');
    await expect(page.getByLabel('Deutsche Antwort für „crowded“')).toHaveValue('überfüllt');
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y Empfehlungsschritt ohne horizontalen Überlauf', async ({ page }) => {
      await analyze(page);
      await recommend(page);
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
