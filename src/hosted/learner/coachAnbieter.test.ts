// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { AiGatewayFehler } from '../../cloud/aiGateway';
import type { AiGateway } from '../../application/repositories';
import { createCoachAnbieter } from './coachAnbieter';

const AUFGABE = {
  lernform: 'to tell sb. sth.',
  richtung: 'de-en' as const,
  beispielsatz: 'The man told a story.',
  antwort: 'to say',
  loesung: 'to tell somebody something',
  sprache: 'de' as const,
  niveau: 'A2' as const,
};

function gateway(antwort: unknown): Pick<AiGateway, 'invoke'> {
  return { invoke: vi.fn().mockResolvedValue(antwort) };
}

describe('der echte Lerncoach-Anbieter', () => {
  it('sendet nur die eine Aufgabe und die fest benannte Handlung', async () => {
    const ai = gateway({ text: 'Achte auf das Verb für erzählen.' });
    const anbieter = createCoachAnbieter({ gateway: ai, connectionId: 'v1', name: 'OpenAI API' });

    await anbieter.frage(AUFGABE, 'fehler-erklaeren');

    expect(ai.invoke).toHaveBeenCalledWith({
      connectionId: 'v1',
      capability: 'learner-coach/fehler-erklaeren',
      payload: AUFGABE,
    });
  });

  it('nimmt nur ein Objekt mit genau einem Text als Coachantwort an', async () => {
    const gut = createCoachAnbieter({ gateway: gateway({ text: 'Ein kurzer Hinweis.' }), connectionId: 'v1', name: 'Claude API' });
    const falsch = createCoachAnbieter({ gateway: gateway({ antwort: 'falscher Schlüssel' }), connectionId: 'v1', name: 'Claude API' });

    await expect(gut.frage(AUFGABE, 'hinweis')).resolves.toEqual({ art: 'text', text: 'Ein kurzer Hinweis.' });
    await expect(falsch.frage(AUFGABE, 'hinweis')).resolves.toEqual({ art: 'verworfen', grund: 'Die Anbieterantwort hatte nicht die vereinbarte Form.' });
  });

  it('verwirft weiterhin einen Hinweis, der die Lösung verrät', async () => {
    const anbieter = createCoachAnbieter({ gateway: gateway({ text: 'Die Lösung ist to tell sb. sth.' }), connectionId: 'v1', name: 'Gemini API' });
    await expect(anbieter.frage(AUFGABE, 'hinweis')).resolves.toMatchObject({ art: 'verworfen' });
  });

  it('unterscheidet Drosselung, Nichterreichbarkeit und Abbruch', async () => {
    const gedrosselt: Pick<AiGateway, 'invoke'> = { invoke: vi.fn().mockRejectedValue(new AiGatewayFehler(429, 'Zu viele Anfragen.')) };
    const kaputt: Pick<AiGateway, 'invoke'> = { invoke: vi.fn().mockRejectedValue(new AiGatewayFehler(502, 'Nicht erreichbar.')) };
    const steuerung = new AbortController();
    steuerung.abort();

    await expect(createCoachAnbieter({ gateway: gedrosselt, connectionId: 'v1', name: 'API' }).frage(AUFGABE, 'hinweis')).resolves.toEqual({ art: 'rate-limit' });
    await expect(createCoachAnbieter({ gateway: kaputt, connectionId: 'v1', name: 'API' }).frage(AUFGABE, 'hinweis')).resolves.toEqual({ art: 'nicht-erreichbar' });
    await expect(createCoachAnbieter({ gateway: gateway({ text: 'x' }), connectionId: 'v1', name: 'API' }).frage(AUFGABE, 'hinweis', steuerung.signal)).resolves.toEqual({ art: 'abgebrochen' });
  });
});
