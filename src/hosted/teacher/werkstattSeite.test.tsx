import { describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RepositoryProvider } from '../../application/RepositoryContext';
import { createFakeCloud, type FakeCloud } from '../../application/fakeCloudRepositories';
import { SessionProvider } from '../SessionContext';
import { HostedRoutes } from '../HostedApp';

/**
 * Die Werkstatt im echten Portal.
 *
 * Geprüft wird der Weg, den eine Lehrkraft wirklich geht — über die Route,
 * nicht über die Komponente. Eine Prüfung gegen die Komponente allein
 * sähe nicht, ob der Riegel, die Route und der Einstiegsknopf
 * zusammenpassen; und genau dort fallen Integrationen auseinander.
 */

function setup(route: string, userId?: string, vorhandene?: FakeCloud) {
  const cloud = vorhandene ?? createFakeCloud();
  if (userId) cloud.signInAs(userId);
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

const LISTE = 'house\tHaus\ncar\tAuto\ntree\tBaum';

describe('der Weg zur Werkstatt', () => {
  it('führt von den Lernpaketen aus über einen Knopf, nicht über die Navigation', async () => {
    setup('/pakete', 'u-lehrerin');
    const knopf = await screen.findByRole('link', { name: 'Neues Lernpaket' });
    /*
      Ohne `#`: Der `MemoryRouter` dieses Prüfstands schreibt Pfade, die
      ausgelieferte Anwendung einen `HashRouter`. Die Navigationsziele
      unten stehen dagegen als literale `#`-Adressen in
      `navigationsziele.ts` und werden deshalb auch so geprüft.
    */
    expect(knopf).toHaveAttribute('href', '/pakete/neu');

    /*
      Kein sechstes Navigationsziel: Die Werkstatt ist eine Handlung an den
      Lernpaketen, kein Ort daneben.
    */
    for (const nav of screen.getAllByRole('navigation', { name: 'Hauptnavigation' })) {
      const ziele = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'));
      expect(ziele).not.toContain('#/pakete/neu');
    }
  });

  it('bleibt erreichbar, auch wenn die Liste nicht lädt', async () => {
    /*
      Ein neues Paket anzulegen braucht die vorhandenen nicht. Stand der
      Knopf nur im Erfolgsfall, sass eine Lehrkraft mit wackeliger
      Verbindung vor einer Seite, auf der gar nichts ging.
    */
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    const kaputt = {
      ...cloud.repositories,
      packs: {
        ...cloud.repositories.packs!,
        list: () => Promise.reject(new Error('keine Verbindung')),
      },
    };
    cleanup();
    render(
      <RepositoryProvider value={kaputt} mode="hosted">
        <SessionProvider>
          <MemoryRouter initialEntries={['/pakete']}>
            <HostedRoutes />
          </MemoryRouter>
        </SessionProvider>
      </RepositoryProvider>,
    );
    expect(await screen.findByText(/Erneut versuchen/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Neues Lernpaket' })).toBeInTheDocument();
  });

  it('öffnet sich unter `#/pakete/neu`', async () => {
    setup('/pakete/neu', 'u-lehrerin');
    expect(await screen.findByRole('heading', { name: 'Neues Lernpaket', level: 1 })).toBeInTheDocument();
  });

  it('bleibt hinter dem Lehrkraftriegel', async () => {
    setup('/pakete/neu', 'u-lernend');
    expect(await screen.findByText(/nicht für dieses Konto/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Neues Lernpaket' })).toBeNull();
  });
});

describe('aus einer eingefügten Liste wird ein Entwurf', () => {
  async function bisVorschau() {
    const { cloud, user } = setup('/pakete/neu', 'u-lehrerin');
    const feld = await screen.findByLabelText('Vokabeln einfügen');
    await user.click(feld);
    await user.paste(LISTE);
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    return { cloud, user };
  }

  it('erkennt das Format ohne Spaltenzuordnung', async () => {
    await bisVorschau();
    expect(await screen.findByDisplayValue('house')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Haus')).toBeInTheDocument();
    expect(screen.getByText(/durch Tabulatoren getrennt/)).toBeInTheDocument();
  });

  it('fragt Jahrgang und Richtung, statt sie zu raten', async () => {
    await bisVorschau();
    expect(screen.getByLabelText('Jahrgang')).toBeInTheDocument();
    expect(screen.getByLabelText('Abfragerichtung')).toBeInTheDocument();
  });

  it('legt beim Abschluss einen Entwurf an — und veröffentlicht nichts', async () => {
    const { cloud, user } = await bisVorschau();
    await user.type(await screen.findByLabelText('Name des Lernpakets'), 'Unit 3');
    await user.click(screen.getByRole('button', { name: 'Lernpaket anlegen' }));

    expect(await screen.findByRole('heading', { name: 'Lernpaket angelegt' })).toBeInTheDocument();

    const liste = await cloud.repositories.packs!.list();
    const angelegt = liste.find((paket) => paket.title === 'Unit 3');
    expect(angelegt).toBeDefined();
    expect(angelegt!.entryCount).toBe(3);
    /* Der Kern der Zusage: nichts ist veröffentlicht. */
    expect(angelegt!.publishedRevision).toBeUndefined();
  });

  it('erklärt den nächsten Schritt, statt ihn zu tun', async () => {
    const { user } = await bisVorschau();
    await user.type(await screen.findByLabelText('Name des Lernpakets'), 'Unit 3');
    await user.click(screen.getByRole('button', { name: 'Lernpaket anlegen' }));
    await screen.findByRole('heading', { name: 'Lernpaket angelegt' });

    expect(screen.getByText(/niemand in einer Lerngruppe sieht ihn/)).toBeInTheDocument();
    expect(screen.getByText(/unveränderliche\s*Fassung eingefroren/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zu den Lernpaketen' })).toHaveAttribute(
      'href',
      '/pakete',
    );
  });

  it('übernimmt den Jahrgang in das Paket', async () => {
    const { cloud, user } = await bisVorschau();
    await user.selectOptions(screen.getByLabelText('Jahrgang'), '9');
    await user.type(await screen.findByLabelText('Name des Lernpakets'), 'Unit 9');
    await user.click(screen.getByRole('button', { name: 'Lernpaket anlegen' }));
    await screen.findByRole('heading', { name: 'Lernpaket angelegt' });

    const liste = await cloud.repositories.packs!.list();
    expect(liste.find((paket) => paket.title === 'Unit 9')?.grade).toBe('9');
  });

  it('lässt sich ohne Namen nicht abschließen', async () => {
    await bisVorschau();
    expect(await screen.findByRole('button', { name: 'Lernpaket anlegen' })).toBeDisabled();
    expect(screen.getByText(/fehlt noch ein Name/)).toBeInTheDocument();
  });
});

describe('Handkorrekturen überleben eine neue Erkennung', () => {
  it('behält die geänderte Übersetzung', async () => {
    const { user } = setup('/pakete/neu', 'u-lehrerin');
    const feld = await screen.findByLabelText('Vokabeln einfügen');
    await user.click(feld);
    await user.paste(LISTE);
    await user.click(screen.getByRole('button', { name: 'Weiter' }));

    const uebersetzung = await screen.findByDisplayValue('Baum');
    await user.clear(uebersetzung);
    await user.type(uebersetzung, 'Baum; Stammbaum');

    await waitFor(() => expect(screen.getByDisplayValue('Baum; Stammbaum')).toBeInTheDocument());
  });
});
