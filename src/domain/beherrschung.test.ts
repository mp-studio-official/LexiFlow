import { describe, expect, it } from 'vitest';
import {
  BEHERRSCHT_AB_FACH,
  beherrschungVon,
  summiereBeherrschung,
  zaehleBeherrschung,
} from './beherrschung';
import { isEntryMastered } from './leitner';
import { directionKey } from './ids';
import { LEITNER_BOX_MAX } from './schema';
import type { EntryProgress, TaskDirection } from './schema';

/**
 * Die Regel für „Mein Fortschritt" — und ihre Abgrenzung von „sicher gelernt".
 *
 * Zwei Schwellen nebeneinander sind eine Gefahr: Wer die eine ändert, ändert
 * leicht die andere mit. Die letzte Gruppe hier hält deshalb fest, dass die
 * bestehende Funktion unverändert bleibt.
 */

const BEIDE: readonly TaskDirection[] = ['en-de', 'de-en'];

/** Ein Lernstand mit einem bestimmten Fach – der Rest ist hier Beiwerk. */
function stand(entryId: string, richtung: TaskDirection, fach: number): [string, EntryProgress] {
  return [
    directionKey(entryId, richtung),
    {
      key: `p::${entryId}::${richtung}`,
      packId: 'p',
      entryId,
      direction: richtung,
      box: fach,
      correctCount: 0,
      wrongCount: 0,
      streak: 0,
      dueAt: '2026-10-10T00:00:00.000Z',
      rev: 1,
    },
  ];
}

describe('Die Schwelle', () => {
  it('liegt bei Fach 4', () => {
    expect(BEHERRSCHT_AB_FACH).toBe(4);
  });

  it('ist eine andere als die von „sicher gelernt"', () => {
    /*
      Die Zeile, die beide Regeln auseinanderhält. Stünden sie eines Tages
      auf derselben Zahl, wäre eine von beiden überflüssig – und das soll
      eine Entscheidung sein, keine Nebenwirkung.
    */
    expect(BEHERRSCHT_AB_FACH).toBeLessThan(LEITNER_BOX_MAX);
  });
});

describe('Eine einzelne Vokabel', () => {
  it('ist offen, wenn sie nie geübt wurde', () => {
    expect(beherrschungVon(new Map(), 'v-1', BEIDE)).toBe('offen');
  });

  it('ist offen in Fach 3', () => {
    const staende = new Map([stand('v-1', 'en-de', 3), stand('v-1', 'de-en', 3)]);
    expect(beherrschungVon(staende, 'v-1', BEIDE)).toBe('offen');
  });

  it('ist beherrscht in Fach 4 in allen aktiven Richtungen', () => {
    const staende = new Map([stand('v-1', 'en-de', 4), stand('v-1', 'de-en', 4)]);
    expect(beherrschungVon(staende, 'v-1', BEIDE)).toBe('beherrscht');
  });

  it('ist beherrscht in Fach 5', () => {
    const staende = new Map([stand('v-1', 'en-de', 5), stand('v-1', 'de-en', 5)]);
    expect(beherrschungVon(staende, 'v-1', BEIDE)).toBe('beherrscht');
  });

  it('ist offen, wenn nur eine von zwei Richtungen Fach 4 erreicht', () => {
    /*
      Erkennen ist nicht Können. Eine Zählung, die die leichtere Richtung
      genügen liesse, zählte ein Können, das es nicht gibt.
    */
    const staende = new Map([stand('v-1', 'en-de', 5), stand('v-1', 'de-en', 3)]);
    expect(beherrschungVon(staende, 'v-1', BEIDE)).toBe('offen');
  });

  it('ist offen, wenn eine aktive Richtung ganz fehlt', () => {
    const staende = new Map([stand('v-1', 'en-de', 5)]);
    expect(beherrschungVon(staende, 'v-1', BEIDE)).toBe('offen');
  });

  it('zählt bei nur einer aktiven Richtung auch nur diese', () => {
    const staende = new Map([stand('v-1', 'en-de', 4)]);
    expect(beherrschungVon(staende, 'v-1', ['en-de'])).toBe('beherrscht');
  });

  it('ist ohne aktive Richtung offen, nicht beherrscht', () => {
    /*
      `every` über eine leere Liste ist wahr – ein Paket ohne
      Richtungsangabe käme sonst als „alles beherrscht" heraus.
    */
    const staende = new Map([stand('v-1', 'en-de', 5)]);
    expect(beherrschungVon(staende, 'v-1', [])).toBe('offen');
  });
});

describe('Die Zählung', () => {
  it('nimmt die Gesamtzahl aus den Vokabeln, nicht aus den Lernständen', () => {
    /*
      Der Unterschied, der am ersten Tag sichtbar wird: Drei Vokabeln im
      Paket, eine geübt. Aus den Lernständen käme „1 von 1" – eine erfundene
      Vollständigkeit.
    */
    const staende = new Map([stand('v-1', 'en-de', 5), stand('v-1', 'de-en', 5)]);
    expect(zaehleBeherrschung(['v-1', 'v-2', 'v-3'], staende, BEIDE)).toEqual({
      beherrscht: 1,
      offen: 2,
      gesamt: 3,
    });
  });

  it('kommt bei leerem Paket auf lauter Nullen', () => {
    expect(zaehleBeherrschung([], new Map(), BEIDE)).toEqual({
      beherrscht: 0,
      offen: 0,
      gesamt: 0,
    });
  });

  it('ergibt beherrscht plus offen immer die Gesamtzahl', () => {
    const staende = new Map([
      stand('v-1', 'en-de', 4),
      stand('v-1', 'de-en', 4),
      stand('v-2', 'en-de', 4),
      stand('v-2', 'de-en', 1),
    ]);
    const gezaehlt = zaehleBeherrschung(['v-1', 'v-2', 'v-3', 'v-4'], staende, BEIDE);
    expect(gezaehlt.beherrscht + gezaehlt.offen).toBe(gezaehlt.gesamt);
    expect(gezaehlt).toEqual({ beherrscht: 1, offen: 3, gesamt: 4 });
  });

  it('zieht mehrere Pakete zusammen', () => {
    expect(
      summiereBeherrschung([
        { beherrscht: 3, offen: 7, gesamt: 10 },
        { beherrscht: 1, offen: 1, gesamt: 2 },
      ]),
    ).toEqual({ beherrscht: 4, offen: 8, gesamt: 12 });
  });

  it('summiert eine leere Liste zu Nullen', () => {
    expect(summiereBeherrschung([])).toEqual({ beherrscht: 0, offen: 0, gesamt: 0 });
  });
});

describe('„Sicher gelernt" bleibt unverändert', () => {
  it('verlangt weiterhin Fach 5 in allen Richtungen', () => {
    /*
      Die Zusage an die vier Ansichten, die `isEntryMastered` benutzen: Was
      dort „sicher gelernt" heisst, heisst es weiterhin. Fach 4 ist auf
      „Mein Fortschritt" beherrscht und hier ausdrücklich **nicht** sicher.
    */
    const vier = new Map([stand('v-1', 'en-de', 4), stand('v-1', 'de-en', 4)]);
    expect(isEntryMastered(vier, 'v-1', BEIDE)).toBe(false);
    expect(beherrschungVon(vier, 'v-1', BEIDE)).toBe('beherrscht');

    const fuenf = new Map([stand('v-1', 'en-de', 5), stand('v-1', 'de-en', 5)]);
    expect(isEntryMastered(fuenf, 'v-1', BEIDE)).toBe(true);
  });

  it('und auch dort genügt eine Richtung nicht', () => {
    const gemischt = new Map([stand('v-1', 'en-de', 5), stand('v-1', 'de-en', 4)]);
    expect(isEntryMastered(gemischt, 'v-1', BEIDE)).toBe(false);
  });
});
