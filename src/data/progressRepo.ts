import { db } from './db';
import { applyAnswer, createEntryProgress } from '../domain/leitner';
import { directionKey, progressKey } from '../domain/ids';
import type { AnswerVerdict } from '../domain/answerCheck';
import type { EntryProgress, PackProgress, TaskDirection } from '../domain/schema';

/**
 * Lernstände bleiben ausschließlich lokal. Diese Funktionen sind der einzige
 * Schreibpfad; es existiert keine Export- oder Übertragungsfunktion dafür.
 *
 * Jeder Datensatz gehört zu genau einem Tripel aus Paket, Vokabel und
 * Abfragerichtung.
 */

/** Lernstände eines Pakets, indiziert mit `${entryId}::${direction}`. */
export async function getProgressIndex(packId: string): Promise<Map<string, EntryProgress>> {
  const rows = await db.directionProgress.where('packId').equals(packId).toArray();
  return new Map(rows.map((row) => [directionKey(row.entryId, row.direction), row]));
}

export async function getPackProgress(packId: string): Promise<PackProgress> {
  return (
    (await db.packProgress.get(packId)) ?? {
      packId,
      sessionCount: 0,
      answeredCount: 0,
      correctCount: 0,
    }
  );
}

export async function recordAnswer(
  packId: string,
  entryId: string,
  direction: TaskDirection,
  verdict: AnswerVerdict,
  now: Date = new Date(),
): Promise<EntryProgress> {
  return db.transaction('rw', db.directionProgress, db.packProgress, async () => {
    const key = progressKey(packId, entryId, direction);
    const existing = await db.directionProgress.get(key);
    const base = existing ?? createEntryProgress(packId, entryId, direction, now);
    const updated = applyAnswer(base, verdict, now);
    await db.directionProgress.put(updated);

    const pack = (await db.packProgress.get(packId)) ?? {
      packId,
      sessionCount: 0,
      answeredCount: 0,
      correctCount: 0,
    };
    await db.packProgress.put({
      ...pack,
      answeredCount: pack.answeredCount + 1,
      correctCount: pack.correctCount + (verdict === 'correct' ? 1 : 0),
      lastPracticedAt: now.toISOString(),
    });
    return updated;
  });
}

export async function startSession(packId: string, now: Date = new Date()): Promise<void> {
  const pack = await getPackProgress(packId);
  await db.packProgress.put({
    ...pack,
    sessionCount: pack.sessionCount + 1,
    lastPracticedAt: now.toISOString(),
  });
}

/** Setzt den Lernstand eines Pakets zurück – auf ausdrücklichen Wunsch. */
export async function resetPackProgress(packId: string): Promise<void> {
  await db.transaction('rw', db.directionProgress, db.packProgress, async () => {
    await db.directionProgress.where('packId').equals(packId).delete();
    await db.packProgress.delete(packId);
  });
}
