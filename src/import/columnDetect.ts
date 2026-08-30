export const COLUMN_ROLES = [
  'english',
  'german',
  'partOfSpeech',
  'example',
  'exampleGerman',
  'tags',
  'notes',
  'ignore',
] as const;
export type ColumnRole = (typeof COLUMN_ROLES)[number];

export const COLUMN_ROLE_LABELS: Readonly<Record<ColumnRole, string>> = {
  english: 'Englisch',
  german: 'Deutsch',
  partOfSpeech: 'Wortart',
  example: 'Beispielsatz (EN)',
  exampleGerman: 'Beispielsatz (DE)',
  tags: 'Themen-Tags',
  notes: 'Notiz',
  ignore: 'nicht importieren',
};

const HEADER_PATTERNS: Array<{ role: ColumnRole; patterns: RegExp[] }> = [
  {
    role: 'exampleGerman',
    patterns: [/beispiel.*(deutsch|de\b)/i, /(deutsch|de).*(satz|beispiel)/i, /translation/i],
  },
  { role: 'example', patterns: [/beispiel/i, /example/i, /satz/i, /sentence/i, /kontext/i] },
  { role: 'partOfSpeech', patterns: [/wortart/i, /part.?of.?speech/i, /^pos$/i, /^typ$/i] },
  { role: 'tags', patterns: [/tags?/i, /thema/i, /themen/i, /topic/i, /kategorie/i, /unit/i] },
  { role: 'notes', patterns: [/notiz/i, /note/i, /hinweis/i, /kommentar/i, /remark/i] },
  {
    role: 'german',
    patterns: [/deutsch/i, /german/i, /übersetzung/i, /uebersetzung/i, /bedeutung/i, /^de$/i, /^ger$/i],
  },
  {
    role: 'english',
    patterns: [/englisch/i, /english/i, /^en$/i, /^eng$/i, /vokabel/i, /^word$/i, /^wort$/i, /begriff/i],
  },
];

export interface ColumnMapping {
  hasHeader: boolean;
  roles: ColumnRole[];
  headers: string[];
}

function roleFromHeader(header: string): ColumnRole | undefined {
  const value = header.trim();
  if (!value) return undefined;
  for (const { role, patterns } of HEADER_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(value))) return role;
  }
  return undefined;
}

const GERMAN_HINT = /[äöüßÄÖÜ]|\b(der|die|das|ein|eine|sich)\b/;
const ENGLISH_HINT = /\b(to|the|a|an)\b/i;

function scoreLanguage(values: readonly string[]): { german: number; english: number } {
  let german = 0;
  let english = 0;
  for (const value of values) {
    if (GERMAN_HINT.test(value)) german += 1;
    if (ENGLISH_HINT.test(value)) english += 1;
  }
  return { german, english };
}

/**
 * Erkennt Spaltenrollen. Wenn die erste Zeile wie ein Kopf aussieht, wird sie
 * ausgewertet; sonst entscheidet eine einfache Sprachheuristik über die
 * Reihenfolge Englisch/Deutsch. Die Zuordnung ist in der Vorschau änderbar.
 */
export function detectColumns(rows: readonly string[][]): ColumnMapping {
  const first = rows[0] ?? [];
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const headerRoles = first.map((cell) => roleFromHeader(cell));
  const namedColumns = headerRoles.filter(Boolean).length;
  const hasHeader = namedColumns >= Math.min(2, columnCount) && namedColumns > 0;

  const roles: ColumnRole[] = new Array<ColumnRole>(columnCount).fill('ignore');

  if (hasHeader) {
    headerRoles.forEach((role, index) => {
      if (role && !roles.includes(role)) roles[index] = role;
    });
  } else {
    const body = rows;
    const columns = Array.from({ length: columnCount }, (_, index) =>
      body.map((row) => row[index] ?? '').filter((value) => value.length > 0),
    );
    const scores = columns.map(scoreLanguage);
    const firstScore = scores[0];
    const secondScore = scores[1];
    const swap =
      columnCount >= 2 &&
      firstScore !== undefined &&
      secondScore !== undefined &&
      firstScore.german > firstScore.english &&
      secondScore.english >= secondScore.german;

    if (columnCount >= 1) roles[0] = swap ? 'german' : 'english';
    if (columnCount >= 2) roles[1] = swap ? 'english' : 'german';
    if (columnCount >= 3) roles[2] = 'example';
    if (columnCount >= 4) roles[3] = 'tags';
  }

  if (!roles.includes('english') && columnCount >= 1) roles[0] = 'english';
  if (!roles.includes('german') && columnCount >= 2) {
    const index = roles.findIndex((role, i) => i > 0 && role === 'ignore');
    if (index >= 0) roles[index] = 'german';
  }

  return {
    hasHeader,
    roles,
    headers: hasHeader
      ? first.map((cell, index) => cell || `Spalte ${index + 1}`)
      : Array.from({ length: columnCount }, (_, index) => `Spalte ${index + 1}`),
  };
}
