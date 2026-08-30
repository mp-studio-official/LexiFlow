import type { ProviderState } from '../providers/state';

/**
 * Übersetzung ist eine eigene Fähigkeit – nicht dasselbe wie freie
 * Textgenerierung. Deshalb hat sie eine eigene, schmale Schnittstelle, die
 * unabhängig von `AiProvider` ausgetauscht werden kann.
 *
 * Ein Anbieter darf niemals selbst `fetch` aufrufen. Verarbeitet er Daten
 * außerhalb des Geräts, muss er das über `sendsDataOffDevice` offenlegen; die
 * Oberfläche zeigt diesen Hinweis vor der ersten Nutzung.
 */
export interface TranslationProviderInfo {
  id: string;
  label: string;
  /** Ehrlicher Satz darüber, wohin die Daten gehen. */
  dataNotice: string;
  sendsDataOffDevice: boolean;
}

export interface TranslationProvider {
  readonly info: TranslationProviderInfo;
  getAvailability(sourceLanguage: string, targetLanguage: string): Promise<ProviderState>;
  /** Lädt bzw. initialisiert das Modell – nur nach ausdrücklicher Auslösung. */
  prepare(
    sourceLanguage: string,
    targetLanguage: string,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  translate(text: string, signal?: AbortSignal): Promise<string>;
  destroy?(): void;
}

export class TranslationUnavailableError extends Error {
  constructor(message = 'Es ist keine lokale Übersetzung verfügbar.') {
    super(message);
    this.name = 'TranslationUnavailableError';
  }
}

export class TranslationAbortedError extends Error {
  constructor(message = 'Die Übersetzung wurde abgebrochen.') {
    super(message);
    this.name = 'TranslationAbortedError';
  }
}

/**
 * Standardanbieter: übersetzt nichts und sagt das ehrlich. Damit bleibt die
 * gesamte Textwerkstatt ohne jede Übersetzungs-API benutzbar.
 */
export const nullTranslationProvider: TranslationProvider = {
  info: {
    id: 'null',
    label: 'Keine automatische Übersetzung',
    dataNotice: 'Es werden keine Daten übertragen. Übersetzungen gibst du selbst ein.',
    sendsDataOffDevice: false,
  },
  getAvailability: () => Promise.resolve('unavailable'),
  prepare: () => Promise.reject(new TranslationUnavailableError()),
  translate: () => Promise.reject(new TranslationUnavailableError()),
};
