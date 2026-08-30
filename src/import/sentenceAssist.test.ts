import { describe, expect, it } from 'vitest';
import {
  MAX_SENTENCES,
  MAX_SENTENCE_LENGTH,
  addSuggestedSentence,
  availableModes,
  canAddSentence,
  checkSentenceSuggestion,
  replaceSentenceWith,
  sentenceRequestFor,
} from './sentenceAssist';
import { emptyDraft, newSentence, type DraftRow } from './draft';

/**
 * Sprint 2B.2b: Ein Satzvorschlag muss sich etwas verdienen, bevor er überhaupt
 * angezeigt wird. Und übernommen wird er erst danach – von Hand.
 */

function draft(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    ...emptyDraft(),
    english: 'to apologise',
    german: 'sich entschuldigen',
    sentences: [newSentence('He wanted to apologise to the whole class.', 'Er entschuldigte sich.')],
    ...overrides,
  };
}

describe('Ein Vorschlag muss das Stichwort enthalten', () => {
  it('nimmt einen passenden Satz an', () => {
    const check = checkSentenceSuggestion(
      { english: 'She should apologise at once.', german: 'Sie entschuldigte sich sofort.' },
      draft(),
    );
    expect(check).toEqual({
      ok: true,
      english: 'She should apologise at once.',
      german: 'Sie entschuldigte sich sofort.',
    });
  });

  it('erkennt den Infinitiv auch ohne „to“', () => {
    expect(checkSentenceSuggestion({ english: 'I want to apologise.' }, draft()).ok).toBe(true);
    expect(checkSentenceSuggestion({ english: 'They apologise every time.' }, draft()).ok).toBe(true);
  });

  it('lässt sich von einem Wortteil nicht täuschen', () => {
    const row = draft({ english: 'cat', sentences: [] });
    const check = checkSentenceSuggestion({ english: 'We sorted it by category.' }, row);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.reason).toBe('missing-headword');
    expect(check.message).toContain('Lückensatz');
  });

  it('lehnt einen Satz ohne Stichwort ab', () => {
    const check = checkSentenceSuggestion({ english: 'The weather was nice.' }, draft());
    expect(check).toMatchObject({ ok: false, reason: 'missing-headword' });
  });
});

describe('Weitere harte Bedingungen', () => {
  it('lehnt einen leeren Vorschlag ab', () => {
    expect(checkSentenceSuggestion({ english: '   ' }, draft())).toMatchObject({
      ok: false,
      reason: 'empty',
    });
  });

  it('lehnt einen bereits vorhandenen Satz ab – auch bei anderer Schreibweise', () => {
    const check = checkSentenceSuggestion(
      { english: '  he WANTED to   apologise to the whole class. ' },
      draft(),
    );
    expect(check).toMatchObject({ ok: false, reason: 'duplicate' });
  });

  it('lehnt Auszeichnungen ab, statt sie zu entfernen', () => {
    const withTags = checkSentenceSuggestion(
      { english: 'She should <b>apologise</b> at once.' },
      draft(),
    );
    expect(withTags).toMatchObject({ ok: false, reason: 'markup' });

    const germanTags = checkSentenceSuggestion(
      { english: 'She should apologise at once.', german: '<p>Sie entschuldigte sich.</p>' },
      draft(),
    );
    expect(germanTags).toMatchObject({ ok: false, reason: 'markup' });
  });

  it('lehnt einen zu langen Satz ab, statt ihn zu kürzen', () => {
    const long = `She should apologise ${'again '.repeat(80)}.`;
    expect(long.length).toBeGreaterThan(MAX_SENTENCE_LENGTH);

    const check = checkSentenceSuggestion({ english: long }, draft());
    expect(check).toMatchObject({ ok: false, reason: 'too-long' });
    if (check.ok) return;
    expect(check.message).toContain('Gekürzt wird er nicht');
  });

  it('lehnt eine zu lange deutsche Entsprechung ebenfalls ab', () => {
    const check = checkSentenceSuggestion(
      { english: 'She should apologise at once.', german: 'x'.repeat(MAX_SENTENCE_LENGTH + 1) },
      draft(),
    );
    expect(check).toMatchObject({ ok: false, reason: 'too-long' });
  });

  it('normalisiert nur Leerzeichen – mehr nicht', () => {
    const check = checkSentenceSuggestion(
      { english: '  She  should   apologise  at once. ' },
      draft(),
    );
    expect(check).toMatchObject({ ok: true, english: 'She should apologise at once.' });
  });
});

describe('Übernehmen ohne Nebenwirkungen', () => {
  it('hängt einen Satz an, ohne das Original zu verändern', () => {
    const original = draft();
    const before = JSON.stringify(original);

    const next = addSuggestedSentence(original, {
      english: 'She should apologise at once.',
      german: 'Sie entschuldigte sich sofort.',
    });

    expect(JSON.stringify(original)).toBe(before);
    expect(next).not.toBe(original);
    expect(next.sentences).toHaveLength(2);
    expect(next.sentences[1]?.english).toBe('She should apologise at once.');
    expect(next.sentences[1]?.german).toBe('Sie entschuldigte sich sofort.');
  });

  it('ersetzt genau einen Satz, ohne das Original zu verändern', () => {
    const original = draft();
    const target = original.sentences[0];
    expect(target).toBeDefined();
    const before = JSON.stringify(original);

    const next = replaceSentenceWith(original, target?.id ?? '', {
      english: 'She should apologise at once.',
    });

    expect(JSON.stringify(original)).toBe(before);
    expect(next.sentences).toHaveLength(1);
    expect(next.sentences[0]?.english).toBe('She should apologise at once.');
    expect(next.sentences[0]?.german).toBe('');
    // Die Satz-ID bleibt dieselbe – es ist derselbe Platz in der Liste.
    expect(next.sentences[0]?.id).toBe(target?.id);
  });

  it('lässt eine unbekannte Satz-ID unverändert', () => {
    const original = draft();
    expect(replaceSentenceWith(original, 'gibt-es-nicht', { english: 'x' })).toBe(original);
  });

  it('verändert den sourceType nicht', () => {
    const manual = draft({ sourceType: 'manual' });
    const next = addSuggestedSentence(manual, { english: 'She should apologise at once.' });
    expect(next.sourceType).toBe('manual');
  });

  it('hängt bei zehn Sätzen nichts mehr an, ersetzen bleibt möglich', () => {
    const full = draft({
      sentences: Array.from({ length: MAX_SENTENCES }, (_, index) =>
        newSentence(`Sentence ${index + 1} apologise.`),
      ),
    });
    expect(canAddSentence(full)).toBe(false);
    expect(addSuggestedSentence(full, { english: 'She should apologise at once.' })).toBe(full);

    const first = full.sentences[0];
    const replaced = replaceSentenceWith(full, first?.id ?? '', {
      english: 'She should apologise at once.',
    });
    expect(replaced.sentences).toHaveLength(MAX_SENTENCES);
    expect(replaced.sentences[0]?.english).toBe('She should apologise at once.');
  });

  it('erlaubt den zehnten Satz noch', () => {
    const nine = draft({
      sentences: Array.from({ length: 9 }, (_, index) =>
        newSentence(`Sentence ${index + 1} apologise.`),
      ),
    });
    expect(canAddSentence(nine)).toBe(true);
    expect(addSuggestedSentence(nine, { english: 'She should apologise at once.' }).sentences).toHaveLength(
      MAX_SENTENCES,
    );
  });
});

describe('Anfrage und Modi', () => {
  it('übergibt genau diese Vokabel und ihre Sätze', () => {
    const request = sentenceRequestFor(
      draft({ german: 'sich entschuldigen; um Verzeihung bitten', partOfSpeech: 'verb' }),
      'simpler',
    );
    expect(request).toEqual({
      english: 'to apologise',
      germanAnswers: ['sich entschuldigen', 'um Verzeihung bitten'],
      partOfSpeech: 'verb',
      existingSentences: ['He wanted to apologise to the whole class.'],
      mode: 'simpler',
    });
  });

  it('lässt eine fehlende Wortart einfach weg', () => {
    const request = sentenceRequestFor(draft({ partOfSpeech: '' }), 'create');
    expect('partOfSpeech' in request).toBe(false);
  });

  it('bietet ohne Satz nur „neu erstellen“ an', () => {
    expect(availableModes(draft({ sentences: [] }))).toEqual(['create']);
    expect(availableModes(draft({ sentences: [newSentence('   ')] }))).toEqual(['create']);
  });

  it('bietet mit Satz die beiden Varianten an', () => {
    expect(availableModes(draft())).toEqual(['simpler', 'different-context']);
  });
});
