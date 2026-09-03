import { describe, expect, it } from 'vitest';

import { PACK_MOTIF_VARIANTS, packMotif, packMotifKey } from './packMotif';

/**
 * Motive, die sich nicht ändern.
 *
 * Die eigentliche Zusage ist die Stabilität: Dasselbe Paket muss auf jedem
 * Gerät, nach jedem Update und nach einem Neuimport dasselbe Bild haben. Ein
 * Motiv, das beim nächsten Öffnen ein anderes ist, ist kein
 * Wiedererkennungszeichen, sondern eine Irritation.
 *
 * Die zweite Zusage ist Streuung: Eine Paketliste, in der vier von fünf
 * Motiven gleich aussehen, hätte das Bild auch weglassen können.
 */

describe('Dasselbe Paket, dasselbe Motiv', () => {
  it('liefert bei jedem Aufruf dasselbe', () => {
    const first = packMotif('Unit 3 – City life');
    const second = packMotif('Unit 3 – City life');
    expect(first).toEqual(second);
  });

  it('übersieht Leerraum und Groß-/Kleinschreibung', () => {
    /*
      Wer sein Paket neu importiert oder umbenennt und dabei nur die
      Schreibung ändert, soll es wiedererkennen.
    */
    expect(packMotif('  unit 3 – city life ')).toEqual(packMotif('Unit 3 – City life'));
  });

  it('hat auch ohne Titel ein Motiv', () => {
    // Ein leeres Feld ist kein Grund für eine leere Fläche.
    expect(PACK_MOTIF_VARIANTS).toContain(packMotif('').variant);
    expect(packMotif('')).toEqual(packMotif('   '));
  });
});

describe('Die Motive streuen', () => {
  const titles = [
    'Unit 1 – At home',
    'Unit 2 – School life',
    'Unit 3 – City life',
    'Unit 4 – Sports',
    'Unit 5 – Food',
    'Unit 6 – Travel',
    'Unit 7 – Renewable energy',
    'Unit 8 – Media',
    'Coastal erosion',
    'Halong Bay',
    'Irregular verbs',
    'Phrasal verbs',
  ];

  it('benutzt alle sechs Kompositionen', () => {
    const seen = new Set(titles.map((title) => packMotif(title).variant));
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });

  it('gibt aufeinanderfolgenden Einheiten verschiedene Motive', () => {
    /*
      Der Fall, der in einer echten Paketliste vorkommt: „Unit 1“ bis
      „Unit 8“ unterscheiden sich in einem Zeichen. Eine Streufunktion, die
      daraus ähnliche Werte macht, ergäbe acht fast gleiche Karten.
    */
    const einheiten = titles.slice(0, 8).map((title) => packMotifKey(packMotif(title)));
    expect(new Set(einheiten).size).toBeGreaterThanOrEqual(6);
  });

  it('lässt Tomate den Akzent bleiben und nicht die Regel werden', () => {
    /*
      Eine Liste, in der jedes zweite Motiv leuchtend rot ist, wäre ein
      Feuerwerk und keine Lernumgebung. Geprüft an vielen Titeln, damit die
      Aussage über die Verteilung gilt und nicht über zwölf Zufälle.
    */
    const viele = Array.from({ length: 300 }, (_, index) => `Paket ${index}`);
    const tomaten = viele.filter((title) => packMotif(title).ground === 'tomato').length;
    expect(tomaten).toBeGreaterThan(viele.length * 0.2);
    expect(tomaten).toBeLessThan(viele.length * 0.45);
  });

  it('dreht in zwölf Lagen', () => {
    const viele = Array.from({ length: 400 }, (_, index) => `Paket ${index}`);
    const lagen = new Set(viele.map((title) => packMotif(title).rotation));
    expect([...lagen].sort((a, b) => a - b)).toEqual([
      0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330,
    ]);
  });

  it('unterscheidet zwei gleiche Kompositionen über Lage und Nähe', () => {
    /*
      Der Fall, der in einer echten Paketliste auffiel: Bei sechs
      Kompositionen und sieben Paketen trifft der Zufall regelmäßig zweimal
      dieselbe – und zwei Karten sahen dann identisch aus.

      Vier Drehstufen reichten nicht; jetzt sind es zwölf, dazu drei Stufen
      Nähe. Geprüft an einer Liste, die genau diesen Fall enthält.
    */
    const liste = [
      'Unit 1 – At home',
      'Unit 3 – City life',
      'Unit 7 – Renewable energy',
      'Phrasal verbs',
      'Halong Bay',
      'Irregular verbs',
      'Unit 4 – Sports',
    ];
    const motive = liste.map((title) => packMotifKey(packMotif(title)));
    expect(new Set(motive).size).toBe(liste.length);
  });
});

describe('Der Schlüssel', () => {
  it('liest sich als das, was er ist', () => {
    expect(packMotifKey({ variant: 'arcs', ground: 'aubergine', rotation: 90, scale: 1.3 })).toBe(
      'arcs/aubergine/90/1.3',
    );
  });
});
