// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createContext, Script } from 'node:vm';

import { imBild, skiplinkFokussieren, skiplinkNachmessen } from '../e2e/skiplink';

/**
 * Der Skip-Link – an seinem richtigen Ort geprüft.
 *
 * ## Warum es diese Datei gibt
 *
 * Der vierte Mac-Lauf meldete `a.skip-link` in jeder Ansicht und auf beiden
 * Engines als „verstecktes Bedienelement ohne sichtbaren Auslöser". Das war
 * die falsche Frage: Er liegt absichtlich über dem Bild und kommt bei
 * `:focus` herein. Dass ihn niemand antippt, ist sein Zweck.
 *
 * Die richtige Frage – kommt er, wenn man ihn fokussiert? – steht jetzt in
 * `e2e/skiplink.ts`. Hier steht, dass sie richtig gestellt wird.
 *
 * ## Was jsdom kann
 *
 * Keine Übergänge und kein Layout. Geprüft wird deshalb die Auswahl (welches
 * Element gilt als Skip-Link?), die Lagerechnung und der Transport in die
 * Seite. Ob er im echten Browser wirklich hereinkommt, sagt der Lauf.
 */

function setze(el, { breite = 160, hoehe = 40, links = 0, oben = 0 }) {
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
  el.getClientRects = () => [kasten];
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('die Lagerechnung', () => {
  const breite = 390;
  const hoehe = 844;

  it('über dem Bild liegt nicht im Bild', () => {
    expect(imBild({ top: -48, bottom: -8, left: 8, right: 168 }, breite, hoehe)).toBe(false);
  });

  it('am oberen Rand liegt im Bild', () => {
    expect(imBild({ top: 8, bottom: 48, left: 8, right: 168 }, breite, hoehe)).toBe(true);
  });

  it('rechts hinausragend liegt nicht im Bild', () => {
    expect(imBild({ top: 8, bottom: 48, left: 300, right: 460 }, breite, hoehe)).toBe(false);
  });
});

describe('welches Element als Skip-Link gilt', () => {
  it('ein Verweis auf dieselbe Seite, der über dem Bild liegt', () => {
    document.body.innerHTML = '<a href="#inhalt" id="skip" class="skip-link">Zum Inhalt</a>';
    setze(document.getElementById('skip'), { oben: -48 });

    const befund = skiplinkFokussieren();
    expect(befund.gefunden).toBe(true);
    expect(befund.name).toBe('a#skip.skip-link');
    expect(befund.imBild).toBe(false);
  });

  it('nicht an der Klasse, sondern an der Bauform', () => {
    // Derselbe Bau, anderer Name – die Prüfung findet ihn trotzdem.
    document.body.innerHTML = '<a href="#inhalt" id="sprung" class="zum-anfang">Weiter</a>';
    setze(document.getElementById('sprung'), { oben: -48 });

    expect(skiplinkFokussieren().name).toBe('a#sprung.zum-anfang');
  });

  it('ein sichtbarer Verweis ist keiner', () => {
    document.body.innerHTML = '<a href="#inhalt" id="normal">Zum Inhalt</a>';
    setze(document.getElementById('normal'), { oben: 100 });

    expect(skiplinkFokussieren().gefunden).toBe(false);
  });

  it('ein Verweis nach außerhalb ist keiner', () => {
    document.body.innerHTML = '<a href="https://beispiel.invalid" id="weg">Weg</a>';
    setze(document.getElementById('weg'), { oben: -48 });

    expect(skiplinkFokussieren().gefunden).toBe(false);
  });

  it('eine Ansicht ohne solchen Verweis sagt das, statt etwas zu behaupten', () => {
    document.body.innerHTML = '<p>nur Text</p>';
    expect(skiplinkFokussieren().gefunden).toBe(false);
  });
});

describe('fokussieren und nachmessen', () => {
  it('nach dem Fokussieren misst die zweite Funktion dasselbe Element', () => {
    document.body.innerHTML = '<a href="#inhalt" id="skip">Zum Inhalt</a>';
    const el = setze(document.getElementById('skip'), { oben: -48 });

    skiplinkFokussieren();
    expect(document.activeElement).toBe(el);
    expect(skiplinkNachmessen().name).toBe('a#skip');
  });

  it('kommt er herein, meldet das Nachmessen „im Bild"', () => {
    /*
      Der Übergang, den jsdom nicht rechnet, hier von Hand: Nach dem
      Fokussieren steht der Kasten am oberen Rand. Genau darauf zielt die
      Zusicherung im echten Lauf.
    */
    document.body.innerHTML = '<a href="#inhalt" id="skip">Zum Inhalt</a>';
    const el = document.getElementById('skip');
    setze(el, { oben: -48 });

    skiplinkFokussieren();
    setze(el, { oben: 8 });

    expect(skiplinkNachmessen().imBild).toBe(true);
  });

  it('bleibt er draußen, meldet das Nachmessen genau das', () => {
    document.body.innerHTML = '<a href="#inhalt" id="skip">Zum Inhalt</a>';
    setze(document.getElementById('skip'), { oben: -48 });

    skiplinkFokussieren();

    expect(skiplinkNachmessen().imBild).toBe(false);
  });
});

describe('beide Funktionen überleben die Serialisierung', () => {
  /** Nur die Globalen, die eine Seite hat – kein Modul, keine Importe. */
  function wieInDerSeite(funktion) {
    const kontext = createContext({
      window: globalThis.window,
      document: globalThis.document,
      getComputedStyle: globalThis.getComputedStyle.bind(globalThis),
      CSS: globalThis.CSS,
    });
    return new Script(`(${funktion.toString()})`).runInContext(kontext)();
  }

  it('skiplinkFokussieren läuft ohne Modulumgebung', () => {
    document.body.innerHTML = '<a href="#inhalt" id="skip">Zum Inhalt</a>';
    setze(document.getElementById('skip'), { oben: -48 });

    expect(wieInDerSeite(skiplinkFokussieren).name).toBe('a#skip');
  });

  it('skiplinkNachmessen läuft ohne Modulumgebung', () => {
    document.body.innerHTML = '<a href="#inhalt" id="skip">Zum Inhalt</a>';
    setze(document.getElementById('skip'), { oben: -48 });
    skiplinkFokussieren();

    expect(wieInDerSeite(skiplinkNachmessen).name).toBe('a#skip');
  });
});
