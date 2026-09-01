import type { DictionaryEntry, DictionaryProvider } from '../dictionary/DictionaryProvider';
import { isQuestionable } from '../dictionary/ranking';

/**
 * Wörterbuchtreffer für die Kandidatenprüfung aufbereiten.
 *
 * Bewusst ohne React: Was hier steht, ist die Entscheidung darüber, *was* ein
 * Vorschlag ist und *ob* er eindeutig genug für eine Sammelübernahme ist. Diese
 * Entscheidung soll prüfbar sein, ohne eine Oberfläche zu rendern.
 *
 * Der Grundsatz über allem: Ein Wörterbuchtreffer ist ein **Vorschlag**. Er
 * wird nie automatisch zur Antwort, er überschreibt nie etwas Getipptes und er
 * verdrängt nie einen deterministischen Abkürzungsvorschlag.
 */

/** Wie viele Bedeutungen zunächst sichtbar sind, bevor aufgeklappt wird. */
export const VISIBLE_SENSE_LIMIT = 3;

export interface DictionarySuggestionSummary {
  /** Die Antwort, die vorgeschlagen wird – die erste der besten Bedeutung. */
  primary: string;
  /** Alle Treffer, nach Wortart getrennt, in der Rangfolge des Providers. */
  entries: readonly DictionaryEntry[];
  /** Wie viele Bedeutungen es insgesamt gibt (über alle Wortarten). */
  senseCount: number;
  /**
   * Eindeutig heißt: genau eine Wortart, genau eine Bedeutung, und deren beste
   * Übersetzung trägt keine Markierung. Nur solche Zeilen kommen für die
   * Sammelaktion infrage – alles andere verlangt einen Blick.
   */
  unambiguous: boolean;
  /** Trägt der beste Vorschlag nur Zweifelhaftes (veraltet, sehr fachlich)? */
  questionable: boolean;
  /** Über welche Form gefunden wurde, falls nicht das Stichwort selbst. */
  viaLemma?: string;
  /** Aus welchem anderen Stichwort die beste Bedeutung stammt. */
  viaHeadword?: string;
}

export function summarizeLookup(
  entries: readonly DictionaryEntry[],
): DictionarySuggestionSummary | undefined {
  const usable = entries.filter((entry) => entry.senses.some((sense) => sense.suggestions.length));
  if (!usable.length) return undefined;

  const best = usable[0];
  const bestSense = best?.senses.find((sense) => sense.suggestions.length);
  const primary = bestSense?.suggestions[0]?.german;
  if (!best || !bestSense || !primary) return undefined;

  const senseCount = usable.reduce((sum, entry) => sum + entry.senses.length, 0);

  return {
    primary,
    entries: usable,
    senseCount,
    unambiguous:
      usable.length === 1 &&
      senseCount === 1 &&
      !bestSense.via &&
      !isQuestionable(bestSense) &&
      bestSense.suggestions.length === 1,
    questionable: isQuestionable(bestSense),
    ...(best.quality === 'lemma' ? { viaLemma: best.lemma } : {}),
    ...(bestSense.via ? { viaHeadword: bestSense.via } : {}),
  };
}

/** Die Zeile, so weit dieses Modul sie kennen muss. */
export interface EnrichableRow {
  /** Was die Lehrkraft getippt hat. Nicht leer heißt: Finger weg. */
  german: string;
  /** Woher ein bereits vorhandener Vorschlag stammt. */
  suggestionSource?: 'local' | 'model' | 'dictionary' | undefined;
}

/**
 * Darf diese Zeile einen Wörterbuchvorschlag bekommen?
 *
 * Zwei Dinge sind tabu: eine Antwort, die jemand geschrieben hat, und ein
 * Abkürzungsvorschlag aus dem lokalen Lexikon. Letzterer ist deterministisch
 * aus dem Text hergeleitet – das Wörterbuch weiß über diese Abkürzung nichts
 * Besseres und soll sie nicht verdrängen.
 */
export function mayReceiveDictionarySuggestion(row: EnrichableRow): boolean {
  if (row.german.trim().length > 0) return false;
  if (row.suggestionSource === 'local') return false;
  return true;
}

/**
 * Wörter derselben Familie doppelt vorzuschlagen ist Reibung ohne Nutzen.
 *
 * Führen zwei Kandidaten auf dieselbe Grundform (`island` und `islands`), dann
 * bekommt der erste den Vorschlag und der zweite die Notiz, zu welcher Familie
 * er gehört. Entfernt wird nichts – welche Form im Paket landet, entscheidet
 * die Lehrkraft, nicht dieses Modul.
 */
export function familyKeyOf(summary: DictionarySuggestionSummary | undefined): string | undefined {
  const head = summary?.entries[0]?.headword;
  return head ? head.toLowerCase() : undefined;
}

export interface EnrichmentResult<Row> {
  rows: Row[];
  /** Wie viele Zeilen einen Vorschlag bekommen haben. */
  filled: number;
  /** Wie viele davon eindeutig sind – die Zahl für die Sammelaktion. */
  unambiguous: number;
  /** Wie viele Zeilen übersprungen wurden, weil dort schon etwas stand. */
  skipped: number;
}

/**
 * Schlägt für alle Zeilen nach, die einen Vorschlag vertragen.
 *
 * Ein Fehler des Anbieters beendet den Durchgang **nicht**: Die betroffene
 * Zeile bleibt ohne Vorschlag, alle anderen bekommen ihren. Eine Textanalyse,
 * die an einem kaputten Wörterbuchfach scheitert, wäre schlechter als eine
 * ohne Wörterbuch.
 */
export async function enrichWithDictionary<Row extends EnrichableRow>(
  rows: readonly Row[],
  lookupKeyOf: (row: Row) => string,
  provider: DictionaryProvider,
  apply: (row: Row, summary: DictionarySuggestionSummary, family: string | undefined) => Row,
): Promise<EnrichmentResult<Row>> {
  const seenFamilies = new Set<string>();
  const result: Row[] = [];
  let filled = 0;
  let unambiguous = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!mayReceiveDictionarySuggestion(row)) {
      skipped += 1;
      result.push(row);
      continue;
    }

    let summary: DictionarySuggestionSummary | undefined;
    try {
      summary = summarizeLookup(await provider.lookup(lookupKeyOf(row)));
    } catch {
      summary = undefined;
    }

    if (!summary) {
      result.push(row);
      continue;
    }

    const family = familyKeyOf(summary);
    const duplicate = family && seenFamilies.has(family) ? family : undefined;
    if (family) seenFamilies.add(family);

    filled += 1;
    if (summary.unambiguous) unambiguous += 1;
    result.push(apply(row, summary, duplicate));
  }

  return { rows: result, filled, unambiguous, skipped };
}

/* ------------------------------------------------- Sichere Sammelübernahme */

/** Wie viele echte Synonyme höchstens automatisch eingetragen werden. */
export const MAX_AUTO_SYNONYMS = 2;

/**
 * Die Antwort, die sich **ohne Rückfrage** eintragen lässt – oder gar keine.
 *
 * Die Sammelaktion „Übersetzungsvorschläge eintragen“ ist bequem und deshalb
 * gefährlich: Sie schreibt in Felder, die hinterher niemand mehr einzeln
 * ansieht. Vier Regeln, jede an einem echten Beispiel entstanden:
 *
 * 1. **Nie über Bedeutungen hinweg verbinden.** `casualty` heißt *Unfall*
 *    **oder** *Notaufnahme* **oder** *Opfer*. „Unfall, Notaufnahme“ wäre kein
 *    Synonympaar, sondern das Zusammenrühren zweier Begriffe. Genommen wird
 *    ausschließlich die bestbewertete Bedeutungsgruppe.
 *
 * 2. **Zwei Entsprechungen sind Alternativen, drei sind eine Aufzählung.**
 *    Nennt die Quelle für *eine* Bedeutung genau zwei deutsche Wörter, sind das
 *    Varianten desselben Begriffs (`station` → *Bahnhof, Station*). Nennt sie
 *    drei oder mehr, ist die erste das Stichwort und der Rest Verwandtschaft:
 *    `limestone` liefert *Kalkstein, Calciumcarbonat, Kalk* – und
 *    Calciumcarbonat ist keine zweite Übersetzung, sondern ein anderer Stoff.
 *    Ab drei wird deshalb nur die erste übernommen.
 *
 * 3. **Nichts Markiertes.** Veraltet, umgangssprachlich, derb, mit
 *    Klammerbedingung – all das bleibt sichtbar, wird aber nie automatisch zur
 *    Antwort. `shell shock` liefert nur den veralteten *Kriegszitterer*; das
 *    Feld bleibt leer.
 *
 * 4. **Kein erschlossener Verweis als Standardantwort.** Eine `via`-Bedeutung
 *    ist eine Schlussfolgerung, keine Auskunft. `doctor` bekommt automatisch
 *    *Doktor* (die eigene, bestplatzierte Bedeutung); *Arzt* über `physician`
 *    bleibt als sichtbarer Ein-Klick-Vorschlag daneben stehen.
 *
 * Im Zweifel: gar nichts. Ein leeres Feld ist eine Aufgabe; eine falsche
 * Antwort ist ein Fehler, den jemand später glaubt.
 */
export function safeAutoAnswer(summary: DictionarySuggestionSummary | undefined): string {
  const entries = summary?.entries ?? [];
  if (!entries.length) return '';

  // Regel 1: genau eine Gruppe – die erste mit Inhalt, in der Rangfolge des
  // Providers. Alles Weitere bleibt der Lehrkraft überlassen.
  const sense = entries
    .flatMap((entry) => entry.senses)
    .find((candidate) => candidate.suggestions.length);
  if (!sense) return '';

  // Regel 4: erschlossene Verweise tragen keine Standardantwort.
  if (sense.via) return '';

  // Regel 3: Markiertes und Bedingtes zählt nicht mit.
  const safe = sense.suggestions.filter(
    (suggestion) => !suggestion.register?.length && !suggestion.qualifier,
  );
  if (!safe.length || isQuestionable(sense)) return '';

  // Regel 2: eins, zwei – oder bei dreien nur das erste.
  const take = safe.length <= MAX_AUTO_SYNONYMS ? safe.length : 1;
  return safe
    .slice(0, take)
    .map((suggestion) => suggestion.german)
    .join(', ');
}
