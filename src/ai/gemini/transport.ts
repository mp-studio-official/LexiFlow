import { endpointFor, isPlausibleModelId } from './endpoint';
import type { ApiKey } from './credentials';

/**
 * Der eine Weg ins Netz – und die einzige Stelle, an der der Schlüssel
 * ausgelesen wird.
 *
 * ## Warum der Transport einsteckbar ist
 *
 * Nicht der Testbarkeit wegen allein. Ein einsteckbarer Transport heißt auch:
 * Es gibt genau **eine** Funktion, die `fetch` aufruft, und wer prüfen will, ob
 * dieses Programm heimlich woandershin telefoniert, muss eine Datei lesen und
 * nicht zwanzig.
 *
 * In automatisierten Tests wird nie das echte Netz benutzt. Der Fake-Transport
 * (`test/fakeGemini.ts`) nimmt dieselbe Signatur und protokolliert, was
 * gesendet worden wäre – so lassen sich Zusagen prüfen, die man an einer echten
 * Antwort gar nicht sähe: dass der Schlüssel nicht in der Adresse steht, dass
 * kein Werkzeug aktiviert wird, dass ohne Klick nichts passiert.
 *
 * ## Was hier nicht passiert
 *
 * **Kein Wiederholen.** Ein automatischer zweiter Versuch bei 429 macht aus
 * einem überschrittenen Kontingent zwei, und bei einer Zeitüberschreitung
 * verdoppelt er die Wartezeit, in der niemand weiß, was los ist. Wiederholt
 * wird nach einem Klick.
 *
 * **Keine Werkzeuge.** Kein `googleSearch`, kein `urlContext`, keine
 * Funktionsaufrufe. Was gesendet wird, ist Text; was zurückkommt, soll Text
 * sein. Ein Modell, das im Netz nachsehen darf, sendet den Schülertext
 * weiter, als es diese Anwendung je vorhatte.
 */

/** Was der Aufrufer sendet – roh, damit der Transport nichts erfinden muss. */
export interface GeminiRequest {
  model: string;
  /** Der Rumpf, wie ihn die API erwartet. Gebaut in `request.ts`. */
  body: unknown;
  signal?: AbortSignal;
}

export interface GeminiResponse {
  status: number;
  /** Der Text der Antwort. Nicht geparst – das macht der Aufrufer mit Zod. */
  text: string;
}

/**
 * Ein Transport: nimmt Anfrage und Schlüssel, gibt Status und Text zurück.
 *
 * Der Schlüssel ist ein `ApiKey` und keine Zeichenkette – so kann keine
 * Zwischenschicht ihn versehentlich protokollieren (siehe `credentials.ts`).
 */
export type GeminiTransport = (
  request: GeminiRequest,
  key: ApiKey,
) => Promise<GeminiResponse>;

/** Wie lange auf eine Antwort gewartet wird, bevor abgebrochen wird. */
export const GEMINI_TIMEOUT_MS = 30_000;

export class GeminiTransportError extends Error {
  constructor(
    message: string,
    readonly kind: 'offline' | 'timeout' | 'aborted' | 'blocked',
  ) {
    super(message);
    this.name = 'GeminiTransportError';
  }
}

/**
 * Der echte Transport über `fetch`.
 *
 * ## Der Schlüssel steht im Header
 *
 * `x-goog-api-key`, nicht `?key=`. Google unterstützt beides; nur eines davon
 * ist vertretbar. Adressen landen in Server-Logs, in Proxy-Logs, im
 * Browserverlauf, in `Referer`-Kopfzeilen und in jedem Fehlerbericht, der eine
 * URL mitschickt. Ein Schlüssel in der Adresse ist ein Schlüssel in fremden
 * Logdateien – ein Test hält fest, dass er dort nicht steht.
 *
 * ## Zwei Abbruchgründe, ein Signal
 *
 * Die Zeitüberschreitung und der Abbruch durch die Lehrkraft laufen beide über
 * `AbortSignal`. Unterschieden werden sie am eigenen Zeitgeber, nicht am
 * Fehlertyp: Der Browser meldet in beiden Fällen `AbortError`, und „abgebrochen“
 * statt „hat zu lange gedauert“ wäre eine Fehldiagnose, die jemanden zweimal
 * auf denselben Knopf drücken lässt.
 */
export function createFetchTransport(
  timeoutMs = GEMINI_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): GeminiTransport {
  return async ({ model, body, signal }, key) => {
    if (!isPlausibleModelId(model)) {
      throw new GeminiTransportError(`Ungültige Modellkennung: „${model}“.`, 'blocked');
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = (): void => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await fetchImpl(endpointFor(model), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Im Header und nicht in der Adresse. Siehe oben.
          'x-goog-api-key': key.reveal(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        /*
          Weder Cookies noch andere Anmeldedaten mitsenden: Diese Anfrage hat
          mit der Google-Sitzung der Lehrkraft nichts zu tun, und sie soll auch
          nichts davon mitnehmen.
        */
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      });
      return { status: response.status, text: await response.text() };
    } catch (error: unknown) {
      if (timedOut) {
        throw new GeminiTransportError(
          'Die Antwort hat zu lange gedauert. Bitte noch einmal versuchen.',
          'timeout',
        );
      }
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new GeminiTransportError('Abgebrochen.', 'aborted');
      }
      /*
        Alles Übrige ist aus Sicht der Anwenderin dasselbe: Es kam nichts an.
        Der Originalfehler wird **nicht** weitergereicht – er kann in manchen
        Browsern die vollständige Adresse enthalten.
      */
      throw new GeminiTransportError(
        'Keine Verbindung zur Gemini-API. Besteht eine Internetverbindung?',
        'offline',
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  };
}
