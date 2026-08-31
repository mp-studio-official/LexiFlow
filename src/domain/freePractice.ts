import { activeDirections, type EntryProgress, type LearningDirection, type VocabEntry } from './schema';
import { arrangeTargets, shuffle, type Rng, type SessionTarget } from './exercises';

/**
 * Freies Üben – bewusst getrennt von der Leitner-Planung.
 *
 * `planSession` bleibt die einzige Quelle für den Lernplan: Sie plant nur neue
 * und fällige Ziele und ihre Runden schreiben Lernstände. `planFreeSession`
 * beantwortet eine andere Frage: „Was darf ich jetzt überhaupt üben?“ Sie nimmt
 * deshalb auch später fällige Ziele auf – und ihre Runden ändern **nichts** am
 * Lernstand. Beide Funktionen teilen sich nur die neutralen Bausteine
 * (`isDirectionUnlocked`, `shuffle`, `arrangeTargets`).
 *
 * Eigene Begriffe statt geliehener: „verfügbar“ ist nicht „bereit“. Gezählt
 * werden Aufgaben, also Kombinationen aus Vokabel und Richtung – bei „beide
 * Richtungen“ kann eine Vokabel zwei Aufgaben stellen.
 */

export interface FreeSessionPlan {
  /** Die für diese freie Runde geplanten Ziele in Reihenfolge. */
  targets: SessionTarget[];
  /** Alle freigeschalteten Richtungsziele – unabhängig von der Fälligkeit. */
  availableCount: number;
  /** Immer `targets.length`. */
  plannedCount: number;
  /** Verfügbare Ziele, die wegen Rundengröße oder Richtungsabstand warten. */
  remainingAvailableCount: number;
}

/**
 * Alle Ziele, die frei geübt werden dürfen: jede aktive Richtung des Pakets.
 *
 * Seit Sprint 3B.1 **ohne** Freischaltbedingung. Die Staffelung
 * „erst verstehen, dann selbst formulieren“ ist eine Empfehlung für den
 * Lernplan, der Lernstände schreibt. Freies Üben schreibt nichts: Es kann
 * nichts verderben, und wer vor einer Vokabelarbeit gezielt produktiv üben
 * will, darf dabei nicht ausgesperrt werden.
 *
 * `progressIndex` bleibt im Signaturkopf, weil `planFreeSession` dieselbe
 * Signatur wie `planSession` behalten soll – die Aufrufer sollen die beiden
 * Modi nicht unterschiedlich verkabeln müssen.
 */
export function freeTargets(
  entries: readonly VocabEntry[],
  _progressIndex: ReadonlyMap<string, EntryProgress>,
  packDirection: LearningDirection,
): SessionTarget[] {
  const result: SessionTarget[] = [];
  for (const entry of entries) {
    for (const direction of activeDirections(packDirection)) {
      result.push({ entry, direction });
    }
  }
  return result;
}

/**
 * Reine, deterministische Planung einer freien Runde.
 *
 * Kein `now`-Parameter: Fälligkeiten spielen hier bewusst keine Rolle. Die
 * gewünschte Länge ist eine Obergrenze; der Abstand zwischen den beiden
 * Richtungen derselben Vokabel gilt unverändert.
 */
export function planFreeSession(
  entries: readonly VocabEntry[],
  progressIndex: ReadonlyMap<string, EntryProgress>,
  packDirection: LearningDirection,
  length: number,
  rng: Rng = Math.random,
): FreeSessionPlan {
  const available = freeTargets(entries, progressIndex, packDirection);
  const targets = arrangeTargets(shuffle(available, rng), Math.max(0, length));

  return {
    targets,
    availableCount: available.length,
    plannedCount: targets.length,
    remainingAvailableCount: available.length - targets.length,
  };
}
