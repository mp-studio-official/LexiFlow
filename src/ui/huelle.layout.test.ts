import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Die Zusagen der Hülle, am Quelltext ihres Stylesheets gelesen.
 *
 * ## Warum zusätzlich zur Messung im Browser
 *
 * Die Messung in `scripts/huelle-messen.mjs` ist die stärkere Prüfung — sie
 * sieht, was wirklich passiert. Sie braucht aber einen Browser und läuft
 * deshalb nicht bei jedem `npm test`. Diese Datei fängt den häufigen Fall in
 * einer Sekunde: eine Breite, ein Innenabstand oder eine Skalierung in einer
 * `:hover`- oder `:focus-visible`-Regel. Wer das einbaut, erfährt es sofort
 * und nicht erst beim nächsten Browserlauf.
 *
 * Die beiden ersetzen einander nicht. Diese hier kann nicht wissen, ob der
 * Tooltip die Leiste über eine Kaskade doch verbreitert; die Messung kann
 * nicht sagen, welche Regel schuld war.
 */

const CSS_ROH = readFileSync(resolve(import.meta.dirname, 'huelle.css'), 'utf8');
const CSS = CSS_ROH.replace(/\/\*[\s\S]*?\*\//g, '');

/** Alle Regeln als Paar aus Selektor und Rumpf. */
function regeln(): ReadonlyArray<readonly [string, string]> {
  return [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    (treffer) => [(treffer[1] ?? '').trim(), treffer[2] ?? ''] as const,
  );
}

describe('kein Layoutsprung bei Hover, Fokus oder aktivem Zustand', () => {
  /*
    Die Eigenschaften, die etwas bewegen. `background`, `color`, `opacity`,
    `outline` und `box-shadow` sind erlaubt — sie ändern das Aussehen, nicht
    den Platz.
  */
  const BEWEGT = [
    'width',
    'inline-size',
    'min-inline-size',
    'max-inline-size',
    'padding',
    'margin',
    'gap',
    'font-size',
    'border-width',
    'scale',
  ];

  const zustandsregeln = regeln().filter(
    ([auswahl]) =>
      /:hover|:focus-visible|\[data-aktiv/.test(auswahl) && /huelle/.test(auswahl),
  );

  it('es gibt überhaupt Zustandsregeln zu prüfen', () => {
    // Sonst liefe die Schleife darunter ins Leere und meldete Erfolg.
    expect(zustandsregeln.length).toBeGreaterThan(3);
  });

  it.each(zustandsregeln.map(([auswahl]) => auswahl))('%s bewegt nichts', (auswahl) => {
    const rumpf = zustandsregeln.find(([a]) => a === auswahl)?.[1] ?? '';
    for (const eigenschaft of BEWEGT) {
      expect(rumpf, `${auswahl} setzt ${eigenschaft}`).not.toMatch(
        new RegExp(`(^|[;{\\s])${eigenschaft}\\s*:`),
      );
    }
    /* `transform: scale(…)` verschiebt zwar nichts im Fluss, sieht aber aus
       wie eine Breitenänderung. Eine Verschiebung (`translate`) ist erlaubt —
       der Tooltip zentriert sich damit. */
    expect(rumpf, `${auswahl} skaliert`).not.toMatch(/transform\s*:[^;]*scale/);
  });

  it('die Leiste hat eine feste Breite von 76 px', () => {
    const leiste = regeln().find(([auswahl]) => auswahl === '.huelle-leiste')?.[1] ?? '';
    const tiefer = CSS.slice(CSS.indexOf('@media (min-width: 62rem)'));
    const inBreit = /\.huelle-leiste\s*\{([^}]*)\}/.exec(tiefer)?.[1] ?? '';
    const zusammen = leiste + inBreit;
    for (const eigenschaft of ['inline-size', 'min-inline-size', 'max-inline-size']) {
      expect(zusammen, `${eigenschaft} fehlt`).toMatch(new RegExp(`${eigenschaft}:\\s*76px`));
    }
    expect(Number(/z-index:\s*(\d+)/.exec(inBreit)?.[1] ?? 0)).toBeGreaterThan(1);
  });

  it('der Tooltip liegt außerhalb des Flusses', () => {
    const tipp = regeln().find(([auswahl]) => auswahl === '.huelle-leiste__tipp')?.[1] ?? '';
    expect(tipp).toMatch(/position:\s*absolute/);
    // Sonst fängt er Klicks ab, die dem Ziel darunter gelten.
    expect(tipp).toMatch(/pointer-events:\s*none/);
  });
});

describe('der Tooltip erreicht auch die Tastatur', () => {
  it('`:focus-visible` steht neben `:hover`', () => {
    /*
      Ein Tooltip, den nur ein Zeiger hervorholt, ist für die Tastatur nicht
      vorhanden. Geprüft wird, dass beide Zustände denselben Rumpf teilen —
      nicht, dass es irgendwo ein `:focus-visible` gibt.
    */
    const zeigend = regeln().filter(([, rumpf]) => /opacity:\s*1/.test(rumpf));
    const mitTipp = zeigend.filter(([auswahl]) => /__tipp/.test(auswahl));
    expect(mitTipp.length, 'keine Regel zeigt den Tooltip').toBeGreaterThan(0);

    const auswahl = mitTipp.map(([a]) => a).join(' ');
    expect(auswahl).toMatch(/:hover/);
    expect(auswahl).toMatch(/:focus-visible/);
  });
});

describe('die Navigation des anderen Haltepunkts ist wirklich weg', () => {
  it('beide werden mit `display: none` ausgeblendet, nicht mit Sichtbarkeit', () => {
    /*
      `visibility: hidden` oder `opacity: 0` lassen die Ziele im
      Accessibility-Baum stehen — eine Vorlesehilfe fände dann jedes Ziel
      zweimal, einmal davon unerreichbar.
    */
    const schmal = CSS.slice(0, CSS.indexOf('@media (min-width: 62rem)'));
    const breit = CSS.slice(CSS.indexOf('@media (min-width: 62rem)'));

    expect(/\.huelle-leiste\s*\{[^}]*display:\s*none/.test(schmal), 'Leiste schmal').toBe(true);
    expect(/\.huelle-unten\s*\{[^}]*display:\s*none/.test(breit), 'untere Leiste breit').toBe(true);

    for (const regel of regeln()) {
      if (!/huelle-(leiste|unten)$/.test(regel[0])) continue;
      expect(regel[1], `${regel[0]} versteckt mit visibility/opacity`).not.toMatch(
        /visibility:\s*hidden|opacity:\s*0\b/,
      );
    }
  });

  it('der Haltepunkt ist 62rem', () => {
    // Derselbe wie bisher in `global.css` — die Breitensuite misst bei 390,
    // 768, 1024 und 1440 px, und 62rem trennt 768 von 1024.
    expect(CSS).toContain('@media (min-width: 62rem)');
    expect(CSS.match(/@media \(min-width/g)).toHaveLength(1);
  });
});

describe('Glas kommt nur aus dem Baustein', () => {
  it('huelle.css setzt selbst kein backdrop-filter', () => {
    /*
      Eine eigene Glasregel hier wäre eine zweite Glasdefinition — und damit
      ein zweiter Ort, an dem der deckende Rückfall fehlen kann.
    */
    expect(CSS).not.toMatch(/backdrop-filter/);
    expect(CSS).toMatch(/@import\s+'[^']*glas\.css'/);
  });
});

describe('Tippziele', () => {
  /**
   * Die Mindesthöhe einer Regel — oder `undefined`, wenn sie keine nennt.
   *
   * Gibt es mehrere, zählt die **kleinste**: Eine Regel, die an einer Stelle
   * 56 px und an einer anderen 36 px setzt, hat ein Ziel von 36 px.
   */
  function mindesthoehe(auswahl: string): number | undefined {
    const rumpf = [...CSS.matchAll(new RegExp(`\\${auswahl}\\s*\\{([^}]*)\\}`, 'g'))]
      .map((t) => t[1] ?? '')
      .join('');
    const werte: number[] = [];
    for (const treffer of rumpf.matchAll(/min-block-size:\s*([^;]+)/g)) {
      const wert = (treffer[1] ?? '').trim();
      if (wert === 'var(--tap-target)') werte.push(44);
      else if (/^\d+(\.\d+)?px$/.test(wert)) werte.push(Number.parseFloat(wert));
      else return undefined;
    }
    return werte.length > 0 ? Math.min(...werte) : undefined;
  }

  it('jedes anklickbare Ziel nennt mindestens 44 px', () => {
    /*
      Vorher stand hier ein Mustervergleich auf `var(--tap-target)` oder
      genau `44px`. Mit der Angleichung an Variante B bekam die untere
      Leiste 56 px — mehr als verlangt, und der Vergleich wurde trotzdem
      rot. Eine Wache, die „grösser als gefordert" ablehnt, zwingt dazu,
      entweder sie oder die Gestaltung zu verbiegen.

      Jetzt wird der Wert gelesen und gerechnet. Abgelehnt wird dasselbe wie
      vorher — zu klein —, und zusätzlich alles, was sich nicht nachrechnen
      lässt (`undefined`): Eine Höhe aus einer unbekannten Rechnung ist
      keine belegte Höhe.
    */
    for (const auswahl of ['.huelle-leiste__ziel', '.huelle-unten__ziel', '.huelle__sprung']) {
      const hoehe = mindesthoehe(auswahl);
      expect(hoehe, `${auswahl} nennt keine nachrechenbare Mindesthöhe`).toBeDefined();
      expect(hoehe, `${auswahl} ist zu klein`).toBeGreaterThanOrEqual(44);
    }
  });

  it('und erkennt ein zu kleines Ziel auch wirklich', () => {
    /*
      Die Wache an sich selbst geprüft: Ohne das hier liefe sie grün durch,
      sobald der Ausdruck oben ins Leere griffe.
    */
    const probe = (wert: string): number | undefined => {
      if (wert === 'var(--tap-target)') return 44;
      return /^\d+(\.\d+)?px$/.test(wert) ? Number.parseFloat(wert) : undefined;
    };
    expect(probe('56px')).toBe(56);
    expect(probe('40px')).toBeLessThan(44);
    expect(probe('var(--tap-target)')).toBe(44);
    expect(probe('calc(2 * 1rem)')).toBeUndefined();
  });
});
