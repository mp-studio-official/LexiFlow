import { describe, expect, it } from 'vitest';
import {
  emptyTopicDraft,
  existingHeadwords,
  sentenceContainsHeadword,
  topicSuggestionsToDrafts,
} from './topicDraft';
import { draftsToEntries } from './draft';
import type { AiVocabSuggestion } from '../ai/AiProvider';

/**
 * Sprint 2B.2a: Das Modell hält sein Schema ein – mehr nicht. Alles Fachliche
 * prüft diese Schicht selbst, und zwar rein und nachvollziehbar.
 */

function suggestion(partial: Partial<AiVocabSuggestion> = {}): AiVocabSuggestion {
  return {
    english: 'crowded',
    germanAnswers: ['überfüllt'],
    partOfSpeech: 'adjective',
    difficulty: 3,
    topicTags: ['city'],
    ...partial,
  };
}

describe('Beispielsatz muss das Stichwort enthalten', () => {
  it('erkennt das Stichwort als eigenes Wort', () => {
    expect(sentenceContainsHeadword('The bus was crowded.', 'crowded')).toBe(true);
    expect(sentenceContainsHeadword('The BUS was Crowded today.', 'crowded')).toBe(true);
  });

  it('lässt sich von einem Wortteil nicht täuschen', () => {
    expect(sentenceContainsHeadword('We sorted it by category.', 'cat')).toBe(false);
    expect(sentenceContainsHeadword('She is crowdfunding the trip.', 'crowd')).toBe(false);
  });

  it('erkennt eine vollständige Wendung', () => {
    expect(sentenceContainsHeadword('Please come back as soon as possible.', 'as soon as possible'))
      .toBe(true);
    expect(sentenceContainsHeadword('Please come back soon.', 'as soon as possible')).toBe(false);
  });

  it('erlaubt beim Infinitiv auch die Form ohne „to“', () => {
    expect(sentenceContainsHeadword('I want to apologise for the noise.', 'to apologise')).toBe(true);
    expect(sentenceContainsHeadword('She apologised immediately.', 'to apologise')).toBe(false);
    expect(sentenceContainsHeadword('They apologise every time.', 'to apologise')).toBe(true);
  });

  it('lehnt leere Eingaben ab', () => {
    expect(sentenceContainsHeadword('', 'crowded')).toBe(false);
    expect(sentenceContainsHeadword('The bus was crowded.', '  ')).toBe(false);
  });

  it('übernimmt einen passenden Satz und verwirft einen unpassenden', () => {
    const result = topicSuggestionsToDrafts(
      [
        suggestion({
          english: 'crowded',
          exampleSentences: [{ english: 'The bus was crowded.', german: 'Der Bus war voll.' }],
        }),
        suggestion({
          english: 'litter',
          germanAnswers: ['Müll'],
          exampleSentences: [{ english: 'Please keep the park clean.', german: 'Halte den Park sauber.' }],
        }),
      ],
      { maxItems: 10 },
    );

    expect(result.drafts[0]?.sentences[0]?.english).toBe('The bus was crowded.');
    expect(result.drafts[0]?.sentences[0]?.german).toBe('Der Bus war voll.');
    expect(result.drafts[1]?.sentences).toEqual([]);
    expect(result.droppedSentences).toBe(1);
    expect(result.drafts[1]?.issues.some((issue) => issue.message.includes('Beispielsatz enthielt')))
      .toBe(true);
  });

  it('zählt eine Zeile ohne Satzvorschlag nicht als verworfen', () => {
    const result = topicSuggestionsToDrafts([suggestion()], { maxItems: 5 });
    expect(result.droppedSentences).toBe(0);
    expect(result.drafts[0]?.issues.some((issue) => issue.message.includes('Beispielsatz enthielt')))
      .toBe(false);
  });
});

describe('Dubletten und Leerwerte', () => {
  it('entfernt doppelte Stichwörter unabhängig von der Schreibweise', () => {
    const result = topicSuggestionsToDrafts(
      [suggestion({ english: 'crowded' }), suggestion({ english: 'Crowded' }), suggestion({ english: ' crowded ' })],
      { maxItems: 10 },
    );
    expect(result.accepted).toBe(1);
    expect(result.received).toBe(3);
  });

  it('lässt bereits vorhandene Vokabeln aus', () => {
    const result = topicSuggestionsToDrafts(
      [suggestion({ english: 'crowded' }), suggestion({ english: 'litter', germanAnswers: ['Müll'] })],
      { maxItems: 10, existingEnglish: ['CROWDED'] },
    );
    expect(result.drafts.map((draft) => draft.english)).toEqual(['litter']);
  });

  it('verwirft Einträge ohne deutsche Antwort', () => {
    const result = topicSuggestionsToDrafts(
      [suggestion({ germanAnswers: [] }), suggestion({ english: 'litter', germanAnswers: ['   '] })],
      { maxItems: 10 },
    );
    expect(result.accepted).toBe(0);
  });

  it('entfernt doppelte Übersetzungen und Tags', () => {
    const result = topicSuggestionsToDrafts(
      [
        suggestion({
          germanAnswers: ['überfüllt', 'Überfüllt', ' überfüllt ', 'voll'],
          topicTags: ['city', 'City', 'traffic'],
        }),
      ],
      { maxItems: 10, topic: 'City' },
    );
    expect(result.drafts[0]?.german).toBe('überfüllt, voll');
    expect(result.drafts[0]?.tags).toBe('city, traffic');
  });

  it('normalisiert Leerzeichen', () => {
    const result = topicSuggestionsToDrafts(
      [suggestion({ english: '  to   look   after ', germanAnswers: ['  sich  kümmern '] })],
      { maxItems: 5 },
    );
    expect(result.drafts[0]?.english).toBe('to look after');
    expect(result.drafts[0]?.german).toBe('sich kümmern');
  });

  it('ergänzt das Thema als Tag, wenn es fehlt', () => {
    const result = topicSuggestionsToDrafts([suggestion({ topicTags: [] })], {
      maxItems: 5,
      topic: 'City life',
    });
    expect(result.drafts[0]?.tags).toBe('City life');
  });
});

describe('Anzahl und Herkunft', () => {
  const many = Array.from({ length: 12 }, (_, index) =>
    suggestion({ english: `word${index + 1}`, germanAnswers: [`Wort${index + 1}`] }),
  );

  it('begrenzt auf die gewünschte Anzahl', () => {
    const result = topicSuggestionsToDrafts(many, { maxItems: 5 });
    expect(result.accepted).toBe(5);
    expect(result.received).toBe(12);
  });

  it('erlaubt weniger Einträge als angefordert', () => {
    const result = topicSuggestionsToDrafts(many.slice(0, 8), { maxItems: 10 });
    expect(result.accepted).toBe(8);
  });

  it('setzt sourceType „topic-ai“', () => {
    const result = topicSuggestionsToDrafts([suggestion()], { maxItems: 5 });
    expect(result.drafts[0]?.sourceType).toBe('topic-ai');
    expect(draftsToEntries(result.drafts, 'import')[0]?.sourceType).toBe('topic-ai');
  });

  it('vergibt eigene, eindeutige IDs', () => {
    const result = topicSuggestionsToDrafts(many, { maxItems: 12 });
    const ids = result.drafts.map((draft) => draft.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  it('übernimmt Wortart und Schwierigkeit, aber nichts Ungültiges', () => {
    const result = topicSuggestionsToDrafts(
      [suggestion({ difficulty: 4 }), suggestion({ english: 'litter', germanAnswers: ['Müll'], difficulty: 9 })],
      { maxItems: 5 },
    );
    expect(result.drafts[0]?.difficulty).toBe(4);
    expect(result.drafts[0]?.partOfSpeech).toBe('adjective');
    expect(result.drafts[1]?.difficulty).toBe('');
  });

  it('erzeugt gültige Zeilen ohne blockierende Fehler', () => {
    const result = topicSuggestionsToDrafts([suggestion()], { maxItems: 5 });
    expect(result.drafts[0]?.issues.some((issue) => issue.level === 'error')).toBe(false);
    expect(draftsToEntries(result.drafts, 'import')).toHaveLength(1);
  });
});

describe('Hilfsfunktionen', () => {
  it('erzeugt eine leere Zeile mit dem Thema als Tag', () => {
    const [draft] = emptyTopicDraft('  City   life ');
    expect(draft?.tags).toBe('City life');
    expect(draft?.english).toBe('');
    expect(draft?.sourceType).toBe('manual');
  });

  it('liefert nur normalisierte Stichwörter, keine Übersetzungen', () => {
    expect(
      existingHeadwords([
        { english: ' crowded ' },
        { english: 'Crowded' },
        { english: 'litter' },
        { english: '   ' },
      ]),
    ).toEqual(['crowded', 'litter']);
  });
});
