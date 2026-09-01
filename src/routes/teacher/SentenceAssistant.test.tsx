import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SentenceAssistant } from './SentenceAssistant';
import { DraftTable } from './DraftTable';
import { ProviderRegistry } from '../../providers/ProviderContext';
import { emptyDraft, newSentence, validateDrafts, type DraftRow } from '../../import/draft';
import { MAX_SENTENCES } from '../../import/sentenceAssist';
import { createFakeAiProvider } from '../../test/fakeTranslator';
import type { LearningContext } from '../../import/enrichment';
import type { AiProvider } from '../../ai/AiProvider';

/**
 * Sprint 2B.2b: Der Satzassistent. Kein Test lädt je ein echtes Modell.
 */

const CONTEXT: LearningContext = { grade: '8', cefrLevel: 'A2+', topic: 'City life' };

function row(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    ...emptyDraft(),
    english: 'to apologise',
    german: 'sich entschuldigen',
    sentences: [newSentence('He wanted to apologise to the class.', 'Er wollte sich entschuldigen.')],
    ...overrides,
  };
}

/** Hülle mit Zustand – der Entwurf lebt wie in der Tabelle darüber. */
function Harness({
  ai,
  initial,
  onDraft,
}: {
  ai?: AiProvider;
  initial: DraftRow;
  onDraft?: (draft: DraftRow) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <ProviderRegistry {...(ai ? { value: { ai } } : {})}>
      <SentenceAssistant
        draft={draft}
        context={CONTEXT}
        rowLabel="to apologise"
        onChange={(next) => {
          setDraft(next);
          onDraft?.(next);
        }}
      />
      <ul>
        {draft.sentences.map((sentence) => (
          <li key={sentence.id}>
            Satz: {sentence.english} | {sentence.german || '–'}
          </li>
        ))}
      </ul>
    </ProviderRegistry>
  );
}

function setup(props: { ai?: AiProvider; initial?: DraftRow; onDraft?: (draft: DraftRow) => void } = {}) {
  render(<Harness initial={props.initial ?? row()} {...props} />);
  return userEvent.setup();
}

describe('Modi', () => {
  it('bietet ohne Satz nur „Beispielsatz vorschlagen“ an', async () => {
    setup({ ai: createFakeAiProvider().provider, initial: row({ sentences: [] }) });

    expect(await screen.findByRole('button', { name: /Beispielsatz vorschlagen/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Einfacheren Satz/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anderen Kontext/ })).not.toBeInTheDocument();
  });

  it('bietet mit Satz beide Varianten an', async () => {
    setup({ ai: createFakeAiProvider().provider });

    expect(await screen.findByRole('button', { name: /Einfacheren Satz/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anderen Kontext/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Beispielsatz vorschlagen/ })).not.toBeInTheDocument();
  });

  it('übergibt genau diese Vokabel, ihre Sätze und den Modus', async () => {
    const ai = createFakeAiProvider();
    const user = setup({ ai: ai.provider });

    await user.click(await screen.findByRole('button', { name: /Einfacheren Satz/ }));
    await waitFor(() => expect(ai.sentenceCalls()).toHaveLength(1));

    const call = ai.sentenceCalls()[0];
    expect(call?.request).toEqual({
      english: 'to apologise',
      germanAnswers: ['sich entschuldigen'],
      existingSentences: ['He wanted to apologise to the class.'],
      mode: 'simpler',
    });
    // Kein Lernstand, keine ID, keine anderen Vokabeln.
    expect(Object.keys(call?.context ?? {}).sort()).toEqual([
      'cefrLevel',
      'grade',
      'signal',
      'topic',
    ]);
  });

  it('reicht den Modus „anderer Kontext“ durch', async () => {
    const ai = createFakeAiProvider();
    const user = setup({ ai: ai.provider });

    await user.click(await screen.findByRole('button', { name: /Anderen Kontext/ }));
    await waitFor(() => expect(ai.sentenceCalls()).toHaveLength(1));
    expect(ai.sentenceCalls()[0]?.request.mode).toBe('different-context');
  });
});

describe('Nichts ohne ausdrückliche Übernahme', () => {
  it('zeigt den Vorschlag getrennt und ändert nichts von allein', async () => {
    const onDraft = vi.fn();
    const ai = createFakeAiProvider();
    const user = setup({ ai: ai.provider, onDraft });

    await user.click(await screen.findByRole('button', { name: /Einfacheren Satz/ }));

    expect(await screen.findByText('They often apologise here.')).toBeInTheDocument();
    expect(screen.getByText('ungeprüfter Vorschlag')).toBeInTheDocument();
    // Der gespeicherte Satz ist unverändert; nichts wurde übernommen.
    expect(screen.getByText(/^Satz: He wanted to apologise to the class\./)).toBeInTheDocument();
    expect(onDraft).not.toHaveBeenCalled();
  });

  it('übernimmt den Vorschlag als weiteren Satz', async () => {
    const onDraft = vi.fn();
    const ai = createFakeAiProvider();
    const user = setup({ ai: ai.provider, onDraft });

    await user.click(await screen.findByRole('button', { name: /Einfacheren Satz/ }));
    await user.click(await screen.findByRole('button', { name: /als weiteren Satz übernehmen/ }));

    const next = onDraft.mock.calls[0]?.[0] as DraftRow;
    expect(next.sentences).toHaveLength(2);
    expect(next.sentences[1]?.english).toBe('They often apologise here.');
    expect(next.sentences[1]?.german).toBe('Ein deutscher Beispielsatz.');
    // Der erste Satz bleibt vollständig erhalten.
    expect(next.sentences[0]?.english).toBe('He wanted to apologise to the class.');
    // Und der Vorschlag verschwindet aus dem Angebotsbereich.
    expect(screen.queryByText('ungeprüfter Vorschlag')).not.toBeInTheDocument();
  });

  it('ersetzt einen vorhandenen Satz nur auf eigene Schaltfläche', async () => {
    const onDraft = vi.fn();
    const ai = createFakeAiProvider();
    const user = setup({ ai: ai.provider, onDraft });

    await user.click(await screen.findByRole('button', { name: /Einfacheren Satz/ }));
    await user.click(await screen.findByRole('button', { name: /Vorhandenen Satz .* ersetzen/ }));

    const next = onDraft.mock.calls[0]?.[0] as DraftRow;
    expect(next.sentences).toHaveLength(1);
    expect(next.sentences[0]?.english).toBe('They often apologise here.');
  });

  it('bietet ohne vorhandenen Satz kein Ersetzen an', async () => {
    const ai = createFakeAiProvider();
    const user = setup({ ai: ai.provider, initial: row({ sentences: [] }) });

    await user.click(await screen.findByRole('button', { name: /Beispielsatz vorschlagen/ }));
    await screen.findByText('They often apologise here.');
    expect(screen.queryByRole('button', { name: /ersetzen/ })).not.toBeInTheDocument();
  });

  it('lässt bei zehn Sätzen nur noch das Ersetzen zu', async () => {
    const ai = createFakeAiProvider();
    const user = setup({
      ai: ai.provider,
      initial: row({
        sentences: Array.from({ length: MAX_SENTENCES }, (_, index) =>
          newSentence(`Sentence ${index + 1} to apologise.`),
        ),
      }),
    });

    await user.click(await screen.findByRole('button', { name: /Einfacheren Satz/ }));
    await screen.findByText('They often apologise here.');

    expect(await screen.findByRole('button', { name: /als weiteren Satz übernehmen/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Vorhandenen Satz .* ersetzen/ })).toBeEnabled();
    expect(screen.getByText(/bereits 10 Beispielsätze/)).toBeInTheDocument();
  });

  it('verwirft den Vorschlag auf Wunsch spurlos', async () => {
    const onDraft = vi.fn();
    const ai = createFakeAiProvider();
    const user = setup({ ai: ai.provider, onDraft });

    await user.click(await screen.findByRole('button', { name: /Einfacheren Satz/ }));
    await user.click(await screen.findByRole('button', { name: /ablehnen/ }));

    expect(screen.queryByText('They often apologise here.')).not.toBeInTheDocument();
    expect(onDraft).not.toHaveBeenCalled();
  });
});

describe('Lokale Nachprüfung', () => {
  it('zeigt einen Satz ohne Stichwort gar nicht erst an', async () => {
    const onDraft = vi.fn();
    const ai = createFakeAiProvider({
      sentenceFor: () => ({ english: 'The weather was very nice today.' }),
    });
    const user = setup({ ai: ai.provider, onDraft });

    await user.click(await screen.findByRole('button', { name: /Einfacheren Satz/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/enthält das Stichwort nicht/);
    expect(screen.queryByText('ungeprüfter Vorschlag')).not.toBeInTheDocument();
    expect(onDraft).not.toHaveBeenCalled();
    // Der bestehende Satz ist unangetastet.
    expect(screen.getByText(/^Satz: He wanted to apologise to the class\./)).toBeInTheDocument();
  });

  it('lehnt einen doppelten Satz ab', async () => {
    const ai = createFakeAiProvider({
      sentenceFor: () => ({ english: 'He wanted to apologise to the class.' }),
    });
    const user = setup({ ai: ai.provider });

    await user.click(await screen.findByRole('button', { name: /Einfacheren Satz/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/steht schon bei dieser Vokabel/);
  });

  it('lehnt Auszeichnungen ab, statt sie zu entfernen', async () => {
    const ai = createFakeAiProvider({
      sentenceFor: () => ({ english: 'They often <b>apologise</b> here.' }),
    });
    const user = setup({ ai: ai.provider });

    await user.click(await screen.findByRole('button', { name: /Einfacheren Satz/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Auszeichnungen/);
  });

  it('erlaubt nach einer Ablehnung einen neuen Versuch', async () => {
    let call = 0;
    const ai = createFakeAiProvider({
      sentenceFor: () => {
        call += 1;
        return call === 1
          ? { english: 'The weather was nice.' }
          : { english: 'They often apologise here.' };
      },
    });
    const user = setup({ ai: ai.provider });

    await user.click(await screen.findByRole('button', { name: /Einfacheren Satz/ }));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /neu versuchen/i }));
    expect(await screen.findByText('They often apologise here.')).toBeInTheDocument();
    // Derselbe Modus wie beim ersten Versuch.
    expect(ai.sentenceCalls().map((entry) => entry.request.mode)).toEqual(['simpler', 'simpler']);
  });
});

describe('Fehler, Abbruch und fehlendes Modell', () => {
  it('meldet einen Fehler verständlich und erlaubt einen neuen Versuch', async () => {
    const ai = createFakeAiProvider({ sentenceFailsOnce: true });
    const user = setup({ ai: ai.provider });

    await user.click(await screen.findByRole('button', { name: /Einfacheren Satz/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/nicht verwertbar/);

    await user.click(screen.getByRole('button', { name: /neu versuchen/i }));
    expect(await screen.findByText('They often apologise here.')).toBeInTheDocument();
  });

  it('bricht ab, ohne etwas zu übernehmen', async () => {
    const onDraft = vi.fn();
    const ai = createFakeAiProvider({ gatePrepare: true });
    const user = setup({ ai: ai.provider, onDraft });

    await user.click(await screen.findByRole('button', { name: /Einfacheren Satz/ }));
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    ai.releasePrepare();

    await waitFor(() => expect(screen.getByText('Abgebrochen.')).toBeInTheDocument());
    expect(onDraft).not.toHaveBeenCalled();
  });

  it('bleibt ohne Prompt-API ruhig und ohne Warnung', async () => {
    const ai = createFakeAiProvider({ sentenceAvailability: 'unavailable' });
    setup({ ai: ai.provider });

    expect(
      await screen.findByText(/Satzvorschläge sind in diesem Browser nicht verfügbar/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /vorschlagen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('behauptet nach dem Laden nicht mehr, laden zu müssen', async () => {
    // Sprint 2B.2b1: Nach erfolgreichem `prepare()` blieb der Zustand auf
    // `downloadable` stehen – die Schaltfläche log den zweiten Klick an.
    const ai = createFakeAiProvider({ availability: 'downloadable' });
    const user = setup({ ai: ai.provider });

    const before = await screen.findByRole('button', { name: /Einfacheren Satz/ });
    expect(before).toHaveTextContent('Sprachmodell laden – Einfacheren Satz vorschlagen');

    await user.click(before);
    await waitFor(() => expect(ai.sentenceCalls()).toHaveLength(1));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Einfacheren Satz/ })).toHaveTextContent(
        'Einfacheren Satz vorschlagen',
      ),
    );
    expect(screen.getByRole('button', { name: /Anderen Kontext/ })).toHaveTextContent(
      'Anderen Kontext vorschlagen',
    );
    expect(screen.queryByText(/Sprachmodell laden –/)).not.toBeInTheDocument();
  });

  it('bereitet die Fähigkeit nur einmal vor', async () => {
    const ai = createFakeAiProvider();
    const user = setup({ ai: ai.provider });

    await user.click(await screen.findByRole('button', { name: /Einfacheren Satz/ }));
    await waitFor(() => expect(ai.sentenceCalls()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: /Anderen Kontext/ }));
    await waitFor(() => expect(ai.sentenceCalls()).toHaveLength(2));

    expect(ai.prepareCount()).toBe(1);
    expect(ai.prepared()).toEqual(['alternative-sentence']);
  });
});

describe('Tastatur und Fokus', () => {
  it('ist vollständig mit der Tastatur bedienbar', async () => {
    const onDraft = vi.fn();
    const ai = createFakeAiProvider();
    const user = setup({ ai: ai.provider, onDraft });

    const button = await screen.findByRole('button', { name: /Einfacheren Satz/ });
    button.focus();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');

    const accept = await screen.findByRole('button', { name: /als weiteren Satz übernehmen/ });
    accept.focus();
    expect(accept).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onDraft).toHaveBeenCalledOnce();
  });
});

describe('In beiden Bereichen verfügbar', () => {
  /** DraftTable steckt sowohl im Importassistenten als auch im Paketeditor. */
  function renderTable(sentenceContext?: LearningContext) {
    const drafts = validateDrafts([row()]);
    render(
      <ProviderRegistry value={{ ai: createFakeAiProvider().provider }}>
        <DraftTable
          drafts={drafts}
          onChange={() => undefined}
          {...(sentenceContext ? { sentenceContext } : {})}
        />
      </ProviderRegistry>,
    );
    return userEvent.setup();
  }

  it('erscheint im geöffneten Detailbereich, wenn ein Lernkontext vorliegt', async () => {
    const user = renderTable(CONTEXT);
    await user.click(screen.getByRole('button', { name: /Beispielsatz für to apologise bearbeiten/ }));

    expect(await screen.findByRole('button', { name: /Einfacheren Satz/ })).toBeInTheDocument();
    // Die manuelle Bearbeitung bleibt daneben bestehen.
    expect(screen.getByRole('button', { name: /Beispielsatz hinzufügen/ })).toBeInTheDocument();
  });

  it('fehlt ohne Lernkontext vollständig – die Tabelle bleibt wie bisher', async () => {
    const user = renderTable();
    await user.click(screen.getByRole('button', { name: /Beispielsatz für to apologise bearbeiten/ }));

    expect(await screen.findByRole('button', { name: /Beispielsatz hinzufügen/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Einfacheren Satz/ })).not.toBeInTheDocument();
  });

  it('zeigt keine Warnung je Tabellenzeile, sondern nur im offenen Detail', async () => {
    const drafts = validateDrafts([row(), row({ english: 'litter', german: 'Müll' })]);
    render(
      <ProviderRegistry value={{ ai: createFakeAiProvider({ availability: 'unavailable' }).provider }}>
        <DraftTable drafts={drafts} onChange={() => undefined} sentenceContext={CONTEXT} />
      </ProviderRegistry>,
    );

    expect(screen.queryByText(/nicht verfügbar/)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Beispielsatz für to apologise bearbeiten/ }));
    expect(await screen.findAllByText(/Satzvorschläge sind in diesem Browser nicht verfügbar/)).toHaveLength(1);
  });
});
