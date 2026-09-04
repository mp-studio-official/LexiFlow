import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Ein Name je Sache (Sprint 4B.8).
 *
 * ## Der Anlass
 *
 * Für dieselbe HTML-Datei standen im Produkt drei Wörter: „Einzeldatei" (15×),
 * „Lerndatei" (16×) und „Schülerdatei" (3×). Dazu „Schülerkonten" auf der
 * Startseite – in einem Produkt, dessen verbindliche Wortwahl „Lernende,
 * Lehrkräfte, Lerngruppe, Lernbereich" lautet.
 *
 * Drei Namen sind nicht drei Wörter, sondern drei Sachen: Wer in der
 * Kurzanleitung „Schülerdatei" liest und im Programm „Einzeldatei" sucht,
 * sucht nach etwas anderem.
 *
 * ## Die Festlegung
 *
 * | Sache | Name |
 * | --- | --- |
 * | Die Zusammenstellung mehrerer Pakete | **Lernbereich** |
 * | Die HTML-Datei, die einen Lernbereich trägt | **Lerndatei** |
 * | Die leere Vorlage, aus der sie entsteht | **Lernlaufzeit** |
 * | Die HTML-Datei zum Erstellen | **Lehrkraftdatei** |
 *
 * ## Was hier geprüft wird und was nicht
 *
 * Geprüft wird der **deutsche** Wortlaut in Quelltext, Tests und Skripten.
 * Englische Bezeichner (`studentExport`, `StudentApp`, `PACK_PLACEHOLDER`)
 * bleiben unberührt: Sie sind kein Wortlaut, sie sind Code, und ein Umbenennen
 * von Dateien hat in diesem Projekt schon einmal einen Tag gekostet (siehe
 * `packMotif.ts`, Groß- und Kleinschreibung auf macOS).
 *
 * Ebenso unberührt bleibt der Datenbankname `lexiflow-schueler-…`. Er steht auf
 * den Geräten der Lernenden und ist die Adresse ihres Lernstands – ihn
 * umzubenennen hieße, jeden vorhandenen Lernstand unauffindbar zu machen. Das
 * ist der Preis, den eine schönere Zeichenkette nicht wert ist, und diese
 * Prüfung hält ausdrücklich fest, dass es Absicht ist.
 */

const root = resolve(import.meta.dirname, '../..');

/** Wörter, die es im deutschen Wortlaut nicht mehr geben soll. */
const ABGELEGT = ['Einzeldatei', 'Schülerdatei', 'Schülerkonten', 'Schülerlaufzeit'] as const;

/**
 * Die eine erlaubte Ausnahme.
 *
 * `lexiflow-schueler-…` ist der Datenbankname auf dem Gerät einer lernenden
 * Person. Siehe oben: Er bleibt.
 */
const ERLAUBT = [/lexiflow-schueler-/] as const;

function sourceFiles(dir: string, endungen: readonly string[]): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full, endungen));
    else if (endungen.some((ext) => name.endsWith(ext))) found.push(full);
  }
  return found;
}

const dateien = [
  ...sourceFiles(resolve(root, 'src'), ['.ts', '.tsx']),
  ...sourceFiles(resolve(root, 'e2e'), ['.ts']),
  ...sourceFiles(resolve(root, 'e2e-portable'), ['.ts']),
  ...sourceFiles(resolve(root, 'scripts'), ['.mjs']),
].filter((file) => !file.endsWith('wording.test.ts'));

describe('Ein Name je Sache', () => {
  it('kennt keine abgelegten Wörter mehr', () => {
    const treffer: string[] = [];

    for (const file of dateien) {
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, index) => {
        if (ERLAUBT.some((muster) => muster.test(line))) return;
        for (const wort of ABGELEGT) {
          if (line.includes(wort)) {
            treffer.push(`${file.slice(root.length + 1)}:${index + 1} – „${wort}“`);
          }
        }
      });
    }

    expect(treffer).toEqual([]);
  });

  it('lässt den Datenbanknamen ausdrücklich stehen', () => {
    /*
      Nicht bloß geduldet, sondern beabsichtigt: Diese Zeichenkette ist die
      Adresse des Lernstands auf fremden Geräten. Fiele sie einem Aufräumen
      zum Opfer, fänden alle bereits verteilten Lerndateien ihren Stand nicht
      mehr – und niemand käme auf die Ursache.
    */
    const embedded = readFileSync(resolve(root, 'src/portable/embedded.ts'), 'utf8');
    expect(embedded).toContain('lexiflow-schueler-');
  });
});
