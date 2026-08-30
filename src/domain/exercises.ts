import {
  activeDirections,
  type EntryProgress,
  type LearningDirection,
  type TaskDirection,
  type VocabEntry,
} from './schema';
import { directionKey } from './ids';
import { isDirectionUnlocked, PRODUCTIVE_UNLOCK_BOX } from './leitner';
import { normalizeAnswer } from './normalize';

export { isDirectionUnlocked, PRODUCTIVE_UNLOCK_BOX };

export type { TaskDirection };

export const EXERCISE_KINDS = [
  'flashcard',
  'multiple-choice',
  'open-translation',
  'cloze-bank',
  'cloze-free',
] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

export const EXERCISE_LABELS: Readonly<Record<ExerciseKind, string>> = {
  flashcard: 'Karteikarte',
  'multiple-choice': 'Multiple Choice',
  'open-translation': 'Offene Übersetzung',
  'cloze-bank': 'Lückensatz mit Wortbank',
  'cloze-free': 'Lückensatz ohne Wortbank',
};

/** Lückensätze verlangen die Zielsprache Englisch und zählen daher produktiv. */
export const PRODUCTIVE_ONLY_KINDS: readonly ExerciseKind[] = ['cloze-bank', 'cloze-free'];

interface TaskBase {
  id: string;
  entryId: string;
  direction: TaskDirection;
  /** Was der lernenden Person gezeigt wird. */
  prompt: string;
  /** Alle als richtig gewerteten Antworten (Originalschreibweise). */
  expected: string[];
  entry: VocabEntry;
}

export interface FlashcardTask extends TaskBase {
  kind: 'flashcard';
}
export interface MultipleChoiceTask extends TaskBase {
  kind: 'multiple-choice';
  options: string[];
}
export interface OpenTranslationTask extends TaskBase {
  kind: 'open-translation';
}
export interface ClozeTask extends TaskBase {
  kind: 'cloze-bank' | 'cloze-free';
  /** Satzteil vor und nach der Lücke. */
  before: string;
  after: string;
  /** Deutsche Entsprechung des Satzes, falls hinterlegt. */
  translation?: string;
  /** Nur bei `cloze-bank`. */
  bank?: string[];
}

export type ExerciseTask = FlashcardTask | MultipleChoiceTask | OpenTranslationTask | ClozeTask;

export type Rng = () => number;

/** Deterministischer PRNG – für Tests und reproduzierbare Sitzungen. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = copy[i] as T;
    const b = copy[j] as T;
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Lückensatz
// ---------------------------------------------------------------------------

export interface ClozeSource {
  before: string;
  after: string;
  solution: string;
  translation?: string;
}

/**
 * Sucht in den Beispielsätzen einen Satz, der die Vokabel als eigenes Wort
 * enthält, und ersetzt sie durch eine Lücke. Gibt `undefined` zurück, wenn kein
 * geeigneter Satz vorliegt – dann ist für diesen Eintrag kein Lückensatz möglich.
 */
export function buildCloze(entry: VocabEntry): ClozeSource | undefined {
  const target = entry.english.trim();
  if (!target) return undefined;

  for (const sentence of entry.exampleSentences) {
    const match = findWord(sentence.english, target);
    if (!match) continue;
    return {
      before: sentence.english.slice(0, match.start),
      after: sentence.english.slice(match.end),
      solution: sentence.english.slice(match.start, match.end),
      ...(sentence.german ? { translation: sentence.german } : {}),
    };
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findWord(haystack: string, needle: string): { start: number; end: number } | undefined {
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}'-])(${escapeRegExp(needle)})(?![\\p{L}\\p{N}])`, 'iu');
  const match = pattern.exec(haystack);
  if (!match) return undefined;
  const start = match.index + (match[1]?.length ?? 0);
  return { start, end: start + (match[2]?.length ?? 0) };
}

// ---------------------------------------------------------------------------
// Ablenker
// ---------------------------------------------------------------------------

function promptOf(entry: VocabEntry, direction: TaskDirection): string {
  return direction === 'en-de' ? entry.english : (entry.germanAnswers[0] ?? entry.english);
}

function solutionsOf(entry: VocabEntry, direction: TaskDirection): string[] {
  return direction === 'en-de'
    ? [...entry.germanAnswers]
    : [entry.english, ...entry.acceptedEnglishAnswers];
}

/** Ablenker aus demselben Paket, bevorzugt mit gleicher Wortart. */
export function pickDistractors(
  entry: VocabEntry,
  pool: readonly VocabEntry[],
  direction: TaskDirection,
  count: number,
  rng: Rng,
): string[] {
  const taken = new Set(solutionsOf(entry, direction).map(normalizeAnswer));
  const candidates = pool.filter((other) => other.id !== entry.id);

  const sameKind = candidates.filter(
    (other) => entry.partOfSpeech !== undefined && other.partOfSpeech === entry.partOfSpeech,
  );
  const ordered = [...shuffle(sameKind, rng), ...shuffle(candidates, rng)];

  const result: string[] = [];
  for (const candidate of ordered) {
    const option = direction === 'en-de' ? candidate.germanAnswers[0] : candidate.english;
    if (!option) continue;
    const key = normalizeAnswer(option);
    if (taken.has(key)) continue;
    taken.add(key);
    result.push(option);
    if (result.length >= count) break;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Aufgabenbau
// ---------------------------------------------------------------------------

export const MC_OPTION_COUNT = 4;

/**
 * Welche Übungsformen sind für diesen Eintrag in dieser Richtung möglich?
 * Lückensätze setzen die produktive Richtung **und** einen passenden
 * Beispielsatz voraus.
 */
export function availableKinds(
  entry: VocabEntry,
  pool: readonly VocabEntry[],
  direction: TaskDirection,
): ExerciseKind[] {
  const kinds: ExerciseKind[] = ['flashcard', 'open-translation'];
  if (pool.length >= 3) kinds.push('multiple-choice');
  if (direction === 'de-en' && buildCloze(entry)) {
    kinds.push('cloze-free');
    if (pool.length >= 3) kinds.push('cloze-bank');
  }
  return kinds;
}

/** Alle Übungsformen, die in einem Paket überhaupt vorkommen können. */
export function kindsAvailableInPack(
  entries: readonly VocabEntry[],
  direction: LearningDirection,
): Set<ExerciseKind> {
  const kinds = new Set<ExerciseKind>();
  for (const entry of entries) {
    for (const taskDirection of activeDirections(direction)) {
      for (const kind of availableKinds(entry, entries, taskDirection)) kinds.add(kind);
    }
  }
  return kinds;
}

export function buildTask(
  entry: VocabEntry,
  kind: ExerciseKind,
  direction: TaskDirection,
  pool: readonly VocabEntry[],
  rng: Rng,
  idSuffix = '',
): ExerciseTask | undefined {
  if (PRODUCTIVE_ONLY_KINDS.includes(kind) && direction !== 'de-en') return undefined;

  const id = `${entry.id}#${kind}#${direction}${idSuffix}`;
  const base = {
    id,
    entryId: entry.id,
    direction,
    prompt: promptOf(entry, direction),
    expected: solutionsOf(entry, direction),
    entry,
  } satisfies TaskBase;

  switch (kind) {
    case 'flashcard':
      return { ...base, kind };
    case 'open-translation':
      return { ...base, kind };
    case 'multiple-choice': {
      const distractors = pickDistractors(entry, pool, direction, MC_OPTION_COUNT - 1, rng);
      if (distractors.length < 1) return undefined;
      const correct = base.expected[0];
      if (!correct) return undefined;
      return { ...base, kind, options: shuffle([correct, ...distractors], rng) };
    }
    case 'cloze-bank':
    case 'cloze-free': {
      const cloze = buildCloze(entry);
      if (!cloze) return undefined;
      const clozeBase = {
        ...base,
        kind,
        prompt: cloze.before,
        expected: [cloze.solution, ...entry.acceptedEnglishAnswers],
        before: cloze.before,
        after: cloze.after,
        ...(cloze.translation ? { translation: cloze.translation } : {}),
      };
      if (kind === 'cloze-free') return clozeBase;
      const bank = pickDistractors(entry, pool, 'de-en', 3, rng);
      if (bank.length < 1) return undefined;
      return { ...clozeBase, bank: shuffle([cloze.solution, ...bank], rng) };
    }
  }
}

// ---------------------------------------------------------------------------
// Sitzungsplanung
// ---------------------------------------------------------------------------

/**
 * Mindestzahl anderer Aufgaben zwischen den beiden Richtungen derselben
 * Vokabel. „crowded → überfüllt“ direkt gefolgt von „überfüllt → crowded“ wäre
 * keine Abfrage, sondern ein Erinnerungshinweis.
 */
export const MIN_SIBLING_GAP = 3;

export interface SessionOptions {
  direction: LearningDirection;
  /** Leeres Array = automatische Auswahl passend zum Leitner-Fach. */
  kinds: ExerciseKind[];
  length: number;
  now?: Date;
  rng?: Rng;
}

/** Eine zu übende Kombination aus Vokabel und Abfragerichtung. */
export interface SessionTarget {
  entry: VocabEntry;
  direction: TaskDirection;
}

type TargetState = 'due' | 'fresh' | 'later';

function stateOf(
  target: SessionTarget,
  progressIndex: ReadonlyMap<string, EntryProgress>,
  now: Date,
): { state: TargetState; progress?: EntryProgress } {
  const progress = progressIndex.get(directionKey(target.entry.id, target.direction));
  if (!progress) return { state: 'fresh' };
  return {
    state: new Date(progress.dueAt).getTime() <= now.getTime() ? 'due' : 'later',
    progress,
  };
}

/**
 * Alle freigeschalteten Kombinationen, die jetzt an der Reihe wären – also
 * fällige und noch nie geübte. Genau diese Menge zählt die Oberfläche als
 * „bereit“, damit Anzeige und Sitzungsplanung nie auseinanderlaufen.
 */
export function eligibleTargets(
  entries: readonly VocabEntry[],
  progressIndex: ReadonlyMap<string, EntryProgress>,
  packDirection: LearningDirection,
  now: Date = new Date(),
): SessionTarget[] {
  const result: SessionTarget[] = [];
  for (const entry of entries) {
    for (const direction of activeDirections(packDirection)) {
      if (!isDirectionUnlocked(entry.id, progressIndex, direction, packDirection)) continue;
      const { state } = stateOf({ entry, direction }, progressIndex, now);
      if (state !== 'later') result.push({ entry, direction });
    }
  }
  return result;
}

/** Anzahl der jetzt bereiten Aufgaben, optional auf eine Richtung beschränkt. */
export function countReady(
  entries: readonly VocabEntry[],
  progressIndex: ReadonlyMap<string, EntryProgress>,
  packDirection: LearningDirection,
  now: Date = new Date(),
  only?: TaskDirection,
): number {
  return eligibleTargets(entries, progressIndex, packDirection, now).filter(
    (target) => only === undefined || target.direction === only,
  ).length;
}

/**
 * Ordnet Kandidaten so an, dass die Gegenrichtungen derselben Vokabel nie
 * dichter als `minGap` andere Aufgaben beieinander liegen. Kandidaten, die sich
 * innerhalb der Rundenlänge nicht regelkonform platzieren lassen, entfallen –
 * sie kommen in einer der nächsten Runden dran.
 */
export function arrangeTargets(
  candidates: readonly SessionTarget[],
  length: number,
  minGap = MIN_SIBLING_GAP,
): SessionTarget[] {
  const result: SessionTarget[] = [];
  const pool = [...candidates];

  while (result.length < length && pool.length > 0) {
    const recent = result.slice(-minGap);
    const index = pool.findIndex(
      (candidate) => !recent.some((placed) => placed.entry.id === candidate.entry.id),
    );
    if (index < 0) break; // Nur noch Geschwister übrig – auf die nächste Runde verschieben.
    result.push(pool[index] as SessionTarget);
    pool.splice(index, 1);
  }

  return result;
}

/**
 * Reihenfolge: fällige Kombinationen zuerst (niedrigstes Fach zuerst), danach
 * noch nie geübte, danach die übrigen. Innerhalb gleichwertiger Gruppen wird
 * gemischt, damit nicht dauerhaft die Importreihenfolge geübt wird; mit festem
 * Seed bleibt das reproduzierbar.
 */
export function selectTargets(
  entries: readonly VocabEntry[],
  progressIndex: ReadonlyMap<string, EntryProgress>,
  packDirection: LearningDirection,
  length: number,
  now: Date = new Date(),
  rng: Rng = Math.random,
): SessionTarget[] {
  const dueByBox = new Map<number, SessionTarget[]>();
  const fresh: SessionTarget[] = [];
  const later: SessionTarget[] = [];

  for (const entry of entries) {
    for (const direction of activeDirections(packDirection)) {
      if (!isDirectionUnlocked(entry.id, progressIndex, direction, packDirection)) continue;
      const target: SessionTarget = { entry, direction };
      const { state, progress } = stateOf(target, progressIndex, now);
      if (state === 'fresh') {
        fresh.push(target);
      } else if (state === 'due') {
        const box = progress?.box ?? 1;
        const bucket = dueByBox.get(box) ?? [];
        bucket.push(target);
        dueByBox.set(box, bucket);
      } else {
        later.push(target);
      }
    }
  }

  const due = [...dueByBox.keys()]
    .sort((a, b) => a - b)
    .flatMap((box) => shuffle(dueByBox.get(box) ?? [], rng));

  const candidates = [...due, ...shuffle(fresh, rng), ...shuffle(later, rng)];
  return arrangeTargets(candidates, Math.max(0, length));
}

function autoKindsFor(box: number, direction: TaskDirection): ExerciseKind[] {
  if (direction === 'en-de') {
    if (box <= 1) return ['flashcard', 'multiple-choice'];
    if (box <= 3) return ['multiple-choice', 'open-translation'];
    return ['open-translation'];
  }
  if (box <= 1) return ['flashcard', 'multiple-choice'];
  if (box === 2) return ['multiple-choice', 'cloze-bank'];
  if (box === 3) return ['cloze-bank', 'open-translation'];
  return ['open-translation', 'cloze-free'];
}

/** Baut eine vollständige Übungsreihe für ein Paket. */
export function buildSession(
  entries: readonly VocabEntry[],
  progressIndex: ReadonlyMap<string, EntryProgress>,
  options: SessionOptions,
): ExerciseTask[] {
  const now = options.now ?? new Date();
  const rng = options.rng ?? Math.random;
  const selected = selectTargets(
    entries,
    progressIndex,
    options.direction,
    options.length,
    now,
    rng,
  );

  const tasks: ExerciseTask[] = [];
  selected.forEach(({ entry, direction }, index) => {
    const possible = availableKinds(entry, entries, direction);
    const box = progressIndex.get(directionKey(entry.id, direction))?.box ?? 1;
    const wanted = options.kinds.length > 0 ? options.kinds : autoKindsFor(box, direction);

    const ranked = [
      ...wanted.filter((kind) => possible.includes(kind)),
      ...possible.filter((kind) => !wanted.includes(kind)),
    ];

    for (const kind of ranked) {
      const task = buildTask(entry, kind, direction, entries, rng, `#${index}`);
      if (task) {
        tasks.push(task);
        return;
      }
    }
  });

  return tasks;
}
