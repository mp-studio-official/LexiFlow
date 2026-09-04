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

/** Legt ein Paket an und öffnet es im Lernbereich. */
async function seedPack(page: Page, title: string, direction = 'en-de'): Promise<void> {
  await page.goto('/#/material/import');
  await page.getByLabel('Vokabelliste einfügen').fill(VOCAB_LIST);
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
  await page.getByLabel('Titel', { exact: true }).fill(title);
  await page.getByLabel('Jahrgang').selectOption('7');
  // Die meisten Tests hier beschreiben das freie Üben, nicht die Richtungswahl.
  // Seit Sprint 3B.1 stehen neue Pakete auf „beide Richtungen“; die
  // Ausgangslage soll aber eindeutig sein – deshalb ausdrücklich gewählt.
  await page.getByLabel('Lernrichtung').selectOption(direction);
  await page.getByRole('button', { name: /Paket speichern/ }).click();
  await page.getByRole('link', { name: 'Im Lernbereich ansehen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/**
 * Ein Paket, in dem nur zwei von vier Vokabeln einen Lückensatz hergeben.
 *
 * Genau der Alltagsfall: Für „crowded“ und „litter“ gibt es einen englischen
 * Beispielsatz, für die beiden anderen nicht. Eine strikte Auswahl
 * „nur Lückensätze“ muss deshalb eine kürzere Runde ergeben.
 */
async function seedPackWithSomeSentences(page: Page, title: string): Promise<void> {
  await page.goto('/#/material/import');
  await page.getByLabel('Vokabelliste einfügen').fill(VOCAB_LIST);
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();

  for (const [word, sentence] of [
    ['crowded', 'The bus was crowded this morning.'],
    ['litter', 'There is litter on the street.'],
  ] as const) {
    await page.getByRole('button', { name: `Beispielsatz für ${word} anzeigen` }).click();
    await page.getByRole('button', { name: `Beispielsatz hinzufügen, ${word}` }).click();
    await page.getByLabel(`Beispielsatz 1 Englisch, ${word}`).fill(sentence);
    await page.getByRole('button', { name: `Beispielsatz für ${word} ausblenden` }).click();
  }

  await page.getByLabel('Titel', { exact: true }).fill(title);
  await page.getByLabel('Jahrgang').selectOption('7');
  await page.getByLabel('Lernrichtung').selectOption('de-en');
  await page.getByRole('button', { name: /Paket speichern/ }).click();
  await page.getByRole('link', { name: 'Im Lernbereich ansehen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/** Vollständiger Abzug des Lernstands – wie in `study-modes.spec.ts`. */
async function readProgress(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const open = indexedDB.open('lexiflow');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });

    const read = (store: string): Promise<unknown[]> =>
      new Promise((resolve, reject) => {
        const request = database.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as unknown[]);
        request.onerror = () => reject(request.error);
      });

    const result = {
      directionProgress: await read('directionProgress'),
      packProgress: await read('packProgress'),
    };
    database.close();
    return JSON.stringify(result);
  });
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
 * Karteikarte erzwingen – seit Sprint 3B.2b über die URL.
 *
 * Der Einstieg ins freie Üben ist jetzt ein Ein-Klick-Weg ohne
 * Vorabeinstellungen; die Übungsform richtet sich sonst nach dem Leitner-Fach.
 * Für die Bedienungstests hier braucht es aber genau eine, vorhersagbare Form.
 * Der Ein-Klick-Weg selbst wird weiter unten eigens geprüft.
 */
async function startFreeFlashcards(page: Page): Promise<void> {
  const packId = (page.url().split('/lernen/')[1] ?? '').split('?')[0] ?? '';
  await page.goto(`/#/lernen/${packId}/uebung?mode=free&kinds=flashcard&length=15&seed=42`);
}

/** Bringt das Paket in den Zustand „nichts fällig, freies Üben möglich". */
async function seedNothingDue(page: Page, title = 'Frei üben'): Promise<void> {
  await seedPack(page, title);
  await finishScheduledRound(page);
  await page.getByRole('link', { name: 'Zurück zum Paket' }).click();
  await expect(page.getByText(/Gerade ist nichts fällig/)).toBeVisible();
}

/**
 * Den Lernstand aufklappen.
 *
 * Seit 4B.6 steht er als schlanke Zeile da: die Zahl, der Balken, und die
 * Fächer einen Klick tief hinter dem **i**.
 */
async function openLernstand(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: 'Wie sich der Lernstand auf die Fächer verteilt' })
    .click();
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

    // Der Lernplan ist gesperrt – der freiwillige Weg bleibt offen, der Termin sichtbar.
    await expect(page.getByRole('button', { name: 'Lernrunde starten' })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Frei üben' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Runde anpassen' })).toBeVisible();
    await expect(page.getByText('4 Aufgaben sind verfügbar.')).toBeVisible();
    await expect(page.getByText(/morgen|in 1 Tag/).first()).toBeVisible();

    // Lernstand vor der freien Runde – die Zahl steht hinter dem i.
    await openLernstand(page);
    await expect(page.getByText(/0 von 4 Vokabeln sicher/)).toBeVisible();
    /*
      „1 Übungsrunden“ stand hier bis 4B.6 – die Zeile kannte keinen Singular.
      Der schlanke Lernstand zählt jetzt richtig, und die Zahl steht vor dem
      i, nicht dahinter.
    */
    await expect(page.getByText(/1 Runde bisher/)).toBeVisible();
    const boxesBefore = await page.locator('.stand .mono').first().innerText();

    await startFreeFlashcards(page);

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
    await expect(page.getByText(/1 Runde bisher/)).toBeVisible();
    await openLernstand(page);
    await expect(page.getByText(/0 von 4 Vokabeln sicher/)).toBeVisible();
    await expect(page.getByText(/Gerade ist nichts fällig/)).toBeVisible();
    expect(await page.locator('.stand .mono').first().innerText()).toBe(boxesBefore);

    expect(externalRequests).toEqual([]);
  });

  test('@smoke eine falsche Antwort wird in derselben freien Runde wiederholt', async ({ page }) => {
    await seedNothingDue(page, 'Freie Wiedervorlage');
    await startFreeFlashcards(page);

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

  /*
    Seit Sprint 3B.2b führt genau ein Weg ins freie Üben: die Karte „Auf eigene
    Weise lernen". Die frühere Modusauswahl in der Lernplan-Karte war ein
    zweiter Weg zur selben Sache – dieser Test hält fest, dass sie weg ist und
    der verbliebene Weg trägt.
  */
  test('@smoke der Direktstart startet eine freie Runde', async ({ page }) => {
    await seedPack(page, 'Ein Einstieg');

    await expect(page.getByRole('radio', { name: 'Lernplan' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Frei üben' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Frei üben' }).click();
    await expect(page.getByText(/Frei üben · Aufgabe 1 von 4/)).toBeVisible();
  });

  /*
    Sprint 3B.2b1: Der ganze Weg über die sichtbare Einrichtung – ohne dass
    irgendwo eine URL von Hand getippt werden müsste. Am Ende steht der
    Vergleich der IndexedDB-Inhalte vor und nach der Runde.
  */
  test('@smoke Runde anpassen: Richtung, Formen, Vorschau, Start – ohne Lernstand', async ({
    page,
  }) => {
    await seedPack(page, 'Runde anpassen', 'both');

    // Erst eine echte Lernrunde, damit es überhaupt einen Lernstand gibt.
    await page.getByRole('button', { name: 'Lernrunde starten' }).click();
    for (let i = 1; i <= 4; i += 1) {
      await expect(page.getByText(`Aufgabe ${i} von 4`)).toBeVisible();
      await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
      await page.getByRole('button', { name: 'Gewusst', exact: true }).click();
      await page.getByRole('button', { name: /^(Weiter|Runde beenden)$/ }).click();
    }
    await page.getByRole('link', { name: 'Zurück zum Paket' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Runde anpassen' })).toBeVisible();

    const before = await readProgress(page);
    expect(before).toContain('directionProgress');

    await page.getByRole('link', { name: 'Runde anpassen' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Runde anpassen' })).toBeVisible();

    // Richtung wählen …
    await page.getByRole('radio', { name: 'Deutsch → Englisch' }).check();
    // … Umfang …
    await page.getByRole('radio', { name: 'Bis zu 5 Aufgaben' }).check();
    // … und die Formen auf Karteikarte eingrenzen.
    await page.getByRole('checkbox', { name: 'Multiple Choice' }).uncheck();
    await page.getByRole('checkbox', { name: 'Offene Übersetzung' }).uncheck();
    await expect(page.getByRole('checkbox', { name: 'Karteikarte' })).toBeChecked();

    // Ehrliche Vorschau: vier Ziele in dieser Richtung, vier Aufgaben.
    const preview = page.locator('.self-test__preview');
    await expect(preview).toContainText('4 Aufgaben stehen in dieser Richtung zur Verfügung.');
    await expect(preview).toContainText('4 Aufgaben werden eingeplant.');

    await page.getByRole('button', { name: 'Frei üben starten' }).click();

    // Genau die angekündigte Runde – und genau die gewählte Form.
    await expect(page.getByText(/Frei üben · Aufgabe 1 von 4/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lösung anzeigen' })).toBeVisible();
    expect(page.url()).toContain('mode=free');
    expect(page.url()).toContain('direction=de-en');
    expect(page.url()).toContain('length=5');

    for (let i = 1; i <= 4; i += 1) {
      await expect(page.getByText(`Aufgabe ${i} von 4`)).toBeVisible();
      await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
      await page.getByRole('button', { name: 'Gewusst', exact: true }).click();
      await page.getByRole('button', { name: /^(Weiter|Runde beenden)$/ }).click();
    }
    await expect(page.getByRole('heading', { name: 'Freie Runde abgeschlossen' })).toBeVisible();
    await page.getByRole('link', { name: 'Zurück zum Paket' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Runde anpassen' })).toBeVisible();

    expect(await readProgress(page)).toBe(before);
  });

  /*
    Sprint 3B.2b2: Eine ausdrücklich gewählte Aufgabenart ist verbindlich. Zwei
    der vier Vokabeln geben keinen Lückensatz her – sie kommen in dieser Runde
    deshalb nicht vor, statt heimlich anders gefragt zu werden.
  */
  test('@smoke nur Lückensätze gewählt: kürzere Runde, keine Ersatzform', async ({ page }) => {
    await seedPackWithSomeSentences(page, 'Nur Lückensätze');

    const before = await readProgress(page);

    await page.getByRole('link', { name: 'Runde anpassen' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Runde anpassen' })).toBeVisible();

    const preview = page.locator('.self-test__preview');
    await expect(preview).toContainText('4 Aufgaben stehen in dieser Richtung zur Verfügung.');

    // Alles abwählen außer den Lückensätzen.
    await page.getByRole('checkbox', { name: 'Karteikarte' }).uncheck();
    await page.getByRole('checkbox', { name: 'Multiple Choice' }).uncheck();
    await page.getByRole('checkbox', { name: 'Offene Übersetzung' }).uncheck();
    await page.getByRole('checkbox', { name: 'Lückensatz ohne Wortbank' }).uncheck();
    await expect(page.getByRole('checkbox', { name: 'Lückensatz mit Wortbank' })).toBeChecked();

    // Die Vorschau nennt die reduzierte Zahl – und verspricht keine Ersatzform.
    await expect(preview).toContainText('Für 2 davon ist eine der gewählten Übungsformen möglich.');
    await expect(preview).toContainText('2 Aufgaben werden eingeplant.');
    await expect(preview).not.toContainText('andere geeignete Form');

    await expectNoSeriousViolations(page, 'Einrichtung mit strikter Formwahl');

    await page.getByRole('button', { name: 'Frei üben starten' }).click();

    // Genau zwei geplante Aufgaben – und jede einzelne ist ein Lückensatz mit
    // Wortbank. (Eine falsche Antwort kommt in derselben Runde noch einmal;
    // deshalb wird bis zum Rundenende gespielt statt exakt zweimal.)
    await expect(page.getByText(/Frei üben · Aufgabe 1 von 2/)).toBeVisible();

    const finished = page.getByRole('heading', { name: 'Freie Runde abgeschlossen' });
    for (let step = 0; step < 6 && !(await finished.isVisible()); step += 1) {
      const bank = page.getByRole('group', { name: 'Wortbank' });
      await expect(bank).toBeVisible();
      await bank.getByRole('button').first().click();
      await page.getByRole('button', { name: /^(Weiter|Runde beenden)$/ }).click();
    }
    await expect(finished).toBeVisible();

    await page.getByRole('link', { name: 'Zurück zum Paket' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Nur Lückensätze' })).toBeVisible();
    expect(await readProgress(page)).toBe(before);
  });

  test('@smoke die Einrichtung nimmt unmögliche Formen beim Richtungswechsel heraus', async ({
    page,
  }) => {
    await seedPack(page, 'Formen aufräumen', 'both');
    await page.getByRole('link', { name: 'Runde anpassen' }).click();

    await page.getByRole('radio', { name: 'Englisch → Deutsch' }).check();
    // Lückensätze gibt es nur produktiv – rezeptiv stehen sie gar nicht zur Wahl.
    await expect(page.getByRole('checkbox', { name: /Lückensatz/ })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'Offene Übersetzung' })).toBeChecked();
  });

  test('@a11y Paketseite ohne schwerwiegende Befunde und mit der Tastatur bedienbar', async ({
    page,
  }) => {
    await seedPack(page, 'A11y Modus');
    await expectNoSeriousViolations(page, 'Paketdetail mit Lernwegen');

    // Die Einrichtung ist mit der Tastatur erreichbar und selbst bedienbar.
    await page.getByRole('link', { name: 'Runde anpassen' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: 'Runde anpassen' })).toBeVisible();
    await expectNoSeriousViolations(page, 'Freies Üben einrichten');
    await page.getByRole('radio', { name: 'Bis zu 5 Aufgaben' }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('radio', { name: 'Bis zu 5 Aufgaben' })).toBeChecked();
    await page.goBack();

    // Der Direktstart ebenso.
    await page.getByRole('link', { name: 'Frei üben' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Frei üben · Aufgabe 1 von 4/)).toBeVisible();
    await expectNoSeriousViolations(page, 'laufende freie Runde');

    await page.goBack();
    await startFreeFlashcards(page);
    await expect(page.getByText(/Frei üben · Aufgabe 1 von 4/)).toBeVisible();

    // Fokus nach der Antwort auf „Weiter“ – ohne Wartezeit.
    await expect(page.getByRole('button', { name: 'Lösung anzeigen' })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Gewusst', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /Weiter|Runde beenden/ })).toBeFocused();
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y Paketseite ohne horizontalen Überlauf', async ({ page }) => {
      await seedPack(page, 'A11y Modus mobil');
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });

    test('@a11y Kopfnavigation der laufenden Runde auf 390 px', async ({ page }) => {
      await seedPack(page, 'A11y Kopf mobil');
      await startFreeFlashcards(page);
      await expect(page.getByText(/Frei üben · Aufgabe 1 von 4/)).toBeVisible();

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

      // Beide Aktionen stehen oben und sind groß genug zum Treffen.
      const nav = page.getByRole('navigation', { name: 'Lernnavigation' });
      for (const name of ['Zurück zum Paket', 'Mit Karten lernen']) {
        const box = await nav.getByRole('button', { name }).boundingBox();
        expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
        expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44);
      }

      await expectNoSeriousViolations(page, 'Laufende Runde auf 390 px');

      // Und die Rückfrage bleibt auf schmalen Fenstern bedienbar.
      await nav.getByRole('button', { name: 'Zurück zum Paket' }).click();
      await expect(page.getByText('Runde wirklich verlassen?')).toBeVisible();
      await expectNoSeriousViolations(page, 'Rückfrage auf 390 px');
    });

    test('@a11y Einrichtung ohne horizontalen Überlauf', async ({ page }) => {
      await seedPack(page, 'A11y Einrichtung mobil', 'both');
      await page.getByRole('link', { name: 'Runde anpassen' }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Runde anpassen' })).toBeVisible();

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      await expectNoSeriousViolations(page, 'Einrichtung auf 390 px');
    });
  });
});
