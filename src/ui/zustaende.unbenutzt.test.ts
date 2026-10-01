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

const EIGENE = [
  'zustaende.tsx',
  'zustaende.test.tsx',
  'zustaende.unbenutzt.test.ts',
  'bausteine.tsx',
  'bausteine.test.tsx',
];
const ALLE = quelldateien(wurzel).filter(
  (pfad) => !EIGENE.some((name) => pfad.endsWith(`/${name}`)),
);

const GLOBAL = readFileSync(resolve(wurzel, 'styles/global.css'), 'utf8');
/*
  Seit 5B.1 stehen die Regeln der Bausteine bei ihren Bausteinen. Eine Regel
  im Rumpf von `global.css` wird beim Umbau ihres Bausteins vergessen und
  bleibt als tote Zeile liegen; hier verschwindet sie mit ihm.
*/
const BAUSTEINSTILE = ['zustaende.css', 'bausteine.css']
  .map((datei) => readFileSync(resolve(wurzel, 'ui', datei), 'utf8'))
  .join('\n');

describe('die neuen Zustandsbausteine stehen bereit und sonst nichts', () => {
  const NEU = [
    'Skeleton',
    'PageTitle',
    'ErrorState',
    'Kurskarte',
    'Paketkarte',
    'Fortschritt',
    'LeererZustand',
  ];

  for (const baustein of NEU) {
    it(`${baustein} wird von keinem Bildschirm eingesetzt`, () => {
      const stellen = ALLE.filter((pfad) => {
        const text = readFileSync(pfad, 'utf8');
        return new RegExp(`<${baustein}[\\s/>]`).test(text);
      }).map((pfad) => pfad.slice(wurzel.length + 1));

      expect(
        stellen,
        `${baustein} ist in Benutzung — das gehört in den Umbau des Bildschirms, nicht in 5B.1`,
      ).toEqual([]);
    });
  }

  it('niemand importiert sie außer ihrem eigenen Test', () => {
    const importe = ALLE.filter((pfad) =>
      /from '.*(zustaende|bausteine)'/.test(readFileSync(pfad, 'utf8')),
    );
    expect(importe.map((pfad) => pfad.slice(wurzel.length + 1))).toEqual([]);
  });

  it('sie haben aber schon Stil — sonst wären sie im Entwurf nicht zu beurteilen', () => {
    for (const klasse of [
      '.skeleton__line',
      '.page-title__heading',
      '.error-state',
      '.karte__cover',
      '.fortschritt__fuellung',
      '.leer__titel',
    ]) {
      expect(BAUSTEINSTILE, `${klasse} fehlt`).toContain(`${klasse} `);
    }
  });

  it('und ihr Stil erreicht trotzdem keinen Bildschirm', () => {
    /*
      Die Prüfung oben zeigt nur, dass der Stil existiert. Dass er niemanden
      trifft, hängt an zwei Dingen: Das Stylesheet wird allein vom Modul
      geladen, und das Modul lädt niemand. Beides steht hier, weil das erste
      stillschweigend zurückgenommen wäre, sobald jemand es in `global.css`
      importiert.
    */
    expect(GLOBAL).not.toMatch(/@import[^;]*(zustaende|bausteine)\.css/);
    expect(GLOBAL, 'die Regeln sind nach 5B.1 nicht mehr in global.css').not.toContain(
      '.page-title__heading',
    );

    const zustaende = readFileSync(resolve(wurzel, 'ui/zustaende.tsx'), 'utf8');
    const bausteine = readFileSync(resolve(wurzel, 'ui/bausteine.tsx'), 'utf8');
    expect(zustaende).toContain("import './zustaende.css'");
    expect(bausteine).toContain("import './bausteine.css'");
  });

  it('die neuen Bausteine fassen die produktiven nicht an', () => {
    /*
      `LeererZustand` ist die E19-Fassung des leeren Zustands und ein eigener
      Baustein — nicht ein Prop an `EmptyState`. Ihm eine Variante anzubauen
      hieße, die Datei anzufassen, die sieben Bildschirme tragen, und zwar in
      dem Moment, in dem die Zusicherung aus P2 etwas wert wäre.
    */
    const bausteine = readFileSync(resolve(wurzel, 'ui/bausteine.tsx'), 'utf8');
    expect(bausteine).toContain('export function LeererZustand(');

    /*
      Ohne Kommentare: Die Datei *erklärt* im Kopf, warum sie `EmptyState`
      nicht anfasst. Diese Erklärung mitzuprüfen hieße, sie zu verbieten.
    */
    const quelltext = (text: string): string =>
      text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(quelltext(bausteine)).not.toMatch(/from '\.\/components'/);
    expect(quelltext(bausteine), 'der neue Baustein greift auf den produktiven zu').not.toMatch(
      /EmptyState/,
    );

    // Und umgekehrt: `components.tsx` weiß nichts von den neuen.
    const produktiv = quelltext(readFileSync(resolve(wurzel, 'ui/components.tsx'), 'utf8'));
    expect(produktiv).not.toMatch(/bausteine/);
    expect(produktiv).not.toMatch(/LeererZustand/);
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
