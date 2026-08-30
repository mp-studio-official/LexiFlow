import { describe, expect, it } from 'vitest';
import {
  MAX_ATTEMPTS,
  createSessionState,
  currentItem,
  isFinished,
  remainingCount,
  requeuePosition,
  submitVerdict,
  type SessionState,
} from './session';
import { MIN_SIBLING_GAP, buildTask, mulberry32 } from './exercises';
import { makeEntry } from '../test/fixtures';
import type { AnswerVerdict } from './answerCheck';
import type { ExerciseTask, TaskDirection } from './exercises';
import type { VocabEntry } from './schema';

function entriesNamed(count: number): VocabEntry[] {
  return Array.from({ length: count }, (_, index) =>
    makeEntry({
      id: `e${index + 1}`,
      english: `word${index + 1}`,
      germanAnswers: [`Wort${index + 1}`],
    }),
  );
}

function taskFor(
  entry: VocabEntry,
  pool: readonly VocabEntry[],
  direction: TaskDirection = 'en-de',
): ExerciseTask {
  const task = buildTask(entry, 'flashcard', direction, pool, mulberry32(1));
  if (!task) throw new Error('Aufgabe fehlt');
  return task;
}

function tasks(count: number): ExerciseTask[] {
  const entries = entriesNamed(count);
  return entries.map((entry) => taskFor(entry, entries));
}

/** Runde mit beiden Richtungen: erst alle rezeptiv, dann alle produktiv. */
function bothDirectionTasks(count: number): ExerciseTask[] {
  const entries = entriesNamed(count);
  return [
    ...entries.map((entry) => taskFor(entry, entries, 'en-de')),
    ...entries.map((entry) => taskFor(entry, entries, 'de-en')),
  ];
}

/** Kleinster Abstand zwischen zwei Richtungen derselben Vokabel. */
function minimumSiblingDistance(items: readonly { task: ExerciseTask }[]): number {
  let smallest = Number.POSITIVE_INFINITY;
  items.forEach((item, index) => {
    for (let other = index + 1; other < items.length; other += 1) {
      const candidate = items[other]?.task;
      if (
        candidate &&
        candidate.entryId === item.task.entryId &&
        candidate.direction !== item.task.direction
      ) {
        smallest = Math.min(smallest, other - index);
      }
    }
  });
  return smallest;
}

function play(state: SessionState, verdicts: readonly AnswerVerdict[]): SessionState {
  return verdicts.reduce((current, verdict) => submitVerdict(current, verdict), state);
}

/** Reihenfolge der Vokabeln, wie sie tatsächlich gezeigt werden. */
function order(state: SessionState): string[] {
  return state.items.map((item) => item.task.entryId);
}

describe('createSessionState', () => {
  it('beginnt beim ersten Versuch der ersten Aufgabe', () => {
    const state = createSessionState(tasks(3));
    expect(state.index).toBe(0);
    expect(state.items).toHaveLength(3);
    expect(currentItem(state)?.attempt).toBe(1);
    expect(isFinished(state)).toBe(false);
  });
});

describe('submitVerdict', () => {
  it('reiht richtige Antworten nicht erneut ein', () => {
    const state = play(createSessionState(tasks(5)), ['correct']);
    expect(state.items).toHaveLength(5);
    expect(state.index).toBe(1);
  });

  it('reiht falsche Antworten später erneut ein', () => {
    const state = play(createSessionState(tasks(5)), ['wrong']);
    expect(state.items).toHaveLength(6);
    expect(order(state)).toEqual(['e1', 'e2', 'e3', 'e1', 'e4', 'e5']);
  });

  it('reiht „fast richtig“ ebenfalls erneut ein', () => {
    const state = play(createSessionState(tasks(5)), ['almost']);
    expect(state.items).toHaveLength(6);
    expect(order(state)[3]).toBe('e1');
  });

  it('lässt mindestens zwei andere Aufgaben dazwischen', () => {
    const state = play(createSessionState(tasks(5)), ['wrong']);
    const positions = order(state)
      .map((id, position) => ({ id, position }))
      .filter((entry) => entry.id === 'e1')
      .map((entry) => entry.position);
    expect(positions).toHaveLength(2);
    expect((positions[1] as number) - (positions[0] as number)).toBeGreaterThanOrEqual(3);
  });

  it('hängt die Wiederholung ans Ende, wenn die Runde zu kurz ist', () => {
    const state = play(createSessionState(tasks(2)), ['wrong']);
    expect(order(state)).toEqual(['e1', 'e2', 'e1']);
  });

  it('wiederholt eine Aufgabe höchstens einmal', () => {
    let state = createSessionState(tasks(3));
    // Alles falsch beantworten, bis die Runde vorbei ist.
    let guard = 0;
    while (!isFinished(state) && guard < 50) {
      state = submitVerdict(state, 'wrong');
      guard += 1;
    }
    expect(guard).toBeLessThan(50);
    expect(state.items).toHaveLength(6);
    expect(state.items.filter((item) => item.attempt > MAX_ATTEMPTS)).toHaveLength(0);
    for (const entryId of ['e1', 'e2', 'e3']) {
      expect(order(state).filter((id) => id === entryId)).toHaveLength(2);
    }
  });

  it('endet auch dann, wenn alle Wiederholungen erneut falsch sind', () => {
    let state = createSessionState(tasks(4));
    let steps = 0;
    while (!isFinished(state) && steps < 100) {
      state = submitVerdict(state, 'almost');
      steps += 1;
    }
    expect(isFinished(state)).toBe(true);
    expect(steps).toBe(8);
  });

  it('vergibt je Versuch eine eigene Kennung', () => {
    const state = play(createSessionState(tasks(5)), ['wrong']);
    const ids = state.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.endsWith('@2'))).toHaveLength(1);
  });
});

describe('Wiedervorlage und Geschwisterabstand', () => {
  it('legt die Wiederholung nicht neben die Gegenrichtung', () => {
    const state = play(createSessionState(bothDirectionTasks(4)), ['wrong']);
    expect(state.items).toHaveLength(9);
    expect(minimumSiblingDistance(state.items)).toBeGreaterThan(MIN_SIBLING_GAP);
  });

  it('stellt Gegenrichtungen auch nach einer Wiedervorlage nie direkt nebeneinander', () => {
    let state = createSessionState(bothDirectionTasks(4));
    let guard = 0;
    while (!isFinished(state) && guard < 60) {
      state = submitVerdict(state, guard % 2 === 0 ? 'wrong' : 'correct');
      guard += 1;
    }
    for (let i = 1; i < state.items.length; i += 1) {
      const previous = state.items[i - 1]?.task;
      const current = state.items[i]?.task;
      if (previous && current && previous.entryId === current.entryId) {
        expect(previous.direction).toBe(current.direction);
      }
    }
  });

  it('verzichtet auf die Wiedervorlage, wenn keine Stelle die Abstandsregel erfüllt', () => {
    const entries = entriesNamed(2);
    const state = createSessionState([
      taskFor(entries[0]!, entries, 'en-de'),
      taskFor(entries[1]!, entries, 'en-de'),
      taskFor(entries[0]!, entries, 'de-en'),
    ]);
    const after = submitVerdict(state, 'wrong');
    expect(after.items).toHaveLength(3);
    expect(after.index).toBe(1);
  });

  it('findet trotzdem eine Stelle, wenn die Runde lang genug ist', () => {
    const state = play(createSessionState(bothDirectionTasks(6)), ['wrong']);
    expect(state.items).toHaveLength(13);
    expect(minimumSiblingDistance(state.items)).toBeGreaterThan(MIN_SIBLING_GAP);
  });
});

describe('requeuePosition', () => {
  it('setzt drei Positionen weiter, aber nie über das Ende hinaus', () => {
    expect(requeuePosition(0, 10)).toBe(3);
    expect(requeuePosition(8, 10)).toBe(10);
  });
});

describe('remainingCount', () => {
  it('zählt die noch offenen Aufgaben', () => {
    const state = play(createSessionState(tasks(4)), ['correct', 'wrong']);
    expect(remainingCount(state)).toBe(3);
  });
});
