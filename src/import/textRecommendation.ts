import { collapseWhitespace } from '../domain/wordMatch';
import { sortCandidates, type TextCandidate } from '../domain/textExtraction';
import {
  MAX_CONTEXT_CANDIDATES,
  MAX_RECOMMENDATIONS,
  type AiTextCandidate,
  type AiTextRecommendation,
} from '../ai/AiProvider';

/**
 * Empfehlungen innerhalb der lokal gefundenen Textkandidaten.
 *
 * Zwei Zusagen prägen diese Datei:
 *
 * 1. **Der Text bleibt hier.** An das Modell geht nie der eingefügte Rohtext,
 *    sondern eine kurze Liste: neutraler Schlüssel, Wort, Häufigkeit und genau
 *    ein Originalsatz. Keine IDs, keine Übersetzungen anderer Vokabeln, keine
 *    Lernstände, keine Namen.
 * 2. **Das Modell erfindet nichts.** Es antwortet ausschließlich mit
 *    Schlüsseln, die es selbst bekommen hat. Alles andere wird hier verworfen –
 *    aus einer Halluzination wird so keine Vokabel.
 *
 * Alles ist rein und deterministisch: dieselben Kandidaten ergeben dieselben
 * Schlüssel, unabhängig von Sortierung oder Laufzeit.
 */

/** Die Verbindung zwischen neutralem Schlüssel und echtem Kandidaten. */
export interface CandidateContext {
  /** Was an das Modell geht – höchstens `MAX_CONTEXT_CANDIDATES` Einträge. */
  payload: AiTextCandidate[];
  /** Schlüssel → Kandidaten-ID. Bleibt vollständig hier in der Anwendung. */
  keyToId: Map<string, string>;
  /** Wie viele Kandidaten es insgesamt gab – für eine ehrliche Anzeige. */
  total: number;
}

/**
 * Baut den Modellkontext.
 *
 * Die Auswahl ist deterministisch: nach Häufigkeit (und bei Gleichstand nach
 * der Reihenfolge im Text) absteigend, dann die ersten `limit`. Die Schlüssel
 * werden **nach** dieser Auswahl vergeben und laufen lückenlos von `c1` an,
 * damit sie nichts über die interne Ordnung verraten.
 */
export function buildCandidateContext(
  candidates: readonly TextCandidate[],
  limit: number = MAX_CONTEXT_CANDIDATES,
): CandidateContext {
  const chosen = sortCandidates(candidates, 'frequency').slice(0, Math.max(0, limit));

  const payload: AiTextCandidate[] = [];
  const keyToId = new Map<string, string>();

  chosen.forEach((candidate, index) => {
    const key = `c${index + 1}`;
    keyToId.set(key, candidate.id);
    payload.push({
      key,
      english: collapseWhitespace(candidate.english),
      occurrences: candidate.occurrences,
      // Genau ein Satz – nicht der Absatz, nicht der Text.
      sourceSentence: collapseWhitespace(candidate.sourceSentence),
    });
  });

  return { payload, keyToId, total: candidates.length };
}

export interface RecommendationResult {
  /** Kandidaten-IDs in der Reihenfolge der Empfehlung, stärkste zuerst. */
  ids: string[];
  /** Wie viele Schlüssel das Modell genannt hat. */
  received: number;
  /** Wie viele davon unbekannt oder doppelt waren. */
  discarded: number;
}

/**
 * Übersetzt die Modellantwort zurück in Kandidaten-IDs.
 *
 * Unbekannte Schlüssel, Dubletten und alles jenseits der gewünschten Anzahl
 * fallen hier heraus. Ein Wort, das nicht im Text stand, kann so nicht in die
 * Auswahl geraten.
 */
export function resolveRecommendations(
  recommendations: readonly AiTextRecommendation[],
  context: CandidateContext,
  maxItems: number = MAX_RECOMMENDATIONS,
): RecommendationResult {
  const limit = Math.max(0, Math.min(maxItems, MAX_RECOMMENDATIONS));
  const seen = new Set<string>();
  const ids: string[] = [];
  let discarded = 0;

  for (const recommendation of recommendations) {
    const id = context.keyToId.get(recommendation.key);
    if (!id || seen.has(id)) {
      discarded += 1;
      continue;
    }
    seen.add(id);
    if (ids.length < limit) ids.push(id);
  }

  return { ids, received: recommendations.length, discarded };
}

/**
 * **Außer Dienst seit Sprint 4B.1**, zusammen mit `TextRecommendationPanel`.
 * Der Empfehlungsschritt zeigt nur noch die Empfehlungen selbst; eine Liste,
 * in der Empfohlenes nach vorn sortiert wird, gibt es dort nicht mehr. Die
 * Funktion bleibt geprüft stehen, weil sie richtig ist und klein.
 *
 * Sortiert Empfehlungen nach vorn, ohne die übrigen zu verlieren.
 *
 * Innerhalb der Empfehlungen gilt die Reihenfolge des Modells, danach folgt der
 * Rest in der bisherigen Ordnung. Entfernte Kandidaten kommen dadurch nicht
 * zurück – sortiert wird nur, was noch da ist.
 */
export function orderByRecommendation<T extends { id: string }>(
  items: readonly T[],
  recommendedIds: readonly string[],
): T[] {
  const rank = new Map(recommendedIds.map((id, index) => [id, index]));
  const recommended: T[] = [];
  const rest: T[] = [];

  for (const item of items) {
    if (rank.has(item.id)) recommended.push(item);
    else rest.push(item);
  }

  recommended.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...recommended, ...rest];
}

/** Ehrlicher Satz über das, was gerade passiert ist. */
export function describeRecommendations(
  result: RecommendationResult,
  context: CandidateContext,
): string {
  if (result.ids.length === 0) {
    return 'Das Sprachmodell hat keine verwertbare Empfehlung geliefert.';
  }

  const base = `${result.ids.length} von ${context.payload.length} geprüften Kandidaten empfohlen.`;
  const beyond = context.total - context.payload.length;
  return beyond > 0
    ? `${base} ${beyond} weitere Kandidaten wurden dem Sprachmodell nicht vorgelegt und bleiben von Hand auswählbar.`
    : base;
}
