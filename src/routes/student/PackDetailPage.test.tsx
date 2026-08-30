import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PackDetailPage } from './PackDetailPage';
import { clearAllLocalData, db } from '../../data/db';
import { savePack } from '../../data/packRepo';
import { createEntryProgress } from '../../domain/leitner';
import { makeEntry, makeMeta } from '../../test/fixtures';
import type { LearningDirection } from '../../domain/schema';

/**
 * Sprint 1.3: Rundenwahl und Leerzustände müssen ehrlich sein – die angezeigten
 * Zahlen stammen aus derselben Planung, die auch die Runde baut.
 */

const PACK_ID = 'pack-detail';

function entriesNamed(count: number) {
  return Array.from({ length: count }, (_, index) =>
    makeEntry({
      id: `e${index + 1}`,
      english: `word${index + 1}`,
      germanAnswers: [`Wort${index + 1}`],
    }),
  );
}

async function seed(count: number, direction: LearningDirection): Promise<void> {
  await savePack({ meta: makeMeta({ id: PACK_ID, direction }), entries: entriesNamed(count) });
}

/** Alle rezeptiven Ziele auf einen zukünftigen Termin legen. */
async function makeEverythingLater(count: number, dueAt: string): Promise<void> {
  await db.directionProgress.bulkPut(
    entriesNamed(count).map((entry) => ({
      ...createEntryProgress(PACK_ID, entry.id, 'en-de'),
      box: 3,
      dueAt,
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

beforeEach(async () => {
  await clearAllLocalData();
});

describe('PackDetailPage – bereite Aufgaben', () => {
  it('zählt bei „beide Richtungen“ nur die freigeschaltete Richtung', async () => {
    await seed(4, 'both');
    renderDetail();

    expect(await screen.findByText(/Aufgaben sind jetzt bereit/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alle bereiten (4)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Alle bereiten (8)' })).not.toBeInTheDocument();
  });

  it('benennt die Rundengröße als Obergrenze', async () => {
    await seed(4, 'en-de');
    renderDetail();

    expect(await screen.findByRole('option', { name: 'Bis zu 15 Aufgaben' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bis zu 10 Aufgaben' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '15 Aufgaben' })).not.toBeInTheDocument();
  });

  it('nennt bereite und tatsächlich eingeplante Aufgaben getrennt', async () => {
    await seed(30, 'en-de');
    renderDetail();

    // 30 bereit, aber nur 15 in dieser Runde.
    expect(await screen.findByText(/Aufgaben sind jetzt bereit/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alle bereiten (30)' })).toBeInTheDocument();
    expect(screen.getByText(/werden für diese Runde eingeplant/)).toBeInTheDocument();
    expect(screen.getByText(/Die übrigen 15 folgen in einer weiteren Runde/)).toBeInTheDocument();
  });

  it('nennt bei passender Rundengröße keine abweichende Zahl', async () => {
    await seed(4, 'en-de');
    renderDetail();

    await screen.findByText(/Aufgaben sind jetzt bereit/);
    expect(screen.queryByText(/werden für diese Runde eingeplant/)).not.toBeInTheDocument();
  });
});

describe('PackDetailPage – Leerzustand', () => {
  it('deaktiviert den Start und nennt den nächsten Termin', async () => {
    await seed(4, 'en-de');
    const dueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await makeEverythingLater(4, dueAt);
    renderDetail();

    expect(await screen.findByText(/Gerade ist nichts fällig/)).toBeInTheDocument();
    expect(screen.getByText(/in 3 Tagen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Übung starten' })).toBeDisabled();
    expect(screen.queryByRole('option', { name: /Alle bereiten/ })).not.toBeInTheDocument();
  });

  it('bietet bei einem leeren Paket keine Runde an', async () => {
    await savePack({ meta: makeMeta({ id: PACK_ID, direction: 'en-de' }), entries: [] });
    renderDetail();

    expect(await screen.findByText(/Dieses Paket enthält keine Vokabeln/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Übung starten' })).toBeDisabled();
  });
});
