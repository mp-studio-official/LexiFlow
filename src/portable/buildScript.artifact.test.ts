import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

/**
 * Sprint 4A.1a: Der Build-Aufruf selbst, einmal wirklich ausgeführt.
 *
 * Der gemeldete Fehler war kein falsches Ergebnis, sondern ein **Prozess, der
 * nicht zurückkam**: `execFileSync('npx', …)` aus einem npm-Lauf heraus blieb
 * auf echten Rechnern hängen. Gegen so etwas hilft kein Unit-Test mit
 * Attrappen – nur der echte Aufruf mit einer Zeitgrenze.
 *
 * Damit dieser Test nichts kaputt macht, baut er in ein eigenes temporäres
 * Verzeichnis (`LEXIFLOW_PORTABLE_OUT`); `dist-portable/` bleibt unberührt.
 * Er läuft mit `npm run verify:portable`, nicht in der Standardsuite.
 */

const root = resolve(import.meta.dirname, '../..');
const script = resolve(root, 'scripts/build-portable.mjs');
const outDir = mkdtempSync(resolve(tmpdir(), 'lexiflow-build-'));

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('scripts/build-portable.mjs', () => {
  it('startet keinen verschachtelten Paketmanager', () => {
    const source = readFileSync(script, 'utf8');
    /*
      Nur der ausgeführte Code zählt. Die Kommentare erklären ausdrücklich, was
      früher schiefging – dort steht „npx“ mit Absicht, und ein Test, der darüber
      stolpert, erzöge dazu, die Begründung zu löschen.
    */
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(code).not.toContain('npx');
    expect(code).not.toContain('execFileSync');
    expect(code).not.toContain('node_modules/.bin');
    expect(code).not.toMatch(/process\.platform\s*===\s*'(darwin|win32)'/);
    // Vites programmatische API statt eines Unterprozesses.
    expect(code).toContain("await import('vite')");
  });

  it(
    'läuft durch, endet selbstständig und erzeugt beide Enddateien',
    { timeout: 300_000 },
    async () => {
      const started = Date.now();
      const { stdout } = await run(process.execPath, [script], {
        cwd: root,
        env: { ...process.env, LEXIFLOW_PORTABLE_OUT: relative(root, outDir) },
        // Zeitgrenze **und** Kill-Signal: Ein Hänger fällt hier auf, statt die
        // Suite blockieren zu lassen.
        timeout: 240_000,
        killSignal: 'SIGKILL',
        maxBuffer: 32 * 1024 * 1024,
      });

      // Ein Build dieser Größe braucht Sekunden, keine Minuten. Wäre der alte
      // Hänger zurück, liefe der Aufruf in die Zeitgrenze und `run` würfe.
      expect(Date.now() - started).toBeLessThan(240_000);

      expect(existsSync(resolve(outDir, 'LexiFlow-Lehrkraft.html'))).toBe(true);
      expect(existsSync(resolve(outDir, 'LexiFlow-Schuelerlaufzeit.html'))).toBe(true);
      // Die Zwischenordner sind weg.
      expect(existsSync(resolve(outDir, 'student'))).toBe(false);
      expect(existsSync(resolve(outDir, 'teacher'))).toBe(false);

      // Der Fortschritt steht in der Ausgabe, in der richtigen Reihenfolge.
      const first = stdout.indexOf('[1/2] Schülerlaufzeit');
      const second = stdout.indexOf('[2/2] Lehrkraftdatei');
      expect(first).toBeGreaterThanOrEqual(0);
      expect(second).toBeGreaterThan(first);
    },
  );

  it(
    'bricht in einem echten Prozess nach dem ersten Fehler ab',
    { timeout: 60_000 },
    async () => {
      /*
        Absichtlich nicht über einen Testschalter im Buildskript: Ein Ausgang,
        den nur der Test benutzt, wäre eine Attrappe im Auslieferungscode. Hier
        läuft stattdessen dieselbe Orchestrierung in einem echten Node-Prozess,
        mit einem Schritt, der scheitert – geprüft wird, was danach übrig
        bleibt: ein Exit-Code ungleich null, kein zweiter Schritt, keine
        Enddatei.
      */
      const brokenOut = mkdtempSync(resolve(tmpdir(), 'lexiflow-broken-'));
      const moduleUrl = pathToFileURL(resolve(root, 'scripts/portableBuild.mjs')).href;
      const program = [
        `import { runBuildPipeline } from ${JSON.stringify(moduleUrl)};`,
        `const out = ${JSON.stringify(brokenOut)};`,
        'let zweiterLief = false;',
        'try {',
        '  await runBuildPipeline({',
        '    outDir: out,',
        '    steps: [',
        `      { label: 'Schülerlaufzeit', run: () => { throw new Error('Rollup mag das nicht'); } },`,
        `      { label: 'Lehrkraftdatei', run: () => { zweiterLief = true; } },`,
        '    ],',
        `    outputs: [{ from: out + '/x', to: out + '/LexiFlow-Lehrkraft.html' }],`,
        '  });',
        '} catch (error) {',
        '  process.stderr.write(String(error.message));',
        `  process.stdout.write(zweiterLief ? 'ZWEITER-LIEF' : 'ABGEBROCHEN');`,
        '  process.exitCode = 1;',
        '}',
      ].join('\n');

      try {
        const failed = (await run(process.execPath, ['--input-type=module', '-e', program], {
          cwd: root,
          timeout: 45_000,
          killSignal: 'SIGKILL',
        }).catch((error: unknown) => error)) as {
          code?: number;
          stderr?: string;
          stdout?: string;
        };

        expect(failed.code).toBe(1);
        expect(`${failed.stdout ?? ''}`).toContain('ABGEBROCHEN');
        expect(`${failed.stderr ?? ''}`).toMatch(/Schülerlaufzeit.*Rollup mag das nicht/);
        expect(existsSync(resolve(brokenOut, 'LexiFlow-Lehrkraft.html'))).toBe(false);
      } finally {
        rmSync(brokenOut, { recursive: true, force: true });
      }
    },
  );
});
