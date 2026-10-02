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

describe('die neuen Zustandsbausteine stehen bereit — und wer sie benutzt, steht hier', () => {
  /*
    Diese Zusicherung hat sich mit 5B.3 geändert, und zwar angekündigt: Der
    Kopf dieser Datei sagt seit 5B.1, ein Fall hier sei "die Ankündigung, dass
    ein Bildschirm sich ändert". Der Start der Lehrkraft ist dieser Bildschirm.

    Die Wache fällt deshalb nicht weg, sie wechselt die Frage: nicht mehr
    "benutzt sie jemand?", sondern "benutzt sie **nur**, wer sie benutzen
    darf?". Die Liste unten ist der ganze Unterschied zwischen einem Umbau,
    der Bildschirm für Bildschirm geschieht, und einem, der sich nebenbei
    ausbreitet.
  */
  const NEU = [
    'Skeleton',
    'PageTitle',
    'ErrorState',
    'Kurskarte',
    'Paketkarte',
    'Fortschritt',
    'LeererZustand',
  ];

  /** Wer welchen Baustein benutzen darf — und seit welchem Block. */
  const UMGEBAUT: Readonly<Record<string, readonly string[]>> = {
    /* 5B.3: der Start der Lehrkraft. */
    Skeleton: ['hosted/teacher/StartPage.tsx'],
    PageTitle: ['hosted/teacher/StartPage.tsx'],
    ErrorState: ['hosted/teacher/StartPage.tsx'],
  };

  for (const baustein of NEU) {
    it(`${baustein} steht nur dort, wo ein Block ihn eingezogen hat`, () => {
      const stellen = ALLE.filter((pfad) => {
        const text = readFileSync(pfad, 'utf8');
        return new RegExp(`<${baustein}[\\s/>]`).test(text);
      }).map((pfad) => pfad.slice(wurzel.length + 1));

      expect(
        stellen.sort(),
        `${baustein} steht an einer Stelle, die kein Block eingezogen hat — ` +
          'das gehört in den Umbau dieses Bildschirms, nicht nebenbei',
      ).toEqual([...(UMGEBAUT[baustein] ?? [])].sort());
    });
  }

  it('und die Liste beschreibt wirklich etwas', () => {
    /*
      Ohne diese Zeile bliebe der Block grün, wenn jemand `UMGEBAUT` leerte
      und gleichzeitig alle Verwendungen entfernte — oder, schlimmer, wenn
      das Suchmuster eines Tages nichts mehr fände.
    */
    const eingetragen = Object.values(UMGEBAUT).flat();
    expect(eingetragen.length, 'kein Baustein ist eingezogen').toBeGreaterThan(0);
    for (const datei of new Set(eingetragen)) {
      expect(ALLE.some((pfad) => pfad.endsWith(`/${datei}`)), `${datei} gibt es nicht`).toBe(true);
    }
  });

  it('importiert werden sie nur von denselben Dateien', () => {
    const importe = ALLE.filter((pfad) =>
      /from '.*(zustaende|bausteine)'/.test(readFileSync(pfad, 'utf8')),
    ).map((pfad) => pfad.slice(wurzel.length + 1));
    expect(importe.sort()).toEqual([...new Set(Object.values(UMGEBAUT).flat())].sort());
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

  it('und ihr Stil kommt mit ihnen, nicht aus global.css', () => {
    /*
      Bis 5B.3 hieß dieser Fall "erreicht keinen Bildschirm". Seit der Start
      der Lehrkraft sie benutzt, stimmt das nicht mehr — aber die Aussage
      darunter gilt weiter und ist die wichtigere: Der Stil hängt am Modul und
      nicht an `global.css`. Käme er dorthin, träfe er mit einer Zeile jeden
      Bildschirm, auch die portable Lerndatei, die diese Bausteine nie lädt.
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
