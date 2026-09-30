// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { tippzielbefunde } from '../e2e/tippziele';

/**
 * Die Regel, was ein Tippziel ist – geprüft ohne Browser.
 *
 * ## Woran sich die Regel zweimal korrigiert hat
 *
 * Erst meldete sie ein visuell verstecktes Dateifeld als 1 × 1 großes
 * Tippziel. Dann meldete sie dasselbe Feld und den Skip-Link als
 * „Bedienelement ohne sichtbaren Auslöser" – und weil diese Zusicherung vor
 * der Größenzusicherung stand, verdeckte sie in zwei vollständigen Läufen
 * sämtliche echten Größenbefunde.
 *
 * Die Zuständigkeit ist jetzt eng gezogen:
 *
 * - Gemessen wird, was **jetzt** wahrnehmbar ist.
 * - Was nur technisch da oder außerhalb des Bildes liegt, wird nicht selbst
 *   gemessen.
 * - Steht ein Auslöser **deklarativ** im Markup, wird dessen Fläche zusätzlich
 *   gemessen.
 * - Steht keiner da, sagt diese Prüfung **nichts**. Ob ein
 *   programmgesteuerter Auslöser existiert, ist eine Funktionsfrage.
 *
 * ## Was jsdom kann und was nicht
 *
 * jsdom rechnet kein Layout. Die Maße werden deshalb gesetzt – geprüft wird
 * die **Regel**, nicht die Layoutrechnung des Browsers. Dass die Funktion den
 * Weg in die Seite übersteht, prüft `scripts/serialisierung.test.mjs`.
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

/** Das Muster aus `global.css`: 1 px, `clip: rect(0 0 0 0)`. */
function versteckt(el) {
  el.style.clip = 'rect(0px, 0px, 0px, 0px)';
  return setze(el, { breite: 1, hoehe: 1 });
}

/** Der Skip-Link: volle Größe, aber mit `top: -3rem` über dem Bild. */
function ueberDemBild(el) {
  return setze(el, { breite: 160, hoehe: 40, oben: -48 });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('gemessen wird, was jetzt wahrnehmbar ist', () => {
  it('ein 20-px-Touchziel bleibt ein Befund', () => {
    document.body.innerHTML = '<button id="klein">Los</button>';
    setze(document.getElementById('klein'), { breite: 20, hoehe: 20 });

    expect(tippzielbefunde().zuKlein).toEqual(['button#klein 20×20']);
  });

  it('ein sichtbares 20-px-Eingabefeld bleibt ein Befund', () => {
    document.body.innerHTML = '<input type="text" id="feld">';
    setze(document.getElementById('feld'), { breite: 308, hoehe: 20 });

    expect(tippzielbefunde().zuKlein).toEqual(['input#feld 308×20']);
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

describe('was nicht wahrnehmbar ist, wird nicht als Touchziel gewertet', () => {
  it('der unfokussierte Skip-Link erzeugt keinen Befund', () => {
    /*
      Der Fehlalarm aus dem vierten Lauf, in jeder Ansicht und auf beiden
      Engines. Er liegt über dem Bild und kommt bei `:focus` herein; geprüft
      gehört er in `skiplinkKommtInsBild`, nicht hier.
    */
    document.body.innerHTML = '<a href="#inhalt" id="skip" class="skip-link">Zum Inhalt</a>';
    ueberDemBild(document.getElementById('skip'));

    const befund = tippzielbefunde();
    expect(befund.zuKlein).toEqual([]);
    expect(befund.gemessen).toBe(0);
  });

  it('ein verstecktes Dateifeld ohne deklarierten Auslöser erzeugt keinen Befund', () => {
    /*
      `TeacherHomePage` und `StudentHomePage` lösen es über eine sichtbare
      Schaltfläche aus (`onClick={() => fileInput.current?.click()}`). Die
      Beziehung steht nicht im DOM – „die kann niemand antippen" war deshalb
      sachlich falsch. Aus dem Fehlen einer deklarativen Beziehung folgt hier
      nichts.
    */
    document.body.innerHTML = `
      <button id="knopf">Datei wählen</button>
      <input type="file" id="datei" class="visually-hidden">`;
    setze(document.getElementById('knopf'), { breite: 180, hoehe: 48 });
    versteckt(document.getElementById('datei'));

    const befund = tippzielbefunde();
    expect(befund.zuKlein).toEqual([]);
    // Die sichtbare Schaltfläche wird trotzdem gemessen – als das, was sie ist.
    expect(befund.gemessen).toBe(1);
  });

  it('die auslösende Schaltfläche bleibt als sichtbares Ziel messbar', () => {
    document.body.innerHTML = `
      <button id="knopf">Datei</button>
      <input type="file" id="datei">`;
    setze(document.getElementById('knopf'), { breite: 60, hoehe: 24 });
    versteckt(document.getElementById('datei'));

    // Kein Wort über das Dateifeld – aber die Schaltfläche ist zu klein.
    expect(tippzielbefunde().zuKlein).toEqual(['button#knopf 60×24']);
  });
});

describe('ein deklarierter Auslöser wird zusätzlich gemessen', () => {
  it('label[for]: großes Label, kein Befund', () => {
    document.body.innerHTML = `
      <label for="datei" id="knopf">Datei wählen</label>
      <input type="file" id="datei">`;
    setze(document.getElementById('knopf'), { breite: 180, hoehe: 48 });
    versteckt(document.getElementById('datei'));

    expect(tippzielbefunde().zuKlein).toEqual([]);
  });

  it('label[for]: zu kleines Label wird als Auslöser gemeldet', () => {
    document.body.innerHTML = `
      <label for="datei" id="knopf">Wählen</label>
      <input type="file" id="datei">`;
    setze(document.getElementById('knopf'), { breite: 60, hoehe: 24 });
    versteckt(document.getElementById('datei'));

    expect(tippzielbefunde().zuKlein).toEqual(['label#knopf 60×24 (Auslöser für input#datei)']);
  });

  it('ein umschließendes Label zählt genauso', () => {
    document.body.innerHTML = '<label id="huelle">Datei<input type="file" id="datei"></label>';
    setze(document.getElementById('huelle'), { breite: 180, hoehe: 48 });
    versteckt(document.getElementById('datei'));

    expect(tippzielbefunde().zuKlein).toEqual([]);
  });

  it('data-tippziel-fuer: der bewusste Weg für programmgesteuerte Auslöser', () => {
    /*
      Geraten wird nichts. Wer eine `onClick`-Beziehung geprüft haben will,
      schreibt sie ins Markup. Im Produktivcode steht das Attribut heute
      nirgends – das wäre eine Produktivänderung und ist nicht freigegeben.
    */
    document.body.innerHTML = `
      <button id="knopf" data-tippziel-fuer="datei">Datei wählen</button>
      <input type="file" id="datei">`;
    setze(document.getElementById('knopf'), { breite: 60, hoehe: 24 });
    versteckt(document.getElementById('datei'));

    expect(tippzielbefunde().zuKlein).toEqual([
      'button#knopf 60×24 (Auslöser für input#datei)',
    ]);
  });

  it('data-tippziel-fuer mit ausreichend großem Auslöser: kein Befund', () => {
    document.body.innerHTML = `
      <button id="knopf" data-tippziel-fuer="datei">Datei wählen</button>
      <input type="file" id="datei">`;
    setze(document.getElementById('knopf'), { breite: 180, hoehe: 48 });
    versteckt(document.getElementById('datei'));

    expect(tippzielbefunde().zuKlein).toEqual([]);
  });

  it('ein Auslöser, der selbst versteckt ist, zählt nicht als Auslöser', () => {
    document.body.innerHTML = `
      <label for="datei" id="auchversteckt">Wählen</label>
      <input type="file" id="datei">`;
    versteckt(document.getElementById('auchversteckt'));
    versteckt(document.getElementById('datei'));

    const befund = tippzielbefunde();
    expect(befund.zuKlein).toEqual([]);
    expect(befund.gemessen).toBe(0);
  });
});

describe('was gar nicht gerendert ist, wird nicht gemessen', () => {
  it('display:none erzeugt keinen Befund', () => {
    document.body.innerHTML = '<button id="weg" style="display:none">Los</button>';
    setze(document.getElementById('weg'), { breite: 0, hoehe: 0 });

    expect(tippzielbefunde().gemessen).toBe(0);
  });

  it('eine Seite ganz ohne Bedienelemente meldet „nichts gemessen"', () => {
    document.body.innerHTML = '<p>nur Text</p>';
    expect(tippzielbefunde().gemessen).toBe(0);
  });
});
