import { describe, expect, it } from 'vitest';
import { GRADES, isGrade, suggestCefrLevel } from './cefr';

describe('suggestCefrLevel', () => {
  it('bildet die NRW-Zuordnung vollständig ab', () => {
    expect(suggestCefrLevel('5')).toBe('A1+');
    expect(suggestCefrLevel('6')).toBe('A2');
    expect(suggestCefrLevel('7')).toBe('A2+');
    expect(suggestCefrLevel('8')).toBe('A2/B1');
    expect(suggestCefrLevel('9')).toBe('B1');
    expect(suggestCefrLevel('10')).toBe('B1+');
    expect(suggestCefrLevel('EF')).toBe('B1/B2');
    expect(suggestCefrLevel('Q1')).toBe('B2');
    expect(suggestCefrLevel('Q2')).toBe('B2/C1');
  });

  it('liefert für jeden Jahrgang ein Niveau', () => {
    for (const grade of GRADES) {
      expect(suggestCefrLevel(grade)).toBeTruthy();
    }
  });
});

describe('isGrade', () => {
  it('erkennt gültige und ungültige Werte', () => {
    expect(isGrade('Q1')).toBe(true);
    expect(isGrade('11')).toBe(false);
    expect(isGrade(5)).toBe(false);
  });
});
