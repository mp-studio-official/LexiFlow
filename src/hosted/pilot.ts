/**
 * Die Pilotgrenze – an einer Stelle.
 *
 * ## Warum eine Datei und keine Umgebungsfahne
 *
 * Eine Fahne wäre bequem und falsch. Pilot 0.1 ist keine Bauvariante,
 * sondern ein **Stand des Produkts**: Es gibt Dinge, die noch nicht
 * freigegeben sind, und das gilt in jedem Build, auf jedem Gerät und auch
 * dann, wenn jemand die Fahne vergisst. Was hier steht, steht im Quelltext,
 * ist am Bündel ablesbar und ändert sich nur in einem Commit.
 *
 * ## Warum die KI-Sperre hier liegt und nicht in der KI-Seite
 *
 * Weil sie keine Eigenschaft der Seite ist. Vorher fiel KI nur deshalb aus,
 * weil niemand einen Schlüssel eingetragen hatte – ein Zufall, kein Zustand.
 * Für einen Pilot mit Minderjährigen ist das der Unterschied zwischen „ist
 * aus" und „war gerade aus".
 *
 * ## Was sie ausdrücklich nicht tut
 *
 * Sie löscht nichts und baut nichts zurück. Hinterlegte Schlüssel bleiben
 * versiegelt liegen, `ai-gateway` bleibt deployt, die Tabellen bleiben.
 * Eine Freigabe später ist ein eigener Abnahmeschritt – mit Anbieter,
 * Datenfluss, Datenschutzhinweis und einem echten Durchlauf – und nicht das
 * Zurückdrehen dieser Zeile.
 */

/** Ob dieser Stand ein Pilot ist. In Pilot 0.1: ja. */
export const IST_PILOT = true;

/** Was das Band sagt. Kurz, weil es auf jeder Seite steht. */
export const PILOT_BAND_TEXT =
  'Pilotfassung 0.1 – im Erprobungsbetrieb. Bitte noch nicht weitergeben.';

/**
 * Der KI-Zustand im Pilot.
 *
 * `'gesperrt'` heißt: sichtbar und bestimmt abgeschaltet. Nicht „kein
 * Schlüssel hinterlegt", nicht „der Anbieter antwortet nicht" – abgeschaltet,
 * und die Seite sagt es.
 */
export const KI_IM_PILOT: 'gesperrt' | 'frei' = 'gesperrt';

/** Der Satz, der an der Stelle steht, an der sonst KI wäre. */
export const KI_GESPERRT_TEXT =
  'KI ist im ersten Pilot noch nicht freigegeben. Hinterlegte Zugänge bleiben ' +
  'erhalten und werden nicht benutzt; eine Freigabe ist ein eigener Schritt.';
