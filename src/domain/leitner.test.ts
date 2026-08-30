import { describe, expect, it } from 'vitest';
import {
  applyAnswer,
  boxDistribution,
  countMastered,
  createEntryProgress,
  directionBreakdown,
  isDue,
  isEntryMastered,
  nextBox,
} from './leitner';
import { directionKey } from './ids';
import type { EntryProgress } from './schema';

const NOW = new Date('2026-03-02T10:00:00.000Z');

function index(...rows: EntryProgress[]): Map<string, EntryProgress> {
  return new Map(rows.map((row) => [directionKey(row.entryId, row.direction), row]));
}

describe('nextBox', () => {
  it('rückt bei richtiger Antwort ein Fach vor', () => {
    expect(nextBox(1, 'correct')).toBe(2);
    expect(nextBox(4, 'correct')).toBe(5);
  });

  it('bleibt in Fach 5 stehen', () => {
    expect(nextBox(5, 'correct')).toBe(5);
  });

  it('hält das Fach bei „fast richtig“', () => {
    expect(nextBox(3, 'almost')).toBe(3);
  });

  it('setzt bei falscher Antwort auf Fach 1 zurück', () => {
    expect(nextBox(5, 'wrong')).toBe(1);
  });
});

describe('createEntryProgress', () => {
  it('bindet den Schlüssel an Paket, Vokabel und Richtung', () => {
    const progress = createEntryProgress('p1', 'e1', 'de-en', NOW);
    expect(progress.key).toBe('p1::e1::de-en');
    expect(progress.direction).toBe('de-en');
  });
});

describe('applyAnswer', () => {
  it('zählt richtige Antworten und verlängert das Intervall', () => {
    const start = createEntryProgress('p1', 'e1', 'en-de', NOW);
    const after = applyAnswer(start, 'correct', NOW);
    expect(after.box).toBe(2);
    expect(after.correctCount).toBe(1);
    expect(after.streak).toBe(1);
    expect(new Date(after.dueAt).getTime()).toBe(NOW.getTime() + 24 * 60 * 60 * 1000);
  });

  it('beendet die Serie bei einem Fehler', () => {
    const start = { ...createEntryProgress('p1', 'e1', 'en-de', NOW), box: 3, streak: 4 };
    const after = applyAnswer(start, 'wrong', NOW);
    expect(after.box).toBe(1);
    expect(after.streak).toBe(0);
    expect(after.wrongCount).toBe(1);
    expect(new Date(after.dueAt).getTime()).toBe(NOW.getTime());
  });

  it('legt „fast richtig“ kurzfristig zurück', () => {
    const start = { ...createEntryProgress('p1', 'e1', 'en-de', NOW), box: 2 };
    const after = applyAnswer(start, 'almost', NOW);
    expect(after.box).toBe(2);
    expect(new Date(after.dueAt).getTime()).toBeGreaterThan(NOW.getTime());
    expect(new Date(after.dueAt).getTime()).toBeLessThan(NOW.getTime() + 60 * 60 * 1000);
  });

  it('behält die Richtung bei', () => {
    const after = applyAnswer(createEntryProgress('p1', 'e1', 'de-en', NOW), 'correct', NOW);
    expect(after.direction).toBe('de-en');
    expect(after.key).toBe('p1::e1::de-en');
  });

  it('verändert den Ausgangswert nicht', () => {
    const start = createEntryProgress('p1', 'e1', 'en-de', NOW);
    applyAnswer(start, 'correct', NOW);
    expect(start.box).toBe(1);
    expect(start.correctCount).toBe(0);
  });
});

describe('isDue', () => {
  it('erkennt neue Vokabeln als sofort fällig', () => {
    expect(isDue(createEntryProgress('p1', 'e1', 'en-de', NOW), NOW)).toBe(true);
  });

  it('erkennt zurückgelegte Vokabeln als nicht fällig', () => {
    const later = applyAnswer(createEntryProgress('p1', 'e1', 'en-de', NOW), 'correct', NOW);
    expect(isDue(later, NOW)).toBe(false);
  });
});

describe('isEntryMastered', () => {
  const receptive = { ...createEntryProgress('p1', 'e1', 'en-de', NOW), box: 5 };
  const productive = { ...createEntryProgress('p1', 'e1', 'de-en', NOW), box: 5 };

  it('verlangt bei einer Richtung nur diese', () => {
    expect(isEntryMastered(index(receptive), 'e1', ['en-de'])).toBe(true);
  });

  it('verlangt bei beiden Richtungen beide', () => {
    expect(isEntryMastered(index(receptive), 'e1', ['en-de', 'de-en'])).toBe(false);
    expect(isEntryMastered(index(receptive, productive), 'e1', ['en-de', 'de-en'])).toBe(true);
  });

  it('gilt ohne Lernstand nicht als sicher', () => {
    expect(isEntryMastered(new Map(), 'e1', ['en-de'])).toBe(false);
  });
});

describe('countMastered', () => {
  it('zählt nur vollständig sichere Vokabeln', () => {
    const rows = index(
      { ...createEntryProgress('p1', 'e1', 'en-de', NOW), box: 5 },
      { ...createEntryProgress('p1', 'e1', 'de-en', NOW), box: 5 },
      { ...createEntryProgress('p1', 'e2', 'en-de', NOW), box: 5 },
      { ...createEntryProgress('p1', 'e2', 'de-en', NOW), box: 3 },
    );
    expect(countMastered(['e1', 'e2'], rows, ['en-de', 'de-en'])).toBe(1);
    expect(countMastered(['e1', 'e2'], rows, ['en-de'])).toBe(2);
  });
});

describe('directionBreakdown', () => {
  it('zählt noch nie geübte Vokabeln als „Neu“, nicht als Fach 1', () => {
    const breakdown = directionBreakdown(['e1', 'e2', 'e3', 'e4'], new Map(), 'en-de', 'en-de');
    expect(breakdown.fresh).toBe(4);
    expect(breakdown.locked).toBe(0);
    expect(breakdown.boxes).toEqual([0, 0, 0, 0, 0]);
  });

  it('trennt „Neu“ von zurückgestuften Vokabeln in Fach 1', () => {
    const rows = index({ ...createEntryProgress('p1', 'e1', 'en-de', NOW), box: 1 });
    const breakdown = directionBreakdown(['e1', 'e2'], rows, 'en-de', 'en-de');
    expect(breakdown.boxes[0]).toBe(1);
    expect(breakdown.fresh).toBe(1);
  });

  it('weist bei „beide Richtungen“ noch gesperrte Vokabeln aus', () => {
    const breakdown = directionBreakdown(['e1', 'e2'], new Map(), 'de-en', 'both');
    expect(breakdown.locked).toBe(2);
    expect(breakdown.fresh).toBe(0);
  });

  it('zählt freigeschaltete, aber ungeübte Vokabeln als „Neu“', () => {
    const rows = index({ ...createEntryProgress('p1', 'e1', 'en-de', NOW), box: 2 });
    const breakdown = directionBreakdown(['e1', 'e2'], rows, 'de-en', 'both');
    expect(breakdown.fresh).toBe(1);
    expect(breakdown.locked).toBe(1);
  });
});

describe('boxDistribution', () => {
  it('zählt je Richtung getrennt', () => {
    const rows = index(
      { ...createEntryProgress('p1', 'e1', 'en-de', NOW), box: 4 },
      { ...createEntryProgress('p1', 'e1', 'de-en', NOW), box: 1 },
    );
    expect(boxDistribution(['e1'], rows, 'en-de')).toEqual([0, 0, 0, 1, 0]);
    expect(boxDistribution(['e1'], rows, 'de-en')).toEqual([1, 0, 0, 0, 0]);
  });
});
