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
  it('macht das führende „to“ freiwillig', () => {
    expect(impliedAnswers({ english: 'to endure' })).toContain('endure');
  });

  it('lässt die Platzhalter weg – aber nicht die Präposition', () => {
    /*
      Die Grenze dieses Moduls, an einem Beispiel.

      `sb./sth.` ist eine Schreibkonvention des Vokabelhefts: Wer
      `to depend on` schreibt, hat die Vokabel gekonnt. Das `on` ist etwas
      anderes – es gehört zum Wort, und wer es nicht mitlernt, schreibt
      später `depend of`. Bis 4B.3 hat die Prüfung genau das durchgewunken,
      weil das **Lemma** (`depend`) als Antwort galt.
    */
    const answers = impliedAnswers({ english: 'to depend on sb./sth.' });

    expect(answers).toContain('to depend on');
    expect(answers).toContain('depend on');
    expect(answers).toContain('depend on sb./sth.');

    expect(answers).not.toContain('depend');
    expect(answers).not.toContain('to depend');
  });

  it('behält die Partikel eines Phrasal Verbs', () => {
    const answers = impliedAnswers({ english: 'to single out sb./sth.' });

    expect(answers).toContain('to single out');
    expect(answers).toContain('single out');

    // „single“ allein ist ein anderes Wort.
    expect(answers).not.toContain('single');
    expect(answers).not.toContain('to single');
  });

  it('kennt die Platzhalter auch ausgeschrieben', () => {
    const answers = impliedAnswers({ english: 'to depend on sb./sth.' });
    expect(answers).toContain('to depend on somebody/something');
  });

  it('lässt beide Seiten einer Schrägstrich-Alternative gelten', () => {
    const answers = impliedAnswers({ english: 'to coin a phrase / term' });
    expect(answers).toContain('to coin a phrase');
    expect(answers).toContain('to coin a term');
    expect(answers).toContain('coin a phrase');

    // Die feste Wendung bleibt fest: „to coin“ ist nicht die Vokabel.
    expect(answers).not.toContain('to coin');
  });

  it('kürzt eine feste Wendung nicht auf ihr Verb', () => {
    const answers = impliedAnswers({ english: 'to surmount obstacles' });
    expect(answers).toEqual(['surmount obstacles']);
  });

  it('lässt Zahl- und Wortartmarker weg', () => {
    expect(impliedAnswers({ english: 'restraints (pl.)' })).toContain('restraints');
    expect(impliedAnswers({ english: 'attainability (n.)' })).toContain('attainability');
    expect(impliedAnswers({ english: 'attainable (adj.)' })).toContain('attainable');
  });

  it('erfindet nichts, wo es nichts zu verkürzen gibt', () => {
    expect(impliedAnswers({ english: 'crowded' })).toEqual([]);
  });

  it('nennt die Lernform nicht noch einmal', () => {
    expect(impliedAnswers({ english: 'to endeavor' })).not.toContain('to endeavor');
  });

  it('benutzt das Lemma nicht als Antwort', () => {
    // Das Lemma ist für Suche und Dublettenprüfung da, nicht für die Prüfung.
    const answers = impliedAnswers({ english: 'to depend on sb./sth.', lemma: 'depend' } as {
      english: string;
    });
    expect(answers).not.toContain('depend');
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
