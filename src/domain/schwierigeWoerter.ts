import { LEITNER_BOX_MIN } from './schema';
import type { EntryProgress } from './schema';

/**
 * Wann ein Wort als schwierig gilt — die Ableitung, nicht die Anzeige.
 *
 * ## Woher die Regel kommt
 *
 * **E24** (`docs/konzept-5b.md`, Abschnitt 16), getroffen bei der Abnahme von
 * 5B.5. Abschnitt 4.3 nannte nur „Ableitung aus `wrongCount` und Fach"; die
 * Schwelle stand zuerst allein hier und ist seitdem eine ausdrückliche
 * Entscheidung. Eine Änderung der Zahlen ist eine Änderung von E24.
 *
 * Gerechnet wird je Richtung und ausschließlich auf dem eigenen Lernstand.
 *
 * ## Die Regel
 *
 * Mindestens **zwei** falsche Antworten **und** ein niedriges Fach (1 oder 2).
 *
 * Beide Bedingungen zusammen, weil jede allein etwas anderes trifft:
 *
 * - Nur `wrongCount`: Ein Wort, das vor Wochen zweimal danebenging und
 *   inzwischen in Fach 5 sitzt, ist gelernt. Es weiter als schwierig zu
 *   führen, hielte eine alte Niederlage fest und wäre entmutigend.
 * - Nur das Fach: Jedes frisch begonnene Wort steht in Fach 1. „Neu" ist
 *   nicht „schwierig" — diese Liste wäre am ersten Tag am längsten.
 *
 * Zwei statt einer falschen Antwort, weil ein einzelner Tippfehler noch keine
 * Schwierigkeit ist. Die Zahl ist eine Festlegung und keine Messung; sie steht
 * als Konstante da, damit eine spätere Änderung eine Änderung ist und nicht
 * ein verstreuter Vergleich.
 */

/** Ab so vielen falschen Antworten kommt ein Wort überhaupt in Frage. */
export const SCHWIERIG_AB_FEHLERN = 2;

/** Bis zu diesem Fach gilt ein Wort als noch nicht sitzend. */
export const SCHWIERIG_BIS_FACH = LEITNER_BOX_MIN + 1;

export function istSchwierig(progress: EntryProgress): boolean {
  return progress.wrongCount >= SCHWIERIG_AB_FEHLERN && progress.box <= SCHWIERIG_BIS_FACH;
}
