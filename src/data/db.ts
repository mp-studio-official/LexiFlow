import Dexie, { type Table, type Transaction } from 'dexie';
import type { EntryProgress, PackMeta, PackProgress, VocabEntry } from '../domain/schema';
import { activeDirections } from '../domain/schema';
import { progressKey } from '../domain/ids';

/** Eintrag im Speicher – identisch zum Datei-Eintrag plus Paketzuordnung. */
export interface StoredEntry extends VocabEntry {
  packId: string;
  /** Reihenfolge innerhalb des Pakets. */
  position: number;
}

/**
 * Lokale Datenbank. Sie verlässt das Gerät nicht: Es gibt keinen Sync,
 * keine Telemetrie und keinen Netzwerkpfad, der diese Tabellen liest.
 *
 * ## Schema-Historie
 *
 * **Version 1** (Sprint 1)
 * - `entries: 'id, …'` – `entry.id` war globaler Primärschlüssel. Zwei Pakete
 *   mit derselben Entry-ID hätten sich gegenseitig überschrieben.
 * - `entryProgress: 'key, …'` mit `key = packId::entryId` – rezeptives und
 *   produktives Üben teilten sich einen Datensatz.
 *
 * **Version 2** (Sprint 1.1) – neue Tabellen mit korrekten Schlüsseln.
 * IndexedDB kann den Primärschlüssel einer bestehenden Tabelle nicht ändern,
 * deshalb werden `packEntries` und `directionProgress` neu angelegt und die
 * Daten im `upgrade`-Schritt kopiert:
 * - `packEntries: '[packId+id], …'` – zusammengesetzter Primärschlüssel.
 * - `directionProgress: 'key, …'` mit `key = packId::entryId::direction`.
 *   Bestehende Lernstände werden der ersten aktiven Richtung des jeweiligen
 *   Pakets zugeordnet (bei „beide Richtungen“ also `en-de`); die Gegenrichtung
 *   startet neu. Das ist der einzige, bewusst in Kauf genommene Verlust und
 *   betrifft nur lokal vorhandene Daten aus Sprint 1.
 *
 * **Version 3** (Sprint 1.1) – die alten Tabellen werden entfernt. Die Trennung
 * in zwei Versionen ist nötig, weil in Version 2 noch aus ihnen gelesen wird.
 */
export class LexiFlowDatabase extends Dexie {
  declare packs: Table<PackMeta, string>;
  declare packEntries: Table<StoredEntry, [string, string]>;
  declare directionProgress: Table<EntryProgress, string>;
  declare packProgress: Table<PackProgress, string>;

  constructor(name = 'lexiflow') {
    super(name);

    this.version(1).stores({
      packs: 'id, updatedAt, grade, title',
      entries: 'id, packId, position, english',
      entryProgress: 'key, packId, dueAt, box',
      packProgress: 'packId, lastPracticedAt',
    });

    this.version(2)
      .stores({
        packs: 'id, updatedAt, grade, title',
        entries: 'id, packId, position, english',
        entryProgress: 'key, packId, dueAt, box',
        packEntries: '[packId+id], packId, position, english',
        directionProgress: 'key, packId, entryId, direction, [packId+entryId], dueAt, box',
        packProgress: 'packId, lastPracticedAt',
      })
      .upgrade(migrateV1ToV2);

    this.version(3).stores({
      packs: 'id, updatedAt, grade, title',
      entries: null,
      entryProgress: null,
      packEntries: '[packId+id], packId, position, english',
      directionProgress: 'key, packId, entryId, direction, [packId+entryId], dueAt, box',
      packProgress: 'packId, lastPracticedAt',
    });
  }
}

interface LegacyEntry extends VocabEntry {
  packId: string;
  position?: number;
}

interface LegacyProgress {
  key: string;
  packId: string;
  entryId: string;
  box: number;
  correctCount: number;
  wrongCount: number;
  streak: number;
  lastAnsweredAt?: string;
  dueAt: string;
}

/** Einmalige lokale Migration der Sprint-1-Daten auf die neuen Schlüssel. */
async function migrateV1ToV2(tx: Transaction): Promise<void> {
  const packs = (await tx.table('packs').toArray()) as PackMeta[];
  const directionByPack = new Map(
    packs.map((pack) => [pack.id, activeDirections(pack.direction)[0] ?? 'en-de'] as const),
  );

  const legacyEntries = (await tx.table('entries').toArray()) as LegacyEntry[];
  if (legacyEntries.length > 0) {
    await tx.table('packEntries').bulkPut(
      legacyEntries.map((entry, index) => ({ ...entry, position: entry.position ?? index })),
    );
  }

  const legacyProgress = (await tx.table('entryProgress').toArray()) as LegacyProgress[];
  if (legacyProgress.length > 0) {
    await tx.table('directionProgress').bulkPut(
      legacyProgress.map((progress) => {
        const direction = directionByPack.get(progress.packId) ?? 'en-de';
        return {
          ...progress,
          direction,
          key: progressKey(progress.packId, progress.entryId, direction),
        };
      }),
    );
  }
}

/**
 * Der Datenbankname ist ab Sprint 4A.1 einstellbar.
 *
 * Grund ist `file://`: Chromium behandelt **alle** lokalen Dateien als
 * denselben Ursprung. Ohne eigenen Namen läge der Lernstand einer portablen
 * Schülerdatei in derselben Datenbank wie die der Lehrkraftdatei und aller
 * anderen Schülerdateien. Der Einstiegspunkt der Schülerdatei setzt deshalb
 * `globalThis.__LEXIFLOW_DB__`, **bevor** dieses Modul geladen wird (er lädt die
 * App dynamisch nach). Im normalen Web-Build ist die Variable nicht gesetzt und
 * es bleibt bei `lexiflow`.
 */
export const DEFAULT_DATABASE_NAME = 'lexiflow';

function configuredDatabaseName(): string {
  const configured = (globalThis as { __LEXIFLOW_DB__?: unknown }).__LEXIFLOW_DB__;
  return typeof configured === 'string' && configured.length > 0
    ? configured
    : DEFAULT_DATABASE_NAME;
}

export const db = new LexiFlowDatabase(configuredDatabaseName());

/** Löscht sämtliche lokal gespeicherten Daten (Pakete und Lernstände). */
export async function clearAllLocalData(): Promise<void> {
  await db.transaction(
    'rw',
    db.packs,
    db.packEntries,
    db.directionProgress,
    db.packProgress,
    async () => {
      await Promise.all([
        db.packs.clear(),
        db.packEntries.clear(),
        db.directionProgress.clear(),
        db.packProgress.clear(),
      ]);
    },
  );
}
