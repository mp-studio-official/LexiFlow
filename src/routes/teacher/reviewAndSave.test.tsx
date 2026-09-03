import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ImportWizardPage } from './ImportWizardPage';
import { ProviderRegistry } from '../../providers/ProviderContext';

/**
 * Schritt 3: **Prüfen & Speichern**.
 *
 * Der Schritt, in dem sich entscheidet, ob eine halbe Stunde Arbeit ein Paket
 * wird. Vier Zusagen stehen hier auf dem Prüfstand:
 *
 * 1. Man sieht, welche Seite Englisch und welche Deutsch ist.
 * 2. „Bitte prüfen“ steht nur dort, wo es etwas zu **entscheiden** gibt.
 * 3. Eine Bestätigung ist eine fachliche Entscheidung und verfällt, wenn sich
 *    der beanstandete Sachverhalt ändert.
 * 4. Ein blockiertes Speichern sagt, wie viel offen ist, und **springt hin**.
 */

/** Eine Liste, aus der die geprüften Fälle entstehen. */
const LISTE = ['island\tdie Insel', 'bay\t', 'water\tdas Wasser', 'island\tdie Insel'].join('\n');

function setup() {
  render(
    <ProviderRegistry>
      <MemoryRouter initialEntries={['/material/import?quelle=paste']}>
        <Routes>
          <Route path="/material/import" element={<ImportWizardPage />} />
          <Route path="/material/:packId" element={<p>Paketseite</p>} />
        </Routes>
      </MemoryRouter>
    </ProviderRegistry>,
  );
  return userEvent.setup();
}

async function toReview(user: ReturnType<typeof userEvent.setup>, text = LISTE) {
  await user.click(screen.getByLabelText('Vokabelliste einfügen'));
  await user.paste(text);
  await user.click(screen.getByRole('button', { name: 'Weiter zur Vorschau' }));
  await screen.findByRole('table');
}

/** Die Tabellenzeile einer Vokabel – über ihr englisches Feld. */
function rowOf(english: string): HTMLElement {
  const field = screen.getAllByDisplayValue(english)[0];
  const row = field?.closest('tr');
  if (!row) throw new Error(`Keine Zeile für ${english}`);
  return row;
}

describe('Englisch und Deutsch sind unterscheidbar', () => {
  it('stellt jedem Feld sein Kürzel voran', async () => {
    const user = setup();
    await toReview(user);

    const zeile = rowOf('island');
    expect(within(zeile).getByText('ENG')).toBeInTheDocument();
    expect(within(zeile).getByText('DE')).toBeInTheDocument();
  });

  it('lässt die Kürzel für Vorlesehilfen weg', async () => {
    /*
      Die Felder tragen ihre Beschriftung schon („Englisch, Zeile 3“). Das
      Kürzel doppelt sie für die Augen; vorgelesen wäre es eine zweite,
      kürzere Fassung derselben Auskunft.
    */
    const user = setup();
    await toReview(user);
    expect(within(rowOf('island')).getByText('ENG')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('„Bitte prüfen“ steht nur, wo es etwas zu entscheiden gibt', () => {
  it('lässt eine vollständige Zeile auf „OK“', async () => {
    const user = setup();
    await toReview(user);
    expect(within(rowOf('water')).getByText('OK')).toBeInTheDocument();
    expect(
      within(rowOf('water')).queryByRole('button', { name: /als geprüft bestätigen/i }),
    ).not.toBeInTheDocument();
  });

  it('bietet der Zeile mit offenem Befund die Bestätigung an', async () => {
    const user = setup();
    await toReview(user);

    // Die zweite `island`-Zeile ist ein Duplikat – ein Befund, über den jemand
    // entscheiden muss.
    const doppelt = screen.getAllByDisplayValue('island')[1]?.closest('tr');
    expect(doppelt).toBeTruthy();
    expect(within(doppelt as HTMLElement).getByText('Bitte prüfen')).toBeInTheDocument();
    expect(
      within(doppelt as HTMLElement).getByRole('button', {
        name: 'Befund zu „island“ als geprüft bestätigen',
      }),
    ).toBeInTheDocument();
  });

  it('bietet der Zeile mit echtem Fehler keine Bestätigung an', async () => {
    /*
      Eine fehlende Übersetzung ist nichts zum Bestätigen – sie ist etwas zum
      Eintragen. Ein Knopf „Als geprüft bestätigen“ daneben wäre ein Angebot,
      den Fehler wegzuklicken.
    */
    const user = setup();
    await toReview(user);
    const zeile = rowOf('bay');
    expect(within(zeile).getByText('Bitte prüfen')).toBeInTheDocument();
    expect(
      within(zeile).queryByRole('button', { name: /als geprüft bestätigen/i }),
    ).not.toBeInTheDocument();
  });
});

describe('Die Bestätigung ist an einen Sachverhalt gebunden', () => {
  it('macht aus „Bitte prüfen“ ein „Geprüft“', async () => {
    const user = setup();
    await toReview(user);

    await user.click(
      screen.getByRole('button', { name: 'Befund zu „island“ als geprüft bestätigen' }),
    );

    const doppelt = screen.getAllByDisplayValue('island')[1]?.closest('tr');
    expect(within(doppelt as HTMLElement).getByText('Geprüft')).toBeInTheDocument();
  });

  it('verfällt, sobald sich die Übersetzung ändert', async () => {
    const user = setup();
    await toReview(user);

    await user.click(
      screen.getByRole('button', { name: 'Befund zu „island“ als geprüft bestätigen' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Befund zu „island“ als geprüft bestätigen' }),
    ).not.toBeInTheDocument();

    // Dieselbe Zeile, andere Antwort – die Entscheidung galt für etwas anderes.
    await user.type(screen.getByLabelText('Deutsch, Zeile 4'), ' (Eiland)');

    expect(
      await screen.findByRole('button', { name: /als geprüft bestätigen/i }),
    ).toBeInTheDocument();
  });
});

describe('Blockiertes Speichern springt zur Stelle', () => {
  it('meldet die Zahl der offenen Stellen und die erste', async () => {
    const user = setup();
    await toReview(user);

    await user.click(screen.getByRole('button', { name: /Paket speichern/ }));

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent(/Speichern ist noch nicht möglich/);
    expect(meldung).toHaveTextContent(/Das Paket braucht einen Titel/);
  });

  it('setzt den Fokus auf den fehlenden Titel', async () => {
    const user = setup();
    await toReview(user);

    await user.click(screen.getByRole('button', { name: /Paket speichern/ }));

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('Titel', { exact: true })),
    );
  });

  it('geht danach zur nächsten Stelle über – der fehlenden Antwort', async () => {
    const user = setup();
    await toReview(user);

    await user.type(screen.getByLabelText('Titel', { exact: true }), 'Unit 3');
    await user.click(screen.getByRole('button', { name: /Paket speichern/ }));

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('Deutsch, Zeile 2')),
    );
  });

  it('führt zuletzt auf die Bestätigung der offenen Prüfzeile', async () => {
    const user = setup();
    await toReview(user);

    await user.type(screen.getByLabelText('Titel', { exact: true }), 'Unit 3');
    await user.type(screen.getByLabelText('Deutsch, Zeile 2'), 'die Bucht');
    await user.click(screen.getByRole('button', { name: /Paket speichern/ }));

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Befund zu „island“ als geprüft bestätigen' }),
      ),
    );
  });

  it('macht jede weitere Stelle erreichbar, nicht nur die erste', async () => {
    const user = setup();
    await toReview(user);
    await user.click(screen.getByRole('button', { name: /Paket speichern/ }));

    const liste = await screen.findByText(/Alle \d+ offenen Stellen/);
    await user.click(liste);
    // Die Reihenfolge ist die vereinbarte: Titel, fehlende Antwort, Prüffrage.
    const aufklapper = liste.closest('details') as HTMLElement;
    const punkte = within(aufklapper)
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '');
    expect(punkte[0]).toMatch(/Titel/);
    expect(punkte[1]).toMatch(/deutsche Antwort/);
    expect(punkte[2]).toMatch(/mehrfach vor/);
  });

  it('speichert, sobald nichts mehr offen ist', async () => {
    const user = setup();
    await toReview(user);

    await user.type(screen.getByLabelText('Titel', { exact: true }), 'Unit 3');
    await user.type(screen.getByLabelText('Deutsch, Zeile 2'), 'die Bucht');
    await user.click(
      screen.getByRole('button', { name: 'Befund zu „island“ als geprüft bestätigen' }),
    );
    await user.click(screen.getByRole('button', { name: /Paket speichern/ }));

    expect(await screen.findByText('Paketseite')).toBeInTheDocument();
  });
});

describe('Eine klebende Leiste, nicht zwei', () => {
  it('zeigt in Schritt 3 genau eine', async () => {
    const user = setup();
    await toReview(user);
    expect(document.querySelectorAll('.actionbar')).toHaveLength(1);
  });

  it('hat den Speichern-Knopf darin und lässt ihn bedienbar', async () => {
    /*
      Ein gesperrter Knopf sagt „geht nicht“ und verschweigt „warum“ und „wo“.
      Gedrückt werden darf er immer; gespeichert wird nur, wenn nichts mehr
      offen ist.
    */
    const user = setup();
    await toReview(user);
    const leiste = document.querySelector('.actionbar') as HTMLElement;
    const knopf = within(leiste).getByRole('button', { name: /Paket speichern/ });
    expect(knopf).toBeEnabled();
    vi.clearAllMocks();
  });
});
