/**
 * Zuordnung Jahrgangsstufe (Gymnasium NRW) → GeR-Niveau.
 * Der Vorschlag ist eine Orientierung und in der Oberfläche überschreibbar –
 * schulinterne Lehrpläne weichen im Detail ab.
 */

export const GRADES = ['5', '6', '7', '8', '9', '10', 'EF', 'Q1', 'Q2'] as const;
export type Grade = (typeof GRADES)[number];

export const CEFR_LEVELS = [
  'A1+',
  'A2',
  'A2+',
  'A2/B1',
  'B1',
  'B1+',
  'B1/B2',
  'B2',
  'B2/C1',
] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

const GRADE_TO_CEFR: Readonly<Record<Grade, CefrLevel>> = {
  '5': 'A1+',
  '6': 'A2',
  '7': 'A2+',
  '8': 'A2/B1',
  '9': 'B1',
  '10': 'B1+',
  EF: 'B1/B2',
  Q1: 'B2',
  Q2: 'B2/C1',
};

export function suggestCefrLevel(grade: Grade): CefrLevel {
  return GRADE_TO_CEFR[grade];
}

export function isGrade(value: unknown): value is Grade {
  return typeof value === 'string' && (GRADES as readonly string[]).includes(value);
}

export const GRADE_LABELS: Readonly<Record<Grade, string>> = {
  '5': 'Klasse 5',
  '6': 'Klasse 6',
  '7': 'Klasse 7',
  '8': 'Klasse 8',
  '9': 'Klasse 9',
  '10': 'Klasse 10',
  EF: 'EF (Einführungsphase)',
  Q1: 'Q1',
  Q2: 'Q2',
};
