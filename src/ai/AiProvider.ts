import type { CefrLevel, Grade } from '../domain/cefr';
import type { ProviderState } from '../providers/state';
import type { PartOfSpeech, SourceType } from '../domain/schema';

/**
 * Austauschbare Schnittstelle für spätere KI-Unterstützung.
 *
 * Sprint 2A ruft bewusst **keinen** Anbieter auf. Der Vertrag ist aber schon
 * auf lokale Browsermodelle ausgelegt, denn die sind nicht einfach „da“:
 *
 * - Verfügbarkeit ist **asynchron** und je Fähigkeit unterschiedlich.
 * - Ein Modell muss oft erst heruntergeladen werden – nur nach ausdrücklicher
 *   Entscheidung, mit echtem Fortschritt und abbrechbar.
 * - Ob lokal oder extern verarbeitet wird, muss der Anbieter offenlegen.
 *
 * Weitere Regeln, die gelten sollen:
 * - Ein Anbieter wird ausschließlich im Lehrkraft-Bereich zur Materialerstellung
 *   genutzt, nie im Schülerbereich und nie mit Lernständen.
 * - Es werden keine personenbezogenen Daten und keine Lernstände übergeben.
 * - Ohne aktiv konfigurierten Anbieter bleibt die App vollständig funktionsfähig.
 */

/** Was ein Anbieter können kann. Übersetzung ist bewusst **nicht** dabei –
 *  dafür gibt es `TranslationProvider`. */
export const AI_CAPABILITIES = [
  'suggest-from-text',
  'suggest-from-topic',
  'enrich-entry',
  'alternative-sentence',
] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];

export const AI_CAPABILITY_LABELS: Readonly<Record<AiCapability, string>> = {
  'suggest-from-text': 'Vokabelvorschläge aus einem Text',
  'suggest-from-topic': 'Vokabelvorschläge zu einem Thema',
  'enrich-entry': 'Eintrag ergänzen (Wortart, Notiz)',
  'alternative-sentence': 'alternativer Beispielsatz',
};

export interface AiVocabSuggestion {
  english: string;
  germanAnswers: string[];
  acceptedEnglishAnswers?: string[];
  partOfSpeech?: PartOfSpeech;
  exampleSentences?: Array<{ english: string; german?: string }>;
  topicTags?: string[];
  notes?: string;
  difficulty?: number;
}

export interface AiGenerationContext {
  grade: Grade;
  cefrLevel: CefrLevel;
  topic?: string;
  /** Bereits vorhandene englische Stichwörter – zur Vermeidung von Dubletten. */
  existingEnglish?: string[];
  maxItems?: number;
  signal?: AbortSignal;
}

export interface AiProviderInfo {
  /** Technische Kennung, z. B. "null", "chrome-prompt", "ollama". */
  id: string;
  /** Anzeigename in der Oberfläche. */
  label: string;
  /** Kurze, ehrliche Beschreibung, wohin Daten gehen. */
  dataNotice: string;
  /** true, wenn der Anbieter Daten das Gerät verlassen lässt. */
  sendsDataOffDevice: boolean;
  /** Wo gerechnet wird – für die Oberfläche wichtiger als der Anbietername. */
  processing: 'on-device' | 'external';
}

export interface AiProvider {
  readonly info: AiProviderInfo;
  /** Welche Fähigkeiten dieser Anbieter grundsätzlich anbietet. */
  capabilities(): readonly AiCapability[];
  /** Zustand je Fähigkeit – asynchron, weil Modelle geprüft werden müssen. */
  getAvailability(capability: AiCapability): Promise<ProviderState>;
  /** Lädt bzw. initialisiert ein Modell. Nur nach ausdrücklicher Auslösung. */
  prepare(
    capability: AiCapability,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<void>;

  suggestFromText(text: string, context: AiGenerationContext): Promise<AiVocabSuggestion[]>;
  suggestFromTopic(topic: string, context: AiGenerationContext): Promise<AiVocabSuggestion[]>;
  enrichEntry(entry: AiVocabSuggestion, context: AiGenerationContext): Promise<AiVocabSuggestion>;
  alternativeSentence(english: string, context: AiGenerationContext): Promise<string>;

  destroy?(): void;
}

export class AiUnavailableError extends Error {
  constructor(message = 'Es ist kein KI-Anbieter eingerichtet.') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/** Standardanbieter: tut nichts und meldet das ehrlich. */
export const nullAiProvider: AiProvider = {
  info: {
    id: 'null',
    label: 'Kein KI-Anbieter',
    dataNotice: 'Es werden keine Daten übertragen. Die App arbeitet vollständig lokal.',
    sendsDataOffDevice: false,
    processing: 'on-device',
  },
  capabilities: () => [],
  getAvailability: () => Promise.resolve('unavailable'),
  prepare: () => Promise.reject(new AiUnavailableError()),
  suggestFromText: () => Promise.reject(new AiUnavailableError()),
  suggestFromTopic: () => Promise.reject(new AiUnavailableError()),
  enrichEntry: () => Promise.reject(new AiUnavailableError()),
  alternativeSentence: () => Promise.reject(new AiUnavailableError()),
};

/** Ordnet eine KI-Quelle dem passenden `sourceType` zu. */
export function sourceTypeForAi(origin: 'topic' | 'text'): SourceType {
  return origin === 'topic' ? 'topic-ai' : 'text-ai';
}
