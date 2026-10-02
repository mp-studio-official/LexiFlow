import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RepositoryProvider } from '../application/RepositoryContext';
import { createFakeCloud } from '../application/fakeCloudRepositories';
import { HostedApp, HostedRoutes, ohneGesperrteKi } from './HostedApp';
import { SessionProvider } from './SessionContext';
import { IST_PILOT, KI_IM_PILOT, PILOT_BAND_TEXT } from './pilot';

/**
 * Die Pilotgrenze an der Oberfläche: Band und KI-Sperre.
 *
 * ## Warum eine eigene Datei
 *
 * Weil `ai.test.tsx` den KI-Zugang beschreibt, wie es ihn gibt, und ihn
 * deshalb im freien Zustand prüft. Beides in einer Datei hieße, dieselbe
 * Seite in zwei Zuständen zu mischen – und beim nächsten Lesen weiß niemand
 * mehr, welcher Zustand gerade gemeint war.
 *
 * ## Was „deterministisch" hier bedeutet
 *
 * Nicht „die Schaltfläche ist weg". Der Zugang wird aus dem Speicherverbund
 * **entfernt**: Es gibt keinen Weg mehr zu `ai-gateway`, auch nicht aus einer
 * Ansicht, die es später gibt. Die Prüfung unten sieht deshalb nicht auf den
 * Bildschirm, sondern auf das, was die Anwendung weiterreicht.
 */

function zeigeSeite(route: string) {
  const cloud = createFakeCloud();
  cloud.signInAs('u-lehrerin');
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
}

describe('die Pilotkennzeichnung', () => {
  it('steht als Band über der Anwendung', async () => {
    cleanup();
    render(<HostedApp repositories={{}} env={{ BASE_URL: '/' }} />);
    expect(await screen.findByText(PILOT_BAND_TEXT)).toBeInTheDocument();
  });

  it('sagt, dass es ein Pilot ist, und nicht nur eine Fassungsnummer', () => {
    /*
      Eine Nummer allein („0.1") liest sich wie ein frühes Produkt. Der Satz
      muss das Wort enthalten, um das es geht.
    */
    expect(PILOT_BAND_TEXT).toMatch(/Pilot/);
  });

  it('hängt an keiner Umgebungsfahne', () => {
    expect(IST_PILOT).toBe(true);
  });
});

describe('die KI-Sperre im Pilot', () => {
  it('ist bestimmt und nicht zufällig', () => {
    expect(KI_IM_PILOT).toBe('gesperrt');
  });

  it('nimmt den Zugang aus dem Speicherverbund', () => {
    /*
      Der eigentliche Riegel. Eine Fälschung mit KI-Zugang geht hinein; was
      die Ansichten bekommen, hat keinen.
    */
    const cloud = createFakeCloud();
    expect(cloud.repositories.ai).toBeDefined();
    expect(ohneGesperrteKi(cloud.repositories).ai).toBeUndefined();
  });

  it('lässt alles andere unangetastet', () => {
    /*
      Eine Sperre, die nebenbei die Kurse mitnimmt, fiele erst im Pilot auf.
    */
    const cloud = createFakeCloud();
    const vorher = Object.keys(cloud.repositories).filter((name) => name !== 'ai').sort();
    expect(Object.keys(ohneGesperrteKi(cloud.repositories)).sort()).toEqual(vorher);
  });

  it('erklärt auf der KI-Seite, dass es am Pilot liegt', async () => {
    zeigeSeite('/ki');
    expect(await screen.findByText(/Im Pilot nicht freigegeben/)).toBeInTheDocument();
    expect(screen.getByText(/noch nicht freigegeben/)).toBeInTheDocument();
  });

  it('sagt zu, dass hinterlegte Zugänge erhalten bleiben', async () => {
    zeigeSeite('/ki');
    expect(await screen.findByText(/bleiben\s+erhalten/)).toBeInTheDocument();
  });

  it('bietet kein Feld für einen Schlüssel an', async () => {
    zeigeSeite('/ki');
    await screen.findByText(/Im Pilot nicht freigegeben/);
    expect(screen.queryByLabelText('API-Schlüssel')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Anbieter')).not.toBeInTheDocument();
  });
});
