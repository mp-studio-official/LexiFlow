import type { AnswerVerdict } from './answerCheck';
import {
  LEITNER_BOX_MAX,
  LEITNER_BOX_MIN,
  type EntryProgress,
  type LearningDirection,
  type TaskDirection,
} from './schema';
import { directionKey, progressKey } from './ids';

/**
 * Leitner-System mit fünf Fächern.
 *
 * Bewusst einfach und erklärbar: richtig → ein Fach weiter, falsch → zurück in
 * Fach 1, „fast richtig“ → Fach bleibt (die Vokabel wird bald erneut geübt).
 * Keine Punkte, keine Serien-Belohnungen, keine Vergleiche mit anderen.
 */
export const BOX_INTERVAL_DAYS: Readonly<Record<number, number>> = {
  1: 0,
  2: 1,
  3: 3,
  4: 7,
  5: 21,
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** „Fast richtig“ wird in derselben Sitzung noch einmal fällig. */
const ALMOST_DELAY_MS = 10 * 60 * 1000;

export function createEntryProgress(
  packId: string,
  entryId: string,
  direction: TaskDirection,
  now: Date = new Date(),
): EntryProgress {
  return {
    key: progressKey(packId, entryId, direction),
    packId,
    entryId,
    direction,
    box: LEITNER_BOX_MIN,
    correctCount: 0,
    wrongCount: 0,
    streak: 0,
    dueAt: now.toISOString(),
  };
}

export function nextBox(box: number, verdict: AnswerVerdict): number {
  const clamped = clampBox(box);
  switch (verdict) {
    case 'correct':
      return clampBox(clamped + 1);
    case 'almost':
      return clamped;
    case 'wrong':
      return LEITNER_BOX_MIN;
  }
}

export function dueAtFor(box: number, verdict: AnswerVerdict, now: Date): string {
  if (verdict === 'almost') return new Date(now.getTime() + ALMOST_DELAY_MS).toISOString();
  const days = BOX_INTERVAL_DAYS[clampBox(box)] ?? 0;
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

/** Reine Funktion: alter Lernstand + Bewertung → neuer Lernstand. */
export function applyAnswer(
  progress: EntryProgress,
  verdict: AnswerVerdict,
  now: Date = new Date(),
): EntryProgress {
  const box = nextBox(progress.box, verdict);
  return {
    ...progress,
    box,
    correctCount: progress.correctCount + (verdict === 'correct' ? 1 : 0),
    wrongCount: progress.wrongCount + (verdict === 'wrong' ? 1 : 0),
    streak: verdict === 'correct' ? progress.streak + 1 : 0,
    lastAnsweredAt: now.toISOString(),
    dueAt: dueAtFor(box, verdict, now),
  };
}

export function isDue(progress: EntryProgress, now: Date = new Date()): boolean {
  return new Date(progress.dueAt).getTime() <= now.getTime();
}

/**
 * Eine Vokabel gilt erst dann als sicher, wenn **alle** aktiven Richtungen
 * Fach 5 erreicht haben. Bei „beide Richtungen“ zählt also weder rezeptives
 * noch produktives Können allein.
 */
export function isEntryMastered(
  progressIndex: ReadonlyMap<string, EntryProgress>,
  entryId: string,
  directions: readonly TaskDirection[],
): boolean {
  if (directions.length === 0) return false;
  return directions.every(
    (direction) => (progressIndex.get(directionKey(entryId, direction))?.box ?? 0) >= LEITNER_BOX_MAX,
  );
}

/** Anzahl sicher gelernter Vokabeln über alle aktiven Richtungen hinweg. */
export function countMastered(
  entryIds: readonly string[],
  progressIndex: ReadonlyMap<string, EntryProgress>,
  directions: readonly TaskDirection[],
): number {
  return entryIds.filter((entryId) => isEntryMastered(progressIndex, entryId, directions)).length;
}

/** Fachverteilung (Index 0 = Fach 1) für eine einzelne Richtung. */
export function boxDistribution(
  entryIds: readonly string[],
  progressIndex: ReadonlyMap<string, EntryProgress>,
  direction: TaskDirection,
): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const entryId of entryIds) {
    const box = progressIndex.get(directionKey(entryId, direction))?.box;
    if (box === undefined) continue;
    counts[box - 1] = (counts[box - 1] ?? 0) + 1;
  }
  return counts;
}

/**
 * Ab diesem Fach der rezeptiven Richtung wird die produktive freigeschaltet –
 * also nach der ersten erfolgreichen EN→DE-Antwort.
 */
export const PRODUCTIVE_UNLOCK_BOX = 2;

/**
 * Ist diese Richtung für diese Vokabel schon freigeschaltet?
 *
 * Bei `both` werden neue Vokabeln zuerst rezeptiv eingeführt; die produktive
 * Richtung kommt erst dazu, wenn EN→DE Fach 2 erreicht hat. Wurde produktiv
 * bereits geübt, bleibt es freigeschaltet – ein Rückfall auf Fach 1 sperrt
 * nichts wieder. Pakete mit nur einer Richtung sind nicht betroffen: `de-en`
 * startet unverändert sofort produktiv.
 */
export function isDirectionUnlocked(
  entryId: string,
  progressIndex: ReadonlyMap<string, EntryProgress>,
  direction: TaskDirection,
  packDirection: LearningDirection,
): boolean {
  if (packDirection !== 'both') return true;
  if (direction === 'en-de') return true;
  if (progressIndex.has(directionKey(entryId, 'de-en'))) return true;
  return (progressIndex.get(directionKey(entryId, 'en-de'))?.box ?? 0) >= PRODUCTIVE_UNLOCK_BOX;
}

/**
 * Aufschlüsselung einer Richtung für die Anzeige.
 *
 * „Neu“ ist eine eigene Kategorie: Eine noch nie geübte Vokabel steht **nicht**
 * in Fach 1, sonst sähe ein frisches Paket aus, als sei bereits etwas
 * bearbeitet worden.
 */
export interface DirectionBreakdown {
  /** Freigeschaltet, aber in dieser Richtung noch nie geübt. */
  fresh: number;
  /** Noch nicht freigeschaltet (nur bei „beide Richtungen“ möglich). */
  locked: number;
  /** Index 0 = Fach 1. */
  boxes: number[];
}

export function directionBreakdown(
  entryIds: readonly string[],
  progressIndex: ReadonlyMap<string, EntryProgress>,
  direction: TaskDirection,
  packDirection: LearningDirection,
): DirectionBreakdown {
  const boxes = [0, 0, 0, 0, 0];
  let fresh = 0;
  let locked = 0;

  for (const entryId of entryIds) {
    const box = progressIndex.get(directionKey(entryId, direction))?.box;
    if (box !== undefined) {
      boxes[box - 1] = (boxes[box - 1] ?? 0) + 1;
    } else if (isDirectionUnlocked(entryId, progressIndex, direction, packDirection)) {
      fresh += 1;
    } else {
      locked += 1;
    }
  }

  return { fresh, locked, boxes };
}

export function clampBox(box: number): number {
  if (!Number.isFinite(box)) return LEITNER_BOX_MIN;
  return Math.min(LEITNER_BOX_MAX, Math.max(LEITNER_BOX_MIN, Math.round(box)));
}
