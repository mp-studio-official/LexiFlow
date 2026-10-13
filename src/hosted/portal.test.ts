import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Die engere Schicht des Portals — und die Zusagen, die sie macht.
 *
 * ## Warum sie eine eigene Wache braucht
 *
 * `src/hosted/portal.css` ist nach `global.css` die zweite Datei, die
 * gemeinsame Bausteine anfasst. Die Wachen unter `src/styles/` lesen aber
 * ausschliesslich `global.css` und `tokens.css` — eine Regel hier liefe an
 * ihnen allen vorbei. Ohne diese Datei wäre die neue Schicht der einzige
 * Ort im Projekt, an dem ein Tippziel unter 44 px oder eine erfundene
 * Farbe unbemerkt entstehen könnte.
 *
 * ## Die drei Zusagen
 *
 * 1. **Jede Regel beginnt mit `.huelle`.** Das ist die ganze Begründung
 *    dafür, dass diese Datei die portable Lerndatei nicht mitändert: Die
 *    rendert `.app-*`, nie `.huelle`.
 * 2. **Keine erfundenen Werte.** Farben, Abstände, Radien und Schatten
 *    kommen aus den Token.
 * 3. **Kein Glas.** Es kommt ausschliesslich aus `glas.css`, mitsamt
 *    seinem deckenden Rückfall.
 */

const hier = resolve(import.meta.dirname);

/**
 * Alle Stilblätter der Portalschicht, nicht nur das erste.
 *
 * `portal.css` war lange das einzige. Mit der Werkstatt kam ein zweites
 * dazu, und ein zweites Stilblatt, das diese Wache nicht liest, ist
 * genau der Ort, an dem die erste `.btn`-Regel ohne `.huelle` entsteht —
 * unbemerkt, weil die Wache ja grün ist.
 */
const BLAETTER = [
  'portal.css',
  'teacher/werkstatt/werkstatt.css',
  'learner/motivation/motivation.css',
  'learner/sprache/sprache.css',
  'learner/ki-ui/ki-ui.css',
] as const;

const ROH = BLAETTER.map((blatt) => readFileSync(resolve(hier, blatt), 'utf8')).join('\n');
/** Ohne Kommentare — sonst prüft die Wache ihre eigene Begründung mit. */
const CSS = ROH.replace(/\/\*[\s\S]*?\*\//g, '');
const TOKEN = readFileSync(resolve(hier, '..', 'styles', 'tokens.css'), 'utf8');

/**
 * Trennt eine Selektorliste an den Kommas — aber nur an den obersten.
 *
 * `:where(.card, .alert)` enthält selbst Kommas. Ein naives `split(',')`
 * zerschnitt die Klammer und meldete `.alert` als Regel ohne `.huelle`
 * davor, obwohl die Regel sauber eingegrenzt war. Umgekehrt hätte eine
 * Wache, die man darauf hin abschwächt, gar nichts mehr geprüft; also
 * zählt sie die Klammertiefe mit.
 */
function teileOberste(liste: string): string[] {
  const teile: string[] = [];
  let tiefe = 0;
  let laufend = '';
  for (const zeichen of liste) {
    if (zeichen === '(') tiefe += 1;
    else if (zeichen === ')') tiefe -= 1;
    if (zeichen === ',' && tiefe === 0) {
      teile.push(laufend);
      laufend = '';
      continue;
    }
    laufend += zeichen;
  }
  teile.push(laufend);
  return teile;
}

/** Die Selektoren der Datei, einer je Wahl. */
function auswahlen(): string[] {
  return [...CSS.matchAll(/(^|\})\s*([^{}@]+)\{/g)]
    .flatMap((treffer) => teileOberste(treffer[2] ?? ''))
    .map((wahl) => wahl.trim())
    .filter((wahl) => wahl.length > 0);
}

describe('die Portalschicht erreicht nur das Portal', () => {
  it('jede Regel ist auf `.huelle` eingegrenzt', () => {
    /*
      Die eine Zusage, an der alles hängt. Fällt sie, ändert diese Datei
      die portable Lerndatei mit — und das merkt niemand, weil dort
      dieselben Klassen stehen.
    */
    const offen = auswahlen().filter((wahl) => !wahl.startsWith('.huelle'));
    expect(offen, 'Regel ohne `.huelle` davor').toEqual([]);
  });

  it('es gibt überhaupt Regeln zu prüfen', () => {
    // Sonst liefe die Schleife oben ins Leere und meldete Erfolg.
    expect(auswahlen().length).toBeGreaterThan(15);
  });

  it('und lässt sich von `:where(…)` nicht täuschen — in beide Richtungen', () => {
    /*
      Die Klammer darf die Wache weder blind machen (links) noch ein
      falsches Alarmsignal auslösen (rechts).
    */
    expect(teileOberste('.huelle :where(.card, .alert) > :first-child')).toHaveLength(1);
    expect(teileOberste(':where(.a, .b), .btn')).toHaveLength(2);
    expect(teileOberste(':where(.a, .b), .btn')[1]?.trim()).toBe('.btn');
  });

  it('und erkennt eine offene Regel auch wirklich', () => {
    const probe = '.btn { color: red; }';
    const gefunden = [...probe.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((t) => (t[2] ?? '').trim());
    expect(gefunden.some((wahl) => !wahl.startsWith('.huelle'))).toBe(true);
  });
});

describe('keine erfundenen Werte', () => {
  it('jedes benutzte Token gibt es in `tokens.css`', () => {
    const vorhanden = new Set([...TOKEN.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((t) => t[1]));
    const benutzt = [...new Set([...CSS.matchAll(/var\((--[a-z0-9-]+)/g)].map((t) => t[1]))];
    expect(benutzt.length, 'die Datei benutzt gar keine Token').toBeGreaterThan(10);
    expect(benutzt.filter((name) => !vorhanden.has(name as string))).toEqual([]);
  });

  it('keine Farbe steht als Zahl da', () => {
    /*
      Eine Farbe ausserhalb der Token ist eine zweite Palette. Sie fällt
      beim Lesen nicht auf und beim Messen erst recht nicht.
    */
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CSS).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
  });
});

describe('Glas kommt nur aus dem Baustein', () => {
  it('diese Datei setzt kein `backdrop-filter`', () => {
    expect(CSS).not.toMatch(/backdrop-filter/);
  });
});

describe('Tippziele', () => {
  it('keine Mindesthöhe unterschreitet 44 px', () => {
    /*
      Gelesen und gerechnet, nicht als Muster verglichen: `56px` ist mehr
      als gefordert und muss durchgehen, `40px` nicht.
    */
    const werte = [...CSS.matchAll(/min-block-size:\s*([^;]+)/g)].map((t) => (t[1] ?? '').trim());
    expect(werte.length, 'keine einzige Mindesthöhe').toBeGreaterThan(0);
    for (const wert of werte) {
      const px = wert === 'var(--tap-target)' ? 44 : Number.parseFloat(wert);
      expect(Number.isNaN(px), `${wert} ist nicht nachrechenbar`).toBe(false);
      expect(px, `${wert} ist zu klein`).toBeGreaterThanOrEqual(44);
    }
  });
});
