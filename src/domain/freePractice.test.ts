import { describe, expect, it } from 'vitest';
import { freeTargets, planFreeSession } from './freePractice';
import { MIN_SIBLING_GAP, mulberry32, planSession } from './exercises';
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

  it('lässt bei „beide Richtungen“ die produktive Richtung gesperrt', () => {
    const entries = entriesNamed(4);
    const progress = progressFor(
      entries.map((entry) => ({ id: entry.id, direction: 'en-de' as const, box: 1, dueAt: LATER })),
    );

    const plan = planFreeSession(entries, progress, 'both', 20, mulberry32(3));
    expect(plan.availableCount).toBe(4);
    expect(plan.targets.every((target) => target.direction === 'en-de')).toBe(true);
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
