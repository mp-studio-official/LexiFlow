import { type Groesse, type Profil, type Ziel, zieleAuf } from '../ui/navigation';

/**
 * Welche Navigationsziele das Portal **heute** zeigen darf.
 *
 * ## Warum dieser Zustand hier steht und nicht in `src/ui/navigation.ts`
 *
 * Weil „gibt es diese Route schon?" eine Frage über das Portal ist. Die
 * Matrix in `src/ui/` beschreibt, wie Navigation aussieht; sie liegt in einem
 * Verzeichnis, dessen Dateien auch in der portablen Lerndatei landen dürfen,
 * und die kennt weder `#/kurse` noch einen Router mit diesen Adressen.
 *
 * ## Warum es diesen Zustand überhaupt gibt
 *
 * E23 beschreibt den **Endzustand** am Ende von 5B: fünf Ziele am
 * Schreibtisch, vier auf dem Telefon. Von den neun Zielen existieren heute
 * drei als Route. Eine Navigation, die alle neun zeigt, führt überwiegend ins
 * Leere — und zwar unsichtbar: Die Wildcard in `HostedApp.tsx` leitet alles
 * Unbekannte still auf `/` um. Ein totes Ziel sähe nicht kaputt aus, sondern
 * wie ein Sprung zur Startseite.
 *
 * Also wird gezeigt, was auflöst. Der Rest wartet — nicht ausgegraut, nicht
 * mit „kommt bald" beschriftet, sondern **gar nicht gerendert**: nicht
 * sichtbar, nicht fokussierbar, nicht im Accessibility-Baum.
 *
 * ## Die vier Regeln, die das zu mehr als einer Absichtserklärung machen
 *
 * 1. Ein Ziel wird **nur in demselben Commit** auf `vorhanden` gesetzt, in
 *    dem seine Route und deren Inhalt entstehen.
 * 2. `weiterleitung` gilt erst, wenn die Weiterleitung implementiert **und**
 *    am echten Router geprüft ist — aufgerufen, Ziel erreicht.
 * 3. Jedes gerenderte Ziel löst tatsächlich auf. Nachgewiesen gegen den
 *    Router, nicht per Textsuche: `navigationsziele.test.tsx`.
 * 4. Am Ende von 5B bestätigt eine eigene Abnahme, dass kein Ziel mehr
 *    `geplant` ist.
 */

export type Umsetzungszustand = 'vorhanden' | 'weiterleitung' | 'geplant';

export interface Umsetzung {
  readonly zustand: Umsetzungszustand;
  /**
   * Die Adresse, unter der die Route im Router steht — ohne `#`.
   *
   * Bei `weiterleitung` ist das **nicht** dasselbe wie der Pfad des Ziels:
   * `#/pakete` steht im Router noch nicht, `#/material` schon.
   */
  readonly route?: string;
  /** Wohin eine Weiterleitung führt. Nur bei `weiterleitung` gesetzt. */
  readonly leitetAuf?: string;
  /** Der Block, der dieses Ziel scharf schaltet. Dokumentation, kein Code. */
  readonly block?: string;
}

/**
 * Der Stand vom 01.10.2026.
 *
 * Jede Zeile hier ist eine Aussage über die Wirklichkeit, keine Absicht. Wer
 * einen Zustand hochsetzt, ohne die Route zu bauen, bekommt das von
 * `navigationsziele.test.tsx` gesagt — dort wird jedes gerenderte Ziel am
 * echten Router aufgerufen.
 */
const UMSETZUNG: Readonly<Record<string, Umsetzung>> = {
  '#/kurse': { zustand: 'vorhanden', route: '/kurse' },
  '#/ki': { zustand: 'vorhanden', route: '/ki' },
  '#/lernen': { zustand: 'vorhanden', route: '/lernen' },

  /*
    E13: `#/material` heißt künftig `#/pakete`, mit dauerhafter Weiterleitung.
    Die Weiterleitung existiert noch nicht — deshalb steht hier `geplant` und
    nicht `weiterleitung`. Erst der Block, der sie baut und prüft, darf das
    ändern (5B.2c′).
  */
  '#/pakete': { zustand: 'geplant', block: '5B.2c′' },

  '#/start': { zustand: 'geplant', block: '5B.3' },
  '#/heute': { zustand: 'geplant', block: '5B.4' },
  '#/ueben': { zustand: 'geplant', block: '5B.5' },
  '#/fortschritt': { zustand: 'geplant', block: '5B.6' },
  '#/einstellungen': { zustand: 'geplant', block: '5B.7' },
};

/**
 * Die Menge der bekannten Ziele — genau die aus E23, nicht mehr.
 *
 * Gebildet aus der Matrix in `src/ui/navigation.ts` und nicht aus den
 * Schlüsseln von `UMSETZUNG`: Sonst würde ein Tippfehler **hier** sich selbst
 * zum bekannten Ziel erklären.
 */
const BEKANNT: ReadonlySet<string> = new Set(
  (['lehrkraft', 'lernende'] as const).flatMap((profil) =>
    zieleAuf(profil, 'schreibtisch').map((ziel) => ziel.pfad),
  ),
);

/** Ob dieser Pfad überhaupt ein Navigationsziel aus E23 ist. */
export function istBekanntesZiel(pfad: string): boolean {
  return BEKANNT.has(pfad);
}

/**
 * Der Umsetzungszustand eines **bekannten** Ziels, sonst `undefined`.
 *
 * ## Warum ein unbekanntes Ziel nicht „geplant" ist
 *
 * Weil `geplant` eine Aussage ist: „Dieses Ziel aus E23 gibt es noch nicht,
 * und Block X baut es." Ein Pfad, den niemand entschieden hat, trägt diese
 * Aussage nicht — er ist ein Fehler.
 *
 * Der Unterschied ist nicht theoretisch. Hieße `#/kures` stillschweigend
 * `geplant`, dann verschwände bei einem Schreibfehler in der Matrix
 * **kommentarlos ein Navigationseintrag**: Die Prüfungen blieben grün, die
 * Hülle rendert ihn nicht, und niemand erführe, warum „Kurse" eines Tages
 * fehlt. Genau dieselbe Mechanik ließe `#/verwaltung` als „geplantes Ziel"
 * durchgehen, obwohl sie ausdrücklich keines ist.
 */
export function umsetzungVon(pfad: string): Umsetzung | undefined {
  if (!BEKANNT.has(pfad)) return undefined;
  /*
    Ein bekanntes Ziel ohne Eintrag ist eine Lücke in dieser Datei, kein
    Zustand. Es als `geplant` auszugeben wäre bequem und falsch: Die
    Entscheidung, in welchem Block es scharf geschaltet wird, ist dann noch
    nicht getroffen, und das soll auffallen.
  */
  return UMSETZUNG[pfad];
}

/**
 * Ob ein Ziel heute gerendert werden darf.
 *
 * Für Unbekanntes `false` — eine Hülle, die einen Tippfehler übergeben
 * bekommt, soll nichts rendern und nicht abstürzen. Dass der Tippfehler
 * **auffällt**, ist Aufgabe der Prüfungen, nicht dieser Funktion.
 */
export function istFreigeschaltet(pfad: string): boolean {
  const zustand = umsetzungVon(pfad)?.zustand;
  return zustand === 'vorhanden' || zustand === 'weiterleitung';
}

/**
 * Die Ziele, die das Portal heute zeigt.
 *
 * Das ist die Teilmenge, die die Hülle bekommt — sie entscheidet nichts
 * davon selbst und kennt den Umsetzungszustand nicht einmal.
 */
export function sichtbareZiele(profil: Profil, groesse: Groesse): readonly Ziel[] {
  return zieleAuf(profil, groesse).filter((ziel) => istFreigeschaltet(ziel.pfad));
}

/**
 * Alle Ziele mit ihrem Zustand — für die Prüfungen und für die Endabnahme.
 *
 * `umsetzung` kann `undefined` sein: Dann ist ein Ziel aus E23 hier nicht
 * eingetragen. Das ist eine Lücke, und `navigationsziele.test.tsx` macht sie
 * rot.
 */
export function zielmatrix(): ReadonlyArray<{
  ziel: Ziel;
  umsetzung: Umsetzung | undefined;
  profil: Profil;
}> {
  const zeilen: Array<{ ziel: Ziel; umsetzung: Umsetzung | undefined; profil: Profil }> = [];
  for (const profil of ['lehrkraft', 'lernende'] as const) {
    for (const ziel of zieleAuf(profil, 'schreibtisch')) {
      zeilen.push({ ziel, umsetzung: umsetzungVon(ziel.pfad), profil });
    }
  }
  return zeilen;
}
