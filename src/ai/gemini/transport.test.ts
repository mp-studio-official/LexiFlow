import { describe, expect, it, vi } from 'vitest';

import { GEMINI_BASE_URL, DEFAULT_GEMINI_MODEL, endpointFor, isPlausibleModelId } from './endpoint';
import { GeminiTransportError, createFetchTransport } from './transport';
import { ApiKey } from './credentials';
import { TEST_API_KEY } from './fakeGemini';

/**
 * Der Weg ins Netz – geprüft, ohne ihn zu benutzen.
 *
 * Kein Test in dieser Datei ruft die echte API auf. Geprüft wird, **was
 * gesendet würde**: die Adresse, die Kopfzeilen, das Verhalten bei Abbruch und
 * Zeitüberschreitung. Dafür wird ein `fetch` eingesetzt, das nur mitschreibt.
 *
 * Die wichtigste Zusage steht gleich am Anfang: Der Schlüssel steht im Header
 * und nicht in der Adresse. Adressen landen in Server-Logs, Proxy-Logs, im
 * Verlauf und in `Referer`-Kopfzeilen.
 */

/** Ein `fetch`, das nichts tut außer mitschreiben. */
function recordingFetch(response = new Response('{}', { status: 200 })) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const key = new ApiKey(TEST_API_KEY);

describe('Der Schlüssel steht nicht in der Adresse', () => {
  it('sendet ihn ausschließlich als Kopfzeile', async () => {
    const { impl, calls } = recordingFetch();
    const transport = createFetchTransport(1000, impl);

    await transport({ model: DEFAULT_GEMINI_MODEL, body: { hallo: 'welt' } }, key);

    const [call] = calls;
    expect(call?.url).not.toContain(TEST_API_KEY);
    expect(call?.url).not.toContain('key=');
    expect(new Headers(call?.init.headers).get('x-goog-api-key')).toBe(TEST_API_KEY);
  });

  it('schickt weder Cookies noch einen Referer mit', async () => {
    /*
      Diese Anfrage hat mit der Google-Sitzung der Lehrkraft nichts zu tun und
      soll auch nichts davon mitnehmen.
    */
    const { impl, calls } = recordingFetch();
    await createFetchTransport(1000, impl)({ model: DEFAULT_GEMINI_MODEL, body: {} }, key);

    expect(calls[0]?.init.credentials).toBe('omit');
    expect(calls[0]?.init.referrerPolicy).toBe('no-referrer');
  });
});

describe('Die Adresse', () => {
  it('ist immer der offizielle HTTPS-Endpunkt', () => {
    expect(GEMINI_BASE_URL.startsWith('https://')).toBe(true);
    expect(endpointFor(DEFAULT_GEMINI_MODEL)).toBe(
      `${GEMINI_BASE_URL}models/${DEFAULT_GEMINI_MODEL}:generateContent`,
    );
  });

  it('lässt sich mit einem Modellnamen nicht verbiegen', () => {
    /*
      Der Modellname kommt aus einem Eingabefeld. Ohne Kodierung ließe sich mit
      `../` aus dem Pfad ausbrechen und ein anderer Google-Dienst ansprechen.
    */
    const boese = endpointFor('../../../andere/api');
    expect(new URL(boese).hostname).toBe('generativelanguage.googleapis.com');
    expect(boese).toContain('%2F');
    expect(boese).not.toContain('/andere/api');
  });

  it('erkennt offensichtlich unbrauchbare Modellnamen früh', () => {
    expect(isPlausibleModelId(DEFAULT_GEMINI_MODEL)).toBe(true);
    expect(isPlausibleModelId('')).toBe(false);
    expect(isPlausibleModelId('mit Leerzeichen')).toBe(false);
    expect(isPlausibleModelId('a')).toBe(false);
  });

  it('lehnt einen unbrauchbaren Modellnamen ab, bevor irgendetwas gesendet wird', async () => {
    const { impl, calls } = recordingFetch();
    const transport = createFetchTransport(1000, impl);

    await expect(transport({ model: 'mit Leerzeichen', body: {} }, key)).rejects.toThrow(
      GeminiTransportError,
    );
    expect(calls).toHaveLength(0);
  });
});

describe('Wenn etwas schiefgeht', () => {
  it('meldet eine Zeitüberschreitung als solche – nicht als Abbruch', async () => {
    /*
      Der Browser meldet beides als `AbortError`. „Abgebrochen" statt „hat zu
      lange gedauert" wäre eine Fehldiagnose, die jemanden zweimal auf denselben
      Knopf drücken lässt.
    */
    const langsam = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
      return new Response('{}');
    }) as unknown as typeof fetch;

    const transport = createFetchTransport(10, langsam);
    await expect(transport({ model: DEFAULT_GEMINI_MODEL, body: {} }, key)).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('meldet einen Abbruch durch die Lehrkraft als Abbruch', async () => {
    const controller = new AbortController();
    const langsam = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
      return new Response('{}');
    }) as unknown as typeof fetch;

    const transport = createFetchTransport(5000, langsam);
    const laeuft = transport(
      { model: DEFAULT_GEMINI_MODEL, body: {}, signal: controller.signal },
      key,
    );
    controller.abort();

    await expect(laeuft).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('macht aus jedem Netzfehler eine verständliche Meldung ohne Innenleben', async () => {
    /*
      Der Originalfehler wird nicht weitergereicht: Er kann in manchen Browsern
      die vollständige Adresse enthalten – und damit alles, was darin steht.
    */
    const kaputt = (async () => {
      throw new TypeError(`Failed to fetch ${GEMINI_BASE_URL}?key=${TEST_API_KEY}`);
    }) as unknown as typeof fetch;

    const transport = createFetchTransport(1000, kaputt);
    const fehler: GeminiTransportError = await transport(
      { model: DEFAULT_GEMINI_MODEL, body: {} },
      key,
    ).then(
      () => {
        throw new Error('Der Transport hätte scheitern müssen.');
      },
      (error: unknown) => error as GeminiTransportError,
    );

    expect(fehler.kind).toBe('offline');
    expect(fehler.message).not.toContain(TEST_API_KEY);
    expect(fehler.message).toContain('Internetverbindung');
  });

  it('wiederholt von sich aus nichts', async () => {
    /*
      Ein automatischer zweiter Versuch bei 429 macht aus einem
      überschrittenen Kontingent zwei. Wiederholt wird nach einem Klick.
    */
    const { impl, calls } = recordingFetch(new Response('{}', { status: 429 }));
    await createFetchTransport(1000, impl)({ model: DEFAULT_GEMINI_MODEL, body: {} }, key);

    expect(calls).toHaveLength(1);
  });

  it('gibt einen Fehlerstatus unverändert zurück, statt selbst zu deuten', async () => {
    // Was 429 bedeutet, entscheidet der Anbieter – nicht der Transport.
    const { impl } = recordingFetch(new Response('{"error":{"code":429}}', { status: 429 }));
    const antwort = await createFetchTransport(1000, impl)(
      { model: DEFAULT_GEMINI_MODEL, body: {} },
      key,
    );

    expect(antwort.status).toBe(429);
    expect(antwort.text).toContain('429');
  });
});
