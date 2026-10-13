import { useEffect, useRef, useState } from 'react';
import { Fortschritt } from '../../../ui/bausteine';
import { Badge, VisuallyHidden } from '../../../ui/components';
import type { Auszeichnung, Rundenfortschritt, Tagesstand } from '../../../domain/motivation';
import { tageszielSatz } from '../../../domain/motivation';
import './motivation.css';

/**
 * Die Motivation an der Oberfläche — privat, ruhig, abschaltbar.
 *
 * ## Warum keine Zahl größer wird als die eigene
 *
 * Hier steht nichts, was eine andere Person betrifft. Keine Rangliste,
 * kein Klassenschnitt, kein „du bist auf Platz 4". Das ist nicht
 * Zurückhaltung, sondern dieselbe Zusage wie in der Datenbank: Lernstände
 * gehören der lernenden Person.
 *
 * ## Warum nichts die Antwort aufhält
 *
 * Eine Feier, die erst zu Ende laufen muss, bevor es weitergeht, ist keine
 * Belohnung, sondern eine Wartezeit mit Konfetti. Alle Elemente hier sind
 * **begleitend**: Sie erscheinen neben dem, was gerade passiert, und
 * blockieren keinen Knopf, kein Feld und keinen Übergang.
 *
 * ## Bewegung ist eine Zugabe, kein Träger
 *
 * Jede Animation steht unter `prefers-reduced-motion`. Wer sie abstellt,
 * verliert keine Information: Was die Bewegung zeigt, steht auch als Text
 * da — und für Hilfsmittel ohnehin nur als Text.
 */

export interface TageszielProps {
  readonly stand: Tagesstand;
}

/** Das Tagesziel: ein Balken, eine Zahl, ein Satz. */
export function Tagesziel({ stand }: TageszielProps) {
  return (
    <div className="motivation-tag" data-erfuellt={stand.erfuellt ? 'ja' : undefined}>
      {/*
        Ungekappt übergeben: `Fortschritt` begrenzt selbst auf [0, max].
        Hier stand erst ein zweites `Math.min` — und eine Mutationsprobe
        zeigte, dass es tot war: Entfernt man es, bleibt alles grün, weil
        der Baustein die Arbeit ohnehin macht. Zwei Begrenzungen
        übereinander sind nicht doppelt sicher, sondern eine Stelle mehr,
        an der die zweite später von der ersten abweicht.
      */}
      <Fortschritt
        wert={stand.geschafft}
        max={stand.ziel}
        label="Tagesziel"
        einheit="Aufgaben"
        ton={stand.erfuellt ? 'gut' : 'akzent'}
      />
      <p className="motivation-tag__satz">{tageszielSatz(stand)}</p>
    </div>
  );
}

export interface RundenbalkenProps {
  readonly stand: Rundenfortschritt;
}

/**
 * Wie weit die Runde ist.
 *
 * `aria-live` steht hier bewusst **nicht**: Eine Vorlesehilfe, die nach
 * jeder Antwort „8 von 20" dazwischenruft, übertönt die Rückmeldung, auf
 * die es ankommt — richtig oder falsch. Der Stand ist jederzeit abrufbar,
 * er drängt sich nur nicht auf.
 */
export function Rundenbalken({ stand }: RundenbalkenProps) {
  return (
    <div className="motivation-runde">
      <Fortschritt wert={stand.beantwortet} max={stand.gesamt} label="Runde" einheit="Aufgaben" />
    </div>
  );
}

export interface AbschlussfeierProps {
  /** Was gerade frisch erreicht wurde. Leer heißt: nichts zu feiern. */
  readonly frisch: readonly Auszeichnung[];
  /** Die abgeschlossene Runde. */
  readonly runde?: Rundenfortschritt;
  /** Weiterklicken — die Feier hält niemanden auf. */
  readonly aufWeiter?: () => void;
}

/**
 * Die kleine Feier am Rundenende.
 *
 * Sie steht **neben** dem Weg, nicht darin: kein modaler Dialog, kein
 * Fokusfang, kein Zeitschloss. Wer weiterklicken will, klickt weiter.
 */
export function Abschlussfeier({ frisch, runde, aufWeiter }: AbschlussfeierProps) {
  const [sichtbar, setSichtbar] = useState(false);
  const gemeldet = useRef(false);

  useEffect(() => {
    /*
      Erst im nächsten Bild sichtbar, damit der Übergang überhaupt
      stattfindet — und nur einmal, damit ein erneutes Zeichnen nicht
      jedes Mal neu feiert.
    */
    if (gemeldet.current) return;
    gemeldet.current = true;
    setSichtbar(true);
  }, []);

  const ansage =
    frisch.length > 0
      ? `Runde geschafft. Neu erreicht: ${frisch.map((eintrag) => eintrag.titel).join(', ')}.`
      : 'Runde geschafft.';

  return (
    <div className="motivation-feier" data-sichtbar={sichtbar ? 'ja' : undefined}>
      <p className="motivation-feier__kopf">Runde geschafft</p>
      {runde ? <p className="motivation-feier__zahl">{runde.label} beantwortet</p> : null}

      {frisch.length > 0 ? (
        <ul className="motivation-feier__neu">
          {frisch.map((eintrag) => (
            <li key={eintrag.schluessel}>
              <Badge tone="success">neu</Badge> {eintrag.titel}
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        Eine einzige Ansage für Hilfsmittel, statt einer Marke und einer
        Liste, die nacheinander vorgelesen werden.
      */}
      <VisuallyHidden>
        <p role="status">{ansage}</p>
      </VisuallyHidden>

      {aufWeiter ? (
        <button type="button" className="btn btn--primary" onClick={aufWeiter}>
          Weiter
        </button>
      ) : null}
    </div>
  );
}

export interface AuszeichnungslisteProps {
  readonly auszeichnungen: readonly Auszeichnung[];
}

/**
 * Alle Auszeichnungen, erreichte und offene.
 *
 * Die offenen sind nicht ausgegraut und nicht versteckt: Sie zeigen den
 * eigenen Stand auf dem Weg dorthin („3 von 10"). Eine verschlossene
 * Truhe, deren Inhalt man nicht kennt, ist eine Neugiermaschine; eine
 * Zahl, die man selbst gemacht hat, ist eine Auskunft.
 */
export function Auszeichnungsliste({ auszeichnungen }: AuszeichnungslisteProps) {
  return (
    <ul className="motivation-liste">
      {auszeichnungen.map((eintrag) => (
        <li
          key={eintrag.schluessel}
          className="motivation-liste__eintrag"
          data-erreicht={eintrag.erreicht ? 'ja' : undefined}
        >
          <p className="motivation-liste__titel">
            {eintrag.titel}
            {eintrag.erreicht ? (
              <>
                {' '}
                <Badge tone="success">erreicht</Badge>
              </>
            ) : null}
          </p>
          <p className="motivation-liste__satz">{eintrag.satz}</p>
          {eintrag.stand ? (
            <p className="motivation-liste__stand">
              {eintrag.stand.wert} von {eintrag.stand.ziel}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
