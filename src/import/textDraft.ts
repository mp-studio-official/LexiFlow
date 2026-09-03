import { newId } from '../domain/ids';
import {
  describeCandidateForms,
  describeCandidateInflections,
  type TextCandidate,
} from '../domain/textExtraction';
import { emptyDraft, newSentence, validateDrafts, type DraftRow } from './draft';
import type { GrammaticalNumber, PartOfSpeech } from '../domain/schema';

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
  /**
   * Die im Empfehlungsschritt gezeigte **Lernform** – `to single out`,
   * `restraints (pl.)`. Leer heißt: keine gebaut, dann gilt die Textform.
   */
  learningForm?: string;
  /** Das Lemma zum Nachschlagen und Dublettenprüfen. */
  lemma?: string;
  grammaticalNumber?: GrammaticalNumber | '';
  /** Die belegte Rektion. Leer heißt „nicht belegt“, nie „gibt es nicht“. */
  complementPattern?: string;
  /** Ist an der Form noch etwas offen? Dann sagt der Entwurf das weiter. */
  formNeedsReview?: boolean;
  /** Warum – der Satz, den schon der Empfehlungsschritt gezeigt hat. */
  formReviewReason?: string;
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
      /*
        Die Lernform, nicht die Textform.

        `candidate.english` ist, was im Text stand: `depend`, `restraints`.
        Was ins Paket gehört, ist `to depend`, `restraints (pl.)` – gebaut und
        geprüft im Schritt davor. Fehlt sie (ältere Aufrufer, andere
        Importwege), bleibt die Textform, statt hier etwas zu erfinden.
      */
      english: selection.learningForm?.trim() || candidate.english,
      german: selection.german.trim(),
      partOfSpeech: selection.partOfSpeech ?? '',
      lemma: selection.lemma?.trim() ?? '',
      complementPattern: selection.complementPattern?.trim() ?? '',
      grammaticalNumber: selection.grammaticalNumber || '',
      // Eine offene Frage zur Form geht mit; `validateDrafts` macht daraus die
      // Warnung „Bitte prüfen“ in der Tabelle.
      ...(selection.formNeedsReview ? { formNeedsReview: true } : {}),
      ...(selection.formReviewReason ? { formReviewReason: selection.formReviewReason } : {}),
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
