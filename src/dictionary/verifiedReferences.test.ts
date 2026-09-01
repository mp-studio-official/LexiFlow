import { describe, expect, it } from 'vitest';
import { VERIFIED_REFERENCES, isVerifiedReference } from './verifiedReferences';
import { safeAutoAnswer, summarizeLookup } from '../import/dictionarySuggestions';
import type { DictionaryEntry } from './DictionaryProvider';

/**
 * Die eine geprüfte Ausnahme – und ihre Grenzen.
 *
 * Diese Datei ist der Ort, an dem sich nachlesen lässt, was die Ausnahme
 * erlaubt und was nicht. Sie prüft beides: die Tabelle selbst und ihre Wirkung
 * auf die Sammelaktion.
 */

function entry(
  headword: string,
  senses: DictionaryEntry['senses'],
  extra: Partial<DictionaryEntry> = {},
): DictionaryEntry {
  return {
    headword,
    lemma: headword,
    partOfSpeech: 'noun',
    senses,
    quality: 'exact',
    source: 'wiktionary',
    ...extra,
  };
}

describe('Die Tabelle der geprüften Verweise', () => {
  it('ist klein und begründet jeden Eintrag', () => {
    /*
      Eine Ausnahmeliste, die wächst, ist keine Ausnahmeliste mehr. Dieser Test
      ist eine Bremse: Wer einen Eintrag hinzufügt, muss ihn begründen – und
      wer viele hinzufügt, muss diesen Test ändern und dabei nachdenken.
    */
    expect(VERIFIED_REFERENCES.length).toBeLessThanOrEqual(3);
    for (const reference of VERIFIED_REFERENCES) {
      expect(reference.reason.length).toBeGreaterThan(40);
      expect(reference.headword).toBe(reference.headword.toLowerCase());
      expect(reference.via).toBe(reference.via.toLowerCase());
    }
  });

  it('kennt doctor → physician', () => {
    expect(isVerifiedReference('doctor', 'physician')).toBe(true);
    expect(isVerifiedReference('Doctor', 'Physician')).toBe(true);
  });

  it('verlangt, dass beide Seiten stimmen', () => {
    // Ein `doctor`, über irgendetwas anderes erschlossen, fällt nicht darunter.
    expect(isVerifiedReference('doctor', 'veterinarian')).toBe(false);
    expect(isVerifiedReference('medic', 'physician')).toBe(false);
    expect(isVerifiedReference('doctor', undefined)).toBe(false);
  });
});

describe('Wirkung auf die sichere Sammelübernahme', () => {
  const doctor = summarizeLookup([
    entry('doctor', [
      { sense: 'doctorate holder', suggestions: [{ german: 'Doktor', gender: 'm' }] },
      { sense: 'medical doctor', via: 'physician', suggestions: [{ german: 'Arzt', gender: 'm' }] },
    ]),
  ]);

  it('trägt für doctor die geprüfte medizinische Bedeutung ein', () => {
    /*
      Der Akzeptanzfall. Wer `doctor` in ein Vokabelpaket nimmt, meint den Arzt.
      Der Verweis auf `physician` ist in Sprint 4A.2 an der Originalquelle
      geprüft worden – deshalb darf er hier eingetragen werden, und deshalb
      **nur** er.
    */
    expect(safeAutoAnswer(doctor)).toBe('Arzt');
  });

  it('hängt keine zweite Bedeutungsgruppe an', () => {
    // `veterinarian` → *Tierarzt* ist ein anderer Beruf und eine andere Gruppe.
    const mitTierarzt = summarizeLookup([
      entry('doctor', [
        { sense: 'medical doctor', via: 'physician', suggestions: [{ german: 'Arzt', gender: 'm' }] },
        {
          sense: 'animal doctor',
          via: 'veterinarian',
          suggestions: [{ german: 'Tierarzt', gender: 'm' }],
        },
      ]),
    ]);
    const answer = safeAutoAnswer(mitTierarzt);
    expect(answer).toBe('Arzt');
    expect(answer).not.toContain('Tierarzt');
  });

  it('hebt keine andere Regel auf', () => {
    // Markiertes bleibt markiert – auch in einer geprüften Verweisbedeutung.
    const veraltet = summarizeLookup([
      entry('doctor', [
        {
          sense: 'medical doctor',
          via: 'physician',
          suggestions: [{ german: 'Medikus', register: ['dated'] }],
        },
      ]),
    ]);
    expect(safeAutoAnswer(veraltet)).toBe('');

    // Und drei Entsprechungen bleiben eine Aufzählung, aus der nur die erste kommt.
    const drei = summarizeLookup([
      entry('doctor', [
        {
          sense: 'medical doctor',
          via: 'physician',
          suggestions: [{ german: 'Arzt' }, { german: 'Ärztin' }, { german: 'Mediziner' }],
        },
      ]),
    ]);
    expect(safeAutoAnswer(drei)).toBe('Arzt');
  });

  it('lässt jedes andere Stichwort mit erschlossenem Verweis leer', () => {
    const medic = summarizeLookup([
      entry('medic', [
        { sense: 'medical doctor', via: 'physician', suggestions: [{ german: 'Arzt' }] },
      ]),
    ]);
    expect(safeAutoAnswer(medic)).toBe('');
  });

  it('bevorzugt bei einem anderen Stichwort weiterhin die eigene Bedeutung', () => {
    const surgeon = summarizeLookup([
      entry('surgeon', [
        { sense: 'medical doctor', via: 'physician', suggestions: [{ german: 'Arzt' }] },
        { sense: 'operating doctor', suggestions: [{ german: 'Chirurg', gender: 'm' }] },
      ]),
    ]);
    expect(safeAutoAnswer(surgeon)).toBe('Chirurg');
  });
});
