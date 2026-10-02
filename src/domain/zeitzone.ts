/**
 * Zeitzone und Wochenziel – die Regeln, ohne Speicher und ohne Oberfläche.
 *
 * ## Warum das hier steht und nicht im Repository
 *
 * E27 verlangt eine Trennung, die leicht verlorengeht: Der Browser **darf
 * vorschlagen**, gespeichert wird erst nach ausdrücklicher Bestätigung. Läge
 * der Vorschlag im Repository, wäre der Weg vom Vorschlag zum gespeicherten
 * Wert eine Zeile lang – und niemand sähe, dass er beschritten wurde.
 *
 * Hier gibt es den Vorschlag, und hier endet er. Dieses Modul kennt keinen
 * Speicher, kein Repository und kein `fetch`. Wer den Vorschlag ablegen will,
 * ruft `confirmTimeZone` auf dem Repository auf – eine Methode, deren Name
 * sagt, was sie bedeutet.
 */

/** Was über die Zeitzone einer lernenden Person bekannt ist. */
export type Zeitzonenstand =
  | { readonly art: 'bestaetigt'; readonly zone: string }
  | { readonly art: 'unbestaetigt'; readonly vorschlag?: string };

/**
 * Was das Gerät über seine Zeitzone meint.
 *
 * Ein **Vorschlag**, mehr nicht. Ein Gerät kann falsch eingestellt sein, auf
 * Reisen stehen oder gar nichts wissen; `undefined` ist deshalb ein
 * vorgesehener Ausgang und kein Fehler.
 *
 * `Intl.DateTimeFormat` gibt es in jeder Umgebung, in der das Portal läuft.
 * Trotzdem steht der Zugriff in einem `try`: In einer Umgebung ohne
 * Zeitzonendaten wirft er, und ein Vorschlag ist nichts, wofür eine Seite
 * weiß bleiben darf.
 */
export function zeitzonenVorschlag(): string | undefined {
  try {
    const erkannt = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof erkannt === 'string' && erkannt.length > 0 ? erkannt : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Der Zeitzonenstand aus dem Gespeicherten und dem Vorschlag.
 *
 * Die Reihenfolge ist die ganze Aussage: Steht ein Wert, gilt er – auch dann,
 * wenn das Gerät gerade etwas anderes meint. Ein erkanntes anderes Gerät
 * überschreibt **nichts**; es taucht hier nicht einmal auf.
 *
 * @param gespeichert Was in `learner_settings.time_zone` steht, oder nichts.
 * @param vorschlag Was das Gerät meint – nur dann befragt, wenn nichts steht.
 */
export function zeitzonenstand(
  gespeichert: string | undefined,
  vorschlag: string | undefined,
): Zeitzonenstand {
  if (gespeichert !== undefined && gespeichert !== '') {
    return { art: 'bestaetigt', zone: gespeichert };
  }
  return vorschlag === undefined || vorschlag === ''
    ? { art: 'unbestaetigt' }
    : { art: 'unbestaetigt', vorschlag };
}

/**
 * Darf aus diesem Stand eine Serie als verlässliche Zahl entstehen?
 *
 * Nein, solange die Zeitzone unbestätigt ist (E27). Eine Serie ist eine
 * Aussage über **Tage**, und ohne Tagesgrenze ist sie eine Aussage über
 * nichts. Ein Vorschlag ersetzt die Bestätigung nicht – sonst stünde dort
 * eine Zahl, die bei der ersten Reise leise falsch wird.
 */
export function serieIstBelastbar(stand: Zeitzonenstand): boolean {
  return stand.art === 'bestaetigt';
}

/** Die erlaubten Wochenziele (E26): Lerntage je Woche, 1 bis 7. */
export const WOCHENZIEL_MIN = 1;
export const WOCHENZIEL_MAX = 7;

/**
 * Ist das ein zulässiges Wochenziel?
 *
 * `undefined` heißt **kein Ziel** und ist zulässig – es ist die
 * Voreinstellung (E3). Was hier durchfällt, ist alles andere: 0, 8,
 * Nachkommastellen, `NaN`.
 *
 * Dieselbe Grenze steht als `check` in der Datenbank. Zweimal, und das mit
 * Absicht: Die Prüfbedingung hält auch gegen eine Anfrage, die an dieser
 * Funktion vorbeigeht; diese Funktion sagt es, bevor ein Umlauf dafür nötig
 * ist.
 */
export function istWochenziel(wert: number | undefined): boolean {
  if (wert === undefined) return true;
  return Number.isInteger(wert) && wert >= WOCHENZIEL_MIN && wert <= WOCHENZIEL_MAX;
}
