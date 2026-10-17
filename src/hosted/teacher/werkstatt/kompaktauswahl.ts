import type { TextCandidate } from '../../../domain/textExtraction';
import type { Kandidatenzeile } from './textzustand';

/*
  Eine kleine, netz- und woerterbuchfreie Vorauswahl fuer das Portal.

  Sie ersetzt keine sprachliche Pruefung. Sie verhindert nur zwei sehr
  sichtbare Fehler der reinen Textreihenfolge: Grundwortschatz verdraengt
  den eigentlichen Textwortschatz, und `capital`, `city` und `capital city`
  belegen drei Plaetze fuer praktisch dieselbe Entscheidung.
*/

const GRUNDWORTSCHATZ = new Set([
  'art', 'city', 'five', 'four', 'home', 'just', 'large', 'live', 'million', 'part',
  'people', 'still', 'three', 'today', 'work', 'year', 'years',
]);

const FACHLICHE_ENDUNGEN = [
  'tion', 'sion', 'ment', 'ance', 'ence', 'ity', 'ism', 'ship', 'ness', 'ure',
] as const;

function teile(kandidat: TextCandidate): string[] {
  return kandidat.normalizedEnglish.match(/[a-z]+/g) ?? [];
}

function wert(kandidat: TextCandidate): number {
  const woerter = teile(kandidat);
  const laengstes = Math.max(0, ...woerter.map((wort) => wort.length));
  const fachlich = woerter.some((wort) => FACHLICHE_ENDUNGEN.some((ende) => wort.endsWith(ende)));
  const nurGrundwortschatz = woerter.length > 0 && woerter.every((wort) => GRUNDWORTSCHATZ.has(wort));

  return (
    kandidat.occurrences * 2 +
    Math.min(laengstes / 5, 2) +
    (fachlich ? 2 : 0) -
    (woerter.length > 1 ? 1.5 : 0) -
    (nurGrundwortschatz ? 8 : 0)
  );
}

/**
 * Höchstens `anzahl` übersichtliche Vorschläge, ohne doppelt beanspruchte
 * Wortfamilien. Die übrigen Treffer bleiben über „Alle zeigen“ erreichbar.
 */
export function kompakteVorschlaege(
  zeilen: readonly Kandidatenzeile[],
  anzahl = 15,
): readonly Kandidatenzeile[] {
  const sortiert = [...zeilen].sort(
    (links, rechts) =>
      wert(rechts.kandidat) - wert(links.kandidat) ||
      links.kandidat.firstOccurrence - rechts.kandidat.firstOccurrence,
  );
  const beansprucht = new Set<string>();
  const ergebnis: Kandidatenzeile[] = [];

  for (const zeile of sortiert) {
    const woerter = teile(zeile.kandidat);
    if (woerter.some((wort) => beansprucht.has(wort))) continue;
    ergebnis.push(zeile);
    for (const wort of woerter) beansprucht.add(wort);
    if (ergebnis.length >= anzahl) break;
  }
  return ergebnis;
}
