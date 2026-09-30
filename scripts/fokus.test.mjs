// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { fokusIndikatorMessen, indikatorAendertSich } from '../e2e/fokus';

/**
 * Die getrennte Fokusprüfung – geprüft ohne Browser.
 *
 * ## Warum sie getrennt gehört
 *
 * Die alte Prüfung drückte einmal Tab und verlangte, dass danach etwas den
 * Fokus hat. Unter WebKit fiel sie 28-mal durch, ohne dass an der Gestaltung
 * etwas gewesen wäre: Safari auf macOS springt mit Tab standardmäßig nur
 * Formularfelder an. Damit maß eine Prüfung zwei Dinge und benannte das
 * falsche.
 *
 * Hier stehen die zwei Aussagen, die sich ohne Browser prüfen lassen: dass
 * das richtige Element gewählt wird, und dass ein fehlender Indikator
 * auffällt. Was jsdom nicht kann – `:focus-visible` auswerten und Umrisse
 * rechnen –, macht im echten Lauf der Browser.
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
  el.getClientRects = () => [kasten];
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('der Vergleich davor/danach', () => {
  const ohne = {
    outlineStyle: 'none',
    outlineWidth: '0px',
    outlineColor: 'rgb(0, 0, 0)',
    outlineOffset: '0px',
    boxShadow: 'none',
    borderColor: 'rgb(0, 0, 0)',
    borderWidth: '0px',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    color: 'rgb(0, 0, 0)',
    textDecorationLine: 'none',
  };

  it('ein erscheinender Ring ist eine Änderung', () => {
    const mit = { ...ohne, outlineStyle: 'solid', outlineWidth: '2px' };
    expect(indikatorAendertSich(ohne, mit)).toBe(true);
  });

  it('ein erscheinender Schatten genauso', () => {
    const mit = { ...ohne, boxShadow: 'rgb(47, 9, 45) 0px 0px 0px 2px' };
    expect(indikatorAendertSich(ohne, mit)).toBe(true);
  });

  it('kein Unterschied heißt: kein Indikator', () => {
    /*
      Die Gegenprobe, die Marc verlangt hat: Nimmt man dem geprüften Element
      den Fokusindikator, muss die Prüfung rot werden. Genau das ist dieser
      Fall – `indikatorAendertSich` ist die Stelle, an der es entschieden
      wird.
    */
    expect(indikatorAendertSich(ohne, { ...ohne })).toBe(false);
  });

  it('ein dauerhafter Rahmen allein reicht nicht', () => {
    // Ein Element kann immer einen Rahmen haben. Geprüft gehört die Änderung.
    const dauerhaft = { ...ohne, borderWidth: '1px', borderColor: 'rgb(200, 200, 200)' };
    expect(indikatorAendertSich(dauerhaft, { ...dauerhaft })).toBe(false);
  });

  it('ohne Messwerte gibt es keine Zustimmung', () => {
    expect(indikatorAendertSich(null, ohne)).toBe(false);
    expect(indikatorAendertSich(ohne, null)).toBe(false);
  });
});

describe('welches Element gemessen wird', () => {
  it('ein Textfeld wird bevorzugt – dort sagt die Spezifikation den Fall zu', () => {
    /*
      Für Textfelder schreibt die Spezifikation vor, dass `:focus-visible`
      auch bei einem Fokus aus dem Skript greift. Auf Verweisen und
      Schaltflächen hängt es an der Engine – deshalb die Vorliebe.
    */
    document.body.innerHTML = `
      <a href="#" id="verweis">Start</a>
      <input type="text" id="feld">`;
    setze(document.getElementById('verweis'), { breite: 80, hoehe: 20 });
    setze(document.getElementById('feld'));

    const befund = fokusIndikatorMessen();
    expect(befund.name).toBe('input#feld');
    expect(befund.istTextfeld).toBe(true);
    expect(befund.fokussiert).toBe(true);
  });

  it('ohne Textfeld nimmt sie das erste sichtbare Bedienelement', () => {
    document.body.innerHTML = '<a href="#" id="verweis">Start</a>';
    setze(document.getElementById('verweis'), { breite: 80, hoehe: 20 });

    const befund = fokusIndikatorMessen();
    expect(befund.name).toBe('a#verweis');
    expect(befund.istTextfeld).toBe(false);
  });

  it('versteckte Bedienelemente kommen nicht in Frage', () => {
    document.body.innerHTML = `
      <input type="text" id="versteckt" style="opacity: 0">
      <button id="knopf">Los</button>`;
    setze(document.getElementById('versteckt'));
    setze(document.getElementById('knopf'));

    expect(fokusIndikatorMessen().name).toBe('button#knopf');
  });

  it('eine Seite ohne Bedienelemente sagt das, statt etwas zu behaupten', () => {
    document.body.innerHTML = '<p>nur Text</p>';
    const befund = fokusIndikatorMessen();
    expect(befund.gefunden).toBe(false);
    expect(befund.fokussiert).toBe(false);
  });
});

describe('der Rückfall auf die eigene Regel', () => {
  it('findet eine passende :focus-visible-Regel mit Ring', () => {
    /*
      Der Weg für den Fall, dass eine Engine einen Fokus aus dem Skript nicht
      als `:focus-visible` wertet. Er prüft weiterhin die Gestaltung der
      Anwendung – hier die Regel aus `global.css`.
    */
    document.head.innerHTML =
      '<style>:focus-visible { outline: 2px solid rebeccapurple; outline-offset: 2px; }</style>';
    document.body.innerHTML = '<button id="knopf">Los</button>';
    setze(document.getElementById('knopf'));

    const befund = fokusIndikatorMessen();
    expect(befund.regelGefunden).toBe(true);
    expect(befund.regelText).toContain('outline');
  });

  it('eine Regel ohne Ring und ohne Schatten zählt nicht', () => {
    document.head.innerHTML = '<style>:focus-visible { color: red; }</style>';
    document.body.innerHTML = '<button id="knopf">Los</button>';
    setze(document.getElementById('knopf'));

    expect(fokusIndikatorMessen().regelGefunden).toBe(false);
  });

  it('eine Regel, die auf ein anderes Element zielt, zählt nicht', () => {
    document.head.innerHTML = '<style>.chip:focus-visible { outline: 2px solid black; }</style>';
    document.body.innerHTML = '<button id="knopf">Los</button>';
    setze(document.getElementById('knopf'));

    expect(fokusIndikatorMessen().regelGefunden).toBe(false);
  });

  it('gar keine Regel heißt: nichts, worauf man zurückfallen könnte', () => {
    document.body.innerHTML = '<button id="knopf">Los</button>';
    setze(document.getElementById('knopf'));

    expect(fokusIndikatorMessen().regelGefunden).toBe(false);
  });
});
