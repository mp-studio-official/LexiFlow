/**
 * Platz für das Offline-Wörterbuch (Sprint 4A.2).
 *
 * Diese Datei enthält **noch keine Daten** – bewusst: Ein Wörterbuchdatensatz
 * ist der größte Einzelposten, den die portablen Dateien je bekommen werden,
 * und er gehört erst hinein, wenn seine Lizenz, sein Umfang und seine
 * Aufbereitung geklärt sind.
 *
 * Was hier schon steht, ist die Form: dieselbe Provider-Idee wie bei
 * Übersetzung und Sprachmodell. Ein Provider ist austauschbar, optional und
 * **lokal**; fehlt er, funktioniert alles Übrige unverändert weiter.
 */

export interface DictionarySense {
  /** Die deutsche Bedeutung, so wie sie eine Lernende lesen würde. */
  german: string;
  /** Wortart, falls bekannt – für die Auswahl passender Bedeutungen. */
  partOfSpeech?: string;
  /** Beispielsatz aus dem Wörterbuch, falls vorhanden. */
  example?: string;
}

export interface DictionaryEntry {
  headword: string;
  senses: DictionarySense[];
}

export interface DictionaryProvider {
  readonly id: string;
  readonly label: string;
  /** Steht die Quelle in dieser Umgebung überhaupt zur Verfügung? */
  isAvailable(): Promise<boolean>;
  /** Schlägt ein Stichwort nach. `undefined` heißt schlicht: nicht enthalten. */
  lookup(headword: string): Promise<DictionaryEntry | undefined>;
}

/**
 * Der Zustand bis Sprint 4A.2: Es gibt kein Wörterbuch.
 *
 * Ein leerer Provider statt `null` erspart jedem Aufrufer die Fallunterscheidung
 * – und macht im Test sichtbar, dass „nicht gefunden“ ein normales Ergebnis ist
 * und kein Fehler.
 */
export const noDictionary: DictionaryProvider = {
  id: 'none',
  label: 'Kein Wörterbuch',
  async isAvailable() {
    return false;
  },
  async lookup() {
    return undefined;
  },
};
