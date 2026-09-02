import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData } from '../data/db';
import { getPack, savePack } from '../data/packRepo';
import { getProgressIndex } from '../data/progressRepo';
import { parsePackFile, serializePack } from '../domain/vocabpack';
import { buildTasksForTargets, mulberry32, planSession } from '../domain/exercises';
import { draftFromEntry, draftsToEntries, validateDrafts, type DraftRow } from './draft';
import { addSuggestedSentence, checkSentenceSuggestion, sentenceRequestFor } from './sentenceAssist';
import { createChromePromptAiProvider } from '../ai/chromePromptAiProvider';
import { nullAiProvider } from '../ai/AiProvider';
import { createFakeLanguageModelScope } from '../test/fakeTranslator';
import type { VocabPack } from '../domain/schema';
import { VOCABPACK_FORMAT_VERSION } from '../domain/schema';

/**
 * **Akzeptanzkriterium des Satzassistenten (Sprint 2B.2b).**
 *
 * Ein Satz, der mit Modellhilfe entstanden ist, muss auf einem Gerät ganz ohne
 * Modelle vollständig funktionieren – und das Paket darf davon nichts verraten.
 */

const MODEL_ANSWER = JSON.stringify({
  english: 'You should apologise to your friend.',
  german: 'Du solltest dich bei deinem Freund entschuldigen.',
});

const START: VocabPack = {
  meta: {
    id: 'pack-sentence',
    title: 'Höflichkeit',
    topic: 'Everyday English',
    grade: '8',
    cefrLevel: 'A2+',
    cefrLevelOverridden: false,
    direction: 'en-de',
    createdAt: '2026-03-01T09:00:00.000Z',
    updatedAt: '2026-03-01T09:00:00.000Z',
  },
  entries: [
    {
      id: 'entry-1',
      english: 'to apologise',
      germanAnswers: ['sich entschuldigen'],
      acceptedEnglishAnswers: [],
      exampleSentences: [{ english: 'He wanted to apologise at once.' }],
      topicTags: [],
      sourceType: 'manual',
    },
    {
      id: 'entry-2',
      english: 'polite',
      germanAnswers: ['höflich'],
      acceptedEnglishAnswers: [],
      exampleSentences: [],
      topicTags: [],
      sourceType: 'manual',
    },
  ],
};

/** Schritt 1–3: Vorschlag erzeugen, prüfen und ausdrücklich übernehmen. */
async function draftWithSuggestedSentence(): Promise<DraftRow[]> {
  const drafts = validateDrafts(START.entries.map(draftFromEntry));
  const target = drafts[0];
  expect(target).toBeDefined();
  if (!target) return drafts;

  const { scope } = createFakeLanguageModelScope({ respond: () => MODEL_ANSWER });
  const provider = createChromePromptAiProvider(scope);
  await provider.prepare('alternative-sentence');

  const suggestion = await provider.alternativeSentence(sentenceRequestFor(target, 'simpler'), {
    grade: '8',
    cefrLevel: 'A2+',
    topic: 'Everyday English',
  });

  const checked = checkSentenceSuggestion(suggestion, target);
  expect(checked.ok).toBe(true);
  if (!checked.ok) return drafts;

  // Erst hier – und nur hier – wandert der Vorschlag in den Entwurf.
  return validateDrafts(
    drafts.map((draft) =>
      draft.id === target.id
        ? addSuggestedSentence(draft, { english: checked.english, german: checked.german })
        : draft,
    ),
  );
}

function packFrom(drafts: readonly DraftRow[]): VocabPack {
  return { meta: START.meta, entries: draftsToEntries(drafts, 'manual') };
}

beforeEach(async () => {
  await clearAllLocalData();
});

describe('Vom Vorschlag zum gespeicherten Satz', () => {
  it('ergänzt den Satz, ohne den vorhandenen zu verlieren', async () => {
    const drafts = await draftWithSuggestedSentence();

    expect(drafts[0]?.sentences.map((sentence) => sentence.english)).toEqual([
      'He wanted to apologise at once.',
      'You should apologise to your friend.',
    ]);
    expect(drafts[0]?.sentences[1]?.german).toBe(
      'Du solltest dich bei deinem Freund entschuldigen.',
    );
  });

  it('lässt die Herkunft der Zeile unberührt', async () => {
    const entries = packFrom(await draftWithSuggestedSentence()).entries;
    // Ein ergänzter Satz macht aus einer Handarbeit keine Modellvokabel.
    expect(entries.every((entry) => entry.sourceType === 'manual')).toBe(true);
  });
});

describe('Die Datei bleibt anbieterfrei', () => {
  it('enthält weder Modell- noch Vorschlagsdaten', async () => {
    const file = serializePack(packFrom(await draftWithSuggestedSentence()));

    expect(JSON.parse(file).formatVersion).toBe(VOCABPACK_FORMAT_VERSION);
    for (const forbidden of [
      'provider',
      'chrome-prompt',
      'LanguageModel',
      'responseConstraint',
      'prompt',
      'suggestion',
      'simpler',
      'different-context',
      'alternative-sentence',
      'Jahrgangsstufe',
    ]) {
      expect(file.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    for (const forbidden of ['box', 'dueAt', 'streak', 'sessionCount']) {
      expect(file).not.toContain(forbidden);
    }
  });
});

describe('Empfang ohne Sprachmodell', () => {
  it('behält den Satz und macht ihn sofort übbar', async () => {
    await expect(nullAiProvider.getAvailability('alternative-sentence')).resolves.toBe('unavailable');

    const file = serializePack(packFrom(await draftWithSuggestedSentence()));
    const parsed = parsePackFile(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await savePack(parsed.pack);
    const stored = await getPack('pack-sentence');
    expect(stored).toBeDefined();
    if (!stored) return;

    const entry = stored.entries.find((item) => item.english === 'to apologise');
    expect(entry?.exampleSentences).toEqual([
      { english: 'He wanted to apologise at once.' },
      {
        english: 'You should apologise to your friend.',
        german: 'Du solltest dich bei deinem Freund entschuldigen.',
      },
    ]);

    // Und der Satz taugt als Übungsgrundlage: Er enthält das Stichwort.
    const progress = await getProgressIndex('pack-sentence');
    const plan = planSession(
      stored.entries,
      progress,
      stored.meta.direction,
      10,
      new Date(),
      mulberry32(1),
    );
    expect(plan.plannedCount).toBe(2);
    expect(
      buildTasksForTargets(plan.targets, stored.entries, progress, [], mulberry32(1)),
    ).toHaveLength(2);
  });
});
