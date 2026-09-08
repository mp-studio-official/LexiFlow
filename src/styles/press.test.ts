import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Was passiert, wenn man etwas drückt – und was nur passiert, wenn es einen
 * Zeiger gibt.
 *
 * ## Der Befund, der diese Datei nötig gemacht hat
 *
 * Vor Sprint 4D standen in 4516 Zeilen `global.css` genau **zwei**
 * `:active`-Regeln. Alles Übrige, was man anfassen kann – die Paketkarte, die
 * Lernwegkarte, die untere Navigation, die Chips des Wörterbuchs, der
 * Aufklapper – hatte nur einen Hover-Zustand. Hover gibt es auf einem Telefon
 * nicht. Wer dort eine Paketkarte antippte, bekam bis zum Seitenwechsel
 * überhaupt keine Rückmeldung.
 *
 * Dazu die Gegenrichtung: 22 von 28 Hover-Regeln liefen ohne
 * `@media (hover: hover)`. Mobile Browser lassen den emulierten Hover nach
 * einem Tippen stehen – die Fläche sah danach aus, als läge der Finger noch
 * darauf. Zusammen ergab das die verkehrte Reihenfolge: **während** des
 * Drückens nichts, **danach** ein Zustand, der nicht mehr stimmt.
 *
 * ## Warum das hier geprüft wird und nicht im Browser
 *
 * Aus demselben Grund wie bei `hover.test.ts`: Ein End-zu-End-Test misst die
 * eine Stelle, an der er zufällig hinsieht. Der Befund betraf jede anfassbare
 * Fläche der Anwendung. Geprüft werden deshalb die Regeln selbst – und vor
 * allem die Vollständigkeit, denn der wahrscheinlichste Rückfall ist nicht,
 * dass jemand eine Regel kaputt macht, sondern dass die nächste neue Fläche
 * ohne Druckzustand hinzukommt.
 */

const css = readFileSync(resolve(import.meta.dirname, 'global.css'), 'utf8');

interface Regel {
  selektor: string;
  /** Die At-Regeln, in denen diese Regel steckt – von außen nach innen. */
  kontext: string[];
}

/**
 * Ein kleiner Durchlauf durch die Datei, der Selektoren mit ihrem
 * At-Regel-Kontext sammelt.
 *
 * Absichtlich kein CSS-Parser aus dem Paketverzeichnis: Diese Prüfung soll
 * genau eine Frage beantworten – steht diese Regel in einer Schranke? – und
 * eine Abhängigkeit, die dafür ein vollständiges Syntaxmodell mitbringt, wäre
 * mehr Angriffsfläche als Nutzen.
 */
function regeln(quelle: string): Regel[] {
  const gefunden: Regel[] = [];
  const stapel: string[] = [];
  let puffer = '';
  let i = 0;

  while (i < quelle.length) {
    // Kommentare überspringen – in ihnen steht viel, was wie CSS aussieht.
    if (quelle.startsWith('/*', i)) {
      const ende = quelle.indexOf('*/', i + 2);
      i = ende < 0 ? quelle.length : ende + 2;
      puffer = '';
      continue;
    }

    const zeichen = quelle[i];
    if (zeichen === '{') {
      const kopf = puffer.trim();
      if (kopf.startsWith('@')) {
        stapel.push(kopf);
      } else {
        gefunden.push({ selektor: kopf, kontext: [...stapel] });
        // Der Rumpf einer Regel enthält keine weiteren Regeln.
        stapel.push('');
      }
      puffer = '';
    } else if (zeichen === '}') {
      stapel.pop();
      puffer = '';
    } else {
      puffer += zeichen;
    }
    i += 1;
  }
  return gefunden;
}

const alle = regeln(css);

/** Alle Regeln, deren Selektorliste `:hover` enthält. */
const hoverRegeln = alle.filter((regel) => regel.selektor.includes(':hover'));

/** Alle Regeln, deren Selektorliste `:active` enthält. */
const aktivRegeln = alle.filter((regel) => regel.selektor.includes(':active'));

function hatDruckzustand(selektor: string): boolean {
  return aktivRegeln.some((regel) => regel.selektor.includes(selektor));
}

describe('Überfahren gehört hinter eine Schranke', () => {
  it('lässt keine Hover-Regel ohne `hover: hover` stehen', () => {
    /*
      Die eine Prüfung, auf die es ankommt. Sie zählt nicht, sondern nennt die
      Ausreißer – eine Zahl in einer Fehlermeldung sagt niemandem, welche Regel
      gemeint ist.

      Eine Ausnahme ist zugelassen und zwar nur diese: eine Regel, die eine
      Bewegung **zurücknimmt**, weil jemand reduzierte Bewegung eingestellt
      hat. Sie steht dort, wo sie steht, damit sie die Hover-Regel überstimmt;
      sie in eine zweite Schranke zu schachteln machte den Quelltext schlechter
      lesbar, ohne irgendetwas zu ändern.
    */
    const ungeschuetzt = hoverRegeln
      .filter((regel) => !regel.kontext.some((at) => at.includes('hover: hover')))
      .filter((regel) => !regel.kontext.some((at) => at.includes('prefers-reduced-motion')))
      .map((regel) => regel.selektor.replace(/\s+/g, ' '));

    expect(ungeschuetzt).toEqual([]);
  });

  it('lässt den Fokus draußen, wo er mit dem Überfahren zusammenstand', () => {
    /*
      Der Fehler, der beim Absichern beinahe passiert wäre: Paketkarte,
      Lernwegkarte und der Griff der Splitansicht hatten Hover und Fokus in
      **einer** Auswahlliste, weil beides gleich aussieht. Wandert die ganze
      Liste in die Schranke, verschwindet auf einem Gerät ohne Zeiger auch die
      Tastaturbedienung – und niemand bemerkt es, weil dort selten jemand mit
      der Tastatur arbeitet.
    */
    const fokusRegeln = alle.filter((regel) => regel.selektor.includes(':focus-visible'));
    const eingesperrt = fokusRegeln
      .filter((regel) => regel.kontext.some((at) => at.includes('hover: hover')))
      .map((regel) => regel.selektor.replace(/\s+/g, ' '));

    expect(eingesperrt).toEqual([]);
  });
});

describe('Drücken gibt eine Antwort', () => {
  /**
   * Die Flächen, die eine Antwort schulden.
   *
   * Bewusst eine Liste und keine Herleitung: Was anfassbar ist, weiß der
   * Quelltext nicht – `cursor: pointer` steht auch an Dingen, die nur ein
   * Kind haben, das den Klick trägt. Wer eine neue anfassbare Fläche baut,
   * trägt sie hier ein; genau dieser Schritt ist der Zweck der Liste.
   */
  const flaechen = [
    '.pack-card',
    '.mode-card',
    '.creator-option',
    '.bottom-nav__link',
    '.app-nav__link',
    '.icon-btn',
    '.chip',
    '.badge--button',
    '.badge--action',
    '.disclosure__summary',
    '.option',
    '.steps__step',
    '.mode',
    '.candidate__more',
    '.btn',
  ];

  it.each(flaechen)('%s antwortet auf den Finger', (flaeche) => {
    expect(hatDruckzustand(flaeche)).toBe(true);
  });

  it('nimmt beim Drücken nichts weg, was das Überfahren gegeben hat', () => {
    /*
      Der schärfste Einzelfall des Befunds: `.creator-option:hover` hob die
      Kachel um 1 px an, `.creator-option:active` setzte `transform: none`.
      Auf dem Zeigergerät nahm das Drücken damit die einzige Rückmeldung
      wieder weg – gedrückt sah aus wie unberührt.
    */
    const kachel = aktivRegeln.find((regel) => regel.selektor.startsWith('.creator-option:active'));
    expect(kachel).toBeDefined();

    const rumpf = css.slice(css.indexOf('.creator-option:active'));
    const inhalt = rumpf.slice(rumpf.indexOf('{') + 1, rumpf.indexOf('}'));
    expect(inhalt).not.toContain('transform: none');
    expect(inhalt).toContain('scale(');
  });

  it('antwortet schneller, als es zurückgeht', () => {
    /*
      Eine Rückmeldung auf den Finger muss da sein, nicht ankommen. Der Weg
      zurück darf sich Zeit lassen – Loslassen ist kein Ereignis, auf das
      jemand wartet.
    */
    const mitMassstab = aktivRegeln.filter((regel) => {
      const rumpf = css.slice(css.indexOf(regel.selektor));
      return rumpf.slice(rumpf.indexOf('{'), rumpf.indexOf('}')).includes('scale(');
    });
    expect(mitMassstab.length).toBeGreaterThan(5);

    for (const regel of mitMassstab) {
      const start = css.indexOf(regel.selektor);
      const inhalt = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
      expect(inhalt, regel.selektor).toContain('--duration-press');
    }
  });
});
