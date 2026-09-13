import { describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RepositoryProvider } from '../application/RepositoryContext';
import { createFakeCloud, type FakeCloud } from '../application/fakeCloudRepositories';
import { HostedRoutes } from './HostedApp';
import { SessionProvider } from './SessionContext';

/**
 * Die Kursoberfläche – gegen die kontrollierte Fälschung.
 *
 * Das ist die **schnelle** Abnahme. Die inhaltliche steht woanders: Derselbe
 * Ablauf läuft als Vertrag gegen echtes PostgreSQL
 * (`src/cloud/courseRepositories.pglite.test.ts`). Hier geht es um das, was
 * nur an der Oberfläche zu sehen ist – dass der Code groß genug zum Vorlesen
 * dasteht, dass er danach verschwindet, und dass auf keiner Seite eine Zahl
 * über das Üben einer anderen Person auftaucht.
 */

/**
 * Eine Oberfläche auf einer bestimmten Adresse.
 *
 * `cloud` ist ein Parameter und keine Neuanlage: Der erste Entwurf baute bei
 * jedem Aufruf eine frische Fälschung – und eine zweite Ansicht sah den Kurs
 * nicht mehr, den die erste angelegt hatte. Wer vorher etwas einrichtet und
 * dann die Seite öffnet, muss dieselbe Fälschung weiterreichen.
 */
function setup(route: string, userId?: string, vorhandene?: FakeCloud) {
  const cloud = vorhandene ?? createFakeCloud();
  if (userId) cloud.signInAs(userId);
  else void cloud.repositories.auth!.signOut();

  // Vorherige Ansichten abräumen – sonst stehen zwei Bäume im selben Dokument
  // und jede Abfrage findet alles doppelt.
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
  return { cloud, user: userEvent.setup() };
}

/** Einen Kurs samt Code anlegen, ohne durch die Oberfläche zu gehen. */
async function kursMitCode(cloud: FakeCloud) {
  cloud.signInAs('u-lehrerin');
  const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
  const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});
  return { kurs, code };
}

describe('Kurse anlegen und sehen', () => {
  it('eine neue Lehrkraft sieht einen leeren Zustand mit Erklärung', async () => {
    setup('/kurse', 'u-lehrerin');
    expect(await screen.findByText(/Noch kein Kurs/)).toBeInTheDocument();
    expect(screen.getByText(/Einladungscode zum Vorlesen/)).toBeInTheDocument();
  });

  it('legt einen Kurs an und zeigt ihn danach in der Liste', async () => {
    const { user } = setup('/kurse', 'u-lehrerin');

    await user.click(await screen.findByRole('button', { name: 'Kurs anlegen' }));
    await user.type(screen.getByLabelText('Name des Kurses'), 'Englisch 7b');
    await user.type(screen.getByLabelText(/Schuljahr/), '2026/27');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(await screen.findByRole('link', { name: 'Englisch 7b' })).toBeInTheDocument();
    expect(screen.getByText(/Schuljahr 2026\/27/)).toBeInTheDocument();
  });

  it('lehnt einen leeren Titel ab, ohne die Seite zu verlieren', async () => {
    const { user } = setup('/kurse', 'u-lehrerin');
    await user.click(await screen.findByRole('button', { name: 'Kurs anlegen' }));
    await user.type(screen.getByLabelText('Name des Kurses'), '   ');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(await screen.findByText(/Titel zwischen 1 und 120 Zeichen/)).toBeInTheDocument();
  });
});

describe('der Einladungscode', () => {
  it('steht nach dem Erzeugen groß da – und nur dann', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });

    const { user } = setup(`/kurse/${kurs.id}`, 'u-lehrerin', cloud);
    await user.click(await screen.findByRole('button', { name: 'Code erzeugen' }));

    const meldung = await screen.findByText(/Diesen Code jetzt weitergeben/);
    const karte = meldung.closest('.alert')!;
    const code = within(karte as HTMLElement)
      .getByText(/^[A-Z2-9]{8}$/)
      .textContent!;
    expect(code).toHaveLength(8);

    expect(screen.getByText(/nicht mehr nachschlagen/i)).toBeInTheDocument();
    // In der Liste darunter steht nur das Kürzel.
    expect(screen.getByText(`${code.slice(0, 3)}…`)).toBeInTheDocument();
  });

  it('lässt sich zurückziehen', async () => {
    const cloud = createFakeCloud();
    const { kurs } = await kursMitCode(cloud);

    const { user } = setup(`/kurse/${kurs.id}`, 'u-lehrerin', cloud);
    await user.click(await screen.findByRole('button', { name: /Einladung .* zurückziehen/ }));

    expect(await screen.findByText('zurückgezogen')).toBeInTheDocument();
  });
});

describe('die Mitgliederliste', () => {
  it('zeigt Name, Kennung und Rolle – und keine Zahl über das Üben', async () => {
    const cloud = createFakeCloud();
    const { kurs, code } = await kursMitCode(cloud);
    cloud.signInAs('u-lernend');
    await cloud.repositories.invitations!.redeemCode(code);

    setup(`/kurse/${kurs.id}`, 'u-lehrerin', cloud);
    const tabelle = await screen.findByRole('table', { name: /Mitglieder dieses Kurses/ });

    expect(within(tabelle).getByText('Fuchs')).toBeInTheDocument();
    expect(within(tabelle).getByText('LX-7390')).toBeInTheDocument();
    expect(within(tabelle).getByText('lernt')).toBeInTheDocument();

    for (const wort of ['geübt', 'Fortschritt', 'richtig', 'zuletzt aktiv']) {
      expect(tabelle).not.toHaveTextContent(wort);
    }
  });

  it('sagt ausdrücklich, warum dort keine Lernstände stehen', async () => {
    const cloud = createFakeCloud();
    const { kurs } = await kursMitCode(cloud);

    setup(`/kurse/${kurs.id}`, 'u-lehrerin', cloud);
    expect(
      await screen.findByText(/Lernstände gehören den Lernenden/),
    ).toBeInTheDocument();
  });

  it('lässt eine Person entfernen', async () => {
    const cloud = createFakeCloud();
    const { kurs, code } = await kursMitCode(cloud);
    cloud.signInAs('u-lernend');
    await cloud.repositories.invitations!.redeemCode(code);

    const { user } = setup(`/kurse/${kurs.id}`, 'u-lehrerin', cloud);
    await user.click(
      await screen.findByRole('button', { name: 'Fuchs aus dem Kurs entfernen' }),
    );

    await waitFor(() => expect(screen.queryByText('Fuchs')).not.toBeInTheDocument());
  });
});

describe('archivierte Kurse', () => {
  it('sagen, was das heißt, und bieten keinen neuen Code an', async () => {
    const cloud = createFakeCloud();
    const { kurs } = await kursMitCode(cloud);

    const { user } = setup(`/kurse/${kurs.id}`, 'u-lehrerin', cloud);
    await user.click(await screen.findByRole('button', { name: 'Archivieren' }));

    expect(await screen.findByText(/Dieser Kurs ist archiviert/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Code erzeugen' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wieder öffnen' })).toBeInTheDocument();
  });
});

describe('Beitreten mit Konto', () => {
  it('löst den Code ein und führt in den Kurs', async () => {
    const cloud = createFakeCloud();
    const { code } = await kursMitCode(cloud);

    const { user } = setup('/beitreten', 'u-lernend', cloud);
    await user.type(await screen.findByLabelText('Einladungscode'), code);
    await user.click(screen.getByRole('button', { name: 'Beitreten' }));

    expect(await screen.findByRole('heading', { name: 'Englisch 7b' })).toBeInTheDocument();
  });

  it('meldet einen unbekannten Code, ohne mehr zu verraten', async () => {
    const { user } = setup('/beitreten', 'u-lernend');
    await user.type(await screen.findByLabelText('Einladungscode'), 'ZZZZZZZZ');
    await user.click(screen.getByRole('button', { name: 'Beitreten' }));

    expect(await screen.findByText(/gilt nicht/)).toBeInTheDocument();
  });
});

describe('Konto anlegen mit Code', () => {
  it('fragt zuerst nach dem Code und erst dann nach allem anderen', async () => {
    const { user } = setup('/beitreten');
    await user.type(await screen.findByLabelText('Einladungscode'), 'ZZZZZZZZ');
    // Vor dem Code gibt es kein Namensfeld – sonst füllt jemand ein Formular
    // aus, das an einem falschen Code endet.
    expect(screen.queryByLabelText(/Wie sollst du heißen/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(await screen.findByRole('heading', { name: 'Bist du neu hier?' })).toBeInTheDocument();
  });

  it('lehnt eine falsche Abschrift ab und lässt es noch einmal versuchen', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
    const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});
    await cloud.repositories.auth!.signOut();

    render(
      <RepositoryProvider value={cloud.repositories} mode="hosted">
        <SessionProvider>
          <MemoryRouter initialEntries={['/beitreten']}>
            <HostedRoutes />
          </MemoryRouter>
        </SessionProvider>
      </RepositoryProvider>,
    );
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Einladungscode'), code);
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    await user.click(await screen.findByRole('button', { name: 'Konto anlegen' }));
    await user.type(await screen.findByLabelText(/Wie sollst du heißen/), 'Luchs');
    await user.type(screen.getByLabelText('Kennwort'), 'testkennwort');
    await user.type(screen.getByLabelText('Kennwort noch einmal'), 'testkennwort');
    await user.click(screen.getByRole('button', { name: 'Konto anlegen' }));

    // Der Code steht groß da, mit der Warnung dazu.
    expect(await screen.findByRole('heading', { name: 'Dein Zugang' })).toBeInTheDocument();
    expect(screen.getByText(/Schreib diesen Code auf/)).toBeInTheDocument();
    expect(screen.getByText(/kann dir kein neues Kennwort geben/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Tipp den Code hier noch einmal ein/), 'FALSCH');
    await user.click(screen.getByRole('button', { name: 'Weiter zum Lernen' }));
    expect(await screen.findByText(/nicht derselbe Code/)).toBeInTheDocument();
  });

  it('führt nach richtiger Abschrift in den Lernbereich', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
    const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});
    await cloud.repositories.auth!.signOut();

    render(
      <RepositoryProvider value={cloud.repositories} mode="hosted">
        <SessionProvider>
          <MemoryRouter initialEntries={['/beitreten']}>
            <HostedRoutes />
          </MemoryRouter>
        </SessionProvider>
      </RepositoryProvider>,
    );
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Einladungscode'), code);
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    await user.click(await screen.findByRole('button', { name: 'Konto anlegen' }));
    await user.type(await screen.findByLabelText(/Wie sollst du heißen/), 'Luchs');
    await user.type(screen.getByLabelText('Kennwort'), 'testkennwort');
    await user.type(screen.getByLabelText('Kennwort noch einmal'), 'testkennwort');
    await user.click(screen.getByRole('button', { name: 'Konto anlegen' }));

    const codeAnzeige = await screen.findByText(/^TEST-CODE-\d{4}$/);
    await user.type(
      screen.getByLabelText(/Tipp den Code hier noch einmal ein/),
      codeAnzeige.textContent!,
    );
    await user.click(screen.getByRole('button', { name: 'Weiter zum Lernen' }));

    expect(await screen.findByRole('heading', { name: 'Deine Kurse' })).toBeInTheDocument();
  });
});
