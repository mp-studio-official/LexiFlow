// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ablauf = readFileSync(resolve(wurzel, '.github/workflows/pilot.yml'), 'utf8');
const anleitung = readFileSync(resolve(wurzel, 'docs/pilot-auslieferung.md'), 'utf8');

describe('der Pilot bleibt eine ausdrückliche Handlung', () => {
  it('startet nur über workflow_dispatch und nie durch push', () => {
    expect(ablauf).toContain('workflow_dispatch:');
    expect(ablauf).not.toMatch(/^\s{2}push:/m);
  });

  it('verlangt vor der Prüfkette genau die Bestätigung pilot', () => {
    expect(ablauf).toContain('github.event.inputs.bestaetigung');
    expect(ablauf).toContain('!= "pilot"');
  });

  it('enthält im Bestätigungsschritt gültige Shell-Syntax', () => {
    const schritt = ablauf.match(
      /      - name: Die Bestätigung[\s\S]*?        run: \|\n([\s\S]*?)(?=\n      - uses:)/,
    )?.[1];

    expect(schritt).toBeDefined();
    const shell = schritt
      .split('\n')
      .map((zeile) => zeile.replace(/^          /, ''))
      .join('\n');

    expect(() => execFileSync('bash', ['-n'], { input: shell })).not.toThrow();
  });
});

describe('die Auslieferung bleibt im bestehenden Projekt', () => {
  it('verwendet den Namen des aktuellen Repositorys als Grundpfad', () => {
    expect(ablauf.match(/LEXIFLOW_BASE: \/\$\{\{ github\.event\.repository\.name \}\}\//g))
      .toHaveLength(2);
  });

  it('braucht weder Zielprojekt noch persönlichen Zugriffstoken', () => {
    for (const verboten of [
      'LEXIFLOW_PILOT_OWNER',
      'LEXIFLOW_PILOT_REPO',
      'LEXIFLOW_PILOT_TOKEN',
      'x-access-token',
      'git push',
    ]) {
      expect(ablauf, verboten).not.toContain(verboten);
    }
  });

  it('bezieht nur die zwei öffentlichen Supabase-Buildwerte', () => {
    expect(ablauf).toContain('vars.VITE_SUPABASE_URL');
    expect(ablauf).toContain('vars.VITE_SUPABASE_PUBLISHABLE_KEY');
    expect(ablauf).not.toContain('secrets.');
  });
});

describe('GitHub Pages bekommt nur das frisch geprüfte Artefakt', () => {
  it('verwendet den offiziellen Pages-OIDC-Weg mit minimalen Rechten', () => {
    expect(ablauf).toMatch(/contents:\s*read/);
    expect(ablauf).toMatch(/pages:\s*write/);
    expect(ablauf).toMatch(/id-token:\s*write/);
    expect(ablauf).toContain('actions/configure-pages@v5');
    expect(ablauf).toContain('actions/upload-pages-artifact@v4');
    expect(ablauf).toContain('actions/deploy-pages@v4');
    expect(ablauf).toContain('name: github-pages');
  });

  it('prüft vor dem Upload und veröffentlicht erst danach', () => {
    const riegel = ablauf.indexOf('npm run verify:deploy');
    const upload = ablauf.indexOf('actions/upload-pages-artifact@v4');
    const deploy = ablauf.indexOf('actions/deploy-pages@v4');

    expect(riegel).toBeGreaterThan(-1);
    expect(riegel).toBeLessThan(upload);
    expect(upload).toBeLessThan(deploy);
  });

  it('lädt ausschließlich dist hoch', () => {
    expect(ablauf).toMatch(/actions\/upload-pages-artifact@v4[\s\S]*?path:\s*dist/);
  });

  it('baut die portablen Dateien, bevor ihre Browserprüfung beginnt', () => {
    const bauen = ablauf.indexOf('npm run build:portable');
    const pruefen = ablauf.indexOf('npm run e2e:portable');

    expect(bauen).toBeGreaterThan(-1);
    expect(pruefen).toBeGreaterThan(bauen);
  });

  it('baut nach der Prüfkette in einem frischen Auftrag', () => {
    expect(ablauf).toMatch(/ausliefern:[\s\S]*?needs:\s*pruefen/);
    const ausliefern = ablauf.slice(ablauf.indexOf('  ausliefern:'));
    expect(ausliefern).toContain('actions/checkout@v4');
    expect(ausliefern).not.toContain('download-artifact');
  });
});

describe('die Anleitung beschreibt denselben Weg', () => {
  it('nennt die operative Adresse und schließt das zweite Projekt aus', () => {
    expect(anleitung).toContain('https://mp-studio-official.github.io/LexiFlow/portal/');
    expect(anleitung).toContain('Ein zweites Projekt wird nicht angelegt');
  });

  it('verlangt keinen persönlichen Deployment-Token', () => {
    expect(anleitung).toMatch(/kein\s+Secret `LEXIFLOW_PILOT_TOKEN`/);
    expect(anleitung).toMatch(/kein(?:en)?\s+dauerhaft/);
  });
});
