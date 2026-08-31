import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 3B.1: Textqualität, Übersetzung und Lernrichtungen – der ganze Weg.
 *
 * Der Text ist bewusst selbst geschrieben und kurz. Er enthält genau die drei
 * Fälle, um die es geht: `island` neben `islands`, die Einheit „600 sq mi“ und
 * genug gewöhnliche Wörter, damit die Auswahl etwas zu entscheiden hat. Kein
 * Wikipedia-Absatz, keine Zitate, keine echten Modelle.
 */

const TEXT = [
  'The bay lies in the north of the country.',
  'One island rises straight out of the calm water.',
  'Around 1,969 islands fill the bay, and the islands attract many visitors.',
  'The protected area covers about 600 sq mi.',
  'Small boats reach the quiet caves every morning.',
].join(' ');

/** Ein Browser ganz ohne eingebaute Modelle – der Normalfall. */
async function withoutBrowserModels(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined });
    Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: undefined });
  });
}

/**
 * Eine nachgebaute Translator-API. Sie lädt nichts herunter und übersetzt
 * deterministisch – der Test prüft den Ablauf, nicht die Übersetzungsqualität.
 */
async function withFakeTranslator(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: undefined });

    const GERMAN: Record<string, string> = {
      island: 'die Insel',
      bay: 'die Bucht',
      water: 'das Wasser',
      'square mile (sq mi)': 'die Quadratmeile',
    };

    class FakeTranslator {
      static availability(): Promise<string> {
        return Promise.resolve('downloadable');
      }

      static create(options?: {
        monitor?: (monitor: {
          addEventListener: (type: string, listener: (event: unknown) => void) => void;
        }) => void;
      }): Promise<{ translate: (text: string) => Promise<string>; destroy: () => void }> {
        options?.monitor?.({
          addEventListener: (type, listener) => {
            if (type === 'downloadprogress') listener({ loaded: 1, total: 1 });
          },
        });
        return Promise.resolve({
          translate: (text: string) => Promise.resolve(GERMAN[text] ?? `[de] ${text}`),
          destroy: () => undefined,
        });
      }
    }

    Object.defineProperty(globalThis, 'Translator', {
      configurable: true,
      value: FakeTranslator,
    });
  });
}

/** Alles, was nicht der lokale Testserver ist, wäre ein Fehler. */
function watchExternalRequests(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') external.push(request.url());
  });
  return external;
}

test.describe('Textqualität und Lernrichtungen', () => {
  test('@smoke vom Text mit Wortformen und Abkürzung bis zum Üben in beide Richtungen', async ({
    page,
  }) => {
    const externalRequests = watchExternalRequests(page);
    await withFakeTranslator(page);

    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').fill(TEXT);

    // 1. Die gewünschte Anzahl wird vor der Analyse gewählt.
    await page.getByLabel('Gewünschte Anzahl Vokabelvorschläge').selectOption('30');

    // 2. Mit ladbarem Modell verspricht die Hauptaktion auch Übersetzungen.
    const analyze = page.getByRole('button', {
      name: 'Text analysieren und Übersetzungen vorschlagen',
    });
    await expect(analyze).toBeVisible();
    await analyze.click();

    await expect(page.getByRole('heading', { name: /Gefundene Vokabelkandidaten/ })).toBeVisible();

    // 3. Ehrliche Mengenanzeige – bezogen auf den Wunsch, nicht auf den Fund.
    await expect(page.getByText(/von 30 geeigneten Vokabeln gefunden\./).first()).toBeVisible();

    // 4. „island“ und „islands“ sind ein Vorschlag mit gemeinsamer Häufigkeit.
    await expect(page.getByText('Im Text: islands, island · insgesamt 3-mal')).toBeVisible();
    await expect(page.getByText(/Plural: islands/)).toBeVisible();
    await expect(page.getByLabel('Deutsche Antwort für „islands“')).toHaveCount(0);

    // 5. „600 sq mi“ ist ein Vorschlag mit Langform – und keine Bruchstücke.
    await expect(page.getByLabel('Langform für „sq mi“')).toHaveValue('square mile (sq mi)');
    await expect(page.getByLabel('Deutsche Antwort für „sq“')).toHaveCount(0);
    await expect(page.getByLabel('Deutsche Antwort für „mi“')).toHaveCount(0);

    // 6. Der eine Klick genügt: Die Vorschläge laufen nach der Vorbereitung von
    //    selbst an. Ein zweiter Knopf wird hier bewusst nicht gedrückt.
    await expect(
      page.getByRole('button', { name: 'Vorschlag für island übernehmen' }),
    ).toBeVisible({ timeout: 15_000 });

    // Vorgeschlagen ist nicht übernommen: Das Feld bleibt leer.
    await expect(page.getByLabel('Deutsche Antwort für „island“')).toHaveValue('');
    await page.getByRole('button', { name: 'Vorschlag für island übernehmen' }).click();
    await expect(page.getByLabel('Deutsche Antwort für „island“')).toHaveValue('die Insel');

    // Der Abkürzungsvorschlag stammt aus dem Lexikon, nicht aus dem Modell.
    await expect(page.getByText('die Quadratmeile')).toBeVisible();

    await page.getByRole('button', { name: 'Keine auswählen' }).click();
    // Ausdrücklich die Auswahlkästchen: „… übernehmen“ heißt jetzt auch der
    // Knopf am Vorschlag.
    await page.getByRole('checkbox', { name: 'island übernehmen' }).check();
    await page.getByRole('checkbox', { name: 'bay übernehmen' }).check();
    await page.getByLabel('Deutsche Antwort für „bay“').fill('die Bucht');

    await page.getByRole('button', { name: /2 Vokabeln in die Vorschau übernehmen/ }).click();

    // 7. Speichern – neue Pakete stehen auf „beide Richtungen“.
    await page.getByRole('button', { name: 'Weiter zu den Metadaten' }).click();
    await expect(page.getByLabel('Lernrichtung')).toHaveValue('both');
    await page.getByLabel('Titel', { exact: true }).fill('Halong Bay – aus einem Text');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Halong Bay – aus einem Text' }),
    ).toBeVisible();

    // 8. Schülerbereich: die Richtung ist eine Wahl, keine Vorschrift.
    await page.getByRole('link', { name: 'Im Schülerbereich ansehen' }).click();
    await expect(page.getByRole('radio', { name: 'Gemischt' })).toBeChecked();

    // Gemischt: die Staffelung gilt, also zuerst Englisch → Deutsch.
    await page.getByRole('button', { name: 'Lernrunde starten' }).click();
    await expect(page.getByText(/Englisch → Deutsch \(rezeptiv\)/)).toBeVisible();
    // Mitten in der Runde gibt es bewusst keinen Ausstiegsknopf; der
    // Browserzurück führt zur Paketseite.
    await page.goBack();

    // Ausdrücklich gewählt: Deutsch → Englisch, ohne jede Freischaltung.
    await page.getByRole('radio', { name: 'Deutsch → Englisch' }).check();
    await page.getByRole('button', { name: 'Lernrunde starten' }).click();
    await expect(page.getByText(/Deutsch → Englisch \(produktiv\)/)).toBeVisible();

    // 9. Kein einziger Zugriff auf einen fremden Host.
    expect(externalRequests).toEqual([]);
  });

  test('@smoke bleibt ohne Übersetzungsmodell vollständig benutzbar', async ({ page }) => {
    const externalRequests = watchExternalRequests(page);
    await withoutBrowserModels(page);

    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').fill(TEXT);

    // Ohne Modell verspricht die Schaltfläche keine Übersetzung.
    await page.getByRole('button', { name: 'Text lokal analysieren' }).click();
    await expect(page.getByRole('heading', { name: /Gefundene Vokabelkandidaten/ })).toBeVisible();

    // Die Analyse ist vollständig – inklusive Wortformen und Abkürzung.
    await expect(page.getByText('Im Text: islands, island · insgesamt 3-mal')).toBeVisible();
    await expect(page.getByLabel('Langform für „sq mi“')).toHaveValue('square mile (sq mi)');

    // Der Grund steht dabei, und die Handeingabe funktioniert.
    await expect(page.getByText(/Dieser Browser bietet keine lokale Übersetzung/)).toBeVisible();

    // Der lokal bekannte Abkürzungsvorschlag braucht kein Modell.
    await expect(page.getByText('lokaler Vorschlag')).toBeVisible();
    await expect(page.getByText('die Quadratmeile')).toBeVisible();
    await expect(page.getByLabel('Deutsche Antwort für „square mile (sq mi)“')).toHaveValue('');
    await page.getByLabel('Deutsche Antwort für „island“').fill('die Insel');
    await expect(page.getByLabel('Deutsche Antwort für „island“')).toHaveValue('die Insel');

    expect(externalRequests).toEqual([]);
  });

  test('@smoke freies Üben bietet beide Richtungen sofort an', async ({ page }) => {
    await withoutBrowserModels(page);

    // Ein Paket über die Werkstatt anzulegen wäre hier nur Umweg: Der Test
    // prüft die Richtungswahl, nicht noch einmal den Import.
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').fill(TEXT);
    await page.getByLabel('Gewünschte Anzahl Vokabelvorschläge').selectOption('30');
    await page.getByRole('button', { name: /^Text (lokal )?analysieren/ }).click();
    await page.getByRole('button', { name: 'Keine auswählen' }).click();

    for (const [english, german] of [
      ['island', 'die Insel'],
      ['bay', 'die Bucht'],
      ['water', 'das Wasser'],
      ['cave', 'die Höhle'],
    ] as const) {
      await page.getByLabel(`${english} übernehmen`).check();
      await page.getByLabel(`Deutsche Antwort für „${english}“`).fill(german);
    }

    await page.getByRole('button', { name: /4 Vokabeln in die Vorschau übernehmen/ }).click();
    await page.getByRole('button', { name: 'Weiter zu den Metadaten' }).click();
    await page.getByLabel('Titel', { exact: true }).fill('Halong Bay – frei üben');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await page.getByRole('link', { name: 'Im Schülerbereich ansehen' }).click();

    // Freies Üben: acht Aufgaben, vier Vokabeln in zwei Richtungen.
    await page.getByRole('radio', { name: 'Frei üben' }).check();
    await expect(page.getByText(/8 Aufgaben sind zum freien Üben verfügbar/)).toBeVisible();
  });
});
