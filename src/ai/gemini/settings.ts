import { DEFAULT_GEMINI_MODEL, isPlausibleModelId } from './endpoint';

/**
 * Die Einstellung, die keine Geheimnis ist: das Modell.
 *
 * Sie liegt in `localStorage` und darf das, weil sie nichts verrät – eine
 * Modellkennung ist eine Kostenentscheidung, kein Zugang. Der Schlüssel liegt
 * anderswo und unter anderen Regeln (`credentials.ts`).
 *
 * Gelesen wird mit Argwohn: Was aus dem Speicher kommt, kann von einer älteren
 * Fassung stammen, von Hand geändert worden sein oder gar nicht mehr existieren.
 * Ein unplausibler Wert wird deshalb nicht durchgereicht, sondern ersetzt –
 * sonst stünde in der Auswahlliste ein Eintrag, den niemand angelegt hat.
 */

const MODEL_KEY = 'lexiflow.gemini.model';

export function loadModel(): string {
  try {
    const stored = window.localStorage.getItem(MODEL_KEY);
    if (stored && isPlausibleModelId(stored)) return stored.trim();
  } catch {
    /* Privates Fenster oder gesperrter Speicher – dann eben die Voreinstellung. */
  }
  return DEFAULT_GEMINI_MODEL;
}

export function saveModel(model: string): string {
  const gewaehlt = isPlausibleModelId(model) ? model.trim() : DEFAULT_GEMINI_MODEL;
  try {
    window.localStorage.setItem(MODEL_KEY, gewaehlt);
  } catch {
    /* Ohne Speicher gilt die Wahl für diese Sitzung. */
  }
  return gewaehlt;
}

/** Für Tests und für „Zugangsdaten vergessen“, wenn alles weg soll. */
export function forgetModel(): void {
  try {
    window.localStorage.removeItem(MODEL_KEY);
  } catch {
    /* Nichts zu entfernen. */
  }
}
