import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Field, Meter } from '../../ui/components';
import { getPack } from '../../data/packRepo';
import { getPackProgress, getProgressIndex, resetPackProgress } from '../../data/progressRepo';
import {
  EXERCISE_KINDS,
  EXERCISE_LABELS,
  countReady,
  kindsAvailableInPack,
  type ExerciseKind,
} from '../../domain/exercises';
import {
  activeDirections,
  DIRECTION_LABELS,
  LEITNER_BOX_MAX,
  TASK_DIRECTION_LABELS,
  type EntryProgress,
  type TaskDirection,
  type VocabPack,
} from '../../domain/schema';
import { GRADE_LABELS } from '../../domain/cefr';
import {
  BOX_INTERVAL_DAYS,
  countMastered,
  directionBreakdown,
  type DirectionBreakdown,
} from '../../domain/leitner';
import { directionKey } from '../../domain/ids';

const LENGTHS = [10, 15, 25, 50] as const;

interface DirectionStand {
  direction: TaskDirection;
  breakdown: DirectionBreakdown;
  mastered: number;
  ready: number;
}

export function PackDetailPage() {
  const { packId = '' } = useParams();
  const navigate = useNavigate();

  const [pack, setPack] = useState<VocabPack | null>(null);
  const [stands, setStands] = useState<DirectionStand[]>([]);
  const [mastered, setMastered] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedKinds, setSelectedKinds] = useState<ExerciseKind[]>([]);
  const [length, setLength] = useState<number>(15);
  const [confirmReset, setConfirmReset] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const loaded = await getPack(packId);
      if (!active) return;
      setPack(loaded ?? null);

      if (loaded) {
        const progress: ReadonlyMap<string, EntryProgress> = await getProgressIndex(packId);
        const packProgress = await getPackProgress(packId);
        if (!active) return;

        const directions = activeDirections(loaded.meta.direction);
        const entryIds = loaded.entries.map((entry) => entry.id);
        const now = Date.now();

        setStands(
          directions.map((direction) => ({
            direction,
            breakdown: directionBreakdown(entryIds, progress, direction, loaded.meta.direction),
            mastered: entryIds.filter(
              (entryId) =>
                (progress.get(directionKey(entryId, direction))?.box ?? 0) >= LEITNER_BOX_MAX,
            ).length,
            ready: countReady(
              loaded.entries,
              progress,
              loaded.meta.direction,
              new Date(now),
              direction,
            ),
          })),
        );
        setMastered(countMastered(entryIds, progress, directions));
        setSessionCount(packProgress.sessionCount);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [packId, reloadToken]);

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

  const possibleKinds = kindsAvailableInPack(pack.entries, pack.meta.direction);
  const bothDirections = pack.meta.direction === 'both';
  const totalReady = stands.reduce((sum, stand) => sum + stand.ready, 0);

  function toggleKind(kind: ExerciseKind): void {
    setSelectedKinds((current) =>
      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
    );
  }

  function start(): void {
    const params = new URLSearchParams();
    if (selectedKinds.length > 0) params.set('kinds', selectedKinds.join(','));
    params.set('length', String(length));
    navigate(`/lernen/${packId}/uebung?${params.toString()}`);
  }

  async function handleReset(): Promise<void> {
    await resetPackProgress(packId);
    setConfirmReset(false);
    setReloadToken((token) => token + 1);
  }

  return (
    <div className="stack">
      <div>
        <h1>{pack.meta.title}</h1>
        <p className="muted small">
          {GRADE_LABELS[pack.meta.grade]} · {pack.meta.cefrLevel} ·{' '}
          {DIRECTION_LABELS[pack.meta.direction]} · {pack.entries.length} Vokabeln
          {pack.meta.topic ? ` · ${pack.meta.topic}` : ''}
        </p>
        {pack.meta.description ? <p>{pack.meta.description}</p> : null}
      </div>

      <Card>
        <h2>Dein Lernstand</h2>
        <Meter value={mastered} max={pack.entries.length} label="Sicher gelernte Vokabeln" />
        <p className="small muted" style={{ marginTop: '0.4rem' }}>
          {mastered} von {pack.entries.length} Vokabeln sicher
          {bothDirections ? ' (in beiden Richtungen in Fach 5)' : ` (Fach ${LEITNER_BOX_MAX})`} ·{' '}
          {totalReady} Aufgaben jetzt bereit · {sessionCount} Übungsrunden bisher
        </p>

        <div className="stands">
          {stands.map((stand) => {
            // „Neu“ ist eine eigene Säule vor Fach 1 – noch nie geübte Vokabeln
            // sind nicht dasselbe wie zurückgestufte.
            const columns = [
              { label: 'Neu', count: stand.breakdown.fresh, isNew: true },
              ...stand.breakdown.boxes.map((count, index) => ({
                label: `Fach ${index + 1}`,
                count,
                isNew: false,
              })),
            ];
            const peak = Math.max(1, ...columns.map((column) => column.count));
            const notStarted =
              stand.breakdown.locked > 0 &&
              stand.breakdown.fresh === 0 &&
              stand.breakdown.boxes.every((count) => count === 0);

            return (
              <div key={stand.direction} className="stand">
                <h3 style={{ fontSize: '0.95rem', marginBottom: '0.35rem' }}>
                  {TASK_DIRECTION_LABELS[stand.direction]}
                </h3>
                {notStarted ? (
                  <p className="small muted" style={{ margin: 0 }}>
                    Produktiv noch nicht begonnen – wird nach der ersten erfolgreichen
                    rezeptiven Wiederholung freigeschaltet.
                  </p>
                ) : (
                  <>
                    <div
                      className="boxes"
                      role="img"
                      aria-label={`${TASK_DIRECTION_LABELS[stand.direction]}: ${columns
                        .map((column) => `${column.label}: ${column.count}`)
                        .join(', ')}${
                        stand.breakdown.locked > 0
                          ? `, noch nicht freigeschaltet: ${stand.breakdown.locked}`
                          : ''
                      }`}
                    >
                      {columns.map((column) => (
                        <div
                          key={column.label}
                          className={`boxes__bar${column.isNew ? ' boxes__bar--new' : ''}`}
                          style={{ height: `${Math.max(4, (column.count / peak) * 100)}%` }}
                        />
                      ))}
                    </div>
                    <p className="small muted mono" style={{ margin: '0.3rem 0 0' }}>
                      {columns.map((column) => `${column.label}: ${column.count}`).join(' · ')}
                    </p>
                    <p className="small muted" style={{ margin: '0.15rem 0 0' }}>
                      {stand.mastered} von {pack.entries.length} in Fach {LEITNER_BOX_MAX} ·{' '}
                      {stand.ready} bereit
                      {stand.breakdown.locked > 0
                        ? ` · ${stand.breakdown.locked} noch nicht freigeschaltet`
                        : ''}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <p className="small muted" style={{ marginTop: '0.5rem' }}>
          „Neu“ = in dieser Richtung noch nie geübt · Wiederholung der Fächer 1–5 nach{' '}
          {Object.values(BOX_INTERVAL_DAYS)
            .map((days) => (days === 0 ? 'sofort' : `${days} T`))
            .join(' · ')}
        </p>
        {bothDirections ? (
          <p className="small muted" style={{ margin: 0 }}>
            Beide Richtungen werden getrennt gezählt. Eine Vokabel gilt erst als sicher, wenn
            du sie in beiden Richtungen beherrschst.
          </p>
        ) : null}
      </Card>

      <Card>
        <h2>Übung starten</h2>
        <fieldset style={{ border: 0, padding: 0, margin: '0 0 1rem' }}>
          <legend style={{ fontWeight: 560, fontSize: '0.92rem', padding: 0 }}>Übungsformen</legend>
          <p className="field__hint" style={{ marginBottom: '0.5rem' }}>
            Ohne Auswahl passt sich die Übungsform automatisch an dein Leitner-Fach an.
          </p>
          <div className="row">
            {EXERCISE_KINDS.map((kind) => (
              <label key={kind} className="checkbox">
                <input
                  type="checkbox"
                  checked={selectedKinds.includes(kind)}
                  disabled={!possibleKinds.has(kind)}
                  onChange={() => toggleKind(kind)}
                />
                <span>
                  {EXERCISE_LABELS[kind]}
                  {!possibleKinds.has(kind) ? (
                    <span className="muted small"> – in diesem Paket nicht möglich</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Umfang der Runde">
          {(props) => (
            <select
              {...props}
              value={length}
              onChange={(event) => setLength(Number(event.target.value))}
            >
              {LENGTHS.map((value) => (
                <option key={value} value={value}>
                  {value} Aufgaben
                </option>
              ))}
              <option value={pack.entries.length * (bothDirections ? 2 : 1)}>
                alle ({pack.entries.length * (bothDirections ? 2 : 1)})
              </option>
            </select>
          )}
        </Field>

        <p className="field__hint" style={{ marginTop: '0.4rem' }}>
          Falsch oder fast richtig beantwortete Aufgaben kommen in derselben Runde noch
          einmal – die Runde kann dadurch länger werden.
        </p>

        <div className="row" style={{ marginTop: '1rem' }}>
          <Button variant="primary" onClick={start}>
            Übung starten
          </Button>
          <Link className="btn" to="/lernen">
            Zurück
          </Link>
        </div>
      </Card>

      <Card quiet>
        <h2 style={{ fontSize: '1rem' }}>Lernstand zurücksetzen</h2>
        <p className="small muted">
          Setzt alle Fächer dieses Pakets auf den Anfang zurück. Die Vokabeln bleiben erhalten.
        </p>
        {confirmReset ? (
          <div className="row">
            <span className="small">Lernstand wirklich zurücksetzen?</span>
            <Button small variant="danger" onClick={() => void handleReset()}>
              Zurücksetzen
            </Button>
            <Button small variant="quiet" onClick={() => setConfirmReset(false)}>
              Abbrechen
            </Button>
          </div>
        ) : (
          <Button small onClick={() => setConfirmReset(true)}>
            Lernstand zurücksetzen
          </Button>
        )}
      </Card>

      {!possibleKinds.has('cloze-free') ? (
        <Alert tone="info">
          Lückensätze brauchen die produktive Richtung „Deutsch → Englisch“ (oder „beide
          Richtungen“) und einen Beispielsatz, der die Vokabel enthält.
        </Alert>
      ) : null}
    </div>
  );
}
