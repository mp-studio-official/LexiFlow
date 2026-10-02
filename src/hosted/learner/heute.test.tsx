// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { RepositoryProvider } from '../../application/RepositoryContext';
import { createFakeCloud, type FakeCloud } from '../../application/fakeCloudRepositories';
import { makePack } from '../../test/fixtures';
import { HostedRoutes } from '../HostedApp';
import { SessionProvider } from '../SessionContext';
import { ZULETZT_HOECHSTENS } from './heuteDaten';

/**
 * „Heute" (5B.4) — am echten Router.
 *
 * ## Die Regeln, die jede Prüfung hier trägt
 *
 * 1. **Alle sieben Bereiche sind immer da.** Auch bei einem frischen Konto.
 *    Ein Bereich, der bei leeren Daten verschwindet, macht aus einem Anfang
 *    eine kaputte Seite.
 * 2. **Jede Zahl stammt aus den Verträgen.** Keine geschätzte, keine
 *    erfundene, keine Lernzeit (E25).
 * 3. **Jede sichtbare Handlung führt irgendwohin.** `<Route path="*">`
 *    schickt jede tote Adresse auf die Landungsseite; eine Prüfung gilt
 *    deshalb nur als bestanden, wenn die Zielseite erkennbar **und** die
 *    Landungsseite abwesend ist.
 */

afterEach(cleanup);

const LANDUNG = 'Vokabeln lernen';

function zeige(cloud: FakeCloud, route = '/heute') {
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

/**
 * Etwas tun, während die Umgebung keine Zeitzone kennt.
 *
 * `Intl.DateTimeFormat` wirft dann — eine Umgebung ohne Zeitzonendaten ist
 * selten, aber sie ist kein Fehler der lernenden Person. Die Attrappe wird
 * danach **immer** zurückgenommen, auch wenn der Rumpf wirft: Sonst färbte
 * ein Fehlschlag hier jede folgende Prüfung dieser Datei.
 */
async function ohneVorschlag(rumpf: () => Promise<void>): Promise<void> {
  const spion = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation((() => {
    throw new Error('Keine Zeitzonendaten.');
  }) as never);
  try {
    await rumpf();
  } finally {
    spion.mockRestore();
  }
}

/** Ein frisches Lernendenkonto: kein Kurs, keine Aktivität, keine Einstellung. */
function frischesKonto(): FakeCloud {
  const cloud = createFakeCloud();
  cloud.signInAs('u-lernend');
  return cloud;
}

/**
 * Ein Kurs mit `anzahl` zugewiesenen Paketen und einer lernenden Person darin.
 *
 * Über die normalen Verträge aufgebaut – Kurs anlegen, veröffentlichen,
 * zuweisen, beitreten. Ein Aufbau am Vertrag vorbei prüfte am Ende die
 * Testhilfe statt der Seite.
 */
async function kursMitPaketen(anzahl: number) {
  const cloud = createFakeCloud();
  cloud.signInAs('u-lehrerin');
  const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
  const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});

  const titel: string[] = [];
  for (let i = 0; i < anzahl; i += 1) {
    const roh = makePack();
    const pack = {
      ...roh,
      meta: { ...roh.meta, id: `pack-${i}`, title: `Unit ${i + 1}` },
    };
    await cloud.repositories.packs!.saveDraft(pack);
    const revision = await cloud.repositories.publication!.publish(pack.meta.id);
    await cloud.repositories.publication!.assignToCourse(
      kurs.id,
      pack.meta.id,
      revision.revision,
      i,
    );
    titel.push(pack.meta.title);
  }

  cloud.signInAs('u-lernend');
  await cloud.repositories.invitations!.redeemCode(code);
  return { cloud, courseId: kurs.id, titel };
}

/** Einen Lernstand hinstellen – am Vertrag vorbei, wie es die Datenbank täte. */
function setzeLernstand(
  cloud: FakeCloud,
  input: {
    userId?: string;
    courseId: string;
    packId: string;
    faellig: number;
    gesamt?: number;
    zuletzt?: string;
  },
) {
  const person = input.userId ?? 'u-lernend';
  const schluessel = `${person}::${input.courseId}::${input.packId}`;
  const gesamt = input.gesamt ?? input.faellig;
  cloud.state.entryProgress.set(
    schluessel,
    Array.from({ length: gesamt }, (_, i) => ({
      key: `${input.packId}:v-${i}:en-de`,
      packId: input.packId,
      entryId: `v-${i}`,
      direction: 'en-de' as const,
      box: 1,
      correctCount: 0,
      wrongCount: 0,
      streak: 0,
      // Fällig heißt: in der Vergangenheit. Der Rest liegt weit vorn.
      dueAt: i < input.faellig ? '2000-01-01T00:00:00.000Z' : '2099-01-01T00:00:00.000Z',
      rev: 1,
    })),
  );
  if (input.zuletzt !== undefined) {
    cloud.state.packProgress.set(schluessel, {
      packId: input.packId,
      sessionCount: 1,
      answeredCount: gesamt,
      correctCount: 0,
      lastPracticedAt: input.zuletzt,
    });
  }
}

/**
 * Warten, bis die Seite wirklich steht.
 *
 * Nicht auf die Überschrift „Heute": Die steht auch im Ladezustand, und eine
 * Prüfung, die darauf wartet, misst am Skelett. Gewartet wird auf den ersten
 * der sieben Bereiche – er erscheint erst, wenn alle Daten da sind.
 */
async function warteAufInhalt(): Promise<void> {
  await screen.findByRole('heading', { name: 'Weiterlernen', level: 2 });
}

function bereich(name: string): HTMLElement {
  const gefunden = document.querySelector<HTMLElement>(`[data-bereich="${name}"]`);
  expect(gefunden, `Bereich „${name}" fehlt`).not.toBeNull();
  return gefunden!;
}

/* ====================================== Die sieben Bereiche ============= */

describe('Ein frisches Konto sieht einen Anfang, keine kaputte Seite', () => {
  it('zeigt alle sieben Bereiche – auch ohne Kurs, Aktivität und Einstellung', async () => {
    zeige(frischesKonto());
    await warteAufInhalt();

    for (const kennung of [
      'weiterlernen',
      'faellig',
      'kurse',
      'zuletzt',
      'woche',
      'serie',
      'ziele',
    ]) {
      expect(bereich(kennung)).toBeInTheDocument();
    }
  });

  it('nennt jeden leeren Bereich beim Namen, statt ihn wegzulassen', async () => {
    zeige(frischesKonto());
    await warteAufInhalt();

    expect(within(bereich('weiterlernen')).getByText('Noch nichts angefangen')).toBeInTheDocument();
    expect(within(bereich('faellig')).getByText('Nichts fällig')).toBeInTheDocument();
    expect(within(bereich('kurse')).getByText('Noch in keinem Kurs')).toBeInTheDocument();
    expect(within(bereich('zuletzt')).getByText('Noch nichts geübt')).toBeInTheDocument();
    expect(within(bereich('ziele')).getByText('Kein Wochenziel')).toBeInTheDocument();
  });

  it('mahnt nirgends und zählt nichts herunter', async () => {
    /*
      Konzept 4.3. Geprüft am ganzen sichtbaren Text, nicht an einer Stelle:
      Eine Mahnung schleicht sich an der Stelle ein, an die niemand schaut.
    */
    zeige(frischesKonto());
    await warteAufInhalt();
    const text = document.body.textContent ?? '';

    for (const wort of ['verloren', 'Rückstand', 'versäumt', 'verpasst', 'Streak', '❤', '🔥']) {
      expect(text, `„${wort}" steht auf der Seite`).not.toContain(wort);
    }
  });

  it('zeigt keine Lernzeit (E25)', async () => {
    zeige(frischesKonto());
    await warteAufInhalt();
    const text = document.body.textContent ?? '';
    for (const wort of ['Minuten', 'Stunden', 'Lernzeit', 'min']) {
      expect(text, `„${wort}" steht auf der Seite`).not.toContain(wort);
    }
  });
});

/* ====================================== Echte Daten ===================== */

describe('Die Zahlen kommen aus den Verträgen', () => {
  it('nennt die fällige Anzahl und das zuletzt benutzte Paket', async () => {
    const { cloud, courseId, titel } = await kursMitPaketen(2);
    setzeLernstand(cloud, { courseId, packId: 'pack-0', faellig: 3, gesamt: 7 });
    setzeLernstand(cloud, {
      courseId,
      packId: 'pack-1',
      faellig: 0,
      gesamt: 5,
      zuletzt: '2026-10-01T10:00:00.000Z',
    });

    zeige(cloud);
    await warteAufInhalt();

    // Drei fällige Wörter – genau die Zahl aus dem Lernstand, nicht gerundet.
    expect(within(bereich('faellig')).getByText(/^3 Wörter warten/)).toBeInTheDocument();
    expect(within(bereich('faellig')).getByText(titel[0]!)).toBeInTheDocument();

    // Zuletzt benutzt ist das Paket mit `lastPracticedAt`, nicht das fällige.
    const zuletzt = within(bereich('zuletzt')).getAllByRole('link');
    expect(zuletzt.map((a) => a.textContent)).toEqual([titel[1]]);
  });

  it('führt mit dem zuletzt benutzten Paket weiter (§ 4.1)', async () => {
    /*
      Ersetzt die frühere Regel „das mit den meisten offenen Wörtern". Die
      klang vernünftig und war falsch: „Weiterlernen" heißt weiter, also
      dort, wo jemand aufgehört hat.

      Hier ist der Fall so gebaut, dass beide Regeln verschiedene Antworten
      geben — sonst bewiese die Prüfung nichts.
    */
    const { cloud, courseId, titel } = await kursMitPaketen(2);
    setzeLernstand(cloud, {
      courseId,
      packId: 'pack-0',
      faellig: 20,
      gesamt: 30,
      zuletzt: '2026-09-10T10:00:00.000Z',
    });
    setzeLernstand(cloud, {
      courseId,
      packId: 'pack-1',
      faellig: 2,
      gesamt: 9,
      zuletzt: '2026-10-07T18:00:00.000Z',
    });

    zeige(cloud);
    await warteAufInhalt();

    const karte = bereich('weiterlernen');
    expect(within(karte).getByText(titel[1]!)).toBeInTheDocument();
    // Die Zahl steht in der Karte – sie entscheidet nur nicht, welche es ist.
    expect(within(karte).getByText('2 Wörter fällig')).toBeInTheDocument();
    expect(within(karte).queryByText(titel[0]!)).toBeNull();
  });

  it('lässt ein älteres Paket mit mehr Offenem das jüngere nicht verdrängen', async () => {
    // Marcs Gegenprobe, als eigene Prüfung: 20 gestern-nicht schlägt 2 gestern.
    const { cloud, courseId, titel } = await kursMitPaketen(2);
    setzeLernstand(cloud, {
      courseId,
      packId: 'pack-0',
      faellig: 20,
      gesamt: 25,
      zuletzt: '2026-08-01T10:00:00.000Z',
    });
    setzeLernstand(cloud, {
      courseId,
      packId: 'pack-1',
      faellig: 2,
      gesamt: 9,
      zuletzt: '2026-10-07T18:00:00.000Z',
    });

    zeige(cloud);
    await warteAufInhalt();
    expect(within(bereich('weiterlernen')).getByText(titel[1]!)).toBeInTheDocument();

    /*
      Und das ältere Paket ist nicht verschwunden – es steht dort, wo es
      hingehört: unter „Fällige Wiederholungen", mit seinen zwanzig.
    */
    expect(within(bereich('faellig')).getByText(titel[0]!)).toBeInTheDocument();
  });

  it('zeigt den leeren Anfangszustand, solange kein Paket benutzt wurde', async () => {
    /*
      Ein zugewiesenes, nie geöffnetes Paket mit offenen Wiederholungen ist
      kein „Weiterlernen": Es gibt nichts, wo weitergemacht würde.
    */
    const { cloud, courseId } = await kursMitPaketen(1);
    setzeLernstand(cloud, { courseId, packId: 'pack-0', faellig: 9, gesamt: 12 });

    zeige(cloud);
    await warteAufInhalt();
    expect(within(bereich('weiterlernen')).getByText('Noch nichts angefangen')).toBeInTheDocument();
    // Fällig ist es trotzdem, und das steht im eigenen Bereich.
    expect(within(bereich('faellig')).getByText(/^9 Wörter warten/)).toBeInTheDocument();
  });

  it('zeigt höchstens vier zuletzt verwendete Pakete', async () => {
    const { cloud, courseId } = await kursMitPaketen(6);
    for (let i = 0; i < 6; i += 1) {
      setzeLernstand(cloud, {
        courseId,
        packId: `pack-${i}`,
        faellig: 0,
        gesamt: 3,
        zuletzt: `2026-10-0${i + 1}T10:00:00.000Z`,
      });
    }

    zeige(cloud);
    await warteAufInhalt();

    const zeilen = within(bereich('zuletzt')).getAllByRole('link');
    expect(ZULETZT_HOECHSTENS).toBe(4);
    expect(zeilen).toHaveLength(4);
    // Und zwar die vier jüngsten, nicht die ersten vier.
    expect(zeilen.map((a) => a.textContent)).toEqual(['Unit 6', 'Unit 5', 'Unit 4', 'Unit 3']);
  });

  it('zeigt den Lernstand einer anderen Person nicht', async () => {
    const { cloud, courseId } = await kursMitPaketen(1);
    setzeLernstand(cloud, { userId: 'u-lernend-2', courseId, packId: 'pack-0', faellig: 40 });

    zeige(cloud);
    await warteAufInhalt();
    expect(within(bereich('faellig')).getByText('Nichts fällig')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('40');
  });

  it('gibt einer Lehrkraft auf derselben Seite nur ihre eigenen Zahlen', async () => {
    /*
      Eine Lehrkraft darf in den Lernbereich – das ist Absicht (ADR-1,
      `AREAS_PER_ROLE`). Was sie dort sieht, ist ihr eigener Lernstand und
      niemandes sonst; es gibt keine Methode, die etwas anderes hergäbe.
    */
    const { cloud, courseId } = await kursMitPaketen(1);
    setzeLernstand(cloud, { userId: 'u-lernend', courseId, packId: 'pack-0', faellig: 12 });

    cloud.signInAs('u-lehrerin');
    zeige(cloud);
    await warteAufInhalt();
    expect(within(bereich('faellig')).getByText('Nichts fällig')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('12 Wörter');
  });
});

/* ====================================== Die Wege ======================== */

describe('Jede sichtbare Handlung führt irgendwohin', () => {
  it('öffnet das Paket aus „Weiterlernen" wirklich', async () => {
    const { cloud, courseId, titel } = await kursMitPaketen(1);
    setzeLernstand(cloud, {
      courseId,
      packId: 'pack-0',
      faellig: 4,
      gesamt: 9,
      zuletzt: '2026-10-07T18:00:00.000Z',
    });

    zeige(cloud);
    await warteAufInhalt();
    const user = userEvent.setup();
    await user.click(within(bereich('weiterlernen')).getByRole('link', { name: 'Weiterlernen' }));

    // Die Karteikartenansicht des Pakets – und nicht die Landungsseite.
    expect(await screen.findByText(titel[0]!, { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(LANDUNG)).toBeNull();
  });

  it('führt von „Meine Kurse" in den Lernbereich', async () => {
    const { cloud } = await kursMitPaketen(1);
    zeige(cloud);
    await warteAufInhalt();

    const user = userEvent.setup();
    await user.click(within(bereich('kurse')).getByRole('link', { name: 'Englisch 7b' }));
    expect(await screen.findByRole('heading', { name: 'Deine Kurse' })).toBeInTheDocument();
  });

  it('führt ein Konto ohne Kurs zum Beitreten', async () => {
    zeige(frischesKonto());
    await warteAufInhalt();

    const user = userEvent.setup();
    await user.click(
      within(bereich('kurse')).getByRole('link', { name: 'Mit einem Code beitreten' }),
    );
    expect(await screen.findByLabelText('Einladungscode')).toBeInTheDocument();
  });

  it('hat keinen Verweis, der auf der Landungsseite endet', async () => {
    /*
      Die Wildcard verdeckt tote Adressen: Sie leitet still auf `/` um. Diese
      Prüfung geht deshalb **jeden** Verweis der Seite ab, statt sich auf die
      drei zu verlassen, die oben geöffnet werden.
    */
    const { cloud, courseId } = await kursMitPaketen(2);
    setzeLernstand(cloud, {
      courseId,
      packId: 'pack-0',
      faellig: 2,
      gesamt: 5,
      zuletzt: '2026-10-01T10:00:00.000Z',
    });

    zeige(cloud);
    await warteAufInhalt();

    const ziele = [...document.querySelectorAll('.heute a[href], .heute-zeitzone a[href]')].map(
      (a) => a.getAttribute('href') ?? '',
    );
    expect(ziele.length).toBeGreaterThan(0);
    for (const ziel of ziele) {
      expect(ziel, 'kein Verweis zeigt auf die Wurzel').not.toBe('/');
      expect(ziel, 'kein leerer Verweis').not.toBe('');
    }
  });
});

/* ====================================== Die Zeitzone (E27) ============== */

describe('Die Zeitzonenbestätigung', () => {
  it('speichert ohne Bestätigung nichts', async () => {
    const cloud = frischesKonto();
    zeige(cloud);
    await warteAufInhalt();
    await screen.findByRole('heading', { name: 'In welcher Zeitzone lernst du?' });

    // Der Vorschlag steht da – gespeichert ist trotzdem nichts.
    expect(cloud.state.learnerSettings.size).toBe(0);
    await expect(cloud.repositories.learnerSettings!.mySettings()).resolves.toEqual({});
  });

  it('lässt die Seite ohne Zeitzone vollständig benutzbar', async () => {
    const { cloud, courseId, titel } = await kursMitPaketen(1);
    setzeLernstand(cloud, {
      courseId,
      packId: 'pack-0',
      faellig: 5,
      gesamt: 9,
      zuletzt: '2026-10-07T18:00:00.000Z',
    });

    zeige(cloud);
    await warteAufInhalt();
    await screen.findByRole('heading', { name: 'In welcher Zeitzone lernst du?' });

    // Vier Bereiche tragen echte Daten …
    expect(within(bereich('weiterlernen')).getByText(titel[0]!)).toBeInTheDocument();
    expect(within(bereich('faellig')).getByText(/^5 Wörter warten/)).toBeInTheDocument();
    expect(within(bereich('kurse')).getByRole('link', { name: 'Englisch 7b' })).toBeInTheDocument();

    // … und die beiden Zeitbereiche sagen, warum sie noch keine Zahl zeigen.
    for (const kennung of ['woche', 'serie']) {
      expect(
        within(bereich(kennung)).getByText(/wenn deine Zeitzone feststeht/),
      ).toBeInTheDocument();
    }
    /*
      „Ziele" sagt etwas anderes, und das ist richtig: Ohne Wochenziel fehlt
      nicht die Zeitzone, sondern das Ziel. Beides in denselben Satz zu
      fassen hieße, jemandem die Zeitzone zu erklären, der gar kein Ziel
      gesetzt hat.
    */
    expect(within(bereich('ziele')).getByText('Kein Wochenziel')).toBeInTheDocument();
  });

  it('speichert nach der Bestätigung genau den vorgeschlagenen Namen', async () => {
    const cloud = frischesKonto();
    const erkannt = Intl.DateTimeFormat().resolvedOptions().timeZone;
    zeige(cloud);
    await warteAufInhalt();
    await screen.findByRole('heading', { name: 'In welcher Zeitzone lernst du?' });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Stimmt, bestätigen' }));

    await waitFor(() =>
      expect(cloud.state.learnerSettings.get('u-lernend')).toEqual({ timeZone: erkannt }),
    );
  });

  it('speichert nach „Andere Zeitzone" genau den gewählten IANA-Namen', async () => {
    const cloud = frischesKonto();
    zeige(cloud);
    await warteAufInhalt();
    await screen.findByRole('heading', { name: 'In welcher Zeitzone lernst du?' });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Andere Zeitzone' }));
    await user.selectOptions(screen.getByLabelText('Zeitzone'), 'Pacific/Auckland');
    await user.click(screen.getByRole('button', { name: '„Pacific/Auckland" bestätigen' }));

    await waitFor(() =>
      expect(cloud.state.learnerSettings.get('u-lernend')).toEqual({
        timeZone: 'Pacific/Auckland',
      }),
    );
  });

  it('zeigt die Frage nicht mehr, sobald eine Zeitzone steht', async () => {
    const cloud = frischesKonto();
    await cloud.repositories.learnerSettings!.confirmTimeZone('Europe/Berlin');

    zeige(cloud);
    await warteAufInhalt();
    expect(screen.queryByRole('heading', { name: 'In welcher Zeitzone lernst du?' })).toBeNull();
  });

  it('überschreibt eine gespeicherte Zeitzone nie, auch nicht auf einem anderen Gerät', async () => {
    /*
      Marcs Einwand, als Prüfung: Eine stille automatische Korrektur kann
      falsche Daten dauerhaft als Wahrheit speichern.

      Geprüft wird am **Schreibweg**, nicht am Gerät: `confirmTimeZone` ist
      die einzige Tür in die Spalte, und sie wird hier nicht benutzt. Das ist
      die schärfere Aussage — sie gilt für jedes Gerät und jeden Vorschlag,
      nicht nur für den einen, den eine Attrappe meldet.
    */
    const cloud = frischesKonto();
    await cloud.repositories.learnerSettings!.confirmTimeZone('Pacific/Auckland');
    const schreibt = vi.spyOn(cloud.repositories.learnerSettings!, 'confirmTimeZone');

    zeige(cloud);
    await warteAufInhalt();

    expect(schreibt).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'In welcher Zeitzone lernst du?' })).toBeNull();
    await expect(cloud.repositories.learnerSettings!.mySettings()).resolves.toEqual({
      timeZone: 'Pacific/Auckland',
    });
  });

  it('funktioniert auch, wenn der Browser keinen Vorschlag hat', async () => {
    const cloud = frischesKonto();
    await ohneVorschlag(async () => {
      zeige(cloud);
      await warteAufInhalt();
    });

    // Die Seite steht vollständig, und die Frage zeigt gleich die Auswahl.
    expect(bereich('weiterlernen')).toBeInTheDocument();
    expect(screen.getByLabelText('Zeitzone')).toBeInTheDocument();
    expect(screen.queryByText(/Dein Gerät meint/)).toBeNull();
  });

  it('wählt ohne Vorschlag nichts vor – auch nicht Berlin', async () => {
    /*
      Die Zeile, auf die es ankommt. Eine Voreinstellung wäre für fast alle
      richtig und für manche falsch, und ein einziger versehentlicher Klick
      machte daraus eine Bestätigung, die niemand gegeben hat.
    */
    const cloud = frischesKonto();
    await ohneVorschlag(async () => {
      zeige(cloud);
      await warteAufInhalt();
    });

    const auswahl = screen.getByLabelText('Zeitzone') as HTMLSelectElement;
    expect(auswahl.value).toBe('');
    expect(within(auswahl).getByText('Zeitzone auswählen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeDisabled();
  });

  it('speichert ohne Vorschlag auch bei Klick und Tastendruck nichts', async () => {
    /*
      Marcs Gegenprobe. Nicht nur „der Knopf ist abgeschaltet", sondern: Es
      wird wirklich auf ihn eingewirkt – mit der Maus und mit der Tastatur –
      und danach steht nichts in den Einstellungen. Insbesondere nicht
      `Europe/Berlin`.
    */
    const cloud = frischesKonto();
    const schreibt = vi.spyOn(cloud.repositories.learnerSettings!, 'confirmTimeZone');
    await ohneVorschlag(async () => {
      zeige(cloud);
      await warteAufInhalt();
    });

    const user = userEvent.setup();
    const knopf = screen.getByRole('button', { name: 'Bestätigen' });
    await user.click(knopf);
    knopf.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(schreibt).not.toHaveBeenCalled();
    expect(cloud.state.learnerSettings.size).toBe(0);
    await expect(cloud.repositories.learnerSettings!.mySettings()).resolves.toEqual({});
  });

  it('speichert ohne Vorschlag genau das, was die Person selbst wählt', async () => {
    const cloud = frischesKonto();
    await ohneVorschlag(async () => {
      zeige(cloud);
      await warteAufInhalt();
    });

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Zeitzone'), 'Europe/Vienna');
    await user.click(screen.getByRole('button', { name: '„Europe/Vienna" bestätigen' }));

    await waitFor(() =>
      expect(cloud.state.learnerSettings.get('u-lernend')).toEqual({ timeZone: 'Europe/Vienna' }),
    );
  });
});

/* ====================================== Serie und Woche ================= */

describe('Serie und Woche', () => {
  /** Zehn Aufgaben am 6. Oktober, Berliner Zeit – der Tag ist voll. */
  async function mitLerntag(aufgaben: number) {
    const cloud = createFakeCloud({ now: () => '2026-10-06T08:00:00Z' });
    cloud.signInAs('u-lernend');
    await cloud.repositories.learnerSettings!.confirmTimeZone('Europe/Berlin');
    cloud.spieleEreignisseEin({
      userId: 'u-lernend',
      recordedAt: '2026-10-06T07:00:00Z',
      anzahl: aufgaben,
      kennung: 'heute',
    });
    return cloud;
  }

  it('macht aus neun Aufgaben keinen Lerntag', async () => {
    zeige(await mitLerntag(9));
    await warteAufInhalt();
    expect(within(bereich('serie')).getByText('0')).toBeInTheDocument();
    expect(
      within(bereich('serie')).getByText('Heute ist ein guter Tag, um wieder anzufangen.'),
    ).toBeInTheDocument();
  });

  it('macht aus zehn Aufgaben einen', async () => {
    zeige(await mitLerntag(10));
    await warteAufInhalt();
    expect(within(bereich('serie')).getByText('1')).toBeInTheDocument();
    expect(within(bereich('serie')).getByText('Heute ist geschafft.')).toBeInTheDocument();
  });

  it('zeigt die Woche als sieben Tage', async () => {
    zeige(await mitLerntag(10));
    await warteAufInhalt();
    const tage = within(bereich('woche')).getAllByRole('listitem');
    expect(tage).toHaveLength(7);
    // Genau einer ist ein Lerntag, und genau einer ist heute.
    expect(tage.filter((li) => li.dataset.lerntag === 'ja')).toHaveLength(1);
    expect(tage.filter((li) => li.dataset.heute === 'ja')).toHaveLength(1);
  });

  it('nennt die Ruhetage ruhig und ohne Mahnung', async () => {
    zeige(await mitLerntag(10));
    await warteAufInhalt();
    /*
      Ein- oder Mehrzahl, je nachdem, wie viele die Woche noch hergibt – die
      Prüfung nimmt beides. Was sie ausschließt, steht weiter oben: kein
      „verloren", kein Countdown, keine Herzen.
    */
    expect(within(bereich('serie')).getByText(/Ruhetag(e)?/)).toBeInTheDocument();
  });

  it('zeigt die längste Serie als Nebensache, wenn sie größer ist', async () => {
    const cloud = createFakeCloud({ now: () => '2026-10-06T08:00:00Z' });
    cloud.signInAs('u-lernend');
    await cloud.repositories.learnerSettings!.confirmTimeZone('Europe/Berlin');
    // Eine alte Reihe von fünf Tagen, dann eine Lücke, dann heute.
    for (let i = 0; i < 5; i += 1) {
      cloud.spieleEreignisseEin({
        userId: 'u-lernend',
        recordedAt: `2026-09-0${i + 1}T10:00:00Z`,
        anzahl: 11,
        kennung: `alt-${i}`,
      });
    }
    cloud.spieleEreignisseEin({
      userId: 'u-lernend',
      recordedAt: '2026-10-06T07:00:00Z',
      anzahl: 11,
      kennung: 'heute',
    });

    zeige(cloud);
    await warteAufInhalt();
    const serie = bereich('serie');
    expect(within(serie).getByText('1')).toBeInTheDocument();
    expect(within(serie).getByText(/Am längsten warst du 5 Tage/)).toBeInTheDocument();
    // Ruhig, nicht strafend: kein „verloren", keine Messlatte.
    expect(serie.textContent).not.toContain('verloren');
  });

  it('zeigt die längste Serie nicht, wenn sie dieselbe Zahl wäre', async () => {
    zeige(await mitLerntag(10));
    await warteAufInhalt();
    expect(within(bereich('serie')).queryByText(/Am längsten/)).toBeNull();
  });

  it('zeigt den Wochenfortschritt erst mit Ziel und Zeitzone', async () => {
    const cloud = await mitLerntag(10);
    await cloud.repositories.learnerSettings!.setWeeklyGoalDays(3);

    zeige(cloud);
    await warteAufInhalt();
    const balken = within(bereich('ziele')).getByRole('progressbar');
    expect(balken).toHaveAttribute('aria-valuenow', '1');
    expect(balken).toHaveAttribute('aria-valuemax', '3');
  });
});

/* ====================================== Zugänglichkeit ================== */

describe('Die Seite lässt sich mit der Tastatur bedienen', () => {
  it('gibt jedem Bereich eine Überschrift der zweiten Ebene', async () => {
    zeige(frischesKonto());
    await warteAufInhalt();

    const zweite = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    for (const titel of [
      'Weiterlernen',
      'Fällige Wiederholungen',
      'Meine Kurse',
      'Zuletzt verwendet',
      'Diese Woche',
      'Lernserie',
      'Ziele',
    ]) {
      expect(zweite, `„${titel}" fehlt als Überschrift`).toContain(titel);
    }
  });

  it('erreicht die Bestätigung mit der Tabulatortaste', async () => {
    zeige(frischesKonto());
    await warteAufInhalt();
    await screen.findByRole('heading', { name: 'In welcher Zeitzone lernst du?' });

    const user = userEvent.setup();
    const knopf = screen.getByRole('button', { name: 'Stimmt, bestätigen' });
    // Nicht `focus()` aufrufen, sondern wirklich tabben – sonst prüfte das nichts.
    for (let i = 0; i < 30 && document.activeElement !== knopf; i += 1) {
      await user.tab();
    }
    expect(document.activeElement).toBe(knopf);
  });

  it('beschreibt jeden Wochentag auch ohne Farbe', async () => {
    /*
      Die Punkte tragen ihre Aussage für Sehende über Form **und** Farbe.
      Für eine Bildschirmleserin steht daneben ein Satz – ohne ihn wäre die
      Woche eine Reihe aus sieben Listenpunkten ohne Inhalt.
    */
    const cloud = createFakeCloud({ now: () => '2026-10-06T08:00:00Z' });
    cloud.signInAs('u-lernend');
    await cloud.repositories.learnerSettings!.confirmTimeZone('Europe/Berlin');

    zeige(cloud);
    await warteAufInhalt();
    const tage = within(bereich('woche')).getAllByRole('listitem');
    for (const tag of tage) {
      expect(tag.textContent).toMatch(/Aufgaben|noch nicht dran/);
    }
  });
});
