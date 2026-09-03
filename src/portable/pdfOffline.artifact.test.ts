import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RUNTIME_LIMIT_KIB } from '../../scripts/portableLimits.mjs';

/**
 * Der Nachweis, dass der PDF-Import in der **gebauten** Lehrkraftdatei ohne
 * Laufzeitdateien und ohne Netz auskommt.
 *
 * ## Warum dieser Test außerhalb von `npm run test` steht
 *
 * Was hier geprüft wird, ist keine Eigenschaft des Quelltexts, sondern des
 * Bündels. Im Quelltext steht ein `import()`; ob daraus in der Einzeldatei ein
 * eingebetteter Block oder ein Verweis auf eine zweite Datei wird, entscheidet
 * der Bundler. Genau dort lag der Fehler, den dieser Test verhindern soll –
 * und er wäre in jedem Unit-Test unsichtbar geblieben.
 *
 * ## Was er **nicht** beweist
 *
 * Er liest die Datei, er führt sie nicht aus. Dass der Import in einem echten
 * Browser über `file://` und mit gekapptem Netz durchläuft, prüft
 * `e2e-portable/pdf-import.spec.ts`. Die beiden gehören zusammen: Dieser Test
 * sagt „nichts zeigt nach draußen“, jener sagt „es funktioniert trotzdem“.
 */

const root = resolve(import.meta.dirname, '../..');
const teacherPath = resolve(root, 'dist-portable/LexiFlow-Lehrkraft.html');
const runtimePath = resolve(root, 'dist-portable/LexiFlow-Schuelerlaufzeit.html');

const teacher = readFileSync(teacherPath, 'utf8');
const runtime = readFileSync(runtimePath, 'utf8');

describe('PDF-Import in der gebauten Lehrkraftdatei', () => {
  it('trägt pdf.js wirklich in sich', () => {
    /*
      Zeichenfolgen, die es nur im Code von pdf.js gibt. Sie sind bewusst so
      gewählt, dass sie beim Minifizieren erhalten bleiben: Fehlermeldungen und
      Namen aus dem PDF-Format sind Zeichenketten, keine Bezeichner.
    */
    for (const marker of ['pdfjs', 'PDFDocumentLoadingTask', 'InvalidPDFException']) {
      expect(teacher.includes(marker), marker).toBe(true);
    }
  });

  it('trägt den Workercode mit – statt ihn nachzuladen', () => {
    /*
      Der Kern der Sache. `WorkerMessageHandler` ist der Einstiegspunkt des
      Workerbündels. Steht er in der Datei, hat der Bundler
      `pdf.worker.mjs` eingebettet; fehlt er, würde pdf.js zur Laufzeit
      `await import(workerSrc)` versuchen – unter `file://` ein sicherer
      Fehlschlag, und zwar erst dann, wenn jemand eine PDF auswählt.
    */
    expect(teacher).toContain('WorkerMessageHandler');
    // Und die Stelle, an der wir ihn pdf.js unterschieben.
    expect(teacher).toContain('pdfjsWorker');
  });

  it('lässt keinen Ladepfad auf eine zweite Datei zeigen', () => {
    /*
      pdf.js kennt zwei Wege nach draußen: `workerSrc` (der Pfad zur zweiten
      Datei) und `standardFontDataUrl`/`cMapUrl` (Schriften und Zeichentabellen
      aus einem Verzeichnis). Keiner davon darf auf etwas zeigen, das nicht in
      dieser Datei steht.
    */
    for (const pattern of [
      /workerSrc\s*[:=]\s*["'][^"']*\.m?js["']/i,
      /cMapUrl\s*[:=]\s*["'][^"']+["']/i,
      /standardFontDataUrl\s*[:=]\s*["'][^"']+["']/i,
    ]) {
      const hit = teacher.match(pattern);
      expect(hit?.[0] ?? null, `Ladepfad nach draußen: ${hit?.[0] ?? ''}`).toBeNull();
    }
  });

  it('verweist an keiner Stelle auf eine Worker- oder CMap-Datei', () => {
    // Kein `new Worker(...)` mit URL, kein Verweis auf eine `.worker.`-Datei.
    expect(teacher).not.toMatch(/["'][^"']*pdf\.worker[^"']*\.m?js["']/i);
    expect(teacher).not.toMatch(/["'][^"']*\/cmaps\//i);
    expect(teacher).not.toMatch(/["'][^"']*\/standard_fonts\//i);
  });

  it('nennt Herkunft und Lizenz von pdf.js in der Datei selbst', () => {
    /*
      Apache-2.0, Abschnitt 4 (a) und 4 (b): Wer die Datei weitergibt, gibt
      pdf.js mit weiter. Die Angabe darf dann nicht nur im Repository stehen –
      sie muss in dem stecken, was weitergegeben wird.
    */
    expect(teacher).toContain('pdf.js');
    expect(teacher).toContain('Apache License 2.0');
    expect(teacher).toContain('Mozilla Foundation');
  });

  it('hält die Lehrkraftdatei unter 12 MiB', () => {
    /*
      Die Schranke aus dem Sprintauftrag. Sie ist kein Selbstzweck: Eine Datei,
      die per E-Mail nicht mehr durchgeht, ist keine portable Datei mehr.
    */
    const mib = statSync(teacherPath).size / 1024 / 1024;
    expect(mib, `Lehrkraftdatei ${mib.toFixed(2)} MiB`).toBeLessThan(12);
  });

  it('lässt die Schülerlaufzeit von alldem unberührt', () => {
    /*
      Die eigentliche Zusage an die Lernenden: Der PDF-Import ist eine Funktion
      des Lehrkraftbereichs. Drei Megabyte Bibliothek in einer Datei, die an
      eine ganze Klasse geht und in der es keinen Importassistenten gibt, wären
      reine Last.
    */
    for (const marker of ['WorkerMessageHandler', 'pdfjsWorker', 'InvalidPDFException']) {
      expect(runtime.includes(marker), marker).toBe(false);
    }
    const kiB = statSync(runtimePath).size / 1024;
    expect(kiB, `Lernlaufzeit ${kiB.toFixed(1)} KiB`).toBeLessThan(RUNTIME_LIMIT_KIB);
  });
});
