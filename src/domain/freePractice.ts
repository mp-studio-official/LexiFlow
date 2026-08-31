import { activeDirections, type EntryProgress, type LearningDirection, type VocabEntry } from './schema';
import {
  arrangeTargets,
  buildTasksForTargets,
  mulberry32,
  shuffle,
  type ExerciseKind,
  type Rng,
  type SessionTarget,
} from './exercises';
import { effectiveDirection, type DirectionChoice } from './practiceDirection';

/**
 * Freies Üben – bewusst getrennt von der Leitner-Planung.
 *
 * `planSession` bleibt die einzige Quelle für den Lernplan: Sie plant nur neue
 * und fällige Ziele und ihre Runden schreiben Lernstände. `planFreeSession`
 * beantwortet eine andere Frage: „Was darf ich jetzt überhaupt üben?“ Antwort
 * seit Sprint 3B.1: alles, was im Paket steht – auch später Fälliges und beide
 * Richtungen, ohne Freischaltbedingung. Ihre Runden ändern **nichts** am
 * Lernstand. Beide Funktionen teilen sich nur die neutralen Bausteine
 * (`shuffle`, `arrangeTargets`).
 *
 * Eigene Begriffe statt geliehener: „verfügbar“ ist nicht „bereit“. Gezählt
 * werden Aufgaben, also Kombinationen aus Vokabel und Richtung – bei „beide
 * Richtungen“ kann eine Vokabel zwei Aufgaben stellen.
 */

export interface FreeSessionPlan {
  /** Die für diese freie Runde geplanten Ziele in Reihenfolge. */
  targets: SessionTarget[];
  /** Alle Richtungsziele des Pakets – unabhängig von der Fälligkeit. */
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

// ---------------------------------------------------------------------------
// Runde anpassen: Vorschau vor dem Start
// ---------------------------------------------------------------------------

/** Die Stufen, die die Einrichtung anbietet. Die Zahl bleibt eine Obergrenze. */
export const FREE_ROUND_LENGTHS = [5, 10, 15, 20] as const;

/** Standardumfang des Direktstarts – eine Runde, die in einer Pause passt. */
export const FREE_ROUND_DEFAULT_LENGTH = 15;

/**
 * Wie viele Aufgaben in dieser Richtung überhaupt zur Verfügung stehen.
 *
 * Das ist die Zahl hinter „Alle verfügbaren“ und die ehrliche Obergrenze jeder
 * freien Runde. Fälligkeiten spielen keine Rolle.
 */
export function freeAvailableCount(
  entries: readonly VocabEntry[],
  packDirection: LearningDirection,
  choice: DirectionChoice,
): number {
  return freeTargets(entries, new Map(), effectiveDirection(packDirection, choice)).length;
}

export interface FreeRoundPreview {
  /** Alle Ziele dieser Richtung – unabhängig von Fälligkeit und Freischaltung. */
  availableCount: number;
  /** So viele Aufgaben entstehen wirklich. Immer die Zahl, die gezeigt wird. */
  plannedCount: number;
  /** Was gewünscht war – als Obergrenze, nicht als Versprechen. */
  requested: number;
  /** Aufgaben, die eine der gewählten Übungsformen bekommen. */
  chosenKindCount: number;
  /**
   * Aufgaben, die auf eine andere geeignete Form ausweichen.
   *
   * Das passiert, wenn eine Vokabel die gewählte Form nicht hergibt – etwa ein
   * Lückensatz ohne passenden Beispielsatz. Die Vokabel fällt deshalb **nicht**
   * aus der Runde; sie wird anders gefragt. Die Vorschau sagt das, statt es
   * beim Üben zur Überraschung werden zu lassen.
   */
  otherKindCount: number;
  /** Verfügbare Ziele, die wegen Obergrenze oder Richtungsabstand warten. */
  remainingAvailableCount: number;
}

/**
 * Baut die Runde **wirklich** und zählt danach.
 *
 * Die Vorschau darf nicht schätzen. Sie durchläuft deshalb exakt denselben Weg
 * wie die Übungsseite – `planFreeSession`, dann `buildTasksForTargets`, mit
 * demselben Seed und in derselben Reihenfolge. Was hier steht, ist damit die
 * Runde, die gleich startet, und keine zweite Free-Practice-Logik.
 */
export function previewFreeRound(
  entries: readonly VocabEntry[],
  progressIndex: ReadonlyMap<string, EntryProgress>,
  packDirection: LearningDirection,
  choice: DirectionChoice,
  kinds: readonly ExerciseKind[],
  length: number,
  seed: number,
): FreeRoundPreview {
  const direction = effectiveDirection(packDirection, choice);
  const rng = mulberry32(seed);
  const plan = planFreeSession(entries, progressIndex, direction, length, rng);
  const tasks = buildTasksForTargets(plan.targets, entries, progressIndex, kinds, rng);

  const chosen =
    kinds.length === 0 ? tasks.length : tasks.filter((task) => kinds.includes(task.kind)).length;

  return {
    availableCount: plan.availableCount,
    plannedCount: tasks.length,
    requested: length,
    chosenKindCount: chosen,
    otherKindCount: tasks.length - chosen,
    remainingAvailableCount: plan.availableCount - tasks.length,
  };
}
