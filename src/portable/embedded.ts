import { PACK_ELEMENT_ID, readEmbeddedJson, type EmbeddedAreaResult } from './studentExport';

/**
 * Den eingebetteten Lernbereich aus dem laufenden Dokument lesen.
 *
 * Getrennt von `studentExport.ts`, weil dort keine DOM-Abhängigkeit stehen
 * soll: Die Erzeugung der Datei läuft auch im Test ohne Browser.
 */
export function readEmbeddedAreaFromDocument(doc: Document = document): EmbeddedAreaResult {
  const element = doc.getElementById(PACK_ELEMENT_ID);
  if (!element) {
    return { ok: false, errors: ['In dieser Datei sind keine Vokabeln enthalten.'] };
  }
  // `textContent`, nicht `innerHTML`: Der Inhalt wird als Text gelesen und
  // nie als Markup interpretiert.
  return readEmbeddedJson(element.textContent);
}

/**
 * Der Datenbankname dieser Lerndatei.
 *
 * Unter `file://` teilen sich in Chromium **alle** lokalen Dateien denselben
 * Ursprung. Ohne eigenen Namen läge der Lernstand einer Lerndatei in
 * derselben Datenbank wie die der Lehrkraftdatei und aller anderen
 * Lerndateien. Ein Name je Lernbereich trennt sie sauber: Die Datei sieht
 * weder fremde Pakete noch fremde Lernstände.
 *
 * ## Warum die Bereichskennung und nicht die Paketkennung
 *
 * Bis 4B.7 stand hier die Paket-Id, weil in einer Datei genau ein Paket lag.
 * Jetzt liegen dort mehrere, und sie teilen sich einen Lernstand – der hängt
 * am Bereich.
 *
 * Für eine Lerndatei ändert sich dabei **nichts**: Die Kennung eines
 * Bereichs mit einem Paket ist die des Pakets (siehe
 * `domain/learningArea.ts`). Eine vor 4B.7 verteilte Datei und ihre
 * Neuausgabe landen deshalb in derselben Datenbank, und niemand fängt von
 * vorn an.
 */
export function studentDatabaseName(areaId: string): string {
  const safe = areaId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return `lexiflow-schueler-${safe || 'paket'}`;
}
