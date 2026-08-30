import { newId } from '../domain/ids';
import type { TextCandidate } from '../domain/textExtraction';
import { emptyDraft, newSentence, validateDrafts, type DraftRow } from './draft';

/**
 * Übergabe von der Textwerkstatt an den bestehenden Entwurfs-Workflow.
 *
 * Es entsteht keine zweite Editorlogik: Aus den geprüften Kandidaten werden
 * ganz normale `DraftRow`s, die anschließend `DraftTable` und `MetadataForm`
 * durchlaufen.
 */

export interface CandidateSelection {
  candidate: TextCandidate;
  /** Von der Lehrkraft eingegebene oder ausdrücklich übernommene Antwort. */
  german: string;
  /** true, wenn ein maschineller Vorschlag unverändert übernommen wurde. */
  translationAccepted: boolean;
  /** Übersetzter Kontextsatz – reine Hilfestellung, optional. */
  germanSentence?: string;
  /** Originalsatz als Beispielsatz übernehmen. */
  includeSentence: boolean;
}

/**
 * `text-ai` nur dort, wo tatsächlich ein maschineller Vorschlag übernommen
 * wurde; sonst ist die Zeile eine normale Übernahme aus einem Text (`import`).
 */
export function candidatesToDrafts(selections: readonly CandidateSelection[]): DraftRow[] {
  const drafts = selections.map<DraftRow>((selection) => ({
    ...emptyDraft(),
    id: newId(),
    english: selection.candidate.english,
    german: selection.german.trim(),
    sentences: selection.includeSentence
      ? [newSentence(selection.candidate.sourceSentence, selection.germanSentence?.trim() ?? '')]
      : [],
    sourceType: selection.translationAccepted ? 'text-ai' : 'import',
    provenance: {
      origin: 'text-extraction',
      occurrences: selection.candidate.occurrences,
      sourceSentence: selection.candidate.sourceSentence,
      translation: selection.translationAccepted ? 'accepted' : 'none',
    },
  }));

  return validateDrafts(drafts);
}
