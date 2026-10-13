import { describe, expect, it } from 'vitest';
import { fortschrittsbild } from './fortschrittDaten';

/**
 * Was `fortschrittsbild` durchreicht — und was es dabei nicht verliert.
 *
 * Die gezählten Lerntage wurden lange benutzt und weggeworfen: `woche`
 * behielt nur die letzten sieben. Die Auszeichnungen fragen aber nach dem
 * **ersten** Lerntag überhaupt, und der liegt meistens weiter zurück. Eine
 * Prüfung gegen die Seite allein merkt das nicht, weil man ihr die Tage
 * auch von Hand hineinreichen kann — deshalb steht sie hier.
 */

const KALENDER = {
  bestaetigt: true as const,
  timeZone: 'Europe/Berlin',
  heute: '2026-10-13',
  wochenbeginn: '2026-10-12',
};

const LERNTAGE = [
  { localDay: '2026-01-07', taskCount: 14 },
  { localDay: '2026-10-13', taskCount: 11 },
];

describe('die gezählten Lerntage', () => {
  it('kommen unverändert im Bild an', () => {
    const bild = fortschrittsbild({
      material: [],
      staende: [],
      lerntage: LERNTAGE,
      kalender: KALENDER,
      einstellungen: {},
    });
    expect(bild.lerntage).toEqual(LERNTAGE);
  });

  it('gehen auch ohne bestätigte Zeitzone nicht verloren', () => {
    /*
      Ohne Zone bricht die Funktion früh ab und liefert ein Bild ohne
      Woche und Serie. Die rohen Tage gehören trotzdem hinein: Was der
      Server gezählt hat, hat er gezählt.
    */
    const bild = fortschrittsbild({
      material: [],
      staende: [],
      lerntage: LERNTAGE,
      kalender: { bestaetigt: false },
      einstellungen: {},
    });
    expect(bild.woche).toEqual([]);
    expect(bild.lerntage).toEqual(LERNTAGE);
  });
});
