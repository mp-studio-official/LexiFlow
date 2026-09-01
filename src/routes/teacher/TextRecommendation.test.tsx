import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextRecommendationPanel } from './TextRecommendationPanel';
import { ProviderRegistry } from '../../providers/ProviderContext';
import { extractTextCandidates } from '../../domain/textExtraction';
import { createFakeAiProvider } from '../../test/fakeTranslator';
import { MAX_CONTEXT_CANDIDATES } from '../../ai/AiProvider';
import type { AiTextCandidate, AiTextRecommendation } from '../../ai/AiProvider';
import type { LearningContext } from '../../import/enrichment';

/**
 * `TextRecommendationPanel` ist **außer Dienst**: Seit Sprint 4B.1 rendert es
 * niemand mehr, weil der Empfehlungsschritt dieselbe Frage nachrechenbar
 * beantwortet.
 *
 * Diese Datei prüft es deshalb nicht mehr im Zusammenspiel mit der
 * Kandidatenprüfung, sondern für sich – und beschränkt sich auf das, was den
 * Code aufhebenswert macht: **was an das Modell geht und was nicht**. Diese
 * Sorgfalt wäre teuer neu zu erfinden, und sie gilt für jeden künftigen
 * Modellaufruf, nicht nur für diesen.
 *
 * Was hier nicht mehr geprüft wird – Sortierung, Markierung, „Nur Empfehlungen
 * auswählen“ –, gibt es in der Oberfläche nicht mehr. Der Empfehlungsschritt
 * kommt ohne Auswahlkästchen aus; `TextCandidateReview.test.tsx` prüft ihn.
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
  const onRecommend = vi.fn();

  render(
    <ProviderRegistry value={{ ai: ai.provider }}>
      <TextRecommendationPanel
        candidates={extractTextCandidates(text)}
        context={CONTEXT}
        onContextChange={vi.fn()}
        onRecommend={onRecommend}
      />
    </ProviderRegistry>,
  );

  return { ai, onRecommend, user: userEvent.setup() };
}

async function recommendButton(): Promise<HTMLElement> {
  return screen.findByRole('button', { name: /Empfehlungen erzeugen/ });
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
    const long = Array.from(
      { length: 90 },
      (_, index) => `Sentence ${index} mentions wordx${index}.`,
    ).join(' ');
    const { ai, user } = setup({ text: long });

    await user.click(await recommendButton());
    await waitFor(() => expect(ai.textCalls()).toHaveLength(1));
    expect(ai.textCalls()[0]?.candidates.length).toBe(MAX_CONTEXT_CANDIDATES);
    expect(screen.getByText(/nicht der eingefügte Text/)).toBeInTheDocument();
  });
});

describe('Unbrauchbare Antworten', () => {
  it('verwirft unbekannte Schlüssel, statt Wörter zu erfinden', async () => {
    const { onRecommend, user } = setup({
      recommendationsFor: (candidates) => [
        { key: 'c999' },
        { key: 'skyline' },
        { key: candidates[0]?.key ?? '' },
      ],
    });

    await user.click(await recommendButton());
    await waitFor(() => expect(onRecommend).toHaveBeenCalled());
    // Genau ein Treffer – die beiden erfundenen Schlüssel fallen weg.
    expect(onRecommend.mock.calls.at(-1)?.[0]).toHaveLength(1);
  });

  it('meldet eine völlig unbrauchbare Antwort und erlaubt einen neuen Versuch', async () => {
    const { onRecommend, user } = setup({ recommendationsFor: () => [{ key: 'c999' }] });

    await user.click(await recommendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/keine verwertbaren Empfehlungen/);
    expect(onRecommend).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler und lässt es erneut versuchen', async () => {
    const { onRecommend, user } = setup({ textFailsOnce: true });

    await user.click(await recommendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/nicht verwertbar/);

    await user.click(await recommendButton());
    await waitFor(() => expect(onRecommend).toHaveBeenCalled());
  });
});

describe('Zustand nach dem Laden', () => {
  it('behauptet nach dem Laden nicht mehr, laden zu müssen', async () => {
    // Sprint 2B.2b1: Der Zustand blieb auf `downloadable` stehen.
    const { user } = setup({
      recommendationsFor: (candidates) => [{ key: candidates[0]?.key ?? '' }],
    });

    const before = await recommendButton();
    expect(before).toHaveTextContent('Lokales Sprachmodell laden und Empfehlungen erzeugen');

    await user.click(before);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Empfehlungen erzeugen/ })).toHaveTextContent(
        'Empfehlungen erzeugen',
      ),
    );
    expect(screen.queryByText(/Lokales Sprachmodell laden/)).not.toBeInTheDocument();
  });
});

describe('Ohne Sprachmodell', () => {
  it('bietet gar nichts an, statt eine Schaltfläche ins Leere zu stellen', async () => {
    setup({ textAvailability: 'unavailable' });

    expect(
      await screen.findByText(/Dieser Browser bietet kein lokales Sprachmodell/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Empfehlungen erzeugen/ })).not.toBeInTheDocument();
  });
});
