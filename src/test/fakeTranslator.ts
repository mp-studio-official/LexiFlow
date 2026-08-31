import type { ProviderState } from '../providers/state';
import type { PartOfSpeech } from '../domain/schema';
import {
  AI_CAPABILITIES,
  AiUnavailableError,
  type AiCapability,
  type AiGenerationContext,
  type AiProvider,
  type AiSentenceSuggestion,
  type AiTextCandidate,
  type AiTextRecommendation,
  type AiVocabSuggestion,
  type AlternativeSentenceRequest,
} from '../ai/AiProvider';
import {
  TranslationAbortedError,
  TranslationUnavailableError,
  type TranslationProvider,
} from '../translation/TranslationProvider';

/**
 * Testdoubles für Übersetzung.
 *
 * Automatisierte Tests laden niemals ein echtes Browsermodell. Sie arbeiten
 * entweder gegen `createFakeTranslatorScope` (prüft den Chrome-Anbieter gegen
 * eine nachgebaute Translator-API) oder gegen `createFakeTranslationProvider`
 * (prüft die Oberfläche gegen einen beliebigen Anbieter).
 */

interface Listener {
  (event: { loaded: number; total?: number }): void;
}

export interface FakeTranslatorScope {
  Translator?: {
    availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
    create(options: {
      sourceLanguage: string;
      targetLanguage: string;
      monitor?: (monitor: {
        addEventListener(type: 'downloadprogress', listener: Listener): void;
      }) => void;
      signal?: AbortSignal;
    }): Promise<{
      translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
      destroy?(): void;
    }>;
  };
}

export interface FakeTranslatorOptions {
  /** Zustand, den `availability()` meldet. */
  availability?: ProviderState;
  /** Fortschrittswerte, die `create()` über den Monitor meldet. */
  progress?: readonly number[];
  /** Übersetzt einen Text; Standard: `[de] <text>`. */
  translate?: (text: string) => string | Promise<string>;
  /** Lässt `availability()` scheitern (nicht unterstützter Browser). */
  availabilityThrows?: boolean;
}

export interface FakeTranslatorHandle {
  scope: FakeTranslatorScope;
  /** Reihenfolge der tatsächlich übersetzten Texte. */
  readonly calls: string[];
  /** Wie oft `create()` aufgerufen wurde – der „Modelldownload“. */
  readonly createCount: () => number;
  readonly destroyCount: () => number;
  /** Zeitpunkte in Aufrufreihenfolge, um Sequentialität zu prüfen. */
  readonly overlaps: () => number;
}

/** Baut eine `self.Translator`-Attrappe – ohne Netzwerk, ohne echtes Modell. */
export function createFakeTranslatorScope(
  options: FakeTranslatorOptions = {},
): FakeTranslatorHandle {
  const {
    availability = 'downloadable',
    progress = [0.5, 1],
    translate = (text: string) => `[de] ${text}`,
    availabilityThrows = false,
  } = options;

  const calls: string[] = [];
  let createCount = 0;
  let destroyCount = 0;
  let active = 0;
  let overlaps = 0;

  const scope: FakeTranslatorScope = {
    Translator: {
      availability() {
        if (availabilityThrows) return Promise.reject(new Error('not supported'));
        return Promise.resolve(availability);
      },
      create(createOptions) {
        createCount += 1;
        createOptions.monitor?.({
          addEventListener(type, listener) {
            if (type !== 'downloadprogress') return;
            for (const value of progress) listener({ loaded: value, total: 1 });
          },
        });
        return Promise.resolve({
          async translate(text, translateOptions) {
            if (translateOptions?.signal?.aborted) throw new TranslationAbortedError();
            active += 1;
            if (active > 1) overlaps += 1;
            await Promise.resolve();
            const result = await translate(text);
            active -= 1;
            calls.push(text);
            return result;
          },
          destroy() {
            destroyCount += 1;
          },
        });
      },
    },
  };

  return {
    scope,
    calls,
    createCount: () => createCount,
    destroyCount: () => destroyCount,
    overlaps: () => overlaps,
  };
}

export interface FakeProviderOptions {
  availability?: ProviderState;
  translate?: (text: string) => string;
  /** Diese Texte scheitern beim ersten Versuch. */
  failFor?: readonly string[];
  progress?: readonly number[];
  /** `prepare` bleibt offen, bis `releasePrepare()` gerufen wird. */
  gatePrepare?: boolean;
  /** `prepare` scheitert – der andere Anbieter muss trotzdem arbeiten. */
  prepareFails?: boolean;
  /**
   * So viele der ersten `prepare`-Versuche scheitern, danach klappt es.
   * Damit lässt sich „Erneut versuchen“ prüfen, ohne den Anbieter zu tauschen.
   */
  prepareFailures?: number;
}

export interface FakeTranslationProviderHandle {
  provider: TranslationProvider;
  readonly translated: string[];
  readonly prepareCount: () => number;
  /** Löst ein durch `gatePrepare` angehaltenes `prepare` auf. */
  readonly releasePrepare: () => void;
}

/**
 * Ein vollständiger `TranslationProvider` für Komponententests: deterministisch,
 * ohne Modell, ohne Netzwerk.
 */
export function createFakeTranslationProvider(
  options: FakeProviderOptions = {},
): FakeTranslationProviderHandle {
  const {
    availability = 'downloadable',
    translate = (text: string) => `${text}-de`,
    failFor = [],
    progress = [0.4, 1],
    gatePrepare = false,
    prepareFails = false,
    prepareFailures = prepareFails ? Number.POSITIVE_INFINITY : 0,
  } = options;

  const translated: string[] = [];
  const failed = new Set<string>();
  let prepareCount = 0;
  let failuresLeft = prepareFailures;
  let ready = false;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const provider: TranslationProvider = {
    info: {
      id: 'fake',
      label: 'Testübersetzung',
      dataNotice: 'Testanbieter. Es werden keine Daten übertragen.',
      sendsDataOffDevice: false,
    },
    getAvailability: () => Promise.resolve(availability),
    async prepare(_source, _target, onProgress, signal) {
      // Zählen und Fortschritt **vor** jedem await: Der Test soll unmittelbar
      // nach dem Klick sehen können, dass der Aufruf erfolgt ist.
      prepareCount += 1;
      if (availability === 'unavailable') throw new TranslationUnavailableError();
      if (signal?.aborted) throw new TranslationAbortedError();
      for (const value of progress) onProgress?.(value);
      if (gatePrepare) await gate;
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error('Übersetzungsmodell nicht ladbar.');
      }
      ready = true;
      await Promise.resolve();
    },
    async translate(text, signal) {
      // Gleiche Aussage wie der echte Chrome-Anbieter, damit Tests die
      // Verwechslung von „verfügbar“ und „vorbereitet“ sichtbar machen.
      if (!ready) throw new TranslationUnavailableError('Das Sprachmodell ist noch nicht geladen.');
      if (signal?.aborted) throw new TranslationAbortedError();
      await Promise.resolve();
      // Beim ersten Versuch scheitern, damit „Erneut versuchen“ prüfbar ist.
      if (failFor.includes(text) && !failed.has(text)) {
        failed.add(text);
        throw new Error('Übersetzung fehlgeschlagen.');
      }
      translated.push(text);
      return translate(text);
    },
    destroy() {
      ready = false;
    },
  };

  return { provider, translated, prepareCount: () => prepareCount, releasePrepare: () => release() };
}

// ---------------------------------------------------------------------------
// Sprachmodell (Prompt-API)
// ---------------------------------------------------------------------------

export interface FakeLanguageModelScope {
  LanguageModel?: {
    availability(options?: unknown): Promise<string>;
    create(options?: {
      monitor?: (monitor: {
        addEventListener(type: 'downloadprogress', listener: Listener): void;
      }) => void;
      signal?: AbortSignal;
    }): Promise<{
      prompt(
        input: string,
        options?: { responseConstraint?: unknown; signal?: AbortSignal },
      ): Promise<string>;
      destroy?(): void;
    }>;
  };
}

export interface FakeLanguageModelOptions {
  availability?: ProviderState;
  progress?: readonly number[];
  /** Antwort des Modells; Standard: eine gültige, knappe Einordnung. */
  respond?: (prompt: string) => string;
  /** Lässt `create()` beim ersten Aufruf scheitern. */
  failFirstCreate?: boolean;
  availabilityThrows?: boolean;
}

export interface FakeLanguageModelHandle {
  scope: FakeLanguageModelScope;
  /** Die tatsächlich gestellten Anfragen. */
  readonly prompts: string[];
  /** Die zuletzt übergebene `responseConstraint`. */
  readonly lastConstraint: () => unknown;
  readonly createCount: () => number;
  readonly destroyCount: () => number;
  readonly availabilityCalls: () => unknown[];
  /** Die Optionen, mit denen `create()` gerufen wurde – je Aufruf einer. */
  readonly createCalls: () => unknown[];
}

export const FAKE_MODEL_ANSWER = JSON.stringify({
  partOfSpeech: 'adjective',
  difficulty: 3,
  topicTags: ['city', 'traffic'],
});

/** Baut eine `self.LanguageModel`-Attrappe – ohne Netzwerk, ohne echtes Modell. */
export function createFakeLanguageModelScope(
  options: FakeLanguageModelOptions = {},
): FakeLanguageModelHandle {
  const {
    availability = 'downloadable',
    progress = [0.5, 1],
    respond = () => FAKE_MODEL_ANSWER,
    failFirstCreate = false,
    availabilityThrows = false,
  } = options;

  const prompts: string[] = [];
  const availabilityCalls: unknown[] = [];
  const createCalls: unknown[] = [];
  let constraint: unknown;
  let createCount = 0;
  let destroyCount = 0;

  const scope: FakeLanguageModelScope = {
    LanguageModel: {
      availability(createOptions) {
        availabilityCalls.push(createOptions);
        if (availabilityThrows) return Promise.reject(new Error('not supported'));
        return Promise.resolve(availability);
      },
      create(createOptions) {
        createCount += 1;
        createCalls.push(createOptions);
        if (failFirstCreate && createCount === 1) {
          return Promise.reject(new Error('Download unterbrochen'));
        }
        createOptions?.monitor?.({
          addEventListener(type, listener) {
            if (type !== 'downloadprogress') return;
            for (const value of progress) listener({ loaded: value, total: 1 });
          },
        });
        return Promise.resolve({
          async prompt(input, promptOptions) {
            if (promptOptions?.signal?.aborted) {
              throw new DOMException('Abgebrochen', 'AbortError');
            }
            constraint = promptOptions?.responseConstraint;
            await Promise.resolve();
            prompts.push(input);
            return respond(input);
          },
          destroy() {
            destroyCount += 1;
          },
        });
      },
    },
  };

  return {
    scope,
    prompts,
    lastConstraint: () => constraint,
    createCount: () => createCount,
    destroyCount: () => destroyCount,
    availabilityCalls: () => availabilityCalls,
    createCalls: () => createCalls,
  };
}

/** Ein `AiProvider` für Komponententests – deterministisch, ohne Modell. */
export interface FakeAiOptions {
  availability?: ProviderState;
  /** Zustand für `suggest-from-topic`; Standard: wie `availability`. */
  topicAvailability?: ProviderState;
  /** Antwort der Themenwerkstatt; Standard: `count` schlichte Vorschläge. */
  topicEntries?: (topic: string, count: number) => AiVocabSuggestion[];
  /** Die Themenanfrage scheitert beim ersten Versuch. */
  topicFailsOnce?: boolean;
  /** Zustand für `alternative-sentence`; Standard: wie `availability`. */
  sentenceAvailability?: ProviderState;
  /** Antwort des Satzassistenten; Standard: ein Satz mit dem Stichwort. */
  sentenceFor?: (request: AlternativeSentenceRequest) => AiSentenceSuggestion;
  /** Der Satzvorschlag scheitert beim ersten Versuch. */
  sentenceFailsOnce?: boolean;
  /** Zustand für `suggest-from-text`; Standard: wie `availability`. */
  textAvailability?: ProviderState;
  /** Antwort der Textempfehlung; Standard: jeder zweite Kandidat. */
  recommendationsFor?: (candidates: readonly AiTextCandidate[]) => AiTextRecommendation[];
  /** Die Empfehlungsanfrage scheitert beim ersten Versuch. */
  textFailsOnce?: boolean;
  partOfSpeech?: PartOfSpeech;
  difficulty?: number;
  topicTags?: string[];
  /** Diese Stichwörter scheitern beim ersten Versuch. */
  failFor?: readonly string[];
  progress?: readonly number[];
  /** `prepare` bleibt offen, bis `releasePrepare()` gerufen wird. */
  gatePrepare?: boolean;
  /** `prepare` scheitert – der andere Anbieter muss trotzdem arbeiten. */
  prepareFails?: boolean;
  /**
   * So viele der ersten `prepare`-Versuche scheitern, danach klappt es.
   * Damit lässt sich „Erneut versuchen“ prüfen, ohne den Anbieter zu tauschen.
   */
  prepareFailures?: number;
}

export interface FakeAiHandle {
  provider: AiProvider;
  readonly enriched: string[];
  readonly prepareCount: () => number;
  readonly releasePrepare: () => void;
  /** Vorbereitungen je Fähigkeit – für die Sitzungstrennung. */
  readonly prepared: () => AiCapability[];
  /** Die gestellten Themenanfragen mit ihrem Kontext. */
  readonly topicCalls: () => Array<{ topic: string; context: AiGenerationContext }>;
  /** Die gestellten Satzanfragen mit ihrem Kontext. */
  readonly sentenceCalls: () => Array<{
    request: AlternativeSentenceRequest;
    context: AiGenerationContext;
  }>;
  /** Die gestellten Empfehlungsanfragen mit ihrem Kontext. */
  readonly textCalls: () => Array<{
    candidates: readonly AiTextCandidate[];
    context: AiGenerationContext;
  }>;
}

export function createFakeAiProvider(options: FakeAiOptions = {}): FakeAiHandle {
  const {
    availability = 'downloadable',
    partOfSpeech = 'adjective',
    difficulty = 3,
    topicTags = ['city'],
    failFor = [],
    progress = [0.4, 1],
    gatePrepare = false,
    prepareFails = false,
    topicAvailability = availability,
    topicFailsOnce = false,
    sentenceAvailability = availability,
    sentenceFailsOnce = false,
    textAvailability = availability,
    textFailsOnce = false,
    sentenceFor = (request: AlternativeSentenceRequest) => ({
      english: `They often ${request.english.replace(/^to /, '')} here.`,
      german: 'Ein deutscher Beispielsatz.',
    }),
    recommendationsFor = (candidates: readonly AiTextCandidate[]) =>
      candidates.filter((_, index) => index % 2 === 0).map((candidate) => ({ key: candidate.key })),
    topicEntries = (topic: string, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        english: `${topic.toLowerCase().replace(/\s+/g, '-')}-word${index + 1}`,
        germanAnswers: [`Wort ${index + 1}`],
        partOfSpeech: 'noun' as const,
        difficulty: 3,
        topicTags: [topic],
        exampleSentences: [
          {
            english: `This is ${topic.toLowerCase().replace(/\s+/g, '-')}-word${index + 1} in a sentence.`,
            german: `Das ist Wort ${index + 1} in einem Satz.`,
          },
        ],
      })),
  } = options;

  const prepared: AiCapability[] = [];
  const topicCalls: Array<{ topic: string; context: AiGenerationContext }> = [];
  const sentenceCalls: Array<{
    request: AlternativeSentenceRequest;
    context: AiGenerationContext;
  }> = [];
  const textCalls: Array<{
    candidates: readonly AiTextCandidate[];
    context: AiGenerationContext;
  }> = [];
  let topicFailed = false;
  let sentenceFailed = false;
  let textFailed = false;
  const enriched: string[] = [];
  const failed = new Set<string>();
  let prepareCount = 0;
  let ready = false;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  /** Der gemeldete Zustand je Fähigkeit – jede lässt sich einzeln abschalten. */
  function stateFor(capability: AiCapability): ProviderState {
    switch (capability) {
      case 'enrich-entry':
        return availability;
      case 'suggest-from-topic':
        return topicAvailability;
      case 'alternative-sentence':
        return sentenceAvailability;
      case 'suggest-from-text':
        return textAvailability;
      default:
        return 'unavailable';
    }
  }

  const provider: AiProvider = {
    info: {
      id: 'fake-ai',
      label: 'Testsprachmodell',
      dataNotice: 'Testanbieter. Es werden keine Daten übertragen.',
      sendsDataOffDevice: false,
      processing: 'on-device',
    },
    capabilities: () =>
      AI_CAPABILITIES.filter((capability) => stateFor(capability) !== 'unavailable'),
    getAvailability: (capability) => Promise.resolve(stateFor(capability)),
    async prepare(capability, onProgress, signal) {
      prepareCount += 1;
      if (stateFor(capability) === 'unavailable') throw new AiUnavailableError();
      if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      for (const value of progress) onProgress?.(value);
      if (gatePrepare) await gate;
      if (prepareFails) throw new Error('Sprachmodell nicht ladbar.');
      if (!prepared.includes(capability)) prepared.push(capability);
      if (capability === 'enrich-entry') ready = true;
      await Promise.resolve();
    },
    async enrichEntry(entry, context) {
      if (!ready) throw new AiUnavailableError('Das Sprachmodell ist noch nicht geladen.');
      if (context.signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      await Promise.resolve();
      if (failFor.includes(entry.english) && !failed.has(entry.english)) {
        failed.add(entry.english);
        throw new Error('Das Sprachmodell hat nicht geantwortet.');
      }
      enriched.push(entry.english);
      return { ...entry, partOfSpeech, difficulty, topicTags: [...topicTags] };
    },
    async suggestFromText(candidates, context) {
      if (!prepared.includes('suggest-from-text')) {
        throw new AiUnavailableError('Das Sprachmodell ist noch nicht geladen.');
      }
      if (context.signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      textCalls.push({ candidates, context });
      await Promise.resolve();
      if (textFailsOnce && !textFailed) {
        textFailed = true;
        throw new Error('Die Empfehlungsliste war nicht verwertbar.');
      }
      return recommendationsFor(candidates);
    },
    async suggestFromTopic(topic, context) {
      if (!prepared.includes('suggest-from-topic')) {
        throw new AiUnavailableError('Das Sprachmodell ist noch nicht geladen.');
      }
      if (context.signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      topicCalls.push({ topic, context });
      await Promise.resolve();
      if (topicFailsOnce && !topicFailed) {
        topicFailed = true;
        throw new Error('Die Vorschlagsliste war nicht verwertbar.');
      }
      return topicEntries(topic, Math.min(context.maxItems ?? 10, 20));
    },
    async alternativeSentence(request, context) {
      if (!prepared.includes('alternative-sentence')) {
        throw new AiUnavailableError('Das Sprachmodell ist noch nicht geladen.');
      }
      if (context.signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      sentenceCalls.push({ request, context });
      await Promise.resolve();
      if (sentenceFailsOnce && !sentenceFailed) {
        sentenceFailed = true;
        throw new Error('Der Satzvorschlag war nicht verwertbar.');
      }
      return sentenceFor(request);
    },
    destroy() {
      ready = false;
    },
  };

  return {
    provider,
    enriched,
    prepareCount: () => prepareCount,
    releasePrepare: () => release(),
    prepared: () => [...prepared],
    topicCalls: () => [...topicCalls],
    sentenceCalls: () => [...sentenceCalls],
    textCalls: () => [...textCalls],
  };
}
