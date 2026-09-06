/**
 * Wohin gesendet wird – und warum das keine Einstellung ist.
 *
 * ## Keine freie URL
 *
 * Der naheliegende Entwurf wäre ein Feld „Endpunkt“ neben dem Feld
 * „API-Schlüssel“. Er ist ausdrücklich nicht gebaut, und zwar aus einem Grund,
 * der nichts mit Bequemlichkeit zu tun hat: In dieses Formular trägt eine
 * Lehrkraft ihren Schlüssel ein, und daneben stünde ein Feld, das bestimmt,
 * **wohin** dieser Schlüssel samt Schülertexten geht.
 *
 * Wer eine solche Zeichenkette einmal aus einer Anleitung kopiert, prüft sie
 * nicht. Ein Tippfehler in der Domain, ein Vorschlag aus einem Forum, ein
 * Screenshot mit einer Adresse darauf – und Schlüssel und Text liegen bei
 * jemand anderem. Das ist kein erfundenes Risiko: Genau so funktionieren die
 * einschlägigen Angriffe auf Werkzeuge, die „beliebige OpenAI-kompatible
 * Endpunkte“ anbieten.
 *
 * Deshalb steht die Adresse hier, im Quelltext, und nirgends sonst. Wer einen
 * anderen Anbieter unterstützen will, schreibt eine eigene Anbieterdatei mit
 * eigener Konfiguration – kein Feld, in das man alles eintragen kann.
 *
 * ## Das Modell dagegen ist konfigurierbar
 *
 * Modell-IDs ändern sich, Kontingente auch, und ein Wechsel von einem Flash-
 * auf ein Flash-Lite-Modell ist eine Kostenentscheidung, die einer Lehrkraft
 * gehört. Sie ist harmlos: Ein falscher Modellname erzeugt einen Fehler, keinen
 * Abfluss.
 */

/**
 * Der offizielle Endpunkt der Gemini-API. Fest, nicht einstellbar.
 *
 * `https://` steht ausgeschrieben da und wird beim Bauen der Adresse nochmals
 * geprüft (siehe `endpointFor`): Eine Konstante, die jemand später versehentlich
 * auf `http://` ändert, wäre ein stiller Klartextversand.
 */
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/';

/**
 * Die Modelle zur Auswahl.
 *
 * Abgerufen aus der offiziellen Modellübersicht (ai.google.dev, September
 * 2026); alle vier sind dort als **stabil** geführt. Bewusst keine
 * `-latest`-Kennung: Ein Alias, der ohne Zutun auf ein anderes Modell zeigt,
 * ändert Kosten und Antwortverhalten hinter dem Rücken der Lehrkraft, und ein
 * Fehler daraus ist nicht reproduzierbar.
 *
 * Die Liste ist eine **Bequemlichkeit**, keine Schranke: `modelId` im Feld ist
 * frei beschreibbar, damit ein neues Modell nicht auf einen neuen Build warten
 * muss. Ein unbekannter Name führt zu einem sauberen Fehler von Google, nicht
 * zu einem Abfluss.
 */
export const GEMINI_MODELS = [
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    hint: 'Am günstigsten und am schnellsten. Für Vokabelarbeit ausreichend.',
  },
  {
    id: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    hint: 'Etwas gründlicher bei langen Texten, dafür teurer.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    hint: 'Ältere, weiterhin stabile Fassung.',
  },
  {
    id: 'gemini-3.6-flash',
    label: 'Gemini 3.6 Flash',
    hint: 'Für schwierige Quelltexte.',
  },
] as const;

/**
 * Der Standard: das günstigste stabile Modell.
 *
 * Die Voreinstellung entscheidet über die Rechnung von jemandem, der sie nie
 * angesehen hat. Sie gehört deshalb ans untere Ende und nicht in die Mitte.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

/** Modell-IDs, die offensichtlich keine sind – für eine frühe, klare Meldung. */
const PLAUSIBLE_MODEL = /^[a-z0-9][a-z0-9.\-_]{2,63}$/;

export function isPlausibleModelId(model: string): boolean {
  return PLAUSIBLE_MODEL.test(model.trim());
}

/**
 * Die vollständige Adresse für einen Aufruf – gebaut, nicht zusammengeklebt.
 *
 * `encodeURIComponent` auf den Modellnamen: Er kommt aus einem Eingabefeld.
 * Ohne das ließe sich mit `../` aus dem Pfad ausbrechen und ein anderer
 * Google-Dienst ansprechen.
 *
 * **Kein `?key=`.** Der Schlüssel gehört in einen Header und nirgendwo sonst:
 * Adressen landen in Server-Logs, in Proxy-Logs, im Verlauf und in
 * Fehlerberichten. Ein Schlüssel in der Adresse ist ein Schlüssel in fremden
 * Logdateien. Dass Google die Variante anbietet, ändert daran nichts – ein Test
 * hält das fest.
 */
export function endpointFor(model: string): string {
  const url = new URL(`models/${encodeURIComponent(model.trim())}:generateContent`, GEMINI_BASE_URL);

  /*
    Doppelt geprüft, obwohl die Konstante oben steht: Diese Zeile ist die
    letzte Stelle vor dem Netz, und sie kostet nichts.
  */
  if (url.protocol !== 'https:') {
    throw new Error('Der Gemini-Endpunkt muss HTTPS sein.');
  }
  if (url.hostname !== 'generativelanguage.googleapis.com') {
    throw new Error('Der Gemini-Endpunkt ist nicht der offizielle.');
  }
  return url.toString();
}
