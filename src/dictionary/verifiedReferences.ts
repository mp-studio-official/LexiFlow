/**
 * Geprüfte Querverweise – die einzige Ausnahme von „kein erschlossener
 * Verweis wird zur Antwort“.
 *
 * ## Warum es diese Datei gibt
 *
 * Der Wörterbuchdatensatz löst `trans-see`-Verweise auf: `doctor` hat im
 * Wiktionary keine eigenen deutschen Übersetzungen für die medizinische
 * Bedeutung, sondern verweist auf `physician`. Die Auflösung ist deshalb eine
 * **Schlussfolgerung**, und Schlussfolgerungen trägt die Sammelaktion
 * grundsätzlich nicht ein: Wer eine falsche Antwort im Feld findet, glaubt sie.
 *
 * Für `doctor → physician` ist diese Schlussfolgerung aber in Sprint 4A.2 an
 * echten Daten geprüft worden – sie war dort die verlangte Referenz, an der die
 * Verweisauflösung gemessen wurde. Sie bleibt deshalb erlaubt.
 *
 * ## Warum als Tabelle und nicht als Sonderfall im Code
 *
 * Eine `if (word === 'doctor')`-Abfrage in der Oberfläche wäre in einem halben
 * Jahr niemandem mehr erklärbar und stünde an einer Stelle, an der niemand sie
 * sucht. Hier steht sie an einer Stelle, ist zählbar, ist testbar und trägt
 * ihre Begründung mit. Wer eine weitere Ausnahme aufnimmt, muss sie hier
 * hinschreiben – und begründen.
 *
 * ## Was die Ausnahme **nicht** erlaubt
 *
 * Sie erlaubt genau eine Bedeutungsgruppe eines Stichworts, nämlich die über
 * das geprüfte Zielwort erschlossene. Sie erlaubt nicht, weitere Treffer
 * dazuzunehmen: `veterinarian` verweist ebenfalls auf einen Arztbegriff, ist
 * aber ein Tierarzt. Und sie hebt keine andere Regel auf – Registermarkierungen,
 * Klammerbedingungen und das Verbot, über Bedeutungen hinweg zu verbinden,
 * gelten unverändert.
 */

export interface VerifiedReference {
  /** Das Stichwort, kleingeschrieben. */
  headword: string;
  /** Das Zielwort des Verweises, kleingeschrieben. */
  via: string;
  /** Warum dieser Verweis geprüft ist – für den nächsten Leser. */
  reason: string;
}

export const VERIFIED_REFERENCES: readonly VerifiedReference[] = [
  {
    headword: 'doctor',
    via: 'physician',
    reason:
      'In Sprint 4A.2 an der Originalquelle geprüft: Die medizinische Bedeutung von ' +
      '„doctor“ steht im Wiktionary nur unter „physician“. Der Verweis war dort die ' +
      'verlangte Referenz für die Auflösung von trans-see-Verweisen.',
  },
];

/**
 * Ist dieser Verweis geprüft?
 *
 * Beide Seiten müssen stimmen: Ein `doctor`, das über irgendein anderes Wort
 * erschlossen wurde, fällt nicht unter die Ausnahme.
 */
export function isVerifiedReference(headword: string, via: string | undefined): boolean {
  if (!via) return false;
  const from = headword.trim().toLowerCase();
  const target = via.trim().toLowerCase();
  return VERIFIED_REFERENCES.some(
    (entry) => entry.headword === from && entry.via === target,
  );
}
