import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PackDetailPage } from './PackDetailPage';
import { clearAllLocalData, db } from '../../data/db';
import { savePack } from '../../data/packRepo';
import { getPackProgress, getProgressIndex } from '../../data/progressRepo';
import { createEntryProgress } from '../../domain/leitner';
import { makeEntry, makeMeta } from '../../test/fixtures';
import type { EntryProgress, LearningDirection, PackProgress } from '../../domain/schema';

/**
 * Sprint 2A.2: Freies Üben ist jederzeit möglich – und lässt den Lernplan in
 * Ruhe. Die Zeitpunkte sind fest gewählt, damit nichts von der echten Uhrzeit
 * abhängt.
 */

type ProgressRepo = typeof import('../../data/progressRepo');

const calls = vi.hoisted(() => ({ startSession: 0, recordAnswer: 0 }));

vi.mock('../../data/progressRepo', async (importOriginal) => {
  const actual = await importOriginal<ProgressRepo>();
  return {
    ...actual,
    startSession: (...args: Parameters<ProgressRepo['startSession']>) => {
      calls.startSession += 1;
      return actual.startSession(...args);
    },
    recordAnswer: (...args: Parameters<ProgressRepo['recordAnswer']>) => {
      calls.recordAnswer += 1;
      return actual.recordAnswer(...args);
    },
  } satisfies ProgressRepo;
});

// Erst nach dem Mock importieren, damit die Seite die Zählfassung sieht.
const { SessionPage } = await import('./SessionPage');

const PACK_ID = 'pack-free';
const FAR_FUTURE = '2099-01-01T00:00:00.000Z';

function entriesNamed(count: number) {
  return Array.from({ length: count }, (_, index) =>
    makeEntry({
      id: `e${index + 1}`,
      english: `word${index + 1}`,
      germanAnswers: [`Wort${index + 1}`],
    }),
  );
}

async function seed(count: number, direction: LearningDirection = 'en-de'): Promise<void> {
  await savePack({ meta: makeMeta({ id: PACK_ID, direction }), entries: entriesNamed(count) });
}

/** Alle rezeptiven Ziele auf einen festen, weit entfernten Termin legen. */
async function scheduleAllLater(count: number, box = 3): Promise<void> {
  await db.directionProgress.bulkPut(
    entriesNamed(count).map((entry) => ({
      ...createEntryProgress(PACK_ID, entry.id, 'en-de'),
      box,
      dueAt: FAR_FUTURE,
      correctCount: 2,
      streak: 2,
      answeredCount: 2,
      lastPracticedAt: '2026-03-01T09:00:00.000Z',
    })),
  );
}

function renderDetail(): void {
  render(
    <MemoryRouter initialEntries={[`/lernen/${PACK_ID}`]}>
      <Routes>
        <Route path="/lernen/:packId" element={<PackDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderSession(query: string): void {
  render(
    <MemoryRouter initialEntries={[`/lernen/${PACK_ID}/uebung?${query}`]}>
      <Routes>
        <Route path="/lernen/:packId/uebung" element={<SessionPage />} />
        <Route path="/lernen/:packId" element={<h1>Paketseite</h1>} />
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

/** Vergleichbarer Abzug aller Lernstände dieses Pakets. */
async function snapshot(): Promise<{
  directions: EntryProgress[];
  pack: PackProgress;
}> {
  const index = await getProgressIndex(PACK_ID);
  return {
    directions: [...index.values()].sort((a, b) => a.key.localeCompare(b.key)),
    pack: await getPackProgress(PACK_ID),
  };
}

beforeEach(async () => {
  calls.startSession = 0;
  calls.recordAnswer = 0;
  await clearAllLocalData();
});

describe('Paketansicht – ein einziger Einstieg ins freie Üben', () => {
  /*
    Seit Sprint 3B.2b gibt es die frühere Modusauswahl („Lernplan“ / „Frei
    üben“) nicht mehr. Freies Üben ist eine der vier freiwilligen Lernweisen,
    der Lernplan bleibt die empfohlene Runde darunter. Diese Tests halten
    beides fest: dass der doppelte Einstieg weg ist und dass freies Üben
    trotzdem jederzeit erreichbar bleibt.
  */
  it('bietet freies Üben als eigene Lernweise an, ohne zweite Modusauswahl', async () => {
    await seed(4);
    renderDetail();

    expect(await screen.findByRole('link', { name: 'Frei üben starten' })).toHaveAttribute(
      'href',
      expect.stringContaining('mode=free'),
    );
    expect(screen.queryByRole('radio', { name: 'Lernplan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Frei üben' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lernrunde starten' })).toBeEnabled();
  });

  it('bleibt erreichbar, wenn nichts fällig ist – und nennt den Termin weiter', async () => {
    await seed(4);
    await scheduleAllLater(4);
    renderDetail();

    expect(await screen.findByRole('link', { name: 'Frei üben starten' })).toBeInTheDocument();
    expect(screen.getByText(/Gerade ist nichts fällig/)).toBeInTheDocument();
    expect(screen.getByText(/Die nächste Wiederholung/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lernrunde starten' })).toBeDisabled();
  });

  it('erklärt, dass die freiwilligen Wege den Lernstand nicht verändern', async () => {
    await seed(4);
    renderDetail();

    expect(
      await screen.findByText(/Diese vier Wege verändern deinen Lernstand nicht/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/ohne dass sich Fächer oder Termine ändern/),
    ).toBeInTheDocument();
  });

  it('nennt die Zahl der frei verfügbaren Aufgaben ehrlich', async () => {
    await seed(6, 'both');
    renderDetail();

    // Beim freien Üben stehen seit Sprint 3B.1 beide Richtungen sofort bereit.
    expect(await screen.findByText(/12 Aufgaben sind verfügbar/)).toBeInTheDocument();
    // Die Rundengröße darunter gehört jetzt allein dem Lernplan.
    expect(screen.getByRole('option', { name: 'Alle bereiten (6)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Alle verfügbaren/ })).not.toBeInTheDocument();
  });

  it('bietet bei einem leeren Paket keinen Einstieg an, der ins Leere liefe', async () => {
    await savePack({ meta: makeMeta({ id: PACK_ID, direction: 'en-de' }), entries: [] });
    renderDetail();

    expect(
      await screen.findByText(/Dafür ist bisher nichts freigeschaltet/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Frei üben starten' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lernrunde starten' })).toBeDisabled();
  });
});

describe('Freie Runde – ohne jede Wirkung auf den Lernstand', () => {
  it('spielt eine vollständige Runde, ohne zu speichern', async () => {
    await seed(3);
    await scheduleAllLater(3);
    const before = await snapshot();

    const user = userEvent.setup();
    renderSession('mode=free&kinds=flashcard&length=3&seed=7');

    expect(await screen.findByText(/Frei üben · Aufgabe 1 von 3/)).toBeInTheDocument();

    for (let index = 1; index <= 3; index += 1) {
      expect(screen.getByText(new RegExp(`Aufgabe ${index} von 3`))).toBeInTheDocument();
      await answer(user, true);
      // Kein Speicherhinweis, „Weiter“ sofort benutzbar.
      expect(screen.queryByText('Lernstand wird gespeichert …')).not.toBeInTheDocument();
      expect(continueButton()).toBeEnabled();
      await user.click(continueButton());
    }

    expect(await screen.findByRole('heading', { name: 'Freie Runde abgeschlossen' }))
      .toBeInTheDocument();
    expect(
      screen.getByText('Diese freie Runde hat deinen Lernplan und deine Fälligkeiten nicht verändert.'),
    ).toBeInTheDocument();

    expect(calls.startSession).toBe(0);
    expect(calls.recordAnswer).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it('lässt auch nach falschen Antworten jedes Feld unverändert', async () => {
    await seed(2);
    await scheduleAllLater(2);
    const before = await snapshot();

    const user = userEvent.setup();
    renderSession('mode=free&kinds=flashcard&length=2&seed=11');
    await screen.findByText(/Aufgabe 1 von 2/);

    await answer(user, false);
    // Die falsch beantwortete Aufgabe kommt in dieser Runde noch einmal.
    expect(screen.getByText('Diese Aufgabe kommt in dieser Runde noch einmal.')).toBeInTheDocument();
    await user.click(continueButton());

    while (screen.queryByRole('button', { name: 'Lösung anzeigen' })) {
      await answer(user, true);
      await user.click(continueButton());
    }

    await screen.findByRole('heading', { name: 'Freie Runde abgeschlossen' });

    const after = await snapshot();
    expect(after).toEqual(before);
    for (const row of after.directions) {
      expect(row.box).toBe(3);
      expect(row.dueAt).toBe(FAR_FUTURE);
      expect(row.wrongCount).toBe(0);
      expect(row.correctCount).toBe(2);
      expect(row.streak).toBe(2);
    }
    expect(after.pack.sessionCount).toBe(0);
    expect(after.pack.answeredCount).toBe(0);
  });

  it('bietet „Noch einmal frei üben“ an und bleibt im freien Modus', async () => {
    await seed(2);
    await scheduleAllLater(2);

    const user = userEvent.setup();
    renderSession('mode=free&kinds=flashcard&length=2&seed=3');
    await screen.findByText(/Aufgabe 1 von 2/);

    for (let index = 0; index < 2; index += 1) {
      await answer(user, true);
      await user.click(continueButton());
    }

    await user.click(await screen.findByRole('button', { name: 'Noch einmal frei üben' }));

    expect(await screen.findByText(/Frei üben · Aufgabe 1 von 2/)).toBeInTheDocument();
    expect(calls.recordAnswer).toBe(0);
  });

  it('übt auch später fällige Aufgaben, die der Lernplan aussortiert', async () => {
    await seed(4);
    await scheduleAllLater(4);

    renderSession('mode=free&kinds=flashcard&length=4&seed=5');
    expect(await screen.findByText(/Aufgabe 1 von 4/)).toBeInTheDocument();
  });
});

describe('Modus aus der URL', () => {
  it('fällt ohne mode-Parameter auf den Lernplan zurück', async () => {
    await seed(2);
    const user = userEvent.setup();
    renderSession('kinds=flashcard&length=2&seed=7');
    await screen.findByText(/Aufgabe 1 von 2/);

    expect(screen.queryByText(/Frei üben ·/)).not.toBeInTheDocument();
    await answer(user, true);
    expect(calls.recordAnswer).toBe(1);
    expect(calls.startSession).toBe(1);
  });

  it('fällt bei einem unbekannten Wert sicher auf den Lernplan zurück', async () => {
    await seed(2);
    const user = userEvent.setup();
    renderSession('mode=irgendwas&kinds=flashcard&length=2&seed=7');
    await screen.findByText(/Aufgabe 1 von 2/);

    expect(screen.queryByText(/Frei üben ·/)).not.toBeInTheDocument();
    await answer(user, true);
    expect(calls.recordAnswer).toBe(1);
  });

  it('funktioniert bei direktem Aufruf einer freien Runde', async () => {
    await seed(3);
    await scheduleAllLater(3);
    renderSession('mode=free&kinds=flashcard&length=3&seed=9');

    expect(await screen.findByText(/Frei üben · Aufgabe 1 von 3/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Freies Üben: Diese Runde verändert deinen Lernplan und die Fälligkeiten nicht.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Meldung im leeren freien Üben', () => {
  it('spricht nicht mehr von Freischaltung', async () => {
    // Ein leeres Paket ist der einzige Grund, aus dem freies Üben leer bleibt.
    await savePack({ meta: makeMeta({ id: PACK_ID, direction: 'both' }), entries: [] });
    renderSession('length=10&mode=free');

    const alert = await screen.findByRole('status');
    expect(alert).toHaveTextContent(/keine Vokabeln|Übungsformen/);
    expect(alert).not.toHaveTextContent(/freigeschaltet/);
  });
});
