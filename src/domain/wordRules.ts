import type { PartOfSpeech } from './schema';

/**
 * Sichere, nachvollziehbare Vorschläge ohne jedes Modell.
 *
 * Leitsatz: **Im Zweifel kein Vorschlag.** Eine erfundene Wortart ist schlimmer
 * als eine leere Spalte, weil sie geprüft aussieht. Jede Regel hier lässt sich
 * in einem Satz erklären, ist rein und liefert für dasselbe Material immer
 * dasselbe Ergebnis.
 *
 * Bewusst **keine** Bibliothek: Für diese Handvoll eindeutiger Muster wäre eine
 * NLP-Abhängigkeit (compromise ~ 250 kB, wink-pos-tagger ~ 1 MB Lexikon) reine
 * Bundle-Last ohne Zugewinn an Verlässlichkeit – ein englischer Tagger ohne
 * Satzkontext rät bei „book", „light" oder „run" genauso wie wir, nur weniger
 * sichtbar. Sollte sich das ändern, gehören Lizenz, Bundle-Effekt und ein
 * belegbarer Nutzen vorher in diese Datei.
 */

export interface RuleSuggestion {
  partOfSpeech?: PartOfSpeech;
  /** Warum – in einem Satz, für die Oberfläche. */
  reason?: string;
}

/** Häufige englische Präpositionen; alles darin ist eindeutig. */
const PREPOSITIONS = new Set([
  'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around',
  'at', 'before', 'behind', 'below', 'beneath', 'beside', 'between', 'beyond',
  'by', 'despite', 'during', 'except', 'for', 'from', 'in', 'inside', 'into',
  'near', 'of', 'off', 'onto', 'opposite', 'outside', 'over', 'since',
  'through', 'throughout', 'towards', 'toward', 'under', 'underneath', 'until',
  'upon', 'via', 'with', 'within', 'without',
]);

/**
 * Wörter auf `-ly`, die **keine** Adverbien sind. Die Liste ist der Grund,
 * warum die `-ly`-Regel überhaupt verlässlich ist.
 */
const LY_EXCEPTIONS = new Set([
  'ally', 'anomaly', 'apply', 'assembly', 'belly', 'bully', 'comply', 'costly',
  'cuddly', 'daily', 'deadly', 'early', 'elderly', 'family', 'fly', 'friendly',
  'holy', 'italy', 'jelly', 'jolly', 'likely', 'lively', 'lonely', 'lovely',
  'lowly', 'melancholy', 'monopoly', 'multiply', 'only', 'rally', 'rely',
  'reply', 'silly', 'supply', 'ugly', 'weekly', 'yearly',
]);

/** Wörter, die als Verb und Substantiv gleich häufig sind – nie raten. */
const AMBIGUOUS = new Set([
  'answer', 'book', 'change', 'cook', 'drink', 'fish', 'help', 'hope', 'light',
  'love', 'match', 'move', 'name', 'order', 'paint', 'place', 'plan', 'play',
  'point', 'present', 'question', 'rain', 'record', 'rest', 'run', 'show',
  'smile', 'sound', 'star', 'start', 'store', 'study', 'talk', 'travel',
  'visit', 'walk', 'watch', 'water', 'work',
]);

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Wortart aus dem Stichwort – nur bei eindeutigen Mustern.
 *
 * `sentence` ist optional und wird nur für eine einzige, ebenso eindeutige
 * Regel benutzt: Steht direkt vor der Vokabel ein Artikel, ist sie ein
 * Substantiv.
 */
export function guessPartOfSpeech(english: string, sentence?: string): RuleSuggestion {
  const word = normalize(english);
  if (word.length === 0) return {};

  // 1. Infinitiv mit „to" – im Vokabelheft die übliche Verbform.
  if (/^to\s+\p{L}/u.test(word)) {
    return { partOfSpeech: 'verb', reason: '„to …" steht für den Infinitiv.' };
  }

  // 2. Eine einzelne Präposition ist eine Präposition.
  if (PREPOSITIONS.has(word)) {
    return { partOfSpeech: 'preposition', reason: 'gehört zu den festen Präpositionen.' };
  }

  // 3. Mehrere Wörter ohne „to" behandeln wir als Wendung.
  if (word.includes(' ')) {
    return { partOfSpeech: 'phrase', reason: 'besteht aus mehreren Wörtern.' };
  }

  // 4. Eindeutige Adverbien auf „-ly".
  if (word.endsWith('ly') && word.length > 4 && !LY_EXCEPTIONS.has(word)) {
    return { partOfSpeech: 'adverb', reason: 'Endung „-ly" ohne bekannte Ausnahme.' };
  }

  // 5. Artikel im Beispielsatz – nur, wenn er wirklich direkt davor steht.
  if (sentence && !AMBIGUOUS.has(word) && precededByArticle(sentence, english.trim())) {
    return { partOfSpeech: 'noun', reason: 'steht im Beispielsatz hinter einem Artikel.' };
  }

  return {};
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Steht im Satz unmittelbar `a`, `an` oder `the` vor der Vokabel? */
export function precededByArticle(sentence: string, word: string): boolean {
  const pattern = new RegExp(
    `(^|[^\\p{L}])(a|an|the)\\s+${escapeRegExp(word)}(?![\\p{L}\\p{N}'-])`,
    'iu',
  );
  return pattern.test(sentence);
}

/**
 * Das Thema des Pakets als Themen-Tag.
 *
 * Normalisiert wird nur, was sich sicher normalisieren lässt: Leerraum. Ein
 * bereits vorhandener Tag – auch in anderer Groß-/Kleinschreibung – führt zu
 * keinem Vorschlag, sonst stünde derselbe Begriff zweimal im Paket.
 */
export function suggestTopicTag(topic: string, existingTags: readonly string[]): string | undefined {
  const tag = topic.trim().replace(/\s+/g, ' ');
  if (tag.length === 0) return undefined;
  const known = new Set(existingTags.map((existing) => normalize(existing)));
  return known.has(normalize(tag)) ? undefined : tag;
}

/**
 * Schwierigkeit **bewusst ohne Regel.**
 *
 * Aus Wortlänge oder Silbenzahl eine Zahl von 1 bis 5 zu bilden, sähe präzise
 * aus und wäre geraten: „nevertheless" ist lang und für die Oberstufe leicht,
 * „yet" ist kurz und schwierig. Ohne Sprachmodell bleibt das Feld deshalb leer.
 */
export const DIFFICULTY_NEEDS_MODEL = true;
