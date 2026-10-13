import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RepositoryProvider } from '../application/RepositoryContext';
import { createFakeCloud, type FakeCloud } from '../application/fakeCloudRepositories';
import { makeEntry, makeMeta } from '../test/fixtures';
import type { VocabPack } from '../domain/schema';
import { HostedRoutes } from './HostedApp';
import { SessionProvider } from './SessionContext';

/**
 * Die sprachlichen Hilfen in der echten Übungsrunde.
 *
 * Geprüft wird die Naht: dass die Hilfen aus **Lehrkraftdaten** entstehen,
 * dass sie die Bewertung nicht anfassen, und dass `checkAnswer` die
 * alleinige Instanz bleibt.
 */

const EINTRAG = {
  ...makeEntry({
    id: 'e-went',
    english: 'went',
    lemma: 'go',
    germanAnswers: ['ging'],
    partOfSpeech: 'verb',
    exampleSentences: [{ english: 'We went home early.', german: 'Wir gingen früh nach Hause.' }],
  }),
  inflection: {
    kind: 'verb' as const,
    base: 'go',
    pastSimple: 'went',
    pastParticiple: 'gone',
    irregular: true,
  },
};

async function kursMitVokabel(): Promise<{ cloud: FakeCloud; courseId: string; packId: string }> {
  const cloud = createFakeCloud();
  cloud.signInAs('u-lehrerin');
  const kurs = await cloud.repositories.courses!.createCourse({ title: 'Englisch 7b' });
  const { code } = await cloud.repositories.invitations!.createInvite(kurs.id, {});
  const pack: VocabPack = {
    meta: { ...makeMeta(), direction: 'de-en' },
    entries: [EINTRAG],
  };
  await cloud.repositories.packs!.saveDraft(pack);
  const revision = await cloud.repositories.publication!.publish(pack.meta.id);
  await cloud.repositories.publication!.assignToCourse(kurs.id, pack.meta.id, revision.revision, 0);

  cloud.signInAs('u-lernend');
  await cloud.repositories.invitations!.redeemCode(code);
  return { cloud, courseId: kurs.id, packId: pack.meta.id };
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

async function runde() {
  const { cloud, courseId, packId } = await kursMitVokabel();
  /*
    Freies Üben mit festgelegter Form: Welche Aufgabenform der Planer von
    sich aus wählt, hängt am Lernstand — und eine Prüfung, die „offene
    Übersetzung" annimmt und eine Karteikarte bekommt, prüft nichts. Die
    Form wird deshalb gesetzt, nicht erhofft.
  */
  const user = zeige(
    cloud,
    `/lernen/kurs/${courseId}/ueben/${packId}?mode=free&kinds=open-translation&length=2`,
  );
  await screen.findByRole('progressbar', { name: /Runde/ });
  return { cloud, user, courseId, packId };
}

describe('gestufte Hinweise in der Runde', () => {
  it('stehen vor der Antwort bereit, ohne gleich etwas zu verraten', async () => {
    await runde();
    expect(screen.getByRole('button', { name: /Hinweis/ })).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('öffnen sich eine Stufe nach der anderen', async () => {
    const { user } = await runde();
    await user.click(screen.getByRole('button', { name: /Hinweis/ }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /Noch ein Hinweis/ }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('fangen bei der nächsten Aufgabe wieder bei null an', async () => {
    const { user } = await runde();
    await user.click(screen.getByRole('button', { name: /Hinweis/ }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);

    await user.type(screen.getByRole('textbox'), 'quatsch');
    await user.click(screen.getByRole('button', { name: 'Antwort prüfen' }));
    await user.click(await screen.findByRole('button', { name: 'Weiter' }));

    /* Wieder zugeklappt — die nächste Vokabel ist nicht halb verraten. */
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('ändern das Urteil nicht — `checkAnswer` bleibt die Instanz', async () => {
    const { cloud, user, courseId, packId } = await runde();
    await user.click(screen.getByRole('button', { name: /Hinweis/ }));
    await user.click(screen.getByRole('button', { name: /Noch ein Hinweis/ }));

    const feld = screen.getByRole('textbox');
    await user.type(feld, 'went');
    await user.click(screen.getByRole('button', { name: 'Antwort prüfen' }));

    expect(await screen.findByText('Richtig.')).toBeInTheDocument();
    /*
      Drei Hinweise oder keiner: Das Fach steigt gleich. Ob benutzte
      Hinweise den Lernstand beeinflussen sollen, ist eine offene
      Produktfrage — hier wird sie nicht nebenbei beantwortet.
    */
    const [stand] = await cloud.repositories.progress!.myEntryProgress(courseId, packId);
    expect(stand?.box).toBe(2);
  });
});

describe('die Rückmeldung erklärt, statt nur zu urteilen', () => {
  it('erkennt die Grundform statt der Lernform', async () => {
    const { user } = await runde();
    await user.type(screen.getByRole('textbox'), 'go');
    await user.click(screen.getByRole('button', { name: 'Antwort prüfen' }));
    const erklaerung = await screen.findByText(/Das ist die Grundform/);
    /*
      Auf das Feld eingegrenzt: „went" steht danach auch in der Formtafel.
      Eine lose Suche fände beides und sagte nicht, welches gemeint war.
    */
    expect(erklaerung.textContent).toMatch(/Gefragt war .?went.?/);
    expect(erklaerung.closest('.alert')?.textContent).toMatch(/Richtig wäre/);
  });

  it('zeigt die Formen so, wie die Lehrkraft sie eingegeben hat', async () => {
    const { user } = await runde();
    await user.type(screen.getByRole('textbox'), 'went');
    await user.click(screen.getByRole('button', { name: 'Antwort prüfen' }));

    const vergangenheit = await screen.findByText('Past Simple');
    expect(vergangenheit.tagName).toBe('DT');
    expect(vergangenheit.nextElementSibling?.textContent).toBe('went');
    expect(screen.getByText('gone')).toBeInTheDocument();
  });

  it('zeigt den freigegebenen Beispielsatz, Übersetzung erst auf Wunsch', async () => {
    const { user } = await runde();
    await user.type(screen.getByRole('textbox'), 'went');
    await user.click(screen.getByRole('button', { name: 'Antwort prüfen' }));

    expect(await screen.findByText('We went home early.')).toBeInTheDocument();
    expect(screen.queryByText('Wir gingen früh nach Hause.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Übersetzung zeigen' }));
    expect(screen.getByText('Wir gingen früh nach Hause.')).toBeInTheDocument();
  });

  it('verschwindet wieder, sobald die nächste Aufgabe dran ist', async () => {
    const { user } = await runde();
    await user.type(screen.getByRole('textbox'), 'went');
    await user.click(screen.getByRole('button', { name: 'Antwort prüfen' }));
    await user.click(await screen.findByRole('button', { name: 'Weiter' }));
    expect(screen.queryByText('Past Simple')).toBeNull();
  });
});
