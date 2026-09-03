import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Die Zusagen des Ausdrucks – geprüft an der Regel, nicht am Papier.
 *
 * Ob eine Tabelle auf Seite 3 noch Spaltenüberschriften hat, sieht man erst
 * nach dem Drucken. Genau deshalb steht das hier: Die Regeln, die das leisten,
 * sind einzeln unscheinbar und werden beim Aufräumen als Erste gelöscht.
 *
 * jsdom rechnet kein Seitenlayout; ein Test kann hier nicht messen, sondern
 * nur festhalten, dass die Zusage im Stylesheet steht. Gemessen wird im
 * Browser (`e2e`) an den berechneten Werten.
 */

const css = readFileSync(resolve(import.meta.dirname, 'global.css'), 'utf8');

/** Der Inhalt des `@media print`-Blocks – bis zur schließenden Klammer. */
function printBlock(): string {
  const start = css.indexOf('@media print {');
  expect(start, '@media print fehlt').toBeGreaterThan(-1);

  let depth = 0;
  for (let index = start; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(start, index + 1);
    }
  }
  throw new Error('@media print ist nicht geschlossen.');
}

const block = printBlock();

describe('Das Blatt', () => {
  it('ist A4 hoch mit einem Rand, den Drucker auch können', () => {
    expect(block).toMatch(/@page\s*\{[^}]*size:\s*A4 portrait/);
    expect(block).toMatch(/@page\s*\{[^}]*margin:/);
  });

  it('druckt nichts Bedienbares mit', () => {
    /*
      Ein ausgedruckter Knopf ist ein Fleck: Er sieht aus wie Inhalt, tut
      nichts und kostet Platz. `display: none` statt `visibility: hidden` –
      sonst bliebe der Platz stehen.
    */
    for (const selector of [
      '.app-header',
      '.app-nav',
      '.bottom-nav',
      '.app-footer',
      '.skip-link',
      '.print-hidden',
    ]) {
      expect(block, `${selector} wird mitgedruckt`).toContain(selector);
    }
    expect(block).toMatch(/\.print-hidden[^{]*\{[^}]*display:\s*none/);
  });

  it('druckt schwarz auf weiß', () => {
    // Browser drucken Hintergründe standardmäßig nicht. Was Bedeutung trägt,
    // muss deshalb an Linien und Schriftschnitten hängen, nicht an Flächen.
    expect(block).toMatch(/background:\s*#fff/);
    expect(block).toMatch(/color:\s*#000/);
  });
});

describe('Die Tabelle bricht sauber um', () => {
  it('wiederholt den Kopf auf jeder Seite', () => {
    /*
      `display: table-header-group` ist die Regel, die das auslöst. Ohne sie
      steht der Kopf einmal auf Seite 1, und wer Seite 3 in der Hand hält,
      rät, welche Spalte welche ist.
    */
    expect(block).toMatch(/\.sheet__table thead\s*\{[^}]*display:\s*table-header-group/);
  });

  it('schneidet keine Zeile mitten durch', () => {
    // An `tr` **und** an der Zelle: Manche Engines beachten die Regel nur an
    // der einen, manche nur an der anderen.
    expect(block).toMatch(/\.sheet__table tr[^{]*\{[^}]*break-inside:\s*avoid/s);
    expect(block).toMatch(/page-break-inside:\s*avoid/);
  });

  it('lässt keine einzelne Zeile allein auf einer Seite', () => {
    expect(block).toMatch(/orphans:\s*[2-9]/);
    expect(block).toMatch(/widows:\s*[2-9]/);
  });

  it('hält die Kopfzeile des Blattes bei der ersten Tabellenzeile', () => {
    expect(block).toMatch(/\.sheet__head\s*\{[^}]*break-after:\s*avoid/);
  });

  it('behält border-collapse – sonst wiederholt kein Browser den Kopf', () => {
    expect(block).toMatch(/border-collapse:\s*collapse/);
  });
});

describe('Die Regeln setzen sich auch durch', () => {
  it('sticht die allgemeine Tabellenregel aus', () => {
    /*
      Weiter oben im Stylesheet steht `tbody tr:not([hidden]) > td`. Die Regel
      gehört zur Entwurfstabelle und trifft trotzdem jede Tabelle – mit genug
      Gewicht, um eine Regel mit einer einzigen Klasse zu schlagen. Die
      Vokabelliste bekam davon 2 px in Sandfarbe, auch im Druck.

      Zwei Klassen im Selektor sind die Antwort. Diese Prüfung hält fest,
      dass sie dort stehen bleiben.
    */
    expect(css).toContain('tbody tr:not([hidden]) > td');
    expect(block).toMatch(/\.sheet \.sheet__table td/);
    expect(css).toMatch(/\.sheet \.sheet__table th,\s*\.sheet \.sheet__table td/);
  });

  it('gibt der Linie eine Breite, die nicht auf null rundet', () => {
    // `0.4pt` rundet je nach Engine auf 0, und die Linie verschwindet ganz.
    expect(block).not.toMatch(/border-bottom:\s*0\.\d+pt/);
  });
});
