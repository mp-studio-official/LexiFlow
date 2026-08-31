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
      Satoshi steht im Stack an erster Stelle, wird aber nicht mitgeliefert –
      die Lizenzlage für die Weitergabe in einer portablen Einzeldatei ließ
      sich nicht zweifelsfrei klären. Was hier gilt: Es darf keine
      Satoshi-Datei in der Auslieferung liegen und keine angefragt werden.
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

  test('@brand Startseite, Schülerbereich und Material direkt nach der Navigation', async ({
    page,
  }) => {
    for (const [route, label] of [
      ['/', 'Startseite'],
      ['/#/lernen', 'Schülerbereich'],
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
