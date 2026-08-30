import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExerciseView } from './ExerciseView';
import { buildTask, mulberry32 } from '../../domain/exercises';
import { makePack } from '../../test/fixtures';
import type { ExerciseTask } from '../../domain/exercises';

const pack = makePack();

function task(kind: Parameters<typeof buildTask>[1], entryId: string, direction: 'en-de' | 'de-en' = 'en-de'): ExerciseTask {
  const entry = pack.entries.find((item) => item.id === entryId);
  if (!entry) throw new Error('Eintrag fehlt');
  const built = buildTask(entry, kind, direction, pack.entries, mulberry32(3));
  if (!built) throw new Error('Aufgabe konnte nicht gebaut werden');
  return built;
}

describe('Multiple Choice', () => {
  it('zeigt alle Optionen mit Tastenkürzel an', () => {
    render(<ExerciseView task={task('multiple-choice', 'e-neighbourhood')} result={null} onSubmit={vi.fn()} />);
    expect(screen.getByText('neighbourhood')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('meldet die richtige Auswahl', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ExerciseView task={task('multiple-choice', 'e-neighbourhood')} result={null} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /Nachbarschaft/ }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'correct' }));
  });

  it('meldet eine falsche Auswahl', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const current = task('multiple-choice', 'e-neighbourhood');
    if (current.kind !== 'multiple-choice') throw new Error('falscher Typ');
    const wrong = current.options.find((option) => !current.expected.includes(option));

    render(<ExerciseView task={current} result={null} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: new RegExp(wrong ?? '') }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'wrong' }));
  });

  it('erlaubt die Auswahl über die Zifferntasten', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ExerciseView task={task('multiple-choice', 'e-neighbourhood')} result={null} onSubmit={onSubmit} />);

    await user.keyboard('1');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('sperrt die Optionen nach der Antwort', () => {
    render(
      <ExerciseView
        task={task('multiple-choice', 'e-neighbourhood')}
        result={{ verdict: 'correct', expected: ['Nachbarschaft'] }}
        onSubmit={vi.fn()}
      />,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });
});

describe('Offene Übersetzung', () => {
  it('akzeptiert eine korrekte Eingabe trotz abweichender Schreibung', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ExerciseView task={task('open-translation', 'e-neighbourhood')} result={null} onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox'), '  nachbarschaft. ');
    await user.click(screen.getByRole('button', { name: /Antwort prüfen/ }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'correct' }));
  });

  it('erkennt einen Tippfehler als „fast richtig“', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ExerciseView task={task('open-translation', 'e-neighbourhood')} result={null} onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox'), 'Nachbarschat{Enter}');
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'almost' }));
  });
});

describe('Karteikarte', () => {
  it('zeigt die Lösung erst auf Anforderung', async () => {
    const user = userEvent.setup();
    render(<ExerciseView task={task('flashcard', 'e-neighbourhood')} result={null} onSubmit={vi.fn()} />);

    expect(screen.queryByText(/Nachbarschaft/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Lösung anzeigen/ }));
    expect(screen.getByText(/Nachbarschaft/)).toBeInTheDocument();
  });

  it('erlaubt die Selbsteinschätzung', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ExerciseView task={task('flashcard', 'e-neighbourhood')} result={null} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /Lösung anzeigen/ }));
    await user.click(screen.getByRole('button', { name: /Noch nicht gewusst/ }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'wrong' }));
  });
});

describe('Lückensatz', () => {
  it('zeigt Satzteile und Wortbank', () => {
    render(<ExerciseView task={task('cloze-bank', 'e-crowded', 'de-en')} result={null} onSubmit={vi.fn()} />);
    expect(screen.getByText(/The bus was/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Wortbank' })).toBeInTheDocument();
  });

  it('prüft die freie Eingabe des fehlenden Wortes', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ExerciseView task={task('cloze-free', 'e-crowded', 'de-en')} result={null} onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox'), 'crowded{Enter}');
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'correct' }));
  });
});
