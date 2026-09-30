// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { tippzielbefunde } from '../e2e/tippziele';

/**
 * Wie viele Formularfelder eine Ansicht wirklich hat.
 *
 * ## Der Befund
 *
 * Die Tastaturprüfung fragte Playwright nach sichtbaren Formularfeldern. Ein
 * visuell verstecktes Dateifeld – 1 × 1 px, `clip: rect(0 0 0 0)` – zählte
 * dort als sichtbar. Also verlangte die Prüfung unter WebKit, dass Tab es
 * erreicht, und meldete im Lehrkraft- und Lernbereich bei allen vier Breiten:
 * „zwanzig Tabulatorschritte erreichen keines der 1 Formularfelder".
 *
 * Startseite und Datenschutz wurden dagegen richtig übersprungen – sie haben
 * gar kein Feld. Der Unterschied lag nicht in den Ansichten, sondern in zwei
 * Sichtbarkeitsbegriffen innerhalb einer Prüfbank.
 *
 * ## Die Regel
 *
 * Die Zahl kommt jetzt aus `tippzielbefunde` – derselben Funktion und
 * derselben Unterscheidung „gerendert / nur technisch da / wahrnehmbar", die
 * auch entscheidet, ob ein Tippziel gemessen oder über seinen Auslöser
 * beurteilt wird.
 */

function setze(el, { breite = 100, hoehe = 40 } = {}) {
  const kasten = {
    width: breite,
    height: hoehe,
    left: 0,
    top: 0,
    right: breite,
    bottom: hoehe,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
  el.getBoundingClientRect = () => kasten;
  el.getClientRects = () => (breite === 0 && hoehe === 0 ? [] : [kasten]);
  return el;
}

function versteckt(el) {
  el.style.clip = 'rect(0px, 0px, 0px, 0px)';
  return setze(el, { breite: 1, hoehe: 1 });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sichtbare Formularfelder – dieselbe Regel wie bei den Tippzielen', () => {
  it('ein technisch verstecktes Dateifeld zählt nicht', () => {
    /*
      Der Fall aus dem Lehrkraft- und Lernbereich. Er darf die WebKit-Prüfung
      nicht aktivieren: Safari springt mit Tab keine Verweise an, und ein
      unsichtbares Feld ist kein Grund, das der Gestaltung anzulasten.
    */
    document.body.innerHTML = `
      <label for="datei" id="knopf">Datei wählen</label>
      <input type="file" id="datei" class="visually-hidden">
      <a href="#" id="verweis">Weiter</a>`;
    versteckt(document.getElementById('datei'));
    setze(document.getElementById('knopf'), { breite: 180, hoehe: 48 });
    setze(document.getElementById('verweis'), { breite: 90, hoehe: 44 });

    expect(tippzielbefunde().sichtbareFormularfelder).toBe(0);
  });

  it('ein wirklich sichtbares Textfeld zählt', () => {
    // Der Fall der Anmeldeseite – dort muss die Prüfung weiterhin greifen.
    document.body.innerHTML = '<input type="text" id="feld">';
    setze(document.getElementById('feld'), { breite: 300, hoehe: 44 });

    expect(tippzielbefunde().sichtbareFormularfelder).toBe(1);
  });

  it('beides nebeneinander ergibt genau eins', () => {
    document.body.innerHTML = `
      <input type="file" id="datei">
      <input type="text" id="feld">`;
    versteckt(document.getElementById('datei'));
    setze(document.getElementById('feld'), { breite: 300, hoehe: 44 });

    expect(tippzielbefunde().sichtbareFormularfelder).toBe(1);
  });

  it('ein abgeschaltetes Feld zählt nicht – dorthin springt kein Tab', () => {
    document.body.innerHTML = '<input type="text" id="feld" disabled>';
    setze(document.getElementById('feld'), { breite: 300, hoehe: 44 });

    expect(tippzielbefunde().sichtbareFormularfelder).toBe(0);
  });

  it('ein Feld mit display:none zählt nicht', () => {
    document.body.innerHTML = '<input type="text" id="feld" style="display:none">';
    setze(document.getElementById('feld'), { breite: 0, hoehe: 0 });

    expect(tippzielbefunde().sichtbareFormularfelder).toBe(0);
  });

  it('Auswahl und Textbereich zählen mit', () => {
    document.body.innerHTML = '<select id="a"></select><textarea id="b"></textarea>';
    setze(document.getElementById('a'), { breite: 200, hoehe: 44 });
    setze(document.getElementById('b'), { breite: 200, hoehe: 90 });

    expect(tippzielbefunde().sichtbareFormularfelder).toBe(2);
  });
});
