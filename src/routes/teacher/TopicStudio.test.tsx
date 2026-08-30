import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopicStudio } from './TopicStudio';
import { ProviderRegistry } from '../../providers/ProviderContext';
import { suggestCefrLevel, type CefrLevel, type Grade } from '../../domain/cefr';
import type { DraftRow } from '../../import/draft';
import type { TopicDraftResult } from '../../import/topicDraft';
import { createFakeAiProvider } from '../../test/fakeTranslator';
import type { AiProvider } from '../../ai/AiProvider';

/**
 * Sprint 2B.2a: Die Themenwerkstatt. Kein Test lädt je ein echtes Modell –
 * alles läuft gegen einen Fake-Anbieter.
 */

interface HarnessProps {
  ai?: AiProvider;
  existingEnglish?: string[];
  hasExistingDrafts?: boolean;
  onDrafts?: (drafts: DraftRow[], info: TopicDraftResult | null) => void;
  onPasteInstead?: () => void;
  initialTopic?: string;
}

/** Hülle mit Zustand – Thema, Jahrgang und Niveau leben wie im Assistenten oben. */
function Harness({
  ai,
  existingEnglish = [],
  hasExistingDrafts = false,
  onDrafts = () => undefined,
  onPasteInstead = () => undefined,
  initialTopic = '',
}: HarnessProps) {
  const [topic, setTopic] = useState(initialTopic);
  const [grade, setGrade] = useState<Grade>('7');
  const [cefrLevel, setCefrLevel] = useState<CefrLevel>(suggestCefrLevel('7'));

  return (
    <ProviderRegistry {...(ai ? { value: { ai } } : {})}>
      <TopicStudio
        topic={topic}
        grade={grade}
        cefrLevel={cefrLevel}
        existingEnglish={existingEnglish}
        onTopicChange={setTopic}
        onGradeChange={(next) => {
          setGrade(next);
          setCefrLevel(suggestCefrLevel(next));
        }}
        onCefrChange={setCefrLevel}
        onDrafts={onDrafts}
        onPasteInstead={onPasteInstead}
        hasExistingDrafts={hasExistingDrafts}
      />
      <p>Meta: {grade} · {cefrLevel} · {topic || '–'}</p>
    </ProviderRegistry>
  );
}

function setup(props: HarnessProps = {}) {
  render(<Harness {...props} />);
  return userEvent.setup();
}

async function generateButton(): Promise<HTMLElement> {
  return screen.findByRole('button', { name: /Vorschläge erzeugen/ });
}

describe('Eingaben', () => {
  it('verlangt ein Thema', async () => {
    const onDrafts = vi.fn();
    const ai = createFakeAiProvider();
    const user = setup({ ai: ai.provider, onDrafts });

    await user.click(await generateButton());

    expect(screen.getByText('Bitte gib ein Thema an.')).toBeInTheDocument();
    expect(ai.prepareCount()).toBe(0);
    expect(onDrafts).not.toHaveBeenCalled();
  });

  it('gibt Jahrgang und Niveau nach oben weiter', async () => {
    const user = setup({ ai: createFakeAiProvider().provider });

    await user.selectOptions(screen.getByLabelText('Jahrgang'), '9');
    expect(screen.getByText(/Meta: 9 · B1/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('GeR-Niveau'), 'B2');
    expect(screen.getByText(/Meta: 9 · B2/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Thema'), 'City life');
    expect(screen.getByText(/^Meta: 9 · B2 · City life$/)).toBeInTheDocument();
  });

  it('benennt die Schwierigkeitsstufen verständlich und erklärt den Bezug', async () => {
    setup({ ai: createFakeAiProvider().provider });

    for (const label of [
      '1 – sehr leicht',
      '2 – eher leicht',
      '3 – mittel',
      '4 – anspruchsvoll',
      '5 – sehr anspruchsvoll',
    ]) {
      expect(await screen.findByRole('option', { name: label })).toBeInTheDocument();
    }
    expect(
      screen.getByText(/bezieht sich auf die ausgewählte Lerngruppe, nicht auf eine allgemeingültige/),
    ).toBeInTheDocument();
  });

  it('bietet 5, 10, 15 und 20 Vokabeln an', async () => {
    setup({ ai: createFakeAiProvider().provider });
    for (const value of [5, 10, 15, 20]) {
      expect(await screen.findByRole('option', { name: `${value} Vokabeln` })).toBeInTheDocument();
    }
  });
});

describe('Ohne Sprachmodell', () => {
  it('erklärt die Lage und bietet zwei Auswege', async () => {
    setup();
    expect(
      await screen.findByText(/automatische Themenwerkstatt ist in diesem Browser nicht verfügbar/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Liste einfügen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leere Liste anlegen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Vorschläge erzeugen/ })).not.toBeInTheDocument();
    // Keine Browserwarnung, kein technischer Fehler.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('wechselt auf Wunsch zur Einfügen-Quelle', async () => {
    const onPasteInstead = vi.fn();
    const user = setup({ onPasteInstead });

    await user.click(await screen.findByRole('button', { name: 'Liste einfügen' }));
    expect(onPasteInstead).toHaveBeenCalledOnce();
  });

  it('legt eine leere Liste mit dem Thema als Tag an', async () => {
    const onDrafts = vi.fn();
    const user = setup({ onDrafts, initialTopic: 'City life' });

    await user.click(await screen.findByRole('button', { name: 'Leere Liste anlegen' }));

    const [rows, info] = onDrafts.mock.calls[0] as [DraftRow[], TopicDraftResult | null];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tags).toBe('City life');
    expect(rows[0]?.english).toBe('');
    expect(info).toBeNull();
  });

  it('verlangt auch für die leere Liste ein Thema', async () => {
    const onDrafts = vi.fn();
    const user = setup({ onDrafts });

    await user.click(await screen.findByRole('button', { name: 'Leere Liste anlegen' }));
    expect(screen.getByText('Bitte gib ein Thema an.')).toBeInTheDocument();
    expect(onDrafts).not.toHaveBeenCalled();
  });
});

describe('Vorschläge erzeugen', () => {
  it('lädt das Modell erst nach dem Klick', async () => {
    const ai = createFakeAiProvider();
    const user = setup({ ai: ai.provider, initialTopic: 'City life' });

    const button = await screen.findByRole('button', {
      name: 'Lokales Sprachmodell laden und Vorschläge erzeugen',
    });
    expect(ai.prepareCount()).toBe(0);

    await user.click(button);
    await waitFor(() => expect(ai.topicCalls()).toHaveLength(1));
    expect(ai.prepared()).toEqual(['suggest-from-topic']);
  });

  it('übergibt genau den nötigen Kontext', async () => {
    const ai = createFakeAiProvider();
    const user = setup({
      ai: ai.provider,
      initialTopic: 'City life',
      existingEnglish: ['crowded', 'litter'],
    });

    await user.selectOptions(screen.getByLabelText('Gewünschte Schwierigkeit'), '4');
    await user.selectOptions(screen.getByLabelText('Anzahl'), '5');
    await user.click(await generateButton());

    await waitFor(() => expect(ai.topicCalls()).toHaveLength(1));
    const call = ai.topicCalls()[0];
    expect(call?.topic).toBe('City life');
    expect(call?.context).toMatchObject({
      grade: '7',
      cefrLevel: 'A2+',
      difficulty: 4,
      maxItems: 5,
      existingEnglish: ['crowded', 'litter'],
    });
    // Keine Lernstände, keine IDs, keine Übersetzungen.
    expect(Object.keys(call?.context ?? {}).sort()).toEqual([
      'cefrLevel',
      'difficulty',
      'existingEnglish',
      'grade',
      'maxItems',
      'signal',
      'topic',
    ]);
  });

  it('lässt vorhandene Vokabeln auf Wunsch zu', async () => {
    const ai = createFakeAiProvider();
    const user = setup({ ai: ai.provider, initialTopic: 'City life', existingEnglish: ['crowded'] });

    await user.click(screen.getByRole('checkbox', { name: /Bereits vorhandene Vokabeln/ }));
    await user.click(await generateButton());

    await waitFor(() => expect(ai.topicCalls()).toHaveLength(1));
    expect(ai.topicCalls()[0]?.context.existingEnglish).toBeUndefined();
  });

  it('übergibt die Entwürfe und meldet die ehrliche Anzahl', async () => {
    const onDrafts = vi.fn();
    const ai = createFakeAiProvider({
      topicEntries: (topic) => [
        {
          english: 'crowded',
          germanAnswers: ['überfüllt'],
          partOfSpeech: 'adjective',
          difficulty: 3,
          topicTags: [topic],
          exampleSentences: [{ english: 'The bus was crowded.', german: 'Der Bus war voll.' }],
        },
        {
          english: 'litter',
          germanAnswers: ['Müll'],
          partOfSpeech: 'noun',
          difficulty: 2,
          topicTags: [topic],
        },
      ],
    });
    const user = setup({ ai: ai.provider, onDrafts, initialTopic: 'City life' });

    await user.click(await generateButton());

    await waitFor(() => expect(onDrafts).toHaveBeenCalled());
    expect(screen.getByText('2 von 10 Vorschlägen erzeugt.')).toBeInTheDocument();

    const [rows, info] = onDrafts.mock.calls[0] as [DraftRow[], TopicDraftResult];
    expect(rows.map((row) => row.english)).toEqual(['crowded', 'litter']);
    expect(rows[0]?.sourceType).toBe('topic-ai');
    expect(rows[0]?.sentences[0]?.english).toBe('The bus was crowded.');
    expect(info.accepted).toBe(2);
  });

  it('meldet einen Fehler verständlich und erlaubt einen neuen Versuch', async () => {
    const onDrafts = vi.fn();
    const ai = createFakeAiProvider({ topicFailsOnce: true });
    const user = setup({ ai: ai.provider, onDrafts, initialTopic: 'City life' });

    await user.click(await generateButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/nicht verwertbar/);
    expect(onDrafts).not.toHaveBeenCalled();

    await user.click(await generateButton());
    await waitFor(() => expect(onDrafts).toHaveBeenCalled());
  });

  it('erklärt eine leere Antwort, statt eine leere Vorschau zu öffnen', async () => {
    const onDrafts = vi.fn();
    const ai = createFakeAiProvider({ topicEntries: () => [] });
    const user = setup({ ai: ai.provider, onDrafts, initialTopic: 'City life' });

    await user.click(await generateButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(/keine brauchbaren Vorschläge/);
    expect(onDrafts).not.toHaveBeenCalled();
  });

  it('fragt vor dem Ersetzen bestehender Vorschläge nach', async () => {
    const onDrafts = vi.fn();
    const ai = createFakeAiProvider();
    const user = setup({
      ai: ai.provider,
      onDrafts,
      initialTopic: 'City life',
      hasExistingDrafts: true,
    });

    await user.click(await generateButton());
    expect(screen.getByText(/Eine neue Auswahl ersetzt sie vollständig/)).toBeInTheDocument();
    expect(ai.topicCalls()).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Vorschläge ersetzen' }));
    await waitFor(() => expect(onDrafts).toHaveBeenCalled());
  });

  it('bricht ab, ohne Entwürfe zu übergeben', async () => {
    const onDrafts = vi.fn();
    const ai = createFakeAiProvider({ gatePrepare: true });
    const user = setup({ ai: ai.provider, onDrafts, initialTopic: 'City life' });

    await user.click(await generateButton());
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    ai.releasePrepare();

    await waitFor(() => expect(screen.getByText('Abgebrochen.')).toBeInTheDocument());
    expect(onDrafts).not.toHaveBeenCalled();
  });

  it('bereitet dieselbe Fähigkeit kein zweites Mal vor', async () => {
    const ai = createFakeAiProvider();
    const user = setup({ ai: ai.provider, initialTopic: 'City life' });

    await user.click(await generateButton());
    await waitFor(() => expect(ai.topicCalls()).toHaveLength(1));

    await user.click(await generateButton());
    await waitFor(() => expect(ai.topicCalls()).toHaveLength(2));
    expect(ai.prepareCount()).toBe(1);
  });

  it('ist mit der Tastatur bedienbar', async () => {
    const ai = createFakeAiProvider();
    const user = setup({ ai: ai.provider });

    const topicField = screen.getByLabelText('Thema');
    topicField.focus();
    await user.keyboard('City life');

    const button = await generateButton();
    button.focus();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(ai.topicCalls()).toHaveLength(1));
  });
});
