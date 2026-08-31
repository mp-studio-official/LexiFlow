import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { clearAllLocalData, db } from '../../data/db';
import { savePack } from '../../data/packRepo';
import { makeEntry, makeMeta } from '../../test/fixtures';
import type { LearningDirection } from '../../domain/schema';

/**
 * Sprint 3B.2b1: „Runde anpassen“.
 *
 * Die sichtbare Einrichtung des freien Übens war in 3B.2b versehentlich
 * verschwunden; wer Richtung oder Übungsform wählen wollte, hätte URL-Parameter
 * tippen müssen. Diese Tests halten fest, dass die Auswahl wieder normal
 * bedienbar ist – und dass die Seite dabei nichts speichert.
 */

type ProgressRepo = typeof import('../../data/progressRepo');

const calls = vi.hoisted(() => ({ startSession: 0, recordAnswer: 0 }));

vi.mock('../../data/progressRepo', async (importOriginal) => {
  const actual = await importOriginal<ProgressRepo>();
  return {
    ...actual,
    startSession: (...args: Parameters<ProgressRepo['startSession']>) => {
      calls.startSession += 1;
      return actual.startSession(...args);
    },
    recordAnswer: (...args: Parameters<ProgressRepo['recordAnswer']>) => {
      calls.recordAnswer += 1;
      return actual.recordAnswer(...args);
    },
  } satisfies ProgressRepo;
});

const { FreePracticeSetupPage } = await import('./FreePracticeSetupPage');

const PACK_ID = 'pack-free-setup';

/** Zeigt die Zieladresse an, damit der Test die erzeugten Parameter lesen kann. */
function RoundStub() {
  const location = useLocation();
  return (
    <div>
      <h1>Runde</h1>
      <p data-testid="round-url">{`${location.pathname}${location.search}`}</p>
    </div>
  );
}

async function seed(direction: LearningDirection = 'both', withSentence = true): Promise<void> {
  await savePack({
    meta: makeMeta({ id: PACK_ID, direction, title: 'Halong Bay' }),
    entries: [
      makeEntry({
        id: 'e1',
        english: 'island',
        germanAnswers: ['die Insel'],
        exampleSentences: withSentence
          ? [{ english: 'The island is famous.', german: 'Die Insel ist berühmt.' }]
          : [],
      }),
      makeEntry({ id: 'e2', english: 'bay', germanAnswers: ['die Bucht'] }),
      makeEntry({ id: 'e3', english: 'cave', germanAnswers: ['die Höhle'] }),
      makeEntry({ id: 'e4', english: 'boat', germanAnswers: ['das Boot'] }),
    ],
  });
}

function renderSetup(): void {
  render(
    <MemoryRouter initialEntries={[`/lernen/${PACK_ID}/frei`]}>
      <Routes>
        <Route path="/lernen/:packId/frei" element={<FreePracticeSetupPage />} />
        <Route path="/lernen/:packId/uebung" element={<RoundStub />} />
        <Route path="/lernen/:packId" element={<h1>Paketseite</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Der ganze Vorschautext am Stück – die Zahlen stehen in eigenen Elementen. */
function previewText(): string {
  return (document.querySelector('.self-test__preview')?.textContent ?? '').replace(/\s+/g, ' ');
}

function roundUrl(): URLSearchParams {
  const raw = screen.getByTestId('round-url').textContent ?? '';
  return new URLSearchParams(raw.split('?')[1] ?? '');
}

beforeEach(async () => {
  calls.startSession = 0;
  calls.recordAnswer = 0;
  await clearAllLocalData();
});

describe('Freies Üben einrichten', () => {
  it('bietet Richtung, Umfang und Übungsformen an – ohne URL-Basteln', async () => {
    await seed('both');
    renderSetup();

    expect(await screen.findByRole('heading', { level: 2, name: 'Runde anpassen' })).toBeInTheDocument();

    expect(screen.getByRole('radio', { name: 'Gemischt' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Englisch → Deutsch' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Deutsch → Englisch' })).toBeInTheDocument();

    for (const size of ['Bis zu 5 Aufgaben', 'Bis zu 10 Aufgaben', 'Bis zu 15 Aufgaben', 'Bis zu 20 Aufgaben']) {
      expect(screen.getByRole('radio', { name: size })).toBeInTheDocument();
    }
    expect(screen.getByRole('radio', { name: 'Alle verfügbaren (8)' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Bis zu 15 Aufgaben' })).toBeChecked();

    expect(screen.getByRole('checkbox', { name: 'Karteikarte' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Multiple Choice' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Offene Übersetzung' })).toBeChecked();
  });

  it('bietet einseitigen Paketen keine Scheinwahl der Richtung an', async () => {
    await seed('en-de');
    renderSetup();

    await screen.findByRole('heading', { level: 2, name: 'Runde anpassen' });
    expect(screen.queryByRole('radio', { name: 'Gemischt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Deutsch → Englisch' })).not.toBeInTheDocument();
  });

  it('zeigt nur Übungsformen, die das Paket in dieser Richtung hergibt', async () => {
    await seed('en-de');
    renderSetup();

    await screen.findByRole('heading', { level: 2, name: 'Runde anpassen' });
    // Lückensätze brauchen die produktive Richtung.
    expect(screen.queryByRole('checkbox', { name: /Lückensatz/ })).not.toBeInTheDocument();
    // Die Gruppen stehen als Text da, nicht nur als Anordnung.
    expect(screen.getByText(/Offen – du schreibst die Antwort selbst/)).toBeInTheDocument();
    expect(screen.getByText(/Geschlossen – die Antwort steht vor dir/)).toBeInTheDocument();
  });

  it('entfernt beim Richtungswechsel unmögliche Formen und sagt es', async () => {
    await seed('both');
    const user = userEvent.setup();
    renderSetup();

    // Produktiv: Lückensätze sind möglich.
    await user.click(await screen.findByRole('radio', { name: 'Deutsch → Englisch' }));
    expect(screen.getByRole('checkbox', { name: 'Lückensatz mit Wortbank' })).toBeInTheDocument();

    // Genau eine Form wählen – und zwar eine, die es rezeptiv nicht gibt.
    await user.click(screen.getByRole('checkbox', { name: 'Karteikarte' }));
    await user.click(screen.getByRole('checkbox', { name: 'Multiple Choice' }));
    await user.click(screen.getByRole('checkbox', { name: 'Offene Übersetzung' }));
    await user.click(screen.getByRole('checkbox', { name: 'Lückensatz ohne Wortbank' }));
    expect(screen.getByRole('checkbox', { name: 'Lückensatz mit Wortbank' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Englisch → Deutsch' }));

    expect(screen.queryByRole('checkbox', { name: /Lückensatz/ })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Lückensatz mit Wortbank ist in dieser Richtung nicht möglich/),
    ).toBeInTheDocument();
    // Ohne eigene Wahl gilt wieder „alles, was geht“ – die Runde läuft nicht leer.
    expect(screen.getByRole('checkbox', { name: 'Multiple Choice' })).toBeChecked();
  });

  it('lässt die letzte Übungsform stehen und erklärt warum', async () => {
    await seed('en-de');
    const user = userEvent.setup();
    renderSetup();

    await user.click(await screen.findByRole('checkbox', { name: 'Karteikarte' }));
    await user.click(screen.getByRole('checkbox', { name: 'Multiple Choice' }));

    const last = screen.getByRole('checkbox', { name: 'Offene Übersetzung' });
    expect(last).toBeChecked();

    await user.click(last);

    expect(last).toBeChecked();
    expect(screen.getByText('Mindestens eine Übungsform muss ausgewählt bleiben.')).toBeInTheDocument();
  });

  it('nennt Verfügbarkeit und geplante Anzahl ehrlich', async () => {
    await seed('both');
    const user = userEvent.setup();
    renderSetup();

    await screen.findByRole('heading', { level: 2, name: 'Runde anpassen' });
    expect(previewText()).toContain('8 Aufgaben stehen in dieser Richtung zur Verfügung.');
    expect(previewText()).toContain('8 Aufgaben werden eingeplant.');

    await user.click(screen.getByRole('radio', { name: 'Bis zu 5 Aufgaben' }));
    expect(previewText()).toContain('5 Aufgaben werden eingeplant.');
    expect(previewText()).toContain('Die übrigen 3 folgen in einer weiteren Runde');
  });

  it('erklärt, wenn weniger möglich ist als gewünscht', async () => {
    await seed('en-de');
    renderSetup();

    // Vier Vokabeln, eine Richtung – mehr als vier gibt es nicht.
    await screen.findByRole('heading', { level: 2, name: 'Runde anpassen' });
    expect(previewText()).toContain('4 Aufgaben stehen in dieser Richtung zur Verfügung.');
    expect(previewText()).toContain('Für 4 davon ist eine der gewählten Übungsformen möglich.');
    expect(previewText()).toContain('4 Aufgaben werden eingeplant.');
    expect(previewText()).toContain('Mehr gibt dieses Paket mit dieser Auswahl nicht her');
  });

  /*
    Sprint 3B.2b2: Eine ausdrücklich gewählte Form wird eingehalten. Vokabeln,
    die sie nicht hergeben, fallen aus der Runde – und die Vorschau sagt das
    als Zahl, nicht als Entschuldigung für eine Ersatzform.
  */
  it('nennt die durch die Formwahl reduzierte Zahl', async () => {
    await seed('both');
    const user = userEvent.setup();
    renderSetup();

    await user.click(await screen.findByRole('radio', { name: 'Deutsch → Englisch' }));
    // Nur Lückensätze – die gibt es aber nur für „island“.
    await user.click(screen.getByRole('checkbox', { name: 'Karteikarte' }));
    await user.click(screen.getByRole('checkbox', { name: 'Multiple Choice' }));
    await user.click(screen.getByRole('checkbox', { name: 'Offene Übersetzung' }));
    await user.click(screen.getByRole('checkbox', { name: 'Lückensatz ohne Wortbank' }));

    expect(previewText()).toContain('4 Aufgaben stehen in dieser Richtung zur Verfügung.');
    expect(previewText()).toContain('Für 1 davon ist eine der gewählten Übungsformen möglich.');
    expect(previewText()).toContain('1 Aufgabe wird eingeplant.');
    expect(previewText()).not.toContain('andere geeignete Form');
  });

  it('sperrt den Start, wenn keine Aufgabe möglich ist', async () => {
    /*
      Zur Sicherheit angelegt, nicht als Normalfall: Angeboten werden nur
      Formen, die dieses Paket in dieser Richtung hergibt, und mindestens eine
      bleibt immer ausgewählt – über die Bedienung ist die Auswahl deshalb nie
      leer. Ein Paket ohne Vokabeln kann es aber sehr wohl sein.
    */
    await savePack({ meta: makeMeta({ id: PACK_ID, direction: 'both' }), entries: [] });
    renderSetup();

    await screen.findByRole('heading', { level: 2, name: 'Runde anpassen' });
    expect(screen.getByRole('button', { name: 'Frei üben starten' })).toBeDisabled();
    expect(screen.getByText(/Mit dieser Auswahl ist keine Aufgabe möglich/)).toBeInTheDocument();
    // Die Auswahl bleibt bedienbar – die Seite ist keine Sackgasse.
    expect(screen.getByRole('radio', { name: 'Deutsch → Englisch' })).toBeEnabled();
  });

  it('nimmt nur Aufgaben der gewählten Form in die gestartete Runde', async () => {
    await seed('both');
    const user = userEvent.setup();
    renderSetup();

    await user.click(await screen.findByRole('radio', { name: 'Deutsch → Englisch' }));
    await user.click(screen.getByRole('checkbox', { name: 'Karteikarte' }));
    await user.click(screen.getByRole('checkbox', { name: 'Multiple Choice' }));
    await user.click(screen.getByRole('checkbox', { name: 'Offene Übersetzung' }));
    await user.click(screen.getByRole('checkbox', { name: 'Lückensatz ohne Wortbank' }));

    // Genau eine Vokabel gibt einen Lückensatz her – die Vorschau sagt 1 …
    expect(previewText()).toContain('1 Aufgabe wird eingeplant.');

    await user.click(screen.getByRole('button', { name: 'Frei üben starten' }));

    // … und genau diese eine Form steht in der URL.
    expect(roundUrl().get('kinds')).toBe('cloze-bank');
  });

  it('erzeugt die bekannten URL-Parameter', async () => {
    await seed('both');
    const user = userEvent.setup();
    renderSetup();

    await user.click(await screen.findByRole('radio', { name: 'Deutsch → Englisch' }));
    await user.click(screen.getByRole('radio', { name: 'Bis zu 5 Aufgaben' }));
    await user.click(screen.getByRole('checkbox', { name: 'Karteikarte' }));

    await user.click(screen.getByRole('button', { name: 'Frei üben starten' }));

    const params = roundUrl();
    expect(params.get('mode')).toBe('free');
    expect(params.get('direction')).toBe('de-en');
    expect(params.get('length')).toBe('5');
    expect(params.get('kinds')?.split(',')).not.toContain('flashcard');
    expect(params.get('kinds')?.split(',')).toContain('multiple-choice');
    expect(Number(params.get('seed'))).toBeGreaterThan(0);
  });

  it('setzt bei „Alle verfügbaren“ die volle Zahl in die URL', async () => {
    await seed('both');
    const user = userEvent.setup();
    renderSetup();

    await user.click(await screen.findByRole('radio', { name: 'Alle verfügbaren (8)' }));
    await user.click(screen.getByRole('button', { name: 'Frei üben starten' }));

    expect(roundUrl().get('length')).toBe('8');
  });

  it('lässt „Gemischt“ aus der URL heraus – das ist die Voreinstellung', async () => {
    await seed('both');
    const user = userEvent.setup();
    renderSetup();

    await user.click(await screen.findByRole('button', { name: 'Frei üben starten' }));
    expect(roundUrl().has('direction')).toBe(false);
  });

  it('speichert beim Einrichten nichts', async () => {
    await seed('both');
    const user = userEvent.setup();
    renderSetup();

    await user.click(await screen.findByRole('radio', { name: 'Deutsch → Englisch' }));
    await user.click(screen.getByRole('radio', { name: 'Bis zu 10 Aufgaben' }));
    await user.click(screen.getByRole('checkbox', { name: 'Multiple Choice' }));

    expect(calls.startSession).toBe(0);
    expect(calls.recordAnswer).toBe(0);
    expect(await db.directionProgress.count()).toBe(0);
    expect(await db.packProgress.count()).toBe(0);
  });
});
