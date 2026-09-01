import type { TextCandidate } from '../domain/textExtraction';
import { type CefrLevel, type Grade, suggestCefrLevel } from '../domain/cefr';
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
}

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
 * Ein Mehrwortbegriff beansprucht auch seine Teile. Das ist der Unterschied
 * zwischen einer brauchbaren und einer peinlichen Liste: `Psychological
 * casualties` und `psychological` nebeneinander vorzuschlagen sieht aus, als
 * hätte niemand hingesehen – und für die Lerngruppe ist es dieselbe Vokabel
 * zweimal, einmal mit und einmal ohne ihren Sinn.
 *
 * Welcher der beiden überlebt, entscheidet die Punktzahl, nicht die
 * Reihenfolge: `recommend` dünnt **nach** dem Sortieren aus.
 */
export function familyKeys(
  word: string,
  dictionary?: DictionarySuggestionSummary,
): readonly string[] {
  const whole = familyKey(word, dictionary);
  const parts = whole.split(/\s+/);
  if (parts.length === 1) return [whole];
  return [whole, ...parts.map((part) => stem(part))];
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

    return {
      ...input,
      score,
      difficulty,
      family: familyKey(word, input.dictionary),
      families: familyKeys(word, input.dictionary),
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
    // Ein Mehrwortbegriff beansprucht auch die Familien seiner Teile: Steht
    // `Psychological casualties` schon da, ist `psychological` vergeben.
    if (item.families.some((family) => excluded.has(family))) continue;
    for (const family of item.families) excluded.add(family);
    chosen.push(item);
    if (chosen.length >= options.count) break;
  }
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
