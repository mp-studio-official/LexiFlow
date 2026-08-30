import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionPage } from './SessionPage';
import { clearAllLocalData, db } from '../../data/db';
import { savePack } from '../../data/packRepo';
import { createEntryProgress } from '../../domain/leitner';
import { makeEntry, makeMeta } from '../../test/fixtures';
import type { TaskDirection } from '../../domain/schema';

/**
 * Sprint 1.3: Die Wiederholung darf nur angekündigt werden, wenn sie
 * tatsächlich eingereiht wurde.
 *
 * Aufbau: vier Vokabeln, beide Richtungen, alle acht Kombinationen fällig.
 * Die Anordnung hält Gegenrichtungen mindestens drei Aufgaben auseinander –
 * dadurch liegt zur vierten Aufgabe die Gegenrichtung zwingend an achter
 * Stelle, und für eine Wiederholung bleibt kein zulässiger Platz.
 */

const PACK_ID = 'pack-session';
const PAST = '2026-01-01T00:00:00.000Z';

async function seed(): Promise<void> {
  const entries = Array.from({ length: 4 }, (_, index) =>
    makeEntry({
      id: `e${index + 1}`,
      english: `word${index + 1}`,
      germanAnswers: [`Wort${index + 1}`],
    }),
  );
  await savePack({ meta: makeMeta({ id: PACK_ID, direction: 'both' }), entries });

  const rows = entries.flatMap((entry) =>
    (['en-de', 'de-en'] as TaskDirection[]).map((direction) => ({
      ...createEntryProgress(PACK_ID, entry.id, direction),
      box: 2,
      dueAt: PAST,
    })),
  );
  await db.directionProgress.bulkPut(rows);
}

function renderSession(): void {
  render(
    <MemoryRouter initialEntries={[`/lernen/${PACK_ID}/uebung?kinds=flashcard&length=8&seed=7`]}>
      <Routes>
        <Route path="/lernen/:packId/uebung" element={<SessionPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Eine Karteikarte beantworten. */
async function answer(user: ReturnType<typeof userEvent.setup>, known: boolean): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Lösung anzeigen' }));
  await user.click(
    screen.getByRole('button', { name: known ? 'Gewusst' : 'Noch nicht gewusst' }),
  );
}

async function next(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /Weiter|Runde beenden/ }));
}

beforeEach(async () => {
  await clearAllLocalData();
  await seed();
});

describe('SessionPage – Wiedervorlage', () => {
  it('plant acht Aufgaben, wenn beide Richtungen fällig sind', async () => {
    renderSession();
    expect(await screen.findByText('Aufgabe 1 von 8')).toBeInTheDocument();
  });

  it('kündigt die Wiederholung an, wenn sie eingereiht wurde', async () => {
    const user = userEvent.setup();
    renderSession();
    await screen.findByText('Aufgabe 1 von 8');

    await answer(user, false);

    expect(screen.getByText('Noch nicht richtig')).toBeInTheDocument();
    expect(
      screen.getByText('Diese Aufgabe kommt in dieser Runde noch einmal.'),
    ).toBeInTheDocument();

    await next(user);
    expect(await screen.findByText('Aufgabe 2 von 9')).toBeInTheDocument();
  });

  it('verspricht keine Wiederholung, wenn kein Platz frei ist', async () => {
    const user = userEvent.setup();
    renderSession();
    await screen.findByText('Aufgabe 1 von 8');

    // Die ersten drei Aufgaben richtig – die vierte hat ihre Gegenrichtung
    // an achter Stelle und damit keinen zulässigen Wiederholungsplatz.
    for (let i = 0; i < 3; i += 1) {
      await answer(user, true);
      await next(user);
    }
    expect(await screen.findByText('Aufgabe 4 von 8')).toBeInTheDocument();

    await answer(user, false);

    expect(
      screen.queryByText('Diese Aufgabe kommt in dieser Runde noch einmal.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/kein passender Wiederholungsplatz frei/),
    ).toBeInTheDocument();

    // Die Runde wächst nicht.
    await next(user);
    expect(await screen.findByText('Aufgabe 5 von 8')).toBeInTheDocument();
  });

  it('kündigt bei richtiger Antwort nichts an', async () => {
    const user = userEvent.setup();
    renderSession();
    await screen.findByText('Aufgabe 1 von 8');

    await answer(user, true);

    expect(screen.getByText('Richtig')).toBeInTheDocument();
    expect(
      screen.queryByText('Diese Aufgabe kommt in dieser Runde noch einmal.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/kein passender Wiederholungsplatz frei/)).not.toBeInTheDocument();
  });
});
