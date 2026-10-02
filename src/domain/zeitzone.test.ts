import { describe, expect, it, vi } from 'vitest';
import {
  istWochenziel,
  serieIstBelastbar,
  zeitzonenstand,
  zeitzonenVorschlag,
} from './zeitzone';

/**
 * Die Regeln um Zeitzone und Wochenziel – ohne Speicher, ohne Oberfläche.
 *
 * Der Grund für dieses Modul steht in E27: Der Browser darf **vorschlagen**,
 * gespeichert wird erst nach ausdrücklicher Bestätigung. Hier wird geprüft,
 * dass der Vorschlag ein Vorschlag bleibt.
 */

describe('zeitzonenVorschlag', () => {
  it('liefert den Namen, den die Umgebung meldet', () => {
    const erwartet = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(zeitzonenVorschlag()).toBe(erwartet);
  });

  it('liefert nichts, wenn die Umgebung keine Auskunft gibt', () => {
    /*
      Kein konstruierter Fall: Eine Umgebung ohne Zeitzonendaten wirft hier.
      Eine Seite, die deshalb weiß bleibt, wäre der schlechtere Ausgang als
      eine, die die Frage einfach stellt.
    */
    const spion = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation((() => {
      throw new Error('Keine Zeitzonendaten.');
    }) as never);
    try {
      expect(zeitzonenVorschlag()).toBeUndefined();
    } finally {
      spion.mockRestore();
    }
  });
});

describe('zeitzonenstand', () => {
  it('nennt einen gespeicherten Wert bestätigt', () => {
    expect(zeitzonenstand('Europe/Berlin', undefined)).toEqual({
      art: 'bestaetigt',
      zone: 'Europe/Berlin',
    });
  });

  it('lässt den gespeicherten Wert gewinnen, auch wenn das Gerät widerspricht', () => {
    /*
      Die Zeile, auf die es ankommt. Marcs Einwand gegen den ursprünglichen
      Vorschlag war: Eine stille automatische Korrektur kann falsche Daten
      dauerhaft als Wahrheit speichern. Hier gewinnt das Gespeicherte – und
      der Vorschlag taucht im Ergebnis nicht einmal auf, damit niemand
      versehentlich auf ihn zurückgreift.
    */
    const stand = zeitzonenstand('Europe/Berlin', 'America/New_York');
    expect(stand).toEqual({ art: 'bestaetigt', zone: 'Europe/Berlin' });
    expect(JSON.stringify(stand)).not.toContain('New_York');
  });

  it('nennt einen fehlenden Wert unbestätigt und reicht den Vorschlag durch', () => {
    expect(zeitzonenstand(undefined, 'America/New_York')).toEqual({
      art: 'unbestaetigt',
      vorschlag: 'America/New_York',
    });
  });

  it('kommt auch ohne Vorschlag aus', () => {
    expect(zeitzonenstand(undefined, undefined)).toEqual({ art: 'unbestaetigt' });
  });

  it('behandelt eine leere Zeichenkette wie nichts', () => {
    // Sonst stünde eines Tages „Zeitzone: " auf einer Seite.
    expect(zeitzonenstand('', '')).toEqual({ art: 'unbestaetigt' });
  });
});

describe('serieIstBelastbar', () => {
  it('ist wahr nur bei bestätigter Zeitzone', () => {
    expect(serieIstBelastbar({ art: 'bestaetigt', zone: 'Europe/Berlin' })).toBe(true);
  });

  it('ist falsch ohne Bestätigung – auch mit Vorschlag', () => {
    /*
      E27: Ohne bestätigte Zeitzone wird keine Serie als belastbare Zahl
      gezeigt. Ein Vorschlag genügt nicht – sonst stünde dort eine Zahl, die
      bei der ersten Reise leise falsch wird.
    */
    expect(serieIstBelastbar({ art: 'unbestaetigt' })).toBe(false);
    expect(serieIstBelastbar({ art: 'unbestaetigt', vorschlag: 'Europe/Berlin' })).toBe(false);
  });
});

describe('istWochenziel', () => {
  it('nimmt 1 bis 7 an', () => {
    for (const tage of [1, 2, 3, 4, 5, 6, 7]) expect(istWochenziel(tage)).toBe(true);
  });

  it('lehnt alles außerhalb ab', () => {
    for (const wert of [0, 8, -1, 100]) expect(istWochenziel(wert)).toBe(false);
  });

  it('lehnt Nachkommastellen und Unzahlen ab', () => {
    for (const wert of [3.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(istWochenziel(wert)).toBe(false);
    }
  });

  it('lässt `undefined` zu – das heißt „kein Ziel"', () => {
    expect(istWochenziel(undefined)).toBe(true);
  });
});
