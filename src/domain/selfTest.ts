import {
  EXERCISE_KINDS,
  GROUP_OF_KIND,
  KIND_GROUPS,
  arrangeTargets,
  availableKinds,
  buildTask,
  mulberry32,
  shuffle,
  type ExerciseKind,
  type ExerciseTask,
  type KindGroup,
  type Rng,
  type SessionTarget,
} from './exercises';
import { freeTargets } from './freePractice';
import { effectiveDirection, type DirectionChoice } from './practiceDirection';
import { checkAnswer, checkChoice, type AnswerVerdict } from './answerCheck';
import type { LearningDirection, VocabEntry } from './schema';

/**
 * Der Selbsttest: sich selbst prüfen, ohne geprüft zu werden.
 *
 * Fachlich ist er das genaue Gegenteil einer Klassenarbeit. Er vergibt keine
 * Note, kennt kein „bestanden“, wird von niemandem eingesehen und **verändert
 * keinen Lernstand**. Was er liefert, ist eine ehrliche Zwischenbilanz für die
 * lernende Person selbst – und die Möglichkeit, gezielt das zu wiederholen,
 * was noch nicht saß.
 *
 * Diese Datei ist rein: keine Zufallsquelle ohne Seed, kein React, kein
 * IndexedDB. Sie baut auf den vorhandenen Bausteinen auf und erfindet weder
 * eine zweite Aufgabenerzeugung (`buildTask`) noch eine zweite Antwortprüfung
 * (`checkAnswer`, `checkChoice`).
 */

// ---------------------------------------------------------------------------
// Aufgabenarten, fachlich gruppiert
// ---------------------------------------------------------------------------

/*
  Die Einteilung selbst steht seit Sprint 3B.2b1 in `exercises.ts`, weil auch
  die Einrichtung des freien Übens sie braucht. Der Selbsttest reicht sie
  weiter, damit seine Oberfläche eine Anlaufstelle behält.
*/
export { GROUP_OF_KIND, KIND_GROUPS, KIND_GROUP_HINTS, KIND_GROUP_LABELS } from './exercises';
export type { KindGroup } from './exercises';

/**
 * Die Übungsformen einer Gruppe, geordnet nach fachlichem Anspruch.
 *
 * Die Karteikarte fehlt bewusst: Sie fragt nichts ab, sondern zeigt die
 * Lösung – in einem Selbsttest wäre sie keine Aufgabe. Wer nur ansehen will,
 * nimmt den Kartenmodus.
 */
const KINDS_IN_GROUP: Readonly<Record<KindGroup, readonly ExerciseKind[]>> = {
  open: ['open-translation'],
  'semi-open': ['cloze-free', 'cloze-bank'],
  closed: ['multiple-choice'],
};

/** Alle Übungsformen, die zu den gewählten Gruppen gehören. */
export function kindsForGroups(groups: readonly KindGroup[]): ExerciseKind[] {
  return EXERCISE_KINDS.filter(
    (kind) => groups.includes(GROUP_OF_KIND[kind]) && KINDS_IN_GROUP[GROUP_OF_KIND[kind]].includes(kind),
  );
}

/**
 * Welche Gruppen dieses Paket in dieser Richtung überhaupt hergibt.
 *
 * Ein Lückensatz braucht die produktive Richtung **und** einen Beispielsatz,
 * der das Stichwort enthält; Multiple Choice braucht genug Ablenker. Was es
 * nicht gibt, wird gar nicht erst angeboten – eine Auswahl, die anschließend
 * leer ausgeht, wäre ein Versprechen ohne Deckung.
 */
export function availableGroups(
  entries: readonly VocabEntry[],
  packDirection: LearningDirection,
  choice: DirectionChoice,
): KindGroup[] {
  const direction = effectiveDirection(packDirection, choice);
  const found = new Set<KindGroup>();

  for (const target of freeTargets(entries, new Map(), direction)) {
    for (const kind of availableKinds(target.entry, entries, target.direction)) {
      const group = GROUP_OF_KIND[kind];
      if (KINDS_IN_GROUP[group].includes(kind)) found.add(group);
    }
  }

  return KIND_GROUPS.filter((group) => found.has(group));
}

// ---------------------------------------------------------------------------
// Planung
// ---------------------------------------------------------------------------

/** Die Stufen, die die Oberfläche anbietet. */
export const SELF_TEST_COUNTS = [5, 10, 15, 20] as const;
/** „Alle verfügbaren“ – die Obergrenze ist dann das Paket selbst. */
export const ALL_AVAILABLE = 'all';
/**
 * Die Planung nimmt jede positive Zahl entgegen; die Auswahl in der Oberfläche
 * ist nur eine bequeme Teilmenge davon.
 */
export type SelfTestCount = number | typeof ALL_AVAILABLE;

export interface SelfTestOptions {
  packDirection: LearningDirection;
  choice: DirectionChoice;
  /** Mindestens eine Gruppe; leer bedeutet „alle möglichen“. */
  groups: readonly KindGroup[];
  count: SelfTestCount;
  seed: number;
}

export interface SelfTestPlan {
  tasks: ExerciseTask[];
  /** Immer `tasks.length` – die Zahl, die die Oberfläche zeigen darf. */
  plannedCount: number;
  /** Wie viele Aufgaben die Auswahl überhaupt hergibt. */
  availableCount: number;
  /** Was gewünscht war; bei „alle“ gleich `availableCount`. */
  requested: number;
}

/** Eine Aufgabe je Ziel – die anspruchsvollste, die möglich ist. */
function kindForTarget(
  target: SessionTarget,
  entries: readonly VocabEntry[],
  wanted: readonly ExerciseKind[],
  rng: Rng,
): ExerciseKind | undefined {
  const possible = availableKinds(target.entry, entries, target.direction).filter((kind) =>
    wanted.includes(kind),
  );
  if (possible.length === 0) return undefined;
  // Deterministisch, aber nicht immer dieselbe Form: der Seed entscheidet.
  return shuffle(possible, rng)[0];
}

/**
 * Stellt den Selbsttest zusammen.
 *
 * Bewusst **ohne** jeden Bezug auf den Lernstand: keine Fälligkeit, kein Fach,
 * keine Freischaltung. Geübt werden darf immer alles. Die Ziele und ihre
 * Reihenfolge kommen aus denselben neutralen Bausteinen wie das freie Üben und
 * der Kartenmodus, damit es keine dritte Mischlogik gibt.
 *
 * Die gewünschte Anzahl ist eine **Obergrenze**. Gibt die Auswahl weniger her,
 * werden keine Aufgaben erfunden – `plannedCount` sagt dann ehrlich, wie viele
 * es geworden sind.
 */
export function planSelfTest(
  entries: readonly VocabEntry[],
  { packDirection, choice, groups, count, seed }: SelfTestOptions,
): SelfTestPlan {
  const direction = effectiveDirection(packDirection, choice);
  const rng = mulberry32(seed);
  const wanted = kindsForGroups(
    groups.length > 0 ? groups : availableGroups(entries, packDirection, choice),
  );

  // Alle Ziele, die mit dieser Auswahl überhaupt eine Aufgabe ergeben.
  const possible = shuffle(freeTargets(entries, new Map(), direction), rng).filter(
    (target) => kindForTarget(target, entries, wanted, mulberry32(seed)) !== undefined,
  );

  const limit = count === ALL_AVAILABLE ? possible.length : count;
  const ordered = arrangeTargets(possible, Math.min(limit, possible.length));

  const tasks: ExerciseTask[] = [];
  for (const target of ordered) {
    const kind = kindForTarget(target, entries, wanted, rng);
    if (!kind) continue;
    const task = buildTask(target.entry, kind, target.direction, entries, rng);
    // Kein Duplikat: dieselbe Vokabel in derselben Richtung kommt nur einmal.
    if (task && !tasks.some((existing) => existing.id === task.id)) tasks.push(task);
  }

  return {
    tasks,
    plannedCount: tasks.length,
    availableCount: possible.length,
    requested: count === ALL_AVAILABLE ? possible.length : count,
  };
}

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

/** Eine abgegebene Antwort – so, wie sie eingetippt oder angeklickt wurde. */
export interface SelfTestAnswer {
  taskId: string;
  given: string;
  verdict: AnswerVerdict;
}

export interface SelfTestMistake {
  task: ExerciseTask;
  given: string;
  verdict: Exclude<AnswerVerdict, 'correct'>;
  /** Alle Antworten, die gezählt hätten. */
  expected: string[];
}

export interface SelfTestResult {
  total: number;
  correct: number;
  almost: number;
  wrong: number;
  /** Ganzzahliger Anteil richtiger Antworten; ergänzend, nie als Note. */
  percent: number;
  mistakes: SelfTestMistake[];
}

/**
 * Prüft eine Antwort – über die **vorhandene** zentrale Prüfung.
 *
 * Multiple Choice vergleicht exakt (man hat angeklickt, was dasteht), freie
 * Eingaben laufen durch `checkAnswer` mit Normalisierung, Alternativen und der
 * Kategorie „fast richtig“.
 */
export function checkTaskAnswer(task: ExerciseTask, given: string): AnswerVerdict {
  return task.kind === 'multiple-choice'
    ? checkChoice(given, task.expected).verdict
    : checkAnswer(given, task.expected).verdict;
}

/**
 * Rechnet den Test aus.
 *
 * Unbeantwortete Aufgaben zählen als „noch nicht richtig“ – alles andere wäre
 * geschönt. „Fast richtig“ bleibt eine eigene Kategorie: Ein Tippfehler ist
 * etwas anderes als eine falsche Bedeutung, und das soll man sehen.
 */
export function gradeSelfTest(
  tasks: readonly ExerciseTask[],
  answers: readonly SelfTestAnswer[],
): SelfTestResult {
  const byId = new Map(answers.map((answer) => [answer.taskId, answer]));
  const mistakes: SelfTestMistake[] = [];
  let correct = 0;
  let almost = 0;

  for (const task of tasks) {
    const answer = byId.get(task.id);
    const verdict: AnswerVerdict = answer?.verdict ?? 'wrong';

    if (verdict === 'correct') {
      correct += 1;
      continue;
    }
    if (verdict === 'almost') almost += 1;

    mistakes.push({
      task,
      given: answer?.given ?? '',
      verdict,
      expected: [...task.expected],
    });
  }

  const total = tasks.length;
  return {
    total,
    correct,
    almost,
    wrong: total - correct - almost,
    percent: total === 0 ? 0 : Math.round((correct / total) * 100),
    mistakes,
  };
}

/** „7 von 10 richtig“ – schlicht, ohne Note und ohne Ampel. */
export function describeResult(result: SelfTestResult): string {
  return `${result.correct} von ${result.total} richtig`;
}

// ---------------------------------------------------------------------------
// Fehler wiederholen
// ---------------------------------------------------------------------------

/**
 * Baut aus den Fehlern eine neue, **endliche** Runde.
 *
 * Die Richtung bleibt die des ursprünglichen Fehlers – wer Deutsch → Englisch
 * nicht konnte, soll genau das noch einmal versuchen. Die Aufgabenart darf sich
 * ändern, wenn das Paket eine andere hergibt: Wer eine Multiple-Choice-Aufgabe
 * verfehlt hat, lernt mehr, wenn er die Antwort beim zweiten Mal selbst
 * schreibt.
 *
 * Es gibt bewusst keine Schleife „bis alles richtig ist“. Jeder Durchgang endet,
 * und ob es einen weiteren gibt, entscheidet die lernende Person.
 */
export function planMistakeRound(
  mistakes: readonly SelfTestMistake[],
  entries: readonly VocabEntry[],
  seed: number,
): SelfTestPlan {
  const rng = mulberry32(seed);
  const targets: SessionTarget[] = mistakes.map((mistake) => ({
    entry: mistake.task.entry,
    direction: mistake.task.direction,
  }));

  const ordered = arrangeTargets(shuffle(targets, rng), targets.length);
  // Was der Abstand zurückgestellt hätte, gehört trotzdem dazu: Eine Fehlerrunde
  // ohne den Fehler wäre sinnlos.
  const missing = targets.filter((target) => !ordered.includes(target));
  const all = [...ordered, ...missing];

  const tasks: ExerciseTask[] = [];
  for (const target of all) {
    const previous = mistakes.find(
      (mistake) =>
        mistake.task.entryId === target.entry.id && mistake.task.direction === target.direction,
    );
    const possible = availableKinds(target.entry, entries, target.direction).filter(
      (kind) => KINDS_IN_GROUP[GROUP_OF_KIND[kind]].includes(kind),
    );
    // Möglichst eine andere Form als beim ersten Versuch.
    const preferred = possible.filter((kind) => kind !== previous?.task.kind);
    const kind = (preferred[0] ?? possible[0]) as ExerciseKind | undefined;
    if (!kind) continue;

    const task = buildTask(target.entry, kind, target.direction, entries, rng, '#retry');
    if (task && !tasks.some((existing) => existing.id === task.id)) tasks.push(task);
  }

  return {
    tasks,
    plannedCount: tasks.length,
    availableCount: tasks.length,
    requested: tasks.length,
  };
}
