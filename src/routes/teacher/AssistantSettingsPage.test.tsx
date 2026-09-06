import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AssistantSettingsPage } from './AssistantSettingsPage';
import { resetSessionKeyForTests } from '../../ai/gemini/credentials';
import {
  createFakeGemini,
  replyWithError,
  replyWithJson,
  TEST_API_KEY,
  type FakeGemini,
} from '../../ai/gemini/fakeGemini';
import { createGeminiAiProvider } from '../../ai/gemini/geminiAiProvider';
import { loadKey } from '../../ai/gemini/credentials';

/**
 * Die Einrichtungsseite – geprüft ohne eine einzige echte Anfrage.
 *
 * Vier Zusagen stehen hier auf dem Prüfstand, und die erste ist die, die man am
 * spätesten bemerkt, wenn sie bricht:
 *
 * 1. Beim **Öffnen** passiert nichts. Kein Aufruf, kein Kontingent, keine Kosten.
 * 2. Der Schlüssel wird **nicht wieder angezeigt**, sobald er übernommen ist.
 * 3. „Merken“ ist **aus**, bis jemand es einschaltet.
 * 4. Eine Fehlermeldung von Google erscheint **nicht im Wortlaut**.
 */

function seite(fake: FakeGemini) {
  return render(
    <AssistantSettingsPage
      createAssistant={(getModel) =>
        createGeminiAiProvider({
          getKey: () => loadKey()?.key,
          getModel,
          transport: fake.transport,
        })
      }
    />,
  );
}

const GUT = replyWithJson({ verdict: 'ok', reason: 'gebräuchliche Form' });

beforeEach(() => {
  resetSessionKeyForTests();
  window.localStorage.clear();
});

afterEach(() => {
  resetSessionKeyForTests();
  window.localStorage.clear();
});

describe('Beim Öffnen', () => {
  it('wird nichts aufgerufen', () => {
    /*
      Der Verbindungstest steht auf einem Knopf. Eine Seite, die beim Öffnen
      prüft, verbraucht das Kontingent von jemandem, der nur nachsehen wollte.
    */
    const fake = createFakeGemini(GUT);
    seite(fake);

    expect(screen.getByText(/Nicht eingerichtet/)).toBeInTheDocument();
    expect(fake.calls).toHaveLength(0);
  });

  it('ist „Auf diesem Gerät merken“ ausgeschaltet', () => {
    seite(createFakeGemini(GUT));
    expect(screen.getByRole('checkbox', { name: /merken/i })).not.toBeChecked();
  });

  it('lässt „Verbindung testen“ ohne Schlüssel gar nicht erst zu', () => {
    seite(createFakeGemini(GUT));
    expect(screen.getByRole('button', { name: /Verbindung testen/ })).toBeDisabled();
  });
});

describe('Der Schlüssel', () => {
  it('erscheint nach dem Übernehmen nur noch maskiert', async () => {
    /*
      Die Zusage aus der Vorgabe: niemals vollständig erneut anzeigen. Das Feld
      wird geleert, und es gibt keinen Knopf, der ihn zurückholt.
    */
    const user = userEvent.setup();
    seite(createFakeGemini(GUT));

    await user.type(screen.getByLabelText(/API-Schlüssel/), TEST_API_KEY);
    await user.click(screen.getByRole('button', { name: 'Schlüssel übernehmen' }));

    expect(screen.getByLabelText(/API-Schlüssel/)).toHaveValue('');
    expect(screen.getByText('TEST…0000')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(TEST_API_KEY);
  });

  it('steht im Feld verdeckt und wird nur auf Klick sichtbar', async () => {
    const user = userEvent.setup();
    seite(createFakeGemini(GUT));

    const feld = screen.getByLabelText(/API-Schlüssel/);
    expect(feld).toHaveAttribute('type', 'password');

    await user.type(feld, TEST_API_KEY);
    await user.click(screen.getByRole('button', { name: 'Anzeigen' }));
    expect(feld).toHaveAttribute('type', 'text');
  });

  it('liegt ohne Häkchen nur in der Sitzung', async () => {
    const user = userEvent.setup();
    seite(createFakeGemini(GUT));

    await user.type(screen.getByLabelText(/API-Schlüssel/), TEST_API_KEY);
    await user.click(screen.getByRole('button', { name: 'Schlüssel übernehmen' }));

    expect(window.localStorage.getItem('lexiflow.gemini.key')).toBeNull();
    expect(screen.getByText(/nur für diese Sitzung/)).toBeInTheDocument();
  });

  it('liegt mit Häkchen im Gerätespeicher', async () => {
    const user = userEvent.setup();
    seite(createFakeGemini(GUT));

    await user.click(screen.getByRole('checkbox', { name: /merken/i }));
    await user.type(screen.getByLabelText(/API-Schlüssel/), TEST_API_KEY);
    await user.click(screen.getByRole('button', { name: 'Schlüssel übernehmen' }));

    expect(window.localStorage.getItem('lexiflow.gemini.key')).toBe(TEST_API_KEY);
    // Der Satz steht zweimal: im Status und im Hinweis darunter.
    expect(screen.getAllByText(/auf diesem Gerät gemerkt/).length).toBeGreaterThan(0);
  });

  it('verschwindet auf „Zugangsdaten vergessen“ vollständig', async () => {
    const user = userEvent.setup();
    seite(createFakeGemini(GUT));

    await user.click(screen.getByRole('checkbox', { name: /merken/i }));
    await user.type(screen.getByLabelText(/API-Schlüssel/), TEST_API_KEY);
    await user.click(screen.getByRole('button', { name: 'Schlüssel übernehmen' }));
    await user.click(screen.getByRole('button', { name: 'Zugangsdaten vergessen' }));

    expect(window.localStorage.getItem('lexiflow.gemini.key')).toBeNull();
    expect(loadKey()).toBeUndefined();
    expect(screen.getByText(/Nicht eingerichtet/)).toBeInTheDocument();
  });

  it('wandert beim Entfernen des Häkchens sofort aus dem Gerätespeicher', async () => {
    /*
      Sonst entstünde der schlechteste aller Zustände: Das Kästchen ist aus, und
      im Speicher liegt trotzdem noch einer.
    */
    const user = userEvent.setup();
    seite(createFakeGemini(GUT));

    await user.click(screen.getByRole('checkbox', { name: /merken/i }));
    await user.type(screen.getByLabelText(/API-Schlüssel/), TEST_API_KEY);
    await user.click(screen.getByRole('button', { name: 'Schlüssel übernehmen' }));
    await user.click(screen.getByRole('checkbox', { name: /merken/i }));

    expect(window.localStorage.getItem('lexiflow.gemini.key')).toBeNull();
    expect(loadKey()?.storage).toBe('session');
  });

  it('weist einen offensichtlich falschen Wert ab, ohne ihn zu senden', async () => {
    const user = userEvent.setup();
    const fake = createFakeGemini(GUT);
    seite(fake);

    await user.type(screen.getByLabelText(/API-Schlüssel/), 'dein Schlüssel hier');
    await user.click(screen.getByRole('button', { name: 'Schlüssel übernehmen' }));

    expect(screen.getByText(/sieht nicht nach einem Schlüssel aus/)).toBeInTheDocument();
    expect(fake.calls).toHaveLength(0);
  });
});

describe('Der Verbindungstest', () => {
  async function mitSchluessel(fake: FakeGemini): Promise<ReturnType<typeof userEvent.setup>> {
    const user = userEvent.setup();
    seite(fake);
    await user.type(screen.getByLabelText(/API-Schlüssel/), TEST_API_KEY);
    await user.click(screen.getByRole('button', { name: 'Schlüssel übernehmen' }));
    return user;
  }

  it('meldet Erfolg und schickt genau eine Anfrage', async () => {
    const fake = createFakeGemini(GUT);
    const user = await mitSchluessel(fake);

    await user.click(screen.getByRole('button', { name: /Verbindung testen/ }));

    expect(await screen.findByText(/Verbindung steht/)).toBeInTheDocument();
    expect(fake.calls).toHaveLength(1);
  });

  it('zeigt bei einem Fehler die deutsche Meldung und nicht die von Google', async () => {
    /*
      Die Antwort trägt Schlüssel, Adresse und englischen Originaltext. Nichts
      davon darf auf der Seite landen.
    */
    const fake = createFakeGemini(
      replyWithError(400, `API key not valid. key=${TEST_API_KEY} at generativelanguage.googleapis.com`),
    );
    const user = await mitSchluessel(fake);

    await user.click(screen.getByRole('button', { name: /Verbindung testen/ }));

    expect(await screen.findByText(/vollständig kopiert/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(TEST_API_KEY);
    expect(document.body.textContent).not.toContain('API key not valid');
    expect(document.body.textContent).not.toContain('generativelanguage');
  });

  it('wiederholt von sich aus nichts', async () => {
    const fake = createFakeGemini(replyWithError(429, 'Quota exceeded'));
    const user = await mitSchluessel(fake);

    await user.click(screen.getByRole('button', { name: /Verbindung testen/ }));
    // „Kontingent“ steht auch im Datenschutzhinweis – hier zählt die Meldung.
    await screen.findByText(/Kontingent deines Google-Kontos ist vorerst erschöpft/);

    expect(fake.calls).toHaveLength(1);
  });
});

describe('Das Modell', () => {
  it('wird gemerkt und geht in die nächste Anfrage ein', async () => {
    const user = userEvent.setup();
    const fake = createFakeGemini(GUT);
    seite(fake);

    await user.type(screen.getByLabelText(/API-Schlüssel/), TEST_API_KEY);
    await user.click(screen.getByRole('button', { name: 'Schlüssel übernehmen' }));
    await user.selectOptions(screen.getByLabelText(/Gemini-Modell/), 'gemini-3.5-flash');
    await user.click(screen.getByRole('button', { name: /Verbindung testen/ }));
    await screen.findByText(/Verbindung steht/);

    expect(window.localStorage.getItem('lexiflow.gemini.model')).toBe('gemini-3.5-flash');
    expect(fake.calls[0]?.model).toBe('gemini-3.5-flash');
  });
});

describe('Die Auskunft auf der Seite', () => {
  it('nennt für jede Fähigkeit, was übertragen wird', () => {
    seite(createFakeGemini(GUT));

    expect(screen.getByText('Übersetzung vorschlagen')).toBeInTheDocument();
    expect(screen.getByText('Lernform prüfen')).toBeInTheDocument();
    expect(screen.getByText(/Keine Namen, keine Lernstände/)).toBeInTheDocument();
  });

  it('beschönigt die Speicherung nicht', () => {
    seite(createFakeGemini(GUT));

    expect(screen.getByText(/ohne Server/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('sicher verwahrt');
  });

  it('bietet kein Feld für eine eigene Adresse', () => {
    /*
      Der Entwurf, den es ausdrücklich nicht gibt: ein Feld „Endpunkt“ neben dem
      Feld für den Schlüssel.
    */
    for (const feld of screen.queryAllByRole('textbox')) {
      expect(feld.getAttribute('aria-label') ?? '').not.toMatch(/url|endpunkt|adresse/i);
    }
    expect(screen.queryByLabelText(/Endpunkt|Adresse|URL/i)).toBeNull();
  });
});
