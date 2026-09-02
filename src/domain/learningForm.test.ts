import { describe, expect, it } from 'vitest';
import {
  buildLearningForm,
  groupRelatedForms,
  impliedAnswers,
  lemmaFromLearningForm,
  lemmaOf,
  shortPartLabel,
} from './learningForm';
import type { VocabEntry } from './schema';

/**
 * Sprint 4B.2: Eine englische Vokabel ist mehr als ein Wort.
 *
 * Die Tests prüfen beides – dass eine Lernform grammatisch vollständig
 * entsteht, **und** dass nichts hinzuerfunden wird. Der zweite Teil ist der
 * wichtigere: Eine erfundene Rektion sieht geprüft aus und bringt jemandem
 * dauerhaft etwas Falsches bei.
 */

function entry(overrides: Partial<VocabEntry>): VocabEntry {
  return {
    id: 'e1',
    english: 'crowded',
    germanAnswers: ['überfüllt'],
    acceptedEnglishAnswers: [],
    exampleSentences: [],
    topicTags: [],
    sourceType: 'manual',
    ...overrides,
  };
}

describe('Lernformen bauen', () => {
  it('setzt „to“ vor ein Verb im Infinitiv', () => {
    expect(buildLearningForm({ lemma: 'endeavor', partOfSpeech: 'verb' })).toBe('to endeavor');
  });

  it('lässt Phrasal Verbs vollständig', () => {
    // `to single` wäre eine andere Vokabel – und keine.
    expect(buildLearningForm({ lemma: 'single out', partOfSpeech: 'verb' })).toBe('to single out');
  });

  it('setzt kein zweites „to“ davor', () => {
    expect(buildLearningForm({ lemma: 'to surmount', partOfSpeech: 'verb' })).toBe('to surmount');
  });

  it('lässt Substantive und Adjektive unangetastet', () => {
    expect(buildLearningForm({ lemma: 'endeavor', partOfSpeech: 'noun' })).toBe('endeavor');
    expect(buildLearningForm({ lemma: 'attainable', partOfSpeech: 'adjective' })).toBe('attainable');
  });

  it('hängt ein belegtes Ergänzungsmuster an', () => {
    expect(
      buildLearningForm({ lemma: 'accuse', partOfSpeech: 'verb', complementPattern: 'sb. of sth.' }),
    ).toBe('to accuse sb. of sth.');
    expect(
      buildLearningForm({
        lemma: 'prevent',
        partOfSpeech: 'verb',
        complementPattern: 'sb. from doing sth.',
      }),
    ).toBe('to prevent sb. from doing sth.');
  });

  it('erfindet ohne Muster keines', () => {
    /*
      Der Kern der Regel: Ohne Beleg aus Quelle, Wörterbuch oder Kontext steht
      da schlicht das Verb. Eine Tabelle „welches Verb hat welche Rektion“
      wäre nach zwanzig Einträgen unvollständig und nach fünfzig falsch.
    */
    expect(buildLearningForm({ lemma: 'accuse', partOfSpeech: 'verb' })).toBe('to accuse');
  });

  it('kennzeichnet die grammatische Zahl', () => {
    expect(
      buildLearningForm({ lemma: 'restraints', partOfSpeech: 'noun', grammaticalNumber: 'plural' }),
    ).toBe('restraints (pl.)');
  });

  it('unterdrückt „to“, wenn das Verb nicht als Infinitiv gelernt wird', () => {
    expect(
      buildLearningForm({ lemma: 'written', partOfSpeech: 'verb', infinitive: false }),
    ).toBe('written');
  });
});

describe('Lemma aus einer Lernform lesen', () => {
  it('entfernt „to“, Platzhalter und Zahlmarker', () => {
    expect(lemmaFromLearningForm('to accuse sb. of sth.')).toBe('to accuse'.slice(3));
    expect(lemmaFromLearningForm('to provide sb. with sth.')).toBe('provide');
    expect(lemmaFromLearningForm('restraints (pl.)')).toBe('restraints');
    expect(lemmaFromLearningForm('attainability (n.)')).toBe('attainability');
  });

  it('schneidet mitten in einer Wendung nichts ab', () => {
    /*
      `to coin a phrase` ergibt `coin a phrase`, nicht `coin`. Wo die Vokabel
      aufhört, kann diese Funktion nicht wissen – und rät deshalb nicht.
    */
    expect(lemmaFromLearningForm('to coin a phrase')).toBe('coin a phrase');
    expect(lemmaFromLearningForm('to surmount obstacles')).toBe('surmount obstacles');
  });

  it('bevorzugt das gespeicherte Lemma vor dem abgeleiteten', () => {
    expect(lemmaOf({ english: 'to coin a phrase / term', lemma: 'coin' })).toBe('coin');
    expect(lemmaOf({ english: 'to endeavor' })).toBe('endeavor');
  });
});

describe('Was zusätzlich als Antwort gilt', () => {
  it('lässt die Platzhalter weg', () => {
    const answers = impliedAnswers({ english: 'to accuse sb. of sth.', lemma: 'accuse' });
    expect(answers).toContain('accuse');
    expect(answers).toContain('to accuse');
  });

  it('lässt den Zahlmarker weg', () => {
    expect(impliedAnswers({ english: 'restraints (pl.)' })).toContain('restraints');
  });

  it('erfindet nichts, wo es nichts zu verkürzen gibt', () => {
    expect(impliedAnswers({ english: 'crowded' })).toEqual([]);
  });

  it('nennt die Lernform nicht noch einmal', () => {
    expect(impliedAnswers({ english: 'to endeavor', lemma: 'endeavor' })).not.toContain(
      'to endeavor',
    );
  });
});

describe('Verbundene Formen', () => {
  const attainability = entry({
    id: 'a',
    english: 'attainability',
    partOfSpeech: 'noun',
    germanAnswers: ['Erreichbarkeit'],
    lexicalGroupId: 'g1',
  });
  const attainable = entry({
    id: 'b',
    english: 'attainable',
    partOfSpeech: 'adjective',
    germanAnswers: ['erreichbar', 'erzielbar'],
    lexicalGroupId: 'g1',
  });
  const traffic = entry({ id: 'c', english: 'traffic', germanAnswers: ['Verkehr'] });

  it('stellt Formen derselben Gruppe zusammen', () => {
    const groups = groupRelatedForms([attainability, traffic, attainable]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.map((item) => item.id)).toEqual(['a', 'b']);
    expect(groups[1]?.map((item) => item.id)).toEqual(['c']);
  });

  it('erfindet keine Gruppe für Einträge ohne eine', () => {
    /*
      Zwei Einträge mit demselben Lemma sind noch keine Gruppe. Ob Formen
      zusammengehören, entscheidet die Lehrkraft beim Erstellen – nicht eine
      Ähnlichkeitsrechnung beim Anzeigen.
    */
    const groups = groupRelatedForms([
      entry({ id: 'x', english: 'endeavor', partOfSpeech: 'noun' }),
      entry({ id: 'y', english: 'to endeavor', partOfSpeech: 'verb' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('bleibt bei getrennten Bedeutungen und Wortarten', () => {
    // Die Gruppe ist eine Anzeigebeziehung – kein gemeinsamer Lerngegenstand.
    expect(attainability.germanAnswers).not.toEqual(attainable.germanAnswers);
    expect(shortPartLabel(attainability.partOfSpeech)).toBe('n.');
    expect(shortPartLabel(attainable.partOfSpeech)).toBe('adj.');
  });
});
