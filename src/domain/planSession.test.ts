import { describe, expect, it } from 'vitest';
import {
  buildSession,
  countReady,
  findNextDueAt,
  mulberry32,
  planSession,
  selectTargets,
} from './exercises';
import { applyAnswer, createEntryProgress } from './leitner';
import { directionKey } from './ids';
import { makeEntry } from '../test/fixtures';
import type { EntryProgress, TaskDirection, VocabEntry } from './schema';

/**
 * Regressionstests zu Sprint 1.3: Eine normale Leitner-Runde darf ausschließlich
 * freigeschaltete Ziele enthalten, die neu oder jetzt fällig sind. Später
 * fällige Karten sind kein Füllmaterial.
 */

const NOW = new Date('2026-03-02T10:00:00.000Z');
const PAST = '2026-03-01T00:00:00.000Z';
const SOON = '2026-03-03T08:00:00.000Z';
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

describe('planSession – keine späteren Karten in einer normalen Runde', () => {
  const entries = entriesNamed(6);

  it('lässt Ziele mit dueAt > now vollständig aus', () => {
    const progress = progressFor([
      { id: 'e1', direction: 'en-de', dueAt: PAST },
      { id: 'e2', direction: 'en-de', dueAt: LATER },
      { id: 'e3', direction: 'en-de', dueAt: LATER },
      { id: 'e4', direction: 'en-de', dueAt: LATER },
      { id: 'e5', direction: 'en-de', dueAt: LATER },
      { id: 'e6', direction: 'en-de', dueAt: LATER },
    ]);
    const plan = planSession(entries, progress, 'en-de', 15, NOW, mulberry32(1));

    expect(plan.readyCount).toBe(1);
    expect(plan.plannedCount).toBe(1);
    expect(plan.targets.map((target) => target.entry.id)).toEqual(['e1']);
  });

  it('füllt eine zu kleine Runde nicht mit späteren Karten auf', () => {
    const progress = progressFor(
      entries.map((entry, index) => ({
        id: entry.id,
        direction: 'en-de' as const,
        dueAt: index === 0 ? PAST : LATER,
      })),
    );
    // Angeforderte Länge 15, bereit ist nur eine Aufgabe.
    expect(selectTargets(entries, progress, 'en-de', 15, NOW, mulberry32(2))).toHaveLength(1);
  });

  it('gilt auch für die gebauten Aufgaben', () => {
    const progress = progressFor(
      entries.map((entry, index) => ({
        id: entry.id,
        direction: 'en-de' as const,
        dueAt: index < 2 ? PAST : LATER,
      })),
    );
    const tasks = buildSession(entries, progress, {
      direction: 'en-de',
      kinds: [],
      length: 20,
      now: NOW,
      rng: mulberry32(3),
    });
    expect(tasks).toHaveLength(2);
    for (const task of tasks) {
      const state = progress.get(directionKey(task.entryId, task.direction));
      expect(state === undefined || new Date(state.dueAt) <= NOW).toBe(true);
    }
  });

  it('plant nichts, wenn alles später fällig ist', () => {
    const progress = progressFor(
      entries.map((entry) => ({ id: entry.id, direction: 'en-de' as const, dueAt: LATER })),
    );
    const plan = planSession(entries, progress, 'en-de', 15, NOW, mulberry32(4));
    expect(plan.readyCount).toBe(0);
    expect(plan.plannedCount).toBe(0);
    expect(plan.targets).toEqual([]);
    expect(plan.nextDueAt).toBe(LATER);
  });
});

describe('planSession – Kennzahlen', () => {
  const entries = entriesNamed(8);

  it('plannedCount entspricht exakt targets.length', () => {
    for (const length of [1, 3, 5, 8, 20]) {
      const plan = planSession(entries, new Map(), 'en-de', length, NOW, mulberry32(length));
      expect(plan.plannedCount).toBe(plan.targets.length);
    }
  });

  it('readyCount stimmt mit countReady überein', () => {
    const progress = progressFor([
      { id: 'e1', direction: 'en-de', dueAt: PAST },
      { id: 'e2', direction: 'en-de', dueAt: LATER },
    ]);
    const plan = planSession(entries, progress, 'en-de', 3, NOW, mulberry32(5));
    expect(plan.readyCount).toBe(countReady(entries, progress, 'en-de', NOW));
    expect(plan.readyCount).toBe(7); // 8 Einträge, einer davon später fällig
  });

  it('remainingReadyCount erklärt die Differenz zur Rundengröße', () => {
    const plan = planSession(entries, new Map(), 'en-de', 3, NOW, mulberry32(6));
    expect(plan.plannedCount).toBe(3);
    expect(plan.remainingReadyCount).toBe(plan.readyCount - plan.plannedCount);
    expect(plan.remainingReadyCount).toBe(5);
  });

  it('meldet den nächsten Termin nur für freigeschaltete Ziele', () => {
    const progress = progressFor([
      { id: 'e1', direction: 'en-de', box: 3, dueAt: LATER },
      { id: 'e2', direction: 'en-de', box: 3, dueAt: SOON },
    ]);
    expect(findNextDueAt(entries, progress, 'en-de', NOW)).toBe(SOON);
  });

  it('zählt gesperrte produktive Richtungen nicht als bereit', () => {
    const four = entriesNamed(4);
    const plan = planSession(four, new Map(), 'both', 20, NOW, mulberry32(7));
    expect(plan.readyCount).toBe(4);
    expect(plan.targets.every((target) => target.direction === 'en-de')).toBe(true);
    expect(countReady(four, new Map(), 'both', NOW, 'de-en')).toBe(0);
  });
});

describe('Folgerunde bei direction = both', () => {
  const entries = entriesNamed(4);

  it('Runde 1 enthält vier EN→DE-Aufgaben, Runde 2 genau vier DE→EN-Aufgaben', () => {
    // ---------- Runde 1 ----------
    const round1 = planSession(entries, new Map(), 'both', 20, NOW, mulberry32(11));
    expect(round1.readyCount).toBe(4);
    expect(round1.plannedCount).toBe(4);
    expect(round1.targets.every((target) => target.direction === 'en-de')).toBe(true);

    // Alle vier richtig beantwortet → Fach 2, nächste Fälligkeit in einem Tag.
    const progress = new Map<string, EntryProgress>();
    for (const target of round1.targets) {
      const updated = applyAnswer(
        createEntryProgress('pack-1', target.entry.id, 'en-de', NOW),
        'correct',
        NOW,
      );
      expect(updated.box).toBe(2);
      progress.set(directionKey(target.entry.id, 'en-de'), updated);
    }

    // ---------- Runde 2 ----------
    const round2 = planSession(entries, progress, 'both', 20, NOW, mulberry32(12));
    expect(round2.readyCount).toBe(4);
    expect(round2.plannedCount).toBe(4);
    expect(round2.targets.every((target) => target.direction === 'de-en')).toBe(true);
    expect(new Set(round2.targets.map((target) => target.entry.id)).size).toBe(4);

    // Die rezeptiven Aufgaben sind noch nicht wieder fällig und fehlen deshalb.
    expect(round2.targets.some((target) => target.direction === 'en-de')).toBe(false);
    expect(round2.nextDueAt).toBe(
      new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it('baut in Runde 2 genau vier produktive Aufgaben', () => {
    const progress = new Map<string, EntryProgress>();
    for (const entry of entries) {
      progress.set(
        directionKey(entry.id, 'en-de'),
        applyAnswer(createEntryProgress('pack-1', entry.id, 'en-de', NOW), 'correct', NOW),
      );
    }
    const tasks = buildSession(entries, progress, {
      direction: 'both',
      kinds: [],
      length: 20,
      now: NOW,
      rng: mulberry32(13),
    });
    expect(tasks).toHaveLength(4);
    expect(tasks.every((task) => task.direction === 'de-en')).toBe(true);
  });
});
