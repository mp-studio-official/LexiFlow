import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Barrierefreiheit: automatisierte Axe-Prüfung der wichtigsten Zustände sowie
 * Tests für Tastaturbedienung, sichtbaren Fokus, Skip-Link und Smartphone-Breite.
 *
 * Akzeptiert werden nur Befunde unterhalb von `serious`. `minor`/`moderate`
 * (etwa Best-Practice-Regeln) führen nicht zum Fehlschlag, werden aber im
 * Fehlerfall mit ausgegeben.
 */

const VOCAB_LIST = [
  'crowded\tüberfüllt, voll',
  'neighbourhood\tNachbarschaft, Viertel',
  'litter\tMüll',
  'quiet\truhig, leise',
].join('\n');

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

/** Führt den Importassistenten bis zur Vorschau. */
async function openPreview(page: Page): Promise<void> {
  await page.goto('/#/material/import');
  await page.getByLabel('Vokabelliste einfügen').fill(VOCAB_LIST);
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
  await expect(page.getByText('4 Zeilen ·')).toBeVisible();
}

/** Legt ein Paket an und liefert dessen Detailseite im Schülerbereich. */
async function seedPack(page: Page, title: string, direction: 'en-de' | 'both'): Promise<void> {
  await openPreview(page);
  await page.getByLabel('Titel', { exact: true }).fill(title);
  await page.getByLabel('Jahrgang').selectOption('7');
  if (direction === 'both') await page.getByLabel('Lernrichtung').selectOption('both');
  await page.getByRole('button', { name: /Paket speichern/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await page.getByRole('link', { name: 'Im Lernbereich ansehen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

test.describe('Barrierefreiheit – Axe', () => {
  test('@a11y Startseite', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Vokabelarbeit, die sich nicht nach Verwaltung anfühlt.',
      }),
    ).toBeVisible();
    // Der Markenname steht seit Sprint 3A in der Shell, nicht mehr als Überschrift.
    await expect(page.getByRole('link', { name: /^LexiFlow/ })).toBeVisible();
    await expectNoSeriousViolations(page, 'Startseite');
  });

  test('@a11y Prüfen & Speichern inklusive aufgeklappter Zeile', async ({ page }) => {
    await openPreview(page);
    await page.getByRole('button', { name: 'Beispielsatz für crowded anzeigen' }).click();
    await expect(page.getByLabel(/Akzeptierte englische Alternativantworten/)).toBeVisible();
    await expectNoSeriousViolations(page, 'Importvorschau');
  });

  test('@a11y Paketdetail mit Lernstand', async ({ page }) => {
    await seedPack(page, 'A11y Lernstand', 'both');
    await expect(page.getByRole('heading', { name: 'Englisch → Deutsch (rezeptiv)' })).toBeVisible();
    await expectNoSeriousViolations(page, 'Paketdetail');
  });

  test('@a11y laufende Übung und sichtbares Feedback', async ({ page }) => {
    await seedPack(page, 'A11y Übung', 'en-de');
    await page.getByRole('button', { name: 'Lernrunde starten' }).click();
    await expect(page.getByText('Aufgabe 1 von 4')).toBeVisible();
    await expectNoSeriousViolations(page, 'laufende Übung');

    await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
    await page.getByRole('button', { name: 'Noch nicht gewusst' }).click();
    await expect(page.getByText('Noch nicht richtig', { exact: true })).toBeVisible();
    await expectNoSeriousViolations(page, 'Feedback nach Antwort');
  });

  /*
    Sprint 4A.1c: Zwei Ansichten haben sich mit dem Markensystem sichtbar
    verändert und waren bisher nicht automatisiert geprüft – die
    Kandidatenprüfung, in der „übernommen“ und „nicht übernommen“ jetzt auch
    über die Fläche unterschieden werden, und die Auswertung des Selbsttests.
    (Der Kartenmodus wird bereits in `study-modes.spec.ts` geprüft, auf dem
    Desktop wie auf 390 px – hier wäre er eine Dopplung.)
  */
  test('@a11y Empfehlungsschritt der Textwerkstatt', async ({ page }) => {
    await page.goto('/#/material/import?quelle=text');
    await page
      .getByLabel('Englischer Text')
      .fill(
        'The neighbourhood was crowded and noisy. Litter covered the quiet street near the old station.',
      );
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();

    await expectNoSeriousViolations(page, 'Einstellungen vor der Empfehlung');

    const knopf = page.getByRole('button', { name: 'Empfehlungen generieren', exact: true });
    await expect(knopf).toBeEnabled({ timeout: 30_000 });
    await knopf.click();
    await expect(page.getByRole('heading', { name: /Vorgeschlagene Vokabeln/ })).toBeVisible();

    // Der zweite Zustand ist der interessante: teils beantwortet, teils offen.
    const erste = (
      await page.locator('.candidate__head strong').evaluateAll((nodes) =>
        nodes.map((node) => node.textContent ?? ''),
      )
    )[0]!;
    await page.getByLabel(`Deutsche Antwort für „${erste}“`).fill('eine Antwort');
    await expectNoSeriousViolations(page, 'Empfehlungen – teils beantwortet');
  });

  test('@a11y aufgeklappter Datenschutzhinweis', async ({ page }) => {
    await page.goto('/#/material/import?quelle=text');
    await page.getByRole('button', { name: 'Hinweis zur Textverarbeitung' }).click();
    await expect(
      page.getByRole('group', { name: 'Verarbeitung auf diesem Gerät' }),
    ).toBeVisible();
    await expectNoSeriousViolations(page, 'Datenschutzhinweis offen');
  });

  test('@a11y Auswertung des Selbsttests', async ({ page }) => {
    await seedPack(page, 'A11y Selbsttest', 'en-de');
    await page.getByRole('link', { name: 'Selbsttest starten' }).click();
    await page.getByRole('button', { name: 'Selbsttest starten' }).click();

    /*
      Absichtlich falsch beantwortet – die Auswertung *mit* Fehlern ist der
      Zustand mit den meisten Farbflächen. Die Zahl der Aufgaben steht bewusst
      nicht im Test: Der Selbsttest stellt sie selbst zusammen, und eine feste
      Zahl hier wäre eine zweite, stillschweigende Behauptung darüber.
    */
    const ergebnis = page.getByRole('heading', { level: 2, name: 'Deine Auswertung' });
    for (let versuch = 0; versuch < 30 && !(await ergebnis.count()); versuch += 1) {
      const input = page.locator('form input[type="text"]');
      if (await input.count()) {
        await input.fill('zzz');
        await page.getByRole('button', { name: 'Antwort prüfen' }).click();
      } else {
        const options = page.locator('.option');
        if (!(await options.count())) break;
        await options.first().click();
      }
    }

    await expect(ergebnis).toBeVisible();
    await expectNoSeriousViolations(page, 'Selbsttestauswertung');

    await page.getByRole('button', { name: 'Fehler ansehen' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Das war noch nicht richtig' }),
    ).toBeVisible();
    await expectNoSeriousViolations(page, 'Fehleransicht');
  });
});

test.describe('Barrierefreiheit – Bedienung', () => {
  test('@a11y Skip-Link springt zum Inhalt', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');

    const skipLink = page.getByRole('link', { name: 'Zum Inhalt springen' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeInViewport();

    await page.keyboard.press('Enter');
    const focusedId = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(focusedId).toBe('inhalt');
  });

  test('@a11y Fokus ist sichtbar', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const outline = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        width: Number.parseFloat(style.outlineWidth),
        style: style.outlineStyle,
        color: style.outlineColor,
      };
    });

    expect(outline).not.toBeNull();
    expect(outline?.width ?? 0).toBeGreaterThanOrEqual(2);
    expect(outline?.style).not.toBe('none');
  });

  test('@a11y Hauptablauf ist rein mit der Tastatur bedienbar', async ({ page }) => {
    await seedPack(page, 'A11y Tastatur', 'en-de');

    // Übung per Tastatur starten.
    await page.getByRole('button', { name: 'Lernrunde starten' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Aufgabe 1 von 4')).toBeVisible();

    // Karteikarte: Lösung anzeigen und selbst einschätzen.
    await expect(page.getByRole('button', { name: 'Lösung anzeigen' })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Gewusst', exact: true }).focus();
    await page.keyboard.press('Enter');

    // Nach der Antwort liegt der Fokus auf „Weiter“.
    await expect(page.getByRole('button', { name: /Weiter|Runde beenden/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Aufgabe 2 von 4')).toBeVisible();
  });

  test('@a11y Multiple Choice über die Zifferntasten', async ({ page }) => {
    await seedPack(page, 'A11y Ziffern', 'en-de');
    await page.getByRole('checkbox', { name: /Multiple Choice/ }).check();
    await page.getByRole('button', { name: 'Lernrunde starten' }).click();

    await expect(page.getByText('Aufgabe 1 von 4')).toBeVisible();
    await page.keyboard.press('1');
    await expect(page.locator('.feedback')).toBeVisible();
  });
});

test.describe('Barrierefreiheit – Smartphone-Breite', () => {
  test.use({ viewport: { width: 390, height: 844 } });

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

  test('@a11y Startseite und Schülerbereich ohne horizontalen Überlauf', async ({ page }) => {
    await page.goto('/');
    await expectNoPageOverflow(page, 'Startseite');

    await page.goto('/#/lernen');
    await expectNoPageOverflow(page, 'Lernen');

    await page.goto('/#/datenschutz');
    await expectNoPageOverflow(page, 'Datenschutz');
  });

  test('@a11y Lehrkraft-Tabelle scrollt im eigenen Container', async ({ page }) => {
    await openPreview(page);
    await expectNoPageOverflow(page, 'Importvorschau');

    const wrap = page.locator('.table-wrap');
    const box = await wrap.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      overflowX: getComputedStyle(element).overflowX,
    }));

    // Die Tabelle ist breiter als ihr Container und scrollt dort – nicht die Seite.
    expect(box.overflowX).toBe('auto');
    expect(box.scrollWidth).toBeGreaterThan(box.clientWidth);
    expect(box.clientWidth).toBeLessThanOrEqual(390);
  });

  test('@a11y Paketdetail und Übung ohne horizontalen Überlauf', async ({ page }) => {
    await seedPack(page, 'A11y Mobil', 'both');
    await expectNoPageOverflow(page, 'Paketdetail');

    await page.getByRole('button', { name: 'Lernrunde starten' }).click();
    await expect(page.getByText(/Aufgabe 1 von/)).toBeVisible();
    await expectNoPageOverflow(page, 'Übung');

    await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
    await page.getByRole('button', { name: 'Noch nicht gewusst' }).click();
    await expectNoPageOverflow(page, 'Feedback');
  });
});
