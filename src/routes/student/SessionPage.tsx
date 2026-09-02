import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Announcer, Button, Card, Meter } from '../../ui/components';
import { ExerciseView } from './ExerciseView';
import { LearnHeader } from './LearnHeader';
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
import { planFreeSession, type FreeSessionPlan } from '../../domain/freePractice';
import { effectiveDirection, parseDirectionChoice } from '../../domain/practiceDirection';
import {
  createSessionState,
  currentItem,
  isFinished,
  submitVerdict,
  type SessionState,
  type VerdictOutcome,
} from '../../domain/session';
import { formatDueDate } from '../../domain/dueDate';
import { TASK_DIRECTION_LABELS, type TaskDirection } from '../../domain/schema';
import type { AnswerCheckResult, AnswerVerdict } from '../../domain/answerCheck';
import { formatAnswers } from '../../domain/normalize';

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

/**
 * Übungsart dieser Runde – aus der URL, nicht aus dem Zustand der Seite.
 *
 * `free` bedeutet: geplant wird mit `planFreeSession`, und es wird **nichts**
 * gespeichert – weder `startSession` noch `recordAnswer`. Ein fehlender oder
 * unbekannter Wert fällt sicher auf den Lernplan zurück.
 */
function readMode(value: string | null): 'scheduled' | 'free' {
  return value === 'free' ? 'free' : 'scheduled';
}

/**
 * Zustand der Speicherung einer Antwort.
 *
 * Das Feedback erscheint sofort, weitergeschaltet wird aber erst, wenn der
 * Lernstand tatsächlich in IndexedDB liegt. Sonst könnte die Folgerundenplanung
 * veraltete Daten lesen.
 */
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Die eine Antwort, die gerade gespeichert wird oder gespeichert wurde. */
interface PendingAnswer {
  entryId: string;
  direction: TaskDirection;
  verdict: AnswerVerdict;
}

export function SessionPage() {
  const { packId = '' } = useParams();
  const [params] = useSearchParams();

  const [session, setSession] = useState<SessionState | null>(null);
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [freePlan, setFreePlan] = useState<FreeSessionPlan | null>(null);
  const [nextRound, setNextRound] = useState<SessionPlan | null>(null);
  const [packTitle, setPackTitle] = useState('');
  const [result, setResult] = useState<AnswerCheckResult | null>(null);
  const [outcome, setOutcome] = useState<VerdictOutcome | null>(null);
  const [tally, setTally] = useState<Tally>({ correct: 0, almost: 0, wrong: 0 });
  const [announcement, setAnnouncement] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [pendingAnswer, setPendingAnswer] = useState<PendingAnswer | null>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  /** Läuft, sobald die Runde beginnt – die erste Antwort wartet darauf. */
  const sessionStartRef = useRef<Promise<void> | null>(null);

  const free = readMode(params.get('mode')) === 'free';
  /**
   * Die ausdrücklich gewählte Richtung. Sie wird zur wirksamen Paketrichtung –
   * damit gilt für eine bewusst gewählte Richtung keine Freischaltbedingung.
   */
  const directionChoice = parseDirectionChoice(params.get('direction'));
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
        setFreePlan({
          targets: [],
          availableCount: 0,
          possibleCount: 0,
          plannedCount: 0,
          remainingAvailableCount: 0,
        });
        return;
      }
      const progress = await getProgressIndex(packId);
      if (!active) return;

      // Ein RNG für Planung und Aufgabenbau – identisch zur Vorschau.
      const rng = mulberry32(roundSeed);
      const direction = effectiveDirection(pack.meta.direction, directionChoice);
      /*
        Seit Sprint 3B.2b2 hat der `kinds`-Parameter im freien Üben eine
        verbindliche Bedeutung: Wer ihn setzt – über „Runde anpassen“ oder in
        einem selbst gebauten Link –, bekommt ausschließlich diese Formen.
        Vokabeln, die keine davon hergeben, kommen in dieser Runde nicht vor.

        Ohne `kinds` bleibt alles wie bisher: automatisch passende Formen mit
        Ersatzform, damit keine Vokabel an ihrer Form scheitert. Der Lernplan
        ist davon ausgenommen – dort geht es um die Wiederholung der Vokabel,
        nicht um die Form.
      */
      const strict = free && requestedKinds.length > 0;
      const roundPlan = free
        ? planFreeSession(
            pack.entries,
            progress,
            direction,
            length,
            rng,
            strict ? requestedKinds : [],
          )
        : planSession(pack.entries, progress, direction, length, new Date(), rng);
      const tasks = buildTasksForTargets(
        roundPlan.targets,
        pack.entries,
        progress,
        requestedKinds,
        rng,
        strict ? 'strict' : 'auto',
      );

      setPackTitle(pack.meta.title);
      if (free) {
        setFreePlan(roundPlan as FreeSessionPlan);
        setPlan(null);
      } else {
        setPlan(roundPlan as SessionPlan);
        setFreePlan(null);
      }
      setNextRound(null);
      setSession(createSessionState(tasks));
      setResult(null);
      setOutcome(null);
      setSaveState('idle');
      setPendingAnswer(null);
      setTally({ correct: 0, almost: 0, wrong: 0 });

      // Nicht abwarten, aber auch nicht verlieren: Die erste Antwort wartet
      // auf diese Transaktion, damit sie sich nicht mit ihr überschneidet.
      // Freies Üben zählt keine Runde – hier wird nichts gestartet.
      sessionStartRef.current = null;
      if (!free && tasks.length > 0) {
        const started = startSession(packId);
        // Verhindert eine unbehandelte Rejection; der Fehler wird beim ersten
        // Speichern sichtbar, weil dort auf dieselbe Zusage gewartet wird.
        started.catch(() => undefined);
        sessionStartRef.current = started;
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Suchparameter werden bewusst nur beim Rundenstart ausgewertet.
  }, [packId, roundSeed, free, directionChoice]);

  const finished = session !== null && session.items.length > 0 && isFinished(session);

  /**
   * Folgerundenplanung erst, wenn keine Speicherung mehr aussteht. Da
   * „Weiter“ nur nach erfolgreicher Speicherung freigeschaltet wird, ist beim
   * Rundenende bereits alles geschrieben; die Bedingung hält das explizit fest.
   */
  const readyToPlanNextRound = finished && saveState === 'idle' && !free;

  useEffect(() => {
    if (!readyToPlanNextRound) return;
    let active = true;
    void (async () => {
      const pack = await getPack(packId);
      if (!active || !pack) return;
      const progress = await getProgressIndex(packId);
      if (!active) return;
      setNextRound(
        planSession(
          pack.entries,
          progress,
          effectiveDirection(pack.meta.direction, directionChoice),
          length,
          new Date(),
          mulberry32(1),
        ),
      );
    })();
    return () => {
      active = false;
    };
  }, [readyToPlanNextRound, packId, length, directionChoice]);

  const item = session ? currentItem(session) : undefined;

  /** Wartet auf den Rundenstart und startet ihn nach einem Fehler neu. */
  const ensureSessionStarted = useCallback(async (): Promise<void> => {
    if (!sessionStartRef.current) {
      const started = startSession(packId);
      started.catch(() => undefined);
      sessionStartRef.current = started;
    }
    try {
      await sessionStartRef.current;
    } catch (error: unknown) {
      sessionStartRef.current = null;
      throw error;
    }
  }, [packId]);

  const persist = useCallback(
    async (answer: PendingAnswer): Promise<void> => {
      setSaveState('saving');
      try {
        await ensureSessionStarted();
        await recordAnswer(packId, answer.entryId, answer.direction, answer.verdict);
        setSaveState('saved');
      } catch {
        // Kein stiller Fehler: Die Aufgabe gilt weiter als offen.
        setSaveState('error');
      }
    },
    [ensureSessionStarted, packId],
  );

  const handleSubmit = useCallback(
    (checked: AnswerCheckResult) => {
      // Doppelte Bewertung und doppelte Schreibvorgänge ausschließen.
      if (!session || !item || result !== null) return;

      setResult(checked);
      // Rein berechnet, angewendet erst beim Weiterblättern: So weiß die
      // Oberfläche schon jetzt, ob die Wiederholung wirklich kommt.
      setOutcome(submitVerdict(session, checked.verdict));
      setTally((current) => ({ ...current, [checked.verdict]: current[checked.verdict] + 1 }));
      setAnnouncement(
        `${FEEDBACK_TITLE[checked.verdict]}. Richtige Antwort: ${formatAnswers(checked.expected)}.`,
      );

      // Freies Üben schreibt nichts: kein `recordAnswer`, kein Speicherzustand.
      if (free) return;

      const answer: PendingAnswer = {
        entryId: item.task.entryId,
        direction: item.task.direction,
        verdict: checked.verdict,
      };
      setPendingAnswer(answer);
      void persist(answer);
    },
    [session, item, result, persist, free],
  );

  /** Freigabe von „Weiter“ – im freien Modus sofort nach dem Feedback. */
  const canGoOn = free ? result !== null : saveState === 'saved';

  function retrySave(): void {
    if (!pendingAnswer || saveState !== 'error') return;
    void persist(pendingAnswer);
  }

  function goOn(): void {
    // Im Lernplan erst nach erfolgreicher Speicherung weiterschalten; beim
    // freien Üben gibt es nichts zu speichern, also sofort.
    if (!canGoOn) return;
    if (outcome) setSession(outcome.state);
    setResult(null);
    setOutcome(null);
    setPendingAnswer(null);
    setSaveState('idle');
    setAnnouncement('');
  }

  useEffect(() => {
    if (canGoOn) continueRef.current?.focus();
  }, [canGoOn]);

  const roundReady = session !== null && (free ? freePlan !== null : plan !== null);
  if (!session || !roundReady) return <p className="muted">Übung wird vorbereitet …</p>;

  if (session.items.length === 0) {
    return (
      <div className="stack">
        <LearnHeader
          eyebrow={free ? 'Frei üben' : 'Lernplan'}
          title="Gerade nichts zu üben"
          packId={packId}
        />
        <Alert tone="info">
          {free ? (
            <>
              Für dieses Paket lässt sich gerade keine freie Runde zusammenstellen. Entweder
              enthält es keine Vokabeln, oder die gewählten Übungsformen passen nicht dazu.
            </>
          ) : plan?.nextDueAt ? (
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
      </div>
    );
  }

  if (finished || !item) {
    const answered = tally.correct + tally.almost + tally.wrong;

    if (free) {
      return (
        <div className="stack exercise">
          {/* Abgeschlossen: hier gibt es nichts mehr zu verlieren, also keine
              Rückfrage vor dem Verlassen. */}
          <LearnHeader
            eyebrow="Frei üben"
            title="Freie Runde abgeschlossen"
            packId={packId}
            status={packTitle}
          />
          <Card>
            <p>
              {answered} Aufgaben bearbeitet: <strong>{tally.correct} richtig</strong>,{' '}
              {tally.almost} fast richtig, {tally.wrong} noch nicht richtig.
            </p>
            <p className="muted small" style={{ margin: 0 }}>
              Diese freie Runde hat deinen Lernplan und deine Fälligkeiten nicht verändert.
            </p>
          </Card>

          <div className="row">
            <Button variant="primary" onClick={() => setRoundSeed(Date.now() >>> 0)}>
              Noch einmal frei üben
            </Button>
          </div>
        </div>
      );
    }

    const checkingNextRound = nextRound === null;
    const canContinue = nextRound !== null && nextRound.plannedCount > 0;

    return (
      <div className="stack exercise">
        <LearnHeader
          eyebrow="Lernplan"
          title="Runde abgeschlossen"
          packId={packId}
          status={packTitle}
        />
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

        {!checkingNextRound && !canContinue ? (
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
            aria-busy={checkingNextRound}
            onClick={() => setRoundSeed(Date.now() >>> 0)}
          >
            {checkingNextRound ? 'Nächste Runde wird geprüft …' : 'Neue Runde'}
          </Button>
        </div>
      </div>
    );
  }

  const isLast = session.index + 1 >= session.items.length;

  return (
    <div className="exercise stack">
      {/*
        Laufende Runde: Beide Wege hinaus fragen vorher nach, weil die
        begonnene Runde sonst verloren ginge. Der Lernstand bleibt in jedem
        Fall unangetastet – geschrieben wird nur nach einer Antwort.
      */}
      <LearnHeader
        eyebrow={free ? 'Frei üben' : 'Lernplan'}
        title={packTitle}
        packId={packId}
        confirmLeave
        confirmText="Die begonnene Runde geht dann verloren. Bereits gespeicherte Antworten bleiben erhalten."
      />
      <div className="exercise__meta">
        <span>
          {packTitle} · {EXERCISE_LABELS[item.task.kind]} ·{' '}
          {TASK_DIRECTION_LABELS[item.task.direction]}
        </span>
        <span>
          {free ? 'Frei üben · ' : ''}Aufgabe {session.index + 1} von {session.items.length}
          {item.attempt > 1 ? ' · Wiederholung' : ''}
        </span>
      </div>
      <Meter value={session.index} max={session.items.length} label="Fortschritt in dieser Runde" />

      <Announcer message={announcement} />

      {free ? (
        <p className="small muted" style={{ margin: 0 }}>
          Freies Üben: Diese Runde verändert deinen Lernplan und die Fälligkeiten nicht.
        </p>
      ) : null}

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

      {saveState === 'error' ? (
        <Alert tone="error" title="Der Lernstand konnte nicht gespeichert werden.">
          <p style={{ margin: '0.35rem 0 0.6rem' }}>
            Deine Antwort wurde noch nicht gesichert. Solange gilt die Aufgabe als offen.
          </p>
          <Button onClick={retrySave}>Erneut versuchen</Button>
        </Alert>
      ) : null}

      <div className="row row--end">
        {result ? (
          <>
            {!free && saveState === 'saving' ? (
              <span className="small muted" role="status">
                Lernstand wird gespeichert …
              </span>
            ) : null}
            <Button
              ref={continueRef}
              variant="primary"
              disabled={!canGoOn}
              aria-busy={!free && saveState === 'saving'}
              onClick={goOn}
            >
              {isLast && !outcome?.requeued ? 'Runde beenden' : 'Weiter'}
            </Button>
          </>
        ) : (
          <Link className="btn btn--quiet" to={`/lernen/${packId}`}>
            Übung abbrechen
          </Link>
        )}
      </div>
    </div>
  );
}
