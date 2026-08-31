/**
 * Abkürzungen im Text erkennen, auflösen – oder ehrlich als ungeklärt melden.
 *
 * Die Wortsegmentierung zerlegt „600 sq mi“ in `sq` und `mi`. Beides sind für
 * sich genommen keine Vokabeln, und beides wandert ungefiltert in die
 * Vorschlagsliste. Diese Datei erkennt solche Stellen als **eine** Einheit,
 * bevor überhaupt gezählt und begrenzt wird.
 *
 * Zwei Regeln bestimmen alles Weitere:
 *
 * 1. **Nichts erfinden.** Eine Abkürzung, die das Lexikon nicht kennt, wird als
 *    Abkürzung gekennzeichnet und bekommt den Hinweis, dass die Langform zu
 *    prüfen ist. Eine geratene Langform wäre schlechter als gar keine.
 * 2. **Kontext entscheidet.** Maßeinheiten gelten nur direkt hinter einer Zahl.
 *    Ohne diese Bedingung würde aus „She lives in Berlin“ ein Zoll.
 *
 * Rein, deterministisch, offline. Kein Dienst, kein Wörterbuch, kein Netz.
 */

export const UNKNOWN_ABBREVIATION_HINT = 'Abkürzung – Langform prüfen';

export type AbbreviationKind = 'unit' | 'acronym';

export interface AbbreviationDefinition {
  /** Ausgeschriebene englische Form, z. B. „square mile“. */
  readonly longForm: string;
  /** Deutsche Entsprechung, soweit eindeutig – sonst leer. */
  readonly german: string;
  readonly kind: AbbreviationKind;
}

/**
 * Maßeinheiten. Sie gelten **nur** unmittelbar hinter einer Zahl.
 *
 * Mehrdeutige Kürzel fehlen bewusst: `m` kann Meter oder Million sein, `in`
 * ist häufiger eine Präposition als ein Zoll. Ein falsch aufgelöstes Kürzel
 * kostet mehr Vertrauen, als ein fehlendes Kürzel Nutzen bringt.
 */
export const UNIT_ABBREVIATIONS: Readonly<Record<string, AbbreviationDefinition>> = {
  'sq mi': { longForm: 'square mile', german: 'die Quadratmeile', kind: 'unit' },
  'sq km': { longForm: 'square kilometre', german: 'der Quadratkilometer', kind: 'unit' },
  'sq ft': { longForm: 'square foot', german: 'der Quadratfuß', kind: 'unit' },
  'km²': { longForm: 'square kilometre', german: 'der Quadratkilometer', kind: 'unit' },
  km2: { longForm: 'square kilometre', german: 'der Quadratkilometer', kind: 'unit' },
  'm²': { longForm: 'square metre', german: 'der Quadratmeter', kind: 'unit' },
  'km/h': { longForm: 'kilometres per hour', german: 'Kilometer pro Stunde', kind: 'unit' },
  mph: { longForm: 'miles per hour', german: 'Meilen pro Stunde', kind: 'unit' },
  km: { longForm: 'kilometre', german: 'der Kilometer', kind: 'unit' },
  cm: { longForm: 'centimetre', german: 'der Zentimeter', kind: 'unit' },
  mm: { longForm: 'millimetre', german: 'der Millimeter', kind: 'unit' },
  kg: { longForm: 'kilogram', german: 'das Kilogramm', kind: 'unit' },
  lb: { longForm: 'pound', german: 'das Pfund', kind: 'unit' },
  lbs: { longForm: 'pound', german: 'das Pfund', kind: 'unit' },
  ft: { longForm: 'foot', german: 'der Fuß', kind: 'unit' },
  yd: { longForm: 'yard', german: 'das Yard', kind: 'unit' },
  mi: { longForm: 'mile', german: 'die Meile', kind: 'unit' },
  ha: { longForm: 'hectare', german: 'das Hektar', kind: 'unit' },
  '°c': { longForm: 'degrees Celsius', german: 'Grad Celsius', kind: 'unit' },
  '°f': { longForm: 'degrees Fahrenheit', german: 'Grad Fahrenheit', kind: 'unit' },
};

/**
 * Akronyme und feste Kürzel, die auch ohne Zahl eindeutig sind.
 *
 * Der Schlüssel ist kleingeschrieben und ohne Punkte; die Erkennung achtet
 * darauf, dass Großschreibung oder Punkte tatsächlich im Text stehen.
 */
export const ACRONYM_ABBREVIATIONS: Readonly<Record<string, AbbreviationDefinition>> = {
  unesco: {
    longForm: 'United Nations Educational, Scientific and Cultural Organization',
    german: 'die UNESCO',
    kind: 'acronym',
  },
  un: { longForm: 'United Nations', german: 'die Vereinten Nationen', kind: 'acronym' },
  uk: { longForm: 'United Kingdom', german: 'das Vereinigte Königreich', kind: 'acronym' },
  usa: { longForm: 'United States of America', german: 'die USA', kind: 'acronym' },
  eu: { longForm: 'European Union', german: 'die Europäische Union', kind: 'acronym' },
  nato: {
    longForm: 'North Atlantic Treaty Organization',
    german: 'die NATO',
    kind: 'acronym',
  },
  ad: { longForm: 'anno Domini', german: 'nach Christus', kind: 'acronym' },
  bc: { longForm: 'before Christ', german: 'vor Christus', kind: 'acronym' },
  eg: { longForm: 'for example', german: 'zum Beispiel', kind: 'acronym' },
  ie: { longForm: 'that is', german: 'das heißt', kind: 'acronym' },
  etc: { longForm: 'et cetera', german: 'und so weiter', kind: 'acronym' },
  approx: { longForm: 'approximately', german: 'ungefähr', kind: 'acronym' },
};

/** Kürzel, die nur mit Punkten gemeint sind – „eg“ als Wort gibt es nicht. */
const DOTTED_ONLY = new Set(['eg', 'ie', 'etc', 'approx']);

// ---------------------------------------------------------------------------
// Redaktionelle Reste (Wikipedia & Co.)
// ---------------------------------------------------------------------------

/**
 * Fußnoten, Bearbeitungslinks und Navigationstexte. Sie stehen in jedem
 * kopierten Wikipedia-Absatz und haben in einer Vokabelliste nichts verloren.
 */
const EDITORIAL_PATTERNS: readonly RegExp[] = [
  // [1] [12] [citation needed] [edit] [note 2] [clarification needed] [a]
  /\[\s*(?:\d+|[a-z]|citation needed|clarification needed|edit|note \d+|who\?|when\?|sic)\s*\]/gi,
  /\bJump to (?:navigation|search|content)\b/gi,
  /\bRetrieved (?:from|on)\b/gi,
  /\bThis (?:page|article) was last edited on\b/gi,
  /\bHidden categories\s*:/gi,
  /\bCategories\s*:/gi,
  /\bFrom Wikipedia, the free encyclopedia\b/gi,
  /\bText is available under the Creative Commons\b/gi,
  /\bISBN\s+[\d-]+/gi,
  /\b(?:doi|PMID|arXiv)\s*:\s*\S+/gi,
  /\[\s*(?:\d+\]\[\d+)*\s*\]/g,
];

/**
 * Ersetzt redaktionelle Marker längentreu durch Leerzeichen.
 *
 * Längentreu, damit alle Zeichenoffsets des Satzes gültig bleiben – dieselbe
 * Technik, mit der die Textanalyse schon URLs ausblendet.
 */
export function maskEditorialMarkers(sentence: string): string {
  let masked = sentence;
  for (const pattern of EDITORIAL_PATTERNS) {
    masked = masked.replace(pattern, (match) => ' '.repeat(match.length));
  }
  return masked;
}

// ---------------------------------------------------------------------------
// Erkennung
// ---------------------------------------------------------------------------

export interface AbbreviationMatch {
  /** Die Abkürzung, wie sie im Satz steht („sq mi“). */
  readonly abbreviation: string;
  /** Vergleichsform: klein, ohne Punkte, einfache Leerzeichen. */
  readonly normalized: string;
  /** Zeichenoffset im übergebenen Satz. */
  readonly offset: number;
  readonly length: number;
  /** Fehlt, wenn die Langform unbekannt ist – dann wird nichts erfunden. */
  readonly definition?: AbbreviationDefinition;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** „sq mi“ → `sq\.?\s*mi\.?` – Punkte und Leerzeichen sind im Text beliebig. */
function unitSource(key: string): string {
  return key
    .split(' ')
    .map((part) => escapeRegExp(part))
    .join('\\.?\\s*');
}

const UNIT_KEYS = Object.keys(UNIT_ABBREVIATIONS).sort((a, b) => b.length - a.length);

/** Direkt hinter einer Zahl – das ist die Bedingung, die Einheiten eindeutig macht. */
const UNIT_PATTERN = new RegExp(
  `(?<=\\d[\\d.,]*\\s{0,2})(?:${UNIT_KEYS.map(unitSource).join('|')})\\.?(?![\\p{L}\\d])`,
  'giu',
);

const ACRONYM_KEYS = Object.keys(ACRONYM_ABBREVIATIONS).sort((a, b) => b.length - a.length);

/** Akronyme: entweder in Großbuchstaben oder mit Punkten geschrieben. */
const ACRONYM_PATTERN = new RegExp(
  `(?<![\\p{L}.])(?:${ACRONYM_KEYS.map((key) => key.split('').map(escapeRegExp).join('\\.?')).join('|')})\\.?(?![\\p{L}])`,
  'giu',
);

/**
 * Abkürzungsverdacht ohne Lexikoneintrag.
 *
 * Zwei Formen: ein sehr kurzes Kürzel ohne Vokal direkt hinter einer Zahl
 * („600 zz“), oder ein Wort mit Punkten im Inneren („a.m.“). Beides kommt in
 * normaler englischer Prosa nicht vor – deshalb ist die Verwechslungsgefahr
 * mit echten kurzen Wörtern gering, und „5 men“ bleibt unangetastet.
 */
const UNKNOWN_UNIT_PATTERN = /(?<=\d[\d.,]*\s{0,2})(\p{L}{1,4})\.?(?![\p{L}\d])/gu;
const DOTTED_PATTERN = /(?<![\p{L}.])\p{L}(?:\.\p{L}){1,3}\.?(?![\p{L}])/gu;

function normalizeAbbreviation(raw: string): string {
  return raw.replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function hasVowel(value: string): boolean {
  return /[aeiouy]/i.test(value);
}

/**
 * Findet alle Abkürzungen eines Satzes, überschneidungsfrei und in Textreihenfolge.
 *
 * Redaktionelle Marker werden vorher ausgeblendet: eine Fußnote `[1]` soll
 * nicht als unbekannte Abkürzung durchgehen.
 */
export function findAbbreviations(sentence: string): AbbreviationMatch[] {
  const searchable = maskEditorialMarkers(sentence);
  const found: AbbreviationMatch[] = [];

  const push = (raw: string, offset: number, definition: AbbreviationDefinition | undefined): void => {
    const trimmedEnd = raw.replace(/\.$/, '');
    found.push({
      abbreviation: trimmedEnd,
      normalized: normalizeAbbreviation(raw),
      offset,
      length: trimmedEnd.length,
      ...(definition ? { definition } : {}),
    });
  };

  for (const match of searchable.matchAll(UNIT_PATTERN)) {
    if (match.index === undefined) continue;
    const definition = UNIT_ABBREVIATIONS[normalizeAbbreviation(match[0])];
    if (!definition) continue;
    push(match[0], match.index, definition);
  }

  for (const match of searchable.matchAll(ACRONYM_PATTERN)) {
    if (match.index === undefined) continue;
    const key = normalizeAbbreviation(match[0]);
    const definition = ACRONYM_ABBREVIATIONS[key];
    if (!definition) continue;
    const dotted = match[0].includes('.');
    // „un“ mitten in einem Satz ist kein Akronym; „UN“ und „e.g.“ sind es.
    if (!dotted && match[0] !== match[0].toUpperCase()) continue;
    if (!dotted && DOTTED_ONLY.has(key)) continue;
    push(match[0], match.index, definition);
  }

  for (const match of searchable.matchAll(UNKNOWN_UNIT_PATTERN)) {
    if (match.index === undefined) continue;
    const raw = match[1] ?? '';
    if (hasVowel(raw)) continue; // „5 men“ ist keine Abkürzung.
    if (UNIT_ABBREVIATIONS[normalizeAbbreviation(raw)]) continue;
    push(raw, match.index, undefined);
  }

  for (const match of searchable.matchAll(DOTTED_PATTERN)) {
    if (match.index === undefined) continue;
    const key = normalizeAbbreviation(match[0]);
    if (ACRONYM_ABBREVIATIONS[key]) continue;
    push(match[0], match.index, undefined);
  }

  // Überschneidungen auflösen: die längere, weiter links stehende Fundstelle
  // gewinnt – „sq mi“ schlägt „mi“.
  found.sort((a, b) => a.offset - b.offset || b.length - a.length);
  const result: AbbreviationMatch[] = [];
  let consumedUntil = -1;
  for (const match of found) {
    if (match.offset < consumedUntil) continue;
    result.push(match);
    consumedUntil = match.offset + match.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Darstellung
// ---------------------------------------------------------------------------

export interface AbbreviationSuggestion {
  /** Stichwort für die Vokabelliste. */
  english: string;
  /** Vorgeschlagene Übersetzung – leer, wenn keine eindeutige existiert. */
  german: string;
  /** Kurzer Hinweis für die Lehrkraft. */
  hint: string;
  /** Die Form, die tatsächlich im Text steht – für Lückentexte maßgeblich. */
  literal: string;
  resolved: boolean;
}

/**
 * Macht aus einer Fundstelle einen Vorschlag.
 *
 * Aufgelöst erscheint sie als „square mile (sq mi)“ – die Langform lernt sich
 * besser, das Kürzel bleibt wiedererkennbar. Unaufgelöst bleibt sie stehen wie
 * sie ist, mit einem Hinweis statt einer Erfindung.
 */
export function describeAbbreviation(match: AbbreviationMatch): AbbreviationSuggestion {
  const { definition, abbreviation } = match;
  if (!definition) {
    return {
      english: abbreviation,
      german: '',
      hint: UNKNOWN_ABBREVIATION_HINT,
      literal: abbreviation,
      resolved: false,
    };
  }

  return {
    english: `${definition.longForm} (${abbreviation})`,
    german: definition.german,
    hint:
      definition.kind === 'unit'
        ? `Maßeinheit; im Text als „${abbreviation}“`
        : `Abkürzung; im Text als „${abbreviation}“`,
    literal: abbreviation,
    resolved: true,
  };
}
