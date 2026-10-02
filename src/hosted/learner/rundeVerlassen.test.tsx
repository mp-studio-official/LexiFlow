// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RepositoryProvider } from '../../application/RepositoryContext';
import { createFakeCloud, type FakeCloud } from '../../application/fakeCloudRepositories';
import { makePack } from '../../test/fixtures';
import { HostedRoutes } from '../HostedApp';
import { SessionProvider } from '../SessionContext';

/**
 * E14 — die Runde verlassen, ohne still etwas zu verlieren.
 *
 * ## Was hier eigentlich geprüft wird
 *
 * Nicht, dass es eine Rückfrage gibt. Sondern dass sie **genau dann** kommt,
 * wenn etwas verloren ginge — und sonst nie. Eine Rückfrage bei jedem
 * Verlassen wird weggeklickt, und dann auch die eine, die zählt. Deshalb
 * steht zu jedem „fragt nach" ein „fragt nicht nach" daneben.
 *
 * ## Warum am echten Router
 *
 * Weil „Abmelden" in der Hülle liegt und „Runde beenden" im Inhalt. Dass
 * beide denselben Schutz benutzen, lässt sich nur dort sehen, wo beide
 * gleichzeitig existieren.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function kursMitPaket() {
  const cloud = createFakeCloud();
  cloud.signInAs('u-lehrerin');
  const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
  const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});
  const roh = makePack();
  /*
    Eine einzige Richtung und freie Eingabe: So ist die erste Aufgabe
    verlässlich eine, die überhaupt einen Entwurf hat. Bei einer
    Auswahlaufgabe ist das Antippen zugleich das Abschicken.
  */
  const pack = { ...roh, meta: { ...roh.meta, direction: 'de-en' as const } };
  await cloud.repositories.packs!.saveDraft(pack);
  const revision = await cloud.repositories.publication!.publish(pack.meta.id);
  await cloud.repositories.publication!.assignToCourse(kurs.id, pack.meta.id, revision.revision, 0);

  cloud.signInAs('u-lernend');
  await cloud.repositories.invitations!.redeemCode(code);

  /*
    Den Lernstand so setzen, dass die automatische Formwahl eine Aufgabe mit
    Eingabefeld ergibt: In Deutsch → Englisch liefert `autoKindsFor` ab Fach 4
    freie Übersetzung beziehungsweise freie Lücke. Fach 1 gäbe Karteikarte
    oder Multiple Choice — dort gibt es keinen Entwurf, und dieser Block
    prüfte dann nichts.

    `dueAt` liegt bewusst in der Vergangenheit: Ein Wort in Fach 4 wäre sonst
    erst in einer Woche wieder dran und käme in der Runde nicht vor.
  */
  let nummer = 0;
  for (const eintrag of pack.entries) {
    nummer += 1;
    await cloud.repositories.progress!.recordEvents([
      {
        eventId: `seed-${nummer}`,
        courseId: kurs.id,
        packId: pack.meta.id,
        entryId: eintrag.id,
        direction: 'de-en',
        outcome: 'correct',
        occurredAt: '2026-09-01T08:00:00.000Z',
        entryState: {
          box: 4,
          correctCount: 3,
          wrongCount: 0,
          streak: 3,
          dueAt: '2026-09-08T08:00:00.000Z',
        },
        baseRev: 0,
      },
    ]);
  }

  return { cloud, courseId: kurs.id, packId: pack.meta.id, titel: pack.meta.title };
}

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

/** Die Runde öffnen und warten, bis eine Aufgabe dasteht. */
async function inDerRunde() {
  const { cloud, courseId, packId, titel } = await kursMitPaket();
  zeige(cloud, `/lernen/kurs/${courseId}/ueben/${packId}`);
  await screen.findByRole('heading', { name: titel, level: 1 });
  return { cloud, courseId, packId, titel };
}

/** Das Antwortfeld der offenen Übersetzung — es trägt ein verstecktes Label. */
function antwortfeld(): HTMLInputElement {
  const feld = document.querySelector<HTMLInputElement>('main input[type="text"]');
  expect(feld, 'kein Antwortfeld gefunden').not.toBeNull();
  return feld as HTMLInputElement;
}

/**
 * Die Rückfrage — **nur wenn sie offen ist**.
 *
 * Das `<dialog>` steht immer im Baum; offen ist es über sein `open`-Attribut.
 * Ohne diese Unterscheidung fände jede Abfrage den geschlossenen Dialog und
 * jede Prüfung „keine Rückfrage" wäre sofort rot.
 */
function dialog(): HTMLElement | null {
  const feld = document.querySelector('dialog');
  return feld?.hasAttribute('open') ? (feld as HTMLElement) : null;
}

describe('die Rückfrage kommt genau dann, wenn etwas verloren ginge', () => {
  it('begonnene Texteingabe → Rückfrage', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    await inDerRunde();
    const nutzer = userEvent.setup();

    await nutzer.type(antwortfeld(), 'hou');
    await nutzer.click(screen.getByRole('button', { name: 'Runde beenden' }));

    expect(dialog(), 'keine Rückfrage trotz angefangener Eingabe').not.toBeNull();
  });

  it('leere Aufgabe → keine Rückfrage, die Runde ist einfach verlassen', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const { titel } = await inDerRunde();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Runde beenden' }));

    expect(dialog(), 'Rückfrage ohne Eingabe').toBeNull();
    expect(await screen.findByRole('heading', { name: 'Englisch 7b' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: titel, level: 1 })).toBeNull();
  });

  it('nur Leerzeichen → keine Rückfrage', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    await inDerRunde();
    const nutzer = userEvent.setup();
    await nutzer.type(antwortfeld(), '   ');
    await nutzer.click(screen.getByRole('button', { name: 'Runde beenden' }));
    expect(dialog()).toBeNull();
  });

  it('bestätigte und gespeicherte Antwort → keine Rückfrage', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    await inDerRunde();
    const nutzer = userEvent.setup();

    await nutzer.type(antwortfeld(), 'house');
    await nutzer.click(screen.getByRole('button', { name: 'Antwort prüfen' }));
    /* Die Antwort steht geprüft da — ab hier ist nichts mehr offen. */
    await screen.findByRole('button', { name: 'Weiter' });

    await nutzer.click(screen.getByRole('button', { name: 'Runde beenden' }));
    expect(dialog(), 'Rückfrage für eine gespeicherte Antwort').toBeNull();
  });
});

describe('was die beiden Knöpfe der Rückfrage tun', () => {
  it('„Hierbleiben" schließt und gibt den Fokus ins Antwortfeld', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const { titel } = await inDerRunde();
    const nutzer = userEvent.setup();

    await nutzer.type(antwortfeld(), 'hou');
    await nutzer.click(screen.getByRole('button', { name: 'Runde beenden' }));
    await nutzer.click(within(dialog() as HTMLElement).getByRole('button', { name: 'Hierbleiben' }));

    expect(dialog()).toBeNull();
    expect(screen.getByRole('heading', { name: titel, level: 1 })).toBeInTheDocument();
    expect(document.activeElement, 'der Fokus steht nicht im Antwortfeld').toBe(antwortfeld());
    expect(antwortfeld().value, 'die Eingabe ist weg').toBe('hou');
  });

  it('„Runde beenden" verwirft nur die Eingabe und verlässt die Runde', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const { titel } = await inDerRunde();
    const nutzer = userEvent.setup();

    await nutzer.type(antwortfeld(), 'hou');
    await nutzer.click(screen.getByRole('button', { name: 'Runde beenden' }));
    await nutzer.click(
      within(dialog() as HTMLElement).getByRole('button', { name: 'Runde beenden' }),
    );

    expect(await screen.findByRole('heading', { name: 'Englisch 7b' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: titel, level: 1 })).toBeNull();
  });

  it('Escape wirkt wie „Hierbleiben"', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    await inDerRunde();
    const nutzer = userEvent.setup();
    await nutzer.type(antwortfeld(), 'hou');
    await nutzer.click(screen.getByRole('button', { name: 'Runde beenden' }));
    await nutzer.keyboard('{Escape}');
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(antwortfeld());
  });

  it('der Dialog ist als solcher ausgezeichnet und beschriftet', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    await inDerRunde();
    const nutzer = userEvent.setup();
    await nutzer.type(antwortfeld(), 'hou');
    await nutzer.click(screen.getByRole('button', { name: 'Runde beenden' }));

    const feld = dialog() as HTMLElement;
    expect(feld.tagName, 'kein natives dialog-Element').toBe('DIALOG');
    expect(feld.getAttribute('aria-labelledby')).toBeTruthy();
    /*
      `aria-modal` steht nur da, wenn `showModal()` lief — in jsdom gibt es
      die Methode nicht (Stand 30.x), also darf das Attribut hier **fehlen**.
      Dass es im echten Browser dasteht und dass die Modalität dort wirklich
      gilt, misst `scripts/rueckfrage-messen.mjs`.
    */
    expect(typeof (feld as HTMLDialogElement).showModal).toBe('undefined');
    expect(feld.getAttribute('aria-modal'), 'Modalität ohne Deckung behauptet').toBeNull();
    expect(within(feld).getByRole('heading')).toBeInTheDocument();
    /* Der erste Fokus liegt auf der ungefährlichen Antwort. */
    expect(document.activeElement).toBe(
      within(feld).getByRole('button', { name: 'Hierbleiben' }),
    );
  });
});

describe('Abmelden benutzt denselben Schutz', () => {
  it('mit angefangener Eingabe erst Rückfrage, dann echte Abmeldung', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const { cloud } = await inDerRunde();
    const nutzer = userEvent.setup();
    const abmelden = vi.spyOn(cloud.repositories.auth!, 'signOut');

    await nutzer.type(antwortfeld(), 'hou');
    await nutzer.click(screen.getAllByRole('button', { name: 'Abmelden' })[0]!);

    expect(dialog(), 'Abmelden umgeht den Schutz').not.toBeNull();
    expect(abmelden, 'abgemeldet, bevor gefragt wurde').not.toHaveBeenCalled();

    await nutzer.click(
      within(dialog() as HTMLElement).getByRole('button', { name: 'Runde beenden' }),
    );
    expect(abmelden, 'nach der Zustimmung wurde nicht abgemeldet').toHaveBeenCalled();
  });

  it('„Hierbleiben" meldet nicht ab', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const { cloud } = await inDerRunde();
    const nutzer = userEvent.setup();
    const abmelden = vi.spyOn(cloud.repositories.auth!, 'signOut');

    await nutzer.type(antwortfeld(), 'hou');
    await nutzer.click(screen.getAllByRole('button', { name: 'Abmelden' })[0]!);
    await nutzer.click(within(dialog() as HTMLElement).getByRole('button', { name: 'Hierbleiben' }));

    expect(abmelden).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(antwortfeld());
  });

  it('ohne Eingabe meldet Abmelden sofort ab', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const { cloud } = await inDerRunde();
    const abmelden = vi.spyOn(cloud.repositories.auth!, 'signOut');

    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Abmelden' })[0]!);

    expect(dialog(), 'Rückfrage ohne Verlust').toBeNull();
    expect(abmelden).toHaveBeenCalled();
  });
});

describe('die Wege, die der Router nicht sieht', () => {
  it('Browser-Zurück fragt nach — und nimmt den Schritt zurück', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    await inDerRunde();
    const nutzer = userEvent.setup();
    const zurueckgenommen = vi.spyOn(window.history, 'pushState');

    await nutzer.type(antwortfeld(), 'hou');
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(dialog(), 'Browser-Zurück umgeht die Regel').not.toBeNull();
    expect(zurueckgenommen, 'der Schritt wurde nicht zurückgenommen').toHaveBeenCalled();
  });

  it('ohne Eingabe fragt Browser-Zurück nicht', async () => {
    await inDerRunde();
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(dialog()).toBeNull();
  });

  it('`beforeunload` greift nur im Verlustfall', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    await inDerRunde();
    const nutzer = userEvent.setup();

    const ohne = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ohne);
    expect(ohne.defaultPrevented, 'Warnung ohne Verlust').toBe(false);

    await nutzer.type(antwortfeld(), 'hou');
    const mit = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(mit);
    expect(mit.defaultPrevented, 'keine Warnung trotz Verlust').toBe(true);
  });
});

describe('die Regel steht an einer Stelle', () => {
  it('weder die Runde noch die Hülle entscheiden selbst, was Verlust ist', () => {
    const ohneKommentare = (pfad: string) =>
      readFileSync(resolve(import.meta.dirname, pfad), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    const runde = ohneKommentare('PracticePage.tsx');
    const huelle = ohneKommentare('../PortalShell.tsx');

    /* Die Runde fragt die Regel, sie baut sie nicht nach. */
    expect(runde).toContain('gingeVerloren(');
    expect(runde).not.toMatch(/entwurf\.trim\(\)\.length\s*>\s*0/);

    /*
      Und die Hülle kennt die Frage gar nicht — sie fragt nur, ob sie gehen
      darf. Stünde hier eine zweite Bedingung, gäbe es zwei Antworten auf
      dieselbe Frage.
    */
    expect(huelle).toContain('darfVerlassen(');
    expect(huelle).not.toContain('gingeVerloren');
    expect(huelle).not.toMatch(/entwurf|ungespeichert/i);
  });
});
