import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { clearAllLocalData } from '../../data/db';
import { savePack } from '../../data/packRepo';
import { makeEntry, makeMeta } from '../../test/fixtures';
import { PACK_PLACEHOLDER, TITLE_PLACEHOLDER } from '../../portable/studentExport';

/**
 * Sprint 4A.1: Die Exportaktion auf der Lehrkraft-Paketseite.
 *
 * Zwei Fassungen werden geprüft: die portable Lehrkraftdatei, die die
 * Schülerlaufzeit mitbringt, und der normale Web-Build, der sie bewusst nicht
 * mitbringt und das auch sagt, statt einen wirkungslosen Knopf anzubieten.
 */

const runtime = vi.hoisted(() => ({ value: undefined as string | undefined }));
const downloads = vi.hoisted(() => [] as { filename: string; text: string; mime?: string }[]);

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
    downloadText: (filename: string, text: string, mime?: string) => {
      downloads.push({ filename, text, ...(mime ? { mime } : {}) });
    },
  };
});

const { PackEditorPage } = await import('./PackEditorPage');

const PACK_ID = 'pack-export';

const TEMPLATE = [
  '<!doctype html><html><head>',
  `<title>${TITLE_PLACEHOLDER}</title>`,
  `<script id="lexiflow-pack" type="application/json">${PACK_PLACEHOLDER}</script>`,
  '</head><body></body></html>',
].join('');

async function seed(): Promise<void> {
  await savePack({
    meta: makeMeta({ id: PACK_ID, title: 'Unit 3 – City life', grade: '8' }),
    entries: [
      makeEntry({ id: 'e1', english: 'crowded', germanAnswers: ['überfüllt'] }),
      makeEntry({ id: 'e2', english: 'litter', germanAnswers: ['Müll'] }),
    ],
  });
}

function renderEditor(): void {
  render(
    <MemoryRouter initialEntries={[`/material/${PACK_ID}`]}>
      <Routes>
        <Route path="/material/:packId" element={<PackEditorPage />} />
        <Route path="/material" element={<h1>Material</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  downloads.length = 0;
  runtime.value = TEMPLATE;
  await clearAllLocalData();
});

describe('Als Einzeldatei herunterladen', () => {
  it('erklärt vorab, was in der Datei steht – und was nicht', async () => {
    await seed();
    renderEditor();

    expect(
      await screen.findByText(/Die Einzeldatei enthält dieses Vokabelpaket und den vollständigen/),
    ).toBeInTheDocument();
    expect(screen.getByText(/ohne Konto und ohne Internet/)).toBeInTheDocument();
    expect(screen.getByText(/Lernstände und andere Pakete wandern nicht mit/)).toBeInTheDocument();
    // Der Datenschutzhinweis benennt die einzige Quelle personenbezogener Daten.
    expect(screen.getByText(/Personenbezogene Daten stehen nur darin/)).toBeInTheDocument();
  });

  it('stellt die drei Wege der Weitergabe unter diesen Satz', async () => {
    /*
      Bis 4B.1 stand hier nur der Erklärtext, und die drei Aktionen lagen ganz
      unten in einer Reihe mit „Paket löschen“. Wer gerade gespeichert hatte,
      suchte den nächsten Schritt also neben dem gefährlichsten Knopf.
    */
    await seed();
    renderEditor();

    const karte = (await screen.findByRole('heading', { name: 'Weitergeben an die Lerngruppe' }))
      .closest('div') as HTMLElement;

    expect(
      within(karte).getByRole('button', { name: 'Als Einzeldatei herunterladen (.html)' }),
    ).toBeInTheDocument();
    expect(
      within(karte).getByRole('button', {
        name: 'Als LexiFlow-Paket herunterladen (.vocabpack.json)',
      }),
    ).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: 'Im Lernbereich ansehen' })).toBeInTheDocument();
  });

  it('lädt eine HTML-Datei mit genau diesem Paket herunter', async () => {
    await seed();
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      await screen.findByRole('button', { name: 'Als Einzeldatei herunterladen (.html)' }),
    );

    expect(downloads).toHaveLength(1);
    const [file] = downloads;
    expect(file?.filename).toBe('unit-3-city-life-8-lexiflow.html');
    expect(file?.mime).toBe('text/html');
    expect(file?.text).toContain('<title>Unit 3 – City life – LexiFlow</title>');
    expect(file?.text).toContain('crowded');
    expect(file?.text).not.toContain(PACK_PLACEHOLDER);
    // 4B.3: „Schülerdatei“ ist raus – die Datei ist eine Einzeldatei, und die
    // Oberfläche spricht von Lernenden, nicht von Schülern.
    expect((await screen.findAllByText(/Einzeldatei erstellt/)).length).toBeGreaterThan(0);
  });

  it('lässt den bestehenden JSON-Export unverändert', async () => {
    await seed();
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole('button', { name: 'Als LexiFlow-Paket herunterladen (.vocabpack.json)' }));

    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.filename).toBe('unit-3-city-life-8.vocabpack.json');
    expect(downloads[0]?.mime).toBeUndefined();
    expect(JSON.parse(downloads[0]?.text ?? '{}')).toMatchObject({ kind: 'lexiflow.vocabpack' });
  });

  it('sagt im Web-Build, wo der Export zu finden ist – statt ins Leere zu greifen', async () => {
    runtime.value = undefined;
    await seed();
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      await screen.findByRole('button', { name: 'Als Einzeldatei herunterladen (.html)' }),
    );

    expect(downloads).toHaveLength(0);
    expect(
      await screen.findByText(/lässt sich in der portablen Datei „LexiFlow-Lehrkraft.html“ erzeugen/),
    ).toBeInTheDocument();
  });

  it('exportiert nicht, wenn die Laufzeit unbrauchbar ist', async () => {
    runtime.value = '<html>ohne Markierung</html>';
    await seed();
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      await screen.findByRole('button', { name: 'Als Einzeldatei herunterladen (.html)' }),
    );

    expect(downloads).toHaveLength(0);
    expect(await screen.findByText(/konnte nicht erzeugt werden/)).toBeInTheDocument();
  });
});
