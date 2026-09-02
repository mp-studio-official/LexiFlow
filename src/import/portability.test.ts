import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData } from '../data/db';
import { getPack, savePack } from '../data/packRepo';
import { getProgressIndex } from '../data/progressRepo';
import { parsePackFile, serializePack } from '../domain/vocabpack';
import { planSession } from '../domain/exercises';
import { buildTasksForTargets, mulberry32 } from '../domain/exercises';
import { detectColumns } from '../import/columnDetect';
import { buildDrafts, draftsToEntries, validateDrafts, type DraftRow } from './draft';
import { acceptAllForField, acceptSuggestion, type SuggestionField } from './suggestions';
import {
  applyRuleSuggestions,
  modelSuggestions,
  translationSuggestion,
  type LearningContext,
} from './enrichment';
import { addSuggestions } from './suggestions';
import { nullAiProvider } from '../ai/AiProvider';
import { nullTranslationProvider } from '../translation/TranslationProvider';
import type { VocabPack } from '../domain/schema';
import { VOCABPACK_FORMAT_VERSION } from '../domain/schema';

/**
 * **Das wichtigste Akzeptanzkriterium von Sprint 2B.1.**
 *
 * Ein Paket, das mit Vorschlägen entstanden ist, muss auf einem Gerät ganz ohne
 * Übersetzung und ohne Sprachmodell vollständig funktionieren. Wer es bekommt,
 * braucht keinen Anbieter, keinen Browser mit KI und kein Konto – nur die
 * Datei.
 */

const CONTEXT: LearningContext = { grade: '7', cefrLevel: 'A2', topic: 'City life' };

const ROWS = [
  ['Englisch', 'Deutsch'],
  ['to apologise', ''],
  ['crowded', ''],
  ['neighbourhood', ''],
];

/** Schritt 1–3: importieren, Vorschläge erzeugen, ausdrücklich übernehmen. */
function enrichedDrafts(): DraftRow[] {
  const imported = buildDrafts(ROWS, detectColumns(ROWS), { splitMultipleMeanings: true });

  // Regelvorschläge – ohne Modell, sofort.
  let drafts = applyRuleSuggestions(imported, CONTEXT);

  // Übersetzung und Sprachmodell – hier als bereits geprüfte Ergebnisse.
  const german: Record<string, string> = {
    'to apologise': 'sich entschuldigen',
    crowded: 'überfüllt',
    neighbourhood: 'Nachbarschaft',
  };
  drafts = drafts.map((draft) =>
    addSuggestions(draft, [
      ...translationSuggestion(german[draft.english] ?? ''),
      ...modelSuggestions({
        english: draft.english,
        germanAnswers: [],
        difficulty: 3,
        topicTags: ['city'],
      }),
    ]),
  );

  // Ausdrücklich übernehmen – nichts geschieht von allein.
  for (const field of ['german', 'partOfSpeech', 'difficulty', 'topicTags'] as SuggestionField[]) {
    drafts = acceptAllForField(drafts, field);
  }
  // Wie im Assistenten: nach der Übernahme neu prüfen.
  return validateDrafts(drafts);
}

function buildPack(drafts: readonly DraftRow[]): VocabPack {
  const now = '2026-03-01T09:00:00.000Z';
  return {
    meta: {
      id: 'pack-portable',
      title: 'Unit 3 – City life',
      topic: CONTEXT.topic,
      grade: CONTEXT.grade,
      cefrLevel: CONTEXT.cefrLevel,
      cefrLevelOverridden: false,
      direction: 'en-de',
      createdAt: now,
      updatedAt: now,
    },
    // Normale CSV-Herkunft bleibt `import` – Vorschläge ändern daran nichts.
    entries: draftsToEntries(drafts, 'import'),
  };
}

beforeEach(async () => {
  await clearAllLocalData();
});

describe('Vom Vorschlag zum fertigen Eintrag', () => {
  it('übernimmt genau die geprüften Werte', () => {
    const entries = buildPack(enrichedDrafts()).entries;
    const apologise = entries.find((entry) => entry.english === 'to apologise');

    expect(apologise?.germanAnswers).toEqual(['sich entschuldigen']);
    expect(apologise?.partOfSpeech).toBe('verb');
    expect(apologise?.difficulty).toBe(3);
    expect(apologise?.topicTags).toEqual(['City life', 'city']);
    expect(entries).toHaveLength(3);
  });

  it('lässt den sourceType eines normalen Imports unverändert', () => {
    for (const entry of buildPack(enrichedDrafts()).entries) {
      expect(entry.sourceType).toBe('import');
    }
  });

  it('speichert nichts, was nicht übernommen wurde', () => {
    const imported = buildDrafts(ROWS, detectColumns(ROWS), { splitMultipleMeanings: true });
    const suggestedOnly = applyRuleSuggestions(imported, CONTEXT).map((draft) =>
      addSuggestions(draft, translationSuggestion('irgendetwas')),
    );
    // Ohne deutsche Antwort ist die Zeile fehlerhaft und fällt heraus.
    expect(draftsToEntries(suggestedOnly, 'import')).toHaveLength(0);

    const [oneAccepted] = validateDrafts([
      acceptSuggestion(acceptSuggestion(suggestedOnly[0] as DraftRow, 'german'), 'partOfSpeech'),
    ]);
    if (!oneAccepted) throw new Error('Zeile fehlt');
    const entry = draftsToEntries([oneAccepted], 'import')[0];
    expect(entry?.germanAnswers).toEqual(['irgendetwas']);
    expect(entry?.partOfSpeech).toBe('verb');
    // Der nicht übernommene Tag-Vorschlag steht nicht im Eintrag.
    expect(entry?.topicTags).toEqual([]);
  });
});

describe('Die Datei bleibt anbieterfrei', () => {
  const file = serializePack(buildPack(enrichedDrafts()));

  it('bleibt bei der aktuellen Formatversion', () => {
    expect(JSON.parse(file).formatVersion).toBe(VOCABPACK_FORMAT_VERSION);
    expect(JSON.parse(file).kind).toBe('lexiflow.vocabpack');
  });

  it('enthält keine Provider-, Modell-, Prompt- oder Konfidenzdaten', () => {
    for (const forbidden of [
      'suggestion',
      'suggestions',
      'provider',
      'chrome-prompt',
      'chrome-translator',
      'local-rule',
      'local-translator',
      'local-language-model',
      'confidence',
      'prompt',
      'model',
      'LanguageModel',
      'Translator',
      'provenance',
      'suggested',
      'confidence',
    ]) {
      expect(file.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('enthält keine Lernstände', () => {
    for (const forbidden of ['box', 'dueAt', 'streak', 'correctCount', 'sessionCount']) {
      expect(file).not.toContain(forbidden);
    }
  });
});

describe('Empfang ohne jeden Anbieter', () => {
  it('liest, speichert und übt das Paket mit Nullanbietern', async () => {
    // Der Empfänger hat weder Übersetzung noch Sprachmodell.
    await expect(nullTranslationProvider.getAvailability('en', 'de')).resolves.toBe('unavailable');
    await expect(nullAiProvider.getAvailability('enrich-entry')).resolves.toBe('unavailable');
    expect(nullAiProvider.capabilities()).toEqual([]);

    const file = serializePack(buildPack(enrichedDrafts()));

    // Schritt 6: importieren.
    const parsed = parsePackFile(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await savePack(parsed.pack);
    const stored = await getPack('pack-portable');
    expect(stored).toBeDefined();
    if (!stored) return;

    // Schritt 7: alles ist vollständig erhalten.
    const apologise = stored.entries.find((entry) => entry.english === 'to apologise');
    expect(apologise?.germanAnswers).toEqual(['sich entschuldigen']);
    expect(apologise?.partOfSpeech).toBe('verb');
    expect(apologise?.difficulty).toBe(3);
    expect(apologise?.topicTags).toEqual(['City life', 'city']);

    for (const entry of stored.entries) {
      expect(entry.germanAnswers.length).toBeGreaterThan(0);
      expect(entry.difficulty).toBe(3);
      expect(entry.topicTags).toContain('City life');
    }

    // Schritt 8: keine Provider- oder Modellspur im gespeicherten Paket.
    expect(JSON.stringify(stored)).not.toMatch(/suggestion|provider|confidence|local-rule/i);

    // Schritt 10: das Paket lässt sich sofort üben.
    const progress = await getProgressIndex('pack-portable');
    const plan = planSession(stored.entries, progress, stored.meta.direction, 10, new Date(), mulberry32(1));
    expect(plan.plannedCount).toBe(3);

    const tasks = buildTasksForTargets(plan.targets, stored.entries, progress, [], mulberry32(1));
    expect(tasks).toHaveLength(3);
    expect(tasks[0]?.expected.length).toBeGreaterThan(0);
  });

  it('bleibt beim erneuten Serialisieren identisch', () => {
    const first = serializePack(buildPack(enrichedDrafts()));
    const parsed = parsePackFile(first);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(serializePack(parsed.pack)).toBe(first);
  });
});
