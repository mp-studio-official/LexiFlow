import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 3A: die neue App-Shell und die vier überarbeiteten Oberflächen.
 *
 * Geprüft wird, was ein Redesign kaputt machen kann: die aktuelle Route, die
 * Erreichbarkeit auf dem Telefon, die Bedienbarkeit mit der Tastatur, die
 * Kontraste – und dass die neuen Schriften wirklich lokal liegen.
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
      beschreibung: violation.help,
      elemente: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
}

async function expectNoPageOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(overflow.scrollWidth, `${label}: Dokument läuft horizontal über`).toBeLessThanOrEqual(
    overflow.clientWidth + 1,
  );
  expect(overflow.bodyScrollWidth, `${label}: body läuft horizontal über`).toBeLessThanOrEqual(
    overflow.clientWidth + 1,
  );
}

/** Ein Paket über den echten Weg anlegen – ohne Testhintertür. */
async function seedPack(page: Page, title: string): Promise<void> {
  await page.goto('/#/material/import');
  await page.getByLabel('Vokabelliste einfügen').fill('crowded\tüberfüllt\nlitter\tMüll');
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
  await page.getByRole('button', { name: 'Weiter zu den Metadaten' }).click();
  await page.getByLabel('Titel', { exact: true }).fill(title);
  await page.getByLabel('Thema').fill('City');
  await page.getByRole('button', { name: /Paket speichern/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

test.describe('App-Shell auf dem Desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('@smoke zeigt Marke und die drei Kernbereiche in der Seitenspalte', async ({ page }) => {
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
    await expect(nav).toBeVisible();
    await expect(page.getByRole('link', { name: /^LexiFlow/ })).toBeVisible();

    for (const label of ['Lernen', 'Erstellen', 'Daten']) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }

    // Auf schmalen Fenstern gedacht – hier ausgeblendet und damit auch nicht
    // im Accessibility-Baum.
    await expect(page.getByRole('navigation', { name: 'Bereichsnavigation' })).toBeHidden();
  });

  test('@smoke markiert die aktuelle Route', async ({ page }) => {
    await page.goto('/#/material');
    const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });

    await expect(nav.getByRole('link', { name: 'Erstellen' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Lernen' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );

    await nav.getByRole('link', { name: 'Lernen' }).click();
    await expect(nav.getByRole('link', { name: 'Lernen' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Erstellen' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('@a11y ist über die Tastatur erreichbar', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Zum Inhalt springen' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: /^LexiFlow/ })).toBeFocused();

    const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('link', { name: 'Lernen' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('link', { name: 'Erstellen' })).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Was willst du heute erstellen?' }),
    ).toBeVisible();
  });

  test('@a11y die überarbeiteten Oberflächen ohne schwerwiegende Befunde', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        externalRequests.push(request.url());
    });

    await page.goto('/');
    await expectNoSeriousViolations(page, 'Startseite');

    await seedPack(page, 'Unit 3 – City life');

    await page.goto('/#/material');
    await expect(page.getByRole('heading', { name: 'Unit 3 – City life' })).toBeVisible();
    await expectNoSeriousViolations(page, 'Material mit Feed');

    await page.goto('/#/lernen');
    await expect(page.getByRole('heading', { name: 'Unit 3 – City life' })).toBeVisible();
    await expectNoSeriousViolations(page, 'Lernen mit Feed');

    // Die Schriften liegen lokal – kein einziger fremder Request.
    expect(externalRequests).toEqual([]);
  });

  test('@smoke die Paketkarte ist als Ganzes anklickbar', async ({ page }) => {
    await seedPack(page, 'Unit 3 – City life');
    await page.goto('/#/lernen');

    // Klick auf den Titel öffnet das Paket …
    await page.getByRole('link', { name: 'Unit 3 – City life' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Unit 3 – City life' })).toBeVisible();

    // … und die Aktionen daneben bleiben eigenständig bedienbar.
    await page.goto('/#/material');
    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Metadaten' })).toBeVisible();
  });
});

test.describe('App-Shell auf dem Telefon', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('@smoke navigiert über die Leiste am unteren Rand', async ({ page }) => {
    await page.goto('/');

    const bar = page.getByRole('navigation', { name: 'Bereichsnavigation' });
    await expect(bar).toBeVisible();
    // Die Seitenspalte ist auf dieser Breite ausgeblendet.
    await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeHidden();

    await bar.getByRole('link', { name: 'Erstellen' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Was willst du heute erstellen?' }),
    ).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Erstellen' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('@a11y die Leiste bleibt erreichbar und groß genug', async ({ page }) => {
    await page.goto('/');
    const bar = page.getByRole('navigation', { name: 'Bereichsnavigation' });

    // Sticky am unteren Rand, auch nach dem Scrollen.
    await page.mouse.wheel(0, 2000);
    await expect(bar).toBeInViewport();

    for (const label of ['Lernen', 'Erstellen', 'Daten']) {
      const box = await bar.getByRole('link', { name: label }).boundingBox();
      expect(box, `${label}: keine Trefferfläche`).not.toBeNull();
      expect(box?.height ?? 0, `${label}: Trefferfläche zu flach`).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0, `${label}: Trefferfläche zu schmal`).toBeGreaterThanOrEqual(44);
    }
  });

  test('@a11y Inhalt verschwindet nicht hinter der Leiste', async ({ page }) => {
    await seedPack(page, 'Unit 3 – City life');
    await page.goto('/#/lernen');

    // Unabhängig von der Scrollposition gemessen: Das Dokument reserviert
    // unterhalb des letzten Inhalts mindestens die Höhe der Leiste.
    const geometry = await page.evaluate(() => {
      const footer = document.querySelector('footer') as HTMLElement;
      const bar = document.querySelector('nav[aria-label="Bereichsnavigation"]') as HTMLElement;
      return {
        footerBottom: footer.getBoundingClientRect().bottom + window.scrollY,
        documentHeight: document.documentElement.scrollHeight,
        barHeight: bar.getBoundingClientRect().height,
      };
    });

    expect(geometry.barHeight).toBeGreaterThanOrEqual(44);
    expect(
      geometry.documentHeight - geometry.footerBottom,
      'Die Leiste würde die Fußzeile verdecken',
    ).toBeGreaterThanOrEqual(geometry.barHeight);
  });

  test('@a11y ohne horizontalen Überlauf und ohne schwerwiegende Befunde', async ({ page }) => {
    await seedPack(page, 'Unit 3 – City life');

    for (const [route, label] of [
      ['/', 'Startseite'],
      ['/#/material', 'Material'],
      ['/#/lernen', 'Lernen'],
    ] as const) {
      await page.goto(route);
      await expectNoPageOverflow(page, label);
      await expectNoSeriousViolations(page, `${label} (390 px)`);
    }
  });
});

test.describe('Lokale Schriften', () => {
  test('@smoke sind eingebunden und werden ohne Netz geladen', async ({ page }) => {
    const externalRequests: string[] = [];
    const fontRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        externalRequests.push(request.url());
      if (url.pathname.endsWith('.woff2')) fontRequests.push(url.pathname);
    });

    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);

    const families = await page.evaluate(() => ({
      body: getComputedStyle(document.body).fontFamily,
      display: getComputedStyle(document.querySelector('h1') as Element).fontFamily,
    }));

    expect(families.body).toContain('Manrope Variable');
    expect(families.display).toContain('Newsreader Variable');
    // Geladen wird ausschließlich vom eigenen Server.
    expect(fontRequests.length).toBeGreaterThan(0);
    expect(externalRequests).toEqual([]);
  });
});
