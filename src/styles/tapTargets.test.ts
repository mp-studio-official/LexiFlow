import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Mindestgrößen für Klickflächen – geprüft an der Regel, nicht am Pixel.
 *
 * jsdom rechnet kein Layout: Ein Komponententest kann nicht messen, wie groß
 * eine Schaltfläche tatsächlich wird. Was sich prüfen lässt, ist die
 * Zusage im Stylesheet – und die ist der Ort, an dem sie versehentlich
 * verschwinden würde.
 *
 * `--tap-target` ist der gemeinsame Token dieses Projekts. WCAG 2.2 verlangt
 * für „Target Size (Minimum)“ 24 × 24 px; LexiFlow setzt 44 × 44 px an, weil
 * die Zielgruppe die App auf Telefonen benutzt.
 */

const tokens = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf8');
const global = readFileSync(resolve(import.meta.dirname, 'global.css'), 'utf8');

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `Regel ${selector} fehlt`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('Klickflächen', () => {
  it('setzt --tap-target auf mindestens 44 px', () => {
    const value = /--tap-target:\s*([\d.]+)(px|rem)/.exec(tokens);
    expect(value).not.toBeNull();
    const size =
      value?.[2] === 'rem' ? Number(value[1]) * 16 : Number(value?.[1] ?? 0);
    expect(size).toBeGreaterThanOrEqual(44);
  });

  it('gibt dem i-Knopf die volle Fläche, obwohl das Symbol klein ist', () => {
    const button = block(global, '.info__button');
    expect(button).toContain('inline-size: var(--tap-target)');
    expect(button).toContain('block-size: var(--tap-target)');

    // Das Symbol selbst bleibt klein – sonst wäre es kein dezenter Hinweis.
    const mark = block(global, '.info__mark');
    expect(mark).toMatch(/inline-size:\s*1\.\d+rem/);
  });

  it('begrenzt das Popover auf die Fensterbreite', () => {
    // Auf 390 px darf nichts über den Rand hinauslaufen.
    const panel = block(global, '.info__panel');
    expect(panel).toContain('100vw');
    expect(panel).toMatch(/max-inline-size:\s*min\(/);
  });

  it('hält auch die Schritte des Steppers auf Zielgröße', () => {
    expect(block(global, '.steps__step')).toContain('min-height: var(--tap-target)');
  });
});
