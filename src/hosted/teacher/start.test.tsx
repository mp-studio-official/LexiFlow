// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RepositoryProvider } from '../../application/RepositoryContext';
import { createFakeCloud } from '../../application/fakeCloudRepositories';
import { makePack } from '../../test/fixtures';
import { HostedRoutes } from '../HostedApp';
import { SessionProvider } from '../SessionContext';

/**
 * Der Start der Lehrkraft (5B.3) — am echten Router.
 *
 * ## Die eine Prüfung, die wichtiger ist als alle anderen
 *
 * Dass diese Seite den Lernstand **nicht anfragt**. Nicht „nicht anzeigt" —
 * nicht anfragt. Eine Seite, die ihn lädt und verschweigt, hat ihn erhoben;
 * die Zusage von LexiFlow ist die andere.
 *
 * Geprüft wird das zweimal: am Quelltext (kein Import, kein `progress`) und am
 * laufenden Bild (ein Speicher mit Spionen, die nie gerufen werden).
 *
 * ## Warum nichts hier die Wildcard für einen Erfolg hält
 *
 * `<Route path="*">` schickt jede tote Adresse auf die Landungsseite. Ein
 * Test, der nur „irgendetwas wurde gerendert" prüft, bleibt deshalb grün,
 * wenn die Route fehlt. Jede Erreichbarkeitsprüfung sieht deshalb die
 * Überschrift der Zielseite **und** das Ausbleiben der Landungsseite.
 */

afterEach(cleanup);

const LANDUNG = 'LexiFlow';

function oeffne(route: string, userId?: string, cloud = createFakeCloud()) {
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

/** Ein Konto mit einem Kurs und einem Paket — über die Verträge, nicht am Zustand vorbei. */
async function mitInhalt() {
  const cloud = createFakeCloud();
  cloud.signInAs('u-lehrerin');
  const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
  const paket = makePack();
  await cloud.repositories.packs!.saveDraft({
    ...paket,
    meta: { ...paket.meta, title: 'Unit 1' },
  });
  return { cloud, kurs };
}

describe('die Route /start gibt es wirklich', () => {
  it('eine Lehrkraft sieht den Start, nicht die Landungsseite', async () => {
    oeffne('/start', 'u-lehrerin');
    expect(await screen.findByRole('heading', { name: 'Start', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: LANDUNG, level: 1 })).toBeNull();
  });

  it('eine Verwaltung auch — `admin` ist nicht enger als `teacher`', async () => {
    oeffne('/start', 'u-verwaltung');
    expect(await screen.findByRole('heading', { name: 'Start', level: 1 })).toBeInTheDocument();
  });

  it('Lernende kommen nicht hinein', async () => {
    oeffne('/start', 'u-lernend');
    expect(await screen.findByText(/nicht für dieses Konto/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Start', level: 1 })).toBeNull();
  });

  it('wer nicht angemeldet ist, landet bei der Anmeldung — nicht auf der Landungsseite', async () => {
    oeffne('/start');
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: LANDUNG, level: 1 })).toBeNull();
  });

  it('auf /start ist „Start" in beiden Größen aktiv', async () => {
    oeffne('/start', 'u-lehrerin');
    await screen.findByRole('heading', { name: 'Start', level: 1 });
    for (const wahl of ['.huelle-leiste', '.huelle-unten']) {
      const nav = document.querySelector(wahl);
      expect(nav, `${wahl} fehlt`).not.toBeNull();
      expect(
        (nav as HTMLElement).querySelector('[aria-current="page"]')?.getAttribute('aria-label'),
      ).toBe('Start');
    }
  });
});

describe('der Start zeigt, was es gibt', () => {
  it('ein leeres Konto bekommt Erklärungen und erste Schritte, keine leeren Kästen', async () => {
    oeffne('/start', 'u-lehrerin');
    await screen.findByRole('heading', { name: 'Start', level: 1 });

    expect(await screen.findByRole('heading', { name: 'Noch kein Kurs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ersten Kurs anlegen' })).toHaveAttribute(
      'href',
      '/kurse',
    );
    expect(screen.getByRole('heading', { name: 'Noch kein Lernpaket' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lernpaket erstellen' })).toHaveAttribute(
      'href',
      '/material',
    );

    /* Kein Kasten für etwas, das es nicht gibt. */
    expect(screen.queryByRole('heading', { name: 'Offene Stellen' })).toBeNull();
  });

  it('mit Kurs und Paket stehen Mitgliederzahl und Paketstand da', async () => {
    const { cloud, kurs } = await mitInhalt();
    oeffne('/start', undefined, cloud);

    const kursverweis = await screen.findByRole('link', { name: 'Englisch 7b' });
    expect(kursverweis).toHaveAttribute('href', `/kurse/${kurs.id}`);
    /* Die Lehrkraft selbst ist Mitglied ihres Kurses — eine Zahl, kein Lernstand. */
    expect(kursverweis.parentElement?.textContent).toMatch(/Mitglied/);
    expect(screen.getByText(/1 Lernpaket/)).toBeInTheDocument();
  });

  it('ein unveröffentlichtes Paket ist eine offene Stelle — und keine Rückfrage', async () => {
    const { cloud } = await mitInhalt();
    oeffne('/start', undefined, cloud);

    const kasten = (await screen.findByRole('heading', { name: 'Offene Stellen' })).closest(
      'div',
    ) as HTMLElement;
    expect(within(kasten).getByText(/Noch nicht veröffentlicht/)).toBeInTheDocument();
    expect(within(kasten).getByText(/Keine Rückfragen von Lernenden/)).toBeInTheDocument();
  });

  it('fehlender KI-Zugang ist neutral, kein Fehler', async () => {
    oeffne('/start', 'u-lehrerin');
    await screen.findByRole('heading', { name: 'Start', level: 1 });
    const hinweis = await screen.findByText(/LexiFlow funktioniert auch ohne/);
    expect(hinweis).toBeInTheDocument();
    /* Kein `role="alert"`, keine Fehlergestalt. */
    expect(hinweis.closest('[role="alert"]')).toBeNull();
    expect(hinweis.closest('[data-testid="error-state"]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Einstellungen öffnen' })).toHaveAttribute(
      'href',
      '/einstellungen',
    );
  });

  it('jede Handlung führt zu einer Adresse, die es gibt', async () => {
    const { cloud } = await mitInhalt();
    oeffne('/start', undefined, cloud);
    /*
      Auf den Inhalt warten, nicht auf die Überschrift: Die steht schon
      während des Ladens da, und eine Prüfung über „alle Verweise" wäre dann
      eine über null Verweise — grün, weil nichts da war.
    */
    await screen.findByRole('link', { name: 'Englisch 7b' });

    const inhalt = document.querySelector('main.huelle__inhalt') as HTMLElement;
    const ziele = [...inhalt.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(ziele.length).toBeGreaterThan(0);
    const ERLAUBT = [/^\/kurse$/, /^\/kurse\/[^/]+$/, /^\/material$/, /^\/einstellungen$/];
    for (const ziel of ziele) {
      expect(
        ERLAUBT.some((muster) => muster.test(ziel)),
        `${ziel} ist kein Ziel, das es gibt`,
      ).toBe(true);
    }
  });

  it('bricht das Laden ab, erklärt der Start es und bietet einen zweiten Versuch', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    const echt = cloud.repositories.courses!.myCourses.bind(cloud.repositories.courses);
    let erster = true;
    cloud.repositories.courses!.myCourses = async () => {
      if (erster) {
        erster = false;
        throw new Error('Netz weg');
      }
      return echt();
    };

    oeffne('/start', undefined, cloud);
    const fehler = await screen.findByTestId('error-state');
    expect(fehler).toBeInTheDocument();

    await userEvent.setup().click(within(fehler).getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('heading', { name: 'Noch kein Kurs' })).toBeInTheDocument();
  });
});

describe('kein Kasten für etwas, das es nicht gibt', () => {
  /*
    Die Versuchung bei einem Dashboard ist die leere Kachel: „Geplante
    Veröffentlichungen — keine". Sie sieht nach Funktion aus, ist aber eine
    Ankündigung ohne Datum. Es gibt kein `publish_at`; also gibt es sie nicht,
    also steht sie auch nicht leer da.
  */
  it('keine Andeutung einer zeitgesteuerten Veröffentlichung', () => {
    /* Ohne Kommentare: Die Datei *erklärt* im Kopf, warum es sie nicht gibt. */
    const quelle = readFileSync(resolve(import.meta.dirname, 'StartPage.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(quelle).not.toMatch(/publish_at|publishAt|geplante? Veröffentlichung|Zeitplan|terminiert/i);
  });

  it('jeder Abschnitt trägt Inhalt, nicht nur eine Überschrift', async () => {
    const { cloud } = await mitInhalt();
    oeffne('/start', undefined, cloud);
    await screen.findByRole('link', { name: 'Englisch 7b' });

    const inhalt = document.querySelector('main.huelle__inhalt') as HTMLElement;
    const abschnitte = [...inhalt.querySelectorAll('h2')];
    expect(abschnitte.length, 'gar keine Abschnitte').toBeGreaterThan(0);
    for (const ueberschrift of abschnitte) {
      const kasten = ueberschrift.parentElement as HTMLElement;
      const inhaltlich = [...kasten.querySelectorAll('a, li, p')].filter(
        (el) => (el.textContent ?? '').trim().length > 0,
      );
      expect(
        inhaltlich.length,
        `„${ueberschrift.textContent}" ist ein leerer Kasten`,
      ).toBeGreaterThan(0);
    }
  });

  it('die Tastatur erreicht alles in der Reihenfolge des Bildes', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const { cloud } = await mitInhalt();
    oeffne('/start', undefined, cloud);
    await screen.findByRole('link', { name: 'Englisch 7b' });

    const inhalt = document.querySelector('main.huelle__inhalt') as HTMLElement;
    const erwartet = [...inhalt.querySelectorAll('a')].map((a) => a.textContent?.trim());

    const nutzer = userEvent.setup();
    (inhalt.querySelector('a') as HTMLElement).focus();
    const gesehen = [document.activeElement?.textContent?.trim()];
    for (let schritt = 1; schritt < erwartet.length; schritt += 1) {
      await nutzer.tab();
      gesehen.push(document.activeElement?.textContent?.trim());
    }
    expect(gesehen).toEqual(erwartet);
  });

  it('der Ladezustand sagt Hilfsmitteln höflich Bescheid', async () => {
    oeffne('/start', 'u-lehrerin');
    /*
      Vor den Daten: ein Platzhalter mit einem Satz in einem höflichen
      Live-Bereich — nicht ein `alert`, denn Laden ist keine Unterbrechung.
    */
    const laedt = await screen.findByRole('status');
    expect(laedt).toHaveTextContent(/geladen/i);
  });
});

describe('der Start fragt den Lernstand nicht an', () => {
  it('im Quelltext steht kein Weg dorthin', () => {
    const quelle = readFileSync(resolve(import.meta.dirname, 'StartPage.tsx'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(quelle, 'der Lernstandspeicher wird angefragt').not.toContain("'progress'");
    expect(quelle).not.toMatch(
      /\bmyPackProgress\b|\bmyEntryProgress\b|\brecordEvents\b|\bbeginSession\b|\bresetMyProgress\b|\bEntryProgress\b|\bEntryState\b|\bPackProgress\b/,
    );
    /* Auch nicht aggregiert: keine Quote, keine Zeit, keine Rangliste. */
    expect(quelle).not.toMatch(/Trefferquote|Durchschnitt|Rangliste|Übungszeit|Lernzeit|zuletzt aktiv/i);
  });

  it('und im Betrieb wird er nicht gerufen', async () => {
    const { cloud } = await mitInhalt();
    /*
      Jede Methode, nicht eine ausgewählte: Eine Liste von Hand wäre genau so
      vollständig wie der Tag, an dem sie geschrieben wurde — käme eine
      Methode dazu, bliebe die Prüfung grün und die Zusage gebrochen.
    */
    const progress = cloud.repositories.progress!;
    const spione = (Object.keys(progress) as (keyof typeof progress)[]).filter(
      (name) => typeof progress[name] === 'function',
    );
    expect(spione.length, 'der Lernstandspeicher hat keine Methoden').toBeGreaterThan(3);
    const beobachtet = spione.map((name) => [name, vi.spyOn(progress, name)] as const);

    oeffne('/start', undefined, cloud);
    await screen.findByRole('link', { name: 'Englisch 7b' });

    for (const [name, spion] of beobachtet) {
      expect(spion, `der Start ruft progress.${String(name)}`).not.toHaveBeenCalled();
    }
  });
});
