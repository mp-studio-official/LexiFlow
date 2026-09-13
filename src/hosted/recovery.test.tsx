import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RepositoryProvider } from '../application/RepositoryContext';
import { createFakeCloud } from '../application/fakeCloudRepositories';
import { HostedRoutes } from './HostedApp';
import { SessionProvider } from './SessionContext';
import type { Repositories } from '../application/repositories';

/**
 * Die Wiederherstellung – und die Zusage, die an ihr hängt.
 *
 * Der erste Entwurf dieser Seite schickte Lernende zur Lehrkraft: „sie gibt
 * dir ein neues Kennwort“. Bequem, und es hätte die zentrale Zusage des
 * Produkts aufgehoben – wer ein fremdes Kennwort setzt, kann sich als diese
 * Person anmelden und sieht ihren Lernstand.
 *
 * Deshalb steht unten nicht nur, was die Seite tut, sondern auch, was sie
 * **nicht sagt**. Formulierungsprüfungen sind grob; diese hier fängt genau den
 * Rückfall, der aus Bequemlichkeit entsteht.
 */

function setup(route: string, repositories: Repositories) {
  render(
    <RepositoryProvider value={repositories} mode="hosted">
      <SessionProvider>
        <MemoryRouter initialEntries={[route]}>
          <HostedRoutes />
        </MemoryRouter>
      </SessionProvider>
    </RepositoryProvider>,
  );
  return userEvent.setup();
}

describe('Wiederherstellung für Lernende', () => {
  it('läuft über den eigenen Code, in einem Schritt', async () => {
    const cloud = createFakeCloud();
    const redeem = vi.spyOn(cloud.repositories.auth!, 'redeemRecoveryCode');
    const user = setup('/wiederherstellen', cloud.repositories);

    await user.type(await screen.findByLabelText('Lern-ID'), 'fuchs-7390');
    await user.type(screen.getByLabelText('Wiederherstellungscode'), 'TESTCODE-NUR-ZUM-PROBIEREN');
    await user.type(screen.getByLabelText('Neues Kennwort'), 'neues-testkennwort');
    await user.click(screen.getByRole('button', { name: 'Neues Kennwort setzen' }));

    await waitFor(() =>
      expect(redeem).toHaveBeenCalledWith({
        learnerId: 'fuchs-7390',
        recoveryCode: 'TESTCODE-NUR-ZUM-PROBIEREN',
        newPassword: 'neues-testkennwort',
      }),
    );
  });

  it('führt danach in den Lernbereich', async () => {
    const cloud = createFakeCloud();
    const user = setup('/wiederherstellen', cloud.repositories);

    await user.type(await screen.findByLabelText('Lern-ID'), 'fuchs-7390');
    await user.type(screen.getByLabelText('Wiederherstellungscode'), 'TESTCODE-NUR-ZUM-PROBIEREN');
    await user.type(screen.getByLabelText('Neues Kennwort'), 'neues-testkennwort');
    await user.click(screen.getByRole('button', { name: 'Neues Kennwort setzen' }));

    expect(await screen.findByRole('heading', { name: 'Deine Kurse' })).toBeInTheDocument();
  });

  it('lehnt ein zu kurzes Kennwort ab, ohne den Code zu verbrauchen', async () => {
    const cloud = createFakeCloud();
    const redeem = vi.spyOn(cloud.repositories.auth!, 'redeemRecoveryCode');
    const user = setup('/wiederherstellen', cloud.repositories);

    await user.type(await screen.findByLabelText('Lern-ID'), 'fuchs-7390');
    await user.type(screen.getByLabelText('Wiederherstellungscode'), 'TESTCODE-NUR-ZUM-PROBIEREN');
    await user.type(screen.getByLabelText('Neues Kennwort'), 'kurz');
    await user.click(screen.getByRole('button', { name: 'Neues Kennwort setzen' }));

    expect(await screen.findByText(/mindestens 8 Zeichen/)).toBeInTheDocument();
    expect(redeem).not.toHaveBeenCalled();
  });

  it('meldet bei falschem Code, ohne zu verraten, was nicht stimmte', async () => {
    const cloud = createFakeCloud();
    const user = setup('/wiederherstellen', cloud.repositories);

    await user.type(await screen.findByLabelText('Lern-ID'), 'fuchs-7390');
    await user.type(screen.getByLabelText('Wiederherstellungscode'), 'FALSCH');
    await user.type(screen.getByLabelText('Neues Kennwort'), 'neues-testkennwort');
    await user.click(screen.getByRole('button', { name: 'Neues Kennwort setzen' }));

    const meldung = await screen.findByText(/passen nicht zusammen/);
    expect(meldung).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Lern-ID unbekannt|Code falsch/);
  });

  it('schickt Lernende nicht zur Lehrkraft, um ein Kennwort zu bekommen', async () => {
    /*
      Die Regressionsprüfung zu ADR-5. Wer diesen Test fallen sieht, hat
      vermutlich gerade den bequemen Weg eingebaut – und sollte den Kopf von
      `RecoveryPage.tsx` lesen, bevor er ihn anpasst.
    */
    setup('/wiederherstellen', createFakeCloud().repositories);
    const seite = await screen.findByRole('main');

    for (const satz of [
      'Sie kann dir ein neues Kennwort geben',
      'wende dich an deine Lehrkraft',
      'Wende dich an deine Lehrkraft',
    ]) {
      expect(seite).not.toHaveTextContent(satz);
    }
  });

  it('sagt ehrlich, was passiert, wenn auch der Code weg ist', async () => {
    setup('/wiederherstellen', createFakeCloud().repositories);
    expect(await screen.findByText(/lässt sich das Konto nicht wiederherstellen/)).toBeInTheDocument();
  });
});

describe('Wiederherstellung für Lehrkräfte', () => {
  it('fordert einen Verweis an', async () => {
    const cloud = createFakeCloud();
    const user = setup('/wiederherstellen', cloud.repositories);

    await user.type(await screen.findByLabelText('E-Mail-Adresse'), 'lehrerin@beispiel.invalid');
    await user.click(screen.getByRole('button', { name: 'Wiederherstellung anfordern' }));

    await waitFor(() =>
      expect(cloud.state.recoveryRequests).toEqual(['lehrerin@beispiel.invalid']),
    );
  });

  it('verrät dabei nicht, ob es das Konto gibt', async () => {
    const cloud = createFakeCloud();
    const user = setup('/wiederherstellen', cloud.repositories);

    await user.type(await screen.findByLabelText('E-Mail-Adresse'), 'gibtsnicht@beispiel.invalid');
    await user.click(screen.getByRole('button', { name: 'Wiederherstellung anfordern' }));

    // „Wenn es ein Konto gibt“ – nicht „wir haben Ihnen geschickt“.
    expect(await screen.findByText(/Wenn es ein Konto zu dieser Adresse gibt/)).toBeInTheDocument();
  });
});

describe('die Seite für ein neues Kennwort', () => {
  it('sagt bei abgelaufenem Verweis, was zu tun ist', async () => {
    setup('/kennwort-neu', createFakeCloud().repositories);
    expect(await screen.findByRole('heading', { name: /gilt nicht mehr/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Neuen Verweis anfordern' })).toBeInTheDocument();
  });

  it('nimmt mit gültiger Sitzung ein neues Kennwort entgegen', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    const setPassword = vi.spyOn(cloud.repositories.auth!, 'setPassword');
    const user = setup('/kennwort-neu', cloud.repositories);

    await user.type(await screen.findByLabelText('Neues Kennwort'), 'neues-testkennwort');
    await user.type(screen.getByLabelText('Noch einmal'), 'neues-testkennwort');
    await user.click(screen.getByRole('button', { name: 'Kennwort setzen' }));

    await waitFor(() => expect(setPassword).toHaveBeenCalledWith('neues-testkennwort'));
    expect(await screen.findByRole('heading', { name: 'Das Kennwort ist gesetzt' })).toBeInTheDocument();
  });

  it('merkt einen Tippfehler in der Wiederholung', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    const setPassword = vi.spyOn(cloud.repositories.auth!, 'setPassword');
    const user = setup('/kennwort-neu', cloud.repositories);

    await user.type(await screen.findByLabelText('Neues Kennwort'), 'neues-testkennwort');
    await user.type(screen.getByLabelText('Noch einmal'), 'neues-testkennwortt');
    await user.click(screen.getByRole('button', { name: 'Kennwort setzen' }));

    expect(await screen.findByText(/nicht gleich/)).toBeInTheDocument();
    expect(setPassword).not.toHaveBeenCalled();
  });

  it('ist ohne Anmeldung erreichbar – die Sitzung entsteht ja erst dort', async () => {
    // Läge sie hinter dem Riegel, landete jeder Verweis aus einer E-Mail auf
    // der Anmeldeseite, und die Wiederherstellung wäre unbenutzbar.
    setup('/kennwort-neu', createFakeCloud().repositories);
    expect(screen.queryByRole('heading', { name: 'Anmelden' })).not.toBeInTheDocument();
  });
});
