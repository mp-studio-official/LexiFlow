/**
 * Eine Feder – und warum eine Feder und keine Dauer.
 *
 * ## Der Unterschied, um den es geht
 *
 * Ein CSS-Übergang kennt seinen Zielwert und eine Dauer. Er läuft dorthin, und
 * wer ihn unterwegs greift, bekommt einen Sprung: Die neue Bewegung beginnt
 * beim Zielwert, nicht bei dem, was auf dem Schirm steht. Solange nichts
 * ziehbar ist, fällt das nicht auf.
 *
 * Eine Feder hat keine Dauer. Sie hat einen Zustand – Ort und Geschwindigkeit –
 * und ein Ziel, und aus beidem ergibt sich der nächste Ort. Ein neues Ziel
 * mitten in der Bewegung ist deshalb kein Bruch, sondern nur ein neues Ziel;
 * die Geschwindigkeit läuft weiter. Genau das braucht eine Geste, die man
 * jederzeit wieder anfassen können soll.
 *
 * ## Warum Dämpfung und Response statt Masse und Steifigkeit
 *
 * Die Physik hinter einer Feder hat drei Parameter (Masse, Steifigkeit,
 * Dämpfung), von denen keiner beschreibt, was man sehen will. Apple hat sie in
 * *Designing Fluid Interfaces* durch zwei ersetzt, die es tun:
 *
 * - **Dämpfungsverhältnis** – schwingt es über? `1,0` heißt nein, die Bewegung
 *   kommt sauber zur Ruhe. Darunter schwingt sie über; je kleiner, desto mehr.
 * - **Response** – wie schnell der Zielwert erreicht wird, in Sekunden. Das ist
 *   **keine** Dauer: Eine Feder ist nie fertig, sie kommt zur Ruhe. Wie lange
 *   das dauert, ergibt sich aus beiden Werten.
 *
 * ## Warum das hier steht und nicht in der Ansicht
 *
 * Weil es Rechnen ist. Diese Datei kennt weder React noch das DOM und lässt
 * sich deshalb prüfen, ohne einen Browser zu starten – dieselbe Regel wie für
 * den Rest von `src/domain`. Wer sie in eine Komponente schriebe, könnte
 * hinterher nur noch prüfen, ob sich etwas bewegt hat, nicht ob es richtig
 * gerechnet war.
 */

export interface SpringParams {
  /** Überschwingen: 1,0 = keines. Darunter schwingt es. */
  damping: number;
  /** Wie schnell der Zielwert erreicht wird, in Sekunden. Keine Dauer. */
  response: number;
}

export interface SpringState {
  value: number;
  /** In Einheiten pro Sekunde – dieselbe Einheit wie `value`. */
  velocity: number;
}

/**
 * Bewegen und Zurücklegen: kein Überschwingen.
 *
 * Apples Wert für „etwas an eine andere Stelle bringen“. Eine Karte, die von
 * selbst an ihren Platz zurückgleitet, weil der Wisch nicht gereicht hat, soll
 * dort ankommen und nicht nachwippen – sie hatte keinen Schwung, also darf sie
 * auch keinen vortäuschen.
 */
export const SPRING_MOVE: SpringParams = { damping: 1, response: 0.4 };

/**
 * Geworfen: ein wenig Überschwingen.
 *
 * Nur dort, wo die Geste selbst Schwung hatte. Überschwingen an etwas, das
 * bloß eingeblendet wurde, wirkt aufgesetzt; an etwas, das man geworfen hat,
 * ist es das, was man erwartet.
 */
export const SPRING_FLICK: SpringParams = { damping: 0.8, response: 0.3 };

/**
 * Die größte Zeitscheibe, die ein Rechenschritt verarbeitet.
 *
 * Ein Tabwechsel, ein blockierender Hauptthread oder ein Haltepunkt im
 * Debugger erzeugen ein `dt` von mehreren Sekunden. Ohne Grenze katapultiert
 * die Feder die Karte in einem einzigen Schritt aus dem Bild – der Fehler
 * sieht dann aus wie ein Sprung und liegt in Wahrheit in der Zeit.
 */
const MAX_STEP_S = 1 / 120;

/**
 * Ein Zeitschritt.
 *
 * Gerechnet wird halb-implizit (erst die Geschwindigkeit, dann der Ort) und in
 * Teilschritten von höchstens `MAX_STEP_S`. Beides zusammen hält die Rechnung
 * auch dann stabil, wenn ein Bild ausfällt: Ein großes `dt` wird zu vielen
 * kleinen, statt einmal weit danebenzugreifen.
 *
 * Sehr große Sprünge werden **abgeschnitten** und nicht nachgeholt. Wer eine
 * Sekunde lang weg war, will nicht sehen, wie die Sekunde nachgespielt wird.
 */
export function advance(
  state: SpringState,
  target: number,
  params: SpringParams,
  dt: number,
): SpringState {
  if (!Number.isFinite(dt) || dt <= 0) return state;

  // Eine Viertelsekunde ist mehr, als jede dieser Bewegungen je braucht.
  const gesamt = Math.min(dt, 0.25);
  const omega = (2 * Math.PI) / params.response;

  let { value, velocity } = state;
  let rest = gesamt;

  while (rest > 0) {
    const schritt = Math.min(rest, MAX_STEP_S);
    const beschleunigung = -omega * omega * (value - target) - 2 * params.damping * omega * velocity;
    velocity += beschleunigung * schritt;
    value += velocity * schritt;
    rest -= schritt;
  }

  return { value, velocity };
}

/** Wie nah am Ziel und wie langsam es sein muss, damit die Bewegung endet. */
export const SETTLE_DISTANCE = 0.4;
export const SETTLE_VELOCITY = 12;

/**
 * Ist die Bewegung zur Ruhe gekommen?
 *
 * Beides muss stimmen. Nur der Abstand genügt nicht: Eine überschwingende
 * Feder kommt am Ziel vorbei und ist dort am schnellsten – hielte man sie in
 * diesem Augenblick an, bliebe der Schwung ungenutzt und die Bewegung sähe
 * abgeschnitten aus.
 */
export function isSettled(
  state: SpringState,
  target: number,
  distance = SETTLE_DISTANCE,
  velocity = SETTLE_VELOCITY,
): boolean {
  return Math.abs(state.value - target) < distance && Math.abs(state.velocity) < velocity;
}

/**
 * Wie stark ein Wurf ausrollt.
 *
 * `0,998` ist der Wert, der sich wie Scrollen anfühlt; kleiner heißt, es kommt
 * schneller zum Stehen.
 */
export const DECELERATION_RATE = 0.998;

/**
 * Wohin die Bewegung liefe, wenn man sie ausrollen ließe.
 *
 * ## Warum projiziert und nicht gemessen wird
 *
 * Ein Wisch soll dorthin führen, wo er **hinwollte**, nicht dorthin, wo der
 * Finger zufällig abhob. Wer schnell und kurz wischt, meint dasselbe wie
 * jemand, der langsam und weit wischt – nur die Geschwindigkeit sagt das, die
 * Strecke nicht.
 *
 * Die Formel ist die exponentielle Abklingung aus Apples Beispielcode und
 * **nicht** die Schulbuchformel `v²/(2a)`. Sie ist dieselbe, mit der Scrollen
 * ausrollt; deshalb fühlt sich eine damit geworfene Karte an wie eine Liste,
 * die man angeschubst hat.
 */
export function projectEndpoint(
  position: number,
  velocity: number,
  rate = DECELERATION_RATE,
): number {
  return position + (velocity / 1000) * (rate / (1 - rate));
}

/**
 * Der Widerstand jenseits einer Grenze.
 *
 * Ein harter Anschlag liest sich als „eingefroren“ – man weiß nicht, ob die
 * Anwendung noch reagiert. Ein wachsender Widerstand liest sich als „das
 * Ding ist zu Ende“: Es folgt noch, aber immer weniger.
 *
 * `overshoot` ist die Strecke jenseits der Grenze, `dimension` die Größe der
 * Fläche, an der gezogen wird. Zurück kommt die Strecke, die tatsächlich
 * angezeigt werden soll.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
