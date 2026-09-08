import { describe, expect, it } from 'vitest';

import { SWIPE_COMMIT_RATIO, decideSwipe, velocityFrom, type SwipeRelease } from './swipe';

/**
 * Wann ein Wisch zählt – gerechnet, nicht gewischt.
 */

const KARTE: Omit<SwipeRelease, 'offset' | 'velocity'> = {
  width: 300,
  canNext: true,
  canPrevious: true,
};

describe('Der Schwung entscheidet, nicht die Strecke', () => {
  it('nimmt einen kurzen, schnellen Wisch an', () => {
    /*
      Die Bewegung, die jeder Mensch mit einem Kartenstapel macht: 40 px, aber
      zügig. Eine reine Streckengrenze bei 100 px hätte sie verworfen – und
      genau daran scheitern die meisten selbstgebauten Wischgesten.
    */
    const grenze = KARTE.width * SWIPE_COMMIT_RATIO;
    expect(40).toBeLessThan(grenze);

    expect(decideSwipe({ ...KARTE, offset: -40, velocity: -900 }).outcome).toBe('next');
  });

  it('verwirft einen langsamen Wisch, der nicht weit genug kam', () => {
    expect(decideSwipe({ ...KARTE, offset: -40, velocity: -50 }).outcome).toBe('return');
  });

  it('nimmt einen langsamen, aber weiten Wisch an', () => {
    // Wer die Karte langsam hinausschiebt, meint es genauso.
    expect(decideSwipe({ ...KARTE, offset: -140, velocity: 0 }).outcome).toBe('next');
  });

  it('holt einen Rückzieher im letzten Moment zurück', () => {
    /*
      Weit gezogen, dann zurückgezuckt: Die Strecke spricht für „weiter“, der
      Schwung dagegen. Die Projektion entscheidet – ohne dass der Rückzieher
      irgendwo gesondert behandelt würde.
    */
    expect(decideSwipe({ ...KARTE, offset: -140, velocity: 400 }).outcome).toBe('return');
  });

  it('nimmt ein kräftiges Zurückschleudern beim Wort', () => {
    /*
      Beim ersten Schreiben stand hier −140 px mit 900 px/s als „Rückzieher“ –
      und die Rechnung sagte „zurückblättern“. Sie hat recht: 900 px/s sind
      kein Zucken, sondern ein Wurf nach rechts, und ein Wurf nach rechts
      bedeutet genau das. Ein Rückzieher ist langsam; wer schleudert, meint es.

      Der Fall steht hier, weil er die Grenze zwischen beidem festhält – und
      weil er zeigt, dass die Projektion ohne Sonderfall auskommt.
    */
    expect(decideSwipe({ ...KARTE, offset: -140, velocity: 900 }).outcome).toBe('previous');
  });
});

describe('Die Richtung', () => {
  it('blättert beim Wischen nach links weiter', () => {
    const entscheidung = decideSwipe({ ...KARTE, offset: -150, velocity: -600 });
    expect(entscheidung.outcome).toBe('next');
    expect(entscheidung.target).toBeLessThan(-KARTE.width);
  });

  it('blättert beim Wischen nach rechts zurück', () => {
    const entscheidung = decideSwipe({ ...KARTE, offset: 150, velocity: 600 });
    expect(entscheidung.outcome).toBe('previous');
    expect(entscheidung.target).toBeGreaterThan(KARTE.width);
  });

  it('schickt eine zurückkehrende Karte auf null', () => {
    expect(decideSwipe({ ...KARTE, offset: 20, velocity: 0 }).target).toBe(0);
  });
});

describe('An den Enden', () => {
  it('bleibt bei der ersten Karte, auch wenn kräftig zurückgewischt wird', () => {
    const entscheidung = decideSwipe({
      ...KARTE,
      canPrevious: false,
      offset: 200,
      velocity: 1500,
    });
    expect(entscheidung.outcome).toBe('return');
    expect(entscheidung.target).toBe(0);
  });

  it('lässt nach vorn trotzdem los', () => {
    // Vorwärts gibt es immer ein Ziel – notfalls den Schlussbildschirm.
    expect(
      decideSwipe({ ...KARTE, canPrevious: false, offset: -200, velocity: -800 }).outcome,
    ).toBe('next');
  });

  it('hält auch vorn, wenn es nichts mehr gibt', () => {
    expect(decideSwipe({ ...KARTE, canNext: false, offset: -200, velocity: -800 }).outcome).toBe(
      'return',
    );
  });
});

describe('Die gemessene Geschwindigkeit', () => {
  it('rechnet Strecke durch Zeit', () => {
    expect(
      velocityFrom([
        { x: 0, t: 0 },
        { x: 60, t: 100 },
      ]),
    ).toBeCloseTo(600, 0);
  });

  it('nimmt einen ruhenden Finger als Stillstand', () => {
    /*
      Der Fall, der eine Wischgeste sonst unberechenbar macht: Wer die Karte
      hinauszieht und dort **hält**, bevor er loslässt, hat sie nicht
      geworfen. Über sechs Ereignisse gemittelt kommt dabei nahezu null heraus.
    */
    const ruhig = Array.from({ length: 6 }, (_wert, i) => ({ x: 120, t: i * 16 }));
    expect(velocityFrom(ruhig)).toBe(0);
  });

  it('lässt sich von zwei Ereignissen in derselben Millisekunde nicht täuschen', () => {
    // Sonst ergäben zwei Pixel in 0,3 ms mehrere tausend Pixel pro Sekunde.
    expect(
      velocityFrom([
        { x: 0, t: 1000 },
        { x: 2, t: 1000.3 },
      ]),
    ).toBe(0);
  });

  it('kommt mit einer leeren oder einelementigen Messung zurecht', () => {
    expect(velocityFrom([])).toBe(0);
    expect(velocityFrom([{ x: 5, t: 5 }])).toBe(0);
  });

  it('zählt nach links negativ', () => {
    expect(
      velocityFrom([
        { x: 200, t: 0 },
        { x: 140, t: 100 },
      ]),
    ).toBeLessThan(0);
  });
});
