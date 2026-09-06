import { GeminiTransportError, type GeminiRequest, type GeminiTransport } from './transport';
import type { ApiKey } from './credentials';

/**
 * Ein Gemini, das nie im Netz ist.
 *
 * **In automatisierten Tests wird niemals die echte API aufgerufen.** Das ist
 * keine Bequemlichkeit: Ein Test, der ein Kontingent verbraucht, wird
 * irgendwann nicht mehr ausgeführt, und ein Test, der einen echten Schlüssel
 * braucht, liegt entweder im Repository oder läuft bei niemandem.
 *
 * Dieser Fake nimmt dieselbe Signatur wie der echte Transport und **schreibt
 * mit**, was gesendet worden wäre. Damit lassen sich Zusagen prüfen, die man an
 * einer echten Antwort gar nicht sähe:
 *
 * - Steht der Schlüssel wirklich nicht in der Adresse?
 * - Wird wirklich kein Werkzeug aktiviert?
 * - Passiert ohne ausdrücklichen Klick wirklich nichts?
 *
 * Er liegt in `src/` und nicht in `src/test/`, weil er zum Anbieter gehört:
 * Wer den Transport ändert, muss diese Datei danebenlegen.
 */

export interface RecordedCall {
  model: string;
  body: unknown;
  /** Der maskierte Schlüssel – der Klartext wird hier nie festgehalten. */
  maskedKey: string;
  /** Ob der Aufrufer ein Abbruchsignal mitgegeben hat. */
  hadSignal: boolean;
}

export interface FakeGemini {
  transport: GeminiTransport;
  /** Alles, was gesendet worden wäre – in der Reihenfolge der Aufrufe. */
  calls: RecordedCall[];
  /** Die nächste Antwort. Nacheinander abgearbeitet; die letzte wiederholt sich. */
  queue: FakeReply[];
}

export type FakeReply =
  | { status: number; text: string }
  /** Ein Transportfehler – Netz weg, Zeit abgelaufen, abgebrochen. */
  | { throws: GeminiTransportError };

/** Eine gültige Gemini-Antwort mit diesem Text als einzigem Teil. */
export function replyWithText(text: string): FakeReply {
  return {
    status: 200,
    text: JSON.stringify({
      candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
    }),
  };
}

/** Eine gültige Antwort, deren Text dieses Objekt als JSON trägt. */
export function replyWithJson(value: unknown): FakeReply {
  return replyWithText(JSON.stringify(value));
}

/**
 * Eine Fehlerantwort, wie Google sie schickt – **mit** dem Beiwerk.
 *
 * Absichtlich mit `details` und einer Adresse darin: Ein Test, der prüft, dass
 * nichts davon in der Oberfläche landet, braucht eine Antwort, in der wirklich
 * etwas zu verraten wäre.
 */
export function replyWithError(status: number, message: string): FakeReply {
  return {
    status,
    text: JSON.stringify({
      error: {
        code: status,
        message,
        status: status === 429 ? 'RESOURCE_EXHAUSTED' : 'INVALID_ARGUMENT',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'API_KEY_INVALID',
            metadata: { service: 'generativelanguage.googleapis.com' },
          },
        ],
      },
    }),
  };
}

/**
 * Ein offensichtlicher Testschlüssel.
 *
 * Er sieht mit Absicht **nicht** wie ein echter aus: Wer ihn in einem Log oder
 * einem Screenshot sieht, soll auf den ersten Blick erkennen, dass hier nichts
 * zu holen ist. Ein realistisch aussehender Platzhalter im Repository ist eine
 * Einladung, ihn irgendwann durch einen echten zu ersetzen.
 */
export const TEST_API_KEY = 'TESTSCHLUESSEL-NICHT-ECHT-0000';

export function createFakeGemini(...replies: FakeReply[]): FakeGemini {
  const fake: FakeGemini = {
    calls: [],
    queue: [...replies],
    transport: async (request: GeminiRequest, key: ApiKey) => {
      fake.calls.push({
        model: request.model,
        body: request.body,
        maskedKey: key.masked,
        hadSignal: request.signal !== undefined,
      });

      if (request.signal?.aborted) {
        throw new GeminiTransportError('Abgebrochen.', 'aborted');
      }

      const reply = fake.queue.length > 1 ? fake.queue.shift() : fake.queue[0];
      if (!reply) {
        throw new Error('Der Fake hat keine Antwort vorbereitet.');
      }
      if ('throws' in reply) throw reply.throws;
      return { status: reply.status, text: reply.text };
    },
  };
  return fake;
}
