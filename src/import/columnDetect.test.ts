import { describe, expect, it } from 'vitest';
import { detectColumns } from './columnDetect';

describe('detectColumns', () => {
  it('erkennt deutsche Kopfzeilen', () => {
    const mapping = detectColumns([
      ['Englisch', 'Deutsch', 'Beispielsatz'],
      ['crowded', 'überfüllt', 'The bus was crowded.'],
    ]);
    expect(mapping.hasHeader).toBe(true);
    expect(mapping.roles).toEqual(['english', 'german', 'example']);
  });

  it('erkennt englische Kopfzeilen', () => {
    const mapping = detectColumns([
      ['English', 'German', 'Tags'],
      ['litter', 'Müll', 'city'],
    ]);
    expect(mapping.roles).toEqual(['english', 'german', 'tags']);
  });

  it('unterscheidet Beispielsatz Deutsch von Beispielsatz Englisch', () => {
    const mapping = detectColumns([
      ['Wort', 'Übersetzung', 'Beispiel', 'Beispiel deutsch'],
      ['quiet', 'ruhig', 'It is quiet.', 'Es ist ruhig.'],
    ]);
    expect(mapping.roles[2]).toBe('example');
    expect(mapping.roles[3]).toBe('exampleGerman');
  });

  it('fällt ohne Kopfzeile auf Spalte 1 = Englisch zurück', () => {
    const mapping = detectColumns([
      ['crowded', 'überfüllt'],
      ['litter', 'Müll'],
    ]);
    expect(mapping.hasHeader).toBe(false);
    expect(mapping.roles).toEqual(['english', 'german']);
  });

  it('dreht die Reihenfolge, wenn Deutsch zuerst steht', () => {
    const mapping = detectColumns([
      ['die Nachbarschaft', 'the neighbourhood'],
      ['der Müll', 'the litter'],
    ]);
    expect(mapping.roles).toEqual(['german', 'english']);
  });

  it('kommt mit einer einzigen Spalte zurecht', () => {
    const mapping = detectColumns([['crowded'], ['litter']]);
    expect(mapping.roles).toEqual(['english']);
  });
});
