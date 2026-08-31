/**
 * Läuft diese Anwendung als exportierte Einzelpaket-Datei?
 *
 * In der Schülerdatei gibt es genau ein Paket – eine Bibliothek „Alle Pakete“
 * wäre dort eine leere Seite und damit ein falsches Versprechen. Der
 * Einstiegspunkt der Schülerdatei setzt die Kennzeichnung, bevor die App
 * geladen wird; im normalen Web-Build ist sie nicht gesetzt.
 *
 * Bewusst dieselbe Bauart wie beim Datenbanknamen (siehe `data/db.ts`): Der
 * Wert steht global bereit, statt durch jede Komponente gereicht zu werden –
 * er ändert sich innerhalb einer Sitzung nie.
 */
export function isSinglePackApp(): boolean {
  return (globalThis as { __LEXIFLOW_SINGLE_PACK__?: unknown }).__LEXIFLOW_SINGLE_PACK__ === true;
}

/** Der Rückweg von der Paketseite – und wie er heißt. */
export function libraryLink(): { to: string; label: string } {
  return isSinglePackApp()
    ? { to: '/', label: 'Start' }
    : { to: '/lernen', label: 'Alle Pakete' };
}
