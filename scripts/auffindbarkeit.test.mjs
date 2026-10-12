// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = resolve(fileURLToPath(new URL('..', import.meta.url)));
const startseite = readFileSync(resolve(wurzel, 'index.html'), 'utf8');
const portal = readFileSync(resolve(wurzel, 'portal.html'), 'utf8');
const robots = readFileSync(resolve(wurzel, 'public/robots.txt'), 'utf8');
const sitemap = readFileSync(resolve(wurzel, 'public/sitemap.xml'), 'utf8');

describe('LexiFlow ist unter der eigenen Domain auffindbar', () => {
  it('nennt die Hauptadresse eindeutig als kanonische Adresse', () => {
    expect(startseite).toContain('<link rel="canonical" href="https://lexiflow.info/" />');
    expect(startseite).toContain('<meta property="og:url" content="https://lexiflow.info/" />');
    expect(startseite).toMatch(/<meta\s+name="description"/);
  });

  it('weist Suchmaschinen auf genau die öffentliche Startseite hin', () => {
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://lexiflow.info/sitemap.xml');
    expect(sitemap.match(/<loc>/g)).toHaveLength(1);
    expect(sitemap).toContain('<loc>https://lexiflow.info/</loc>');
  });

  it('nimmt die Anmeldeoberfläche aus den Suchergebnissen', () => {
    expect(portal).toContain('<meta name="robots" content="noindex, nofollow" />');
  });
});

describe('die Pilotschule wird LexiFlow nicht zugerechnet', () => {
  it('nennt die Schule weder öffentlich noch in den Projektunterlagen', () => {
    const dateien = execFileSync('git', ['ls-files'], { cwd: wurzel, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter((pfad) => ['.html', '.md', '.ts', '.tsx', '.mjs'].includes(extname(pfad)))
      .filter((pfad) => !pfad.startsWith('src/dictionary/'));
    const verboteneNamen = [
      ['Georg', 'Büchner', 'Gymnasium'].join('-'),
      ['GBG', 'Kaarst'].join(' '),
      ['Stadt', 'Kaarst'].join(' '),
    ];

    for (const pfad of dateien) {
      const inhalt = readFileSync(resolve(wurzel, pfad), 'utf8');
      for (const name of verboteneNamen) {
        expect(inhalt, `${pfad} nennt ${name}`).not.toContain(name);
      }
    }
  });
});
