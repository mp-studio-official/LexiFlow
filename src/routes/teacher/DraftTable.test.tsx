import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DraftTable } from './DraftTable';
import { buildDrafts, type DraftRow } from '../../import/draft';
import { detectColumns } from '../../import/columnDetect';

const ROWS = [
  ['Englisch', 'Deutsch', 'Beispielsatz'],
  ['crowded', 'überfüllt', 'The bus was crowded.'],
  ['crowded', 'voll', ''],
  ['', 'ohne Stichwort', ''],
];

function drafts(): DraftRow[] {
  return buildDrafts(ROWS, detectColumns(ROWS), { splitMultipleMeanings: true });
}

function lastCall(onChange: ReturnType<typeof vi.fn>): DraftRow[] {
  return onChange.mock.calls.at(-1)?.[0] as DraftRow[];
}

describe('DraftTable – Grundzeile', () => {
  it('zeigt jede Zeile mit bearbeitbaren Feldern', () => {
    render(<DraftTable drafts={drafts()} onChange={vi.fn()} />);
    expect(screen.getAllByRole('row')).toHaveLength(4); // Kopfzeile + 3 Datenzeilen
    expect(screen.getAllByDisplayValue('crowded')).toHaveLength(2);
    expect(screen.getByDisplayValue('überfüllt')).toBeInTheDocument();
  });

  it('kennzeichnet fehlende Stichwörter als Fehler', () => {
    render(<DraftTable drafts={drafts()} onChange={vi.fn()} />);
    expect(screen.getByText(/Englisches Stichwort fehlt/)).toBeInTheDocument();
  });

  it('kennzeichnet Duplikate als Hinweis', () => {
    render(<DraftTable drafts={drafts()} onChange={vi.fn()} />);
    expect(screen.getByText(/kommt mehrfach vor/)).toBeInTheDocument();
  });

  it('meldet Änderungen samt neuer Prüfung nach oben', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DraftTable drafts={drafts()} onChange={onChange} />);

    await user.type(screen.getByLabelText('Englisch, Zeile 3'), 'x');

    const updated = lastCall(onChange);
    expect(updated[2]?.english).toBe('x');
    expect(updated[2]?.issues.some((issue) => issue.level === 'error')).toBe(false);
  });

  it('erlaubt das Abwählen einer Zeile', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DraftTable drafts={drafts()} onChange={onChange} />);

    await user.click(screen.getAllByLabelText('crowded übernehmen')[0]!);
    expect(lastCall(onChange)[0]?.include).toBe(false);
  });

  it('setzt den Schwierigkeitsgrad im aufgeklappten Bereich', async () => {
    /*
      Die Schwierigkeit ist keine Tabellenspalte mehr. Als eine stand sie
      neben Englisch und Deutsch und sah aus wie eine Angabe, die fehlt –
      dabei kennt sie für eine aus dem Text übernommene Vokabel niemand.
      Verloren ist sie nicht, nur eine Ebene tiefer.
    */
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DraftTable drafts={drafts()} onChange={onChange} />);

    expect(screen.queryByLabelText('Schwierigkeit, Zeile 1')).not.toBeInTheDocument();
    await user.click(
      screen.getAllByRole('button', { name: /Beispielsatz für crowded anzeigen/ })[0]!,
    );
    await user.selectOptions(screen.getByLabelText('Schwierigkeit'), '4');
    expect(lastCall(onChange)[0]?.difficulty).toBe(4);
  });

  it('entfernt eine Zeile', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DraftTable drafts={drafts()} onChange={onChange} />);

    await user.click(screen.getAllByRole('button', { name: /entfernen/i })[0]!);
    expect(lastCall(onChange)).toHaveLength(2);
  });
});

describe('DraftTable – Detailbereich', () => {
  async function openDetails() {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DraftTable drafts={drafts()} onChange={onChange} />);
    await user.click(screen.getAllByRole('button', { name: /Beispielsatz für crowded anzeigen/ })[0]!);
    return { onChange, user };
  }

  it('ist zunächst eingeklappt', () => {
    render(<DraftTable drafts={drafts()} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/Beispielsatz 1 Englisch/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Beispielsatz für crowded anzeigen/ })[0]).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('zeigt Alternativantworten, Notiz und Beispielsätze', async () => {
    await openDetails();
    expect(screen.getByLabelText(/Akzeptierte englische Alternativantworten/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Beispielsatz 1 Englisch, crowded/)).toHaveValue(
      'The bus was crowded.',
    );
    expect(screen.getByLabelText(/Beispielsatz 1 Deutsch, crowded/)).toBeInTheDocument();
  });

  it('bearbeitet akzeptierte Alternativantworten', async () => {
    const { onChange, user } = await openDetails();
    // Die Komponente ist kontrolliert; im Test bleibt `drafts` fix, deshalb
    // wird ein einzelner Tastendruck geprüft.
    await user.type(screen.getByLabelText(/Akzeptierte englische Alternativantworten/), 'b');
    expect(lastCall(onChange)[0]?.acceptedEnglish).toBe('b');
  });

  it('fügt einen weiteren Beispielsatz hinzu', async () => {
    const { onChange, user } = await openDetails();
    await user.click(screen.getByRole('button', { name: /Beispielsatz hinzufügen, crowded/ }));
    expect(lastCall(onChange)[0]?.sentences).toHaveLength(2);
  });

  it('entfernt einen Beispielsatz', async () => {
    const { onChange, user } = await openDetails();
    await user.click(screen.getByRole('button', { name: /Beispielsatz 1 entfernen, crowded/ }));
    expect(lastCall(onChange)[0]?.sentences).toHaveLength(0);
  });

  it('deaktiviert das Umordnen bei nur einem Satz', async () => {
    await openDetails();
    expect(screen.getByRole('button', { name: /Beispielsatz 1 nach oben, crowded/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Beispielsatz 1 nach unten, crowded/ })).toBeDisabled();
  });

  it('ordnet mehrere Beispielsätze um', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const initial = drafts();
    const withTwo = initial.map((draft, index) =>
      index === 0
        ? {
            ...draft,
            sentences: [
              { id: 's1', english: 'First.', german: '' },
              { id: 's2', english: 'Second.', german: '' },
            ],
          }
        : draft,
    );
    render(<DraftTable drafts={withTwo} onChange={onChange} />);
    await user.click(screen.getAllByRole('button', { name: /Beispielsatz für crowded anzeigen/ })[0]!);
    await user.click(screen.getByRole('button', { name: /Beispielsatz 2 nach oben, crowded/ }));

    expect(lastCall(onChange)[0]?.sentences.map((sentence) => sentence.english)).toEqual([
      'Second.',
      'First.',
    ]);
  });
});

/**
 * Sprint 4B.2 Phase 4: die Übersichtszeile.
 *
 * Der Umbau war kein Geschmacksurteil. Zwei Textfelder, ein Auswahlfeld, ein
 * Knopf und eine Fehlerliste teilten sich dieselbe Zeilenbreite; auf einem
 * Laptop war jedes Feld so schmal, dass „sich entschuldigen“ nicht hineinpasste.
 */
describe('Die Übersichtszeile', () => {
  it('stellt Englisch über Deutsch, in einer Spalte', () => {
    render(<DraftTable drafts={drafts()} onChange={vi.fn()} />);

    const englisch = screen.getByLabelText('Englisch, Zeile 1');
    const deutsch = screen.getByLabelText('Deutsch, Zeile 1');

    // Dieselbe Zelle – und Englisch steht darin vor Deutsch.
    expect(englisch.closest('td')).toBe(deutsch.closest('td'));
    expect(
      englisch.compareDocumentPosition(deutsch) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('hat fünf Spalten statt sieben', () => {
    render(<DraftTable drafts={drafts()} onChange={vi.fn()} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
    expect(screen.getByRole('columnheader', { name: 'Vokabel' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
  });

  it('sagt im Status nur „OK“ oder „Bitte prüfen“', () => {
    /*
      Bis 4B.1 stand hier eine Aufzählung aller Meldungen. Bei drei Hinweisen
      war die Statusspalte höher als die ganze übrige Zeile. Jetzt sagt der
      Status **ob** – und der Grund steht unter dem Feld, das ihn angeht.
    */
    render(<DraftTable drafts={drafts()} onChange={vi.fn()} />);

    expect(screen.getAllByText('OK').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bitte prüfen').length).toBeGreaterThan(0);
    // „Fehler“ und „Hinweis“ als Etikett gibt es nicht mehr.
    expect(screen.queryByText('Fehler')).not.toBeInTheDocument();
    expect(screen.queryByText('Hinweis')).not.toBeInTheDocument();
  });

  it('stellt den Grund unter das Feld, das ihn angeht', () => {
    render(<DraftTable drafts={drafts()} onChange={vi.fn()} />);

    const meldung = screen.getByText(/Englisches Stichwort fehlt/);
    const zelle = meldung.closest('td');
    expect(zelle).not.toBeNull();
    // Dieselbe Zelle wie die Felder der Zeile.
    expect(zelle).toBe(screen.getByLabelText('Englisch, Zeile 3').closest('td'));
  });

  it('nennt den Beispielsatz benannt und mit Anzahl', async () => {
    const user = userEvent.setup();
    render(<DraftTable drafts={drafts()} onChange={vi.fn()} />);

    const knopf = screen.getAllByRole('button', { name: /Beispielsatz für crowded anzeigen/ })[0]!;
    expect(knopf).toHaveTextContent('Beispielsatz anzeigen (1)');
    expect(knopf).toHaveAttribute('aria-expanded', 'false');

    await user.click(knopf);

    const offen = screen.getAllByRole('button', {
      name: /Beispielsatz für crowded ausblenden/,
    })[0]!;
    expect(offen).toHaveTextContent('Beispielsatz ausblenden');
    expect(offen).toHaveAttribute('aria-expanded', 'true');
  });

  it('gibt dem aufgeklappten Bereich die volle Breite', async () => {
    const user = userEvent.setup();
    render(<DraftTable drafts={drafts()} onChange={vi.fn()} />);

    await user.click(
      screen.getAllByRole('button', { name: /Beispielsatz für crowded anzeigen/ })[0]!,
    );

    const details = document.querySelector('.details')?.closest('td');
    expect(details).not.toBeNull();
    expect(details).toHaveAttribute('colspan', '5');
  });
});
