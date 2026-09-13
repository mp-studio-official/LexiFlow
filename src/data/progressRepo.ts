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

/**
 * Einen fertig gerechneten Lernstand ablegen und die Paketzähler erhöhen.
 *
 * Muss innerhalb einer Transaktion über beide Tabellen laufen: Ein Lernstand
 * ohne erhöhten Zähler – oder umgekehrt – wäre ein Widerspruch, den niemand
 * mehr auflöst.
 */
async function ablegen(stand: EntryProgress, verdict: AnswerVerdict, now: Date): Promise<void> {
  await db.directionProgress.put(stand);

  const pack = (await db.packProgress.get(stand.packId)) ?? {
    packId: stand.packId,
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
    await ablegen(updated, verdict, now);
    return updated;
  });
}

/**
 * Einen anderswo gerechneten Lernstand übernehmen.
 *
 * Der Weg für Ereignisse (`ProgressEvent`): Dort steht der Stand schon drin,
 * gerechnet mit derselben Funktion aus `domain/leitner.ts`. Ihn hier erneut zu
 * rechnen hieße, denselben Wert zweimal zu bestimmen – und im Portal würde
 * dabei ein anderer herauskommen als der, den der Server abgelegt hat.
 */
export async function storeAnswer(
  stand: EntryProgress,
  verdict: AnswerVerdict,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction('rw', db.directionProgress, db.packProgress, async () => {
    await ablegen(stand, verdict, now);
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
