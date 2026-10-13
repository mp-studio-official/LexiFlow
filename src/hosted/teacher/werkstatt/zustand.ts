import type { VocabEntry } from '../../../domain/schema';
import type { ColumnMapping } from '../../../import/columnDetect';
import {
  type DraftRow,
  type DraftSummary,
  blocksSaving,
  draftsToEntries,
  summarize,
  validateDrafts,
} from '../../../import/draft';
import {
  type Erkennung,
  type Importoptionen,
  type Quelle,
  importiereDatei,
  importiereText,
  verschmelzeNeuerkennung,
} from '../../../import/universal';

/**
 * Der Ablauf der Werkstatt — als Zustandsautomat, nicht als useState-Knäuel.
 *
 * ## Warum getrennt von der Oberfläche
 *
 * „Was darf jetzt passieren" ist eine fachliche Frage, keine
 * Darstellungsfrage. Hier lässt sie sich beantworten, ohne ein React zu
 * starten. Die Oberfläche darüber hat dann keine eigene Meinung mehr, die
 * von dieser abweichen könnte — und genau solche zweiten Meinungen sind
 * der Grund, warum ein Assistent irgendwann in einem Zustand steht, den
 * niemand vorgesehen hat.
 *
 * ## Warum der erzeugte Stand mitgeführt wird
 *
 * `erzeugt` ist nicht dasselbe wie `zeilen`: Es ist das, was die letzte
 * Erkennung ausgespuckt hat, bevor jemand von Hand hineingeschrieben hat.
 * Ohne diesen Maßstab lässt sich bei einer neuen Erkennung nicht sagen,
 * was Handarbeit war — und dann ist jede Umstellung der Spalten ein stiller
 * Verlust aller Korrekturen.
 */

export type Werkstattschritt = 'quelle' | 'liest' | 'vorschau' | 'fehler';

/**
 * Der Rückfall, wenn Fließtext doch in den Listenweg gerät.
 *
 * `WerkstattPage` fängt ihn vorher ab und schickt ihn in die
 * Textwerkstatt. Diese Meldung bleibt trotzdem stehen: Ein Listenweg,
 * der aus Prosa klaglos Zeilen baut, war der Fehler, den die Erkennung
 * gerade abgestellt hat — und ein Automat, der sich darauf verlässt,
 * dass die Oberfläche mitdenkt, ist kein Automat.
 */
const FLIESSTEXT_MELDUNG =
  'Das ist ein zusammenhängender Text und keine Vokabelliste. Er gehört in die Textwerkstatt.';

export interface Werkstattstand {
  readonly schritt: Werkstattschritt;
  readonly titel: string;
  readonly zeilen: readonly DraftRow[];
  /** Was die letzte Erkennung erzeugt hat — der Maßstab für die Verschmelzung. */
  readonly erzeugt: readonly DraftRow[];
  readonly erkennung?: Erkennung;
  readonly zuordnung?: ColumnMapping;
  readonly befund?: DraftSummary;
  /** Zeilen, die zu keiner Vokabel gehörten. Sie gehen nicht verloren. */
  readonly unzugeordnet: readonly string[];
  /** Die Quelle, damit eine neue Erkennung dieselbe Sache noch einmal liest. */
  readonly quelle?: Quelle;
  /** Mit welchen Einstellungen zuletzt gelesen wurde. */
  readonly optionen: Importoptionen;
  /** Der Name der Datei, während sie gelesen wird. */
  readonly dateiname?: string;
  /** Bei `fehler`: der Satz, der dasteht. */
  readonly meldung?: string;
}

export type Werkstattzug =
  | { readonly art: 'text-eingefuegt'; readonly text: string }
  /** Die Oberfläche hat eine Datei bekommen und liest sie gerade. */
  | { readonly art: 'datei-gewaehlt'; readonly name: string }
  | { readonly art: 'datei-gelesen'; readonly quelle: Quelle }
  /** Das Lesen ist gescheitert, bevor der Inhalt da war. */
  | { readonly art: 'lesen-gescheitert'; readonly grund: string }
  | { readonly art: 'zeilen-geaendert'; readonly zeilen: readonly DraftRow[] }
  | { readonly art: 'neu-erkannt'; readonly optionen: Importoptionen }
  | { readonly art: 'titel-geaendert'; readonly titel: string }
  | { readonly art: 'verworfen' };

/**
 * Denselben Stand ohne Fehlermeldung.
 *
 * `meldung: undefined` genügt dafür nicht: `exactOptionalPropertyTypes`
 * unterscheidet „Feld fehlt" von „Feld ist undefined", und ein Stand, der
 * ein leeres `meldung` **hat**, ist etwas anderes als einer ohne. Der
 * Unterschied ist hier genau der zwischen „kein Fehler" und „ein Fehler
 * ohne Text".
 */
function ohneMeldung(stand: Werkstattstand): Werkstattstand {
  const { meldung: _verworfen, ...rest } = stand;
  return rest;
}

/** Derselbe Stand ohne Dateinamen — aus demselben Grund wie `ohneMeldung`. */
function ohneDateinamen(stand: Werkstattstand): Werkstattstand {
  const { dateiname: _verworfen, ...rest } = stand;
  return rest;
}

export function anfang(): Werkstattstand {
  return { schritt: 'quelle', titel: '', zeilen: [], erzeugt: [], unzugeordnet: [], optionen: {} };
}

/** Ein geprüfter Paketentwurf — das Ergebnis der Werkstatt. */
export interface GepruefterEntwurf {
  readonly titel: string;
  readonly eintraege: readonly VocabEntry[];
}

function ausErgebnis(
  vorher: Werkstattstand,
  ergebnis: ReturnType<typeof importiereText>,
  quelle: Quelle,
  optionen: Importoptionen,
): Werkstattstand {
  if (ergebnis.art === 'fliesstext') {
    /*
      Noch kein eigener Schritt — der kommt mit der Textwerkstatt.

      Bis dahin steht hier ein Satz, der stimmt. Die Alternative wäre, den
      Text durch den Listenweg zu schicken; genau das war der Fehler, den
      die Erkennung gerade abgestellt hat.
    */
    return {
      ...vorher,
      schritt: 'fehler',
      zeilen: [],
      erzeugt: [],
      meldung: FLIESSTEXT_MELDUNG,
    };
  }

  if (ergebnis.art !== 'gelesen') {
    return {
      ...vorher,
      schritt: 'fehler',
      zeilen: [],
      erzeugt: [],
      meldung: ergebnis.grund,
    };
  }
  return {
    ...ohneMeldung(vorher),
    schritt: 'vorschau',
    zeilen: ergebnis.zeilen,
    erzeugt: ergebnis.zeilen,
    erkennung: ergebnis.erkennung,
    ...(ergebnis.zuordnung ? { zuordnung: ergebnis.zuordnung } : {}),
    befund: ergebnis.befund,
    unzugeordnet: ergebnis.unzugeordnet,
    quelle,
    optionen,
  };
}

export function werkstattZug(stand: Werkstattstand, zug: Werkstattzug): Werkstattstand {
  switch (zug.art) {
    case 'text-eingefuegt': {
      const quelle: Quelle = { art: 'text', text: zug.text };
      return ausErgebnis(
        ohneDateinamen(stand),
        importiereText(zug.text, stand.optionen),
        quelle,
        stand.optionen,
      );
    }

    case 'datei-gewaehlt':
      /*
        Ein eigener Schritt, obwohl er nichts rechnet: Eine Datei von
        zwei Megabyte braucht spürbar Zeit, und ohne diesen Zustand steht
        die Oberfläche währenddessen unverändert da — als hätte der Klick
        nicht gewirkt.
      */
      return { ...ohneMeldung(stand), schritt: 'liest', dateiname: zug.name };

    case 'datei-gelesen':
      return ausErgebnis(stand, importiereDatei(zug.quelle, stand.optionen), zug.quelle, stand.optionen);

    case 'lesen-gescheitert':
      return { ...stand, schritt: 'fehler', zeilen: [], erzeugt: [], meldung: zug.grund };

    case 'zeilen-geaendert': {
      const zeilen = validateDrafts([...zug.zeilen]);
      return { ...stand, zeilen, befund: summarize(zeilen) };
    }

    case 'neu-erkannt': {
      if (!stand.quelle) return stand;
      const optionen = { ...stand.optionen, ...zug.optionen };
      const ergebnis =
        stand.quelle.art === 'text'
          ? importiereText(stand.quelle.text, optionen)
          : importiereDatei(stand.quelle, optionen);
      if (ergebnis.art !== 'gelesen') {
        return {
          ...stand,
          schritt: 'fehler',
          meldung: ergebnis.art === 'fliesstext' ? FLIESSTEXT_MELDUNG : ergebnis.grund,
        };
      }
      /*
        Der Kern der Zusage „Lehrkrafteingaben werden nie still
        überschrieben": Nicht die neuen Zeilen gewinnen, sondern der
        Dreiwegvergleich entscheidet Feld für Feld.
      */
      const zeilen = verschmelzeNeuerkennung({
        vorherErzeugt: stand.erzeugt,
        bearbeitet: stand.zeilen,
        neuErzeugt: ergebnis.zeilen,
      });
      return {
        ...ohneMeldung(stand),
        schritt: 'vorschau',
        zeilen,
        erzeugt: ergebnis.zeilen,
        erkennung: ergebnis.erkennung,
        ...(ergebnis.zuordnung ? { zuordnung: ergebnis.zuordnung } : {}),
        befund: summarize(zeilen),
        unzugeordnet: ergebnis.unzugeordnet,
        optionen,
      };
    }

    case 'titel-geaendert':
      return { ...stand, titel: zug.titel };

    case 'verworfen':
      /*
        Vollständig zurück auf Anfang, nicht nur `schritt` umgestellt. Ein
        halb geleerter Stand ist die Sorte Zustand, in der später eine
        Vorschau von gestern unter einer neuen Quelle auftaucht.
      */
      return anfang();
  }
}

/** Ist dieser Stand als Paketentwurf abgabefähig? */
export function istFertig(stand: Werkstattstand): boolean {
  if (stand.schritt !== 'vorschau') return false;
  if (stand.titel.trim().length === 0) return false;
  const ausgewaehlt = stand.zeilen.filter((zeile) => zeile.include);
  if (ausgewaehlt.length === 0) return false;
  return !ausgewaehlt.some((zeile) => blocksSaving(zeile));
}

/**
 * Der geprüfte Entwurf — oder nichts.
 *
 * Kein „fast fertiges" Ergebnis: Wer hier etwas bekommt, bekommt etwas
 * Vollständiges. Die Oberfläche fragt vorher `istFertig` und zeigt, was
 * fehlt; ein halbes Paket wandert nicht weiter.
 */
export function fertigerEntwurf(stand: Werkstattstand): GepruefterEntwurf | undefined {
  if (!istFertig(stand)) return undefined;
  return {
    titel: stand.titel.trim(),
    eintraege: draftsToEntries(stand.zeilen, 'import'),
  };
}
