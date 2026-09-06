import { describe, expect, it } from 'vitest';

import { decide, describeProvenance, markSuggestion, stripProvenance } from './provenance';

/**
 * Der Vermerk, der einen Vorschlag von einer Entscheidung unterscheidet.
 */

describe('Ein frischer Vorschlag', () => {
  it('ist ungeprüft – ausnahmslos', () => {
    /*
      `markSuggestion` nimmt keinen Status entgegen. Ein Aufrufer, der
      „übernommen" übergeben könnte, würde es irgendwann tun.
    */
    const vermerkt = markSuggestion(['das Haus'], 'translate-entry', 'gemini-3.5-flash-lite');
    expect(vermerkt.provenance.status).toBe('ungeprueft');
  });

  it('hält Fähigkeit, Modell und Zeitpunkt fest', () => {
    const zeitpunkt = new Date('2026-09-14T10:00:00.000Z');
    const vermerkt = markSuggestion('x', 'review-learning-form', 'gemini-3.5-flash', zeitpunkt);

    expect(vermerkt.provenance.source).toBe('gemini');
    expect(vermerkt.provenance.capability).toBe('review-learning-form');
    expect(vermerkt.provenance.model).toBe('gemini-3.5-flash');
    expect(vermerkt.provenance.at).toBe('2026-09-14T10:00:00.000Z');
  });

  it('lässt den Wert selbst unangetastet', () => {
    const wert = { english: 'reef', germanAnswers: ['das Riff'] };
    expect(markSuggestion(wert, 'enrich-entry', 'gemini-3.5-flash-lite').value).toEqual(wert);
  });
});

describe('Die Entscheidung', () => {
  it('macht aus einem Vorschlag eine Übernahme', () => {
    const vermerkt = markSuggestion('x', 'translate-entry', 'gemini-3.5-flash-lite');
    expect(decide(vermerkt, 'uebernommen').provenance.status).toBe('uebernommen');
  });

  it('hält auch ein Verwerfen fest', () => {
    // Wer denselben Vorschlag zweimal ablehnt, soll das beim zweiten Mal sehen.
    const vermerkt = markSuggestion('x', 'translate-entry', 'gemini-3.5-flash-lite');
    expect(decide(vermerkt, 'verworfen').provenance.status).toBe('verworfen');
  });
});

describe('Der Satz neben dem Vorschlag', () => {
  it('nennt das Modell beim Namen und den Status', () => {
    const vermerkt = markSuggestion(
      'x',
      'suggest-example-sentences',
      'gemini-3.5-flash-lite',
      new Date('2026-09-14T10:00:00.000Z'),
    );
    const text = describeProvenance(vermerkt.provenance);

    expect(text).toContain('gemini-3.5-flash-lite');
    expect(text).toContain('ungeprüft');
    expect(text).toContain('Beispielsätze vorschlagen');
  });
});

describe('Vor dem Export', () => {
  it('entfernt Vermerke auch in der Tiefe', () => {
    /*
      Eine Fassung, die nur die oberste Ebene räumte, wäre schlimmer als keine:
      Sie sähe aus, als wäre aufgeräumt worden.
    */
    const paket = {
      title: 'Unit 3',
      entries: [
        {
          english: 'reef',
          provenance: { source: 'gemini', status: 'uebernommen' },
          sentences: [{ english: 'The reef is dying.', provenance: { source: 'gemini' } }],
        },
      ],
    };

    const sauber = stripProvenance(paket);
    expect(JSON.stringify(sauber)).not.toContain('provenance');
    expect(JSON.stringify(sauber)).not.toContain('gemini');
  });

  it('lässt alles andere unverändert', () => {
    const paket = { title: 'Unit 3', entries: [{ english: 'reef', difficulty: 3 }] };
    expect(stripProvenance(paket)).toEqual(paket);
  });

  it('verkraftet Werte, die keine Objekte sind', () => {
    expect(stripProvenance(null)).toBeNull();
    expect(stripProvenance('text')).toBe('text');
    expect(stripProvenance([1, 2, 3])).toEqual([1, 2, 3]);
  });
});
