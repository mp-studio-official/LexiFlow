import type { DictionaryEntry, DictionaryProvider } from '../dictionary/DictionaryProvider';
import { isQuestionable } from '../dictionary/ranking';
import { isVerifiedReference } from '../dictionary/verifiedReferences';
import type { PartOfSpeech } from '../domain/schema';
import { formatAnswers } from '../domain/normalize';

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

/**
 * Wie viele Bedeutungen als Chips direkt in der Karte stehen.
 *
 * Seit 4B.2 sind das die **Chips** und nicht mehr die ersten Zeilen einer
 * Liste: Drei anklickbare Wörter passen in eine Zeile, drei Bedeutungsblöcke
 * mit Wortart und Herkunft füllten eine halbe Karte.
 */
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

/* ------------------------------------------------------------------ Wortart */

/**
 * Die Wortartbezeichnungen der Quelle auf die sieben von LexiFlow.
 *
 * Wiktionary kennt weit mehr Kategorien, als ein Vokabelpaket braucht.
 * Zusammengefasst wird nur, was sich zusammenfassen lässt; alles Übrige landet
 * bei `other` und nicht bei einer erfundenen Nachbarschaft.
 */
const PART_OF_SPEECH_BY_SOURCE: Readonly<Record<string, PartOfSpeech>> = {
  noun: 'noun',
  name: 'noun',
  verb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  phrase: 'phrase',
  proverb: 'phrase',
  prep_phrase: 'phrase',
  prep: 'preposition',
  postp: 'preposition',
  intj: 'other',
  num: 'other',
  pron: 'other',
  det: 'other',
  conj: 'other',
  particle: 'other',
  contraction: 'other',
};

/**
 * Die Wortart, die sich vorausfüllen lässt – oder gar keine.
 *
 * Vorausgefüllt wird nur, wenn die Auskunft **eindeutig** ist. `book` ist
 * Substantiv und Verb; eines davon einzutragen hieße, eine Münze zu werfen und
 * das Ergebnis wie eine Auskunft aussehen zu lassen. Ein leeres Feld ist an
 * dieser Stelle ehrlicher – und die Lehrkraft füllt es in einem Klick.
 */
export function partOfSpeechOf(
  summary: DictionarySuggestionSummary | undefined,
): PartOfSpeech | '' {
  const sources = new Set(
    (summary?.entries ?? []).flatMap((entry) => (entry.partOfSpeech ? [entry.partOfSpeech] : [])),
  );
  if (sources.size !== 1) return '';
  const [only] = [...sources];
  return (only && PART_OF_SPEECH_BY_SOURCE[only]) ?? '';
}

/**
 * Die Wortart **eines einzelnen** Wörterbucheintrags.
 *
 * Der Unterschied zu `partOfSpeechOf` ist der Anlass, nicht die Tabelle. Dort
 * geht es um die Frage „lässt sich das Feld vorausfüllen, bevor jemand etwas
 * entschieden hat?“ – und die Antwort ist bei `book` mit Recht nein.
 *
 * Hier hat jemand entschieden: Wer beim Wort `book` auf „das Buch“ klickt, hat
 * damit die Bedeutungsgruppe gewählt, und die ist ein Substantiv. Die Auskunft
 * ist jetzt eindeutig, weil die Auswahl sie eindeutig gemacht hat.
 */
export function partOfSpeechOfSource(source: string | undefined): PartOfSpeech | undefined {
  return source ? PART_OF_SPEECH_BY_SOURCE[source] : undefined;
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
 * 4. **Kein erschlossener Verweis als Standardantwort – außer einem geprüften.**
 *    Eine `via`-Bedeutung ist eine Schlussfolgerung, keine Auskunft, und
 *    Schlussfolgerungen werden nicht eingetragen. Die eine Ausnahme steht in
 *    `verifiedReferences.ts`: `doctor → physician` ist an der Originalquelle
 *    geprüft worden, und die medizinische Bedeutung ist die, wegen der jemand
 *    `doctor` in ein Vokabelpaket nimmt. Sie wird deshalb **bevorzugt** – aus
 *    `doctor` wird *Arzt*, nicht *Doktor*.
 *
 *    Was die Ausnahme nicht tut: Sie nimmt nichts hinzu. `veterinarian` →
 *    *Tierarzt* steht in einer anderen Bedeutungsgruppe und bleibt draußen, wie
 *    Regel 1 es verlangt. Und sie gilt nur für die eine geprüfte Paarung:
 *    `medic`, ebenfalls über `physician` erschlossen, bleibt leer.
 *
 * Im Zweifel: gar nichts. Ein leeres Feld ist eine Aufgabe; eine falsche
 * Antwort ist ein Fehler, den jemand später glaubt.
 */
export function safeAutoAnswer(summary: DictionarySuggestionSummary | undefined): string {
  const entries = summary?.entries ?? [];
  if (!entries.length) return '';

  const headword = entries[0]?.headword ?? '';
  const withContent = entries
    .flatMap((entry) => entry.senses)
    .filter((candidate) => candidate.suggestions.length > 0);

  /*
    Regel 1 und 4 zusammen: **genau eine** Bedeutungsgruppe.

    Bevorzugt wird die geprüfte Verweisbedeutung, sonst die erste eigene. Ein
    ungeprüfter Verweis kommt nie infrage – auch dann nicht, wenn er die einzige
    Gruppe mit Inhalt ist.
  */
  const sense =
    withContent.find((candidate) => isVerifiedReference(headword, candidate.via)) ??
    withContent.find((candidate) => !candidate.via);
  if (!sense) return '';

  // Regel 3: Markiertes und Bedingtes zählt nicht mit.
  const safe = sense.suggestions.filter(
    (suggestion) => !suggestion.register?.length && !suggestion.qualifier,
  );
  if (!safe.length || isQuestionable(sense)) return '';

  // Regel 2: eins, zwei – oder bei dreien nur das erste.
  const take = safe.length <= MAX_AUTO_SYNONYMS ? safe.length : 1;
  /*
    Verbunden wird mit **Semikolon**, seit Sprint 4B.2 Phase 1.

    Bis dahin stand hier ein Komma – und das war ein echter Fehler, nicht bloß
    eine andere Schreibweise: `station` → „Bahnhof, Station“ wurde damit zu
    **einer** Antwort, die nur richtig war, wenn jemand genau diese beiden
    Wörter mit genau diesem Komma tippte. Als zwei Antworten zählt jede für
    sich. Formatiert wird über `formatAnswers`, damit hier keine zweite,
    stillschweigend abweichende Trennregel entsteht.
  */
  return formatAnswers(safe.slice(0, take).map((suggestion) => suggestion.german));
}
