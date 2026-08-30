import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextCandidateReview } from './TextCandidateReview';
import { ProviderRegistry } from '../../providers/ProviderContext';
import { extractTextCandidates } from '../../domain/textExtraction';
import { createFakeAiProvider, createFakeTranslationProvider } from '../../test/fakeTranslator';
import { MAX_CONTEXT_CANDIDATES } from '../../ai/AiProvider';
import type { AiTextCandidate, AiTextRecommendation } from '../../ai/AiProvider';
import type { LearningContext } from '../../import/enrichment';
import type { CandidateSelection } from '../../import/textDraft';

/**
 * Sprint 2B.2b: Empfehlungen markieren – sie wählen nicht aus. Diese Grenze ist
 * der Kern dieser Datei.
 */

const TEXT =
  'The crowded bus was late. Litter is a problem in the neighbourhood. ' +
  'A quiet pavement helps everyone. The crowded street was noisy.';

const CONTEXT: LearningContext = { grade: '9', cefrLevel: 'B1', topic: 'City life' };

interface Options {
  recommendationsFor?: (candidates: readonly AiTextCandidate[]) => AiTextRecommendation[];
  textAvailability?: 'unavailable';
  textFailsOnce?: boolean;
  text?: string;
}

function setup(options: Options = {}) {
  const { text = TEXT, ...aiOptions } = options;
  const ai = createFakeAiProvider(aiOptions);
  const onApply = vi.fn();
  const onContextChange = vi.fn();

  render(
    <ProviderRegistry
      value={{ ai: ai.provider, translation: createFakeTranslationProvider().provider }}
    >
      <TextCandidateReview
        candidates={extractTextCandidates(text)}
        context={CONTEXT}
        onContextChange={onContextChange}
        requestedCount={20}
        onApply={onApply}
        onBack={() => undefined}
      />
    </ProviderRegistry>,
  );

  return { ai, onApply, onContextChange, user: userEvent.setup() };
}

async function recommendButton(): Promise<HTMLElement> {
  return screen.findByRole('button', { name: /Empfehlungen erzeugen/ });
}

/** Die Namen der Kandidaten in der angezeigten Reihenfolge. */
function listedWords(): string[] {
  return screen
    .getAllByRole('checkbox', { name: /übernehmen$/ })
    .map((box) => box.getAttribute('aria-label')?.replace(' übernehmen', '') ?? '');
}

function selectedWords(): string[] {
  return screen
    .getAllByRole('checkbox', { name: /übernehmen$/ })
    .filter((box) => (box as HTMLInputElement).checked)
    .map((box) => box.getAttribute('aria-label')?.replace(' übernehmen', '') ?? '');
}

describe('Modellkontext', () => {
  it('übergibt neutrale Schlüssel statt interner IDs', async () => {
    const { ai, user } = setup();
    await user.click(await recommendButton());
    await waitFor(() => expect(ai.textCalls()).toHaveLength(1));

    const passed = ai.textCalls()[0]?.candidates ?? [];
    expect(passed.map((item) => item.key)).toEqual(
      Array.from({ length: passed.length }, (_, index) => `c${index + 1}`),
    );
    for (const candidate of passed) {
      expect(Object.keys(candidate).sort()).toEqual([
        'english',
        'key',
        'occurrences',
        'sourceSentence',
      ]);
    }
  });

  it('übergibt nie den vollständigen Text und keine Lernstände', async () => {
    const { ai, user } = setup();
    await user.click(await recommendButton());
    await waitFor(() => expect(ai.textCalls()).toHaveLength(1));

    const call = ai.textCalls()[0];
    const serialized = JSON.stringify(call?.candidates);
    expect(serialized).not.toContain(TEXT);
    // Je Kandidat genau ein Satz – nicht alle.
    expect(serialized).not.toContain('The crowded bus was late. Litter');
    expect(Object.keys(call?.context ?? {}).sort()).toEqual([
      'cefrLevel',
      'grade',
      'maxItems',
      'signal',
      'topic',
    ]);
  });

  it('übergibt höchstens 60 Kandidaten', async () => {
    const long = Array.from({ length: 90 }, (_, index) => `Sentence ${index} mentions wordx${index}.`)
      .join(' ');
    const { ai, user } = setup({ text: long });

    await user.click(await recommendButton());
    await waitFor(() => expect(ai.textCalls()).toHaveLength(1));
    expect(ai.textCalls()[0]?.candidates.length).toBe(MAX_CONTEXT_CANDIDATES);
    expect(screen.getByText(/nicht der eingefügte Text/)).toBeInTheDocument();
  });
});

describe('Empfehlungen verändern die Auswahl nicht', () => {
  it('markiert nur – die Checkboxen bleiben, wie sie waren', async () => {
    const { user } = setup({
      recommendationsFor: (candidates) => [{ key: candidates[0]?.key ?? '' }],
    });

    // Vorher: eine Zeile von Hand abwählen.
    await user.click(screen.getByRole('checkbox', { name: 'Litter übernehmen' }));
    const before = selectedWords();
    expect(before).not.toContain('Litter');

    await user.click(await recommendButton());
    await screen.findByText('Für Lerngruppe empfohlen');

    // Nachher: exakt dieselbe Auswahl – nur die Reihenfolge darf sich ändern.
    expect([...selectedWords()].sort()).toEqual([...before].sort());
    expect(screen.getByText(/Die bisherige Auswahl blieb unverändert/)).toBeInTheDocument();
  });

  it('wählt erst nach „Nur Empfehlungen auswählen“ um', async () => {
    const { user } = setup({
      // „crowded“ kommt zweimal vor und steht damit auf c1.
      recommendationsFor: (candidates) => [{ key: candidates[0]?.key ?? '' }],
    });

    await user.click(await recommendButton());
    await screen.findByText('Für Lerngruppe empfohlen');

    await user.click(screen.getByRole('button', { name: 'Nur Empfehlungen auswählen' }));
    expect(selectedWords()).toEqual(['crowded']);
  });

  it('stellt die vollständige Auswahl wieder her', async () => {
    const { user } = setup({
      recommendationsFor: (candidates) => [{ key: candidates[0]?.key ?? '' }],
    });

    await user.click(await recommendButton());
    await screen.findByText('Für Lerngruppe empfohlen');
    await user.click(screen.getByRole('button', { name: 'Nur Empfehlungen auswählen' }));
    await user.click(screen.getByRole('button', { name: 'Alle wieder auswählen' }));

    expect([...selectedWords()].sort()).toEqual([...listedWords()].sort());
  });

  it('lässt die manuelle Änderung nach der Empfehlung gewinnen', async () => {
    const { user } = setup({
      recommendationsFor: (candidates) => [{ key: candidates[0]?.key ?? '' }],
    });

    await user.click(await recommendButton());
    await screen.findByText('Für Lerngruppe empfohlen');
    await user.click(screen.getByRole('button', { name: 'Nur Empfehlungen auswählen' }));

    // Von Hand eine nicht empfohlene Zeile dazunehmen.
    await user.click(screen.getByRole('checkbox', { name: 'Litter übernehmen' }));
    expect(selectedWords()).toEqual(expect.arrayContaining(['crowded', 'Litter']));
  });
});

describe('Anzeige und Reihenfolge', () => {
  it('sortiert Empfehlungen nach vorn', async () => {
    const { user } = setup({
      // Die Empfehlung nennt bewusst nicht den ersten Kandidaten zuerst.
      recommendationsFor: (candidates) => [
        { key: candidates[2]?.key ?? '' },
        { key: candidates[1]?.key ?? '' },
      ],
    });

    const initial = listedWords();
    await user.click(await recommendButton());
    await screen.findAllByText('Für Lerngruppe empfohlen');

    const after = listedWords();
    expect(after.slice(0, 2)).toEqual([initial[2], initial[1]]);
    expect(new Set(after)).toEqual(new Set(initial));
    expect(screen.getByRole('option', { name: 'Empfehlungen zuerst' })).toBeEnabled();
  });

  it('bietet „Empfehlungen zuerst“ erst nach einer Empfehlung an', async () => {
    setup();
    expect(await screen.findByRole('option', { name: 'Empfehlungen zuerst' })).toBeDisabled();
  });

  it('holt entfernte Kandidaten nicht zurück', async () => {
    const { user } = setup({
      recommendationsFor: (candidates) => candidates.map((candidate) => ({ key: candidate.key })),
    });

    await user.click(screen.getByRole('button', { name: 'Litter entfernen' }));
    expect(listedWords()).not.toContain('Litter');

    await user.click(await recommendButton());
    await screen.findAllByText('Für Lerngruppe empfohlen');

    expect(listedWords()).not.toContain('Litter');
  });

  it('nennt die Zahl der Empfehlungen ehrlich', async () => {
    const { user } = setup({
      recommendationsFor: (candidates) => [
        { key: candidates[0]?.key ?? '' },
        { key: candidates[1]?.key ?? '' },
      ],
    });

    await user.click(await recommendButton());
    // Einmal sichtbar in der Zusammenfassung, einmal als Ansage für Screenreader.
    const said = await screen.findAllByText(/2 von \d+ geprüften Kandidaten empfohlen\./);
    expect(said.length).toBeGreaterThan(0);
  });

  it('zeigt die ehrliche Zahl gefundener Vorschläge', async () => {
    setup();
    expect(
      await screen.findByText(/\d+ von 20 gewünschten Vokabelvorschlägen gefunden\./),
    ).toBeInTheDocument();
  });
});

describe('Zustand nach dem Laden', () => {
  it('behauptet nach dem Laden nicht mehr, laden zu müssen', async () => {
    // Sprint 2B.2b1: Der Zustand blieb auf `downloadable` stehen.
    const { user } = setup({
      recommendationsFor: (candidates) => [{ key: candidates[0]?.key ?? '' }],
    });

    const before = await screen.findByRole('button', { name: /Empfehlungen erzeugen/ });
    expect(before).toHaveTextContent('Lokales Sprachmodell laden und Empfehlungen erzeugen');

    await user.click(before);
    await screen.findByText('Für Lerngruppe empfohlen');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Empfehlungen erzeugen/ })).toHaveTextContent(
        'Empfehlungen erzeugen',
      ),
    );
    expect(screen.queryByText(/Lokales Sprachmodell laden/)).not.toBeInTheDocument();
  });
});

describe('Unbrauchbare Antworten', () => {
  it('verwirft unbekannte Schlüssel, statt Wörter zu erfinden', async () => {
    const { user } = setup({
      recommendationsFor: (candidates) => [
        { key: 'c999' },
        { key: 'skyline' },
        { key: candidates[0]?.key ?? '' },
      ],
    });

    await user.click(await recommendButton());
    await waitFor(() =>
      expect(screen.getAllByText('Für Lerngruppe empfohlen')).toHaveLength(1),
    );
    expect(listedWords()).not.toContain('skyline');
  });

  it('meldet eine völlig unbrauchbare Antwort und erlaubt einen neuen Versuch', async () => {
    const { user } = setup({ recommendationsFor: () => [{ key: 'c999' }] });

    await user.click(await recommendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/keine verwertbaren Empfehlungen/);
    expect(screen.queryByText('Für Lerngruppe empfohlen')).not.toBeInTheDocument();
  });

  it('meldet einen Fehler und lässt es erneut versuchen', async () => {
    const { user } = setup({ textFailsOnce: true });

    await user.click(await recommendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/nicht verwertbar/);

    await user.click(await recommendButton());
    await screen.findAllByText('Für Lerngruppe empfohlen');
  });
});

describe('Ohne Sprachmodell', () => {
  it('bleibt die Textwerkstatt vollständig benutzbar', async () => {
    const { onApply, user } = setup({ textAvailability: 'unavailable' });

    expect(
      await screen.findByText(/Dieser Browser bietet kein lokales Sprachmodell/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Empfehlungen erzeugen/ })).not.toBeInTheDocument();

    // Übersetzung und Übernahme funktionieren unverändert.
    expect(
      screen.getByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    ).toBeInTheDocument();

    const field = screen.getByLabelText('Deutsche Antwort für „crowded“');
    await user.clear(field);
    await user.type(field, 'überfüllt');
    await user.click(screen.getByRole('button', { name: /Vokabeln in die Vorschau übernehmen/ }));

    const selections = onApply.mock.calls.at(-1)?.[0] as CandidateSelection[];
    expect(selections.some((entry) => entry.german === 'überfüllt')).toBe(true);
  });

  it('lässt die Übersetzungsfunktion unberührt', async () => {
    const { user } = setup();
    expect(
      screen.getByRole('heading', { name: 'Übersetzungsvorschläge (optional)' }),
    ).toBeInTheDocument();

    // Die Übersetzung hat ihre eigene Schaltfläche – die Priorisierung eine andere.
    await user.click(
      await screen.findByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    );
    expect(await screen.findAllByText('maschineller Vorschlag')).not.toHaveLength(0);
  });
});
