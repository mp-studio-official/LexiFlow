import type { ReactNode } from 'react';

import { NavigationsZeichen } from './navigationsZeichen';
import type { Zeichen } from './navigation';
import './huelle.css';

/**
 * Die gemeinsame Hülle — Icon-Leiste am Schreibtisch, untere Leiste am Telefon.
 *
 * ## Was sie weiß
 *
 * Was ihr übergeben wird. Mehr nicht.
 *
 * Sie kennt keine Rolle, keine Anmeldung, keine Berechtigung und keinen
 * Umsetzungszustand. Welche Ziele erscheinen, entscheidet das Portal
 * (`src/hosted/navigationsziele.ts`); welches aktiv ist, entscheidet der
 * Router dort. Hier kommt beides als Eigenschaft herein.
 *
 * Geplante Ziele erreichen diese Datei deshalb **gar nicht** — sie werden
 * nicht hier gefiltert, sondern draußen weggelassen. Der Unterschied ist der
 * ganze Punkt: Was nie ankommt, kann nicht versehentlich doch gerendert
 * werden.
 *
 * ## Zwei Navigationen, eine Wahrheit
 *
 * Beide stehen im DOM und werden per CSS umgeschaltet — nicht per JavaScript.
 * Ein Haltepunkt in JavaScript liegt beim ersten Bild daneben, beim Drucken,
 * und bei jemandem, der auf 200 % zoomt. Sichtbar ist immer genau eine; die
 * andere ist per `display: none` auch aus dem Accessibility-Baum entfernt,
 * damit eine Vorlesehilfe die Ziele nicht doppelt vorfindet.
 *
 * ## Der aktive Eintrag trägt drei Merkmale
 *
 * `aria-current="page"` für Hilfsmittel, eine gefüllte Fläche mit umgekehrtem
 * Kontrast für das Auge — und einen **Marker**, einen kurzen Balken an der
 * Kante. Der Marker ist der Grund, warum der Zustand auch ohne Farbe lesbar
 * bleibt: Er ist Geometrie. Dass `currentColor` benutzt wird und die Zeichen
 * keine eigene Farbe mitbringen, genügt dafür nicht — zwei Flächen, die sich
 * nur in der Farbe unterscheiden, sind in Graustufen zwei gleiche Flächen.
 *
 * ## Die Leiste klappt nicht auf
 *
 * 76 px, dauerhaft. Der Name erscheint als schwebender Tooltip, und zwar bei
 * Maus **und** bei Tastaturfokus — ein Tooltip, den nur ein Zeiger hervorholt,
 * ist für die Tastatur nicht vorhanden. Der Tooltip liegt absolut und
 * außerhalb des Flusses; die Leiste wird dadurch nicht breiter, und der
 * Inhalt daneben springt nicht.
 */

export interface Navigationsziel {
  /** Die Adresse, so wie sie in der Navigation steht. */
  readonly pfad: string;
  /** Der Name — vorgelesen und am Telefon sichtbar. */
  readonly label: string;
  /** Die Kurzfassung für die untere Leiste, falls der volle Name nicht passt. */
  readonly labelKurz?: string;
  readonly zeichen: Zeichen;
}

/**
 * Eine Handlung unten in der Leiste — Abmelden, und was später dazukommt.
 *
 * ## Warum kein `Navigationsziel`
 *
 * Weil Abmelden kein Ort ist. Als Navigationsziel gemodelt bräuchte es einen
 * `pfad`, und den gäbe es nicht — man müsste `#/abmelden` erfinden. Eine
 * erfundene Adresse ist kein Schönheitsfehler: Sie steht im `href`, landet
 * beim Rechtsklick in „Link in neuem Tab öffnen", im Verlauf und in den
 * Lesezeichen, und führt überall dorthin ins Leere.
 *
 * Also ein eigener Typ, und die Hülle rendert ihn als `button`. Ein Knopf
 * verändert keine Adresse, reagiert von sich aus auf Eingabe- **und**
 * Leertaste, und `aria-current` kommt bei ihm nicht in Frage: Eine Handlung
 * ist nie „die aktuelle Seite".
 *
 * Was beim Auslösen passiert, weiß die Hülle nicht. Sie kennt weder Sitzung
 * noch Abmeldung — sie ruft zurück.
 */
export interface Huellenaktion {
  readonly label: string;
  readonly zeichen: Zeichen;
  /** Was geschehen soll. Die Hülle entscheidet nichts darüber. */
  readonly ausloesen: () => void;
}

export interface HuelleProps {
  /**
   * Die Ziele der Icon-Leiste, in der Reihenfolge, in der sie stehen sollen.
   * Bereits gefiltert: Was hier steht, wird gerendert.
   */
  readonly zieleSchreibtisch: readonly Navigationsziel[];
  /** Die Ziele der unteren Leiste. Ebenfalls bereits gefiltert. */
  readonly zieleTelefon: readonly Navigationsziel[];
  /**
   * Das aktive Ziel der Icon-Leiste, oder `undefined`.
   *
   * ## Warum zwei Werte und nicht einer
   *
   * Weil derselbe Ort je nach Größe zu **verschiedenen** Zielen gehört. Auf
   * `/ki` ist am Schreibtisch „KI-Zugang" aktiv — dort ist es ein eigenes
   * Ziel. Auf dem Telefon gibt es dieses Ziel nicht; der KI-Zugang liegt dort
   * innerhalb der Einstellungen, also ist „Einstellungen" aktiv.
   *
   * Mit einem gemeinsamen Wert wäre auf dem Telefon **gar nichts** markiert:
   * `#/ki` kommt in der unteren Leiste nicht vor. Eine Navigation ohne
   * Markierung sagt „du bist nirgends".
   *
   * Beide Werte kommen von außen. Die Zuordnung ist Routing- und
   * Rollenwissen; die Hülle vergleicht nur Zeichenketten.
   */
  readonly aktiverPfadSchreibtisch?: string;
  /** Das aktive Ziel der unteren Leiste. Siehe oben — oft ein anderes. */
  readonly aktiverPfadTelefon?: string;
  /** Die Marke oben in der Leiste und im Telefonkopf. */
  readonly marke: ReactNode;
  /** Wohin die Marke führt. */
  readonly markePfad: string;
  /** Was im Kopfbereich rechts steht — etwa „Als Lernende ansehen". */
  readonly kopfAktionen?: ReactNode;
  /**
   * Echte Verweise unten in der Leiste — „Konto und Profil" etwa.
   *
   * Nur das, was wirklich eine Adresse hat. Handlungen gehören in
   * `fussAktionen`.
   */
  readonly fussZiele?: readonly Navigationsziel[];
  /** Handlungen unten in der Leiste — „Abmelden". Werden als Knopf gerendert. */
  readonly fussAktionen?: readonly Huellenaktion[];
  /** Was unter dem Inhalt steht. */
  readonly fusszeile?: ReactNode;
  readonly children: ReactNode;
}

function Eintrag({
  ziel,
  aktiv,
  art,
}: {
  ziel: Navigationsziel;
  aktiv: boolean;
  art: 'leiste' | 'unten';
}) {
  const gemeinsam = {
    href: ziel.pfad,
    'aria-current': aktiv ? ('page' as const) : undefined,
    'data-aktiv': aktiv ? 'ja' : undefined,
  };

  if (art === 'leiste') {
    return (
      <a className="huelle-leiste__ziel" aria-label={ziel.label} {...gemeinsam}>
        {/*
          Der Marker ist Geometrie und trägt den aktiven Zustand auch dann,
          wenn Farbe wegfällt. Er steht immer im Baum und wird per CSS
          sichtbar — nicht bedingt gerendert, damit die Breite sich nicht
          ändert.
        */}
        <span className="huelle-leiste__marker" aria-hidden="true" />
        <NavigationsZeichen zeichen={ziel.zeichen} />
        <span className="huelle-leiste__tipp" aria-hidden="true">
          {ziel.label}
        </span>
      </a>
    );
  }

  return (
    <a className="huelle-unten__ziel" aria-label={ziel.label} {...gemeinsam}>
      <span className="huelle-unten__marker" aria-hidden="true" />
      <NavigationsZeichen zeichen={ziel.zeichen} groesse={21} />
      {/* Am Telefon steht der Name da — ohne Zeigen, ohne Fokus, immer. */}
      <span className="huelle-unten__label">{ziel.labelKurz ?? ziel.label}</span>
    </a>
  );
}

function Aktion({ aktion }: { aktion: Huellenaktion }) {
  /*
    `type="button"` ist nicht Zierde: Ohne sie ist ein Knopf innerhalb eines
    Formulars ein Absendeknopf. Und `aria-current` fehlt hier bewusst — eine
    Handlung ist keine Seite.
  */
  return (
    <button
      type="button"
      className="huelle-leiste__ziel huelle-leiste__aktion"
      aria-label={aktion.label}
      onClick={aktion.ausloesen}
    >
      <span className="huelle-leiste__marker" aria-hidden="true" />
      <NavigationsZeichen zeichen={aktion.zeichen} />
      <span className="huelle-leiste__tipp" aria-hidden="true">
        {aktion.label}
      </span>
    </button>
  );
}

export function Huelle({
  zieleSchreibtisch,
  zieleTelefon,
  aktiverPfadSchreibtisch,
  aktiverPfadTelefon,
  marke,
  markePfad,
  kopfAktionen,
  fussZiele = [],
  fussAktionen = [],
  fusszeile,
  children,
}: HuelleProps) {
  /*
    Zwei getrennte Vergleiche. Ein gemeinsamer wäre kürzer und falsch: Er
    müsste raten, welche Größe gerade gemeint ist — und die Hülle rendert
    beide gleichzeitig.
  */
  const aktivAufLeiste = (pfad: string): boolean => pfad === aktiverPfadSchreibtisch;
  const aktivUnten = (pfad: string): boolean => pfad === aktiverPfadTelefon;

  return (
    <div className="huelle">
      <a className="huelle__sprung" href="#inhalt">
        Zum Inhalt springen
      </a>

      {/* ------------------------------------------- Schreibtisch: Leiste */}
      <div className="huelle-leiste glas" data-groesse="schreibtisch">
        <a className="huelle-leiste__marke" href={markePfad} aria-label="LexiFlow – Startseite">
          {marke}
        </a>

        <nav className="huelle-leiste__nav" aria-label="Hauptnavigation">
          {zieleSchreibtisch.map((ziel) => (
            <Eintrag key={ziel.pfad} ziel={ziel} aktiv={aktivAufLeiste(ziel.pfad)} art="leiste" />
          ))}
        </nav>

        {fussZiele.length > 0 || fussAktionen.length > 0 ? (
          <div className="huelle-leiste__fuss">
            {fussZiele.map((ziel) => (
              <Eintrag key={ziel.pfad} ziel={ziel} aktiv={aktivAufLeiste(ziel.pfad)} art="leiste" />
            ))}
            {fussAktionen.map((aktion) => (
              <Aktion key={aktion.label} aktion={aktion} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="huelle__arbeit">
        {/*
          Der Kopfbereich trägt die Marke am Telefon und die Aktionen auf
          beiden Größen. „Als Lernende ansehen" steht hier und nicht in der
          Navigation: Es ist eine Handlung, kein Ort.
        */}
        <header className="huelle__kopf">
          <a className="huelle__kopfmarke" href={markePfad} aria-label="LexiFlow – Startseite">
            {marke}
          </a>
          {kopfAktionen ? <div className="huelle__kopfaktionen">{kopfAktionen}</div> : null}
        </header>

        <main className="huelle__inhalt" id="inhalt" tabIndex={-1}>
          {children}
        </main>

        {fusszeile ? <footer className="huelle__fusszeile">{fusszeile}</footer> : null}
      </div>

      {/* ------------------------------------------------ Telefon: unten */}
      <nav className="huelle-unten glas" aria-label="Hauptnavigation" data-groesse="telefon">
        {zieleTelefon.map((ziel) => (
          <Eintrag key={ziel.pfad} ziel={ziel} aktiv={aktivUnten(ziel.pfad)} art="unten" />
        ))}
      </nav>
    </div>
  );
}
