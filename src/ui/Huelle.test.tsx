// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { Huelle, type Huellenaktion, type Navigationsziel } from './Huelle';

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
    /*
      Und ohne Ziele gar keine Navigation: Ein leeres `<nav>` mit Namen steht
      im Accessibility-Baum und verspricht etwas, das es nicht gibt — vor der
      Anmeldung gibt es nichts zu navigieren.
    */
    expect(screen.queryAllByRole('navigation', { name: 'Hauptnavigation' })).toHaveLength(0);
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
    zeige({ aktiverPfadSchreibtisch: '#/kurse', aktiverPfadTelefon: '#/kurse' });
    for (const nav of screen.getAllByRole('navigation', { name: 'Hauptnavigation' })) {
      expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    }
  });

  it('trägt keines, wenn kein übergebenes Ziel aktiv ist', () => {
    // Etwa auf einer Unterseite, die zu keinem Navigationsziel gehört.
    zeige({ aktiverPfadSchreibtisch: '#/einstellungen', aktiverPfadTelefon: '#/einstellungen' });
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
    const { container } = zeige({
      aktiverPfadSchreibtisch: '#/kurse',
      aktiverPfadTelefon: '#/kurse',
    });
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

describe('derselbe Ort, zwei Ziele', () => {
  /*
    Der Fall, für den es zwei Aktivwerte gibt: Auf `/ki` ist am Schreibtisch
    „KI-Zugang" aktiv, auf dem Telefon „Einstellungen" — dort gibt es das Ziel
    `#/ki` nicht. Mit einem gemeinsamen Wert wäre unten **gar nichts**
    markiert, und eine Navigation ohne Markierung sagt „du bist nirgends".
  */
  const LEHRKRAFT_LEISTE: Navigationsziel[] = [
    { pfad: '#/kurse', label: 'Kurse', zeichen: 'kurse' },
    { pfad: '#/pakete', label: 'Lernpakete', zeichen: 'pakete' },
    { pfad: '#/ki', label: 'KI-Zugang', zeichen: 'ki' },
    { pfad: '#/einstellungen', label: 'Einstellungen', zeichen: 'einstellungen' },
  ];
  const LEHRKRAFT_UNTEN = LEHRKRAFT_LEISTE.filter((ziel) => ziel.pfad !== '#/ki');

  function beide(schreibtisch: string, telefon: string) {
    return render(
      <Huelle
        zieleSchreibtisch={LEHRKRAFT_LEISTE}
        zieleTelefon={LEHRKRAFT_UNTEN}
        aktiverPfadSchreibtisch={schreibtisch}
        aktiverPfadTelefon={telefon}
        marke={<span>LexiFlow</span>}
        markePfad="#/"
      >
        <h1>Inhalt</h1>
      </Huelle>,
    );
  }

  /** Das Ziel mit `aria-current` in der Navigation an dieser Stelle. */
  function aktivesZiel(stelle: 0 | 1): string | null {
    const nav = screen.getAllByRole('navigation', { name: 'Hauptnavigation' })[stelle];
    const aktiv = nav?.querySelector('[aria-current="page"]');
    return aktiv?.getAttribute('aria-label') ?? null;
  }

  it('`/ki`: am Schreibtisch KI-Zugang, auf dem Telefon Einstellungen', () => {
    beide('#/ki', '#/einstellungen');
    expect(aktivesZiel(0)).toBe('KI-Zugang');
    expect(aktivesZiel(1)).toBe('Einstellungen');
  });

  it('`/verwaltung`: auf beiden Größen Einstellungen', () => {
    /*
      `#/verwaltung` ist kein Navigationsziel (E23). Aktiv ist der Ort, über
      den man hinkommt — die Einstellungen.
    */
    beide('#/einstellungen', '#/einstellungen');
    expect(aktivesZiel(0)).toBe('Einstellungen');
    expect(aktivesZiel(1)).toBe('Einstellungen');
  });

  it('`/material` und `/pakete`: auf beiden Größen Lernpakete', () => {
    beide('#/pakete', '#/pakete');
    expect(aktivesZiel(0)).toBe('Lernpakete');
    expect(aktivesZiel(1)).toBe('Lernpakete');
  });

  it('je Navigation genau eines — auch wenn die Werte verschieden sind', () => {
    beide('#/ki', '#/einstellungen');
    for (const nav of screen.getAllByRole('navigation', { name: 'Hauptnavigation' })) {
      expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    }
  });

  it('ein Wert, den die jeweilige Größe nicht kennt, markiert dort nichts', () => {
    // Statt irgendetwas zu markieren: `#/ki` gibt es unten nicht.
    beide('#/ki', '#/ki');
    expect(aktivesZiel(0)).toBe('KI-Zugang');
    expect(aktivesZiel(1)).toBeNull();
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
      fussZiele: [{ pfad: '#/konto', label: 'Konto und Profil', zeichen: 'einstellungen' }],
      fussAktionen: [{ label: 'Abmelden', zeichen: 'start', ausloesen: () => {} }],
    });
    const konto = screen.getByRole('link', { name: 'Konto und Profil' });
    // Unten in der Leiste, nicht in der Hauptnavigation.
    expect(konto.closest('nav')).toBeNull();
    expect(konto.closest('[class*="__fuss"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Abmelden' }).closest('[class*="__fuss"]')).not.toBeNull();
  });
});

describe('eine Handlung ist kein Navigationsziel', () => {
  /*
    Abmelden ist kein Ort. Als Navigationsziel gemodelt bräuchte es einen
    erfundenen `pfad` — und der stünde im `href`, landete beim Rechtsklick in
    „Link in neuem Tab öffnen", im Verlauf und in den Lesezeichen, und führte
    überall dorthin ins Leere.
  */
  const abmelden = (ausloesen = () => {}) => ({
    label: 'Abmelden',
    zeichen: 'start' as const,
    ausloesen,
  });

  it('wird als Knopf gerendert, nicht als Verweis', () => {
    zeige({ fussAktionen: [abmelden()] });
    const knopf = screen.getByRole('button', { name: 'Abmelden' });
    expect(knopf.tagName).toBe('BUTTON');
    // `type="button"`: Ohne sie wäre es in einem Formular ein Absendeknopf.
    expect(knopf.getAttribute('type')).toBe('button');
    expect(screen.queryByRole('link', { name: 'Abmelden' })).toBeNull();
  });

  it('trägt keine Adresse — auch keine erfundene', () => {
    const { container } = zeige({ fussAktionen: [abmelden()] });
    const knopf = screen.getByRole('button', { name: 'Abmelden' });
    expect(knopf.getAttribute('href')).toBeNull();
    for (const verweis of container.querySelectorAll('a')) {
      expect(verweis.getAttribute('href')).not.toMatch(/abmelden/i);
    }
  });

  it('bekommt nie `aria-current` — eine Handlung ist keine Seite', () => {
    /*
      Auch dann nicht, wenn die Adresse zufällig so hieße: Die Hülle vergibt
      `aria-current` ausschließlich an Navigationsziele.
    */
    zeige({ aktiverPfadSchreibtisch: 'Abmelden', aktiverPfadTelefon: 'Abmelden', fussAktionen: [abmelden()] });
    expect(screen.getByRole('button', { name: 'Abmelden' })).not.toHaveAttribute('aria-current');
  });

  it('löst mit Eingabe- und Leertaste aus', async () => {
    /*
      Das kann ein `button` von sich aus — und genau deshalb ist er hier
      richtig. Ein `div` mit `onClick` müsste beides von Hand nachbauen, und
      die Leertaste wird dabei regelmäßig vergessen.
    */
    const { userEvent } = await import('@testing-library/user-event');
    const nutzer = userEvent.setup();
    let gezaehlt = 0;
    zeige({ fussAktionen: [abmelden(() => { gezaehlt += 1; })] });

    const knopf = screen.getByRole('button', { name: 'Abmelden' });
    knopf.focus();
    await nutzer.keyboard('{Enter}');
    expect(gezaehlt, 'Eingabetaste löst nicht aus').toBe(1);
    await nutzer.keyboard(' ');
    expect(gezaehlt, 'Leertaste löst nicht aus').toBe(2);
  });

  it('ruft zurück, statt selbst etwas zu entscheiden', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const nutzer = userEvent.setup();
    let gerufen = false;
    zeige({ fussAktionen: [abmelden(() => { gerufen = true; })] });
    await nutzer.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(gerufen).toBe(true);
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

describe('die Trennung hält auch im Typ und im Quelltext', () => {
  /*
    Ohne Kommentare gelesen: Die Datei *erklärt*, warum eine Handlung kein
    `aria-current` bekommt — diese Erklärung mitzuzählen hieße, sie zu
    verbieten.
  */
  const quelle = readFileSync(resolve(import.meta.dirname, 'Huelle.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');

  it('eine Handlung hat keinen Pfad, und ein Ziel keinen Rückruf', () => {
    /*
      Der Typ ist die erste Verteidigung: Wer „Abmelden" wieder als Verweis
      modellieren will, müsste dafür einen `pfad` erfinden — und bekommt ihn
      nicht angenommen.
    */
    // @ts-expect-error — eine Handlung kennt keinen `pfad`.
    const mitPfad: Huellenaktion = { label: 'Abmelden', zeichen: 'start', pfad: '#/abmelden', ausloesen: () => {} };
    // @ts-expect-error — ein Navigationsziel kennt kein `ausloesen`.
    const mitRueckruf: Navigationsziel = { pfad: '#/x', label: 'X', zeichen: 'start', ausloesen: () => {} };
    // @ts-expect-error — eine Handlung ohne `ausloesen` tut nichts.
    const ohneRueckruf: Huellenaktion = { label: 'Abmelden', zeichen: 'start' };
    void mitPfad;
    void mitRueckruf;
    void ohneRueckruf;
    expect(true).toBe(true);
  });

  it('die Handlung wird als Knopf gebaut, nicht als Verweis', () => {
    /*
      Am Quelltext, nicht nur am gerenderten Baum: Eine zweite Stelle, die
      eine Handlung doch als `<a href>` ausgibt, fiele einem Test auf, der nur
      die eine Handlung prüft, die er selbst übergibt.
    */
    const anfang = quelle.indexOf('function Aktion(');
    expect(anfang, 'die Handlung hat keine eigene Komponente mehr').toBeGreaterThanOrEqual(0);
    const rumpf = quelle.slice(anfang, quelle.indexOf('\nexport function Huelle', anfang));

    expect(rumpf).toContain('<button');
    expect(rumpf, 'eine Handlung wird als Verweis gerendert').not.toMatch(/<a[\s>]/);
    expect(rumpf, 'eine Handlung bekommt eine Adresse').not.toContain('href');
    expect(rumpf, 'eine Handlung bekommt aria-current').not.toContain('aria-current');
  });

  it('`aria-current` steht ausschließlich an Navigationszielen', () => {
    const stellen = [...quelle.matchAll(/aria-current/g)].length;
    const imEintrag = quelle.slice(quelle.indexOf('function Eintrag('), quelle.indexOf('function Aktion('));
    expect(stellen, 'aria-current steht mehr als einmal im Quelltext').toBe(1);
    expect(imEintrag).toContain('aria-current');
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

describe('die Hülle ist seit 5B.2d in Benutzung — und nur dort', () => {
  const wurzel = resolve(import.meta.dirname, '..');

  function quelldateien(): string[] {
    const gefunden: string[] = [];
    const sammle = (ordner: string): void => {
      for (const eintrag of readdirSync(ordner)) {
        const pfad = join(ordner, eintrag);
        if (statSync(pfad).isDirectory()) sammle(pfad);
        else if (/\.tsx?$/.test(eintrag) && !eintrag.startsWith('Huelle')) gefunden.push(pfad);
      }
    };
    sammle(wurzel);
    return gefunden;
  }

  it('genau eine Datei bindet sie ein: der Portaladapter', () => {
    /*
      Nicht „irgendwer benutzt sie": genau einer. Zwei Einbinder wären zwei
      Orte, an denen Rolle und Navigation zusammengesetzt werden — und der
      zweite liefe auseinander.
    */
    const dateien = quelldateien();
    expect(dateien.length).toBeGreaterThan(50);

    const benutzer = dateien
      .filter((pfad) => /from '[^']*\/Huelle'|from '\.\/Huelle'/.test(readFileSync(pfad, 'utf8')))
      .map((pfad) => pfad.slice(wurzel.length + 1));
    expect(benutzer).toEqual(['hosted/PortalShell.tsx']);
  });

  it('AppShell und StudentShell bleiben unangetastet', () => {
    /*
      Die portablen Auslieferungen ändern sich in 5B.2 um kein Byte. Eine
      weitergegebene Datei kann niemand nachträglich reparieren.
    */
    for (const datei of ['ui/AppShell.tsx', 'portable/StudentShell.tsx']) {
      const quelle = readFileSync(resolve(wurzel, datei), 'utf8');
      expect(quelle, `${datei} benutzt die neue Hülle`).not.toMatch(/Huelle|huelle\.css/);
    }
  });
});
