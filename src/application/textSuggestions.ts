import { PART_OF_SPEECH, type PartOfSpeech } from '../domain/schema';
import type { TextCandidate } from '../domain/textExtraction';

export const TEXT_SUGGESTION_CAPABILITY = 'teacher-text/suggestions';
export const MAX_TEXT_SUGGESTION_CANDIDATES = 30;
export const MAX_TEXT_SUGGESTION_EXCERPT_LENGTH = 280;

export interface TextSuggestionContext {
  grade: string;
  cefrLevel: string;
  topic?: string;
}

export interface TextSuggestion {
  candidateId: string;
  german: string;
  learningForm: string;
  lemma: string;
  partOfSpeech: PartOfSpeech;
  complementPattern?: string;
  germanSentence?: string;
}

/**
 * Baut die begrenzte Anbieternutzlast. Es gibt kein Rohtextfeld; jeder
 * Kandidat trägt aber einen Ausschnitt aus dem Quelltext, weil eine
 * kontextgerechte Übersetzung ohne Kontext nicht ehrlich möglich ist.
 */
export function textSuggestionPayload(
  candidates: readonly TextCandidate[],
  context: TextSuggestionContext,
): Record<string, unknown> {
  return {
    context: {
      grade: context.grade.slice(0, 12),
      cefrLevel: context.cefrLevel.slice(0, 12),
      ...(context.topic?.trim() ? { topic: context.topic.trim().slice(0, 160) } : {}),
    },
    candidates: candidates.slice(0, MAX_TEXT_SUGGESTION_CANDIDATES).map((candidate) => ({
      id: candidate.id.slice(0, 100),
      english: candidate.english.slice(0, 160),
      sourceSentence: candidate.sourceSentence.slice(0, MAX_TEXT_SUGGESTION_EXCERPT_LENGTH),
      occurrences: Math.min(Math.max(1, Math.trunc(candidate.occurrences)), 999),
    })),
  };
}

function kurzerText(wert: unknown, laenge: number): string | undefined {
  return typeof wert === 'string' && wert.trim() !== '' ? wert.trim().slice(0, laenge) : undefined;
}

/**
 * Behandelt die Anbieterantwort als untrusted input. Unbekannte Kennungen,
 * doppelte Zeilen und unvollständige Vorschläge werden verworfen; sie dürfen
 * weder neue Wörter erfinden noch bestehende Kandidaten überschreiben.
 */
export function parseTextSuggestions(
  roh: unknown,
  erlaubteCandidateIds: ReadonlySet<string>,
): TextSuggestion[] {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return [];
  const liste = (roh as Record<string, unknown>)['suggestions'];
  if (!Array.isArray(liste)) return [];
  const gesehen = new Set<string>();
  const ergebnis: TextSuggestion[] = [];
  for (const eintrag of liste.slice(0, MAX_TEXT_SUGGESTION_CANDIDATES)) {
    if (!eintrag || typeof eintrag !== 'object' || Array.isArray(eintrag)) continue;
    const wert = eintrag as Record<string, unknown>;
    const candidateId = kurzerText(wert['candidateId'], 100);
    const german = kurzerText(wert['german'], 300);
    const learningForm = kurzerText(wert['learningForm'], 160);
    const lemma = kurzerText(wert['lemma'], 160);
    const wortart = wert['partOfSpeech'];
    if (
      !candidateId ||
      !erlaubteCandidateIds.has(candidateId) ||
      gesehen.has(candidateId) ||
      !german ||
      !learningForm ||
      !lemma ||
      (wortart !== 'phrase' && wortart !== 'other' && !(PART_OF_SPEECH as readonly string[]).includes(String(wortart)))
    ) {
      continue;
    }
    gesehen.add(candidateId);
    const complementPattern = kurzerText(wert['complementPattern'], 200);
    const germanSentence = kurzerText(wert['germanSentence'], 600);
    ergebnis.push({
      candidateId,
      german,
      learningForm,
      lemma,
      partOfSpeech: wortart as TextSuggestion['partOfSpeech'],
      ...(complementPattern ? { complementPattern } : {}),
      ...(germanSentence ? { germanSentence } : {}),
    });
  }
  return ergebnis;
}
