import {
  PART_OF_SPEECH_LABELS,
  TASK_DIRECTION_LABELS,
  type LearningDirection,
  type PartOfSpeech,
  type TaskDirection,
  type VocabEntry,
} from './schema';
import { DIRECTION_CHOICE_LABELS, effectiveDirection, type DirectionChoice } from './practiceDirection';
import { freeTargets } from './freePractice';
import {
  MIN_SIBLING_GAP,
  arrangeTargets,
  mulberry32,
  shuffle,
  type Rng,
  type SessionTarget,
} from './exercises';
import { impliedAnswers } from './learningForm';
import { collapseWhitespace } from './wordMatch';

/**
 * Was eine Vokabel zeigt, wenn sie niemanden abfragt.
 *
 * Zwei Ansichten stellen dieselbe Frage: die Liste zum Durchsehen und der
 * Kartenmodus. Beide brauchen dieselbe Antwort – welche Seite vorn steht, was
 * hinten steht, was davon überhaupt vorhanden ist. Stünde das zweimal im
 * Oberflächencode, liefen die beiden Ansichten früher oder später auseinander.
 *
 * Deshalb liegt es hier: rein, ohne React, ohne IndexedDB, ohne Lernstand.
 * Diese Datei liest Einträge und gibt Anzeigemodelle zurück – mehr nicht. Sie
 * kennt weder Fächer noch Fälligkeiten noch Freischaltungen, weil beide
 * Ansichten davon ausdrücklich unabhängig sind.
 */

/** Eine Karte beziehungsweise ein Listeneintrag in genau einer Richtung. */
export interface StudyCard {
  /** Stabil und eindeutig, auch wenn dieselbe Vokabel in beiden Richtungen vorkommt. */
  id: string;
  entryId: string;
  direction: TaskDirection;
  /** Die Vorderseite. */
  prompt: string;
  /** Die gesuchte Antwort. */
  answer: string;
  /** Weitere gleichwertige Antworten, ohne Dubletten und ohne die Hauptantwort. */
  alternatives: string[];
  /** „Englisch → Deutsch (rezeptiv)“ – gehört sichtbar auf jede Karte. */
  directionLabel: string;
  partOfSpeech?: string;
  /** Erster Beispielsatz, sofern vorhanden. */
  example?: string;
  /** Deutsche Entsprechung des Beispielsatzes, sofern vorhanden. */
  exampleTranslation?: string;
  notes?: string;
}

/** Vergleichsform für Dublettenprüfung und Suche. */
function normalize(value: string): string {
  return collapseWhitespace(value).toLocaleLowerCase('de-DE');
}

/**
 * Entfernt Leerwerte und Dubletten, behält aber die Reihenfolge.
 *
 * „die Insel“ zweimal wäre keine zusätzliche Information, sondern ein
 * Abschreibfehler, den die Ansicht auch noch betont.
 */
function uniqueAnswers(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = collapseWhitespace(value);
    if (trimmed.length === 0) continue;
    const key = normalize(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/** Die Vorderseite einer Vokabel in der gewünschten Richtung. */
export function promptFor(entry: VocabEntry, direction: TaskDirection): string {
  return direction === 'en-de'
    ? collapseWhitespace(entry.english)
    : collapseWhitespace(entry.germanAnswers[0] ?? entry.english);
}

/**
 * Die Rückseite: Hauptantwort und gleichwertige Alternativen.
 *
 * Richtung Deutsch → Englisch fragt die Vokabel selbst ab; dann zählen die
 * zusätzlich akzeptierten englischen Schreibungen als Alternativen. Richtung
 * Englisch → Deutsch fragt die Bedeutung; dann sind es die weiteren deutschen
 * Übersetzungen.
 */
export function answersFor(
  entry: VocabEntry,
  direction: TaskDirection,
): { answer: string; alternatives: string[] } {
  const values =
    direction === 'en-de'
      ? uniqueAnswers(entry.germanAnswers)
      : uniqueAnswers([entry.english, ...entry.acceptedEnglishAnswers, ...impliedAnswers(entry)]);

  const [answer = collapseWhitespace(entry.english), ...alternatives] = values;
  return { answer, alternatives };
}

/**
 * Baut das Anzeigemodell einer Vokabel.
 *
 * Optionale Felder fehlen, wenn sie leer sind – sie werden nicht als leere
 * Zeichenkette gesetzt. So kann die Oberfläche einfach „vorhanden oder nicht“
 * fragen und erzeugt keine leeren Bereiche.
 */
export function buildStudyCard(entry: VocabEntry, direction: TaskDirection): StudyCard {
  const { answer, alternatives } = answersFor(entry, direction);
  const [example] = entry.exampleSentences;
  const exampleEnglish = collapseWhitespace(example?.english ?? '');
  const exampleGerman = collapseWhitespace(example?.german ?? '');
  const notes = collapseWhitespace(entry.notes ?? '');
  const partOfSpeech = entry.partOfSpeech
    ? PART_OF_SPEECH_LABELS[entry.partOfSpeech as PartOfSpeech]
    : '';

  return {
    id: `${entry.id}::${direction}`,
    entryId: entry.id,
    direction,
    prompt: promptFor(entry, direction),
    answer,
    alternatives,
    directionLabel: TASK_DIRECTION_LABELS[direction],
    ...(partOfSpeech ? { partOfSpeech } : {}),
    ...(exampleEnglish ? { example: exampleEnglish } : {}),
    ...(exampleGerman ? { exampleTranslation: exampleGerman } : {}),
    ...(notes ? { notes } : {}),
  };
}

/** Trägt die Karte irgendeine Zusatzinformation? Sonst bleibt der Bereich weg. */
export function hasExtras(card: StudyCard): boolean {
  return (
    card.alternatives.length > 0 ||
    card.partOfSpeech !== undefined ||
    card.example !== undefined ||
    card.notes !== undefined
  );
}

// ---------------------------------------------------------------------------
// Richtungen
// ---------------------------------------------------------------------------

/**
 * Die Richtungen, die eine **Liste** anbietet.
 *
 * „Gemischt“ ergäbe hier keinen Sinn: Eine Liste zum Durchsehen zeigt jede
 * Vokabel einmal, nicht zweimal in zwei Richtungen.
 */
export function browseDirectionsFor(packDirection: LearningDirection): TaskDirection[] {
  return packDirection === 'both' ? ['en-de', 'de-en'] : [packDirection];
}

/** Beschriftung der Auswahl – dieselbe Sprache wie im übrigen Lernbereich. */
export const BROWSE_DIRECTION_LABELS = DIRECTION_CHOICE_LABELS;

// ---------------------------------------------------------------------------
// Kartensatz
// ---------------------------------------------------------------------------

export interface CardSetOptions {
  packDirection: LearningDirection;
  choice: DirectionChoice;
  /** Bestimmt die Reihenfolge; derselbe Seed ergibt denselben Kartensatz. */
  seed: number;
}

/**
 * Setzt eine Karte an die späteste Stelle, an der der Abstand zu ihrer
 * Gegenrichtung noch gewahrt bleibt.
 *
 * `arrangeTargets` ist für Lernrunden gebaut: Was sich nicht regelkonform
 * platzieren lässt, verschiebt es auf die nächste Runde. Ein Kartensatz hat
 * aber keine nächste Runde – eine fehlende Karte wäre schlicht eine verlorene
 * Vokabel. Deshalb bekommt jede übrig gebliebene Karte hier noch einen Platz;
 * gesucht wird von hinten, damit die bereits geordnete Reihenfolge steht
 * bleibt. Nur wenn gar keine Stelle passt, gilt: lieber ein knapper Abstand
 * als eine fehlende Karte.
 */
function insertKeepingGap(
  ordered: SessionTarget[],
  target: SessionTarget,
  minGap: number,
): void {
  for (let index = ordered.length; index >= 0; index -= 1) {
    const neighbours = [
      ...ordered.slice(Math.max(0, index - minGap), index),
      ...ordered.slice(index, index + minGap),
    ];
    if (!neighbours.some((placed) => placed.entry.id === target.entry.id)) {
      ordered.splice(index, 0, target);
      return;
    }
  }
  ordered.push(target);
}

/**
 * Stellt den Kartensatz zusammen.
 *
 * Bewusst **keine zweite Mischlogik**: Ziele, Mischen und Abstandsregel kommen
 * aus denselben neutralen Bausteinen wie das freie Üben (`freeTargets`,
 * `shuffle`, `arrangeTargets`). Damit gilt hier automatisch dasselbe – jede
 * Vokabel in jeder aktiven Richtung genau einmal, und zwischen den beiden
 * Richtungen derselben Vokabel bleibt der gewohnte Abstand.
 *
 * `freeTargets` erwartet einen Lernstand-Index, benutzt ihn seit Sprint 3B.1
 * aber nicht mehr; hier wird eine leere Map übergeben. Gelesen wird nichts,
 * geschrieben erst recht nicht.
 */
export function buildCardSet(
  entries: readonly VocabEntry[],
  { packDirection, choice, seed }: CardSetOptions,
): StudyCard[] {
  const direction = effectiveDirection(packDirection, choice);
  const rng: Rng = mulberry32(seed);

  const available = shuffle(freeTargets(entries, new Map(), direction), rng);
  const ordered = arrangeTargets(available, available.length);

  // Was die Rundenlogik zurückgestellt hätte, bekommt hier noch seinen Platz.
  const placed = new Set(ordered);
  for (const target of available) {
    if (!placed.has(target)) insertKeepingGap(ordered, target, MIN_SIBLING_GAP);
  }

  return ordered.map((target) => buildStudyCard(target.entry, target.direction));
}

// ---------------------------------------------------------------------------
// Suche
// ---------------------------------------------------------------------------

/**
 * Lokale Suche über die Felder, die Lernende im Kopf haben.
 *
 * Bewusst schlicht: Teilzeichenkette, Groß-/Kleinschreibung egal, kein
 * unscharfer Abgleich und kein Modell. Wer „insel“ tippt, findet „die Insel“ –
 * mehr verspricht die Oberfläche auch nicht.
 */
export function matchesQuery(entry: VocabEntry, query: string): boolean {
  const needle = normalize(query);
  if (needle.length === 0) return true;

  const haystack = [
    entry.english,
    entry.lemma ?? '',
    ...entry.germanAnswers,
    ...entry.acceptedEnglishAnswers,
    ...entry.topicTags,
    entry.notes ?? '',
  ];
  return haystack.some((value) => normalize(value).includes(needle));
}

/** Filtert ein Paket nach der Suche; leere Suche liefert alles. */
export function filterEntries(
  entries: readonly VocabEntry[],
  query: string,
): VocabEntry[] {
  return entries.filter((entry) => matchesQuery(entry, query));
}
