import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData } from '../data/db';
import { getPack, savePack } from '../data/packRepo';
import { analyzeText } from '../domain/textExtraction';
import { buildCloze } from '../domain/exercises';
import { parsePackFile, serializePack } from '../domain/vocabpack';
import { draftsToEntries, validateDrafts } from './draft';
import { candidatesToDrafts, type CandidateSelection } from './textDraft';
import { limitCandidates } from './candidateLimit';
import type { VocabPack } from '../domain/schema';
import { VOCABPACK_FORMAT_VERSION } from '../domain/schema';

/**
 * **Akzeptanzkriterium der Wortformen und Abkürzungen (Sprint 3B.1).**
 *
 * Die neuen Informationen – beobachtete Formen, Häufigkeiten, aufgelöste
 * Abkürzungen – sind eine Hilfe für die Lehrkraft, kein neues Datenformat.
 * Dieser Test hält beides fest: Sie kommen in der Werkstatt an, und sie
 * verlassen sie nicht. `formatVersion` bleibt 1, ein Paket aus Sprint 2 lässt
 * sich weiterhin öffnen, und der Lückentext bleibt grammatisch richtig.
 */

const TEXT = [
  'The bay lies in the north of the country.',
  'One island rises straight out of the water.',
  'Around 1,969 islands fill the bay, and the islands attract many visitors.',
  'The protected area covers about 600 sq mi.',
].join(' ');

const GERMAN: Readonly<Record<string, string>> = {
  island: 'die Insel',
  bay: 'die Bucht',
  water: 'das Wasser',
  country: 'das Land',
  north: 'der Norden',
  area: 'das Gebiet',
  'sq mi': 'die Quadratmeile',
};

beforeEach(async () => {
  await clearAllLocalData();
});

function packFromText(): { pack: VocabPack; chosen: number } {
  const shown = limitCandidates(analyzeText(TEXT).candidates, 20);

  const selections: CandidateSelection[] = shown.map((candidate) => ({
    candidate,
    german: GERMAN[candidate.normalizedEnglish] ?? 'Bedeutung',
    translationAccepted: false,
    includeSentence: true,
  }));

  const drafts = validateDrafts(candidatesToDrafts(selections));
  return {
    chosen: selections.length,
    pack: {
      meta: {
        id: 'pack-forms',
        title: 'Halong Bay – aus einem Text',
        topic: 'Geography',
        grade: '9',
        cefrLevel: 'B1',
        cefrLevelOverridden: false,
        direction: 'both',
        createdAt: '2026-03-01T09:00:00.000Z',
        updatedAt: '2026-03-01T09:00:00.000Z',
      },
      entries: draftsToEntries(drafts, 'import'),
    },
  };
}

describe('Wortformen in der Werkstatt', () => {
  it('liefert die Formen als Hinweis an den Entwurf', () => {
    const shown = limitCandidates(analyzeText(TEXT).candidates, 20);
    const island = shown.find((candidate) => candidate.normalizedEnglish === 'island');
    expect(island).toBeDefined();

    const [draft] = candidatesToDrafts([
      { candidate: island!, german: 'die Insel', translationAccepted: false, includeSentence: true },
    ]);

    expect(draft?.provenance?.formSummary).toBe('Im Text: islands, island · insgesamt 3-mal');
    expect(draft?.provenance?.inflections).toEqual(['Plural: islands']);
  });

  it('trägt beobachtete Formen nicht als akzeptierte Antworten ein', () => {
    // `islands` ist auf „die Insel“ keine richtige Antwort.
    const { pack } = packFromText();
    const island = pack.entries.find((entry) => entry.english === 'island');

    expect(island).toBeDefined();
    expect(island?.acceptedEnglishAnswers ?? []).toEqual([]);
  });
});

describe('Portabilität des Paketformats', () => {
  it('behält formatVersion 1 und exportiert keine Werkstattdaten', () => {
    const { pack } = packFromText();
    const file = serializePack(pack);

    expect(JSON.parse(file).formatVersion).toBe(VOCABPACK_FORMAT_VERSION);
    for (const forbidden of [
      'provenance',
      'formSummary',
      'inflections',
      'abbreviationHint',
      'literal',
      'occurrences',
      'firstOccurrence',
      'normalizedEnglish',
      'text-extraction',
    ]) {
      expect(file, `„${forbidden}“ gehört nicht ins Paket`).not.toContain(forbidden);
    }
  });

  it('lässt sich in einem zweiten Kontext ohne Werkstattwissen öffnen', async () => {
    const { pack, chosen } = packFromText();
    const parsed = parsePackFile(serializePack(pack));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await savePack(parsed.pack);
    const stored = await getPack('pack-forms');
    expect(stored?.entries).toHaveLength(chosen);
    expect(stored?.meta.direction).toBe('both');
  });

  it('öffnet ein Paket aus einem früheren Sprint unverändert', () => {
    // Genau das Format, das Sprint 2 geschrieben hat – ohne jedes neue Feld.
    const legacy = JSON.stringify({
      kind: 'lexiflow.vocabpack',
      formatVersion: 1,
      meta: {
        id: 'pack-legacy',
        title: 'City life',
        topic: 'City life',
        grade: '9',
        cefrLevel: 'B1',
        cefrLevelOverridden: false,
        direction: 'en-de',
        createdAt: '2026-01-01T09:00:00.000Z',
        updatedAt: '2026-01-01T09:00:00.000Z',
      },
      entries: [
        {
          id: 'e-1',
          english: 'crowded',
          germanAnswers: ['überfüllt'],
          acceptedEnglishAnswers: [],
          exampleSentences: [{ english: 'The bus was crowded today.' }],
          tags: [],
          sourceType: 'import',
        },
      ],
    });

    const parsed = parsePackFile(legacy);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.entries[0]?.english).toBe('crowded');
  });
});

describe('Lückentext nach dem Export', () => {
  it('erwartet die Form, die im Beispielsatz steht', () => {
    const { pack } = packFromText();
    const island = pack.entries.find((entry) => entry.english === 'island');
    expect(island).toBeDefined();

    // Der Beispielsatz der ersten Fundstelle enthält „island“.
    expect(buildCloze(island!)?.solution).toBe('island');

    // Und mit einem Satz, der nur die Pluralform enthält, ist es „islands“.
    const plural = buildCloze({
      ...island!,
      exampleSentences: [{ english: 'Around 1,969 islands fill the bay.' }],
    });
    expect(plural?.solution).toBe('islands');
  });

  it('findet auch die Abkürzung im Originalsatz', () => {
    const { pack } = packFromText();
    const unit = pack.entries.find((entry) => entry.english.includes('sq mi'));

    expect(unit?.english).toBe('square mile (sq mi)');
    expect(buildCloze(unit!)?.solution).toBe('sq mi');
  });
});
