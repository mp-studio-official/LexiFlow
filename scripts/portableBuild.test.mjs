import { describe, expect, it } from 'vitest';
import { BuildStepError, runBuildPipeline } from './portableBuild.mjs';

/**
 * Sprint 4A.1a: Die Bau-Orchestrierung, geprüft ohne Build.
 *
 * Der Fehler, der diesen Korrekturcommit ausgelöst hat, war kein Fehler in
 * Vite, sondern einer im Ablauf drumherum. Genau dieser Ablauf ist hier
 * injizierbar: Schritte sind Funktionen, Dateisystemzugriffe laufen über ein
 * `io`-Objekt. Deshalb lassen sich Reihenfolge, Abbruch und Aufräumen prüfen,
 * ohne eine einzige Datei anzufassen.
 */

/** Ein Dateisystem im Kopf – merkt sich, was passiert ist. */
function fakeIo(existing = ['tmp/a', 'tmp/b']) {
  const files = new Set(existing);
  const calls = [];
  return {
    calls,
    files,
    reset(dir) {
      calls.push(`reset:${dir}`);
      for (const file of [...files]) if (file.startsWith(`${dir}/`)) files.delete(file);
    },
    exists(path) {
      return files.has(path);
    },
    copy(from, to) {
      calls.push(`copy:${from}->${to}`);
      files.add(to);
    },
    remove(path) {
      calls.push(`remove:${path}`);
      files.delete(path);
    },
    size() {
      return 1024;
    },
  };
}

function pipeline(overrides = {}) {
  const io = overrides.io ?? fakeIo();
  const log = [];
  return {
    io,
    log,
    run: (options) =>
      runBuildPipeline({
        outDir: 'out',
        outputs: [
          { from: 'tmp/a', to: 'out/Erste.html' },
          { from: 'tmp/b', to: 'out/Zweite.html' },
        ],
        tempDirs: ['tmp/a-dir', 'tmp/b-dir'],
        io,
        log: (line) => log.push(line),
        ...options,
      }),
  };
}

describe('Bau-Orchestrierung', () => {
  it('führt die Schritte in der angegebenen Reihenfolge aus', async () => {
    const order = [];
    const { run } = pipeline();

    await run({
      steps: [
        { label: 'Lernlaufzeit', run: async () => void order.push('erst') },
        { label: 'Lehrkraftdatei', run: async () => void order.push('dann') },
      ],
    });

    expect(order).toEqual(['erst', 'dann']);
  });

  it('meldet jeden Schritt, bevor er läuft – nicht erst danach', async () => {
    const seen = [];
    const harness = pipeline();

    await harness.run({
      steps: [
        { label: 'Lernlaufzeit', run: () => void seen.push([...harness.log]) },
        { label: 'Lehrkraftdatei', run: () => void seen.push([...harness.log]) },
      ],
    });

    expect(seen[0]).toEqual(['[1/2] Lernlaufzeit …']);
    expect(seen[1]).toEqual(['[1/2] Lernlaufzeit …', '[2/2] Lehrkraftdatei …']);
  });

  it('legt beide Enddateien an und räumt die Zwischenordner weg', async () => {
    const harness = pipeline();

    const results = await harness.run({
      steps: [
        { label: 'Lernlaufzeit', run: () => undefined },
        { label: 'Lehrkraftdatei', run: () => undefined },
      ],
    });

    expect(results.map((result) => result.file)).toEqual(['out/Erste.html', 'out/Zweite.html']);
    expect(harness.io.files.has('out/Erste.html')).toBe(true);
    expect(harness.io.files.has('out/Zweite.html')).toBe(true);
    expect(harness.io.calls).toContain('remove:tmp/a-dir');
    expect(harness.io.calls).toContain('remove:tmp/b-dir');
  });

  it('räumt das Ausgabeverzeichnis auf, bevor irgendetwas läuft', async () => {
    const harness = pipeline();

    await harness.run({
      steps: [{ label: 'Nur einer', run: () => undefined }],
      outputs: [{ from: 'tmp/a', to: 'out/Erste.html' }],
    });

    expect(harness.io.calls[0]).toBe('reset:out');
  });

  it('bricht nach dem ersten Fehler ab – der zweite Schritt läuft nicht', async () => {
    let zweiterLief = false;
    const harness = pipeline();

    await expect(
      harness.run({
        steps: [
          {
            label: 'Lernlaufzeit',
            run: () => {
              throw new Error('Rollup mag das nicht');
            },
          },
          { label: 'Lehrkraftdatei', run: () => void (zweiterLief = true) },
        ],
      }),
    ).rejects.toThrow(BuildStepError);

    expect(zweiterLief).toBe(false);
  });

  it('benennt den gescheiterten Schritt und die Ursache', async () => {
    const harness = pipeline();

    await expect(
      harness.run({
        steps: [
          {
            label: 'Lehrkraftdatei',
            run: () => Promise.reject(new Error('Laufzeit fehlt')),
          },
        ],
      }),
    ).rejects.toThrow(/Lehrkraftdatei.*Laufzeit fehlt/);
  });

  it('hinterlässt bei einem Fehler keine scheinbar fertige Enddatei', async () => {
    // Ausgangslage: Aus einem früheren Lauf liegen bereits Enddateien da.
    const io = fakeIo(['tmp/a', 'tmp/b', 'out/Erste.html', 'out/Zweite.html']);
    const harness = pipeline({ io });

    await expect(
      harness.run({
        steps: [
          { label: 'Lernlaufzeit', run: () => undefined },
          {
            label: 'Lehrkraftdatei',
            run: () => {
              throw new Error('kaputt');
            },
          },
        ],
      }),
    ).rejects.toThrow(BuildStepError);

    expect(io.files.has('out/Erste.html')).toBe(false);
    expect(io.files.has('out/Zweite.html')).toBe(false);
  });

  it('scheitert, wenn ein Schritt seine Datei gar nicht erzeugt hat', async () => {
    const io = fakeIo(['tmp/a']); // `tmp/b` fehlt.
    const harness = pipeline({ io });

    await expect(
      harness.run({
        steps: [
          { label: 'Lernlaufzeit', run: () => undefined },
          { label: 'Lehrkraftdatei', run: () => undefined },
        ],
      }),
    ).rejects.toThrow(/erwartete Datei fehlt: tmp\/b/);

    // Und auch die schon kopierte erste Datei bleibt nicht liegen.
    expect(io.files.has('out/Erste.html')).toBe(false);
  });
});
