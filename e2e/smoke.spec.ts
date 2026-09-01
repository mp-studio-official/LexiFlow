import { expect, test } from '@playwright/test';

const VOCAB_LIST = [
  'crowded\tüberfüllt, voll',
  'neighbourhood\tNachbarschaft, Viertel',
  'litter\tMüll',
  'quiet\truhig, leise',
].join('\n');

test.describe('LexiFlow – Grundablauf', () => {
  test('@smoke Material erstellen, speichern und üben', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        externalRequests.push(request.url());
    });

    // 1. Startseite
    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Vokabelarbeit, die sich nicht nach Verwaltung anfühlt.',
      }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /^LexiFlow/ })).toBeVisible();

    // 2. Lehrkraft-Bereich ohne Login
    await page.getByRole('link', { name: 'Material erstellen', exact: true }).first().click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Was willst du heute erstellen?' }),
    ).toBeVisible();
    await expect(page.getByLabel('Passwort')).toHaveCount(0);

    // 3. Import über Copy-and-paste
    await page.getByRole('button', { name: 'Neues Paket aus Liste erstellen' }).click();
    await page.getByLabel('Vokabelliste einfügen').fill(VOCAB_LIST);
    await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();

    // 4. Importvorschau mit Spaltenerkennung und Bearbeitung
    await expect(page.getByText('4 Zeilen ·')).toBeVisible();
    await expect(page.getByLabel('Englisch, Zeile 1', { exact: true })).toHaveValue('crowded');
    await expect(page.getByLabel('Deutsch, Zeile 1', { exact: true })).toHaveValue('überfüllt, voll');

    // 4b. Detailbereich: mehrere Beispielsätze bearbeiten
    await page.getByRole('button', { name: 'Beispielsatz für crowded bearbeiten' }).click();
    await page.getByRole('button', { name: 'Beispielsatz hinzufügen, crowded' }).click();
    await page
      .getByLabel('Beispielsatz 1 Englisch, crowded')
      .fill('The bus was crowded this morning.');
    await page.getByLabel('Beispielsatz 1 Deutsch, crowded').fill('Der Bus war heute voll.');
    await page.getByRole('button', { name: 'Beispielsatz hinzufügen, crowded' }).click();
    await page.getByLabel('Beispielsatz 2 Englisch, crowded').fill('It is always crowded here.');
    await page.getByRole('button', { name: 'Beispielsatz für crowded schließen' }).click();

    // 5. Metadaten inklusive automatischem GeR-Vorschlag
    await page.getByLabel('Titel', { exact: true }).fill('Unit 3 – City life');
    await page.getByLabel('Thema').fill('City');
    await page.getByLabel('Jahrgang').selectOption('7');
    await expect(page.getByLabel('GeR-Niveau')).toHaveValue('A2+');
    await page.getByLabel('Lernrichtung').selectOption('both');
    await page.getByRole('button', { name: /Paket speichern/ }).click();

    // 6. Paket ist gespeichert und bearbeitbar
    await expect(page.getByRole('heading', { level: 1, name: 'Unit 3 – City life' })).toBeVisible();

    // 7. Schülerbereich: getrennte Lernstände, neue Vokabeln als eigene Kategorie
    await page.getByRole('link', { name: 'Im Schülerbereich ansehen' }).click();
    await expect(page.getByText(/0 von 4 Vokabeln sicher/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Englisch → Deutsch (rezeptiv)' })).toBeVisible();
    await expect(page.getByText('Neu: 4 · Fach 1: 0 · Fach 2: 0 · Fach 3: 0 · Fach 4: 0 · Fach 5: 0')).toBeVisible();

    // Produktiv ist zunächst gesperrt und wird verständlich erklärt.
    await expect(page.getByRole('heading', { name: 'Deutsch → Englisch (produktiv)' })).toBeVisible();
    await expect(
      page.getByText(/Produktiv noch nicht begonnen – wird nach der ersten erfolgreichen/),
    ).toBeVisible();

    // 8. Übung: neue Vokabeln werden zunächst nur rezeptiv eingeführt (4, nicht 8).
    await page.getByRole('button', { name: 'Lernrunde starten' }).click();
    await expect(page.getByText('Aufgabe 1 von 4')).toBeVisible();

    // 9. Direktes Feedback und Wiedervorlage innerhalb der Runde
    await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
    await page.getByRole('button', { name: 'Noch nicht gewusst' }).click();
    await expect(page.getByText('Noch nicht richtig', { exact: true })).toBeVisible();
    await expect(page.getByText('Diese Aufgabe kommt in dieser Runde noch einmal.')).toBeVisible();

    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await expect(page.getByText('Aufgabe 2 von 5')).toBeVisible();

    // 10. Lernstand bleibt lokal erhalten
    await page.goto('/#/lernen');
    await expect(page.getByText(/0 von 4 sicher/)).toBeVisible();

    // 11. Keine Netzwerkübertragung an fremde Ziele
    expect(externalRequests).toEqual([]);
  });

  test('@smoke Runde 1 rezeptiv, Runde 2 genau vier produktiv', async ({ page }) => {
    // Paket mit vier Vokabeln und beiden Richtungen anlegen.
    await page.goto('/#/material/import');
    await page.getByLabel('Vokabelliste einfügen').fill(VOCAB_LIST);
    await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
    await page.getByLabel('Titel', { exact: true }).fill('Staffelung');
    await page.getByLabel('Lernrichtung').selectOption('both');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await page.getByRole('link', { name: 'Im Schülerbereich ansehen' }).click();

    // Ehrliche Rundenvorschau: vier bereit, keine acht.
    await expect(page.getByText(/4 Aufgaben sind jetzt bereit/)).toBeVisible();
    await expect(page.getByRole('option', { name: 'Alle bereiten (4)' })).toBeAttached();
    await expect(page.getByRole('option', { name: 'Alle bereiten (8)' })).toHaveCount(0);

    // ---------- Runde 1: vier rezeptive Aufgaben ----------
    await page.getByRole('button', { name: 'Lernrunde starten' }).click();
    await expect(page.getByText('Aufgabe 1 von 4')).toBeVisible();
    await expect(page.getByText(/Englisch → Deutsch \(rezeptiv\)/)).toBeVisible();

    for (let i = 1; i <= 4; i += 1) {
      await expect(page.getByText(`Aufgabe ${i} von 4`)).toBeVisible();
      await expect(page.getByText(/Englisch → Deutsch \(rezeptiv\)/)).toBeVisible();
      await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
      await page.getByRole('button', { name: 'Gewusst', exact: true }).click();
      await page.getByRole('button', { name: /^(Weiter|Runde beenden)$/ }).click();
    }

    // ---------- Runde 2: genau vier produktive Aufgaben ----------
    await expect(page.getByRole('heading', { name: 'Runde abgeschlossen' })).toBeVisible();
    await expect(page.getByText(/4 Aufgaben sind weiterhin bereit/)).toBeVisible();
    await page.getByRole('button', { name: 'Neue Runde' }).click();

    await expect(page.getByText('Aufgabe 1 von 4')).toBeVisible();
    await expect(page.getByText(/Deutsch → Englisch \(produktiv\)/)).toBeVisible();

    // Die rezeptiven Aufgaben sind erst morgen wieder fällig und fehlen hier.
    for (let i = 1; i <= 4; i += 1) {
      await expect(page.getByText(`Aufgabe ${i} von 4`)).toBeVisible();
      await expect(page.getByText(/Deutsch → Englisch \(produktiv\)/)).toBeVisible();
      await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
      await page.getByRole('button', { name: 'Gewusst', exact: true }).click();
      await page.getByRole('button', { name: /^(Weiter|Runde beenden)$/ }).click();
    }

    // ---------- Danach ist nichts mehr fällig ----------
    await expect(page.getByRole('heading', { name: 'Runde abgeschlossen' })).toBeVisible();
    await expect(page.getByText(/Die nächste Wiederholung steht/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Neue Runde' })).toBeDisabled();

    await page.goto(`/#/lernen`);
    await page.getByRole('link', { name: 'Öffnen' }).click();
    await expect(page.getByText(/Gerade ist nichts fällig/)).toBeVisible();
    // Seit Sprint 2A.2 ist nur der Lernplan gesperrt – frei üben geht weiter.
    // Seit Sprint 3B.2b führt dorthin genau eine Karte – mit zwei Wegen:
    // sofort loslegen oder die Runde vorher anpassen.
    await expect(page.getByRole('button', { name: 'Lernrunde starten' })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Direkt starten' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Runde anpassen' })).toBeVisible();
  });

  test('@smoke Export, erneuter Import und Bestätigung', async ({ page }) => {
    await page.goto('/#/material/import');
    await page.getByLabel('Vokabelliste einfügen').fill('litter\tMüll\nquiet\truhig');
    await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
    await page.getByLabel('Titel', { exact: true }).fill('Export-Test');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Export-Test' })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Als .vocabpack.json exportieren' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('export-test-5.vocabpack.json');
    const file = await download.path();

    // Erneuter Import derselben Paket-ID: Bestätigung statt stillem Überschreiben.
    await page.goto('/#/lernen');
    await page.getByLabel('Vokabelpaket auswählen').setInputFiles(file);
    await expect(page.getByText('Dieses Paket ist bereits vorhanden')).toBeVisible();

    await page.getByRole('button', { name: 'Paket aktualisieren' }).click();
    await expect(page.getByText(/2 Lernstände erhalten/)).toBeVisible();
  });
});
