// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RepositoryProvider } from '../../application/RepositoryContext';
import { createFakeCloud, type FakeCloud } from '../../application/fakeCloudRepositories';
import { makePack } from '../../test/fixtures';
import { HostedRoutes } from '../HostedApp';
import { SessionProvider } from '../SessionContext';

/**
 * 5B.15 — die vorhandenen Übungsformen sind im Portal erreichbar.
 *
 * ## Woran sich das entscheidet
 *
 * Nicht daran, dass vier Karten dastehen. Jede wird geöffnet, und die Ansicht
 * dahinter muss sich als **die** Ansicht ausweisen — Karteikarten blättern,
 * der Selbsttest sammelt, die Liste listet, das freie Üben stellt eine Runde
 * zusammen. Vier Karten, die alle in derselben gemischten Runde landen, wären
 * genau das Gegenteil dessen, was dieser Block herstellt.
 *
 * `<Route path="*">` schickt jede tote Adresse auf die Landungsseite. Keine
 * Prüfung hier gilt als bestanden, ohne dass die Landungsseite abwesend ist.
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

async function kursMitPaket() {
  const cloud = createFakeCloud();
  cloud.signInAs('u-lehrerin');
  const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
  const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});
  const roh = makePack();
  const pack = { ...roh, meta: { ...roh.meta, direction: 'both' as const } };
  await cloud.repositories.packs!.saveDraft(pack);
  const revision = await cloud.repositories.publication!.publish(pack.meta.id);
  await cloud.repositories.publication!.assignToCourse(kurs.id, pack.meta.id, revision.revision, 0);

  cloud.signInAs('u-lernend');
  await cloud.repositories.invitations!.redeemCode(code);
  return { cloud, courseId: kurs.id, packId: pack.meta.id, titel: pack.meta.title };
}

/** Jede Form mit ihrer Adresse und einem Merkmal, das nur sie hat. */
const FORMEN = [
  { karte: 'Karteikarten', pfad: 'karten', merkmal: /Lösung zeigen|Umdrehen|Karte \d+ von/i },
  { karte: 'Selbsttest', pfad: 'selbsttest', merkmal: /Selbsttest/i },
  { karte: 'Frei üben', pfad: 'frei', merkmal: /Runde zusammenstellen|Länge|Richtung/i },
  { karte: 'Vokabelliste', pfad: 'liste', merkmal: /Alle Wörter|Vokabeln|Liste/i },
] as const;

describe('alle vier Wege führen zu ihrer eigenen Ansicht', () => {
  it.each(FORMEN.map((f) => [f.karte, f.pfad, f.merkmal] as const))(
    '%s öffnet unter /ueben/%s eine eigene Ansicht',
    async (_karte, pfad, merkmal) => {
      const { cloud, courseId, packId } = await kursMitPaket();
      zeige(cloud, `/ueben/${pfad}/${courseId}/${packId}`);

      const inhalt = await screen.findByRole('main');
      await vi.waitFor(() => {
        expect(inhalt.textContent ?? '').toMatch(merkmal);
      });
      expect(screen.queryByRole('heading', { name: LANDUNG, level: 1 })).toBeNull();
    },
  );

  it('die Karten auf „Üben" zeigen genau auf diese Adressen', async () => {
    const { cloud, courseId, packId } = await kursMitPaket();
    zeige(cloud, '/ueben');
    await screen.findByRole('heading', { name: 'Karteikarten' });

    const inhalt = document.querySelector('main.huelle__inhalt') as HTMLElement;
    const wege = [...inhalt.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    for (const { pfad } of FORMEN) {
      expect(wege, `${pfad} fehlt`).toContain(`/ueben/${pfad}/${courseId}/${packId}`);
    }
  });

  it('keine zwei sichtbaren Karten führen an dieselbe Adresse', async () => {
    const { cloud } = await kursMitPaket();
    zeige(cloud, '/ueben');
    await screen.findByRole('heading', { name: 'Karteikarten' });

    const inhalt = document.querySelector('main.huelle__inhalt') as HTMLElement;
    const wege = [...inhalt.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(new Set(wege).size, `doppelte Adresse in ${wege.join(' | ')}`).toBe(wege.length);
  });
});

describe('nur zugewiesene Pakete, nur eigene Daten', () => {
  it.each(FORMEN.map((f) => [f.pfad] as const))(
    'ein nicht zugewiesenes Paket gibt es unter /ueben/%s nicht',
    async (pfad) => {
      const { cloud, courseId } = await kursMitPaket();
      zeige(cloud, `/ueben/${pfad}/${courseId}/pack-erfunden`);

      expect(
        await screen.findByText(/liegt nicht \(mehr\) in diesem Kurs/),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: LANDUNG, level: 1 })).toBeNull();
    },
  );

  it('wer nicht angemeldet ist, kommt nicht hinein', async () => {
    zeige(createFakeCloud(), '/ueben/karten/k-1/p-1');
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
  });

  it('die Ansichten fragen keinen fremden Lernstand', () => {
    const quelle = readFileSync(
      resolve(import.meta.dirname, 'PaketAnsicht.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(quelle).toContain('myEntryProgress');
    expect(quelle).not.toMatch(/members\(|userId|forUser/);
    /* Und die Zuweisung ist die Bedingung, nicht eine Höflichkeit. */
    expect(quelle).toContain('publishedForCourse');
  });
});

describe('keine zweite Übungsimplementierung', () => {
  it('das Portal rendert die vorhandenen Ansichten, es baut sie nicht nach', () => {
    const bereich = readFileSync(resolve(import.meta.dirname, 'LearnerArea.tsx'), 'utf8');
    for (const name of ['CardStudyPage', 'SelfTestPage', 'VocabBrowsePage', 'FreePracticeSetupPage']) {
      expect(bereich, `${name} wird nicht wiederverwendet`).toContain(
        `routes/student/${name}`,
      );
    }
  });

  it('und bewertet nicht selbst', () => {
    /*
      Die Bewertung einer Antwort steht in `domain/answerCheck.ts`. Tauchte
      sie hier noch einmal auf, gäbe es zwei Vorstellungen davon, was richtig
      ist — und die portable Datei und das Portal kämen zu verschiedenen
      Ergebnissen.
    */
    const ohneKommentare = (datei: string) =>
      readFileSync(resolve(import.meta.dirname, datei), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const datei of ['PaketAnsicht.tsx', 'UebenPage.tsx', 'LearnerArea.tsx']) {
      expect(ohneKommentare(datei), `${datei} prüft Antworten selbst`).not.toMatch(
        /normalize\(|levenshtein|verdict\s*=|checkAnswer\(/,
      );
    }
  });
});

describe('freies Üben plant die Runde, die es zeigt', () => {
  it('die gewählten Parameter landen in der Runde des Portals', async () => {
    const { cloud, courseId, packId, titel } = await kursMitPaket();
    /*
      Dieselben Parameter wie in der Fassung ohne Konto — gebaut von der
      planenden Seite, gelesen von der Runde. Eine eigene Schreibweise hier
      hieße, dass Vorschau und Runde über verschiedene Dinge reden.
    */
    zeige(
      cloud,
      `/lernen/kurs/${courseId}/ueben/${packId}?mode=free&kinds=flashcard&length=2&seed=7`,
    );
    await screen.findByRole('heading', { name: titel, level: 1 });
    expect(await screen.findByText(/Noch 2 in dieser Runde/)).toBeInTheDocument();
    /* `kinds=flashcard` ist verbindlich: Es kommt eine Karteikarte, kein Eingabefeld. */
    expect(document.querySelector('main input[type="text"]')).toBeNull();
  });

  it('ohne `mode=free` gilt die Länge aus der Adresse nicht', async () => {
    const { cloud, courseId, packId, titel } = await kursMitPaket();
    zeige(cloud, `/lernen/kurs/${courseId}/ueben/${packId}?length=2`);
    await screen.findByRole('heading', { name: titel, level: 1 });
    const text = (document.querySelector('main.huelle__inhalt') as HTMLElement).textContent ?? '';
    const treffer = /Noch (\d+) in dieser Runde/.exec(text);
    expect(Number(treffer?.[1]), 'der Lernplan übernimmt eine fremde Länge').toBeGreaterThan(2);
  });
});

describe('E14 gilt auch für die neuen Wege', () => {
  it('eine Ansicht ohne Runde behält ihre Navigation', async () => {
    const { cloud, courseId, packId } = await kursMitPaket();
    zeige(cloud, `/ueben/liste/${courseId}/${packId}`);
    await screen.findByRole('main');
    /*
      Die Vokabelliste ist keine Runde — dort gibt es nichts zu verlieren, und
      die Navigation bleibt. E14 betrifft die laufende Runde, nicht jede Seite
      im Übungsbereich.
    */
    expect(screen.getAllByRole('navigation', { name: 'Hauptnavigation' }).length).toBeGreaterThan(0);
  });

  it('die Runde aus dem freien Üben hat keine Navigation', async () => {
    const { cloud, courseId, packId, titel } = await kursMitPaket();
    zeige(cloud, `/lernen/kurs/${courseId}/ueben/${packId}?mode=free&length=3&seed=7`);
    await screen.findByRole('heading', { name: titel, level: 1 });
    expect(screen.queryAllByRole('navigation', { name: 'Hauptnavigation' })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Runde beenden' })).toBeInTheDocument();
  });
});
