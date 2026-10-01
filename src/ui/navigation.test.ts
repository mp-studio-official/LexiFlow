import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GROESSEN, PROFILE, beschriftung, zieleAuf, zieleFuer } from './navigation';

/**
 * Die Navigationsmatrix — gegen E23 gerechnet, nicht gegen die Erinnerung.
 *
 * ## Warum das Dokument mitgelesen wird
 *
 * Weil E23 zweimal aufgeschrieben ist: in `docs/konzept-5b.md`, wo sie
 * entschieden wurde, und hier, wo sie wirkt. Zwei Fassungen derselben
 * Entscheidung laufen auseinander — genau so ist der Widerspruch entstanden,
 * den die E23-Korrektur aufräumen musste, und genau so ist „Verwaltung" einmal
 * zu „Einstellungen" geworden, ohne dass jemand es beschlossen hatte.
 *
 * Die Entwürfe werden gegen dieselbe Tabelle geprüft
 * (`pruefe-variante.mjs`). Damit hängen Dokument, Entwurf und Code an einer
 * Quelle statt an drei.
 */

const WURZEL = resolve(import.meta.dirname, '../..');
const KONZEPT = readFileSync(resolve(WURZEL, 'docs/konzept-5b.md'), 'utf8');

/** Die Tabelle aus E23, zwischen ihren Marken gelesen. */
function ausDemKonzept(): Map<string, string[]> {
  const anfang = KONZEPT.indexOf('navigation:anfang');
  const ende = KONZEPT.indexOf('navigation:ende');
  if (anfang < 0 || ende < 0 || ende < anfang) {
    throw new Error('docs/konzept-5b.md: Navigationstabelle (navigation:anfang/ende) fehlt');
  }

  const gelesen = new Map<string, string[]>();
  for (const zeile of KONZEPT.slice(anfang, ende).split('\n')) {
    const spalten = zeile.split('|').map((teil) => teil.trim());
    if (spalten.length < 5) continue;
    const [, rolle, groesse, ziele] = spalten;
    if (!rolle || !groesse || !ziele) continue;
    if (!/^(Lehrkraft|Lernende)$/.test(rolle)) continue;
    if (!/^(Schreibtisch|Telefon)$/.test(groesse)) continue;
    const profil = rolle === 'Lehrkraft' ? 'lehrkraft' : 'lernende';
    const schluessel = `${profil}/${groesse === 'Schreibtisch' ? 'schreibtisch' : 'telefon'}`;
    gelesen.set(schluessel, [...ziele.matchAll(/`(#\/[a-zäöüß-]+)`/g)].map((t) => t[1] ?? ''));
  }
  return gelesen;
}

const AUS_E23 = ausDemKonzept();

describe('die Matrix stimmt mit E23 überein', () => {
  it('das Konzept trägt alle vier Zeilen', () => {
    /*
      Ohne diese Prüfung wäre eine kaputte Tabellenerkennung ein *bestandener*
      Test: Eine leere Karte widerspricht keiner Erwartung.
    */
    expect([...AUS_E23.keys()].sort()).toEqual([
      'lehrkraft/schreibtisch',
      'lehrkraft/telefon',
      'lernende/schreibtisch',
      'lernende/telefon',
    ]);
  });

  for (const profil of PROFILE) {
    for (const groesse of GROESSEN) {
      it(`${profil} / ${groesse}`, () => {
        const ist = zieleAuf(profil, groesse).map((ziel) => ziel.pfad);
        expect(ist).toEqual(AUS_E23.get(`${profil}/${groesse}`));
      });
    }
  }
});

describe('die Regeln aus E23, unabhängig von der Tabelle', () => {
  it('Lehrkraft: fünf am Schreibtisch, vier auf dem Telefon', () => {
    expect(zieleAuf('lehrkraft', 'schreibtisch')).toHaveLength(5);
    expect(zieleAuf('lehrkraft', 'telefon')).toHaveLength(4);
  });

  it('Lernende: vier auf beiden Größen, und dieselben', () => {
    const schreibtisch = zieleAuf('lernende', 'schreibtisch').map((z) => z.pfad);
    const telefon = zieleAuf('lernende', 'telefon').map((z) => z.pfad);
    expect(schreibtisch).toHaveLength(4);
    expect(telefon).toEqual(schreibtisch);
  });

  it('das Telefon lässt weg und erfindet nichts', () => {
    // Eine Verdichtung ist eine Verdichtung. Ein Ziel, das es nur am Telefon
    // gäbe, wäre eine zweite Informationsarchitektur.
    for (const profil of PROFILE) {
      const schreibtisch = new Set(zieleAuf(profil, 'schreibtisch').map((z) => z.pfad));
      for (const ziel of zieleAuf(profil, 'telefon')) {
        expect(schreibtisch.has(ziel.pfad), `${ziel.pfad} fehlt am Schreibtisch`).toBe(true);
      }
    }
  });

  it('die Reihenfolge ist auf beiden Größen dieselbe', () => {
    for (const profil of PROFILE) {
      const schreibtisch = zieleAuf(profil, 'schreibtisch').map((z) => z.pfad);
      const telefon = zieleAuf(profil, 'telefon').map((z) => z.pfad);
      expect(telefon).toEqual(schreibtisch.filter((pfad) => telefon.includes(pfad)));
    }
  });

  it('KI-Zugang ist am Schreibtisch ein Ziel und auf dem Telefon keines', () => {
    const pfade = (groesse: 'schreibtisch' | 'telefon'): string[] =>
      zieleAuf('lehrkraft', groesse).map((z) => z.pfad);
    expect(pfade('schreibtisch')).toContain('#/ki');
    expect(pfade('telefon')).not.toContain('#/ki');
  });
});

describe('die Verwaltung ist kein Navigationsziel', () => {
  /*
    `#/verwaltung` liegt hinter `RequireArea area="admin"`. Stünde sie in der
    Matrix, müsste irgendwo eine Berechtigung sie wieder herausfiltern — und
    damit gäbe es eine erste Stelle, an der das schiefgehen kann. Sie steht
    nirgends.
  */
  it('in keinem Profil, auf keiner Größe', () => {
    for (const profil of PROFILE) {
      for (const groesse of GROESSEN) {
        const pfade = zieleAuf(profil, groesse).map((z) => z.pfad);
        expect(pfade, `${profil} / ${groesse}`).not.toContain('#/verwaltung');
      }
    }
  });

  it('auch nicht im Quelltext der Matrix', () => {
    // Nicht nur gefiltert, sondern gar nicht vorhanden.
    const quelle = readFileSync(resolve(import.meta.dirname, 'navigation.ts'), 'utf8');
    const ohneKommentare = quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(ohneKommentare).not.toContain('#/verwaltung');
  });
});

describe('Beschriftungen', () => {
  it('kürzt nur, was gemessen nicht passt', () => {
    const fortschritt = zieleFuer('lernende').find((z) => z.pfad === '#/fortschritt');
    expect(fortschritt).toBeDefined();
    expect(beschriftung(fortschritt!, 'schreibtisch')).toBe('Mein Fortschritt');
    expect(beschriftung(fortschritt!, 'telefon')).toBe('Fortschritt');
  });

  it('nimmt sonst denselben Namen auf beiden Größen', () => {
    for (const profil of PROFILE) {
      for (const ziel of zieleFuer(profil)) {
        if (ziel.labelTelefon) continue;
        expect(beschriftung(ziel, 'telefon')).toBe(beschriftung(ziel, 'schreibtisch'));
      }
    }
  });

  it('jedes Ziel hat einen Namen und ein eigenes Zeichen', () => {
    for (const profil of PROFILE) {
      const zeichen = zieleFuer(profil).map((z) => z.zeichen);
      expect(new Set(zeichen).size, `${profil}: zwei Ziele teilen ein Zeichen`).toBe(zeichen.length);
      for (const ziel of zieleFuer(profil)) {
        expect(ziel.label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('die Schichtentrennung', () => {
  const quelle = readFileSync(resolve(import.meta.dirname, 'navigation.ts'), 'utf8');
  const ohneKommentare = quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('die Matrix hängt an keiner Anmeldung, Rolle, Cloud und an keinem Router', () => {
    /*
      **Das ist die verbindliche Regel.** Diese Datei liegt in `src/ui/` und
      darf damit in jedem Bündel landen — auch in der portablen Lerndatei, die
      kein Konto kennt. Ein `useSession()` zöge den halben Cloudzweig hinter
      sich her, und zwar unbemerkt: Ein Import fällt niemandem auf.

      Der Router steht mit auf der Liste, weil die Matrix Adressen *nennt* und
      nicht navigiert. Wer hier `useNavigate` einführt, hat die Schicht
      gewechselt, ohne die Datei zu verschieben.
    */
    for (const verboten of [
      'useSession',
      'SessionContext',
      'mayEnter',
      'RequireArea',
      'repositories',
      'supabase',
      'hosted/',
      'cloud/',
      'react-router',
    ]) {
      expect(ohneKommentare, `navigation.ts greift auf ${verboten} zu`).not.toContain(verboten);
    }
  });

  it('und kommt derzeit ganz ohne Importe aus', () => {
    /*
      Das ist **kein Architekturgesetz**, sondern der heutige Stand — und er
      ist angenehm, weil er die Liste darüber nicht braucht: Was nichts
      importiert, kann nichts hereinziehen, auch nichts, woran bei einer
      Verbotsliste niemand gedacht hat.

      Ein späterer reiner UI-Typimport wäre kein Bruch. Dann wird dieser Test
      gestrichen und die Liste darüber bleibt; was er zusätzlich hält, hält
      sie auch.
    */
    expect(ohneKommentare).not.toMatch(/^\s*import\s/m);
  });

  it('und sie kennt keinen Umsetzungszustand', () => {
    // Ob eine Route existiert, ist Portalwissen (src/hosted/).
    for (const verboten of ['vorhanden', 'weiterleitung', 'geplant']) {
      expect(ohneKommentare, `Umsetzungszustand "${verboten}" gehört nicht hierher`).not.toContain(
        verboten,
      );
    }
  });
});
