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

    const families = await page.evaluate(() => {
      // Ein Element, das die Zitatschrift wirklich trägt – ohne eines zu bauen,
      // das es in der Anwendung so nicht gibt.
      const probe = document.createElement('p');
      probe.style.fontFamily = 'var(--font-quote)';
      document.body.append(probe);
      const quote = getComputedStyle(probe).fontFamily;
      probe.remove();
      return {
        body: getComputedStyle(document.body).fontFamily,
        display: getComputedStyle(document.querySelector('h1') as Element).fontFamily,
        quote,
      };
    });

    // Satoshi steht im Stack an erster Stelle, ausgeliefert wird Manrope –
    // die Ersatzschrift muss deshalb überall zweiter Eintrag sein.
    expect(families.body).toContain('Manrope Variable');
    expect(families.display).toContain('Manrope Variable');
    expect(families.body).toContain('Satoshi');
    // Newsreader trägt seit dem Markensystem nur noch Beispielsätze und Zitate.
    expect(families.quote).toContain('Newsreader Variable');
    // Geladen wird ausschließlich vom eigenen Server.
    expect(fontRequests.length).toBeGreaterThan(0);
    expect(externalRequests).toEqual([]);
  });
});

test.describe('PWA-Marke', () => {
  test('@smoke Theme-Farbe, Manifest und Icons tragen dieselbe Marke', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        externalRequests.push(request.url());
    });

    await page.goto('/');

    // Kopfdaten des Dokuments.
    await expect(page).toHaveTitle('LexiFlow – Vokabeln lernen');
    // Die Statusleiste trägt die Navigationsfarbe, nicht das Papier.
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#2f092d');
    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'light');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /favicon\.svg$/);

    // Das gebaute Manifest – nicht die Konfiguration, sondern das Ergebnis.
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();
    const manifestResponse = await page.request.get(manifestHref as string);
    expect(manifestResponse.status()).toBe(200);
    const manifest = (await manifestResponse.json()) as {
      name: string;
      theme_color: string;
      background_color: string;
      description: string;
      lang: string;
      icons: { src: string; sizes: string; purpose: string }[];
    };

    expect(manifest.name).toBe('LexiFlow – Vokabeln lernen');
    expect(manifest.theme_color).toBe('#2f092d');
    expect(manifest.background_color).toBe('#f8efe3');
    expect(manifest.lang).toBe('de');
    expect(manifest.description).toContain('Einfach ins Lernen kommen.');
    expect(manifest.description).toContain('alle Daten bleiben lokal im Browser');

    // Die alten Markenfarben kommen nirgends mehr vor.
    const raw = JSON.stringify(manifest).toLowerCase();
    // Beide Vorgängersysteme – Schulblau und „Editorial Signal“.
    for (const retired of [
      '#1f4d6b',
      '#1c4f6e',
      '#8fc4e2',
      '#f6f7f9',
      '#14120f',
      '#e2542a',
      '#c3d63a',
    ]) {
      expect(raw, `Manifest enthält noch ${retired}`).not.toContain(retired);
    }

    // Jede genannte Icon-Datei existiert wirklich und hat die richtige Form.
    const maskable = manifest.icons.filter((icon) => icon.purpose === 'maskable');
    expect(maskable).toHaveLength(1);
    expect(maskable[0]?.src).toContain('maskable');

    for (const icon of manifest.icons) {
      const response = await page.request.get(new URL(icon.src, page.url()).toString());
      expect(response.status(), `${icon.src} fehlt im Build`).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');
    }

    // Und das Favicon selbst trägt genau die drei Markenfarben.
    const favicon = await page.request.get(new URL('favicon.svg', page.url()).toString());
    expect(favicon.status()).toBe(200);
    const svg = await favicon.text();
    for (const colour of ['#2F092D', '#F8EFE3', '#FF2E2D']) {
      expect(svg).toContain(colour);
    }
    for (const retired of [
      '#1f4d6b', '#1c4f6e', '#8fc4e2', '#14120f', '#e2542a', '#c3d63a',
      '#3b0f3f', '#e63946', '#ff8a3d', '#2b0c2b', '#faefe2', '#f6ece1',
    ]) {
      expect(svg.toLowerCase()).not.toContain(retired);
    }
    // Ein Vektor, keine eingebettete Rasterdatei.
    expect(svg).not.toContain('<image');

    expect(externalRequests).toEqual([]);
  });
});
