import type { Tageszaehlung } from '../domain/lernserie';
import type { Kalenderstand, LearningDaysRepository } from '../application/repositories';

/**
 * Die lokalen Lerntage — wieder eine Logik, zwei Anbindungen.
 *
 * Derselbe Aufbau wie bei Kursen, Paketen, Lernständen und Einstellungen.
 * Besonders ist hier nur, was **nicht** übergeben wird: keine Zeitzone, kein
 * Datum, keine Uhr. Der Server liest die bestätigte Zeitzone selbst und
 * bildet daraus den Tag (E28).
 */

/* ------------------------------------------------------------ Zeilenform -- */

export interface LocalTodayRow {
  time_zone: string | null;
  local_day: string | Date | null;
  week_start: string | Date | null;
}

export interface LearningDayRow {
  local_day: string | Date;
  task_count: number;
}

export interface LearningDaysGateway {
  /** Immer genau eine Zeile – auch ohne Einstellungen und ohne Ereignisse. */
  rpcLocalToday(): Promise<LocalTodayRow>;
  /** Ohne bestätigte Zeitzone leer: Es gibt dann keine Tagesgrenze. */
  rpcLearningDays(): Promise<LearningDayRow[]>;
}

/* ------------------------------------------------------------ Umrechnung -- */

/**
 * Ein `date` als `YYYY-MM-DD`.
 *
 * Nötig, weil ein `date` je nach Anbindung als Zeichenkette oder als `Date`
 * ankommt. Die `Date`-Variante wird in **UTC** gelesen und nicht lokal: Der
 * Treiber baut sie aus Mitternacht UTC, und `getDate()` darauf verschöbe den
 * Tag westlich von Greenwich um eins – genau der Fehler, den diese ganze
 * Kette vermeiden soll.
 */
export function alsKalendertag(wert: string | Date): string {
  return wert instanceof Date ? wert.toISOString().slice(0, 10) : wert.slice(0, 10);
}

export function alsKalenderstand(zeile: LocalTodayRow): Kalenderstand {
  if (zeile.time_zone === null || zeile.local_day === null || zeile.week_start === null) {
    /*
      Keine bestätigte Zeitzone. Das ist kein Fehler, sondern der
      Anfangszustand (E27) – und die Seite muss ihn von „Fehler beim Laden"
      unterscheiden können, weil sie darauf ganz verschieden reagiert.
    */
    return { bestaetigt: false };
  }
  return {
    bestaetigt: true,
    timeZone: zeile.time_zone,
    heute: alsKalendertag(zeile.local_day),
    wochenbeginn: alsKalendertag(zeile.week_start),
  };
}

export function alsTageszaehlung(zeile: LearningDayRow): Tageszaehlung {
  return { localDay: alsKalendertag(zeile.local_day), taskCount: Number(zeile.task_count) };
}

/* ------------------------------------------------------------ Repository -- */

export function createSqlLearningDaysRepository(
  gateway: LearningDaysGateway,
): LearningDaysRepository {
  return {
    async myCalendar() {
      return alsKalenderstand(await gateway.rpcLocalToday());
    },
    async myLearningDays() {
      return (await gateway.rpcLearningDays()).map(alsTageszaehlung);
    },
  };
}
