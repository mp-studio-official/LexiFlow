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

  it('setzt den Schwierigkeitsgrad', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DraftTable drafts={drafts()} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Schwierigkeit, Zeile 1'), '4');
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
    await user.click(screen.getAllByRole('button', { name: /Details für crowded öffnen/ })[0]!);
    return { onChange, user };
  }

  it('ist zunächst eingeklappt', () => {
    render(<DraftTable drafts={drafts()} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/Beispielsatz 1 Englisch/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Details für crowded öffnen/ })[0]).toHaveAttribute(
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
    await user.click(screen.getAllByRole('button', { name: /Details für crowded öffnen/ })[0]!);
    await user.click(screen.getByRole('button', { name: /Beispielsatz 2 nach oben, crowded/ }));

    expect(lastCall(onChange)[0]?.sentences.map((sentence) => sentence.english)).toEqual([
      'Second.',
      'First.',
    ]);
  });
});
