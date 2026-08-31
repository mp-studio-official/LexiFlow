import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { clearAllLocalData, db } from '../../data/db';
import { savePack } from '../../data/packRepo';
import { getPackProgress, getProgressIndex } from '../../data/progressRepo';
import { createEntryProgress } from '../../domain/leitner';
import { makeEntry, makeMeta } from '../../test/fixtures';
import type { EntryProgress, LearningDirection, PackProgress } from '../../domain/schema';

/**
 * Sprint 3B.2b: Selbsttest.
 *
 * Der Selbsttest ist eine Selbsteinschätzung, keine Prüfung. Der wichtigste
 * Test hier ist deshalb derselbe wie bei Durchsehen und Karten: der Beweis,
 * dass nichts gespeichert wird – weder über die Repository-Fassade noch
 * unmittelbar in der Datenbank.
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
const { SelfTestPage } = await import('./SelfTestPage');

const PACK_ID = 'pack-selftest';

const WORDS: readonly (readonly [string, string])[] = [
  ['island', 'die Insel'],
  ['bay', 'die Bucht'],
  ['cave', 'die Höhle'],
  ['boat', 'das Boot'],
  ['rock', 'der Felsen'],
  ['coast', 'die Küste'],
];

async function seed(direction: LearningDirection = 'en-de', count = WORDS.length): Promise<void> {
  await savePack({
    meta: makeMeta({ id: PACK_ID, direction, title: 'Halong Bay' }),
    entries: WORDS.slice(0, count).map(([english, german], index) =>
      makeEntry({
        id: `e${index + 1}`,
        english,
        germanAnswers: [german],
        exampleSentences:
          index === 0
            ? [{ english: 'The island is famous.', german: 'Die Insel ist berühmt.' }]
            : [],
      }),
    ),
  });
}

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={[`/lernen/${PACK_ID}/selbsttest`]}>
      <Routes>
        <Route path="/lernen/:packId/selbsttest" element={<SelfTestPage />} />
        <Route path="/lernen/:packId" element={<h1>Paketseite</h1>} />
        <Route path="/lernen/:packId/durchsehen" element={<h1>Durchsehen</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Vergleichbarer Abzug aller Lernstände dieses Pakets. */
async function snapshot(): Promise<{ directions: EntryProgress[]; pack: PackProgress }> {
  const index = await getProgressIndex(PACK_ID);
  return {
    directions: [...index.values()].sort((a, b) => a.key.localeCompare(b.key)),
    pack: await getPackProgress(PACK_ID),
  };
}

/**
 * Eine Aufgabe beantworten – ohne zu wissen, welche Form gerade dran ist.
 *
 * Der Selbsttest mischt bewusst; der Test darf sich deshalb nicht auf eine
 * bestimmte Übungsform festlegen. `answer` findet das jeweilige Bedienelement
 * und gibt zurück, ob absichtlich richtig geantwortet wurde.
 */
async function answerCurrent(
  user: ReturnType<typeof userEvent.setup>,
  correct: boolean,
): Promise<void> {
  const expected = solutionFor(currentPrompt());

  const input = screen.queryByRole('textbox');
  if (input) {
    await user.type(input, correct ? expected : 'zzz');
    await user.click(screen.getByRole('button', { name: 'Antwort prüfen' }));
    return;
  }

  const options = within(screen.getByRole('group')).getAllByRole('button');
  const wanted = options.find((option) =>
    correct ? option.textContent?.includes(expected) : !option.textContent?.includes(expected),
  );
  await user.click(wanted ?? (options[0] as HTMLElement));
}

/** Die Frage der aktuellen Aufgabe – unabhängig von der Übungsform. */
function currentPrompt(): string {
  return document.querySelector('.prompt')?.textContent ?? '';
}

function solutionFor(prompt: string): string {
  const word = prompt.trim();
  const forward = WORDS.find(([english]) => english === word);
  if (forward) return forward[1];
  const backward = WORDS.find(([, german]) => german === word);
  return backward ? backward[0] : '';
}

/** Den ganzen Test durchspielen. */
async function playAll(
  user: ReturnType<typeof userEvent.setup>,
  total: number,
  correct: (position: number) => boolean,
): Promise<void> {
  for (let position = 0; position < total; position += 1) {
    await answerCurrent(user, correct(position));
  }
}

beforeEach(async () => {
  calls.startSession = 0;
  calls.recordAnswer = 0;
  await clearAllLocalData();
});

describe('Selbsttest – Einrichten', () => {
  it('nennt Umfang, Aufgabenarten und die ehrliche Vorschau', async () => {
    await seed();
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Halong Bay' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Test zusammenstellen' })).toBeInTheDocument();

    expect(screen.getByRole('radio', { name: '5' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Alle verfügbaren' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Antwort selbst eingeben/ })).toBeInTheDocument();

    // Sechs Vokabeln, eine Richtung: Mehr als sechs Aufgaben gibt es nicht,
    // auch wenn zehn voreingestellt sind.
    expect(screen.getByText(/6 Aufgaben werden zusammengestellt/)).toBeInTheDocument();
    expect(screen.getByText(/Mehr gibt dieses Paket mit dieser Auswahl nicht her/)).toBeInTheDocument();
  });

  it('bietet einseitigen Paketen keine Richtungswahl an', async () => {
    await seed('en-de');
    renderPage();

    await screen.findByRole('heading', { level: 2, name: 'Test zusammenstellen' });
    expect(screen.queryByRole('radio', { name: 'Gemischt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Deutsch → Englisch' })).not.toBeInTheDocument();
  });

  it('bietet bei zweisprachigen Paketen alle drei Richtungen an', async () => {
    await seed('both');
    renderPage();

    expect(await screen.findByRole('radio', { name: 'Gemischt' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Englisch → Deutsch' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Deutsch → Englisch' })).toBeInTheDocument();
  });

  it('bietet nur Aufgabenarten an, die dieses Paket wirklich hergibt', async () => {
    await seed('en-de');
    renderPage();

    await screen.findByRole('heading', { level: 2, name: 'Test zusammenstellen' });
    // Ohne Beispielsätze in der produktiven Richtung gibt es keine Lückensätze.
    expect(screen.queryByRole('checkbox', { name: /Lücke im Satz ergänzen/ })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Aus vorgegebenen Antworten auswählen/ })).toBeInTheDocument();
  });

  it('sagt es klar, wenn die Auswahl keine Aufgabe hergibt', async () => {
    await savePack({ meta: makeMeta({ id: PACK_ID, direction: 'en-de' }), entries: [] });
    renderPage();

    expect(await screen.findByText('Mit dieser Auswahl entsteht keine Aufgabe.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Selbsttest starten' })).toBeDisabled();
  });

  it('richtet sich nach der gewählten Anzahl', async () => {
    await seed();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('radio', { name: '5' }));
    expect(screen.getByText(/5 Aufgaben werden zusammengestellt/)).toBeInTheDocument();
    // Genau so viele wie gewünscht – kein Hinweis auf fehlende Aufgaben.
    expect(
      screen.queryByText(/Mehr gibt dieses Paket mit dieser Auswahl nicht her/),
    ).not.toBeInTheDocument();
  });
});

describe('Selbsttest – Bearbeiten', () => {
  it('zeigt Fortschritt und gibt zwischendurch keine Bewertung', async () => {
    await seed();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('radio', { name: '5' }));
    await user.click(screen.getByRole('button', { name: 'Selbsttest starten' }));

    expect(screen.getAllByText('Aufgabe 1 von 5').length).toBeGreaterThan(0);
    expect(screen.getByRole('progressbar', { name: 'Fortschritt im Selbsttest' })).toBeInTheDocument();

    await answerCurrent(user, true);

    // Weiter zur nächsten Aufgabe – ohne „richtig“/„falsch“ dazwischen.
    expect(screen.getAllByText('Aufgabe 2 von 5').length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Richtig!/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fast richtig/)).not.toBeInTheDocument();
  });

  it('wertet eine Aufgabe auch bei doppeltem Klick nur einmal', async () => {
    await seed('en-de', 2);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Selbsttest starten' }));

    // Multiple Choice erzwingen, indem nur diese Gruppe bleibt – sonst könnte
    // ein Eingabefeld dran sein, das gar nicht doppelt auslösbar wäre.
    const group = screen.queryByRole('group');
    if (group) {
      const options = within(group).getAllByRole('button');
      const first = options[0] as HTMLElement;
      await user.dblClick(first);
    } else {
      await answerCurrent(user, true);
    }

    // Zwei Aufgaben, ein Doppelklick: Es darf höchstens die zweite dran sein.
    expect(screen.queryByText('Aufgabe 3 von 2')).not.toBeInTheDocument();
  });

  it('setzt den Fokus bei jeder Aufgabe an eine sinnvolle Stelle', async () => {
    await seed('en-de', 3);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Selbsttest starten' }));

    /*
      Zwei Fälle, eine Regel: Der Fokus steht dort, wo die Antwort beginnt.
      Bei freier Eingabe ist das das Feld – dorthin setzt ihn `ExerciseView`
      selbst. Bei Multiple Choice gibt es kein Feld; dann übernimmt ihn die
      (visuell verborgene) Aufgabenüberschrift, damit der Screenreader den
      Wechsel überhaupt bemerkt.
    */
    for (let position = 0; position < 3; position += 1) {
      const input = screen.queryByRole('textbox');
      if (input) {
        expect(input).toHaveFocus();
      } else {
        expect(document.activeElement).toHaveClass('visually-hidden');
        expect(document.activeElement?.textContent).toMatch(/^Aufgabe \d+ von 3$/);
      }
      await answerCurrent(user, true);
    }
  });

  it('lässt den Test nur nach Rückfrage vorzeitig beenden', async () => {
    await seed();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Selbsttest starten' }));
    await user.click(screen.getByRole('button', { name: 'Test vorzeitig beenden' }));

    expect(screen.getByText('Test wirklich beenden?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Weitermachen' }));
    expect(screen.queryByText('Test wirklich beenden?')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Test vorzeitig beenden' }));
    await user.click(screen.getByRole('button', { name: 'Ja, beenden' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Test zusammenstellen' })).toBeInTheDocument();
  });
});

describe('Selbsttest – Auswertung', () => {
  it('zählt in Worten, nicht in Noten', async () => {
    await seed('en-de', 3);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Selbsttest starten' }));
    await playAll(user, 3, (position) => position === 0);

    expect(await screen.findByRole('heading', { level: 2, name: 'Deine Auswertung' })).toBeInTheDocument();
    expect(screen.getByText('1 von 3 richtig')).toBeInTheDocument();

    const tally = screen.getByRole('list');
    expect(
      within(tally)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['1 richtig', '0 fast richtig', '2 noch nicht richtig']);

    // Keine Note, kein Bestanden, keine Ampel – und das steht auch so da.
    expect(screen.queryByText(/bestanden|durchgefallen|Punkte|Note \d/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Keine Note, keine Auswertung durch andere/)).toBeInTheDocument();
  });

  it('lobt ein fehlerfreies Ergebnis ruhig und bietet keine Fehlerrunde an', async () => {
    await seed('en-de', 3);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Selbsttest starten' }));
    await playAll(user, 3, () => true);

    expect(await screen.findByText('3 von 3 richtig')).toBeInTheDocument();
    expect(screen.getByText('Alles richtig – das sitzt.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fehler noch einmal üben' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fehler ansehen' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neuen Selbsttest starten' })).toBeInTheDocument();
  });

  it('zeigt in der Fehleransicht die eigene Antwort und die richtige', async () => {
    await seed('en-de', 3);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Selbsttest starten' }));
    await playAll(user, 3, () => false);

    await user.click(await screen.findByRole('button', { name: 'Fehler ansehen' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Das war noch nicht richtig' })).toBeInTheDocument();
    expect(screen.getAllByText('Deine Antwort:')).toHaveLength(3);
    expect(screen.getAllByText('Richtig wäre:')).toHaveLength(3);
    // Die Einstufung steht als Wort da, nicht nur als Farbe.
    expect(screen.getAllByText('noch nicht richtig').length).toBeGreaterThan(0);
    // Richtung und Aufgabenart sind benannt.
    expect(screen.getAllByText(/Englisch → Deutsch ·/).length).toBe(3);
  });

  it('wiederholt nur die Fehler und wertet neu aus', async () => {
    await seed('en-de', 3);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Selbsttest starten' }));
    await playAll(user, 3, (position) => position === 0);

    await user.click(await screen.findByRole('button', { name: 'Fehler noch einmal üben' }));

    expect(screen.getByText('Fehler wiederholen')).toBeInTheDocument();
    expect(screen.getAllByText('Aufgabe 1 von 2').length).toBeGreaterThan(0);

    await playAll(user, 2, () => true);

    expect(await screen.findByRole('heading', { level: 2, name: 'Wiederholung ausgewertet' })).toBeInTheDocument();
    expect(screen.getByText('2 von 2 richtig')).toBeInTheDocument();
  });

  it('führt über „Neuen Selbsttest starten“ zurück zur Auswahl', async () => {
    await seed('en-de', 3);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Selbsttest starten' }));
    await playAll(user, 3, () => true);

    await user.click(await screen.findByRole('button', { name: 'Neuen Selbsttest starten' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Test zusammenstellen' })).toBeInTheDocument();
  });
});

describe('Selbsttest – ohne jede Wirkung auf den Lernstand', () => {
  it('schreibt weder über die Repositories noch in die Datenbank', async () => {
    await seed('en-de', 3);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Selbsttest starten' }));
    await playAll(user, 3, (position) => position === 0);
    await screen.findByRole('heading', { level: 2, name: 'Deine Auswertung' });

    // Auch die Fehlerrunde bleibt folgenlos.
    await user.click(screen.getByRole('button', { name: 'Fehler noch einmal üben' }));
    await playAll(user, 2, () => true);
    await screen.findByRole('heading', { level: 2, name: 'Wiederholung ausgewertet' });

    expect(calls.startSession).toBe(0);
    expect(calls.recordAnswer).toBe(0);
    expect(await db.directionProgress.count()).toBe(0);
    expect(await db.packProgress.count()).toBe(0);
  });

  it('lässt einen vorhandenen Lernstand unverändert', async () => {
    await seed('en-de', 3);
    await db.directionProgress.bulkPut(
      ['e1', 'e2', 'e3'].map((entryId) => ({
        ...createEntryProgress(PACK_ID, entryId, 'en-de'),
        box: 3,
        dueAt: '2099-01-01T00:00:00.000Z',
        correctCount: 4,
        streak: 2,
        lastAnsweredAt: '2026-03-01T09:00:00.000Z',
      })),
    );
    const before = await snapshot();

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Selbsttest starten' }));
    await playAll(user, 3, () => false);
    await screen.findByRole('heading', { level: 2, name: 'Deine Auswertung' });

    expect(await snapshot()).toEqual(before);
  });
});
