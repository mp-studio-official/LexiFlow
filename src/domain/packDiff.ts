import { normalizeAnswer } from './normalize';
import type { VocabEntry } from './schema';

/**
 * Vergleich zweier Fassungen eines Pakets beim erneuten Import.
 *
 * Der Fingerprint umfasst bewusst nur **lernrelevante** Felder – also das,
 * was tatsächlich abgefragt wird:
 *
 * - `english`
 * - `germanAnswers`
 * - `acceptedEnglishAnswers`
 * - `exampleSentences` (Grundlage der Lückensätze)
 *
 * Nicht enthalten sind `partOfSpeech`, `topicTags`, `notes`, `difficulty` und
 * `sourceType`: Korrekturen daran ändern nichts an der abgefragten Vokabel und
 * dürfen deshalb keinen Lernstand zurücksetzen. Ebenso wenig zählen
 * Paket-Metadaten wie Titel, Thema oder Beschreibung.
 *
 * Antwortlisten werden normalisiert und sortiert: Das reine Umsortieren
 * gleichwertiger Übersetzungen gilt nicht als inhaltliche Änderung.
 */
export function entryFingerprint(entry: VocabEntry): string {
  const answers = [...entry.germanAnswers].map(normalizeAnswer).sort();
  const accepted = [...entry.acceptedEnglishAnswers].map(normalizeAnswer).sort();
  const sentences = entry.exampleSentences
    .map((sentence) => `${sentence.english.trim()}|${(sentence.german ?? '').trim()}`)
    .sort();

  return JSON.stringify([normalizeAnswer(entry.english), answers, accepted, sentences]);
}

export interface PackDiff {
  /** Gleiche ID, gleicher Fingerprint – Lernstand bleibt erhalten. */
  unchanged: VocabEntry[];
  /** Neue ID – Lernstand wird neu angelegt. */
  added: VocabEntry[];
  /** Gleiche ID, anderer Fingerprint – Lernstand wird zurückgesetzt. */
  changed: VocabEntry[];
  /** Nur in der bisherigen Fassung – Lernstand wird gelöscht. */
  removed: VocabEntry[];
}

export function diffPackEntries(
  existing: readonly VocabEntry[],
  incoming: readonly VocabEntry[],
): PackDiff {
  const existingById = new Map(existing.map((entry) => [entry.id, entry]));
  const incomingIds = new Set(incoming.map((entry) => entry.id));

  const diff: PackDiff = { unchanged: [], added: [], changed: [], removed: [] };

  for (const entry of incoming) {
    const previous = existingById.get(entry.id);
    if (!previous) {
      diff.added.push(entry);
    } else if (entryFingerprint(previous) === entryFingerprint(entry)) {
      diff.unchanged.push(entry);
    } else {
      diff.changed.push(entry);
    }
  }

  for (const entry of existing) {
    if (!incomingIds.has(entry.id)) diff.removed.push(entry);
  }

  return diff;
}

export interface PackUpdateSummary {
  kept: number;
  added: number;
  changed: number;
  removed: number;
}

export function summarizeDiff(diff: PackDiff): PackUpdateSummary {
  return {
    kept: diff.unchanged.length,
    added: diff.added.length,
    changed: diff.changed.length,
    removed: diff.removed.length,
  };
}

/** Verständlicher Satz für die Oberfläche. */
export function describeUpdateSummary(summary: PackUpdateSummary): string {
  const parts = [
    `${summary.kept} ${summary.kept === 1 ? 'Lernstand' : 'Lernstände'} erhalten`,
    `${summary.added} ${summary.added === 1 ? 'neue Vokabel' : 'neue Vokabeln'}`,
    `${summary.changed} ${summary.changed === 1 ? 'geänderte zurückgesetzt' : 'geänderte zurückgesetzt'}`,
    `${summary.removed} ${summary.removed === 1 ? 'entfernte Vokabel gelöscht' : 'entfernte Vokabeln gelöscht'}`,
  ];
  return `${parts.join(', ')}.`;
}
