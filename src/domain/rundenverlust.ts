/**
 * Ginge beim Verlassen der Runde etwas verloren? — E14, die eine Regel.
 *
 * ## Warum das eine Funktion ist und keine zwei Bedingungen an zwei Stellen
 *
 * Die Runde lässt sich auf mehreren Wegen verlassen: „Runde beenden",
 * „Abmelden", Browser-Zurück, Neuladen, Schließen. Jeder Weg, der die Frage
 * selbst beantwortet, beantwortet sie irgendwann anders als die übrigen — und
 * dann fragt einer zu viel oder einer zu wenig. Die Frage steht deshalb
 * genau hier, rein und ohne Seiteneffekte, und jeder Weg ruft sie auf.
 *
 * ## Was „verloren" heißt und was nicht
 *
 * **Jede abgeschlossene Antwort ist bereits gesichert** (E14): Sie ging im
 * Moment des Prüfens an den Lernstand. Verlieren kann man nur, was noch
 * **nicht** abgeschickt wurde — die Eingabe an der *aktuellen* Aufgabe.
 *
 * Daraus folgt, was eine Rückfrage **nicht** auslösen darf:
 *
 * - eine Runde ohne offene Aufgabe (fertig, leer, noch im Laden),
 * - eine Aufgabe, an der noch nichts eingegeben wurde,
 * - eine Aufgabe, deren Antwort bereits geprüft dasteht — die ist gespeichert,
 *   und „Weiter" ist nur noch ein Blättern.
 *
 * Eine Rückfrage, die bei jedem Verlassen kommt, wird weggeklickt — und dann
 * auch die eine, die zählt.
 *
 * ## Zu den Auswahlaufgaben
 *
 * Bei Multiple Choice und Wortbank **ist** das Antippen zugleich das
 * Abschicken; es gibt dort keinen Zwischenzustand „gewählt, aber noch nicht
 * bestätigt". Ihr Entwurf ist deshalb immer leer, und das ist keine Lücke,
 * sondern die Form dieser Aufgaben. Bekäme eine Aufgabenform später eine
 * schwebende Auswahl, meldete sie diese als Entwurf — die Regel hier bliebe
 * dieselbe.
 */

export interface Rundenstand {
  /** Es gibt eine offene Aufgabe. Ohne sie ist nichts zu verlieren. */
  readonly aufgabeOffen: boolean;
  /** Die Antwort steht schon geprüft da — also gespeichert. */
  readonly ergebnisSteht: boolean;
  /** Was im Antwortfeld steht und noch nicht abgeschickt wurde. */
  readonly entwurf: string;
}

export function gingeVerloren(stand: Rundenstand): boolean {
  if (!stand.aufgabeOffen) return false;
  if (stand.ergebnisSteht) return false;
  return stand.entwurf.trim().length > 0;
}
