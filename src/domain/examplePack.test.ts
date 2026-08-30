import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePackFile } from './vocabpack';
import { parseCsv } from '../import/csv';
import { detectColumns } from '../import/columnDetect';
import { buildDrafts, draftsToEntries, summarize } from '../import/draft';

/** Die mitgelieferten Beispieldateien müssen jederzeit importierbar bleiben. */

describe('Beispielpaket', () => {
  it('ist ein gültiges .vocabpack.json der aktuellen Version', () => {
    const text = readFileSync('examples/unit-3-city-life-7.vocabpack.json', 'utf8');
    const result = parsePackFile(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.entries).toHaveLength(6);
    expect(result.pack.meta.cefrLevel).toBe('A2+');
  });
});

describe('Beispiel-CSV', () => {
  it('wird vollständig und ohne Fehler erkannt', () => {
    const rows = parseCsv(readFileSync('examples/vokabeln-beispiel.csv', 'utf8'));
    const mapping = detectColumns(rows);
    expect(mapping.hasHeader).toBe(true);
    expect(mapping.roles).toEqual([
      'english',
      'german',
      'partOfSpeech',
      'example',
      'exampleGerman',
      'tags',
    ]);

    const drafts = buildDrafts(rows, mapping, { splitMultipleMeanings: true });
    const summary = summarize(drafts);
    expect(summary.total).toBe(6);
    expect(summary.errors).toBe(0);
    expect(summary.duplicates).toBe(0);

    const entries = draftsToEntries(drafts, 'import');
    expect(entries).toHaveLength(6);
    expect(entries[0]?.germanAnswers).toEqual(['überfüllt', 'voll']);
  });
});
