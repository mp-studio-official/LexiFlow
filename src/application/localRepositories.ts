import {
  countEntries,
  deletePack as deletePackRow,
  getPack,
  listPacks,
  savePack,
} from '../data/packRepo';
import {
  getPackProgress,
  getProgressIndex,
  recordAnswer,
  resetPackProgress,
  startSession,
} from '../data/progressRepo';
import type { VocabPack } from '../domain/schema';
import type {
  PackRepository,
  PackSummary,
  ProgressEvent,
  ProgressRepository,
  Repositories,
} from './repositories';

/**
 * Die Verträge, erfüllt aus IndexedDB.
 *
 * Diese Datei ist der Standard in beiden portablen Gestalten – und sie bleibt
 * es auch im Portal für alles, was ohne Konto funktionieren soll. Sie ist
 * bewusst dünn: Sie ruft `packRepo` und `progressRepo` auf, die es seit
 * Sprint 1 gibt und die geprüft sind. Neu ist hier nur die Form, nicht das
 * Verhalten.
 *
 * ## Was hier fehlt, und warum das die Wahrheit ist
 *
 * Kein `auth`, kein `courses`, kein `invitations`, kein `publication`, kein
 * `ai`. Nicht, weil es noch nicht fertig wäre, sondern weil eine Datei auf
 * einem Stick keine Konten, keine Kurse und keine Netzverbindung hat. Ein
 * Adapter, der diese Felder mit `throw new Error('nicht verfügbar')` füllte,
 * sähe vollständiger aus und wäre es nicht: `useHasRepository` könnte dann
 * nicht mehr unterscheiden, ob es etwas gibt.
 */

/**
 * Der Kursparameter wird ignoriert – hier ist der Grund.
 *
 * Auf einem Gerät gibt es genau einen Speicher. Die Verträge nennen trotzdem
 * einen Kurs, weil das Portal ihn braucht; die lokale Fassung nimmt ihn
 * entgegen und benutzt ihn nicht. Diese Funktion macht das sichtbar, statt den
 * Parameter stumm mit einem Unterstrich zu benennen.
 */
function ohneKurs(_courseId: string): void {
  /* absichtlich leer – siehe oben */
}

async function summary(packId: string, updatedAt: string, title: string, grade: string): Promise<PackSummary> {
  return {
    id: packId,
    title,
    grade,
    entryCount: await countEntries(packId),
    /*
      Lokal gibt es keine Veröffentlichung: Ein Paket auf diesem Gerät ist
      weder Entwurf noch Revision, es ist einfach da. `false` ist deshalb keine
      Vereinfachung, sondern der Sachverhalt – und die Oberfläche zeigt den
      Hinweis „nicht veröffentlicht“ folgerichtig nirgends an.
    */
    hasUnpublishedChanges: false,
    updatedAt,
  };
}

export function createLocalPackRepository(): PackRepository {
  return {
    async list() {
      const metas = await listPacks();
      return Promise.all(metas.map((meta) => summary(meta.id, meta.updatedAt, meta.title, meta.grade)));
    },
    async getDraft(packId) {
      return getPack(packId);
    },
    async saveDraft(pack: VocabPack) {
      await savePack(pack);
      return summary(pack.meta.id, pack.meta.updatedAt, pack.meta.title, pack.meta.grade);
    },
    async deletePack(packId) {
      await deletePackRow(packId);
    },
    async importFromLocal(pack: VocabPack) {
      /*
        Lokal ist „aus dem lokalen Speicher übernehmen“ dasselbe wie speichern –
        die Quelle ist das Ziel. Der Vertrag hat die Methode, weil das Portal
        sie braucht; hier wäre eine eigene Fassung nur eine zweite Schreibweise
        desselben Aufrufs. `savePack` gleicht ab statt zu überschreiben, der
        Aufruf ist also auch wiederholt gefahrlos.
      */
      return this.saveDraft(pack);
    },
  };
}

/**
 * Lernstände aus IndexedDB.
 *
 * ## Zur Idempotenz
 *
 * Der Vertrag verlangt, dass dieselbe `eventId` zweimal nichts bewirkt. Im
 * Portal ist das eine Tabelle; hier ist es ein `Set` im Arbeitsspeicher, und
 * das ist keine halbe Lösung, sondern die passende: Wiederholungen entstehen,
 * wenn eine Antwort über das Netz verlorengeht. Lokal gibt es kein Netz und
 * keinen zweiten Versuch – die Ereignisse kommen aus genau dieser Seite. Was
 * bleibt, ist der Doppelklick innerhalb einer Sitzung, und genau den fängt ein
 * Set ab, das mit der Seite endet.
 *
 * Eine Tabelle dafür hieße eine Schemaversion 5 für ein Problem, das es auf
 * diesem Weg nicht gibt – und jede Schemaänderung ist ein Migrationsrisiko für
 * Lernstände, die niemand wiederherstellen kann.
 */
export function createLocalProgressRepository(): ProgressRepository {
  const verarbeitet = new Set<string>();

  return {
    async myPackProgress(courseId, packId) {
      ohneKurs(courseId);
      return getPackProgress(packId);
    },
    async myEntryProgress(courseId, packId) {
      ohneKurs(courseId);
      return [...(await getProgressIndex(packId)).values()];
    },
    async beginSession(courseId, packId) {
      ohneKurs(courseId);
      await startSession(packId);
    },
    async recordEvents(events: readonly ProgressEvent[]) {
      for (const event of events) {
        if (verarbeitet.has(event.eventId)) continue;
        /*
          Erst schreiben, dann merken. Andersherum verlöre ein Fehlschlag beim
          Schreiben das Ereignis endgültig: gemerkt, aber nicht gezählt.
        */
        await recordAnswer(
          event.packId,
          event.entryId,
          event.direction,
          event.outcome,
          new Date(event.occurredAt),
        );
        verarbeitet.add(event.eventId);
      }
    },
    async resetMyProgress(courseId, packId) {
      ohneKurs(courseId);
      await resetPackProgress(packId);
    },
  };
}

/**
 * Was eine portable Datei an Speichern hat – und sonst nichts.
 *
 * Die Lehrkraftdatei und die Lerndatei bekommen dieselbe Menge. Der
 * Unterschied zwischen beiden liegt nicht im Speicher, sondern darin, welche
 * Ansichten überhaupt im Bündel liegen.
 */
export function createLocalRepositories(): Repositories {
  return {
    packs: createLocalPackRepository(),
    progress: createLocalProgressRepository(),
  };
}
