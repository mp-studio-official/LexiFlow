import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SCHWIERIG_AB_FEHLERN,
  SCHWIERIG_BIS_FACH,
  istSchwierig,
} from './schwierigeWoerter';
import type { EntryProgress } from './schema';

function stand(teil: Partial<EntryProgress>): EntryProgress {
  return {
    key: 'e-1::en-de',
    packId: 'p-1',
    entryId: 'e-1',
    direction: 'en-de',
    box: 1,
    correctCount: 0,
    wrongCount: 0,
    streak: 0,
    dueAt: '2026-10-01T00:00:00.000Z',
    ...teil,
  } as EntryProgress;
}

describe('schwierig heißt: oft daneben **und** noch nicht sitzend', () => {
  it('zwei Fehler in Fach 1 — schwierig', () => {
    expect(istSchwierig(stand({ wrongCount: 2, box: 1 }))).toBe(true);
  });

  it('ein einzelner Fehler reicht nicht — das ist ein Vertipper', () => {
    expect(istSchwierig(stand({ wrongCount: 1, box: 1 }))).toBe(false);
  });

  it('ein frisches Wort in Fach 1 ohne Fehler ist nicht schwierig, sondern neu', () => {
    expect(istSchwierig(stand({ wrongCount: 0, box: 1 }))).toBe(false);
  });

  it('alte Fehler in einem hohen Fach zählen nicht mehr', () => {
    /*
      Der Fall, für den es die zweite Bedingung gibt: Das Wort ging vor Wochen
      viermal daneben und sitzt inzwischen. Es weiter als schwierig zu führen,
      hielte eine Niederlage fest, die vorbei ist.
    */
    expect(istSchwierig(stand({ wrongCount: 4, box: 5 }))).toBe(false);
  });

  it('die Grenze liegt genau bei den Konstanten, nicht daneben', () => {
    expect(istSchwierig(stand({ wrongCount: SCHWIERIG_AB_FEHLERN, box: SCHWIERIG_BIS_FACH }))).toBe(
      true,
    );
    expect(
      istSchwierig(stand({ wrongCount: SCHWIERIG_AB_FEHLERN - 1, box: SCHWIERIG_BIS_FACH })),
    ).toBe(false);
    expect(
      istSchwierig(stand({ wrongCount: SCHWIERIG_AB_FEHLERN, box: SCHWIERIG_BIS_FACH + 1 })),
    ).toBe(false);
  });

  it('die Regel braucht beide Größen — keine ist wirkungslos', () => {
    /*
      Die Gegenprobe zur Regel selbst: Fiele eine der beiden Bedingungen weg,
      änderte sich mindestens ein Fall oben. Hier steht, dass beide Größen
      überhaupt etwas tun.
    */
    const nurFehler = stand({ wrongCount: 9, box: 5 });
    const nurFach = stand({ wrongCount: 0, box: 1 });
    expect(istSchwierig(nurFehler)).toBe(false);
    expect(istSchwierig(nurFach)).toBe(false);
  });
});

describe('die Regel steht im Konzept, nicht nur im Quelltext', () => {
  /*
    Eine Schwelle, die nur als Konstante existiert, ist eine Festlegung ohne
    Entscheidung: Sie lässt sich ändern, ohne dass jemand merkt, dass etwas
    entschieden wurde. E24 hält sie fest — und diese Prüfung hält fest, dass
    beide dasselbe sagen.
  */
  const konzept = readFileSync(
    resolve(import.meta.dirname, '../../docs/konzept-5b.md'),
    'utf8',
  );

  it('E24 gibt es, und sie nennt beide Zahlen', () => {
    const abschnitt = konzept.slice(konzept.indexOf('### E24'));
    expect(abschnitt, 'E24 fehlt im Konzept').not.toBe('');
    expect(abschnitt).toMatch(new RegExp(`wrongCount >= ${SCHWIERIG_AB_FEHLERN}`));
    expect(abschnitt).toMatch(new RegExp(`box <= ${SCHWIERIG_BIS_FACH}`));
  });

  it('und sie nennt, was ab Fach 3 passiert', () => {
    const abschnitt = konzept.slice(konzept.indexOf('### E24'));
    expect(abschnitt).toMatch(/Ab Fach 3 verschwindet/);
    /* Die Aussage muss zur Konstante passen, nicht nur dastehen. */
    expect(SCHWIERIG_BIS_FACH + 1).toBe(3);
  });
});
