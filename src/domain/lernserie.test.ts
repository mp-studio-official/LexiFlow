import { describe, expect, it } from 'vitest';
import {
  LERNTAG_SCHWELLE,
  RUHETAGE_JE_WOCHE,
  istLerntag,
  lerntageDieseWoche,
  serieAm,
  tagPlus,
  tageZwischen,
  wochenaktivitaet,
  type Tageszaehlung,
} from './lernserie';

/**
 * E1 und E2, Fall für Fall.
 *
 * Alle Tage hier sind Zeichenketten aus einem festen Kalender – keine
 * `new Date()`, kein `Date.now()`. Das ist nicht nur Determinismus: Es ist
 * dieselbe Zusage wie in der Datenbank (E28). Eine Prüfung, die eine Uhr
 * braucht, braucht einen Vertrag, in dem eine Uhr vorkommt.
 *
 * Der 05.10.2026 ist ein **Montag**; die Woche läuft bis Sonntag, den 11.
 */
const MONTAG = '2026-10-05';
const DIENSTAG = '2026-10-06';
const MITTWOCH = '2026-10-07';
const DONNERSTAG = '2026-10-08';
const FREITAG = '2026-10-09';

/** Ein Tag mit genug Aufgaben – die Schwelle genau getroffen. */
function voll(tag: string, aufgaben = LERNTAG_SCHWELLE): Tageszaehlung {
  return { localDay: tag, taskCount: aufgaben };
}

describe('Kalenderrechnen', () => {
  it('verschiebt Tage über Monatsgrenzen', () => {
    expect(tagPlus('2026-10-01', -1)).toBe('2026-09-30');
    expect(tagPlus('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('rechnet über einen Schalttag hinweg', () => {
    // 2028 ist ein Schaltjahr. Eine Serie darf am 29. Februar nicht reißen.
    expect(tagPlus('2028-02-28', 1)).toBe('2028-02-29');
    expect(tageZwischen('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('zählt Tage in beide Richtungen', () => {
    expect(tageZwischen(MONTAG, FREITAG)).toBe(4);
    expect(tageZwischen(FREITAG, MONTAG)).toBe(-4);
  });
});

describe('istLerntag (E1)', () => {
  it('zählt ab zehn Aufgaben', () => {
    expect(LERNTAG_SCHWELLE).toBe(10);
    expect(istLerntag(voll(MONTAG, 10))).toBe(true);
    expect(istLerntag(voll(MONTAG, 47))).toBe(true);
  });

  it('zählt bei neun noch nicht', () => {
    /*
      Die Zeile, auf die es ankommt. Neun ist kein halber Lerntag – eine
      Serie, die bei neun weiterliefe, wäre eine Aussage über Anwesenheit
      und nicht über Üben.
    */
    expect(istLerntag(voll(MONTAG, 9))).toBe(false);
  });

  it('zählt einen Tag ohne Eintrag nicht', () => {
    expect(istLerntag(undefined)).toBe(false);
    expect(istLerntag(voll(MONTAG, 0))).toBe(false);
  });
});

describe('Die Serie', () => {
  it('ist null, wenn nie etwas gezählt wurde', () => {
    expect(serieAm([], MITTWOCH, MONTAG)).toEqual({
      laenge: 0,
      heuteGeschafft: false,
      ruhetageVerbraucht: 2,
      ruhetageUebrig: 0,
    });
    /*
      Zwei verbrauchte Ruhetage bei leerer Vergangenheit sind richtig und
      sehen zunächst merkwürdig aus: Montag und Dienstag sind vorbei und
      waren keine Lerntage. Die Serie ist trotzdem 0 – es gab nie eine.
      Die Seite zeigt daraus eine Serie von null Tagen, keine Mahnung.
    */
  });

  it('zählt den heutigen Tag, sobald er geschafft ist', () => {
    const serie = serieAm([voll(MITTWOCH)], MITTWOCH, MONTAG);
    expect(serie.laenge).toBe(1);
    expect(serie.heuteGeschafft).toBe(true);
  });

  it('zählt drei Tage in Folge als drei', () => {
    const serie = serieAm([voll(MONTAG), voll(DIENSTAG), voll(MITTWOCH)], MITTWOCH, MONTAG);
    expect(serie.laenge).toBe(3);
    expect(serie.ruhetageVerbraucht).toBe(0);
  });

  it('lässt den heutigen Tag die Serie nicht kosten, solange er läuft', () => {
    /*
      Der Fall, der sonst jeden Morgen zuschlüge: Heute ist noch nichts
      geübt. Die Serie von gestern steht trotzdem – und kein Ruhetag ist
      dafür verbraucht.
    */
    const serie = serieAm([voll(MONTAG), voll(DIENSTAG)], MITTWOCH, MONTAG);
    expect(serie.laenge).toBe(2);
    expect(serie.heuteGeschafft).toBe(false);
    expect(serie.ruhetageVerbraucht).toBe(0);
  });

  it('überbrückt zwei Ruhetage in derselben Woche', () => {
    expect(RUHETAGE_JE_WOCHE).toBe(2);
    // Montag gelernt, Dienstag und Mittwoch nicht, Donnerstag wieder.
    const serie = serieAm([voll(MONTAG), voll(DONNERSTAG)], DONNERSTAG, MONTAG);
    expect(serie.laenge).toBe(2);
    expect(serie.ruhetageVerbraucht).toBe(2);
    expect(serie.ruhetageUebrig).toBe(0);
  });

  it('endet am dritten fehlenden Tag derselben Woche', () => {
    /*
      Montag gelernt, Dienstag bis Donnerstag nicht, Freitag wieder. Der
      Montag ist damit nicht mehr erreichbar: Die Serie beginnt am Freitag
      neu und ist eins.
    */
    const serie = serieAm([voll(MONTAG), voll(FREITAG)], FREITAG, MONTAG);
    expect(serie.laenge).toBe(1);
    expect(serie.ruhetageVerbraucht).toBe(2);
  });

  it('gibt jeder Kalenderwoche ihre eigenen zwei Ruhetage', () => {
    /*
      Ruhetage sind nicht ansammelbar – aber sie sind auch nicht aufgebraucht,
      weil die Woche davor welche gekostet hat. Hier: In der laufenden Woche
      zwei Ruhetage, in der Woche davor ebenfalls zwei, und die Serie läuft
      über beide hinweg.
    */
    const vorwoche = tagPlus(MONTAG, -7);
    const tage = [
      voll(vorwoche), // Montag der Vorwoche
      voll(tagPlus(vorwoche, 3)), // Donnerstag der Vorwoche (zwei Ruhetage davor)
      voll(tagPlus(vorwoche, 4)),
      voll(tagPlus(vorwoche, 5)),
      voll(tagPlus(vorwoche, 6)),
      voll(MONTAG),
      voll(DONNERSTAG), // wieder zwei Ruhetage
    ];
    const serie = serieAm(tage, DONNERSTAG, MONTAG);
    expect(serie.laenge).toBe(7);
  });

  it('sammelt ungenutzte Ruhetage nicht an', () => {
    /*
      Die Vorwoche wurde durchgelernt, kein Ruhetag verbraucht. Das schenkt
      der laufenden Woche nichts: Drei fehlende Tage beenden die Serie hier
      genauso.
    */
    const vorwoche = tagPlus(MONTAG, -7);
    const tage = [
      ...Array.from({ length: 7 }, (_, i) => voll(tagPlus(vorwoche, i))),
      voll(MONTAG),
      voll(FREITAG), // Di, Mi, Do fehlen
    ];
    const serie = serieAm(tage, FREITAG, MONTAG);
    expect(serie.laenge).toBe(1);
  });

  it('zählt Ruhetage nicht als Lerntage mit', () => {
    // „Zwei Tage" soll heißen: an zwei Tagen gelernt. Nicht: zwei Kästchen.
    const serie = serieAm([voll(MONTAG), voll(DONNERSTAG)], DONNERSTAG, MONTAG);
    expect(serie.laenge).toBe(2);
    expect(tageZwischen(MONTAG, DONNERSTAG)).toBe(3);
  });

  it('bricht nicht an einem Tag mit neun Aufgaben hinweg', () => {
    const serie = serieAm([voll(MONTAG), voll(DIENSTAG, 9), voll(MITTWOCH)], MITTWOCH, MONTAG);
    // Der Dienstag ist ein Ruhetag – kein Lerntag, aber überbrückbar.
    expect(serie.laenge).toBe(2);
    expect(serie.ruhetageVerbraucht).toBe(1);
  });
});

describe('Die Woche', () => {
  it('hat immer sieben Tage, auch ohne jede Aktivität', () => {
    const woche = wochenaktivitaet([], MITTWOCH, MONTAG);
    expect(woche).toHaveLength(7);
    expect(woche[0]!.localDay).toBe(MONTAG);
    expect(woche[6]!.localDay).toBe('2026-10-11');
    expect(woche.every((tag) => tag.taskCount === 0)).toBe(true);
  });

  it('kennzeichnet den heutigen Tag und die künftigen', () => {
    const woche = wochenaktivitaet([], MITTWOCH, MONTAG);
    expect(woche.filter((tag) => tag.heute).map((tag) => tag.localDay)).toEqual([MITTWOCH]);
    /*
      Donnerstag bis Sonntag sind nicht verpasst, sondern noch nicht dran.
      Ohne diese Unterscheidung sähe der Dienstagabend aus wie eine Woche
      mit fünf Versäumnissen.
    */
    expect(woche.filter((tag) => tag.kuenftig).map((tag) => tag.localDay)).toEqual([
      DONNERSTAG,
      FREITAG,
      '2026-10-10',
      '2026-10-11',
    ]);
  });

  it('trägt die echten Zahlen ein und markiert nur volle Tage', () => {
    const woche = wochenaktivitaet([voll(MONTAG, 12), voll(DIENSTAG, 9)], MITTWOCH, MONTAG);
    expect(woche[0]).toMatchObject({ taskCount: 12, lerntag: true });
    expect(woche[1]).toMatchObject({ taskCount: 9, lerntag: false });
    expect(woche[2]).toMatchObject({ taskCount: 0, lerntag: false, heute: true });
  });

  it('zählt für das Wochenziel nur, was schon vorbei ist', () => {
    const woche = wochenaktivitaet([voll(MONTAG), voll(DIENSTAG), voll(FREITAG)], MITTWOCH, MONTAG);
    /*
      Der Freitag steht in den Daten – etwa, weil jemand ihn in einer anderen
      Zeitzone begonnen hat. Für das Wochenziel zählt er am Mittwoch trotzdem
      nicht: Ein Ziel, das künftige Tage mitzählte, wäre am Montag erfüllt.
    */
    expect(lerntageDieseWoche(woche)).toBe(2);
  });
});

describe('Keine Uhr in diesem Modul', () => {
  it('liefert bei gleichen Eingaben immer dasselbe', () => {
    /*
      Nicht nur Determinismus: Das Modul bekommt den heutigen Tag **vom
      Server** (E28). Gäbe es hier ein `new Date()`, hinge die Serie an der
      Geräteuhr – und wäre zu stellen.
    */
    const tage = [voll(MONTAG), voll(DIENSTAG)];
    const a = serieAm(tage, MITTWOCH, MONTAG);
    const b = serieAm(tage, MITTWOCH, MONTAG);
    expect(a).toEqual(b);
  });
});
