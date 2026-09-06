import type { ProviderState } from '../../providers/state';
import {
  MAX_CONTEXT_CANDIDATES,
  type AiCapability,
  type AiGenerationContext,
  type AiProvider,
  type AiSentenceSuggestion,
  type AiTextCandidate,
  type AiTextRecommendation,
  type AiVocabSuggestion,
  type AlternativeSentenceRequest,
} from '../AiProvider';
import type { ApiKey } from './credentials';
import { MAX_ITEMS, type GeminiCapability } from './capabilities';
import { DEFAULT_GEMINI_MODEL } from './endpoint';
import { asGeminiError, errorForStatus, geminiError } from './errors';
import { markSuggestion, type WithProvenance } from './provenance';
import {
  enrichRequest,
  recommendRequest,
  reviewRequest,
  sentencesRequest,
  simplifyRequest,
  topicRequest,
  translateRequest,
  type EnrichInput,
  type GeminiBody,
  type ReviewInput,
  type SentencesInput,
  type TranslateInput,
} from './request';
import {
  enrichResponse,
  geminiEnvelope,
  recommendResponse,
  reviewResponse,
  sentencesResponse,
  singleSentenceResponse,
  topicResponse,
  translateResponse,
  type ReviewResponse,
  type TranslateResponse,
} from './schemas';
import { createFetchTransport, type GeminiTransport } from './transport';

/**
 * Der Anbieter – die Stelle, an der aus einem Klick eine Anfrage wird.
 *
 * ## Er ersetzt nichts
 *
 * LexiFlow bleibt vollständig ohne Gemini benutzbar. Die Reihenfolge, in der
 * eine Antwort gesucht wird, ändert sich durch diese Datei nicht: zuerst das
 * Offline-Wörterbuch und die deterministischen lokalen Regeln, dann optional
 * ein lokales Browsermodell, und erst danach – nur auf ausdrückliches Auslösen –
 * dieser Anbieter. Wer ihn nicht einrichtet, merkt an keiner Stelle, dass es
 * ihn gibt.
 *
 * ## Ohne Klick passiert nichts
 *
 * `getAvailability` ruft **nicht** ins Netz. Das ist die wichtigste Zeile in
 * dieser Datei: Ein Verfügbarkeitstest, der eine Anfrage schickt, wird beim
 * Öffnen jeder Seite ausgelöst, kostet Geld und macht die Zusage „nur nach
 * ausdrücklicher Handlung" zur Lüge. Ob ein Schlüssel eingetragen ist, sagt
 * ein Blick in den Speicher; ob er gilt, sagt der Knopf „Verbindung testen".
 *
 * `prepare` ist ebenfalls leer und darf das sein: Hier ist nichts
 * herunterzuladen. Die Methode gibt es nur, weil die Schnittstelle sie kennt.
 *
 * ## Der Schlüssel wird nicht gehalten
 *
 * Der Anbieter bekommt keinen Schlüssel, sondern eine Funktion, die ihn liefert
 * (`getKey`). Ein festgehaltener Schlüssel überlebte ein „Zugangsdaten
 * vergessen" in jedem Anbieterobjekt, das gerade irgendwo in einem React-Zustand
 * hängt. So wirkt das Vergessen sofort und überall.
 */

export interface GeminiProviderOptions {
  /** Liefert den aktuellen Schlüssel – oder nichts, wenn keiner eingetragen ist. */
  getKey: () => ApiKey | undefined;
  /** Liefert die aktuell gewählte Modellkennung. */
  getModel?: () => string;
  /** Einsteckbar für Tests. In der App der echte `fetch`-Transport. */
  transport?: GeminiTransport;
}

export const GEMINI_NOTICE =
  'Gemini ist ein Online-Dienst von Google. Ausgewählte Inhalte verlassen dein Gerät und werden an Google übertragen. Es gelten die Kontingente und gegebenenfalls die Kosten deines Google-Kontos.';

/** Die Fähigkeiten der bestehenden Schnittstelle, die dieser Anbieter bedient. */
export const SUPPORTED_CAPABILITIES: readonly AiCapability[] = [
  'suggest-from-text',
  'suggest-from-topic',
  'enrich-entry',
  'alternative-sentence',
];

/**
 * Zusätzlich zu `AiProvider`: die Fähigkeiten, für die es in der bestehenden
 * Schnittstelle keinen Platz gibt.
 *
 * Übersetzung, Satzvereinfachung und Lernformprüfung bekommen eigene Methoden
 * statt einer aufgebohrten `AiProvider`-Schnittstelle. Der Grund ist nicht
 * Ordnungsliebe: `AiProvider` beschreibt, was ein **lokales** Modell kann, und
 * `nullAiProvider` sowie der Chrome-Anbieter müssten jede neue Methode
 * mitimplementieren, ohne sie je zu erfüllen.
 */
export interface GeminiAssistant extends AiProvider {
  /** Prüft den Schlüssel – die einzige Anfrage, die kein Material überträgt. */
  testConnection(signal?: AbortSignal): Promise<void>;
  translateEntry(
    input: TranslateInput,
    context: AiGenerationContext,
  ): Promise<WithProvenance<TranslateResponse['translations']>>;
  suggestSentences(
    input: SentencesInput,
    context: AiGenerationContext,
  ): Promise<WithProvenance<AiSentenceSuggestion[]>>;
  simplifySentence(
    sentence: string,
    context: AiGenerationContext,
  ): Promise<WithProvenance<AiSentenceSuggestion>>;
  reviewLearningForm(input: ReviewInput): Promise<WithProvenance<ReviewResponse>>;
}

/**
 * Holt den JSON-Text aus der Gemini-Hülle.
 *
 * `finishReason` wird ausgewertet: `MAX_TOKENS` liefert gültiges JSON von
 * Gemini mit abgeschnittenem JSON darin, und ein Sicherheitsstopp liefert eine
 * Antwort ganz ohne Teile. Beides sähe ohne diese Prüfung wie „kaputtes JSON"
 * aus – und man suchte den Fehler im Schema statt in der Länge.
 */
function extractJsonText(raw: string): string {
  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw geminiError('bad-response');
  }

  const parsed = geminiEnvelope.safeParse(envelope);
  if (!parsed.success) throw geminiError('bad-response');

  if (parsed.data.promptFeedback?.blockReason) throw geminiError('blocked');

  const candidate = parsed.data.candidates?.[0];
  if (!candidate) throw geminiError('blocked');

  const reason = candidate.finishReason;
  if (reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT' || reason === 'BLOCKLIST') {
    throw geminiError('blocked');
  }
  if (reason === 'MAX_TOKENS') throw geminiError('bad-response');

  const text = candidate.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  if (!text.trim()) throw geminiError('bad-response');
  return text;
}

export function createGeminiAiProvider(options: GeminiProviderOptions): GeminiAssistant {
  const transport = options.transport ?? createFetchTransport();
  const model = (): string => options.getModel?.() ?? DEFAULT_GEMINI_MODEL;

  /**
   * Eine Anfrage, von Anfang bis Ende.
   *
   * Die Reihenfolge ist Absicht: erst der Schlüssel (ohne ihn wird gar nichts
   * gebaut, also entsteht auch kein Prompt, der irgendwo landen könnte), dann
   * der Abbruchwunsch, dann das Netz, dann die Statusprüfung, dann die Hülle,
   * dann das Schema. Jede Stufe wirft, keine repariert.
   */
  async function ask<T>(
    capability: GeminiCapability,
    build: () => GeminiBody,
    schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
    signal?: AbortSignal,
  ): Promise<WithProvenance<T>> {
    const key = options.getKey();
    if (!key) throw geminiError('no-key');
    if (signal?.aborted) throw geminiError('aborted');

    const verwendetesModell = model();

    let response;
    try {
      response = await transport(
        { model: verwendetesModell, body: build(), ...(signal ? { signal } : {}) },
        key,
      );
    } catch (error: unknown) {
      throw asGeminiError(error);
    }

    if (response.status !== 200) {
      // Der Rumpf geht hier hinein und nie wieder heraus – siehe `errors.ts`.
      throw errorForStatus(response.status, response.text);
    }

    const jsonText = extractJsonText(response.text);
    let payload: unknown;
    try {
      payload = JSON.parse(jsonText);
    } catch {
      throw geminiError('bad-response');
    }

    const checked = schema.safeParse(payload);
    if (!checked.success) {
      /*
        Nichts teilweise übernehmen. Eine halb gültige Vorschlagsliste ist
        schlimmer als keine: Sie sieht vollständig aus.
      */
      throw geminiError('bad-response');
    }

    return markSuggestion(checked.data as T, capability, verwendetesModell);
  }

  return {
    info: {
      id: 'gemini',
      label: 'Google Gemini (online)',
      dataNotice: GEMINI_NOTICE,
      sendsDataOffDevice: true,
      processing: 'external',
    },

    capabilities: () => [...SUPPORTED_CAPABILITIES],

    /**
     * Ohne Netz. Eingerichtet heißt: Es liegt ein Schlüssel vor. Ob er gilt,
     * beantwortet „Verbindung testen" – auf Klick.
     */
    getAvailability(capability: AiCapability): Promise<ProviderState> {
      if (!SUPPORTED_CAPABILITIES.includes(capability)) return Promise.resolve('unavailable');
      return Promise.resolve(options.getKey() ? 'available' : 'unavailable');
    },

    /** Nichts herunterzuladen, nichts vorzubereiten – und ausdrücklich kein Aufruf. */
    prepare(capability: AiCapability): Promise<void> {
      if (!SUPPORTED_CAPABILITIES.includes(capability)) {
        return Promise.reject(geminiError('bad-request'));
      }
      return Promise.resolve();
    },

    async testConnection(signal?: AbortSignal): Promise<void> {
      /*
        Der Test überträgt kein Material: eine Lernform, die in jedem Wörterbuch
        steht, und sonst nichts. Er soll den Schlüssel prüfen, nicht nebenbei
        einen Schülertext verschicken.
      */
      await ask(
        'review-learning-form',
        () => reviewRequest({ english: 'house', partOfSpeech: 'noun' }),
        reviewResponse,
        signal,
      );
    },

    async translateEntry(input, context) {
      const result = await ask<TranslateResponse>(
        'translate-entry',
        () => translateRequest(input, context),
        translateResponse,
        context.signal,
      );
      return { value: result.value.translations, provenance: result.provenance };
    },

    async suggestSentences(input, context) {
      const wanted = Math.min(context.maxItems ?? 3, MAX_ITEMS['suggest-example-sentences']);
      const result = await ask<{ sentences: Array<{ english: string; german?: string }> }>(
        'suggest-example-sentences',
        () => sentencesRequest(input, context),
        sentencesResponse,
        context.signal,
      );
      return {
        value: result.value.sentences.slice(0, wanted).map((sentence) => ({
          english: sentence.english,
          ...(sentence.german ? { german: sentence.german } : {}),
        })),
        provenance: result.provenance,
      };
    },

    async simplifySentence(sentence, context) {
      const result = await ask<{ english: string; german?: string }>(
        'simplify-example-sentence',
        () => simplifyRequest(sentence, context),
        singleSentenceResponse,
        context.signal,
      );
      return {
        value: {
          english: result.value.english,
          ...(result.value.german ? { german: result.value.german } : {}),
        },
        provenance: result.provenance,
      };
    },

    async reviewLearningForm(input) {
      /*
        Auch ein `ok` bleibt ein Vorschlag: `markSuggestion` vergibt
        `ungeprueft`, und nur eine Lehrkraft kann daraus etwas anderes machen.
        Eine grammatische Lernform gilt nicht als richtig, weil ein Modell das
        gesagt hat.
      */
      const result = await ask<ReviewResponse>(
        'review-learning-form',
        () => reviewRequest(input),
        reviewResponse,
        undefined,
      );
      return result;
    },

    // -----------------------------------------------------------------------
    // Die vier Methoden der bestehenden Schnittstelle
    // -----------------------------------------------------------------------
    /*
      Sie geben blanke Werte zurück, weil die vorhandenen Ansichten das so
      erwarten. Der Herkunftsvermerk entsteht trotzdem – er wird hier nur noch
      nicht weitergereicht. Das Anzeigen und Festhalten in der Oberfläche gehört
      zum nächsten Schritt; solange es fehlt, ist an keiner Stelle ein
      Gemini-Vorschlag als geprüft markiert.
    */

    async suggestFromText(
      candidates: readonly AiTextCandidate[],
      context: AiGenerationContext,
    ): Promise<AiTextRecommendation[]> {
      // **Eine** Kandidatenmenge für Anfrage und Prüfung: Würde die Anfrage
      // gekürzt und gegen die volle Liste geprüft, wäre ein Schlüssel gültig,
      // den das Modell nie gesehen hat.
      const limited = candidates.slice(0, MAX_CONTEXT_CANDIDATES);
      const result = await ask<{ recommendedKeys: string[] }>(
        'recommend-from-text',
        () => recommendRequest(limited, context),
        recommendResponse,
        context.signal,
      );

      const known = new Set(limited.map((candidate) => candidate.key));
      const seen = new Set<string>();
      const recommendations: AiTextRecommendation[] = [];
      for (const key of result.value.recommendedKeys) {
        if (!known.has(key) || seen.has(key)) continue;
        seen.add(key);
        recommendations.push({ key });
      }
      return recommendations;
    },

    async suggestFromTopic(
      topic: string,
      context: AiGenerationContext,
    ): Promise<AiVocabSuggestion[]> {
      const wanted = Math.min(context.maxItems ?? 10, MAX_ITEMS['suggest-from-topic']);
      const result = await ask<{
        entries: Array<{
          english: string;
          germanAnswers: string[];
          partOfSpeech: AiVocabSuggestion['partOfSpeech'];
          difficulty: number;
          topicTags: string[];
          exampleSentence?: { english: string; german?: string };
        }>;
      }>('suggest-from-topic', () => topicRequest(topic, context), topicResponse, context.signal);

      return result.value.entries.slice(0, wanted).map((entry) => ({
        english: entry.english,
        germanAnswers: entry.germanAnswers,
        ...(entry.partOfSpeech ? { partOfSpeech: entry.partOfSpeech } : {}),
        difficulty: entry.difficulty,
        topicTags: entry.topicTags,
        ...(entry.exampleSentence
          ? {
              exampleSentences: [
                {
                  english: entry.exampleSentence.english,
                  ...(entry.exampleSentence.german ? { german: entry.exampleSentence.german } : {}),
                },
              ],
            }
          : {}),
      }));
    },

    async enrichEntry(
      entry: AiVocabSuggestion,
      context: AiGenerationContext,
    ): Promise<AiVocabSuggestion> {
      const satz = entry.exampleSentences?.[0]?.english;
      const input: EnrichInput = {
        english: entry.english,
        germanAnswers: entry.germanAnswers,
        ...(satz ? { sentence: satz } : {}),
      };
      const result = await ask<{
        partOfSpeech: NonNullable<AiVocabSuggestion['partOfSpeech']>;
        difficulty: number;
        topicTags: string[];
      }>('enrich-entry', () => enrichRequest(input, context), enrichResponse, context.signal);

      /*
        Ergänzen heißt ergänzen: Der vorhandene Eintrag bleibt, und nur die drei
        Felder dieser Fähigkeit kommen hinzu. Nichts, was jemand von Hand
        eingetragen hat, wird hier überschrieben – das entscheidet die Ansicht,
        die den Vorschlag anzeigt.
      */
      return {
        ...entry,
        partOfSpeech: result.value.partOfSpeech,
        difficulty: result.value.difficulty,
        topicTags: result.value.topicTags,
      };
    },

    async alternativeSentence(
      request: AlternativeSentenceRequest,
      context: AiGenerationContext,
    ): Promise<AiSentenceSuggestion> {
      /*
        „Einfacher" ist eine eigene Fähigkeit mit eigenem Datenumfang: Sie
        sendet genau den einen Satz und sonst nichts. Deshalb hier die
        Fallunterscheidung und nicht ein Prompt mit drei Verzweigungen.
      */
      if (request.mode === 'simpler' && request.existingSentences.length > 0) {
        const vorlage = request.existingSentences[0] ?? '';
        const result = await ask<{ english: string; german?: string }>(
          'simplify-example-sentence',
          () => simplifyRequest(vorlage, context),
          singleSentenceResponse,
          context.signal,
        );
        return {
          english: result.value.english,
          ...(result.value.german ? { german: result.value.german } : {}),
        };
      }

      const input: SentencesInput = {
        english: request.english,
        germanAnswers: request.germanAnswers,
        ...(request.partOfSpeech ? { partOfSpeech: request.partOfSpeech } : {}),
        existingSentences: request.existingSentences,
      };
      const result = await ask<{ sentences: Array<{ english: string; german?: string }> }>(
        'suggest-example-sentences',
        () => sentencesRequest(input, { ...context, maxItems: 1 }),
        sentencesResponse,
        context.signal,
      );

      const first = result.value.sentences[0];
      if (!first) throw geminiError('bad-response');
      return { english: first.english, ...(first.german ? { german: first.german } : {}) };
    },
  };
}
