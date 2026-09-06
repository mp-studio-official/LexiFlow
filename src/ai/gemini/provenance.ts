import { GEMINI_CAPABILITY_LABELS, type GeminiCapability } from './capabilities';

/**
 * Woher ein Vorschlag kommt – und warum das nicht im Lernpaket landet.
 *
 * ## Der Zustand, den es zu verhindern gilt
 *
 * Eine Vokabelliste, in der zwanzig Einträge stehen und niemand mehr sagen
 * kann, welche davon jemand geprüft hat. Das passiert nicht durch Nachlässig-
 * keit, sondern durch Zeit: Wer eine Liste am Montag erzeugt und am Freitag
 * exportiert, erinnert sich nicht mehr. Deshalb trägt **jeder** Vorschlag
 * seinen Zustand mit sich, und der Anfangszustand ist `ungeprüft`.
 *
 * ## Warum es kein „sicher" gibt
 *
 * Auch ein Modell, das eine Lernform für richtig hält, hat sie nicht geprüft –
 * es hat sie für wahrscheinlich gehalten. Ein Befund `ok` von Gemini wird
 * deshalb nicht zu einem Häkchen: Er wird als Vorschlag angezeigt, und erst die
 * Übernahme durch eine Lehrkraft macht `uebernommen` daraus. Das ist derselbe
 * Grundsatz wie bei den Kognaten, wo ein Wörterbuchbeleg zählt und eine
 * Vermutung nicht.
 *
 * ## Warum die Herkunft im Lehrkraftbereich bleibt
 *
 * Die Herkunft ist ein Arbeitsvermerk. Sie gehört in die Ansicht, in der
 * entschieden wird, und nicht in die Datei, die Lernende bekommen: Dort wäre
 * sie totes Gewicht, ein Datum ohne Zweck – und die stille Auskunft, wie eine
 * Lehrkraft ihr Material erstellt hat. `stripProvenance` ist die eine Stelle,
 * die sie vor dem Export entfernt; ein Test hält fest, dass in einem
 * ausgegebenen Paket kein Vermerk mehr steckt.
 */

/**
 * Der Lebenslauf eines Vorschlags.
 *
 * `verworfen` wird festgehalten und nicht einfach gelöscht: Wer denselben
 * Vorschlag zweimal ablehnt, soll beim zweiten Mal sehen, dass er ihn schon
 * einmal abgelehnt hat.
 */
export type SuggestionStatus = 'ungeprueft' | 'uebernommen' | 'verworfen';

export const SUGGESTION_STATUS_LABELS: Readonly<Record<SuggestionStatus, string>> = {
  ungeprueft: 'ungeprüft',
  uebernommen: 'übernommen',
  verworfen: 'verworfen',
};

export interface Provenance {
  /** Immer `gemini` – andere Anbieter tragen ihre eigene Kennung. */
  source: 'gemini';
  capability: GeminiCapability;
  /** Die Modellkennung, mit der die Antwort entstand – nicht die aktuell eingestellte. */
  model: string;
  /** Zeitpunkt der Antwort, als ISO-Zeichenkette. */
  at: string;
  status: SuggestionStatus;
}

/** Ein Wert mit Herkunft. Der Wert selbst bleibt unangetastet. */
export interface WithProvenance<T> {
  value: T;
  provenance: Provenance;
}

/**
 * Vermerkt einen frischen Vorschlag – immer als `ungeprueft`.
 *
 * Der Status ist **kein** Parameter. Ein Aufrufer, der `uebernommen` übergeben
 * könnte, würde es irgendwann tun, und dann stünde ein Häkchen an etwas, das
 * niemand angesehen hat.
 */
export function markSuggestion<T>(
  value: T,
  capability: GeminiCapability,
  model: string,
  now: Date = new Date(),
): WithProvenance<T> {
  return {
    value,
    provenance: {
      source: 'gemini',
      capability,
      model,
      at: now.toISOString(),
      status: 'ungeprueft',
    },
  };
}

/** Die Entscheidung der Lehrkraft – die einzige Stelle, die den Status ändert. */
export function decide<T>(
  suggestion: WithProvenance<T>,
  status: Exclude<SuggestionStatus, 'ungeprueft'>,
): WithProvenance<T> {
  return { ...suggestion, provenance: { ...suggestion.provenance, status } };
}

/**
 * Der Satz, der neben einem Vorschlag steht.
 *
 * Er nennt das Modell mit Namen. „Von der KI vorgeschlagen" wäre eine
 * Beruhigung; „Gemini 3.5 Flash-Lite, 14.09.2026, ungeprüft" ist eine Angabe,
 * mit der sich etwas anfangen lässt – etwa die Frage, ob ein Modellwechsel
 * seither etwas verändert hat.
 */
export function describeProvenance(provenance: Provenance): string {
  const zeitpunkt = new Date(provenance.at);
  const datum = Number.isNaN(zeitpunkt.getTime())
    ? 'unbekannt'
    : zeitpunkt.toLocaleDateString('de-DE');
  return `${GEMINI_CAPABILITY_LABELS[provenance.capability]} · ${provenance.model} · ${datum} · ${SUGGESTION_STATUS_LABELS[provenance.status]}`;
}

/**
 * Entfernt jeden Herkunftsvermerk – rekursiv, vor dem Export.
 *
 * Rekursiv und nicht nur eine Ebene tief: Vermerke hängen an Einträgen, an
 * Sätzen innerhalb von Einträgen und an Übersetzungen innerhalb von Sätzen.
 * Eine Fassung, die nur die oberste Ebene räumte, wäre schlimmer als keine –
 * sie sähe aus, als wäre aufgeräumt worden.
 */
export function stripProvenance<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => stripProvenance(item)) as unknown as T;
  }
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;

  const result: Record<string, unknown> = {};
  for (const [schluessel, wert] of Object.entries(value as Record<string, unknown>)) {
    if (schluessel === 'provenance') continue;
    result[schluessel] = stripProvenance(wert);
  }
  return result as T;
}
