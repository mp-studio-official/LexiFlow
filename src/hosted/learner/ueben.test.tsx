// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RepositoryProvider } from '../../application/RepositoryContext';
import { createFakeCloud, type FakeCloud } from '../../application/fakeCloudRepositories';
import { antwortEreignis } from '../../application/progressEvents';
import { makePack } from '../../test/fixtures';
import type { EntryProgress } from '../../domain/schema';
import { HostedRoutes } from '../HostedApp';
import { SessionProvider } from '../SessionContext';

/**
 * „Üben" (5B.5) — am echten Router.
 *
 * ## Die Regel, die jede Prüfung hier trägt
 *
 * Eine Karte steht nur da, wenn ihr Weg **jetzt** funktioniert. Deshalb wird
 * jede sichtbare Karte auch geöffnet: Eine Prüfung, die nur zählt, wie viele
 * Karten gerendert wurden, bliebe grün, wenn alle ins Leere führten.
 *
 * `<Route path="*">` schickt jede tote Adresse auf die Landungsseite. Keine
 * Erreichbarkeitsprüfung hier gilt deshalb als bestanden, ohne dass die
 * Zielseite erkennbar **und** die Landungsseite abwesend ist.
 */

afterEach(cleanup);

const LANDUNG = 'LexiFlow';

function zeige(cloud: FakeCloud, route: string) {
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

/** Ein Kurs mit zugewiesenem Paket und einer lernenden Person darin. */
async function kursMitPaket(richtung: 'en-de' | 'both' = 'both') {
  const cloud = createFakeCloud();
  cloud.signInAs('u-lehrerin');
  const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
  const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});
  const roh = makePack();
  /*
    Die Richtung ist hier kein Beiwerk: Nur ein Paket mit **beiden**
    Richtungen bietet überhaupt eine Wahl an (`directionChoicesFor`). Mit
    `en-de` wäre „Englisch → Deutsch" dieselbe Runde unter anderem Namen — und
    die Karte darf dann nicht erscheinen.
  */
  const pack = { ...roh, meta: { ...roh.meta, direction: richtung } };
  await cloud.repositories.packs!.saveDraft(pack);
  const revision = await cloud.repositories.publication!.publish(pack.meta.id);
  await cloud.repositories.publication!.assignToCourse(kurs.id, pack.meta.id, revision.revision, 0);

  cloud.signInAs('u-lernend');
  await cloud.repositories.invitations!.redeemCode(code);
  return { cloud, courseId: kurs.id, pack, titel: pack.meta.title };
}

/**
 * Eine falsche Antwort auf eine Vokabel buchen — zweimal macht sie schwierig.
 *
 * Über den Vertrag und nicht am Zustand vorbei: Was die Regel „schwierig"
 * sieht, soll derselbe Weg erzeugt haben, den auch eine echte Antwort nimmt.
 */
async function falschBeantworten(
  cloud: FakeCloud,
  courseId: string,
  packId: string,
  entryId: string,
  male: number,
) {
  const progress = cloud.repositories.progress!;
  let vorher: EntryProgress | undefined;
  for (let runde = 0; runde < male; runde += 1) {
    /*
      Die Kette lokal fortschreiben: Jedes Ereignis trägt die Fassung, von der
      aus gerechnet wurde. Zweimal von derselben Fassung aus wäre ein Konflikt,
      und der zweite Fehler käme nie an — die Vokabel bliebe „nicht schwierig",
      und der Test wäre grün, ohne geprüft zu haben.
    */
    const { event, nachher } = antwortEreignis({
      courseId,
      packId,
      entryId,
      direction: 'en-de',
      outcome: 'wrong',
      ...(vorher ? { vorher } : {}),
      now: new Date(),
    });
    const offen = await progress.recordEvents([event]);
    expect(offen, `Antwort ${runde + 1} kam nicht an`).toEqual([]);
    vorher = nachher;
  }
}

describe('die Route /ueben gibt es wirklich', () => {
  it('eine lernende Person sieht den Übungsbereich, nicht die Landungsseite', async () => {
    const { cloud } = await kursMitPaket();
    zeige(cloud, '/ueben');
    expect(await screen.findByRole('heading', { name: 'Üben', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: LANDUNG, level: 1 })).toBeNull();
  });

  it('eine Lehrkraft in der eigenen Vorschau ebenfalls', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    zeige(cloud, '/ueben');
    expect(await screen.findByRole('heading', { name: 'Üben', level: 1 })).toBeInTheDocument();
  });

  it('wer nicht angemeldet ist, landet bei der Anmeldung', async () => {
    zeige(createFakeCloud(), '/ueben');
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: LANDUNG, level: 1 })).toBeNull();
  });

  it('auf /ueben ist „Üben" in beiden Größen aktiv', async () => {
    const { cloud } = await kursMitPaket();
    zeige(cloud, '/ueben');
    await screen.findByRole('heading', { name: 'Üben', level: 1 });
    for (const wahl of ['.huelle-leiste', '.huelle-unten']) {
      const nav = document.querySelector(wahl);
      expect(nav, `${wahl} fehlt`).not.toBeNull();
      expect(
        (nav as HTMLElement).querySelector('[aria-current="page"]')?.getAttribute('aria-label'),
      ).toBe('Üben');
    }
  });
});

describe('nur Karten, deren Weg heute funktioniert', () => {
  it('ein frisches Paket zeigt die Richtungen — und keine fälligen, keine schwierigen', async () => {
    const { cloud } = await kursMitPaket('both');
    zeige(cloud, '/ueben');
    await screen.findByRole('heading', { name: 'Üben', level: 1 });

    expect(await screen.findByRole('heading', { name: 'Englisch → Deutsch' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Deutsch → Englisch' })).toBeInTheDocument();

    /* Noch nie geantwortet: nichts fällig, nichts schwierig — also keine Karte. */
    expect(screen.queryByRole('heading', { name: 'Fällige Wiederholungen' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Schwierige Wörter' })).toBeNull();
  });

  it('zweimal daneben macht ein Wort schwierig — und die Karte erscheint', async () => {
    const { cloud, courseId, pack } = await kursMitPaket();
    await falschBeantworten(cloud, courseId, pack.meta.id, pack.entries[0]!.id, 2);

    zeige(cloud, '/ueben');
    const karte = await screen.findByRole('heading', { name: 'Schwierige Wörter' });
    const kasten = karte.closest('div') as HTMLElement;
    expect(within(kasten).getByRole('link', { name: 'Unit 3 – Sports' })).toBeInTheDocument();
  });

  it('ein Paket mit nur einer Richtung bietet keine Richtungskarte an', async () => {
    /*
      Eine Auswahl mit genau einer gültigen Option ist keine Auswahl, sondern
      eine Attrappe — dieselbe Regel, die `directionChoicesFor` schon kennt.
    */
    const { cloud } = await kursMitPaket('en-de');
    zeige(cloud, '/ueben');
    await screen.findByRole('heading', { name: 'Üben', level: 1 });
    expect(await screen.findByRole('heading', { name: 'Gerade nichts offen' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Englisch → Deutsch' })).toBeNull();
  });

  it('Zeitformen und Spiele kommen nicht vor', async () => {
    const { cloud, courseId, pack } = await kursMitPaket();
    await falschBeantworten(cloud, courseId, pack.meta.id, pack.entries[0]!.id, 2);
    zeige(cloud, '/ueben');
    await screen.findByRole('heading', { name: 'Üben', level: 1 });
    for (const verboten of [/Zeitform/i, /Spiel/i, /bald/i, /demnächst/i, /kommt noch/i]) {
      expect(screen.queryByText(verboten), `${verboten} steht da`).toBeNull();
    }
  });

  it('nichts ist ausgegraut und nichts ist abgeschaltet', async () => {
    const { cloud } = await kursMitPaket();
    zeige(cloud, '/ueben');
    await screen.findByRole('heading', { name: 'Üben', level: 1 });
    const inhalt = document.querySelector('main.huelle__inhalt') as HTMLElement;
    expect(inhalt.querySelectorAll('[disabled], [aria-disabled="true"]')).toHaveLength(0);
  });

  it('jede sichtbare Karte führt zu einer Runde, die wirklich startet', async () => {
    const { cloud, courseId, pack } = await kursMitPaket();
    await falschBeantworten(cloud, courseId, pack.meta.id, pack.entries[0]!.id, 2);
    zeige(cloud, '/ueben');
    /*
      Auf eine Karte warten, nicht auf die Überschrift: Die steht schon
      während des Ladens da, und „alle Wege führen irgendwohin" wäre dann eine
      Aussage über null Wege.
    */
    await screen.findByRole('heading', { name: 'Schwierige Wörter' });

    const inhalt = document.querySelector('main.huelle__inhalt') as HTMLElement;
    const wege = [...inhalt.querySelectorAll('a')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((weg) => weg.includes('/ueben/'));
    expect(wege.length, 'keine Karte führt irgendwohin').toBeGreaterThan(0);

    for (const weg of wege) {
      cleanup();
      zeige(cloud, weg);
      /*
        Die Runde erkennt man am Pakettitel als `h1` — die Landungsseite trägt
        dort „LexiFlow". Ohne diesen zweiten Teil wäre jede tote Adresse grün.
      */
      expect(
        await screen.findByRole('heading', { name: 'Unit 3 – Sports', level: 1 }),
        `${weg} startet keine Runde`,
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: LANDUNG, level: 1 })).toBeNull();
    }
  });

  it('ohne Paket bleibt es ruhig statt ermahnend', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lernend');
    zeige(cloud, '/ueben');
    expect(await screen.findByRole('heading', { name: 'Noch nichts zum Üben' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zu deinen Kursen' })).toHaveAttribute('href', '/lernen');
  });
});

describe('E14: die laufende Runde hat keine Bereichsnavigation', () => {
  it('in der Runde steht kein `<nav>` — und daneben ein Weg hinaus', async () => {
    const { cloud, courseId, pack } = await kursMitPaket();
    zeige(cloud, `/lernen/kurs/${courseId}/ueben/${pack.meta.id}`);
    await screen.findByRole('heading', { name: 'Unit 3 – Sports', level: 1 });

    expect(screen.queryAllByRole('navigation', { name: 'Hauptnavigation' })).toHaveLength(0);
    expect(document.querySelectorAll('.huelle-leiste__nav, .huelle-unten')).toHaveLength(0);
    /*
      Was bleibt: der Weg hinaus im Inhalt und „Abmelden". E14 nimmt die
      Bereichsnavigation weg, nicht die Möglichkeit, das Konto zu verlassen —
      und „Abmelden" ist kein Ausstieg aus Versehen, es fragt nicht die Runde,
      sondern beendet die Sitzung.
    */
    expect(screen.getByRole('button', { name: 'Runde beenden' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Zurück zum Kurs' }), 'der alte Verweis lebt noch').toBeNull();
    expect(screen.getAllByRole('button', { name: 'Abmelden' }).length).toBeGreaterThan(0);
  });

  it('außerhalb der Runde ist sie wieder da', async () => {
    const { cloud, courseId } = await kursMitPaket();
    zeige(cloud, `/lernen/kurs/${courseId}`);
    await screen.findAllByRole('navigation', { name: 'Hauptnavigation' });
  });
});

describe('die Karte bestimmt wirklich, was geübt wird', () => {
  /*
    Die gefährlichste Art, diesen Bereich zu bauen: Karten, die alle dieselbe
    gemischte Runde starten. Alles sähe richtig aus, und die Beschriftung wäre
    eine Behauptung. Deshalb wird hier nicht die Karte geprüft, sondern die
    Runde, die sie öffnet.
  */
  it('„Schwierige Wörter" übt genau das schwierige Wort', async () => {
    const { cloud, courseId, pack } = await kursMitPaket('both');
    const schwierig = pack.entries[1]!;
    await falschBeantworten(cloud, courseId, pack.meta.id, schwierig.id, 2);

    zeige(cloud, `/lernen/kurs/${courseId}/ueben/${pack.meta.id}?auswahl=schwierig`);
    await screen.findByRole('heading', { name: 'Unit 3 – Sports', level: 1 });

    /*
      Eine Runde aus genau einer Aufgabe: „Noch 1 in dieser Runde". Ohne die
      Einengung wären es so viele, wie die Rundenlänge hergibt.
    */
    expect(await screen.findByText(/Noch 1 in dieser Runde/)).toBeInTheDocument();
  });

  it('ohne Auswahl ist die Runde länger', async () => {
    const { cloud, courseId, pack } = await kursMitPaket('both');
    await falschBeantworten(cloud, courseId, pack.meta.id, pack.entries[1]!.id, 2);

    zeige(cloud, `/lernen/kurs/${courseId}/ueben/${pack.meta.id}`);
    await screen.findByRole('heading', { name: 'Unit 3 – Sports', level: 1 });
    const text = (document.querySelector('main.huelle__inhalt') as HTMLElement).textContent ?? '';
    const treffer = /Noch (\d+) in dieser Runde/.exec(text);
    expect(treffer, 'keine Rundenlänge gefunden').not.toBeNull();
    expect(Number(treffer?.[1]), 'die Einengung wirkt auch ohne Auswahl').toBeGreaterThan(1);
  });

  it('eine erfundene Auswahl engt nichts ein, statt eine leere Runde zu bauen', async () => {
    const { cloud, courseId, pack } = await kursMitPaket('both');
    zeige(cloud, `/lernen/kurs/${courseId}/ueben/${pack.meta.id}?auswahl=unfug`);
    await screen.findByRole('heading', { name: 'Unit 3 – Sports', level: 1 });
    expect(screen.getByText(/in dieser Runde/)).toBeInTheDocument();
  });
});

describe('ausschließlich eigene Daten', () => {
  it('im Quelltext gibt es keinen Weg zu fremden Ständen', () => {
    const ohneKommentare = (datei: string) =>
      readFileSync(resolve(import.meta.dirname, datei), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const seite = ohneKommentare('UebenPage.tsx');
    /* Der Vertrag kennt nur `myEntryProgress` — hier wird nichts anderes gerufen. */
    expect(seite).toContain('myEntryProgress');
    expect(seite).not.toMatch(/members\(|allProgress|forUser|userId/);
    expect(seite).not.toMatch(/Rangliste|Durchschnitt|Vergleich|Klasse\b/i);
  });

  it('und die Auswahl kennt keine fremde Person', () => {
    const quelle = readFileSync(
      resolve(import.meta.dirname, '../../domain/uebungsformen.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(quelle).not.toMatch(/userId|member|andere/i);
  });
});
