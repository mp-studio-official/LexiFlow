// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { PROFILE, zieleFuer } from './navigation';
import { NavigationsZeichen, ZEICHEN_NAMEN, zeichnungVon } from './navigationsZeichen';

/**
 * Die Zeichen der Navigation — was an ihnen prüfbar ist.
 *
 * ## Was hier steht und was nicht
 *
 * Hier steht, was man am Markup und an der Geometrie entscheiden kann: dass
 * jedes E23-Ziel ein Zeichen hat, dass keines eine eigene Farbe mitbringt,
 * dass keines einen Namen vortäuscht, den es nicht trägt.
 *
 * Ob sich drei Zeichen bei **23 px** wirklich unterscheiden, steht hier
 * nicht — das kann jsdom nicht beantworten, weil es nichts zeichnet. Zwei
 * verschiedene Pfaddaten können dasselbe Bild ergeben, und zwei ähnliche
 * können bei 23 px ununterscheidbar sein. Diese Frage beantwortet
 * `scripts/zeichen-unterscheidbar.mjs` in einem echten Browser.
 */

afterEach(cleanup);

/** Die neun Zeichen der E23-Ziele plus `konto` und `abmelden` im Fuß. */
const ALLE_ZEICHEN = ZEICHEN_NAMEN;
const E23_ZEICHEN = PROFILE.flatMap((profil) => zieleFuer(profil).map((ziel) => ziel.zeichen));

describe('jedes Ziel aus E23 hat genau ein bekanntes Zeichen', () => {
  it.each(ALLE_ZEICHEN)('%s ist gezeichnet', (zeichen) => {
    const formen = zeichnungVon(zeichen);
    expect(formen, `${zeichen} hat keine Geometrie`).toBeDefined();
    expect(formen.length, `${zeichen} ist leer`).toBeGreaterThan(0);
  });

  it('es gibt neun E23-Ziele mit je eigenem Zeichen', () => {
    // Sonst liefe die Schleife oben über weniger, als E23 verlangt.
    expect(E23_ZEICHEN).toHaveLength(9);
    expect(new Set(E23_ZEICHEN).size).toBe(9);
    for (const zeichen of E23_ZEICHEN) expect(ALLE_ZEICHEN).toContain(zeichen);
  });

  it('dazu `konto` und `abmelden` für den Fuß der Leiste', () => {
    // Sie gehören zu keinem Navigationsziel, brauchen aber dasselbe Format.
    expect(ALLE_ZEICHEN).toContain('konto');
    expect(ALLE_ZEICHEN).toContain('abmelden');
    expect(ALLE_ZEICHEN).toHaveLength(11);
  });
});

describe('ein Zeichen bringt keine Farbe mit', () => {
  it.each(ALLE_ZEICHEN)('%s zeichnet in currentColor', (zeichen) => {
    const { container } = render(<NavigationsZeichen zeichen={zeichen} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(svg?.getAttribute('fill')).toBe('none');

    /*
      Keine eingebaute Farbe an irgendeiner Form. Der aktive Eintrag soll sich
      nicht über Farbe allein erklären; ein Zeichen, das seine eigene
      mitbringt, nähme der Hülle diese Entscheidung ab.
    */
    for (const form of svg?.querySelectorAll('*') ?? []) {
      for (const attribut of ['stroke', 'fill']) {
        const wert = form.getAttribute(attribut);
        if (wert === null) continue;
        expect(['currentColor', 'none'], `${zeichen}: ${attribut}="${wert}"`).toContain(wert);
      }
    }
  });

  it.each(ALLE_ZEICHEN)('%s steht auf demselben Raster', (zeichen) => {
    const { container } = render(<NavigationsZeichen zeichen={zeichen} />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24');
  });
});

describe('das Zeichen trägt keinen Namen', () => {
  it.each(ALLE_ZEICHEN)('%s ist vor Hilfsmitteln verborgen', (zeichen) => {
    /*
      Ein Zeichen allein heißt nichts: „Haus" sagt nicht, wohin der Verweis
      führt. Der verständliche Name hängt am Link darum herum; das SVG ist
      `aria-hidden` und nicht fokussierbar — sonst stünde in der
      Tabulatorreihenfolge ein Element, das nichts tut.
    */
    const { container } = render(<NavigationsZeichen zeichen={zeichen} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.getAttribute('aria-label')).toBeNull();
    expect(svg?.querySelector('title')).toBeNull();
  });
});

describe('die Zeichen sind eigene Zeichnungen', () => {
  const quelle = readFileSync(resolve(import.meta.dirname, 'navigationsZeichen.tsx'), 'utf8');

  it('kein Emoji, kein Plattformzeichen, keine fremde Bibliothek', () => {
    /*
      Ein Emoji sieht auf jedem Betriebssystem anders aus, und auf dem Gerät,
      auf dem es schiefgeht, sieht es niemand aus dem Projekt.
    */
    expect(quelle).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(quelle).not.toMatch(/from '(?!react|\.\/navigation')/);
    expect(quelle).not.toMatch(/<img|background-image|url\(/);
  });

  it('keine zwei Zeichen teilen dieselbe Geometrie', () => {
    /*
      Diese Prüfung hat beim Übertragen aus den Entwürfen etwas gefunden:
      „Lernen" trug dort Zeichen für Zeichen die Zeichnung von „Lernpakete".
      Im Entwurf fiel es nicht auf, weil die beiden zu verschiedenen Rollen
      gehören und nie nebeneinander stehen.
    */
    const gesehen = new Map<string, string>();
    for (const zeichen of ALLE_ZEICHEN) {
      const abdruck = JSON.stringify(zeichnungVon(zeichen));
      const schon = gesehen.get(abdruck);
      expect(schon, `${zeichen} ist dieselbe Zeichnung wie ${schon}`).toBeUndefined();
      gesehen.set(abdruck, zeichen);
    }
  });
});

describe('die Zeichen erreichen Bildschirme nur über die Hülle', () => {
  it('keine andere Datei zeichnet sie', () => {
    /*
      Die Kette ist genau ein Glied lang: Zeichen → Hülle → Portaladapter. Ein
      zweiter Weg wäre eine zweite Stelle, an der ein Zeichen ohne Namen
      danebenstehen kann.
    */
    const wurzel = resolve(import.meta.dirname, '..');
    const AUSGENOMMEN = ['navigationsZeichen', 'Huelle'];
    const dateien: string[] = [];
    const sammle = (ordner: string): void => {
      for (const eintrag of readdirSync(ordner)) {
        const pfad = join(ordner, eintrag);
        if (statSync(pfad).isDirectory()) sammle(pfad);
        else if (/\.tsx?$/.test(eintrag) && !AUSGENOMMEN.some((n) => eintrag.startsWith(n))) {
          dateien.push(pfad);
        }
      }
    };
    sammle(wurzel);
    expect(dateien.length).toBeGreaterThan(50);

    const benutzer = dateien
      .filter((pfad) => /navigationsZeichen/.test(readFileSync(pfad, 'utf8')))
      .map((pfad) => pfad.slice(wurzel.length + 1));
    expect(benutzer).toEqual([]);
  });
});
