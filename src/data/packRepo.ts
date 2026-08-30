import { db, type StoredEntry } from './db';
import {
  diffPackEntries,
  summarizeDiff,
  type PackDiff,
  type PackUpdateSummary,
} from '../domain/packDiff';
import type { PackMeta, VocabEntry, VocabPack } from '../domain/schema';

function toStored(entry: VocabEntry, packId: string, position: number): StoredEntry {
  return { ...entry, packId, position };
}

function toEntry(stored: StoredEntry): VocabEntry {
  const { packId: _packId, position: _position, ...entry } = stored;
  return entry;
}

export async function listPacks(): Promise<PackMeta[]> {
  const packs = await db.packs.toArray();
  return packs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPackMeta(packId: string): Promise<PackMeta | undefined> {
  return db.packs.get(packId);
}

export async function getEntries(packId: string): Promise<VocabEntry[]> {
  const stored = await db.packEntries.where('packId').equals(packId).toArray();
  stored.sort((a, b) => a.position - b.position);
  return stored.map(toEntry);
}

export async function getPack(packId: string): Promise<VocabPack | undefined> {
  const meta = await db.packs.get(packId);
  if (!meta) return undefined;
  return { meta, entries: await getEntries(packId) };
}

export async function countEntries(packId: string): Promise<number> {
  return db.packEntries.where('packId').equals(packId).count();
}

export async function packExists(packId: string): Promise<boolean> {
  return (await db.packs.where('id').equals(packId).count()) > 0;
}

/**
 * Zeigt vorab, was ein Speichern mit den Lernständen machen würde –
 * Grundlage für die Bestätigung vor dem Überschreiben eines Pakets.
 */
export async function previewPackUpdate(pack: VocabPack): Promise<PackDiff> {
  const existing = await getEntries(pack.meta.id);
  return diffPackEntries(existing, pack.entries);
}

export interface SavePackResult {
  packId: string;
  isNew: boolean;
  summary: PackUpdateSummary;
}

/**
 * Legt ein Paket an oder aktualisiert es.
 *
 * Lernstände werden dabei abgeglichen statt pauschal gelöscht:
 * unveränderte Einträge behalten ihren Stand, inhaltlich geänderte werden
 * zurückgesetzt, entfernte Einträge verlieren ihn. Änderungen an den
 * Paket-Metadaten (Titel, Thema, Beschreibung …) wirken sich nie aus.
 *
 * Lernstände einer Richtung, die durch eine geänderte Lernrichtung gerade
 * nicht aktiv ist, bleiben erhalten – sie zählen nur nicht mit und stehen
 * wieder zur Verfügung, sobald die Richtung erneut aktiviert wird.
 */
export async function savePack(pack: VocabPack): Promise<SavePackResult> {
  const meta: PackMeta = { ...pack.meta, updatedAt: new Date().toISOString() };

  return db.transaction(
    'rw',
    db.packs,
    db.packEntries,
    db.directionProgress,
    db.packProgress,
    async () => {
      const existingMeta = await db.packs.get(meta.id);
      const existingStored = await db.packEntries.where('packId').equals(meta.id).toArray();
      existingStored.sort((a, b) => a.position - b.position);
      const existing = existingStored.map(toEntry);

      const diff = diffPackEntries(existing, pack.entries);

      // Lernstände inhaltlich geänderter und entfernter Vokabeln aufräumen.
      for (const entry of [...diff.changed, ...diff.removed]) {
        await db.directionProgress.where({ packId: meta.id, entryId: entry.id }).delete();
      }

      await db.packs.put(meta);
      await db.packEntries.where('packId').equals(meta.id).delete();
      await db.packEntries.bulkPut(
        pack.entries.map((entry, index) => toStored(entry, meta.id, index)),
      );

      return {
        packId: meta.id,
        isNew: existingMeta === undefined,
        summary: summarizeDiff(diff),
      };
    },
  );
}

export async function updatePackMeta(meta: PackMeta): Promise<void> {
  await db.packs.put({ ...meta, updatedAt: new Date().toISOString() });
}

export async function deletePack(packId: string): Promise<void> {
  await db.transaction(
    'rw',
    db.packs,
    db.packEntries,
    db.directionProgress,
    db.packProgress,
    async () => {
      await db.packs.delete(packId);
      await db.packEntries.where('packId').equals(packId).delete();
      await db.directionProgress.where('packId').equals(packId).delete();
      await db.packProgress.delete(packId);
    },
  );
}
