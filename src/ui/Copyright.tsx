/**
 * Das Zeichen ganz unten: **© OHM**.
 *
 * Es steht in der App, in der portablen Lerndatei und auf dem Ausdruck –
 * deshalb an genau einer Stelle im Quelltext. Ein Vermerk, den man an drei
 * Orten pflegen muss, ist an zweien falsch, sobald sich einer ändert.
 *
 * ## Warum eine Konstante und kein hingeschriebener Text
 *
 * Zwischen Zeichen und Kürzel steht ein **geschütztes Leerzeichen**. Ein
 * gewöhnliches darf umbrechen; „©“ am Zeilenende und „OHM“ auf der nächsten
 * ist kein Vermerk mehr, sondern ein Rest. Ein unsichtbares Zeichen, das man
 * in jeder Aufrufstelle von Hand richtig setzen müsste, wäre spätestens beim
 * dritten Mal ein gewöhnliches Leerzeichen.
 *
 * ## Warum kein Jahr
 *
 * Ein Jahr ist ein Datum, das jemand pflegen muss – und das spätestens im
 * Januar falsch ist. Das Kürzel allein sagt, wem die Sache gehört; mehr soll
 * die Zeile nicht.
 */

/** Zeichen und Kürzel, untrennbar (U+00A0). Für Anzeige **und** Tests. */
export const COPYRIGHT_NOTICE = '© OHM';

export function Copyright({ className }: { className?: string }): React.JSX.Element {
  return <p className={['copyright', className].filter(Boolean).join(' ')}>{COPYRIGHT_NOTICE}</p>;
}
