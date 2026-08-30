import { describe, expect, it, vi } from 'vitest';
import {
  AI_CAPABILITY,
  AiResponseError,
  CHROME_PROMPT_NOTICE,
  ENRICH_RESPONSE_SCHEMA,
  buildEnrichPrompt,
  createChromePromptAiProvider,
  detectPromptAiProvider,
  enrichResponse,
  getLanguageModelApi,
} from './chromePromptAiProvider';
import { AI_CAPABILITIES, AiUnavailableError, type AiGenerationContext } from './AiProvider';
import { createFakeLanguageModelScope } from '../test/fakeTranslator';

/**
 * Sprint 2B.1: Der Anbieter für die Prompt-API des Browsers. Kein Test lädt je
 * ein echtes Modell – geprüft wird gegen eine nachgebaute API.
 */

const CONTEXT: AiGenerationContext = { grade: '7', cefrLevel: 'A2', topic: 'City life' };
const ENTRY = { english: 'crowded', germanAnswers: ['überfüllt'] };

describe('Feature Detection', () => {
  it('erkennt einen Browser ohne Prompt-API als nicht unterstützt', () => {
    expect(getLanguageModelApi({})).toBeUndefined();
    expect(detectPromptAiProvider({})).toBeUndefined();
  });

  it('erkennt eine unvollständige API nicht als nutzbar', () => {
    expect(getLanguageModelApi({ LanguageModel: { availability: () => Promise.resolve('available') } }))
      .toBeUndefined();
  });

  it('nutzt die API, wenn sie vollständig ist', () => {
    expect(detectPromptAiProvider(createFakeLanguageModelScope().scope)).toBeDefined();
  });

  it('erkennt ein echtes Web-IDL-Interface (typeof "function")', () => {
    // So sieht die API im Browser wirklich aus: eine Klasse mit statischen
    // Methoden. `typeof` ist dann "function", nicht "object".
    class LanguageModel {
      static availability(): Promise<string> {
        return Promise.resolve('available');
      }
      static create(): Promise<{ prompt: () => Promise<string> }> {
        return Promise.resolve({ prompt: () => Promise.resolve('{}') });
      }
    }
    expect(typeof LanguageModel).toBe('function');
    expect(getLanguageModelApi({ LanguageModel })).toBeDefined();
    expect(detectPromptAiProvider({ LanguageModel })).toBeDefined();
  });

  it('erkennt auch eine schlichte Funktion mit den nötigen Methoden', () => {
    function LanguageModel(): void {
      /* Konstruktor ohne Belang */
    }
    LanguageModel.availability = () => Promise.resolve('downloadable');
    LanguageModel.create = () => Promise.resolve({ prompt: () => Promise.resolve('{}') });

    expect(getLanguageModelApi({ LanguageModel })).toBeDefined();
  });

  it('arbeitet mit einem Interface-Objekt vollständig zusammen', async () => {
    const prompts: string[] = [];
    class LanguageModel {
      static availability(): Promise<string> {
        return Promise.resolve('downloadable');
      }
      static create(): Promise<{ prompt: (input: string) => Promise<string>; destroy: () => void }> {
        return Promise.resolve({
          prompt: (input: string) => {
            prompts.push(input);
            return Promise.resolve(
              JSON.stringify({ partOfSpeech: 'adjective', difficulty: 2, topicTags: ['city'] }),
            );
          },
          destroy: () => undefined,
        });
      }
    }

    const provider = createChromePromptAiProvider({ LanguageModel });
    await expect(provider.getAvailability(AI_CAPABILITY)).resolves.toBe('downloadable');
    await provider.prepare(AI_CAPABILITY);
    await expect(provider.enrichEntry(ENTRY, CONTEXT)).resolves.toMatchObject({
      partOfSpeech: 'adjective',
      difficulty: 2,
    });
    expect(prompts).toHaveLength(1);
  });

  it('lehnt eine Funktion ohne die nötigen Methoden weiterhin ab', () => {
    function LanguageModel(): void {
      /* nichts */
    }
    expect(getLanguageModelApi({ LanguageModel })).toBeUndefined();
  });
});

describe('Fähigkeiten', () => {
  it('kann in dieser Fassung ausschließlich „enrich-entry“', () => {
    const provider = createChromePromptAiProvider(createFakeLanguageModelScope().scope);
    expect(provider.capabilities()).toEqual(['enrich-entry']);
  });

  it('meldet jede andere Fähigkeit als nicht verfügbar', async () => {
    const provider = createChromePromptAiProvider(createFakeLanguageModelScope().scope);
    for (const capability of AI_CAPABILITIES.filter((item) => item !== AI_CAPABILITY)) {
      await expect(provider.getAvailability(capability)).resolves.toBe('unavailable');
      await expect(provider.prepare(capability)).rejects.toBeInstanceOf(AiUnavailableError);
    }
    await expect(provider.suggestFromText('x', CONTEXT)).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(provider.suggestFromTopic('x', CONTEXT)).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(provider.alternativeSentence('x', CONTEXT)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });
});

describe('Zustände', () => {
  it('meldet ohne API „unavailable“ – ein normaler Zustand, kein Fehler', async () => {
    const provider = createChromePromptAiProvider({});
    await expect(provider.getAvailability(AI_CAPABILITY)).resolves.toBe('unavailable');
  });

  it('reicht alle vier bekannten Zustände durch', async () => {
    for (const state of ['unavailable', 'downloadable', 'downloading', 'available'] as const) {
      const { scope } = createFakeLanguageModelScope({ availability: state });
      await expect(
        createChromePromptAiProvider(scope).getAvailability(AI_CAPABILITY),
      ).resolves.toBe(state);
    }
  });

  it('meldet „unavailable“, wenn die Abfrage selbst scheitert', async () => {
    const { scope } = createFakeLanguageModelScope({ availabilityThrows: true });
    await expect(
      createChromePromptAiProvider(scope).getAvailability(AI_CAPABILITY),
    ).resolves.toBe('unavailable');
  });

  it('prüft die benötigten Sprachen mit ab', async () => {
    const handle = createFakeLanguageModelScope();
    await createChromePromptAiProvider(handle.scope).getAvailability(AI_CAPABILITY);

    expect(handle.availabilityCalls()[0]).toMatchObject({
      expectedInputs: [{ type: 'text', languages: ['en', 'de'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
  });

  it('fällt bei fehlender Mehrsprachigkeit ehrlich auf unavailable zurück', async () => {
    const scope = {
      LanguageModel: {
        availability: (options: { expectedInputs?: Array<{ languages: string[] }> }) =>
          options?.expectedInputs?.[0]?.languages.includes('de')
            ? Promise.resolve('unavailable')
            : Promise.resolve('available'),
        create: () => Promise.resolve({ prompt: () => Promise.resolve('{}') }),
      },
    };
    await expect(
      createChromePromptAiProvider(scope).getAvailability(AI_CAPABILITY),
    ).resolves.toBe('unavailable');
  });
});

describe('Vorbereitung', () => {
  it('lädt ohne Benutzeraktion nichts', async () => {
    const handle = createFakeLanguageModelScope();
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.getAvailability(AI_CAPABILITY);
    expect(handle.createCount()).toBe(0);
  });

  it('„available“ heißt noch nicht „vorbereitet“', async () => {
    const handle = createFakeLanguageModelScope({ availability: 'available' });
    const provider = createChromePromptAiProvider(handle.scope);

    await expect(provider.getAvailability(AI_CAPABILITY)).resolves.toBe('available');
    await expect(provider.enrichEntry(ENTRY, CONTEXT)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(handle.createCount()).toBe(0);
  });

  it('erzeugt die Sitzung genau einmal', async () => {
    const handle = createFakeLanguageModelScope();
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(AI_CAPABILITY);
    await provider.prepare(AI_CAPABILITY);
    expect(handle.createCount()).toBe(1);
  });

  it('meldet echten Fortschritt und schließt mit 1 ab', async () => {
    const handle = createFakeLanguageModelScope({ progress: [0.25, 0.75] });
    const progress: number[] = [];
    await createChromePromptAiProvider(handle.scope).prepare(AI_CAPABILITY, (value) =>
      progress.push(value),
    );
    expect(progress).toEqual([0.25, 0.75, 1]);
  });

  it('erlaubt nach einem Fehler einen neuen Versuch', async () => {
    const handle = createFakeLanguageModelScope({ failFirstCreate: true });
    const provider = createChromePromptAiProvider(handle.scope);

    await expect(provider.prepare(AI_CAPABILITY)).rejects.toThrow('Download unterbrochen');
    await expect(provider.enrichEntry(ENTRY, CONTEXT)).rejects.toBeInstanceOf(AiUnavailableError);

    await provider.prepare(AI_CAPABILITY);
    await expect(provider.enrichEntry(ENTRY, CONTEXT)).resolves.toMatchObject({
      partOfSpeech: 'adjective',
    });
    expect(handle.createCount()).toBe(2);
  });

  it('bricht bei bereits abgebrochenem Signal ab, ohne zu laden', async () => {
    const handle = createFakeLanguageModelScope();
    const controller = new AbortController();
    controller.abort();

    await expect(
      createChromePromptAiProvider(handle.scope).prepare(AI_CAPABILITY, undefined, controller.signal),
    ).rejects.toBeInstanceOf(DOMException);
    expect(handle.createCount()).toBe(0);
  });

  it('scheitert verständlich, wenn der Browser die API nicht hat', async () => {
    await expect(createChromePromptAiProvider({}).prepare(AI_CAPABILITY)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });
});

describe('Anreichern', () => {
  it('fordert strukturierte Ausgabe über responseConstraint an', async () => {
    const handle = createFakeLanguageModelScope();
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(AI_CAPABILITY);
    await provider.enrichEntry(ENTRY, CONTEXT);

    expect(handle.lastConstraint()).toBe(ENRICH_RESPONSE_SCHEMA);
    expect(ENRICH_RESPONSE_SCHEMA.properties.difficulty).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 5,
    });
    expect(ENRICH_RESPONSE_SCHEMA.properties.topicTags.maxItems).toBe(3);
  });

  it('gibt genau die drei erlaubten Felder zurück', async () => {
    const handle = createFakeLanguageModelScope();
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(AI_CAPABILITY);

    const result = await provider.enrichEntry(ENTRY, CONTEXT);
    expect(result).toEqual({
      english: 'crowded',
      germanAnswers: ['überfüllt'],
      partOfSpeech: 'adjective',
      difficulty: 3,
      topicTags: ['city', 'traffic'],
    });
  });

  it('übergibt nur den nötigen Kontext', async () => {
    const handle = createFakeLanguageModelScope();
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(AI_CAPABILITY);
    await provider.enrichEntry(
      { ...ENTRY, exampleSentences: [{ english: 'The bus was crowded.' }] },
      CONTEXT,
    );

    const prompt = handle.prompts[0] ?? '';
    expect(prompt).toContain('crowded');
    expect(prompt).toContain('überfüllt');
    expect(prompt).toContain('The bus was crowded.');
    expect(prompt).toContain('7');
    expect(prompt).toContain('A2');
    expect(prompt).toContain('City life');
    // Keine IDs, keine Lernstände, keine Rohdaten.
    expect(prompt).not.toMatch(/box|dueAt|progress|packId/i);
  });

  it('arbeitet Anfragen nacheinander ab und übersteht einen Fehler', async () => {
    let call = 0;
    const handle = createFakeLanguageModelScope({
      respond: () => {
        call += 1;
        if (call === 1) throw new Error('kaputt');
        return JSON.stringify({ partOfSpeech: 'noun', difficulty: 2, topicTags: [] });
      },
    });
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(AI_CAPABILITY);

    await expect(provider.enrichEntry(ENTRY, CONTEXT)).rejects.toThrow('kaputt');
    await expect(provider.enrichEntry(ENTRY, CONTEXT)).resolves.toMatchObject({
      partOfSpeech: 'noun',
    });
  });

  it('bricht über ein AbortSignal ab', async () => {
    const handle = createFakeLanguageModelScope();
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(AI_CAPABILITY);
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.enrichEntry(ENTRY, { ...CONTEXT, signal: controller.signal }),
    ).rejects.toBeInstanceOf(DOMException);
  });
});

describe('Ungültige Antworten', () => {
  async function enrichWith(answer: string) {
    const handle = createFakeLanguageModelScope({ respond: () => answer });
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(AI_CAPABILITY);
    return provider.enrichEntry(ENTRY, CONTEXT);
  }

  it('lehnt kaputtes JSON ab', async () => {
    await expect(enrichWith('kein json')).rejects.toBeInstanceOf(AiResponseError);
  });

  it('lehnt eine unbekannte Wortart ab', async () => {
    await expect(
      enrichWith(JSON.stringify({ partOfSpeech: 'Substantiv', difficulty: 2, topicTags: [] })),
    ).rejects.toBeInstanceOf(AiResponseError);
  });

  it('lehnt eine Schwierigkeit außerhalb von 1–5 ab', async () => {
    for (const difficulty of [0, 6, 2.5]) {
      await expect(
        enrichWith(JSON.stringify({ partOfSpeech: 'noun', difficulty, topicTags: [] })),
      ).rejects.toBeInstanceOf(AiResponseError);
    }
  });

  it('lehnt mehr als drei Themen-Tags ab', async () => {
    await expect(
      enrichWith(
        JSON.stringify({ partOfSpeech: 'noun', difficulty: 2, topicTags: ['a', 'b', 'c', 'd'] }),
      ),
    ).rejects.toBeInstanceOf(AiResponseError);
  });

  it('übernimmt eine unvollständige Antwort nicht teilweise', async () => {
    await expect(
      enrichWith(JSON.stringify({ partOfSpeech: 'noun' })),
    ).rejects.toBeInstanceOf(AiResponseError);
  });

  it('prüft dasselbe auch als reines Zod-Schema', () => {
    expect(enrichResponse.safeParse({ partOfSpeech: 'noun', difficulty: 3, topicTags: [] }).success)
      .toBe(true);
    expect(enrichResponse.safeParse({ partOfSpeech: 'x', difficulty: 3, topicTags: [] }).success)
      .toBe(false);
  });
});

describe('Aufräumen und Datenschutz', () => {
  it('gibt die Sitzung frei und verlangt danach eine neue Vorbereitung', async () => {
    const handle = createFakeLanguageModelScope();
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(AI_CAPABILITY);

    provider.destroy?.();

    expect(handle.destroyCount()).toBe(1);
    await expect(provider.enrichEntry(ENTRY, CONTEXT)).rejects.toBeInstanceOf(AiUnavailableError);
    await provider.prepare(AI_CAPABILITY);
    expect(handle.createCount()).toBe(2);
  });

  it('verarbeitet garantiert auf dem Gerät', () => {
    const provider = createChromePromptAiProvider(createFakeLanguageModelScope().scope);
    expect(provider.info.sendsDataOffDevice).toBe(false);
    expect(provider.info.processing).toBe('on-device');
    expect(provider.info.dataNotice).toBe(CHROME_PROMPT_NOTICE);
  });

  it('ruft niemals selbst fetch auf', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('Der Anbieter darf nicht selbst laden.');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const handle = createFakeLanguageModelScope();
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.getAvailability(AI_CAPABILITY);
    await provider.prepare(AI_CAPABILITY);
    await provider.enrichEntry(ENTRY, CONTEXT);
    provider.destroy?.();

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('Prompt', () => {
  it('nennt nur die vorhandenen Angaben', () => {
    const prompt = buildEnrichPrompt({ english: 'litter', germanAnswers: [] }, { grade: '9', cefrLevel: 'B1' });
    expect(prompt).toContain('litter');
    expect(prompt).not.toContain('Deutsche Bedeutung');
    expect(prompt).not.toContain('Thema des Pakets');
    expect(prompt).toContain('B1');
  });
});
