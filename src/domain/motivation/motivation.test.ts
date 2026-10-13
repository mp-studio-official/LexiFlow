import { describe, expect, it } from 'vitest';
import { LERNTAG_SCHWELLE } from '../lernserie';
import {
  AUSZEICHNUNGEN,
  type Grundlage,
  auszeichnungen,
  frischErreicht,
  rundenfortschritt,
  tagesstand,
  tageszielSatz,
} from './index';

/**
 * Motivation ohne Überwachung und ohne Vergleich.
 *
 * ## Die Linie, die hier nicht überschritten wird
 *
 * Alles, was diese Datei berechnet, ist aus dem **eigenen**, ohnehin
 * zulässigen Lernstand ableitbar. Es entsteht kein neues Datum über eine
 * Person, nichts wird an eine Lehrkraft gemeldet, und nichts vergleicht
 * zwei Lernende miteinander. Das ist keine Vorsichtsmaßnahme, sondern das
 * Produktversprechen in Code.
 */

const leer: Grundlage = {
  lerntage: [],
  beherrschung: { beherrscht: 0, offen: 0, gesamt: 0 },
  paketstaende: [],
};

describe('das Tagesziel', () => {
  it('zählt die heute beantworteten Aufgaben gegen die Lerntagsschwelle', () => {
    const stand = tagesstand({ localDay: '2026-10-13', taskCount: 4 });
    expect(stand.ziel).toBe(LERNTAG_SCHWELLE);
    expect(stand.geschafft).toBe(4);
    expect(stand.offen).toBe(LERNTAG_SCHWELLE - 4);
    expect(stand.erfuellt).toBe(false);
  });

  it('ist erfüllt und bleibt es, auch wenn jemand weit darüber hinausgeht', () => {
    const stand = tagesstand({ localDay: '2026-10-13', taskCount: 40 });
    expect(stand.erfuellt).toBe(true);
    expect(stand.offen).toBe(0);
  });

  it('kommt ohne Tag zurecht — der Tag hat dann noch nicht angefangen', () => {
    const stand = tagesstand(undefined);
    expect(stand.geschafft).toBe(0);
    expect(stand.erfuellt).toBe(false);
  });

  it('sagt „noch …", solange etwas offen ist', () => {
    expect(tageszielSatz(tagesstand({ localDay: 'x', taskCount: 6 }))).toMatch(/Noch 4/);
  });

  it('lobt beim Erreichen, ohne zum Weitermachen zu drängen', () => {
    const satz = tageszielSatz(tagesstand({ localDay: 'x', taskCount: 10 }));
    expect(satz).toMatch(/geschafft/i);
    expect(satz).not.toMatch(/noch|weiter|mehr/i);
  });
});

describe('der Rundenfortschritt', () => {
  it('zählt beantwortet von gesamt', () => {
    const stand = rundenfortschritt(7, 20);
    expect(stand.beantwortet).toBe(7);
    expect(stand.gesamt).toBe(20);
    expect(stand.label).toBe('7 von 20');
    expect(stand.anteil).toBeCloseTo(0.35);
  });

  it('ist bei null Aufgaben nicht kaputt', () => {
    const stand = rundenfortschritt(0, 0);
    expect(stand.anteil).toBe(0);
    expect(stand.abgeschlossen).toBe(false);
  });

  it('erkennt den Abschluss', () => {
    expect(rundenfortschritt(20, 20).abgeschlossen).toBe(true);
  });

  it('lässt sich nicht über das Ende hinausschieben', () => {
    const stand = rundenfortschritt(25, 20);
    expect(stand.beantwortet).toBe(20);
    expect(stand.anteil).toBe(1);
  });
});

describe('die Auszeichnungen', () => {
  it('gibt es alle, auch die noch nicht erreichten', () => {
    const liste = auszeichnungen(leer);
    expect(liste).toHaveLength(AUSZEICHNUNGEN.length);
    expect(liste.every((eintrag) => !eintrag.erreicht)).toBe(true);
  });

  it('erkennt den ersten vollen Lerntag', () => {
    const liste = auszeichnungen({
      ...leer,
      lerntage: [{ localDay: '2026-10-12', taskCount: LERNTAG_SCHWELLE }],
    });
    expect(liste.find((e) => e.schluessel === 'erster-lerntag')?.erreicht).toBe(true);
  });

  it('zählt einen halben Lerntag nicht als Lerntag', () => {
    const liste = auszeichnungen({
      ...leer,
      lerntage: [{ localDay: '2026-10-12', taskCount: LERNTAG_SCHWELLE - 1 }],
    });
    expect(liste.find((e) => e.schluessel === 'erster-lerntag')?.erreicht).toBe(false);
  });

  it('erkennt eine Woche am Stück', () => {
    const mitSerie = auszeichnungen({
      ...leer,
      serie: { laenge: 7, laengste: 7, heuteGeschafft: true, ruhetageVerbraucht: 0, ruhetageUebrig: 2 },
    });
    expect(mitSerie.find((e) => e.schluessel === 'woche-dabei')?.erreicht).toBe(true);
  });

  it('erkennt zehn und fünfzig beherrschte Wörter', () => {
    const zehn = auszeichnungen({ ...leer, beherrschung: { beherrscht: 10, offen: 5, gesamt: 15 } });
    expect(zehn.find((e) => e.schluessel === 'zehn-beherrscht')?.erreicht).toBe(true);
    expect(zehn.find((e) => e.schluessel === 'fuenfzig-beherrscht')?.erreicht).toBe(false);
  });

  it('erkennt ein vollständig beherrschtes Paket — aber kein leeres', () => {
    const voll = auszeichnungen({
      ...leer,
      paketstaende: [{ beherrscht: 12, offen: 0, gesamt: 12 }],
    });
    expect(voll.find((e) => e.schluessel === 'paket-beherrscht')?.erreicht).toBe(true);

    const leeresPaket = auszeichnungen({
      ...leer,
      paketstaende: [{ beherrscht: 0, offen: 0, gesamt: 0 }],
    });
    expect(leeresPaket.find((e) => e.schluessel === 'paket-beherrscht')?.erreicht).toBe(false);
  });

  it('erkennt ein erreichtes Wochenziel — und ohne Ziel gibt es nichts zu erreichen', () => {
    const erreicht = auszeichnungen({ ...leer, wochenziel: 3, lerntageDerWoche: 3 });
    expect(erreicht.find((e) => e.schluessel === 'wochenziel')?.erreicht).toBe(true);

    const ohneZiel = auszeichnungen({ ...leer, lerntageDerWoche: 7 });
    expect(ohneZiel.find((e) => e.schluessel === 'wochenziel')?.erreicht).toBe(false);
  });

  it('zeigt bei offenen Auszeichnungen den eigenen Stand, nie einen Vergleich', () => {
    const liste = auszeichnungen({ ...leer, beherrschung: { beherrscht: 3, offen: 7, gesamt: 10 } });
    const zehn = liste.find((e) => e.schluessel === 'zehn-beherrscht');
    expect(zehn?.stand).toEqual({ wert: 3, ziel: 10 });
  });
});

describe('was die Auszeichnungen ausdrücklich nicht belohnen', () => {
  it('kein Tempo: dieselbe Grundlage, ob in einer Minute oder in einer Stunde erreicht', () => {
    /*
      `Grundlage` hat kein Feld für Dauer, Geschwindigkeit oder Uhrzeit.
      Das ist die Prüfung: Was nicht hereinkommt, kann nicht belohnt werden.
    */
    const felder = Object.keys({
      lerntage: [],
      beherrschung: { beherrscht: 0, offen: 0, gesamt: 0 },
      paketstaende: [],
      serie: undefined,
      wochenziel: undefined,
      lerntageDerWoche: undefined,
    } satisfies Record<keyof Grundlage, unknown>);
    for (const feld of felder) {
      expect(feld).not.toMatch(/zeit|dauer|sekund|tempo|schnell/i);
    }
  });

  it('keine Strafe: eine abgerissene Serie nimmt keine erreichte Auszeichnung weg', () => {
    const waehrend = auszeichnungen({
      ...leer,
      serie: { laenge: 9, laengste: 9, heuteGeschafft: true, ruhetageVerbraucht: 0, ruhetageUebrig: 2 },
    });
    const danach = auszeichnungen({
      ...leer,
      serie: { laenge: 0, laengste: 9, heuteGeschafft: false, ruhetageVerbraucht: 2, ruhetageUebrig: 0 },
    });
    const wochenweise = (liste: typeof waehrend) =>
      liste.find((e) => e.schluessel === 'woche-dabei')?.erreicht;
    expect(wochenweise(waehrend)).toBe(true);
    // Die längste Serie zählt: Erreichtes bleibt erreicht.
    expect(wochenweise(danach)).toBe(true);
  });

  it('kein Text drängt, droht oder vergleicht', () => {
    for (const eintrag of auszeichnungen(leer)) {
      expect(`${eintrag.titel} ${eintrag.satz}`).not.toMatch(
        /verlier|verloren|besser als|andere|Platz|Rang|schneller|sofort|nur noch heute/i,
      );
    }
  });
});

describe('frisch erreicht — wofür gefeiert wird', () => {
  it('nennt genau das, was vorher nicht erreicht war', () => {
    const vorher = auszeichnungen(leer);
    const nachher = auszeichnungen({
      ...leer,
      lerntage: [{ localDay: '2026-10-12', taskCount: LERNTAG_SCHWELLE }],
    });
    const frisch = frischErreicht(vorher, nachher);
    expect(frisch.map((e) => e.schluessel)).toEqual(['erster-lerntag']);
  });

  it('nennt nichts, wenn sich nichts geändert hat', () => {
    const gleich = auszeichnungen(leer);
    expect(frischErreicht(gleich, gleich)).toEqual([]);
  });

  it('nennt nichts, wenn etwas verloren ginge — Feiern ist nicht umkehrbar', () => {
    const vorher = auszeichnungen({ ...leer, beherrschung: { beherrscht: 10, offen: 0, gesamt: 10 } });
    const nachher = auszeichnungen(leer);
    expect(frischErreicht(vorher, nachher)).toEqual([]);
  });
});
