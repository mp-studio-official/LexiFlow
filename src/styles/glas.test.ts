import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Die Wache für den Glasbaustein.
 *
 * ## Was sie prüft, und warum man es nicht sieht
 *
 * Eine Glasfläche ohne deckenden Rückfall sieht in jedem Browser richtig aus,
 * der `backdrop-filter` beherrscht — also in jedem, in dem jemand den Entwurf
 * abnimmt. Falsch sieht sie dort aus, wo niemand hinschaut: Die Transparenz
 * bleibt, die Unschärfe fehlt, und ein Aurora-Verlauf steht ungefiltert
 * hinter der Schrift.
 *
 * Dasselbe gilt für Glas an der falschen Stelle. Über einer weißen Fläche
 * sieht Glas aus wie eine weiße Fläche; dass unter dem Grammatikeditor eine
 * durchscheinende Fläche liegt, merkt man erst, wenn etwas Buntes darunter
 * scrollt.
 *
 * Beides sind Zusagen, die man nur im Quelltext prüfen kann. Hier stehen sie.
 *
 * ## Gegen alle Stylesheets, nicht nur gegen `glas.css`
 *
 * Die Frage lautet nicht „ist der Baustein richtig gebaut?", sondern „gibt es
 * im Produkt eine Glasfläche ohne Rückfall?". Die zweite Frage ist die, die
 * zählt, und sie ist nur vollständig zu beantworten.
 */

const STILORDNER = resolve(import.meta.dirname);

const STILDATEIEN = readdirSync(STILORDNER).filter((datei) => datei.endsWith('.css'));

const lies = (datei: string): string => readFileSync(resolve(STILORDNER, datei), 'utf8');

/** Ohne Kommentare — sonst prüft die Wache ihre eigene Begründung mit. */
const ohneKommentare = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '');

/** Die Selektoren eines Stylesheets, die `backdrop-filter` setzen. */
function glasregeln(css: string): string[] {
  const treffer = [...css.matchAll(/([^{}]+)\{([^{}]*backdrop-filter[^{}]*)\}/g)];
  return treffer.flatMap((t) =>
    (t[1] ?? '')
      .split(',')
      .map((wahl) => wahl.trim())
      .filter((wahl) => wahl.length > 0 && !wahl.startsWith('@')),
  );
}

/** Der Inhalt aller `@supports not (…)`-Blöcke eines Stylesheets. */
function rueckfallbloecke(css: string): string {
  return [...css.matchAll(/@supports\s+not[^{]*\{([\s\S]*?)\n\}/g)].map((t) => t[1] ?? '').join('\n');
}

describe('jede Glasfläche hat einen deckenden Rückfall', () => {
  for (const datei of STILDATEIEN) {
    const css = ohneKommentare(lies(datei));
    const regeln = glasregeln(css);
    if (regeln.length === 0) continue;

    const rueckfall = rueckfallbloecke(css);

    it.each(regeln)(`${datei}: %s`, (regel) => {
      expect(rueckfall, `${regel} hat keinen Rückfall in @supports not`).toContain(regel);
    });

    it(`${datei}: der Rückfall ist deckend`, () => {
      /*
        Ein Rückfall, der `rgba(255,255,255,0.6)` setzt, ist keiner: Er
        wiederholt genau das Problem, ohne die Unschärfe, die es trug.
        Verlangt ist eine Flächenfarbe aus den Token.
      */
      expect(rueckfall).toMatch(/background:\s*var\(--flaeche\)/);
      expect(rueckfall).not.toMatch(/background:[^;]*(rgba|\/\s*\d?\d%)/);
      expect(rueckfall).not.toMatch(/background:\s*transparent/);
    });
  }

  it('es gibt überhaupt eine Glasregel zu prüfen', () => {
    /*
      Die Gegenprobe zur Gegenprobe. Ohne sie liefe diese Datei grün durch,
      sobald der Baustein umbenannt wird oder die Schleife oben ins Leere
      greift — und meldete, alles sei in Ordnung, ohne etwas gesehen zu haben.
    */
    const alle = STILDATEIEN.flatMap((datei) => glasregeln(ohneKommentare(lies(datei))));
    expect(alle).toContain('.glas');
    expect(alle.length).toBeGreaterThan(0);
  });
});

describe('Glas liegt nur, wo es hingehört', () => {
  /*
    Die Liste ist bewusst kurz und soll es bleiben. Sie zu verlängern ist eine
    Gestaltungsentscheidung und gehört in den Block, der sie trifft — nicht in
    eine Zeile, die beim Durchlesen eines Diffs nicht auffällt.
  */
  const ERLAUBT = ['.glas', '.glas--fest'];

  it.each(STILDATEIEN)('%s führt keine unerlaubte Glasfläche', (datei) => {
    const unerlaubt = glasregeln(ohneKommentare(lies(datei))).filter(
      (regel) => !ERLAUBT.includes(regel),
    );
    expect(unerlaubt, 'Glas gehört nicht unter Formulare, Tabellen und Lesetext').toEqual([]);
  });
});

describe('der Baustein erreicht noch keinen Bildschirm', () => {
  /**
   * Alle Stylesheets unter `src/`, nicht nur die in diesem Ordner.
   *
   * Die erste Fassung sah nur `src/styles/`. Als die Hülle in 5B.2c ihr
   * eigenes Stylesheet unter `src/ui/` bekam und von dort `glas.css`
   * einband, blieb diese Prüfung grün und behauptete weiter, niemand binde
   * es ein. Eine Prüfung, die am falschen Ort sucht, besteht immer.
   */
  const alleStylesheets = (() => {
    const gefunden: string[] = [];
    const sammle = (ordner: string): void => {
      for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
        const pfad = resolve(ordner, eintrag.name);
        if (eintrag.isDirectory()) sammle(pfad);
        else if (eintrag.name.endsWith('.css')) gefunden.push(pfad);
      }
    };
    sammle(resolve(STILORDNER, '..'));
    return gefunden;
  })();

  /** Wer `glas.css` einbindet — und wer es darf. */
  const ERLAUBTE_EINBINDER = ['huelle.css'];

  it('nur die Hülle bindet glas.css ein, und sonst kein Stylesheet', () => {
    const einbindend = alleStylesheets
      .filter((pfad) => !pfad.endsWith('glas.css'))
      .filter((pfad) => /glas\.css/.test(ohneKommentare(readFileSync(pfad, 'utf8'))))
      .map((pfad) => pfad.slice(pfad.lastIndexOf('/') + 1));

    expect([...einbindend].sort()).toEqual([...ERLAUBTE_EINBINDER].sort());
  });

  it('die Hülle bindet es wirklich ein — sonst hätte sie kein Glas', () => {
    /*
      Die Gegenprobe zur Zeile darüber: Eine leere Liste bestünde sie
      ebenfalls, und dann stünde `.glas` an der Hülle ohne jede Regel.
    */
    const huelle = alleStylesheets.find((pfad) => pfad.endsWith('ui/huelle.css'));
    expect(huelle, 'src/ui/huelle.css fehlt').toBeDefined();
    expect(readFileSync(huelle!, 'utf8')).toMatch(/@import\s+'[^']*glas\.css'/);
  });

  it('kein Modul bindet glas.css unmittelbar ein', () => {
    /*
      Ein `import './styles/glas.css'` in einer Komponente bindet die Datei
      genauso ein wie ein `@import` — die Prüfung, die nur Stylesheets
      ansieht, hätte das nicht gesehen.
    */
    const quellen = resolve(STILORDNER, '..');
    const module: string[] = [];
    const sammle = (ordner: string): void => {
      for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
        const pfad = resolve(ordner, eintrag.name);
        if (eintrag.isDirectory()) sammle(pfad);
        // Diese Datei selbst nennt den Dateinamen, ohne ihn einzubinden.
        else if (/\.tsx?$/.test(eintrag.name) && eintrag.name !== 'glas.test.ts') module.push(pfad);
      }
    };
    sammle(quellen);
    expect(module.length).toBeGreaterThan(50);
    const einbindend = module.filter((pfad) =>
      /['"][^'"]*glas\.css['"]/.test(readFileSync(pfad, 'utf8')),
    );
    expect(einbindend, 'ein Modul bindet glas.css ein').toEqual([]);
  });

  it('glas.css benutzt ausschließlich E19-Token', () => {
    // Eine Glasfläche, die auf Pergament zurückfällt, wäre halb umgestellt.
    const css = ohneKommentare(lies('glas.css'));
    expect(css).not.toMatch(/var\(--canvas\)/);
    expect(css).not.toMatch(/var\(--surface[^)]*\)/);
    expect(css).toMatch(/var\(--glas-grund\)/);
  });
});
