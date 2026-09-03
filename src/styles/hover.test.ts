import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Beim Überfahren ändert sich die **Farbe**, nicht die Größe.
 *
 * ## Der Fehler, der diese Datei nötig gemacht hat
 *
 * In `global.css` stand bis Sprint 4B.5 dies:
 *
 * ```css
 * input[type='text']:hover:not(:disabled),
 * select:hover:not(:disabled),
 * ,-- ein langer Kommentar --,
 * .growing {
 *   resize: none;
 *   overflow: hidden;
 *   min-height: var(--tap-target);
 * }
 * ```
 *
 * Ein Kommentar beendet eine Auswahlliste nicht. Aus den Hover-Regeln und der
 * Regel für das wachsende Textfeld wurde damit **eine** Regel: Jedes
 * überfahrene Textfeld bekam `min-height: 44px`. Überall dort, wo ein Feld
 * absichtlich flacher ist – in der Prüftabelle, in der schmalen
 * Einstellungsspalte –, wuchs es unter der Maus um acht Pixel und schob die
 * Zeile auseinander. Der beabsichtigte Randwechsel fand gar nicht statt.
 *
 * Gemeldet wurde es als „die Schriftfelder werden größer, wenn ich mit der
 * Maus drüberfahre“. Gemessen: 35,59 px → 44 px.
 *
 * ## Warum das hier geprüft wird und nicht im Browser
 *
 * Ein End-zu-End-Test könnte es messen – aber nur an der einen Stelle, an der
 * er zufällig hinsieht. Der Fehler steckte in einer Regel, die für **alle**
 * Textfelder gilt. Geprüft wird deshalb die Regel selbst.
 */

const global = readFileSync(resolve(import.meta.dirname, 'global.css'), 'utf8');

/** Der Rumpf der Regel, deren Auswahlliste diesen Selektor enthält. */
function ruleContaining(selector: string): string {
  const at = global.indexOf(selector);
  expect(at, `Selektor ${selector} fehlt`).toBeGreaterThanOrEqual(0);
  const open = global.indexOf('{', at);
  return global.slice(open + 1, global.indexOf('}', open));
}

describe('Überfahren ändert nur die Farbe', () => {
  it('gibt einem überfahrenen Textfeld keine Mindesthöhe', () => {
    const rule = ruleContaining("input[type='text']:hover:not(:disabled)");
    expect(rule).toContain('border-color');
    expect(rule).not.toContain('min-height');
    expect(rule).not.toContain('padding');
    expect(rule).not.toContain('font-size');
  });

  it('lässt die Regel für das wachsende Textfeld für sich stehen', () => {
    /*
      `.growing` **braucht** die Mindesthöhe – ein leeres Feld fiele sonst zum
      Strich zusammen. Der Fehler war nicht diese Regel, sondern dass sie mit
      den Hover-Regeln verschmolz.
    */
    const rule = ruleContaining('\n.growing {');
    expect(rule).toContain('min-height: var(--tap-target)');
    expect(rule).toContain('resize: none');
  });

  it('trennt die beiden Regeln ohne Kommentar dazwischen', () => {
    /*
      Der eigentliche Schutz. Ein Kommentar zwischen zwei Selektoren einer
      Liste sieht wie eine Trennung aus und ist keine – genau daran ist es
      gescheitert. Hier wird geprüft, dass zwischen dem letzten Hover-Selektor
      und der schließenden Klammer der Regel nichts als Deklarationen stehen.
    */
    const start = global.indexOf("input[type='text']:hover:not(:disabled)");
    const open = global.indexOf('{', start);
    const selectors = global.slice(start, open);
    expect(selectors).not.toContain('/*');
    expect(selectors).not.toContain('.growing');
  });

  it('hält die Felder der Prüftabelle flacher als die Klickfläche', () => {
    /*
      Der Grund, aus dem der Fehler überhaupt auffiel: In der Tabelle sind die
      Felder absichtlich niedriger. Fällt diese Zusage, fällt auch der
      Unterschied auf, den der Fehler erzeugte – und niemand merkt mehr, wenn
      er zurückkommt.
    */
    const rule = ruleContaining("td input[type='text'],\ntd select");
    expect(rule).toContain('min-height');
    expect(rule).not.toContain('var(--tap-target)');
  });
});
