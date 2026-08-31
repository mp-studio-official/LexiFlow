import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { clearAllLocalData, db } from '../../data/db';
import { savePack } from '../../data/packRepo';
import { getPackProgress, getProgressIndex } from '../../data/progressRepo';
import { createEntryProgress } from '../../domain/leitner';
import { makeEntry, makeMeta } from '../../test/fixtures';
import type { LearningDirection } from '../../domain/schema';

/**
 * Sprint 3B.2a: Durchsehen und Karten.
 *
 * Beide Ansichten sind Lernhilfen, keine Prüfungen. Der wichtigste Test ist
 * deshalb nicht das Aufdecken, sondern der Beweis, dass dabei **nichts**
 * gespeichert wird.
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

// Erst nach dem Mock importieren, damit die Seiten die Zählfassung sehen.
const { VocabBrowsePage } = await import('./VocabBrowsePage');
const { CardStudyPage } = await import('./CardStudyPage');

const PACK_ID = 'pack-study';

async function seed(direction: LearningDirection = 'both'): Promise<void> {
  await savePack({
    meta: makeMeta({ id: PACK_ID, direction, title: 'Halong Bay' }),
    entries: [
      makeEntry({
        id: 'e1',
        english: 'island',
        germanAnswers: ['die Insel', 'das Eiland'],
        acceptedEnglishAnswers: ['isle'],
        partOfSpeech: 'noun',
        exampleSentences: [{ english: 'The island is famous.', german: 'Die Insel ist berühmt.' }],
        topicTags: ['Geography'],
        notes: 'Gehobener Ausdruck: isle.',
      }),
      makeEntry({ id: 'e2', english: 'bay', germanAnswers: ['die Bucht'] }),
      makeEntry({ id: 'e3', english: 'cave', germanAnswers: ['die Höhle'] }),
      makeEntry({ id: 'e4', english: 'boat', germanAnswers: ['das Boot'] }),
    ],
  });
}

function renderBrowse(): void {
  render(
    <MemoryRouter initialEntries={[`/lernen/${PACK_ID}/durchsehen`]}>
      <Routes>
        <Route path="/lernen/:packId/durchsehen" element={<VocabBrowsePage />} />
        <Route path="/lernen/:packId" element={<h1>Paketseite</h1>} />
        <Route path="/lernen/:packId/karten" element={<h1>Kartenseite</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderCards(): void {
  render(
    <MemoryRouter initialEntries={[`/lernen/${PACK_ID}/karten`]}>
      <Routes>
        <Route path="/lernen/:packId/karten" element={<CardStudyPage />} />
        <Route path="/lernen/:packId" element={<h1>Paketseite</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Die Karte selbst – Ziel der Tastatursteuerung. */
function deck(): HTMLElement {
  return screen.getByRole('group', { name: /^Karte \d+ von \d+/ });
}

beforeEach(async () => {
  calls.startSession = 0;
  calls.recordAnswer = 0;
  await clearAllLocalData();
});

describe('Vokabeln durchsehen', () => {
  it('zeigt alle Vokabeln, aber keine Antwort', async () => {
    await seed();
    renderBrowse();

    expect(await screen.findByRole('heading', { level: 1, name: 'Halong Bay' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'island' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Antwort für .+ anzeigen$/ })).toHaveLength(4);

    // Verborgen heißt: `hidden` – damit ist der Bereich weder sichtbar noch
    // im Accessibility-Tree. (Im DOM steht er weiterhin, das ist der Zweck
    // von `hidden`.)
    expect(screen.getByText('die Insel')).not.toBeVisible();
    expect(screen.getByText('die Insel').closest('[hidden]')).not.toBeNull();
  });

  it('deckt eine einzelne Antwort auf und wieder zu', async () => {
    await seed();
    const user = userEvent.setup();
    renderBrowse();

    const toggle = await screen.findByRole('button', { name: 'Antwort für island anzeigen' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    expect(screen.getByText('die Insel')).toBeInTheDocument();
    expect(screen.getByText(/Auch richtig: das Eiland/)).toBeInTheDocument();
    expect(screen.getByText('Substantiv')).toBeInTheDocument();
    expect(screen.getByText(/The island is famous\./)).toBeInTheDocument();
    expect(screen.getByText(/Gehobener Ausdruck/)).toBeInTheDocument();

    const hide = screen.getByRole('button', { name: 'Antwort für island verbergen' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    await user.click(hide);

    expect(screen.getByText('die Insel')).not.toBeVisible();
  });

  it('lässt leere Zusatzangaben ganz weg', async () => {
    await seed();
    const user = userEvent.setup();
    renderBrowse();

    await user.click(await screen.findByRole('button', { name: 'Antwort für bay anzeigen' }));

    expect(screen.getByText('die Bucht')).toBeVisible();
    // „bay“ hat keine Alternativen – und bekommt deshalb auch keinen leeren Bereich.
    const answer = screen.getByText('die Bucht').parentElement;
    expect(within(answer as HTMLElement).queryByText(/Auch richtig/)).not.toBeInTheDocument();
  });

  it('zeigt und verbirgt alle Antworten gemeinsam', async () => {
    await seed();
    const user = userEvent.setup();
    renderBrowse();

    await user.click(await screen.findByRole('button', { name: 'Alle Antworten anzeigen' }));
    expect(screen.getAllByRole('button', { name: /verbergen$/ })).toHaveLength(5);
    // Die Sammelaktion kennt ihren eigenen Zustand.
    expect(screen.getByRole('button', { name: 'Alle Antworten anzeigen' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Alle Antworten verbergen' }));
    expect(screen.getByText('die Insel')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Alle Antworten verbergen' })).toBeDisabled();
  });

  it('tauscht beim Richtungswechsel die Seiten und verbirgt alles wieder', async () => {
    await seed('both');
    const user = userEvent.setup();
    renderBrowse();

    await user.click(await screen.findByRole('button', { name: 'Antwort für island anzeigen' }));
    expect(screen.getByText('die Insel')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Deutsch → Englisch' }));

    // Vorderseite ist jetzt Deutsch – und nichts ist mehr aufgedeckt.
    expect(screen.getByRole('heading', { level: 2, name: 'die Insel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Antwort für die Insel anzeigen' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('bietet einseitigen Paketen keine Richtungswahl an', async () => {
    await seed('en-de');
    renderBrowse();

    await screen.findByRole('heading', { level: 2, name: 'island' });
    expect(screen.queryByRole('radio', { name: 'Deutsch → Englisch' })).not.toBeInTheDocument();
  });

  it('sucht über Englisch, Deutsch und Themen-Tags', async () => {
    await seed();
    const user = userEvent.setup();
    renderBrowse();

    const search = await screen.findByLabelText('Suchen');

    await user.type(search, 'bucht');
    expect(screen.getByRole('heading', { level: 2, name: 'bay' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'island' })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'geography');
    expect(screen.getByRole('heading', { level: 2, name: 'island' })).toBeInTheDocument();

    await user.clear(search);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(4);
  });

  it('sagt ehrlich, wenn nichts passt', async () => {
    await seed();
    const user = userEvent.setup();
    renderBrowse();

    await user.type(await screen.findByLabelText('Suchen'), 'Fahrrad');
    expect(screen.getByText('Keine passende Vokabel gefunden.')).toBeInTheDocument();
  });

  it('schreibt nichts in die Datenbank', async () => {
    await seed();
    const user = userEvent.setup();
    renderBrowse();

    await user.click(await screen.findByRole('button', { name: 'Alle Antworten anzeigen' }));
    await user.click(screen.getByRole('radio', { name: 'Deutsch → Englisch' }));

    expect(calls.startSession).toBe(0);
    expect(calls.recordAnswer).toBe(0);
    expect(await db.directionProgress.count()).toBe(0);
    expect(await db.packProgress.count()).toBe(0);
  });
});

describe('Kartenmodus', () => {
  it('zeigt zuerst nur die Vorderseite', async () => {
    await seed('en-de');
    renderCards();

    expect(await screen.findByText('Karte 1 von 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Antwort anzeigen' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('progressbar', { name: 'Fortschritt im Kartensatz' })).toBeInTheDocument();
    // Die Rückseite ist verdeckt – nicht sichtbar und nicht im Accessibility-Tree.
    expect(screen.getByRole('button', { name: 'Antwort anzeigen' })).toBeInTheDocument();
  });

  it('dreht die Karte über die Schaltfläche um', async () => {
    await seed('en-de');
    const user = userEvent.setup();
    renderCards();

    await user.click(await screen.findByRole('button', { name: 'Antwort anzeigen' }));

    expect(within(deck()).getByText(/^(die Insel|die Bucht|die Höhle|das Boot)$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Antwort verbergen' })).toBeInTheDocument();
  });

  it('dreht sie auch mit Leertaste und Enter um', async () => {
    await seed('en-de');
    const user = userEvent.setup();
    renderCards();

    await screen.findByText('Karte 1 von 4');
    deck().focus();

    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Antwort verbergen' })).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Antwort anzeigen' })).toBeInTheDocument();
  });

  it('wechselt mit den Pfeiltasten und verbirgt dabei die Antwort', async () => {
    await seed('en-de');
    const user = userEvent.setup();
    renderCards();

    await screen.findByText('Karte 1 von 4');
    deck().focus();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Antwort verbergen' })).toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Karte 2 von 4')).toBeInTheDocument();
    // Die neue Karte beginnt verdeckt.
    expect(screen.getByRole('button', { name: 'Antwort anzeigen' })).toBeInTheDocument();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('Karte 1 von 4')).toBeInTheDocument();
  });

  it('lässt den Fokus beim Umdrehen stehen', async () => {
    await seed('en-de');
    const user = userEvent.setup();
    renderCards();

    await screen.findByText('Karte 1 von 4');
    deck().focus();
    await user.keyboard(' ');

    expect(deck()).toHaveFocus();
  });

  it('geht über die Schaltflächen vor und zurück', async () => {
    await seed('en-de');
    const user = userEvent.setup();
    renderCards();

    expect(await screen.findByRole('button', { name: 'Vorherige Karte' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Nächste Karte' }));
    expect(screen.getByText('Karte 2 von 4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Vorherige Karte' }));
    expect(screen.getByText('Karte 1 von 4')).toBeInTheDocument();
  });

  it('endet ruhig und ohne Bewertung', async () => {
    await seed('en-de');
    const user = userEvent.setup();
    renderCards();

    await screen.findByText('Karte 1 von 4');
    for (let step = 0; step < 4; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Nächste Karte' }));
    }

    expect(screen.getByRole('heading', { name: 'Du hast alle Karten angesehen.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Noch einmal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neu mischen' })).toBeInTheDocument();
    // Kein Ergebnis, keine Note, kein „bestanden“.
    expect(screen.queryByText(/richtig|falsch|bestanden|Punkte/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Noch einmal' }));
    expect(screen.getByText('Karte 1 von 4')).toBeInTheDocument();
  });

  it('mischt kontrolliert neu, ohne Karten zu verlieren', async () => {
    await seed('en-de');
    const user = userEvent.setup();
    renderCards();

    await screen.findByText('Karte 1 von 4');
    await user.click(screen.getByRole('button', { name: 'Nächste Karte' }));
    expect(screen.getByText('Karte 2 von 4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Karten mischen' }));

    // Der Satz beginnt von vorn und ist vollständig.
    expect(screen.getByText('Karte 1 von 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Antwort anzeigen' })).toBeInTheDocument();
  });

  it('startet den Satz bei einem Richtungswechsel neu', async () => {
    await seed('both');
    const user = userEvent.setup();
    renderCards();

    // Gemischt: vier Vokabeln in zwei Richtungen.
    expect(await screen.findByText('Karte 1 von 8')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Nächste Karte' }));
    await user.click(screen.getByRole('radio', { name: 'Englisch → Deutsch' }));

    expect(screen.getByText('Karte 1 von 4')).toBeInTheDocument();
  });

  it('bietet einseitigen Paketen keine ungültige Auswahl an', async () => {
    await seed('en-de');
    renderCards();

    await screen.findByText('Karte 1 von 4');
    expect(screen.queryByRole('radio', { name: 'Gemischt' })).not.toBeInTheDocument();
  });

  it('nennt die Richtung auf jeder Karte', async () => {
    await seed('en-de');
    renderCards();

    expect(await screen.findByText('Englisch → Deutsch (rezeptiv)')).toBeInTheDocument();
  });

  it('schreibt nichts in die Datenbank', async () => {
    await seed('both');
    const user = userEvent.setup();
    renderCards();

    await screen.findByText('Karte 1 von 8');
    await user.click(screen.getByRole('button', { name: 'Antwort anzeigen' }));
    await user.click(screen.getByRole('button', { name: 'Nächste Karte' }));
    await user.click(screen.getByRole('button', { name: 'Karten mischen' }));

    expect(calls.startSession).toBe(0);
    expect(calls.recordAnswer).toBe(0);
    expect(await db.directionProgress.count()).toBe(0);
    expect(await db.packProgress.count()).toBe(0);
  });

  it('lässt einen vorhandenen Lernstand unverändert', async () => {
    await seed('both');
    // Ein echter Lernstand, wie ihn eine frühere Lernrunde hinterlassen hätte.
    await db.directionProgress.put({
      ...createEntryProgress(PACK_ID, 'e1', 'en-de'),
      box: 3,
      correctCount: 5,
      streak: 2,
      dueAt: '2099-01-01T00:00:00.000Z',
      lastAnsweredAt: '2026-03-01T09:00:00.000Z',
    });

    const before = {
      directions: [...(await getProgressIndex(PACK_ID)).values()],
      pack: await getPackProgress(PACK_ID),
    };

    const user = userEvent.setup();
    renderCards();

    await screen.findByText(/^Karte 1 von \d+$/);
    await user.click(screen.getByRole('button', { name: 'Antwort anzeigen' }));
    await user.click(screen.getByRole('button', { name: 'Nächste Karte' }));
    await user.click(screen.getByRole('button', { name: 'Nächste Karte' }));

    const after = {
      directions: [...(await getProgressIndex(PACK_ID)).values()],
      pack: await getPackProgress(PACK_ID),
    };

    expect(after).toEqual(before);
  });
});
