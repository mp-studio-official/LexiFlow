import { describe, expect, it, vi } from 'vitest';

/*
  Diese Datei beschreibt den KI-Zugang, wie es ihn gibt – und den gibt es
  weiterhin, nur im Pilot nicht freigegeben (`pilot.ts`). Die Prüfungen
  deshalb gegen den **freien** Zustand, damit sie weiter das prüfen, wofür
  sie geschrieben wurden. Die Sperre selbst hat eine eigene Datei:
  `kiSperre.test.tsx`. Sie hier mit schwächeren Erwartungen grün zu machen
  hieße, die Zusagen über den Schlüssel aufzugeben, um eine Sperre zu zeigen.
*/
vi.mock('./pilot', async (original) => ({
  ...(await original<typeof import('./pilot')>()),
  KI_IM_PILOT: 'frei',
}));
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RepositoryProvider } from '../application/RepositoryContext';
import { createFakeCloud, type FakeCloud } from '../application/fakeCloudRepositories';
import { HostedRoutes } from './HostedApp';
import { SessionProvider } from './SessionContext';

/**
 * Die KI-Seite – gegen die kontrollierte Fälschung.
 *
 * Was der Server tut, steht in `supabase/functions/ai-gateway/`. Hier geht es
 * um das, was nur an der Oberfläche zu sehen ist: dass der Schlüssel nach dem
 * Speichern verschwindet, dass die Adresse bei den offiziellen Anbietern kein
 * Feld ist, und dass der Satz dasteht, der erklärt, wohin der Schlüssel geht.
 */

function zeige(cloud: FakeCloud, route = '/ki') {
  cleanup();
  render(
    <RepositoryProvider value={cloud.repositories} mode="hosted">
      <SessionProvider>
        <MemoryRouter initialEntries={[route]}>
          <HostedRoutes />
        </MemoryRouter>
      </SessionProvider>
    </RepositoryProvider>,
  );
  return userEvent.setup();
}

function alsLehrerin() {
  const cloud = createFakeCloud();
  cloud.signInAs('u-lehrerin');
  return cloud;
}

async function eintragen(user: ReturnType<typeof userEvent.setup>, schluessel: string) {
  await user.type(await screen.findByLabelText('Name für dich'), 'Schulzugang');
  await user.type(screen.getByLabelText('API-Schlüssel'), schluessel);
  await user.click(screen.getByRole('button', { name: 'Speichern' }));
}

describe('der KI-Zugang einer Lehrkraft', () => {
  it('sagt vor dem Eintragen, was mit dem Schlüssel passiert', async () => {
    zeige(alsLehrerin());
    expect(await screen.findByText(/kommt nie wieder heraus/)).toBeInTheDocument();
    expect(screen.getByText(/dein Browser spricht nie mit dem Anbieter/i)).toBeInTheDocument();
  });

  it('nennt die Adresse, an die der Schlüssel geht', async () => {
    /*
      Ein Feld „API-Schlüssel" ohne einen Satz darüber, wohin er geht, ist der
      Anfang der Geschichte, in der jemand ihn aus einer Anleitung kopiert.
    */
    zeige(alsLehrerin());
    await screen.findByLabelText('API-Schlüssel');
    expect(
      screen.getByText(/generativelanguage\.googleapis\.com/),
    ).toBeInTheDocument();
  });

  it('bietet bei einem offiziellen Anbieter kein Adressfeld an', async () => {
    zeige(alsLehrerin());
    await screen.findByLabelText('API-Schlüssel');
    expect(screen.queryByLabelText(/Eigene Adresse/)).not.toBeInTheDocument();
  });

  it('bietet es bei einem kompatiblen Anbieter an – mit dem Hinweis auf die Freigabe', async () => {
    const user = zeige(alsLehrerin());
    await user.selectOptions(await screen.findByLabelText('Anbieter'), 'openai-kompatibel');

    expect(screen.getByLabelText(/Eigene Adresse/)).toBeInTheDocument();
    expect(screen.getByText(/deine Verwaltung freigegeben hat/)).toBeInTheDocument();
  });

  it('zeigt nach dem Speichern nur noch die Maske', async () => {
    const cloud = alsLehrerin();
    const user = zeige(cloud);
    await eintragen(user, 'sk-test-abcdefgh1234');

    expect(await screen.findByText(/nicht mehr lesbar/)).toBeInTheDocument();
    expect(screen.getByText(/Schlüssel ••••••••1234/)).toBeInTheDocument();
    // Und nirgends der Klartext.
    expect(document.body.textContent).not.toContain('sk-test-abcdefgh');
  });

  it('leert das Eingabefeld sofort', async () => {
    /*
      Ein Zustand, der den Klartext hält, landet in jedem Fehlerbericht und in
      jedem Screenshot der Entwicklerwerkzeuge – auch „nur bis zum Neuladen".
    */
    const user = zeige(alsLehrerin());
    await eintragen(user, 'sk-test-abcdefgh1234');
    await screen.findByText(/nicht mehr lesbar/);

    expect((screen.getByLabelText('API-Schlüssel') as HTMLInputElement).value).toBe('');
  });

  it('das Browsermodell braucht weder Schlüssel noch Adresse', async () => {
    const user = zeige(alsLehrerin());
    await user.selectOptions(await screen.findByLabelText('Anbieter'), 'browsermodell');

    expect(screen.queryByLabelText('API-Schlüssel')).not.toBeInTheDocument();
    expect(screen.getByText(/läuft in deinem Browser/)).toBeInTheDocument();
  });

  it('erklärt den leeren Zustand, statt ihn nur zu zeigen', async () => {
    zeige(alsLehrerin());
    expect(await screen.findByText('Noch kein KI-Zugang')).toBeInTheDocument();
    expect(screen.getByText(/funktioniert vollständig ohne/)).toBeInTheDocument();
  });

  it('sagt, was ein Modell nie zu sehen bekommt', async () => {
    zeige(alsLehrerin());
    expect(await screen.findByText(/nie Namen, nie Lernstände/)).toBeInTheDocument();
  });

  it('entfernt einen Zugang auf Verlangen', async () => {
    const cloud = alsLehrerin();
    const user = zeige(cloud);
    await eintragen(user, 'sk-test-abcdefgh1234');
    await screen.findByText(/nicht mehr lesbar/);

    await user.click(screen.getByRole('button', { name: 'Entfernen' }));

    expect(await screen.findByText(/Der Schlüssel ist damit weg/)).toBeInTheDocument();
    expect(await cloud.repositories.ai!.listConnections()).toEqual([]);
  });
});

describe('wer die Seite überhaupt sieht', () => {
  it('eine lernende Person nicht', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lernend');
    zeige(cloud);

    // Der Riegel aus `RequireArea` – nicht ein verborgener Knopf.
    expect(screen.queryByRole('heading', { name: 'KI-Zugang' })).not.toBeInTheDocument();
  });

  it('und ihre Navigation führt nicht dorthin', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lernend');
    zeige(cloud, '/lernen');

    const ziele = await screen.findAllByRole('link');
    expect(ziele.map((verweis) => verweis.getAttribute('href'))).not.toContain('/ki');
  });
});
