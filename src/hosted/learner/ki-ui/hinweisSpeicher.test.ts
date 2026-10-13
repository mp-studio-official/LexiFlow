// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { coachHinweisBestaetigen, coachHinweisGesehen, coachHinweisVergessen } from './hinweisSpeicher';

function speicher() {
  const werte = new Map<string, string>();
  return {
    getItem: (key: string) => werte.get(key) ?? null,
    setItem: (key: string, wert: string) => { werte.set(key, wert); },
    removeItem: (key: string) => { werte.delete(key); },
    werte,
  };
}

describe('der Datenhinweis des Lerncoachs', () => {
  it('beginnt unbestaetigt und merkt nur die Bestaetigung', () => {
    const ort = speicher();
    expect(coachHinweisGesehen(ort, 'person-a')).toBe(false);
    coachHinweisBestaetigen(ort, 'person-a');
    expect(coachHinweisGesehen(ort, 'person-a')).toBe(true);
    expect([...ort.werte.values()]).toEqual(['verstanden']);
  });

  it('trennt zwei Profile auf demselben Geraet', () => {
    const ort = speicher();
    coachHinweisBestaetigen(ort, 'person-a');
    expect(coachHinweisGesehen(ort, 'person-a')).toBe(true);
    expect(coachHinweisGesehen(ort, 'person-b')).toBe(false);
  });

  it('kann die Bestaetigung gezielt fuer ein Profil vergessen', () => {
    const ort = speicher();
    coachHinweisBestaetigen(ort, 'person-a');
    coachHinweisVergessen(ort, 'person-a');
    expect(coachHinweisGesehen(ort, 'person-a')).toBe(false);
  });

  it('lehnt eine leere Profilkennung ab, statt alle Profile zu vermischen', () => {
    expect(() => coachHinweisBestaetigen(speicher(), '   ')).toThrow(/Profil/);
  });
});
