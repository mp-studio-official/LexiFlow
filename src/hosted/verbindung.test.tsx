import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RepositoryProvider } from '../application/RepositoryContext';
import type { Repositories } from '../application/repositories';
import { CoursesPage } from './teacher/CoursesPage';
import { MaterialPage } from './teacher/MaterialPage';

/**
 * Was eine Ansicht tut, wenn die Verbindung fehlt (Pilot 0.1).
 *
 * ## Die drei Zusagen
 *
 * 1. **Keine endlose Ladeanzeige.** Vorher blieb die Liste `undefined`, und
 *    „Kurse werden geladen …" stand für immer da.
 * 2. **Ein Ausweg.** „Erneut versuchen" lädt dieselbe Ansicht noch einmal.
 * 3. **Keine falsche Zusage.** Kein „Noch kein Kurs", wenn niemand nachsehen
 *    konnte, ob es einen gibt – das ist der schlimmste der drei, weil er wie
 *    eine Auskunft aussieht.
 *
 * ## Warum die Ansichten einzeln geprüft werden
 *
 * Weil der Fehler nicht im Baustein steckte, sondern in jeder Ansicht
 * einzeln: Sie fingen die Ausnahme, legten den Text in einen Zustand und
 * zeigten darunter weiter, was sie nicht hatten. Ein Baustein zu prüfen
 * bewiese davon nichts.
 */

function kaputt(): Repositories {
  const werfen = () => Promise.reject(new Error('Netzwerkfehler'));
  return {
    courses: {
      myCourses: werfen,
      getCourse: werfen,
      members: werfen,
      createCourse: werfen,
    },
    packs: { list: werfen },
    publication: {},
  } as unknown as Repositories;
}

function zeige(seite: React.ReactNode) {
  cleanup();
  render(
    <RepositoryProvider value={kaputt()} mode="hosted">
      <MemoryRouter>{seite}</MemoryRouter>
    </RepositoryProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('die Kursliste ohne Verbindung', () => {
  it('hört auf zu laden', async () => {
    zeige(<CoursesPage />);
    await screen.findByTestId('error-state');
    expect(screen.queryByText(/werden geladen/)).not.toBeInTheDocument();
  });

  it('bietet einen Weg zurück an', async () => {
    zeige(<CoursesPage />);
    expect(await screen.findByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });

  it('behauptet nicht, es gebe keine Kurse', async () => {
    zeige(<CoursesPage />);
    await screen.findByTestId('error-state');
    expect(screen.queryByText('Noch kein Kurs')).not.toBeInTheDocument();
  });

  it('sagt, dass es an der Verbindung liegen kann', async () => {
    zeige(<CoursesPage />);
    expect(await screen.findByText(/Verbindung/)).toBeInTheDocument();
  });

  it('nennt den Offlinefall beim Namen, wenn das Gerät offline ist', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    zeige(<CoursesPage />);
    expect(await screen.findByText('Keine Verbindung')).toBeInTheDocument();
  });

  it('spricht ohne Offlinemeldung vorsichtiger', async () => {
    /*
      `navigator.onLine` sagt zuverlässig „nein", aber sein „ja" heißt nur,
      dass es eine Netzwerkschnittstelle gibt. Ein WLAN ohne Internet meldet
      `true` – deshalb hier „Nicht erreichbar" und nicht „alles in Ordnung".
    */
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    zeige(<CoursesPage />);
    expect(await screen.findByText('Nicht erreichbar')).toBeInTheDocument();
  });
});

describe('das Material ohne Verbindung', () => {
  it('hört auf zu laden und bietet einen Weg zurück an', async () => {
    zeige(<MaterialPage />);
    expect(await screen.findByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    expect(screen.queryByText(/wird geladen/)).not.toBeInTheDocument();
  });

  it('behauptet nicht, es gebe kein Paket', async () => {
    zeige(<MaterialPage />);
    await screen.findByTestId('error-state');
    expect(screen.queryByText('Noch kein Paket im Konto')).not.toBeInTheDocument();
  });
});
