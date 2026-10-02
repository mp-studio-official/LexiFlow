import { describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RepositoryProvider } from '../application/RepositoryContext';
import { createFakeCloud, type FakeCloud } from '../application/fakeCloudRepositories';
import { makePack } from '../test/fixtures';
import { HostedRoutes } from './HostedApp';
import { SessionProvider } from './SessionContext';

/**
 * Die Materialseite – gegen die kontrollierte Fälschung.
 *
 * Der Ablauf selbst ist im Paketvertrag abgenommen, zweimal, einmal davon
 * gegen echtes PostgreSQL. Hier geht es um das, was nur an der Oberfläche zu
 * sehen ist: ob der Zustand „veröffentlicht, aber der Entwurf ist neuer"
 * überhaupt dasteht – der Zustand, den eine Oberfläche gern verschweigt.
 */

function setup(route: string, userId?: string, vorhandene?: FakeCloud) {
  const cloud = vorhandene ?? createFakeCloud();
  if (userId) cloud.signInAs(userId);

  cleanup();
  render(
    <RepositoryProvider value={cloud.repositories} mode="hosted">
      <SessionProvider>
        <MemoryRouter initialEntries={[route]}>
          <HostedRoutes />
        </MemoryRouter>
      </SessionProvider>
    </RepositoryProvider>,
  );
  return { cloud, user: userEvent.setup() };
}

async function mitPaket() {
  const cloud = createFakeCloud();
  cloud.signInAs('u-lehrerin');
  const pack = makePack();
  await cloud.repositories.packs!.saveDraft(pack);
  return { cloud, pack };
}

describe('die Materialseite', () => {
  it('erklärt den leeren Zustand, statt ihn nur zu zeigen', async () => {
    setup('/material', 'u-lehrerin');
    expect(await screen.findByText(/Noch kein Paket im Konto/)).toBeInTheDocument();
    expect(screen.getByText(/LexiFlow ohne Konto/)).toBeInTheDocument();
  });

  it('zeigt ein Paket mit Jahrgang und Vokabelzahl', async () => {
    const { cloud, pack } = await mitPaket();
    setup('/material', 'u-lehrerin', cloud);

    expect(await screen.findByRole('heading', { name: pack.meta.title })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${pack.entries.length} Vokabeln`))).toBeInTheDocument();
    expect(screen.getByText(/nur Entwurf/)).toBeInTheDocument();
  });

  it('veröffentlicht und sagt, welche Fassung daraus wurde', async () => {
    const { cloud } = await mitPaket();
    const { user } = setup('/material', 'u-lehrerin', cloud);

    await user.click(await screen.findByRole('button', { name: 'Veröffentlichen' }));
    expect(await screen.findByText(/als Fassung 1 veröffentlicht/)).toBeInTheDocument();
    // Zweimal zu sehen: in der Meldung und im Zustand darunter.
    expect(await screen.findAllByText(/Fassung 1 veröffentlicht/)).toHaveLength(2);
  });

  it('sagt es, wenn der Entwurf neuer ist als die Veröffentlichung', async () => {
    /*
      Der Zustand, der ohne Anzeige wochenlang unbemerkt bleibt: Jemand ändert
      ein Paket, sieht „veröffentlicht" und wundert sich, warum die Lerngruppe
      die Änderung nicht hat.
    */
    const { cloud, pack } = await mitPaket();
    await cloud.repositories.publication!.publish(pack.meta.id);
    await cloud.repositories.packs!.saveDraft({
      ...pack,
      meta: { ...pack.meta, title: 'Geändert' },
    });

    setup('/material', 'u-lehrerin', cloud);
    expect(await screen.findByText(/Entwurf ist neuer/)).toBeInTheDocument();
  });

  it('weist eine Fassung einem Kurs zu', async () => {
    const { cloud, pack } = await mitPaket();
    const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
    await cloud.repositories.publication!.publish(pack.meta.id);

    const { user } = setup('/material', 'u-lehrerin', cloud);
    await user.selectOptions(await screen.findByLabelText('Einer Lerngruppe geben'), kurs.id);
    await user.click(screen.getByRole('button', { name: 'Zuweisen' }));

    expect(await screen.findByText(/liegt jetzt in „Englisch 7b"/)).toBeInTheDocument();
  });

  it('zieht eine Fassung zurück und sagt, was das bewirkt', async () => {
    const { cloud, pack } = await mitPaket();
    await cloud.repositories.publication!.publish(pack.meta.id);

    const { user } = setup('/material', 'u-lehrerin', cloud);
    await user.click(await screen.findByRole('button', { name: /Fassung 1 zurückziehen/ }));

    expect(await screen.findByText(/aus allen Kursen genommen/)).toBeInTheDocument();
  });

  it('bietet keine Zuweisung an, solange nichts veröffentlicht ist', async () => {
    const { cloud } = await mitPaket();
    await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });

    setup('/material', 'u-lehrerin', cloud);
    await screen.findByText(/nur Entwurf/);
    expect(screen.queryByLabelText('Einer Lerngruppe geben')).not.toBeInTheDocument();
  });
});

describe('was die Lerngruppe davon sieht', () => {
  it('die zugewiesene Fassung – mit einem Weg zum Üben', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
    const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});
    const pack = makePack();
    await cloud.repositories.packs!.saveDraft(pack);
    const revision = await cloud.repositories.publication!.publish(pack.meta.id);
    await cloud.repositories.publication!.assignToCourse(kurs.id, pack.meta.id, revision.revision, 0);

    cloud.signInAs('u-lernend');
    await cloud.repositories.invitations!.redeemCode(code);

    setup(`/lernen/kurs/${kurs.id}`, 'u-lernend', cloud);

    expect(await screen.findByRole('heading', { name: pack.meta.title })).toBeInTheDocument();
    /*
      Im Inhalt gesucht, nicht im ganzen Dokument: Seit 5B.5 heißt auch ein
      Navigationsziel „Üben". Gemeint ist hier der Weg **aus diesem Kurs** in
      die Runde dieses Pakets — die Navigation führt in den Übungsbereich und
      ist eine andere Sache.
    */
    const inhalt = within(document.querySelector('main') as HTMLElement);
    expect(inhalt.getByRole('link', { name: 'Üben' })).toHaveAttribute(
      'href',
      `/lernen/kurs/${kurs.id}/ueben/${pack.meta.id}`,
    );
    // Der Satz, der den Unterschied zum kontofreien LexiFlow erklärt.
    expect(screen.getByText(/auf jedem Gerät, auf dem du dich anmeldest/)).toBeInTheDocument();
  });

  it('einen erklärten leeren Zustand, solange nichts zugewiesen ist', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
    const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});
    cloud.signInAs('u-lernend');
    await cloud.repositories.invitations!.redeemCode(code);

    setup(`/lernen/kurs/${kurs.id}`, 'u-lernend', cloud);
    expect(await screen.findByText(/Noch keine Vokabeln/)).toBeInTheDocument();
  });

  it('eine zurückgezogene Fassung verschwindet', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
    const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});
    const pack = makePack();
    await cloud.repositories.packs!.saveDraft(pack);
    const revision = await cloud.repositories.publication!.publish(pack.meta.id);
    await cloud.repositories.publication!.assignToCourse(kurs.id, pack.meta.id, revision.revision, 0);
    await cloud.repositories.publication!.withdraw(pack.meta.id, revision.revision);

    cloud.signInAs('u-lernend');
    await cloud.repositories.invitations!.redeemCode(code);

    setup(`/lernen/kurs/${kurs.id}`, 'u-lernend', cloud);
    await waitFor(() => expect(screen.getByText(/Noch keine Vokabeln/)).toBeInTheDocument());
  });
});
