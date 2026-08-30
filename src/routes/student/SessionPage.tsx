import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Announcer, Button, Card, Meter } from '../../ui/components';
import { ExerciseView } from './ExerciseView';
import { getPack } from '../../data/packRepo';
import { getProgressIndex, recordAnswer, startSession } from '../../data/progressRepo';
import { EXERCISE_KINDS, EXERCISE_LABELS, buildSession, type ExerciseKind } from '../../domain/exercises';
import {
  createSessionState,
  currentItem,
  isFinished,
  submitVerdict,
  type SessionState,
} from '../../domain/session';
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
  const [packTitle, setPackTitle] = useState('');
  const [result, setResult] = useState<AnswerCheckResult | null>(null);
  const [tally, setTally] = useState<Tally>({ correct: 0, almost: 0, wrong: 0 });
  const [announcement, setAnnouncement] = useState('');
  const [round, setRound] = useState(0);
  const continueRef = useRef<HTMLButtonElement>(null);

  const requestedKinds = (params.get('kinds') ?? '')
    .split(',')
    .filter((kind): kind is ExerciseKind => (EXERCISE_KINDS as readonly string[]).includes(kind));
  const length = Number(params.get('length') ?? '15');

  useEffect(() => {
    let active = true;
    void (async () => {
      const pack = await getPack(packId);
      if (!active) return;
      if (!pack) {
        setSession(createSessionState([]));
        return;
      }
      const progress = await getProgressIndex(packId);
      if (!active) return;

      setPackTitle(pack.meta.title);
      setSession(
        createSessionState(
          buildSession(pack.entries, progress, {
            direction: pack.meta.direction,
            kinds: requestedKinds,
            length: Number.isFinite(length) && length > 0 ? length : 15,
          }),
        ),
      );
      setResult(null);
      setTally({ correct: 0, almost: 0, wrong: 0 });
      await startSession(packId);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Suchparameter werden bewusst nur beim Rundenstart ausgewertet.
  }, [packId, round]);

  const item = session ? currentItem(session) : undefined;

  const handleSubmit = useCallback(
    (checked: AnswerCheckResult) => {
      setResult(checked);
      setTally((current) => ({ ...current, [checked.verdict]: current[checked.verdict] + 1 }));
      setAnnouncement(
        `${FEEDBACK_TITLE[checked.verdict]}. Richtige Antwort: ${checked.expected.join(', ')}.`,
      );
      if (item) void recordAnswer(packId, item.task.entryId, item.task.direction, checked.verdict);
    },
    [item, packId],
  );

  function goOn(): void {
    setSession((current) => (current && result ? submitVerdict(current, result.verdict) : current));
    setResult(null);
    setAnnouncement('');
  }

  useEffect(() => {
    if (result) continueRef.current?.focus();
  }, [result]);

  if (session === null) return <p className="muted">Übung wird vorbereitet …</p>;

  if (session.items.length === 0) {
    return (
      <div className="stack">
        <h1>Keine Übung möglich</h1>
        <Alert tone="info">
          Für dieses Paket konnten keine Aufgaben erzeugt werden. Prüfe die Auswahl der
          Übungsformen oder ob das Paket Vokabeln enthält.
        </Alert>
        <Link className="btn" to={`/lernen/${packId}`}>
          Zurück zum Paket
        </Link>
      </div>
    );
  }

  if (isFinished(session) || !item) {
    const answered = tally.correct + tally.almost + tally.wrong;
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
        </Card>
        <div className="row">
          <Button variant="primary" onClick={() => setRound((value) => value + 1)}>
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
          {result.verdict !== 'correct' && item.attempt === 1 ? (
            <p className="small" style={{ margin: '0.35rem 0 0' }}>
              Diese Aufgabe kommt in dieser Runde noch einmal.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="row row--end">
        {result ? (
          <Button ref={continueRef} variant="primary" onClick={goOn}>
            {isLast && result.verdict === 'correct' ? 'Runde beenden' : 'Weiter'}
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
