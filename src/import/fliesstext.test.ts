import { describe, expect, it } from 'vitest';
import { erkenneQuelle, importiereText } from './universal';
import { SCOTLAND_WALES } from '../testdaten/scotlandWales';

/**
 * Fließtext ist eine eigene Quellenart — die Gegenprobe in beide Richtungen.
 *
 * ## Warum beide Richtungen in einer Datei stehen
 *
 * Weil eine Erkennung nur zusammen etwas wert ist. „Erkennt den Text" ist
 * mit einer Regel zu haben, die alles für Text hält; „erkennt die Liste"
 * ebenso, mit der umgekehrten. Erst die Forderung, dass **dieselbe** Regel
 * beides auseinanderhält, prüft etwas. Wer hier eine Schwelle verschiebt,
 * sieht sofort, auf welcher Seite er dafür bezahlt.
 */

const EINSPALTIG = [
  'island',
  'parliament',
  'tradition',
  'to celebrate',
  'to depend on',
  'proud',
  'symbol',
  'choir',
  'coal mine',
  'separate',
].join('\n');

const ZWEISPALTIG = [
  'island\tdie Insel',
  'parliament\tdas Parlament',
  'tradition\tdie Tradition',
  'to celebrate\tfeiern',
  'to depend on\tabhängen von',
  'proud\tstolz',
  'symbol\tdas Symbol',
  'choir\tder Chor',
].join('\n');

describe('Fließtext wird als eigene Quellenart erkannt', () => {
  it('erkennt den Scotland/Wales-Text als Fließtext und nicht als Liste', () => {
    const erkennung = erkenneQuelle({ art: 'text', text: SCOTLAND_WALES });
    expect(erkennung.art).toBe('fliesstext');
    expect(erkennung.sicher).toBe(true);
  });

  it('gibt ihn als Fließtext weiter, statt Zeilen daraus zu bauen', () => {
    const ergebnis = importiereText(SCOTLAND_WALES);
    /*
      Die eigentliche Zusage dieses Blocks. Vorher stand hier
      `art: 'gelesen'` mit fünfzehn „Vokabeln", deren englische Seite ganze
      Absätze waren. Eine Zeile daraus wäre nicht falsch gefüllt — sie
      dürfte gar nicht entstehen.
    */
    expect(ergebnis.art).toBe('fliesstext');
    if (ergebnis.art !== 'fliesstext') throw new Error('unerreichbar');
    expect(ergebnis.text).toContain('Edinburgh');
    expect(ergebnis.erkennung.begruendung).toMatch(/zusammenhängender Text/);
  });

  it('nennt in der Begründung Sätze und Wörter, nicht Spalten', () => {
    const erkennung = erkenneQuelle({ art: 'text', text: SCOTLAND_WALES });
    expect(erkennung.begruendung).toMatch(/Sätzen/);
    expect(erkennung.begruendung).not.toMatch(/Spalten|getrennt/);
  });

  it('erkennt auch eine Textdatei mit Fließtext und nennt ihren Namen', () => {
    const erkennung = erkenneQuelle({
      art: 'datei',
      name: 'scotland.txt',
      groesse: SCOTLAND_WALES.length,
      inhalt: SCOTLAND_WALES,
    });
    expect(erkennung.art).toBe('fliesstext');
    expect(erkennung.begruendung).toContain('scotland.txt');
  });
});

describe('Listen bleiben Listen — die Gegenrichtung', () => {
  it('hält eine einspaltige Vokabelliste nicht für Fließtext', () => {
    const erkennung = erkenneQuelle({ art: 'text', text: EINSPALTIG });
    expect(erkennung.art).toBe('eingefuegte-liste');
  });

  it('liest die einspaltige Liste weiterhin zu Zeilen', () => {
    const ergebnis = importiereText(EINSPALTIG);
    expect(ergebnis.art).toBe('gelesen');
    if (ergebnis.art !== 'gelesen') throw new Error('unerreichbar');
    expect(ergebnis.zeilen).toHaveLength(10);
    expect(ergebnis.zeilen[0]?.english).toBe('island');
  });

  it('hält eine zweispaltige Tabelle nicht für Fließtext', () => {
    const erkennung = erkenneQuelle({ art: 'text', text: ZWEISPALTIG });
    expect(erkennung.art).toBe('tabelle');
    expect(erkennung.trennzeichen).toBe('\t');
  });

  it('liest die zweispaltige Tabelle weiterhin mit beiden Seiten', () => {
    const ergebnis = importiereText(ZWEISPALTIG);
    expect(ergebnis.art).toBe('gelesen');
    if (ergebnis.art !== 'gelesen') throw new Error('unerreichbar');
    expect(ergebnis.zeilen[0]?.english).toBe('island');
    expect(ergebnis.zeilen[0]?.german).toBe('die Insel');
  });

  it('hält eine einspaltige Wendungsliste mit „sth." für keine Prosa', () => {
    /*
      Der Fall, den die Mutationsprobe aufgedeckt hat.

      „to depend on sth." endet auf einen Punkt, also zählt er als Satz,
      und mit viereinhalb Wörtern je Satz liegt die Liste über der
      Satzlängenschwelle. Was sie rettet, ist allein „Wörter je Zeile" —
      und das war vorher von keiner Prüfung belegt. Wer diese Schwelle
      entfernt, macht aus dieser Liste Prosa.
    */
    const wendungen = [
      'to depend on sth.',
      'to look forward to sth.',
      'to be proud of sth.',
      'to take part in sth.',
    ].join('\n');
    expect(erkenneQuelle({ art: 'text', text: wendungen }).art).not.toBe('fliesstext');
  });

  it('hält eine Liste von Beispielsätzen mit Übersetzung für eine Tabelle', () => {
    /*
      Der härteste Fall der Gegenrichtung: Punkte in jeder Zeile, also
      Satzschlusszeichen genug für einen Text. Die einheitliche zweite
      Spalte entscheidet vorher — deshalb steht die Tabellenprüfung vor
      der Textprüfung und nicht danach.
    */
    const satzliste = [
      'The parliament is in Edinburgh.\tDas Parlament ist in Edinburgh.',
      'People speak Welsh in Wales.\tIn Wales spricht man Walisisch.',
      'The festival celebrates art.\tDas Festival feiert die Kunst.',
    ].join('\n');
    expect(erkenneQuelle({ art: 'text', text: satzliste }).art).toBe('tabelle');
  });
});

describe('kurzer Satz und längerer Text werden unterschieden', () => {
  it('nennt einen einzelnen Satz Fließtext, aber nicht sicher', () => {
    const erkennung = erkenneQuelle({
      art: 'text',
      text: 'Scotland is in the North of Britain.',
    });
    expect(erkennung.art).toBe('fliesstext');
    expect(erkennung.sicher).toBe(false);
    expect(erkennung.begruendung).toMatch(/wenige Vorschläge/);
  });

  it('nennt den vollen Text sicher', () => {
    expect(erkenneQuelle({ art: 'text', text: SCOTLAND_WALES }).sicher).toBe(true);
  });

  it('hält eine Überschrift für keinen Fließtext', () => {
    expect(erkenneQuelle({ art: 'text', text: 'Scotland and Wales.' }).art).not.toBe('fliesstext');
  });
});
