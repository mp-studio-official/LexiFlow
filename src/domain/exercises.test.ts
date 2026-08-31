import { describe, expect, it } from 'vitest';
import {
  arrangeTargets,
  availableKinds,
  buildCloze,
  buildSession,
  buildTask,
  countReady,
  eligibleTargets,
  isDirectionUnlocked,
  kindsAvailableInPack,
  MIN_SIBLING_GAP,
  mulberry32,
  pickDistractors,
  selectTargets,
  shuffle,
  type SessionTarget,
} from './exercises';
import { createEntryProgress } from './leitner';
import { directionKey } from './ids';
import { makeEntry, makePack } from '../test/fixtures';
import type { EntryProgress, TaskDirection, VocabEntry } from './schema';

const rng = () => mulberry32(42);
const NOW = new Date('2026-03-02T10:00:00.000Z');
const PAST = '2026-03-01T00:00:00.000Z';
const FUTURE = '2026-05-01T00:00:00.000Z';

function progressFor(
  entries: Array<{ id: string; direction: TaskDirection; box?: number; dueAt?: string }>,
): Map<string, EntryProgress> {
  const map = new Map<string, EntryProgress>();
  for (const { id, direction, box = 1, dueAt = PAST } of entries) {
    map.set(directionKey(id, direction), {
      ...createEntryProgress('pack-1', id, direction, NOW),
      box,
      dueAt,
    });
  }
  return map;
}

function entriesNamed(count: number): VocabEntry[] {
  return Array.from({ length: count }, (_, index) =>
    makeEntry({
      id: `e${index + 1}`,
      english: `word${index + 1}`,
      germanAnswers: [`Wort${index + 1}`],
    }),
  );
}

/** Prüft, ob zwei Richtungen derselben Vokabel zu dicht beieinanderstehen. */
function minimumSiblingDistance(targets: readonly SessionTarget[]): number {
  let smallest = Number.POSITIVE_INFINITY;
  targets.forEach((target, index) => {
    for (let other = index + 1; other < targets.length; other += 1) {
      if (targets[other]?.entry.id === target.entry.id) {
        smallest = Math.min(smallest, other - index);
      }
    }
  });
  return smallest;
}

describe('buildCloze', () => {
  it('ersetzt die Vokabel im Beispielsatz durch eine Lücke', () => {
    const entry = makeEntry({
      english: 'crowded',
      exampleSentences: [{ english: 'The bus was crowded today.' }],
    });
    const cloze = buildCloze(entry);
    expect(cloze?.before).toBe('The bus was ');
    expect(cloze?.after).toBe(' today.');
    expect(cloze?.solution).toBe('crowded');
  });

  it('trifft nur ganze Wörter', () => {
    const entry = makeEntry({ english: 'ear', exampleSentences: [{ english: 'I can hear you.' }] });
    expect(buildCloze(entry)).toBeUndefined();
  });

  it('findet die Vokabel auch am Satzanfang und mit Großschreibung', () => {
    const entry = makeEntry({
      english: 'litter',
      exampleSentences: [{ english: 'Litter is a problem here.' }],
    });
    expect(buildCloze(entry)?.solution).toBe('Litter');
  });

  it('gibt ohne passenden Beispielsatz nichts zurück', () => {
    expect(buildCloze(makeEntry({ exampleSentences: [] }))).toBeUndefined();
  });

  // Sprint 3B.1: Die Vokabel heißt „island“, im Satz steht „islands“.
  it('erwartet die Form, die tatsächlich im Beispielsatz steht', () => {
    const entry = makeEntry({
      english: 'island',
      exampleSentences: [{ english: 'The bay has 1,969 islands.' }],
    });
    const cloze = buildCloze(entry);

    expect(cloze?.solution).toBe('islands');
    expect(cloze?.before).toBe('The bay has 1,969 ');
    expect(cloze?.after).toBe('.');
  });

  it('bevorzugt die wörtliche Fundstelle vor der gebeugten', () => {
    const entry = makeEntry({
      english: 'island',
      exampleSentences: [{ english: 'One island rises out of the water; the islands are famous.' }],
    });
    expect(buildCloze(entry)?.solution).toBe('island');
  });

  it('findet eine Abkürzung unter ihrer Langform', () => {
    const entry = makeEntry({
      english: 'square mile (sq mi)',
      exampleSentences: [{ english: 'The area covers 600 sq mi in total.' }],
    });
    const cloze = buildCloze(entry);

    expect(cloze?.solution).toBe('sq mi');
    expect(cloze?.before).toBe('The area covers 600 ');
  });

  it('verwechselt weiterhin keine zufällig ähnlichen Wörter', () => {
    const entry = makeEntry({
      english: 'water',
      exampleSentences: [{ english: 'The waiter brought the menu.' }],
    });
    expect(buildCloze(entry)).toBeUndefined();
  });
});

describe('availableKinds', () => {
  const pack = makePack();

  it('bietet Lückensätze nur in produktiver Richtung an', () => {
    const entry = pack.entries[0]!;
    expect(availableKinds(entry, pack.entries, 'de-en')).toContain('cloze-bank');
    expect(availableKinds(entry, pack.entries, 'en-de')).not.toContain('cloze-bank');
  });

  it('bietet Lückensätze nur mit passendem Beispielsatz an', () => {
    expect(availableKinds(pack.entries[2]!, pack.entries, 'de-en')).not.toContain('cloze-free');
  });

  it('bietet Karteikarte und offene Übersetzung immer an', () => {
    const entry = makeEntry();
    expect(availableKinds(entry, [entry], 'en-de')).toEqual(
      expect.arrayContaining(['flashcard', 'open-translation']),
    );
  });
});

describe('kindsAvailableInPack', () => {
  it('schließt Lückensätze bei rein rezeptiven Paketen aus', () => {
    const pack = makePack();
    expect(kindsAvailableInPack(pack.entries, 'en-de').has('cloze-free')).toBe(false);
    expect(kindsAvailableInPack(pack.entries, 'both').has('cloze-free')).toBe(true);
    expect(kindsAvailableInPack(pack.entries, 'de-en').has('cloze-bank')).toBe(true);
  });
});

describe('pickDistractors', () => {
  it('liefert nur fremde, eindeutige Antworten', () => {
    const pack = makePack();
    const distractors = pickDistractors(pack.entries[1]!, pack.entries, 'en-de', 3, rng());
    expect(distractors).toHaveLength(3);
    expect(distractors).not.toContain('Nachbarschaft');
    expect(new Set(distractors).size).toBe(3);
  });
});

describe('buildTask', () => {
  const pack = makePack();

  it('erzeugt Multiple Choice mit vier Optionen inklusive Lösung', () => {
    const task = buildTask(pack.entries[1]!, 'multiple-choice', 'en-de', pack.entries, rng());
    if (task?.kind !== 'multiple-choice') throw new Error('falscher Aufgabentyp');
    expect(task.options).toHaveLength(4);
    expect(task.options).toContain('Nachbarschaft');
  });

  it('erzeugt eine Wortbank für Lückensätze', () => {
    const task = buildTask(pack.entries[0]!, 'cloze-bank', 'de-en', pack.entries, rng());
    if (task?.kind !== 'cloze-bank') throw new Error('falscher Aufgabentyp');
    expect(task.bank).toContain('crowded');
    expect(task.direction).toBe('de-en');
  });

  it('verweigert Lückensätze in rezeptiver Richtung', () => {
    expect(buildTask(pack.entries[0]!, 'cloze-free', 'en-de', pack.entries, rng())).toBeUndefined();
  });

  it('nutzt in Richtung DE→EN das englische Wort als Lösung', () => {
    const task = buildTask(pack.entries[2]!, 'open-translation', 'de-en', pack.entries, rng());
    expect(task?.prompt).toBe('sich entschuldigen');
    expect(task?.expected).toEqual(['to apologise', 'to apologize']);
  });
});

// ---------------------------------------------------------------------------
// Sprint 1.2 – Staffelung der Richtungen
// ---------------------------------------------------------------------------

describe('isDirectionUnlocked', () => {
  it('gibt bei einseitigen Paketen immer frei', () => {
    expect(isDirectionUnlocked('e1', new Map(), 'de-en', 'de-en')).toBe(true);
    expect(isDirectionUnlocked('e1', new Map(), 'en-de', 'en-de')).toBe(true);
  });

  it('gibt bei „beide Richtungen“ zunächst nur rezeptiv frei', () => {
    expect(isDirectionUnlocked('e1', new Map(), 'en-de', 'both')).toBe(true);
    expect(isDirectionUnlocked('e1', new Map(), 'de-en', 'both')).toBe(false);
  });

  it('schaltet produktiv ab Fach 2 der rezeptiven Richtung frei', () => {
    const box1 = progressFor([{ id: 'e1', direction: 'en-de', box: 1 }]);
    const box2 = progressFor([{ id: 'e1', direction: 'en-de', box: 2 }]);
    expect(isDirectionUnlocked('e1', box1, 'de-en', 'both')).toBe(false);
    expect(isDirectionUnlocked('e1', box2, 'de-en', 'both')).toBe(true);
  });

  it('sperrt eine bereits begonnene produktive Richtung nicht wieder', () => {
    const index = progressFor([
      { id: 'e1', direction: 'en-de', box: 1 },
      { id: 'e1', direction: 'de-en', box: 1 },
    ]);
    expect(isDirectionUnlocked('e1', index, 'de-en', 'both')).toBe(true);
  });
});

describe('eligibleTargets / countReady', () => {
  it('zählt bei einem neuen „both“-Paket nur die rezeptive Richtung', () => {
    const entries = entriesNamed(4);
    expect(countReady(entries, new Map(), 'both', NOW)).toBe(4);
    expect(eligibleTargets(entries, new Map(), 'both', NOW).every((t) => t.direction === 'en-de')).toBe(
      true,
    );
  });

  it('zählt bei einem reinen de-en-Paket sofort produktiv', () => {
    const entries = entriesNamed(4);
    expect(countReady(entries, new Map(), 'de-en', NOW)).toBe(4);
    expect(eligibleTargets(entries, new Map(), 'de-en', NOW).every((t) => t.direction === 'de-en')).toBe(
      true,
    );
  });

  it('zählt nach der Freischaltung beide Richtungen', () => {
    const entries = entriesNamed(4);
    const index = progressFor([{ id: 'e1', direction: 'en-de', box: 2, dueAt: FUTURE }]);
    // e1 rezeptiv ist noch nicht fällig, produktiv aber neu und freigeschaltet.
    expect(countReady(entries, index, 'both', NOW)).toBe(4);
    expect(countReady(entries, index, 'both', NOW, 'de-en')).toBe(1);
  });

  it('lässt nicht fällige Aufgaben aus', () => {
    const entries = entriesNamed(2);
    const index = progressFor([
      { id: 'e1', direction: 'en-de', dueAt: FUTURE },
      { id: 'e2', direction: 'en-de', dueAt: FUTURE },
    ]);
    expect(countReady(entries, index, 'en-de', NOW)).toBe(0);
  });
});

describe('arrangeTargets', () => {
  const entries = entriesNamed(4);

  function pairs(): SessionTarget[] {
    return entries.flatMap((entry) => [
      { entry, direction: 'en-de' as const },
      { entry, direction: 'de-en' as const },
    ]);
  }

  it('hält Gegenrichtungen mindestens drei Aufgaben auseinander', () => {
    const arranged = arrangeTargets(pairs(), 8);
    expect(arranged).toHaveLength(8);
    expect(minimumSiblingDistance(arranged)).toBeGreaterThan(MIN_SIBLING_GAP);
  });

  it('stellt Gegenrichtungen nie unmittelbar nebeneinander', () => {
    const arranged = arrangeTargets(pairs(), 8);
    for (let i = 1; i < arranged.length; i += 1) {
      expect(arranged[i]?.entry.id).not.toBe(arranged[i - 1]?.entry.id);
    }
  });

  it('verschiebt die zweite Richtung, wenn die Runde zu kurz ist', () => {
    const short = entriesNamed(2).flatMap((entry) => [
      { entry, direction: 'en-de' as const },
      { entry, direction: 'de-en' as const },
    ]);
    const arranged = arrangeTargets(short, 4);
    expect(arranged).toHaveLength(2);
    expect(new Set(arranged.map((target) => target.entry.id)).size).toBe(2);
  });

  it('behält die Priorität der Kandidatenliste bei', () => {
    const arranged = arrangeTargets(
      entries.map((entry) => ({ entry, direction: 'en-de' as const })),
      4,
    );
    expect(arranged.map((target) => target.entry.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
  });
});

describe('selectTargets', () => {
  it('plant für ein neues „both“-Paket zunächst nur EN→DE', () => {
    const entries = entriesNamed(4);
    const targets = selectTargets(entries, new Map(), 'both', 20, NOW, mulberry32(1));
    expect(targets).toHaveLength(4);
    expect(targets.every((target) => target.direction === 'en-de')).toBe(true);
  });

  it('nimmt DE→EN erst in einer späteren Runde auf', () => {
    const entries = entriesNamed(4);
    // Runde 1: alles neu, nur rezeptiv.
    expect(
      selectTargets(entries, new Map(), 'both', 20, NOW, mulberry32(1)).every(
        (target) => target.direction === 'en-de',
      ),
    ).toBe(true);

    // Nach einer richtigen Antwort steht e1 rezeptiv in Fach 2 → produktiv frei.
    const afterRound1 = progressFor([{ id: 'e1', direction: 'en-de', box: 2, dueAt: FUTURE }]);
    const round2 = selectTargets(entries, afterRound1, 'both', 20, NOW, mulberry32(1));
    expect(round2.some((t) => t.entry.id === 'e1' && t.direction === 'de-en')).toBe(true);
    expect(round2.some((t) => t.entry.id === 'e2' && t.direction === 'de-en')).toBe(false);
  });

  it('startet bei reinen de-en-Paketen sofort produktiv', () => {
    const entries = entriesNamed(3);
    const targets = selectTargets(entries, new Map(), 'de-en', 10, NOW, mulberry32(1));
    expect(targets).toHaveLength(3);
    expect(targets.every((target) => target.direction === 'de-en')).toBe(true);
  });

  it('hält fällige Gegenrichtungen auf Abstand', () => {
    const entries = entriesNamed(4);
    const index = progressFor(
      entries.flatMap((entry) => [
        { id: entry.id, direction: 'en-de' as const, box: 2 },
        { id: entry.id, direction: 'de-en' as const, box: 2 },
      ]),
    );
    const targets = selectTargets(entries, index, 'both', 20, NOW, mulberry32(5));
    expect(targets).toHaveLength(8);
    expect(minimumSiblingDistance(targets)).toBeGreaterThan(MIN_SIBLING_GAP);
  });

  it('stellt fällige Aufgaben vor neue und lässt spätere ganz aus', () => {
    const entries = entriesNamed(4);
    const index = progressFor([
      { id: 'e3', direction: 'en-de', box: 1, dueAt: PAST },
      { id: 'e4', direction: 'en-de', box: 4, dueAt: FUTURE },
    ]);
    const targets = selectTargets(entries, index, 'en-de', 4, NOW, mulberry32(3));
    expect(targets[0]?.entry.id).toBe('e3');
    // e4 ist erst später fällig und gehört nicht in eine normale Runde.
    expect(targets.map((target) => target.entry.id)).not.toContain('e4');
    expect(targets).toHaveLength(3);
  });

  it('mischt gleichwertige Aufgaben statt der Importreihenfolge zu folgen', () => {
    const entries = entriesNamed(8);
    const orders = [1, 2, 3, 4, 5, 6].map((seed) =>
      selectTargets(entries, new Map(), 'en-de', 8, NOW, mulberry32(seed))
        .map((target) => target.entry.id)
        .join(','),
    );
    const importOrder = entries.map((entry) => entry.id).join(',');
    expect(orders.some((order) => order !== importOrder)).toBe(true);
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it('ist mit festem Seed reproduzierbar', () => {
    const entries = entriesNamed(8);
    const a = selectTargets(entries, new Map(), 'en-de', 8, NOW, mulberry32(11));
    const b = selectTargets(entries, new Map(), 'en-de', 8, NOW, mulberry32(11));
    expect(a.map((t) => `${t.entry.id}:${t.direction}`)).toEqual(
      b.map((t) => `${t.entry.id}:${t.direction}`),
    );
  });

  it('begrenzt auf die gewünschte Länge', () => {
    expect(selectTargets(entriesNamed(9), new Map(), 'en-de', 2, NOW, mulberry32(1))).toHaveLength(2);
  });
});

describe('buildSession', () => {
  it('erzeugt für jede geplante Kombination genau eine Aufgabe', () => {
    const pack = makePack();
    const tasks = buildSession(pack.entries, new Map(), {
      direction: 'en-de',
      kinds: [],
      length: 5,
      now: NOW,
      rng: rng(),
    });
    expect(tasks).toHaveLength(5);
    expect(new Set(tasks.map((task) => task.entryId)).size).toBe(5);
    expect(tasks.every((task) => task.direction === 'en-de')).toBe(true);
  });

  it('führt neue „both“-Vokabeln zunächst nur rezeptiv ein', () => {
    const pack = makePack();
    const tasks = buildSession(pack.entries, new Map(), {
      direction: 'both',
      kinds: [],
      length: 20,
      now: NOW,
      rng: rng(),
    });
    expect(tasks).toHaveLength(5);
    expect(tasks.every((task) => task.direction === 'en-de')).toBe(true);
  });

  it('nutzt nach Freischaltung beide Richtungen mit Abstand', () => {
    const pack = makePack();
    const index = progressFor(
      pack.entries.flatMap((entry) => [
        { id: entry.id, direction: 'en-de' as const, box: 2 },
        { id: entry.id, direction: 'de-en' as const, box: 2 },
      ]),
    );
    const tasks = buildSession(pack.entries, index, {
      direction: 'both',
      kinds: [],
      length: 20,
      now: NOW,
      rng: mulberry32(9),
    });
    expect(tasks).toHaveLength(10);
    for (let i = 1; i < tasks.length; i += 1) {
      expect(tasks[i]?.entryId).not.toBe(tasks[i - 1]?.entryId);
    }
  });

  it('respektiert die gewünschte Übungsform, wenn sie möglich ist', () => {
    const pack = makePack();
    const tasks = buildSession(pack.entries, new Map(), {
      direction: 'en-de',
      kinds: ['multiple-choice'],
      length: 5,
      now: NOW,
      rng: rng(),
    });
    expect(tasks.every((task) => task.kind === 'multiple-choice')).toBe(true);
  });

  it('weicht aus, wenn eine Übungsform für einen Eintrag unmöglich ist', () => {
    const pack = makePack();
    const tasks = buildSession(pack.entries, new Map(), {
      direction: 'de-en',
      kinds: ['cloze-free'],
      length: 5,
      now: NOW,
      rng: rng(),
    });
    expect(tasks.find((task) => task.entryId === 'e-apologise')?.kind).not.toBe('cloze-free');
  });

  it('erzeugt in rein rezeptiven Paketen keine Lückensätze', () => {
    const pack = makePack();
    const tasks = buildSession(pack.entries, new Map(), {
      direction: 'en-de',
      kinds: ['cloze-bank', 'cloze-free'],
      length: 5,
      now: NOW,
      rng: rng(),
    });
    expect(tasks.some((task) => task.kind.startsWith('cloze'))).toBe(false);
  });

  it('ist mit gleichem Seed reproduzierbar', () => {
    const pack = makePack();
    const options = { direction: 'en-de' as const, kinds: [], length: 5, now: NOW };
    const a = buildSession(pack.entries, new Map(), { ...options, rng: mulberry32(7) });
    const b = buildSession(pack.entries, new Map(), { ...options, rng: mulberry32(7) });
    expect(a.map((task) => task.id)).toEqual(b.map((task) => task.id));
  });
});

describe('shuffle', () => {
  it('behält alle Elemente', () => {
    const items = [1, 2, 3, 4, 5];
    expect(shuffle(items, mulberry32(1)).sort()).toEqual(items);
  });
});
