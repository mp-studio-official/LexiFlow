// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Die Edge Functions laufen unter Deno, nicht unter Vite.
 *
 * ## Der Anlass
 *
 * Am 29.09.2026 brach das erste Deployment von `ai-gateway` beim Bündeln ab:
 *
 *     Module not found: supabase/functions/ai-gateway/anbieter
 *     Import in core.ts:7
 *
 * `core.ts` importierte `./anbieter`, `./ziel` und `./tresor` ohne Endung.
 * Für Vite und für den TypeScript-Dienst ist das in Ordnung – beide raten die
 * Endung. **Deno rät nicht.** Ein Modulbezeichner ist dort eine Adresse, und
 * `./anbieter` ist eine andere Adresse als `./anbieter.ts`.
 *
 * Gefunden hat es niemand, weil alles, was den Code je ausgeführt hat, ihn
 * durch Vite geladen hat: 183 Prüfungen, alle grün, alle am Problem vorbei.
 * Die einzige Laufzeit, die es gemerkt hätte, war die, in der er später läuft.
 *
 * ## Was diese Wache prüft
 *
 * Sie geht vom Einstieg jeder Funktion aus durch den **produktiven**
 * Modulgraphen und verlangt von jedem relativen Import eine ausdrückliche
 * Endung – und dass die Datei dahinter existiert.
 *
 * Prüfdateien sind ausdrücklich **keine** Laufzeitabhängigkeit. Sie werden
 * nicht verfolgt, und dass sie `./core` ohne Endung schreiben, ist richtig so:
 * Sie laufen unter Vite. Umgekehrt darf produktiver Code **nie** eine
 * Prüfdatei importieren; auch das steht hier.
 *
 * ## Warum als Text und nicht mit einem Parser
 *
 * Weil die Frage „steht da eine Endung?" lautet. Ein Parser wäre eine
 * Abhängigkeit mehr für eine Frage, die eine Zeichenkette beantwortet –
 * dieselbe Überlegung wie in `scripts/ci.test.mjs` und
 * `scripts/funktionskonfiguration.test.mjs`.
 *
 * Kommentare werden vorher entfernt. Diese Datei erklärt Importe; ohne den
 * Schritt prüfte die Wache ihre eigene Begründung mit – der Fehler aus
 * Migration 9, zum dritten Mal vermieden.
 *
 * ## Und die andere Hälfte derselben Regel
 *
 * `tsconfig.json` stand auf `allowImportingTsExtensions: false`. Das war eine
 * Entscheidung: Das Browserprojekt schreibt keine Endungen, der Bündler löst
 * auf. Für die Edge Functions gilt das Gegenteil, und ein Schalter kann nicht
 * beides.
 *
 * Also steht der Schalter jetzt auf `true` – er **erlaubt** nur, er verlangt
 * nichts – und die Entscheidung, die er getragen hat, steht hier unten als
 * eigene Prüfung. Sie sagt dasselbe, aber genauer: nicht „nirgends", sondern
 * „im Browserprojekt nicht, in den Edge Functions immer".
 */

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const funktionen = resolve(wurzel, 'supabase/functions');

/** Die Einstiege. Was von hier aus nicht erreichbar ist, läuft nie. */
const EINSTIEGE = [
  'supabase/functions/learner-auth/index.ts',
  'supabase/functions/ai-gateway/index.ts',
];

const istPruefdatei = (pfad) => /\.test\.[cm]?tsx?$/.test(pfad);

/** Der Text ohne Kommentare – sonst zählt die Begründung als Import. */
function ohneKommentare(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((zeile) => (zeile.trimStart().startsWith('//') ? '' : zeile))
    .join('\n');
}

/**
 * Jeder Modulbezeichner der Datei – statisch, als Re-Export und dynamisch.
 */
function bezeichner(text) {
  const sauber = ohneKommentare(text);
  const gefunden = [];
  const muster = [
    /(?:^|\s)(?:import|export)\s[\s\S]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /(?:^|\s)import\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const regel of muster) {
    for (const treffer of sauber.matchAll(regel)) gefunden.push(treffer[1]);
  }
  return gefunden;
}

/** Vom Einstieg aus durch den produktiven Graphen. */
function graph() {
  const besucht = new Set();
  const fehlendeEndung = [];
  const fehlendeDatei = [];
  const pruefdateiImProduktiven = [];
  const offen = EINSTIEGE.map((pfad) => resolve(wurzel, pfad));

  while (offen.length > 0) {
    const datei = offen.pop();
    const schluessel = relative(wurzel, datei);
    if (besucht.has(schluessel)) continue;
    besucht.add(schluessel);

    if (!existsSync(datei)) {
      fehlendeDatei.push(`${schluessel} (Einstieg fehlt)`);
      continue;
    }

    for (const wohin of bezeichner(readFileSync(datei, 'utf8'))) {
      // Nur relative Bezeichner. `https://esm.sh/...` ist eine Adresse und
      // braucht keine Endung; `node:fs` ist ein eingebautes Modul.
      if (!wohin.startsWith('.')) continue;

      if (!/\.[cm]?tsx?$|\.[cm]?js$|\.json$/.test(wohin)) {
        fehlendeEndung.push(`${schluessel} → ${wohin}`);
        continue;
      }

      const ziel = resolve(dirname(datei), wohin);
      const zielSchluessel = relative(wurzel, ziel);

      if (istPruefdatei(zielSchluessel)) {
        pruefdateiImProduktiven.push(`${schluessel} → ${wohin}`);
        continue;
      }
      if (!existsSync(ziel)) {
        fehlendeDatei.push(`${schluessel} → ${wohin}`);
        continue;
      }
      offen.push(ziel);
    }
  }

  return { besucht, fehlendeEndung, fehlendeDatei, pruefdateiImProduktiven };
}

/** Alle `.ts` unter `supabase/functions`, ohne Prüfdateien. */
function alleProduktivdateien(verzeichnis = funktionen) {
  const gefunden = [];
  for (const name of readdirSync(verzeichnis)) {
    const voll = join(verzeichnis, name);
    if (statSync(voll).isDirectory()) gefunden.push(...alleProduktivdateien(voll));
    else if (/\.ts$/.test(name) && !istPruefdatei(name)) gefunden.push(relative(wurzel, voll));
  }
  return gefunden;
}

const ergebnis = graph();

describe('Der produktive Modulgraph der Edge Functions', () => {
  it('nennt bei jedem relativen Import die Endung', () => {
    /*
      Die Meldung nennt Datei und Ziel, weil genau das im Deployprotokoll
      steht: „Module not found: …/anbieter, Import in core.ts:7". Wer den
      Fehler hier sieht, soll ihn ohne zweiten Blick zuordnen können.
    */
    expect(ergebnis.fehlendeEndung).toEqual([]);
  });

  it('zeigt bei jedem Import auf eine Datei, die es gibt', () => {
    expect(ergebnis.fehlendeDatei).toEqual([]);
  });

  it('importiert nirgends eine Prüfdatei', () => {
    // Eine Prüfdatei im Bündel wäre Testcode in der Laufzeit – und zöge die
    // Testbibliothek mit hinein.
    expect(ergebnis.pruefdateiImProduktiven).toEqual([]);
  });

  it('erreicht beide Einstiege und jede produktive Datei', () => {
    /*
      Sonst prüfte diese Wache am Ende einen leeren Graphen und bliebe grün.
      Und eine produktive Datei, die von keinem Einstieg aus erreichbar ist,
      wird von den Prüfungen oben gar nicht angesehen: Entweder gehört sie in
      `EINSTIEGE`, oder sie wird nirgends gebraucht.
    */
    for (const einstieg of EINSTIEGE) expect([...ergebnis.besucht]).toContain(einstieg);
    expect([...ergebnis.besucht].sort()).toEqual(alleProduktivdateien().sort());
  });
});

describe('Das Browserprojekt schreibt weiterhin keine Endungen', () => {
  /*
    Was `allowImportingTsExtensions: false` vorher erzwungen hat.

    Unter Vite ist `./leitner` der übliche Bezeichner, und er bleibt es. Ein
    einzelnes `./leitner.ts` dazwischen wäre kein Fehler, den jemand merkt –
    nur eine zweite Schreibweise für dieselbe Sache, und davon hat dieses
    Projekt schon genug gesehen.
  */
  const quellen = (verzeichnis) => {
    const gefunden = [];
    for (const name of readdirSync(verzeichnis)) {
      const voll = join(verzeichnis, name);
      if (statSync(voll).isDirectory()) gefunden.push(...quellen(voll));
      else if (/\.tsx?$/.test(name)) gefunden.push(voll);
    }
    return gefunden;
  };

  it('nennt in src/ bei keinem relativen Import eine Endung', () => {
    const treffer = [];
    for (const datei of quellen(resolve(wurzel, 'src'))) {
      for (const wohin of bezeichner(readFileSync(datei, 'utf8'))) {
        if (!wohin.startsWith('.')) continue;
        if (/\.[cm]?tsx?$/.test(wohin)) treffer.push(`${relative(wurzel, datei)} → ${wohin}`);
      }
    }
    expect(treffer).toEqual([]);
  });
});
