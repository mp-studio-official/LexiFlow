import { describe, expect, it } from 'vitest';
import {
  emptyTopicDraft,
  existingHeadwords,
  headwordsForPrompt,
  sentenceContainsHeadword,
  summarizeTopicResult,
  topicSuggestionsToDrafts,
} from './topicDraft';
import { draftsToEntries } from './draft';
import { MAX_CONTEXT_HEADWORDS, type AiVocabSuggestion } from '../ai/AiProvider';

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
    expect(sentenceContainsHeadword('They apologise every time.', 'to apologise')).toBe(true);
  });

  it('erkennt seit Sprint 3B.1 auch eine gebeugte Form', () => {
    // Der Satz enthält das Wort – nur eben so, wie Englisch es beugt. Eine
    // Warnung wäre hier schlicht falsch, und der Lückentext braucht genau
    // diese Form.
    expect(sentenceContainsHeadword('She apologised immediately.', 'to apologise')).toBe(true);
    expect(sentenceContainsHeadword('The bay has 1,969 islands.', 'island')).toBe(true);
    // Wortgrenzen gelten weiterhin: „cat“ steckt nicht in „category“.
    expect(sentenceContainsHeadword('This is a category.', 'cat')).toBe(false);
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

describe('Ehrliche Mengenanzeige', () => {
  /** Sprint 2B.2a1: gemessen wird an dem, was angefordert wurde – nie an sich selbst. */
  const valid = (count: number, prefix = 'word'): AiVocabSuggestion[] =>
    Array.from({ length: count }, (_, index) =>
      suggestion({ english: `${prefix}${index + 1}`, germanAnswers: [`Wort${index + 1}`] }),
    );

  it('merkt sich die gewünschte Anzahl', () => {
    const result = topicSuggestionsToDrafts(valid(8), { maxItems: 10 });
    expect(result.requested).toBe(10);
  });

  it('sagt „8 von 10“, wenn das Modell nur acht liefert', () => {
    const result = topicSuggestionsToDrafts(valid(8), { maxItems: 10 });

    expect(result).toMatchObject({ requested: 10, received: 8, accepted: 8 });
    const summary = summarizeTopicResult(result);
    expect(summary.headline).toBe('8 von 10 gewünschten Vorschlägen übernommen.');
    // Nichts wurde lokal entfernt – also gibt es dazu auch nichts zu sagen.
    expect(summary.detail).toBe('');
    expect(summary.headline).not.toContain('8 von 8');
  });

  it('erklärt bei lokal entfernten Einträgen, wo die Lücke herkommt', () => {
    // Acht gültige Einträge, zwei davon sind bereits vorhanden.
    const result = topicSuggestionsToDrafts(valid(8), {
      maxItems: 10,
      existingEnglish: ['word3', 'WORD7'],
    });

    expect(result).toMatchObject({ requested: 10, received: 8, accepted: 6 });
    const summary = summarizeTopicResult(result);
    expect(summary.headline).toBe('6 von 10 gewünschten Vorschlägen übernommen.');
    expect(summary.detail).toBe(
      'Das Sprachmodell lieferte 8; 2 Einträge wurden bei der lokalen Prüfung entfernt.',
    );
  });

  it('sagt „5 von 5“, wenn alles geklappt hat', () => {
    const result = topicSuggestionsToDrafts(valid(5), { maxItems: 5 });

    expect(result).toMatchObject({ requested: 5, received: 5, accepted: 5 });
    const summary = summarizeTopicResult(result);
    expect(summary.headline).toBe('5 von 5 gewünschten Vorschlägen übernommen.');
    expect(summary.detail).toBe('');
  });

  it('zählt nur gültige Einträge als geliefert', () => {
    const result = topicSuggestionsToDrafts(
      [...valid(3), suggestion({ english: 'litter', germanAnswers: [] }), suggestion({ english: '  ' })],
      { maxItems: 10 },
    );
    expect(result.received).toBe(3);
    expect(result.accepted).toBe(3);
  });

  it('erklärt nichts weg, wenn nur die Obergrenze gegriffen hat', () => {
    const result = topicSuggestionsToDrafts(valid(20), { maxItems: 5 });

    expect(result).toMatchObject({ requested: 5, received: 20, accepted: 5 });
    // Die 15 übrigen wurden nicht „bei der Prüfung entfernt“, sondern gar nicht gebraucht.
    expect(summarizeTopicResult(result).detail).toBe('');
  });

  it('formuliert Einzahl und Mehrzahl richtig', () => {
    const one = summarizeTopicResult({
      drafts: [],
      requested: 10,
      received: 8,
      accepted: 7,
      droppedSentences: 1,
    });
    expect(one.detail).toBe(
      'Das Sprachmodell lieferte 8; 1 Eintrag wurde bei der lokalen Prüfung entfernt.',
    );
    expect(one.sentences).toBe(
      'Ein Beispielsatz wurde entfernt, weil er das Stichwort nicht enthielt.',
    );

    const many = summarizeTopicResult({
      drafts: [],
      requested: 10,
      received: 10,
      accepted: 10,
      droppedSentences: 3,
    });
    expect(many.sentences).toBe(
      '3 Beispielsätze wurden entfernt, weil sie das Stichwort nicht enthielten.',
    );
    expect(many.detail).toBe('');
  });
});

describe('Begrenzter Modellkontext', () => {
  const bestand = (count: number): string[] =>
    Array.from({ length: count }, (_, index) => `word${String(index + 1).padStart(4, '0')}`);

  it('übergibt dem Modell höchstens die dokumentierte Obergrenze', () => {
    expect(MAX_CONTEXT_HEADWORDS).toBe(200);
    expect(headwordsForPrompt(bestand(500))).toHaveLength(MAX_CONTEXT_HEADWORDS);
  });

  it('wählt deterministisch aus – Reihenfolge der Datenbank egal', () => {
    const forward = bestand(500);
    const backward = [...forward].reverse();
    expect(headwordsForPrompt(backward)).toEqual(headwordsForPrompt(forward));
    expect(headwordsForPrompt(forward)).toEqual(headwordsForPrompt(forward));
  });

  it('berücksichtigt kleine Bestände vollständig', () => {
    expect(headwordsForPrompt(['litter', 'crowded', 'crowded'])).toEqual(['crowded', 'litter']);
    expect(headwordsForPrompt(bestand(200))).toHaveLength(200);
  });

  it('filtert eine Dublette auch dann, wenn sie außerhalb der Obergrenze lag', () => {
    const alle = bestand(500);
    const prompt = headwordsForPrompt(alle);
    const spaet = alle[499]; // word0500 – alphabetisch weit hinter der Grenze
    expect(spaet).toBeDefined();
    expect(prompt).not.toContain(spaet);

    // Das Modell schlägt genau dieses Wort trotzdem vor.
    const result = topicSuggestionsToDrafts(
      [suggestion({ english: spaet as string, germanAnswers: ['Wort'] }), suggestion({ english: 'litter', germanAnswers: ['Müll'] })],
      { maxItems: 10, existingEnglish: alle },
    );

    // Der vollständige lokale Filter kennt den ganzen Bestand.
    expect(result.drafts.map((draft) => draft.english)).toEqual(['litter']);
  });

  it('gibt bei ausgeschalteter Begrenzung nichts heraus', () => {
    expect(headwordsForPrompt(bestand(10), 0)).toEqual([]);
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

// ---------------------------------------------------------------------------
// Sprint 3B.1b: Mehrdeutige Formen im Beispielsatz
// ---------------------------------------------------------------------------

describe('Kontext entscheidet über die Grundform', () => {
  it('ordnet „She lives“ dem Verb zu, nicht dem Nomen', () => {
    expect(sentenceContainsHeadword('She lives near the bay.', 'live')).toBe(true);
    expect(sentenceContainsHeadword('She lives near the bay.', 'life')).toBe(false);
  });

  it('ordnet „Their lives“ dem Nomen zu, nicht dem Verb', () => {
    expect(sentenceContainsHeadword('Their lives changed completely.', 'life')).toBe(true);
    expect(sentenceContainsHeadword('Their lives changed completely.', 'live')).toBe(false);
  });

  it('trennt auch leaves nach Kontext', () => {
    expect(sentenceContainsHeadword('He leaves the house early.', 'leave')).toBe(true);
    expect(sentenceContainsHeadword('He leaves the house early.', 'leaf')).toBe(false);
    expect(sentenceContainsHeadword('The leaves are red in autumn.', 'leaf')).toBe(true);
    expect(sentenceContainsHeadword('The leaves are red in autumn.', 'leave')).toBe(false);
  });

  it('lässt eine mehrdeutige Form ohne Kontext für beide durchfallen', () => {
    expect(sentenceContainsHeadword('Lives changed completely.', 'life')).toBe(false);
    expect(sentenceContainsHeadword('Lives changed completely.', 'live')).toBe(false);
  });

  it('lässt eindeutige Formen unberührt', () => {
    expect(sentenceContainsHeadword('The bay has 1,969 islands.', 'island')).toBe(true);
    expect(sentenceContainsHeadword('We visited the caves.', 'visit')).toBe(true);
  });

  it('gibt dem wörtlichen Treffer weiterhin den Vorrang', () => {
    // `life` steht wörtlich im Satz – die Mehrdeutigkeit von `lives` ändert daran nichts.
    expect(sentenceContainsHeadword('Life near the bay is quiet.', 'life')).toBe(true);
  });
});
