import { isUsableCandidate, sortCandidates, type TextCandidate } from '../domain/textExtraction';

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

  // Die gewünschte Zahl bezieht sich auf **geeignete** Vokabeln. Ungeklärte
  // Abkürzungen sind noch keine: Sie bleiben sichtbar, damit die Lehrkraft sie
  // vervollständigen kann, belegen aber keinen der gewünschten Plätze.
  const usable = candidates.filter(isUsableCandidate);
  const keep = new Set(
    sortCandidates(usable, 'frequency')
      .slice(0, wanted)
      .map((candidate) => candidate.id),
  );

  return candidates.filter(
    (candidate) => keep.has(candidate.id) || !isUsableCandidate(candidate),
  );
}

/** Aufteilung, die die Oberfläche für ihre ehrlichen Zahlen braucht. */
export interface CandidateCounts {
  /** Direkt verwendbare Vokabeln. */
  usable: number;
  /** Abkürzungen ohne Langform – sichtbar, aber noch keine Vokabel. */
  unresolved: number;
}

export function countCandidates(candidates: readonly TextCandidate[]): CandidateCounts {
  const usable = candidates.filter(isUsableCandidate).length;
  return { usable, unresolved: candidates.length - usable };
}

/**
 * Der ehrliche Satz dazu. Bezugsgröße ist immer der Wunsch, nie der Fund –
 * „12 von 12“ wäre keine Antwort auf die Frage, die die Lehrkraft gestellt hat.
 *
 * Ungeklärte Abkürzungen werden getrennt gezählt. Sie in dieselbe Zahl zu
 * schlagen hieße, eine offene Frage als erledigte Vokabel auszugeben – und
 * genau das soll die Anzeige nicht tun.
 */
export function describeCandidateCount(
  found: number,
  requested: number,
  unresolved = 0,
): string {
  const parts = [`${found} von ${requested} geeigneten Vokabeln gefunden`];
  if (unresolved > 0) {
    parts.push(
      unresolved === 1
        ? '1 Abkürzung muss geprüft werden'
        : `${unresolved} Abkürzungen müssen geprüft werden`,
    );
  }

  const base = `${parts.join(' · ')}.`;
  if (found >= requested) return base;
  return `${base} Der Text enthält nicht mehr geeignete Kandidaten – erfunden wird nichts.`;
}

/**
 * Der Bearbeitungsstand der Abkürzungen – getrennt vom Analyseergebnis.
 *
 * Die Fundzahl beschreibt, was der **Text** hergab; sie ändert sich durch
 * Bearbeiten, Auswählen oder Entfernen nicht. Aus „10 von 10 gefunden“ dürfen
 * nie „12 von 10“ werden. Was die Lehrkraft daraus gemacht hat, steht deshalb
 * in einem eigenen Satz.
 */
export function describeAbbreviationProgress(completed: number, open: number): string {
  const parts: string[] = [];
  if (completed > 0) {
    parts.push(
      completed === 1 ? '1 Abkürzung vervollständigt' : `${completed} Abkürzungen vervollständigt`,
    );
  }
  if (open > 0) {
    parts.push(
      open === 1 ? '1 Abkürzung weiterhin offen' : `${open} Abkürzungen weiterhin offen`,
    );
  }
  return parts.length === 0 ? '' : `${parts.join(' · ')}.`;
}
