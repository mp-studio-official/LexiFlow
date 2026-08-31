import {
  DIRECTION_LABELS,
  type LearningDirection,
  type TaskDirection,
} from './schema';

/**
 * Welche Richtung geübt wird – und wer das entscheidet.
 *
 * Bis Sprint 3B.1 entschied das die Freischaltung: Bei einem Paket mit beiden
 * Richtungen war Deutsch → Englisch gesperrt, bis Englisch → Deutsch ein
 * bestimmtes Leitner-Fach erreicht hatte. Als Voreinstellung ist das eine gute
 * Didaktik – als Verbot ist es eine Bevormundung. Wer heute für die
 * Vokabelarbeit produktiv üben will, muss das dürfen.
 *
 * Die Lösung braucht keine neue Mechanik, nur eine ehrliche Unterscheidung:
 *
 * - **Gemischt** ist der empfohlene Modus. Er übt beide Richtungen und behält
 *   die Staffelung „erst verstehen, dann selbst formulieren“ bei.
 * - **Eine ausdrücklich gewählte Richtung** übt genau diese – ohne Freischalt-
 *   bedingung. Die Wahl ist die Entscheidung der lernenden Person.
 *
 * Technisch fällt beides zusammen: Die gewählte Richtung wird zur *wirksamen*
 * Paketrichtung der Planung. `isDirectionUnlocked` greift ohnehin nur bei
 * `both`, also genau im gemischten Modus. Es gibt deshalb keinen zweiten
 * Planungspfad, den man vergessen könnte.
 *
 * Alles hier ist rein und ohne Seiteneffekte.
 */

export const DIRECTION_CHOICES = ['mixed', 'en-de', 'de-en'] as const;
export type DirectionChoice = (typeof DIRECTION_CHOICES)[number];

export const DIRECTION_CHOICE_LABELS: Readonly<Record<DirectionChoice, string>> = {
  mixed: 'Gemischt',
  'en-de': DIRECTION_LABELS['en-de'],
  'de-en': DIRECTION_LABELS['de-en'],
};

export const DIRECTION_CHOICE_HINTS: Readonly<Record<DirectionChoice, string>> = {
  mixed: 'Empfohlen: beide Richtungen, Deutsch → Englisch kommt nach den ersten Erfolgen dazu.',
  'en-de': 'Nur verstehen: Du siehst das englische Wort und nennst die deutsche Bedeutung.',
  'de-en': 'Nur selbst formulieren: Du siehst das deutsche Wort und schreibst das englische.',
};

export const DEFAULT_DIRECTION_CHOICE: DirectionChoice = 'mixed';

/**
 * Die Auswahl, die ein Paket sinnvoll anbieten kann.
 *
 * Ein Paket mit nur einer Richtung bietet keine Wahl an – eine Auswahl mit
 * genau einer gültigen Option ist keine Auswahl, sondern eine Attrappe.
 */
export function directionChoicesFor(packDirection: LearningDirection): DirectionChoice[] {
  return packDirection === 'both' ? [...DIRECTION_CHOICES] : [];
}

export function isDirectionChoiceAvailable(
  packDirection: LearningDirection,
  choice: DirectionChoice,
): boolean {
  return directionChoicesFor(packDirection).includes(choice);
}

/**
 * Die Richtung, mit der tatsächlich geplant wird.
 *
 * Bei einem Paket mit nur einer Richtung bleibt es dabei – eine abweichende
 * Wahl wäre ungültig und wird still auf die Paketrichtung zurückgeführt.
 */
export function effectiveDirection(
  packDirection: LearningDirection,
  choice: DirectionChoice = DEFAULT_DIRECTION_CHOICE,
): LearningDirection {
  if (packDirection !== 'both') return packDirection;
  return choice === 'mixed' ? 'both' : choice;
}

/** Liest die Wahl aus einem URL-Parameter; alles Unbekannte wird zu „Gemischt“. */
export function parseDirectionChoice(value: string | null | undefined): DirectionChoice {
  return (DIRECTION_CHOICES as readonly string[]).includes(value ?? '')
    ? (value as DirectionChoice)
    : DEFAULT_DIRECTION_CHOICE;
}

/** Beschriftung der Richtung an einer einzelnen Aufgabe. */
export function taskDirectionBadge(direction: TaskDirection): string {
  return DIRECTION_LABELS[direction];
}
