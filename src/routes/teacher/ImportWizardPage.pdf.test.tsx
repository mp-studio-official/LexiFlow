import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ImportWizardPage } from './ImportWizardPage';
import { ProviderRegistry } from '../../providers/ProviderContext';
import { clearAllLocalData } from '../../data/db';
import { NO_TEXT_MESSAGE } from '../../import/pdfText';

/**
 * Der ganze Weg: PDF auswählen → Text prüfen → gegliederte Liste → Entwürfe.
 *
 * Die Einzelteile sind anderswo geprüft (`pdfText.test.ts`,
 * `structuredList.test.ts`). Hier geht es um die Naht dazwischen – und die ist
 * die interessantere Stelle: Ein Parser, der für sich richtig arbeitet, aber
 * am falschen Knopf hängt, ist genauso kaputt wie ein falscher Parser.
 *
 * Gearbeitet wird mit **echten** PDF-Dateien aus `src/import/fixtures/`, nicht
 * mit einem nachgebauten `extractPdfText`. Ein Doppelgänger hätte den Fehler
 * mit der fehlenden `Promise.try`-Argumentweitergabe nicht gefunden, weil er
 * pdf.js gar nicht erst aufgerufen hätte.
 */

const fixtures = resolve(import.meta.dirname, '../../import/fixtures');

function pdfFile(name: string): File {
  const bytes = readFileSync(resolve(fixtures, name));
  return new File([bytes], name, { type: 'application/pdf' });
}

function setup(query = ''): ReturnType<typeof userEvent.setup> {
  render(
    <ProviderRegistry>
      <MemoryRouter initialEntries={[`/material/import${query}`]}>
        <Routes>
          <Route path="/material/import" element={<ImportWizardPage />} />
          <Route path="/material/:packId" element={<p>Paketseite</p>} />
        </Routes>
      </MemoryRouter>
    </ProviderRegistry>,
  );
  return userEvent.setup();
}

beforeEach(async () => {
  await clearAllLocalData();
});

describe('PDF als Importquelle', () => {
  it('ist über die Adresse direkt erreichbar', async () => {
    setup('?quelle=pdf');

    expect(await screen.findByLabelText('PDF-Datei auswählen')).toBeInTheDocument();
    // Und die Zusage steht daneben, nicht im Kleingedruckten.
    expect(screen.getByText(/auf diesem Gerät/)).toBeInTheDocument();
    expect(screen.getByText(/nichts wird hochgeladen/)).toBeInTheDocument();
  });

  it('liest eine echte PDF und zeigt den Text zur Prüfung', async () => {
    const user = setup('?quelle=pdf');
    const input = await screen.findByLabelText('PDF-Datei auswählen');

    await user.upload(input, pdfFile('text-sample.pdf'));

    const preview = await screen.findByLabelText('Erkannter Text', {}, { timeout: 30_000 });
    expect((preview as HTMLTextAreaElement).value).toContain('to coin a phrase / term');
    expect((preview as HTMLTextAreaElement).value).toContain('translation:');
    // Nichts ist übernommen, solange niemand es übernimmt.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  }, 60_000);

  it('übernimmt den geprüften Text als Entwürfe', async () => {
    const user = setup('?quelle=pdf');
    const input = await screen.findByLabelText('PDF-Datei auswählen');
    await user.upload(input, pdfFile('text-sample.pdf'));
    await screen.findByLabelText('Erkannter Text', {}, { timeout: 30_000 });

    await user.click(screen.getByRole('button', { name: 'Text übernehmen' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByLabelText('Englisch, Zeile 1')).toHaveValue('to coin a phrase / term');
    /*
      Die Prüfsteinsdatei enthält „translation: einen Begriff, eine Redewendung
      praegen“ – **eine** Antwort mit einem Komma darin. Käme hier „einen
      Begriff“ an, wäre die Kommaschutzregel aus Phase 1 auf dem PDF-Weg
      verlorengegangen.
    */
    expect(screen.getByLabelText('Deutsch, Zeile 1')).toHaveValue(
      'einen Begriff, eine Redewendung praegen',
    );
  }, 60_000);

  it('lehnt eine gescannte PDF ehrlich ab, statt Text zu erfinden', async () => {
    const user = setup('?quelle=pdf');
    const input = await screen.findByLabelText('PDF-Datei auswählen');

    await user.upload(input, pdfFile('scanned-sample.pdf'));

    expect(await screen.findByText(NO_TEXT_MESSAGE, {}, { timeout: 30_000 })).toBeInTheDocument();
    expect(screen.queryByLabelText('Erkannter Text')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // Der Weg bleibt offen: Es lässt sich sofort eine andere Datei wählen.
    expect(screen.getByLabelText('PDF-Datei auswählen')).toBeInTheDocument();
  }, 60_000);

  it('nimmt keine Datei an, die keine PDF ist', async () => {
    setup('?quelle=pdf');
    const input = await screen.findByLabelText('PDF-Datei auswählen');

    /*
      Hier bewusst `fireEvent` statt `userEvent.upload`: Letzteres achtet das
      `accept`-Attribut und ließe die Datei gar nicht erst durch – geprüft
      würde dann die Bibliothek, nicht unser Code. Im Browser ist `accept` aber
      nur ein Vorschlag an den Dateidialog: Wer eine Datei fallen lässt oder im
      Dialog „alle Dateien“ wählt, umgeht es. Genau dieser Fall steht hier.
    */
    fireEvent.change(input, {
      target: { files: [new File(['englisch;deutsch'], 'liste.csv', { type: 'text/csv' })] },
    });

    expect(await screen.findByText(/ist keine PDF-Datei/)).toBeInTheDocument();
  }, 30_000);
});

describe('Eine gegliederte Liste beim Einfügen', () => {
  /*
    Genau die Form, die aus einem PDF-Vokabelanhang herausfällt: Aufzählung,
    Wortartkürzel in Klammern, „translation:“ und „context/example:“.
  */
  const GEGLIEDERT = [
    '• to coin a phrase / term (v.)',
    '  context/example: The term was coined in 1990.',
    '  translation: eine Wendung prägen',
    '',
    '• crowded (adj.)',
    '  translation: überfüllt, voll',
  ].join('\n');

  it('erkennt sie als solche und trennt Wortart und Beispielsatz ab', async () => {
    const user = setup();
    await user.click(screen.getByLabelText('Vokabelliste einfügen'));
    await user.paste(GEGLIEDERT);
    await user.click(screen.getByRole('button', { name: 'Weiter zur Vorschau' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByLabelText('Englisch, Zeile 1')).toHaveValue('to coin a phrase / term');
    expect(screen.getByLabelText('Deutsch, Zeile 1')).toHaveValue('eine Wendung prägen');
    // 4B.3: Ein geschriebenes Wortartkürzel bleibt in der Lernform stehen –
    // die Quelle sagt „crowded (adj.)“, und genau das gehört auf die Karte.
    expect(screen.getByLabelText('Englisch, Zeile 2')).toHaveValue('crowded (adj.)');
    expect(screen.getByLabelText('Deutsch, Zeile 2')).toHaveValue('überfüllt, voll');
  });

  it('lässt das Komma in der Übersetzung stehen', async () => {
    /*
      Die Zusage aus Phase 1, hier am ganzen Weg geprüft: „überfüllt, voll“ ist
      **eine** Antwort mit einem Komma darin, nicht zwei Antworten. Getrennt
      wird ausschließlich am Semikolon.
    */
    const user = setup();
    await user.click(screen.getByLabelText('Vokabelliste einfügen'));
    await user.paste(GEGLIEDERT);
    await user.click(screen.getByRole('button', { name: 'Weiter zur Vorschau' }));
    await screen.findByRole('table');

    expect(screen.getByLabelText('Deutsch, Zeile 2')).toHaveValue('überfüllt, voll');
    expect(screen.getByLabelText('Deutsch, Zeile 2')).not.toHaveValue('überfüllt; voll');
  });

  it('benennt Zeilen, die es keiner Vokabel zuordnen konnte', async () => {
    const user = setup();
    await user.click(screen.getByLabelText('Vokabelliste einfügen'));
    await user.paste(`Unit 7 – Vokabelanhang\nSeite 143\n\n${GEGLIEDERT}`);
    await user.click(screen.getByRole('button', { name: 'Weiter zur Vorschau' }));
    await screen.findByRole('table');

    /*
      Zwei Aussagen in einer: Die Kopfzeile ist **nicht** als Vokabel mit leerer
      Übersetzung angelegt worden (Zeile 1 ist die erste echte Vokabel) – und
      sie ist trotzdem **nicht verschwunden**, sondern steht sichtbar in der
      Liste der nicht zugeordneten Zeilen. Beides zusammen ist der Punkt:
      wegräumen ohne zu unterschlagen.
    */
    expect(screen.getByLabelText('Englisch, Zeile 1')).toHaveValue('to coin a phrase / term');
    expect(screen.queryByLabelText('Englisch, Zeile 3')).not.toBeInTheDocument();

    await waitFor(() => {
      const genannt = screen
        .getAllByRole('listitem')
        .map((item) => item.textContent ?? '')
        .join(' | ');
      expect(genannt).toContain('Seite 143');
      expect(genannt).toContain('Unit 7 – Vokabelanhang');
    });
  });

  it('behandelt eine einfache Tabulatorliste weiterhin als solche', async () => {
    // Die Erkennung darf den bisherigen Weg nicht kapern.
    const user = setup();
    await user.click(screen.getByLabelText('Vokabelliste einfügen'));
    await user.paste('to apologise\tsich entschuldigen\ncrowded\tvoll, überfüllt');
    await user.click(screen.getByRole('button', { name: 'Weiter zur Vorschau' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByLabelText('Englisch, Zeile 1')).toHaveValue('to apologise');
    expect(screen.getByLabelText('Deutsch, Zeile 2')).toHaveValue('voll, überfüllt');
    expect(screen.queryByText(/keiner Vokabel/)).not.toBeInTheDocument();
  });
});
