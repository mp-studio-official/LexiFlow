import type { TextCandidate } from '../domain/textExtraction';
import { type CefrLevel, type Grade, suggestCefrLevel } from '../domain/cefr';
import { sentenceEvidence } from '../domain/wordForms';
import type { DictionaryEntry } from '../dictionary/DictionaryProvider';
import type { DictionarySuggestionSummary } from './dictionarySuggestions';

/**
 * Welche Wörter aus einem Text lohnen sich als Vokabeln?
 *
 * Die alte Antwort war „die ersten N“, gefiltert nach Häufigkeit. Das ist
 * bequem und falsch: In fast jedem Sachtext stehen `old`, `street` und `people`
 * ganz vorn, und keines davon muss eine Neuntklässlerin noch lernen.
 *
 * Dieses Modul rechnet stattdessen eine **Eignung** aus. Es hat dabei ein
 * ehrliches Problem: Es gibt keine Wortliste, die sagt, welches Wort auf
 * welchem GeR-Niveau steht. Was es gibt, sind messbare Merkmale – Länge,
 * Wortbildung, akademische Endungen, Stellung und Häufigkeit im Text, und die
 * Auskunft des Wörterbuchs. Aus denen wird eine Schwierigkeit geschätzt und mit
 * dem Zielniveau verglichen.
 *
 * Das ist eine Heuristik und wird auch so benannt. Sie ordnet Vorschläge; sie
 * entscheidet nichts. Die Lehrkraft sieht die Liste und ändert sie.
 *
 * Bewusst **ohne** React und ohne Wörterbuchzugriff: Eingaben rein, Reihenfolge
 * raus. So lässt sich die Rangfolge prüfen, ohne eine Oberfläche zu rendern.
 */

export type RecommendationSort = 'recommended' | 'hardest' | 'frequency' | 'text-order';

export const RECOMMENDATION_SORT_LABELS: Readonly<Record<RecommendationSort, string>> = {
  recommended: 'Empfehlung',
  hardest: 'Anspruchsvollste zuerst',
  frequency: 'Häufigkeit im Text',
  'text-order': 'Reihenfolge im Text',
};

/** Wählbare Anzahlen. Mehr als 20 auf einmal prüft niemand ernsthaft durch. */
export const RECOMMENDATION_COUNTS = [5, 10, 15, 20] as const;
export const DEFAULT_RECOMMENDATION_COUNT = 10;

export interface RecommendationContext {
  grade: Grade;
  cefrLevel: CefrLevel;
}

export interface RecommendationInput {
  candidate: TextCandidate;
  /** Was das Offline-Wörterbuch zu diesem Wort weiß, falls es etwas weiß. */
  dictionary?: DictionarySuggestionSummary | undefined;
  /**
   * Was es zu `Wort + Partikel` weiß – etwa zu `single out`, wenn im Satz
   * hinter `single` ein `out` stand.
   *
   * Für die Empfehlung selbst ist das Feld ohne Bedeutung; es wird nur
   * durchgereicht, damit die Ansicht daraus die vollständige Lernform bauen
   * kann (siehe `learningFormProposal.ts`). Der zweite Nachschlag passiert im
   * selben Durchlauf wie der erste – eine spätere Nachfrage je Zeile wäre ein
   * Wörterbuchzugriff mitten im Tippen.
   */
  phrase?: DictionarySuggestionSummary | undefined;
}

export interface ScoredCandidate extends RecommendationInput {
  /** Höher ist besser. Nur innerhalb eines Laufs vergleichbar. */
  score: number;
  /** Geschätzte sprachliche Schwierigkeit, 0 (leicht) bis 1 (schwer). */
  difficulty: number;
  /** Der Lexemschlüssel, über den Dubletten erkannt werden. */
  family: string;
  /** Alle beanspruchten Familien – bei Mehrwortbegriffen auch die der Teile. */
  families: readonly string[];
  /**
   * Gesetzt, wenn die Form zu mehreren Grundformen gehören könnte und der Satz
   * die Frage nicht beantwortet hat. Das Stichwort ist dann die **Textform**,
   * und die Oberfläche sagt es dazu.
   */
  baseFormHint?: string;
}

/** Was an einer ungeklärten Grundform dransteht – ein Satz, keine Warnung. */
export const BASE_FORM_HINT = 'Grundform prüfen';

/* -------------------------------------------------------------- Schwierigkeit */

/**
 * Wortbildungsendungen, die auf einen abstrakten oder fachlichen Begriff deuten.
 *
 * `evacuation`, `resilience`, `settlement` sind für eine Lernende etwas anderes
 * als `street` – nicht weil sie länger sind, sondern weil sie ein Konzept
 * benennen statt eines Dings.
 */
const ACADEMIC_SUFFIXES = [
  'tion', 'sion', 'ment', 'ance', 'ence', 'ity', 'ism', 'ology', 'ography',
  'ical', 'ative', 'itive', 'ious', 'eous', 'ance', 'ency', 'ship', 'hood',
  'ness', 'able', 'ible', 'ise', 'ize', 'ify',
  // Fachadjektive und -substantive, die keine der obigen Endungen tragen:
  // `neuropsychiatric`, `divisional`, `archival`, `regulatory`, `documentary`.
  'atric', 'ional', 'ival', 'ory', 'ary',
];

/**
 * Ab hier ist ein Wort auch ohne erkennbare Endung ein gelehrtes Wort.
 *
 * `neuropsychiatric` trägt keine der Endungen oben und ist trotzdem kein
 * Wort für Klasse 7. Die Länge allein ist ein grobes, aber ehrliches Maß:
 * Englische Alltagswörter werden selten so lang.
 */
const LEARNED_WORD_LENGTH = 12;

/**
 * Zeitschriftenapparat – Wörter, die im Kopf eines Artikels stehen und dort
 * nichts über sein Thema sagen.
 *
 * `issue` ist die Heftnummer, `volume` der Jahrgang, `abstract` die
 * Zusammenfassung. Als Vokabeln sind sie nicht falsch – nur nicht das, wofür
 * die Lehrkraft diesen Text ausgewählt hat.
 *
 * Diese Liste wirkt **nur**, wenn der Text tatsächlich wie eine Publikation
 * aussieht (siehe `looksLikePublication`). In einem Text über eine Zeitung
 * oder über ein Streitthema bleibt „issue“ eine ganz normale Vokabel; ein
 * ständiger Abschlag wäre eine Bevormundung.
 */
const PUBLICATION_APPARATUS = new Set([
  'issue', 'volume', 'abstract', 'journal', 'editor', 'editorial', 'quarterly',
  'appendix', 'footnote', 'bibliography', 'citation', 'keyword', 'reprint',
]);

/** Wie stark der Apparat abgewertet wird – genug, um ihn aus den ersten zu drängen. */
const APPARATUS_PENALTY = 2.0;

/**
 * Sieht dieser Text nach einer Publikation mit Kopfdaten aus?
 *
 * Erkannt wird der Apparat, nicht der Inhalt: eine Bandangabe, eine
 * Heftnummer, ein DOI, eine Seitenspanne. Ohne einen dieser Marker gilt der
 * Text als gewöhnlicher Sachtext und die Liste oben bleibt wirkungslos.
 */
export function looksLikePublication(text: string): boolean {
  return /\bvol\.\s*\d|\bvolume\s+\d|\bissue\s+\d|\bno\.\s*\d|\bdoi:|\bpp\.\s*\d|\bissn\b/i.test(
    text,
  );
}

/**
 * Der englische Grundwortschatz, den niemand aus einem Text „gewinnen“ muss.
 *
 * Bewusst **kurz und konservativ**: Es sind keine Funktionswörter – die filtert
 * die Extraktion schon weg –, sondern Inhaltswörter, die in Klasse 5 gelernt
 * werden und in jedem Sachtext auftauchen. Eine längere Liste wäre eine
 * Anmaßung; diese hier hebt nur den offensichtlichsten Bodensatz an.
 */
const EVERYDAY_WORDS = new Set([
  'old', 'new', 'good', 'bad', 'big', 'small', 'long', 'short', 'high', 'low',
  'day', 'year', 'time', 'week', 'month', 'people', 'man', 'woman', 'child',
  'house', 'home', 'school', 'street', 'city', 'town', 'water', 'food', 'work',
  'thing', 'place', 'part', 'way', 'come', 'go', 'make', 'take', 'give', 'get',
  'see', 'look', 'know', 'think', 'say', 'tell', 'want', 'need', 'use', 'find',
  'name', 'number', 'car', 'book', 'room', 'door', 'hand', 'eye', 'friend',
]);

/** Silben grob zählen – gut genug als Längenmaß, das Buchstaben nicht sind. */
export function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  const groups = clean.replace(/e$/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

/**
 * Der aussagekräftigste Teil eines Begriffs – das längste Wort darin.
 *
 * Bei `attritional combat` ist das `attritional`. Auf das ganze Bigramm zu
 * schauen wäre falsch: Dessen Endung ist die von `combat`, und danach sähe der
 * Fachbegriff aus wie ein Alltagswort. Genau dieser Fehler hatte im ersten
 * Anlauf die Einzelwörter über ihre eigenen Mehrwortbegriffe gehoben.
 */
export function longestPart(word: string): string {
  return word
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .reduce((best, part) => (part.length > best.length ? part : best), '');
}

/**
 * Wie schwer ist dieses Wort, geschätzt aus messbaren Merkmalen?
 *
 * 0 heißt „Grundwortschatz“, 1 heißt „Fachbegriff“. Die Gewichte sind gesetzt,
 * nicht gelernt – es gibt keine Trainingsdaten und keine Wortliste. Sie sind so
 * gewählt, dass die Reihenfolge an den Beispielen dieses Projekts stimmt, und
 * sie sind an einer Stelle nachlesbar statt über den Code verstreut.
 */
export function estimateDifficulty(word: string): number {
  const lower = word.toLowerCase().trim();
  if (!lower) return 0;

  const words = lower.split(/\s+/);
  const longest = longestPart(lower);

  let score = 0;

  // Länge und Silben – das gröbste, aber verlässlichste Signal.
  score += Math.min(longest.length / 14, 1) * 0.35;
  score += Math.min(countSyllables(longest) / 5, 1) * 0.25;

  // Akademische Wortbildung.
  if (ACADEMIC_SUFFIXES.some((suffix) => longest.endsWith(suffix))) score += 0.25;

  // Gelehrte Wörter ohne erkennbare Endung.
  if (longest.length >= LEARNED_WORD_LENGTH) score += 0.1;

  // Mehrwortbegriffe sind fast immer Fachbegriffe („shell shock“, „land use“).
  if (words.length > 1) score += 0.15;

  // Und der Bodensatz nach unten.
  if (EVERYDAY_WORDS.has(lower)) score -= 0.45;

  return Math.max(0, Math.min(1, score));
}

/**
 * Das Schwierigkeitsband, das zu einem Niveau passt.
 *
 * Ausgeschrieben statt aus dem Index gerechnet: Die Zuordnung von GeR-Stufe zu
 * erwarteter Wortschwierigkeit ist eine Einschätzung, und eine Einschätzung
 * gehört sichtbar hin. Eine automatische Verteilung über die Listenlänge sähe
 * eleganter aus und wäre nur schwerer zu widersprechen.
 *
 * Die Werte beziehen sich auf `estimateDifficulty` (0 = Grundwortschatz,
 * 1 = Fachbegriff) und decken die NRW-Stufen dieses Projekts ab.
 */
export const LEVEL_BAND: Readonly<Record<CefrLevel, number>> = {
  'A1+': 0.15,
  A2: 0.25,
  'A2+': 0.32,
  'A2/B1': 0.38,
  B1: 0.45,
  'B1+': 0.52,
  'B1/B2': 0.58,
  B2: 0.65,
  'B2/C1': 0.75,
};

/**
 * Wie gut passt eine Schwierigkeit zum Zielniveau?
 *
 * Symmetrisch wäre falsch: Ein Wort **unter** dem Niveau ist als Vokabel
 * wertlos, ein Wort **über** dem Niveau ist anspruchsvoll, aber lernbar. Zu
 * leicht wird deshalb härter bestraft als zu schwer.
 */
export function levelFit(difficulty: number, level: CefrLevel): number {
  const target = LEVEL_BAND[level] ?? 0.5;
  const delta = difficulty - target;
  return delta >= 0 ? Math.max(0, 1 - delta * 1.1) : Math.max(0, 1 + delta * 2.2);
}

/* ---------------------------------------------------------------- Familien */

/**
 * Der Lexemschlüssel: Singular und Plural sind dieselbe Familie.
 *
 * Bewusst eine kleine, konservative Stammform und kein Porter-Stemmer: Ein
 * aggressiver Stemmer wirft `casualty` und `casual` zusammen. Was hier gekürzt
 * wird, sind nur die Endungen, bei denen sich das sicher sagen lässt.
 */
function stem(word: string): string {
  if (word.length <= 3) return word;
  for (const [suffix, replacement] of [
    ['ies', 'y'],
    ['sses', 'ss'],
    ['ches', 'ch'],
    ['shes', 'sh'],
    ['xes', 'x'],
    ['ing', ''],
    ['ed', ''],
    ['es', ''],
    ['s', ''],
  ] as const) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, word.length - suffix.length) + replacement;
    }
  }
  return word;
}

export function familyKey(word: string, dictionary?: DictionarySuggestionSummary): string {
  // Kennt das Wörterbuch die Grundform, ist sie die bessere Auskunft.
  const fromDictionary = dictionary?.entries[0]?.headword;
  const base = (fromDictionary ?? word).toLowerCase().trim();
  const parts = base.split(/\s+/);
  const head = parts[0] ?? base;
  return [stem(head), ...parts.slice(1)].join(' ');
}

/**
 * **Alle** Familien, die ein Kandidat beansprucht.
 *
 * Drei Quellen, und jede hat einen Anlass:
 *
 * 1. **Der eigene Stamm.** `islands` → `island`.
 * 2. **Die Teile eines Mehrwortbegriffs.** `Psychological casualties` und
 *    `psychological` nebeneinander vorzuschlagen sieht aus, als hätte niemand
 *    hingesehen – für die Lerngruppe ist es dieselbe Vokabel zweimal, einmal
 *    mit und einmal ohne ihren Sinn.
 * 3. **Die Lemmata des Wörterbuchs.** Der Suffixstamm oben ist regelmäßig und
 *    scheitert genau dort, wo Englisch unregelmäßig ist: `kept`, `wrote`,
 *    `men`, `rose`. Die erste Empfehlungsliste für Klasse 5 enthielt `keep`
 *    **und** `kept`, `rose`, `wrote` und `men` – fünf Plätze für drei Vokabeln.
 *    Das Wörterbuch weiß es besser, und es weiß es für jedes Wort, nicht nur
 *    für eine gepflegte Ausnahmeliste.
 *
 *    Genommen werden **alle** Lemmata aller Treffer, nicht nur das erste.
 *    `rose` findet die Blume *und* die Vergangenheitsform von `rise`; welche
 *    gemeint ist, entscheidet dieses Modul nicht. Es reicht, dass beide
 *    Ansprüche angemeldet sind: Steht `rise` daneben, kollidieren sie und nur
 *    eines überlebt. Steht es nicht daneben, schadet der zweite Anspruch
 *    niemandem.
 *
 * Welcher Kandidat eine umkämpfte Familie behält, entscheidet die Punktzahl,
 * nicht die Reihenfolge: `recommend` dünnt **nach** dem Sortieren aus.
 */
export function familyKeys(
  word: string,
  dictionary?: DictionarySuggestionSummary,
): readonly string[] {
  const whole = familyKey(word, dictionary);
  const parts = whole.split(/\s+/);
  const keys = new Set<string>([whole]);
  if (parts.length > 1) for (const part of parts) keys.add(stem(part));

  for (const entry of dictionary?.entries ?? []) {
    const lemma = entry.lemma.trim().toLowerCase();
    if (lemma) keys.add(stem(lemma));
    const head = entry.headword.trim().toLowerCase();
    if (head) keys.add(stem(head));
  }
  return [...keys];
}

/**
 * Wortarten, die keine Lernvokabel ergeben.
 *
 * `four` stand auf Platz fünf der Empfehlungen für Klasse 5. Es ist ein
 * Zahlwort – im Wörterbuch als `num` geführt – und niemand nimmt es aus einem
 * Text in ein Vokabelpaket auf. Dasselbe gilt für Artikel, Pronomen und
 * Konjunktionen, soweit die Extraktion sie überhaupt durchlässt.
 *
 * Ausgeschlossen wird nur, wenn **alle** Treffer so aussehen: `second` ist
 * Zahlwort und Substantiv, und als Substantiv eine ganz normale Vokabel.
 */
const TRIVIAL_PARTS_OF_SPEECH = new Set(['num', 'det', 'pron', 'conj', 'particle', 'article']);

/**
 * Zahlwörter als Rückfallebene, wenn das Wörterbuch nichts sagt.
 *
 * Bewusst nur die Grundzahlen bis zwanzig plus die runden Stufen – das ist der
 * Bereich, in dem ein Zahlwort in einem Sachtext auftaucht, ohne je eine
 * Vokabel zu sein.
 */
const NUMBER_WORDS = new Set([
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty',
  'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'million', 'billion',
  'first', 'second', 'third', 'fourth', 'fifth',
]);

/** Taugt dieser Kandidat überhaupt als Vokabel? */
export function isTrivialWord(word: string, dictionary?: DictionarySuggestionSummary): boolean {
  const lower = word.trim().toLowerCase();
  if (lower.includes(' ')) return false;

  /*
    Zahlwörter fallen **ohne** Rückfrage beim Wörterbuch heraus.

    `four` steht dort als `num` **und** als `noun` – die Vier als Ziffer und
    die Vier als Ding. Eine Regel „nur wenn alle Wortarten trivial sind“ ließ
    es deshalb durch, und es stand auf Platz fünf der Empfehlungen für
    Klasse 5. Ein Zahlwort ist in einem Sachtext nie die Vokabel, wegen der
    jemand den Text ausgewählt hat.
  */
  if (NUMBER_WORDS.has(lower)) return true;

  const kinds = (dictionary?.entries ?? []).flatMap((entry) =>
    entry.partOfSpeech ? [entry.partOfSpeech] : [],
  );
  return kinds.length > 0 && kinds.every((kind) => TRIVIAL_PARTS_OF_SPEECH.has(kind));
}

/** Trägt dieser Kandidat Zeitschriftenapparat – auch als Teil eines Begriffs? */
function isApparatus(word: string): boolean {
  return word
    .toLowerCase()
    .split(/\s+/)
    .some((part) => PUBLICATION_APPARATUS.has(part));
}

/**
 * Steht dieser Kandidat **nur** in der Kopfzeile der Publikation?
 *
 * Der Apparat ist nicht auf einzelne Wörter beschränkt. `Military History
 * Quarterly, Vol. 12, Issue 3.` ist der Name der Zeitschrift, und daraus
 * entstand der Mehrwortkandidat `military History` – zwei lange Fachwörter, die
 * jede Gewichtung nach vorn trägt und die trotzdem niemand aus diesem Artikel
 * lernen soll. Er handelt nicht von Militärgeschichte als Fach; das ist der
 * Briefkopf.
 *
 * Die Regel bleibt eng: Nur wer **einmal** vorkommt und dabei in einer Zeile
 * mit Band-, Heft-, DOI- oder Seitenangabe steht, fällt heraus. Ein Wort, das
 * auch im Fließtext auftaucht, ist damit sicher – der Titel gibt oft das Thema
 * wieder, und `psychological` aus einer Überschrift bleibt eine Vokabel.
 */
function onlyInCitationLine(candidate: TextCandidate): boolean {
  if (candidate.occurrences > 1) return false;
  const sentence = candidate.sourceSentence;
  /*
    Geprüft wird der **Satz**, nicht der Gesamttext – und der ist hier oft
    abgeschnitten: Die Satztrennung endet an `Vol.`, weil ein Punkt danach
    aussieht wie ein Satzende. Aus `Military History Quarterly, Vol. 12, Issue 3.`
    wird deshalb `Military History Quarterly, Vol.` – ohne die Zahl, an der
    `looksLikePublication` den Apparat erkennt. Die Abkürzung selbst genügt
    darum als Marker.
  */
  return looksLikePublication(sentence) || /\bvol\.|\bpp\.|\bdoi:|\bissn\b|\bisbn\b|\bno\.\s*\d/i.test(sentence);
}

/**
 * Formmerkmale, die eine **Beugung** kennzeichnen.
 *
 * Der Datensatz nennt zu jeder Formzuordnung, *wie* die Form mit der Grundform
 * zusammenhängt. Nur diese Merkmale rechtfertigen es, das Stichwort zu
 * ersetzen.
 */
const INFLECTION_TAGS = new Set([
  'plural',
  'singular',
  'past',
  'participle',
  'present',
  'gerund',
  'comparative',
  'superlative',
  'third-person',
]);

/**
 * Merkmale, die **keine** Beugung sind, sondern eine andere Schreibung oder
 * eine regionale Variante.
 */
const VARIANT_TAGS = new Set(['alternative', 'misspelling', 'obsolete', 'archaic', 'informal']);

/** Die drei Wortklassen, die für die Grundformfrage etwas ändern. */
type WordClass = 'noun' | 'verb' | 'adjective' | 'other';

/** Die Wortart des Datensatzes auf die Klasse, die hier zählt. */
function classOfPart(part: string | undefined): WordClass {
  if (part === 'noun' || part === 'name') return 'noun';
  if (part === 'verb') return 'verb';
  if (part === 'adj') return 'adjective';
  return 'other';
}

/**
 * Die Klasse, auf die ein Formmerkmal zeigt.
 *
 * `plural` ist eine Nomenbeugung, `past` und `participle` sind Verbbeugungen,
 * `comparative` ist eine Adjektivbeugung. `singular` steht bewusst **nicht**
 * hier: Im Datensatz markiert es die Verbkongruenz (`lives`: *indicative,
 * present, singular, third-person*) und nicht den Numerus eines Nomens.
 */
const TAG_CLASS: Readonly<Record<string, WordClass>> = {
  plural: 'noun',
  past: 'verb',
  participle: 'verb',
  present: 'verb',
  gerund: 'verb',
  'third-person': 'verb',
  comparative: 'adjective',
  superlative: 'adjective',
};

/** Eine Grundform, die das Wörterbuch für diese Form anbietet. */
interface FormOption {
  lemma: string;
  /** Wortklasse des Eintrags der Grundform. */
  wordClass: WordClass;
  /** Wortklasse, auf die die Formmerkmale zeigen. */
  tagClass: WordClass;
}

function formOptionsFor(
  word: string,
  entries: readonly DictionaryEntry[],
): FormOption[] {
  const options: FormOption[] = [];
  for (const entry of entries) {
    if (entry.quality !== 'lemma') continue;
    const tags = entry.formTags ?? [];
    if (!tags.some((tag) => INFLECTION_TAGS.has(tag))) continue;
    if (tags.some((tag) => VARIANT_TAGS.has(tag))) continue;
    const lemma = entry.lemma.trim();
    if (!lemma || lemma.toLowerCase() === word.trim().toLowerCase()) continue;
    const classes = tags.flatMap((tag) => (TAG_CLASS[tag] ? [TAG_CLASS[tag]] : []));
    const [first = 'other'] = classes;
    options.push({
      lemma,
      wordClass: classOfPart(entry.partOfSpeech),
      // Widersprechen sich die Merkmale, zählt keines.
      tagClass: classes.every((kind) => kind === first) ? first : 'other',
    });
  }
  return options;
}

/**
 * Was mit dem sichtbaren Stichwort geschehen soll.
 *
 * `unresolved` ist der Fall, für den es diese Unterscheidung gibt: Die Form
 * *könnte* zu einer anderen Grundform gehören, aber der Satz gibt es nicht her.
 * Dann bleibt die Textform stehen – und die Lehrkraft sieht, dass hier eine
 * Entscheidung offen ist.
 */
export type BaseFormDecision =
  | { readonly kind: 'keep' }
  | { readonly kind: 'base'; readonly lemma: string }
  | { readonly kind: 'unresolved'; readonly options: readonly string[] };

/**
 * Grundform oder Textform – und wann der Satz gefragt wird.
 *
 * `quality: 'lemma'` allein reicht nicht. Der Datensatz führt unter derselben
 * Kennzeichnung mehrere grundverschiedene Fälle:
 *
 * - `wrote → write`, `kept → keep`: eine **Beugung** ohne Gegenkandidaten. Wer
 *   `wrote` ins Paket nimmt, lernt eine Vokabel in einer Form, die so niemand
 *   lernt.
 * - `story → storey`: eine **Schreibvariante**. `story` ist selbst ein
 *   vollwertiges Wort; es zu ersetzen hieße, aus der *Geschichte* ein
 *   *Stockwerk* zu machen. Solche Merkmale (`alternative`, `misspelling` …)
 *   zählen gar nicht erst als Beugung.
 * - `men → man`: eine **reine Beugung**, auch wenn `men` einen eigenen Eintrag
 *   hat. Das Merkmal `plural` ist eine Nomenbeugung, `men` ist ein Nomen und
 *   `man` ist eines – dieselbe Wortklasse durch und durch. Ein Plural ist keine
 *   eigene Vokabel.
 * - `rose`, `lives`, `written`: **mehrdeutig**. `rose` ist die Blume oder die
 *   Vergangenheit von `rise`; `lives` gehört zu `life` oder zu `live`;
 *   `written` ist das Adjektiv oder das Partizip von `write`. Hier entscheidet
 *   der Satz – und nur er.
 *
 * Der Satzbeleg kommt aus der vorhandenen Wortartlogik (`sentenceEvidence`):
 * Artikel, Possessiv und Zahlwort sprechen für ein Nomen, „to“ und
 * Subjektpronomen für ein Verb, ein Perfekt-Hilfsverb für ein Partizip, ein
 * folgendes `-ly`-Adverb für ein Verb. Gibt der Satz nichts her, wird **nicht**
 * geraten: Dann bleibt die Textform stehen.
 */
export function resolveBaseForm(
  word: string,
  dictionary?: DictionarySuggestionSummary,
  sentence?: string,
): BaseFormDecision {
  const entries = dictionary?.entries ?? [];
  const options = formOptionsFor(word, entries);
  if (options.length === 0) return { kind: 'keep' };

  /*
    Nur Einträge mit deutscher Entsprechung zählen als „eigener Eintrag“;
    `dictionary.entries` enthält ohnehin nur solche.
  */
  const own = entries.filter((entry) => entry.quality !== 'lemma');
  const ownClasses = new Set(own.map((entry) => classOfPart(entry.partOfSpeech)));
  const lemmas = [...new Set(options.map((option) => option.lemma))];

  // 1. Kein eigener Eintrag, nur eine denkbare Grundform: eindeutig.
  if (own.length === 0 && lemmas.length === 1 && lemmas[0]) {
    return { kind: 'base', lemma: lemmas[0] };
  }

  /*
    2. Reine Beugung: Merkmal, Grundform und eigener Eintrag stehen alle in
    derselben Wortklasse – `men` (Nomen) ist der Plural von `man` (Nomen).
    Bei `rose` trägt der Eintrag `rise` das Merkmal `past`, also eine
    Verbbeugung, während `rose` selbst als Nomen geführt wird: keine reine
    Beugung, sondern zwei Wörter mit derselben Schreibung.
  */
  const mere = options.filter(
    (option) => option.tagClass === option.wordClass && ownClasses.has(option.wordClass),
  );
  const mereLemmas = [...new Set(mere.map((option) => option.lemma))];
  if (own.length > 0 && mereLemmas.length === 1 && mereLemmas[0]) {
    return { kind: 'base', lemma: mereLemmas[0] };
  }

  // 3. Mehrdeutig – jetzt zählt der Satz.
  const evidence = sentence ? sentenceEvidence(sentence, word) : {};
  const verbEvidence =
    evidence.verb === true || evidence.perfect === true || evidence.adverbFollows === true;
  const nounEvidence = evidence.noun === true;

  if (verbEvidence && !nounEvidence) {
    const verb = options.find((option) => option.tagClass === 'verb' || option.wordClass === 'verb');
    if (verb) return { kind: 'base', lemma: verb.lemma };
  }

  if (nounEvidence && !verbEvidence) {
    /*
      Ein Artikel oder Possessiv sagt: Hier steht eine Nominalphrase. Hat das
      Wort einen eigenen Eintrag, ist es genau dieses Wort – „the rose“, „a
      written agreement“. Hat es keinen, ist die Nomen-Grundform gemeint –
      „their lives“ führt zu `life`, nicht zu `live`.
    */
    if (own.length > 0) return { kind: 'keep' };
    const noun = options.find((option) => option.tagClass === 'noun' || option.wordClass === 'noun');
    if (noun) return { kind: 'base', lemma: noun.lemma };
  }

  /*
    Der Satz gibt nichts her. Steht das Wort in einer Wortart da, die keine der
    Grundformen hat, ist es trotzdem eindeutig sein eigenes Wort: `crowded` ist
    Adjektiv, `crowd` Substantiv; `litter` ist Substantiv und Verb, `lit`
    Adjektiv. Sonst bleibt die Frage offen.
  */
  if (own.length > 0 && !options.some((option) => ownClasses.has(option.wordClass))) {
    return { kind: 'keep' };
  }
  return { kind: 'unresolved', options: lemmas };
}

/** Die Grundform, wenn sie sicher ist – sonst nichts. */
export function baseFormOf(
  word: string,
  dictionary?: DictionarySuggestionSummary,
  sentence?: string,
): string | undefined {
  const decision = resolveBaseForm(word, dictionary, sentence);
  return decision.kind === 'base' ? decision.lemma : undefined;
}

/**
 * Die Schreibweise, in der ein Kandidat ins Paket gehört.
 *
 * `Military` und `Small` standen groß in den Empfehlungen, weil sie im Text nur
 * am Satzanfang vorkamen. Als Eigennamen gelten sie nicht – die Extraktion
 * verlangt dafür eine Fundstelle mitten im Satz –, aber ihre Schreibung blieb
 * die des Satzanfangs. Wer sie so übernimmt, lernt eine Vokabel falsch.
 *
 * Die Auskunft kommt wieder aus dem Wörterbuch: Führt es das Wort
 * kleingeschrieben, ist die Kleinschreibung richtig. Führt es `Cornwall` groß,
 * bleibt `Cornwall` groß.
 */
export function displayNameOf(
  word: string,
  dictionary?: DictionarySuggestionSummary,
  sentence?: string,
): string {
  if (word.includes(' ')) return word;

  const base = baseFormOf(word, dictionary, sentence);
  if (base) return base;

  // Danach die Schreibweise: Großschreibung nur vom Satzanfang zurücknehmen.
  const first = word.charAt(0);
  if (!first || first === first.toLowerCase()) return word;
  const rest = word.slice(1);
  // Akronyme bleiben unangetastet.
  if (rest !== rest.toLowerCase()) return word;

  const lower = word.toLowerCase();
  const known = (dictionary?.entries ?? []).some(
    (entry) => entry.headword.toLowerCase() === lower || entry.lemma.toLowerCase() === lower,
  );
  return known ? lower : word;
}

/* ------------------------------------------------------------------ Rangfolge */

export interface RankOptions {
  context: RecommendationContext;
  sort: RecommendationSort;
  /** Wie viele Empfehlungen herauskommen sollen. */
  count: number;
  /** Familien, die schon vergeben, abgelehnt oder übernommen sind. */
  excludedFamilies?: Iterable<string>;
  /**
   * Trägt der Quelltext Zeitschriftenapparat? Dann wird `issue`, `volume` und
   * Verwandtes abgewertet – siehe `looksLikePublication`.
   */
  publicationContext?: boolean;
}

/**
 * Bewertet alle Kandidaten. Die Reihenfolge der Rückgabe ist die Rangfolge.
 *
 * Die Gewichte stehen hier zusammen, damit man sie als Ganzes lesen kann:
 */
const WEIGHT = {
  /** Passt das Wort zum Jahrgang und GeR-Niveau? Das wichtigste Kriterium. */
  fit: 3.0,
  /** Fachliche Relevanz – akademische Wortbildung und Mehrwortbegriffe. */
  academic: 1.2,
  /** Bedeutung im Text: mehrfach genannt heißt, der Text braucht das Wort. */
  weightInText: 1.0,
  /** Steht es früh im Text? Titel und erster Absatz tragen das Thema. */
  position: 0.5,
  /** Kennt das Wörterbuch eine deutsche Entsprechung? Dann ist es brauchbar. */
  dictionary: 0.8,
  /** Ein Mehrwortbegriff ist ein eigener Lerngegenstand. */
  multiword: 0.4,
} as const;

export function scoreCandidates(
  inputs: readonly RecommendationInput[],
  options: RankOptions,
): ScoredCandidate[] {
  const maxOccurrences = Math.max(1, ...inputs.map((input) => input.candidate.occurrences));
  const maxPosition = Math.max(1, ...inputs.map((input) => input.candidate.firstOccurrence));

  return inputs.map((input) => {
    const word = input.candidate.english;
    const difficulty = estimateDifficulty(word);
    const lower = word.toLowerCase();
    const academic = ACADEMIC_SUFFIXES.some((suffix) => longestPart(lower).endsWith(suffix))
      ? 1
      : 0;
    const multiword = /\s/.test(word.trim()) ? 1 : 0;
    const apparatus =
      options.publicationContext === true && PUBLICATION_APPARATUS.has(lower) ? 1 : 0;

    const score =
      WEIGHT.fit * levelFit(difficulty, options.context.cefrLevel) +
      WEIGHT.academic * academic +
      WEIGHT.weightInText * (input.candidate.occurrences / maxOccurrences) +
      WEIGHT.position * (1 - input.candidate.firstOccurrence / maxPosition) +
      WEIGHT.dictionary * (input.dictionary ? 1 : 0) +
      WEIGHT.multiword * multiword -
      APPARATUS_PENALTY * apparatus;

    /*
      Die Schreibweise wird hier festgelegt, nicht erst in der Oberfläche.

      Was `recommend` zurückgibt, geht unverändert in den Entwurf und von dort
      ins Paket. Ein `Military`, das nur deshalb groß ist, weil es einen Satz
      begann, wäre eine falsch gelernte Vokabel – und niemand sähe ihr das an.
    */
    const sentence = input.candidate.sourceSentence;
    const decision = resolveBaseForm(word, input.dictionary, sentence);
    const display = displayNameOf(word, input.dictionary, sentence);
    const candidate =
      display === word ? input.candidate : { ...input.candidate, english: display };

    /*
      Bleibt die Grundform offen, beansprucht die Form **alle** denkbaren
      Familien. Sonst stünde `lives` in der Liste und `life` gleich darunter –
      zwei Zeilen für eine Vokabel, und die Lehrkraft räumt hinterher auf.
      Angezeigt wird trotzdem die ehrliche Textform.
    */
    const claimed =
      decision.kind === 'unresolved'
        ? [
            ...familyKeys(display, input.dictionary),
            ...decision.options.map((option) => familyKey(option)),
          ]
        : familyKeys(display, input.dictionary);

    return {
      ...input,
      candidate,
      score,
      difficulty,
      family: familyKey(display, input.dictionary),
      families: [...new Set(claimed)],
      ...(decision.kind === 'unresolved' ? { baseFormHint: BASE_FORM_HINT } : {}),
    };
  });
}

/**
 * Die eigentliche Auswahl: bewerten, sortieren, Familien ausdünnen, abschneiden.
 *
 * Der Familienfilter läuft **nach** dem Sortieren, damit von `island` und
 * `islands` das besser bewertete überlebt und nicht das zufällig erste.
 */
export function recommend(
  inputs: readonly RecommendationInput[],
  options: RankOptions,
): ScoredCandidate[] {
  const scored = scoreCandidates(inputs, options);

  const ordered = [...scored].sort((left, right) => {
    switch (options.sort) {
      case 'hardest':
        return right.difficulty - left.difficulty || right.score - left.score;
      case 'frequency':
        return (
          right.candidate.occurrences - left.candidate.occurrences ||
          left.candidate.firstOccurrence - right.candidate.firstOccurrence
        );
      case 'text-order':
        return left.candidate.firstOccurrence - right.candidate.firstOccurrence;
      case 'recommended':
      default:
        // Bei Punktgleichstand entscheidet die Stellung im Text – deterministisch,
        // und nachvollziehbarer als eine zufällige Reihenfolge.
        return right.score - left.score || left.candidate.firstOccurrence - right.candidate.firstOccurrence;
    }
  });

  const excluded = new Set(options.excludedFamilies ?? []);
  const chosen: ScoredCandidate[] = [];
  for (const item of ordered) {
    const word = item.candidate.english;

    /*
      Was gar nicht erst in Frage kommt, wird **ausgeschlossen**, nicht nur
      abgewertet – und zwar bevor gezählt wird. Der Unterschied ist wichtig:
      Ein abgewerteter Kandidat rutscht bei einem armen Text doch wieder in die
      Liste, ein ausgeschlossener nicht. `issue` als Heftnummer und `four` als
      Zahlwort sind keine Vokabeln, egal wie wenig der Text sonst hergibt.
    */
    if (options.publicationContext === true && isApparatus(word)) continue;
    if (options.publicationContext === true && onlyInCitationLine(item.candidate)) continue;
    if (isTrivialWord(word, item.dictionary)) continue;

    // Ein Mehrwortbegriff beansprucht auch die Familien seiner Teile: Steht
    // `psychological casualties` schon da, ist `psychological` vergeben.
    if (item.families.some((family) => excluded.has(family))) continue;
    for (const family of item.families) excluded.add(family);
    chosen.push(item);
    if (chosen.length >= options.count) break;
  }

  /*
    Aufgefüllt wird bis zur gewünschten Anzahl, nicht bis zur ersten Lücke: Die
    Schleife läuft über **alle** bewerteten Kandidaten weiter, auch wenn
    zwischendurch zehn wegen ihrer Familie ausfallen. Gibt der Text am Ende
    weniger her, ist die Liste kürzer – erfunden wird nichts.
  */
  return chosen;
}

/* ------------------------------------------------------------- Nachlegen */

/** Was von einer Empfehlungszeile gebraucht wird, um sie nachzulegen. */
export interface ReplaceableRow {
  /** Der Kandidat – über seine Id wird die Zeile wiedererkannt. */
  candidate: TextCandidate;
  /** Nicht leer heißt: beantwortet, also unantastbar. */
  german: string;
  /** Alle Familien, die diese Zeile beansprucht. */
  families: readonly string[];
}

export interface ReplacementResult<Row extends ReplaceableRow> {
  /** Die neue aktuelle Liste: beantwortete zuerst, dann die frischen. */
  rows: Row[];
  /** Die zurückgelegten Zeilen, neueste zuerst. */
  earlier: Row[];
  /** Wie viele Empfehlungen tatsächlich nachgelegt wurden. */
  added: number;
  /** Wie viele angefordert waren – für die ehrliche Meldung. */
  requested: number;
}

export interface ReplacementOptions<Row extends ReplaceableRow> {
  /** Alle Kandidaten des Textes, mit Wörterbuchauskunft. */
  inputs: readonly RecommendationInput[];
  /** Die aktuelle Liste. */
  rows: readonly Row[];
  /** Die bisher zurückgelegten Zeilen. */
  earlier: readonly Row[];
  context: RecommendationContext;
  sort: RecommendationSort;
  /** Die gewünschte Gesamtzahl. */
  count: number;
  publicationContext?: boolean;
  /**
   * Sollen die schon gezeigten Familien ausgeschlossen werden?
   *
   * Beim „Offene Empfehlungen ersetzen“ ja – es sollen ausdrücklich **andere**
   * Wörter kommen. Bei geänderten Einstellungen nein: Ein Wort, das zum neuen
   * Niveau nun passt, darf wieder auftauchen.
   */
  excludeShown: boolean;
  /** Wie aus einem bewerteten Kandidaten eine Zeile wird. */
  toRow: (scored: ScoredCandidate) => Row;
}

/**
 * Legt Empfehlungen nach, ohne beantwortete anzurühren.
 *
 * Das ist die Rechnung hinter „Offene Empfehlungen ersetzen“, und sie steht
 * hier statt in der Komponente, damit sie sich ohne Oberfläche prüfen lässt.
 * Die Zusagen im Einzelnen:
 *
 * - **Beantwortete Zeilen bleiben unverändert** – dieselben Objekte, nicht
 *   nachgebaute. Wer zehn Minuten getippt hat, verliert davon nichts, auch
 *   nicht die Wortart oder einen übernommenen Vorschlag.
 * - **Nachgelegt wird genau die Lücke.** Zehn gewünscht, sieben beantwortet:
 *   drei neue.
 * - **Nichts kommt doppelt.** Ausgeschlossen sind die Familien der
 *   beantworteten Zeilen und – beim Ersetzen – die aller zurückgelegten.
 * - **Zurückgelegt statt weggeworfen.** Die offenen Zeilen wandern nach
 *   `earlier`, neueste zuerst.
 * - **Die echte Zahl.** Gibt der Text weniger her, steht das in `added` und
 *   `requested`; erfunden wird nichts.
 */
export function replaceOpenRecommendations<Row extends ReplaceableRow>(
  options: ReplacementOptions<Row>,
): ReplacementResult<Row> {
  const answered = options.rows.filter((row) => row.german.trim().length > 0);
  const open = options.rows.filter((row) => row.german.trim().length === 0);
  const earlier = [...open, ...options.earlier];

  const excluded = new Set<string>();
  for (const row of answered) for (const family of row.families) excluded.add(family);
  if (options.excludeShown) {
    for (const row of earlier) for (const family of row.families) excluded.add(family);
  }

  const requested = Math.max(0, options.count - answered.length);
  const fresh = recommend(options.inputs, {
    context: options.context,
    sort: options.sort,
    count: requested,
    excludedFamilies: excluded,
    ...(options.publicationContext === undefined
      ? {}
      : { publicationContext: options.publicationContext }),
  }).map(options.toRow);

  const rows = [...answered, ...fresh];

  /*
    Nichts steht gleichzeitig oben und unter „Frühere Empfehlungen“.

    Beim Neuberechnen (`excludeShown: false`) darf ein zurückgelegtes Wort
    zurückkommen – dann gehört es aber nach oben und nicht mehr in die
    Rückschau. Ohne diesen Schritt stand dieselbe Vokabel zweimal auf der
    Seite, einmal mit „Entfernen“ und einmal mit „Wieder aufnehmen“.
  */
  const current = new Set(rows.map((row) => row.candidate.id));
  const remaining = earlier.filter((row) => !current.has(row.candidate.id));

  return { rows, earlier: remaining, added: fresh.length, requested };
}

/** „3 neue Empfehlungen.“ – oder die ehrliche Auskunft, dass es weniger sind. */
export function describeReplacement(result: {
  added: number;
  requested: number;
}): string {
  if (result.requested === 0) return 'Es war keine Empfehlung offen.';
  if (result.added === 0) {
    return 'Der Text gibt keine weiteren Vokabeln her. Die bisherigen stehen unter „Frühere Empfehlungen“.';
  }
  const neue = result.added === 1 ? '1 neue Empfehlung' : `${result.added} neue Empfehlungen`;
  if (result.added < result.requested) {
    return (
      `${neue} – gewünscht waren ${result.requested}. ` +
      'Mehr geeignete Wörter enthält der Text nicht; erfunden wird nichts.'
    );
  }
  return `${neue}. Die ersetzten stehen unter „Frühere Empfehlungen“.`;
}

/**
 * Der GeR-Vorschlag zum Jahrgang – solange niemand ihn von Hand geändert hat.
 *
 * Der Override ist der Punkt: Wer das Niveau bewusst gesetzt hat, will es nicht
 * beim nächsten Jahrgangswechsel wieder verlieren.
 */
export function levelForGrade(
  grade: Grade,
  current: CefrLevel,
  overridden: boolean,
): CefrLevel {
  return overridden ? current : suggestCefrLevel(grade);
}
