import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { clearAllLocalData } from '../../data/db';
import { savePack } from '../../data/packRepo';
import { createArea, listAreas } from '../../data/areaRepo';
import { makeEntry, makeMeta } from '../../test/fixtures';
import { PACK_PLACEHOLDER, TITLE_PLACEHOLDER } from '../../portable/studentExport';
import { parseLearningArea } from '../../domain/learningArea';

/**
 * Sprint 4B.7: Lernbereiche im Lehrkraftbereich.
 *
 * Drei Zusagen, und die letzte ist die, die man am spätesten bemerkt, wenn sie
 * bricht:
 *
 * 1. Die **Reihenfolge** der Auswahl ist die, in der die Pakete bei den
 *    Lernenden ankommen.
 * 2. In die Datei kommen **alle** gewählten Pakete – und nichts sonst.
 * 3. Die **Kennung** überlebt jedes Bearbeiten. An ihr hängt der Lernstand auf
 *    den Geräten; eine neue Kennung setzt ihn zurück, und niemand fände
 *    heraus, warum.
 */

const runtime = vi.hoisted(() => ({ value: undefined as string | undefined }));
const downloads = vi.hoisted(() => [] as { filename: string; text: string }[]);

vi.mock('../../portable/studentRuntime', () => ({
  get PORTABLE_BUILD() {
    return runtime.value !== undefined;
  },
  loadStudentRuntime: async () => runtime.value,
}));

vi.mock('../../ui/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ui/download')>();
  return {
    ...actual,
    downloadText: (filename: string, text: string) => {
      downloads.push({ filename, text });
    },
  };
});

const { LearningAreaPage } = await import('./LearningAreaPage');

const TEMPLATE = [
  '<!doctype html><html><head>',
  `<title>${TITLE_PLACEHOLDER}</title>`,
  `<script id="lexiflow-pack" type="application/json">${PACK_PLACEHOLDER}</script>`,
  '</head><body></body></html>',
].join('');

async function seedPacks(): Promise<void> {
  await savePack({
    meta: makeMeta({ id: 'p1', title: 'Unit 7 – Coastal erosion', grade: '9' }),
    entries: [makeEntry({ id: 'a1', english: 'erosion' }), makeEntry({ id: 'a2', english: 'tide' })],
  });
  await savePack({
    meta: makeMeta({ id: 'p2', title: 'Unit 8 – At the coast', grade: '9' }),
    entries: [makeEntry({ id: 'b1', english: 'cliff' })],
  });
}

function setup(route = '/material/lernbereiche/neu') {
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/material/lernbereiche/neu" element={<LearningAreaPage />} />
        <Route path="/material/lernbereiche/:areaId" element={<LearningAreaPage />} />
        <Route path="/material" element={<h1>Material</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

/** Die Titel in der linken Liste, in ihrer Reihenfolge. */
function chosenTitles(): string[] {
  const list = document.querySelector('ol.area-list');
  if (!list) return [];
  return [...list.querySelectorAll('.area-item__title')].map((node) => node.textContent ?? '');
}

/** „Hinzufügen“ in der Zeile eines bestimmten Pakets. */
async function add(user: ReturnType<typeof userEvent.setup>, title: string): Promise<void> {
  // `findByText`: Die Bibliothek kommt aus der Datenbank und ist beim ersten
  // Rendern noch nicht da.
  const row = (await screen.findByText(title)).closest('.area-item') as HTMLElement;
  await user.click(within(row).getByRole('button', { name: 'Hinzufügen' }));
}

/** Wartet, bis die Bibliothek geladen ist – sonst prüft man den Ladezustand. */
async function libraryReady(): Promise<void> {
  await screen.findByText('Unit 7 – Coastal erosion');
}

beforeEach(async () => {
  downloads.length = 0;
  runtime.value = TEMPLATE;
  await clearAllLocalData();
});

describe('Zusammenstellen', () => {
  it('nimmt Pakete auf und legt sie ans Ende der Liste', async () => {
    await seedPacks();
    const user = setup();
    await screen.findByRole('heading', { name: 'Neuer Lernbereich' });

    await add(user, 'Unit 8 – At the coast');
    await add(user, 'Unit 7 – Coastal erosion');

    expect(chosenTitles()).toEqual(['Unit 8 – At the coast', 'Unit 7 – Coastal erosion']);
  });

  it('stellt die Reihenfolge mit den Pfeilen um', async () => {
    /*
      Pfeile und keine Ziehgeste: Ziehen ist mit der Tastatur nicht bedienbar.
      Die Reihenfolge ist die, in der die Pakete bei den Lernenden erscheinen –
      sie muss jeder ändern können.
    */
    await seedPacks();
    const user = setup();
    await screen.findByRole('heading', { name: 'Neuer Lernbereich' });

    await add(user, 'Unit 7 – Coastal erosion');
    await add(user, 'Unit 8 – At the coast');

    await user.click(screen.getByRole('button', { name: 'Unit 8 – At the coast nach oben' }));
    expect(chosenTitles()).toEqual(['Unit 8 – At the coast', 'Unit 7 – Coastal erosion']);
  });

  it('nimmt ein Paket wieder heraus und legt es zurück in die Auswahl', async () => {
    await seedPacks();
    const user = setup();
    await screen.findByRole('heading', { name: 'Neuer Lernbereich' });

    await add(user, 'Unit 7 – Coastal erosion');
    expect(chosenTitles()).toEqual(['Unit 7 – Coastal erosion']);

    await user.click(screen.getByRole('button', { name: 'Entfernen' }));
    expect(chosenTitles()).toEqual([]);
    // Und es steht wieder rechts zur Auswahl.
    expect(screen.getAllByRole('button', { name: 'Hinzufügen' })).toHaveLength(2);
  });
});

describe('Was die Ausgabe blockiert', () => {
  it('sperrt Speichern und Ausgeben, solange nichts ausgewählt ist – und sagt warum', async () => {
    await seedPacks();
    setup();
    await screen.findByRole('heading', { name: 'Neuer Lernbereich' });
    await libraryReady();

    expect(screen.getByRole('button', { name: /Lerndatei erzeugen/ })).toBeDisabled();
    expect(screen.getByText(/Wähle mindestens ein Paket aus/)).toBeInTheDocument();
  });

  it('verlangt einen Titel', async () => {
    await seedPacks();
    const user = setup();
    await screen.findByRole('heading', { name: 'Neuer Lernbereich' });

    await add(user, 'Unit 7 – Coastal erosion');
    expect(screen.getByText(/braucht einen Titel/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Titel'), 'Englisch 9b');
    expect(screen.queryByText(/braucht einen Titel/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lerndatei erzeugen/ })).toBeEnabled();
  });
});

describe('Die Datei', () => {
  async function build(): Promise<void> {
    await seedPacks();
    const user = setup();
    await screen.findByRole('heading', { name: 'Neuer Lernbereich' });

    await user.type(screen.getByLabelText('Titel'), 'Englisch 9b – Halbjahr 1');
    await add(user, 'Unit 8 – At the coast');
    await add(user, 'Unit 7 – Coastal erosion');
    await user.click(screen.getByRole('button', { name: /Lerndatei erzeugen/ }));
    await screen.findByText(/Lerndatei erstellt/);
  }

  it('trägt alle gewählten Pakete in der gewählten Reihenfolge', async () => {
    await build();

    expect(downloads).toHaveLength(1);
    const html = downloads[0]?.text ?? '';
    const json = html.slice(html.indexOf('>', html.indexOf('id="lexiflow-pack"')) + 1, html.indexOf('</script>'));
    const gelesen = parseLearningArea(json);

    expect(gelesen.ok).toBe(true);
    if (!gelesen.ok) return;
    expect(gelesen.area.title).toBe('Englisch 9b – Halbjahr 1');
    expect(gelesen.area.packs.map((pack) => pack.meta.id)).toEqual(['p2', 'p1']);
  });

  it('heißt nach dem Lernbereich und nicht nach einem Paket', async () => {
    await build();
    expect(downloads[0]?.filename).toBe('englisch-9b-halbjahr-1-lexiflow.html');
  });

  it('speichert den Lernbereich dabei mit, ohne dass man es extra tut', async () => {
    /*
      Wer eine Datei erzeugt hat, will sie später ergänzen können. Ein
      Lernbereich, der beim Ausgeben nicht gespeichert wird, ist nach dem
      Schließen des Fensters weg – und die nächste Ausgabe bekäme eine neue
      Kennung und damit einen zurückgesetzten Lernstand.
    */
    await build();
    const areas = await listAreas();
    expect(areas).toHaveLength(1);
    expect(areas[0]?.packIds).toEqual(['p2', 'p1']);
  });

  it('sagt im Web-Build, wo die Datei entsteht, statt still nichts zu tun', async () => {
    runtime.value = undefined;
    await seedPacks();
    const user = setup();
    await screen.findByRole('heading', { name: 'Neuer Lernbereich' });

    await user.type(screen.getByLabelText('Titel'), 'Englisch 9b');
    await add(user, 'Unit 7 – Coastal erosion');
    await user.click(screen.getByRole('button', { name: /Lerndatei erzeugen/ }));

    expect(await screen.findByText(/LexiFlow-Lehrkraft\.html/)).toBeInTheDocument();
    expect(downloads).toHaveLength(0);
  });
});

describe('Einen vorhandenen Lernbereich bearbeiten', () => {
  it('behält die Kennung – das ist die eigentliche Zusage', async () => {
    /*
      Der Datenbankname auf dem Gerät einer lernenden Person leitet sich aus
      dieser Kennung ab. Bleibt sie gleich, findet die neu ausgegebene Datei
      den vorhandenen Lernstand. Ändert sie sich, fängt jede Person bei null
      an.
    */
    await seedPacks();
    const area = await createArea({ title: 'Englisch 9b', packIds: ['p1'] });
    const user = setup(`/material/lernbereiche/${area.id}`);
    await screen.findByRole('heading', { name: 'Lernbereich bearbeiten' });
    await libraryReady();

    expect(chosenTitles()).toEqual(['Unit 7 – Coastal erosion']);

    await add(user, 'Unit 8 – At the coast');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText('Lernbereich gespeichert.');

    const areas = await listAreas();
    expect(areas).toHaveLength(1);
    expect(areas[0]?.id).toBe(area.id);
    expect(areas[0]?.packIds).toEqual(['p1', 'p2']);
  });

  it('zeigt ein gelöschtes Paket als fehlend an, statt es still wegzulassen', async () => {
    /*
      Eine Auswahl, die sich von selbst ändert, ist keine Auswahl mehr – und
      eine Datei, in der still ein Paket fehlt, fällt erst bei den Lernenden
      auf.
    */
    await seedPacks();
    const area = await createArea({ title: 'Englisch 9b', packIds: ['p1', 'gibt-es-nicht'] });
    setup(`/material/lernbereiche/${area.id}`);
    await screen.findByRole('heading', { name: 'Lernbereich bearbeiten' });
    await libraryReady();

    expect(screen.getByText('Paket nicht mehr vorhanden')).toBeInTheDocument();
    // Und ausgeben lässt sich das nicht.
    expect(screen.getByRole('button', { name: /Lerndatei erzeugen/ })).toBeDisabled();
  });

  it('löscht den Bereich, ohne die Pakete anzufassen', async () => {
    await seedPacks();
    const area = await createArea({ title: 'Englisch 9b', packIds: ['p1'] });
    const user = setup(`/material/lernbereiche/${area.id}`);
    await screen.findByRole('heading', { name: 'Lernbereich bearbeiten' });

    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    await user.click(screen.getByRole('button', { name: 'Löschen' }));

    await screen.findByRole('heading', { name: 'Material' });
    expect(await listAreas()).toEqual([]);
  });
});
