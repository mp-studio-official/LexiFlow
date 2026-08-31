import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';

/**
 * Sprint 3A: Die App-Shell. Zwei Navigationen mit demselben Inhalt – auf
 * breiten Fenstern die Seitenspalte, auf schmalen die Leiste unten. Beide
 * müssen dieselbe Route als aktuell melden.
 */

function setup(route = '/') {
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<h1>Startseite</h1>} />
          <Route path="/lernen" element={<h1>Lernen</h1>} />
          <Route path="/material" element={<h1>Material</h1>} />
          <Route path="/datenschutz" element={<h1>Datenschutz</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

function sidebar(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Hauptnavigation' });
}

function bottomBar(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Bereichsnavigation' });
}

describe('Aufbau', () => {
  it('nennt Marke und die drei Kernbereiche', () => {
    setup();

    expect(screen.getByRole('link', { name: /LexiFlow/ })).toHaveAttribute('href', '/');
    for (const nav of [sidebar(), bottomBar()]) {
      expect(within(nav).getByRole('link', { name: 'Lernen' })).toHaveAttribute('href', '/lernen');
      expect(within(nav).getByRole('link', { name: 'Erstellen' })).toHaveAttribute(
        'href',
        '/material',
      );
      expect(within(nav).getByRole('link', { name: 'Daten' })).toHaveAttribute(
        'href',
        '/datenschutz',
      );
    }
  });

  it('behält Skip-Link und Landmarken', () => {
    setup();

    const skip = screen.getByRole('link', { name: 'Zum Inhalt springen' });
    expect(skip).toHaveAttribute('href', '#inhalt');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'inhalt');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('behält die Datenschutzzusagen in der Fußzeile', () => {
    setup();
    const footer = screen.getByRole('contentinfo');

    expect(
      within(footer).getByText(/Alle Lernstände bleiben auf diesem Gerät/),
    ).toBeInTheDocument();
    expect(
      within(footer).getByText(/Keine Konten, keine Auswertung durch Lehrkräfte, keine Werbung/),
    ).toBeInTheDocument();
  });

  it('unterscheidet die beiden Navigationen für Screenreader', () => {
    setup();
    // Zwei Landmarken mit demselben Inhalt brauchen unterschiedliche Namen.
    expect(screen.getAllByRole('navigation')).toHaveLength(2);
    expect(sidebar()).not.toBe(bottomBar());
  });
});

describe('Aktuelle Route', () => {
  it('markiert die geöffnete Route in beiden Navigationen', () => {
    setup('/material');

    for (const nav of [sidebar(), bottomBar()]) {
      expect(within(nav).getByRole('link', { name: 'Erstellen' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(within(nav).getByRole('link', { name: 'Lernen' })).not.toHaveAttribute('aria-current');
      expect(within(nav).getByRole('link', { name: 'Daten' })).not.toHaveAttribute('aria-current');
    }
  });

  it('markiert auf der Startseite keinen der drei Bereiche', () => {
    setup('/');

    for (const label of ['Lernen', 'Erstellen', 'Daten']) {
      expect(within(sidebar()).getByRole('link', { name: label })).not.toHaveAttribute(
        'aria-current',
      );
    }
  });

  it('zieht die Markierung beim Wechsel mit', async () => {
    const user = setup('/lernen');
    expect(within(sidebar()).getByRole('link', { name: 'Lernen' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(within(sidebar()).getByRole('link', { name: 'Daten' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Datenschutz' })).toBeInTheDocument();
    expect(within(sidebar()).getByRole('link', { name: 'Daten' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(sidebar()).getByRole('link', { name: 'Lernen' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('ist mit der Tastatur bedienbar', async () => {
    const user = setup('/');
    const target = within(sidebar()).getByRole('link', { name: 'Erstellen' });

    target.focus();
    expect(target).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('heading', { level: 1, name: 'Material' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sprint 3B.1c: Kein Kontrastfehler zwischen zwei Navigationszuständen
// ---------------------------------------------------------------------------

/** Der Regelkörper zu einem Selektor – genau eine Ebene tief, ohne Parser. */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `Regel „${selector}“ nicht gefunden`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  return css.slice(start, end);
}

describe('Navigationszustände wechseln ohne Zwischenbild', () => {
  const css = readFileSync(resolve(__dirname, '../styles/global.css'), 'utf8');

  it('animiert den Hintergrund der Seitennavigation nicht', () => {
    // Aktiv: heller Text auf dunklem Grund. Inaktiv: dunkler Text auf hellem.
    // Ein animierter Hintergrund ließe beim Routenwechsel für ein paar Frames
    // dunklen Text auf dunklem Grund stehen – ein echter Kontrastfehler.
    expect(ruleBody(css, '.app-nav__link')).not.toContain('transition');
  });

  it('setzt im aktiven Zustand Hintergrund und Textfarbe gemeinsam', () => {
    const active = ruleBody(css, ".app-nav__link[aria-current='page']");
    expect(active).toContain('background:');
    expect(active).toContain('color:');
  });

  it('lässt die untere Leiste den Hintergrund gar nicht erst wechseln', () => {
    const active = ruleBody(css, ".bottom-nav__link[aria-current='page']");
    expect(active).not.toContain('background');
    expect(ruleBody(css, '.bottom-nav__link')).not.toContain('transition');
  });
});
