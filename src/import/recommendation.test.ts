import { describe, expect, it } from 'vitest';
import {
  countSyllables,
  estimateDifficulty,
  familyKey,
  levelFit,
  levelForGrade,
  recommend,
  scoreCandidates,
  type RecommendationInput,
} from './recommendation';
import { analyzeText } from '../domain/textExtraction';
import type { DictionarySuggestionSummary } from './dictionarySuggestions';
import type { DictionaryEntry } from '../dictionary/DictionaryProvider';

/**
 * Die Empfehlungslogik ist eine **Heuristik**, und diese Tests prüfen sie auch
 * als solche: nicht auf exakte Punktzahlen, sondern auf die Aussagen, für die
 * es sie gibt. Die wichtigste davon steht gleich zu Beginn – die
 * Standardsortierung darf nicht die ersten Wörter des Textes liefern.
 */

const CONTEXT = { grade: '9' as const, cefrLevel: 'B1' as const };

/**
 * Ein Text, dessen Anfang bewusst aus Alltagswörtern besteht und dessen
 * lohnende Vokabeln hinten stehen.
 */
const TEXT = [
  'The old house on the street was small and the people there were good.',
  'The day was long and the man went to work in the city.',
  'Coastal erosion threatens the settlement, and the evacuation of residents',
  'demonstrates the resilience of the local infrastructure.',
  'Erosion and evacuation were discussed at length.',
].join(' ');

function inputs(text = TEXT): RecommendationInput[] {
  return analyzeText(text).candidates.map((candidate) => ({ candidate }));
}

function summary(headword: string, senses: DictionaryEntry['senses']): DictionarySuggestionSummary {
  const entry: DictionaryEntry = {
    headword,
    lemma: headword,
    partOfSpeech: 'noun',
    senses,
    quality: 'exact',
    source: 'wiktionary',
  };
  return {
    primary: senses[0]?.suggestions[0]?.german ?? '',
    entries: [entry],
    senseCount: senses.length,
    unambiguous: senses.length === 1 && senses[0]?.suggestions.length === 1,
    questionable: false,
  };
}

describe('Schwierigkeit schätzen', () => {
  it('zählt Silben brauchbar', () => {
    expect(countSyllables('street')).toBe(1);
    expect(countSyllables('resilience')).toBeGreaterThanOrEqual(3);
    expect(countSyllables('')).toBe(0);
  });

  it('hält Alltagswörter für leicht und Fachwörter für schwer', () => {
    expect(estimateDifficulty('street')).toBeLessThan(estimateDifficulty('settlement'));
    expect(estimateDifficulty('old')).toBeLessThan(estimateDifficulty('resilience'));
    expect(estimateDifficulty('house')).toBeLessThan(estimateDifficulty('infrastructure'));
  });

  it('nimmt Mehrwortbegriffe als anspruchsvoll', () => {
    expect(estimateDifficulty('shell shock')).toBeGreaterThan(estimateDifficulty('shock'));
  });

  it('bleibt zwischen 0 und 1', () => {
    for (const word of ['a', 'old', 'internationalization', 'shell shock', '']) {
      expect(estimateDifficulty(word)).toBeGreaterThanOrEqual(0);
      expect(estimateDifficulty(word)).toBeLessThanOrEqual(1);
    }
  });

  it('bestraft zu leicht härter als zu schwer', () => {
    // Ein Wort unter dem Niveau ist als Vokabel wertlos; eines darüber ist
    // anspruchsvoll, aber lernbar.
    const zuLeicht = levelFit(0.05, 'B1');
    const zuSchwer = levelFit(0.85, 'B1');
    expect(zuLeicht).toBeLessThan(zuSchwer);
  });
});

describe('Standardsortierung', () => {
  it('liefert nicht einfach die ersten Wörter des Textes', () => {
    const empfohlen = recommend(inputs(), { context: CONTEXT, sort: 'recommended', count: 5 });
    const textReihenfolge = recommend(inputs(), { context: CONTEXT, sort: 'text-order', count: 5 });

    expect(empfohlen.map((item) => item.candidate.english)).not.toEqual(
      textReihenfolge.map((item) => item.candidate.english),
    );
  });

  it('stellt die lohnenden Vokabeln vor den Alltagswortschatz', () => {
    const empfohlen = recommend(inputs(), { context: CONTEXT, sort: 'recommended', count: 5 }).map(
      (item) => item.candidate.english.toLowerCase(),
    );

    // Mindestens zwei der vier Fachbegriffe stehen unter den ersten fünf …
    const fachlich = ['erosion', 'settlement', 'evacuation', 'resilience', 'infrastructure'];
    expect(empfohlen.filter((word) => fachlich.includes(word)).length).toBeGreaterThanOrEqual(2);
    // … und der Bodensatz nicht.
    for (const alltag of ['old', 'street', 'people', 'day']) {
      expect(empfohlen).not.toContain(alltag);
    }
  });

  it('kehrt die Reihenfolge bei „Anspruchsvollste zuerst“ nicht einfach um, sondern sortiert nach Schwierigkeit', () => {
    const schwer = recommend(inputs(), { context: CONTEXT, sort: 'hardest', count: 5 });
    for (let index = 1; index < schwer.length; index += 1) {
      expect(schwer[index - 1]!.difficulty).toBeGreaterThanOrEqual(schwer[index]!.difficulty);
    }
  });

  it('sortiert auf Wunsch nach Häufigkeit und nach Textstellung', () => {
    const haeufig = recommend(inputs(), { context: CONTEXT, sort: 'frequency', count: 5 });
    for (let index = 1; index < haeufig.length; index += 1) {
      expect(haeufig[index - 1]!.candidate.occurrences).toBeGreaterThanOrEqual(
        haeufig[index]!.candidate.occurrences,
      );
    }

    const imText = recommend(inputs(), { context: CONTEXT, sort: 'text-order', count: 5 });
    for (let index = 1; index < imText.length; index += 1) {
      expect(imText[index - 1]!.candidate.firstOccurrence).toBeLessThan(
        imText[index]!.candidate.firstOccurrence,
      );
    }
  });

  it('liefert bei gleicher Eingabe dieselbe Reihenfolge', () => {
    const a = recommend(inputs(), { context: CONTEXT, sort: 'recommended', count: 8 });
    const b = recommend(inputs(), { context: CONTEXT, sort: 'recommended', count: 8 });
    expect(a.map((item) => item.candidate.id)).toEqual(b.map((item) => item.candidate.id));
  });

  it('berücksichtigt das Zielniveau', () => {
    /*
      Geprüft wird das **Verhältnis**, nicht die Liste. Bei einem Text mit nur
      einer Handvoll starker Kandidaten stehen oben zwangsläufig dieselben
      Wörter; was sich ändern muss, ist ihr Abstand zum leichteren Wortschatz.
    */
    const abstand = (level: 'A1+' | 'B2/C1') => {
      const punkte = scoreCandidates(inputs(), {
        context: { grade: level === 'A1+' ? '5' : 'Q2', cefrLevel: level },
        sort: 'recommended',
        count: 5,
      });
      const wert = (word: string) =>
        punkte.find((item) => item.candidate.english.toLowerCase() === word)?.score ?? 0;
      return wert('resilience') - wert('house');
    };

    // Auf B2/C1 ist der Vorsprung des Fachworts größer als auf A1+.
    expect(abstand('B2/C1')).toBeGreaterThan(abstand('A1+'));
  });

  it('wertet einen Wörterbuchtreffer als Pluspunkt', () => {
    const ohne = inputs('Coastal erosion threatens the settlement.');
    const mit = ohne.map((item) =>
      item.candidate.english.toLowerCase() === 'settlement'
        ? { ...item, dictionary: summary('settlement', [{ sense: 'x', suggestions: [{ german: 'Siedlung' }] }]) }
        : item,
    );

    const punkteOhne = scoreCandidates(ohne, { context: CONTEXT, sort: 'recommended', count: 5 });
    const punkteMit = scoreCandidates(mit, { context: CONTEXT, sort: 'recommended', count: 5 });
    const findSettlement = (list: ReturnType<typeof scoreCandidates>) =>
      list.find((item) => item.candidate.english.toLowerCase() === 'settlement')?.score ?? 0;

    expect(findSettlement(punkteMit)).toBeGreaterThan(findSettlement(punkteOhne));
  });
});

describe('Wortfamilien', () => {
  it('führt Singular und Plural zusammen', () => {
    expect(familyKey('islands')).toBe(familyKey('island'));
    expect(familyKey('casualties')).toBe(familyKey('casualty'));
    expect(familyKey('boxes')).toBe(familyKey('box'));
  });

  it('wirft nicht zusammen, was nur ähnlich aussieht', () => {
    // Ein aggressiver Stemmer macht aus `casualty` und `casual` dasselbe.
    expect(familyKey('casualty')).not.toBe(familyKey('casual'));
    expect(familyKey('bus')).not.toBe(familyKey('bu'));
  });

  it('nimmt die Grundform des Wörterbuchs, wenn es eine kennt', () => {
    const plural = summary('island', [{ sense: 'x', suggestions: [{ german: 'Insel' }] }]);
    expect(familyKey('islands', plural)).toBe('island');
  });

  it('schlägt dieselbe Familie nicht zweimal vor', () => {
    const text = 'The island was quiet. Many islands were quiet. The islands remained quiet.';
    const chosen = recommend(inputs(text), { context: CONTEXT, sort: 'recommended', count: 10 });
    const familien = chosen.map((item) => item.family);
    expect(new Set(familien).size).toBe(familien.length);
  });

  it('lässt ausgeschlossene Familien aus', () => {
    const alle = recommend(inputs(), { context: CONTEXT, sort: 'recommended', count: 3 });
    const ersteFamilie = alle[0]?.family ?? '';
    const ohne = recommend(inputs(), {
      context: CONTEXT,
      sort: 'recommended',
      count: 3,
      excludedFamilies: [ersteFamilie],
    });
    expect(ohne.map((item) => item.family)).not.toContain(ersteFamilie);
    expect(ohne).toHaveLength(3);
  });

  it('nennt weniger, wenn weniger übrig ist – statt aufzufüllen', () => {
    const wenig = recommend(inputs('Coastal erosion threatens the settlement.'), {
      context: CONTEXT,
      sort: 'recommended',
      count: 20,
    });
    expect(wenig.length).toBeLessThan(20);
    expect(wenig.length).toBeGreaterThan(0);
  });
});

describe('GeR folgt dem Jahrgang, bis jemand widerspricht', () => {
  it('schlägt zum Jahrgang vor', () => {
    expect(levelForGrade('5', 'B2/C1', false)).not.toBe('B2/C1');
    expect(levelForGrade('9', 'A2', false)).toBe(levelForGrade('9', 'B2', false));
  });

  it('lässt eine manuelle Wahl stehen', () => {
    expect(levelForGrade('5', 'B2/C1', true)).toBe('B2/C1');
    expect(levelForGrade('Q2', 'A2', true)).toBe('A2');
  });
});
