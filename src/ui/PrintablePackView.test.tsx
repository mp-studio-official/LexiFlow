import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { clearAllLocalData } from '../data/db';
import { getPack, savePack } from '../data/packRepo';
import { makeEntry, makeMeta } from '../test/fixtures';
import { CSV_BOM } from '../domain/vocabTable';
import { COPYRIGHT_NOTICE } from './Copyright';
import { LOGO_BLACK_AND_WHITE } from './logoPaths';

/**
 * Sprint 4B.3, Block B: die Vokabelliste als Ansicht.
 *
 * Seit 4B.7 ist sie eine **Liste** und keine Tabelle mehr: Wort, Satz,
 * Übersetzung untereinander statt in vier Spalten. Warum, steht in
 * `PrintablePackView.tsx`; hier wird die Reihenfolge festgehalten, weil sie
 * die eigentliche Auskunft der Ansicht ist.
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

/** Die Einträge des Blattes, in der Reihenfolge, in der sie darauf stehen. */
function entriesOnSheet(): HTMLElement[] {
  return within(screen.getByRole('list')).getAllByRole('listitem');
}

/** Nur die englischen Lernformen – die erste, fette Zeile jedes Eintrags. */
function formsOnSheet(): string[] {
  // `.sheet__form` und nicht `.sheet__word`: In derselben Zeile steht auch die
  // Wortart, und die gehört nicht zur Lernform.
  return entriesOnSheet().map((entry) => entry.querySelector('.sheet__form')?.textContent ?? '');
}

beforeEach(async () => {
  downloads.length = 0;
  window.localStorage.clear();
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
    await screen.findByRole('list');

    expect(formsOnSheet()).toEqual([
      'to depend on sb./sth.',
      'restraints (pl.)',
      'attainable (adj.)',
    ]);
  });

  it('schreibt mehrere Bedeutungen mit Semikolon', async () => {
    await seed();
    setup();
    await screen.findByRole('list');
    expect(screen.getByText('die Beschränkungen; die Auflagen')).toBeInTheDocument();
  });

  it('nennt die Wortart ausgeschrieben', async () => {
    await seed();
    setup();
    await screen.findByRole('list');
    expect(screen.getByText('Substantiv, Plural')).toBeInTheDocument();
  });
});

describe('Was auf das Blatt kommt', () => {
  it('lässt die Beispielsätze abwählen', async () => {
    await seed();
    const user = setup();
    await screen.findByRole('list');

    expect(screen.getByText(/Communities depend on barriers\./)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Beispielsätze mitdrucken/ }));
    expect(screen.queryByText(/Communities depend on barriers\./)).not.toBeInTheDocument();
  });

  it('sortiert auf Wunsch alphabetisch', async () => {
    await seed();
    const user = setup();
    await screen.findByRole('list');

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
    const blatt = (await screen.findByRole('list')).closest('.sheet') as HTMLElement;

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
    await screen.findByRole('list');

    const kasten = screen.getByRole('checkbox', { name: /Beispielsätze mitdrucken/ });
    expect(kasten).toBeDisabled();
    expect(screen.getByText(/keine im Paket/)).toBeInTheDocument();
  });
});

describe('Die Legende', () => {
  it('erklärt den Aufbau einmal oben – und nicht bei jeder Vokabel', async () => {
    /*
      Die gelieferte Vorlage schrieb vor jede Zeile `context/example:` und
      `translation:`. Bei dreißig Vokabeln sind das neunzig Wörter, die genau
      dort stehen, wo das Auge die Vokabel sucht.
    */
    await seed();
    setup();
    await screen.findByRole('list');

    const legenden = document.querySelectorAll('.sheet__legend');
    expect(legenden).toHaveLength(1);
    expect(legenden[0]?.textContent).toBe(
      'Je Eintrag: englische Lernform, darunter der Beispielsatz, darunter die deutsche Bedeutung.',
    );
  });

  it('steht über der Liste und nicht darin', async () => {
    await seed();
    setup();
    const liste = await screen.findByRole('list');
    const legende = document.querySelector('.sheet__legend');

    expect(legende).not.toBeNull();
    expect(liste.contains(legende)).toBe(false);
    // `compareDocumentPosition`: 4 heißt „das andere folgt“.
    expect(legende?.compareDocumentPosition(liste)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('nennt den Beispielsatz nicht, wenn keiner gedruckt wird', async () => {
    /*
      Eine Legende, die etwas erklärt, das auf dem Blatt gar nicht vorkommt,
      lässt jemanden danach suchen.
    */
    await seed();
    const user = setup();
    await screen.findByRole('list');

    await user.click(screen.getByRole('checkbox', { name: /Beispielsätze mitdrucken/ }));
    expect(document.querySelector('.sheet__legend')?.textContent).toBe(
      'Je Eintrag: englische Lernform, darunter die deutsche Bedeutung.',
    );
  });

  it('wiederholt keine Feldbezeichnung im Eintrag', () => {
    /*
      Der Gegentest zur Legende: Was oben einmal steht, darf unten nicht
      dreißigmal stehen.
    */
    const quelle = readFileSync(
      resolve(import.meta.dirname, 'PrintablePackView.tsx'),
      'utf8',
    );
    const markup = quelle.slice(quelle.indexOf('<ol className="sheet__list">'));

    for (const bezeichnung of ['context/example', 'translation:', 'Übersetzung:', 'Beispiel:']) {
      expect(markup, bezeichnung).not.toContain(bezeichnung);
    }
  });
});

describe('Der Aufbau eines Eintrags', () => {
  it('stellt Wort, Satz und Übersetzung in genau diese Reihenfolge', async () => {
    /*
      Die Reihenfolge ist die ganze Auskunft dieser Ansicht: Erst das Wort,
      fett, dann der Satz, in dem es vorkommt, dann die Bedeutung. Wer die
      Bedeutung vor den Satz stellte, nähme dem Satz seine Aufgabe – man liest
      ihn dann nicht mehr, weil die Antwort schon dasteht.
    */
    await seed();
    setup();
    await screen.findByRole('list');

    const [erster] = entriesOnSheet();
    const zeilen = [...(erster?.querySelectorAll('p') ?? [])].map((p) => p.className);
    expect(zeilen).toEqual(['sheet__word', 'sheet__example', 'sheet__german']);
  });

  it('lässt die Satzzeile weg, wo es keinen Satz gibt', async () => {
    // Nicht leer, sondern gar nicht: Eine leere Zeile sieht aus wie ein Fehler.
    await seed();
    setup();
    await screen.findByRole('list');

    const ohneSatz = entriesOnSheet()[1];
    expect(ohneSatz?.querySelector('.sheet__example')).toBeNull();
    expect(ohneSatz?.querySelector('.sheet__german')).not.toBeNull();
  });

  it('nutzt für das Zeichen die gelieferte Schwarzweiß-Fassung', async () => {
    /*
      Die Fassung `mono` legte den Durchblick mit 35 % Deckkraft auf eine voll
      deckende Fläche – das „F“ wurde dadurch nicht heller, sondern
      verschwand. Auf Papier gilt die gelieferte Fassung mit festen Grauwerten.
    */
    await seed();
    setup();
    await screen.findByRole('list');

    const fills = [...document.querySelectorAll('.sheet__brand svg path')].map((path) =>
      path.getAttribute('fill'),
    );
    expect(fills).toEqual([
      LOGO_BLACK_AND_WHITE.back,
      LOGO_BLACK_AND_WHITE.front,
      LOGO_BLACK_AND_WHITE.inner,
    ]);
  });

  it('trägt den Vermerk am Fuß des Blattes', async () => {
    await seed();
    setup();
    await screen.findByRole('list');
    /*
      Am `textContent` und nicht über `getByText`: Zwischen Zeichen und Kürzel
      steht ein geschütztes Leerzeichen, und die Textsuche normalisiert es zu
      einem gewöhnlichen – der Test ginge dann auch durch, wenn es fehlte.
    */
    expect(document.querySelector('.sheet__foot')?.textContent).toBe(COPYRIGHT_NOTICE);
  });
});

describe('Die Kurszeile oben links', () => {
  it('erscheint erst auf dem Blatt, wenn etwas darin steht', async () => {
    await seed();
    const user = setup();
    await screen.findByRole('list');

    expect(document.querySelector('.sheet__course-line')).toBeNull();
    await user.type(screen.getByLabelText('Kopfzeile'), 'E | GK | Q1 | Ohm');
    expect(document.querySelector('.sheet__course-line')?.textContent).toBe('E | GK | Q1 | Ohm');
  });

  it('merkt sie sich für das nächste Paket – aber nicht im Paket', async () => {
    /*
      Ein Paket wandert zwischen Lehrkräften, Klassen und Halbjahren; der Kurs
      tut das nicht. Stünde die Zeile im Paket, trüge jede weitergegebene
      Datei den Kurs desjenigen, der sie zuletzt gedruckt hat.
    */
    await seed();
    const vorher = await getPack(PACK_ID);
    const user = setup();
    await screen.findByRole('list');

    await user.type(screen.getByLabelText('Kopfzeile'), 'E | LK | Q2 | Ohm');

    expect(window.localStorage.getItem('lexiflow.print.course')).toBe('E | LK | Q2 | Ohm');
    expect(await getPack(PACK_ID)).toEqual(vorher);
  });
});

describe('Die Tabellendatei', () => {
  it('lädt sie mit Inhalt und passendem Namen herunter', async () => {
    await seed();
    const user = setup();
    await screen.findByRole('list');

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
    await screen.findByRole('list');

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
    await screen.findByRole('list');

    await user.selectOptions(screen.getByLabelText(/Reihenfolge/), 'alphabetical');
    await user.click(screen.getByRole('button', { name: 'Als Tabelle herunterladen (.csv)' }));

    const nachher = await getPack(PACK_ID);
    expect(nachher).toEqual(vorher);
  });
});

describe('Fehlende Pakete', () => {
  it('sagt es, statt eine leere Liste zu zeigen', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Paket nicht gefunden' })).toBeInTheDocument();
  });
});
