import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RepositoryProvider } from '../application/RepositoryContext';
import { createFakeCloud } from '../application/fakeCloudRepositories';
import { HostedApp, HostedRoutes, ohneGesperrteKi } from './HostedApp';
import { SessionProvider } from './SessionContext';
import {
  IST_PILOT,
  KI_IM_PILOT,
  LERNCOACH_KI_IM_PILOT,
  PILOT_BAND_TEXT,
  TEXTWERKSTATT_KI_IM_PILOT,
} from './pilot';
import { TEXT_SUGGESTION_CAPABILITY } from '../application/textSuggestions';

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
  it('gibt Textwerkstatt und den eng begrenzten Lerncoach frei', () => {
    expect(KI_IM_PILOT).toBe('gesperrt');
    expect(TEXTWERKSTATT_KI_IM_PILOT).toBe('frei');
    expect(LERNCOACH_KI_IM_PILOT).toBe('frei');
  });

  it('lässt Übersetzungsvorschläge durch', async () => {
    /*
      Der positive Teil des Riegels: Genau diese eine Fähigkeit erreicht das
      eigentliche Gateway. Ohne ihn könnte die negative Prüfung auch dadurch
      grün werden, dass schlicht jede KI-Fähigkeit gesperrt bleibt.
    */
    const cloud = createFakeCloud();
    expect(cloud.repositories.ai).toBeDefined();
    const invoke = vi.spyOn(cloud.repositories.ai!, 'invoke').mockResolvedValue({ suggestions: [] });
    await ohneGesperrteKi(cloud.repositories).ai!.invoke({
      connectionId: 'v1',
      capability: TEXT_SUGGESTION_CAPABILITY,
      payload: {},
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it.each([
    'learner-coach/fehler-erklaeren',
    'learner-coach/hinweis',
    'learner-coach/anderer-satz',
    'learner-coach/warum-richtig',
  ])('lässt die feste Lerncoach-Fähigkeit %s durch', async (capability) => {
    const cloud = createFakeCloud();
    const invoke = vi.spyOn(cloud.repositories.ai!, 'invoke').mockResolvedValue({ text: 'Hilfe' });
    await ohneGesperrteKi(cloud.repositories).ai!.invoke({
      connectionId: 'v1',
      capability,
      payload: {},
    });
    expect(invoke).toHaveBeenCalledWith({ connectionId: 'v1', capability, payload: {} });
  });

  it('blockiert jede andere Fähigkeit vor dem eigentlichen Gateway', async () => {
    const cloud = createFakeCloud();
    const invoke = vi.spyOn(cloud.repositories.ai!, 'invoke');
    await expect(
      ohneGesperrteKi(cloud.repositories).ai!.invoke({
        connectionId: 'v1',
        capability: 'learner-coach/freier-chat',
        payload: {},
      }),
    ).rejects.toThrow(/im Pilot noch nicht freigegeben/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('lässt alles andere unangetastet', () => {
    /*
      Eine Sperre, die nebenbei die Kurse mitnimmt, fiele erst im Pilot auf.
    */
    const cloud = createFakeCloud();
    const vorher = Object.keys(cloud.repositories).sort();
    expect(Object.keys(ohneGesperrteKi(cloud.repositories)).sort()).toEqual(vorher);
  });

  it('öffnet den Zugang nur für die Textwerkstatt', async () => {
    zeigeSeite('/ki');
    expect(await screen.findByText(/Im Pilot nur für die Textwerkstatt/)).toBeInTheDocument();
    expect(screen.getByText(/vier fest begrenzten Lerncoach-Handlungen/)).toBeInTheDocument();
  });

  it('erklärt, dass der Schlüssel nur den sicheren Serverweg nimmt', async () => {
    zeigeSeite('/ki');
    expect(await screen.findByText(/wird dort verschlüsselt abgelegt/)).toBeInTheDocument();
  });

  it('bietet der Lehrkraft die Verbindungseinrichtung an', async () => {
    zeigeSeite('/ki');
    await screen.findByText(/Im Pilot nur für die Textwerkstatt/);
    expect(screen.getByLabelText('API-Schlüssel')).toBeInTheDocument();
    expect(screen.getByLabelText('Anbieter')).toBeInTheDocument();
  });
});
