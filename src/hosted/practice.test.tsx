import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RepositoryProvider } from '../application/RepositoryContext';
import { createFakeCloud, type FakeCloud } from '../application/fakeCloudRepositories';
import { antwortEreignis } from '../application/progressEvents';
import { makePack } from '../test/fixtures';
import { HostedRoutes } from './HostedApp';
import { SessionProvider } from './SessionContext';

/**
 * Üben im Portal – gegen die kontrollierte Fälschung.
 *
 * Was der Lernstand tut, steht im Lernstandsvertrag, zweimal abgenommen. Hier
 * geht es um die Naht: dass die Runde überhaupt zustande kommt, dass eine
 * Antwort im Konto ankommt statt in IndexedDB, und dass ein Scheitern beim
 * Senden sichtbar wird, statt still zu verschwinden.
 */

async function kursMitPaket(): Promise<{
  cloud: FakeCloud;
  courseId: string;
  packId: string;
  titel: string;
}> {
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

  return { cloud, courseId: kurs.id, packId: pack.meta.id, titel: pack.meta.title };
}

function zeige(cloud: FakeCloud, route: string) {
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
  return userEvent.setup();
}

/** Eine Aufgabe beantworten – welche Form sie hat, entscheidet der Planer. */
async function eineAntwort(user: ReturnType<typeof userEvent.setup>) {
  const loesung = screen.queryByRole('button', { name: 'Lösung anzeigen' });
  if (loesung) {
    await user.click(loesung);
    await user.click(await screen.findByRole('button', { name: 'Gewusst' }));
    return;
  }
  // Multiple Choice: die erste angebotene Möglichkeit genügt – geprüft wird
  // hier der Weg des Lernstands, nicht ob die Antwort stimmt.
  const auswahl = screen.getAllByRole('button').filter((knopf) => knopf.textContent);
  await user.click(auswahl[0]!);
}

describe('Üben im Portal', () => {
  it('zählt die Runde und schreibt die Antwort ins Konto', async () => {
    const { cloud, courseId, packId, titel } = await kursMitPaket();
    const user = zeige(cloud, `/lernen/kurs/${courseId}/ueben/${packId}`);

    expect(await screen.findByRole('heading', { name: titel })).toBeInTheDocument();

    const vorher = await cloud.repositories.progress!.myPackProgress(courseId, packId);
    expect(vorher?.sessionCount).toBe(1);
    expect(vorher?.answeredCount).toBe(0);

    await eineAntwort(user);

    const nachher = await cloud.repositories.progress!.myPackProgress(courseId, packId);
    expect(nachher?.answeredCount).toBe(1);
    expect(await cloud.repositories.progress!.myEntryProgress(courseId, packId)).toHaveLength(1);
  });

  it('sagt es, wenn eine Antwort nicht gespeichert werden konnte', async () => {
    /*
      Der Fall, den eine Oberfläche gern verschweigt: Wer weiterübt, während
      nichts ankommt, hätte am Ende eine Runde geübt, die es nirgends gibt.
    */
    const { cloud, courseId, packId } = await kursMitPaket();
    const echt = cloud.repositories.progress!.recordEvents.bind(cloud.repositories.progress);
    cloud.repositories.progress!.recordEvents = async () => {
      throw new Error('Netz weg.');
    };

    const user = zeige(cloud, `/lernen/kurs/${courseId}/ueben/${packId}`);
    await screen.findByText(/Noch \d+ in dieser Runde/);
    await eineAntwort(user);

    expect(await screen.findByText(/konnte nicht gespeichert werden/)).toBeInTheDocument();
    cloud.repositories.progress!.recordEvents = echt;
  });

  it('löst einen Konflikt mit einem zweiten Gerät auf, ohne die Person zu behelligen', async () => {
    /*
      Der Mehrgerätefall an der Oberfläche. Während diese Runde läuft, hat
      dasselbe Konto auf einem anderen Gerät dieselbe Vokabel beantwortet –
      der Server lehnt den Schreibvorgang hier also ab.

      Die Seite lädt dann den frischen Stand, rechnet **dieselbe** Bewertung
      mit derselben Domainfunktion noch einmal und sendet dasselbe Ereignis
      erneut. Zu sehen ist davon nichts, und das ist der Punkt: Geübt hat die
      Person, gezählt ist es, der Stand stimmt danach.
    */
    const { cloud, courseId, packId } = await kursMitPaket();
    const user = zeige(cloud, `/lernen/kurs/${courseId}/ueben/${packId}`);
    await screen.findByText(/Noch \d+ in dieser Runde/);

    // Das andere Gerät kommt zuerst – mit derselben Ausgangsfassung 0.
    const echt = cloud.repositories.progress!.recordEvents.bind(cloud.repositories.progress);
    let einmal = false;
    cloud.repositories.progress!.recordEvents = async (events) => {
      if (!einmal && events[0]) {
        einmal = true;
        await echt([
          antwortEreignis({
            courseId,
            packId,
            entryId: events[0].entryId,
            direction: events[0].direction,
            outcome: 'wrong',
          }).event,
        ]);
      }
      return echt(events);
    };

    await eineAntwort(user);

    expect(screen.queryByText(/konnte nicht gespeichert werden/)).not.toBeInTheDocument();

    // Zwei Antworten sind gezählt – die vom anderen Gerät und diese eine.
    const paketstand = await cloud.repositories.progress!.myPackProgress(courseId, packId);
    expect(paketstand?.answeredCount).toBe(2);

    // Und der Stand trägt die Fassung, die aus beiden entstanden ist.
    const staende = await cloud.repositories.progress!.myEntryProgress(courseId, packId);
    expect(staende).toHaveLength(1);
    expect(staende[0]!.rev).toBe(2);

    cloud.repositories.progress!.recordEvents = echt;
  });

  it('sagt es, wenn das Paket nicht (mehr) im Kurs liegt', async () => {
    const { cloud, courseId, packId } = await kursMitPaket();
    cloud.signInAs('u-lehrerin');
    await cloud.repositories.publication!.withdraw(packId, 1);
    cloud.signInAs('u-lernend');

    zeige(cloud, `/lernen/kurs/${courseId}/ueben/${packId}`);
    expect(await screen.findByText(/liegt nicht \(mehr\) in diesem Kurs/)).toBeInTheDocument();
  });
});
