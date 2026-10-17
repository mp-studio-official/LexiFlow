// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  TEXTWERKSTATT_CAPABILITY,
  TEXTWERKSTATT_MAX_AUSSCHNITT,
  textwerkstattAntwort,
  textwerkstattAuftrag,
} from './textwerkstattauftrag.ts';

const GUELTIG = {
  context: { grade: '8', cefrLevel: 'A2', topic: 'Scotland and Wales' },
  candidates: [
    {
      id: 'c-customs',
      english: 'customs',
      sourceSentence: 'Scotland has some unique customs.',
      occurrences: 1,
    },
  ],
};

describe('der serverseitige Textwerkstattauftrag', () => {
  it('verlangt die eine bekannte Fähigkeit und begrenzt ihre Felder', () => {
    const auftrag = textwerkstattAuftrag(TEXTWERKSTATT_CAPABILITY, GUELTIG);
    expect(auftrag).toBeDefined();
    expect(auftrag?.payload.candidates).toEqual(GUELTIG.candidates);
    expect(auftrag?.schema.properties.suggestions.maxItems).toBe(30);
    expect(JSON.stringify(auftrag)).not.toContain('apiKey');
  });

  it('erfüllt den strikten OpenAI-Vertrag auch für optionale Vorschlagsfelder', () => {
    const auftrag = textwerkstattAuftrag(TEXTWERKSTATT_CAPABILITY, GUELTIG);
    const element = auftrag?.schema.properties.suggestions.items;
    expect(element?.required).toEqual(Object.keys(element?.properties ?? {}));
    expect(element?.properties.complementPattern.type).toEqual(['string', 'null']);
    expect(element?.properties.germanSentence.type).toEqual(['string', 'null']);
  });

  it('nimmt weder einen bloßen Volltext noch leere oder fremde Aufträge an', () => {
    expect(textwerkstattAuftrag(TEXTWERKSTATT_CAPABILITY, { sourceText: 'ganzer Text' })).toBeUndefined();
    expect(textwerkstattAuftrag(TEXTWERKSTATT_CAPABILITY, { ...GUELTIG, candidates: [] })).toBeUndefined();
    expect(textwerkstattAuftrag('allgemein', GUELTIG)).toBeUndefined();
  });

  it('lehnt zusätzliche Felder und doppelte Kennungen ab', () => {
    expect(textwerkstattAuftrag(TEXTWERKSTATT_CAPABILITY, {
      ...GUELTIG,
      sourceText: 'ganzer Text',
    })).toBeUndefined();
    expect(textwerkstattAuftrag(TEXTWERKSTATT_CAPABILITY, {
      ...GUELTIG,
      candidates: [...GUELTIG.candidates, GUELTIG.candidates[0]],
    })).toBeUndefined();
  });

  it('schneidet Anzahl, Textlängen und Häufigkeit an der Servergrenze ab', () => {
    const viele = Array.from({ length: 35 }, (_, index) => ({
      id: `c-${index}`,
      english: 'x'.repeat(300),
      sourceSentence: 's'.repeat(900),
      occurrences: 2_000,
    }));
    const auftrag = textwerkstattAuftrag(TEXTWERKSTATT_CAPABILITY, {
      ...GUELTIG,
      candidates: viele,
    });
    expect(auftrag?.payload.candidates).toHaveLength(30);
    expect(auftrag?.payload.candidates[0]?.english).toHaveLength(160);
    expect(auftrag?.payload.candidates[0]?.sourceSentence).toHaveLength(TEXTWERKSTATT_MAX_AUSSCHNITT);
    expect(auftrag?.payload.candidates[0]?.occurrences).toBe(999);
  });

  it('lässt aus der Anbieterantwort nur bekannte, vollständige Vorschläge heraus', () => {
    expect(textwerkstattAntwort({
      suggestions: [{
        candidateId: 'c-customs',
        german: 'Bräuche',
        learningForm: 'customs (pl.)',
        lemma: 'custom',
        partOfSpeech: 'noun',
      }],
    }, new Set(['c-customs']))).toEqual({
      suggestions: [expect.objectContaining({ candidateId: 'c-customs', german: 'Bräuche' })],
    });
    expect(textwerkstattAntwort({
      suggestions: [{
        candidateId: 'c99',
        german: 'erfunden',
        learningForm: 'invented',
        lemma: 'invent',
        partOfSpeech: 'verb',
      }],
    }, new Set(['c-customs']))).toBeUndefined();
  });

  it('behandelt die im strikten Schema nötigen Nullwerte weiterhin als optionale Angaben', () => {
    expect(textwerkstattAntwort({
      suggestions: [{
        candidateId: 'c-customs',
        german: 'Bräuche',
        learningForm: 'customs (pl.)',
        lemma: 'custom',
        partOfSpeech: 'noun',
        complementPattern: null,
        germanSentence: null,
      }],
    }, new Set(['c-customs']))).toEqual({
      suggestions: [{
        candidateId: 'c-customs',
        german: 'Bräuche',
        learningForm: 'customs (pl.)',
        lemma: 'custom',
        partOfSpeech: 'noun',
      }],
    });
  });
});
