import { describe, expect, it } from 'vitest';
import {
  GRENZE_BYTES,
  GRENZE_ZEILEN,
  erkenneQuelle,
  importiereDatei,
  importiereText,
  verschmelzeNeuerkennung,
} from './universal';

/**
 * Der eine Eingang in den Import.
 *
 * ## Warum es ihn gibt
 *
 * Alles, was hier benutzt wird, stand schon da: `parseCsv`,
 * `parsePastedText`, `readXlsx`, `looksStructured`, `parseStructuredList`,
 * `detectColumns`, `buildDrafts`, `validateDrafts`. Was fehlte, war die
 * Entscheidung **welches davon** — die traf bisher ein Radiobutton in
 * `ImportWizardPage.tsx`. Eine Lehrkraft, die eine Liste aus Excel kopiert,
 * soll nicht erst erklären müssen, was sie da kopiert hat.
 *
 * ## Das messbare Ziel
 *
 * Eine einfache zweispaltige Liste wird ohne manuelle Spaltenzuordnung
 * richtig erkannt — Englisch links, Deutsch rechts, in dieser Reihenfolge
 * oder umgekehrt, mit Kopfzeile oder ohne.
 */

const ZWEISPALTIG_TAB = 'house\tHaus\ncar\tAuto\ntree\tBaum';
const ZWEISPALTIG_KOMMA = 'house,Haus\ncar,Auto\ntree,Baum';
const ZWEISPALTIG_SEMIKOLON = 'house;Haus\ncar;Auto\ntree;Baum';
const MIT_KOPFZEILE = 'English\tDeutsch\nhouse\tHaus\ncar\tAuto';
const UMGEKEHRT = 'Haus\thouse\nAuto\tcar\nBaum\ttree';

describe('das messbare Ziel: zweispaltig ohne Zutun', () => {
  it.each([
    ['Tabulator', ZWEISPALTIG_TAB],
    ['Komma', ZWEISPALTIG_KOMMA],
    ['Semikolon', ZWEISPALTIG_SEMIKOLON],
  ])('erkennt eine mit %s getrennte Liste', (_name, text) => {
    const ergebnis = importiereText(text);
    expect(ergebnis.art).toBe('gelesen');
    if (ergebnis.art !== 'gelesen') return;

    expect(ergebnis.zeilen).toHaveLength(3);
    expect(ergebnis.zeilen.map((zeile) => zeile.english)).toEqual(['house', 'car', 'tree']);
    expect(ergebnis.zeilen.map((zeile) => zeile.german)).toEqual(['Haus', 'Auto', 'Baum']);
    expect(ergebnis.befund.errors).toBe(0);
  });

  it('nimmt eine Kopfzeile als Kopfzeile und nicht als Vokabel', () => {
    const ergebnis = importiereText(MIT_KOPFZEILE);
    expect(ergebnis.art).toBe('gelesen');
    if (ergebnis.art !== 'gelesen') return;
    expect(ergebnis.zeilen).toHaveLength(2);
    expect(ergebnis.zeilen[0]?.english).toBe('house');
  });

  it('dreht die Spalten, wenn Deutsch links steht', () => {
    const ergebnis = importiereText(UMGEKEHRT);
    expect(ergebnis.art).toBe('gelesen');
    if (ergebnis.art !== 'gelesen') return;
    expect(ergebnis.zeilen.map((zeile) => zeile.english)).toEqual(['house', 'car', 'tree']);
  });
});

describe('die Erkennung sagt, was sie erkannt hat', () => {
  it('nennt die Art und begründet sie in einem Satz', () => {
    const erkennung = erkenneQuelle({ art: 'text', text: ZWEISPALTIG_TAB });
    expect(erkennung.art).toBe('tabelle');
    expect(erkennung.trennzeichen).toBe('\t');
    expect(erkennung.begruendung.length).toBeGreaterThan(10);
    expect(erkennung.sicher).toBe(true);
  });

  it('erkennt eine strukturierte Liste als solche', () => {
    const text = [
      'house (n.)',
      'translation: Haus',
      'example: We live in a small house.',
      '',
      'car (n.)',
      'translation: Auto',
    ].join('\n');
    expect(erkenneQuelle({ art: 'text', text }).art).toBe('strukturierte-liste');
  });

  it('erkennt ein LexiFlow-Paket an seiner Datei', () => {
    const erkennung = erkenneQuelle({
      art: 'datei',
      name: 'unit-3.vocabpack.json',
      groesse: 120,
      inhalt: '{"formatVersion":3}',
    });
    expect(erkennung.art).toBe('lexiflow-paket');
  });

  it('erkennt ein Tabellenblatt an seiner Endung', () => {
    const erkennung = erkenneQuelle({
      art: 'datei',
      name: 'liste.xlsx',
      groesse: 4096,
      inhalt: new ArrayBuffer(8),
    });
    expect(erkennung.art).toBe('tabellenblatt');
  });

  it('ist bei einer einspaltigen Liste ausdrücklich unsicher', () => {
    /*
      Eine Spalte heisst: Es fehlt die Übersetzung. Die Erkennung darf das
      nicht als „erkannt" ausgeben — sonst steht in der Vorschau eine Liste
      aus lauter Fehlern, und niemand weiss, ob der Import oder die Datei
      schuld ist.
    */
    const erkennung = erkenneQuelle({ art: 'text', text: 'house\ncar\ntree' });
    expect(erkennung.sicher).toBe(false);
  });
});

describe('die Pflichtzustände', () => {
  it('leer', () => {
    expect(importiereText('   \n  \n').art).toBe('leer');
  });

  it('zu gross — Text', () => {
    const ergebnis = importiereText('a\tb\n'.repeat(GRENZE_ZEILEN + 5));
    expect(ergebnis.art).toBe('zu-gross');
    if (ergebnis.art !== 'zu-gross') return;
    expect(ergebnis.grenze).toBe(GRENZE_ZEILEN);
  });

  it('zu gross — Datei', () => {
    const ergebnis = importiereDatei({
      art: 'datei',
      name: 'riesig.csv',
      groesse: GRENZE_BYTES + 1,
      inhalt: 'a;b',
    });
    expect(ergebnis.art).toBe('zu-gross');
  });

  it('fehlerhafte Datei', () => {
    const ergebnis = importiereDatei({
      art: 'datei',
      name: 'kaputt.vocabpack.json',
      groesse: 20,
      inhalt: '{nicht json',
    });
    expect(ergebnis.art).toBe('fehler');
    if (ergebnis.art !== 'fehler') return;
    expect(ergebnis.grund).toMatch(/JSON|Datei/);
  });

  it('Duplikate werden gezählt, nicht verschwiegen', () => {
    const ergebnis = importiereText('house\tHaus\nhouse\tGebäude');
    expect(ergebnis.art).toBe('gelesen');
    if (ergebnis.art !== 'gelesen') return;
    expect(ergebnis.befund.duplicates).toBeGreaterThan(0);
  });

  it('teilweise unsicher: eine fehlende Übersetzung ist ein Fehler, kein stiller Verlust', () => {
    const ergebnis = importiereText('house\tHaus\ncar\t');
    expect(ergebnis.art).toBe('gelesen');
    if (ergebnis.art !== 'gelesen') return;
    expect(ergebnis.zeilen).toHaveLength(2);
    expect(ergebnis.befund.errors).toBeGreaterThan(0);
  });

  it('erfolgreich geprüft: eine saubere Liste hat keine Befunde', () => {
    const ergebnis = importiereText(ZWEISPALTIG_TAB);
    expect(ergebnis.art).toBe('gelesen');
    if (ergebnis.art !== 'gelesen') return;
    expect(ergebnis.befund.errors).toBe(0);
    expect(ergebnis.befund.duplicates).toBe(0);
    expect(ergebnis.befund.selected).toBe(3);
  });
});

describe('Lehrkrafteingaben überleben eine neue Erkennung', () => {
  it('behält die Handkorrektur und übernimmt den Rest', () => {
    const erst = importiereText(ZWEISPALTIG_TAB);
    expect(erst.art).toBe('gelesen');
    if (erst.art !== 'gelesen') return;

    // Die Lehrkraft bessert eine Übersetzung aus.
    const bearbeitet = erst.zeilen.map((zeile) =>
      zeile.english === 'tree' ? { ...zeile, german: 'Baum; Stammbaum' } : zeile,
    );

    // Dieselbe Quelle, nur mit anderem Trennzeichen neu gelesen.
    const nochmal = importiereText('house\tHaus\ncar\tWagen\ntree\tBaum');
    expect(nochmal.art).toBe('gelesen');
    if (nochmal.art !== 'gelesen') return;

    const verschmolzen = verschmelzeNeuerkennung({
      vorherErzeugt: erst.zeilen,
      bearbeitet,
      neuErzeugt: nochmal.zeilen,
    });

    const nachWort = (wort: string) => verschmolzen.find((z) => z.english === wort);
    // Von Hand geändert: bleibt stehen.
    expect(nachWort('tree')?.german).toBe('Baum; Stammbaum');
    // Nicht angefasst: übernimmt die neue Lesung.
    expect(nachWort('car')?.german).toBe('Wagen');
  });

  it('behält auch eine abgewählte Zeile abgewählt', () => {
    const erst = importiereText(ZWEISPALTIG_TAB);
    if (erst.art !== 'gelesen') throw new Error('Vorbedingung');
    const bearbeitet = erst.zeilen.map((zeile) =>
      zeile.english === 'car' ? { ...zeile, include: false } : zeile,
    );
    const verschmolzen = verschmelzeNeuerkennung({
      vorherErzeugt: erst.zeilen,
      bearbeitet,
      neuErzeugt: erst.zeilen,
    });
    expect(verschmolzen.find((z) => z.english === 'car')?.include).toBe(false);
  });

  it('verliert eine von Hand ergänzte Zeile nicht', () => {
    const erst = importiereText(ZWEISPALTIG_TAB);
    if (erst.art !== 'gelesen') throw new Error('Vorbedingung');
    const eigene = { ...erst.zeilen[0]!, id: 'eigene-1', english: 'bike', german: 'Fahrrad' };
    const verschmolzen = verschmelzeNeuerkennung({
      vorherErzeugt: erst.zeilen,
      bearbeitet: [...erst.zeilen, eigene],
      neuErzeugt: erst.zeilen,
    });
    expect(verschmolzen.map((z) => z.english)).toContain('bike');
  });
});
