import { describe, expect, it } from 'vitest';
import {
  ALL_AVAILABLE,
  availableGroups,
  checkTaskAnswer,
  describeResult,
  gradeSelfTest,
  kindsForGroups,
  planMistakeRound,
  planSelfTest,
  type KindGroup,
  type SelfTestAnswer,
} from './selfTest';
import { makeEntry } from '../test/fixtures';
import type { ExerciseTask } from './exercises';
import type { VocabEntry } from './schema';

/**
 * Sprint 3B.2b: Der Selbsttest ist rein planbar und rein auswertbar.
 *
 * Zwei Dinge prüfen diese Tests besonders streng: dass `plannedCount` nie mehr
 * verspricht, als wirklich entsteht – und dass die Fehlerrunde endlich bleibt
 * und ausschließlich Fehler enthält.
 */

function entriesNamed(count: number): VocabEntry[] {
  return Array.from({ length: count }, (_, index) =>
    makeEntry({
      id: `e${index + 1}`,
      english: `word${index + 1}`,
      germanAnswers: [`Wort${index + 1}`],
    }),
  );
}

/** Einträge mit Beispielsatz – nur dann sind Lückensätze möglich. */
function entriesWithSentences(count: number): VocabEntry[] {
  return entriesNamed(count).map((entry) => ({
    ...entry,
    exampleSentences: [{ english: `A sentence about ${entry.english} today.` }],
  }));
}

const ALL_GROUPS: KindGroup[] = ['open', 'semi-open', 'closed'];

describe('Aufgabenarten', () => {
  it('ordnet Übungsformen den fachlichen Gruppen zu', () => {
    expect(kindsForGroups(['open'])).toEqual(['open-translation']);
    expect(kindsForGroups(['closed'])).toEqual(['multiple-choice']);
    expect(kindsForGroups(['semi-open'])).toEqual(['cloze-bank', 'cloze-free']);
  });

  it('bietet die Karteikarte nicht als Testaufgabe an', () => {
    // Sie zeigt die Lösung, statt sie abzufragen.
    expect(kindsForGroups(ALL_GROUPS)).not.toContain('flashcard');
  });

  it('nennt nur Gruppen, die das Paket wirklich hergibt', () => {
    const plain = entriesNamed(6);

    // Ohne Beispielsätze gibt es keine Lückensätze.
    expect(availableGroups(plain, 'both', 'mixed')).toEqual(['open', 'closed']);
    // Mit Beispielsätzen und produktiver Richtung schon.
    expect(availableGroups(entriesWithSentences(6), 'both', 'de-en')).toEqual([
      'open',
      'semi-open',
      'closed',
    ]);
    // Rezeptiv bleibt der Lückensatz außen vor.
    expect(availableGroups(entriesWithSentences(6), 'both', 'en-de')).toEqual(['open', 'closed']);
  });

  it('lässt Multiple Choice bei zu wenigen Ablenkern weg', () => {
    expect(availableGroups(entriesNamed(2), 'en-de', 'mixed')).toEqual(['open']);
  });
});

describe('Planung', () => {
  const entries = entriesNamed(12);

  it('hält die gewünschte Anzahl als Obergrenze ein', () => {
    const plan = planSelfTest(entries, {
      packDirection: 'en-de',
      choice: 'mixed',
      groups: ALL_GROUPS,
      count: 5,
      seed: 1,
    });

    expect(plan.plannedCount).toBe(5);
    expect(plan.tasks).toHaveLength(plan.plannedCount);
    expect(plan.requested).toBe(5);
    expect(plan.availableCount).toBe(12);
  });

  it('meldet ehrlich, wenn weniger möglich ist als gewünscht', () => {
    const plan = planSelfTest(entriesNamed(3), {
      packDirection: 'en-de',
      choice: 'mixed',
      groups: ['open'],
      count: 20,
      seed: 1,
    });

    expect(plan.plannedCount).toBe(3);
    expect(plan.availableCount).toBe(3);
    expect(plan.requested).toBe(20);
  });

  it('nimmt bei „alle verfügbaren“ alles', () => {
    const plan = planSelfTest(entries, {
      packDirection: 'both',
      choice: 'mixed',
      groups: ALL_GROUPS,
      count: ALL_AVAILABLE,
      seed: 1,
    });

    // Zwölf Vokabeln in zwei Richtungen.
    expect(plan.plannedCount).toBe(24);
    expect(plan.requested).toBe(plan.availableCount);
  });

  it('erzeugt keine doppelten Aufgaben', () => {
    const plan = planSelfTest(entries, {
      packDirection: 'both',
      choice: 'mixed',
      groups: ALL_GROUPS,
      count: ALL_AVAILABLE,
      seed: 4,
    });

    expect(new Set(plan.tasks.map((task) => task.id)).size).toBe(plan.tasks.length);
  });

  it('enthält bei „Gemischt“ beide Richtungen', () => {
    const plan = planSelfTest(entries, {
      packDirection: 'both',
      choice: 'mixed',
      groups: ALL_GROUPS,
      count: ALL_AVAILABLE,
      seed: 2,
    });

    expect(new Set(plan.tasks.map((task) => task.direction))).toEqual(
      new Set(['en-de', 'de-en']),
    );
  });

  it('hält den Abstand zwischen den Richtungen derselben Vokabel', () => {
    const plan = planSelfTest(entries, {
      packDirection: 'both',
      choice: 'mixed',
      groups: ALL_GROUPS,
      count: ALL_AVAILABLE,
      seed: 9,
    });

    plan.tasks.forEach((task, index) => {
      const next = plan.tasks[index + 1];
      if (next) expect(next.entryId, `Position ${index}`).not.toBe(task.entryId);
    });
  });

  it('ist bei gleichem Seed reproduzierbar', () => {
    const options = {
      packDirection: 'both' as const,
      choice: 'mixed' as const,
      groups: ALL_GROUPS,
      count: 10 as const,
      seed: 77,
    };

    expect(planSelfTest(entries, options).tasks.map((task) => task.id)).toEqual(
      planSelfTest(entries, options).tasks.map((task) => task.id),
    );
  });

  it('ergibt mit einem anderen Seed einen anderen Test', () => {
    const base = { packDirection: 'both' as const, choice: 'mixed' as const, groups: ALL_GROUPS, count: 10 as const };

    expect(planSelfTest(entries, { ...base, seed: 1 }).tasks.map((task) => task.id)).not.toEqual(
      planSelfTest(entries, { ...base, seed: 2 }).tasks.map((task) => task.id),
    );
  });

  it('folgt der gewählten Richtung', () => {
    const plan = planSelfTest(entries, {
      packDirection: 'both',
      choice: 'de-en',
      groups: ALL_GROUPS,
      count: 6,
      seed: 3,
    });

    expect(plan.tasks.every((task) => task.direction === 'de-en')).toBe(true);
  });

  it('erzeugt nur Aufgaben der gewählten Gruppe', () => {
    const plan = planSelfTest(entriesWithSentences(8), {
      packDirection: 'de-en',
      choice: 'mixed',
      groups: ['semi-open'],
      count: 8,
      seed: 5,
    });

    expect(plan.plannedCount).toBeGreaterThan(0);
    expect(plan.tasks.every((task) => task.kind.startsWith('cloze'))).toBe(true);
  });

  it('kommt mit genau einer möglichen Aufgabenart zurecht', () => {
    // Zwei Einträge: zu wenige Ablenker für Multiple Choice, keine Sätze.
    const plan = planSelfTest(entriesNamed(2), {
      packDirection: 'en-de',
      choice: 'mixed',
      groups: ALL_GROUPS,
      count: 10,
      seed: 1,
    });

    expect(plan.plannedCount).toBe(2);
    expect(plan.tasks.every((task) => task.kind === 'open-translation')).toBe(true);
  });

  it('bleibt bei einem leeren Paket leer', () => {
    const plan = planSelfTest([], {
      packDirection: 'both',
      choice: 'mixed',
      groups: ALL_GROUPS,
      count: 10,
      seed: 1,
    });

    expect(plan).toMatchObject({ plannedCount: 0, availableCount: 0 });
    expect(plan.tasks).toEqual([]);
  });

  it('liefert nichts, wenn die gewählte Art unmöglich ist', () => {
    // Lückensätze ohne Beispielsätze.
    const plan = planSelfTest(entriesNamed(6), {
      packDirection: 'de-en',
      choice: 'mixed',
      groups: ['semi-open'],
      count: 6,
      seed: 1,
    });

    expect(plan.plannedCount).toBe(0);
  });
});

describe('Auswertung', () => {
  const entries = entriesNamed(6);
  const plan = planSelfTest(entries, {
    packDirection: 'en-de',
    choice: 'mixed',
    groups: ['open'],
    count: 4,
    seed: 11,
  });

  function answerAll(verdicts: readonly ('correct' | 'almost' | 'wrong')[]): SelfTestAnswer[] {
    return plan.tasks.map((task, index) => ({
      taskId: task.id,
      given: `Antwort ${index + 1}`,
      verdict: verdicts[index] ?? 'wrong',
    }));
  }

  it('zählt richtig, fast richtig und noch nicht richtig', () => {
    const result = gradeSelfTest(plan.tasks, answerAll(['correct', 'almost', 'wrong', 'correct']));

    expect(result).toMatchObject({ total: 4, correct: 2, almost: 1, wrong: 1, percent: 50 });
    expect(describeResult(result)).toBe('2 von 4 richtig');
  });

  it('sammelt alle nicht vollständig richtigen Aufgaben als Fehler', () => {
    const result = gradeSelfTest(plan.tasks, answerAll(['correct', 'almost', 'wrong', 'correct']));

    expect(result.mistakes).toHaveLength(2);
    expect(result.mistakes.map((mistake) => mistake.verdict)).toEqual(['almost', 'wrong']);
    expect(result.mistakes[0]?.expected.length).toBeGreaterThan(0);
  });

  it('wertet eine ausgelassene Aufgabe als noch nicht richtig', () => {
    const result = gradeSelfTest(plan.tasks, []);

    expect(result).toMatchObject({ correct: 0, almost: 0, wrong: 4, percent: 0 });
    expect(result.mistakes).toHaveLength(4);
    expect(result.mistakes[0]?.given).toBe('');
  });

  it('meldet einen fehlerfreien Test ohne Fehlerliste', () => {
    const result = gradeSelfTest(plan.tasks, answerAll(['correct', 'correct', 'correct', 'correct']));

    expect(result.percent).toBe(100);
    expect(result.mistakes).toEqual([]);
  });

  it('kommt mit einem leeren Test zurecht', () => {
    expect(gradeSelfTest([], [])).toMatchObject({ total: 0, correct: 0, percent: 0 });
  });

  it('benutzt die zentrale Antwortprüfung', () => {
    const task = plan.tasks[0] as ExerciseTask;
    const expected = task.expected[0] as string;

    expect(checkTaskAnswer(task, expected)).toBe('correct');
    // Groß-/Kleinschreibung und Leerzeichen sind der zentralen Prüfung egal.
    expect(checkTaskAnswer(task, `  ${expected.toUpperCase()} `)).toBe('correct');
    expect(checkTaskAnswer(task, 'Unsinn')).toBe('wrong');
  });
});

describe('Fehlerrunde', () => {
  const entries = entriesNamed(8);
  const plan = planSelfTest(entries, {
    packDirection: 'both',
    choice: 'mixed',
    groups: ['open', 'closed'],
    count: 8,
    seed: 21,
  });

  const result = gradeSelfTest(
    plan.tasks,
    plan.tasks.map((task, index) => ({
      taskId: task.id,
      given: 'x',
      verdict: index % 2 === 0 ? ('wrong' as const) : ('correct' as const),
    })),
  );

  it('enthält ausschließlich die Fehler', () => {
    const round = planMistakeRound(result.mistakes, entries, 5);

    expect(round.plannedCount).toBe(result.mistakes.length);
    const wrongEntries = new Set(result.mistakes.map((mistake) => mistake.task.entryId));
    expect(round.tasks.every((task) => wrongEntries.has(task.entryId))).toBe(true);
  });

  it('behält die Richtung des ursprünglichen Fehlers', () => {
    const round = planMistakeRound(result.mistakes, entries, 5);

    for (const task of round.tasks) {
      const original = result.mistakes.find((mistake) => mistake.task.entryId === task.entryId);
      expect(task.direction).toBe(original?.task.direction);
    }
  });

  it('bleibt endlich und verliert keinen Fehler', () => {
    const round = planMistakeRound(result.mistakes, entries, 5);

    expect(round.plannedCount).toBe(round.tasks.length);
    expect(new Set(round.tasks.map((task) => task.entryId)).size).toBe(
      new Set(result.mistakes.map((mistake) => mistake.task.entryId)).size,
    );
  });

  it('vergibt eigene Aufgaben-IDs, damit sich Runden nicht vermischen', () => {
    const round = planMistakeRound(result.mistakes, entries, 5);
    const before = new Set(plan.tasks.map((task) => task.id));

    expect(round.tasks.every((task) => !before.has(task.id))).toBe(true);
  });

  it('ergibt aus einer fehlerfreien Runde gar keine Aufgaben', () => {
    expect(planMistakeRound([], entries, 1)).toMatchObject({ plannedCount: 0 });
  });

  it('lässt sich erneut auswerten und erneut wiederholen', () => {
    const first = planMistakeRound(result.mistakes, entries, 5);
    const secondResult = gradeSelfTest(
      first.tasks,
      first.tasks.map((task) => ({ taskId: task.id, given: 'x', verdict: 'wrong' as const })),
    );

    expect(secondResult.mistakes).toHaveLength(first.plannedCount);

    // Und daraus wieder eine endliche Runde – ohne Schleife.
    const second = planMistakeRound(secondResult.mistakes, entries, 6);
    expect(second.plannedCount).toBe(first.plannedCount);
  });
});
