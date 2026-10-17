import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AiConnectionSummary, AiGateway } from '../../application/repositories';
import { LerncoachEinbettung } from './LerncoachEinbettung';

const AUFGABE = {
  lernform: 'went',
  richtung: 'de-en' as const,
  beispielsatz: 'We went home.',
  antwort: 'goed',
  loesung: 'went',
  sprache: 'de' as const,
  niveau: 'A2' as const,
};

function gateway(anfang: AiConnectionSummary[] = []) {
  let liste = [...anfang];
  const ai: AiGateway = {
    listConnections: vi.fn(async () => liste),
    saveConnection: vi.fn(async (input) => {
      const neu: AiConnectionSummary = {
        id: 'neu',
        label: input.label,
        adapter: input.adapter,
        model: input.model,
        maskedSecret: '••••1234',
        capabilities: [],
        active: true,
      };
      liste = [neu];
      return neu;
    }),
    deleteConnection: vi.fn(async (id) => { liste = liste.filter((eintrag) => eintrag.id !== id); }),
    testConnection: vi.fn(async () => ({ ok: true, message: 'Die Verbindung steht.' })),
    invoke: vi.fn(async () => ({ text: 'Denk an die unregelmäßige Vergangenheitsform.' })),
  };
  return ai;
}

function speicher() {
  const werte = new Map<string, string>();
  return {
    getItem: (key: string) => werte.get(key) ?? null,
    setItem: (key: string, wert: string) => { werte.set(key, wert); },
    removeItem: (key: string) => { werte.delete(key); },
  };
}

describe('die produktive Einbettung des Lerncoachs', () => {
  it('fragt bei gesperrter KI weder Liste noch Anbieter', () => {
    const ai = gateway();
    render(
      <LerncoachEinbettung
        aufgabe={AUFGABE}
        freigegeben={false}
        profilId="lernende-1"
        ai={ai}
        hinweisSpeicher={speicher()}
      />,
    );
    expect(screen.getByText(/noch nicht freigegeben/)).toBeInTheDocument();
    expect(ai.listConnections).not.toHaveBeenCalled();
    expect(ai.invoke).not.toHaveBeenCalled();
  });

  it('richtet einen persönlichen Zugang ein, testet ihn und vergisst den Klartext', async () => {
    const user = userEvent.setup();
    const ai = gateway();
    render(
      <LerncoachEinbettung
        aufgabe={AUFGABE}
        freigegeben
        profilId="lernende-1"
        ai={ai}
        hinweisSpeicher={speicher()}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'Eigenen Lerncoach verbinden' }));
    expect(screen.getByText(/Beim Verbinden wird nur der Zugang geprüft/)).toBeInTheDocument();
    expect(screen.getByText(/Name, Lern-ID,\s+Kurs und bisheriger Lernstand/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Anbieter'), 'openai');
    await user.type(screen.getByLabelText('Modellname'), 'gpt-test');
    await user.type(screen.getByLabelText('API-Schlüssel'), 'sk-test-geheim1234');
    await user.click(screen.getByRole('button', { name: 'Zugang verbinden' }));

    await waitFor(() => expect(ai.saveConnection).toHaveBeenCalledWith({
      label: 'OpenAI API',
      adapter: 'openai-kompatibel',
      baseUrl: 'https://api.openai.com/v1/',
      model: 'gpt-test',
      secret: 'sk-test-geheim1234',
    }));
    expect(ai.testConnection).toHaveBeenCalledWith('neu');
    await screen.findByText(/Bevor der Lerncoach/);
    expect(screen.queryByDisplayValue('sk-test-geheim1234')).not.toBeInTheDocument();
  });

  it('sendet nach dem Datenhinweis nur die aktuelle Coachaufgabe', async () => {
    const user = userEvent.setup();
    const ai = gateway([{
      id: 'meiner',
      label: 'Gemini API',
      adapter: 'gemini',
      model: 'gemini-test',
      maskedSecret: '••••1234',
      capabilities: [],
      active: true,
    }]);
    render(
      <LerncoachEinbettung
        aufgabe={AUFGABE}
        freigegeben
        profilId="lernende-1"
        ai={ai}
        hinweisSpeicher={speicher()}
      />,
    );
    await screen.findByText(/Bevor der Lerncoach/);
    await user.click(screen.getByRole('button', { name: 'Verstanden' }));
    await user.click(screen.getByRole('button', { name: 'Gib mir einen Hinweis' }));

    await waitFor(() => expect(ai.invoke).toHaveBeenCalledWith({
      connectionId: 'meiner',
      capability: 'learner-coach/hinweis',
      payload: AUFGABE,
      signal: expect.any(AbortSignal),
    }));
    expect(screen.getByText(/unregelmäßige Vergangenheitsform/)).toBeInTheDocument();
  });

  it('bietet eine eigene Adresse nur als vorab freizugebenden Host an', async () => {
    const user = userEvent.setup();
    render(
      <LerncoachEinbettung
        aufgabe={AUFGABE}
        freigegeben
        profilId="lernende-1"
        ai={gateway()}
        hinweisSpeicher={speicher()}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'Eigenen Lerncoach verbinden' }));
    expect(screen.queryByLabelText('API-Adresse')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Anbieter'), 'kompatibel');
    expect(screen.getByLabelText('API-Adresse')).toBeInTheDocument();
    expect(screen.getByText(/Verwaltung muss den Host vorher freigegeben/)).toBeInTheDocument();
  });

  it('löscht einen Schlüssel erst nach ausdrücklicher Bestätigung', async () => {
    const user = userEvent.setup();
    const ai = gateway([{
      id: 'meiner', label: 'Gemini API', adapter: 'gemini', model: 'gemini-test',
      maskedSecret: '••••1234', capabilities: [], active: true,
    }]);
    render(
      <LerncoachEinbettung
        aufgabe={AUFGABE}
        freigegeben
        profilId="lernende-1"
        ai={ai}
        hinweisSpeicher={speicher()}
      />,
    );
    await screen.findByText(/Bevor der Lerncoach/);
    await user.click(screen.getByRole('button', { name: 'Zugang entfernen' }));
    expect(ai.deleteConnection).not.toHaveBeenCalled();
    expect(screen.getByText(/nicht wiederherstellen/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Wirklich entfernen' }));
    await waitFor(() => expect(ai.deleteConnection).toHaveBeenCalledWith('meiner'));
    await screen.findByRole('button', { name: 'Eigenen Lerncoach verbinden' });
  });
});
