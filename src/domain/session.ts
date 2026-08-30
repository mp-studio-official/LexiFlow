import type { AnswerVerdict } from './answerCheck';
import { MIN_SIBLING_GAP, type ExerciseTask } from './exercises';

/**
 * Ablauf einer Übungsrunde als Warteschlange.
 *
 * Die Runde wird nicht starr vorab festgelegt: Wer eine Aufgabe falsch oder
 * „fast richtig“ beantwortet, bekommt sie **einmal** später in derselben Runde
 * erneut. Dadurch wächst die Rundengröße während des Übens.
 *
 * Drei Regeln halten das im Rahmen:
 * - Jede Aufgabe erscheint höchstens `MAX_ATTEMPTS` mal (Erstversuch plus eine
 *   Wiederholung). Auch die Wiederholung wird nicht erneut eingereiht.
 * - Zwischen zwei Versuchen derselben Aufgabe liegen nach Möglichkeit
 *   mindestens `MIN_GAP` andere Aufgaben.
 * - Zwischen der Wiederholung und der **Gegenrichtung** derselben Vokabel
 *   liegen mindestens `MIN_SIBLING_GAP` andere Aufgaben – sonst wäre die eine
 *   Aufgabe die Lösung der anderen. Lässt sich keine solche Stelle finden,
 *   entfällt die Wiedervorlage; die Vokabel steht durch das zurückgesetzte
 *   Leitner-Fach ohnehin in der nächsten Runde wieder an.
 */
export const MAX_ATTEMPTS = 2;
export const MIN_GAP = 2;

export interface SessionItem {
  /** Eindeutig je Versuch – geeignet als React-Key. */
  id: string;
  task: ExerciseTask;
  /** 1 = Erstversuch, 2 = Wiederholung. */
  attempt: number;
}

export interface SessionState {
  items: SessionItem[];
  index: number;
}

export function createSessionState(tasks: readonly ExerciseTask[]): SessionState {
  return {
    items: tasks.map((task) => ({ id: `${task.id}@1`, task, attempt: 1 })),
    index: 0,
  };
}

export function currentItem(state: SessionState): SessionItem | undefined {
  return state.items[state.index];
}

export function isFinished(state: SessionState): boolean {
  return state.index >= state.items.length;
}

/** Frühestmögliche Position einer Wiederholung (ohne Geschwisterregel). */
export function requeuePosition(index: number, length: number): number {
  return Math.min(index + 1 + MIN_GAP, length);
}

function hasSiblingNear(
  items: readonly SessionItem[],
  position: number,
  task: ExerciseTask,
  siblingGap: number,
): boolean {
  const from = Math.max(0, position - siblingGap);
  const to = Math.min(items.length, position + siblingGap);
  for (let i = from; i < to; i += 1) {
    const other = items[i]?.task;
    if (!other) continue;
    if (other.entryId === task.entryId && other.direction !== task.direction) return true;
  }
  return false;
}

/**
 * Sucht die früheste zulässige Einfügeposition für eine Wiederholung.
 * `undefined` bedeutet: In dieser Runde gibt es keine Stelle, die beide
 * Abstandsregeln einhält.
 */
export function findRequeuePosition(
  items: readonly SessionItem[],
  index: number,
  task: ExerciseTask,
  siblingGap = MIN_SIBLING_GAP,
): number | undefined {
  const earliest = requeuePosition(index, items.length);
  for (let position = earliest; position <= items.length; position += 1) {
    if (!hasSiblingNear(items, position, task, siblingGap)) return position;
  }
  return undefined;
}

/** Warum eine Wiedervorlage unterblieben ist. */
export type RequeueSkipReason =
  /** Richtig beantwortet – keine Wiederholung nötig. */
  | 'answered-correctly'
  /** Die Aufgabe war bereits die Wiederholung. */
  | 'max-attempts'
  /** Keine Stelle erfüllt beide Abstandsregeln. */
  | 'no-slot';

/**
 * Ergebnis einer Bewertung. `requeued` sagt **verbindlich**, ob die Aufgabe
 * tatsächlich noch einmal in dieser Runde erscheint – die Oberfläche darf eine
 * Wiederholung nur ankündigen, wenn das hier `true` ist.
 */
export interface VerdictOutcome {
  state: SessionState;
  requeued: boolean;
  reason?: RequeueSkipReason;
}

/**
 * Verarbeitet eine Bewertung: rückt einen Schritt weiter und reiht die Aufgabe
 * bei Bedarf – und nur an einer regelkonformen Stelle – noch einmal ein.
 *
 * Die Funktion ist rein und kann deshalb schon beim Anzeigen des Feedbacks
 * berechnet werden; angewendet wird das Ergebnis erst beim Weiterblättern.
 */
export function submitVerdict(state: SessionState, verdict: AnswerVerdict): VerdictOutcome {
  const current = state.items[state.index];
  if (!current) return { state, requeued: false, reason: 'max-attempts' };

  const advanced: SessionState = { ...state, index: state.index + 1 };

  if (verdict === 'correct') return { state: advanced, requeued: false, reason: 'answered-correctly' };
  if (current.attempt >= MAX_ATTEMPTS) return { state: advanced, requeued: false, reason: 'max-attempts' };

  const position = findRequeuePosition(state.items, state.index, current.task);
  if (position === undefined) return { state: advanced, requeued: false, reason: 'no-slot' };

  const items = [...state.items];
  items.splice(position, 0, {
    id: `${current.task.id}@${current.attempt + 1}`,
    task: current.task,
    attempt: current.attempt + 1,
  });

  return { state: { items, index: state.index + 1 }, requeued: true };
}

/** Wie viele Aufgaben in dieser Runde noch ausstehen. */
export function remainingCount(state: SessionState): number {
  return Math.max(0, state.items.length - state.index);
}
