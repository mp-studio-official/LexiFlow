import { describe, expect, it } from 'vitest';
import {
  freeAvailableCount,
  freeTargets,
  planFreeSession,
  previewFreeRound,
} from './freePractice';
import {
  MIN_SIBLING_GAP,
  buildTasksForTargets,
  mulberry32,
  planSession,
  type ExerciseKind,
} from './exercises';
import { effectiveDirection, type DirectionChoice } from './practiceDirection';
import { createEntryProgress } from './leitner';
import { directionKey } from './ids';
import { makeEntry } from '../test/fixtures';
import type { EntryProgress, TaskDirection, VocabEntry } from './schema';

/**
 * Sprint 2A.2: Freies Üben plant unabhängig vom Leitner-Termin – und verändert
 * ihn nicht. Alle Zeitpunkte sind fest, damit die Tests nicht von der echten
 * Uhrzeit abhängen.
 */

const NOW = new Date('2026-03-02T10:00:00.000Z');
const PAST = '2026-03-01T00:00:00.000Z';
const LATER = '2026-05-01T00:00:00.000Z';

function entriesNamed(count: number): VocabEntry[] {
  return Array.from({ length: count }, (_, index) =>
    makeEntry({
      id: `e${index + 1}`,
      english: `word${index + 1}`,
      germanAnswers: [`Wort${index + 1}`],
    }),
  );
}

function progressFor(
  rows: Array<{ id: string; direction: TaskDirection; box?: number; dueAt?: string }>,
): Map<string, EntryProgress> {
  const map = new Map<string, EntryProgress>();
  for (const { id, direction, box = 1, dueAt = PAST } of rows) {
    map.set(directionKey(id, direction), {
      ...createEntryProgress('pack-1', id, direction, NOW),
      box,
      dueAt,
    });
  }
  return map;
}

/** Alle rezeptiven Ziele auf einen späteren Termin legen. */
function allLater(entries: readonly VocabEntry[], box = 3): Map<string, EntryProgress> {
  return progressFor(
    entries.map((entry) => ({ id: entry.id, direction: 'en-de' as const, box, dueAt: LATER })),
  );
}

describe('Später fällige Aufgaben', () => {
  const entries = entriesNamed(6);
  const progress = allLater(entries);

  it('sind für den Lernplan tabu', () => {
    const plan = planSession(entries, progress, 'en-de', 15, NOW, mulberry32(1));
    expect(plan.readyCount).toBe(0);
    expect(plan.targets).toEqual([]);
  });

  it('stehen fürs freie Üben trotzdem bereit', () => {
    const plan = planFreeSession(entries, progress, 'en-de', 15, mulberry32(1));
    expect(plan.availableCount).toBe(6);
    expect(plan.plannedCount).toBe(6);
  });

  it('lassen den Lernplan unberührt – die Planung ist rein', () => {
    const before = structuredClone([...progress.entries()]);
    planFreeSession(entries, progress, 'en-de', 15, mulberry32(1));
    expect([...progress.entries()]).toEqual(before);
  });
});

describe('Auswahl der Ziele', () => {
  it('nimmt neue, fällige und später fällige Aufgaben auf', () => {
    const entries = entriesNamed(3);
    const progress = progressFor([
      { id: 'e1', direction: 'en-de', dueAt: PAST }, // fällig
      { id: 'e2', direction: 'en-de', dueAt: LATER }, // später
      // e3 ist noch nie geübt worden.
    ]);

    const ids = planFreeSession(entries, progress, 'en-de', 10, mulberry32(7)).targets.map(
      (target) => target.entry.id,
    );
    expect([...ids].sort()).toEqual(['e1', 'e2', 'e3']);
  });

  // Sprint 3B.1: Freies Üben bietet beide Richtungen sofort an.
  it('bietet bei „beide Richtungen“ sofort beide Richtungen an', () => {
    const entries = entriesNamed(4);
    const progress = progressFor(
      entries.map((entry) => ({ id: entry.id, direction: 'en-de' as const, box: 1, dueAt: LATER })),
    );

    const plan = planFreeSession(entries, progress, 'both', 20, mulberry32(3));
    expect(plan.availableCount).toBe(8);
    expect(plan.targets.some((target) => target.direction === 'de-en')).toBe(true);
    expect(plan.targets.some((target) => target.direction === 'en-de')).toBe(true);
  });

  it('bietet beide Richtungen auch ganz ohne Lernstand an', () => {
    const entries = entriesNamed(3);
    const plan = planFreeSession(entries, new Map(), 'both', 20, mulberry32(3));

    expect(plan.availableCount).toBe(6);
    expect(plan.targets.some((target) => target.direction === 'de-en')).toBe(true);
  });

  it('nimmt nach der Freischaltung beide Richtungen auf', () => {
    const entries = entriesNamed(4);
    const progress = progressFor(
      entries.map((entry) => ({ id: entry.id, direction: 'en-de' as const, box: 2, dueAt: LATER })),
    );

    const plan = planFreeSession(entries, progress, 'both', 20, mulberry32(3));
    expect(plan.availableCount).toBe(8);
    expect(new Set(plan.targets.map((target) => target.direction))).toEqual(
      new Set(['en-de', 'de-en']),
    );
  });

  it('liefert für ein leeres Paket nichts', () => {
    const plan = planFreeSession([], new Map(), 'both', 15, mulberry32(1));
    expect(plan).toEqual({
      targets: [],
      availableCount: 0,
      possibleCount: 0,
      plannedCount: 0,
      remainingAvailableCount: 0,
    });
  });

  it('kennt dieselben Ziele wie freeTargets', () => {
    const entries = entriesNamed(5);
    const progress = allLater(entries);
    expect(freeTargets(entries, progress, 'en-de')).toHaveLength(5);
  });
});

describe('Reihenfolge und Umfang', () => {
  const entries = entriesNamed(12);
  const progress = allLater(entries);

  it('ist bei gleichem Seed reproduzierbar', () => {
    const first = planFreeSession(entries, progress, 'en-de', 12, mulberry32(42));
    const second = planFreeSession(entries, progress, 'en-de', 12, mulberry32(42));
    expect(first.targets.map((target) => target.entry.id)).toEqual(
      second.targets.map((target) => target.entry.id),
    );
  });

  it('mischt – ein anderer Seed ergibt eine andere Reihenfolge', () => {
    const a = planFreeSession(entries, progress, 'en-de', 12, mulberry32(1));
    const b = planFreeSession(entries, progress, 'en-de', 12, mulberry32(999));
    expect(a.targets.map((target) => target.entry.id)).not.toEqual(
      b.targets.map((target) => target.entry.id),
    );
  });

  it('hält den Abstand zwischen den Richtungen einer Vokabel ein', () => {
    const both = entriesNamed(8);
    const unlocked = progressFor(
      both.map((entry) => ({ id: entry.id, direction: 'en-de' as const, box: 2, dueAt: LATER })),
    );
    const plan = planFreeSession(both, unlocked, 'both', 16, mulberry32(5));

    plan.targets.forEach((target, index) => {
      const window = plan.targets.slice(Math.max(0, index - MIN_SIBLING_GAP), index);
      expect(window.some((other) => other.entry.id === target.entry.id)).toBe(false);
    });
  });

  it('behandelt die Länge als Obergrenze und zählt den Rest ehrlich', () => {
    const plan = planFreeSession(entries, progress, 'en-de', 5, mulberry32(2));
    expect(plan.plannedCount).toBe(5);
    expect(plan.availableCount).toBe(12);
    expect(plan.remainingAvailableCount).toBe(7);
  });

  it('plant bei Länge 0 nichts, ohne die Verfügbarkeit zu verfälschen', () => {
    const plan = planFreeSession(entries, progress, 'en-de', 0, mulberry32(2));
    expect(plan.plannedCount).toBe(0);
    expect(plan.availableCount).toBe(12);
    expect(plan.remainingAvailableCount).toBe(12);
  });

  it('plant nie mehr, als verfügbar ist', () => {
    const plan = planFreeSession(entries, progress, 'en-de', 100, mulberry32(2));
    expect(plan.plannedCount).toBe(12);
    expect(plan.remainingAvailableCount).toBe(0);
  });
});

describe('Runde anpassen: Vorschau', () => {
  /*
    Sprint 3B.2b1: Die Vorschau darf nicht schätzen. Sie baut die Runde wirklich
    und zählt danach – deshalb prüfen diese Tests sie gegen genau den Weg, den
    die Übungsseite geht.
  */
  const entries = entriesNamed(6);
  const empty = new Map<string, EntryProgress>();

  /** Eine Vokabel mit Beispielsatz, eine ohne – der Testfall aus dem Alltag. */
  const mixedEntries = [
    makeEntry({
      id: 'x1',
      english: 'island',
      germanAnswers: ['die Insel'],
      exampleSentences: [{ english: 'The island is famous.', german: 'Die Insel ist berühmt.' }],
    }),
    makeEntry({ id: 'x2', english: 'bay', germanAnswers: ['die Bucht'] }),
  ];

  function actualRound(
    packDirection: 'en-de' | 'de-en' | 'both',
    choice: DirectionChoice,
    kinds: readonly ExerciseKind[],
    length: number,
    seed: number,
  ) {
    const rng = mulberry32(seed);
    const plan = planFreeSession(
      entries,
      empty,
      effectiveDirection(packDirection, choice),
      length,
      rng,
      kinds,
    );
    return buildTasksForTargets(plan.targets, entries, empty, kinds, rng, 'strict');
  }

  it('zählt genau die Runde, die anschließend startet', () => {
    const preview = previewFreeRound(entries, empty, 'both', 'mixed', ['multiple-choice'], 8, 99);
    const tasks = actualRound('both', 'mixed', ['multiple-choice'], 8, 99);

    expect(preview.plannedCount).toBe(tasks.length);
    expect(preview.tasks.map((task) => task.id)).toEqual(tasks.map((task) => task.id));
    expect(preview.tasks.map((task) => task.kind)).toEqual(tasks.map((task) => task.kind));
  });

  it('kennt alle Ziele der gewählten Richtung, unabhängig von der Fälligkeit', () => {
    const later = allLater(entries);
    expect(freeAvailableCount(entries, 'both', 'mixed')).toBe(12);
    expect(previewFreeRound(entries, later, 'both', 'mixed', [], 100, 1).availableCount).toBe(12);
  });

  it('folgt der Richtungswahl', () => {
    expect(freeAvailableCount(entries, 'both', 'en-de')).toBe(6);
    expect(freeAvailableCount(entries, 'both', 'de-en')).toBe(6);
    expect(freeAvailableCount(entries, 'both', 'mixed')).toBe(12);
  });

  it('behandelt den Umfang als Obergrenze und benennt den Rest', () => {
    const preview = previewFreeRound(entries, empty, 'en-de', 'mixed', [], 4, 7);
    expect(preview.plannedCount).toBe(4);
    expect(preview.requested).toBe(4);
    expect(preview.remainingAvailableCount).toBe(2);
  });

  it('erfindet nichts, wenn weniger möglich ist als gewünscht', () => {
    const preview = previewFreeRound(entries, empty, 'en-de', 'mixed', [], 20, 7);
    expect(preview.plannedCount).toBe(6);
    expect(preview.remainingAvailableCount).toBe(0);
  });

  it('plant nichts, wenn keine Vokabel die gewählte Form hergibt', () => {
    // Lückensätze gibt es hier nirgends – und es wird nichts ersatzweise gebaut.
    const preview = previewFreeRound(entries, empty, 'de-en', 'mixed', ['cloze-free'], 6, 3);
    expect(preview.availableCount).toBe(6);
    expect(preview.possibleCount).toBe(0);
    expect(preview.plannedCount).toBe(0);
    expect(preview.tasks).toEqual([]);
  });

  it('nimmt bei strikter Auswahl nur die Vokabeln, die sie hergeben', () => {
    const preview = previewFreeRound(mixedEntries, empty, 'de-en', 'mixed', ['cloze-free'], 10, 5);

    expect(preview.availableCount).toBe(2);
    expect(preview.possibleCount).toBe(1);
    expect(preview.plannedCount).toBe(1);
    expect(preview.tasks.map((task) => task.kind)).toEqual(['cloze-free']);
    expect(preview.tasks[0]?.entryId).toBe('x1');
  });

  it('ist bei gleichem Seed reproduzierbar', () => {
    const a = previewFreeRound(entries, empty, 'both', 'mixed', ['flashcard'], 9, 42);
    const b = previewFreeRound(entries, empty, 'both', 'mixed', ['flashcard'], 9, 42);
    expect(a).toEqual(b);
  });
});

describe('Ausgewählte Übungsformen sind verbindlich', () => {
  /*
    Sprint 3B.2b2: Eine ausdrücklich getroffene Auswahl ist keine Vorliebe.
    Wer „nur Lückensätze“ wählt, bekommt nur Lückensätze – und Vokabeln ohne
    geeigneten Beispielsatz kommen in dieser Runde eben nicht vor. Der
    Direktstart (ohne `kinds`) behält dagegen seinen Ersatzmechanismus.
  */
  const empty = new Map<string, EntryProgress>();

  /** Zwei mit Beispielsatz, zwei ohne – nur die ersten beiden können Lücke. */
  const pack = [
    makeEntry({
      id: 'c1',
      english: 'island',
      germanAnswers: ['die Insel'],
      exampleSentences: [{ english: 'The island is famous.', german: 'Die Insel ist berühmt.' }],
    }),
    makeEntry({
      id: 'c2',
      english: 'bay',
      germanAnswers: ['die Bucht'],
      exampleSentences: [{ english: 'The bay is calm.', german: 'Die Bucht ist ruhig.' }],
    }),
    makeEntry({ id: 'c3', english: 'cave', germanAnswers: ['die Höhle'] }),
    makeEntry({ id: 'c4', english: 'boat', germanAnswers: ['das Boot'] }),
  ];

  function strictRound(kinds: readonly ExerciseKind[], length = 20, seed = 11) {
    return previewFreeRound(pack, empty, 'de-en', 'mixed', kinds, length, seed);
  }

  it('bleibt ohne Auswahl beim automatischen Verhalten mit Ersatzform', () => {
    const auto = previewFreeRound(pack, empty, 'de-en', 'mixed', [], 20, 11);

    expect(auto.availableCount).toBe(4);
    expect(auto.possibleCount).toBe(4);
    expect(auto.plannedCount).toBe(4);
  });

  it('behält den Ersatz auch, wenn `kinds` ausdrücklich als automatisch gilt', () => {
    // Der Direktstart übergibt keine Formen; ein Aufrufer, der `auto` verlangt,
    // bekommt weiterhin die alte Bedeutung – hier: alle vier Vokabeln.
    const auto = previewFreeRound(pack, empty, 'de-en', 'mixed', ['cloze-free'], 20, 11, 'auto');

    expect(auto.plannedCount).toBe(4);
    expect(auto.tasks.some((task) => task.kind !== 'cloze-free')).toBe(true);
  });

  it('plant bei „nur Lückensätze“ ausschließlich Lückensätze', () => {
    const round = strictRound(['cloze-free', 'cloze-bank']);

    expect(round.availableCount).toBe(4);
    expect(round.possibleCount).toBe(2);
    expect(round.plannedCount).toBe(2);
    expect(round.tasks.every((task) => task.kind.startsWith('cloze'))).toBe(true);
    // Genau die beiden Vokabeln mit Beispielsatz.
    expect(round.tasks.map((task) => task.entryId).sort()).toEqual(['c1', 'c2']);
  });

  it('plant bei „nur Multiple Choice“ ausschließlich Multiple Choice', () => {
    const round = strictRound(['multiple-choice']);

    expect(round.plannedCount).toBe(4);
    expect(round.tasks.every((task) => task.kind === 'multiple-choice')).toBe(true);
  });

  it('nimmt bei mehreren Formen nur Formen aus der Auswahl', () => {
    const chosen: ExerciseKind[] = ['multiple-choice', 'cloze-bank'];
    const round = strictRound(chosen);

    expect(round.plannedCount).toBe(4);
    expect(round.tasks.every((task) => chosen.includes(task.kind))).toBe(true);
  });

  it('lässt gar nichts übrig, wenn keine Vokabel die Auswahl hergibt', () => {
    const withoutSentences = [
      makeEntry({ id: 'n1', english: 'cave', germanAnswers: ['die Höhle'] }),
      makeEntry({ id: 'n2', english: 'boat', germanAnswers: ['das Boot'] }),
    ];
    const round = previewFreeRound(withoutSentences, empty, 'de-en', 'mixed', ['cloze-bank'], 20, 3);

    expect(round.possibleCount).toBe(0);
    expect(round.plannedCount).toBe(0);
  });

  it('ergibt bei gleichem Seed dieselben Aufgaben', () => {
    const a = strictRound(['multiple-choice', 'open-translation'], 20, 77);
    const b = strictRound(['multiple-choice', 'open-translation'], 20, 77);

    expect(a.tasks.map((task) => `${task.id}:${task.kind}`)).toEqual(
      b.tasks.map((task) => `${task.id}:${task.kind}`),
    );
  });

  it('schöpft die Rundengröße an den machbaren Zielen aus', () => {
    // Zwei von vier können Lücke; eine Runde „bis zu 2“ darf keinen Platz an
    // den ungeeigneten Vokabeln verlieren.
    const round = strictRound(['cloze-free', 'cloze-bank'], 2, 4);
    expect(round.plannedCount).toBe(2);
  });
});

describe('Freies Üben und der Lernstand', () => {
  /*
    Sprint 3B.2b2, Punkt 5: Der Lernstand darf höchstens die *automatische*
    Wahl der Form beeinflussen – nie, ob eine Vokabel überhaupt vorkommt, und
    erst recht nicht eine ausdrückliche Auswahl.
  */
  const entries = entriesNamed(4);
  const empty = new Map<string, EntryProgress>();

  it('ignoriert eine Fälligkeit in der Zukunft vollständig', () => {
    const later = allLater(entries, 5);
    const withProgress = previewFreeRound(entries, later, 'en-de', 'mixed', [], 20, 8);
    const without = previewFreeRound(entries, empty, 'en-de', 'mixed', [], 20, 8);

    expect(withProgress.availableCount).toBe(4);
    expect(withProgress.plannedCount).toBe(4);
    expect(withProgress.tasks.map((task) => task.entryId).sort()).toEqual(
      without.tasks.map((task) => task.entryId).sort(),
    );
  });

  it('hält die produktive Richtung unabhängig vom Leitner-Fach offen', () => {
    // Fach 1 rezeptiv: Der Lernplan hätte „Deutsch → Englisch“ noch gesperrt.
    const early = progressFor(
      entries.map((entry) => ({ id: entry.id, direction: 'en-de' as const, box: 1 })),
    );
    const round = previewFreeRound(entries, early, 'both', 'de-en', [], 20, 8);

    expect(round.availableCount).toBe(4);
    expect(round.tasks.every((task) => task.direction === 'de-en')).toBe(true);
  });

  it('lässt den Lernstand die Teilnahme einer Vokabel nicht entscheiden', () => {
    const mixedBoxes = progressFor([
      { id: 'e1', direction: 'en-de', box: 1 },
      { id: 'e2', direction: 'en-de', box: 5, dueAt: LATER },
    ]);
    const round = previewFreeRound(entries, mixedBoxes, 'en-de', 'mixed', [], 20, 8);

    expect(round.plannedCount).toBe(4);
    expect(round.tasks.map((task) => task.entryId).sort()).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('lässt eine strikte Auswahl nicht vom Lernstand überschreiben', () => {
    // Fach 5 würde automatisch „offene Übersetzung“ nahelegen – gewählt ist
    // aber Multiple Choice, und das gilt.
    const highBox = progressFor(
      entries.map((entry) => ({ id: entry.id, direction: 'en-de' as const, box: 5 })),
    );
    const round = previewFreeRound(entries, highBox, 'en-de', 'mixed', ['multiple-choice'], 20, 8);

    expect(round.plannedCount).toBe(4);
    expect(round.tasks.every((task) => task.kind === 'multiple-choice')).toBe(true);
  });
});
