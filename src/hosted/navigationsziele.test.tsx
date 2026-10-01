// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

import { RepositoryProvider } from '../application/RepositoryContext';
import { createFakeCloud } from '../application/fakeCloudRepositories';
import { HostedRoutes } from './HostedApp';
import { SessionProvider } from './SessionContext';
import { PROFILE, zieleAuf } from '../ui/navigation';
import {
  istBekanntesZiel,
  istFreigeschaltet,
  sichtbareZiele,
  umsetzungVon,
  zielmatrix,
  type Umsetzungszustand,
} from './navigationsziele';

/**
 * Jedes sichtbare Navigationsziel führt wirklich irgendwohin.
 *
 * ## Warum das gegen den echten Router läuft
 *
 * Weil eine Textsuche in `HostedApp.tsx` die falsche Frage beantwortet. Sie
 * fände `path="kurse/*"` und wäre zufrieden — auch dann, wenn ein Riegel
 * davor die Route für diese Rolle gar nicht freigibt, oder wenn die Adresse
 * sich im Detail unterscheidet.
 *
 * Die Frage lautet: Komme ich an? Und sie ist nur zu beantworten, indem man
 * hingeht. Also wird die Route aufgerufen und belegt, dass **weder die
 * Wildcard noch die öffentliche Landungsseite** gegriffen hat — denn das ist
 * die Falle: `<Route path="*" element={<Navigate to="/" replace />} />`
 * verwandelt jedes tote Ziel in einen stillen Sprung zur Startseite. Ein
 * Test, der nur „keine Fehlermeldung" prüft, hielte das für Erfolg.
 */

afterEach(cleanup);

/** Die Überschrift, an der die öffentliche Landungsseite zu erkennen ist. */
const LANDUNG = 'LexiFlow';

function oeffne(route: string, userId?: string) {
  const cloud = createFakeCloud();
  // Ohne Konto: niemand ist angemeldet. `signInAs('')` wäre ein Fehler, kein Zustand.
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
}

/** Wer welches Navigationsprofil bekommt — nur für diesen Test. */
const KONTO: Readonly<Record<string, string>> = {
  lehrkraft: 'u-lehrerin',
  lernende: 'u-lernend',
};

describe('die Prüfung kann überhaupt unterscheiden', () => {
  /*
    Die Gegenprobe zuerst. Ohne sie wüsste niemand, ob „nicht die
    Landungsseite" jemals falsch wird — und dann bestünde jede Zeile darunter,
    auch wenn das Portal nur noch Startseite kann.
  */
  it('ein erfundenes Ziel landet auf der Landungsseite', async () => {
    oeffne('/gibtsnicht', 'u-lehrerin');
    expect(await screen.findByRole('heading', { name: LANDUNG, level: 1 })).toBeInTheDocument();
  });

  it('ein echtes Ziel tut das nicht', async () => {
    oeffne('/kurse', 'u-lehrerin');
    expect(screen.queryByRole('heading', { name: LANDUNG, level: 1 })).toBeNull();
  });
});

describe('jedes sichtbare Ziel löst auf', () => {
  const sichtbar = PROFILE.flatMap((profil) =>
    sichtbareZiele(profil, 'schreibtisch').map((ziel) => ({ profil, ziel })),
  );

  it('es gibt überhaupt sichtbare Ziele', () => {
    // Sonst liefe die Schleife darunter ins Leere und meldete Erfolg.
    expect(sichtbar.length).toBeGreaterThan(0);
  });

  it.each(sichtbar.map(({ profil, ziel }) => [profil, ziel.pfad] as const))(
    '%s: %s',
    async (profil, pfad) => {
      const umsetzung = umsetzungVon(pfad);
      expect(umsetzung, `${pfad} ist kein bekanntes Ziel aus E23`).toBeDefined();
      const ziel = umsetzung?.leitetAuf ?? umsetzung?.route;
      expect(ziel, `${pfad} ist freigeschaltet, nennt aber keine Route`).toBeDefined();

      oeffne(pfad.replace('#', ''), KONTO[profil]);

      /*
        Zwei Dinge dürfen nicht passiert sein: die Wildcard (erkennbar an der
        Landungsseite) und der Riegel, der zur Anmeldung schickt. Beide sehen
        aus wie eine funktionierende Seite.
      */
      expect(
        screen.queryByRole('heading', { name: LANDUNG, level: 1 }),
        `${pfad} ist auf der Landungsseite gelandet — die Wildcard hat gegriffen`,
      ).toBeNull();
      expect(
        screen.queryByRole('heading', { name: 'Anmelden' }),
        `${pfad} ist für ${profil} nicht freigegeben`,
      ).toBeNull();
    },
  );
});

describe('kein geplantes Ziel wird gerendert', () => {
  it('die sichtbare Teilmenge enthält nur Freigeschaltetes', () => {
    for (const profil of PROFILE) {
      for (const groesse of ['schreibtisch', 'telefon'] as const) {
        for (const ziel of sichtbareZiele(profil, groesse)) {
          expect(umsetzungVon(ziel.pfad)?.zustand, `${ziel.pfad}`).not.toBe('geplant');
        }
      }
    }
  });

  it('die geplanten Ziele fehlen in der sichtbaren Teilmenge wirklich', () => {
    const geplant = zielmatrix()
      .filter(({ umsetzung }) => umsetzung?.zustand === 'geplant')
      .map(({ ziel }) => ziel.pfad);

    for (const profil of PROFILE) {
      const sichtbar = sichtbareZiele(profil, 'schreibtisch').map((z) => z.pfad);
      for (const pfad of geplant) {
        expect(sichtbar).not.toContain(pfad);
      }
    }
  });
});

describe('jedes Ziel aus E23 hat genau einen Zustand', () => {
  const ZUSTAENDE: readonly Umsetzungszustand[] = ['vorhanden', 'weiterleitung', 'geplant'];

  it.each(PROFILE.flatMap((profil) => zieleAuf(profil, 'schreibtisch').map((z) => z.pfad)))(
    '%s',
    (pfad) => {
      const umsetzung = umsetzungVon(pfad);
      expect(umsetzung, `${pfad} hat keinen Umsetzungszustand`).toBeDefined();
      expect(ZUSTAENDE).toContain(umsetzung?.zustand);
    },
  );

  it('ein vorhandenes Ziel nennt seine Route, ein weitergeleitetes sein Ziel', () => {
    for (const { ziel, umsetzung } of zielmatrix()) {
      if (umsetzung?.zustand === 'vorhanden') {
        expect(umsetzung.route, `${ziel.pfad} ist vorhanden, nennt aber keine Route`).toBeTruthy();
      }
      if (umsetzung?.zustand === 'weiterleitung') {
        expect(
          umsetzung.leitetAuf,
          `${ziel.pfad} ist weitergeleitet, nennt aber kein Ziel`,
        ).toBeTruthy();
      }
    }
  });

  it('`#/verwaltung` taucht in der Zielmatrix nicht auf', () => {
    // Sie ist kein Navigationsziel (E23) und darf auch hier keinen Zustand
    // bekommen - sonst wäre sie eines, das zufällig gefiltert wird.
    expect(zielmatrix().map(({ ziel }) => ziel.pfad)).not.toContain('#/verwaltung');
    expect(istFreigeschaltet('#/verwaltung')).toBe(false);
  });
});

describe('der Stand, den dieser Block festhält', () => {
  /*
    Kein Dauertest auf eine Mindestzahl geplanter Ziele - der würde rot, sobald
    alles fertig ist. Festgehalten wird, was heute gilt, damit ein Hochsetzen
    ohne Route auffällt.
  */
  it('sichtbar sind genau die Ziele, die auflösen', () => {
    expect(sichtbareZiele('lehrkraft', 'schreibtisch').map((z) => z.pfad)).toEqual([
      '#/kurse',
      '#/pakete',
      '#/ki',
      '#/einstellungen',
    ]);
    expect(sichtbareZiele('lernende', 'schreibtisch').map((z) => z.pfad)).toEqual(['#/lernen']);
  });

  it('`#/pakete` ist seit 5B.2c′ weitergeleitet', () => {
    const umsetzung = umsetzungVon('#/pakete');
    expect(umsetzung?.zustand).toBe('weiterleitung');
    expect(umsetzung?.leitetAuf).toBe('/material');
  });
});

describe('der Übergangsredirect `#/pakete` → `#/material` (E13)', () => {
  /*
    Die Richtung ist in dieser Phase ausdrücklich die hier und nicht die aus
    E13: Die Seite liegt noch unter `/material`, also zeigt die neue Adresse
    auf die alte. Erst wenn die Seite umzieht, dreht sich das um. Beide
    Richtungen gleichzeitig wären kein Grenzfall, sondern eine Seite, die
    nicht mehr lädt.
  */

  it('eine Lehrkraft landet wirklich im Materialbereich', async () => {
    /*
      Geprüft wird der **gerenderte Bereich**, nicht die Adresse. Eine
      Weiterleitung, die die Adresse ändert und dann auf der Startseite
      endet, hätte eine Prüfung auf `location.pathname` bestanden.
    */
    oeffne('/pakete', 'u-lehrerin');
    expect(await screen.findByRole('heading', { name: 'Material', level: 1 })).toBeInTheDocument();
  });

  it('weder Wildcard noch Landungsseite haben gegriffen', async () => {
    oeffne('/pakete', 'u-lehrerin');
    await screen.findByRole('heading', { name: 'Material', level: 1 });
    expect(screen.queryByRole('heading', { name: LANDUNG, level: 1 })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Anmelden' })).toBeNull();
  });

  it('eine lernende Person kommt darüber nicht in den Lehrkraftbereich', async () => {
    /*
      Die Weiterleitung liegt **innerhalb** des Lehrkraftriegels. Läge sie
      davor, wäre sie ein Weg um `RequireArea` herum — und zwar einer, den
      niemand sucht, weil er wie eine Umbenennung aussieht.
    */
    oeffne('/pakete', 'u-lernend');
    expect(await screen.findByText(/nicht für dieses Konto/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Material', level: 1 })).toBeNull();
  });

  it('ohne Anmeldung führt sie zur Anmeldung, nicht ins Material', async () => {
    oeffne('/pakete');
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Material', level: 1 })).toBeNull();
  });

  it('`/material` leitet in dieser Phase **nicht** auf `/pakete`', async () => {
    /*
      Sonst zeigten beide Adressen aufeinander. Der Browser läuft dann im
      Kreis, bis er aufgibt — und zwar ohne Fehlermeldung, die auf die Ursache
      zeigt.
    */
    oeffne('/material', 'u-lehrerin');
    expect(await screen.findByRole('heading', { name: 'Material', level: 1 })).toBeInTheDocument();
    const quelle = readFileSync(resolve(import.meta.dirname, 'HostedApp.tsx'), 'utf8');
    const ohneKommentare = quelle.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '');
    expect(ohneKommentare, 'es gibt eine Rückweiterleitung — das ist die Schleife').not.toMatch(
      /path="material"\s+element=\{<Navigate/,
    );
  });

  it('steht innerhalb des Lehrkraftriegels', () => {
    /*
      Verhalten unterscheidet das **nicht**: Das Ziel `/material` ist selbst
      geschützt, eine lernende Person käme also auch über eine öffentlich
      stehende Weiterleitung nicht hinein. Geprüft wird es trotzdem, und am
      Aufbau statt am Ergebnis — denn die Regel soll auch dann noch gelten,
      wenn `/material` eines Tages aus einem anderen Grund offener wird. Eine
      Weiterleitung, die vor dem Riegel steht, ist ein Weg um ihn herum, den
      niemand sucht: Sie sieht wie eine Umbenennung aus.
    */
    const quelle = readFileSync(resolve(import.meta.dirname, 'HostedApp.tsx'), 'utf8');
    const stelle = quelle.indexOf('path="pakete"');
    expect(stelle, 'die Weiterleitung fehlt').toBeGreaterThan(0);

    const lehrkraftriegel = quelle.indexOf('<RequireArea area="teacher">');
    const danach = quelle.indexOf('<Route path="*"', lehrkraftriegel);
    expect(lehrkraftriegel, 'der Lehrkraftriegel fehlt').toBeGreaterThan(0);
    expect(
      stelle > lehrkraftriegel && stelle < danach,
      'die Weiterleitung steht außerhalb des Lehrkraftbereichs',
    ).toBe(true);
  });

  it('nur die Wurzel, keine erfundenen Unterpfade', async () => {
    /*
      Unter `/material` gibt es heute keine Unterpfade — `TeacherArea` hat
      dort einzig `index`. Eine Weiterleitung für `pakete/*` erfände Adressen,
      die nirgends hinführen.
    */
    oeffne('/pakete/irgendwas', 'u-lehrerin');
    expect(await screen.findByRole('heading', { name: LANDUNG, level: 1 })).toBeInTheDocument();
  });

  it('tauscht den Verlaufseintrag aus, statt ihn anzuhängen', async () => {
    /*
      `replace`: Ohne das stünde die Weiterleitung im Verlauf. Ein Schritt
      zurück aus dem Material führte dann wieder auf `/pakete` und von dort
      wieder ins Material — man käme nicht mehr heraus.

      Geprüft wird, wo ein Schritt zurück landet: auf der Seite **davor**.
    */
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');

    function Zurueck() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate(-1)}>
          einen zurück
        </button>
      );
    }

    render(
      <RepositoryProvider value={cloud.repositories} mode="hosted">
        <SessionProvider>
          <MemoryRouter initialEntries={['/kurse', '/pakete']} initialIndex={1}>
            <Zurueck />
            <HostedRoutes />
          </MemoryRouter>
        </SessionProvider>
      </RepositoryProvider>,
    );

    await screen.findByRole('heading', { name: 'Material', level: 1 });

    const { userEvent } = await import('@testing-library/user-event');
    await userEvent.setup().click(screen.getByRole('button', { name: 'einen zurück' }));

    expect(
      await screen.findByRole('heading', { name: 'Kurse', level: 1 }),
      'ein Schritt zurück landet nicht auf der Seite davor — der Redirect steht im Verlauf',
    ).toBeInTheDocument();
  });
});

describe('die Einstellungen (5B.7)', () => {
  /*
    Diese Seite ist ein Verzeichnis und keine neue Funktion: Sie führt zu
    Dingen, die es gibt. Geprüft wird deshalb, **was man von dort erreicht** —
    und wer was davon überhaupt sieht.
  */

  it('eine Lehrkraft findet KI-Zugang und Datenschutz, aber keine Verwaltung', async () => {
    oeffne('/einstellungen', 'u-lehrerin');
    expect(
      await screen.findByRole('heading', { name: 'Einstellungen', level: 1 }),
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /KI-Zugang öffnen/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Datenschutz öffnen/ })).toBeInTheDocument();

    /*
      Nicht ausgegraut, sondern nicht da. Ein gesperrter Eintrag erzählt von
      einer Tür — eine Auskunft, die niemand gegeben hat.
    */
    expect(screen.queryByRole('link', { name: /Konten und Rollen/ })).toBeNull();
    expect(screen.queryByText(/Konten und Rollen/)).toBeNull();
  });

  it('eine Verwaltung findet zusätzlich „Konten und Rollen"', async () => {
    oeffne('/einstellungen', 'u-verwaltung');
    await screen.findByRole('heading', { name: 'Einstellungen', level: 1 });
    expect(screen.getByRole('link', { name: 'Konten und Rollen verwalten' })).toBeInTheDocument();
  });

  it('der Adminverweis erreicht den wirklich gerenderten Verwaltungsbereich', async () => {
    /*
      Nicht nur „der Verweis zeigt auf /verwaltung": Ein Verweis auf eine
      Adresse, die in der Wildcard endet, sähe genauso aus.
    */
    oeffne('/einstellungen', 'u-verwaltung');
    const verweis = await screen.findByRole('link', { name: 'Konten und Rollen verwalten' });
    expect(verweis.getAttribute('href')).toBe('/verwaltung');

    const { userEvent } = await import('@testing-library/user-event');
    await userEvent.setup().click(verweis);

    expect(await screen.findByRole('heading', { name: 'Verwaltung', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: LANDUNG, level: 1 })).toBeNull();
  });

  it('eine lernende Person erreicht die Seite nicht', async () => {
    oeffne('/einstellungen', 'u-lernend');
    expect(await screen.findByText(/nicht für dieses Konto/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Einstellungen', level: 1 })).toBeNull();
  });

  it('ohne Anmeldung führt sie zur Anmeldung', async () => {
    oeffne('/einstellungen');
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Einstellungen', level: 1 })).toBeNull();
  });

  it('weder Wildcard noch Landungsseite haben gegriffen', async () => {
    for (const konto of ['u-lehrerin', 'u-verwaltung']) {
      cleanup();
      oeffne('/einstellungen', konto);
      await screen.findByRole('heading', { name: 'Einstellungen', level: 1 });
      expect(screen.queryByRole('heading', { name: LANDUNG, level: 1 })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Anmelden' })).toBeNull();
    }
  });

  it('steht innerhalb des Lehrkraftriegels und nicht hinter dem Adminriegel', () => {
    /*
      Zwei Fehler wären hier möglich. Vor dem Lehrkraftriegel wäre die Seite
      für Lernende offen. Hinter dem Adminriegel käme keine normale Lehrkraft
      mehr an ihren KI-Zugang — und genau dieser Weg ist der Grund, warum es
      die Seite gibt.
    */
    const quelle = readFileSync(resolve(import.meta.dirname, 'HostedApp.tsx'), 'utf8');
    const stelle = quelle.indexOf('path="einstellungen/*"');
    const lehrkraftriegel = quelle.indexOf('<RequireArea area="teacher">');
    const ende = quelle.indexOf('<Route path="*"', lehrkraftriegel);
    expect(stelle, 'die Route fehlt').toBeGreaterThan(0);
    expect(stelle > lehrkraftriegel && stelle < ende, 'außerhalb des Lehrkraftbereichs').toBe(true);

    const adminriegel = quelle.indexOf('<RequireArea area="admin">');
    const adminEnde = quelle.indexOf('</RequireArea>', adminriegel);
    expect(
      stelle > adminriegel && stelle < adminEnde,
      'die Einstellungen liegen hinter dem Adminriegel',
    ).toBe(false);
  });

  it('`#/verwaltung` steht weiterhin in keiner Navigation', () => {
    for (const profil of PROFILE) {
      for (const groesse of ['schreibtisch', 'telefon'] as const) {
        expect(sichtbareZiele(profil, groesse).map((z) => z.pfad)).not.toContain('#/verwaltung');
      }
    }
    expect(zielmatrix().map(({ ziel }) => ziel.pfad)).not.toContain('#/verwaltung');
  });
});

describe('ein unbekanntes Ziel ist kein geplantes Ziel', () => {
  /*
    `geplant` ist eine Aussage: „Dieses Ziel aus E23 gibt es noch nicht, und
    Block X baut es." Ein Pfad, den niemand entschieden hat, trägt diese
    Aussage nicht.

    Der Unterschied ist nicht theoretisch. Hieße `#/kures` stillschweigend
    `geplant`, dann verschwände bei einem Schreibfehler in der Matrix
    kommentarlos ein Navigationseintrag: Alles bliebe grün, die Hülle rendert
    ihn nicht, und niemand erführe, warum „Kurse" eines Tages fehlt.
  */
  it.each(['#/kures', '#/Kurse', '#/kurse/', 'kurse', '', '#/verwaltung'])(
    '%s hat keinen Zustand',
    (pfad) => {
      expect(istBekanntesZiel(pfad)).toBe(false);
      expect(umsetzungVon(pfad)).toBeUndefined();
    },
  );

  it('und ist trotzdem nie freigeschaltet', () => {
    // Eine Hülle, die einen Tippfehler übergeben bekommt, soll nichts rendern
    // und nicht abstürzen. Dass er auffällt, ist Aufgabe der Prüfungen.
    for (const pfad of ['#/kures', '#/verwaltung', '', 'kurse']) {
      expect(istFreigeschaltet(pfad)).toBe(false);
    }
  });

  it('die bekannten Ziele sind genau die aus der Matrix', () => {
    /*
      Die Gegenprobe zur Gegenprobe: Käme die Menge der bekannten Ziele aus
      den Schlüsseln der Zustandstabelle, erklärte ein Tippfehler **dort**
      sich selbst zum bekannten Ziel.
    */
    const ausMatrix = PROFILE.flatMap((profil) =>
      zieleAuf(profil, 'schreibtisch').map((z) => z.pfad),
    );
    expect(ausMatrix.length).toBe(9);
    for (const pfad of ausMatrix) {
      expect(istBekanntesZiel(pfad), `${pfad} gilt nicht als bekannt`).toBe(true);
    }
  });
});

describe('seit 5B.2d benutzt der Adapter die Definition', () => {
  it('PortalShell leitet seine Navigation daraus ab', async () => {
    const { readFileSync: lies } = await import('node:fs');
    const { resolve: pfad } = await import('node:path');
    const quelle = lies(pfad(import.meta.dirname, 'PortalShell.tsx'), 'utf8');
    expect(quelle).toMatch(/from '\.\/navigationsziele'/);
    /*
      Und keine zweite, handgeschriebene Liste daneben: Genau die hat E23
      schon einmal auseinanderlaufen lassen.
    */
    const ohneKommentare = quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    for (const alt of ['LERN_NAV', 'LEHR_NAV', 'NavPunkt', 'VERWALTUNG']) {
      expect(ohneKommentare, `${alt} ist eine zweite Navigationsliste`).not.toContain(alt);
    }
    expect(ohneKommentare, 'die Verwaltung steht wieder in der Navigation').not.toContain(
      '/verwaltung',
    );
  });

  it('die portablen Hüllen benutzen sie weiterhin nicht', async () => {
    /*
      Die Umschaltung ist 5B.2d. Bis dahin liegen Matrix und Zustand bereit
      und ändern an keinem Bildschirm etwas — nachgewiesen am Import, nicht
      am Augenschein.

      Dieser Test fällt in 5B.2d, und das ist seine Aufgabe: Er kündigt an,
      dass ab hier ein Bildschirm anders aussieht.
    */
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const wurzel = resolve(import.meta.dirname, '..');

    for (const datei of ['ui/AppShell.tsx', 'portable/StudentShell.tsx']) {
      const quelle = readFileSync(resolve(wurzel, datei), 'utf8');
      expect(quelle, `${datei} benutzt die neue Navigationsdefinition schon`).not.toMatch(
        /from '[^']*navigations?(ziele)?'/,
      );
    }
  });
});
