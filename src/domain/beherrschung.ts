import { directionKey } from './ids';
import { LEITNER_BOX_MIN } from './schema';
import type { EntryProgress, TaskDirection } from './schema';

/**
 * Beherrscht oder offen — die Regel für „Mein Fortschritt" (5B.6).
 *
 * ## Warum das nicht `isEntryMastered` ist
 *
 * `src/domain/leitner.ts` kennt bereits eine Antwort auf eine ähnliche Frage:
 * `isEntryMastered` verlangt **Fach 5** in allen aktiven Richtungen und steht
 * hinter der Bezeichnung „sicher gelernt". Diese Funktion bleibt, wie sie
 * ist, und alle Ansichten, die sie benutzen, zeigen weiterhin dasselbe.
 *
 * „Mein Fortschritt" stellt eine andere Frage. Das Konzept nennt dort
 * **Fach 4–5 gegenüber Fach 1–3**, und das ist eine andere Schwelle: Fach 4
 * heißt „sitzt, wird nur noch selten wiederholt", Fach 5 heißt „sitzt seit
 * Wochen". Eine Fortschrittsseite, die erst ab Fach 5 etwas gutschreibt,
 * zeigt wochenlang eine Null, obwohl die Hälfte sitzt.
 *
 * Zwei Fragen, zwei Funktionen, beide benannt. Die bestehende umzudeuten
 * wäre die bequemere Lösung und die falsche: Sie änderte stillschweigend,
 * was „sicher gelernt" in vier anderen Ansichten bedeutet.
 *
 * ## Die Regel
 *
 * Eine Vokabel ist **beherrscht**, wenn sie in **allen** aktiven
 * Lernrichtungen mindestens Fach 4 erreicht hat.
 *
 * Alles andere ist **offen**: eine Richtung in Fach 1 bis 3, eine Richtung
 * ohne jeden Lernstand, und eine Vokabel, die noch nie geübt wurde. „Noch
 * nie geübt" ist dabei kein eigener dritter Zustand — für jemanden, der auf
 * die Seite schaut, ist es genau dasselbe wie „noch nicht so weit".
 *
 * ## Warum alle Richtungen und nicht eine
 *
 * Weil „Englisch → Deutsch" und „Deutsch → Englisch" verschieden schwer
 * sind. Wer ein Wort erkennt, kann es noch lange nicht hinschreiben. Eine
 * Zählung, die die leichtere Richtung genügen ließe, zählte ein Können, das
 * es nicht gibt.
 */

/** Ab diesem Fach gilt eine Richtung auf „Mein Fortschritt" als beherrscht. */
export const BEHERRSCHT_AB_FACH = LEITNER_BOX_MIN + 3;

/** Was eine Vokabel auf dieser Seite sein kann – mehr Zustände gibt es nicht. */
export type Beherrschung = 'beherrscht' | 'offen';

/**
 * Der Zustand einer Vokabel.
 *
 * @param staende Der eigene Lernstand, nach `directionKey` abgelegt.
 * @param entryId Die Vokabel.
 * @param richtungen Die aktiven Richtungen des Pakets – aus `activeDirections`.
 */
export function beherrschungVon(
  staende: ReadonlyMap<string, EntryProgress>,
  entryId: string,
  richtungen: readonly TaskDirection[],
): Beherrschung {
  /*
    Ohne aktive Richtung gibt es nichts zu beherrschen. Das ist kein
    Grenzfall aus der Theorie: Ein Paket ohne Richtungsangabe käme sonst als
    „alles beherrscht" heraus, weil `every` über eine leere Liste wahr ist.
  */
  if (richtungen.length === 0) return 'offen';

  const alle = richtungen.every(
    (richtung) => (staende.get(directionKey(entryId, richtung))?.box ?? 0) >= BEHERRSCHT_AB_FACH,
  );
  return alle ? 'beherrscht' : 'offen';
}

/** Wie viele beherrscht sind und wie viele offen – zusammen immer `gesamt`. */
export interface Beherrschungsstand {
  readonly beherrscht: number;
  readonly offen: number;
  readonly gesamt: number;
}

/**
 * Beherrschte und offene Vokabeln einer Menge.
 *
 * `entryIds` kommt aus der **veröffentlichten Fassung**, nicht aus dem
 * Lernstand. Nur so zählen nie geübte Vokabeln mit: Wer die Gesamtzahl aus
 * den vorhandenen Lernständen bildete, bekäme am ersten Tag „0 von 0" und
 * damit eine erfundene Vollständigkeit.
 */
export function zaehleBeherrschung(
  entryIds: readonly string[],
  staende: ReadonlyMap<string, EntryProgress>,
  richtungen: readonly TaskDirection[],
): Beherrschungsstand {
  let beherrscht = 0;
  for (const entryId of entryIds) {
    if (beherrschungVon(staende, entryId, richtungen) === 'beherrscht') beherrscht += 1;
  }
  return { beherrscht, offen: entryIds.length - beherrscht, gesamt: entryIds.length };
}

/** Mehrere Stände zu einem zusammenziehen – für die Summe über alle Pakete. */
export function summiereBeherrschung(
  staende: readonly Beherrschungsstand[],
): Beherrschungsstand {
  return staende.reduce<Beherrschungsstand>(
    (summe, stand) => ({
      beherrscht: summe.beherrscht + stand.beherrscht,
      offen: summe.offen + stand.offen,
      gesamt: summe.gesamt + stand.gesamt,
    }),
    { beherrscht: 0, offen: 0, gesamt: 0 },
  );
}
