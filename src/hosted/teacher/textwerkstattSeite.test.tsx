import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RepositoryProvider } from '../../application/RepositoryContext';
import { createFakeCloud, type FakeCloud } from '../../application/fakeCloudRepositories';
import { SessionProvider } from '../SessionContext';
import { HostedRoutes } from '../HostedApp';
import { SCOTLAND_WALES } from '../../testdaten/scotlandWales';
import { TEXTVORSCHLAEGE } from './werkstatt/kivertrag';

/**
 * Der verbindliche Abnahmefall, über die echte Route.
 *
 * Geprüft wird der Weg, den eine Lehrkraft wirklich geht: `#/pakete/neu`
 * aufrufen, den Scotland/Wales-Text einfügen, Wörter aufnehmen, Bedeutungen
 * eintragen, anlegen. Eine Prüfung gegen die Komponente allein sähe nicht,
 * ob Weiche, Route und Speicherung zusammenpassen — und genau dort fallen
 * Integrationen auseinander.
 */

function setup(repositories?: FakeCloud['repositories']) {
  const cloud = createFakeCloud();
  cloud.signInAs('u-lehrerin');
  cleanup();
  render(
    <RepositoryProvider value={repositories ?? cloud.repositories} mode="hosted">
      <SessionProvider>
        <MemoryRouter initialEntries={['/pakete/neu']}>
          <HostedRoutes />
        </MemoryRouter>
      </SessionProvider>
    </RepositoryProvider>,
  );
  return { cloud, user: userEvent.setup() };
}

/**
 * Die Kandidatenliste — über ihre Klasse, nicht über die Rolle.
 *
 * `getByRole('list')` fände auf dieser Seite mehrere Listen. Ein
 * `selector` in den Rollenoptionen wäre dabei stillschweigend wirkungslos
 * gewesen: `ByRoleOptions` kennt ihn nicht, und der Typprüfer hat genau
 * das gemeldet.
 */
function kandidatenliste(): HTMLElement {
  const liste = document.querySelector<HTMLElement>('.werkstatt__kandidaten');
  if (!liste) throw new Error('Die Kandidatenliste fehlt.');
  return liste;
}

async function textEinfuegen(user: ReturnType<typeof userEvent.setup>, text = SCOTLAND_WALES) {
  const feld = await screen.findByRole('textbox', { name: /Text oder Vokabelliste|Englischer Text/ });
  /*
    `paste` statt `type`: Eine Lehrkraft fügt einen Text ein, sie tippt
    ihn nicht ab — und 1100 Zeichen einzeln zu tippen dauert in dieser
    Prüfung Minuten.
  */
  await user.click(feld);
  await user.paste(text);
  await user.click(screen.getByRole('button', { name: /Weiter|Text analysieren/ }));
}

describe('der Scotland/Wales-Text geht durch den ganzen Ablauf', () => {
  it('landet in der Textwerkstatt und nicht im Listenweg', async () => {
    const { user } = setup();
    await textEinfuegen(user);

    expect(await screen.findByRole('heading', { name: 'Vorschläge' })).toBeInTheDocument();
    /*
      Die Kernzusage dieses Auftrags. Vorher stand hier eine Vorschau mit
      „Vokabeln", deren englische Seite ganze Absätze waren.
    */
    expect(screen.queryByText(/Eine Zeile je Vokabel/)).toBeNull();
    expect(screen.getByRole('group', { name: 'Analysierter Text' }).textContent).toBe(
      SCOTLAND_WALES,
    );
  });

  it('zeigt echte Wortkandidaten mit ihren Quellsätzen', async () => {
    const { user } = setup();
    await textEinfuegen(user);
    await screen.findByRole('heading', { name: 'Vorschläge' });

    expect(screen.getByText(/Vorschläge aus \d+ Sätzen/)).toBeInTheDocument();
    for (const zitat of document.querySelectorAll('.werkstatt__satz q')) {
      expect(SCOTLAND_WALES).toContain(zitat.textContent ?? '');
    }
  });

  it('legt erst nach Auswahl, Eingabe und Klick einen Entwurf an', async () => {
    const { cloud, user } = setup();
    await textEinfuegen(user);
    await screen.findByRole('heading', { name: 'Vorschläge' });

    expect(screen.getByRole('button', { name: 'Lernpaket anlegen' })).toBeDisabled();

    await user.type(screen.getByLabelText(/Name des Lernpakets/), 'Scotland and Wales');

    const liste = kandidatenliste();
    const ersterKandidat = within(liste).getAllByRole('checkbox')[0]!;
    await user.click(ersterKandidat);
    await user.type(screen.getByLabelText(/Deutsche Bedeutung/), 'die Hauptstadt');

    const anlegen = screen.getByRole('button', { name: 'Lernpaket anlegen' });
    expect(anlegen).toBeEnabled();
    await user.click(anlegen);

    expect(await screen.findByRole('heading', { name: 'Lernpaket angelegt' })).toBeInTheDocument();

    const pakete = await cloud.repositories.packs!.list();
    expect(pakete).toHaveLength(1);
    expect(pakete[0]!.title).toBe('Scotland and Wales');
    expect(pakete[0]!.entryCount).toBe(1);
  });

  it('veröffentlicht nichts und weist nichts zu', async () => {
    const { cloud, user } = setup();
    await textEinfuegen(user);
    await screen.findByRole('heading', { name: 'Vorschläge' });
    await user.type(screen.getByLabelText(/Name des Lernpakets/), 'Scotland and Wales');
    const liste = kandidatenliste();
    await user.click(within(liste).getAllByRole('checkbox')[0]!);
    await user.type(screen.getByLabelText(/Deutsche Bedeutung/), 'die Hauptstadt');
    await user.click(screen.getByRole('button', { name: 'Lernpaket anlegen' }));
    await screen.findByRole('heading', { name: 'Lernpaket angelegt' });

    const pakete = await cloud.repositories.packs!.list();
    /*
      Ein Entwurf, nicht mehr. „Veröffentlichen" friert eine Fassung ein,
      „zuweisen" legt sie vor eine Lerngruppe — beides sind Entscheidungen
      der Lehrkraft über etwas, das danach andere sehen. `publishedRevision`
      fehlt genau dann, wenn nie veröffentlicht wurde.
    */
    expect(pakete[0]!.publishedRevision).toBeUndefined();
    expect(screen.getByText(/gehört vorerst dir allein/)).toBeInTheDocument();
  });
});

describe('Listen gehen weiterhin ihren eigenen Weg', () => {
  it('schickt eine zweispaltige Liste in die Listenvorschau', async () => {
    const { user } = setup();
    await textEinfuegen(user, 'house\tHaus\ncar\tAuto\ntree\tBaum');
    expect(await screen.findByText(/Eine Tabelle/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Analysierter Text' })).toBeNull();
  });

  it('schickt eine einspaltige Liste in die Listenvorschau', async () => {
    const { user } = setup();
    await textEinfuegen(user, 'island\nparliament\ntradition\nsymbol\nchoir');
    expect(await screen.findByText(/ohne erkennbare zweite Spalte/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Analysierter Text' })).toBeNull();
  });
});

describe('die KI im Pilotbetrieb', () => {
  it('zeigt keine KI-Karte, wenn es keinen KI-Zugang gibt', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    const { ai: _gesperrt, ...ohneKi } = cloud.repositories;
    const { user } = setup(ohneKi);
    await textEinfuegen(user);
    await screen.findByRole('heading', { name: 'Vorschläge' });

    /*
      Die Pilotsperre an der Oberfläche. `ohneGesperrteKi` entfernt
      `repositories.ai`; die Werkstatt darf dann keinen Knopf zeigen, der
      nichts auslösen kann — und muss trotzdem vollständig bedienbar sein.
    */
    expect(screen.queryByRole('heading', { name: 'Übersetzungsvorschläge holen' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Lernpaket anlegen' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Analysierter Text' })).toBeInTheDocument();
  });

  it('ruft beim Öffnen weder Verbindungen noch Anbieter ab', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    const listConnections = vi.fn().mockResolvedValue([]);
    const invoke = vi.fn().mockResolvedValue({});
    const mitKi = {
      ...cloud.repositories,
      ai: { ...cloud.repositories.ai!, listConnections, invoke },
    };

    const { user } = setup(mitKi);
    await textEinfuegen(user);
    await screen.findByRole('heading', { name: 'Vorschläge' });

    /*
      Die schärfste Gegenprobe dieses Blocks: Weder das Öffnen der Seite
      noch das Analysieren des Textes darf irgendetwas hinausschicken.
    */
    expect(listConnections).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('ruft den Gateway erst auf Klick — und mit der vorbereiteten Fähigkeit', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    const listConnections = vi.fn().mockResolvedValue([
      {
        id: 'v1',
        label: 'Schulzugang',
        adapter: 'openai',
        model: 'testmodell',
        maskedSecret: '••••',
        capabilities: [TEXTVORSCHLAEGE],
        active: true,
      },
    ]);
    const invoke = vi.fn().mockResolvedValue({ vorschlaege: [] });
    const mitKi = {
      ...cloud.repositories,
      ai: { ...cloud.repositories.ai!, listConnections, invoke },
    };

    const { user } = setup(mitKi);
    await textEinfuegen(user);
    await screen.findByRole('heading', { name: 'Vorschläge' });

    const liste = kandidatenliste();
    await user.click(within(liste).getAllByRole('checkbox')[0]!);
    await user.click(screen.getByRole('button', { name: /Vorschläge für 1 Wort holen/ }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const aufruf = invoke.mock.calls[0]![0] as {
      capability: string;
      payload: { kandidaten: { sourceSentence: string }[] };
    };
    expect(aufruf.capability).toBe('teacher-text/suggestions');
    expect(aufruf.payload.kandidaten).toHaveLength(1);
    /*
      Nur Ausschnitte, nicht der ganze Text: Der Quellsatz geht mit, der
      Rest des Textes bleibt hier.
    */
    expect(SCOTLAND_WALES).toContain(aufruf.payload.kandidaten[0]!.sourceSentence);
    expect(JSON.stringify(aufruf.payload).length).toBeLessThan(SCOTLAND_WALES.length);
  });

  it('sagt es, wenn keine passende Verbindung hinterlegt ist', async () => {
    const cloud = createFakeCloud();
    cloud.signInAs('u-lehrerin');
    const mitKi = {
      ...cloud.repositories,
      ai: { ...cloud.repositories.ai!, listConnections: vi.fn().mockResolvedValue([]) },
    };
    const { user } = setup(mitKi);
    await textEinfuegen(user);
    await screen.findByRole('heading', { name: 'Vorschläge' });
    const liste = kandidatenliste();
    await user.click(within(liste).getAllByRole('checkbox')[0]!);
    await user.click(screen.getByRole('button', { name: /Vorschläge für 1 Wort holen/ }));

    expect(await screen.findByText(/keine KI-Verbindung hinterlegt/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lernpaket anlegen' })).toBeInTheDocument();
  });
});
