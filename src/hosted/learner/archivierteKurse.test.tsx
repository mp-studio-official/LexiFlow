// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RepositoryProvider } from '../../application/RepositoryContext';
import { createFakeCloud, type FakeCloud } from '../../application/fakeCloudRepositories';
import { makePack } from '../../test/fixtures';
import { HostedRoutes } from '../HostedApp';
import { SessionProvider } from '../SessionContext';

afterEach(cleanup);

async function archivierterKurs(): Promise<FakeCloud> {
  const cloud = createFakeCloud();
  cloud.signInAs('u-lehrerin');
  const kurs = await cloud.repositories.courses!.createCourse({ title: 'Abgeschlossene 7b' });
  const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});
  const roh = makePack();
  const paket = {
    ...roh,
    meta: { ...roh.meta, id: 'archiv-paket', title: 'Unit Archiv', direction: 'both' as const },
  };
  await cloud.repositories.packs!.saveDraft(paket);
  const fassung = await cloud.repositories.publication!.publish(paket.meta.id);
  await cloud.repositories.publication!.assignToCourse(
    kurs.id,
    paket.meta.id,
    fassung.revision,
    0,
  );

  cloud.signInAs('u-lernend');
  await cloud.repositories.invitations!.redeemCode(code);
  cloud.signInAs('u-lehrerin');
  await cloud.repositories.courses!.setArchived(kurs.id, true);
  cloud.signInAs('u-lernend');
  return cloud;
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

describe('archiviert heißt für Lernende weiterlernen, nicht verschwinden', () => {
  it.each([
    ['/lernen', 'Abgeschlossene 7b'],
    ['/heute', 'Abgeschlossene 7b'],
    ['/ueben', 'Karteikarten'],
    ['/fortschritt', 'Unit Archiv'],
  ] as const)('%s behält den archivierten Kurs erreichbar', async (route, sichtbar) => {
    const cloud = await archivierterKurs();
    zeige(cloud, route);

    expect(await screen.findByText(sichtbar)).toBeInTheDocument();
  });
});
