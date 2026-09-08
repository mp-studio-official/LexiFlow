import { describe, expect, it } from 'vitest';

import {
  DECELERATION_RATE,
  SPRING_FLICK,
  SPRING_MOVE,
  advance,
  isSettled,
  projectEndpoint,
  rubberband,
  type SpringState,
} from './spring';

/**
 * Die Feder – geprüft, ohne dass sich etwas bewegt.
 *
 * Das ist der Sinn davon, dass sie in `src/domain` liegt: Ob eine Bewegung
 * überschwingt, wann sie zur Ruhe kommt und wohin ein Wurf projiziert wird,
 * sind Rechenfragen. Sie hier zu beantworten ist genauer und schneller, als
 * einen Browser danach zu fragen – und was hier stimmt, stimmt in jedem
 * Browser.
 */

/** Lässt die Feder laufen und schreibt jeden Zwischenwert mit. */
function laufen(
  start: SpringState,
  target: number,
  params = SPRING_MOVE,
  bilder = 600,
  dt = 1 / 60,
): number[] {
  const verlauf: number[] = [start.value];
  let zustand = start;
  for (let i = 0; i < bilder; i += 1) {
    zustand = advance(zustand, target, params, dt);
    verlauf.push(zustand.value);
    if (isSettled(zustand, target)) break;
  }
  return verlauf;
}

describe('Dämpfung entscheidet über das Überschwingen', () => {
  it('kommt bei 1,0 an, ohne vorbeizuschießen', () => {
    /*
      Der Wert für alles, was sich bloß an seinen Platz begibt. Kein einziger
      Zwischenwert darf über dem Ziel liegen – auch nicht knapp.
    */
    const verlauf = laufen({ value: 0, velocity: 0 }, 100, SPRING_MOVE);
    expect(Math.max(...verlauf)).toBeLessThanOrEqual(100.001);
    expect(verlauf.at(-1)).toBeGreaterThan(99);
  });

  it('schwingt bei 0,8 über – und kommt trotzdem zur Ruhe', () => {
    const verlauf = laufen({ value: 0, velocity: 0 }, 100, SPRING_FLICK);
    expect(Math.max(...verlauf)).toBeGreaterThan(100);
    expect(verlauf.at(-1)).toBeCloseTo(100, 0);
  });

  it('kommt aus beiden Richtungen an', () => {
    expect(laufen({ value: 200, velocity: 0 }, 0).at(-1)).toBeLessThan(1);
    expect(laufen({ value: -200, velocity: 0 }, 0).at(-1)).toBeGreaterThan(-1);
  });
});

describe('Die Geschwindigkeit läuft weiter', () => {
  it('bringt eine mitgegebene Geschwindigkeit früher ans Ziel', () => {
    /*
      Die Naht zwischen Ziehen und Animieren. Wer die Karte in Richtung Ziel
      wirft, soll sie nicht erst abbremsen sehen, bevor sie weiterfliegt.
    */
    const ohne = laufen({ value: 0, velocity: 0 }, 300).length;
    const mit = laufen({ value: 0, velocity: 900 }, 300).length;
    expect(mit).toBeLessThan(ohne);
  });

  it('trägt eine Geschwindigkeit gegen das Ziel erst hinaus und dann zurück', () => {
    // Ein Wurf in die falsche Richtung wird nicht verschluckt, sondern gebremst.
    const verlauf = laufen({ value: 0, velocity: -600 }, 100);
    expect(Math.min(...verlauf)).toBeLessThan(0);
    expect(verlauf.at(-1)).toBeCloseTo(100, 0);
  });

  it('lässt sich mitten in der Bewegung auf ein neues Ziel umlenken', () => {
    /*
      Der eigentliche Grund für eine Feder: Ein neues Ziel ist kein Bruch.

      Geprüft wird die Stetigkeit, und zwar am Ort. Eine umgelenkte Bewegung
      **läuft zuerst weiter** in die Richtung, in die sie unterwegs war, und
      kehrt erst dann um – so wie ein Gegenstand, den man geworfen hat und
      dessen Ziel man sich anders überlegt. Ein Übergang mit fester Dauer
      spränge in diesem Augenblick auf seinen alten Zielwert; genau das ist die
      Naht, die man an CSS-Übergängen sieht, wenn man sie im Flug greift.

      Die Geschwindigkeit selbst darf dabei durchaus schon das Vorzeichen
      wechseln: Sie ist weit vom neuen Ziel entfernt, und die Rückholkraft ist
      entsprechend groß. Nur der Ort darf nicht springen.
    */
    let zustand: SpringState = { value: 0, velocity: 0 };
    for (let i = 0; i < 3; i += 1) zustand = advance(zustand, 300, SPRING_MOVE, 1 / 60);

    const unterwegs = { ...zustand };
    expect(unterwegs.velocity).toBeGreaterThan(0);

    // Der Ort springt nicht: Ein Bild später steht die Feder dort, wohin ihre
    // Geschwindigkeit sie getragen hat, und nirgendwo anders.
    const danach = advance(zustand, 0, SPRING_MOVE, 1 / 60);
    expect(Math.abs(danach.value - unterwegs.value)).toBeLessThan(
      Math.abs(unterwegs.velocity) / 60 + 0.5,
    );
    expect(danach.velocity).not.toBe(0);

    // Und sie läuft erst noch ein Stück weiter, bevor sie umkehrt.
    const verlauf = laufen(unterwegs, 0);
    expect(Math.max(...verlauf)).toBeGreaterThan(unterwegs.value);
    // Zurück kommt sie ohne Überschwingen – gedämpft mit 1,0.
    expect(Math.min(...verlauf)).toBeGreaterThan(-0.001);
    expect(verlauf.at(-1)).toBeLessThan(1);
  });
});

describe('Zeit, die niemand gesehen hat', () => {
  it('katapultiert nach einem Tabwechsel nichts aus dem Bild', () => {
    /*
      Der Fehler, den diese Grenze verhindert: Ein `dt` von zwei Sekunden –
      Tabwechsel, blockierter Hauptthread, Haltepunkt – ergibt ohne
      Teilschritte in einem Rutsch einen Wert weit jenseits des Ziels. Der
      Sprung sieht dann nach einem Rechenfehler aus und liegt in der Zeit.
    */
    const weit = advance({ value: 0, velocity: 0 }, 100, SPRING_MOVE, 2);
    expect(weit.value).toBeGreaterThan(0);
    expect(weit.value).toBeLessThanOrEqual(100.001);
  });

  it('ignoriert einen Schritt ohne Zeit', () => {
    const zustand = { value: 42, velocity: 7 };
    expect(advance(zustand, 0, SPRING_MOVE, 0)).toEqual(zustand);
    expect(advance(zustand, 0, SPRING_MOVE, Number.NaN)).toEqual(zustand);
  });

  it('rechnet dasselbe, ob in großen oder kleinen Schritten', () => {
    // Sonst hinge das Ergebnis an der Bildwiederholrate des Geräts.
    let grob: SpringState = { value: 0, velocity: 0 };
    let fein: SpringState = { value: 0, velocity: 0 };
    for (let i = 0; i < 30; i += 1) grob = advance(grob, 100, SPRING_MOVE, 1 / 60);
    for (let i = 0; i < 60; i += 1) fein = advance(fein, 100, SPRING_MOVE, 1 / 120);
    expect(grob.value).toBeCloseTo(fein.value, 1);
  });
});

describe('Zur Ruhe gekommen', () => {
  it('verlangt Nähe **und** Langsamkeit', () => {
    /*
      Eine überschwingende Feder ist am Ziel am schnellsten. Nur den Abstand zu
      prüfen hieße, sie ausgerechnet dort anzuhalten – die Bewegung sähe
      abgeschnitten aus.
    */
    expect(isSettled({ value: 100, velocity: 500 }, 100)).toBe(false);
    expect(isSettled({ value: 60, velocity: 0 }, 100)).toBe(false);
    expect(isSettled({ value: 100.1, velocity: 3 }, 100)).toBe(true);
  });
});

describe('Wohin ein Wurf liefe', () => {
  it('rechnet mit der exponentiellen Abklingung, nicht mit v²/2a', () => {
    /*
      Der Zahlenwert ist nachrechenbar: (v/1000) · d/(1−d) mit d = 0,998 ergibt
      den Faktor 499. Ein Wurf mit 1000 px/s rollt also 499 px aus.
    */
    expect(projectEndpoint(0, 1000)).toBeCloseTo(499, 0);
    expect(projectEndpoint(50, 1000)).toBeCloseTo(549, 0);
    expect(projectEndpoint(0, -1000)).toBeCloseTo(-499, 0);
  });

  it('bleibt stehen, wo nichts geworfen wurde', () => {
    expect(projectEndpoint(120, 0)).toBe(120);
  });

  it('rollt bei kleinerer Abklingrate kürzer aus', () => {
    expect(Math.abs(projectEndpoint(0, 800, 0.99))).toBeLessThan(
      Math.abs(projectEndpoint(0, 800, DECELERATION_RATE)),
    );
  });

  it('macht aus einem kurzen, schnellen Wisch eine weite Strecke', () => {
    // „Take a small input and make a big output.“
    expect(projectEndpoint(30, 1500) - 30).toBeGreaterThan(700);
  });
});

describe('Der Widerstand am Rand', () => {
  it('folgt von Anfang an nur zur Hälfte und später immer weniger', () => {
    /*
      Der Widerstand setzt **sofort** ein und nicht erst nach einer Weile: Bei
      kleiner Strecke folgt die Fläche mit der Konstante, also zu 55 %. Je
      weiter man zieht, desto weniger kommt hinzu.

      Das war beim ersten Schreiben dieses Tests anders erwartet – „folgt
      zuerst fast ganz“ – und ist falsch: Ein Rand, der erst voll mitgeht und
      dann bremst, hätte einen Knick, und genau den soll ein Gummiband nicht
      haben.
    */
    const flaeche = 360;
    expect(rubberband(10, flaeche) / 10).toBeCloseTo(0.55, 1);

    // Mit jeder Stufe folgt sie anteilig weniger – ohne Knick, aber stetig.
    const anteile = [10, 50, 200, 1000].map((s) => rubberband(s, flaeche) / s);
    for (let i = 1; i < anteile.length; i += 1) {
      expect(anteile[i], `Stufe ${i}`).toBeLessThan(anteile[i - 1] as number);
    }
    /* Weit draußen folgt sie weniger als halb so bereitwillig wie am Anfang.
       Ein Verhältnis statt einer festen Zahl: Wer die Konstante ändert, ändert
       damit auch den Anfangswert, und die Aussage soll trotzdem stimmen. */
    expect((anteile.at(-1) as number) / (anteile[0] as number)).toBeLessThan(0.5);
  });

  it('lässt die Fläche nie weiter wandern als ihre eigene Größe', () => {
    /*
      Die Obergrenze der Formel: Auch wer einen Kilometer zieht, bekommt
      höchstens die Ausdehnung der Fläche. Damit kann nichts aus dem Bild
      wandern, ohne dass es dafür einen anderen Grund gibt.
    */
    const flaeche = 360;
    for (const strecke of [500, 5000, 50000]) {
      expect(rubberband(strecke, flaeche)).toBeLessThan(flaeche);
    }
  });

  it('folgt in beide Richtungen gleich', () => {
    expect(rubberband(-80, 360)).toBeCloseTo(-rubberband(80, 360), 6);
  });

  it('bleibt an einer Fläche ohne Ausdehnung bei null', () => {
    expect(rubberband(50, 0)).toBe(0);
  });

  it('überholt den Finger nie', () => {
    // Widerstand heißt weniger, nie mehr.
    for (const strecke of [1, 5, 20, 80, 300]) {
      expect(Math.abs(rubberband(strecke, 360))).toBeLessThan(strecke);
    }
  });
});
