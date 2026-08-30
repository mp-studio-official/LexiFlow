import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData } from '../data/db';
import { getPack, savePack } from '../data/packRepo';
import { getProgressIndex } from '../data/progressRepo';
import { parsePackFile, serializePack } from '../domain/vocabpack';
import { buildTasksForTargets, mulberry32, planSession } from '../domain/exercises';
import { draftsToEntries, validateDrafts, type DraftRow } from './draft';
import { topicSuggestionsToDrafts } from './topicDraft';
import { createChromePromptAiProvider } from '../ai/chromePromptAiProvider';
import { nullAiProvider } from '../ai/AiProvider';
import { nullTranslationProvider } from '../translation/TranslationProvider';
import { createFakeLanguageModelScope } from '../test/fakeTranslator';
import type { VocabPack } from '../domain/schema';

/**
 * **Das wichtigste Akzeptanzkriterium von Sprint 2B.2a.**
 *
 * Ein Paket aus der Themenwerkstatt muss auf einem Gerät ganz ohne Sprachmodell
 * vollständig funktionieren. Der Weg wird hier komplett durchlaufen: vom
 * nachgebauten Browsermodell über die Prüfung bis zur Lernrunde.
 */

const TOPIC = 'City life';

const MODEL_ANSWER = JSON.stringify({
  entries: [
    {
      english: 'crowded',
      germanAnswers: ['überfüllt', 'voll'],
      partOfSpeech: 'adjective',
      difficulty: 3,
      topicTags: ['city'],
      exampleSentence: { english: 'The bus was crowded.', german: 'Der Bus war voll.' },
    },
    {
      english: 'litter',
      germanAnswers: ['Müll'],
      partOfSpeech: 'noun',
      difficulty: 2,
      topicTags: ['city', 'environment'],
      exampleSentence: { english: 'Please do not drop litter.', german: 'Bitte wirf keinen Müll weg.' },
    },
    {
      english: 'to apologise',
      germanAnswers: ['sich entschuldigen'],
      partOfSpeech: 'verb',
      difficulty: 4,
      topicTags: ['city'],
      // Passt nicht zum Stichwort – muss lokal entfernt werden.
      exampleSentence: { english: 'The streets were very quiet.', german: 'Die Straßen waren sehr ruhig.' },
    },
  ],
});

/** Schritt 1–2: Vorschläge mit dem nachgebauten Modell erzeugen und prüfen. */
async function topicDrafts(): Promise<DraftRow[]> {
  const { scope } = createFakeLanguageModelScope({ respond: () => MODEL_ANSWER });
  const provider = createChromePromptAiProvider(scope);
  await provider.prepare('suggest-from-topic');

  const suggestions = await provider.suggestFromTopic(TOPIC, {
    grade: '7',
    cefrLevel: 'A2',
    topic: TOPIC,
    difficulty: 3,
    maxItems: 10,
  });

  const result = topicSuggestionsToDrafts(suggestions, { maxItems: 10, topic: TOPIC });
  expect(result.accepted).toBe(3);
  expect(result.droppedSentences).toBe(1);
  return result.drafts;
}

function buildPack(drafts: readonly DraftRow[]): VocabPack {
  const now = '2026-03-01T09:00:00.000Z';
  return {
    meta: {
      id: 'pack-topic',
      title: 'City life – Vorschläge',
      topic: TOPIC,
      grade: '7',
      cefrLevel: 'A2',
      cefrLevelOverridden: false,
      direction: 'en-de',
      createdAt: now,
      updatedAt: now,
    },
    entries: draftsToEntries(drafts, 'topic-ai'),
  };
}

beforeEach(async () => {
  await clearAllLocalData();
});

describe('Vom Thema zum geprüften Entwurf', () => {
  it('erzeugt bearbeitbare Zeilen mit Herkunft „topic-ai“', async () => {
    const drafts = await topicDrafts();

    expect(drafts.map((draft) => draft.english)).toEqual(['crowded', 'litter', 'to apologise']);
    expect(drafts.every((draft) => draft.sourceType === 'topic-ai')).toBe(true);
    expect(drafts.every((draft) => draft.issues.every((issue) => issue.level !== 'error'))).toBe(true);
  });

  it('behält nur den passenden Beispielsatz', async () => {
    const drafts = await topicDrafts();

    expect(drafts[0]?.sentences[0]?.english).toBe('The bus was crowded.');
    expect(drafts[1]?.sentences[0]?.english).toBe('Please do not drop litter.');
    // Der unpassende Satz ist weg – und die Zeile sagt warum.
    expect(drafts[2]?.sentences).toEqual([]);
    expect(
      drafts[2]?.issues.some((issue) => issue.message.includes('Beispielsatz enthielt')),
    ).toBe(true);
  });

  it('lässt sich wie jede andere Zeile bearbeiten', async () => {
    const drafts = await topicDrafts();
    const edited = validateDrafts(
      drafts.map((draft) =>
        draft.english === 'litter' ? { ...draft, german: 'Abfall', include: false } : draft,
      ),
    );

    const entries = draftsToEntries(edited, 'topic-ai');
    expect(entries.map((entry) => entry.english)).toEqual(['crowded', 'to apologise']);
  });
});

describe('Die Datei bleibt anbieterfrei', () => {
  it('enthält keine Provider-, Prompt- oder Modelldaten', async () => {
    const file = serializePack(buildPack(await topicDrafts()));

    expect(JSON.parse(file).formatVersion).toBe(1);
    for (const forbidden of [
      'provider',
      'chrome-prompt',
      'LanguageModel',
      'responseConstraint',
      'prompt',
      'suggestion',
      'confidence',
      'Jahrgangsstufe',
      'Sprachniveau',
    ]) {
      expect(file.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    for (const forbidden of ['box', 'dueAt', 'streak', 'sessionCount']) {
      expect(file).not.toContain(forbidden);
    }
  });
});

describe('Empfang ohne Sprachmodell', () => {
  it('importiert, behält alles und lässt sofort üben', async () => {
    // Der Empfänger hat weder Übersetzung noch Sprachmodell.
    await expect(nullAiProvider.getAvailability('suggest-from-topic')).resolves.toBe('unavailable');
    await expect(nullTranslationProvider.getAvailability('en', 'de')).resolves.toBe('unavailable');
    expect(nullAiProvider.capabilities()).toEqual([]);

    const file = serializePack(buildPack(await topicDrafts()));
    const parsed = parsePackFile(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await savePack(parsed.pack);
    const stored = await getPack('pack-topic');
    expect(stored).toBeDefined();
    if (!stored) return;

    const crowded = stored.entries.find((entry) => entry.english === 'crowded');
    expect(crowded?.germanAnswers).toEqual(['überfüllt', 'voll']);
    expect(crowded?.partOfSpeech).toBe('adjective');
    expect(crowded?.difficulty).toBe(3);
    expect(crowded?.topicTags).toEqual(['city', 'City life']);
    expect(crowded?.exampleSentences[0]).toEqual({
      english: 'The bus was crowded.',
      german: 'Der Bus war voll.',
    });
    expect(crowded?.sourceType).toBe('topic-ai');

    // Der unpassende Satz ist auch im Paket nicht enthalten.
    const apologise = stored.entries.find((entry) => entry.english === 'to apologise');
    expect(apologise?.exampleSentences).toEqual([]);

    // Und es lässt sich sofort üben.
    const progress = await getProgressIndex('pack-topic');
    const plan = planSession(stored.entries, progress, stored.meta.direction, 10, new Date(), mulberry32(1));
    expect(plan.plannedCount).toBe(3);
    expect(buildTasksForTargets(plan.targets, stored.entries, progress, [], mulberry32(1)))
      .toHaveLength(3);
  });
});
