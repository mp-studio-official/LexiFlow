// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { Huelle, type Navigationsziel } from './Huelle';

/**
 * Die Hülle — was sich ohne Layout entscheiden lässt.
 *
 * jsdom rechnet keine Breiten. Was hier geprüft wird, ist die Struktur:
 * Rollen, Namen, `aria-current`, Reihenfolge, und dass die Hülle wirklich nur
 * zeigt, was ihr übergeben wurde.
 *
 * Die Aussagen über Pixel — 76 px, Tooltip bei Fokus, `display: none` am
 * anderen Haltepunkt, 44 px, kein Überlauf — stehen in
 * `scripts/huelle-messen.mjs` und werden in einem echten Browser gemessen.
 * Ein Test, der sie hier behauptete, prüfte eine Zahl, die jsdom erfunden hat.
 */

afterEach(cleanup);

const SCHREIBTISCH: Navigationsziel[] = [
  { pfad: '#/kurse', label: 'Kurse', zeichen: 'kurse' },
  { pfad: '#/ki', label: 'KI-Zugang', zeichen: 'ki' },
];
const TELEFON: Navigationsziel[] = [{ pfad: '#/kurse', label: 'Kurse', zeichen: 'kurse' }];

function zeige(zusatz: Partial<Parameters<typeof Huelle>[0]> = {}) {
  return render(
    <Huelle
      zieleSchreibtisch={SCHREIBTISCH}
      zieleTelefon={TELEFON}
      marke={<span>LexiFlow</span>}
      markePfad="#/"
      {...zusatz}
    >
      <h1>Inhalt</h1>
    </Huelle>,
  );
}

describe('die Hülle zeigt, was ihr übergeben wird — und nichts sonst', () => {
  it('rendert genau die übergebenen Ziele', () => {
    zeige();
    const navigationen = screen.getAllByRole('navigation', { name: 'Hauptnavigation' });
    expect(navigationen).toHaveLength(2);

    const [leiste, unten] = navigationen;
    expect([...(leiste?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href'))).toEqual([
      '#/kurse',
      '#/ki',
    ]);
    expect([...(unten?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href'))).toEqual([
      '#/kurse',
    ]);
  });

  it('erfindet kein Ziel und filtert keines weg', () => {
    /*
      Die Hülle kennt keinen Umsetzungszustand. Geplante Ziele erreichen sie
      gar nicht — sie werden draußen weggelassen, nicht hier gefiltert. Was
      nie ankommt, kann nicht versehentlich doch gerendert werden.
    */
    zeige({ zieleSchreibtisch: [], zieleTelefon: [] });
    for (const nav of screen.getAllByRole('navigation', { name: 'Hauptnavigation' })) {
      expect(nav.querySelectorAll('a')).toHaveLength(0);
    }
  });

  it('nimmt den Namen aus den Daten, nicht aus dem Zeichen', () => {
    zeige();
    expect(screen.getAllByRole('link', { name: 'KI-Zugang' }).length).toBeGreaterThan(0);
  });

  it('kürzt am Telefon nur, wo eine Kurzfassung übergeben wurde', () => {
    zeige({
      zieleTelefon: [
        { pfad: '#/fortschritt', label: 'Mein Fortschritt', labelKurz: 'Fortschritt', zeichen: 'fortschritt' },
      ],
    });
    const unten = screen.getAllByRole('navigation', { name: 'Hauptnavigation' })[1];
    expect(unten?.textContent).toContain('Fortschritt');
    expect(unten?.textContent).not.toContain('Mein Fortschritt');
    // Vorgelesen wird weiterhin der volle Name.
    expect(within(unten!).getByRole('link', { name: 'Mein Fortschritt' })).toBeInTheDocument();
  });
});

describe('der aktive Eintrag', () => {
  it('trägt in jeder Navigation genau ein `aria-current`', () => {
    zeige({ aktiverPfad: '#/kurse' });
    for (const nav of screen.getAllByRole('navigation', { name: 'Hauptnavigation' })) {
      expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    }
  });

  it('trägt keines, wenn kein übergebenes Ziel aktiv ist', () => {
    // Etwa auf einer Unterseite, die zu keinem Navigationsziel gehört.
    zeige({ aktiverPfad: '#/einstellungen' });
    for (const nav of screen.getAllByRole('navigation', { name: 'Hauptnavigation' })) {
      expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
    }
  });

  it('hat neben der Fläche ein geometrisches Merkmal', () => {
    /*
      `currentColor` und farblose Pfade machen den aktiven Zustand **nicht**
      ohne Farbe erkennbar: Zwei Flächen, die sich nur in der Farbe
      unterscheiden, sind in Graustufen zwei gleiche Flächen. Deshalb der
      Marker — ein Balken, also Geometrie.

      Er steht immer im Baum und wird über seinen Hintergrund sichtbar, nicht
      über seine Maße: Eine Breite, die sich ändert, wäre eine
      Layoutänderung.
    */
    const { container } = zeige({ aktiverPfad: '#/kurse' });
    const aktiv = container.querySelectorAll('[data-aktiv="ja"]');
    expect(aktiv.length).toBe(2);
    for (const eintrag of aktiv) {
      expect(eintrag.querySelector('[class*="__marker"]')).not.toBeNull();
    }
    // Auch die inaktiven tragen ihn — sonst änderte sich die Form beim Wechsel.
    expect(container.querySelectorAll('[class*="__marker"]').length).toBe(
      SCHREIBTISCH.length + TELEFON.length,
    );
  });
});

describe('Sprungziel, Kopf und Inhalt', () => {
  it('führt zum Hauptinhalt, und der ist programmatisch fokussierbar', () => {
    const { container } = zeige();
    const sprung = screen.getByRole('link', { name: 'Zum Inhalt springen' });
    expect(sprung.getAttribute('href')).toBe('#inhalt');

    const inhalt = container.querySelector('main#inhalt');
    expect(inhalt).not.toBeNull();
    expect(inhalt?.getAttribute('tabindex')).toBe('-1');
  });

  it('legt „Als Lernende ansehen" in den Kopf und nicht in die Navigation', () => {
    zeige({ kopfAktionen: <button type="button">Als Lernende ansehen</button> });
    const knopf = screen.getByRole('button', { name: 'Als Lernende ansehen' });
    expect(knopf.closest('header')).not.toBeNull();
    expect(knopf.closest('nav')).toBeNull();
  });

  it('stellt Konto und Abmelden unten in die Leiste', () => {
    zeige({
      fussZiele: [
        { pfad: '#/konto', label: 'Konto und Profil', zeichen: 'einstellungen' },
        { pfad: '#/abmelden', label: 'Abmelden', zeichen: 'start' },
      ],
    });
    const konto = screen.getByRole('link', { name: 'Konto und Profil' });
    // Unten in der Leiste, nicht in der Hauptnavigation.
    expect(konto.closest('nav')).toBeNull();
    expect(konto.closest('[class*="__fuss"]')).not.toBeNull();
  });
});

describe('die Zeichen tragen keinen Namen', () => {
  it('jedes SVG ist aria-hidden; der Name hängt am Link', () => {
    const { container } = zeige();
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
    for (const link of container.querySelectorAll('nav a')) {
      expect(link.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('der Tooltip ist für Hilfsmittel nicht da — er wiederholte nur das aria-label', () => {
    const { container } = zeige();
    for (const tipp of container.querySelectorAll('[class*="__tipp"]')) {
      expect(tipp.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('die Hülle ist reine Oberfläche', () => {
  const quelle = readFileSync(resolve(import.meta.dirname, 'Huelle.tsx'), 'utf8');
  const ohneKommentare = quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('kennt keine Anmeldung, keine Rolle, keine Cloud und keinen Router', () => {
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
      'NavLink',
      'useNavigate',
    ]) {
      expect(ohneKommentare, `Huelle.tsx greift auf ${verboten} zu`).not.toContain(verboten);
    }
  });

  it('kennt auch keinen Umsetzungszustand', () => {
    for (const verboten of ['vorhanden', 'weiterleitung', 'geplant', 'navigationsziele']) {
      expect(ohneKommentare, `"${verboten}" gehört nicht in die Hülle`).not.toContain(verboten);
    }
  });

  it('importiert nur Oberfläche', () => {
    const importe = [...ohneKommentare.matchAll(/from '([^']+)'/g)].map((t) => t[1]);
    expect(importe.sort()).toEqual(['./navigation', './navigationsZeichen', 'react']);
  });
});

describe('5B.2c ist additiv', () => {
  it('keine bestehende Hülle und keine Route bindet die Hülle ein', () => {
    /*
      Fällt dieser Test, ändert sich ein Bildschirm. Das ist 5B.2d und gehört
      in den Commit, der es beabsichtigt.
    */
    const wurzel = resolve(import.meta.dirname, '..');
    const dateien: string[] = [];
    const sammle = (ordner: string): void => {
      for (const eintrag of readdirSync(ordner)) {
        const pfad = join(ordner, eintrag);
        if (statSync(pfad).isDirectory()) sammle(pfad);
        else if (/\.tsx?$/.test(eintrag) && !eintrag.startsWith('Huelle')) dateien.push(pfad);
      }
    };
    sammle(wurzel);
    expect(dateien.length).toBeGreaterThan(50);

    const benutzer = dateien
      .filter((pfad) => /from '[^']*\/Huelle'|from '\.\/Huelle'/.test(readFileSync(pfad, 'utf8')))
      .map((pfad) => pfad.slice(wurzel.length + 1));
    expect(benutzer).toEqual([]);
  });

  it('AppShell, StudentShell und PortalShell sind unverändert', () => {
    const wurzel = resolve(import.meta.dirname, '..');
    for (const datei of ['ui/AppShell.tsx', 'portable/StudentShell.tsx', 'hosted/PortalShell.tsx']) {
      const quelle = readFileSync(resolve(wurzel, datei), 'utf8');
      expect(quelle, `${datei} benutzt die neue Hülle`).not.toMatch(/Huelle|huelle\.css/);
    }
  });
});
