/*
  Wie viel Stilcode `global.css` noch trägt — ein Bericht, keine Wache.

  ## Warum das gemessen wird

  Das Abnahmekriterium für 5B lautet: `global.css` ist am Ende mindestens
  40 % kürzer als die dokumentierten 4 740 Zeilen, also höchstens 2 844. Der
  Bezugswert ist festgeschrieben und bewegt sich nicht mit: Dass die Datei
  heute 4 876 Zeilen hat, ändert den Nenner nicht, sonst könnte man das Ziel
  erreichen, indem man zwischendurch etwas anhängt.

  ## Warum es den Build nicht rot macht

  Weil die Zahl vor dem letzten Block gar nicht erreichbar ist. 5B.1 legt
  Neues an, bevor Altes verschwindet; eine Prüfung, die das als Fehler meldet,
  würde zwölf Blöcke lang ignoriert — und eine Prüfung, die man gewohnheits-
  mäßig übergeht, ist schlechter als keine. Sie meldet und beendet sich mit 0.

  Rot wird sie genau einmal: mit `--endblock`, am Ende von 5B.

      node scripts/stilumfang.mjs              Bericht
      node scripts/stilumfang.mjs --endblock   Bericht und Abnahme
*/

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Der dokumentierte Ausgangswert aus `docs/konzept-5b.md`. Fest. */
const BEZUG = 4740;
/** 40 % weniger, abgerundet — so steht es in den Abnahmekriterien. */
const ZIEL = 2844;

const zeilen = (pfad) => readFileSync(resolve(WURZEL, pfad), 'utf8').split('\n').length - 1;

const jetzt = zeilen('src/styles/global.css');
const abgebaut = BEZUG - jetzt;
const anteil = ((abgebaut / BEZUG) * 100).toFixed(1);
const nochNoetig = Math.max(0, jetzt - ZIEL);

console.log('Stilumfang global.css');
console.log('  aktuell      %d Zeilen', jetzt);
console.log('  Bezugswert   %d Zeilen (dokumentiert, unveränderlich)', BEZUG);
console.log('  Endziel      %d Zeilen (−40 %%)', ZIEL);
console.log(
  '  Stand        %s%d Zeilen gegenüber dem Bezugswert (%s %%)',
  abgebaut >= 0 ? '−' : '+',
  Math.abs(abgebaut),
  anteil,
);
console.log(
  nochNoetig > 0
    ? `  bis zum Ziel noch ${nochNoetig} Zeilen abzubauen`
    : '  Ziel erreicht',
);

if (process.argv.includes('--endblock') && jetzt > ZIEL) {
  console.error('\nEndblock: global.css liegt über dem Ziel von %d Zeilen.', ZIEL);
  process.exit(1);
}
