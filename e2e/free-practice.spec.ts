import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 2A.2: Freies Üben ist jederzeit möglich und lässt den Lernplan in Ruhe.
 *
 * Statt die Uhr zu verstellen, wird der Zustand „nichts fällig" auf dem
 * fachlich vorgesehenen Weg erzeugt: eine vollständige Lernrunde mit lauter
 * richtigen Antworten schiebt alle Vokabeln in Fach 2 – fällig erst morgen.
 */

const VOCAB_LIST = [
  'crowded\tüberfüllt',
  'neighbourhood\tNachbarschaft',
  'litter\tMüll',
  'quiet\truhig',
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

/** Legt ein Paket an und öffnet es im Schülerbereich. */
async function seedPack(page: Page, title: string): Promise<void> {
  await page.goto('/#/material/import');
  await page.getByLabel('Vokabelliste einfügen').fill(VOCAB_LIST);
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
  await page.getByRole('button', { name: 'Weiter zu den Metadaten' }).click();
  await page.getByLabel('Titel', { exact: true }).fill(title);
  await page.getByLabel('Jahrgang').selectOption('7');
  await page.getByRole('button', { name: /Paket speichern/ }).click();
  await page.getByRole('link', { name: 'Im Schülerbereich ansehen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/** Eine vollständige Lernrunde mit vier richtigen Antworten. */
async function finishScheduledRound(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Lernrunde starten' }).click();
  for (let i = 1; i <= 4; i += 1) {
    await expect(page.getByText(`Aufgabe ${i} von 4`)).toBeVisible();
    await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
    await page.getByRole('button', { name: 'Gewusst', exact: true }).click();
    await page.getByRole('button', { name: /^(Weiter|Runde beenden)$/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Runde abgeschlossen' })).toBeVisible();
}

/**
 * Karteikarte erzwingen. Ohne Auswahl richtet sich die Übungsform nach dem
 * Leitner-Fach – nach der ersten Runde wäre das Multiple Choice.
 */
async function chooseFlashcards(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: /Karteikarte/ }).check();
}

/** Bringt das Paket in den Zustand „nichts fällig, freies Üben möglich". */
async function seedNothingDue(page: Page, title = 'Frei üben'): Promise<void> {
  await seedPack(page, title);
  await finishScheduledRound(page);
  await page.getByRole('link', { name: 'Zurück zum Paket' }).click();
  await expect(page.getByText(/Gerade ist nichts fällig/)).toBeVisible();
}

test.describe('Freies Üben', () => {
  test('@smoke ohne fällige Aufgaben frei üben, ohne den Lernplan zu ändern', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        externalRequests.push(request.url());
    });

    await seedNothingDue(page, 'Freies Üben');

    // Der Lernplan ist gesperrt, freies Üben vorausgewählt – der Termin bleibt sichtbar.
    await expect(page.getByRole('radio', { name: 'Lernplan' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'Frei üben' })).toBeChecked();
    await expect(page.getByText(/morgen|in 1 Tag/).first()).toBeVisible();
    await expect(page.getByRole('option', { name: 'Alle verfügbaren (4)' })).toBeAttached();

    // Lernstand vor der freien Runde.
    await expect(page.getByText(/0 von 4 Vokabeln sicher/)).toBeVisible();
    await expect(page.getByText(/1 Übungsrunden bisher/)).toBeVisible();
    const boxesBefore = await page.locator('.stand .mono').first().innerText();

    await chooseFlashcards(page);
    await page.getByRole('button', { name: 'Frei üben', exact: true }).click();

    await expect(page.getByText(/Frei üben · Aufgabe 1 von 4/)).toBeVisible();
    await expect(
      page.getByText('Freies Üben: Diese Runde verändert deinen Lernplan und die Fälligkeiten nicht.'),
    ).toBeVisible();

    for (let i = 1; i <= 4; i += 1) {
      await expect(page.getByText(`Aufgabe ${i} von 4`)).toBeVisible();
      await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
      await page.getByRole('button', { name: 'Gewusst', exact: true }).click();
      // Kein Speichern, also auch kein Warten.
      await expect(page.getByText('Lernstand wird gespeichert …')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^(Weiter|Runde beenden)$/ })).toBeEnabled();
      await page.getByRole('button', { name: /^(Weiter|Runde beenden)$/ }).click();
    }

    await expect(page.getByRole('heading', { name: 'Freie Runde abgeschlossen' })).toBeVisible();
    await expect(
      page.getByText('Diese freie Runde hat deinen Lernplan und deine Fälligkeiten nicht verändert.'),
    ).toBeVisible();

    // Zurück im Paket: Fächer, Termin und Rundenzahl sind unverändert.
    await page.getByRole('link', { name: 'Zurück zum Paket' }).click();
    await expect(page.getByText(/0 von 4 Vokabeln sicher/)).toBeVisible();
    await expect(page.getByText(/1 Übungsrunden bisher/)).toBeVisible();
    await expect(page.getByText(/Gerade ist nichts fällig/)).toBeVisible();
    expect(await page.locator('.stand .mono').first().innerText()).toBe(boxesBefore);

    expect(externalRequests).toEqual([]);
  });

  test('@smoke eine falsche Antwort wird in derselben freien Runde wiederholt', async ({ page }) => {
    await seedNothingDue(page, 'Freie Wiedervorlage');
    await chooseFlashcards(page);
    await page.getByRole('button', { name: 'Frei üben', exact: true }).click();

    await expect(page.getByText(/Frei üben · Aufgabe 1 von 4/)).toBeVisible();
    await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
    await page.getByRole('button', { name: 'Noch nicht gewusst' }).click();
    await expect(page.getByText('Noch nicht richtig', { exact: true })).toBeVisible();
    await expect(page.getByText('Diese Aufgabe kommt in dieser Runde noch einmal.')).toBeVisible();

    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await expect(page.getByText('Aufgabe 2 von 5')).toBeVisible();
  });

  test('@smoke eine gültige freie URL funktioniert direkt', async ({ page }) => {
    await seedNothingDue(page, 'Direkte URL');
    const packUrl = page.url();
    const packId = packUrl.split('/lernen/')[1] ?? '';

    await page.goto(`/#/lernen/${packId}/uebung?mode=free&kinds=flashcard&length=4&seed=42`);
    await expect(page.getByText(/Frei üben · Aufgabe 1 von 4/)).toBeVisible();
  });

  test('@a11y Modusauswahl ohne schwerwiegende Befunde und mit der Tastatur bedienbar', async ({
    page,
  }) => {
    await seedPack(page, 'A11y Modus');
    await expectNoSeriousViolations(page, 'Paketdetail mit Modusauswahl');

    // Der Lernplan ist vorausgewählt; mit der Pfeiltaste geht es zum freien Üben.
    await expect(page.getByRole('radio', { name: 'Lernplan' })).toBeChecked();
    await page.getByRole('radio', { name: 'Lernplan' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: 'Frei üben' })).toBeChecked();

    await chooseFlashcards(page);
    await page.getByRole('button', { name: 'Frei üben', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Frei üben · Aufgabe 1 von 4/)).toBeVisible();
    await expectNoSeriousViolations(page, 'laufende freie Runde');

    // Fokus nach der Antwort auf „Weiter“ – ohne Wartezeit.
    await expect(page.getByRole('button', { name: 'Lösung anzeigen' })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Gewusst', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /Weiter|Runde beenden/ })).toBeFocused();
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y Modusauswahl ohne horizontalen Überlauf', async ({ page }) => {
      await seedPack(page, 'A11y Modus mobil');
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
