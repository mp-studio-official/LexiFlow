import { projectEndpoint } from './spring';

/**
 * Wann ein Wisch zählt.
 *
 * ## Nicht die Strecke entscheidet, sondern der Schwung
 *
 * Der naheliegende Entwurf wäre eine Grenze: Wer weiter als ein Drittel der
 * Breite zieht, blättert weiter. Er ist falsch, und man merkt es sofort am
 * Gerät: Ein kurzer, schneller Wisch – die Bewegung, die jeder Mensch mit
 * einem Kartenstapel macht – bleibt darunter und tut nichts. Man wischt
 * nochmal, fester, und dann springen zwei Karten weiter.
 *
 * Entschieden wird deshalb am **projizierten** Endpunkt: dort, wo die Karte
 * zur Ruhe käme, wenn man sie ausrollen ließe. Das ist dieselbe Rechnung, mit
 * der eine Liste nach dem Anschubsen ausrollt – und deshalb fühlt sich beides
 * gleich an.
 *
 * Der schöne Nebeneffekt: Wer weit zieht und im letzten Moment zurückzuckt,
 * hat einen Schwung nach hinten, und die Projektion holt den Endpunkt mit
 * zurück. Man muss den Rückzieher nicht gesondert behandeln; er fällt aus
 * derselben Formel.
 */

/**
 * Ab welchem Anteil der Breite ein projizierter Endpunkt zählt.
 *
 * Ein Drittel: weit genug, dass ein Antippen oder ein verrutschter Finger
 * nichts auslöst, und nah genug, dass ein beiläufiger Wisch reicht.
 */
export const SWIPE_COMMIT_RATIO = 1 / 3;

export type SwipeOutcome = 'next' | 'previous' | 'return';

export interface SwipeDecision {
  outcome: SwipeOutcome;
  /** Wohin die Karte laufen soll – 0 heißt zurück an ihren Platz. */
  target: number;
}

export interface SwipeRelease {
  /** Wo die Karte im Augenblick des Loslassens steht, in Pixeln. */
  offset: number;
  /** Wie schnell, in Pixeln pro Sekunde. Negativ heißt nach links. */
  velocity: number;
  /** Die Breite der Karte – Maßstab für Grenze und Ziel. */
  width: number;
  /** Gibt es eine nächste Karte (oder den Schlussbildschirm)? */
  canNext: boolean;
  /** Gibt es eine vorige Karte? */
  canPrevious: boolean;
}

/**
 * Nach links weggewischt heißt weiter.
 *
 * Die Richtung ist nicht beliebig: Ein Stapel liegt vor einem, und man schiebt
 * die oberste Karte zur Seite, um an die nächste zu kommen. Dieselbe Richtung
 * wie beim Umblättern und dieselbe wie bei den Pfeiltasten, die hier schon
 * vorher galten.
 */
export function decideSwipe(release: SwipeRelease): SwipeDecision {
  const { offset, velocity, width, canNext, canPrevious } = release;
  const grenze = width * SWIPE_COMMIT_RATIO;
  const projiziert = projectEndpoint(offset, velocity);

  /*
    Das Ziel liegt eine Kartenbreite jenseits des Randes und nicht genau am
    Rand: Eine Karte, die exakt bis zur Kante läuft, steht dort einen Moment
    lang als Streifen. Sie soll aus dem Bild verschwinden, nicht daran kleben.
  */
  if (projiziert <= -grenze && canNext) return { outcome: 'next', target: -width * 1.2 };
  if (projiziert >= grenze && canPrevious) return { outcome: 'previous', target: width * 1.2 };
  return { outcome: 'return', target: 0 };
}

/**
 * Die Geschwindigkeit aus den letzten Zeigerpunkten.
 *
 * Über eine kurze Strecke gemittelt und nicht aus den letzten zwei Punkten:
 * Ein einzelnes Ereignispaar kann eine Millisekunde auseinanderliegen und
 * ergibt dann eine Geschwindigkeit von tausend Pixeln pro Sekunde, obwohl der
 * Finger stand. Gemittelt wird über das, was in `points` steht – der Aufrufer
 * hält dort die letzten Ereignisse vor.
 */
export function velocityFrom(points: readonly { x: number; t: number }[]): number {
  const erster = points[0];
  const letzter = points[points.length - 1];
  if (!erster || !letzter) return 0;

  const dt = (letzter.t - erster.t) / 1000;
  // Unter einer Millisekunde ist die Messung Rauschen.
  if (dt < 0.001) return 0;
  return (letzter.x - erster.x) / dt;
}

/**
 * Wie viele Zeigerpunkte für die Messung vorgehalten werden.
 *
 * Sechs Ereignisse sind bei 60 Hz rund 100 ms – lang genug, um das Rauschen
 * herauszumitteln, und kurz genug, dass ein Finger, der am Ende innehält,
 * auch wirklich eine Geschwindigkeit nahe null ergibt. Ein längeres Fenster
 * würde einen abgebremsten Wisch als Wurf lesen.
 */
export const VELOCITY_SAMPLES = 6;
