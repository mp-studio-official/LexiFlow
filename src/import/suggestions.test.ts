import { describe, expect, it } from 'vitest';
import {
  acceptAllForField,
  acceptSuggestion,
  addSuggestion,
  addSuggestions,
  countOpen,
  isOpen,
  markManualEdits,
  rejectSuggestion,
  suggestionFor,
  syncManualEdits,
  type DraftSuggestion,
} from './suggestions';
import { applyRuleSuggestions, modelSuggestions, translationSuggestion } from './enrichment';
import { emptyDraft, newSentence, type DraftRow } from './draft';
import type { LearningContext } from './enrichment';

/**
 * Sprint 2B.1: Vorschläge sind Anregungen, keine Inhalte. Diese Tests halten
 * die drei Zusagen fest: nichts wird überschrieben, Handarbeit hat Vorrang,
 * Abgelehntes kommt nicht wieder.
 */

const CONTEXT: LearningContext = { grade: '7', cefrLevel: 'A2', topic: 'City life' };

function draft(partial: Partial<DraftRow> = {}): DraftRow {
  return { ...emptyDraft(), english: 'crowded', ...partial };
}

function suggestion(partial: Partial<DraftSuggestion> = {}): DraftSuggestion {
  return {
    field: 'partOfSpeech',
    value: 'adjective',
    source: 'local-rule',
    status: 'suggested',
    ...partial,
  };
}

describe('Aufnehmen', () => {
  it('nimmt einen Vorschlag für ein leeres Feld auf', () => {
    const row = addSuggestion(draft(), suggestion());
    expect(suggestionFor(row, 'partOfSpeech')?.value).toBe('adjective');
    expect(isOpen(row, 'partOfSpeech')).toBe(true);
    // Das Feld selbst bleibt leer, bis jemand übernimmt.
    expect(row.partOfSpeech).toBe('');
  });

  it('schlägt für ein belegtes Feld nichts vor', () => {
    const row = addSuggestion(draft({ partOfSpeech: 'noun' }), suggestion());
    expect(suggestionFor(row, 'partOfSpeech')).toBeUndefined();
  });

  it('ignoriert leere Werte', () => {
    expect(addSuggestion(draft(), suggestion({ value: '   ' })).suggestions).toBeUndefined();
  });
});

describe('Priorität mehrerer Quellen', () => {
  it('lässt das Sprachmodell eine offene Regel ersetzen', () => {
    const row = addSuggestions(draft(), [
      suggestion({ value: 'adjective', source: 'local-rule' }),
      suggestion({ value: 'verb', source: 'local-language-model' }),
    ]);
    expect(suggestionFor(row, 'partOfSpeech')?.value).toBe('verb');
    expect(suggestionFor(row, 'partOfSpeech')?.source).toBe('local-language-model');
  });

  it('lässt eine Regel das Sprachmodell nicht verdrängen', () => {
    const row = addSuggestions(draft(), [
      suggestion({ value: 'verb', source: 'local-language-model' }),
      suggestion({ value: 'adjective', source: 'local-rule' }),
    ]);
    expect(suggestionFor(row, 'partOfSpeech')?.source).toBe('local-language-model');
  });

  it('rührt eine getroffene Entscheidung nicht mehr an', () => {
    const rejected = rejectSuggestion(addSuggestion(draft(), suggestion()), 'partOfSpeech');
    const again = addSuggestion(rejected, suggestion({ source: 'local-language-model' }));
    expect(suggestionFor(again, 'partOfSpeech')?.status).toBe('rejected');
    expect(isOpen(again, 'partOfSpeech')).toBe(false);
  });
});

describe('Übernehmen', () => {
  it('schreibt den Wert ins Feld und merkt sich die Übernahme', () => {
    const row = acceptSuggestion(addSuggestion(draft(), suggestion()), 'partOfSpeech');
    expect(row.partOfSpeech).toBe('adjective');
    expect(suggestionFor(row, 'partOfSpeech')?.status).toBe('accepted');
    expect(isOpen(row, 'partOfSpeech')).toBe(false);
  });

  it('übernimmt eine Übersetzung', () => {
    const row = acceptSuggestion(
      addSuggestions(draft(), translationSuggestion('überfüllt')),
      'german',
    );
    expect(row.german).toBe('überfüllt');
  });

  it('übernimmt eine Schwierigkeit als Zahl', () => {
    const row = acceptSuggestion(
      addSuggestions(draft(), modelSuggestions({ english: 'crowded', germanAnswers: [], difficulty: 3 })),
      'difficulty',
    );
    expect(row.difficulty).toBe(3);
  });

  it('ergänzt Themen-Tags, statt sie zu ersetzen', () => {
    const row = acceptSuggestion(
      addSuggestion(draft({ tags: 'Sports' }), suggestion({ field: 'topicTags', value: 'City' })),
      'topicTags',
    );
    // Belegtes Feld: gar kein Vorschlag, also auch keine Übernahme.
    expect(row.tags).toBe('Sports');

    const empty = acceptSuggestion(
      addSuggestion(draft(), suggestion({ field: 'topicTags', value: 'City, City, Life' })),
      'topicTags',
    );
    expect(empty.tags).toBe('City, Life');
  });

  it('übernimmt einen abgelehnten Vorschlag nicht', () => {
    const row = acceptSuggestion(
      rejectSuggestion(addSuggestion(draft(), suggestion()), 'partOfSpeech'),
      'partOfSpeech',
    );
    expect(row.partOfSpeech).toBe('');
  });

  it('weist eine ungültige Wortart ab', () => {
    const row = acceptSuggestion(
      addSuggestion(draft(), suggestion({ value: 'Substantiv' })),
      'partOfSpeech',
    );
    expect(row.partOfSpeech).toBe('');
  });
});

describe('Handarbeit hat Vorrang', () => {
  it('markiert ein selbst geändertes Feld als eigene Bearbeitung', () => {
    const before = acceptSuggestion(
      addSuggestions(draft(), translationSuggestion('überfüllt')),
      'german',
    );
    const after = markManualEdits(before, { ...before, german: 'voll' });

    expect(suggestionFor(after, 'german')?.status).toBe('edited');
    expect(after.german).toBe('voll');
  });

  it('lässt unveränderte Felder in Ruhe', () => {
    const before = addSuggestion(draft(), suggestion());
    expect(markManualEdits(before, before)).toBe(before);
  });

  it('paart Zeilen über die id', () => {
    const a = addSuggestions(draft({ id: 'a' }), translationSuggestion('überfüllt'));
    const b = draft({ id: 'b' });
    const synced = syncManualEdits([a, b], [{ ...a, german: 'voll' }, b]);
    expect(suggestionFor(synced[0] as DraftRow, 'german')?.status).toBe('edited');
  });

  it('macht aus einer Ablehnung keine Bearbeitung', () => {
    const rejected = rejectSuggestion(addSuggestion(draft(), suggestion()), 'partOfSpeech');
    const edited = markManualEdits(rejected, { ...rejected, partOfSpeech: 'noun' });
    expect(suggestionFor(edited, 'partOfSpeech')?.status).toBe('rejected');
  });
});

describe('Sammelaktionen', () => {
  const rows = [
    addSuggestions(draft({ id: '1', english: 'crowded' }), translationSuggestion('überfüllt')),
    addSuggestions(draft({ id: '2', english: 'litter' }), translationSuggestion('Müll')),
    // Bereits übersetzt – hier gibt es gar keinen Vorschlag.
    addSuggestions(
      draft({ id: '3', english: 'quiet', german: 'ruhig' }),
      translationSuggestion('still'),
    ),
    // Abgewählt.
    addSuggestions(
      draft({ id: '4', english: 'noisy', include: false }),
      translationSuggestion('laut'),
    ),
  ];

  it('zählt nur ausgewählte Zeilen mit offenem Vorschlag', () => {
    expect(countOpen(rows, 'german')).toBe(2);
  });

  it('übernimmt genau diese Zeilen', () => {
    const applied = acceptAllForField(rows, 'german');
    expect(applied.map((row) => row.german)).toEqual(['überfüllt', 'Müll', 'ruhig', '']);
  });

  it('ersetzt niemals eine vorhandene Angabe', () => {
    const applied = acceptAllForField(rows, 'german');
    expect(applied[2]?.german).toBe('ruhig');
  });

  it('lässt abgelehnte Zeilen aus', () => {
    const withRejection = rows.map((row, index) =>
      index === 0 ? rejectSuggestion(row, 'german') : row,
    );
    expect(countOpen(withRejection, 'german')).toBe(1);
    expect(acceptAllForField(withRejection, 'german')[0]?.german).toBe('');
  });
});

describe('Regelvorschläge im Entwurf', () => {
  it('schlägt Wortart und Thema vor, ohne sie zu übernehmen', () => {
    const [row] = applyRuleSuggestions([draft({ english: 'to apologise' })], CONTEXT);
    expect(suggestionFor(row as DraftRow, 'partOfSpeech')?.value).toBe('verb');
    expect(suggestionFor(row as DraftRow, 'topicTags')?.value).toBe('City life');
    expect((row as DraftRow).partOfSpeech).toBe('');
    expect((row as DraftRow).tags).toBe('');
  });

  it('nutzt den Beispielsatz für die Wortart', () => {
    const [row] = applyRuleSuggestions(
      [
        draft({
          english: 'neighbourhood',
          sentences: [newSentence('The neighbourhood is crowded today.', '')],
        }),
      ],
      CONTEXT,
    );
    expect(suggestionFor(row as DraftRow, 'partOfSpeech')?.value).toBe('noun');
  });

  it('schlägt ohne Modell keine Schwierigkeit vor', () => {
    const [row] = applyRuleSuggestions([draft({ english: 'to apologise' })], CONTEXT);
    expect(suggestionFor(row as DraftRow, 'difficulty')).toBeUndefined();
  });

  it('erzeugt für dasselbe Material dieselben Vorschläge', () => {
    const first = applyRuleSuggestions([draft({ id: 'x', english: 'quickly' })], CONTEXT);
    const second = applyRuleSuggestions([draft({ id: 'x', english: 'quickly' })], CONTEXT);
    expect(first[0]?.suggestions).toEqual(second[0]?.suggestions);
  });

  it('doppelt ein bereits vorhandenes Thema nicht', () => {
    const [row] = applyRuleSuggestions([draft({ tags: 'city life' })], CONTEXT);
    expect(suggestionFor(row as DraftRow, 'topicTags')).toBeUndefined();
  });
});
