import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PackDetailPage } from './PackDetailPage';
import { SessionPage } from './SessionPage';
import { clearAllLocalData } from '../../data/db';
import { savePack } from '../../data/packRepo';
import { makeEntry, makeMeta } from '../../test/fixtures';
import type { LearningDirection } from '../../domain/schema';

/**
 * Sprint 3B.1: Die Lernenden wählen die Richtung – und die Wahl gilt.
 *
 * Geprüft wird der ganze Weg: die Wahl auf der Paketseite, ihr Transport in
 * die Runde und die Beschriftung an der Aufgabe. Ohne den letzten Schritt
 * wüsste beim Üben niemand, was gerade gefragt ist.
 */

const PACK_ID = 'pack-direction';

async function seed(direction: LearningDirection = 'both'): Promise<void> {
  await savePack({
    meta: makeMeta({ id: PACK_ID, direction }),
    entries: [
      makeEntry({ id: 'e1', english: 'island', germanAnswers: ['die Insel'] }),
      makeEntry({ id: 'e2', english: 'bay', germanAnswers: ['die Bucht'] }),
      makeEntry({ id: 'e3', english: 'cave', germanAnswers: ['die Höhle'] }),
      makeEntry({ id: 'e4', english: 'boat', germanAnswers: ['das Boot'] }),
    ],
  });
}

function renderDetail(): void {
  render(
    <MemoryRouter initialEntries={[`/lernen/${PACK_ID}`]}>
      <Routes>
        <Route path="/lernen/:packId" element={<PackDetailPage />} />
        <Route path="/lernen/:packId/uebung" element={<h1>Übungsseite</h1>} />
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

beforeEach(async () => {
  await clearAllLocalData();
});

describe('Wahl der Richtung auf der Paketseite', () => {
  it('bietet bei „beide Richtungen“ drei Möglichkeiten an', async () => {
    await seed('both');
    renderDetail();

    expect(await screen.findByRole('radio', { name: 'Gemischt' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Englisch → Deutsch' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Deutsch → Englisch' })).toBeInTheDocument();
  });

  it('erklärt den empfohlenen Modus, statt ihn nur vorzuschreiben', async () => {
    await seed('both');
    renderDetail();

    expect(await screen.findByText(/Empfohlen: beide Richtungen/)).toBeInTheDocument();
  });

  it('bietet bei einem Paket mit einer Richtung keine Scheinwahl an', async () => {
    await seed('en-de');
    renderDetail();

    await screen.findByRole('radio', { name: 'Lernplan' });
    expect(screen.queryByRole('radio', { name: 'Gemischt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Deutsch → Englisch' })).not.toBeInTheDocument();
  });

  it('plant nach der Wahl sofort in der gewählten Richtung', async () => {
    await seed('both');
    const user = userEvent.setup();
    renderDetail();

    // Gemischt: ohne Lernstand ist nur die rezeptive Richtung bereit – vier Aufgaben.
    expect(await screen.findByRole('option', { name: 'Alle bereiten (4)' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Deutsch → Englisch' }));

    // Die produktive Richtung ist trotz fehlender Freischaltung sofort bereit.
    expect(await screen.findByRole('option', { name: 'Alle bereiten (4)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lernrunde starten' })).toBeEnabled();
  });
});

describe('Die Wahl in der Übungsrunde', () => {
  it('übt die ausdrücklich gewählte Richtung auch ohne Freischaltung', async () => {
    await seed('both');
    renderSession('length=10&seed=1&direction=de-en');

    // Deutsch → Englisch wäre im gemischten Modus noch gesperrt.
    expect(await screen.findByText(/Deutsch → Englisch/)).toBeInTheDocument();
    expect(screen.queryByText(/Englisch → Deutsch \(rezeptiv\)/)).not.toBeInTheDocument();
  });

  it('beschriftet jede Aufgabe mit ihrer Richtung', async () => {
    await seed('both');
    renderSession('length=10&seed=1');

    expect(await screen.findByText(/Englisch → Deutsch \(rezeptiv\)/)).toBeInTheDocument();
  });

  it('übt ohne Angabe gemischt und hält die Staffelung ein', async () => {
    await seed('both');
    renderSession('length=10&seed=1');

    expect(await screen.findByText(/Englisch → Deutsch \(rezeptiv\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Deutsch → Englisch \(produktiv\)/)).not.toBeInTheDocument();
  });

  it('bietet beim freien Üben beide Richtungen an', async () => {
    await seed('both');
    renderSession('length=20&seed=1&mode=free');

    // Acht Aufgaben: vier Vokabeln in zwei Richtungen. Der Text ist über
    // mehrere Elemente verteilt, deshalb wird der ganze Kopf geprüft.
    await screen.findByText(/Frei üben/);
    await waitFor(() => {
      expect(document.querySelector('.exercise__meta')?.textContent).toMatch(
        /Aufgabe 1 von 8/,
      );
    });
  });
});
