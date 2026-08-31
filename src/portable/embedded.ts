import { PACK_ELEMENT_ID, readEmbeddedJson, type EmbeddedPackResult } from './studentExport';
import type { VocabPack } from '../domain/schema';

/**
 * Das eingebettete Paket aus dem laufenden Dokument lesen.
 *
 * Getrennt von `studentExport.ts`, weil dort keine DOM-Abhängigkeit stehen
 * soll: Die Erzeugung der Datei läuft auch im Test ohne Browser.
 */
export function readEmbeddedPackFromDocument(doc: Document = document): EmbeddedPackResult {
  const element = doc.getElementById(PACK_ELEMENT_ID);
  if (!element) {
    return { ok: false, errors: ['In dieser Datei ist kein Vokabelpaket enthalten.'] };
  }
  // `textContent`, nicht `innerHTML`: Der Inhalt wird als Text gelesen und
  // nie als Markup interpretiert.
  return readEmbeddedJson(element.textContent);
}

/** Die Paketform, mit der die bestehenden Repositories arbeiten. */
export function toVocabPack(file: { meta: VocabPack['meta']; entries: VocabPack['entries'] }): VocabPack {
  return { meta: file.meta, entries: file.entries };
}

/**
 * Der Datenbankname dieser Schülerdatei.
 *
 * Unter `file://` teilen sich in Chromium **alle** lokalen Dateien denselben
 * Ursprung. Ohne eigenen Namen läge der Lernstand einer Schülerdatei in
 * derselben Datenbank wie die der Lehrkraftdatei und aller anderen
 * Schülerdateien. Ein Name je Paket trennt sie sauber: Die Schülerdatei sieht
 * weder fremde Pakete noch fremde Lernstände.
 */
export function studentDatabaseName(packId: string): string {
  const safe = packId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return `lexiflow-schueler-${safe || 'paket'}`;
}
