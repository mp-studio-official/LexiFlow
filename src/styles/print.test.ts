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

describe('Die Liste bricht sauber um', () => {
  it('schneidet keine Vokabel mitten durch', () => {
    /*
      Am Listeneintrag **und** an seinen Absätzen: Manche Engines beachten die
      Regel nur am einen, manche nur am anderen.
    */
    expect(block).toMatch(/\.sheet__entry[^{]*\{[^}]*break-inside:\s*avoid/s);
    expect(block).toMatch(/page-break-inside:\s*avoid/);
  });

  it('lässt keine einzelne Zeile allein auf einer Seite', () => {
    expect(block).toMatch(/orphans:\s*[2-9]/);
    expect(block).toMatch(/widows:\s*[2-9]/);
  });

  it('hält das Wort bei seiner Übersetzung', () => {
    /*
      Ohne diese Regel steht auf Seite 1 unten das fette englische Wort und
      auf Seite 2 oben, ohne Zusammenhang, ein deutscher Ausdruck.
    */
    expect(block).toMatch(/\.sheet__word,\s*\n?\s*\.sheet__example\s*\{[^}]*break-after:\s*avoid/s);
  });

  it('hält die Kopfzeile des Blattes bei der ersten Vokabel', () => {
    expect(block).toMatch(/\.sheet__head\s*\{[^}]*break-after:\s*avoid/s);
  });
});

describe('Die Kopfzeile und der Fuß', () => {
  it('zeigt die Kurszeile auf Papier und das Eingabefeld nicht', () => {
    /*
      Am Bildschirm ist die Kurszeile ein Feld, auf Papier eine Zeile. Das
      Feld trägt `print-hidden`, die Zeile steht erst hier im Fluss – ein
      leeres Feld hinterlässt so keine leere Zeile mit Rahmen.
    */
    expect(block).toMatch(/\.sheet__course-line\s*\{[^}]*display:\s*block/s);
  });

  it('stellt den Vermerk ans Ende des Blattes und nicht als Fußzeile', () => {
    /*
      Der Versuch war `position: fixed` – im Druck angeblich die Fußzeile. Er
      ist gescheitert: Chrome wiederholt sie nicht je Seite, sondern setzt sie
      einmal, und gemessen landete der Vermerk **oben auf Seite 2**. Diese
      Prüfung hält fest, dass er nicht zurückkommt.
    */
    expect(block).toMatch(/\.sheet__foot\s*\{[^}]*margin-top/s);
    expect(block).not.toMatch(/\.sheet__foot\s*\{[^}]*position:\s*fixed/s);
  });

  it('behält die Farbe des Balkens unter dem Titel', () => {
    /*
      Er ist eine Rahmenlinie, keine Fläche – sonst wäre er im Druck weg,
      weil Browser Hintergründe standardmäßig nicht mitdrucken.
    */
    expect(css).toMatch(/\.sheet__title\s*\{[^}]*border-bottom:[^;]*var\(--brand-tomato\)/s);
    expect(block).toMatch(/print-color-adjust:\s*exact/);
  });
});

describe('Die Regeln setzen sich auch durch', () => {
  it('gibt der Linie eine Breite, die nicht auf null rundet', () => {
    // `0.4pt` rundet je nach Engine auf 0, und die Linie verschwindet ganz.
    expect(block).not.toMatch(/border-bottom:\s*0\.\d+pt/);
  });
});
