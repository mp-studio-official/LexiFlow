import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { clearAllLocalData } from '../../data/db';
import { savePack } from '../../data/packRepo';
import { createEntryProgress } from '../../domain/leitner';
import { makeEntry, makeMeta } from '../../test/fixtures';
import type { EntryProgress, LearningDirection } from '../../domain/schema';

/**
 * Sprint 1.3a: Das Feedback erscheint sofort, weitergeschaltet wird aber erst,
 * wenn der Lernstand wirklich in IndexedDB liegt. Sonst könnte die
 * Folgerundenplanung veraltete Daten lesen.
 */

type ProgressRepo = typeof import('../../data/progressRepo');

/** Umschaltbare Ersatzimplementierungen; `undefined` = echtes Verhalten. */
const overrides = vi.hoisted(() => ({
  recordAnswer: undefined as ProgressRepo['recordAnswer'] | undefined,
  startSession: undefined as ProgressRepo['startSession'] | undefined,
  getProgressIndex: undefined as ProgressRepo['getProgressIndex'] | undefined,
}));

vi.mock('../../data/progressRepo', async (importOriginal) => {
  const actual = await importOriginal<ProgressRepo>();
  return {
    ...actual,
    recordAnswer: (...args: Parameters<ProgressRepo['recordAnswer']>) =>
      (overrides.recordAnswer ?? actual.recordAnswer)(...args),
    startSession: (...args: Parameters<ProgressRepo['startSession']>) =>
      (overrides.startSession ?? actual.startSession)(...args),
    getProgressIndex: (...args: Parameters<ProgressRepo['getProgressIndex']>) =>
      (overrides.getProgressIndex ?? actual.getProgressIndex)(...args),
  } satisfies ProgressRepo;
});

// Erst nach dem Mock importieren, damit die Seite die Ersatzfassung sieht.
const { SessionPage } = await import('./SessionPage');

const PACK_ID = 'pack-persistence';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let realRepo: ProgressRepo;

beforeAll(async () => {
  realRepo = await vi.importActual<ProgressRepo>('../../data/progressRepo');
});

async function seed(count: number, direction: LearningDirection): Promise<void> {
  await savePack({
    meta: makeMeta({ id: PACK_ID, direction }),
    entries: Array.from({ length: count }, (_, index) =>
      makeEntry({
        id: `e${index + 1}`,
        english: `word${index + 1}`,
        germanAnswers: [`Wort${index + 1}`],
      }),
    ),
  });
}

function renderSession(length: number): void {
  render(
    <MemoryRouter
      initialEntries={[`/lernen/${PACK_ID}/uebung?kinds=flashcard&length=${length}&seed=7`]}
    >
      <Routes>
        <Route path="/lernen/:packId/uebung" element={<SessionPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function answer(user: ReturnType<typeof userEvent.setup>, known: boolean): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Lösung anzeigen' }));
  await user.click(screen.getByRole('button', { name: known ? 'Gewusst' : 'Noch nicht gewusst' }));
}

function continueButton(): HTMLElement {
  return screen.getByRole('button', { name: /Weiter|Runde beenden/ });
}

beforeEach(async () => {
  overrides.recordAnswer = undefined;
  overrides.startSession = undefined;
  overrides.getProgressIndex = undefined;
  await clearAllLocalData();
});

describe('SessionPage – Antwort dauerhaft speichern', () => {
  it('hält „Weiter“ gesperrt, bis recordAnswer abgeschlossen ist', async () => {
    const gate = deferred<EntryProgress>();
    overrides.recordAnswer = () => gate.promise;

    await seed(4, 'en-de');
    const user = userEvent.setup();
    renderSession(4);
    await screen.findByText('Aufgabe 1 von 4');

    await answer(user, true);

    // Feedback ist sofort da …
    expect(screen.getByText('Richtig')).toBeInTheDocument();
    // … das Weiterschalten aber nicht.
    expect(screen.getByText('Lernstand wird gespeichert …')).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();

    // Klick währenddessen bleibt wirkungslos.
    await user.click(continueButton());
    expect(screen.getByText('Aufgabe 1 von 4')).toBeInTheDocument();

    gate.resolve(createEntryProgress(PACK_ID, 'e1', 'en-de'));

    await waitFor(() => expect(continueButton()).toBeEnabled());
    expect(screen.queryByText('Lernstand wird gespeichert …')).not.toBeInTheDocument();

    await user.click(continueButton());
    expect(await screen.findByText('Aufgabe 2 von 4')).toBeInTheDocument();
  });

  it('schreibt bei mehrfachem Auslösen nur einmal', async () => {
    const calls: string[] = [];
    overrides.recordAnswer = async (packId, entryId, direction, verdict, now) => {
      calls.push(`${entryId}:${direction}:${verdict}`);
      return realRepo.recordAnswer(packId, entryId, direction, verdict, now);
    };

    await seed(4, 'en-de');
    const user = userEvent.setup();
    renderSession(4);
    await screen.findByText('Aufgabe 1 von 4');

    await answer(user, true);
    await waitFor(() => expect(continueButton()).toBeEnabled());

    expect(calls).toHaveLength(1);
  });

  it('meldet einen Speicherfehler und bietet einen zweiten Versuch an', async () => {
    overrides.recordAnswer = () => Promise.reject(new Error('IndexedDB nicht verfügbar'));

    await seed(4, 'en-de');
    const user = userEvent.setup();
    renderSession(4);
    await screen.findByText('Aufgabe 1 von 4');

    await answer(user, true);

    await waitFor(() =>
      expect(screen.getByText('Der Lernstand konnte nicht gespeichert werden.')).toBeInTheDocument(),
    );
    expect(continueButton()).toBeDisabled();
    // Die Aufgabe gilt weiterhin als offen.
    expect(screen.getByText('Aufgabe 1 von 4')).toBeInTheDocument();

    // Zweiter Versuch gelingt.
    overrides.recordAnswer = undefined;
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    await waitFor(() => expect(continueButton()).toBeEnabled());
    expect(
      screen.queryByText('Der Lernstand konnte nicht gespeichert werden.'),
    ).not.toBeInTheDocument();

    await user.click(continueButton());
    expect(await screen.findByText('Aufgabe 2 von 4')).toBeInTheDocument();
  });

  it('behandelt einen Fehler beim Rundenstart kontrolliert', async () => {
    overrides.startSession = () => Promise.reject(new Error('Rundenstart fehlgeschlagen'));

    await seed(4, 'en-de');
    const user = userEvent.setup();
    renderSession(4);
    await screen.findByText('Aufgabe 1 von 4');

    await answer(user, true);

    await waitFor(() =>
      expect(screen.getByText('Der Lernstand konnte nicht gespeichert werden.')).toBeInTheDocument(),
    );
    expect(continueButton()).toBeDisabled();

    // Nach einem erfolgreichen Rundenstart geht es weiter.
    overrides.startSession = undefined;
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    await waitFor(() => expect(continueButton()).toBeEnabled());
  });
});

describe('SessionPage – Folgerundenplanung', () => {
  it('sperrt „Neue Runde“, solange die Prüfung läuft', async () => {
    await seed(1, 'both');

    // Der zweite Aufruf (Folgerundenplanung) wird künstlich angehalten.
    const gate = deferred<Map<string, EntryProgress>>();
    let call = 0;
    overrides.getProgressIndex = (packId) => {
      call += 1;
      return call === 1 ? realRepo.getProgressIndex(packId) : gate.promise;
    };

    const user = userEvent.setup();
    renderSession(1);
    await screen.findByText('Aufgabe 1 von 1');

    await answer(user, true);
    await waitFor(() => expect(continueButton()).toBeEnabled());
    await user.click(continueButton());

    // Runde vorbei, Folgerunde noch unbekannt.
    expect(await screen.findByRole('heading', { name: 'Runde abgeschlossen' })).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Nächste Runde wird geprüft …' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    // Erst mit dem Ergebnis wird entschieden.
    gate.resolve(await realRepo.getProgressIndex(PACK_ID));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Neue Runde' })).toBeInTheDocument(),
    );
    // Die produktive Richtung wurde durch Fach 2 freigeschaltet.
    expect(screen.getByRole('button', { name: 'Neue Runde' })).toBeEnabled();
  });
});
