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
 * Zwei Eigenschaften machen diesen kleinen Typ nötig:
 *
 * 1. **Kein zweiter `prepare()`-Aufruf.** Die Prüfansicht bekommt die laufende
 *    Zusage gereicht, statt eine eigene zu starten. Ein zweiter Aufruf würde
 *    beim Chrome-Anbieter die erste Instanz verwerfen.
 * 2. **Kein verschluckter Fehler.** Das Ergebnis wird *immer* erfüllt und trägt
 *    den Fehlschlag in sich (`ok: false`). Ein `catch(() => undefined)` würde
 *    den Fehler unsichtbar machen; eine offene Ablehnung würde als „unhandled
 *    rejection“ in der Konsole landen, bevor die Ansicht überhaupt zuhört.
 */

export type PrepareOutcome = { ok: true } | { ok: false; error: unknown };

export interface TranslationPreparation {
  /** Für welchen Anbieter die Zusage gilt – ein Wechsel macht sie ungültig. */
  provider: TranslationProvider;
  /** Erfüllt sich immer; der Fehlschlag steht im Ergebnis. */
  outcome: Promise<PrepareOutcome>;
}

/**
 * Startet `prepare()` **synchron** und verpackt das Ergebnis.
 *
 * Vor dem Aufruf steht bewusst kein `await`: Die User-Activation des Klicks
 * überlebt keinen Wartepunkt.
 */
export function startPreparation(
  provider: TranslationProvider,
  sourceLanguage: string,
  targetLanguage: string,
): TranslationPreparation {
  const outcome = provider.prepare(sourceLanguage, targetLanguage).then(
    (): PrepareOutcome => ({ ok: true }),
    (error: unknown): PrepareOutcome => ({ ok: false, error }),
  );
  return { provider, outcome };
}

/** Eine verständliche Meldung für die Lehrkraft – ohne Stacktrace-Prosa. */
export function describePrepareError(error: unknown): string {
  return error instanceof Error
    ? `Das Sprachmodell konnte nicht geladen werden: ${error.message}`
    : 'Das Sprachmodell konnte nicht geladen werden.';
}
