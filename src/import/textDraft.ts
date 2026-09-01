import { newId } from '../domain/ids';
import {
  describeCandidateForms,
  describeCandidateInflections,
  type TextCandidate,
} from '../domain/textExtraction';
import { emptyDraft, newSentence, validateDrafts, type DraftRow } from './draft';
import type { PartOfSpeech } from '../domain/schema';

/**
 * Übergabe von der Textwerkstatt an den bestehenden Entwurfs-Workflow.
 *
 * Es entsteht keine zweite Editorlogik: Aus den geprüften Kandidaten werden
 * ganz normale `DraftRow`s, die anschließend im Schritt „Prüfen & Speichern“
 * dieselbe `DraftTable` durchlaufen wie jeder andere Importweg.
 */

export interface CandidateSelection {
  candidate: TextCandidate;
  /** Von der Lehrkraft eingegebene oder ausdrücklich übernommene Antwort. */
  german: string;
  /**
   * Die Wortart, wie sie im Empfehlungsschritt stand – vom Wörterbuch
   * vorgeschlagen, von der Lehrkraft bestätigt oder geändert. Leer heißt
   * „nicht gesetzt“; erraten wird sie hier nicht mehr.
   */
  partOfSpeech?: PartOfSpeech | '';
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
  const drafts = selections.map<DraftRow>((selection) => {
    const { candidate } = selection;
    const inflections = describeCandidateInflections(candidate);

    return {
      ...emptyDraft(),
      id: newId(),
      english: candidate.english,
      german: selection.german.trim(),
      partOfSpeech: selection.partOfSpeech ?? '',
      // Beobachtete Beugungen bleiben bewusst draußen: `acceptedEnglish` sind
      // Antworten, die als richtig gewertet werden – `islands` ist auf
      // „die Insel“ keine richtige Antwort.
      sentences: selection.includeSentence
        ? [newSentence(candidate.sourceSentence, selection.germanSentence?.trim() ?? '')]
        : [],
      sourceType: selection.translationAccepted ? 'text-ai' : 'import',
      provenance: {
        origin: 'text-extraction',
        occurrences: candidate.occurrences,
        sourceSentence: candidate.sourceSentence,
        translation: selection.translationAccepted ? 'accepted' : 'none',
        formSummary: describeCandidateForms(candidate),
        ...(inflections.length > 0 ? { inflections } : {}),
        ...(candidate.abbreviation ? { abbreviationHint: candidate.abbreviation.hint } : {}),
      },
    };
  });

  return validateDrafts(drafts);
}
