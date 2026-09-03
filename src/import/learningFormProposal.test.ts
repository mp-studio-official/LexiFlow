import { describe, expect, it } from 'vitest';
import { particleAfter, proposeLearningForm } from './learningFormProposal';
import type { DictionarySuggestionSummary } from './dictionarySuggestions';
import type { DictionaryEntry } from '../dictionary/DictionaryProvider';

/**
 * Sprint 4B.3, Block A: Aus einem gefundenen Wort eine lernbare Form.
 *
 * Die Beispiele sind die aus der Anforderung, und sie stehen hier absichtlich
 * wörtlich: `coin`, `single out`, `depend`, `surmount obstacles`, `endure`,
 * `restraints`, `attainability`, `attainable`. Wer diese Datei liest, sieht
 * an den Erwartungen, was das Produkt verspricht – und an den Nicht-
 * Erwartungen, was es ausdrücklich **nicht** verspricht.
 */

/** Ein Wörterbuchbefund, so knapp wie dieses Modul ihn braucht. */
function summary(
  entries: Partial<DictionaryEntry>[],
  overrides: Partial<DictionarySuggestionSummary> = {},
): DictionarySuggestionSummary {
  const full = entries.map<DictionaryEntry>((entry) => ({
    headword: entry.headword ?? 'word',
    lemma: entry.lemma ?? entry.headword ?? 'word',
    senses: [{ sense: 'x', suggestions: [{ german: 'Wort' }] }],
    quality: entry.quality ?? 'exact',
    source: 'test',
    ...entry,
  }));
  return {
    primary: 'Wort',
    entries: full,
    senseCount: full.length,
    unambiguous: full.length === 1,
    questionable: false,
    ...overrides,
  };
}

describe('Das Partikel im Belegsatz', () => {
  it('findet die Präposition hinter dem Verb', () => {
    expect(
      particleAfter('Communities along the shore depend on natural barriers.', 'depend'),
    ).toBe('on');
  });

  it('findet sie auch an der gebeugten Form', () => {
    expect(particleAfter('She depends on the bus.', 'depend')).toBe('on');
  });

  it('meldet nichts, wenn dort keins steht', () => {
    expect(particleAfter('The noise was terrible.', 'noise')).toBeUndefined();
    expect(particleAfter('Engineers surmount obstacles daily.', 'surmount')).toBeUndefined();
  });
});

describe('Verben', () => {
  it('macht aus einem einfachen Verb den Infinitiv', () => {
    const proposal = proposeLearningForm({
      written: 'endure',
      dictionary: summary([{ headword: 'endure', partOfSpeech: 'verb' }]),
    });

    expect(proposal.english).toBe('to endure');
    expect(proposal.partOfSpeech).toBe('verb');
    expect(proposal.needsReview).toBe(false);
  });

  it('übernimmt ein belegtes Phrasal Verb mit seiner Partikel', () => {
    /*
      Zwei unabhängige Belege: Der Satz zeigt „single out“, und das Wörterbuch
      führt „single out“ als eigenes Stichwort. Das ist eine Auskunft, keine
      Vermutung – deshalb ohne Rückfrage.
    */
    const proposal = proposeLearningForm({
      written: 'single',
      sourceSentence: 'Planners often single out the cheapest option.',
      dictionary: summary([{ headword: 'single', partOfSpeech: 'verb' }]),
      phrase: summary([
        { headword: 'single out', partOfSpeech: 'verb', quality: 'phrase', multiword: true },
      ]),
    });

    expect(proposal.english).toBe('to single out');
    expect(proposal.needsReview).toBe(false);
    expect(proposal.evidence).toContain('dictionary');
  });

  it('erfindet keine Rektion, die das Wörterbuch nicht kennt – es fragt', () => {
    /*
      Der Kern der Anforderung. Im Satz steht „depend on“, das Wörterbuch kennt
      „depend on“ nicht. Beides kann stimmen: Die Rektion kann echt sein und im
      Bestand fehlen, oder das „on“ gehört gar nicht zum Verb, wie in
      „to arrive on Monday“.

      Also: kein stillschweigendes `to depend on sb./sth.` – aber auch kein
      Verschweigen. Der Vorschlag bleibt bei `to depend` und stellt die Frage,
      und die Antwort trifft die Lehrkraft.
    */
    const proposal = proposeLearningForm({
      written: 'depend',
      sourceSentence: 'Communities along the shore depend on natural barriers to survive.',
      dictionary: summary([{ headword: 'depend', partOfSpeech: 'verb' }]),
      phrase: undefined,
    });

    expect(proposal.english).toBe('to depend');
    expect(proposal.needsReview).toBe(true);
    expect(proposal.reviewReason).toContain('depend on');
    expect(proposal.reviewSuggestion).toBe('to depend on sb./sth.');
    expect(proposal.evidence).toContain('sentence');
  });

  it('kürzt eine feste Wendung nicht auf ihr Verb', () => {
    const proposal = proposeLearningForm({
      written: 'surmount obstacles',
      dictionary: summary([{ headword: 'surmount obstacles', partOfSpeech: 'verb' }]),
    });
    expect(proposal.english).toBe('to surmount obstacles');
  });
});

describe('Substantive und Adjektive', () => {
  it('markiert einen Plural als solchen', () => {
    const proposal = proposeLearningForm({
      written: 'restraints',
      dictionary: summary([
        {
          headword: 'restraint',
          lemma: 'restraint',
          partOfSpeech: 'noun',
          quality: 'lemma',
          formTags: ['plural'],
        },
      ]),
    });

    expect(proposal.english).toBe('restraints (pl.)');
    expect(proposal.grammaticalNumber).toBe('plural');
    // Der Plural sagt das Substantiv mit – kein „(n., pl.)“.
    expect(proposal.english).not.toContain('n.,');
  });

  it('markiert die Wortart, wo sie das Wort von seiner Familie unterscheidet', () => {
    /*
      `attainability` und `attainable` gehören zusammen. Stehen beide im Paket,
      ist ohne Kürzel nicht zu sehen, welche Karte welche meint – deshalb
      verlangt der Aufrufer hier die Markierung.
    */
    const nomen = proposeLearningForm({
      written: 'attainability',
      markPartOfSpeech: true,
      dictionary: summary([{ headword: 'attainability', partOfSpeech: 'noun' }]),
    });
    const adjektiv = proposeLearningForm({
      written: 'attainable',
      markPartOfSpeech: true,
      dictionary: summary([{ headword: 'attainable', partOfSpeech: 'adj' }]),
    });

    expect(nomen.english).toBe('attainability (n.)');
    expect(adjektiv.english).toBe('attainable (adj.)');
  });

  it('lässt ein alleinstehendes Wort unmarkiert', () => {
    /*
      Ohne verwandte Form erklärt `(n.)` nichts. Eine Liste, in der hinter
      jedem Wort die Wortart steht, liest sich wie ein Wörterbuchauszug – die
      Wortart hat im Editor ihre eigene Spalte.
    */
    const proposal = proposeLearningForm({
      written: 'erosion',
      dictionary: summary([{ headword: 'erosion', partOfSpeech: 'noun' }]),
    });
    expect(proposal.english).toBe('erosion');
    expect(proposal.partOfSpeech).toBe('noun');
  });

  it('setzt kein „to“ vor ein Substantiv', () => {
    const proposal = proposeLearningForm({
      written: 'erosion',
      markPartOfSpeech: true,
      dictionary: summary([{ headword: 'erosion', partOfSpeech: 'noun' }]),
    });
    expect(proposal.english).toBe('erosion (n.)');
  });
});

describe('Wo es nicht reicht, sagt es das', () => {
  it('macht aus einer ungesicherten Wortart keinen Prüfhinweis', () => {
    /*
      Gemessen an einem echten Text hätte das eine sichtbare Frage und **zwölf**
      „Bitte prüfen“ in der Entwurfstabelle ergeben – weil `coin`, `wall`,
      `plan` und die Hälfte aller englischen Substantive auch Verben sind.
      Eine Warnung an jeder Zeile ist eine Warnung an keiner.

      Verloren geht nichts: `partOfSpeech` bleibt leer, und das Auswahlfeld
      steht sichtbar auf „–“. Eine fehlende Wortart ist kein Fehler.
    */
    const proposal = proposeLearningForm({ written: 'shore' });

    expect(proposal.english).toBe('shore');
    expect(proposal.partOfSpeech).toBe('');
    expect(proposal.needsReview).toBe(false);
  });

  it('rät nicht, wenn das Wörterbuch mehrere Wortarten kennt', () => {
    // `coin` ist Substantiv **und** Verb. Ein `to` davorzusetzen wäre geraten.
    const proposal = proposeLearningForm({
      written: 'coin',
      dictionary: summary([
        { headword: 'coin', partOfSpeech: 'noun' },
        { headword: 'coin', partOfSpeech: 'verb' },
      ]),
    });

    expect(proposal.english).toBe('coin');
    expect(proposal.partOfSpeech).toBe('');
    // Kein `to` – und trotzdem kein Prüfhinweis: Das leere Wortartfeld
    // daneben sagt es deutlicher als ein Warnkasten an jeder zweiten Zeile.
    expect(proposal.needsReview).toBe(false);
  });

  it('folgt der Lehrkraft, wenn sie die Wortart gesetzt hat', () => {
    const proposal = proposeLearningForm({
      written: 'coin',
      partOfSpeech: 'verb',
      dictionary: summary([
        { headword: 'coin', partOfSpeech: 'noun' },
        { headword: 'coin', partOfSpeech: 'verb' },
      ]),
    });

    expect(proposal.english).toBe('to coin');
    expect(proposal.needsReview).toBe(false);
  });
});

describe('Was schon gebaut ist, bleibt', () => {
  it('lässt eine eingegebene Lernform unverändert', () => {
    /*
      Die wichtigste Nicht-Handlung dieses Moduls. Wer `to coin a phrase / term`
      eingetippt hat, hat entschieden; eine zweite Ermittlung darüber wäre ein
      stilles Überschreiben fremder Arbeit.
    */
    for (const form of [
      'to coin a phrase / term',
      'to depend on sb./sth.',
      'restraints (pl.)',
      'attainable (adj.)',
    ]) {
      const proposal = proposeLearningForm({ written: form });
      expect(proposal.english).toBe(form);
      expect(proposal.needsReview).toBe(false);
    }
  });

  it('behält auch dann, wenn ein Belegsatz eine andere Partikel nahelegt', () => {
    const proposal = proposeLearningForm({
      written: 'to depend on sb./sth.',
      sourceSentence: 'It depends about nothing.',
    });
    expect(proposal.english).toBe('to depend on sb./sth.');
  });
});
