import { describe, expect, it } from 'vitest';
import { extractTextCandidates } from '../domain/textExtraction';
import {
  MAX_TEXT_SUGGESTION_CANDIDATES,
  parseTextSuggestions,
  textSuggestionPayload,
} from './textSuggestions';

const SCOTLAND_WALES = `Scotland is in the North of Britain. Just over five million people live there. It’s been part of the UK since 1707. Edinburgh is the capital city and home to the Scottish Parliament. The Parliament building is a work of art in itself!
Scotland has some unique customs: wearing tartan kilts, playing the bagpipes, and tossing the caber – a very large post. For over sixty years, The Edinburgh Festival has celebrated art, theatre, and culture.
Wales is on the western edge of Britain. It also used to be a separate country but has been part of the UK for over four hundred years. Nearly three million people live in Wales.
One of its symbols is a red dragon, found on the national flag. The Welsh Assembly is in the capital city, Cardiff. The Welsh are proud of their language, and twenty per cent of the people speak Cymraeg. Most signs are in English and Welsh. Singing is an important tradition in Wales. People working in coal mines in Wales originally formed male-only choirs. They are still popular today.`;

describe('der sichere Auftrag der Portal-Textwerkstatt', () => {
  it('gewinnt aus dem echten Fließtext Kandidaten und sendet nicht das ganze Dokument', () => {
    const candidates = extractTextCandidates(SCOTLAND_WALES);
    expect(candidates.length).toBeGreaterThan(10);
    expect(candidates.map((candidate) => candidate.english)).toEqual(
      // Die bestehende Analyse führt beobachtete Plurale auf ihre Lernform zurück.
      expect.arrayContaining(['custom', 'bagpipe', 'caber']),
    );

    const payload = textSuggestionPayload(candidates, {
      grade: '8',
      cefrLevel: 'A2',
      topic: 'Scotland and Wales',
    });
    expect(payload).not.toHaveProperty('sourceText');
    expect(payload).not.toHaveProperty('text');
    expect((payload['candidates'] as unknown[]).length).toBeLessThanOrEqual(
      MAX_TEXT_SUGGESTION_CANDIDATES,
    );
  });

  it('nimmt nur vollständige Vorschläge für bekannte Kandidaten an', () => {
    const erlaubt = new Set(['c-customs', 'c-caber']);
    const gelesen = parseTextSuggestions(
      {
        suggestions: [
          {
            candidateId: 'c-customs',
            german: 'Bräuche',
            learningForm: 'customs (pl.)',
            lemma: 'custom',
            partOfSpeech: 'noun',
            germanSentence: 'Schottland hat einige einzigartige Bräuche.',
          },
          {
            candidateId: 'erfunden',
            german: 'darf nicht hinein',
            learningForm: 'invented',
            lemma: 'invent',
            partOfSpeech: 'verb',
          },
          // Dieselbe Kennung darf eine bestätigte Zeile nicht später ersetzen.
          {
            candidateId: 'c-customs',
            german: 'zweite Antwort',
            learningForm: 'customs',
            lemma: 'custom',
            partOfSpeech: 'noun',
          },
          { candidateId: 'c-caber', german: '', learningForm: 'caber', lemma: 'caber', partOfSpeech: 'noun' },
        ],
      },
      erlaubt,
    );

    expect(gelesen).toEqual([
      expect.objectContaining({ candidateId: 'c-customs', german: 'Bräuche' }),
    ]);
  });
});
