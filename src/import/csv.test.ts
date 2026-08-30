import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv, parsePastedText, stripBom } from './csv';

describe('detectDelimiter', () => {
  it('erkennt Semikolon (deutsches Excel)', () => {
    expect(detectDelimiter('a;b;c\nd;e;f')).toBe(';');
  });

  it('erkennt Komma', () => {
    expect(detectDelimiter('a,b\nc,d')).toBe(',');
  });

  it('erkennt Tabulator', () => {
    expect(detectDelimiter('a\tb\nc\td')).toBe('\t');
  });
});

describe('parseCsv', () => {
  it('liest Kopfzeile und Datenzeilen', () => {
    expect(parseCsv('Englisch;Deutsch\ncrowded;überfüllt')).toEqual([
      ['Englisch', 'Deutsch'],
      ['crowded', 'überfüllt'],
    ]);
  });

  it('beachtet Anführungszeichen und eingebettete Trennzeichen', () => {
    expect(parseCsv('a;"b;c";d')).toEqual([['a', 'b;c', 'd']]);
  });

  it('verarbeitet verdoppelte Anführungszeichen', () => {
    expect(parseCsv('a;"sagt ""hallo"""')).toEqual([['a', 'sagt "hallo"']]);
  });

  it('verarbeitet Zeilenumbrüche innerhalb von Feldern', () => {
    expect(parseCsv('a;"Zeile1\nZeile2"')).toEqual([['a', 'Zeile1\nZeile2']]);
  });

  it('entfernt BOM und Leerzeilen', () => {
    expect(parseCsv('﻿a;b\n\n\nc;d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('kommt mit CRLF zurecht', () => {
    expect(parseCsv('a;b\r\nc;d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('stripBom', () => {
  it('entfernt nur ein führendes BOM', () => {
    expect(stripBom('﻿text')).toBe('text');
    expect(stripBom('text')).toBe('text');
  });
});

describe('parsePastedText', () => {
  it('trennt an Tabulatoren', () => {
    expect(parsePastedText('crowded\tüberfüllt\nlitter\tMüll')).toEqual([
      ['crowded', 'überfüllt'],
      ['litter', 'Müll'],
    ]);
  });

  it('trennt an Gedankenstrichen mit Leerzeichen', () => {
    expect(parsePastedText('to apologise – sich entschuldigen')).toEqual([
      ['to apologise', 'sich entschuldigen'],
    ]);
  });

  it('lässt Bindestriche in Wörtern unberührt', () => {
    expect(parsePastedText('well-known\tbekannt')).toEqual([['well-known', 'bekannt']]);
  });

  it('trennt an Komma, wenn nichts anderes vorkommt', () => {
    expect(parsePastedText('quiet, ruhig')).toEqual([['quiet', 'ruhig']]);
  });

  it('liefert einspaltige Zeilen, wenn kein Trennzeichen erkennbar ist', () => {
    expect(parsePastedText('crowded\nlitter')).toEqual([['crowded'], ['litter']]);
  });
});
