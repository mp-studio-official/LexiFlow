import { describe, expect, it, vi } from 'vitest';
import {
  AI_CAPABILITY,
  AiResponseError,
  CHROME_PROMPT_NOTICE,
  ENRICH_RESPONSE_SCHEMA,
  buildEnrichPrompt,
  buildTopicPrompt,
  MAX_TOPIC_ENTRIES,
  SENTENCE_CAPABILITY,
  SENTENCE_RESPONSE_SCHEMA,
  TEXT_CAPABILITY,
  TEXT_RESPONSE_SCHEMA,
  TOPIC_CAPABILITY,
  buildSentencePrompt,
  buildTextPrompt,
  TOPIC_RESPONSE_SCHEMA,
  createChromePromptAiProvider,
  detectPromptAiProvider,
  enrichResponse,
  getLanguageModelApi,
} from './chromePromptAiProvider';
import {
  AI_CAPABILITIES,
  AiUnavailableError,
  MAX_CONTEXT_CANDIDATES,
  MAX_CONTEXT_HEADWORDS,
  MAX_RECOMMENDATIONS,
  type AiCapability,
  type AiGenerationContext,
  type AlternativeSentenceRequest,
} from './AiProvider';
import { headwordsForPrompt } from '../import/topicDraft';
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
  it('kann seit Sprint 2B.2b alle vier Fähigkeiten', () => {
    const provider = createChromePromptAiProvider(createFakeLanguageModelScope().scope);
    expect(provider.capabilities()).toEqual([
      'enrich-entry',
      'suggest-from-topic',
      'alternative-sentence',
      'suggest-from-text',
    ]);
    // Der Vertrag kennt keine Fähigkeit mehr, die dieser Anbieter nicht kann.
    expect([...AI_CAPABILITIES].sort()).toEqual([...provider.capabilities()].sort());
  });

  it('verlangt für jede Fähigkeit eine eigene Vorbereitung', async () => {
    const provider = createChromePromptAiProvider(createFakeLanguageModelScope().scope);
    for (const capability of AI_CAPABILITIES) {
      await expect(provider.getAvailability(capability)).resolves.toBe('downloadable');
    }

    // Ohne prepare gibt es keine Sitzung – und damit keine Antwort.
    await expect(
      provider.suggestFromText(
        [{ key: 'c1', english: 'litter', occurrences: 2, sourceSentence: 'Do not drop litter.' }],
        CONTEXT,
      ),
    ).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(
      provider.alternativeSentence(
        { english: 'litter', germanAnswers: ['Müll'], existingSentences: [], mode: 'create' },
        CONTEXT,
      ),
    ).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('lehnt eine unbekannte Fähigkeit weiterhin ehrlich ab', async () => {
    const provider = createChromePromptAiProvider(createFakeLanguageModelScope().scope);
    const unknown = 'translate-pack' as AiCapability;
    await expect(provider.getAvailability(unknown)).resolves.toBe('unavailable');
    await expect(provider.prepare(unknown)).rejects.toBeInstanceOf(AiUnavailableError);
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

describe('Themenwerkstatt', () => {
  const TOPIC_CONTEXT: AiGenerationContext = {
    grade: '7',
    cefrLevel: 'A2',
    difficulty: 4,
    maxItems: 3,
    existingEnglish: ['crowded'],
  };

  function topicAnswer(count: number): string {
    return JSON.stringify({
      entries: Array.from({ length: count }, (_, index) => ({
        english: `word${index + 1}`,
        germanAnswers: [`Wort${index + 1}`],
        partOfSpeech: 'noun',
        difficulty: 3,
        topicTags: ['city'],
        exampleSentence: { english: `This is word${index + 1}.`, german: `Das ist Wort ${index + 1}.` },
      })),
    });
  }

  async function askTopic(answer: string, context = TOPIC_CONTEXT) {
    const handle = createFakeLanguageModelScope({ respond: () => answer });
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(TOPIC_CAPABILITY);
    return { handle, result: await provider.suggestFromTopic('City life', context) };
  }

  it('fordert strukturierte Ausgabe über responseConstraint an', async () => {
    const { handle } = await askTopic(topicAnswer(2));
    expect(handle.lastConstraint()).toBe(TOPIC_RESPONSE_SCHEMA);
    expect(TOPIC_RESPONSE_SCHEMA.properties.entries.maxItems).toBe(MAX_TOPIC_ENTRIES);
  });

  it('liefert geprüfte Vorschläge mit Beispielsatz', async () => {
    const { result } = await askTopic(topicAnswer(2));
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      english: 'word1',
      germanAnswers: ['Wort1'],
      partOfSpeech: 'noun',
      difficulty: 3,
      topicTags: ['city'],
    });
    expect(result[0]?.exampleSentences?.[0]).toEqual({
      english: 'This is word1.',
      german: 'Das ist Wort 1.',
    });
  });

  it('begrenzt auf die angeforderte Anzahl', async () => {
    const { result } = await askTopic(topicAnswer(8));
    expect(result).toHaveLength(3);
  });

  it('übergibt nur den nötigen Kontext', async () => {
    const { handle } = await askTopic(topicAnswer(1));
    const prompt = handle.prompts[0] ?? '';
    expect(prompt).toContain('City life');
    expect(prompt).toContain('7');
    expect(prompt).toContain('A2');
    expect(prompt).toContain('4 von 5');
    expect(prompt).toContain('crowded');
    expect(prompt).not.toMatch(/box|dueAt|progress|packId|sessionCount/i);
  });

  it('schreibt höchstens die dokumentierte Zahl an Stichwörtern in den Prompt', async () => {
    // Sprint 2B.2a1: Selbst wenn ein Aufrufer mehr übergibt, wächst der Kontext nicht.
    const bestand = Array.from({ length: 500 }, (_, index) => `word${index + 1}`);
    const { handle } = await askTopic(topicAnswer(1), {
      ...TOPIC_CONTEXT,
      existingEnglish: bestand,
    });

    const prompt = handle.prompts[0] ?? '';
    const genannt = bestand.filter((word) =>
      new RegExp(`(^|[^0-9a-z])${word}(?![0-9])`, 'i').test(prompt),
    );
    expect(genannt).toHaveLength(MAX_CONTEXT_HEADWORDS);
    expect(prompt).toContain('word1,');
    expect(prompt).not.toContain('word500');
  });

  it('nimmt weder Übersetzungen noch Lernstände in den Prompt auf', async () => {
    const prompt = buildTopicPrompt('City life', {
      grade: '7',
      cefrLevel: 'A2',
      difficulty: 3,
      maxItems: 5,
      existingEnglish: headwordsForPrompt(['crowded', 'litter']),
    });

    expect(prompt).toContain('crowded, litter');
    for (const verboten of ['überfüllt', 'Müll', 'box', 'dueAt', 'streak', 'packId', 'sessionCount']) {
      expect(prompt).not.toContain(verboten);
    }
  });

  it('lehnt eine ungültige Liste vollständig ab', async () => {
    for (const answer of [
      'kein json',
      JSON.stringify({ entries: [{ english: 'x' }] }),
      JSON.stringify({ entries: [{ english: 'x', germanAnswers: [], partOfSpeech: 'noun', difficulty: 3, topicTags: [] }] }),
      JSON.stringify({ entries: [{ english: 'x', germanAnswers: ['y'], partOfSpeech: 'Substantiv', difficulty: 3, topicTags: [] }] }),
      JSON.stringify({ entries: [{ english: 'x', germanAnswers: ['y'], partOfSpeech: 'noun', difficulty: 9, topicTags: [] }] }),
      JSON.stringify({ entries: [{ english: 'x', germanAnswers: ['y'], partOfSpeech: 'noun', difficulty: 3, topicTags: ['a', 'b', 'c', 'd'] }] }),
    ]) {
      await expect(askTopic(answer)).rejects.toBeInstanceOf(AiResponseError);
    }
  });

  it('repariert eine kaputte Antwort nicht still, sondern erlaubt einen neuen Versuch', async () => {
    let call = 0;
    const handle = createFakeLanguageModelScope({
      respond: () => {
        call += 1;
        return call === 1 ? JSON.stringify({ entries: [{ english: 'x' }] }) : topicAnswer(1);
      },
    });
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(TOPIC_CAPABILITY);

    await expect(provider.suggestFromTopic('City life', TOPIC_CONTEXT)).rejects.toBeInstanceOf(
      AiResponseError,
    );
    await expect(provider.suggestFromTopic('City life', TOPIC_CONTEXT)).resolves.toHaveLength(1);
  });

  it('bricht über ein AbortSignal ab', async () => {
    const handle = createFakeLanguageModelScope({ respond: () => topicAnswer(1) });
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(TOPIC_CAPABILITY);
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.suggestFromTopic('City life', { ...TOPIC_CONTEXT, signal: controller.signal }),
    ).rejects.toBeInstanceOf(DOMException);
  });

  it('verlangt eine vorherige Vorbereitung', async () => {
    const handle = createFakeLanguageModelScope({ respond: () => topicAnswer(1) });
    const provider = createChromePromptAiProvider(handle.scope);
    await expect(provider.suggestFromTopic('City life', TOPIC_CONTEXT)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(handle.createCount()).toBe(0);
  });
});

describe('Getrennte Sitzungen je Fähigkeit', () => {
  it('bereitet jede Fähigkeit einzeln vor', async () => {
    const handle = createFakeLanguageModelScope();
    const provider = createChromePromptAiProvider(handle.scope);

    await provider.prepare(AI_CAPABILITY);
    expect(handle.createCount()).toBe(1);
    // Die andere Fähigkeit ist davon unberührt.
    await expect(provider.suggestFromTopic('City life', { grade: '7', cefrLevel: 'A2' }))
      .rejects.toBeInstanceOf(AiUnavailableError);

    await provider.prepare(TOPIC_CAPABILITY);
    expect(handle.createCount()).toBe(2);

    await provider.prepare(SENTENCE_CAPABILITY);
    await provider.prepare(TEXT_CAPABILITY);
    expect(handle.createCount()).toBe(4);

    // Und keine wird zweimal vorbereitet.
    for (const capability of AI_CAPABILITIES) await provider.prepare(capability);
    expect(handle.createCount()).toBe(4);
  });

  it('gibt availability und create je Fähigkeit dieselben Optionen', async () => {
    const handle = createFakeLanguageModelScope();
    const provider = createChromePromptAiProvider(handle.scope);

    await provider.getAvailability(AI_CAPABILITY);
    await provider.prepare(AI_CAPABILITY);
    await provider.getAvailability(TOPIC_CAPABILITY);
    await provider.prepare(TOPIC_CAPABILITY);
    await provider.getAvailability(SENTENCE_CAPABILITY);
    await provider.prepare(SENTENCE_CAPABILITY);
    await provider.getAvailability(TEXT_CAPABILITY);
    await provider.prepare(TEXT_CAPABILITY);

    const languagesOf = (options: unknown) => ({
      inputs: (options as { expectedInputs?: Array<{ languages: string[] }> }).expectedInputs?.[0]
        ?.languages,
      outputs: (options as { expectedOutputs?: Array<{ languages: string[] }> }).expectedOutputs?.[0]
        ?.languages,
    });

    // enrich-entry: englische Ausgabe.
    expect(languagesOf(handle.availabilityCalls()[0])).toEqual({
      inputs: ['en', 'de'],
      outputs: ['en'],
    });
    expect(languagesOf(handle.createCalls()[0])).toEqual(languagesOf(handle.availabilityCalls()[0]));

    // suggest-from-topic: muss auch Deutsch erzeugen.
    expect(languagesOf(handle.availabilityCalls()[1])).toEqual({
      inputs: ['de', 'en'],
      outputs: ['de', 'en'],
    });
    expect(languagesOf(handle.createCalls()[1])).toEqual(languagesOf(handle.availabilityCalls()[1]));

    // alternative-sentence: englischer Satz plus deutsche Entsprechung.
    expect(languagesOf(handle.availabilityCalls()[2])).toEqual({
      inputs: ['en', 'de'],
      outputs: ['en', 'de'],
    });
    expect(languagesOf(handle.createCalls()[2])).toEqual(languagesOf(handle.availabilityCalls()[2]));

    // suggest-from-text: antwortet nur mit Schlüsseln.
    expect(languagesOf(handle.availabilityCalls()[3])).toEqual({
      inputs: ['en', 'de'],
      outputs: ['en'],
    });
    expect(languagesOf(handle.createCalls()[3])).toEqual(languagesOf(handle.availabilityCalls()[3]));
  });

  it('lässt eine Fähigkeit nutzbar, wenn die andere scheitert', async () => {
    let creates = 0;
    const handle = createFakeLanguageModelScope({
      respond: () =>
        JSON.stringify({ partOfSpeech: 'noun', difficulty: 2, topicTags: [] }),
    });
    const failing = {
      LanguageModel: {
        availability: () => Promise.resolve('downloadable'),
        create: (options: unknown) => {
          creates += 1;
          const outputs = (options as { expectedOutputs?: Array<{ languages: string[] }> })
            .expectedOutputs?.[0]?.languages;
          // Nur die zweisprachige Fähigkeit scheitert.
          if (outputs?.includes('de')) return Promise.reject(new Error('kein zweisprachiges Modell'));
          return handle.scope.LanguageModel!.create(options as never);
        },
      },
    };

    const provider = createChromePromptAiProvider(failing);
    await expect(provider.prepare(TOPIC_CAPABILITY)).rejects.toThrow('kein zweisprachiges Modell');

    await provider.prepare(AI_CAPABILITY);
    await expect(provider.enrichEntry(ENTRY, CONTEXT)).resolves.toMatchObject({
      partOfSpeech: 'noun',
    });
    expect(creates).toBe(2);
  });

  it('hält die Warteschlangen getrennt', async () => {
    let call = 0;
    const handle = createFakeLanguageModelScope({
      respond: (input) => {
        call += 1;
        if (input.includes('Ordne die folgende Vokabel ein')) throw new Error('kaputt');
        return JSON.stringify({
          entries: [
            {
              english: 'word1',
              germanAnswers: ['Wort1'],
              partOfSpeech: 'noun',
              difficulty: 3,
              topicTags: [],
            },
          ],
        });
      },
    });
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(AI_CAPABILITY);
    await provider.prepare(TOPIC_CAPABILITY);

    await expect(provider.enrichEntry(ENTRY, CONTEXT)).rejects.toThrow('kaputt');
    // Der Fehler der einen Kette lässt die andere unberührt.
    await expect(
      provider.suggestFromTopic('City life', { grade: '7', cefrLevel: 'A2', maxItems: 1 }),
    ).resolves.toHaveLength(1);
    expect(call).toBe(2);
  });

  it('zerstört alle Sitzungen', async () => {
    const handle = createFakeLanguageModelScope();
    const provider = createChromePromptAiProvider(handle.scope);
    for (const capability of AI_CAPABILITIES) await provider.prepare(capability);

    provider.destroy?.();

    expect(handle.destroyCount()).toBe(4);
    await expect(provider.enrichEntry(ENTRY, CONTEXT)).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(
      provider.suggestFromTopic('City life', { grade: '7', cefrLevel: 'A2' }),
    ).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe('Satzassistent', () => {
  const SENTENCE_CONTEXT: AiGenerationContext = {
    grade: '8',
    cefrLevel: 'A2+',
    topic: 'City life',
  };

  const REQUEST: AlternativeSentenceRequest = {
    english: 'to apologise',
    germanAnswers: ['sich entschuldigen'],
    partOfSpeech: 'verb',
    existingSentences: ['He apologised to the whole class after the incident.'],
    mode: 'simpler',
  };

  async function askSentence(answer: string, request = REQUEST) {
    const handle = createFakeLanguageModelScope({ respond: () => answer });
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(SENTENCE_CAPABILITY);
    return { handle, result: await provider.alternativeSentence(request, SENTENCE_CONTEXT) };
  }

  it('fordert strukturierte Ausgabe an und liefert beide Sprachen', async () => {
    const { handle, result } = await askSentence(
      JSON.stringify({ english: 'She apologised at once.', german: 'Sie entschuldigte sich sofort.' }),
    );
    expect(handle.lastConstraint()).toBe(SENTENCE_RESPONSE_SCHEMA);
    expect(result).toEqual({
      english: 'She apologised at once.',
      german: 'Sie entschuldigte sich sofort.',
    });
  });

  it('lässt die deutsche Entsprechung weg, wenn das Modell keine liefert', async () => {
    const { result } = await askSentence(JSON.stringify({ english: 'Please apologise now.' }));
    expect(result).toEqual({ english: 'Please apologise now.' });
    expect('german' in result).toBe(false);
  });

  it('lehnt eine formal falsche Antwort vollständig ab', async () => {
    for (const answer of [
      'kein json',
      JSON.stringify({}),
      JSON.stringify({ english: '' }),
      JSON.stringify({ english: 'x'.repeat(401) }),
      JSON.stringify({ english: 'ok', german: 'y'.repeat(401) }),
    ]) {
      await expect(askSentence(answer)).rejects.toBeInstanceOf(AiResponseError);
    }
  });

  it('übergibt genau die eine Vokabel und ihren Lernkontext', () => {
    const prompt = buildSentencePrompt(REQUEST, SENTENCE_CONTEXT);
    expect(prompt).toContain('to apologise');
    expect(prompt).toContain('sich entschuldigen');
    expect(prompt).toContain('verb');
    expect(prompt).toContain('He apologised to the whole class after the incident.');
    expect(prompt).toContain('8');
    expect(prompt).toContain('A2+');
    expect(prompt).toContain('City life');
    expect(prompt).not.toMatch(/box|dueAt|progress|packId|sessionCount/i);
  });

  it('formuliert für jeden Modus eine andere Aufgabe', () => {
    const create = buildSentencePrompt({ ...REQUEST, mode: 'create' }, SENTENCE_CONTEXT);
    const simpler = buildSentencePrompt({ ...REQUEST, mode: 'simpler' }, SENTENCE_CONTEXT);
    const other = buildSentencePrompt(
      { ...REQUEST, mode: 'different-context' },
      SENTENCE_CONTEXT,
    );

    expect(simpler).toContain('einfacheren');
    expect(other).toContain('anderen Kontext');
    expect(new Set([create, simpler, other]).size).toBe(3);
  });

  it('bricht über ein AbortSignal ab', async () => {
    const handle = createFakeLanguageModelScope({ respond: () => JSON.stringify({ english: 'x' }) });
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(SENTENCE_CAPABILITY);
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.alternativeSentence(REQUEST, { ...SENTENCE_CONTEXT, signal: controller.signal }),
    ).rejects.toBeInstanceOf(DOMException);
  });

  it('meldet Fortschritt beim Vorbereiten', async () => {
    const handle = createFakeLanguageModelScope();
    const provider = createChromePromptAiProvider(handle.scope);
    const seen: number[] = [];
    await provider.prepare(SENTENCE_CAPABILITY, (value) => seen.push(value));
    expect(seen.at(-1)).toBe(1);
  });
});

describe('Textempfehlung', () => {
  const TEXT_CONTEXT: AiGenerationContext = { grade: '9', cefrLevel: 'B1', maxItems: 5 };

  const CANDIDATES = [
    { key: 'c1', english: 'crowded', occurrences: 3, sourceSentence: 'The bus was crowded.' },
    { key: 'c2', english: 'litter', occurrences: 2, sourceSentence: 'Do not drop litter.' },
    { key: 'c3', english: 'pavement', occurrences: 1, sourceSentence: 'The pavement was wet.' },
  ];

  async function askText(answer: string, candidates = CANDIDATES, context = TEXT_CONTEXT) {
    const handle = createFakeLanguageModelScope({ respond: () => answer });
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(TEXT_CAPABILITY);
    return { handle, result: await provider.suggestFromText(candidates, context) };
  }

  it('fordert strukturierte Schlüssel an und behält die Reihenfolge', async () => {
    const { handle, result } = await askText(
      JSON.stringify({ recommendedKeys: ['c2', 'c1'] }),
    );
    expect(handle.lastConstraint()).toBe(TEXT_RESPONSE_SCHEMA);
    expect(TEXT_RESPONSE_SCHEMA.properties.recommendedKeys.maxItems).toBe(MAX_RECOMMENDATIONS);
    // Stärkste Empfehlung zuerst – genau so, wie das Modell geantwortet hat.
    expect(result).toEqual([{ key: 'c2' }, { key: 'c1' }]);
  });

  it('verwirft unbekannte Schlüssel, statt Wörter zu erfinden', async () => {
    const { result } = await askText(
      JSON.stringify({ recommendedKeys: ['c2', 'c99', 'skyline', 'c3'] }),
    );
    expect(result).toEqual([{ key: 'c2' }, { key: 'c3' }]);
  });

  it('entfernt Dubletten', async () => {
    const { result } = await askText(JSON.stringify({ recommendedKeys: ['c1', 'c1', 'c2', 'c1'] }));
    expect(result).toEqual([{ key: 'c1' }, { key: 'c2' }]);
  });

  it('liefert eine leere Liste, wenn nichts Bekanntes übrig bleibt', async () => {
    const { result } = await askText(JSON.stringify({ recommendedKeys: ['c42', 'c43'] }));
    expect(result).toEqual([]);
  });

  it('lehnt eine formal falsche Antwort vollständig ab', async () => {
    for (const answer of [
      'kein json',
      JSON.stringify({}),
      JSON.stringify({ recommendedKeys: 'c1' }),
      JSON.stringify({ recommendedKeys: [1, 2] }),
      JSON.stringify({ recommendedKeys: Array.from({ length: 21 }, (_, i) => `c${i + 1}`) }),
    ]) {
      await expect(askText(answer)).rejects.toBeInstanceOf(AiResponseError);
    }
  });

  it('übergibt höchstens 60 Kandidaten und niemals den ganzen Text', () => {
    const many = Array.from({ length: 120 }, (_, index) => ({
      key: `c${index + 1}`,
      english: `word${index + 1}`,
      occurrences: 1,
      sourceSentence: `Sentence ${index + 1} about word${index + 1}.`,
    }));

    const prompt = buildTextPrompt(many, TEXT_CONTEXT);
    const keyLines = prompt.split('\n').filter((line) => /^c\d+ \| /.test(line));
    expect(keyLines).toHaveLength(MAX_CONTEXT_CANDIDATES);
    expect(prompt).toContain('c60 | word60');
    expect(prompt).not.toContain('c61 | word61');
    expect(prompt).not.toContain('word120');
  });

  it('nennt nur neutrale Schlüssel, keine internen IDs oder Lernstände', () => {
    const prompt = buildTextPrompt(CANDIDATES, { ...TEXT_CONTEXT, topic: 'City life' });
    expect(prompt).toContain('c1 | crowded | 3×');
    expect(prompt).toContain('City life');
    expect(prompt).not.toMatch(/box|dueAt|progress|packId|sessionCount|entryId/i);
  });

  it('bricht über ein AbortSignal ab', async () => {
    const handle = createFakeLanguageModelScope({
      respond: () => JSON.stringify({ recommendedKeys: ['c1'] }),
    });
    const provider = createChromePromptAiProvider(handle.scope);
    await provider.prepare(TEXT_CAPABILITY);
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.suggestFromText(CANDIDATES, { ...TEXT_CONTEXT, signal: controller.signal }),
    ).rejects.toBeInstanceOf(DOMException);
  });

  it('prüft die Antwort gegen genau die Kandidaten, die im Prompt standen', async () => {
    // Sprint 2B.2b1: Der Prompt war begrenzt, die Prüfung lief gegen die volle
    // Liste – ein Schlüssel jenseits der Grenze wäre so gültig gewesen, obwohl
    // das Modell ihn nie gesehen hat.
    const many = Array.from({ length: 120 }, (_, index) => ({
      key: `c${index + 1}`,
      english: `word${index + 1}`,
      occurrences: 1,
      sourceSentence: `Sentence ${index + 1} about word${index + 1}.`,
    }));

    const { handle, result } = await askText(
      JSON.stringify({ recommendedKeys: ['c60', 'c61'] }),
      many,
    );

    const prompt = handle.prompts[0] ?? '';
    expect(prompt).toContain('c60 | word60');
    expect(prompt).not.toContain('c61 | word61');
    // Nur der Schlüssel, der wirklich vorlag, wird akzeptiert.
    expect(result).toEqual([{ key: 'c60' }]);
  });
});

describe('Gleichzeitige Vorbereitung', () => {
  /** Ein Scope, dessen `create()` sich gezielt anhalten lässt. */
  function gatedScope(options: { fail?: boolean } = {}) {
    let creates = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const scope = {
      LanguageModel: {
        availability: () => Promise.resolve('downloadable'),
        create: async () => {
          creates += 1;
          await gate;
          if (options.fail) throw new Error('Modell nicht ladbar.');
          return { prompt: () => Promise.resolve('{}'), destroy: () => undefined };
        },
      },
    };

    return { scope, release: () => release(), creates: () => creates };
  }

  it('startet bei zwei gleichzeitigen Aufrufen nur einen Download', async () => {
    const gated = gatedScope();
    const provider = createChromePromptAiProvider(gated.scope);

    // Beide starten, bevor die erste Sitzung existiert.
    const first = provider.prepare(AI_CAPABILITY);
    const second = provider.prepare(AI_CAPABILITY);
    gated.release();
    await Promise.all([first, second]);

    expect(gated.creates()).toBe(1);
    // Und genau eine Sitzung ist nutzbar.
    await expect(provider.enrichEntry(ENTRY, CONTEXT)).rejects.toBeInstanceOf(AiResponseError);
  });

  it('lässt nach einem gemeinsam gescheiterten Versuch einen neuen zu', async () => {
    const failing = gatedScope({ fail: true });
    const provider = createChromePromptAiProvider(failing.scope);

    const first = provider.prepare(AI_CAPABILITY);
    const second = provider.prepare(AI_CAPABILITY);
    failing.release();

    await expect(first).rejects.toThrow('Modell nicht ladbar.');
    await expect(second).rejects.toThrow('Modell nicht ladbar.');
    expect(failing.creates()).toBe(1);
    // Nichts blockiert: Die Fähigkeit ist weiterhin nicht vorbereitet …
    await expect(provider.enrichEntry(ENTRY, CONTEXT)).rejects.toBeInstanceOf(AiUnavailableError);

    // … und ein neuer Versuch geht wirklich wieder an das Modell.
    const working = createFakeLanguageModelScope({
      respond: () => JSON.stringify({ partOfSpeech: 'noun', difficulty: 2, topicTags: [] }),
    });
    const retry = createChromePromptAiProvider(working.scope);
    await retry.prepare(AI_CAPABILITY);
    await expect(retry.enrichEntry(ENTRY, CONTEXT)).resolves.toMatchObject({
      partOfSpeech: 'noun',
    });
  });

  it('hält die Vorbereitungen verschiedener Fähigkeiten auseinander', async () => {
    const gated = gatedScope();
    const provider = createChromePromptAiProvider(gated.scope);

    const both = Promise.all([
      provider.prepare(AI_CAPABILITY),
      provider.prepare(AI_CAPABILITY),
      provider.prepare(TOPIC_CAPABILITY),
      provider.prepare(TOPIC_CAPABILITY),
    ]);
    gated.release();
    await both;

    // Zwei Fähigkeiten, zwei Sitzungen – nicht vier.
    expect(gated.creates()).toBe(2);
  });

  it('gibt einen laufenden Versuch nach einem Abbruch wieder frei', async () => {
    let creates = 0;
    const scope = {
      LanguageModel: {
        availability: () => Promise.resolve('downloadable'),
        create: (options?: { signal?: AbortSignal }) => {
          creates += 1;
          return new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Abgebrochen', 'AbortError')),
            );
          });
        },
      },
    };
    const provider = createChromePromptAiProvider(scope);

    const controller = new AbortController();
    const attempt = provider.prepare(AI_CAPABILITY, undefined, controller.signal);
    controller.abort();
    await expect(attempt).rejects.toBeInstanceOf(DOMException);

    // Ein neuer Versuch startet tatsächlich einen neuen `create()`-Aufruf.
    const second = provider.prepare(AI_CAPABILITY, undefined, new AbortController().signal);
    expect(creates).toBe(2);
    void second.catch(() => undefined);
  });
});
