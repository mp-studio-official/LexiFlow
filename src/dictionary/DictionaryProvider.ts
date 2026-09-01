/**
 * Das Offline-Wörterbuch als austauschbarer Anbieter.
 *
 * Dieselbe Idee wie bei Übersetzung und Sprachmodell: Ein Anbieter ist
 * optional, **lokal** und ersetzbar; fehlt er, funktioniert alles Übrige
 * unverändert weiter. Anders als jene beiden ist dieser hier aber der
 * *verlässliche* Weg – er braucht kein Browsermodell, keine Erlaubnis und
 * keinen Download, und er verhält sich in Safari wie in Chrome.
 *
 * Die Schnittstelle kennt **keine** Oberfläche. Sie liefert Daten und eine
 * ehrliche Angabe, wie ein Treffer zustande kam; was davon eine Lehrkraft
 * sieht und was sie übernimmt, entscheidet ausschließlich die Ansicht.
 */

/**
 * Wie ist der Treffer zustande gekommen?
 *
 * Die Unterscheidung ist keine Feinheit: Ein `lemma`-Treffer ist eine
 * Schlussfolgerung („islands ist der Plural von island“), ein `exact`-Treffer
 * eine Auskunft. Wer beides gleich darstellt, verwischt genau die Stelle, an
 * der ein Wörterbuch irren kann.
 */
export type LookupQuality =
  /** Das Stichwort steht so im Wörterbuch. */
  | 'exact'
  /** Gefunden über die Grundform einer Flexionsform. */
  | 'lemma'
  /** Als Mehrwortbegriff gefunden. */
  | 'phrase'
  /** Aus einer Regel entstanden (Abkürzung, Wortform) – nicht aus dem Bestand. */
  | 'rule';

export type Gender = 'm' | 'f' | 'n';

/** Der bestimmte Artikel zum Genus – die Form, in der man es liest. */
export const GENDER_ARTICLES: Readonly<Record<Gender, string>> = {
  m: 'der',
  f: 'die',
  n: 'das',
};

export interface DictionarySuggestion {
  /** Die deutsche Entsprechung, so wie sie eine Lernende lesen würde. */
  german: string;
  gender?: Gender;
  /**
   * Registermarker der Quelle: `dated`, `colloquial`, `vulgar` und Ähnliches.
   * Sie werden angezeigt, nie stillschweigend als beste Antwort gesetzt.
   */
  register?: readonly string[];
  /** Klammerzusatz der Quelle, etwa „gebrannt“ bei „Kalk (gebrannt)“. */
  qualifier?: string;
  multiword?: boolean;
}

export interface DictionarySense {
  /** Die Bedeutungsüberschrift der Quelle, auf Englisch. */
  sense: string;
  suggestions: readonly DictionarySuggestion[];
  /**
   * Gesetzt, wenn diese Bedeutung von einem **anderen** Stichwort stammt –
   * `doctor` bekommt „Arzt“ über `physician`. Das bleibt sichtbar, weil es
   * eine Schlussfolgerung ist und keine Auskunft.
   */
  via?: string;
}

export interface DictionaryEntry {
  /** Das Stichwort in der Schreibung der Quelle. */
  headword: string;
  /** Über welche Form gesucht wurde – bei `lemma` die Grundform. */
  lemma: string;
  partOfSpeech?: string;
  senses: readonly DictionarySense[];
  multiword?: boolean;
  quality: LookupQuality;
  /**
   * Bei `quality: 'lemma'`: **wie** die gesuchte Form mit der Grundform
   * zusammenhängt – `plural`, `past`, `participle`, `alternative` …
   *
   * Der Unterschied ist folgenreich. `wrote → write` ist eine Beugung: Als
   * Vokabel gehört die Grundform ins Paket. `story → storey` ist eine
   * Schreibvariante: Beide sind gleichrangig, und `story` durch `storey` zu
   * ersetzen wäre eine Verschlimmbesserung. Ohne dieses Feld sehen beide Fälle
   * gleich aus.
   */
  formTags?: readonly string[];
  /** Kennung der Quelle, für Anzeige und Nachvollziehbarkeit. */
  source: string;
}

export interface DictionaryLicence {
  name: string;
  url: string;
  hinweis: string;
  rueckverweis: string;
}

export interface DictionaryMeta {
  formatVersion: number;
  shardCount: number;
  quelle: {
    name: string;
    url: string;
    dump: string;
    extraktion: string;
    wiktextract: readonly string[];
    sha256: string;
    pruefsummeHinweis: string;
    werkzeug: string;
  };
  lizenz: DictionaryLicence;
  zahlen: Record<string, number>;
}

export interface DictionaryProvider {
  readonly id: string;
  readonly label: string;
  /** Steht die Quelle in dieser Umgebung überhaupt zur Verfügung? */
  isAvailable(): Promise<boolean>;
  /**
   * Schlägt ein Stichwort nach. Ein leeres Ergebnis heißt schlicht: nicht
   * enthalten – das ist ein normales Ergebnis, kein Fehler.
   */
  lookup(headword: string): Promise<readonly DictionaryEntry[]>;
  /** Quelle und Lizenz, für Anzeige und Export. */
  meta(): Promise<DictionaryMeta | undefined>;
}

/**
 * Kein Wörterbuch.
 *
 * Ein leerer Anbieter statt `null` erspart jedem Aufrufer die
 * Fallunterscheidung – und macht im Test sichtbar, dass „nicht gefunden“ ein
 * normales Ergebnis ist.
 */
export const noDictionary: DictionaryProvider = {
  id: 'none',
  label: 'Kein Wörterbuch',
  async isAvailable() {
    return false;
  },
  async lookup() {
    return [];
  },
  async meta() {
    return undefined;
  },
};
