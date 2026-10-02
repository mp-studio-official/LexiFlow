import { describe, expect, it } from 'vitest';
import { gingeVerloren, type Rundenstand } from './rundenverlust';

function stand(teil: Partial<Rundenstand> = {}): Rundenstand {
  return { aufgabeOffen: true, ergebnisSteht: false, entwurf: '', ...teil };
}

describe('was beim Verlassen der Runde verloren ginge', () => {
  it('eine begonnene Texteingabe', () => {
    expect(gingeVerloren(stand({ entwurf: 'hou' }))).toBe(true);
  });

  it('eine leere Aufgabe nicht', () => {
    expect(gingeVerloren(stand({ entwurf: '' }))).toBe(false);
  });

  it('und auch nicht eine Eingabe aus lauter Leerzeichen', () => {
    /*
      Sonst fragte die Runde nach, weil jemand die Leertaste gestreift hat —
      und genau diese Rückfrage bringt Menschen bei, Rückfragen wegzuklicken.
    */
    expect(gingeVerloren(stand({ entwurf: '   ' }))).toBe(false);
  });

  it('eine bereits geprüfte Antwort nicht — die ist gespeichert', () => {
    expect(gingeVerloren(stand({ entwurf: 'house', ergebnisSteht: true }))).toBe(false);
  });

  it('ohne offene Aufgabe nichts', () => {
    /*
      Die fertige Runde, die leere Runde, der Ladezustand: Alles drei hat
      keine aktuelle Aufgabe, und keines davon darf fragen.
    */
    expect(gingeVerloren(stand({ aufgabeOffen: false, entwurf: 'house' }))).toBe(false);
  });

  it('eine Auswahlaufgabe meldet keinen Entwurf — Antippen ist Abschicken', () => {
    expect(gingeVerloren(stand({ entwurf: '' }))).toBe(false);
  });

  it('jede Bedingung trägt — keine ist wirkungslos', () => {
    /*
      Die Gegenprobe zur Regel selbst: Fiele eine der drei Bedingungen weg,
      änderte sich mindestens einer der Fälle oben.
    */
    const voll = stand({ entwurf: 'house' });
    expect(gingeVerloren(voll)).toBe(true);
    expect(gingeVerloren({ ...voll, aufgabeOffen: false })).toBe(false);
    expect(gingeVerloren({ ...voll, ergebnisSteht: true })).toBe(false);
    expect(gingeVerloren({ ...voll, entwurf: '' })).toBe(false);
  });
});
