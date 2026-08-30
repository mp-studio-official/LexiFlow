import { describe, expect, it } from 'vitest';
import { countClozeReady, parsePackFile, serializePack, suggestFilename, toPackFile } from './vocabpack';
import { VOCABPACK_FORMAT_VERSION, VOCABPACK_KIND } from './schema';
import { makePack } from '../test/fixtures';

describe('Export/Import-Rundlauf', () => {
  it('erhält Metadaten und Einträge unverändert', () => {
    const pack = makePack();
    const parsed = parsePackFile(serializePack(pack));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.meta).toEqual(pack.meta);
    expect(parsed.pack.entries).toEqual(pack.entries);
    expect(parsed.pack.formatVersion).toBe(VOCABPACK_FORMAT_VERSION);
    expect(parsed.pack.kind).toBe(VOCABPACK_KIND);
  });

  it('exportiert keine Lernstände', () => {
    const serialized = serializePack(makePack());
    expect(serialized).not.toMatch(/box|dueAt|streak|correctCount/i);
  });

  it('meldet ungültiges JSON verständlich', () => {
    const result = parsePackFile('{ kaputt');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/JSON/);
  });

  it('meldet fehlende Pflichtfelder mit Pfad', () => {
    const broken = toPackFile(makePack()) as unknown as Record<string, unknown>;
    const entries = [...(broken['entries'] as unknown[])];
    entries[0] = { ...(entries[0] as object), germanAnswers: [] };
    const result = parsePackFile(JSON.stringify({ ...broken, entries }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/entries\.0\.germanAnswers/);
  });
});

describe('Migration älterer Dateien', () => {
  it('hebt ein Dokument ohne Format-Version auf die aktuelle Version', () => {
    const legacy = {
      title: 'Alte Liste',
      grade: '8',
      entries: [
        { en: 'crowded', german: 'überfüllt' },
        { en: 'litter', german: ['Müll', 'Abfall'] },
      ],
    };
    const result = parsePackFile(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.formatVersion).toBe(VOCABPACK_FORMAT_VERSION);
    expect(result.pack.meta.title).toBe('Alte Liste');
    expect(result.pack.meta.grade).toBe('8');
    expect(result.pack.meta.cefrLevel).toBe('A2/B1');
    expect(result.pack.entries[0]?.germanAnswers).toEqual(['überfüllt']);
    expect(result.pack.entries[1]?.germanAnswers).toEqual(['Müll', 'Abfall']);
    expect(result.pack.entries[0]?.sourceType).toBe('import');
  });

  it('lehnt neuere Format-Versionen ab, statt Daten zu verlieren', () => {
    const future = { ...toPackFile(makePack()), formatVersion: 99 };
    const result = parsePackFile(JSON.stringify(future));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/Version 99/);
  });

  it('akzeptiert Beispielsätze als einfache Zeichenkette', () => {
    const legacy = {
      title: 'Sätze',
      grade: '6',
      entries: [{ en: 'quiet', german: 'ruhig', examples: ['It is quiet here.'] }],
    };
    const result = parsePackFile(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.entries[0]?.exampleSentences[0]?.english).toBe('It is quiet here.');
  });
});

describe('suggestFilename', () => {
  it('erzeugt einen sprechenden, sicheren Dateinamen', () => {
    expect(suggestFilename({ title: 'Unit 3 – Sports & Fun', grade: 'Q1' })).toBe(
      'unit-3-sports-fun-q1.vocabpack.json',
    );
  });

  it('ersetzt Umlaute', () => {
    expect(suggestFilename({ title: 'Über Bäume', grade: '5' })).toBe('ueber-baeume-5.vocabpack.json');
  });
});

describe('countClozeReady', () => {
  it('zählt nur Einträge mit brauchbarem Beispielsatz', () => {
    expect(countClozeReady(makePack().entries)).toBe(4);
  });
});
