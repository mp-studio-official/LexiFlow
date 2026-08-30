/**
 * Gemeinsamer Zustand aller lokalen Anbieter (Übersetzung wie später KI).
 *
 * Lokale Browsermodelle sind nicht einfach „da oder nicht da“: Sie müssen oft
 * erst heruntergeladen werden, und das darf nur nach einer bewussten
 * Entscheidung geschehen.
 */
export type ProviderState =
  /** Nicht unterstützt oder für dieses Sprachpaar nicht verfügbar. */
  | 'unavailable'
  /** Verfügbar, muss aber erst heruntergeladen werden. */
  | 'downloadable'
  /** Download bzw. Initialisierung läuft gerade. */
  | 'downloading'
  /** Einsatzbereit. */
  | 'available';

export const PROVIDER_STATE_LABELS: Readonly<Record<ProviderState, string>> = {
  unavailable: 'nicht verfügbar',
  downloadable: 'kann geladen werden',
  downloading: 'wird geladen',
  available: 'bereit',
};
