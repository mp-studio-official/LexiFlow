import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Announcer, Button, Card, Meter } from '../../ui/components';
import { ExerciseView } from './ExerciseView';
import { getPack } from '../../data/packRepo';
import { getProgressIndex, recordAnswer, startSession } from '../../data/progressRepo';
import {
  EXERCISE_KINDS,
  EXERCISE_LABELS,
  buildTasksForTargets,
  mulberry32,
  planSession,
  type ExerciseKind,
  type SessionPlan,
} from '../../domain/exercises';
import {
  createSessionState,
  currentItem,
  isFinished,
  submitVerdict,
  type SessionState,
  type VerdictOutcome,
} from '../../domain/session';
import { formatDueDate } from '../../domain/dueDate';
import { TASK_DIRECTION_LABELS } from '../../domain/schema';
import type { AnswerCheckResult, AnswerVerdict } from '../../domain/answerCheck';

interface Tally {
  correct: number;
  almost: number;
  wrong: number;
}

const FEEDBACK_TITLE: Record<AnswerVerdict, string> = {
  correct: 'Richtig',
  almost: 'Fast richtig',
  wrong: 'Noch nicht richtig',
};

export function SessionPage() {
  const { packId = '' } = useParams();
  const [params] = useSearchParams();

  const [session, setSession] = useState<SessionState | null>(null);
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [nextRound, setNextRound] = useState<SessionPlan | null>(null);
  const [packTitle, setPackTitle] = useState('');
  const [result, setResult] = useState<AnswerCheckResult | null>(null);
  const [outcome, setOutcome] = useState<VerdictOutcome | null>(null);
  const [tally, setTally] = useState<Tally>({ correct: 0, almost: 0, wrong: 0 });
  const [announcement, setAnnouncement] = useState('');
  const continueRef = useRef<HTMLButtonElement>(null);

  const requestedKinds = (params.get('kinds') ?? '')
    .split(',')
    .filter((kind): kind is ExerciseKind => (EXERCISE_KINDS as readonly string[]).includes(kind));
  const rawLength = Number(params.get('length') ?? '15');
  const length = Number.isFinite(rawLength) && rawLength > 0 ? rawLength : 15;

  /** Derselbe Seed wie in der Vorschau auf der Paketseite – gleiche Runde. */
  const [roundSeed, setRoundSeed] = useState(() => {
    const fromUrl = Number(params.get('seed'));
    return Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl >>> 0 : Date.now() >>> 0;
  });

  useEffect(() => {
    let active = true;
    void (async () => {
      const pack = await getPack(packId);
      if (!active) return;
      if (!pack) {
        setSession(createSessionState([]));
        setPlan({ targets: [], readyCount: 0, plannedCount: 0, remainingReadyCount: 0 });
        return;
      }
      const progress = await getProgressIndex(packId);
      if (!active) return;

      // Ein RNG für Planung und Aufgabenbau – identisch zur Vorschau.
      const rng = mulberry32(roundSeed);
      const roundPlan = planSession(
        pack.entries,
        progress,
        pack.meta.direction,
        length,
        new Date(),
        rng,
      );
      const tasks = buildTasksForTargets(
        roundPlan.targets,
        pack.entries,
        progress,
        requestedKinds,
        rng,
      );

      setPackTitle(pack.meta.title);
      setPlan(roundPlan);
      setNextRound(null);
      setSession(createSessionState(tasks));
      setResult(null);
      setOutcome(null);
      setTally({ correct: 0, almost: 0, wrong: 0 });
      if (tasks.length > 0) await startSession(packId);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Suchparameter werden bewusst nur beim Rundenstart ausgewertet.
  }, [packId, roundSeed]);

  const finished = session !== null && session.items.length > 0 && isFinished(session);

  // Nach der Runde: Was steht als Nächstes an?
  useEffect(() => {
    if (!finished) return;
    let active = true;
    void (async () => {
      const pack = await getPack(packId);
      if (!active || !pack) return;
      const progress = await getProgressIndex(packId);
      if (!active) return;
      setNextRound(
        planSession(pack.entries, progress, pack.meta.direction, length, new Date(), mulberry32(1)),
      );
    })();
    return () => {
      active = false;
    };
  }, [finished, packId, length]);

  const item = session ? currentItem(session) : undefined;

  const handleSubmit = useCallback(
    (checked: AnswerCheckResult) => {
      if (!session || !item) return;
      setResult(checked);
      // Rein berechnet, angewendet erst beim Weiterblättern: So weiß die
      // Oberfläche schon jetzt, ob die Wiederholung wirklich kommt.
      setOutcome(submitVerdict(session, checked.verdict));
      setTally((current) => ({ ...current, [checked.verdict]: current[checked.verdict] + 1 }));
      setAnnouncement(
        `${FEEDBACK_TITLE[checked.verdict]}. Richtige Antwort: ${checked.expected.join(', ')}.`,
      );
      void recordAnswer(packId, item.task.entryId, item.task.direction, checked.verdict);
    },
    [session, item, packId],
  );

  function goOn(): void {
    if (outcome) setSession(outcome.state);
    setResult(null);
    setOutcome(null);
    setAnnouncement('');
  }

  useEffect(() => {
    if (result) continueRef.current?.focus();
  }, [result]);

  if (session === null || plan === null) return <p className="muted">Übung wird vorbereitet …</p>;

  if (session.items.length === 0) {
    return (
      <div className="stack">
        <h1>Gerade nichts zu üben</h1>
        <Alert tone="info">
          {plan.nextDueAt ? (
            <>
              Alle Aufgaben dieses Pakets sind erledigt. Die nächste Wiederholung steht{' '}
              <strong>{formatDueDate(plan.nextDueAt)}</strong> an.
            </>
          ) : (
            <>
              Für dieses Paket lässt sich gerade keine Runde zusammenstellen. Prüfe die Auswahl
              der Übungsformen oder ob das Paket Vokabeln enthält.
            </>
          )}
        </Alert>
        <Link className="btn" to={`/lernen/${packId}`}>
          Zurück zum Paket
        </Link>
      </div>
    );
  }

  if (finished || !item) {
    const answered = tally.correct + tally.almost + tally.wrong;
    const canContinue = nextRound === null || nextRound.plannedCount > 0;
    return (
      <div className="stack exercise">
        <h1>Runde abgeschlossen</h1>
        <Card>
          <p>
            {answered} Aufgaben bearbeitet: <strong>{tally.correct} richtig</strong>,{' '}
            {tally.almost} fast richtig, {tally.wrong} noch nicht richtig.
          </p>
          <p className="muted small">
            Der Lernstand wurde lokal gespeichert. Vokabeln, die noch nicht saßen, kommen
            in der nächsten Runde früher wieder dran.
          </p>
          {nextRound !== null && nextRound.readyCount > 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              {nextRound.readyCount}{' '}
              {nextRound.readyCount === 1 ? 'Aufgabe ist' : 'Aufgaben sind'} weiterhin bereit.
            </p>
          ) : null}
        </Card>

        {!canContinue ? (
          <Alert tone="info">
            {nextRound?.nextDueAt ? (
              <>
                Für heute ist alles erledigt. Die nächste Wiederholung steht{' '}
                <strong>{formatDueDate(nextRound.nextDueAt)}</strong> an.
              </>
            ) : (
              <>Für dieses Paket gibt es gerade nichts mehr zu üben.</>
            )}
          </Alert>
        ) : null}

        <div className="row">
          <Button
            variant="primary"
            disabled={!canContinue}
            onClick={() => setRoundSeed(Date.now() >>> 0)}
          >
            Neue Runde
          </Button>
          <Link className="btn" to={`/lernen/${packId}`}>
            Zurück zum Paket
          </Link>
        </div>
      </div>
    );
  }

  const isLast = session.index + 1 >= session.items.length;

  return (
    <div className="exercise stack">
      <h1 className="visually-hidden">Übung: {packTitle}</h1>
      <div className="exercise__meta">
        <span>
          {packTitle} · {EXERCISE_LABELS[item.task.kind]} ·{' '}
          {TASK_DIRECTION_LABELS[item.task.direction]}
        </span>
        <span>
          Aufgabe {session.index + 1} von {session.items.length}
          {item.attempt > 1 ? ' · Wiederholung' : ''}
        </span>
      </div>
      <Meter value={session.index} max={session.items.length} label="Fortschritt in dieser Runde" />

      <Announcer message={announcement} />

      <Card>
        <ExerciseView key={item.id} task={item.task} result={result} onSubmit={handleSubmit} />
      </Card>

      {result ? (
        <div className="feedback" data-verdict={result.verdict}>
          <p className="feedback__title">{FEEDBACK_TITLE[result.verdict]}</p>
          {result.verdict === 'correct' ? null : (
            <p style={{ margin: 0 }}>
              Richtig wäre: <strong>{result.expected.join(' · ')}</strong>
            </p>
          )}
          {result.hint ? (
            <p className="small" style={{ margin: '0.35rem 0 0' }}>
              {result.hint}
            </p>
          ) : null}
          {item.task.entry.notes ? (
            <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
              {item.task.entry.notes}
            </p>
          ) : null}
          {outcome?.requeued ? (
            <p className="small" style={{ margin: '0.35rem 0 0' }}>
              Diese Aufgabe kommt in dieser Runde noch einmal.
            </p>
          ) : null}
          {outcome && !outcome.requeued && outcome.reason === 'no-slot' ? (
            <p className="small" style={{ margin: '0.35rem 0 0' }}>
              In dieser kurzen Runde ist kein passender Wiederholungsplatz frei. Die Aufgabe
              bleibt für die nächste Runde priorisiert.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="row row--end">
        {result ? (
          <Button ref={continueRef} variant="primary" onClick={goOn}>
            {isLast && !outcome?.requeued ? 'Runde beenden' : 'Weiter'}
          </Button>
        ) : (
          <Link className="btn btn--quiet" to={`/lernen/${packId}`}>
            Übung abbrechen
          </Link>
        )}
      </div>
    </div>
  );
}
