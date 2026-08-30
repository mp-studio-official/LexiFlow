import type { CefrLevel, Grade } from '../domain/cefr';
import type { PartOfSpeech, SourceType } from '../domain/schema';

/**
 * Austauschbare Schnittstelle für spätere KI-Unterstützung.
 *
 * Sprint 1 ruft bewusst **keinen** Anbieter auf. Die Schnittstelle ist nur
 * vorbereitet, damit später ein Anbieter ergänzt werden kann, ohne die
 * Domänenlogik zu ändern. Regeln, die dabei gelten sollen:
 *
 * - Ein Anbieter wird ausschließlich im Lehrkraft-Bereich zur Materialerstellung
 *   genutzt, nie im Schülerbereich und nie mit Lernständen.
 * - Es werden keine personenbezogenen Daten und keine Lernstände übergeben.
 * - Ohne aktiv konfigurierten Anbieter bleibt die App vollständig funktionsfähig.
 */

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
  /** Technische Kennung, z. B. "null", "local-llm", "hosted". */
  id: string;
  /** Anzeigename in der Oberfläche. */
  label: string;
  /** Kurze, ehrliche Beschreibung, wohin Daten gehen. */
  dataNotice: string;
  /** true, wenn der Anbieter Daten das Gerät verlassen lässt. */
  sendsDataOffDevice: boolean;
}

export interface AiProvider {
  readonly info: AiProviderInfo;
  /** Prüft, ob der Anbieter einsatzbereit konfiguriert ist. */
  isAvailable(): boolean;
  /** Vokabelvorschläge zu einem Thema (`sourceType: 'topic-ai'`). */
  suggestFromTopic(topic: string, context: AiGenerationContext): Promise<AiVocabSuggestion[]>;
  /** Vokabelvorschläge aus einem Text (`sourceType: 'text-ai'`). */
  suggestFromText(text: string, context: AiGenerationContext): Promise<AiVocabSuggestion[]>;
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
  },
  isAvailable: () => false,
  suggestFromTopic: () => Promise.reject(new AiUnavailableError()),
  suggestFromText: () => Promise.reject(new AiUnavailableError()),
};

let currentProvider: AiProvider = nullAiProvider;

export function getAiProvider(): AiProvider {
  return currentProvider;
}

/** Ermöglicht späteres Einhängen eines Anbieters (auch in Tests). */
export function setAiProvider(provider: AiProvider): void {
  currentProvider = provider;
}

/** Ordnet eine KI-Quelle dem passenden `sourceType` zu. */
export function sourceTypeForAi(origin: 'topic' | 'text'): SourceType {
  return origin === 'topic' ? 'topic-ai' : 'text-ai';
}
