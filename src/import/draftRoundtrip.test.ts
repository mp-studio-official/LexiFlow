import { describe, expect, it } from 'vitest';
import { draftFromEntry, draftsToEntries, validateDrafts } from './draft';
import { vocabEntrySchema } from '../domain/schema';
import { entryFingerprint } from '../domain/packDiff';
import { makeRichPack } from '../test/fixtures';

/**
 * Der Paketeditor arbeitet auf Entwurfszeilen. Diese Zwischenstufe darf kein
 * Feld verlieren: Öffnen und unverändertes Speichern muss denselben Eintrag
 * ergeben.
 */
describe('Roundtrip Eintrag → Entwurf → Eintrag', () => {
  const pack = makeRichPack();

  it('erhält jedes Feld unverändert', () => {
    const drafts = validateDrafts(pack.entries.map(draftFromEntry));
    const result = draftsToEntries(drafts, 'manual');

    expect(result).toEqual(pack.entries);
  });

  it('erzeugt keine blockierenden Fehler', () => {
    const drafts = validateDrafts(pack.entries.map(draftFromEntry));
    expect(drafts.flatMap((draft) => draft.issues.filter((i) => i.level === 'error'))).toEqual([]);
  });

  it('bleibt schemakonform', () => {
    const result = draftsToEntries(validateDrafts(pack.entries.map(draftFromEntry)), 'manual');
    for (const entry of result) {
      expect(vocabEntrySchema.safeParse(entry).success).toBe(true);
    }
  });

  it('erhält alle Beispielsätze samt Reihenfolge und Übersetzung', () => {
    const result = draftsToEntries(validateDrafts(pack.entries.map(draftFromEntry)), 'manual');
    expect(result[0]?.exampleSentences).toEqual(pack.entries[0]?.exampleSentences);
  });

  it('erhält den ursprünglichen sourceType je Eintrag', () => {
    const result = draftsToEntries(validateDrafts(pack.entries.map(draftFromEntry)), 'import');
    expect(result.map((entry) => entry.sourceType)).toEqual(['manual', 'import', 'topic-ai']);
  });

  it('lässt den Fingerprint unverändert – ein Roundtrip setzt keinen Lernstand zurück', () => {
    const result = draftsToEntries(validateDrafts(pack.entries.map(draftFromEntry)), 'manual');
    expect(result.map(entryFingerprint)).toEqual(pack.entries.map(entryFingerprint));
  });
});
