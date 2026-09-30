// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { tippzielbefunde } from '../e2e/tippziele';

/**
 * Die Regel, was ein Tippziel ist – geprüft ohne Browser.
 *
 * ## Warum das hier steht und nicht nur in Playwright
 *
 * Der erste vollständige Mac-Lauf meldete `input.visually-hidden 1×1` als zu
 * kleines Tippziel. Das war ein Fehlalarm: Ein visuell verstecktes Dateifeld
 * wird nie angetippt, sein Label schon. Aufgefallen ist das erst nach einem
 * vollständigen Lauf über acht Projekte – also nach Minuten und einer
 * Rückmeldung.
 *
 * `tippzielbefunde` ist deshalb eine in sich geschlossene Funktion: Playwright
 * reicht sie in die Seite, und hier läuft sie unter jsdom. Die vier Fälle, um
 * die es geht, sind damit in Millisekunden prüfbar.
 *
 * ## Was jsdom kann und was nicht
 *
 * jsdom rechnet kein Layout: Jedes Element wäre 0 × 0. Die Maße werden
 * deshalb gesetzt (`getBoundingClientRect`, `getClientRects`) – geprüft wird
 * die **Regel**, nicht die Layoutrechnung des Browsers. Die macht im echten
 * Lauf der Browser selbst.
 */

function setze(el, { breite, hoehe, links = 0, oben = 0 }) {
  const kasten = {
    width: breite,
    height: hoehe,
    left: links,
    top: oben,
    right: links + breite,
    bottom: oben + hoehe,
    x: links,
    y: oben,
    toJSON: () => ({}),
  };
  el.getBoundingClientRect = () => kasten;
  el.getClientRects = () => (breite === 0 && hoehe === 0 ? [] : [kasten]);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('wahrnehmbare Bedienelemente werden selbst gemessen', () => {
  it('ein 20-px-Touchziel bleibt ein Befund', () => {
    document.body.innerHTML = '<button id="klein">Los</button>';
    setze(document.getElementById('klein'), { breite: 20, hoehe: 20 });

    const befund = tippzielbefunde();
    expect(befund.zuKlein).toEqual(['button#klein 20×20']);
    expect(befund.ohneAusloeser).toEqual([]);
  });

  it('ein 44-px-Touchziel ist keiner', () => {
    document.body.innerHTML = '<button id="gross">Los</button>';
    setze(document.getElementById('gross'), { breite: 44, hoehe: 44 });

    expect(tippzielbefunde().zuKlein).toEqual([]);
  });

  it('ein Verweis im Fließtext ist ausgenommen', () => {
    document.body.innerHTML = '<p data-fliesstext>Mehr <a href="#" id="drin">dazu</a>.</p>';
    setze(document.getElementById('drin'), { breite: 30, hoehe: 18 });

    expect(tippzielbefunde().zuKlein).toEqual([]);
  });
});

describe('absichtlich versteckte Bedienelemente werden über ihren Auslöser gemessen', () => {
  /**
   * Das Muster aus `global.css`: `position:absolute; width:1px; height:1px;
   * clip: rect(0 0 0 0)`. Geprüft wird nicht der Klassenname, sondern dass
   * das Element keine wahrnehmbare Fläche hat.
   */
  function versteckt(el) {
    el.style.clip = 'rect(0px, 0px, 0px, 0px)';
    return setze(el, { breite: 1, hoehe: 1 });
  }

  it('ein verstecktes Feld mit großem Label erzeugt keinen Fehlalarm', () => {
    document.body.innerHTML = `
      <label for="datei" id="knopf">Datei wählen</label>
      <input type="file" id="datei" class="visually-hidden">`;
    versteckt(document.getElementById('datei'));
    setze(document.getElementById('knopf'), { breite: 180, hoehe: 48 });

    const befund = tippzielbefunde();
    expect(befund.zuKlein).toEqual([]);
    expect(befund.ohneAusloeser).toEqual([]);
    // Gemessen wurde trotzdem etwas – der Auslöser.
    expect(befund.gemessen).toBe(1);
  });

  it('ein umschließendes Label zählt genauso', () => {
    document.body.innerHTML = `
      <label id="huelle">Datei wählen<input type="file" id="datei"></label>`;
    versteckt(document.getElementById('datei'));
    setze(document.getElementById('huelle'), { breite: 180, hoehe: 48 });

    expect(tippzielbefunde().ohneAusloeser).toEqual([]);
  });

  it('ein zu kleines Label wird als Auslöser gemeldet, nicht als 1×1', () => {
    /*
      Der eigentliche Zweck der Regel: Die Aussage bleibt erhalten, sie
      verschiebt sich nur auf das Element, das man wirklich anfasst.
    */
    document.body.innerHTML = `
      <label for="datei" id="knopf">Wählen</label>
      <input type="file" id="datei">`;
    versteckt(document.getElementById('datei'));
    setze(document.getElementById('knopf'), { breite: 60, hoehe: 24 });

    const befund = tippzielbefunde();
    expect(befund.zuKlein).toEqual(['label#knopf 60×24 (Auslöser für input#datei)']);
    expect(befund.ohneAusloeser).toEqual([]);
  });

  it('ein verstecktes Feld ohne sichtbaren Auslöser rutscht nicht durch', () => {
    document.body.innerHTML = '<input type="file" id="datei" aria-label="Datei">';
    versteckt(document.getElementById('datei'));

    const befund = tippzielbefunde();
    expect(befund.ohneAusloeser).toEqual(['input#datei']);
    expect(befund.zuKlein).toEqual([]);
  });

  it('ein Auslöser, der selbst versteckt ist, zählt nicht als Auslöser', () => {
    document.body.innerHTML = `
      <label for="datei" id="auchversteckt">Wählen</label>
      <input type="file" id="datei">`;
    versteckt(document.getElementById('datei'));
    versteckt(document.getElementById('auchversteckt'));

    expect(tippzielbefunde().ohneAusloeser).toEqual(['input#datei']);
  });

  it('opacity 0 zählt genauso als versteckt wie clip', () => {
    document.body.innerHTML = `
      <label for="datei" id="knopf">Wählen</label>
      <input type="file" id="datei" style="opacity: 0">`;
    setze(document.getElementById('datei'), { breite: 200, hoehe: 40 });
    setze(document.getElementById('knopf'), { breite: 180, hoehe: 48 });

    const befund = tippzielbefunde();
    expect(befund.zuKlein).toEqual([]);
    expect(befund.ohneAusloeser).toEqual([]);
  });
});

describe('was gar nicht gerendert ist, wird nicht gemessen', () => {
  it('display:none erzeugt weder Befund noch Auslöserpflicht', () => {
    document.body.innerHTML = '<button id="weg" style="display:none">Los</button>';
    setze(document.getElementById('weg'), { breite: 0, hoehe: 0 });

    const befund = tippzielbefunde();
    expect(befund.zuKlein).toEqual([]);
    expect(befund.ohneAusloeser).toEqual([]);
    expect(befund.gemessen).toBe(0);
  });

  it('eine Seite ganz ohne Bedienelemente meldet „nichts gemessen"', () => {
    document.body.innerHTML = '<p>nur Text</p>';
    expect(tippzielbefunde().gemessen).toBe(0);
  });
});
