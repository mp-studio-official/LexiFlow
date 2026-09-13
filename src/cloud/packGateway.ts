import { toPackFile } from '../domain/vocabpack';
import { vocabPackFileSchema, type VocabPack } from '../domain/schema';
import type {
  PackRepository,
  PackRevision,
  PackSummary,
  PublicationRepository,
} from '../application/repositories';

/**
 * Pakete und Veröffentlichungen – wieder eine Logik, zwei Anbindungen.
 *
 * Derselbe Aufbau wie bei den Kursen (`courseGateway.ts`): Der Gateway ist nah
 * an SQL geschnitten, die Umrechnung steht genau einmal, und zwei Anbindungen
 * erfüllen ihn – PostgREST im Ernstfall (ungeprüft) und direktes SQL im Test
 * gegen echtes PostgreSQL.
 *
 * ## Das Paket liegt als JSONB – in der Dateigestalt
 *
 * Nicht als `{meta, entries}`, sondern als das, was auch exportiert wird:
 * `kind`, `formatVersion`, `meta`, `entries`. Damit liest die Datenbank
 * dasselbe Format wie eine Datei auf einem Stick, und dasselbe Zod-Schema
 * prüft beides. Eine zweite Gestalt hieße eine zweite Migrationskette – und
 * die eine davon veraltete.
 *
 * ## Ein beschädigter Datensatz ist ein Fehler, kein leeres Paket
 *
 * Was aus der Datenbank kommt, wird beim Lesen geprüft. Fällt die Prüfung
 * durch, gibt es eine Meldung – kein Paket mit null Vokabeln, das aussieht,
 * als hätte jemand seine Arbeit verloren.
 */

/* ------------------------------------------------------------ Zeilenform -- */

export interface PackRow {
  id: string;
  title: string;
  grade: string;
  created_at: string;
  updated_at: string;
}

export interface DraftRow {
  pack_id: string;
  format_version: number;
  pack: unknown;
  updated_at: string;
}

export interface RevisionRow {
  pack_id: string;
  revision: number;
  format_version: number;
  pack: unknown;
  published_by: string;
  published_at: string;
  withdrawn_at: string | null;
}

/** Was eine Übersicht braucht – ohne das ganze Paket zu laden. */
export interface PackOverviewRow extends PackRow {
  entry_count: number;
  published_revision: number | null;
  published_at: string | null;
}

export interface PackGateway {
  selectOverview(): Promise<PackOverviewRow[]>;
  selectDraft(packId: string): Promise<DraftRow | undefined>;
  rpcSaveDraft(input: {
    packId: string;
    title: string;
    grade: string;
    formatVersion: number;
    pack: unknown;
  }): Promise<PackRow>;
  deletePack(packId: string): Promise<void>;

  rpcPublish(packId: string): Promise<RevisionRow>;
  rpcWithdraw(packId: string, revision: number): Promise<void>;
  selectRevisions(packId: string): Promise<Omit<RevisionRow, 'pack'>[]>;
  rpcAssign(courseId: string, packId: string, revision: number, sortOrder: number): Promise<void>;
  deleteAssignment(courseId: string, packId: string): Promise<void>;
  selectCourseRevisions(courseId: string): Promise<RevisionRow[]>;
}

/* ------------------------------------------------------------ Umrechnung -- */

export const PAKET_BESCHAEDIGT =
  'Dieses Paket lässt sich nicht lesen. Es ist in der Datenbank beschädigt.';

/**
 * JSONB zurück in ein Paket – mit Prüfung.
 *
 * Die Datenbank garantiert nur, dass es JSON ist. Ob es ein Paket ist, sagt
 * das Schema, das auch eine Datei prüft.
 */
export function alsPaket(rohes: unknown): VocabPack {
  const ergebnis = vocabPackFileSchema.safeParse(rohes);
  if (!ergebnis.success) throw new Error(PAKET_BESCHAEDIGT);
  return { meta: ergebnis.data.meta, entries: ergebnis.data.entries };
}

export function alsRevision(zeile: RevisionRow): PackRevision {
  return {
    packId: zeile.pack_id,
    revision: zeile.revision,
    pack: alsPaket(zeile.pack),
    publishedAt: zeile.published_at,
  };
}

export function alsUebersicht(zeile: PackOverviewRow): PackSummary {
  return {
    id: zeile.id,
    title: zeile.title,
    grade: zeile.grade,
    entryCount: zeile.entry_count,
    ...(zeile.published_revision === null ? {} : { publishedRevision: zeile.published_revision }),
    /*
      „Es gibt Änderungen“ heißt: Der Entwurf ist jünger als die letzte
      Veröffentlichung. Ein Vergleich der Inhalte wäre genauer und würde jedes
      Mal das ganze Paket laden – für eine Liste, die eine Lehrkraft
      überfliegt, ist der Zeitpunkt die richtige Näherung.
    */
    hasUnpublishedChanges:
      zeile.published_at === null || zeile.published_at < zeile.updated_at,
    updatedAt: zeile.updated_at,
  };
}

/* ---------------------------------------------------------- Repositories -- */

export function createSqlPackRepositories(gateway: PackGateway): {
  packs: PackRepository;
  publication: PublicationRepository;
} {
  async function speichern(pack: VocabPack): Promise<PackSummary> {
    const datei = toPackFile(pack);
    const zeile = await gateway.rpcSaveDraft({
      packId: pack.meta.id,
      title: pack.meta.title,
      grade: pack.meta.grade,
      formatVersion: datei.formatVersion,
      pack: datei,
    });
    return {
      id: zeile.id,
      title: zeile.title,
      grade: zeile.grade,
      entryCount: pack.entries.length,
      // Frisch gespeichert heißt: noch nicht veröffentlicht, oder geändert.
      hasUnpublishedChanges: true,
      updatedAt: zeile.updated_at,
    };
  }

  const packs: PackRepository = {
    async list() {
      return (await gateway.selectOverview()).map(alsUebersicht);
    },

    async getDraft(packId) {
      const zeile = await gateway.selectDraft(packId);
      return zeile ? alsPaket(zeile.pack) : undefined;
    },

    async saveDraft(pack) {
      return speichern(pack);
    },

    async deletePack(packId) {
      await gateway.deletePack(packId);
    },

    async importFromLocal(pack) {
      /*
        Dieselbe Kennung wie lokal, deshalb wiederholbar: Wer zweimal auf
        „übernehmen“ klickt, bekommt kein zweites Paket, sondern denselben
        Stand. Das ist die ganze Idee hinter einer stabilen Paketkennung
        (ADR-4).
      */
      return speichern(pack);
    },
  };

  const publication: PublicationRepository = {
    async publish(packId) {
      return alsRevision(await gateway.rpcPublish(packId));
    },

    async withdraw(packId, revision) {
      await gateway.rpcWithdraw(packId, revision);
    },

    async revisions(packId) {
      return (await gateway.selectRevisions(packId)).map((zeile) => ({
        packId: zeile.pack_id,
        revision: zeile.revision,
        publishedAt: zeile.published_at,
      }));
    },

    async assignToCourse(courseId, packId, revision, position) {
      await gateway.rpcAssign(courseId, packId, revision, position);
    },

    async removeFromCourse(courseId, packId) {
      await gateway.deleteAssignment(courseId, packId);
    },

    async publishedForCourse(courseId) {
      return (await gateway.selectCourseRevisions(courseId)).map(alsRevision);
    },
  };

  return { packs, publication };
}
