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
 *
 * Seit 4B.7 ist das Blatt eine Liste und keine Tabelle mehr: Wort, Satz,
 * Übersetzung untereinander. Der Grund steht in `PrintablePackView.tsx`.
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

/** Die Vokabelliste auf dem Blatt – nicht irgendeine Liste der Seite. */
function sheetList(page: Page) {
  return page.locator('.sheet__list');
}

test.describe('Vokabelliste', () => {
  test('@smoke der Weg aus dem Paket auf das Blatt', async ({ page }) => {
    await makePack(page);

    await page.getByRole('link', { name: 'Vokabelliste drucken / als PDF speichern' }).click();
    await expect(sheetList(page)).toBeVisible();

    // Die vollständigen Lernformen und die Übersetzungen stehen auf dem Blatt.
    const liste = sheetList(page);
    await expect(liste).toContainText('to depend on sb./sth.');
    await expect(liste).toContainText('von jdm./etw. abhängen');
    await expect(liste).toContainText('restraints (pl.)');
    await expect(liste).toContainText('die Beschränkungen; die Auflagen');
    await expect(liste).toContainText('attainable (adj.)');
    await expect(liste).toContainText('to coin a phrase / term');

    // Und der Kopf sagt, worum es geht.
    await expect(page.getByRole('heading', { name: 'Unit 7 – Coastal erosion' })).toBeVisible();
    await expect(page.getByText(/4 Vokabeln · Klasse 9/)).toBeVisible();
  });

  test('@smoke stellt Wort, Satz und Übersetzung untereinander', async ({ page }) => {
    /*
      Der Aufbau ist die eigentliche Auskunft dieser Ansicht, und er ist der
      Grund, warum aus der Tabelle eine Liste wurde: Eine Lernform wie
      `to depend on sb./sth.` und ein ganzer Beispielsatz teilen sich in einer
      28-%-Spalte nichts – beide brechen um, und aus einer Zeile werden vier,
      die man nicht mehr als eine Vokabel liest.

      Gemessen wird deshalb, dass das Wort **breiter** stehen darf als eine
      Spalte es zuließe, und dass es fett über seiner Übersetzung steht.
    */
    const id = await makePack(page);
    await page.goto(`/#/material/${id}/liste`);
    await expect(sheetList(page)).toBeVisible();

    const ersterEintrag = page.locator('.sheet__entry').first();
    await expect(ersterEintrag.locator('.sheet__form')).toHaveText('to depend on sb./sth.');
    await expect(ersterEintrag.locator('.sheet__german')).toHaveText('von jdm./etw. abhängen');

    const gemessen = await ersterEintrag.evaluate((entry) => {
      const word = entry.querySelector('.sheet__word') as HTMLElement;
      const german = entry.querySelector('.sheet__german') as HTMLElement;
      return {
        gewicht: Number(getComputedStyle(word).fontWeight),
        wortOben: word.getBoundingClientRect().bottom <= german.getBoundingClientRect().top + 1,
        gleicheBreite:
          Math.abs(word.getBoundingClientRect().width - german.getBoundingClientRect().width) < 2,
      };
    });

    expect(gemessen.gewicht).toBeGreaterThanOrEqual(600);
    expect(gemessen.wortOben).toBe(true);
    // Beide Zeilen haben dieselbe volle Breite – keine Spalten mehr.
    expect(gemessen.gleicheBreite).toBe(true);
  });

  test('@smoke die Kopfzeile oben links lässt sich beschreiben', async ({ page }) => {
    /*
      „E | GK | Q1 | Ohm“: der Kurs, zu dem das Blatt gehört. Am Bildschirm ein
      Feld, auf Papier eine Zeile – und leer bleibt sie auch auf Papier leer,
      statt einen Rahmen zu hinterlassen.
    */
    const id = await makePack(page);
    await page.goto(`/#/material/${id}/liste`);
    await expect(sheetList(page)).toBeVisible();

    await expect(page.locator('.sheet__course-line')).toHaveCount(0);

    await page.getByLabel('Kopfzeile').fill('E | GK | Q1 | Ohm');
    await expect(page.locator('.sheet__course-line')).toHaveText('E | GK | Q1 | Ohm');

    // Am Bildschirm zeigt das Feld die Zeile, auf Papier das Element.
    await expect(page.locator('.sheet__course-line')).toBeHidden();
    await page.emulateMedia({ media: 'print' });
    const imDruck = await page.evaluate(() => ({
      zeile: getComputedStyle(document.querySelector('.sheet__course-line') as HTMLElement).display,
      feld: getComputedStyle(document.querySelector('.sheet__course-field') as HTMLElement).display,
    }));
    expect(imDruck.zeile).toBe('block');
    expect(imDruck.feld).toBe('none');
    await page.emulateMedia({ media: 'screen' });

    // Und sie überlebt den Wechsel auf ein anderes Paket.
    await page.reload();
    await expect(page.getByLabel('Kopfzeile')).toHaveValue('E | GK | Q1 | Ohm');
  });

  test('@smoke im Druck bleibt nur das Blatt', async ({ page }) => {
    const id = await makePack(page);
    await page.goto(`/#/material/${id}/liste`);
    await expect(sheetList(page)).toBeVisible();

    await page.emulateMedia({ media: 'print' });

    const gemessen = await page.evaluate(() => {
      const entry = document.querySelector('.sheet__entry') as HTMLElement;
      const word = document.querySelector('.sheet__word') as HTMLElement;
      const title = document.querySelector('.sheet__title') as HTMLElement;
      const foot = document.querySelector('.sheet__foot') as HTMLElement;
      const nav = document.querySelector('.app-nav') as HTMLElement;
      const tools = document.querySelector('.print-hidden') as HTMLElement;
      return {
        eintragBleibtGanz: getComputedStyle(entry).breakInside,
        wortBleibtBeiDerBedeutung: getComputedStyle(word).breakAfter,
        balken: getComputedStyle(title).borderBottomColor,
        balkenbreite: Number.parseFloat(getComputedStyle(title).borderBottomWidth),
        fussImFluss: getComputedStyle(foot).position,
        fussText: foot.textContent,
        navigation: getComputedStyle(nav).display,
        werkzeuge: getComputedStyle(tools).display,
      };
    });

    // Keine Vokabel wird über zwei Seiten verteilt.
    expect(gemessen.eintragBleibtGanz).toBe('avoid');
    expect(gemessen.wortBleibtBeiDerBedeutung).toBe('avoid');

    /*
      Der Balken unter dem Titel ist eine Rahmenlinie und keine Fläche: Browser
      drucken Hintergründe standardmäßig nicht mit, Rahmen dagegen schon. Und
      er ist Tomate – die einzige Farbe, die dieses Blatt trägt.
    */
    expect(gemessen.balken).toBe('rgb(255, 46, 45)');
    expect(gemessen.balkenbreite).toBeGreaterThan(2);

    /*
      Der Vermerk steht im Fluss am Ende des Blattes.

      `position: fixed` war der erste Versuch und ist gescheitert: Chrome
      wiederholt eine solche Fußzeile im Druck nicht je Seite, sondern setzt
      sie einmal – gemessen an einem erzeugten PDF landete der Vermerk oben
      auf Seite 2 statt unten auf Seite 1.
    */
    expect(gemessen.fussImFluss).toBe('static');
    // Geschütztes Leerzeichen zwischen Zeichen und Kürzel – „©“ am Zeilenende
    // und „OHM“ auf der nächsten Zeile wäre kein Vermerk mehr.
    expect(gemessen.fussText).toBe('©\u00a0OHM');

    // Nichts Bedienbares auf dem Papier.
    expect(gemessen.navigation).toBe('none');
    expect(gemessen.werkzeuge).toBe('none');

    await page.emulateMedia({ media: 'screen' });
  });

  test('@smoke lädt die Tabelle als .csv mit dem erwarteten Inhalt', async ({ page }) => {
    const id = await makePack(page);
    await page.goto(`/#/material/${id}/liste`);
    await expect(sheetList(page)).toBeVisible();

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

  test('@smoke die Einstellungen wirken auf Blatt und Datei', async ({ page }) => {
    const id = await makePack(page);
    await page.goto(`/#/material/${id}/liste`);
    await expect(sheetList(page)).toBeVisible();

    await page.getByLabel(/Reihenfolge/).selectOption('alphabetical');
    await expect(page.locator('.sheet__form').first()).toHaveText('attainable (adj.)');

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

    await expect(sheetList(page)).toContainText('to depend on sb./sth.');
    await expect(
      page.getByRole('button', { name: 'Als Tabelle herunterladen (.csv)' }),
    ).toBeVisible();
  });

  test('@a11y die Vokabelliste ohne schwerwiegende Befunde', async ({ page }) => {
    const id = await makePack(page);
    await page.goto(`/#/material/${id}/liste`);
    await expect(sheetList(page)).toBeVisible();

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

    test('@a11y das Blatt sprengt das Fenster nicht', async ({ page }) => {
      const id = await makePack(page);
      await page.goto(`/#/material/${id}/liste`);
      await expect(sheetList(page)).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
});
