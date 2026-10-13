import { describe, expect, it } from 'vitest';
import {
  type Werkstattstand,
  anfang,
  fertigerEntwurf,
  istFertig,
  werkstattZug,
} from './zustand';

/**
 * Der Ablauf der Werkstatt als reiner Zustandsautomat.
 *
 * ## Warum getrennt von der Oberfläche
 *
 * Weil „was darf jetzt passieren" eine fachliche Frage ist und keine
 * Darstellungsfrage. Hier lässt sie sich beantworten, ohne ein React zu
 * starten — und die Oberfläche darüber hat dann keine eigene Meinung mehr,
 * die von dieser abweichen könnte.
 */

const ZWEISPALTIG = 'house\tHaus\ncar\tAuto\ntree\tBaum';

function bisVorschau(): Werkstattstand {
  const gelesen = werkstattZug(anfang(), { art: 'text-eingefuegt', text: ZWEISPALTIG });
  expect(gelesen.schritt).toBe('vorschau');
  return gelesen;
}

describe('der Weg durch die Werkstatt', () => {
  it('beginnt leer und ohne Vorschau', () => {
    const stand = anfang();
    expect(stand.schritt).toBe('quelle');
    expect(stand.zeilen).toHaveLength(0);
    expect(istFertig(stand)).toBe(false);
  });

  it('kommt mit eingefügtem Text in die Vorschau', () => {
    const stand = bisVorschau();
    expect(stand.zeilen).toHaveLength(3);
    expect(stand.erkennung?.art).toBe('tabelle');
    expect(stand.befund?.errors).toBe(0);
  });

  it('kennt den Zustand „liest gerade"', () => {
    const stand = werkstattZug(anfang(), { art: 'datei-gewaehlt', name: 'liste.csv' });
    expect(stand.schritt).toBe('liest');
    expect(stand.dateiname).toBe('liste.csv');
  });

  it('zeigt eine fehlerhafte Datei als Fehler, nicht als leere Vorschau', () => {
    const stand = werkstattZug(anfang(), {
      art: 'datei-gelesen',
      quelle: { art: 'datei', name: 'kaputt.vocabpack.json', groesse: 12, inhalt: '{nope' },
    });
    expect(stand.schritt).toBe('fehler');
    expect(stand.meldung).toBeTruthy();
    expect(stand.zeilen).toHaveLength(0);
  });

  it('lehnt eine zu große Datei ab und sagt die Grenze', () => {
    const stand = werkstattZug(anfang(), {
      art: 'datei-gelesen',
      quelle: { art: 'datei', name: 'riesig.csv', groesse: 99 * 1024 * 1024, inhalt: 'a;b' },
    });
    expect(stand.schritt).toBe('fehler');
    expect(stand.meldung).toMatch(/MB|Teile/);
  });

  it('geht von der Vorschau zurück zur Quelle, ohne Reste stehen zu lassen', () => {
    const zurueck = werkstattZug(bisVorschau(), { art: 'verworfen' });
    expect(zurueck.schritt).toBe('quelle');
    expect(zurueck.zeilen).toHaveLength(0);
    expect(zurueck.erkennung).toBeUndefined();
  });
});

describe('die Vorschau lässt sich korrigieren', () => {
  it('übernimmt eine geänderte Zeile', () => {
    const stand = bisVorschau();
    const geaendert = stand.zeilen.map((zeile) =>
      zeile.english === 'tree' ? { ...zeile, german: 'Baum; Stammbaum' } : zeile,
    );
    const danach = werkstattZug(stand, { art: 'zeilen-geaendert', zeilen: geaendert });
    expect(danach.zeilen.find((z) => z.english === 'tree')?.german).toBe('Baum; Stammbaum');
  });

  it('wirft die Korrektur bei einer neuen Erkennung nicht weg', () => {
    const stand = bisVorschau();
    const geaendert = stand.zeilen.map((zeile) =>
      zeile.english === 'tree' ? { ...zeile, german: 'Baum; Stammbaum' } : zeile,
    );
    const mitKorrektur = werkstattZug(stand, { art: 'zeilen-geaendert', zeilen: geaendert });
    const neu = werkstattZug(mitKorrektur, {
      art: 'neu-erkannt',
      optionen: { mehrfachbedeutungenTrennen: false },
    });
    expect(neu.schritt).toBe('vorschau');
    expect(neu.zeilen.find((z) => z.english === 'tree')?.german).toBe('Baum; Stammbaum');
  });

  it('nimmt einen Titel entgegen', () => {
    const stand = werkstattZug(bisVorschau(), { art: 'titel-geaendert', titel: 'Unit 3' });
    expect(stand.titel).toBe('Unit 3');
  });
});

describe('fertig heißt wirklich fertig', () => {
  it('ist ohne Titel nicht fertig', () => {
    expect(istFertig(bisVorschau())).toBe(false);
  });

  it('ist mit Titel und fehlerfreien Zeilen fertig', () => {
    const stand = werkstattZug(bisVorschau(), { art: 'titel-geaendert', titel: 'Unit 3' });
    expect(istFertig(stand)).toBe(true);
  });

  it('ist mit einem blockierenden Fehler nicht fertig', () => {
    const roh = werkstattZug(anfang(), { art: 'text-eingefuegt', text: 'house\tHaus\ncar\t' });
    const stand = werkstattZug(roh, { art: 'titel-geaendert', titel: 'Unit 3' });
    expect(stand.befund?.errors).toBeGreaterThan(0);
    expect(istFertig(stand)).toBe(false);
  });

  it('liefert einen Entwurf mit Titel und Einträgen', () => {
    const stand = werkstattZug(bisVorschau(), { art: 'titel-geaendert', titel: 'Unit 3' });
    const entwurf = fertigerEntwurf(stand);
    expect(entwurf).toBeDefined();
    expect(entwurf?.titel).toBe('Unit 3');
    expect(entwurf?.eintraege).toHaveLength(3);
    expect(entwurf?.eintraege[0]?.english).toBe('house');
  });

  it('liefert keinen Entwurf, solange etwas offen ist', () => {
    expect(fertigerEntwurf(bisVorschau())).toBeUndefined();
  });

  it('nimmt abgewählte Zeilen nicht mit', () => {
    const stand = werkstattZug(bisVorschau(), { art: 'titel-geaendert', titel: 'Unit 3' });
    const ohneAuto = stand.zeilen.map((zeile) =>
      zeile.english === 'car' ? { ...zeile, include: false } : zeile,
    );
    const danach = werkstattZug(stand, { art: 'zeilen-geaendert', zeilen: ohneAuto });
    expect(fertigerEntwurf(danach)?.eintraege).toHaveLength(2);
  });
});
