// @vitest-environment node
import { builtinModules } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Was die ausführbaren Skripte importieren, muss es auch geben.
 *
 * ## Der Vorfall, aus dem diese Wache entstand
 *
 * `scripts/heute-messen.mjs` importiert `esbuild`. Im Cloud-Container lag das
 * Paket herum — aus einem `npm install esbuild --no-save`, das für die
 * Messung einmal von Hand lief. Auf dem Arbeitsrechner lag es nicht herum,
 * und die WebKit-Abnahme scheiterte an der ersten Zeile:
 *
 *     Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'esbuild'
 *
 * Im Lockfile **stand** `esbuild` — aber nur als Vites optionaler
 * Peer-Vertrag, nicht als installierte direkte Abhängigkeit. Das ist der
 * Unterschied, der hier geprüft wird: Ein Paket, das jemand anders vielleicht
 * mitbringt, ist keine Zusage.
 *
 * ## Warum die Wache nicht nach `esbuild` sucht
 *
 * Weil sie dann genau diesen einen Fehler kennte. Sie liest stattdessen
 * **jeden** nackten Import aus **jedem** ausführbaren Skript in `scripts/`
 * und verlangt, dass er entweder zu Node gehört oder in `dependencies`
 * beziehungsweise `devDependencies` steht. Der nächste Import, den jemand
 * hinzufügt, ist damit mitgeprüft, ohne dass irgendwo eine Liste wächst.
 *
 * ## Was sie ausdrücklich nicht prüft
 *
 * Ob die Pakete **installiert** sind. Das ist die Aufgabe von `npm install`
 * und des Lockfiles; eine Prüfung, die `node_modules` ansieht, wäre in einer
 * frischen Arbeitskopie grün oder rot, je nachdem, was jemand vorher getan
 * hat. Geprüft wird die **Zusage**, und die steht in `package.json`.
 */

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paket = JSON.parse(readFileSync(resolve(wurzel, 'package.json'), 'utf8'));

/** Was dieses Repository zusagt, mitzubringen. */
const ZUGESAGT = new Set([
  ...Object.keys(paket.dependencies ?? {}),
  ...Object.keys(paket.devDependencies ?? {}),
]);

/** Was Node von sich aus mitbringt – mit und ohne `node:`-Vorsatz. */
const EINGEBAUT = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

/**
 * Die ausführbaren Skripte: alles in `scripts/`, was kein Test ist.
 *
 * Aus dem Dateisystem gelesen und nicht aufgezählt. Eine Liste hier müsste
 * jemand pflegen, und genau das Skript, das niemand eingetragen hat, wäre
 * dann das, das auf einem fremden Rechner nicht startet.
 *
 * Die Testdateien stehen nicht darin: Sie laufen unter Vitest, das seine
 * eigenen Auflösungsregeln mitbringt. Was hier geprüft wird, ist der Aufruf
 * mit nacktem `node`.
 */
function ausfuehrbareSkripte() {
  return readdirSync(resolve(wurzel, 'scripts'))
    .filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs'))
    .sort();
}

/**
 * Jeder nackte Import einer Datei – statisch, dynamisch und `require`.
 *
 * Bewusst eine Textsuche und kein Parser: Ein Parser wäre genauer und wäre
 * eine weitere Abhängigkeit, die hier niemand zusagen will. Die drei Formen
 * unten sind die, die in diesen Dateien vorkommen; eine vierte fiele dadurch
 * auf, dass sie nicht gefunden wird – und das sagt die letzte Prüfung unten.
 */
function nackteImporte(quelltext) {
  const muster = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ];
  const gefunden = new Set();
  for (const regel of muster) {
    for (const treffer of quelltext.matchAll(regel)) {
      const spezifikation = treffer[1];
      // Relativ oder absolut: eine Datei im Repository, kein Paket.
      if (/^[./]/.test(spezifikation)) continue;
      // Eine vollständige Adresse – `data:`, `file:`, `https:`.
      if (/^[a-z][a-z0-9+.-]*:/i.test(spezifikation) && !spezifikation.startsWith('node:')) {
        continue;
      }
      gefunden.add(spezifikation);
    }
  }
  return [...gefunden];
}

/**
 * Der Paketname eines Imports – ohne den Pfad dahinter.
 *
 * `react-dom/server` ist das Paket `react-dom`, `@playwright/test` ist das
 * Paket `@playwright/test`. Ohne diesen Schritt verlangte die Wache einen
 * Eintrag für jeden Unterpfad, den jemand importiert.
 */
export function paketnameVon(spezifikation) {
  if (spezifikation.startsWith('@')) {
    const [bereich, name] = spezifikation.split('/');
    return name === undefined ? spezifikation : `${bereich}/${name}`;
  }
  return spezifikation.split('/')[0];
}

describe('Die ausführbaren Skripte importieren nur Zugesagtes', () => {
  const skripte = ausfuehrbareSkripte();

  it('findet überhaupt Skripte – sonst prüfte die Schleife nichts', () => {
    expect(skripte.length).toBeGreaterThan(5);
    // Die Messskripte sind der Anlass; sie müssen dabei sein.
    expect(skripte.filter((name) => name.endsWith('-messen.mjs')).length).toBeGreaterThanOrEqual(5);
  });

  for (const name of skripte) {
    it(`${name} nennt nur Node-Eingebautes oder Zugesagtes`, () => {
      const quelltext = readFileSync(resolve(wurzel, 'scripts', name), 'utf8');
      const fehlend = nackteImporte(quelltext)
        .map(paketnameVon)
        .filter((pakete) => !EINGEBAUT.has(pakete) && !ZUGESAGT.has(pakete));

      expect(
        [...new Set(fehlend)].sort(),
        `${name} importiert etwas, das weder zu Node gehört noch in ` +
          'dependencies/devDependencies steht — auf einem frischen Rechner ' +
          'bricht es mit ERR_MODULE_NOT_FOUND ab',
      ).toEqual([]);
    });
  }

  it('erkennt einen fehlenden Eintrag auch wirklich', () => {
    /*
      Die Wache an sich selbst geprüft. Ohne diese Zeile bliebe sie grün,
      wenn das Suchmuster eines Tages nichts mehr fände — und das ist der
      Zustand, in dem eine Wache gefährlicher ist als keine.
    */
    const erfunden = nackteImporte(`
      import { a } from 'gibt-es-nicht';
      import b from '@erfunden/paket/tief';
      const c = await import('auch-nicht');
      const d = require('ebenfalls-nicht');
      import 'nur-wirkung';
      import e from './eigenes.js';
      import f from 'node:fs';
    `).map(paketnameVon);

    expect(erfunden.sort()).toEqual([
      '@erfunden/paket',
      'auch-nicht',
      'ebenfalls-nicht',
      'gibt-es-nicht',
      'node:fs',
      'nur-wirkung',
    ]);
    // Das eigene Modul ist nicht dabei, `node:fs` gilt als eingebaut.
    expect(EINGEBAUT.has('node:fs')).toBe(true);
    expect(ZUGESAGT.has('gibt-es-nicht')).toBe(false);
  });

  it('liest aus `package.json` und nicht aus `node_modules`', () => {
    /*
      Der Unterschied, um den es geht: Im Lockfile stand `esbuild` längst —
      als Vites optionaler Peer-Vertrag. Zugesagt war es damit nicht, und auf
      einem Rechner, der es nicht nebenbei mitinstalliert hatte, fehlte es.
    */
    expect(ZUGESAGT.has('esbuild')).toBe(true);
    expect(paket.devDependencies.esbuild).toMatch(/^\^?0\.28\./);
  });
});
