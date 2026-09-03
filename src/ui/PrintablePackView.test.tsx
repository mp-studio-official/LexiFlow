import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { clearAllLocalData } from '../data/db';
import { getPack, savePack } from '../data/packRepo';
import { makeEntry, makeMeta } from '../test/fixtures';
import { CSV_BOM } from '../domain/vocabTable';

/**
 * Sprint 4B.3, Block B: die Vokabelliste als Ansicht.
 *
 * Was das Papier daraus macht, prüft `styles/print.test.ts` (die Regeln) und
 * der E2E-Lauf (die berechneten Werte). Hier geht es um das, was jsdom
 * beantworten kann: Steht das Richtige drin, tun die Einstellungen etwas, und
 * bleibt das Paket dabei unangetastet?
 */

const downloads = vi.hoisted(() => [] as { filename: string; text: string; mime?: string }[]);

vi.mock('./download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./download')>();
  return {
    ...actual,
    downloadText: (filename: string, text: string, mime?: string) => {
      downloads.push({ filename, text, ...(mime ? { mime } : {}) });
    },
  };
});

const { PrintablePackView } = await import('./PrintablePackView');

const PACK_ID = 'pack-liste';

async function seed(): Promise<void> {
  await savePack({
    meta: makeMeta({
      id: PACK_ID,
      title: 'Unit 7 – Coastal erosion',
      topic: 'Küste',
      grade: '9',
      cefrLevel: 'B1',
      description: 'Zur Lektüre in der zweiten Woche.',
    }),
    entries: [
      makeEntry({
        id: 'e1',
        english: 'to depend on sb./sth.',
        germanAnswers: ['von jdm./etw. abhängen'],
        partOfSpeech: 'verb',
        exampleSentences: [{ english: 'Communities depend on barriers.', german: 'Gemeinden hängen von Barrieren ab.' }],
      }),
      makeEntry({
        id: 'e2',
        english: 'restraints (pl.)',
        germanAnswers: ['die Beschränkungen', 'die Auflagen'],
        partOfSpeech: 'noun',
        grammaticalNumber: 'plural',
        exampleSentences: [],
      }),
      makeEntry({
        id: 'e3',
        english: 'attainable (adj.)',
        germanAnswers: ['erreichbar'],
        partOfSpeech: 'adjective',
        exampleSentences: [],
      }),
    ],
  });
}

function setup() {
  render(
    <MemoryRouter initialEntries={[`/material/${PACK_ID}/liste`]}>
      <Routes>
        <Route
          path="/material/:packId/liste"
          element={<PrintablePackView backTo={`/material/${PACK_ID}`} backLabel="Zurück zum Paket" />}
        />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

/** Die englischen Lernformen in der Reihenfolge, in der sie auf dem Blatt stehen. */
function formsOnSheet(): string[] {
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
  return rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '');
}

beforeEach(async () => {
  downloads.length = 0;
  await clearAllLocalData();
});

describe('Das Blatt', () => {
  it('trägt Marke, Titel und die Angaben zum Paket', async () => {
    await seed();
    setup();

    expect(await screen.findByRole('heading', { name: 'Unit 7 – Coastal erosion' })).toBeInTheDocument();
    expect(screen.getByText('LexiFlow')).toBeInTheDocument();
    expect(screen.getByText(/3 Vokabeln · Klasse 9 · B1/)).toBeInTheDocument();
    expect(screen.getByText('Zur Lektüre in der zweiten Woche.')).toBeInTheDocument();
  });

  it('zeigt die vollständigen Lernformen, nicht die Lemmata', async () => {
    await seed();
    setup();
    await screen.findByRole('table');

    expect(formsOnSheet()).toEqual([
      'to depend on sb./sth.',
      'restraints (pl.)',
      'attainable (adj.)',
    ]);
  });

  it('schreibt mehrere Bedeutungen mit Semikolon', async () => {
    await seed();
    setup();
    await screen.findByRole('table');
    expect(screen.getByText('die Beschränkungen; die Auflagen')).toBeInTheDocument();
  });

  it('nennt die Wortart ausgeschrieben', async () => {
    await seed();
    setup();
    await screen.findByRole('table');
    expect(screen.getByText('Substantiv, Plural')).toBeInTheDocument();
  });
});

describe('Was auf das Blatt kommt', () => {
  it('lässt die Beispielsätze abwählen', async () => {
    await seed();
    const user = setup();
    await screen.findByRole('table');

    expect(screen.getByRole('columnheader', { name: 'Beispielsatz' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Beispielsätze mitdrucken/ }));
    expect(screen.queryByRole('columnheader', { name: 'Beispielsatz' })).not.toBeInTheDocument();
  });

  it('sortiert auf Wunsch alphabetisch', async () => {
    await seed();
    const user = setup();
    await screen.findByRole('table');

    await user.selectOptions(screen.getByLabelText(/Reihenfolge/), 'alphabetical');
    expect(formsOnSheet()).toEqual([
      'attainable (adj.)',
      'restraints (pl.)',
      'to depend on sb./sth.',
    ]);
  });

  it('stellt die Zeilenhöhe um', async () => {
    await seed();
    const user = setup();
    const blatt = (await screen.findByRole('table')).closest('.sheet') as HTMLElement;

    expect(blatt).toHaveAttribute('data-density', 'compact');
    await user.selectOptions(screen.getByLabelText(/Zeilenhöhe/), 'roomy');
    expect(blatt).toHaveAttribute('data-density', 'roomy');
  });

  it('sperrt die Satzeinstellung, wenn es keine Sätze gibt – und sagt warum', async () => {
    /*
      Eine Einstellung ohne Wirkung ist schlimmer als keine: Wer sie anklickt
      und nichts passiert, sucht den Fehler bei sich. Sie bleibt sichtbar und
      sagt den Grund dazu.
    */
    await savePack({
      meta: makeMeta({ id: PACK_ID }),
      entries: [makeEntry({ id: 'x', english: 'shore', exampleSentences: [] })],
    });
    setup();
    await screen.findByRole('table');

    const kasten = screen.getByRole('checkbox', { name: /Beispielsätze mitdrucken/ });
    expect(kasten).toBeDisabled();
    expect(screen.getByText(/keine im Paket/)).toBeInTheDocument();
  });
});

describe('Die Tabellendatei', () => {
  it('lädt sie mit Inhalt und passendem Namen herunter', async () => {
    await seed();
    const user = setup();
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Als Tabelle herunterladen (.csv)' }));

    expect(downloads).toHaveLength(1);
    const [datei] = downloads;
    expect(datei?.filename).toBe('unit-7-coastal-erosion-9-vokabelliste.csv');
    expect(datei?.mime).toBe('text/csv');
    expect(datei?.text.startsWith(CSV_BOM)).toBe(true);
    expect(datei?.text).toContain('"to depend on sb./sth."');
    expect(datei?.text).toContain('"die Beschränkungen; die Auflagen"');
  });

  it('folgt der eingestellten Reihenfolge', async () => {
    await seed();
    const user = setup();
    await screen.findByRole('table');

    await user.selectOptions(screen.getByLabelText(/Reihenfolge/), 'alphabetical');
    await user.click(screen.getByRole('button', { name: 'Als Tabelle herunterladen (.csv)' }));

    const zeilen = downloads[0]?.text.split('\r\n') ?? [];
    expect(zeilen[1]).toContain('attainable (adj.)');
  });

  it('ändert weder Paket noch Reihenfolge im Speicher', async () => {
    /*
      Eine Vokabelliste auszudrucken ist keine Bearbeitung. Diese Prüfung ist
      der Grund, warum `tableRows` mit `toSorted` arbeitet und nicht mit
      `sort`.
    */
    await seed();
    const vorher = await getPack(PACK_ID);
    const user = setup();
    await screen.findByRole('table');

    await user.selectOptions(screen.getByLabelText(/Reihenfolge/), 'alphabetical');
    await user.click(screen.getByRole('button', { name: 'Als Tabelle herunterladen (.csv)' }));

    const nachher = await getPack(PACK_ID);
    expect(nachher).toEqual(vorher);
  });
});

describe('Fehlende Pakete', () => {
  it('sagt es, statt eine leere Tabelle zu zeigen', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Paket nicht gefunden' })).toBeInTheDocument();
  });
});
