/**
 * Lexikalische Familien: aus beobachteten Wortformen ein Vokabelwort machen.
 *
 * Die Textanalyse zählte bisher Schreibweisen. `island` und `islands` waren
 * damit zwei Vorschläge – für eine Vokabelliste ist das falsch. Diese Datei
 * fasst Formen desselben Wortes zu einer Familie zusammen und behält dabei
 * **alles**, was im Text stand: jede Form, ihre Häufigkeit und ihre Fundstelle.
 *
 * Die Leitidee ist Zurückhaltung. Ein Vokabeltrainer ohne Wörterbuch kann
 * englische Morphologie nicht sicher auflösen; er kann nur entscheiden, wann er
 * sich sicher genug ist. Deshalb gibt es zwei Stufen:
 *
 * - **Sichere Regeln** greifen auch dann, wenn die Grundform im Text gar nicht
 *   vorkommt: reguläre Plurale und eine kurze Liste zuverlässiger
 *   unregelmäßiger Plurale. `islands` allein wird damit zu `island`.
 * - **Belegpflichtige Regeln** greifen nur, wenn die Grundform im selben Text
 *   ebenfalls steht: `-ed`, `-ing` und die Steigerung gehören dazu. `water`
 *   dürfte niemals zu `wat` werden – und `crowded` ist im Zweifel das
 *   Adjektiv und nicht die Vergangenheit von `crowd`. Steht `visit` im Text,
 *   ist die Sache klar; steht es nicht da, bleibt `crowded` stehen.
 *
 * Was unsicher bleibt, bleibt getrennt. Zwei Vorschläge sind ein kleiner
 * Schönheitsfehler; zwei zusammengeworfene Wörter sind ein fachlicher Fehler.
 *
 * Alles hier ist rein, deterministisch und offline.
 */

export type FormRelation =
  | 'base'
  | 'plural'
  | 'third-person'
  | 'past'
  | 'progressive'
  | 'comparative'
  | 'superlative';

export const RELATION_LABELS: Readonly<Record<FormRelation, string>> = {
  base: 'Grundform',
  plural: 'Plural',
  'third-person': '3. Person Singular',
  past: 'Vergangenheit',
  progressive: 'Verlaufsform',
  comparative: 'Steigerung',
  superlative: 'Höchststufe',
};

/**
 * Wörter auf `-s`, die keine Plurale sind – oder deren Singular so selten
 * gemeint ist, dass eine Zusammenführung mehr kaputt macht als sie hilft.
 *
 * `glasses` steht bewusst hier: Als Brille ist es kein Plural von `glass`, und
 * welche Bedeutung ein Text meint, kann diese Datei nicht wissen.
 */
const INVARIANT_S = new Set([
  'news',
  'series',
  'species',
  'means',
  'glasses',
  'mathematics',
  'physics',
  'politics',
  'economics',
  'ethics',
  'statistics',
  'gymnastics',
  'athletics',
  'measles',
  'mumps',
  'scissors',
  'trousers',
  'pants',
  'jeans',
  'shorts',
  'clothes',
  'thanks',
  'stairs',
  'goods',
  'headquarters',
  'crossroads',
  'works',
  'lens',
  'bus',
  'gas',
  'plus',
  'campus',
  'virus',
  'status',
  'focus',
  'bonus',
  'atlas',
  'canvas',
  'chaos',
  'always',
  'perhaps',
  'analysis',
  'basis',
  'crisis',
  'thesis',
  'hypothesis',
  'oasis',
  'diagnosis',
  'emphasis',
  'this',
  'his',
  'its',
  'us',
  'yes',
  'plastics',
]);

/**
 * Wörter, die zufällig auf `-ed`, `-ing`, `-er` oder `-est` enden, ohne eine
 * gebeugte Form zu sein. Hier wohnt die Unregelmäßigkeit des Englischen –
 * sichtbar und prüfbar statt in einer klugen Heuristik versteckt.
 */
const NOT_INFLECTED = new Set([
  // -ed
  'bed',
  'red',
  'wed',
  'fed',
  'led',
  'shed',
  'sled',
  'speed',
  'need',
  'feed',
  'deed',
  'breed',
  'creed',
  'greed',
  'seed',
  'weed',
  'indeed',
  'exceed',
  'proceed',
  'succeed',
  'sacred',
  'hundred',
  // -ing
  'thing',
  'king',
  'ring',
  'sing',
  'wing',
  'string',
  'spring',
  'bring',
  'during',
  'ceiling',
  'evening',
  'morning',
  'nothing',
  'something',
  'anything',
  'everything',
  'building',
  'feeling',
  'meaning',
  'painting',
  'writing',
  'clothing',
  'shopping',
  'swimming',
  'sibling',
  'viking',
  // -er / -est
  'water',
  'other',
  'after',
  'over',
  'under',
  'never',
  'ever',
  'either',
  'weather',
  'together',
  'number',
  'winter',
  'summer',
  'member',
  'paper',
  'river',
  'letter',
  'centre',
  'center',
  'computer',
  'teacher',
  'answer',
  'chapter',
  'quarter',
  'shelter',
  'forest',
  'interest',
  'honest',
  'guest',
  'west',
  'rest',
  'best',
  'test',
  'nest',
  'request',
  'protest',
]);

/** Unregelmäßige Plurale, bei denen die Zuordnung eindeutig ist. */
const IRREGULAR_PLURALS: Readonly<Record<string, string>> = {
  children: 'child',
  men: 'man',
  women: 'woman',
  feet: 'foot',
  teeth: 'tooth',
  geese: 'goose',
  mice: 'mouse',
  knives: 'knife',
  leaves: 'leaf',
  lives: 'life',
  wolves: 'wolf',
  halves: 'half',
  shelves: 'shelf',
  wives: 'wife',
  thieves: 'thief',
  loaves: 'loaf',
};

/** Kürzeste Grundform, die eine Regel erzeugen darf. */
const MIN_STEM = 3;

function isVowel(char: string): boolean {
  return 'aeiou'.includes(char);
}

/** `y` gilt als Vokal, wenn davor ein Konsonant steht (`happy`, nicht `yes`). */
function isVowelAt(word: string, index: number): boolean {
  const char = word[index] ?? '';
  if (isVowel(char)) return true;
  if (char !== 'y') return false;
  return index > 0 && !isVowelAt(word, index - 1);
}

/**
 * Zahl der Vokal-Konsonant-Wechsel – ein grobes Maß für Silbigkeit.
 *
 * `lik` (aus `liked`) hat 1, `visit` hat 2. Genau daran hängt, ob ein stummes
 * `e` gestrichen wurde: aus `lik` wird `like`, aus `visit` bleibt `visit`.
 */
function measure(stem: string): number {
  let count = 0;
  let previousVowel = false;
  for (let index = 0; index < stem.length; index += 1) {
    const vowel = isVowelAt(stem, index);
    if (previousVowel && !vowel) count += 1;
    previousVowel = vowel;
  }
  return count;
}

/** Endet der Stamm auf Konsonant–Vokal–Konsonant (ohne `w`, `x`, `y`)? */
function endsCvc(stem: string): boolean {
  const last = stem.length - 1;
  if (last < 2) return false;
  if (isVowelAt(stem, last) || !isVowelAt(stem, last - 1) || isVowelAt(stem, last - 2)) {
    return false;
  }
  return !'wxy'.includes(stem[last] ?? '');
}

/** Verdoppelter Endkonsonant wie in `stopped` oder `running`. */
function undoubleFinal(stem: string): string | undefined {
  const last = stem.at(-1) ?? '';
  const before = stem.at(-2) ?? '';
  if (last !== before) return undefined;
  if (isVowel(last) || last === 'l' || last === 's' || last === 'z') return undefined;
  return stem.slice(0, -1);
}

/**
 * Macht aus einem abgeschnittenen Stamm eine plausible Grundform – und nennt
 * ehrlich die zweitbeste Möglichkeit.
 *
 * Ohne Wörterbuch ist `visited → visit` und `liked → like` nicht in einer Regel
 * zu haben; beide Stämme enden auf Konsonant. Deshalb entscheidet die Silbigkeit
 * über den ersten Vorschlag, und die Alternative bleibt erhalten, damit ein Beleg
 * im Text sie später bestätigen kann.
 */
function restoreStem(stem: string): { lemma: string; alternate: string } {
  const undoubled = undoubleFinal(stem);
  if (undoubled && undoubled.length >= MIN_STEM) return { lemma: undoubled, alternate: stem };
  // `created`, `enabled`, `realized`: hier ist das stumme `e` sicher.
  if (/(?:at|bl|iz)$/.test(stem)) return { lemma: `${stem}e`, alternate: stem };
  if (measure(stem) === 1 && endsCvc(stem)) return { lemma: `${stem}e`, alternate: stem };
  return { lemma: stem, alternate: `${stem}e` };
}

export interface FormAnalysis {
  /** Vermutete Grundform. */
  lemma: string;
  /**
   * Weitere denkbare Grundformen. Sie gelten nur, wenn sie im selben Text
   * belegt sind – `larger` zeigt so auf `large`, ohne `larg` zu erfinden.
   */
  alternates: readonly string[];
  relation: FormRelation;
  /**
   * `true`, wenn die Regel auch ohne Beleg im Text greifen darf.
   * `false` heißt: nur zusammenführen, wenn eine Kandidatenform im Text vorkommt.
   */
  confident: boolean;
}

/**
 * Analysiert **eine** normalisierte Form.
 *
 * Kennt keinen Kontext und trifft deshalb keine endgültige Entscheidung – das
 * tut `buildFamilies` mit Blick auf den ganzen Text.
 */
export function analyzeForm(normalized: string): FormAnalysis {
  const word = normalized.toLowerCase();
  const base: FormAnalysis = { lemma: word, alternates: [], relation: 'base', confident: true };

  if (word.length < 4) return base;
  if (INVARIANT_S.has(word) || NOT_INFLECTED.has(word)) return base;

  const irregular = IRREGULAR_PLURALS[word];
  if (irregular) {
    return { lemma: irregular, alternates: [], relation: 'plural', confident: true };
  }

  // ---- Plural und 3. Person: beide enden auf -s ----------------------------
  if (word.endsWith('ies') && word.length >= 5 && !isVowel(word.at(-4) ?? 'a')) {
    return {
      lemma: `${word.slice(0, -3)}y`,
      alternates: [],
      relation: 'plural',
      confident: true,
    };
  }
  if (/(?:ch|sh|ss|x|z)es$/.test(word)) {
    return { lemma: word.slice(0, -2), alternates: [], relation: 'plural', confident: true };
  }
  if (
    word.endsWith('s') &&
    !word.endsWith('ss') &&
    !word.endsWith('us') &&
    !word.endsWith('is') &&
    !word.endsWith('os')
  ) {
    const stem = word.slice(0, -1);
    if (stem.length >= MIN_STEM) {
      // `houses` → `house`, aber `buses` → `bus`: welche der beiden Formen
      // gemeint ist, entscheidet der Beleg im Text.
      const alternates = stem.endsWith('e') ? [stem.slice(0, -1)] : [`${stem}e`];
      return { lemma: stem, alternates, relation: 'plural', confident: true };
    }
  }

  // ---- Verlaufsform --------------------------------------------------------
  if (word.endsWith('ing')) {
    const stem = word.slice(0, -3);
    if (stem.length >= MIN_STEM) {
      const { lemma, alternate } = restoreStem(stem);
      return { lemma, alternates: [alternate], relation: 'progressive', confident: false };
    }
  }

  // ---- Vergangenheit -------------------------------------------------------
  if (word.endsWith('ied') && word.length >= 5) {
    return { lemma: `${word.slice(0, -3)}y`, alternates: [], relation: 'past', confident: true };
  }
  if (word.endsWith('ed')) {
    const stem = word.slice(0, -2);
    if (stem.length >= MIN_STEM) {
      const { lemma, alternate } = restoreStem(stem);
      return { lemma, alternates: [alternate], relation: 'past', confident: false };
    }
  }

  // ---- Steigerung: nur mit Beleg im selben Text -----------------------------
  if (word.endsWith('est') && word.length >= 6) {
    const stem = word.slice(0, -3);
    const { lemma, alternate } = restoreStem(stem);
    return { lemma, alternates: [alternate], relation: 'superlative', confident: false };
  }
  if (word.endsWith('er') && word.length >= 5) {
    const stem = word.slice(0, -2);
    const { lemma, alternate } = restoreStem(stem);
    return { lemma, alternates: [alternate], relation: 'comparative', confident: false };
  }

  return base;
}

/**
 * Ist `form` eine gebeugte Form von `headword`?
 *
 * Bewusst einseitig: Nur die gebeugte Form darf auf das Stichwort zeigen, nie
 * umgekehrt. So findet ein Lückentext zu „island“ auch „islands“ im Satz, ohne
 * dass zwei zufällig verwandte Stichwörter miteinander verschmelzen.
 */
export function isFormOf(form: string, headword: string): boolean {
  const left = form.toLowerCase();
  const right = headword.toLowerCase();
  if (left === right) return true;

  const analysis = analyzeForm(left);
  return analysis.lemma === right || analysis.alternates.includes(right);
}

// ---------------------------------------------------------------------------
// Familien
// ---------------------------------------------------------------------------

/** Eine im Text beobachtete Wortform mit allem, was daran hängt. */
export interface FormObservation {
  /** Normalisierte Vergleichsform. */
  normalized: string;
  /** Anzeigeform, wie sie im Text steht. */
  display: string;
  occurrences: number;
  /** Zeichenoffset der ersten Fundstelle. */
  firstOccurrence: number;
  sentenceIndex: number;
  sourceSentence: string;
}

export interface FamilyForm {
  normalized: string;
  display: string;
  occurrences: number;
  relation: FormRelation;
  firstOccurrence: number;
  sourceSentence: string;
}

export interface LexicalFamily {
  /** Normalisierte Grundform – die Identität der Familie. */
  lemma: string;
  /** Anzeigeform der Grundform; steht sie nicht im Text, die häufigste Form. */
  display: string;
  /** Alle beobachteten Formen, häufigste zuerst. */
  forms: FamilyForm[];
  /** Summe über alle Formen. */
  occurrences: number;
  /** Früheste Fundstelle der ganzen Familie. */
  firstOccurrence: number;
  sentenceIndex: number;
  sourceSentence: string;
  /** `true`, sobald mehr als eine Form zusammengeführt wurde. */
  merged: boolean;
}

/**
 * Baut aus beobachteten Formen die lexikalischen Familien.
 *
 * Zweistufig, damit belegpflichtige Regeln überhaupt einen Beleg haben können:
 * Erst wird festgestellt, welche Formen im Text stehen, dann entscheidet jede
 * Form, ob sie sich einer anderen anschließt.
 */
export function buildFamilies(observations: readonly FormObservation[]): LexicalFamily[] {
  const observed = new Set(observations.map((item) => item.normalized));

  /**
   * Eine Grundform ist brauchbar, wenn sie nicht die Form selbst ist und nicht
   * ihrerseits gebeugt aussieht – sonst entstünde eine Kette, deren Ende
   * niemand mehr nachvollzieht.
   */
  const usableLemma = (form: string, lemma: string): boolean => {
    if (lemma === form || lemma.length < MIN_STEM) return false;
    const own = analyzeForm(lemma);
    // Ein Kettenglied wäre nur eine Form, die *sicher* gebeugt ist. `cover`
    // sieht mit seinem `-er` nur so aus – deshalb darf `covers` dorthin zeigen.
    return own.lemma === lemma || !own.confident;
  };

  /** Endgültige Zuordnung Form → Familie. */
  const assignment = new Map<string, FormAnalysis>();
  for (const item of observations) {
    const analysis = analyzeForm(item.normalized);

    // Ein Beleg im Text schlägt jede Regel: steht `large` da, zeigt `larger`
    // dorthin und nicht auf das erfundene `larg`.
    const attested = [analysis.lemma, ...analysis.alternates].find(
      (candidate) => observed.has(candidate) && usableLemma(item.normalized, candidate),
    );
    const fallback =
      analysis.confident && usableLemma(item.normalized, analysis.lemma)
        ? analysis.lemma
        : undefined;
    const lemma = attested ?? fallback;

    assignment.set(
      item.normalized,
      lemma === undefined
        ? { ...analysis, lemma: item.normalized, alternates: [], relation: 'base' }
        : { ...analysis, lemma },
    );
  }

  const families = new Map<string, LexicalFamily>();
  for (const item of observations) {
    const analysis = assignment.get(item.normalized);
    const lemma = analysis?.lemma ?? item.normalized;
    const relation = analysis?.relation ?? 'base';

    const form: FamilyForm = {
      normalized: item.normalized,
      display: item.display,
      occurrences: item.occurrences,
      relation: lemma === item.normalized ? 'base' : relation,
      firstOccurrence: item.firstOccurrence,
      sourceSentence: item.sourceSentence,
    };

    const existing = families.get(lemma);
    if (!existing) {
      families.set(lemma, {
        lemma,
        display: item.display,
        forms: [form],
        occurrences: item.occurrences,
        firstOccurrence: item.firstOccurrence,
        sentenceIndex: item.sentenceIndex,
        sourceSentence: item.sourceSentence,
        merged: false,
      });
      continue;
    }

    existing.forms.push(form);
    existing.occurrences += item.occurrences;
    existing.merged = true;
    if (item.firstOccurrence < existing.firstOccurrence) {
      existing.firstOccurrence = item.firstOccurrence;
      existing.sentenceIndex = item.sentenceIndex;
      existing.sourceSentence = item.sourceSentence;
    }
  }

  for (const family of families.values()) {
    // Häufigste Form zuerst, bei Gleichstand die frühere im Text.
    family.forms.sort(
      (a, b) =>
        b.occurrences - a.occurrences ||
        a.firstOccurrence - b.firstOccurrence ||
        a.normalized.localeCompare(b.normalized),
    );

    // `-s` ist im Englischen Plural *oder* 3. Person Singular. Stehen in
    // derselben Familie `-ed` oder `-ing`, ist das Wort ein Verb – dann wäre
    // „Plural: visits“ schlicht falscher Unterricht.
    const verb = family.forms.some(
      (form) => form.relation === 'past' || form.relation === 'progressive',
    );
    if (verb) {
      for (const form of family.forms) {
        if (form.relation === 'plural') form.relation = 'third-person';
      }
    }

    // Als Stichwort steht die Grundform – sofern sie im Text vorkam, in ihrer
    // dortigen Schreibweise, sonst rekonstruiert aus der häufigsten Form.
    const baseForm = family.forms.find((form) => form.normalized === family.lemma);
    family.display = baseForm?.display ?? family.lemma;
  }

  return [...families.values()];
}

/** „Im Text: island, islands · insgesamt 18-mal“ – ehrlich und knapp. */
export function describeForms(family: {
  forms: readonly FamilyForm[];
  occurrences: number;
}): string {
  const forms = family.forms.map((form) => form.display).join(', ');
  return `Im Text: ${forms} · insgesamt ${family.occurrences}-mal`;
}

/** „Plural: islands“ – nur für die Formen, die nicht die Grundform sind. */
export function describeInflections(family: { forms: readonly FamilyForm[] }): string[] {
  return family.forms
    .filter((form) => form.relation !== 'base')
    .map((form) => `${RELATION_LABELS[form.relation]}: ${form.display}`);
}
