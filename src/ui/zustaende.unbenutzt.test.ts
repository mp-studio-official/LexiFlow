import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * P2 ändert an keinem bestehenden Bildschirm etwas — der Nachweis.
 *
 * ## Warum das ein eigener Test ist
 *
 * Weil „ändert nichts" ohne Nachweis eine Behauptung ist, und weil bei P1a
 * schon einmal die Frage aufkam, ob sie stimmt. Dort ging es um Token; hier
 * geht es um Bausteine, und die sind gefährlicher: Ein Baustein, der an einer
 * Stelle eingesetzt wird, ändert dort sofort das Bild.
 *
 * ## Zwei Aussagen
 *
 * 1. `Skeleton`, `PageTitle` und `ErrorState` werden von keiner Datei
 *    eingesetzt außer ihrem eigenen Test.
 * 2. `EmptyState` ist unangetastet — seine Klassen stehen unverändert im
 *    Stylesheet. Das ist die schärfere Aussage, weil er in sieben Bereichen
 *    produktiv ist: Lehrkraft- und Lernendenstart, Lernbereiche, Kurse,
 *    Pakete, KI-Zugang.
 *
 * Fällt einer dieser Tests, ist das kein Fehler im Test, sondern die
 * Ankündigung, dass ein Bildschirm sich ändert. Dann gehört die Änderung in
 * den Umbau dieses Bildschirms — nicht in einen Vorbereitungsblock.
 */

const wurzel = resolve(import.meta.dirname, '..');

/** Alle Quelldateien unter `src/`, ohne die Tests der Bausteine selbst. */
function quelldateien(ordner: string): string[] {
  const gefunden: string[] = [];
  for (const eintrag of readdirSync(ordner)) {
    const pfad = join(ordner, eintrag);
    if (statSync(pfad).isDirectory()) {
      gefunden.push(...quelldateien(pfad));
      continue;
    }
    if (/\.(ts|tsx)$/.test(eintrag)) gefunden.push(pfad);
  }
  return gefunden;
}

const EIGENE = ['zustaende.tsx', 'zustaende.test.tsx', 'zustaende.unbenutzt.test.ts'];
const ALLE = quelldateien(wurzel).filter(
  (pfad) => !EIGENE.some((name) => pfad.endsWith(`/${name}`)),
);

const GLOBAL = readFileSync(resolve(wurzel, 'styles/global.css'), 'utf8');

describe('die neuen Zustandsbausteine stehen bereit und sonst nichts', () => {
  for (const baustein of ['Skeleton', 'PageTitle', 'ErrorState']) {
    it(`${baustein} wird von keinem Bildschirm eingesetzt`, () => {
      const stellen = ALLE.filter((pfad) => {
        const text = readFileSync(pfad, 'utf8');
        return new RegExp(`<${baustein}[\\s/>]`).test(text);
      }).map((pfad) => pfad.slice(wurzel.length + 1));

      expect(
        stellen,
        `${baustein} ist in Benutzung — das gehört in den Umbau des Bildschirms, nicht in P2`,
      ).toEqual([]);
    });
  }

  it('niemand importiert sie außer ihrem eigenen Test', () => {
    const importe = ALLE.filter((pfad) => /from '.*zustaende'/.test(readFileSync(pfad, 'utf8')));
    expect(importe.map((pfad) => pfad.slice(wurzel.length + 1))).toEqual([]);
  });

  it('sie haben aber schon Stil — sonst wären sie im Entwurf nicht zu beurteilen', () => {
    for (const klasse of ['.skeleton__line', '.page-title__heading', '.error-state']) {
      expect(GLOBAL, `${klasse} fehlt`).toContain(`${klasse} `);
    }
  });
});

describe('EmptyState bleibt, wie er ist', () => {
  /**
   * Der Stand vom 30.09.2026, vor P2. Jede Abweichung ist eine sichtbare
   * Änderung an sieben produktiven Bereichen.
   */
  const ERWARTET: Record<string, string[]> = {
    '.empty-state': [
      'padding: var(--space-7) var(--space-5)',
      'border: 1px dashed var(--border)',
      'border-radius: var(--radius-surface)',
      'background: var(--surface-sunken)',
      'display: grid',
      'gap: var(--space-3)',
      'justify-items: start',
      'max-width: var(--width-prose)',
    ],
    '.empty-state__title': ['font-size: var(--text-lg)', 'margin: 0'],
    '.empty-state__text': [
      'margin: 0',
      'color: var(--ink-secondary)',
      'font-size: var(--text-base)',
    ],
  };

  function regel(auswahl: string): string {
    const anfang = GLOBAL.indexOf(`${auswahl} {`);
    expect(anfang, `Regel ${auswahl} fehlt`).toBeGreaterThanOrEqual(0);
    return GLOBAL.slice(anfang, GLOBAL.indexOf('}', anfang));
  }

  for (const [auswahl, zeilen] of Object.entries(ERWARTET)) {
    it(`${auswahl} ist unverändert`, () => {
      const block = regel(auswahl);
      for (const zeile of zeilen) {
        expect(block, `${auswahl}: „${zeile}" fehlt`).toContain(zeile);
      }
      /*
        Auch nach oben festgenagelt: Eine zusätzliche Eigenschaft wäre
        ebenfalls eine sichtbare Änderung. Gezählt werden die Zeilen mit
        Doppelpunkt.
      */
      const eigenschaften = block
        .split('\n')
        .slice(1)
        .filter((zeile) => zeile.includes(':')).length;
      expect(eigenschaften, `${auswahl} hat Eigenschaften dazubekommen oder verloren`).toBe(
        zeilen.length,
      );
    });
  }

  it('sein Markup ist unverändert', () => {
    /*
      Das CSS allein genügt nicht: Aus `<div class="empty-state">` ein
      `<section>` zu machen oder die Reihenfolge von Text und Handlung zu
      tauschen ändert sieben Bildschirme, ohne eine Zeile Stil anzufassen.
      Festgenagelt wird deshalb, was gerendert wird — Marken, Klassen,
      Reihenfolge.
    */
    const bausteine = readFileSync(resolve(wurzel, 'ui/components.tsx'), 'utf8');
    const anfang = bausteine.indexOf('export function EmptyState(');
    expect(anfang, 'EmptyState fehlt in components.tsx').toBeGreaterThanOrEqual(0);
    /*
      Bis zum nächsten `export` oder zum Dateiende. Nicht bis zur nächsten
      schließenden Klammer am Zeilenanfang: Die steht schon im Typ der Props.
    */
    const naechster = bausteine.indexOf('\nexport ', anfang + 1);
    const rumpf = bausteine.slice(anfang, naechster >= 0 ? naechster : undefined);

    expect(rumpf).toContain('<div className="empty-state">');
    expect(rumpf).toContain('<h3 className="empty-state__title">{title}</h3>');

    // Und in dieser Reihenfolge: Titel, Erklärung, Handlung.
    const reihenfolge = ['{title}', '{children}', '{action}'].map((teil) => rumpf.indexOf(teil));
    expect(reihenfolge.every((stelle) => stelle >= 0), 'ein Teil fehlt').toBe(true);
    expect([...reihenfolge].sort((a, b) => a - b)).toEqual(reihenfolge);

    // Keine weitere Marke dazwischen.
    const marken = [...rumpf.matchAll(/<([a-z][a-z0-9]*)\b/g)].map((treffer) => treffer[1]);
    expect(marken).toEqual(['div', 'h3']);
  });

  it('steht weiterhin in `components.tsx` und nicht woanders', () => {
    const bausteine = readFileSync(resolve(wurzel, 'ui/components.tsx'), 'utf8');
    expect(bausteine).toContain('export function EmptyState(');

    const zustaende = readFileSync(resolve(wurzel, 'ui/zustaende.tsx'), 'utf8');
    expect(
      zustaende,
      'EmptyState gehört nicht in den Vorbereitungsblock — er ist produktiv',
    ).not.toMatch(/export function EmptyState\b/);
  });
});
