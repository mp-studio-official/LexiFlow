import { applyAnswer, createEntryProgress } from '../domain/leitner';
import { newId, progressKey } from '../domain/ids';
import type { AnswerVerdict } from '../domain/answerCheck';
import type { EntryProgress, TaskDirection } from '../domain/schema';
import type { EntryState, ProgressEvent } from './repositories';

/**
 * Aus einer Antwort wird ein Ereignis – an genau einer Stelle.
 *
 * ## Wozu diese Datei
 *
 * Ein `ProgressEvent` trägt den Leitner-Stand **nach** der Antwort mit sich
 * (siehe `repositories.ts`). Damit gibt es genau eine Rechnung – die aus
 * `domain/leitner.ts` – und sie läuft im Portal, in der Lehrkraftdatei und in
 * der Lerndatei gleich.
 *
 * Zusammengebaut wird ein Ereignis deshalb nirgends von Hand. Jede Ansicht,
 * die das selbst täte, wäre eine zweite Stelle, an der jemand `streak`
 * vergessen kann – und der Fehler fiele erst Wochen später auf, wenn eine
 * Vokabel zu früh oder gar nicht wiederkommt.
 *
 * ## Warum der vorige Stand hereingereicht wird
 *
 * Weil nur die Ansicht ihn hat: Sie hält den Lernstand des Pakets ohnehin im
 * Speicher, um die nächste Aufgabe zu wählen. Ihn hier erneut zu laden hieße,
 * je Antwort einen Umlauf zur Datenbank zu machen – und im Fall der
 * portablen Datei einen Umlauf zu IndexedDB, mitten in der Eingabe.
 */

export interface AntwortEingabe {
  /** `LOCAL_SCOPE`, wenn es keinen Kurs gibt. */
  courseId: string;
  packId: string;
  entryId: string;
  direction: TaskDirection;
  outcome: AnswerVerdict;
  /** Der Stand vor dieser Antwort, oder nichts bei der ersten Begegnung. */
  vorher?: EntryProgress | undefined;
  now?: Date;
  /**
   * Nur für Prüfungen: eine feste Kennung statt einer zufälligen.
   *
   * Im Betrieb entsteht sie hier und nirgends sonst – eine Kennung, die von
   * außen kommt, wäre eine Kennung, die zweimal kommen kann, und genau das
   * soll sie nicht.
   */
  eventId?: string;
}

/** Der Stand ohne die Kennungen – das, was ein Ereignis überträgt. */
export function alsEntryState(stand: EntryProgress): EntryState {
  return {
    box: stand.box,
    correctCount: stand.correctCount,
    wrongCount: stand.wrongCount,
    streak: stand.streak,
    dueAt: stand.dueAt,
  };
}

/**
 * Eine Antwort in ein Ereignis und den neuen Stand übersetzen.
 *
 * Beides zusammen, weil eine Ansicht beides braucht: das Ereignis zum Senden
 * und den Stand, um die nächste Aufgabe zu wählen, ohne auf die Antwort des
 * Servers zu warten.
 */
export function antwortEreignis(eingabe: AntwortEingabe): {
  event: ProgressEvent;
  nachher: EntryProgress;
} {
  const now = eingabe.now ?? new Date();
  const vorher =
    eingabe.vorher ??
    createEntryProgress(eingabe.packId, eingabe.entryId, eingabe.direction, now);
  const nachher = applyAnswer(vorher, eingabe.outcome, now);

  return {
    event: {
      eventId: eingabe.eventId ?? newId(),
      courseId: eingabe.courseId,
      packId: eingabe.packId,
      entryId: eingabe.entryId,
      direction: eingabe.direction,
      outcome: eingabe.outcome,
      occurredAt: now.toISOString(),
      entryState: alsEntryState(nachher),
    },
    nachher,
  };
}

/**
 * Aus einem Ereignis wieder ein vollständiger Lernstand.
 *
 * Die Gegenrichtung, gebraucht überall dort, wo ein Ereignis abgelegt wird:
 * Das Ereignis trägt den Stand ohne Kennungen, eine Zeile trägt ihn mit.
 * `lastAnsweredAt` kommt dabei aus `occurredAt` – der Zeitpunkt der Antwort
 * ist der Zeitpunkt der Antwort, und ein zweiter Zeitstempel wäre ein zweiter
 * Wert, der abweichen kann.
 */
export function alsLernstand(event: ProgressEvent): EntryProgress {
  return {
    key: progressKey(event.packId, event.entryId, event.direction),
    packId: event.packId,
    entryId: event.entryId,
    direction: event.direction,
    box: event.entryState.box,
    correctCount: event.entryState.correctCount,
    wrongCount: event.entryState.wrongCount,
    streak: event.entryState.streak,
    lastAnsweredAt: event.occurredAt,
    dueAt: event.entryState.dueAt,
  };
}
