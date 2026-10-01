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
    E13, Übergangsphase: Die Seite liegt noch unter `/material`, also zeigt
    `#/pakete` dorthin. Gebaut und geprüft in 5B.2c′ — vorher stand hier
    `geplant`, weil ein Zustand eine Aussage über die Wirklichkeit ist.

    Später dreht sich die Richtung um: `#/pakete` wird die echte Route,
    `#/material` die dauerhafte Weiterleitung. Dann verschwindet diese Zeile
    zugunsten eines schlichten `vorhanden`.
  */
  '#/pakete': { zustand: 'weiterleitung', route: '/pakete', leitetAuf: '/material' },

  '#/start': { zustand: 'geplant', block: '5B.3' },
  '#/heute': { zustand: 'geplant', block: '5B.4' },
  '#/ueben': { zustand: 'geplant', block: '5B.5' },
  '#/fortschritt': { zustand: 'geplant', block: '5B.6' },
  /*
    Seit 5B.7 eine echte Route — im selben Commit, in dem sie Inhalt bekam.
    Zugänglich für jede Lehrkraft; der Adminteil ist ein Abschnitt der Seite
    und nicht ihre Voraussetzung.
  */
  '#/einstellungen': { zustand: 'vorhanden', route: '/einstellungen' },
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
 * Welches Navigationsziel zu dieser Adresse gehört — je Größe verschieden.
 *
 * ## Warum das hier steht und nicht in der Hülle
 *
 * Weil es Routingwissen ist. Dass `/verwaltung` unter „Einstellungen" hängt,
 * weiß man nur, wenn man die Routen und E23 kennt; die Hülle vergleicht
 * Zeichenketten.
 *
 * ## Warum je Größe verschieden
 *
 * Auf `/ki` ist am Schreibtisch „KI-Zugang" aktiv — dort ist es ein eigenes
 * Ziel. Auf dem Telefon gibt es dieses Ziel nicht; der KI-Zugang liegt dort
 * innerhalb der Einstellungen. Ein gemeinsamer Wert ließe die untere Leiste
 * unmarkiert, und eine Navigation ohne Markierung sagt „du bist nirgends".
 */
const ZUORDNUNG: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/kurse(\/|$)/, '#/kurse'],
  /* `/material` ist die Route, `#/pakete` das Ziel (E13, Übergangsphase). */
  [/^\/(material|pakete)(\/|$)/, '#/pakete'],
  [/^\/ki(\/|$)/, '#/ki'],
  /*
    Die Verwaltung ist kein Navigationsziel. Aktiv ist der Ort, über den man
    hinkommt — die Einstellungen.
  */
  [/^\/(einstellungen|verwaltung)(\/|$)/, '#/einstellungen'],
  [/^\/lernen(\/|$)/, '#/lernen'],
];

export function aktivesZiel(pfad: string, groesse: Groesse): string | undefined {
  const treffer = ZUORDNUNG.find(([muster]) => muster.test(pfad))?.[1];
  if (!treffer) return undefined;

  /*
    Nur markieren, was auf dieser Größe überhaupt steht. `#/ki` gibt es unten
    nicht — dort rutscht die Markierung auf die Einstellungen, in denen der
    KI-Zugang liegt. Dass diese Ersetzung genau einen Schritt weit geht und
    nicht beliebig, ist Absicht: Eine Kette von Ersatzzielen wäre eine zweite
    Informationsarchitektur.
  */
  const sichtbar = new Set(sichtbareZiele('lehrkraft', groesse).map((z) => z.pfad));
  for (const ziel of sichtbareZiele('lernende', groesse)) sichtbar.add(ziel.pfad);
  if (sichtbar.has(treffer)) return treffer;
  if (treffer === '#/ki' && sichtbar.has('#/einstellungen')) return '#/einstellungen';
  return undefined;
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
