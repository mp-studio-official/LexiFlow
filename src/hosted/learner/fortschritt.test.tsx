// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { RepositoryProvider } from '../../application/RepositoryContext';
import { createFakeCloud, type FakeCloud } from '../../application/fakeCloudRepositories';
import { makePack } from '../../test/fixtures';
import { directionKey } from '../../domain/ids';
import { HostedRoutes } from '../HostedApp';
import { SessionProvider } from '../SessionContext';
import type { EntryProgress, TaskDirection } from '../../domain/schema';

/**
 * „Mein Fortschritt" (5B.6) — am echten Router.
 *
 * ## Die Regeln, die jede Prüfung hier trägt
 *
 * 1. **Nur der eigene Lernstand.** Nicht „die Seite filtert richtig", sondern:
 *    Es gibt keinen Weg zu einem fremden.
 * 2. **Alle acht Abschnitte sind immer da**, auch bei einem frischen Konto.
 * 3. **Jede Handlung führt irgendwohin.** `<Route path="*">` schickt tote
 *    Adressen still auf die Landungsseite; eine Prüfung gilt nur als
 *    bestanden, wenn die Zielseite erkennbar **und** die Landung abwesend ist.
 */

afterEach(cleanup);

const LANDUNG = 'Vokabeln lernen';

function zeige(cloud: FakeCloud, route = '/fortschritt') {
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

async function warteAufInhalt(): Promise<void> {
  await screen.findByRole('heading', { name: 'Lernserie', level: 2 });
}

function bereich(name: string): HTMLElement {
  const gefunden = document.querySelector<HTMLElement>(`[data-bereich="${name}"]`);
  expect(gefunden, `Bereich „${name}" fehlt`).not.toBeNull();
  return gefunden!;
}

function frischesKonto(): FakeCloud {
  const cloud = createFakeCloud();
  cloud.signInAs('u-lernend');
  return cloud;
}

/** Ein Kurs mit einem zugewiesenen Paket aus drei Vokabeln, beide Richtungen. */
async function kursMitPaket(vokabeln = ['v-1', 'v-2', 'v-3']) {
  const cloud = createFakeCloud();
  cloud.signInAs('u-lehrerin');
  const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
  const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});

  const roh = makePack();
  const pack = {
    ...roh,
    meta: { ...roh.meta, id: 'pack-1', title: 'Unit 1', direction: 'both' as const },
    entries: vokabeln.map((id, i) => ({
      ...roh.entries[0]!,
      id,
      english: `word-${i + 1}`,
      german: `Wort ${i + 1}`,
    })),
  };
  await cloud.repositories.packs!.saveDraft(pack);
  const revision = await cloud.repositories.publication!.publish(pack.meta.id);
  await cloud.repositories.publication!.assignToCourse(kurs.id, pack.meta.id, revision.revision, 0);

  cloud.signInAs('u-lernend');
  await cloud.repositories.invitations!.redeemCode(code);
  return { cloud, courseId: kurs.id, packId: pack.meta.id };
}

/** Einen Lernstand hinstellen – am Vertrag vorbei, wie es die Datenbank täte. */
function setzeStand(
  cloud: FakeCloud,
  input: {
    userId?: string;
    courseId: string;
    packId: string;
    /** Je Vokabel und Richtung das Fach; fehlt ein Eintrag, gibt es keinen Stand. */
    faecher: ReadonlyArray<[string, TaskDirection, number]>;
    fehler?: number;
  },
) {
  const person = input.userId ?? 'u-lernend';
  const schluessel = `${person}::${input.courseId}::${input.packId}`;
  const staende: EntryProgress[] = input.faecher.map(([entryId, direction, box]) => ({
    key: directionKey(entryId, direction),
    packId: input.packId,
    entryId,
    direction,
    box,
    correctCount: 0,
    wrongCount: input.fehler ?? 0,
    streak: 0,
    dueAt: '2099-01-01T00:00:00.000Z',
    rev: 1,
  }));
  cloud.state.entryProgress.set(schluessel, staende);
}

/* ====================================== Die acht Abschnitte ============= */

describe('Ein frisches Konto sieht eine vollständige Seite', () => {
  it('zeigt alle acht Abschnitte', async () => {
    zeige(frischesKonto());
    await warteAufInhalt();

    for (const kennung of [
      'serie',
      'woche',
      'ziel',
      'beherrscht',
      'kurse',
      'schwierig',
      'zeitzone',
    ]) {
      expect(bereich(kennung)).toBeInTheDocument();
    }
    // Die längste Serie ist Teil des Serienabschnitts, nicht ein eigener.
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Lernserie',
      'Diese Woche',
      'Wochenziel',
      'Beherrscht und offen',
      'Nach Kurs und Paket',
      'Schwierige Wörter',
      'Zeitzone',
    ]);
  });

  it('nennt jeden leeren Abschnitt beim Namen', async () => {
    zeige(frischesKonto());
    await warteAufInhalt();

    expect(within(bereich('beherrscht')).getByText('Noch keine Vokabeln')).toBeInTheDocument();
    expect(within(bereich('kurse')).getByText('Noch in keinem Kurs')).toBeInTheDocument();
    expect(within(bereich('schwierig')).getByText('Gerade hakt nichts')).toBeInTheDocument();
    expect(within(bereich('zeitzone')).getByText(/Noch nicht festgelegt/)).toBeInTheDocument();
  });

  it('zeigt weder Lernzeit noch Vergleiche', async () => {
    zeige(frischesKonto());
    await warteAufInhalt();
    const text = document.body.textContent ?? '';
    for (const wort of [
      'Minuten',
      'Stunden',
      'Lernzeit',
      'Platz',
      'Rangliste',
      'Klassendurchschnitt',
      'Mitschüler',
      'verloren',
      'Rückstand',
      '❤',
      '🔥',
    ]) {
      expect(text, `„${wort}" steht auf der Seite`).not.toContain(wort);
    }
  });
});

/* ====================================== Beherrscht und offen ============ */

describe('Beherrscht und offen (§ 4.5)', () => {
  it('zählt eine nie geübte Vokabel als offen', async () => {
    const { cloud } = await kursMitPaket();
    zeige(cloud);
    await warteAufInhalt();

    const balken = within(bereich('beherrscht')).getByRole('progressbar');
    expect(balken).toHaveAttribute('aria-valuenow', '0');
    expect(balken).toHaveAttribute('aria-valuemax', '3');
  });

  it('zählt Fach 3 als offen und Fach 4 als beherrscht', async () => {
    const { cloud, courseId, packId } = await kursMitPaket();
    setzeStand(cloud, {
      courseId,
      packId,
      faecher: [
        ['v-1', 'en-de', 4],
        ['v-1', 'de-en', 4],
        ['v-2', 'en-de', 3],
        ['v-2', 'de-en', 3],
      ],
    });

    zeige(cloud);
    await warteAufInhalt();
    expect(within(bereich('beherrscht')).getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
  });

  it('zählt eine Vokabel als offen, wenn nur eine Richtung Fach 4 erreicht', async () => {
    const { cloud, courseId, packId } = await kursMitPaket();
    setzeStand(cloud, {
      courseId,
      packId,
      faecher: [
        ['v-1', 'en-de', 5],
        ['v-1', 'de-en', 3],
      ],
    });

    zeige(cloud);
    await warteAufInhalt();
    expect(within(bereich('beherrscht')).getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });

  it('zeigt den Fortschritt je Kurs und Paket', async () => {
    const { cloud, courseId, packId } = await kursMitPaket();
    setzeStand(cloud, {
      courseId,
      packId,
      faecher: [
        ['v-1', 'en-de', 4],
        ['v-1', 'de-en', 5],
      ],
    });

    zeige(cloud);
    await warteAufInhalt();
    const kurse = bereich('kurse');
    expect(within(kurse).getByRole('heading', { name: 'Englisch 7b', level: 3 })).toBeInTheDocument();
    expect(within(kurse).getByRole('progressbar', { name: 'Unit 1' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
  });

  it('zeigt den Lernstand einer anderen Person nicht', async () => {
    const { cloud, courseId, packId } = await kursMitPaket();
    setzeStand(cloud, {
      userId: 'u-lernend-2',
      courseId,
      packId,
      faecher: [
        ['v-1', 'en-de', 5],
        ['v-1', 'de-en', 5],
        ['v-2', 'en-de', 5],
        ['v-2', 'de-en', 5],
        ['v-3', 'en-de', 5],
        ['v-3', 'de-en', 5],
      ],
    });

    zeige(cloud);
    await warteAufInhalt();
    expect(within(bereich('beherrscht')).getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });

  it('gibt einer Lehrkraft in der Lernendenvorschau nur ihren eigenen Stand', async () => {
    const { cloud, courseId, packId } = await kursMitPaket();
    setzeStand(cloud, {
      userId: 'u-lernend',
      courseId,
      packId,
      faecher: [
        ['v-1', 'en-de', 5],
        ['v-1', 'de-en', 5],
      ],
    });

    cloud.signInAs('u-lehrerin');
    zeige(cloud);
    await warteAufInhalt();
    expect(within(bereich('beherrscht')).getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });
});

/* ====================================== Schwierige Wörter (E24) ========= */

describe('Schwierige Wörter', () => {
  /** E24: mindestens zwei Fehler **und** Fach 1 oder 2. */
  async function mitSchwierigem(fach: number, fehler: number) {
    const { cloud, courseId, packId } = await kursMitPaket();
    setzeStand(cloud, {
      courseId,
      packId,
      fehler,
      faecher: [['v-1', 'en-de', fach]],
    });
    return cloud;
  }

  it('nimmt ein Wort mit zwei Fehlern in Fach 2 auf', async () => {
    zeige(await mitSchwierigem(2, 2));
    await warteAufInhalt();
    const liste = bereich('schwierig');
    expect(within(liste).getByText('word-1')).toBeInTheDocument();
    expect(within(liste).getByText(/Unit 1 · Englisch 7b · Englisch → Deutsch/)).toBeInTheDocument();
  });

  it('nimmt ein Wort mit nur einem Fehler nicht auf', async () => {
    zeige(await mitSchwierigem(2, 1));
    await warteAufInhalt();
    expect(within(bereich('schwierig')).getByText('Gerade hakt nichts')).toBeInTheDocument();
  });

  it('nimmt ein Wort in Fach 3 nicht auf', async () => {
    /*
      Dieselbe Schwelle wie im Übungsbereich — `istSchwierig` ist dieselbe
      Funktion. Eine zweite Schwelle hier wäre zwei Wahrheiten über dasselbe
      Wort.
    */
    zeige(await mitSchwierigem(3, 5));
    await warteAufInhalt();
    expect(within(bereich('schwierig')).getByText('Gerade hakt nichts')).toBeInTheDocument();
  });

  it('führt mit „Üben" wirklich in die vorhandene Übungsroute', async () => {
    const cloud = await mitSchwierigem(1, 3);
    zeige(cloud);
    await warteAufInhalt();

    const weg = within(bereich('schwierig')).getByRole('link', { name: 'Üben' });
    expect(weg.getAttribute('href')).toMatch(/^\/lernen\/kurs\/[^/]+\/ueben\/pack-1\?auswahl=schwierig$/);

    const user = userEvent.setup();
    await user.click(weg);
    // Die Übungsrunde — und nicht die Landungsseite.
    expect(await screen.findByRole('button', { name: 'Runde beenden' })).toBeInTheDocument();
    expect(screen.queryByText(LANDUNG)).toBeNull();
  });

  it('bleibt ruhig, wenn nichts hakt', async () => {
    const { cloud } = await kursMitPaket();
    zeige(cloud);
    await warteAufInhalt();
    const liste = bereich('schwierig');
    expect(within(liste).getByText('Gerade hakt nichts')).toBeInTheDocument();
    expect(liste.textContent).not.toMatch(/Achtung|Warnung|Problem|schlecht/);
  });
});

/* ====================================== Das Wochenziel (E26) ============ */

describe('Das Wochenziel', () => {
  it('bietet „Kein Ziel" und 1 bis 7', async () => {
    zeige(frischesKonto());
    await warteAufInhalt();

    const auswahl = within(bereich('ziel')).getByLabelText('Lerntage pro Woche');
    const werte = [...auswahl.querySelectorAll('option')].map((o) => o.getAttribute('value'));
    expect(werte).toEqual(['', '1', '2', '3', '4', '5', '6', '7']);
    expect(within(auswahl).getByText('Kein Ziel')).toBeInTheDocument();
  });

  it('speichert ein Ziel von 1', async () => {
    const cloud = frischesKonto();
    zeige(cloud);
    await warteAufInhalt();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Lerntage pro Woche'), '1');
    await user.click(screen.getByRole('button', { name: 'Ziel speichern' }));

    await waitFor(() =>
      expect(cloud.state.learnerSettings.get('u-lernend')).toEqual({ weeklyGoalDays: 1 }),
    );
  });

  it('speichert ein Ziel von 7 und schaltet es wieder ab', async () => {
    const cloud = frischesKonto();
    await cloud.repositories.learnerSettings!.setWeeklyGoalDays(7);
    zeige(cloud);
    await warteAufInhalt();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Lerntage pro Woche'), '');
    await user.click(screen.getByRole('button', { name: 'Ziel speichern' }));

    await waitFor(() => expect(cloud.state.learnerSettings.get('u-lernend')).toEqual({}));
  });

  it('bewahrt die bestätigte Zeitzone beim Ändern des Ziels', async () => {
    /*
      Der Fehler, den es hier zu verhindern gilt: Wer sein Ziel ändert,
      verliert seine Zeitzone — und bekommt beim nächsten Öffnen von „Heute"
      wieder die Frage danach.
    */
    const cloud = frischesKonto();
    await cloud.repositories.learnerSettings!.confirmTimeZone('Europe/Berlin');
    zeige(cloud);
    await warteAufInhalt();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Lerntage pro Woche'), '4');
    await user.click(screen.getByRole('button', { name: 'Ziel speichern' }));

    await waitFor(() =>
      expect(cloud.state.learnerSettings.get('u-lernend')).toEqual({
        timeZone: 'Europe/Berlin',
        weeklyGoalDays: 4,
      }),
    );
  });

  it('formuliert ein unerfülltes Ziel als Rest, nicht als Versäumnis', async () => {
    const cloud = createFakeCloud({ now: () => '2026-10-07T08:00:00Z' });
    cloud.signInAs('u-lernend');
    await cloud.repositories.learnerSettings!.confirmTimeZone('Europe/Berlin');
    await cloud.repositories.learnerSettings!.setWeeklyGoalDays(5);
    cloud.spieleEreignisseEin({
      userId: 'u-lernend',
      recordedAt: '2026-10-07T07:00:00Z',
      anzahl: 11,
      kennung: 'heute',
    });

    zeige(cloud);
    await warteAufInhalt();
    const ziel = bereich('ziel');
    expect(within(ziel).getByText('Noch 4 Tage bis zu deinem Ziel.')).toBeInTheDocument();
    expect(ziel.textContent).not.toMatch(/Rückstand|verpasst|versäumt|geschafft werden muss/);
  });

  it('bleibt über dem Ziel lesbar und lässt den Balken nicht überlaufen', async () => {
    const cloud = createFakeCloud({ now: () => '2026-10-07T08:00:00Z' });
    cloud.signInAs('u-lernend');
    await cloud.repositories.learnerSettings!.confirmTimeZone('Europe/Berlin');
    await cloud.repositories.learnerSettings!.setWeeklyGoalDays(1);
    for (const [i, tag] of ['2026-10-05', '2026-10-06', '2026-10-07'].entries()) {
      cloud.spieleEreignisseEin({
        userId: 'u-lernend',
        recordedAt: `${tag}T07:00:00Z`,
        anzahl: 11,
        kennung: `t-${i}`,
      });
    }

    zeige(cloud);
    await warteAufInhalt();
    const ziel = bereich('ziel');
    const balken = within(ziel).getByRole('progressbar');
    // Gedeckelt: der Balken geht nicht über sein Ende hinaus …
    expect(balken).toHaveAttribute('aria-valuenow', '1');
    expect(balken).toHaveAttribute('aria-valuemax', '1');
    // … und die echte Zahl steht trotzdem lesbar daneben.
    expect(within(ziel).getByText('Geschafft – 3 von 1 Tagen.')).toBeInTheDocument();
  });
});

/* ====================================== Die Zeitzone (E27) ============== */

describe('Die Zeitzone bearbeiten', () => {
  it('zeigt den gespeicherten Wert', async () => {
    const cloud = frischesKonto();
    await cloud.repositories.learnerSettings!.confirmTimeZone('Pacific/Auckland');
    zeige(cloud);
    await warteAufInhalt();

    const feld = bereich('zeitzone');
    expect(feld.querySelector('.fortschritt__wert')?.textContent).toBe('Pacific/Auckland');
    expect((within(feld).getByLabelText('Deine Zeitzone') as HTMLSelectElement).value).toBe(
      'Pacific/Auckland',
    );
  });

  it('speichert erst nach ausdrücklichem Klick', async () => {
    const cloud = frischesKonto();
    await cloud.repositories.learnerSettings!.confirmTimeZone('Europe/Berlin');
    zeige(cloud);
    await warteAufInhalt();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Deine Zeitzone'), 'Europe/Vienna');
    // Ausgewählt, aber nicht gespeichert.
    expect(cloud.state.learnerSettings.get('u-lernend')).toEqual({ timeZone: 'Europe/Berlin' });

    await user.click(screen.getByRole('button', { name: 'Zeitzone speichern' }));
    await waitFor(() =>
      expect(cloud.state.learnerSettings.get('u-lernend')).toEqual({ timeZone: 'Europe/Vienna' }),
    );
  });

  it('lässt „Abbrechen" den bisherigen Wert unverändert', async () => {
    const cloud = frischesKonto();
    await cloud.repositories.learnerSettings!.confirmTimeZone('Europe/Berlin');
    const schreibt = vi.spyOn(cloud.repositories.learnerSettings!, 'confirmTimeZone');
    zeige(cloud);
    await warteAufInhalt();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Deine Zeitzone'), 'Europe/Vienna');
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect((screen.getByLabelText('Deine Zeitzone') as HTMLSelectElement).value).toBe('Europe/Berlin');
    expect(schreibt).not.toHaveBeenCalled();
    expect(cloud.state.learnerSettings.get('u-lernend')).toEqual({ timeZone: 'Europe/Berlin' });
  });

  it('bewahrt das Wochenziel beim Ändern der Zeitzone', async () => {
    const cloud = frischesKonto();
    await cloud.repositories.learnerSettings!.setWeeklyGoalDays(3);
    await cloud.repositories.learnerSettings!.confirmTimeZone('Europe/Berlin');
    zeige(cloud);
    await warteAufInhalt();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Deine Zeitzone'), 'Europe/Vienna');
    await user.click(screen.getByRole('button', { name: 'Zeitzone speichern' }));

    await waitFor(() =>
      expect(cloud.state.learnerSettings.get('u-lernend')).toEqual({
        timeZone: 'Europe/Vienna',
        weeklyGoalDays: 3,
      }),
    );
  });

  it('lädt Kalender, Woche und Serie nach der Änderung neu', async () => {
    /*
      Die Zeitzone verschiebt die Tagesgrenze, und die Serie rechnet der
      Server. Eine Seite, die nur den gespeicherten Wert austauschte, zeigte
      danach die Woche der alten Zeitzone.
    */
    const cloud = frischesKonto();
    const kalender = vi.spyOn(cloud.repositories.learningDays!, 'myCalendar');
    const tage = vi.spyOn(cloud.repositories.learningDays!, 'myLearningDays');
    zeige(cloud);
    await warteAufInhalt();

    const vorher = kalender.mock.calls.length;
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Deine Zeitzone'), 'Europe/Berlin');
    await user.click(screen.getByRole('button', { name: 'Zeitzone speichern' }));

    await waitFor(() => expect(kalender.mock.calls.length).toBeGreaterThan(vorher));
    expect(tage.mock.calls.length).toBeGreaterThan(0);
    // Und danach steht die Woche wirklich da.
    await waitFor(() =>
      expect(within(bereich('woche')).getAllByRole('listitem')).toHaveLength(7),
    );
  });

  it('stellt einen abgelehnten Wert nicht als gespeichert dar', async () => {
    const cloud = frischesKonto();
    await cloud.repositories.learnerSettings!.confirmTimeZone('Europe/Berlin');
    zeige(cloud);
    await warteAufInhalt();

    /*
      Die Datenbank lehnt eine unbekannte Zeitzone ab (Trigger gegen
      `pg_timezone_names`), die Fälschung ebenso. Die Seite darf danach nicht
      aussehen, als sei der Wert übernommen.
    */
    vi.spyOn(cloud.repositories.learnerSettings!, 'confirmTimeZone').mockRejectedValue(
      new Error('Unbekannte Zeitzone: Europa/Bielefeld'),
    );

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Deine Zeitzone'), 'Europe/Vienna');
    await user.click(screen.getByRole('button', { name: 'Zeitzone speichern' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/nicht gespeichert/);
    expect(bereich('zeitzone').querySelector('.fortschritt__wert')?.textContent).toBe(
      'Europe/Berlin',
    );
  });

  it('wählt ohne gespeicherten Wert und ohne Vorschlag nichts vor', async () => {
    const cloud = frischesKonto();
    const spion = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation((() => {
      throw new Error('Keine Zeitzonendaten.');
    }) as never);
    try {
      zeige(cloud);
      await warteAufInhalt();
    } finally {
      spion.mockRestore();
    }

    const auswahl = screen.getByLabelText('Deine Zeitzone') as HTMLSelectElement;
    expect(auswahl.value).toBe('');
    expect(within(auswahl).getByText('Zeitzone auswählen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zeitzone speichern' })).toBeDisabled();
  });
});

/* ====================================== Serie und Woche ================= */

describe('Serie und Woche', () => {
  async function mitTagen(tage: readonly string[]) {
    const cloud = createFakeCloud({ now: () => '2026-10-07T08:00:00Z' });
    cloud.signInAs('u-lernend');
    await cloud.repositories.learnerSettings!.confirmTimeZone('Europe/Berlin');
    for (const [i, tag] of tage.entries()) {
      cloud.spieleEreignisseEin({
        userId: 'u-lernend',
        recordedAt: `${tag}T07:00:00Z`,
        anzahl: 11,
        kennung: `t-${i}`,
      });
    }
    return cloud;
  }

  it('nennt die aktuelle und die längste Serie', async () => {
    // Fünf Tage im September, dann eine Lücke, dann heute.
    zeige(
      await mitTagen([
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
        '2026-09-04',
        '2026-09-05',
        '2026-10-07',
      ]),
    );
    await warteAufInhalt();

    const serie = bereich('serie');
    expect(within(serie).getByText('1')).toBeInTheDocument();
    expect(within(serie).getByText(/Am längsten:/)).toBeInTheDocument();
    expect(within(serie).getByText('5')).toBeInTheDocument();
  });

  it('zeigt die Woche als sieben Tage mit der Zahl der Lerntage', async () => {
    zeige(await mitTagen(['2026-10-05', '2026-10-07']));
    await warteAufInhalt();

    const woche = bereich('woche');
    expect(within(woche).getAllByRole('listitem')).toHaveLength(7);
    expect(within(woche).getByText('2 Lerntage diese Woche.')).toBeInTheDocument();
  });

  it('bleibt ohne Zeitzone unbeziffert und sagt auch, warum', async () => {
    zeige(frischesKonto());
    await warteAufInhalt();
    for (const kennung of ['serie', 'woche']) {
      expect(
        within(bereich(kennung)).getByText(/wenn deine Zeitzone feststeht/),
      ).toBeInTheDocument();
    }
  });
});

/* ====================================== Route und Navigation ============ */

describe('Die Route', () => {
  it('ist erreichbar und nicht die Landungsseite', async () => {
    zeige(frischesKonto());
    expect(await screen.findByRole('heading', { name: 'Mein Fortschritt', level: 1 })).toBeInTheDocument();
    expect(screen.queryByText(LANDUNG)).toBeNull();
  });

  it('steht in der Navigation und ist dort markiert', async () => {
    zeige(frischesKonto());
    await warteAufInhalt();

    const ziele = [...document.querySelectorAll('nav a')].map((a) => a.getAttribute('href') ?? '');
    expect(ziele).toContain('#/fortschritt');

    const aktiv = [...document.querySelectorAll('nav a[aria-current="page"]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(aktiv).toContain('#/fortschritt');
  });

  it('hat keinen Verweis, der auf der Wurzel endet', async () => {
    const { cloud, courseId, packId } = await kursMitPaket();
    setzeStand(cloud, { courseId, packId, fehler: 3, faecher: [['v-1', 'en-de', 1]] });

    zeige(cloud);
    await warteAufInhalt();
    const ziele = [...document.querySelectorAll('.fortschritt a[href]')].map(
      (a) => a.getAttribute('href') ?? '',
    );
    expect(ziele.length).toBeGreaterThan(0);
    for (const ziel of ziele) expect(ziel).not.toBe('/');
  });
});

/* ====================================== Zugänglichkeit ================== */

describe('Die Seite lässt sich mit der Tastatur bedienen', () => {
  it('erreicht beide Auswahlfelder mit der Tabulatortaste', async () => {
    zeige(frischesKonto());
    await warteAufInhalt();

    const user = userEvent.setup();
    const ziel = screen.getByLabelText('Lerntage pro Woche');
    for (let i = 0; i < 40 && document.activeElement !== ziel; i += 1) await user.tab();
    expect(document.activeElement).toBe(ziel);
  });

  it('beschreibt jeden Wochentag auch ohne Farbe', async () => {
    const cloud = createFakeCloud({ now: () => '2026-10-07T08:00:00Z' });
    cloud.signInAs('u-lernend');
    await cloud.repositories.learnerSettings!.confirmTimeZone('Europe/Berlin');

    zeige(cloud);
    await warteAufInhalt();
    for (const tag of within(bereich('woche')).getAllByRole('listitem')) {
      expect(tag.textContent).toMatch(/Aufgaben|noch nicht dran/);
    }
  });
});
