import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Announcer, Badge, Button, Card, Meter } from '../../ui/components';
import { ExerciseView } from './ExerciseView';
import { LearnHeader } from './LearnHeader';
import { getPack } from '../../data/packRepo';
import {
  ALL_AVAILABLE,
  KIND_GROUPS,
  KIND_GROUP_HINTS,
  KIND_GROUP_LABELS,
  SELF_TEST_COUNTS,
  availableGroups,
  describeResult,
  gradeSelfTest,
  planMistakeRound,
  planSelfTest,
  type KindGroup,
  type SelfTestAnswer,
  type SelfTestCount,
  type SelfTestMistake,
  type SelfTestPlan,
} from '../../domain/selfTest';
import {
  DEFAULT_DIRECTION_CHOICE,
  DIRECTION_CHOICE_LABELS,
  directionChoicesFor,
  type DirectionChoice,
} from '../../domain/practiceDirection';
import { EXERCISE_LABELS } from '../../domain/exercises';
import { GRADE_LABELS } from '../../domain/cefr';
import type { AnswerVerdict } from '../../domain/answerCheck';
import type { VocabPack } from '../../domain/schema';

/**
 * Selbsttest – sich selbst prüfen, ohne geprüft zu werden.
 *
 * Diese Seite ruft **weder `startSession` noch `recordAnswer`** und fasst kein
 * Lernstand-Repository an. Aus `data/` wird ausschließlich `getPack` gelesen.
 * Das Ergebnis lebt im Zustand dieser Ansicht: Ein Neuladen setzt den Test
 * zurück, und es entsteht keine Historie darüber, wer wie abgeschnitten hat.
 *
 * Vier Zustände, klar getrennt: einrichten, bearbeiten, auswerten, Fehler
 * ansehen. Die Aufgaben selbst kommen aus `ExerciseView` – derselben
 * Komponente wie im Lernplan –, und geprüft wird mit derselben zentralen
 * Antwortprüfung. Eine zweite, vereinfachte Prüfung gibt es nirgends.
 */

type Phase = 'setup' | 'running' | 'result' | 'mistakes';

const VERDICT_LABELS: Readonly<Record<AnswerVerdict, string>> = {
  correct: 'richtig',
  almost: 'fast richtig',
  wrong: 'noch nicht richtig',
};

function freshSeed(): number {
  return Date.now() >>> 0;
}

export function SelfTestPage() {
  const { packId = '' } = useParams();

  const [pack, setPack] = useState<VocabPack | null>(null);
  const [loading, setLoading] = useState(true);

  const [phase, setPhase] = useState<Phase>('setup');
  const [choice, setChoice] = useState<DirectionChoice>(DEFAULT_DIRECTION_CHOICE);
  const [groups, setGroups] = useState<KindGroup[]>([]);
  const [count, setCount] = useState<SelfTestCount>(10);
  const [seed, setSeed] = useState(freshSeed);

  /** Der laufende Test – Aufgaben, Antworten, Position. */
  const [plan, setPlan] = useState<SelfTestPlan | null>(null);
  const [answers, setAnswers] = useState<SelfTestAnswer[]>([]);
  const [index, setIndex] = useState(0);
  /** `true`, sobald der laufende Durchgang eine Fehlerwiederholung ist. */
  const [isRetry, setIsRetry] = useState(false);
  const [status, setStatus] = useState('');
  const [confirmStop, setConfirmStop] = useState(false);

  /**
   * Bereits beantwortete Aufgaben – als Ref, weil ein zweiter Klick schneller
   * sein kann als das nächste Rendern. Ein Doppelklick darf keine Aufgabe
   * doppelt werten.
   */
  const answeredRef = useRef<Set<string>>(new Set());
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const loaded = await getPack(packId);
      if (!active) return;
      setPack(loaded ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [packId]);

  const entries = pack?.entries ?? [];
  const possibleGroups = useMemo(
    () => (pack ? availableGroups(entries, pack.meta.direction, choice) : []),
    [pack, entries, choice],
  );

  /** Vorschau: Was ergibt die aktuelle Auswahl? Dieselbe Funktion wie der Start. */
  const preview = useMemo(() => {
    if (!pack) return null;
    return planSelfTest(entries, {
      packDirection: pack.meta.direction,
      choice,
      groups,
      count,
      seed,
    });
  }, [pack, entries, choice, groups, count, seed]);

  const task = plan?.tasks[index];

  // Bei Multiple Choice gibt es kein Eingabefeld, das den Fokus aufnähme –
  // dann übernimmt ihn die Aufgabenüberschrift. Bei den übrigen Formen setzt
  // `ExerciseView` den Fokus selbst ins Feld; dort wird er nicht gestohlen.
  useEffect(() => {
    if (phase === 'running' && task?.kind === 'multiple-choice') headingRef.current?.focus();
  }, [phase, task?.id, task?.kind]);

  if (loading) return <p className="muted">Paket wird geladen …</p>;
  if (!pack) {
    return (
      <div className="stack">
        <h1>Paket nicht gefunden</h1>
        <Link className="btn" to="/lernen">
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  const choices = directionChoicesFor(pack.meta.direction);
  const result = plan ? gradeSelfTest(plan.tasks, answers) : null;

  function toggleGroup(group: KindGroup): void {
    setGroups((current) =>
      current.includes(group) ? current.filter((item) => item !== group) : [...current, group],
    );
  }

  function startTest(): void {
    if (!preview || preview.plannedCount === 0) return;
    answeredRef.current = new Set();
    setPlan(preview);
    setAnswers([]);
    setIndex(0);
    setIsRetry(false);
    setConfirmStop(false);
    setPhase('running');
    setStatus(`Selbsttest gestartet: ${preview.plannedCount} Aufgaben.`);
  }

  /** Eine Antwort festhalten und weitergehen – ohne Zwischenauswertung. */
  function submit(verdict: AnswerVerdict, given: string): void {
    if (!plan || !task) return;
    // Der Doppelklick-Schutz muss synchron greifen.
    if (answeredRef.current.has(task.id)) return;
    answeredRef.current.add(task.id);

    setAnswers((current) => [...current, { taskId: task.id, given, verdict }]);

    if (index + 1 >= plan.tasks.length) {
      setPhase('result');
      setStatus('Alle Aufgaben bearbeitet.');
      return;
    }
    setIndex((current) => current + 1);
  }

  function startMistakeRound(mistakes: readonly SelfTestMistake[]): void {
    const round = planMistakeRound(mistakes, entries, freshSeed());
    if (round.plannedCount === 0) return;

    answeredRef.current = new Set();
    setPlan(round);
    setAnswers([]);
    setIndex(0);
    setIsRetry(true);
    setPhase('running');
    setStatus(`Wiederholung gestartet: ${round.plannedCount} Aufgaben.`);
  }

  function backToSetup(): void {
    setPlan(null);
    setAnswers([]);
    setIndex(0);
    setIsRetry(false);
    setConfirmStop(false);
    setSeed(freshSeed());
    setPhase('setup');
    setStatus('Neuer Selbsttest.');
  }

  /*
    Nur während des Bearbeitens gibt es etwas zu verlieren. In der Auswahl und
    in den Ergebnisansichten wäre eine Rückfrage reine Reibung – dort führen
    beide Wege ohne Zwischenschritt hinaus.
  */
  const header = (
    <LearnHeader
      eyebrow={isRetry && phase !== 'setup' ? 'Fehler wiederholen' : 'Selbsttest'}
      title={pack.meta.title}
      packId={packId}
      confirmLeave={phase === 'running'}
      confirmTitle="Selbsttest wirklich verlassen?"
      confirmText="Deine bisherigen Antworten gehen dann verloren. Dein Lernstand bleibt unverändert."
      status={
        <>
          {GRADE_LABELS[pack.meta.grade]} · {pack.meta.cefrLevel} · Keine Note, keine Auswertung
          durch andere. Dein Lernplan bleibt unverändert.
        </>
      }
    />
  );

  // ---------------------------------------------------------------- Einrichten

  if (phase === 'setup') {
    const shown = preview?.plannedCount ?? 0;
    const requested = preview?.requested ?? 0;

    return (
      <div className="stack">
        {header}
        <Announcer message={status} />

        <Card>
          <h2>Test zusammenstellen</h2>

          {choices.length > 0 ? (
            <fieldset className="self-test__group">
              <legend>Richtung</legend>
              {choices.map((option) => (
                <label className="checkbox" key={option}>
                  <input
                    type="radio"
                    name="self-test-direction"
                    value={option}
                    checked={choice === option}
                    onChange={() => setChoice(option)}
                  />
                  <span>{DIRECTION_CHOICE_LABELS[option]}</span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <fieldset className="self-test__group">
            <legend>Anzahl der Aufgaben</legend>
            {SELF_TEST_COUNTS.map((option) => (
              <label className="checkbox" key={option}>
                <input
                  type="radio"
                  name="self-test-count"
                  value={option}
                  checked={count === option}
                  onChange={() => setCount(option)}
                />
                <span>{option}</span>
              </label>
            ))}
            <label className="checkbox">
              <input
                type="radio"
                name="self-test-count"
                value={ALL_AVAILABLE}
                checked={count === ALL_AVAILABLE}
                onChange={() => setCount(ALL_AVAILABLE)}
              />
              <span>Alle verfügbaren</span>
            </label>
          </fieldset>

          <fieldset className="self-test__group">
            <legend>Aufgabenarten</legend>
            {KIND_GROUPS.filter((group) => possibleGroups.includes(group)).map((group) => (
              <label className="checkbox" key={group}>
                <input
                  type="checkbox"
                  checked={groups.length === 0 || groups.includes(group)}
                  onChange={() => toggleGroup(group)}
                />
                <span>
                  {KIND_GROUP_LABELS[group]}{' '}
                  <span className="small muted">– {KIND_GROUP_HINTS[group]}</span>
                </span>
              </label>
            ))}
            <p className="small muted" style={{ margin: '0.4rem 0 0' }}>
              Angeboten wird nur, was dieses Paket in dieser Richtung wirklich hergibt.
            </p>
          </fieldset>

          {/* Ehrliche Vorschau – vor dem Start, nicht als Überraschung danach. */}
          <p className="self-test__preview">
            <strong>
              {shown === 0
                ? 'Mit dieser Auswahl entsteht keine Aufgabe.'
                : `${shown} ${shown === 1 ? 'Aufgabe' : 'Aufgaben'} werden zusammengestellt.`}
            </strong>{' '}
            {shown > 0 && shown < requested ? (
              <>
                Mehr gibt dieses Paket mit dieser Auswahl nicht her – erfunden wird nichts.
              </>
            ) : null}
          </p>

          <div className="row">
            <Button variant="primary" onClick={startTest} disabled={shown === 0}>
              Selbsttest starten
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------- Bearbeiten

  if (phase === 'running' && plan && task) {
    return (
      <div className="stack">
        {header}
        <Announcer message={status} />

        <div className="card-deck__meta">
          <span>
            Aufgabe {index + 1} von {plan.tasks.length}
          </span>
          <Badge>{EXERCISE_LABELS[task.kind]}</Badge>
        </div>
        <Meter value={index} max={plan.tasks.length} label="Fortschritt im Selbsttest" />

        <Card>
          <h2 className="visually-hidden" ref={headingRef} tabIndex={-1}>
            Aufgabe {index + 1} von {plan.tasks.length}
          </h2>
          <ExerciseView
            key={task.id}
            task={task}
            result={null}
            onSubmit={(checked, given) => submit(checked.verdict, given)}
          />
        </Card>

        {confirmStop ? (
          <Alert tone="warning" title="Test wirklich beenden?">
            Deine bisherigen Antworten gehen dann verloren.
            <div className="row" style={{ marginTop: '0.6rem' }}>
              <Button small onClick={backToSetup}>
                Ja, beenden
              </Button>
              <Button small variant="quiet" onClick={() => setConfirmStop(false)}>
                Weitermachen
              </Button>
            </div>
          </Alert>
        ) : (
          <div className="row">
            <Button small variant="quiet" onClick={() => setConfirmStop(true)}>
              Test vorzeitig beenden
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------- Fehleransicht

  if (phase === 'mistakes' && result) {
    return (
      <div className="stack">
        {header}
        <h2>Das war noch nicht richtig</h2>

        <ul className="mistake-list">
          {result.mistakes.map((mistake) => (
            <li className="mistake" key={mistake.task.id}>
              <div className="mistake__head">
                <h3 className="mistake__prompt">{mistake.task.prompt}</h3>
                {/* Die Einstufung steht als Wort da – Farbe ist nur Zugabe. */}
                {mistake.verdict === 'almost' ? (
                  <Badge tone="warning">{VERDICT_LABELS.almost}</Badge>
                ) : (
                  <Badge>{VERDICT_LABELS.wrong}</Badge>
                )}
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {mistake.task.direction === 'en-de'
                  ? 'Englisch → Deutsch'
                  : 'Deutsch → Englisch'}{' '}
                · {EXERCISE_LABELS[mistake.task.kind]}
              </p>

              <p className="mistake__row">
                <span className="mistake__label">Deine Antwort:</span>{' '}
                <span className="mistake__given">
                  {mistake.given.trim().length > 0 ? mistake.given : '– keine Antwort –'}
                </span>
              </p>
              <p className="mistake__row">
                <span className="mistake__label">Richtig wäre:</span>{' '}
                <span className="mistake__expected">{mistake.expected.join(' · ')}</span>
              </p>

              {mistake.task.entry.exampleSentences[0]?.english ? (
                <p className="mistake__example">
                  „{mistake.task.entry.exampleSentences[0]?.english}“
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="row">
          <Button variant="primary" onClick={() => startMistakeRound(result.mistakes)}>
            Fehler noch einmal üben
          </Button>
          <Button onClick={() => setPhase('result')}>Zurück zur Auswertung</Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ Ergebnis

  if (result) {
    const flawless = result.mistakes.length === 0;

    return (
      <div className="stack">
        {header}
        <Announcer message={status} />

        <Card>
          <h2>{isRetry ? 'Wiederholung ausgewertet' : 'Deine Auswertung'}</h2>
          <p className="self-test__score">
            <strong>{describeResult(result)}</strong>{' '}
            <span className="muted">({result.percent} %)</span>
          </p>

          {/* Wortmarke vor Farbe: Die Kategorie steht immer als Text da. */}
          <ul className="self-test__tally">
            <li>
              <span className="self-test__tally-count">{result.correct}</span> richtig
            </li>
            <li>
              <span className="self-test__tally-count">{result.almost}</span> fast richtig
            </li>
            <li>
              <span className="self-test__tally-count">{result.wrong}</span> noch nicht richtig
            </li>
          </ul>

          <p className="muted">
            {flawless
              ? 'Alles richtig – das sitzt.'
              : 'Das Ergebnis bleibt auf diesem Gerät. Es zählt für nichts und niemanden außer für dich.'}
          </p>

          <div className="row" style={{ marginTop: '1rem' }}>
            {flawless ? null : (
              <>
                <Button variant="primary" onClick={() => startMistakeRound(result.mistakes)}>
                  Fehler noch einmal üben
                </Button>
                <Button onClick={() => setPhase('mistakes')}>Fehler ansehen</Button>
              </>
            )}
            <Button variant={flawless ? 'primary' : 'default'} onClick={backToSetup}>
              Neuen Selbsttest starten
            </Button>
          </div>

          <div className="row" style={{ marginTop: '0.6rem' }}>
            <Link className="btn btn--small" to={`/lernen/${packId}/durchsehen`}>
              Vokabeln durchsehen
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="stack">
      {header}
      <Alert tone="info">Für diesen Selbsttest ließ sich keine Aufgabe zusammenstellen.</Alert>
      <Button onClick={backToSetup}>Zurück zur Auswahl</Button>
    </div>
  );
}

export default SelfTestPage;
