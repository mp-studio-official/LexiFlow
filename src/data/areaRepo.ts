import { db } from './db';
import { newId } from '../domain/ids';
import type { LearningArea } from '../domain/learningArea';

/**
 * Lernbereiche im Speicher der Lehrkraft.
 *
 * Der Zuschnitt ist derselbe wie bei `packRepo`: Diese Datei kennt Dexie und
 * sonst nichts – keine Komponente, kein Zustand, keine Beschriftung. Was ein
 * Lernbereich *ist* und was ihn ausgabefähig macht, steht in
 * `domain/learningArea.ts` und lässt sich dort ohne Datenbank prüfen.
 *
 * ## Was hier absichtlich nicht passiert
 *
 * Ein Bereich hält **Kennungen**, keine Pakete. Diese Datei prüft nicht, ob
 * die Kennungen noch auf etwas zeigen, und räumt auch nichts auf, wenn ein
 * Paket gelöscht wird. Das ist eine Entscheidung und kein Versäumnis: Ein
 * Bereich, der beim Löschen eines Pakets stillschweigend schrumpft, verliert
 * eine Auswahl, die jemand getroffen hat. Die Oberfläche zeigt stattdessen,
 * dass ein Paket fehlt, und überlässt die Entscheidung der Lehrkraft.
 *
 * Ausgenommen ist nur die Ausgabe selbst: Beim Erzeugen der Datei zählt, was
 * wirklich in der Bibliothek liegt – eine Datei mit einem Loch darin gibt es
 * nicht.
 */

export async function listAreas(): Promise<LearningArea[]> {
  const areas = await db.areas.toArray();
  // Zuletzt bearbeitet zuerst – wie bei den Paketen.
  return areas.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getArea(areaId: string): Promise<LearningArea | undefined> {
  return db.areas.get(areaId);
}

export interface AreaDraft {
  title: string;
  description?: string;
  packIds: readonly string[];
}

/**
 * Einen neuen Lernbereich anlegen.
 *
 * Die Kennung entsteht **hier** und genau einmal. Sie bestimmt später den
 * Namen der Datenbank auf den Geräten der Lernenden; wer sie neu vergibt,
 * setzt deren Lernstand zurück. Deshalb gibt es keine Funktion, die sie
 * ändert.
 */
export async function createArea(draft: AreaDraft): Promise<LearningArea> {
  const now = new Date().toISOString();
  const area: LearningArea = {
    id: newId(),
    title: draft.title.trim(),
    ...(draft.description?.trim() ? { description: draft.description.trim() } : {}),
    packIds: [...draft.packIds],
    createdAt: now,
    updatedAt: now,
  };
  await db.areas.put(area);
  return area;
}

/**
 * Titel, Beschreibung und Auswahl ändern – die Kennung nie.
 *
 * `createdAt` und `id` kommen aus dem gespeicherten Bereich und nicht aus dem
 * Aufruf. Ein Aufrufer, der sie versehentlich mitschickte, könnte sonst genau
 * das tun, was oben ausgeschlossen ist.
 */
export async function updateArea(areaId: string, draft: AreaDraft): Promise<LearningArea> {
  const existing = await db.areas.get(areaId);
  if (!existing) throw new Error(`Lernbereich ${areaId} existiert nicht.`);

  const area: LearningArea = {
    ...existing,
    title: draft.title.trim(),
    packIds: [...draft.packIds],
    updatedAt: new Date().toISOString(),
  };
  const description = draft.description?.trim();
  if (description) area.description = description;
  else delete area.description;

  await db.areas.put(area);
  return area;
}

export async function deleteArea(areaId: string): Promise<void> {
  await db.areas.delete(areaId);
}
