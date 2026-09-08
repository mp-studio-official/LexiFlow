import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Laufweite ist eine Eigenschaft der Größe.
 *
 * ## Der Befund, der diese Datei nötig gemacht hat
 *
 * `--tracking-tight` (−0,014em) stand bis Sprint 4D an `--text-base` (15 px)
 * genauso wie an `--text-3xl` (36 px) – und in der Regel für h1 bis h4, also
 * über die ganze Spanne von 16 bis 36 px in einer Zeile. Ein Wert kann für
 * beides nicht stimmen: Große Schrift wirkt zu locker und will enger stehen,
 * kleine wird durch negative Laufweite schlechter lesbar.
 *
 * Bemerkenswert war, dass das System es schon gemerkt hatte. Neben dem Token
 * standen drei handgesetzte Einzelwerte – −0,005em am Knopf, −0,01em am
 * Anspruch, −0,03em an der Wortmarke – und für kurze Etiketten zwei positive
 * Werte, die sich um 0,22 px unterschieden. Es war nicht Nachlässigkeit,
 * sondern eine fehlende Regel, um die herum jemand mehrfach improvisiert hat.
 *
 * ## Was hier geprüft wird
 *
 * Nicht, wie eine Stufe aussieht – das ist eine gestalterische Entscheidung
 * und gehört ins Auge. Geprüft wird die **Zuordnung**: Setzt eine Regel eine
 * Schriftgröße und eine Laufweite, muss die Laufweite die Stufe dieser Größe
 * sein. Genau diese Zuordnung war der Fehler, und genau sie bricht wieder,
 * wenn jemand eine Regel kopiert und die Größe ändert.
 */

const hier = import.meta.dirname;
const tokens = readFileSync(resolve(hier, 'tokens.css'), 'utf8');
const css = readFileSync(resolve(hier, 'global.css'), 'utf8');

function token(name: string): number {
  /* `em` ist optional: Die Fließtextstufe ist eine glatte Null und trägt in
     CSS zu Recht keine Einheit. */
  const treffer = new RegExp(`--${name}:\\s*(-?[\\d.]+)(?:em)?\\s*;`).exec(tokens);
  expect(treffer, `--${name} fehlt in tokens.css`).not.toBeNull();
  return Number.parseFloat(treffer?.[1] ?? 'NaN');
}

describe('Die Stufenleiter', () => {
  it('läuft mit der Größe mit', () => {
    /*
      Die eine Eigenschaft, die eine Stufenleiter zur Leiter macht: Je größer
      die Schrift, desto enger steht sie. Wer eine Stufe verändert, darf die
      Ordnung nicht umwerfen – sonst wäre die Zuordnung unten zwar noch
      erfüllt, aber sinnlos.
    */
    const leiter = [
      token('tracking-body'),
      token('tracking-snug'),
      token('tracking-tight'),
      token('tracking-tighter'),
      token('tracking-display'),
    ];

    for (let i = 1; i < leiter.length; i += 1) {
      expect(leiter[i], `Stufe ${i} ist nicht enger als ${i - 1}`).toBeLessThan(
        leiter[i - 1] as number,
      );
    }
  });

  it('lässt Fließtext nicht enger stehen als normal', () => {
    // Negative Laufweite bei 15 px kostet Lesbarkeit und gewinnt nichts.
    expect(token('tracking-body')).toBeGreaterThanOrEqual(0);
  });

  it('sperrt Versalien, statt sie zu verengen', () => {
    expect(token('tracking-eyebrow')).toBeGreaterThan(0);
    expect(token('tracking-label')).toBeGreaterThan(0);
    expect(token('tracking-label')).toBeLessThan(token('tracking-eyebrow'));
  });
});

/**
 * Welche Stufe zu welcher Schriftgröße gehört.
 *
 * Die Wortmarke steht bewusst nicht darin: Sie ist ein Bild und keine
 * Schriftgröße, und sie soll in der Kopfzeile, in der Navigation und auf dem
 * Druckblatt gleich aussehen, obwohl sie dort in drei Größen steht.
 */
const STUFE_JE_GROESSE: Readonly<Record<string, readonly string[]>> = {
  '--text-2xs': ['--tracking-eyebrow', '--tracking-label'],
  '--text-xs': ['--tracking-eyebrow', '--tracking-label', '--tracking-body'],
  '--text-sm': ['--tracking-eyebrow', '--tracking-label', '--tracking-body'],
  '--text-base': ['--tracking-body'],
  '--text-md': ['--tracking-body'],
  '--text-lg': ['--tracking-snug', '--tracking-wordmark'],
  '--text-xl': ['--tracking-snug', '--tracking-wordmark'],
  '--text-2xl': ['--tracking-tight'],
  '--text-3xl': ['--tracking-tighter'],
  '--text-display': ['--tracking-display'],
};

interface Regel {
  selektor: string;
  groesse: string;
  laufweite: string;
  zeile: number;
}

/** Alle Regeln, die beides setzen – nur dort ist die Zuordnung prüfbar. */
function regelnMitBeidem(): Regel[] {
  const gefunden: Regel[] = [];
  const muster = /letter-spacing:\s*([^;]+);/g;
  let treffer: RegExpExecArray | null;

  while ((treffer = muster.exec(css)) !== null) {
    const auf = css.lastIndexOf('{', treffer.index);
    const zu = css.indexOf('}', treffer.index);
    const rumpf = css.slice(auf, zu);
    const groesse = /font-size:\s*([^;]+);/.exec(rumpf);
    if (!groesse) continue;

    const davor = css.lastIndexOf('}', auf);
    const selektor = css
      .slice(davor + 1, auf)
      .trim()
      .split('\n')
      .pop()
      ?.trim();

    gefunden.push({
      selektor: selektor ?? '?',
      groesse: groesse[1]?.trim() ?? '',
      laufweite: treffer[1]?.trim() ?? '',
      zeile: css.slice(0, treffer.index).split('\n').length,
    });
  }
  return gefunden;
}

describe('Jede Regel nimmt die Stufe ihrer Größe', () => {
  const regeln = regelnMitBeidem();

  it('findet überhaupt genug Regeln zum Prüfen', () => {
    // Ein Test, der nichts findet, besteht immer.
    expect(regeln.length).toBeGreaterThan(20);
  });

  it('setzt die Laufweite nirgends als rohen Wert', () => {
    /*
      Ein roher Wert ist kein Fehler an sich – aber er ist der Weg, auf dem
      sich die Stufen wieder auflösen. Drei der vier Ausnahmen von 4B waren
      genau so entstanden.
    */
    const roh = regeln
      .filter((regel) => !regel.laufweite.startsWith('var(--tracking-'))
      .map((regel) => `${regel.selektor} (Zeile ${regel.zeile}): ${regel.laufweite}`);

    expect(roh).toEqual([]);
  });

  it('nimmt zu jeder Größe die passende Stufe', () => {
    const falsch: string[] = [];

    for (const regel of regeln) {
      const erlaubt = STUFE_JE_GROESSE[regel.groesse];
      // Eine Größe, die nicht aus der Skala kommt (etwa ein `clamp`), lässt
      // sich hier nicht zuordnen – sie wird unten einzeln geprüft.
      if (!erlaubt) continue;

      const genommen = /var\((--tracking-[a-z]+)\)/.exec(regel.laufweite)?.[1];
      if (genommen && !erlaubt.includes(genommen)) {
        falsch.push(
          `${regel.selektor} (Zeile ${regel.zeile}): ${regel.groesse} trägt ${genommen}, ` +
            `erlaubt wäre ${erlaubt.join(' oder ')}`,
        );
      }
    }

    expect(falsch).toEqual([]);
  });

  it('ordnet auch die Regeln zu, deren Größe aus einem `clamp` kommt', () => {
    /*
      `.prompt` wächst von 1,4 rem auf 2 rem – also von 22 auf 32 px. Die
      Zuordnungstabelle kennt nur die Stufen der Skala und lässt solche Regeln
      aus; hier wird die eine, die es gibt, ausdrücklich benannt. Kommt eine
      zweite hinzu, fällt dieser Test um.
    */
    const mitClamp = regeln.filter((regel) => regel.groesse.startsWith('clamp('));
    expect(mitClamp.map((regel) => regel.selektor)).toEqual(['.prompt']);
    expect(mitClamp[0]?.laufweite).toBe('var(--tracking-tight)');
  });
});
