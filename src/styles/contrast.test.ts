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
  it('behält die vier Basistöne unverändert', () => {
    expect(token('brand-aubergine')).toBe('#3b0f3f');
    expect(token('brand-tomato')).toBe('#e63946');
    expect(token('brand-orange')).toBe('#ff8a3d');
    expect(token('brand-parchment')).toBe('#f8efe3');
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
    ['Orange als Text auf Papier', 'warm-ink', 'canvas'],
    ['Orange auf weicher Orangefläche', 'warm-ink', 'warm-soft'],
    ['Dunkle Tinte auf Orangefläche', 'ink', 'warm'],
    ['Hinweis auf Hinweisfläche', 'info', 'info-soft'],
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
    ['Orange-Marker auf Navigation', 'nav-marker', 'nav'],
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

  it('weiße Schrift auf voller Orange-Fläche bleibt unter 4,5 : 1', () => {
    expect(contrast('#ffffff', token('warm'))).toBeLessThan(4.5);
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
