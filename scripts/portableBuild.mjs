/**
 * Eine kleine, allgemeine Bau-Orchestrierung.
 *
 * Bewusst **ohne LexiFlow-Fachwissen**: Dieses Modul weiß nichts von
 * Vokabelpaketen, Schülerdateien oder Vite. Es kennt nur „führe Schritte der
 * Reihe nach aus, lege danach genau diese Enddateien an, räume die
 * Zwischenordner weg – und hinterlasse bei einem Fehler nichts, was wie ein
 * fertiges Ergebnis aussieht“.
 *
 * Alle Seiteneffekte laufen über das injizierbare `io`-Objekt. Genau deshalb
 * lässt sich das Verhalten prüfen, ohne einen echten Build zu starten:
 * Reihenfolge, Abbruch nach dem ersten Fehler, Aufräumen.
 */

import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

/** Fehler eines einzelnen Schritts – trägt den Namen des Schritts mit sich. */
export class BuildStepError extends Error {
  /**
   * @param {string} step
   * @param {unknown} cause
   */
  constructor(step, cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Schritt „${step}“ ist fehlgeschlagen: ${detail}`);
    this.name = 'BuildStepError';
    this.step = step;
    this.cause = cause;
  }
}

/** Die Dateisystemzugriffe, die die Orchestrierung braucht. */
export const nodeIo = {
  /** Legt das Ausgabeverzeichnis frisch an – alte Ergebnisse verschwinden. */
  reset(dir) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  },
  exists(path) {
    return existsSync(path);
  },
  copy(from, to) {
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  },
  remove(path) {
    rmSync(path, { recursive: true, force: true });
  },
  size(path) {
    return statSync(path).size;
  },
};

/**
 * Führt die Schritte aus und stellt die Enddateien bereit.
 *
 * @param {object} options
 * @param {string} options.outDir            Verzeichnis der Enddateien.
 * @param {{ label: string, run: () => unknown }[]} options.steps
 * @param {{ from: string, to: string }[]} options.outputs
 * @param {string[]} [options.tempDirs]      Zwischenordner, die danach weichen.
 * @param {typeof nodeIo} [options.io]
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<{ file: string, bytes: number }[]>}
 */
export async function runBuildPipeline({
  outDir,
  steps,
  outputs,
  tempDirs = [],
  io = nodeIo,
  log = (line) => process.stdout.write(`${line}\n`),
}) {
  // Zuerst aufräumen: Ein abgebrochener Lauf darf keine alte, scheinbar
  // aktuelle Datei zurücklassen, die jemand weitergibt.
  io.reset(outDir);

  for (const [index, step] of steps.entries()) {
    // Vor dem Schritt ausgeben, nicht danach – sonst sieht man beim Warten
    // nichts. `process.stdout.write` schreibt sofort, ohne Pufferung bis zum
    // Prozessende.
    log(`[${index + 1}/${steps.length}] ${step.label} …`);
    try {
      await step.run();
    } catch (error) {
      // Nichts Halbfertiges stehen lassen.
      for (const output of outputs) io.remove(output.to);
      for (const dir of tempDirs) io.remove(dir);
      throw new BuildStepError(step.label, error);
    }
  }

  for (const output of outputs) {
    if (!io.exists(output.from)) {
      for (const done of outputs) io.remove(done.to);
      throw new BuildStepError(
        'Ergebnisdateien bereitstellen',
        new Error(`erwartete Datei fehlt: ${output.from}`),
      );
    }
    io.copy(output.from, output.to);
  }

  for (const dir of tempDirs) io.remove(dir);

  return outputs.map((output) => ({ file: output.to, bytes: io.size(output.to) }));
}
