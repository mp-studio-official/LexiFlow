import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { clearAllLocalData } from '../../data/db';
import { savePack } from '../../data/packRepo';
import { makeEntry, makeMeta } from '../../test/fixtures';
import { PackDetailPage } from './PackDetailPage';
import { SessionPage } from './SessionPage';
import type { LearningDirection } from '../../domain/schema';

const VocabBrowsePage = (await import('./VocabBrowsePage')).VocabBrowsePage;
const CardStudyPage = (await import('./CardStudyPage')).CardStudyPage;
const SelfTestPage = (await import('./SelfTestPage')).SelfTestPage;
const FreePracticeSetupPage = (await import('./FreePracticeSetupPage')).FreePracticeSetupPage;

/**
 * Sprint 4A.1b: Die Wege hinaus stehen oben, nicht unten.
 *
 * Vorher lagen „Zurück zum Paket“ und „Mit Karten lernen“ am Ende der Seite –
 * mitten in einer Runde musste man erst an allen Aufgaben vorbeiscrollen.
 * Diese Tests halten fest, wo die Aktionen stehen, dass sie nicht doppelt
 * vorkommen und wann vor dem Verlassen gefragt wird.
 */

const PACK_ID = 'pack-header';

async function seed(direction: LearningDirection = 'en-de'): Promise<void> {
  await savePack({
    meta: makeMeta({ id: PACK_ID, direction, title: 'Halong Bay' }),
    entries: [
      makeEntry({ id: 'e1', english: 'island', germanAnswers: ['die Insel'] }),
      makeEntry({ id: 'e2', english: 'bay', germanAnswers: ['die Bucht'] }),
      makeEntry({ id: 'e3', english: 'cave', germanAnswers: ['die Höhle'] }),
      makeEntry({ id: 'e4', english: 'boat', germanAnswers: ['das Boot'] }),
    ],
  });
}

/** Rendert eine Schüleransicht mit allen Zielen der Kopfnavigation. */
function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/lernen" element={<h1>Alle Pakete</h1>} />
        <Route path="/" element={<h1>Startseite</h1>} />
        <Route path="/lernen/:packId" element={<PackDetailPage />} />
        <Route path="/lernen/:packId/uebung" element={<SessionPage />} />
        <Route path="/lernen/:packId/durchsehen" element={<VocabBrowsePage />} />
        <Route path="/lernen/:packId/karten" element={<CardStudyPage />} />
        <Route path="/lernen/:packId/selbsttest" element={<SelfTestPage />} />
        <Route path="/lernen/:packId/frei" element={<FreePracticeSetupPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Der Kopfbereich – dort und nur dort gehört die allgemeine Navigation hin. */
function header(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Lernnavigation' });
}

beforeEach(async () => {
  await clearAllLocalData();
});

afterEach(() => {
  delete (globalThis as { __LEXIFLOW_SINGLE_PACK__?: boolean }).__LEXIFLOW_SINGLE_PACK__;
});

describe('Kopfnavigation der Lernansichten', () => {
  it('zeigt beide Aktionen in der Lernplanrunde', async () => {
    await seed();
    renderAt(`/lernen/${PACK_ID}/uebung?kinds=flashcard&length=4&seed=1`);

    await screen.findByText('Aufgabe 1 von 4');
    expect(within(header()).getByRole('button', { name: 'Zurück zum Paket' })).toBeInTheDocument();
    expect(within(header()).getByRole('button', { name: 'Mit Karten lernen' })).toBeInTheDocument();
  });

  it('zeigt beide Aktionen in der freien Runde', async () => {
    await seed();
    renderAt(`/lernen/${PACK_ID}/uebung?mode=free&kinds=flashcard&length=4&seed=1`);

    await screen.findByText(/Frei üben · Aufgabe 1 von 4/);
    expect(within(header()).getByRole('button', { name: 'Zurück zum Paket' })).toBeInTheDocument();
    expect(within(header()).getByRole('button', { name: 'Mit Karten lernen' })).toBeInTheDocument();
  });

  it('zeigt beide Aktionen in der Einrichtung der freien Runde', async () => {
    await seed();
    renderAt(`/lernen/${PACK_ID}/frei`);

    await screen.findByRole('heading', { level: 2, name: 'Runde anpassen' });
    // Reine Navigation: echte Links, keine Schaltflächen.
    expect(within(header()).getByRole('link', { name: 'Zurück zum Paket' })).toHaveAttribute(
      'href',
      `/lernen/${PACK_ID}`,
    );
    expect(within(header()).getByRole('link', { name: 'Mit Karten lernen' })).toHaveAttribute(
      'href',
      `/lernen/${PACK_ID}/karten`,
    );
  });

  it('zeigt beide Aktionen im Selbsttest', async () => {
    await seed();
    renderAt(`/lernen/${PACK_ID}/selbsttest`);

    await screen.findByRole('heading', { level: 2, name: 'Test zusammenstellen' });
    expect(within(header()).getByRole('link', { name: 'Zurück zum Paket' })).toBeInTheDocument();
    expect(within(header()).getByRole('link', { name: 'Mit Karten lernen' })).toBeInTheDocument();
  });

  it('zeigt beide Aktionen beim Durchsehen', async () => {
    await seed();
    renderAt(`/lernen/${PACK_ID}/durchsehen`);

    await screen.findByRole('heading', { level: 2, name: 'island' });
    expect(within(header()).getByRole('link', { name: 'Zurück zum Paket' })).toBeInTheDocument();
    expect(within(header()).getByRole('link', { name: 'Mit Karten lernen' })).toBeInTheDocument();
  });

  it('zeigt im Kartenmodus keinen Weg auf die eigene Seite', async () => {
    await seed();
    renderAt(`/lernen/${PACK_ID}/karten`);

    await screen.findByText('Karte 1 von 4');
    expect(within(header()).getByRole('link', { name: 'Zurück zum Paket' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mit Karten lernen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mit Karten lernen' })).not.toBeInTheDocument();
  });

  it('führt „Mit Karten lernen“ in dasselbe Paket', async () => {
    await seed();
    const user = userEvent.setup();
    renderAt(`/lernen/${PACK_ID}/durchsehen`);

    await screen.findByRole('heading', { level: 2, name: 'island' });
    await user.click(within(header()).getByRole('link', { name: 'Mit Karten lernen' }));

    expect(await screen.findByText('Karte 1 von 4')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Halong Bay' })).toBeInTheDocument();
  });

  it('führt jede allgemeine Aktion nur einmal', async () => {
    await seed();
    renderAt(`/lernen/${PACK_ID}/durchsehen`);

    await screen.findByRole('heading', { level: 2, name: 'island' });
    expect(screen.getAllByRole('link', { name: 'Zurück zum Paket' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Mit Karten lernen' })).toHaveLength(1);
  });
});

describe('Rückfrage vor dem Verlassen', () => {
  it('fragt in einer laufenden Runde nach – auf beiden Wegen', async () => {
    await seed();
    const user = userEvent.setup();
    renderAt(`/lernen/${PACK_ID}/uebung?kinds=flashcard&length=4&seed=1`);

    await screen.findByText('Aufgabe 1 von 4');

    await user.click(within(header()).getByRole('button', { name: 'Mit Karten lernen' }));
    expect(screen.getByText('Runde wirklich verlassen?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Weitermachen' }));
    expect(screen.queryByText('Runde wirklich verlassen?')).not.toBeInTheDocument();

    await user.click(within(header()).getByRole('button', { name: 'Zurück zum Paket' }));
    expect(screen.getByText('Runde wirklich verlassen?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ja, verlassen' }));
    // Seit 4B.6 steht der Lernstand als schlanke Zeile ohne eigene Überschrift.
    expect(await screen.findByRole('heading', { level: 2, name: 'Auf eigene Weise lernen' })).toBeInTheDocument();
  });

  it('fragt im laufenden Selbsttest nach', async () => {
    await seed();
    const user = userEvent.setup();
    renderAt(`/lernen/${PACK_ID}/selbsttest`);

    await user.click(await screen.findByRole('button', { name: 'Selbsttest starten' }));
    await user.click(within(header()).getByRole('button', { name: 'Zurück zum Paket' }));

    expect(screen.getByText('Selbsttest wirklich verlassen?')).toBeInTheDocument();
  });

  it('fragt in einer abgeschlossenen Runde nicht nach', async () => {
    await seed();
    const user = userEvent.setup();
    renderAt(`/lernen/${PACK_ID}/uebung?mode=free&kinds=flashcard&length=4&seed=1`);

    for (let step = 1; step <= 4; step += 1) {
      await screen.findByText(new RegExp(`Aufgabe ${step} von 4`));
      await user.click(screen.getByRole('button', { name: 'Lösung anzeigen' }));
      await user.click(screen.getByRole('button', { name: /^Gewusst$/ }));
      await user.click(screen.getByRole('button', { name: /^(Weiter|Runde beenden)$/ }));
    }

    expect(await screen.findByRole('heading', { level: 1, name: 'Freie Runde abgeschlossen' }))
      .toBeInTheDocument();
    // Ergebnisansicht: echte Links, keine Rückfrage.
    await user.click(within(header()).getByRole('link', { name: 'Zurück zum Paket' }));
    // Seit 4B.6 steht der Lernstand als schlanke Zeile ohne eigene Überschrift.
    expect(await screen.findByRole('heading', { level: 2, name: 'Auf eigene Weise lernen' })).toBeInTheDocument();
  });

  it('fragt in der Einrichtung nicht nach', async () => {
    await seed();
    const user = userEvent.setup();
    renderAt(`/lernen/${PACK_ID}/frei`);

    await screen.findByRole('heading', { level: 2, name: 'Runde anpassen' });
    await user.click(within(header()).getByRole('link', { name: 'Zurück zum Paket' }));

    // Seit 4B.6 steht der Lernstand als schlanke Zeile ohne eigene Überschrift.
    expect(await screen.findByRole('heading', { level: 2, name: 'Auf eigene Weise lernen' })).toBeInTheDocument();
  });
});

describe('Rückweg von der Paketseite', () => {
  it('führt im normalen LexiFlow zu allen Paketen', async () => {
    await seed();
    const user = userEvent.setup();
    renderAt(`/lernen/${PACK_ID}`);

    const nav = await screen.findByRole('navigation', { name: 'Paketnavigation' });
    const link = within(nav).getByRole('link', { name: 'Alle Pakete' });
    expect(link).toHaveAttribute('href', '/lernen');

    await user.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: 'Alle Pakete' })).toBeInTheDocument();
  });

  it('verspricht in einer Einzelpaket-Datei keine Bibliothek', async () => {
    (globalThis as { __LEXIFLOW_SINGLE_PACK__?: boolean }).__LEXIFLOW_SINGLE_PACK__ = true;
    await seed();
    const user = userEvent.setup();
    renderAt(`/lernen/${PACK_ID}`);

    const nav = await screen.findByRole('navigation', { name: 'Paketnavigation' });
    expect(within(nav).queryByRole('link', { name: 'Alle Pakete' })).not.toBeInTheDocument();

    const link = within(nav).getByRole('link', { name: 'Start' });
    expect(link).toHaveAttribute('href', '/');

    await user.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: 'Startseite' })).toBeInTheDocument();
  });
});
