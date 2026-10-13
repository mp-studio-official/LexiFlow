import type { AiGateway } from '../../application/repositories';
import { AiGatewayFehler } from '../../cloud/aiGateway';
import {
  pruefeAntwort,
  type Coachaktion,
  type Coachanbieter,
  type Coachantwort,
  type Coachaufgabe,
} from './ki-ui/vertrag';

const FAehigkeit: Readonly<Record<Coachaktion, string>> = {
  'fehler-erklaeren': 'learner-coach/fehler-erklaeren',
  hinweis: 'learner-coach/hinweis',
  'anderer-satz': 'learner-coach/anderer-satz',
  'warum-richtig': 'learner-coach/warum-richtig',
};

const FORMFEHLER = 'Die Anbieterantwort hatte nicht die vereinbarte Form.';

function antwortText(roh: unknown): string | undefined {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return undefined;
  const schluessel = Object.keys(roh);
  if (schluessel.length !== 1 || schluessel[0] !== 'text') return undefined;
  const text = (roh as Record<string, unknown>)['text'];
  return typeof text === 'string' && text.trim() !== '' ? text : undefined;
}

function fehlerAntwort(error: unknown, signal?: AbortSignal): Coachantwort {
  if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
    return { art: 'abgebrochen' };
  }
  if (error instanceof AiGatewayFehler && error.status === 429) return { art: 'rate-limit' };
  return { art: 'nicht-erreichbar' };
}

/**
 * Verbindet die reine Lerncoach-Oberfläche mit genau einer serverseitig
 * ausgewählten Verbindung. Die Komponente erfährt weder Schlüssel noch URL.
 */
export function createCoachAnbieter(input: {
  gateway: Pick<AiGateway, 'invoke'>;
  connectionId: string;
  name: string;
}): Coachanbieter {
  return {
    name: input.name,
    async frage(aufgabe: Coachaufgabe, aktion: Coachaktion, signal?: AbortSignal) {
      if (signal?.aborted) return { art: 'abgebrochen' };
      try {
        const roh = await input.gateway.invoke({
          connectionId: input.connectionId,
          capability: FAehigkeit[aktion],
          payload: aufgabe,
          ...(signal ? { signal } : {}),
        });
        if (signal?.aborted) return { art: 'abgebrochen' };
        const text = antwortText(roh);
        return text === undefined
          ? { art: 'verworfen', grund: FORMFEHLER }
          : pruefeAntwort(text, aktion, aufgabe);
      } catch (error) {
        return fehlerAntwort(error, signal);
      }
    },
  };
}
