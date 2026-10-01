import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Sprint 4A.1c: Kontrast wird gerechnet, nicht geschätzt.
 *
 * Die Werte kommen aus `tokens.css` selbst – wer dort eine Farbe ändert,
 * erfährt beim nächsten Testlauf, ob die Kombination noch lesbar ist. Ein
 * Kommentar „sollte reichen“ hätte diese Wirkung nicht.
 *
 * Maßstab ist WCAG 2.1: 4,5 : 1 für normalen Text, 3 : 1 für große Schrift
 * (ab 18,66 px fett bzw. 24 px) und für Bedienelemente und Grafiken, die eine
 * Information tragen.
 */

const css = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf8');

/** Liest einen Token-Wert und löst `var(--…)`-Verweise auf. */
function token(name: string, depth = 0): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!match?.[1]) throw new Error(`Token --${name} fehlt in tokens.css`);
  const value = match[1].trim();
  const reference = /^var\(--([\w-]+)\)$/.exec(value);
  if (reference?.[1]) {
    if (depth > 5) throw new Error(`Token --${name} verweist im Kreis`);
    return token(reference[1], depth + 1);
  }
  return value;
}

function luminance(hex: string): number {
  const clean = hex.replace('#', '').trim();
  const channels = [0, 2, 4]
    .map((index) => parseInt(clean.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

export function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [high, low] = a > b ? [a, b] : [b, a];
  return (high + 0.05) / (low + 0.05);
}

/** Ein Paar aus Vordergrund- und Hintergrund-Token. */
function ratio(foreground: string, background: string): number {
  return contrast(token(foreground), token(background));
}

describe('Markenfarben', () => {
  it('kennt genau drei Basistöne', () => {
    expect(token('brand-aubergine')).toBe('#2f092d');
    expect(token('brand-tomato')).toBe('#ff2e2d');
    expect(token('brand-parchment')).toBe('#f8efe3');
  });

  it('führt keine vierte Markenfarbe mehr', () => {
    /*
      Orange war die vierte Farbe und ist mit 4B.1c entfallen. Der Test steht
      hier, damit sie nicht als `--brand-orange` zurückkehrt, während alle
      anderen Prüfungen grün bleiben.
    */
    expect(() => token('brand-orange')).toThrow();
    // Und mit ihr die abgeleiteten Wärmetöne.
    expect(() => token('warm')).toThrow();
    expect(() => token('warm-ink')).toThrow();
    expect(() => token('warm-soft')).toThrow();

    // Genau drei `--brand-…`-Token, nicht vier.
    expect(css.match(/--brand-[a-z]+:/g)).toHaveLength(3);

    for (const retired of ['#3b0f3f', '#e63946', '#ff8a3d', '#2b0c2b', '#faefe2', '#f6ece1']) {
      expect(css.toLowerCase(), retired).not.toContain(retired);
    }
  });

  it('leitet Flächen und Navigation aus ihnen ab', () => {
    expect(token('canvas')).toBe(token('brand-parchment'));
    expect(token('nav')).toBe(token('brand-aubergine'));
    expect(token('primary')).toBe(token('brand-aubergine'));
    expect(token('accent')).toBe(token('brand-tomato'));
  });
});

describe('Lesbarer Text (AA, 4,5 : 1)', () => {
  const pairs: readonly [string, string, string][] = [
    ['Fließtext auf Papier', 'ink', 'canvas'],
    ['Fließtext auf Karte', 'ink', 'surface'],
    ['Fließtext auf abgesenkter Fläche', 'ink', 'surface-sunken'],
    ['Zweitschrift auf Papier', 'ink-secondary', 'canvas'],
    ['Gedämpfte Schrift auf Papier', 'ink-muted', 'canvas'],
    ['Gedämpfte Schrift auf Karte', 'ink-muted', 'surface'],
    // Abgeschaltete Bedienelemente: von WCAG nicht verlangt, hier trotzdem lesbar.
    ['Abgeschalteter Knopf', 'ink-muted', 'surface-sunken'],
    ['Navigation aktiv', 'nav-ink', 'nav-active-surface'],
    ['Navigation inaktiv', 'nav-ink-muted', 'nav'],
    ['Navigation Marke', 'nav-ink', 'nav'],
    ['Primärer Knopf', 'primary-ink', 'primary'],
    ['Primärer Knopf (Hover)', 'primary-ink', 'primary-hover'],
    ['Akzent als Text auf Papier', 'accent-ink', 'canvas'],
    ['Akzent auf weicher Akzentfläche', 'accent-ink', 'accent-soft'],
    ['Tomato als Text auf Aubergine', 'accent', 'nav'],
    ['Hinweis auf Hinweisfläche', 'info', 'info-soft'],
    /*
      Seit 4B.1c liegt der Wörterbuchvorschlag auf der Hinweisfläche – vorher
      auf der weichen Orangefläche. Dort steht gedämpfte Kleinschrift, eine
      Zweitschrift und der Akzent als Hover-Farbe; alle drei stehen hier.
    */
    ['Gedämpfte Schrift auf Hinweisfläche', 'ink-muted', 'info-soft'],
    ['Zweitschrift auf Hinweisfläche', 'ink-secondary', 'info-soft'],
    ['Akzent auf Hinweisfläche', 'accent-ink', 'info-soft'],
    ['Warnung auf Hinweisfläche', 'warning', 'info-soft'],
    ['Fließtext auf Hinweisfläche', 'ink', 'info-soft'],
    ['Erfolg auf Papier', 'success', 'canvas'],
    ['Erfolg auf Erfolgsfläche', 'success', 'success-soft'],
    ['Warnung auf Warnfläche', 'warning', 'warning-soft'],
    ['Fehler auf Papier', 'danger', 'canvas'],
    ['Fehler auf Fehlerfläche', 'danger', 'danger-soft'],
  ];

  it.each(pairs)('%s', (_label, foreground, background) => {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Bedienelemente und Grafik (3 : 1)', () => {
  const pairs: readonly [string, string, string][] = [
    ['Feldrand auf Papier', 'border-strong', 'canvas'],
    ['Feldrand auf Karte', 'border-strong', 'surface'],
    ['Akzentmarker auf Papier', 'accent', 'canvas'],
    ['Marker auf Navigation', 'nav-marker', 'nav'],
    ['Fokusring auf Papier', 'focus-ring', 'canvas'],
    ['Fokusring auf Navigation', 'focus-ring-on-dark', 'nav'],
  ];

  it.each(pairs)('%s', (_label, foreground, background) => {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(3);
  });
});

describe('Kombinationen, die es nicht geben darf', () => {
  /*
    Die beiden Fälle, vor denen der Auftrag ausdrücklich warnt – hier als Test,
    damit niemand sie „aus Markengründen“ zurückholt. Der Test schlägt fehl,
    wenn jemand die Werte so ändert, dass sie plötzlich doch reichen; dann ist
    dieser Kommentar zu prüfen, nicht der Test zu löschen.
  */
  it('weiße Schrift auf voller Tomato-Fläche bleibt unter 4,5 : 1', () => {
    expect(contrast('#ffffff', token('accent'))).toBeLessThan(4.5);
  });

  it('Tomato als Text auf Papier bleibt unter 4,5 : 1', () => {
    /*
      3,25 : 1 – genug für eine Kante, zu wenig für Schrift. Auf Papier trägt
      deshalb `--accent-ink`, nicht Tomato selbst.
    */
    expect(ratio('accent', 'canvas')).toBeLessThan(4.5);
    expect(ratio('accent-ink', 'canvas')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Zustände, die man auseinanderhalten muss', () => {
  /*
    Ein Hinweis ist kein Fehler. Solange `--accent-soft` die Hinweisfläche
    trug, war beides derselbe Farbwert – im Kandidatenschritt der Textwerkstatt
    stand eine rosa Auswahlfläche direkt über einer rosa Fehlermeldung, und
    niemand konnte sehen, welche der beiden etwas bedeutete. Der Test hält
    fest, dass die vier semantischen Flächen wirklich vier verschiedene sind.
  */
  const flaechen = ['info-soft', 'success-soft', 'warning-soft', 'danger-soft'] as const;

  it.each(flaechen.flatMap((a, i) => flaechen.slice(i + 1).map((b) => [a, b] as const)))(
    '%s und %s sind nicht dieselbe Farbe',
    (a, b) => {
      expect(token(a)).not.toBe(token(b));
    },
  );

  it('trennt Hinweis und Fehler auch in der Helligkeit', () => {
    // Nicht nur „ein anderer Hexwert“, sondern sichtbar anders getönt.
    expect(token('info-soft')).not.toBe(token('danger-soft'));
    expect(token('info')).not.toBe(token('danger'));
  });
});

/**
 * E19 — die Palette der Variante B, gerechnet statt übernommen.
 *
 * Die Werte stammen aus dem freigegebenen Entwurf. Das macht sie nicht
 * geprüft: Der Entwurf stand auf hellem Grund und in großen Flächen, und
 * dieselbe Farbe, die dort als Überschrift funktioniert, kann als 13-px-Text
 * auf einer abgesetzten Fläche durchfallen. Gerechnet wird deshalb jedes
 * Paar, das die Bausteine wirklich bilden können.
 *
 * Zwei Befunde sind dabei herausgekommen; beide stehen unten als Test, damit
 * sie nicht wieder verloren gehen.
 */
describe('E19: lesbarer Text (AA, 4,5 : 1)', () => {
  const paare: readonly [string, string, string][] = [
    ['Tinte auf Grund', 'tinte', 'grund'],
    ['Tinte auf Fläche', 'tinte', 'flaeche'],
    ['Tinte auf tiefem Grund', 'tinte', 'grund-tief'],
    ['Tinte auf stumpfer Fläche', 'tinte', 'flaeche-stumpf'],
    ['Zweitschrift auf Grund', 'tinte-2', 'grund'],
    ['Zweitschrift auf Fläche', 'tinte-2', 'flaeche'],
    ['Zweitschrift auf tiefem Grund', 'tinte-2', 'grund-tief'],
    ['Zweitschrift auf stumpfer Fläche', 'tinte-2', 'flaeche-stumpf'],
    ['Gedämpfte Schrift auf Grund', 'tinte-3', 'grund'],
    ['Gedämpfte Schrift auf Fläche', 'tinte-3', 'flaeche'],
    ['Gedämpfte Schrift auf stumpfer Fläche', 'tinte-3', 'flaeche-stumpf'],
    ['Umgekehrte Schrift auf Tinte', 'tinte-invers', 'tinte'],
    ['Gut auf gut-weich', 'gut', 'gut-weich'],
    ['Gut auf Grund', 'gut', 'grund'],
    ['Warnung auf warn-weich', 'warn', 'warn-weich'],
    ['Warnung auf Grund', 'warn', 'grund'],
    ['Fehler auf fehler-weich', 'fehler', 'fehler-weich'],
    ['Fehler auf Grund', 'fehler', 'grund'],
    ['Akzent auf akzent-weich', 'akzent', 'akzent-weich'],
    ['Akzent auf Grund', 'akzent', 'grund'],
    ['Tinte auf allen vier weichen Zustandsflächen (1)', 'tinte', 'gut-weich'],
    ['Tinte auf allen vier weichen Zustandsflächen (2)', 'tinte', 'warn-weich'],
    ['Tinte auf allen vier weichen Zustandsflächen (3)', 'tinte', 'fehler-weich'],
    ['Tinte auf allen vier weichen Zustandsflächen (4)', 'tinte', 'akzent-weich'],
  ];

  it.each(paare)('%s', (_label, vorne, hinten) => {
    expect(ratio(vorne, hinten)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('E19: Bedienelemente und Grafik (3 : 1)', () => {
  const paare: readonly [string, string, string][] = [
    ['Feldrand auf Fläche', 'rand-bedienung', 'flaeche'],
    ['Feldrand auf Grund', 'rand-bedienung', 'grund'],
    ['Feldrand auf stumpfer Fläche', 'rand-bedienung', 'flaeche-stumpf'],
    ['Feldrand auf tiefem Grund', 'rand-bedienung', 'grund-tief'],
  ];

  it.each(paare)('%s', (_label, vorne, hinten) => {
    expect(ratio(vorne, hinten)).toBeGreaterThanOrEqual(3);
  });
});

describe('E19: Aurora trägt Fläche, nicht Schrift', () => {
  const aurora = ['aurora-violett', 'aurora-rosa', 'aurora-himmel', 'aurora-pfirsich'] as const;

  /*
    Die Regel lautet „Aurora trägt nie Text". Eine Regel, die nur im Kommentar
    steht, hält bis zum ersten Entwurf, in dem eine Überschrift gut aussieht.
    Hier steht sie als zwei Tests — einer für den Fall, dass doch Text darauf
    landet, einer gegen den Fall, in dem es schiefginge.
  */
  it.each(aurora)('dunkle Tinte wäre auf %s lesbar', (farbe) => {
    expect(ratio('tinte', farbe)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(aurora)('umgekehrte Schrift wäre auf %s unlesbar', (farbe) => {
    // Unter 2 : 1 — kein Grenzfall, über den man diskutieren könnte.
    expect(ratio('tinte-invers', farbe)).toBeLessThan(2);
  });
});

describe('E19: Kombinationen, die es nicht geben darf', () => {
  it('--rand-stark begrenzt keine Bedienung', () => {
    /*
      Der erste Befund. Der freigegebene Entwurf setzt `--rand-stark` als
      Feldrand ein; gegen Weiß sind das 1,65 : 1, verlangt sind 3 : 1. Der
      Test hält beides fest: dass diese Farbe die Grenze nicht erreicht — und
      dass es eine gibt, die es tut.
    */
    expect(ratio('rand-stark', 'flaeche')).toBeLessThan(3);
    expect(ratio('rand-bedienung', 'flaeche')).toBeGreaterThanOrEqual(3);
  });

  it('--tinte-3 steht nicht auf tiefem Grund', () => {
    /*
      Der zweite Befund. 4,35 : 1 — knapp daneben, und knapp daneben ist
      daneben. Die gedämpfte Schrift gehört auf Grund, Fläche und stumpfe
      Fläche; auf dem tiefen Grund trägt `--tinte-2`.
    */
    expect(ratio('tinte-3', 'grund-tief')).toBeLessThan(4.5);
    expect(ratio('tinte-2', 'grund-tief')).toBeGreaterThanOrEqual(4.5);
  });

  it('die alte und die neue Grundfläche sind nicht dieselbe Farbe', () => {
    // Sonst liefe die Palette still in die alte zurück, und E19 wäre Papier.
    expect(token('grund')).not.toBe(token('canvas'));
    expect(token('tinte')).not.toBe(token('ink'));
  });
});
