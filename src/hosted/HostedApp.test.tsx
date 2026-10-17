import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RepositoryProvider } from '../application/RepositoryContext';
import { createFakeCloud } from '../application/fakeCloudRepositories';
import { HostedApp, HostedRoutes, fälschungGewünscht } from './HostedApp';
import { SessionProvider } from './SessionContext';

/**
 * Die Riegel des Portals.
 *
 * Geprüft wird das Verhalten an der Oberfläche, nicht die Datenbank: Ob eine
 * lernende Person die Kursverwaltung **abrufen** könnte, entscheidet Phase 2
 * mit RLS. Hier geht es darum, dass sie nicht in einer Sackgasse landet – und
 * dass der Lehrkraftbereich für sie erst gar nicht geladen wird.
 */

function setup(route: string, userId?: string) {
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

describe('ohne Anmeldung', () => {
  it('zeigt die öffentliche Startseite', async () => {
    setup('/');
    expect(await screen.findByRole('heading', { name: 'LexiFlow', level: 1 })).toBeInTheDocument();
    const anmelden = screen.getByRole('link', { name: 'Anmelden' });
    expect(anmelden).toHaveAttribute('href', '/anmelden');
    expect(anmelden).toHaveClass('btn', 'btn--primary');
  });

  it('lässt Beitritt per Code und Wiederherstellung offen', async () => {
    setup('/beitreten');
    expect(await screen.findByRole('heading', { name: 'Mit Code beitreten' })).toBeInTheDocument();
  });

  it('führt vom Lernbereich zur Anmeldung', async () => {
    setup('/lernen');
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
  });

  it('führt vom Lehrkraftbereich zur Anmeldung', async () => {
    setup('/kurse');
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
  });
});

describe('als lernende Person', () => {
  it('kommt in den Lernbereich', async () => {
    setup('/lernen', 'u-lernend');
    expect(await screen.findByRole('heading', { name: 'Deine Kurse' })).toBeInTheDocument();
  });

  it('bekommt den Lehrkraftbereich nicht – und erfährt, warum', async () => {
    setup('/kurse', 'u-lernend');
    expect(await screen.findByText(/nicht für dieses Konto/)).toBeInTheDocument();
    // Kein Weiterleiten: Wortloses Zurückschieben liest sich wie ein Defekt.
    expect(screen.queryByRole('button', { name: 'Kurs anlegen' })).not.toBeInTheDocument();
  });

  it('bekommt die Verwaltung nicht', async () => {
    setup('/verwaltung', 'u-lernend');
    expect(await screen.findByText(/nicht für dieses Konto/)).toBeInTheDocument();
  });

  it('trägt auf ihrer eigenen Seite genau ein `aria-current` je Navigation', async () => {
    /*
      Die Gegenprobe zur Absage weiter unten: Dort ist null die richtige
      Zahl, hier ist es eins. Ohne diese Hälfte liesse sich die andere auch
      dadurch erfüllen, dass `aria-current` nirgends mehr steht.
    */
    setup('/lernen', 'u-lernend');
    const navigationen = await screen.findAllByRole('navigation', { name: 'Hauptnavigation' });
    expect(navigationen.length).toBe(2);
    for (const nav of navigationen) {
      expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    }
  });

  it('sieht in ihrer Navigation keinen Weg zur Werkstatt', async () => {
    setup('/lernen', 'u-lernend');
    /*
      Seit 5B.2d gibt es **zwei** Navigationen im Baum — Icon-Leiste und
      untere Leiste —, von denen je nach Breite genau eine sichtbar ist.
      Geprüft werden beide: Ein Weg, der nur in der unsichtbaren steht, ist
      trotzdem einer.

      Auf die Verweisziele geprüft und nicht auf Wörter: Der Lernbereich heißt
      „Deine Kurse und Pakete“ und enthält damit selbst das Wort „Kurse“. Ein
      Wortvergleich wäre hier nicht bloß streng, sondern schlicht falsch.
    */
    const navigationen = await screen.findAllByRole('navigation', { name: 'Hauptnavigation' });
    expect(navigationen.length).toBe(2);
    for (const nav of navigationen) {
      const ziele = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'));
      expect(ziele).not.toContain('#/kurse');
      expect(ziele).not.toContain('#/pakete');
      expect(ziele).not.toContain('#/verwaltung');
      expect(ziele).not.toContain('#/ki');
      expect(ziele).toContain('#/lernen');
    }
  });
});

/**
 * Die Zugriffsmeldung fällt nicht aus der eigenen Hülle.
 *
 * Vorher ersetzte sie die ganze Hülle: eine weiße Seite mit einem Satz
 * darauf, ohne Navigation, ohne Marke, ohne Abmelden — und wer dort landete,
 * hielt genau das für den Defekt, den der Satz vermeiden soll.
 *
 * Geprüft werden **alle drei** Kombinationen, die `mayEnter` im Portal
 * wirklich ausschließt. Die vierte gibt es nicht: In den Lernbereich dürfen
 * alle drei Rollen, dieser Riegel schlägt angemeldet nie zu.
 */
describe.each([
  /*
    Die letzte Zahl ist die erwartete Menge `aria-current` je sichtbarer
    Navigation, und sie ist nicht überall dieselbe:

    - Bei den ersten beiden steht die Adresse in dieser Navigation gar nicht
      (`#/kurse` und `#/verwaltung` kennt das Profil `lernende` nicht). Dann
      ist **keines** richtig: Ein Eintrag mit `aria-current` wäre die
      Behauptung, man befinde sich dort.
    - Beim dritten hängt `/verwaltung` seit jeher unter „Einstellungen", und
      die hat eine Lehrkraft. Dort ist **eines** richtig, und zwar an
      „Einstellungen". Das war vorher so und bleibt so.

    Zwei wären in allen drei Fällen zwei Hüllen ineinander.
  */
  ['lernende Person', 'u-lernend', '/kurse', '#/lernen', '#/kurse', 0],
  ['lernende Person', 'u-lernend', '/verwaltung', '#/lernen', '#/verwaltung', 0],
  ['Lehrkraft', 'u-lehrerin', '/verwaltung', '#/kurse', '#/verwaltung', 1],
])(
  'die Absage für eine %s auf %s',
  (_wer, konto, route, eigenesZiel, fremdesZiel, aktiv) => {
    it('steht in der Hülle der eigenen Rolle, und zwar genau einmal', async () => {
      setup(route, konto);
      expect(await screen.findByText(/nicht für dieses Konto/)).toBeInTheDocument();

      /*
        Zwei Navigationen im Baum (Icon-Leiste und untere Leiste), von denen
        je nach Breite eine sichtbar ist — genau wie auf jeder anderen Seite.
        Vier wären zwei Hüllen ineinander, null wäre der alte Zustand.
      */
      const navigationen = await screen.findAllByRole('navigation', { name: 'Hauptnavigation' });
      expect(navigationen.length).toBe(2);

      for (const nav of navigationen) {
        const ziele = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'));
        // Die eigene Navigation, nicht die des gesperrten Bereichs.
        expect(ziele).toContain(eigenesZiel);
        expect(ziele).not.toContain(fremdesZiel);
        expect(nav.querySelectorAll('[aria-current]')).toHaveLength(aktiv);
      }
    });

    it('zeigt keinen geschützten Inhalt', async () => {
      setup(route, konto);
      await screen.findByText(/nicht für dieses Konto/);
      expect(screen.queryByRole('button', { name: 'Kurs anlegen' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Lernpakete', level: 1 })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Verwaltung', level: 1 })).toBeNull();
    });
  },
);

describe('als Lehrkraft', () => {
  it('kommt in den Lehrkraftbereich', async () => {
    setup('/kurse', 'u-lehrerin');
    expect(await screen.findByRole('heading', { name: 'Kurse', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Kurs anlegen' })).toBeInTheDocument();
  });

  it('darf auch lernen – der Lernstand dabei ist der eigene', async () => {
    setup('/lernen', 'u-lehrerin');
    expect(await screen.findByRole('heading', { name: 'Deine Kurse' })).toBeInTheDocument();
  });

  it('bekommt die Verwaltung nicht', async () => {
    // Der äußere Riegel prüft `teacher`, der innere `admin`. Ohne den inneren
    // stünde die Verwaltung jeder Lehrkraft offen, weil sie im selben Bündel
    // liegt.
    setup('/verwaltung', 'u-lehrerin');
    expect(await screen.findByText(/nicht für dieses Konto/)).toBeInTheDocument();
  });

  it('sieht keinen Verwaltungspunkt in der Navigation', async () => {
    setup('/kurse', 'u-lehrerin');
    const navigationen = await screen.findAllByRole('navigation', { name: 'Hauptnavigation' });
    expect(navigationen.length).toBe(2);
    for (const nav of navigationen) {
      const ziele = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'));
      /* `#/pakete` heißt die Adresse seit E13; sie leitet auf `/material`. */
      expect(ziele).toContain('#/pakete');
      expect(ziele).not.toContain('#/verwaltung');
    }
  });
});

describe('als Verwaltung', () => {
  it('kommt in die Verwaltung', async () => {
    setup('/verwaltung', 'u-verwaltung');
    expect(await screen.findByRole('heading', { name: 'Verwaltung' })).toBeInTheDocument();
  });

  it('sieht auch dort keine Einsicht in fremde Lernstände versprochen', async () => {
    setup('/verwaltung', 'u-verwaltung');
    expect(await screen.findByText(/keine Einsicht in individuelle Lernstände/)).toBeInTheDocument();
  });
});

describe('keine Oberfläche zeigt fremde Lernstände', () => {
  it('in keiner Rolle und auf keiner Seite', async () => {
    for (const [userId, route] of [
      ['u-lernend', '/lernen'],
      ['u-lehrerin', '/kurse'],
      ['u-verwaltung', '/verwaltung'],
    ] as const) {
      cleanup();
      setup(route, userId);
      const seite = await screen.findByRole('main');
      /*
        Eine Wortprüfung und kein Beweis – der Beweis steht in den Verträgen
        (es gibt keine Methode dafür) und ab Phase 2 in den Zugriffsregeln.
        Sie fängt trotzdem den wahrscheinlichsten Fehler: eine gut gemeinte
        „Übersicht“, die jemand später einbaut.
      */
      for (const wort of ['Fortschritt der Klasse', 'hat geübt', 'Lernstand von']) {
        expect(seite).not.toHaveTextContent(wort);
      }
    }
  });
});

describe('ohne Konfiguration', () => {
  it('erklärt, welche Werte fehlen, statt weiß zu bleiben', () => {
    render(<HostedApp config={{ ok: false, missing: ['VITE_SUPABASE_URL'], invalid: [] }} />);
    expect(screen.getByRole('heading', { name: /noch nicht eingerichtet/i })).toBeInTheDocument();
    // Zweimal: in der Meldung und in der Vorlage zum Abschreiben.
    expect(screen.getAllByText(/VITE_SUPABASE_URL/).length).toBeGreaterThan(0);
  });

  it('läuft mit übergebenen Speichern trotzdem – dafür braucht es keine Konfiguration', async () => {
    render(
      <HostedApp
        repositories={createFakeCloud().repositories}
        config={{ ok: false, missing: ['VITE_SUPABASE_URL'], invalid: [] }}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'LexiFlow', level: 1 })).toBeInTheDocument();
  });
});

describe('die Testfassung ohne Server', () => {
  it('läuft nur auf ausdrückliche Ansage', () => {
    expect(fälschungGewünscht({})).toBe(false);
    expect(fälschungGewünscht({ VITE_LEXIFLOW_FAKE_CLOUD: '0' })).toBe(false);
    expect(fälschungGewünscht({ VITE_LEXIFLOW_FAKE_CLOUD: 'true' })).toBe(false);
    expect(fälschungGewünscht({ VITE_LEXIFLOW_FAKE_CLOUD: '1' })).toBe(true);
  });

  it('sagt auf jeder Seite, dass sie eine ist', async () => {
    /*
      Die Bedingung dafür, dass es diese Fahne überhaupt geben darf. Ohne das
      Band wäre eine Fassung mit erfundenen Konten von der echten nicht zu
      unterscheiden – auf dem Bildschirm nicht und auf einem Screenshot erst
      recht nicht.
    */
    render(
      <HostedApp
        env={{ VITE_LEXIFLOW_FAKE_CLOUD: '1', BASE_URL: '/' }}
        config={{ ok: false, missing: ['VITE_SUPABASE_URL'], invalid: [] }}
      />,
    );
    expect(await screen.findByText(/Testfassung ohne Server/)).toBeInTheDocument();
    // Und die Einrichtungsseite kommt dann nicht – die Fassung läuft ja.
    expect(screen.queryByRole('heading', { name: /noch nicht eingerichtet/i })).not.toBeInTheDocument();
  });

  it('zeigt ohne die Fahne kein Band', async () => {
    render(<HostedApp repositories={createFakeCloud().repositories} env={{ BASE_URL: '/' }} />);
    await screen.findByRole('heading', { name: 'LexiFlow', level: 1 });
    expect(screen.queryByText(/Testfassung ohne Server/)).not.toBeInTheDocument();
  });
});
