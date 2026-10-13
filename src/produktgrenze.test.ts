// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Die Dateigrenze dieses Zweigs — nachgeprüft, nicht versprochen.
 *
 * ## Warum eine Wache und nicht eine Zeile im Dokument
 *
 * `docs/produktvertrag-naechste-stufe.md` sagt, welche Bereiche
 * ausschließlich Codex gehören und welche Übergabedateien unverändert
 * bleiben. Ein Satz in einem Dokument hält niemanden auf. Diese Wache fragt
 * `git`, was sich seit dem Ausgangscommit wirklich geändert hat, und
 * vergleicht es mit derselben Liste.
 *
 * ## Warum sie bei fehlendem `git` scheitert statt zu überspringen
 *
 * Eine übersprungene Wache ist grün und hat nichts geprüft — genau die
 * Sorte Prüfung, die dieses Projekt zweimal teuer bezahlt hat. Fehlt der
 * Ausgangscommit, ist das eine Aussage über die Arbeitskopie und keine
 * Erlaubnis.
 */

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = resolve(hier, '..');

/** Der Commit, auf dem dieser Zweig steht. Siehe Produktvertrag, Kopfzeile. */
const AUSGANG = '486abb6';

/**
 * Bereiche, die in diesem Auftrag niemandem hier gehören.
 *
 * Als Präfix geprüft: Ein neuer Unterordner darin ist derselbe Bereich.
 */
const NUR_CODEX = [
  'src/ai/',
  'src/cloud/',
  'supabase/functions/',
  'supabase/migrations/',
  '.github/workflows/',
];

/**
 * Die Nahtstelle zur produktiven Anwendung.
 *
 * Genau diese Dateien verdrahten; was sie bräuchten, steht im
 * Übergabedokument statt in ihnen.
 */
const UEBERGABEDATEIEN = [
  'src/hosted/HostedApp.tsx',
  'src/hosted/teacher/AiPage.tsx',
  'src/hosted/learner/PracticePage.tsx',
  'src/application/repositories.ts',
  'package.json',
];

function zeilen(argumente: readonly string[]): string[] {
  const roh = execFileSync('git', [...argumente], { cwd: wurzel, encoding: 'utf8' });
  return roh.split('\n').map((zeile) => zeile.trim()).filter((zeile) => zeile.length > 0);
}

/**
 * Alles, was gegenüber dem Ausgangscommit anders ist.
 *
 * **Mitsamt neuer, noch unbekannter Dateien.** Die erste Fassung fragte nur
 * `git diff --name-only`, und das listet Unverfolgtes nicht auf: Eine neue
 * `src/ai/etwas.ts` wäre für die Wache unsichtbar gewesen, bis jemand sie
 * zum Commit vormerkt. Gemerkt hat das die Prüfung „sieht überhaupt
 * Änderungen" — sie stand auf null, während drei neue Dateien danebenlagen.
 */
function geaenderteDateien(): string[] {
  const veraendert = zeilen(['diff', '--name-only', AUSGANG]);
  const neue = zeilen(['ls-files', '--others', '--exclude-standard']);
  return [...new Set([...veraendert, ...neue])].sort();
}

describe('die Dateigrenze dieses Zweigs', () => {
  it('kennt den Ausgangscommit — sonst prüft sie nichts', () => {
    /*
      Ohne diesen Schritt liefe `git diff` gegen eine unbekannte Fassung,
      scheiterte mit einem Fehler, und die Fehlermeldung sähe aus wie ein
      Umgebungsproblem statt wie eine Wache, die nichts weiß.
    */
    const gefunden = execFileSync('git', ['rev-parse', '--verify', `${AUSGANG}^{commit}`], {
      cwd: wurzel,
      encoding: 'utf8',
    }).trim();
    expect(gefunden).toMatch(new RegExp(`^${AUSGANG}`));
  });

  it('fasst die Bereiche von Codex nicht an', () => {
    const verletzt = geaenderteDateien().filter((datei) =>
      NUR_CODEX.some((bereich) => datei.startsWith(bereich)),
    );
    expect(verletzt, 'Bereich gehört ausschließlich Codex').toEqual([]);
  });

  it('lässt die Übergabedateien unverändert', () => {
    const verletzt = geaenderteDateien().filter((datei) => UEBERGABEDATEIEN.includes(datei));
    expect(verletzt, 'Übergabedatei verändert statt übergeben').toEqual([]);
  });

  it('sieht überhaupt Änderungen — sonst liefe sie ins Leere', () => {
    /*
      Die Gegenprobe zu den beiden Prüfungen darüber: Wären es null
      geänderte Dateien, wären sie trivial grün. Sie hat sofort etwas
      gefunden — siehe die Begründung an `geaenderteDateien`.
    */
    expect(geaenderteDateien().length).toBeGreaterThan(0);
  });

  it('erkennt eine verbotene Datei auch wirklich', () => {
    const probe = ['src/ai/providers.ts', 'docs/harmlos.md', 'package.json'];
    expect(probe.filter((d) => NUR_CODEX.some((b) => d.startsWith(b)))).toEqual([
      'src/ai/providers.ts',
    ]);
    expect(probe.filter((d) => UEBERGABEDATEIEN.includes(d))).toEqual(['package.json']);
  });
});
