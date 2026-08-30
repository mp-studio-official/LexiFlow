import { describe, expect, it } from 'vitest';
import { guessPartOfSpeech, precededByArticle, suggestTopicTag } from './wordRules';

/**
 * Sprint 2B.1: Jede Regel wird einzeln geprüft – und ebenso, dass bei
 * Mehrdeutigkeit **kein** Vorschlag entsteht. Ein erfundener Vorschlag wäre
 * schlimmer als eine leere Spalte.
 */

describe('Verben', () => {
  it('erkennt den Infinitiv mit „to“', () => {
    expect(guessPartOfSpeech('to apologise').partOfSpeech).toBe('verb');
    expect(guessPartOfSpeech('To Apologise').partOfSpeech).toBe('verb');
    expect(guessPartOfSpeech('  to give up  ').partOfSpeech).toBe('verb');
  });

  it('hält „tomato“ nicht für einen Infinitiv', () => {
    expect(guessPartOfSpeech('tomato').partOfSpeech).toBeUndefined();
  });

  it('begründet den Vorschlag verständlich', () => {
    expect(guessPartOfSpeech('to apologise').reason).toMatch(/Infinitiv/);
  });
});

describe('Präpositionen', () => {
  it('erkennt feste Präpositionen', () => {
    for (const word of ['between', 'without', 'despite', 'through']) {
      expect(guessPartOfSpeech(word).partOfSpeech).toBe('preposition');
    }
  });

  it('behandelt „to“ in einer Wendung nicht als Präposition', () => {
    expect(guessPartOfSpeech('to look after').partOfSpeech).toBe('verb');
  });
});

describe('Wendungen', () => {
  it('erkennt Mehrwortausdrücke ohne „to“', () => {
    expect(guessPartOfSpeech('as soon as possible').partOfSpeech).toBe('phrase');
    expect(guessPartOfSpeech('by the way').partOfSpeech).toBe('phrase');
  });
});

describe('Adverbien auf -ly', () => {
  it('erkennt eindeutige Fälle', () => {
    for (const word of ['quickly', 'carefully', 'suddenly']) {
      expect(guessPartOfSpeech(word).partOfSpeech).toBe('adverb');
    }
  });

  it('kennt die bekannten Ausnahmen', () => {
    for (const word of ['family', 'friendly', 'ugly', 'early', 'likely', 'supply']) {
      expect(guessPartOfSpeech(word).partOfSpeech).not.toBe('adverb');
    }
  });

  it('lässt sehr kurze -ly-Wörter aus', () => {
    expect(guessPartOfSpeech('fly').partOfSpeech).toBeUndefined();
  });
});

describe('Satzkontext', () => {
  it('erkennt ein Substantiv hinter dem Artikel', () => {
    const guess = guessPartOfSpeech('neighbourhood', 'The neighbourhood is crowded today.');
    expect(guess.partOfSpeech).toBe('noun');
    expect(guess.reason).toMatch(/Artikel/);
  });

  it('braucht den Artikel unmittelbar davor', () => {
    expect(precededByArticle('The whole neighbourhood is crowded.', 'neighbourhood')).toBe(false);
    expect(precededByArticle('We saw a neighbourhood party.', 'neighbourhood')).toBe(true);
  });

  it('lässt sich von einem Wortanfang nicht täuschen', () => {
    expect(precededByArticle('the neighbourhoods were quiet', 'neighbourhood')).toBe(false);
  });

  it('rät bei mehrdeutigen Wörtern auch mit Artikel nicht', () => {
    expect(guessPartOfSpeech('book', 'She read the book yesterday.').partOfSpeech).toBeUndefined();
    expect(guessPartOfSpeech('light', 'He turned on the light.').partOfSpeech).toBeUndefined();
  });
});

describe('Keine Scheingenauigkeit', () => {
  it('lässt mehrdeutige Einzelwörter ohne Vorschlag', () => {
    for (const word of ['water', 'run', 'present', 'quiet', 'litter']) {
      expect(guessPartOfSpeech(word)).toEqual({});
    }
  });

  it('liefert für leere Eingaben nichts', () => {
    expect(guessPartOfSpeech('')).toEqual({});
    expect(guessPartOfSpeech('   ')).toEqual({});
  });

  it('ist deterministisch', () => {
    const first = guessPartOfSpeech('to apologise', 'I want to apologise.');
    const second = guessPartOfSpeech('to apologise', 'I want to apologise.');
    expect(first).toEqual(second);
  });
});

describe('Themen-Tag', () => {
  it('schlägt das Thema des Pakets vor', () => {
    expect(suggestTopicTag('City life', [])).toBe('City life');
  });

  it('normalisiert Leerraum', () => {
    expect(suggestTopicTag('  City   life  ', [])).toBe('City life');
  });

  it('schlägt nichts vor, was schon dasteht', () => {
    expect(suggestTopicTag('City life', ['city life'])).toBeUndefined();
    expect(suggestTopicTag('City life', ['Sports', 'CITY LIFE'])).toBeUndefined();
  });

  it('schlägt ohne Thema nichts vor', () => {
    expect(suggestTopicTag('', ['Sports'])).toBeUndefined();
    expect(suggestTopicTag('   ', [])).toBeUndefined();
  });
});
