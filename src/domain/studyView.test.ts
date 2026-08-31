import { describe, expect, it } from 'vitest';
import {
  answersFor,
  browseDirectionsFor,
  buildCardSet,
  buildStudyCard,
  filterEntries,
  hasExtras,
  matchesQuery,
  promptFor,
} from './studyView';
import { makeEntry } from '../test/fixtures';
import type { VocabEntry } from './schema';

/**
 * Sprint 3B.2a: Durchsehen und Karten teilen sich dieselbe Domänenlogik.
 *
 * Geprüft wird deshalb hier, einmal – nicht zweimal in zwei Oberflächen.
 */

const ISLAND = makeEntry({
  id: 'e1',
  english: 'island',
  germanAnswers: ['die Insel', 'das Eiland'],
  acceptedEnglishAnswers: ['isle'],
  partOfSpeech: 'noun',
  exampleSentences: [{ english: 'The island is famous.', german: 'Die Insel ist berühmt.' }],
  topicTags: ['Geography'],
  notes: 'Vorsicht: „isle“ ist gehoben.',
});

const BARE = makeEntry({
  id: 'e2',
  english: 'bay',
  germanAnswers: ['die Bucht'],
  acceptedEnglishAnswers: [],
  exampleSentences: [],
  topicTags: [],
});

function entriesNamed(count: number): VocabEntry[] {
  return Array.from({ length: count }, (_, index) =>
    makeEntry({
      id: `e${index + 1}`,
      english: `word${index + 1}`,
      germanAnswers: [`Wort${index + 1}`],
    }),
  );
}

describe('Vorder- und Rückseite', () => {
  it('fragt bei Englisch → Deutsch das englische Wort ab', () => {
    expect(promptFor(ISLAND, 'en-de')).toBe('island');

    const card = buildStudyCard(ISLAND, 'en-de');
    expect(card.answer).toBe('die Insel');
    expect(card.alternatives).toEqual(['das Eiland']);
    expect(card.directionLabel).toBe('Englisch → Deutsch (rezeptiv)');
  });

  it('fragt bei Deutsch → Englisch die erste deutsche Bedeutung ab', () => {
    expect(promptFor(ISLAND, 'de-en')).toBe('die Insel');

    const card = buildStudyCard(ISLAND, 'de-en');
    expect(card.answer).toBe('island');
    expect(card.alternatives).toEqual(['isle']);
    expect(card.directionLabel).toBe('Deutsch → Englisch (produktiv)');
  });

  it('entfernt Dubletten und Leerwerte aus den Alternativen', () => {
    const doubled = makeEntry({
      english: 'island',
      germanAnswers: ['die Insel', 'Die Insel', '  die   Insel ', 'das Eiland'],
    });

    expect(answersFor(doubled, 'en-de')).toEqual({
      answer: 'die Insel',
      alternatives: ['das Eiland'],
    });
  });

  it('nennt die Hauptantwort nie noch einmal als Alternative', () => {
    const entry = makeEntry({
      english: 'island',
      germanAnswers: ['die Insel'],
      acceptedEnglishAnswers: ['island', 'isle'],
    });

    expect(answersFor(entry, 'de-en').alternatives).toEqual(['isle']);
  });

  it('lässt leere optionale Felder ganz weg', () => {
    const card = buildStudyCard(BARE, 'en-de');

    expect(card.alternatives).toEqual([]);
    expect(card.partOfSpeech).toBeUndefined();
    expect(card.example).toBeUndefined();
    expect(card.exampleTranslation).toBeUndefined();
    expect(card.notes).toBeUndefined();
    expect(hasExtras(card)).toBe(false);
  });

  it('reicht vorhandene Zusatzinformationen durch', () => {
    const card = buildStudyCard(ISLAND, 'en-de');

    expect(card.partOfSpeech).toBe('Substantiv');
    expect(card.example).toBe('The island is famous.');
    expect(card.exampleTranslation).toBe('Die Insel ist berühmt.');
    expect(card.notes).toContain('gehoben');
    expect(hasExtras(card)).toBe(true);
  });

  it('vergibt je Vokabel und Richtung eine eigene ID', () => {
    expect(buildStudyCard(ISLAND, 'en-de').id).toBe('e1::en-de');
    expect(buildStudyCard(ISLAND, 'de-en').id).toBe('e1::de-en');
  });
});

describe('Richtungen zum Durchsehen', () => {
  it('bietet bei „beide Richtungen“ beide an', () => {
    expect(browseDirectionsFor('both')).toEqual(['en-de', 'de-en']);
  });

  it('bietet bei einseitigen Paketen keine Attrappe an', () => {
    expect(browseDirectionsFor('en-de')).toEqual(['en-de']);
    expect(browseDirectionsFor('de-en')).toEqual(['de-en']);
  });
});

describe('Kartensatz', () => {
  const entries = entriesNamed(6);

  it('zeigt bei einer Richtung jede Vokabel genau einmal', () => {
    const cards = buildCardSet(entries, {
      packDirection: 'both',
      choice: 'en-de',
      seed: 7,
    });

    expect(cards).toHaveLength(6);
    expect(new Set(cards.map((card) => card.entryId)).size).toBe(6);
    expect(cards.every((card) => card.direction === 'en-de')).toBe(true);
  });

  it('nutzt bei „Gemischt“ beide Richtungen', () => {
    const cards = buildCardSet(entries, {
      packDirection: 'both',
      choice: 'mixed',
      seed: 7,
    });

    expect(cards).toHaveLength(12);
    expect(new Set(cards.map((card) => card.direction))).toEqual(new Set(['en-de', 'de-en']));
    // Kein Eintrag geht verloren, keiner kommt doppelt.
    expect(new Set(cards.map((card) => card.id)).size).toBe(12);
  });

  it('stellt dieselbe Vokabel nicht direkt in die Gegenrichtung', () => {
    const cards = buildCardSet(entries, {
      packDirection: 'both',
      choice: 'mixed',
      seed: 3,
    });

    cards.forEach((card, index) => {
      const next = cards[index + 1];
      if (next) expect(next.entryId, `Position ${index}`).not.toBe(card.entryId);
    });
  });

  it('ist bei gleichem Seed reproduzierbar', () => {
    const first = buildCardSet(entries, { packDirection: 'both', choice: 'mixed', seed: 42 });
    const second = buildCardSet(entries, { packDirection: 'both', choice: 'mixed', seed: 42 });

    expect(second.map((card) => card.id)).toEqual(first.map((card) => card.id));
  });

  it('ergibt mit einem neuen Seed eine andere Reihenfolge', () => {
    const first = buildCardSet(entries, { packDirection: 'both', choice: 'mixed', seed: 1 });
    const second = buildCardSet(entries, { packDirection: 'both', choice: 'mixed', seed: 999 });

    expect(second.map((card) => card.id)).not.toEqual(first.map((card) => card.id));
    // Aber derselbe Satz an Karten – Mischen verliert nichts.
    expect([...second.map((card) => card.id)].sort()).toEqual(
      [...first.map((card) => card.id)].sort(),
    );
  });

  it('führt ein einseitiges Paket auch bei „Gemischt“ in seiner Richtung', () => {
    const cards = buildCardSet(entries, {
      packDirection: 'en-de',
      choice: 'mixed',
      seed: 5,
    });

    expect(cards).toHaveLength(6);
    expect(cards.every((card) => card.direction === 'en-de')).toBe(true);
  });

  it('bleibt bei einem leeren Paket leer', () => {
    expect(buildCardSet([], { packDirection: 'both', choice: 'mixed', seed: 1 })).toEqual([]);
  });
});

describe('Suche', () => {
  const entries = [ISLAND, BARE];

  it('findet über das englische Stichwort', () => {
    expect(filterEntries(entries, 'isla').map((entry) => entry.id)).toEqual(['e1']);
  });

  it('findet über die deutsche Antwort', () => {
    expect(filterEntries(entries, 'bucht').map((entry) => entry.id)).toEqual(['e2']);
  });

  it('findet über Themen-Tags und Notizen', () => {
    expect(filterEntries(entries, 'geography').map((entry) => entry.id)).toEqual(['e1']);
    expect(filterEntries(entries, 'gehoben').map((entry) => entry.id)).toEqual(['e1']);
  });

  it('ignoriert Groß- und Kleinschreibung', () => {
    expect(matchesQuery(ISLAND, 'ISLAND')).toBe(true);
    expect(matchesQuery(ISLAND, 'Die INSEL')).toBe(true);
  });

  it('liefert bei leerer Suche alles zurück', () => {
    expect(filterEntries(entries, '   ')).toHaveLength(2);
  });

  it('liefert bei erfolgloser Suche nichts', () => {
    expect(filterEntries(entries, 'Fahrrad')).toEqual([]);
  });
});
