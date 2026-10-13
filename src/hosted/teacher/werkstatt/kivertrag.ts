import { PART_OF_SPEECH, type PartOfSpeech } from '../../../domain/schema';
import { candidateLiteral } from '../../../domain/textExtraction';
import type { Kandidatenzeile, Uebersetzungsvorschlag } from './textzustand';

/**
 * Der Vertrag für Übersetzungsvorschläge — nur die Form, nicht der Weg.
 *
 * ## Warum hier kein Anbieter vorkommt
 *
 * Weil keiner vorkommen darf. Im Portal gibt es genau einen Weg zu einem
 * Modell: `AiGateway.invoke` aus `src/application/repositories.ts`, und
 * dahinter steht die Serverfunktion `supabase/functions/ai-gateway/`
 * mit Adressprüfung, Rollenprüfung und Tresor. Ein Aufruf aus dem
 * Browser hiesse: Schlüssel im Browser. Die alte Textwerkstatt der
 * Lehrkraftdatei tut genau das über `geminiAssistant` — deshalb wurde
 * sie nicht übernommen.
 *
 * Diese Datei baut deshalb nur **Anfrage und Antwort**. Gerufen wird in
 * `TextwerkstattPage`, weil `src/integrationsgrenze.test.ts` dieser
 * Ordnung jeden Zugriff auf `application` und `cloud` verbietet.
 *
 * ## Warum der Name feststeht und nicht erfunden ist
 *
 * `teacher-text/suggestions` ist die Fähigkeit, die Codex serverseitig
 * vorbereitet hat. Ein zweiter, eigener Name hiesse zwei Verträge für
 * dieselbe Sache — und der zweite wäre der, den der Server nicht kennt.
 * Was hier steht, ist deshalb bewusst schmal: der Name, eine Nutzlast
 * aus Textausschnitten und ein Leser, der mehr verträgt, als er
 * verlangt.
 *
 * ## Was den Server verlässt
 *
 * Je Wort: die Textform, die Lernform-Vermutung, die Wortart aus dem
 * Satz und **der eine Quellsatz**. Nicht der ganze Text, nicht der
 * Titel, keine Lerngruppe, keine Person. Mehr braucht eine Übersetzung
 * im Kontext nicht, und was nicht gesendet wird, kann nicht
 * gespeichert werden.
 */

/** Die serverseitig abgesicherte Fähigkeit. Nicht hier erfunden. */
export const TEXTVORSCHLAEGE = 'teacher-text/suggestions';

/**
 * Wie viele Wörter höchstens auf einmal hinausgehen.
 *
 * Nicht als Schutz vor dem Modell, sondern als Schutz vor dem
 * Unbedachten: Ein Text mit 67 Kandidaten wäre ein Rundumschlag, bei
 * dem niemand mehr weiss, was warum hinausging. Alle anderen Kandidaten
 * bleiben von Hand erreichbar — die Grenze beschneidet die KI, nicht
 * die Lehrkraft.
 */
export const GRENZE_KANDIDATEN = 25;

/** Ein Wort, wie es in der Anfrage steht. */
export interface Anfragekandidat {
  readonly id: string;
  /** Die Lernform, wenn gebaut — sonst die Form aus dem Satz. */
  readonly english: string;
  /** Genau der eine Satz aus dem Quelltext. */
  readonly sourceSentence: string;
  readonly partOfSpeech?: PartOfSpeech;
}

export interface Textvorschlagsanfrage {
  readonly kandidaten: readonly Anfragekandidat[];
}

/**
 * Welche Wörter gefragt werden — und welche ausdrücklich nicht.
 *
 * Gefragt wird nur nach **aufgenommenen** Wörtern ohne Bedeutung. Das
 * ist keine Sparsamkeit um ihrer selbst willen: Ein Vorschlag zu einem
 * Wort, das die Lehrkraft gar nicht haben wollte, ist Arbeit, die
 * niemand bestellt hat, und ein Vorschlag zu einem Feld, in dem schon
 * etwas steht, hätte nirgends hindurfen (siehe `textzustand.ts`).
 */
export function zuFragende(zeilen: readonly Kandidatenzeile[]): readonly Kandidatenzeile[] {
  return zeilen
    .filter((zeile) => zeile.aufgenommen && zeile.german.trim().length === 0 && !zeile.beruehrt)
    .slice(0, GRENZE_KANDIDATEN);
}

export function baueAnfrage(zeilen: readonly Kandidatenzeile[]): Textvorschlagsanfrage {
  return {
    kandidaten: zuFragende(zeilen).map((zeile) => ({
      id: zeile.kandidat.id,
      english: zeile.learningForm.trim() || candidateLiteral(zeile.kandidat),
      sourceSentence: zeile.kandidat.sourceSentence,
      ...(zeile.partOfSpeech ? { partOfSpeech: zeile.partOfSpeech } : {}),
    })),
  };
}

function text(wert: unknown): string {
  return typeof wert === 'string' ? wert.trim() : '';
}

function wortart(wert: unknown): PartOfSpeech | undefined {
  return typeof wert === 'string' && (PART_OF_SPEECH as readonly string[]).includes(wert)
    ? (wert as PartOfSpeech)
    : undefined;
}

/**
 * Die Antwort auslegen — grosszügig im Lesen, streng im Übernehmen.
 *
 * Grosszügig: Unbekannte Felder stören nicht, und ob die Liste unter
 * `vorschlaege` oder `suggestions` steht, ist dem Leser gleich. Ein
 * Vertrag, der an einem Feldnamen zerbricht, zwingt später zu einem
 * zweiten Vertrag.
 *
 * Streng: Was keine Kennung und keinen Text hat, fällt heraus. Ob die
 * Kennung **aus diesem Text** stammt, entscheidet nicht diese Datei,
 * sondern `textZug` — die Stelle, die den Text kennt.
 */
export function leseAntwort(roh: unknown): readonly Uebersetzungsvorschlag[] {
  const rumpf = (roh ?? {}) as Record<string, unknown>;
  const liste = [rumpf['vorschlaege'], rumpf['suggestions'], roh].find(Array.isArray);
  if (!Array.isArray(liste)) return [];

  return liste.flatMap((eintrag): Uebersetzungsvorschlag[] => {
    const zeile = (eintrag ?? {}) as Record<string, unknown>;
    const kandidatId = text(zeile['id']) || text(zeile['kandidatId']) || text(zeile['candidateId']);
    const german = text(zeile['german']) || text(zeile['deutsch']);
    if (!kandidatId || !german) return [];

    const art = wortart(zeile['partOfSpeech']);
    const form = text(zeile['learningForm']) || text(zeile['lernform']);
    return [
      {
        kandidatId,
        german,
        ...(art ? { partOfSpeech: art } : {}),
        ...(form ? { learningForm: form } : {}),
      },
    ];
  });
}

/**
 * Der Satz über dem Knopf — ehrlich, nicht beruhigend.
 *
 * „Der Text verlässt nie den Browser" wäre falsch, sobald jemand diesen
 * Knopf drückt. Richtig ist: ohne Klick kein Aufruf, und mit Klick geht
 * genau das hinaus, was hier steht.
 */
export function datenschutzsatz(anzahl: number): string {
  if (anzahl === 0) {
    return 'Nimm zuerst Wörter auf. Erst dann können Übersetzungsvorschläge geholt werden.';
  }
  const woerter = anzahl === 1 ? 'ein aufgenommenes Wort' : `${anzahl} aufgenommene Wörter`;
  return (
    `Dabei gehen ${woerter} mit je einem Satz aus deinem Text an die KI-Verbindung, ` +
    'die du in den Einstellungen hinterlegt hast. Der übrige Text, der Name des Pakets und ' +
    'deine Lerngruppen bleiben hier. Ohne diesen Klick wird nichts gesendet.'
  );
}
