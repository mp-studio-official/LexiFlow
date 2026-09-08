import { useCallback, useEffect, useRef, useState } from 'react';

import {
  SPRING_FLICK,
  SPRING_MOVE,
  advance,
  isSettled,
  rubberband,
  type SpringParams,
  type SpringState,
} from '../domain/spring';
import { VELOCITY_SAMPLES, decideSwipe, velocityFrom } from '../domain/swipe';

/**
 * Eine Karte, die man wegwischen kann.
 *
 * ## Was hier passiert und was in `src/domain` passiert
 *
 * Hier steht nur, was ohne Browser nicht geht: Zeigerereignisse, ein
 * Bildtakt, ein `transform`. Ob ein Wisch zählt, wohin er projiziert und wie
 * eine Feder rechnet, steht in `domain/swipe.ts` und `domain/spring.ts` – und
 * ist dort ohne Browser geprüft. Diese Datei ist die Verkabelung.
 *
 * ## Warum die Position nicht im Zustand steht
 *
 * Sechzig `setState` pro Sekunde würden sechzigmal pro Sekunde den ganzen
 * Kartenbaum neu rendern – für eine Zahl, die am Ende nur in einem
 * `transform` landet. Die Position wird deshalb direkt an das Element
 * geschrieben. Im React-Zustand steht allein, **ob** gerade gezogen wird;
 * daran hängt eine Klasse, und die ändert sich zweimal je Geste.
 *
 * ## Warum das Greifen mitten im Flug funktioniert
 *
 * Weil beim Aufsetzen des Fingers nichts zurückgesetzt wird: Der Bildtakt
 * hört auf, der Federzustand bleibt stehen, und der Griffversatz wird gegen
 * **den aktuellen Ort** gerechnet. Die Karte hängt damit sofort wieder am
 * Finger, egal wo sie gerade war. Ein CSS-Übergang könnte das nicht – er
 * kennt nur seinen Zielwert.
 *
 * ## Reduzierte Bewegung
 *
 * Das Ziehen selbst bleibt: Es ist keine Animation, sondern die direkte
 * Antwort auf einen Finger, und wer reduzierte Bewegung eingestellt hat,
 * möchte trotzdem eine Karte verschieben können. Was entfällt, ist das
 * Fliegen und Zurückfedern – die Entscheidung wird sofort wirksam, die Karte
 * springt auf null.
 */

export interface CardSwipeOptions {
  /** Nach links weggewischt. */
  onNext: () => void;
  /** Nach rechts zurückgewischt. */
  onPrevious: () => void;
  canNext: boolean;
  canPrevious: boolean;
  /** Ohne Zeigergerät oder in Sonderfällen abschaltbar. */
  enabled?: boolean;
}

export interface CardSwipe {
  /** An das Element hängen, das sich bewegen soll. */
  cardRef: React.RefObject<HTMLDivElement | null>;
  dragging: boolean;
  handlers: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  };
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useCardSwipe({
  onNext,
  onPrevious,
  canNext,
  canPrevious,
  enabled = true,
}: CardSwipeOptions): CardSwipe {
  const cardRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const feder = useRef<SpringState>({ value: 0, velocity: 0 });
  const ziel = useRef(0);
  const parameter = useRef<SpringParams>(SPRING_MOVE);
  const bild = useRef<number | null>(null);
  const zuletzt = useRef(0);
  /** Was geschehen soll, wenn die Karte draußen angekommen ist. */
  const danach = useRef<(() => void) | null>(null);

  const griff = useRef(0);
  const spur = useRef<{ x: number; t: number }[]>([]);

  /*
    Die Rückrufe stecken in Refs, weil der Bildtakt sie aufruft, lange nachdem
    der Effekt eingerichtet wurde. Ohne das hinge an jedem Rendern eine neue
    Funktion, und der laufende Takt riefe die von vorgestern.
  */
  const rueckrufe = useRef({ onNext, onPrevious });
  rueckrufe.current = { onNext, onPrevious };

  const male = useCallback((x: number) => {
    const el = cardRef.current;
    if (el) el.style.transform = x === 0 ? '' : `translate3d(${x.toFixed(2)}px, 0, 0)`;
  }, []);

  const anhalten = useCallback(() => {
    if (bild.current !== null) cancelAnimationFrame(bild.current);
    bild.current = null;
  }, []);

  /** Setzt die Karte ohne Bewegung in die Mitte – für die nächste Karte. */
  const zuruecksetzen = useCallback(() => {
    anhalten();
    feder.current = { value: 0, velocity: 0 };
    ziel.current = 0;
    danach.current = null;
    male(0);
  }, [anhalten, male]);

  useEffect(() => anhalten, [anhalten]);

  const takt = useCallback(
    (jetzt: number) => {
      const dt = (jetzt - zuletzt.current) / 1000;
      zuletzt.current = jetzt;

      feder.current = advance(feder.current, ziel.current, parameter.current, dt);
      male(feder.current.value);

      if (!isSettled(feder.current, ziel.current)) {
        bild.current = requestAnimationFrame(takt);
        return;
      }

      bild.current = null;
      const fertig = danach.current;
      /*
        Erst zurücksetzen, dann melden. Andernfalls stünde die neue Karte für
        ein Bild lang dort, wo die alte hinausgeflogen ist.
      */
      zuruecksetzen();
      fertig?.();
    },
    [male, zuruecksetzen],
  );

  const starten = useCallback(() => {
    anhalten();
    zuletzt.current = performance.now();
    bild.current = requestAnimationFrame(takt);
  }, [anhalten, takt]);

  const breite = useCallback(() => cardRef.current?.offsetWidth ?? 0, []);

  function onPointerDown(event: React.PointerEvent<HTMLElement>): void {
    if (!enabled || event.button !== 0) return;
    /*
      Ein Zeiger auf einer Schaltfläche oder einem Eingabefeld gehört dieser –
      sonst zöge man beim Antippen von „Antwort anzeigen“ die halbe Karte weg.
    */
    if (event.target instanceof Element && event.target.closest('button, a, input, select, label')) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    anhalten();
    danach.current = null;

    // Der Griffversatz gegen den **aktuellen** Ort: So bleibt eine Karte, die
    // gerade noch flog, dort stehen, wo sie war.
    griff.current = event.clientX - feder.current.value;
    spur.current = [{ x: event.clientX, t: event.timeStamp }];
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>): void {
    if (!dragging) return;

    const roh = event.clientX - griff.current;
    const w = breite();

    /*
      Am Anfang des Satzes gibt es nach rechts nichts zu holen. Ein harter
      Anschlag läse sich als „hängt“; der wachsende Widerstand sagt „hier ist
      Schluss“ und antwortet trotzdem.
    */
    let sichtbar = roh;
    if (roh > 0 && !canPrevious) sichtbar = rubberband(roh, w);
    if (roh < 0 && !canNext) sichtbar = -rubberband(-roh, w);

    feder.current = { value: sichtbar, velocity: 0 };
    male(sichtbar);

    spur.current.push({ x: event.clientX, t: event.timeStamp });
    if (spur.current.length > VELOCITY_SAMPLES) spur.current.shift();
  }

  function loslassen(event: React.PointerEvent<HTMLElement>): void {
    if (!dragging) return;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const geschwindigkeit = velocityFrom(spur.current);
    spur.current = [];

    const entscheidung = decideSwipe({
      offset: feder.current.value,
      velocity: geschwindigkeit,
      width: breite(),
      canNext,
      canPrevious,
    });

    const handlung =
      entscheidung.outcome === 'next'
        ? () => rueckrufe.current.onNext()
        : entscheidung.outcome === 'previous'
          ? () => rueckrufe.current.onPrevious()
          : null;

    if (prefersReducedMotion()) {
      // Kein Flug, kein Zurückfedern – die Entscheidung gilt sofort.
      zuruecksetzen();
      handlung?.();
      return;
    }

    ziel.current = entscheidung.target;
    // Überschwingen nur, wo die Geste selbst Schwung hatte.
    parameter.current = entscheidung.outcome === 'return' ? SPRING_MOVE : SPRING_FLICK;
    feder.current = { value: feder.current.value, velocity: geschwindigkeit };
    danach.current = handlung;
    starten();
  }

  function abbrechen(event: React.PointerEvent<HTMLElement>): void {
    /*
      Der Browser hat die Geste an sich genommen – meistens, weil daraus ein
      vertikales Scrollen wurde. Die Karte geht zurück, und zwar ohne dass
      irgendetwas geblättert wird.
    */
    if (!dragging) return;
    setDragging(false);
    spur.current = [];
    if (prefersReducedMotion()) {
      zuruecksetzen();
      return;
    }
    ziel.current = 0;
    parameter.current = SPRING_MOVE;
    danach.current = null;
    starten();
    void event;
  }

  return {
    cardRef,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: loslassen,
      onPointerCancel: abbrechen,
    },
  };
}
