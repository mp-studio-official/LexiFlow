import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '../../ui/components';

/**
 * Die Rückfrage vor dem Verlassen einer Runde — ein **echter** modaler Dialog.
 *
 * ## Warum `<dialog>` und `showModal()`
 *
 * Vorher stand hier ein `<div role="dialog" aria-modal="true">`. Die Rolle war
 * richtig, das Versprechen nicht: `aria-modal="true"` sagt einer Vorlesehilfe,
 * der Rest der Seite sei weg — und er war es nicht. Hinter dem Kasten ließ
 * sich weitertabben, der Kopf blieb anklickbar, und „Abmelden" war mitten in
 * der Rückfrage erreichbar. Ein Versprechen, das die Oberfläche nicht hält,
 * ist schlechter als keines.
 *
 * `showModal()` macht das, was das Attribut behauptet, und zwar im Browser
 * und nicht in unserem Code: Fokusfalle, unbedienbarer Hintergrund, Escape,
 * oberste Ebene. Nichts davon muss nachgebaut werden, und nichts davon kann
 * danach in Teilen zerfallen.
 *
 * ## Warum `aria-modal` nur manchmal dasteht
 *
 * Es steht genau dann da, wenn `showModal()` wirklich gelaufen ist. In jsdom
 * gibt es die Methode nicht (Stand 30.x); dort öffnet der Rückfall den Dialog
 * über das `open`-Attribut, und er ist dann **nicht** modal. Das Attribut
 * fehlt dort folgerichtig: Lieber keine Aussage als eine falsche.
 *
 * Die echte Modalität wird deshalb nicht in jsdom geprüft, sondern in
 * Chromium — `scripts/rueckfrage-messen.mjs` tabbt vorwärts und rückwärts
 * durch den Dialog, klickt in den Hintergrund und liest den
 * Accessibility-Baum.
 *
 * ## Warum jedes andere Schließen „Hierbleiben" bedeutet
 *
 * Escape, der Hintergrund, ein Browserweg: Alles, was nicht ausdrücklich
 * „Runde beenden" ist, darf keinen Verlust bestätigen. Die Zustimmung kommt
 * aus genau einem Knopf; `close` ohne diesen Knopf heißt bleiben.
 */
export function Rueckfrage({
  offen,
  aufBleiben,
  aufBeenden,
  nachBleiben,
}: {
  offen: boolean;
  /** Dialog zu, nichts verworfen. */
  aufBleiben: () => void;
  /** Ausdrückliche Zustimmung: die aktuelle Eingabe verwerfen und gehen. */
  aufBeenden: () => void;
  /**
   * Läuft, **nachdem** der Dialog wirklich zu ist — für den Fokus.
   *
   * Nicht in `aufBleiben`: Ein modales `<dialog>` gibt den Fokus beim
   * Schließen an das Element zurück, das es geöffnet hat. Wer vorher
   * woandershin fokussiert, wird davon überschrieben — gemessen stand der
   * Fokus danach auf „Runde beenden" statt im Antwortfeld.
   */
  nachBleiben?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const bleiben = useRef<HTMLButtonElement>(null);
  const [wirklichModal, setzeWirklichModal] = useState(false);
  /* Ob das Schließen schon beantwortet ist — sonst meldete `close` doppelt. */
  const beantwortet = useRef(false);
  /* Womit zuletzt geantwortet wurde — entscheidet, ob der Fokus zurückgeht. */
  const grund = useRef<'bleiben' | 'beenden'>('bleiben');
  const nachBleibenRef = useRef(nachBleiben);
  nachBleibenRef.current = nachBleiben;

  useEffect(() => {
    const feld = dialog.current;
    if (!feld) return;

    if (!offen) {
      /*
        `close()` gibt es nur, wo es auch `showModal()` gibt. Ohne beides —
        jsdom — wird das Attribut wieder entfernt; das ist derselbe Rückfall
        wie beim Öffnen und hält beide Wege symmetrisch.
      */
      const warOffen = feld.hasAttribute('open');
      if (typeof feld.close === 'function') {
        if (feld.open) feld.close();
      } else {
        feld.removeAttribute('open');
      }
      if (warOffen && grund.current === 'bleiben') nachBleibenRef.current?.();
      return;
    }

    beantwortet.current = false;
    if (typeof feld.showModal === 'function') {
      if (!feld.open) feld.showModal();
      setzeWirklichModal(true);
    } else {
      /* jsdom und sehr alte Browser: sichtbar, aber ohne echte Modalität. */
      feld.setAttribute('open', '');
      setzeWirklichModal(false);
    }
    /*
      Der Fokus auf die ungefährliche Antwort. `showModal` setzt ihn von sich
      aus auf das erste fokussierbare Element — hier ist das derselbe Knopf,
      aber verlassen wird sich darauf nicht: Käme je ein Element davor, läge
      der Fokus auf etwas anderem als dem, was hier zugesagt ist.
    */
    bleiben.current?.focus();
  }, [offen]);

  return (
    <dialog
      ref={dialog}
      className="rueckfrage"
      aria-labelledby="rueckfrage-titel"
      {...(wirklichModal ? { 'aria-modal': true as const } : {})}
      onKeyDown={(ereignis) => {
        /*
          Escape auch dort, wo es kein `cancel` gibt: Ohne `showModal()` —
          in jsdom etwa — löst der Browser das Ereignis nicht aus, und die
          Taste täte dann nichts. Doppelt gemeldet wird trotzdem nichts, das
          verhindert `beantwortet`.
        */
        if (ereignis.key !== 'Escape') return;
        ereignis.preventDefault();
        if (beantwortet.current) return;
        beantwortet.current = true;
        grund.current = 'bleiben';
        aufBleiben();
      }}
      onCancel={(ereignis) => {
        /*
          Escape. Der Browser würde den Dialog selbst schließen; abgefangen
          wird er trotzdem, damit genau ein Weg hinausführt — der über
          `aufBleiben`, mit dem Fokus zurück im Antwortfeld.
        */
        ereignis.preventDefault();
        if (beantwortet.current) return;
        beantwortet.current = true;
        grund.current = 'bleiben';
        aufBleiben();
      }}
      onClose={() => {
        if (beantwortet.current) return;
        beantwortet.current = true;
        grund.current = 'bleiben';
        aufBleiben();
      }}
    >
      <Card>
        <h2 id="rueckfrage-titel" style={{ marginTop: 0 }}>
          Deine angefangene Antwort geht verloren
        </h2>
        <p>
          Alles, was du schon beantwortet hast, ist gespeichert. Nur die Eingabe an dieser
          Aufgabe ist noch nicht abgeschickt.
        </p>
        <div className="row">
          <Button
            ref={bleiben}
            variant="primary"
            onClick={() => {
              beantwortet.current = true;
              grund.current = 'bleiben';
              aufBleiben();
            }}
          >
            Hierbleiben
          </Button>
          <Button
            onClick={() => {
              beantwortet.current = true;
              grund.current = 'beenden';
              aufBeenden();
            }}
          >
            Runde beenden
          </Button>
        </div>
      </Card>
    </dialog>
  );
}
