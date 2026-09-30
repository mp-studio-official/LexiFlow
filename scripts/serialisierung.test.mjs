// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createContext, Script } from 'node:vm';

import { fokusIndikatorMessen } from '../e2e/fokus';
import { tippzielbefunde } from '../e2e/tippziele';

/**
 * Überlebt die Funktion den Weg in die Seite?
 *
 * ## Der Befund
 *
 * `tippzielbefunde` trug ihren Vorgabewert im Parameterkopf:
 *
 * ```ts
 * export function tippzielbefunde({ mass = 44, auswahl = TIPPZIELAUSWAHL } = {})
 * ```
 *
 * `TIPPZIELAUSWAHL` war eine Modulvariable. Playwright reicht nicht die
 * Funktion in die Seite, sondern **ihren Quelltext** – und dort gibt es kein
 * Modul. Alle 32 schmalen Messungen scheiterten mit
 * `TIPPZIELAUSWAHL is not defined`, in beiden Suiten, auf beiden Engines.
 *
 * Die Prüfungen in `scripts/tippziele.test.mjs` sahen das nicht: Sie rufen die
 * Funktion **direkt** auf, mit dem Modul drumherum. Sie prüften die Regel und
 * konnten über den Transport nichts sagen.
 *
 * ## Was diese Datei anders macht
 *
 * Sie nimmt `funktion.toString()` – denselben Quelltext, den Playwright
 * überträgt – und führt ihn in einem eigenen Realm aus, in dem es **nur** gibt,
 * was auch eine Seite hat: `document`, `getComputedStyle`, `CSS`. Keine
 * Modulvariablen, keine Importe, kein Bündler.
 *
 * Eine freie Benennung fliegt hier in Millisekunden auf, statt nach zwei
 * vollständigen Browserläufen.
 */

/** Die Globalen, die eine Seite hat – und sonst nichts aus diesem Modul. */
function seitenrealm() {
  return createContext({
    window: globalThis.window,
    document: globalThis.document,
    getComputedStyle: globalThis.getComputedStyle.bind(globalThis),
    CSS: globalThis.CSS,
  });
}

/**
 * Genau der Weg, den Playwright nimmt: Quelltext heraus, im fremden Realm
 * auswerten, dort aufrufen.
 */
function wieInDerSeite(funktion, argument) {
  const kontext = seitenrealm();
  const kopie = new Script(`(${funktion.toString()})`).runInContext(kontext);
  return kopie(argument);
}

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

describe('die Messfunktionen überleben die Serialisierung', () => {
  it('tippzielbefunde läuft ohne jede Modulumgebung', () => {
    document.body.innerHTML = '<button id="klein">Los</button>';
    setze(document.getElementById('klein'), { breite: 20, hoehe: 20 });

    /*
      Ohne Argument aufgerufen – also genau der Fall, in dem die Vorgabewerte
      greifen. Stünde dort eine Modulvariable, flöge hier ein ReferenceError.
    */
    const befund = wieInDerSeite(tippzielbefunde, undefined);
    expect(befund.zuKlein).toEqual(['button#klein 20×20']);
  });

  it('tippzielbefunde läuft auch mit leerem Einstellungsobjekt', () => {
    // So ruft Playwright sie auf: `page.evaluate(tippzielbefunde, {})`.
    document.body.innerHTML = '<button id="gross">Los</button>';
    setze(document.getElementById('gross'), { breite: 48, hoehe: 48 });

    expect(wieInDerSeite(tippzielbefunde, {}).zuKlein).toEqual([]);
  });

  it('fokusIndikatorMessen läuft ohne jede Modulumgebung', () => {
    document.body.innerHTML = '<button id="knopf">Los</button>';
    setze(document.getElementById('knopf'));

    const befund = wieInDerSeite(fokusIndikatorMessen, {});
    expect(befund.gefunden).toBe(true);
    expect(befund.name).toBe('button#knopf');
  });

  it('die Gegenprobe: eine freie Benennung fliegt hier auf', () => {
    /*
      Der Nachweis, dass diese Prüfung etwas kann, was ein direkter Aufruf
      nicht kann. Dieselbe Funktion, um eine Modulvariable ergänzt – im
      eigenen Realm bricht sie ab, genau wie in der Seite.
    */
    const mitFreierBenennung = function messen(einstellungen) {
      const auswahl = einstellungen?.auswahl ?? TIPPZIELAUSWAHL; // eslint-disable-line
      return document.querySelectorAll(auswahl).length;
    };

    expect(() => wieInDerSeite(mitFreierBenennung, {})).toThrow(/TIPPZIELAUSWAHL is not defined/);
  });

  it('und eine gleich gebaute Funktion mit Literal läuft durch', () => {
    const ohneFreieBenennung = function messen(einstellungen) {
      const auswahl = einstellungen?.auswahl ?? 'button';
      return document.querySelectorAll(auswahl).length;
    };

    document.body.innerHTML = '<button>a</button><button>b</button>';
    expect(wieInDerSeite(ohneFreieBenennung, {})).toBe(2);
  });
});
