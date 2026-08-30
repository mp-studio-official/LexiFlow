import { acceptedForms, levenshtein, normalizeAnswer, typoTolerance } from './normalize';

export type AnswerVerdict = 'correct' | 'almost' | 'wrong';

export interface AnswerCheckResult {
  verdict: AnswerVerdict;
  /** Die akzeptierte Antwort, die getroffen wurde (Originalschreibweise). */
  matched?: string;
  /** Kurzer, sachlicher Hinweis für das Direktfeedback. */
  hint?: string;
  /** Alle korrekten Antworten in Originalschreibweise. */
  expected: string[];
}

/**
 * Prüft eine freie Eingabe gegen alle akzeptierten Antworten.
 *
 * - Groß-/Kleinschreibung, Mehrfach-Leerzeichen, typografische Zeichen und
 *   abschließende Satzzeichen sind bedeutungslos.
 * - Führende Artikel bzw. „to“ sowie Klammerzusätze werden toleriert.
 * - Ein kleiner Tippfehler ergibt „fast richtig“ statt „falsch“.
 * - Mehrere durch Komma getrennte Eingaben gelten als richtig, sobald eine
 *   davon passt (eine korrekte Bedeutung genügt).
 */
export function checkAnswer(userInput: string, expected: readonly string[]): AnswerCheckResult {
  const expectedList = expected.filter((value) => value.trim().length > 0);
  const result = (partial: Omit<AnswerCheckResult, 'expected'>): AnswerCheckResult => ({
    ...partial,
    expected: expectedList,
  });

  const input = normalizeAnswer(userInput);
  if (input.length === 0) {
    return result({ verdict: 'wrong', hint: 'Es wurde nichts eingegeben.' });
  }
  if (expectedList.length === 0) {
    return result({ verdict: 'wrong', hint: 'Für diese Vokabel ist keine Antwort hinterlegt.' });
  }

  const candidates = dedupe([input, ...splitUserAlternatives(userInput)]);

  // 1. Exakte bzw. tolerierte Übereinstimmung
  for (const answer of expectedList) {
    const forms = acceptedForms(answer);
    for (const candidate of candidates) {
      if (forms.includes(candidate)) {
        const exact = normalizeAnswer(answer) === candidate;
        return result({
          verdict: 'correct',
          matched: answer,
          ...(exact ? {} : { hint: `Genaue Schreibweise: ${answer}` }),
        });
      }
    }
  }

  // 2. Kleiner Tippfehler → „fast richtig“
  let best: { answer: string; distance: number } | undefined;
  for (const answer of expectedList) {
    for (const form of acceptedForms(answer)) {
      const tolerance = typoTolerance(form.length);
      if (tolerance === 0) continue;
      for (const candidate of candidates) {
        const distance = levenshtein(candidate, form, tolerance);
        if (distance <= tolerance && (best === undefined || distance < best.distance)) {
          best = { answer, distance };
        }
      }
    }
  }
  if (best) {
    return result({
      verdict: 'almost',
      matched: best.answer,
      hint: `Fast richtig – achte auf die Schreibweise: ${best.answer}`,
    });
  }

  return result({ verdict: 'wrong' });
}

/** Prüft eine Auswahlantwort (Multiple Choice, Wortbank). */
export function checkChoice(chosen: string, expected: readonly string[]): AnswerCheckResult {
  const normalizedChoice = normalizeAnswer(chosen);
  const hit = expected.find((value) => normalizeAnswer(value) === normalizedChoice);
  return {
    verdict: hit ? 'correct' : 'wrong',
    ...(hit ? { matched: hit } : {}),
    expected: [...expected],
  };
}

function splitUserAlternatives(value: string): string[] {
  if (!/[,;]/.test(value)) return [];
  return value
    .split(/[,;]/)
    .map((part) => normalizeAnswer(part))
    .filter((part) => part.length > 0);
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}
