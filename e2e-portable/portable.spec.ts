import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 4A.1: Die portablen Einzeldateien, geprüft wie in freier Wildbahn –
 * über `file://`, ohne Server, ohne Netz.
 *
 * Der Ablauf ist der echte: Die Lehrkraftdatei legt ein Paket an, exportiert
 * daraus eine Schülerdatei, und diese Schülerdatei wird anschließend als
 * eigenes Dokument geöffnet und benutzt.
 */

const root = resolve(import.meta.dirname, '..');
const TEACHER = resolve(root, 'dist-portable/LexiFlow-Lehrkraft.html');
const TEACHER_URL = pathToFileURL(TEACHER).href;

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
      elemente: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
}

/**
 * Jede Anfrage, die nicht aus der Datei selbst kommt, ist ein Fehler.
 *
 * `file:`, `data:` und `blob:` sind die drei Wege, auf denen eine portable
 * Datei mit sich selbst spricht. Alles andere wäre eine Übertragung.
 */
function watchExternalRequests(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (request) => {
    const protocol = new URL(request.url()).protocol;
    if (!['file:', 'data:', 'blob:'].includes(protocol)) external.push(request.url());
  });
  return external;
}

function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/** Legt in der Lehrkraftdatei ein Paket an und exportiert die Schülerdatei. */
async function exportStudentFile(page: Page, title = 'Unit 3 – City life'): Promise<string> {
  await page.goto(`${TEACHER_URL}#/material/import`);
  await page.getByLabel('Vokabelliste einfügen').fill(VOCAB_LIST);
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
  await page.getByLabel('Titel', { exact: true }).fill(title);
  await page.getByLabel('Jahrgang').selectOption('8');
  await page.getByLabel('Lernrichtung').selectOption('en-de');
  await page.getByRole('button', { name: /Paket speichern/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Als Einzeldatei herunterladen (.html)' }).click();
  const download = await downloadPromise;

  const target = join(mkdtempSync(join(tmpdir(), 'lexiflow-')), download.suggestedFilename());
  await download.saveAs(target);
  return pathToFileURL(target).href;
}

test.beforeAll(() => {
  if (!existsSync(TEACHER)) {
    throw new Error(
      `Die portable Lehrkraftdatei fehlt (${TEACHER}). Bitte zuerst \`npm run build:portable\` ausführen.`,
    );
  }
});

test.describe('Portable Lehrkraftdatei', () => {
  test('@smoke öffnet sich per file:// und lädt nichts nach', async ({ page }) => {
    const external = watchExternalRequests(page);
    const errors = watchPageErrors(page);

    await page.goto(TEACHER_URL);

    await expect(page).toHaveTitle(/LexiFlow/);
    await expect(page.getByRole('link', { name: /Erstellen/ })).toBeVisible();
    // Unter file:// gibt es keinen Service Worker – und das ist kein Fehler.
    expect(await page.evaluate(() => navigator.serviceWorker?.controller ?? null)).toBeNull();
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });

  test('@smoke erzeugt aus einem Paket eine Schülerdatei', async ({ page }) => {
    const external = watchExternalRequests(page);
    const fileUrl = await exportStudentFile(page);

    expect(fileUrl).toContain('unit-3-city-life-8-lexiflow.html');
    // 4B.3: Aus „Schülerdatei“ ist „Einzeldatei“ geworden – die Oberfläche
    // spricht von Lernenden und Lerngruppen, nicht von Schülern.
    await expect(page.getByText(/Einzeldatei erstellt/).last()).toBeVisible();
    // Der bestehende JSON-Export steht unverändert daneben.
    await expect(page.getByRole('button', { name: 'Als LexiFlow-Paket herunterladen (.vocabpack.json)' })).toBeVisible();
    expect(external).toEqual([]);
  });

  /*
    Sprint 4A.2: Der eigentliche Prüfstein.

    Eine Lehrkraftdatei per Doppelklick, ohne Netz, ohne Browsermodell – und
    trotzdem stehen deutsche Vorschläge da. Genau das war bisher der Punkt, an
    dem Safari nichts zu bieten hatte.
  */
  test('@smoke schlägt offline im Wörterbuch nach, ohne Modell und ohne Netz', async ({ page }) => {
    const external = watchExternalRequests(page);
    const errors = watchPageErrors(page);

    await page.goto(`${TEACHER_URL}#/material/import?quelle=text`);

    // Schritt 1: der Hinweis hinter dem kleinen i, dann analysieren.
    await page.getByRole('button', { name: 'Hinweis zur Textverarbeitung' }).click();
    await expect(page.getByText(/nicht als eigener Datensatz gespeichert/)).toBeVisible();
    await page.keyboard.press('Escape');

    await page
      .getByLabel('Englischer Text')
      .fill('The neighbourhood was crowded. Litter covered the quiet street near the old station.');
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();

    // Schritt 2: Empfehlungen – erst nachdem das Wörterbuch durch ist.
    await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();
    const empfehlen = page.getByRole('button', { name: 'Empfehlungen generieren', exact: true });
    await expect(empfehlen).toBeEnabled({ timeout: 30_000 });
    await page.getByLabel('Anzahl').selectOption('5');
    await empfehlen.click();
    await expect(page.getByRole('heading', { name: /Vorgeschlagene Vokabeln/ })).toBeVisible();

    // Der Vorschlag kommt aus dem eingebauten Bestand – ohne einen einzigen Klick.
    await expect(page.locator('.dictionary__chips .chip').first()).toBeVisible();
    /*
      Und die Zusage dazu steht seit 4B.2 im benannten Aufklapper unter den
      Ergebnissen statt als Kasten davor – dieselbe Aussage, nur nicht mehr im
      Weg.
    */
    await page.getByRole('button', { name: /Woher die Vorschläge kommen/ }).click();
    await expect(page.getByText(/funktioniert auch in Safari/)).toBeVisible();
    // Es gibt keine Häkchen: Die Antwort entscheidet.
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByText(/0 Vokabeln werden übernommen/)).toBeVisible();

    // Übernehmen ist ein Klick, kein Automatismus.
    const übernehmen = page.getByRole('button', { name: /„.+“ als Antwort für .+ einsetzen/ }).first();
    await expect(übernehmen).toBeVisible();
    await übernehmen.click();
    await expect(page.getByText(/1 Vokabel wird übernommen/)).toBeVisible();

    // Schritt 3: Prüfen & Speichern – Tabelle, Titel und Speichern in einem.
    await page.getByRole('button', { name: '1 Vokabel prüfen & speichern' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByText(/Lernkontext:/)).toBeVisible();
    // Schwierigkeit und Themen-Tags gibt es hier nicht – auch nicht aufgeklappt.
    await expect(page.getByLabel(/Schwierigkeit/)).toHaveCount(0);
    await expect(page.getByLabel(/Themen-Tags/)).toHaveCount(0);

    await page.getByLabel('Titel', { exact: true }).fill('Offline – aus einem Text');
    await page.getByLabel('Beschreibung (optional)').fill('Ohne Netz entstanden.');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Offline – aus einem Text' }),
    ).toBeVisible();

    // Und der Weg zurück durch den Stepper hat nichts gekostet.
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });

  test('@smoke der Stepper führt unter file:// zurück, ohne Arbeit zu verlieren', async ({
    page,
  }) => {
    const errors = watchPageErrors(page);
    await page.goto(`${TEACHER_URL}#/material/import?quelle=text`);
    await page
      .getByLabel('Englischer Text')
      .fill('The neighbourhood was crowded. Litter covered the quiet street near the old station.');
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();

    const empfehlen = page.getByRole('button', { name: 'Empfehlungen generieren', exact: true });
    await expect(empfehlen).toBeEnabled({ timeout: 30_000 });
    await empfehlen.click();

    const antwort = page.getByLabel(/^Deutsche Antwort für/).first();
    await antwort.fill('meine Antwort');
    await page.getByRole('button', { name: '1 Vokabel prüfen & speichern' }).click();
    await page.getByLabel('Titel', { exact: true }).fill('Zurück und vor');

    await page.getByRole('button', { name: 'Schritt 2: Empfehlungen generieren' }).click();
    await expect(page.getByLabel(/^Deutsche Antwort für/).first()).toHaveValue('meine Antwort');

    await page.getByRole('button', { name: 'Schritt 3: Prüfen & Speichern' }).click();
    await expect(page.getByLabel('Titel', { exact: true })).toHaveValue('Zurück und vor');

    expect(errors).toEqual([]);
  });

  test('@smoke nennt Quelle und Lizenz und exportiert sie', async ({ page }) => {
    const external = watchExternalRequests(page);
    await page.goto(`${TEACHER_URL}#/datenschutz`);

    await expect(page.getByRole('heading', { name: /Quelle und Lizenz/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'CC BY-SA 4.0' })).toBeVisible();
    await expect(
      page.getByText('4c27d202e875550c2cc7ea93a4d21ddf80440e5030606d3edbb8b0e65dc64006'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Quelle und Lizenz exportieren/ })).toBeVisible();
    expect(external).toEqual([]);
  });

  test('@a11y Paketseite mit Exportaktion ohne schwerwiegende Befunde', async ({ page }) => {
    await page.goto(`${TEACHER_URL}#/material/import`);
    await page.getByLabel('Vokabelliste einfügen').fill(VOCAB_LIST);
    await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
    await page.getByLabel('Titel', { exact: true }).fill('A11y Export');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'A11y Export' })).toBeVisible();

    await expect(page.getByText(/Die Einzeldatei enthält dieses Vokabelpaket/)).toBeVisible();
    await expectNoSeriousViolations(page, 'Lehrkraft-Paketseite (portabel)');
  });
});

test.describe('Exportierte Schülerdatei', () => {
  /*
    Sprint 4B.3: Die Marke muss auf **breiten** Fenstern da sein.

    Der Anlass ist ein echter Fehler: Mit der neuen Schiene bekam die
    Lehrkraftoberfläche ab 62 rem ein `.app-header { display: none }` – und die
    portable Lerndatei benutzt dieselbe Klasse, hat aber keine Schiene. Auf
    einem Laptop stand sie damit ganz ohne Zeichen da. Der bestehende Logo-Test
    lief im Standardfenster von 1280 px und fand deshalb nichts mehr; gefunden
    hat den Fehler er, erklärt hat ihn erst diese zweite Prüfung.

    Geprüft werden beide Breiten, weil genau der Unterschied der Fehler war.
  */
  for (const [name, width] of [
    ['Laptop', 1280],
    ['Telefon', 390],
  ] as const) {
    test(`@smoke zeigt die Marke auch auf ${name}-Breite`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const fileUrl = await exportStudentFile(page);
      await page.goto(fileUrl);

      const marke = page.getByRole('link', { name: /LexiFlow/ }).first();
      await expect(marke).toBeVisible();
      await expect(marke).toHaveAttribute('href', /#\/$|\/$/);
    });
  }

  test('@smoke trägt das Logo als Pfad, nicht als Datei', async ({ page }) => {
    /*
      Sprint 4B.1c: Ein `<img src="lexiflow-mark-….svg">` wäre unter `file://`
      ein leerer Kasten – die Datei liegt nirgends neben der Einzeldatei. Das
      Zeichen steht deshalb als Pfad im Dokument, und die Prüfung sieht beides:
      keine Anfrage nach außen und ein `path` in der Kopfzeile.
    */
    const external = watchExternalRequests(page);
    const fileUrl = await exportStudentFile(page);
    await page.goto(fileUrl);

    const marke = page.getByRole('link', { name: /LexiFlow/ }).first();
    await expect(marke.locator('svg path').first()).toBeAttached();
    expect(await marke.locator('img').count()).toBe(0);

    const html = await page.content();
    expect(html).not.toContain('lexiflow-mark-on-aubergine.svg');
    expect(html).not.toContain('lexiflow-mark-on-parchment.svg');
    expect(html).toContain('#F8EFE3');
    for (const alt of ['#ff8a3d', '#e63946', '#3b0f3f']) {
      expect(html.toLowerCase(), `Schülerdatei enthält noch ${alt}`).not.toContain(alt);
    }
    expect(external).toEqual([]);
  });

  test('@smoke enthält kein Wörterbuch', async ({ page }) => {
    const fileUrl = await exportStudentFile(page);
    const html = readFileSync(fileURLToPath(fileUrl), 'utf8');

    expect(html).not.toContain('4c27d202e875550c2cc7ea93a4d21ddf80440e5030606d3edbb8b0e65dc64006');
    expect(html).not.toContain('Offline-Wörterbuch');
    // Sechs Megabyte Wörterbuch wären hier sofort sichtbar.
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(1_200_000);
  });

  test('@smoke zeigt genau ihr Paket und keine Lehrkraftbereiche', async ({ page }) => {
    const fileUrl = await exportStudentFile(page);

    const external = watchExternalRequests(page);
    const errors = watchPageErrors(page);
    await page.goto(fileUrl);

    await expect(page).toHaveTitle('Unit 3 – City life – LexiFlow');
    await expect(page.getByRole('heading', { level: 1, name: 'Unit 3 – City life' })).toBeVisible();
    await expect(page.getByText(/Klasse 8 · .* · 4 Vokabeln/)).toBeVisible();

    // Keine Lehrkraftnavigation, kein Weg ins Material.
    await expect(page.getByRole('link', { name: 'Erstellen' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Daten' })).toHaveCount(0);

    // Auch nicht über die Adresse: Lehrkraftrouten gibt es in dieser Datei nicht.
    await page.goto(`${fileUrl}#/material/import`);
    await expect(page.getByLabel('Vokabelliste einfügen')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Unit 3 – City life' })).toBeVisible();

    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });

  test('@smoke durchsehen, Karten, freie Runde und Selbsttest funktionieren', async ({ page }) => {
    const external = watchExternalRequests(page);
    const fileUrl = await exportStudentFile(page);
    await page.goto(fileUrl);

    await page.getByRole('link', { name: 'Paket öffnen' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Auf eigene Weise lernen' })).toBeVisible();

    // Durchsehen
    await page.getByRole('link', { name: 'Vokabeln durchsehen' }).click();
    await page.getByRole('button', { name: 'Alle Antworten anzeigen' }).click();
    await expect(page.getByText('überfüllt')).toBeVisible();
    await page.getByRole('link', { name: 'Zurück zum Paket' }).click();

    // Karten
    await page.getByRole('link', { name: 'Mit Karten lernen' }).click();
    await expect(page.getByText('Karte 1 von 4')).toBeVisible();
    await page.getByRole('button', { name: 'Antwort anzeigen' }).click();
    await page.getByRole('link', { name: 'Zurück zum Paket' }).click();

    // Freie Runde – ohne Wirkung auf den Lernstand
    await page.getByRole('link', { name: 'Direkt starten' }).click();
    await expect(page.getByText(/Frei üben · Aufgabe 1 von 4/)).toBeVisible();
    await page.goBack();

    // Selbsttest
    await page.getByRole('link', { name: 'Selbsttest starten' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Test zusammenstellen' })).toBeVisible();
    await page.getByRole('button', { name: 'Selbsttest starten' }).click();
    await expect(page.getByText('Aufgabe 1 von 4').first()).toBeVisible();

    expect(external).toEqual([]);
  });

  test('@smoke die Kopfnavigation führt durch die Lernwege', async ({ page }) => {
    const external = watchExternalRequests(page);
    const fileUrl = await exportStudentFile(page);
    await page.goto(fileUrl);

    await page.getByRole('link', { name: 'Paket öffnen' }).click();

    // Auf der Paketseite führt der Rückweg zur Startseite, nicht in eine
    // Bibliothek, die es in dieser Datei nicht gibt.
    const packNav = page.getByRole('navigation', { name: 'Paketnavigation' });
    await expect(packNav.getByRole('link', { name: 'Start' })).toBeVisible();
    await expect(packNav.getByRole('link', { name: 'Alle Pakete' })).toHaveCount(0);

    // Lernmodus starten – die Aktionen stehen oben, nicht am Seitenende.
    await page.getByRole('link', { name: 'Vokabeln durchsehen' }).click();
    const nav = page.getByRole('navigation', { name: 'Lernnavigation' });
    await expect(nav.getByRole('link', { name: 'Zurück zum Paket' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Mit Karten lernen' })).toBeVisible();

    // Zum Paket zurück …
    await nav.getByRole('link', { name: 'Zurück zum Paket' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Auf eigene Weise lernen' })).toBeVisible();

    // … und von dort in den Kartenmodus, der nur den Rückweg anbietet.
    await page.getByRole('link', { name: 'Mit Karten lernen' }).click();
    await expect(page.getByText('Karte 1 von 4')).toBeVisible();
    const cardNav = page.getByRole('navigation', { name: 'Lernnavigation' });
    await expect(cardNav.getByRole('link', { name: 'Zurück zum Paket' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mit Karten lernen' })).toHaveCount(0);

    // Keine Lehrkraftnavigation, keine fremde Anfrage.
    await expect(page.getByRole('link', { name: 'Erstellen' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Daten' })).toHaveCount(0);
    expect(external).toEqual([]);
  });

  test('@smoke behält den Lernstand über ein Neuladen', async ({ page }) => {
    const fileUrl = await exportStudentFile(page);
    await page.goto(fileUrl);
    await page.getByRole('link', { name: 'Paket öffnen' }).click();

    // Eine echte Lernrunde: vier Karteikarten, alle gewusst.
    await page.getByRole('checkbox', { name: /Karteikarte/ }).check();
    await page.getByRole('button', { name: 'Lernrunde starten' }).click();
    for (let step = 1; step <= 4; step += 1) {
      await expect(page.getByText(`Aufgabe ${step} von 4`)).toBeVisible();
      await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
      await page.getByRole('button', { name: 'Gewusst', exact: true }).click();
      await page.getByRole('button', { name: /^(Weiter|Runde beenden)$/ }).click();
    }
    await expect(page.getByRole('heading', { name: 'Runde abgeschlossen' })).toBeVisible();

    /*
      Chromium stellt unter file:// IndexedDB bereit – der Lernstand muss ein
      Neuladen überstehen. Tut ein Browser das nicht, sagt die Datei das offen
      (siehe „Kein dauerhafter Speicher“); dieser Test prüft den Fall, in dem
      der Speicher vorhanden ist.
    */
    const persistent = await page.evaluate(() => typeof indexedDB !== 'undefined');
    test.skip(!persistent, 'Dieser Browser stellt unter file:// keinen Speicher bereit.');

    await page.goto(fileUrl);
    await expect(page.getByText(/1 Übungsrunden bisher|Gerade ist nichts fällig/).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('link', { name: 'Paket öffnen' }).click();
    await expect(page.getByText(/Gerade ist nichts fällig/)).toBeVisible();
  });

  test('@a11y Startseite und Paketseite ohne schwerwiegende Befunde', async ({ page }) => {
    const fileUrl = await exportStudentFile(page);
    await page.goto(fileUrl);

    await expectNoSeriousViolations(page, 'Schülerdatei – Startseite');
    await page.getByRole('link', { name: 'Paket öffnen' }).click();
    await expectNoSeriousViolations(page, 'Schülerdatei – Paketseite');
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y kein horizontaler Überlauf auf 390 px', async ({ page }) => {
      const fileUrl = await exportStudentFile(page);
      await page.goto(fileUrl);

      for (const step of ['start', 'paket'] as const) {
        if (step === 'paket') await page.getByRole('link', { name: 'Paket öffnen' }).click();
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
        }));
        expect(overflow.scrollWidth, step).toBeLessThanOrEqual(overflow.clientWidth + 1);
        expect(overflow.bodyScrollWidth, step).toBeLessThanOrEqual(overflow.clientWidth + 1);
      }
      await expectNoSeriousViolations(page, 'Schülerdatei auf 390 px');
    });
  });
});
