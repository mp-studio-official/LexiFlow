import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData } from '../data/db';
import { getPack, savePack } from '../data/packRepo';
import { getProgressIndex } from '../data/progressRepo';
import { analyzeText } from '../domain/textExtraction';
import { parsePackFile, serializePack } from '../domain/vocabpack';
import { buildTasksForTargets, mulberry32, planSession } from '../domain/exercises';
import { draftsToEntries, validateDrafts } from './draft';
import { candidatesToDrafts, type CandidateSelection } from './textDraft';
import { limitCandidates } from './candidateLimit';
import { buildCandidateContext, resolveRecommendations } from './textRecommendation';
import { createChromePromptAiProvider } from '../ai/chromePromptAiProvider';
import { nullAiProvider } from '../ai/AiProvider';
import type { VocabPack } from '../domain/schema';
import { createFakeLanguageModelScope } from '../test/fakeTranslator';
import { VOCABPACK_FORMAT_VERSION } from '../domain/schema';

/**
 * **Akzeptanzkriterium der Textempfehlung (Sprint 2B.2b).**
 *
 * Der ganze Weg in einem Test: lokal analysieren, das Modell ausschließlich
 * über neutrale Schlüssel empfehlen lassen, prüfen, dass die Auswahl dadurch
 * unangetastet bleibt, ausdrücklich übernehmen – und am Ende ein Paket, dem man
 * nicht ansieht, dass je ein Modell beteiligt war.
 */

const TEXT =
  'The crowded bus was late again. Litter is a problem in the neighbourhood. ' +
  'A quiet pavement helps everyone. The crowded street was noisy at night.';

const GERMAN: Readonly<Record<string, string>> = {
  crowded: 'überfüllt',
  litter: 'Müll',
  neighbourhood: 'Nachbarschaft',
  pavement: 'Gehweg',
  quiet: 'ruhig',
  bus: 'Bus',
  street: 'Straße',
  problem: 'Problem',
  late: 'spät',
  noisy: 'laut',
  night: 'Nacht',
  helps: 'hilft',
  everyone: 'alle',
};

beforeEach(async () => {
  await clearAllLocalData();
});

describe('Vom Text zur Empfehlung', () => {
  it('bewertet ausschließlich echte Kandidaten über neutrale Schlüssel', async () => {
    // 1. Lokale Analyse, danach die gewünschte Obergrenze.
    const analysis = analyzeText(TEXT);
    const shown = limitCandidates(analysis.candidates, 10);
    expect(shown.length).toBeGreaterThan(2);

    // 2. Das Modell sieht Schlüssel, keinen Text.
    const context = buildCandidateContext(shown);
    const payload = JSON.stringify(context.payload);
    expect(payload).not.toContain(TEXT);
    for (const candidate of shown) expect(payload).not.toContain(`"${candidate.id}"`);

    const answer = JSON.stringify({ recommendedKeys: ['c2', 'c1', 'c999'] });
    const { scope } = createFakeLanguageModelScope({ respond: () => answer });
    const provider = createChromePromptAiProvider(scope);
    await provider.prepare('suggest-from-text');

    const recommendations = await provider.suggestFromText(context.payload, {
      grade: '9',
      cefrLevel: 'B1',
      maxItems: 10,
    });

    // Der erfundene Schlüssel ist schon beim Anbieter gefallen.
    expect(recommendations).toEqual([{ key: 'c2' }, { key: 'c1' }]);

    const result = resolveRecommendations(recommendations, context, 10);
    expect(result.ids).toHaveLength(2);
    for (const id of result.ids) {
      expect(shown.some((candidate) => candidate.id === id)).toBe(true);
    }
  });

  it('erfindet auch bei einer völlig unbrauchbaren Antwort nichts', async () => {
    const context = buildCandidateContext(limitCandidates(analyzeText(TEXT).candidates, 10));
    const { scope } = createFakeLanguageModelScope({
      respond: () => JSON.stringify({ recommendedKeys: ['skyline', 'c404'] }),
    });
    const provider = createChromePromptAiProvider(scope);
    await provider.prepare('suggest-from-text');

    const recommendations = await provider.suggestFromText(context.payload, {
      grade: '9',
      cefrLevel: 'B1',
    });
    expect(resolveRecommendations(recommendations, context).ids).toEqual([]);
  });
});

describe('Übernahme und Export', () => {
  /** Empfehlung erzeugen, dann ausdrücklich nur diese übernehmen. */
  async function packFromRecommendations(): Promise<{ pack: VocabPack; chosen: number }> {
    const shown = limitCandidates(analyzeText(TEXT).candidates, 10);
    const context = buildCandidateContext(shown);

    const { scope } = createFakeLanguageModelScope({
      respond: () => JSON.stringify({ recommendedKeys: ['c1', 'c2'] }),
    });
    const provider = createChromePromptAiProvider(scope);
    await provider.prepare('suggest-from-text');
    const result = resolveRecommendations(
      await provider.suggestFromText(context.payload, { grade: '9', cefrLevel: 'B1' }),
      context,
    );

    // Schritt 3–5: Die Empfehlung ändert nichts von allein; hier entscheidet
    // der Test ausdrücklich, nur die empfohlenen zu übernehmen.
    const selections: CandidateSelection[] = shown
      .filter((candidate) => result.ids.includes(candidate.id))
      .map((candidate) => ({
        candidate,
        german: GERMAN[candidate.normalizedEnglish] ?? 'Bedeutung',
        translationAccepted: false,
        includeSentence: true,
      }));

    const drafts = validateDrafts(candidatesToDrafts(selections));
    return {
      chosen: selections.length,
      pack: {
        meta: {
          id: 'pack-text',
          title: 'City life – aus einem Text',
          topic: 'City life',
          grade: '9',
          cefrLevel: 'B1',
          cefrLevelOverridden: false,
          direction: 'en-de',
          createdAt: '2026-03-01T09:00:00.000Z',
          updatedAt: '2026-03-01T09:00:00.000Z',
        },
        entries: draftsToEntries(drafts, 'import'),
      },
    };
  }

  it('exportiert weder Empfehlungsschlüssel noch Modellstatus', async () => {
    const { pack } = await packFromRecommendations();
    const file = serializePack(pack);

    expect(JSON.parse(file).formatVersion).toBe(VOCABPACK_FORMAT_VERSION);
    for (const forbidden of [
      'recommendedKeys',
      'recommended',
      'suggest-from-text',
      'LanguageModel',
      'responseConstraint',
      'provider',
      'chrome-prompt',
    ]) {
      expect(file.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    // Auch die neutralen Schlüssel selbst tauchen nirgends auf.
    expect(file).not.toMatch(/"c\d+"/);
    for (const forbidden of ['box', 'dueAt', 'streak', 'sessionCount']) {
      expect(file).not.toContain(forbidden);
    }
  });

  it('importiert im zweiten Kontext ohne Modelle und lässt sofort üben', async () => {
    await expect(nullAiProvider.getAvailability('suggest-from-text')).resolves.toBe('unavailable');

    const { pack, chosen } = await packFromRecommendations();
    const parsed = parsePackFile(serializePack(pack));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await savePack(parsed.pack);
    const stored = await getPack('pack-text');
    expect(stored).toBeDefined();
    if (!stored) return;

    expect(stored.entries).toHaveLength(chosen);
    // Die Originalsätze aus dem Text sind vollständig mitgekommen.
    expect(stored.entries.every((entry) => entry.exampleSentences.length > 0)).toBe(true);

    const progress = await getProgressIndex('pack-text');
    const plan = planSession(
      stored.entries,
      progress,
      stored.meta.direction,
      10,
      new Date(),
      mulberry32(1),
    );
    expect(plan.plannedCount).toBe(chosen);
    expect(
      buildTasksForTargets(plan.targets, stored.entries, progress, [], mulberry32(1)),
    ).toHaveLength(chosen);
  });
});
