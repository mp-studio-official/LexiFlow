import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { GeminiAction } from './GeminiAction';
import { GeminiTranslations } from './GeminiTranslations';
import { resetSessionKeyForTests, saveKey } from '../credentials';
import { resetAssistantForTests } from '../assistant';
import { createFakeGemini, replyWithError, replyWithJson, TEST_API_KEY } from '../fakeGemini';
import { createGeminiAiProvider } from '../geminiAiProvider';
import { loadKey } from '../credentials';
import type { AiGenerationContext } from '../../AiProvider';

/**
 * Die Aktionen in den Werkstätten – geprüft ohne eine einzige echte Anfrage.
 *
 * Die wichtigste Zusage steht ganz oben und gilt für jede dieser Ansichten:
 * **Ohne eingetragenen Schlüssel ist da nichts.** Kein ausgegrauter Knopf, kein
 * Hinweis auf eine Funktion, die man erst einrichten müsste. Wer Gemini nicht
 * einrichtet, sieht LexiFlow unverändert.
 */

const KONTEXT: AiGenerationContext = { grade: '8', cefrLevel: 'A2/B1' };

function fakeAssistent(...antworten: Parameters<typeof createFakeGemini>) {
  const fake = createFakeGemini(...antworten);
  return {
    fake,
    assistant: createGeminiAiProvider({
      getKey: () => loadKey()?.key,
      getModel: () => 'gemini-3.5-flash-lite',
      transport: fake.transport,
    }),
  };
}

beforeEach(() => {
  resetSessionKeyForTests();
  resetAssistantForTests();
  window.localStorage.clear();
});

afterEach(() => {
  resetSessionKeyForTests();
  resetAssistantForTests();
  window.localStorage.clear();
});

describe('Ohne eingetragenen Schlüssel', () => {
  it('rendert die Aktion überhaupt nicht', () => {
    render(
      <GeminiAction
        capability="translate-entry"
        label="Gemini fragen"
        ariaLabel="Gemini fragen"
        run={async () => undefined}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).not.toContain('Gemini');
  });

  it('rendert auch die Übersetzungsvorschläge nicht', () => {
    const { assistant } = fakeAssistent(replyWithJson({ translations: [{ german: 'das Haus' }] }));
    render(
      <GeminiTranslations
        label="house"
        english="house"
        context={KONTEXT}
        current=""
        onAccept={() => undefined}
        assistant={assistant}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Mit Schlüssel', () => {
  beforeEach(() => {
    saveKey(TEST_API_KEY, false);
  });

  it('sagt vor dem Klick, was übertragen wird – und fragt noch nichts', () => {
    /*
      Ein Hinweis nach dem Absenden ist keine Aufklärung, sondern eine
      Mitteilung.
    */
    const { fake, assistant } = fakeAssistent(
      replyWithJson({ translations: [{ german: 'das Haus' }] }),
    );
    render(
      <GeminiTranslations
        label="house"
        english="house"
        context={KONTEXT}
        current=""
        onAccept={() => undefined}
        assistant={assistant}
      />,
    );

    expect(screen.getByText(/An Google Gemini wird übertragen/)).toBeInTheDocument();
    expect(screen.getByText(/Kein vollständiger Quelltext/)).toBeInTheDocument();
    expect(screen.getByText(/Kontingente und gegebenenfalls die Kosten/)).toBeInTheDocument();
    expect(fake.calls).toHaveLength(0);
  });

  it('fragt erst auf Klick und zeigt die Vorschläge als ungeprüft', async () => {
    const user = userEvent.setup();
    const { fake, assistant } = fakeAssistent(
      replyWithJson({ translations: [{ german: 'das Haus' }, { german: 'das Gebäude' }] }),
    );
    render(
      <GeminiTranslations
        label="house"
        english="house"
        sentence="The house is old."
        context={KONTEXT}
        current=""
        onAccept={() => undefined}
        assistant={assistant}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Gemini-Übersetzungen für house/ }));

    expect(await screen.findByText('Gemini, ungeprüft')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /„das Haus“/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /„das Gebäude“/ })).toBeInTheDocument();
    expect(fake.calls).toHaveLength(1);
  });

  it('ergänzt beim Übernehmen und überschreibt nichts', async () => {
    /*
      Der Unterschied zwischen einem Vorschlag und einer Korrektur: Was schon
      im Feld steht, bleibt stehen – verbunden mit Semikolon, wie überall sonst.
    */
    const user = userEvent.setup();
    const { assistant } = fakeAssistent(replyWithJson({ translations: [{ german: 'das Gebäude' }] }));
    let uebernommen = '';

    render(
      <GeminiTranslations
        label="house"
        english="house"
        context={KONTEXT}
        current="das Haus"
        onAccept={(german) => {
          uebernommen = german;
        }}
        assistant={assistant}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Gemini-Übersetzungen für house/ }));
    await user.click(await screen.findByRole('button', { name: /„das Gebäude“/ }));

    expect(uebernommen).toBe('das Haus; das Gebäude');
  });

  it('sendet nur die Vokabel und den einen Satz', async () => {
    const user = userEvent.setup();
    const { fake, assistant } = fakeAssistent(replyWithJson({ translations: [{ german: 'x' }] }));
    render(
      <GeminiTranslations
        label="reef"
        english="reef"
        sentence="The reef is dying."
        context={KONTEXT}
        current=""
        onAccept={() => undefined}
        assistant={assistant}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Gemini-Übersetzungen für reef/ }));
    await screen.findByText('Gemini, ungeprüft');

    const rumpf = JSON.stringify(fake.calls[0]?.body);
    expect(rumpf).toContain('reef');
    expect(rumpf).toContain('The reef is dying.');
    expect(rumpf).not.toContain(TEST_API_KEY);
    // Kein Werkzeug, keine Suche, kein Nachschlagen im Netz.
    expect(rumpf).not.toContain('googleSearch');
  });
});

describe('Wenn die Anfrage scheitert', () => {
  beforeEach(() => {
    saveKey(TEST_API_KEY, false);
  });

  it('zeigt die deutsche Meldung und bietet einen neuen Versuch an', async () => {
    const user = userEvent.setup();
    const { assistant } = fakeAssistent(replyWithError(429, 'Quota exceeded'));
    render(
      <GeminiTranslations
        label="house"
        english="house"
        context={KONTEXT}
        current=""
        onAccept={() => undefined}
        assistant={assistant}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Gemini-Übersetzungen für house/ }));

    expect(await screen.findByText(/Kontingent deines Google-Kontos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Noch einmal versuchen' })).toBeInTheDocument();
  });

  it('bietet bei einem falschen Schlüssel keinen neuen Versuch an', async () => {
    /*
      Sonst drückt jemand fünfmal auf denselben Knopf und ändert nichts. Was
      hilft, steht in der Meldung.
    */
    const user = userEvent.setup();
    const { assistant } = fakeAssistent(replyWithError(400, 'API key not valid'));
    render(
      <GeminiTranslations
        label="house"
        english="house"
        context={KONTEXT}
        current=""
        onAccept={() => undefined}
        assistant={assistant}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Gemini-Übersetzungen für house/ }));

    expect(await screen.findByText(/vollständig kopiert/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Noch einmal versuchen' })).toBeNull();
  });

  it('zeigt nichts aus der Antwort von Google', async () => {
    const user = userEvent.setup();
    const { assistant } = fakeAssistent(
      replyWithError(
        403,
        `Forbidden for key ${TEST_API_KEY} at generativelanguage.googleapis.com`,
        'PERMISSION_DENIED',
      ),
    );
    render(
      <GeminiTranslations
        label="house"
        english="house"
        context={KONTEXT}
        current=""
        onAccept={() => undefined}
        assistant={assistant}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Gemini-Übersetzungen für house/ }));
    await screen.findByText(/Berechtigung/);

    expect(document.body.textContent).not.toContain(TEST_API_KEY);
    expect(document.body.textContent).not.toContain('Forbidden');
    expect(document.body.textContent).not.toContain('generativelanguage');
  });
});
