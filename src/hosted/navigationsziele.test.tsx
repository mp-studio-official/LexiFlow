// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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

function oeffne(route: string, userId: string) {
  const cloud = createFakeCloud();
  cloud.signInAs(userId);
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

      oeffne(pfad.replace('#', ''), KONTO[profil] ?? '');

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
  it('sichtbar sind genau die drei Routen, die es gibt', () => {
    expect(sichtbareZiele('lehrkraft', 'schreibtisch').map((z) => z.pfad)).toEqual([
      '#/kurse',
      '#/ki',
    ]);
    expect(sichtbareZiele('lernende', 'schreibtisch').map((z) => z.pfad)).toEqual(['#/lernen']);
  });

  it('`#/pakete` ist noch nicht weitergeleitet', () => {
    // E13 ist entschieden, die Weiterleitung existiert noch nicht. `geplant`
    // ist die ehrliche Antwort, bis 5B.2c' sie baut und prüft.
    expect(umsetzungVon('#/pakete')?.zustand).toBe('geplant');
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

describe('5B.2a ist additiv', () => {
  it('keine Hülle benutzt die Definition bisher', async () => {
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

    for (const datei of ['hosted/PortalShell.tsx', 'ui/AppShell.tsx', 'portable/StudentShell.tsx']) {
      const quelle = readFileSync(resolve(wurzel, datei), 'utf8');
      expect(quelle, `${datei} benutzt die neue Navigationsdefinition schon`).not.toMatch(
        /from '[^']*navigations?(ziele)?'/,
      );
    }
  });
});
