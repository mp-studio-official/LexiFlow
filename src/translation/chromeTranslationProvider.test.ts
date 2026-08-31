import { describe, expect, it, vi } from 'vitest';
import {
  CHROME_TRANSLATION_NOTICE,
  createChromeTranslationProvider,
  detectTranslationProvider,
  getTranslatorApi,
} from './chromeTranslationProvider';
import {
  TranslationAbortedError,
  TranslationUnavailableError,
  nullTranslationProvider,
} from './TranslationProvider';
import { createFakeTranslatorScope } from '../test/fakeTranslator';

describe('Feature Detection', () => {
  it('erkennt einen Browser ohne Translator-API als nicht unterstützt', () => {
    expect(getTranslatorApi({})).toBeUndefined();
    expect(detectTranslationProvider({})).toBeUndefined();
  });

  it('erkennt eine unvollständige API nicht als nutzbar', () => {
    expect(getTranslatorApi({ Translator: { availability: () => Promise.resolve('available') } }))
      .toBeUndefined();
  });

  it('nutzt die API, wenn sie vollständig ist', () => {
    const { scope } = createFakeTranslatorScope();
    expect(detectTranslationProvider(scope)).toBeDefined();
  });

  it('erkennt ein echtes Web-IDL-Interface (typeof "function")', () => {
    // Im Browser ist `Translator` eine Klasse mit statischen Methoden.
    class Translator {
      static availability(): Promise<string> {
        return Promise.resolve('available');
      }
      static create(): Promise<{ translate: (text: string) => Promise<string> }> {
        return Promise.resolve({ translate: (text: string) => Promise.resolve(`[de] ${text}`) });
      }
    }
    expect(typeof Translator).toBe('function');
    expect(getTranslatorApi({ Translator })).toBeDefined();
    expect(detectTranslationProvider({ Translator })).toBeDefined();
  });

  it('arbeitet mit einem Interface-Objekt vollständig zusammen', async () => {
    class Translator {
      static availability(): Promise<string> {
        return Promise.resolve('downloadable');
      }
      static create(): Promise<{
        translate: (text: string) => Promise<string>;
        destroy: () => void;
      }> {
        return Promise.resolve({
          translate: (text: string) => Promise.resolve(`[de] ${text}`),
          destroy: () => undefined,
        });
      }
    }

    const provider = createChromeTranslationProvider({ Translator });
    await expect(provider.getAvailability('en', 'de')).resolves.toBe('downloadable');
    await provider.prepare('en', 'de');
    await expect(provider.translate('litter')).resolves.toBe('[de] litter');
  });

  it('lehnt eine Funktion ohne die nötigen Methoden weiterhin ab', () => {
    function Translator(): void {
      /* nichts */
    }
    expect(getTranslatorApi({ Translator })).toBeUndefined();
  });
});

describe('Zustände', () => {
  it('meldet ohne API „unavailable“ – das ist ein normaler Zustand, kein Fehler', async () => {
    const provider = createChromeTranslationProvider({});
    await expect(provider.getAvailability('en', 'de')).resolves.toBe('unavailable');
  });

  it('meldet „unavailable“, wenn die Abfrage selbst scheitert', async () => {
    const { scope } = createFakeTranslatorScope({ availabilityThrows: true });
    const provider = createChromeTranslationProvider(scope);
    await expect(provider.getAvailability('en', 'de')).resolves.toBe('unavailable');
  });

  it('reicht bekannte Zustände unverändert durch', async () => {
    for (const state of ['unavailable', 'downloadable', 'downloading', 'available'] as const) {
      const { scope } = createFakeTranslatorScope({ availability: state });
      await expect(
        createChromeTranslationProvider(scope).getAvailability('en', 'de'),
      ).resolves.toBe(state);
    }
  });

  it('behandelt einen unbekannten Zustand als nicht verfügbar', async () => {
    const scope = {
      Translator: {
        availability: () => Promise.resolve('irgendwas'),
        create: () => Promise.resolve({ translate: () => Promise.resolve('') }),
      },
    };
    await expect(
      createChromeTranslationProvider(scope).getAvailability('en', 'de'),
    ).resolves.toBe('unavailable');
  });
});

describe('Vorbereitung (Modelldownload)', () => {
  it('lädt nichts, solange prepare nicht aufgerufen wurde', async () => {
    const handle = createFakeTranslatorScope();
    const provider = createChromeTranslationProvider(handle.scope);
    await provider.getAvailability('en', 'de');
    expect(handle.createCount()).toBe(0);
  });

  it('meldet echten Fortschritt und schließt mit 1 ab', async () => {
    const handle = createFakeTranslatorScope({ progress: [0.25, 0.75] });
    const provider = createChromeTranslationProvider(handle.scope);
    const progress: number[] = [];

    await provider.prepare('en', 'de', (value) => progress.push(value));

    expect(progress).toEqual([0.25, 0.75, 1]);
    expect(handle.createCount()).toBe(1);
  });

  // Sprint 3B.1a: Textwerkstatt und Prüfansicht können gleichzeitig fragen.
  it('teilt eine bereits laufende Vorbereitung, statt zweimal zu laden', async () => {
    const handle = createFakeTranslatorScope();
    const provider = createChromeTranslationProvider(handle.scope);

    const first = provider.prepare('en', 'de');
    const second = provider.prepare('en', 'de');
    await Promise.all([first, second]);

    // Ein einziger `create()`-Aufruf – sonst hätte der zweite die Instanz des
    // ersten verworfen.
    expect(handle.createCount()).toBe(1);
    expect(await provider.translate('bus')).toBe('[de] bus');
  });

  it('lässt nach einem Fehlschlag einen neuen Versuch zu', async () => {
    let attempts = 0;
    const handle = createFakeTranslatorScope();
    const api = (handle.scope as { Translator?: { create: unknown } }).Translator;
    const original = api?.create as (options: unknown) => Promise<unknown>;
    if (api) {
      api.create = (options: unknown) => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error('kein Modell'))
          : original(options);
      };
    }

    const provider = createChromeTranslationProvider(handle.scope);
    await expect(provider.prepare('en', 'de')).rejects.toThrow('kein Modell');
    await expect(provider.prepare('en', 'de')).resolves.toBeUndefined();
    expect(attempts).toBe(2);
  });

  it('bereitet dasselbe Sprachpaar nicht zweimal vor', async () => {
    const handle = createFakeTranslatorScope();
    const provider = createChromeTranslationProvider(handle.scope);
    await provider.prepare('en', 'de');
    await provider.prepare('en', 'de');
    expect(handle.createCount()).toBe(1);
  });

  it('scheitert verständlich, wenn der Browser die API nicht hat', async () => {
    const provider = createChromeTranslationProvider({});
    await expect(provider.prepare('en', 'de')).rejects.toBeInstanceOf(TranslationUnavailableError);
  });

  it('bricht bei bereits abgebrochenem Signal ab, ohne zu laden', async () => {
    const handle = createFakeTranslatorScope();
    const provider = createChromeTranslationProvider(handle.scope);
    const controller = new AbortController();
    controller.abort();

    await expect(provider.prepare('en', 'de', undefined, controller.signal)).rejects.toBeInstanceOf(
      TranslationAbortedError,
    );
    expect(handle.createCount()).toBe(0);
  });
});

describe('Übersetzen', () => {
  it('verlangt eine vorherige Vorbereitung', async () => {
    const handle = createFakeTranslatorScope();
    const provider = createChromeTranslationProvider(handle.scope);
    await expect(provider.translate('litter')).rejects.toBeInstanceOf(TranslationUnavailableError);
  });

  it('übersetzt nach der Vorbereitung', async () => {
    const handle = createFakeTranslatorScope();
    const provider = createChromeTranslationProvider(handle.scope);
    await provider.prepare('en', 'de');
    await expect(provider.translate('litter')).resolves.toBe('[de] litter');
  });

  it('arbeitet Anfragen streng nacheinander ab', async () => {
    const handle = createFakeTranslatorScope();
    const provider = createChromeTranslationProvider(handle.scope);
    await provider.prepare('en', 'de');

    await Promise.all([
      provider.translate('one'),
      provider.translate('two'),
      provider.translate('three'),
    ]);

    expect(handle.calls).toEqual(['one', 'two', 'three']);
    expect(handle.overlaps()).toBe(0);
  });

  it('bricht die Kette nach einem Fehler nicht ab', async () => {
    let call = 0;
    const handle = createFakeTranslatorScope({
      translate: (text) => {
        call += 1;
        if (call === 1) throw new Error('kaputt');
        return `[de] ${text}`;
      },
    });
    const provider = createChromeTranslationProvider(handle.scope);
    await provider.prepare('en', 'de');

    await expect(provider.translate('one')).rejects.toThrow('kaputt');
    await expect(provider.translate('two')).resolves.toBe('[de] two');
  });

  it('bricht über ein AbortSignal ab', async () => {
    const handle = createFakeTranslatorScope();
    const provider = createChromeTranslationProvider(handle.scope);
    await provider.prepare('en', 'de');
    const controller = new AbortController();
    controller.abort();

    await expect(provider.translate('litter', controller.signal)).rejects.toBeInstanceOf(
      TranslationAbortedError,
    );
  });
});

describe('Aufräumen', () => {
  it('gibt das Modell frei und verlangt danach eine neue Vorbereitung', async () => {
    const handle = createFakeTranslatorScope();
    const provider = createChromeTranslationProvider(handle.scope);
    await provider.prepare('en', 'de');

    provider.destroy?.();

    expect(handle.destroyCount()).toBe(1);
    await expect(provider.translate('litter')).rejects.toBeInstanceOf(TranslationUnavailableError);

    await provider.prepare('en', 'de');
    expect(handle.createCount()).toBe(2);
  });
});

describe('Datenschutzzusage', () => {
  it('verarbeitet garantiert auf dem Gerät', () => {
    const { scope } = createFakeTranslatorScope();
    const provider = createChromeTranslationProvider(scope);
    expect(provider.info.sendsDataOffDevice).toBe(false);
    expect(provider.info.dataNotice).toBe(CHROME_TRANSLATION_NOTICE);
    expect(nullTranslationProvider.info.sendsDataOffDevice).toBe(false);
  });

  it('ruft niemals selbst fetch auf', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('Der Anbieter darf nicht selbst laden.');
    });
    vi.stubGlobal('fetch', fetchSpy);
    const handle = createFakeTranslatorScope();
    const provider = createChromeTranslationProvider(handle.scope);

    await provider.getAvailability('en', 'de');
    await provider.prepare('en', 'de');
    await provider.translate('litter');
    provider.destroy?.();

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('nullTranslationProvider', () => {
  it('ist immer nicht verfügbar und wirft verständliche Fehler', async () => {
    await expect(nullTranslationProvider.getAvailability('en', 'de')).resolves.toBe('unavailable');
    await expect(nullTranslationProvider.prepare('en', 'de')).rejects.toBeInstanceOf(
      TranslationUnavailableError,
    );
    await expect(nullTranslationProvider.translate('litter')).rejects.toBeInstanceOf(
      TranslationUnavailableError,
    );
  });
});
