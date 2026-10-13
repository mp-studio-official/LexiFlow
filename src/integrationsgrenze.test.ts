// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WURZEL = resolve(import.meta.dirname, '..');

function produktionsdateien(pfad: string): string[] {
  const absolut = resolve(WURZEL, pfad);
  return readdirSync(absolut, { withFileTypes: true }).flatMap((eintrag) => {
    const datei = join(absolut, eintrag.name);
    if (eintrag.isDirectory()) return produktionsdateien(relative(WURZEL, datei));
    if (!['.ts', '.tsx'].includes(extname(eintrag.name)) || eintrag.name.includes('.test.')) return [];
    return [datei];
  });
}

function importziele(datei: string): string[] {
  const quelltext = readFileSync(datei, 'utf8');
  return [...quelltext.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(
    (treffer) => treffer[2] ?? '',
  );
}

function verletzungen(dateien: readonly string[], verboten: readonly RegExp[]) {
  return dateien.flatMap((datei) =>
    importziele(datei)
      .filter((ziel) => verboten.some((muster) => muster.test(ziel)))
      .map((ziel) => `${relative(WURZEL, datei)} -> ${ziel}`),
  );
}

describe('dauerhafte Grenzen der zusammengefuehrten Produktstufe', () => {
  it('haelt Domain und Universalimport frei von Sitzung, Netz und Oberflaeche', () => {
    const dateien = [
      ...produktionsdateien('src/domain/motivation'),
      ...produktionsdateien('src/domain/sprache'),
      resolve(WURZEL, 'src/import/universal.ts'),
    ];
    expect(
      verletzungen(dateien, [
        /(?:^|\/)hosted(?:\/|$)/,
        /(?:^|\/)application(?:\/|$)/,
        /(?:^|\/)cloud(?:\/|$)/,
        /(?:^|\/)supabase(?:\/|$)/,
        /SessionContext/,
        /react-router/,
      ]),
    ).toEqual([]);
  });

  it('laesst die neuen Oberflaechen keine Sitzung, Repositories oder Netzanbieter holen', () => {
    const dateien = [
      ...produktionsdateien('src/hosted/teacher/werkstatt'),
      ...produktionsdateien('src/hosted/learner/motivation'),
      ...produktionsdateien('src/hosted/learner/sprache'),
      ...produktionsdateien('src/hosted/learner/ki-ui'),
    ];
    expect(
      verletzungen(dateien, [
        /(?:^|\/)application(?:\/|$)/,
        /(?:^|\/)cloud(?:\/|$)/,
        /(?:^|\/)supabase(?:\/|$)/,
        /SessionContext/,
        /repositories/,
        /HostedApp/,
      ]),
    ).toEqual([]);
  });

  it('haelt das Anbieterprotokoll serverseitig und unabhaengig von der Lernoberflaeche', () => {
    const dateien = produktionsdateien('supabase/functions/ai-gateway');
    expect(verletzungen(dateien, [/(?:^|\/)src(?:\/|$)/, /hosted\/learner/, /Lerncoach/])).toEqual([]);
  });

  it('erkennt seine verbotenen Beispielimporte', () => {
    const beispiele = [
      'src/domain/motivation/index.ts -> ../../hosted/PortalShell',
      'src/hosted/learner/ki-ui/Lerncoach.tsx -> ../../../cloud/aiGateway',
      'supabase/functions/ai-gateway/core.ts -> ../../../src/hosted/learner/ki-ui/vertrag',
    ];
    expect(beispiele.filter((zeile) => /hosted|cloud|src\/hosted/.test(zeile))).toHaveLength(3);
  });
});
