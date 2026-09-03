/**
 * Wo diese Anwendung läuft – und was das für den Rückweg bedeutet.
 *
 * Drei Fassungen derselben Anwendung, und der Rückweg von einer Paketseite
 * führt in jeder woandershin:
 *
 * | Fassung                        | „Zurück“ führt nach | und heißt      |
 * |--------------------------------|---------------------|----------------|
 * | Lehrkraftanwendung             | `/lernen`           | Alle Pakete    |
 * | Lerndatei mit einem Paket      | `/`                 | Start          |
 * | Lerndatei mit mehreren Paketen | `/`                 | Alle Pakete    |
 *
 * Die dritte Zeile ist die, für die es diese Datei seit 4B.7 überhaupt noch
 * gibt. Vorher genügte eine einzige Frage („ein Paket oder viele?“), weil ein
 * Lernbereich mit mehreren Paketen nicht vorgesehen war. Jetzt sind es zwei
 * Fragen, und sie sind wirklich verschieden: **wie viele Pakete** entscheidet,
 * ob eine Liste überhaupt etwas zu zeigen hat, und **welche Fassung**
 * entscheidet, wo diese Liste liegt. In der Lerndatei gibt es die Route
 * `/lernen` nicht; ein Verweis dorthin landete auf einer Weiterleitung.
 *
 * Bewusst dieselbe Bauart wie beim Datenbanknamen (siehe `data/db.ts`): Die
 * Werte stehen global bereit, statt durch jede Komponente gereicht zu werden –
 * sie ändern sich innerhalb einer Sitzung nie. Gesetzt werden sie im
 * Einstiegspunkt der Lerndatei, bevor die App geladen wird; im normalen
 * Web-Build ist keiner von beiden gesetzt.
 */

interface PortableFlags {
  __LEXIFLOW_SINGLE_PACK__?: unknown;
  __LEXIFLOW_PORTABLE_AREA__?: unknown;
}

/** Läuft diese Anwendung als exportierte Lerndatei? */
export function isPortableAreaApp(): boolean {
  return (globalThis as PortableFlags).__LEXIFLOW_PORTABLE_AREA__ === true;
}

/** Enthält diese Lerndatei genau ein Paket? */
export function isSinglePackApp(): boolean {
  return (globalThis as PortableFlags).__LEXIFLOW_SINGLE_PACK__ === true;
}

/** Der Rückweg von der Paketseite – und wie er heißt. */
export function libraryLink(): { to: string; label: string } {
  if (isSinglePackApp()) return { to: '/', label: 'Start' };
  if (isPortableAreaApp()) return { to: '/', label: 'Alle Pakete' };
  return { to: '/lernen', label: 'Alle Pakete' };
}
