import { progressKey } from '../domain/ids';
import type { EntryProgress, PackProgress, TaskDirection } from '../domain/schema';
import type {
  ProgressConflict,
  ProgressEvent,
  ProgressRepository,
} from '../application/repositories';

/**
 * Der Lernstand im Konto – wieder eine Logik, zwei Anbindungen.
 *
 * Derselbe Aufbau wie bei Kursen und Paketen: Der Gateway ist nah an SQL
 * geschnitten, die Umrechnung steht genau einmal, und zwei Anbindungen
 * erfüllen ihn – PostgREST im Ernstfall (ungeprüft, § 7.1) und direktes SQL im
 * Test gegen echtes PostgreSQL.
 *
 * ## Was dieser Gateway ausdrücklich nicht kann
 *
 * Den Lernstand einer **anderen** Person lesen. Es gibt keine Methode dafür
 * und keinen Parameter, mit dem man eine Kennung übergeben könnte. Das ist
 * ADR-1 in Codeform: Nicht „nicht erlaubt", sondern nicht vorgesehen. Die
 * Zugriffsregel in der Datenbank sagt dasselbe noch einmal – zwei Riegel für
 * die Zusage, auf der das ganze Produkt steht.
 */

/* ------------------------------------------------------------ Zeilenform -- */

export interface PackProgressRow {
  user_id: string;
  course_id: string;
  pack_id: string;
  session_count: number;
  answered_count: number;
  correct_count: number;
  last_practiced_at: string | Date | null;
}

export interface EntryProgressRow {
  user_id: string;
  course_id: string;
  pack_id: string;
  entry_id: string;
  direction: string;
  box: number;
  correct_count: number;
  wrong_count: number;
  streak: number;
  last_answered_at: string | Date | null;
  due_at: string | Date;
  rev: number;
}

/** Eine abgelehnte Übernahme, so wie die Datenbank sie meldet. */
export interface ConflictRow {
  event_id: string;
  entry_id: string;
  direction: string;
  current_rev: number;
}

export interface ProgressGateway {
  selectPackProgress(courseId: string, packId: string): Promise<PackProgressRow | undefined>;
  selectEntryProgress(courseId: string, packId: string): Promise<EntryProgressRow[]>;
  rpcBeginSession(courseId: string, packId: string): Promise<void>;
  /** Gibt zurück, was **nicht** übernommen wurde – leer heißt: alles angekommen. */
  rpcRecordEvents(events: readonly ProgressEvent[]): Promise<ConflictRow[]>;
  rpcReset(courseId: string, packId: string): Promise<void>;
}

/* ------------------------------------------------------------ Umrechnung -- */

/**
 * Ein Zeitpunkt als ISO-Zeichenkette.
 *
 * Nötig, weil ein `timestamptz` je nach Anbindung als `Date` oder als Text
 * ankommt: Der PostgreSQL-Treiber wandelt um, PostgREST liefert JSON. Beides
 * muss hier dieselbe Zeichenkette werden – sonst prüfte der Vertrag gegen die
 * Datenbank etwas anderes als gegen die Fälschung.
 */
export function alsZeitpunkt(wert: string | Date): string {
  return wert instanceof Date ? wert.toISOString() : new Date(wert).toISOString();
}

export function alsPaketstand(zeile: PackProgressRow): PackProgress {
  return {
    packId: zeile.pack_id,
    sessionCount: zeile.session_count,
    answeredCount: zeile.answered_count,
    correctCount: zeile.correct_count,
    ...(zeile.last_practiced_at === null
      ? {}
      : { lastPracticedAt: alsZeitpunkt(zeile.last_practiced_at) }),
  };
}

export function alsKonflikt(zeile: ConflictRow): ProgressConflict {
  return {
    eventId: zeile.event_id,
    entryId: zeile.entry_id,
    direction: zeile.direction as TaskDirection,
    currentRev: zeile.current_rev,
  };
}

export function alsVokabelstand(zeile: EntryProgressRow): EntryProgress {
  const direction = zeile.direction as TaskDirection;
  return {
    key: progressKey(zeile.pack_id, zeile.entry_id, direction),
    packId: zeile.pack_id,
    entryId: zeile.entry_id,
    direction,
    box: zeile.box,
    correctCount: zeile.correct_count,
    wrongCount: zeile.wrong_count,
    streak: zeile.streak,
    ...(zeile.last_answered_at === null
      ? {}
      : { lastAnsweredAt: alsZeitpunkt(zeile.last_answered_at) }),
    dueAt: alsZeitpunkt(zeile.due_at),
    rev: zeile.rev,
  };
}

/* ---------------------------------------------------------- Repository -- */

export function createSqlProgressRepository(gateway: ProgressGateway): ProgressRepository {
  return {
    async myPackProgress(courseId, packId) {
      const zeile = await gateway.selectPackProgress(courseId, packId);
      return zeile ? alsPaketstand(zeile) : undefined;
    },

    async myEntryProgress(courseId, packId) {
      return (await gateway.selectEntryProgress(courseId, packId)).map(alsVokabelstand);
    },

    async beginSession(courseId, packId) {
      await gateway.rpcBeginSession(courseId, packId);
    },

    async recordEvents(events) {
      /*
        Nichts zu senden ist kein Fehler, sondern der Normalfall am Ende einer
        Runde, in der alles schon unterwegs war. Ein leerer Aufruf wäre ein
        Umlauf ohne Wirkung.
      */
      if (events.length === 0) return [];
      return (await gateway.rpcRecordEvents(events)).map(alsKonflikt);
    },

    async resetMyProgress(courseId, packId) {
      await gateway.rpcReset(courseId, packId);
    },
  };
}
