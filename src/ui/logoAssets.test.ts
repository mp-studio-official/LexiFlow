import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LOGO_ASPECT,
  LOGO_ASSETS,
  LOGO_LAYERS,
  LOGO_SHAPES,
  LOGO_VARIANTS,
  LOGO_VIEWBOX,
  buildLogoAsset,
} from './logoPaths';
import { BRAND_ACCENT, BRAND_CANVAS, BRAND_INK, RETIRED_BRAND_COLORS } from '../pwa/manifest';

/**
 * Sprint 4B.1c: die beiden Logo-Assets und ihre Herkunft.
 *
 * Zwei Dinge werden hier zugesichert, und beide sind Zusagen an die Marke, nicht
 * an den Code:
 *
 * 1. **Die Dateien unter `public/` sind erzeugt, nicht gepflegt.** Sie werden
 *    Zeichen für Zeichen gegen `buildLogoAsset` verglichen. Wer eine der beiden
 *    von Hand anfasst, sieht es beim nächsten Testlauf.
 * 2. **Die Form ist unverändert.** Geprüft werden die Pfaddaten gegen die
 *    Werte aus den Entwurfsdateien – nicht auf Ähnlichkeit, sondern auf
 *    Gleichheit. Ein „kleines Aufräumen“ an einem Pfad fällt damit auf.
 */

const root = resolve(import.meta.dirname, '../..');

function asset(name: string): string {
  return readFileSync(resolve(root, 'public', name), 'utf8');
}

describe('Die gelieferte Form bleibt unverändert', () => {
  it('trägt die drei Verschiebungen der Entwurfsdateien wörtlich', () => {
    expect(LOGO_SHAPES.back.transform).toBe('matrix(1,0,0,1,87,198)');
    expect(LOGO_SHAPES.front.transform).toBe('matrix(1,0,0,1,173,129)');
    expect(LOGO_SHAPES.inner.transform).toBe('matrix(1,0,0,1,195,218)');
  });

  it('beginnt und endet jeden Pfad wie die Vorlage', () => {
    // Anfang und Ende sind der billigste verlässliche Nachweis, dass niemand
    // den Pfad „vereinfacht“ hat; die Gesamtlänge fängt das Dazwischen ab.
    expect(LOGO_SHAPES.back.d.startsWith('M2.514,267.495L3.956,10.496')).toBe(true);
    expect(LOGO_SHAPES.front.d.startsWith('M254.537,33.499C254.52,34.286')).toBe(true);
    expect(LOGO_SHAPES.inner.d.startsWith('M86.702,83.343L56.722,75.826')).toBe(true);
    for (const layer of LOGO_LAYERS) expect(LOGO_SHAPES[layer].d.endsWith('Z')).toBe(true);
  });

  it('beschneidet nur den Ausschnitt, nicht die Form', () => {
    /*
      Die Entwurfsdateien tragen `0 0 492 602`; die Form belegt darin
      x 89,5 … 427,75 und y 128,5 … 537,75. Der neue Ausschnitt umschließt
      genau diese Fläche mit etwas Luft – gemessen an einem Rendering, nicht
      an den Stützpunkten, weil Kurven über diese hinausreichen.
    */
    const [x, y, width, height] = LOGO_VIEWBOX.split(' ').map(Number) as number[];
    expect(x).toBeLessThanOrEqual(89.5);
    expect(y).toBeLessThanOrEqual(128.5);
    expect((x ?? 0) + (width ?? 0)).toBeGreaterThanOrEqual(427.75);
    expect((y ?? 0) + (height ?? 0)).toBeGreaterThanOrEqual(537.75);

    // Und der Rand bleibt schmal – sonst wäre der Beschnitt wirkungslos.
    expect(x).toBeGreaterThan(70);
    expect(y).toBeGreaterThan(110);
    expect((x ?? 0) + (width ?? 0)).toBeLessThan(447);
    expect((y ?? 0) + (height ?? 0)).toBeLessThan(558);
  });

  it('ist hochkant, nicht quadratisch', () => {
    // Wer hier ein Quadrat erzwingt, verzerrt oder beschneidet die Form.
    expect(LOGO_ASPECT).toBeLessThan(1);
    expect(LOGO_ASPECT).toBeGreaterThan(0.7);
  });
});

describe('Die beiden Projektassets', () => {
  it('liegen unter den vereinbarten Namen', () => {
    expect(LOGO_ASSETS.onAubergine).toBe('lexiflow-mark-on-aubergine.svg');
    expect(LOGO_ASSETS.onParchment).toBe('lexiflow-mark-on-parchment.svg');
    expect(() => asset(LOGO_ASSETS.onAubergine)).not.toThrow();
    expect(() => asset(LOGO_ASSETS.onParchment)).not.toThrow();
  });

  it('sind zeichengenau das, was der Erzeuger liefert', () => {
    expect(asset(LOGO_ASSETS.onAubergine)).toBe(buildLogoAsset('onAubergine'));
    expect(asset(LOGO_ASSETS.onParchment)).toBe(buildLogoAsset('onParchment'));
  });

  it('tragen genau die drei verbindlichen Markenfarben', () => {
    for (const name of Object.values(LOGO_ASSETS)) {
      const fills = [...asset(name).matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((hit) =>
        hit[1]?.toUpperCase(),
      );
      expect(fills, name).toHaveLength(3);
      expect(new Set(fills), name).toEqual(new Set(['#2F092D', '#FF2E2D', '#F8EFE3']));
    }
  });

  it('tauschen nur die Rollen – die Vordergrundfläche bleibt Tomato', () => {
    /*
      Der Unterschied zwischen den Varianten ist genau **eine** Vertauschung:
      Was auf Papier die tiefe Fläche ist, ist auf Aubergine der Durchblick.
      Tomato steht in beiden vorn.
    */
    expect(LOGO_VARIANTS.onParchment.front).toBe(LOGO_VARIANTS.onAubergine.front);
    expect(LOGO_VARIANTS.onParchment.back).toBe(LOGO_VARIANTS.onAubergine.inner);
    expect(LOGO_VARIANTS.onParchment.inner).toBe(LOGO_VARIANTS.onAubergine.back);

    // Auf Aubergine liegt Parchment hinten – sonst verschwände die Fläche.
    expect(LOGO_VARIANTS.onAubergine.back).toBe(BRAND_CANVAS.toUpperCase());
    expect(LOGO_VARIANTS.onParchment.back).toBe(BRAND_INK.toUpperCase());
    expect(LOGO_VARIANTS.onAubergine.front).toBe(BRAND_ACCENT.toUpperCase());
  });

  it('normalisiert die Parchment-Abweichungen der Entwurfsdateien', () => {
    /*
      Die gelieferten Dateien hatten in einer früheren Fassung `#FAEFE2` und
      `#F6ECE1` statt Parchment. Beide dürfen in den Projektassets nicht
      vorkommen – ebenso wenig wie irgendeine andere abgelegte Farbe.
    */
    for (const name of Object.values(LOGO_ASSETS)) {
      const lower = asset(name).toLowerCase();
      for (const retired of RETIRED_BRAND_COLORS) {
        expect(lower, `${name} enthält noch ${retired}`).not.toContain(retired);
      }
    }
  });

  it('ist bereinigt – kein DOCTYPE, kein xlink, kein serif', () => {
    for (const name of Object.values(LOGO_ASSETS)) {
      const svg = asset(name);
      expect(svg, name).not.toContain('<?xml');
      expect(svg, name).not.toContain('<!DOCTYPE');
      expect(svg, name).not.toContain('xlink');
      expect(svg, name).not.toContain('serif');
      expect(svg, name).not.toContain('xml:space');
      expect(svg, name).not.toContain('stroke-miterlimit');
      // Und keine Rasterdatei im Vektor.
      expect(svg, name).not.toContain('<image');
    }
  });

  it('hat einen zugänglichen Namen, wenn die Datei allein steht', () => {
    /*
      Als Datei aufgerufen ist das Zeichen das einzige auf der Seite – dann
      braucht es einen Namen. Innerhalb der App steht „LexiFlow“ als Text
      daneben, und dort ist dasselbe Zeichen dekorativ (siehe `brand.test.tsx`).
    */
    for (const name of Object.values(LOGO_ASSETS)) {
      expect(asset(name), name).toContain('role="img"');
      expect(asset(name), name).toContain('<title id="lexiflow-mark-title">LexiFlow</title>');
    }
  });
});
