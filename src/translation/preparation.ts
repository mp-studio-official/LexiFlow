import type { TranslationProvider } from './TranslationProvider';

/**
 * Eine im Klickpfad gestartete Vorbereitung – und ihre Weitergabe.
 *
 * Die Textwerkstatt stößt `prepare()` beim Klick auf „Text analysieren und
 * Übersetzungen vorschlagen“ an, weil nur dort die User-Activation des Browsers
 * gilt, die der Modelldownload verlangt. Die Prüfansicht öffnet sich aber
 * sofort – lange bevor das Modell bereit ist. Beide brauchen deshalb *dieselbe*
 * Zusage: die eine startet sie, die andere wartet auf sie.
 *
 * Vier Eigenschaften machen diesen kleinen Typ nötig:
 *
 * 1. **Kein zweiter `prepare()`-Aufruf.** Die Prüfansicht bekommt die laufende
 *    Zusage gereicht, statt eine eigene zu starten. Ein zweiter Aufruf würde
 *    beim Chrome-Anbieter die erste Instanz verwerfen.
 * 2. **Kein verschluckter Fehler.** Das Ergebnis wird *immer* erfüllt und trägt
 *    den Fehlschlag in sich (`ok: false`). Ein `catch(() => undefined)` würde
 *    den Fehler unsichtbar machen; eine offene Ablehnung würde als „unhandled
 *    rejection“ in der Konsole landen, bevor die Ansicht überhaupt zuhört.
 * 3. **Fortschritt geht nicht verloren.** Der erste Modelldownload kann groß
 *    sein, und er beginnt, bevor die Prüfansicht steht. Der zuletzt gemeldete
 *    Wert wird deshalb aufbewahrt; wer sich später anmeldet, bekommt ihn sofort.
 * 4. **Abbrechen muss wirken.** Der `AbortController` entsteht zusammen mit der
 *    Vorbereitung, nicht erst in der Ansicht. Ohne ihn wäre die sichtbare
 *    Schaltfläche „Abbrechen“ während des Downloads eine Attrappe – und ein
 *    mehrere Gigabyte großer Download liefe unbemerkt weiter.
 */

export type PrepareOutcome =
  | { ok: true }
  | { ok: false; cancelled: boolean; error: unknown };

export interface TranslationPreparation {
  /** Für welchen Anbieter die Zusage gilt – ein Wechsel macht sie ungültig. */
  provider: TranslationProvider;
  /** Erfüllt sich immer; der Fehlschlag steht im Ergebnis. */
  outcome: Promise<PrepareOutcome>;
  /** Zuletzt gemeldeter Fortschritt (0–1) oder `null`. */
  readonly progress: number | null;
  /** `true`, sobald `cancel()` gerufen wurde. */
  readonly cancelled: boolean;
  /** `true`, sobald die Vorbereitung beendet ist – gelungen oder nicht. */
  readonly settled: boolean;
  /**
   * Meldet sich für Fortschritt an und bekommt den zuletzt bekannten Wert
   * **sofort**. Der Rückgabewert meldet wieder ab.
   */
  onProgress(listener: (value: number) => void): () => void;
  /** Bricht den laufenden Modelldownload ab. Mehrfach aufrufbar. */
  cancel(): void;
}

/**
 * Startet `prepare()` **synchron** und macht die laufende Vorbereitung
 * beobachtbar und abbrechbar.
 *
 * Vor dem Aufruf steht bewusst kein `await`: Die User-Activation des Klicks
 * überlebt keinen Wartepunkt.
 */
export function startPreparation(
  provider: TranslationProvider,
  sourceLanguage: string,
  targetLanguage: string,
): TranslationPreparation {
  const controller = new AbortController();
  const listeners = new Set<(value: number) => void>();

  let latest: number | null = null;
  let cancelled = false;
  let settled = false;

  const report = (value: number): void => {
    latest = value;
    for (const listener of listeners) listener(value);
  };

  const outcome = provider
    .prepare(sourceLanguage, targetLanguage, report, controller.signal)
    .then(
      (): PrepareOutcome => {
        settled = true;
        // Ein Anbieter, der das Signal nicht auswertet, darf einen Abbruch
        // nicht doch noch in einen Erfolg verwandeln.
        return cancelled ? { ok: false, cancelled: true, error: undefined } : { ok: true };
      },
      (error: unknown): PrepareOutcome => {
        settled = true;
        return { ok: false, cancelled, error };
      },
    );

  return {
    provider,
    outcome,
    get progress() {
      return latest;
    },
    get cancelled() {
      return cancelled;
    },
    get settled() {
      return settled;
    },
    onProgress(listener) {
      listeners.add(listener);
      if (latest !== null) listener(latest);
      return () => {
        listeners.delete(listener);
      };
    },
    cancel() {
      if (settled) return;
      cancelled = true;
      controller.abort();
    },
  };
}

/** Eine verständliche Meldung für die Lehrkraft – ohne Stacktrace-Prosa. */
export function describePrepareError(error: unknown): string {
  return error instanceof Error
    ? `Das Sprachmodell konnte nicht geladen werden: ${error.message}`
    : 'Das Sprachmodell konnte nicht geladen werden.';
}
