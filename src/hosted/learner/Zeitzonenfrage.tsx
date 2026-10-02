import { useId, useState } from 'react';
import { Button } from '../../ui/components';
import { zeitzonenVorschlag } from '../../domain/zeitzone';

/**
 * Die Zeitzonenbestätigung auf „Heute" (E27).
 *
 * ## Was sie ist
 *
 * Eine ruhige Karte am Kopf der Seite. Kein Dialog, kein Riegel, keine
 * Bedingung für irgendetwas anderes: Wer sie wegignoriert, kann weiterlernen,
 * seine Fälligkeiten sehen, seine Kurse öffnen. Nur drei der sieben Bereiche
 * bleiben unbeziffert, und sie sagen auch, warum.
 *
 * ## Warum sie überhaupt fragt
 *
 * Weil eine Serie eine Aussage über **Tage** ist und ein Tag dort beginnt, wo
 * jemand wohnt. Der Browser weiß das meistens — aber „meistens" ist der Grund
 * für die Frage und nicht gegen sie: Ein falsch gestelltes Gerät, ein
 * Schulrechner mit fremder Einstellung, eine Reise. Eine stille automatische
 * Übernahme speicherte einen falschen Wert als Wahrheit, und niemand sähe es
 * später an.
 *
 * ## Was sie nicht tut
 *
 * Nichts speichern, bevor jemand „Bestätigen" drückt. Der Vorschlag wird hier
 * **gelesen**, nicht abgelegt; der Weg in die Datenbank führt ausschließlich
 * über `confirmTimeZone`. Und sie überschreibt nie: Steht ein Wert, erscheint
 * diese Karte gar nicht erst.
 *
 * ## Wenn der Browser nichts weiß
 *
 * Dann fehlt der Vorschlag, und die Karte zeigt nur die Auswahl. Keine
 * Fehlermeldung, kein leerer Knopf — eine Umgebung ohne Zeitzonendaten ist
 * selten, aber sie ist kein Fehler der lernenden Person.
 */

/**
 * Die Zeitzonen zur Auswahl.
 *
 * `Intl.supportedValuesOf` gibt es seit 2022 in allen Browsern, die dieses
 * Portal bedient — aber nicht in jeder Umgebung, in der die Prüfungen laufen.
 * Fehlt es, bleibt eine kurze, offensichtlich unvollständige Liste. Das ist
 * ehrlicher als eine abgeschriebene Vollliste, die still veraltet: Wer seine
 * Zeitzone hier nicht findet, sieht, dass die Auswahl klein ist.
 */
export function zeitzonenliste(vorschlag?: string): string[] {
  const roh = (() => {
    try {
      const alle = (
        Intl as unknown as { supportedValuesOf?: (schluessel: string) => string[] }
      ).supportedValuesOf?.('timeZone');
      return Array.isArray(alle) && alle.length > 0 ? alle : undefined;
    } catch {
      return undefined;
    }
  })();

  const liste = roh ?? [
    'Europe/Berlin',
    'Europe/Vienna',
    'Europe/Zurich',
    'Europe/London',
    'Europe/Istanbul',
    'Europe/Warsaw',
    'Europe/Kyiv',
    'America/New_York',
    'Asia/Shanghai',
    'UTC',
  ];

  // Der Vorschlag steht immer zur Wahl, auch wenn die Liste ihn nicht kennt.
  return vorschlag !== undefined && !liste.includes(vorschlag)
    ? [vorschlag, ...liste]
    : [...liste];
}

export function Zeitzonenfrage({
  bestaetigen,
  /** Für die Prüfungen und die Messung: ein Vorschlag statt des echten. */
  vorschlag = zeitzonenVorschlag(),
}: {
  bestaetigen: (zone: string) => Promise<void> | void;
  vorschlag?: string | undefined;
}) {
  const [andere, setzeAndere] = useState(vorschlag === undefined);
  const [wahl, setzeWahl] = useState(vorschlag ?? 'Europe/Berlin');
  const [laeuft, setzeLaeuft] = useState(false);
  const [fehler, setzeFehler] = useState('');
  const auswahlId = useId();

  async function speichere(zone: string) {
    setzeLaeuft(true);
    setzeFehler('');
    try {
      await bestaetigen(zone);
    } catch {
      setzeFehler('Die Zeitzone wurde nicht gespeichert. Versuch es gleich noch einmal.');
    } finally {
      setzeLaeuft(false);
    }
  }

  return (
    /*
      `aria-labelledby` auf die eigene Überschrift: Der Abschnitt bekommt
      damit einen Namen im Accessibility-Baum und taucht in der
      Überschriftenliste auf — ohne `role="alert"`, denn hier ist nichts
      passiert, was jemanden unterbrechen dürfte.
    */
    <section className="heute-zeitzone" aria-labelledby={`${auswahlId}-titel`}>
      <h2 className="heute-zeitzone__titel" id={`${auswahlId}-titel`}>
        In welcher Zeitzone lernst du?
      </h2>
      <p className="heute-zeitzone__text">
        Daraus ergibt sich, wann bei dir ein Tag beginnt. Solange das nicht
        feststeht, zeigen wir deine Lernserie und deine Woche noch nicht an —
        üben kannst du trotzdem ganz normal.
      </p>

      {andere ? (
        <div className="heute-zeitzone__wahl">
          <label className="heute-zeitzone__label" htmlFor={auswahlId}>
            Zeitzone
          </label>
          <select
            className="heute-zeitzone__feld"
            id={auswahlId}
            value={wahl}
            onChange={(ereignis) => setzeWahl(ereignis.target.value)}
          >
            {zeitzonenliste(vorschlag).map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="heute-zeitzone__vorschlag">
          Dein Gerät meint: <strong>{vorschlag}</strong>
        </p>
      )}

      <div className="heute-zeitzone__knoepfe">
        <Button
          variant="primary"
          onClick={() => void speichere(andere ? wahl : (vorschlag ?? wahl))}
          disabled={laeuft}
        >
          {andere ? `„${wahl}" bestätigen` : 'Stimmt, bestätigen'}
        </Button>
        {andere ? null : (
          <Button variant="quiet" onClick={() => setzeAndere(true)}>
            Andere Zeitzone
          </Button>
        )}
      </div>

      {fehler ? (
        <p className="heute-zeitzone__fehler" role="alert">
          {fehler}
        </p>
      ) : null}
    </section>
  );
}
