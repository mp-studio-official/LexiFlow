import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 4A.1c: Die Marke im gebauten Zustand.
 *
 * Was hier geprüft wird, kann eine Komponentenprüfung nicht sehen: Ob die
 * Schriften wirklich aus der eigenen Auslieferung kommen, ob die Seite ohne
 * Bewegung auskommt, wenn jemand sie abbestellt hat, und ob der Kontrast auch
 * in dem Moment stimmt, in dem eine Ansicht gerade erst erscheint.
 */

/** Alles, was ein Zeichensatz-Anbieter wäre – erlaubt ist keiner davon. */
const FONT_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'api.fontshare.com',
  'cdn.fontshare.com',
  'fonts.cdnfonts.com',
  'use.typekit.net',
];

/** Sammelt jede Anfrage, die die Seite nach außen stellt. */
function collectRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (request) => seen.push(request.url()));
  return seen;
}

test.describe('Marke – Auslieferung', () => {
  test('@brand fragt keine Schrift von außen an', async ({ page }) => {
    const requests = collectRequests(page);

    await page.goto('/');
    await expect(page.getByRole('link', { name: /LexiFlow/ })).toBeVisible();
    // Auch die Schülerseite, denn sie lädt ihre eigene Einstiegsdatei.
    await page.goto('/#/lernen');
    await page.waitForLoadState('networkidle');

    const fremd = requests.filter(
      (url) =>
        !url.startsWith('http://127.0.0.1:') &&
        !url.startsWith('data:') &&
        !url.startsWith('blob:'),
    );
    expect(fremd, 'Anfragen außerhalb der eigenen Auslieferung').toEqual([]);

    for (const host of FONT_HOSTS) {
      expect(requests.filter((url) => url.includes(host))).toEqual([]);
    }
  });

  test('@brand liefert die eingebettete Schrift selbst aus', async ({ page }) => {
    const requests = collectRequests(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const schriften = requests.filter((url) => url.endsWith('.woff2'));
    expect(schriften.length, 'mindestens eine lokal ausgelieferte Schriftdatei').toBeGreaterThan(0);
    for (const url of schriften) {
      expect(url.startsWith('http://127.0.0.1:'), url).toBe(true);
    }

    /*
      Satoshi ist seit E10 ganz aus dem Stack verschwunden – die Lizenzlage
      für die Weitergabe in einer portablen Lerndatei ließ sich nie
      zweifelsfrei klären. Diese Zusicherung bleibt trotzdem stehen: Sie
      kostet nichts und beschreibt weiterhin, was gelten muss, falls die
      Schrift je über einen Umweg zurückkommt.
    */
    expect(requests.filter((url) => /satoshi/i.test(url))).toEqual([]);
  });
});

test.describe('Marke – Bewegung', () => {
  test('@brand bewegt nichts, wenn Bewegung abbestellt ist', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('link', { name: /LexiFlow/ })).toBeVisible();

    /*
      Geprüft wird die *gerechnete* Dauer, nicht die Existenz einer Medienregel:
      Ein Stylesheet kann die Regel enthalten und sie trotzdem später wieder
      überschreiben. Gemessen wird an einer Fläche, die im normalen Zustand
      eine Überblendung hat.
    */
    const dauern = await page.evaluate(() => {
      const targets = [...document.querySelectorAll('.btn, .card, .meter__fill, a')].slice(0, 40);
      return targets.map((element) => {
        const style = getComputedStyle(element);
        return {
          transition: style.transitionDuration,
          animation: style.animationDuration,
        };
      });
    });

    expect(dauern.length).toBeGreaterThan(0);
    for (const { transition, animation } of dauern) {
      for (const value of [...transition.split(','), ...animation.split(',')]) {
        const sekunden = Number.parseFloat(value.trim().replace(/m?s$/, ''));
        const inSekunden = value.trim().endsWith('ms') ? sekunden / 1000 : sekunden;
        expect(Number.isNaN(inSekunden) ? 0 : inSekunden).toBeLessThanOrEqual(0.01);
      }
    }
  });
});

test.describe('Marke – Kontrast im Moment des Erscheinens', () => {
  /**
   * Prüft die Kontrastregel **ohne** vorher auf Ruhe zu warten.
   *
   * Der klassische Fehler eines frisch gebauten Designsystems: Der Kopf ist
   * schon dunkel, die Schrift darauf aber noch in der alten Farbe – für einen
   * Wimpernschlag steht helle Schrift auf hellem Grund. Wer nur den
   * eingeschwungenen Zustand prüft, sieht das nie.
   */
  async function kontrastSofort(page: Page, label: string): Promise<void> {
    const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();

    expect(
      results.violations.flatMap((violation) =>
        violation.nodes.map((node) => ({
          zustand: label,
          element: node.target.join(' '),
          befund: node.failureSummary,
        })),
      ),
    ).toEqual([]);
  }

  test('@brand Startseite, Lernbereich und Material direkt nach der Navigation', async ({
    page,
  }) => {
    for (const [route, label] of [
      ['/', 'Startseite'],
      ['/#/lernen', 'Lernbereich'],
      ['/#/material', 'Material'],
      ['/#/datenschutz', 'Datenschutz'],
    ] as const) {
      await page.goto(route);
      // Bewusst kein `networkidle` und kein Warten auf eine Überschrift:
      // Gemessen wird der erste Zustand, den jemand tatsächlich zu sehen bekommt.
      await kontrastSofort(page, label);
    }
  });
});

/**
 * Sprint 4B.1c: das gelieferte Zeichen und die dreifarbige Palette – im
 * gebauten Zustand, auf Desktop und auf 390 px.
 */
test.describe('Marke – Logo und Palette', () => {
  /** Die drei verbindlichen Töne, so wie sie im Markup stehen. */
  const AUBERGINE = '#2F092D';
  const TOMATO = '#FF2E2D';
  const PARCHMENT = '#F8EFE3';

  /** Was es nach 4B.1c nirgends mehr geben darf. */
  const ABGELEGT = ['#ff8a3d', '#e63946', '#3b0f3f', '#2b0c2b', '#faefe2', '#f6ece1'];

  test('@brand trägt in der dunklen Kopfzeile die Aubergine-Variante', async ({ page }) => {
    await page.goto('/');
    const marke = page.getByRole('link', { name: /LexiFlow/ }).first();
    await expect(marke).toBeVisible();

    const fills = await marke.locator('svg path').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('fill')),
    );
    /*
      Die tragende Fläche muss Parchment sein. Mit der hellen Variante läge
      Aubergine auf Aubergine – das Zeichen verschwände zur Hälfte, und kein
      Kontrasttest würde das melden, weil es kein Text ist.
    */
    expect(fills).toEqual([PARCHMENT, TOMATO, AUBERGINE]);
  });

  test('@brand liefert beide Logo-Varianten als bereinigte Assets aus', async ({ page }) => {
    await page.goto('/');
    for (const [datei, ersteFlaeche] of [
      ['lexiflow-mark-on-aubergine.svg', PARCHMENT],
      ['lexiflow-mark-on-parchment.svg', AUBERGINE],
    ] as const) {
      const antwort = await page.request.get(new URL(datei, page.url()).toString());
      expect(antwort.status(), datei).toBe(200);
      const svg = await antwort.text();

      expect(svg, datei).toContain(`fill="${ersteFlaeche}"`);
      expect(svg, datei).toContain(`fill="${TOMATO}"`);
      // Bereinigt: keine Reste des Zeichenprogramms.
      expect(svg, datei).not.toContain('<!DOCTYPE');
      expect(svg, datei).not.toContain('xlink');
      expect(svg, datei).not.toContain('serif');
      for (const alt of ABGELEGT) expect(svg.toLowerCase(), `${datei}: ${alt}`).not.toContain(alt);
    }
  });

  test('@brand zeigt nirgends mehr die alte Orange-Markenfarbe', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Alle ausgelieferten Stylesheets zusammen – nicht nur die berechneten Werte.
    const css = await page.evaluate(async () => {
      const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
      const texte = await Promise.all(links.map((link) => fetch(link.href).then((r) => r.text())));
      const inline = [...document.querySelectorAll('style')].map((node) => node.textContent ?? '');
      return [...texte, ...inline].join('\n').toLowerCase();
    });

    expect(css.length, 'es wurde überhaupt CSS gefunden').toBeGreaterThan(1000);
    for (const alt of ABGELEGT) expect(css, `CSS enthält noch ${alt}`).not.toContain(alt);
    expect(css).not.toContain('--brand-orange');
    expect(css).not.toContain('--warm');
  });

  test('@brand markiert den aktiven Navigationseintrag nicht nur mit Farbe', async ({ page }) => {
    await page.goto('/#/material');
    const aktiv = page.locator('[aria-current="page"]').first();
    await expect(aktiv).toBeVisible();
    // `aria-current` ist das Zeichen, das ohne Farbwahrnehmung trägt.
    await expect(aktiv).toHaveAttribute('aria-current', 'page');
  });

  test('@a11y Kopfzeile ohne schwerwiegende Befunde – Desktop und 390 px', async ({ page }) => {
    for (const breite of [1280, 390]) {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto('/');
      await expect(page.getByRole('link', { name: /LexiFlow/ }).first()).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      const schwer = results.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      );
      expect(schwer.map((v) => `${breite}px ${v.id}`)).toEqual([]);

      // Und kein waagerechter Überlauf durch das Zeichen.
      const ueberlauf = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(ueberlauf, `waagerechter Überlauf bei ${breite} px`).toBe(false);
    }
  });
});
