import { sortCandidates, type TextCandidate } from '../domain/textExtraction';

/**
 * Wie viele Vokabelvorschläge die Lehrkraft aus einem Text haben möchte.
 *
 * Die Zahl wird **vor** der Analyse gewählt und gilt für die angezeigten
 * Kandidaten insgesamt – nicht nur für die KI-Empfehlungen. Sie ist eine
 * Obergrenze und kein Soll: Enthält der Text weniger geeignete Wörter, werden
 * keine erfunden. Die Anzeige sagt dann ehrlich, wie viele es geworden sind.
 *
 * Alles hier ist rein und deterministisch und kommt ohne jedes Modell aus.
 */

export const CANDIDATE_COUNT_OPTIONS = [5, 10, 15, 20, 30] as const;

export const MIN_CANDIDATE_COUNT = 1;
export const MAX_CANDIDATE_COUNT = 50;

/** Standard, wenn die Lehrkraft nichts anderes wählt. */
export const DEFAULT_CANDIDATE_COUNT = 20;

/** Hält eine frei eingegebene Zahl im erlaubten Bereich. */
export function clampCandidateCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CANDIDATE_COUNT;
  const rounded = Math.round(value);
  if (rounded < MIN_CANDIDATE_COUNT) return MIN_CANDIDATE_COUNT;
  if (rounded > MAX_CANDIDATE_COUNT) return MAX_CANDIDATE_COUNT;
  return rounded;
}

/**
 * Begrenzt die gefundenen Kandidaten auf die gewünschte Anzahl.
 *
 * Ausgewählt werden die häufigsten – bei Gleichstand entscheidet die
 * Reihenfolge im Text. Das ist deterministisch, braucht kein Modell und ist
 * nachvollziehbar: Was oft vorkommt, lohnt sich am ehesten.
 *
 * Die Begrenzung ist bewusst der **letzte** Schritt: Erst nachdem Wortformen
 * zusammengeführt, Abkürzungen aufgelöst und Textreste entfernt sind, darf
 * gekürzt werden. Sonst füllen `islands`, `sq` und `mi` die Liste und
 * verdrängen die Wörter, um die es geht. Ungeklärte Abkürzungen stehen in der
 * Rangfolge hinten und fallen deshalb zuerst heraus.
 *
 * Zurückgegeben wird in der **ursprünglichen Reihenfolge**; die Begrenzung
 * entscheidet nur, *welche* Kandidaten bleiben, nicht wie sie sortiert sind.
 */
export function limitCandidates(
  candidates: readonly TextCandidate[],
  limit: number,
): TextCandidate[] {
  const wanted = clampCandidateCount(limit);
  if (candidates.length <= wanted) return [...candidates];

  const keep = new Set(
    sortCandidates(candidates, 'frequency')
      .slice(0, wanted)
      .map((candidate) => candidate.id),
  );
  return candidates.filter((candidate) => keep.has(candidate.id));
}

/**
 * Der ehrliche Satz dazu. Bezugsgröße ist immer der Wunsch, nie der Fund –
 * „12 von 12“ wäre keine Antwort auf die Frage, die die Lehrkraft gestellt hat.
 */
export function describeCandidateCount(found: number, requested: number): string {
  const base = `${found} von ${requested} geeigneten Vokabeln gefunden.`;
  if (found >= requested) return base;
  return `${base} Der Text enthält nicht mehr geeignete Kandidaten – erfunden wird nichts.`;
}
