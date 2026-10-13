import { useState } from 'react';
import { Alert, Button } from '../../../ui/components';
import type { Fehlererklaerung, Formangabe, Hinweis } from '../../../domain/sprache';
import './sprache.css';

/**
 * Die sprachlichen Hilfen an der Oberfläche.
 *
 * Reine Komponenten über `src/domain/sprache`: Daten hinein, Bild heraus.
 * Kein Repository, keine Sitzung, kein Netz.
 */

export interface HinweistreppeProps {
  readonly hinweise: readonly Hinweis[];
  /**
   * Wie viele Stufen schon offen sind.
   *
   * **Nicht im Bauteil gehalten**, sondern außen: Wer eine Vokabel nach
   * drei Hinweisen löst, hat sie anders gelöst als jemand ohne — das
   * gehört in die Runde, nicht in eine Komponente, die beim nächsten
   * Zeichnen vergisst, was war.
   */
  readonly offen: number;
  readonly aufMehr: () => void;
}

/**
 * Hinweise, einer nach dem anderen.
 *
 * ## Warum kein „Lösung zeigen"
 *
 * Ein Knopf, der die Antwort zeigt, beendet die Aufgabe. Eine Stufe, die
 * nur die Wortart nennt, lässt sie offen — und wer danach weiterkommt, hat
 * die Vokabel selbst gefunden.
 */
export function Hinweistreppe({ hinweise, offen, aufMehr }: HinweistreppeProps) {
  if (hinweise.length === 0) return null;
  const sichtbar = hinweise.slice(0, Math.max(0, offen));
  const weitere = hinweise.length - sichtbar.length;

  return (
    <div className="sprache-hinweise">
      {sichtbar.length > 0 ? (
        <ol className="sprache-hinweise__liste">
          {sichtbar.map((hinweis) => (
            <li key={hinweis.stufe} data-art={hinweis.art}>
              {hinweis.text}
            </li>
          ))}
        </ol>
      ) : null}
      {weitere > 0 ? (
        <Button small variant="quiet" onClick={aufMehr}>
          {sichtbar.length === 0 ? 'Hinweis' : 'Noch ein Hinweis'}
          <span className="sprache-hinweise__rest"> ({weitere} übrig)</span>
        </Button>
      ) : null}
    </div>
  );
}

export interface FehlerkarteProps {
  readonly erklaerung: Fehlererklaerung;
}

/**
 * Warum die Antwort nicht gezählt hat.
 *
 * Der Ton ist Absicht: Es geht um die Antwort, nie um die Person. „Das ist
 * das englische Wort" ist eine Auskunft; „falsch" an derselben Stelle ist
 * eine Kränkung ohne Inhalt.
 */
export function Fehlerkarte({ erklaerung }: FehlerkarteProps) {
  const fastRichtig = erklaerung.art === 'schreibweise';
  return (
    <Alert tone={fastRichtig ? 'warning' : 'info'}>
      <p className="sprache-fehler__text">{erklaerung.text}</p>
      {erklaerung.richtig.length > 0 ? (
        <p className="sprache-fehler__richtig">
          {erklaerung.richtig.length === 1 ? 'Richtig wäre: ' : 'Richtig wären: '}
          <strong>{erklaerung.richtig.join(', ')}</strong>
        </p>
      ) : null}
    </Alert>
  );
}

export interface FormtafelProps {
  readonly angaben: readonly Formangabe[];
  readonly titel?: string;
}

/**
 * Zeitformen und Flexionen — als Beschreibungsliste.
 *
 * „Past Simple: went" ist ein Wert mit einer Bezeichnung. Als `dl` gelesen
 * bleibt dieser Zusammenhang erhalten; als zwei `span` nebeneinander ist
 * er ein Layout, das man sehen muss, um es zu verstehen.
 */
export function Formtafel({ angaben, titel = 'Formen' }: FormtafelProps) {
  if (angaben.length === 0) return null;
  return (
    <section className="sprache-formen">
      <h3 className="sprache-formen__titel">{titel}</h3>
      <dl className="sprache-formen__liste">
        {angaben.map((angabe) => (
          <div className="sprache-formen__paar" key={angabe.label}>
            <dt>{angabe.label}</dt>
            <dd>{angabe.wert}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export interface BeispielProps {
  readonly englisch: string;
  readonly deutsch?: string;
  /** Noch ein anderer Satz, falls es einen gibt. */
  readonly aufAnderen?: () => void;
}

/**
 * Ein Beispielsatz — mit der Möglichkeit, einen anderen zu sehen.
 *
 * Die Übersetzung steht erst auf Wunsch da. Wer sie sofort sieht, liest
 * den englischen Satz nicht mehr.
 */
export function Beispiel({ englisch, deutsch, aufAnderen }: BeispielProps) {
  const [zeigeDeutsch, setZeigeDeutsch] = useState(false);
  return (
    <figure className="sprache-beispiel">
      <blockquote className="sprache-beispiel__satz">{englisch}</blockquote>
      {deutsch ? (
        zeigeDeutsch ? (
          <figcaption className="sprache-beispiel__deutsch">{deutsch}</figcaption>
        ) : (
          <Button small variant="quiet" onClick={() => setZeigeDeutsch(true)}>
            Übersetzung zeigen
          </Button>
        )
      ) : null}
      {aufAnderen ? (
        <Button small variant="quiet" onClick={aufAnderen}>
          Anderer Satz
        </Button>
      ) : null}
    </figure>
  );
}
