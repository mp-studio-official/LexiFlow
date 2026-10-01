// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RepositoryProvider } from '../application/RepositoryContext';
import { createFakeCloud } from '../application/fakeCloudRepositories';
import { HostedRoutes } from './HostedApp';
import { SessionProvider } from './SessionContext';

/**
 * Was der Hüllenwechsel **nicht** weggenommen haben darf.
 *
 * ## Warum diese Datei existiert
 *
 * Ein Hüllenwechsel entfernt Zugangswege — das ist seine Wirkung, nicht sein
 * Risiko. Vier Navigationspunkte sind verschwunden („Beitreten", „Daten",
 * „Lernen" bei Lehrkräften, „Verwaltung"), und jeder von ihnen war für
 * irgendjemanden der einzige Weg irgendwohin.
 *
 * „Ist noch da" ist keine Beobachtung, sondern eine Behauptung, solange
 * niemand nachgesehen hat. Hier wird nachgesehen — am echten Router, an dem,
 * was gerendert wird.
 */

afterEach(cleanup);

const LANDUNG = 'LexiFlow';

function oeffne(route: string, userId?: string) {
  const cloud = createFakeCloud();
  if (userId) cloud.signInAs(userId);
  render(
    <RepositoryProvider value={cloud.repositories} mode="hosted">
      <SessionProvider>
        <MemoryRouter initialEntries={[route]}>
          <HostedRoutes />
        </MemoryRouter>
      </SessionProvider>
    </RepositoryProvider>,
  );
  return cloud;
}

/** Die Verweisziele aller Hauptnavigationen im Baum. */
function navigationsziele(): string[] {
  return screen
    .queryAllByRole('navigation', { name: 'Hauptnavigation' })
    .flatMap((nav) => [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? ''));
}

describe('Lernende behalten ihre Wege', () => {
  it('„Mit Code beitreten" steht im Lernbereich und führt zu /beitreten', async () => {
    /*
      Vorher war „Beitreten" ein Navigationspunkt. E23 kennt ihn nicht — der
      Weg liegt seitdem **innerhalb** von `/lernen`, und das war er auch
      vorher schon. Geprüft wird nicht, dass es ihn gibt, sondern dass man
      ihn von dort aus findet.
    */
    oeffne('/lernen', 'u-lernend');
    const verweis = await screen.findByRole('link', { name: 'Mit Code beitreten' });
    expect(verweis.getAttribute('href')).toBe('/beitreten');
  });

  it('und dieser Weg erreicht wirklich die Beitrittsseite', async () => {
    oeffne('/beitreten', 'u-lernend');
    expect(await screen.findByRole('heading', { name: 'Mit Code beitreten' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: LANDUNG, level: 1 })).toBeNull();
  });

  it('der Lernbereich selbst bleibt erreichbar', async () => {
    oeffne('/lernen', 'u-lernend');
    expect(await screen.findByRole('heading', { name: 'Deine Kurse' })).toBeInTheDocument();
  });

  it('Datenschutz steht in der Fußzeile', async () => {
    oeffne('/lernen', 'u-lernend');
    await screen.findByRole('heading', { name: 'Deine Kurse' });
    const fuss = document.querySelector('footer');
    expect(fuss, 'keine Fußzeile').not.toBeNull();
    expect(within(fuss as HTMLElement).getByRole('link', { name: 'Datenschutz' })).toHaveAttribute(
      'href',
      '/datenschutz',
    );
  });

  it('Abmelden ist eine Handlung, kein Verweis', async () => {
    oeffne('/lernen', 'u-lernend');
    const knopf = await screen.findByRole('button', { name: 'Abmelden' });
    expect(knopf.tagName).toBe('BUTTON');
    expect(screen.queryByRole('link', { name: 'Abmelden' })).toBeNull();
  });
});

describe('Lehrkräfte behalten ihre Wege', () => {
  it('„Als Lernende ansehen" steht im Kopf und führt zu /lernen', async () => {
    /*
      Vorher war das ein Navigationspunkt „Lernen". E23 kennt ihn für
      Lehrkräfte nicht mehr; ohne diesen Verweis wäre der Weg in den
      Lernbereich für Lehrkräfte verschwunden.
    */
    oeffne('/kurse', 'u-lehrerin');
    const verweis = await screen.findByRole('link', { name: 'Als Lernende ansehen' });
    expect(verweis.getAttribute('href')).toBe('/lernen');
    expect(verweis.closest('header'), 'nicht im Kopfbereich').not.toBeNull();
    expect(verweis.closest('nav'), 'steht in der Navigation').toBeNull();
  });

  it('und eine Lehrkraft kommt darüber in den Lernbereich', async () => {
    oeffne('/lernen', 'u-lehrerin');
    expect(await screen.findByRole('heading', { name: 'Deine Kurse' })).toBeInTheDocument();
  });

  it('Kurse, Lernpakete, KI-Zugang und Einstellungen stehen in der Navigation', async () => {
    oeffne('/kurse', 'u-lehrerin');
    await screen.findByRole('heading', { name: 'Kurse', level: 1 });
    const ziele = navigationsziele();
    for (const ziel of ['#/kurse', '#/pakete', '#/ki', '#/einstellungen']) {
      expect(ziele, `${ziel} fehlt`).toContain(ziel);
    }
  });

  it('Datenschutz steht in der Fußzeile und in den Einstellungen', async () => {
    oeffne('/kurse', 'u-lehrerin');
    await screen.findByRole('heading', { name: 'Kurse', level: 1 });
    const fuss = document.querySelector('footer');
    expect(within(fuss as HTMLElement).getByRole('link', { name: 'Datenschutz' })).toBeInTheDocument();

    cleanup();
    oeffne('/einstellungen', 'u-lehrerin');
    expect(await screen.findByRole('link', { name: /Datenschutz öffnen/ })).toBeInTheDocument();
  });

  it('Abmelden ist eine Handlung', async () => {
    oeffne('/kurse', 'u-lehrerin');
    expect(await screen.findByRole('button', { name: 'Abmelden' })).toBeInTheDocument();
  });
});

describe('die Verwaltung behält genau einen Weg', () => {
  it('`#/verwaltung` steht in keiner Navigation', async () => {
    oeffne('/verwaltung', 'u-verwaltung');
    await screen.findByRole('heading', { name: 'Verwaltung', level: 1 });
    expect(navigationsziele()).not.toContain('#/verwaltung');
    expect(navigationsziele()).not.toContain('/verwaltung');
  });

  it('auf /verwaltung ist „Einstellungen" aktiv', async () => {
    /*
      Die Verwaltung ist kein Ziel — markiert wird der Ort, über den man
      hinkommt. Ohne das stünde eine Verwaltung auf ihrer eigenen Seite vor
      einer Navigation, die behauptet, sie sei nirgends.
    */
    oeffne('/verwaltung', 'u-verwaltung');
    await screen.findByRole('heading', { name: 'Verwaltung', level: 1 });
    for (const nav of screen.getAllByRole('navigation', { name: 'Hauptnavigation' })) {
      const aktiv = nav.querySelector('[aria-current="page"]');
      expect(aktiv?.getAttribute('aria-label')).toBe('Einstellungen');
    }
  });

  it('der einzige reguläre Einstieg liegt in den Einstellungen und erreicht sie', async () => {
    oeffne('/einstellungen', 'u-verwaltung');
    const verweis = await screen.findByRole('link', { name: 'Konten und Rollen verwalten' });
    const { userEvent } = await import('@testing-library/user-event');
    await userEvent.setup().click(verweis);
    expect(await screen.findByRole('heading', { name: 'Verwaltung', level: 1 })).toBeInTheDocument();
  });
});

describe('der öffentliche Bereich bleibt öffentlich', () => {
  it('hat keine Bereichsnavigation', async () => {
    /*
      Nicht „eine leere Navigation": gar keine. Ein leeres `<nav>` mit Namen
      steht im Accessibility-Baum und verspricht etwas, das es nicht gibt.
    */
    oeffne('/');
    await screen.findByRole('heading', { name: LANDUNG, level: 1 });
    expect(screen.queryAllByRole('navigation', { name: 'Hauptnavigation' })).toHaveLength(0);
  });

  it('Anmeldung, Beitritt und Wiederherstellung bleiben erreichbar', async () => {
    for (const [route, ueberschrift] of [
      ['/anmelden', 'Anmelden'],
      ['/beitreten', 'Mit Code beitreten'],
      ['/wiederherstellen', 'Kennwort vergessen'],
    ] as const) {
      cleanup();
      oeffne(route);
      expect(
        await screen.findByRole('heading', { name: ueberschrift }),
        `${route} nicht erreichbar`,
      ).toBeInTheDocument();
    }
  });

  it('„LexiFlow ohne Konto" und Datenschutz stehen in der Fußzeile', async () => {
    oeffne('/');
    await screen.findByRole('heading', { name: LANDUNG, level: 1 });
    const fuss = document.querySelector('footer');
    expect(fuss).not.toBeNull();
    const darin = within(fuss as HTMLElement);
    expect(darin.getByRole('link', { name: 'LexiFlow ohne Konto' })).toBeInTheDocument();
    expect(darin.getByRole('link', { name: 'Datenschutz' })).toBeInTheDocument();
  });

  it('Marke und Sprungziel funktionieren', async () => {
    oeffne('/');
    await screen.findByRole('heading', { name: LANDUNG, level: 1 });
    expect(screen.getByRole('link', { name: 'LexiFlow – Startseite' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: 'Zum Inhalt springen' })).toHaveAttribute(
      'href',
      '#inhalt',
    );
  });
});

describe('die Marke führt zum Rollenstart', () => {
  /*
    Nicht blind auf die Landungsseite: Wer angemeldet ist, landete dort auf
    einer Seite, die ihm erklärt, dass es LexiFlow gibt — und müsste sich
    zurückklicken. Der Rollenstart kommt aus `HOME_PER_ROLE`, derselben
    Quelle, die auch die Anmeldung benutzt.
  */
  it.each([
    ['u-lernend', '/lernen'],
    ['u-lehrerin', '/kurse'],
    ['u-verwaltung', '/verwaltung'],
  ])('%s → %s', async (konto, ziel) => {
    oeffne(ziel === '/verwaltung' ? '/verwaltung' : '/lernen', konto);
    const marken = await screen.findAllByRole('link', { name: 'LexiFlow – Startseite' });
    for (const marke of marken) expect(marke.getAttribute('href')).toBe(ziel);
  });
});

describe('dieselbe Route, zwei Größen, zwei aktive Ziele', () => {
  /*
    Die Zuordnung Route → aktives Ziel liegt im Hosted-Adapter, nicht in der
    Hülle. Geprüft wird sie deshalb hier, am echten Router und an dem, was
    gerendert wird — nicht an `aktivesZiel` allein, denn eine Zuordnung, die
    auf ein Ziel zeigt, das auf dieser Größe gar nicht steht, ist in der
    Funktion richtig und auf dem Bildschirm falsch.

    In jsdom gibt es keinen Haltepunkt; beide Navigationen stehen im Baum.
    Genau das macht den Vergleich möglich: Die Leiste ist die des
    Schreibtischs, die untere die des Telefons.
  */
  function markiert(wahl: string): string | null {
    const leiste = document.querySelector(wahl);
    expect(leiste, `${wahl} fehlt`).not.toBeNull();
    return (
      (leiste as HTMLElement).querySelector('[aria-current="page"]')?.getAttribute('aria-label') ??
      null
    );
  }

  it.each([
    ['/kurse', 'u-lehrerin', 'Kurse', 'Kurse'],
    ['/ki', 'u-lehrerin', 'KI-Zugang', 'Einstellungen'],
    ['/einstellungen', 'u-lehrerin', 'Einstellungen', 'Einstellungen'],
    ['/verwaltung', 'u-verwaltung', 'Einstellungen', 'Einstellungen'],
    ['/material', 'u-lehrerin', 'Lernpakete', 'Lernpakete'],
    ['/pakete', 'u-lehrerin', 'Lernpakete', 'Lernpakete'],
    ['/lernen', 'u-lernend', 'Lernen', 'Lernen'],
  ])('%s (%s) → Schreibtisch %s · Telefon %s', async (route, konto, amTisch, amTelefon) => {
    oeffne(route, konto);
    await screen.findAllByRole('navigation', { name: 'Hauptnavigation' });
    expect(markiert('.huelle-leiste'), 'Schreibtisch').toBe(amTisch);
    expect(markiert('.huelle-unten'), 'Telefon').toBe(amTelefon);
  });

  it('und je sichtbarer Navigation steht genau eine Markierung', async () => {
    oeffne('/ki', 'u-lehrerin');
    await screen.findAllByRole('navigation', { name: 'Hauptnavigation' });
    for (const wahl of ['.huelle-leiste', '.huelle-unten']) {
      const anzahl = document.querySelectorAll(`${wahl} [aria-current="page"]`).length;
      expect(anzahl, `${wahl}: ${anzahl} Markierungen`).toBe(1);
    }
  });
});

describe('die Bündeltrennung bleibt', () => {
  it('der Lernendenadapter zieht keinen Lehrkraftcode herein', () => {
    /*
      Die Hülle ist für beide Rollen dieselbe — der Code-Split hängt deshalb
      nicht mehr an zwei Hüllen, sondern weiterhin an den lazy geladenen
      Bereichen. Dass `PortalShell` selbst nichts aus `teacher/` importiert,
      ist die Bedingung dafür.
    */
    const quelle = readFileSync(resolve(import.meta.dirname, 'PortalShell.tsx'), 'utf8');
    expect(quelle).not.toMatch(/from '\.\/teacher\//);
    expect(quelle).not.toMatch(/from '\.\/learner\//);
  });
});
