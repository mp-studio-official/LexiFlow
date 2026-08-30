import { describe, expect, it } from 'vitest';
import { describeUpdateSummary, diffPackEntries, entryFingerprint, summarizeDiff } from './packDiff';
import { makeRichPack } from '../test/fixtures';
import type { VocabEntry } from './schema';

const pack = makeRichPack();
const [apologise, crowded, litter] = pack.entries as [VocabEntry, VocabEntry, VocabEntry];

describe('entryFingerprint', () => {
  it('ändert sich bei einer neuen Übersetzung', () => {
    expect(entryFingerprint({ ...crowded, germanAnswers: ['überfüllt'] })).not.toBe(
      entryFingerprint(crowded),
    );
  });

  it('ändert sich bei geändertem Stichwort', () => {
    expect(entryFingerprint({ ...crowded, english: 'busy' })).not.toBe(entryFingerprint(crowded));
  });

  it('ändert sich bei geändertem Beispielsatz', () => {
    expect(
      entryFingerprint({ ...crowded, exampleSentences: [{ english: 'It was crowded.' }] }),
    ).not.toBe(entryFingerprint(crowded));
  });

  it('ändert sich bei neuen Alternativantworten', () => {
    expect(entryFingerprint({ ...crowded, acceptedEnglishAnswers: ['busy'] })).not.toBe(
      entryFingerprint(crowded),
    );
  });

  it('bleibt bei Notizen, Tags, Wortart und Schwierigkeit gleich', () => {
    expect(
      entryFingerprint({
        ...crowded,
        notes: 'neue Notiz',
        topicTags: ['ganz', 'andere', 'tags'],
        partOfSpeech: 'other',
        difficulty: 5,
        sourceType: 'topic-ai',
      }),
    ).toBe(entryFingerprint(crowded));
  });

  it('ignoriert Groß-/Kleinschreibung und Umsortieren gleichwertiger Übersetzungen', () => {
    expect(
      entryFingerprint({ ...crowded, germanAnswers: ['Voll', 'überfüllt'] }),
    ).toBe(entryFingerprint(crowded));
  });
});

describe('diffPackEntries', () => {
  it('erkennt unveränderte Einträge', () => {
    const diff = diffPackEntries(pack.entries, pack.entries);
    expect(summarizeDiff(diff)).toEqual({ kept: 3, added: 0, changed: 0, removed: 0 });
  });

  it('erkennt neue, geänderte und entfernte Einträge', () => {
    const incoming: VocabEntry[] = [
      apologise,
      { ...crowded, germanAnswers: ['überfüllt', 'voll', 'gedrängt'] },
      { ...litter, id: 'rich-4', english: 'rubbish' },
    ];
    const diff = diffPackEntries(pack.entries, incoming);

    expect(diff.unchanged.map((entry) => entry.id)).toEqual(['rich-1']);
    expect(diff.changed.map((entry) => entry.id)).toEqual(['rich-2']);
    expect(diff.added.map((entry) => entry.id)).toEqual(['rich-4']);
    expect(diff.removed.map((entry) => entry.id)).toEqual(['rich-3']);
  });

  it('behandelt reine Metadatenänderungen als unverändert', () => {
    const incoming = pack.entries.map((entry) => ({ ...entry, notes: 'überarbeitet' }));
    expect(summarizeDiff(diffPackEntries(pack.entries, incoming)).changed).toBe(0);
  });

  it('meldet bei leerem Bestand alles als neu', () => {
    expect(summarizeDiff(diffPackEntries([], pack.entries))).toEqual({
      kept: 0,
      added: 3,
      changed: 0,
      removed: 0,
    });
  });
});

describe('describeUpdateSummary', () => {
  it('formuliert eine verständliche Zusammenfassung', () => {
    expect(describeUpdateSummary({ kept: 12, added: 3, changed: 2, removed: 1 })).toBe(
      '12 Lernstände erhalten, 3 neue Vokabeln, 2 geänderte zurückgesetzt, 1 entfernte Vokabel gelöscht.',
    );
  });

  it('nutzt den Singular korrekt', () => {
    expect(describeUpdateSummary({ kept: 1, added: 1, changed: 1, removed: 0 })).toBe(
      '1 Lernstand erhalten, 1 neue Vokabel, 1 geänderte zurückgesetzt, 0 entfernte Vokabeln gelöscht.',
    );
  });
});
