import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Field, Meter } from '../../ui/components';
import { getPack } from '../../data/packRepo';
import { getPackProgress, getProgressIndex, resetPackProgress } from '../../data/progressRepo';
import {
  EXERCISE_KINDS,
  EXERCISE_LABELS,
  kindsAvailableInPack,
  mulberry32,
  planSession,
  type ExerciseKind,
} from '../../domain/exercises';
import { planFreeSession } from '../../domain/freePractice';
import {
  DEFAULT_DIRECTION_CHOICE,
  DIRECTION_CHOICE_HINTS,
  DIRECTION_CHOICE_LABELS,
  directionChoicesFor,
  effectiveDirection,
  type DirectionChoice,
} from '../../domain/practiceDirection';
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
import { formatDueDate } from '../../domain/dueDate';
import { directionKey } from '../../domain/ids';

/** Obergrenzen für eine Runde – es werden nie mehr als die bereiten Aufgaben geplant. */
const LENGTH_LIMITS = [10, 15, 25, 50] as const;

/**
 * Rundengröße für den Ein-Klick-Einstieg ins freie Üben.
 *
 * Freies Üben ist seit Sprint 3B.2b eine der vier freiwilligen Lernweisen und
 * startet ohne Vorabeinstellungen. Wer die Runde genauer zuschneiden will,
 * findet die Feineinstellungen weiterhin im Lernplan darunter – dort aber
 * ausdrücklich für den Lernplan, nicht als zweiter Weg ins freie Üben.
 */
const FREE_ROUND_LENGTH = 15;

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
  const [progress, setProgress] = useState<ReadonlyMap<string, EntryProgress>>(new Map());
  const [stands, setStands] = useState<DirectionStand[]>([]);
  const [mastered, setMastered] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedKinds, setSelectedKinds] = useState<ExerciseKind[]>([]);
  const [length, setLength] = useState<number>(15);
  const [confirmReset, setConfirmReset] = useState(false);
  /** Richtung dieser Runde. „Gemischt“ ist die Empfehlung, nicht die Vorschrift. */
  const [directionChoice, setDirectionChoice] = useState<DirectionChoice>(
    DEFAULT_DIRECTION_CHOICE,
  );
  const [reloadToken, setReloadToken] = useState(0);
  /**
   * Derselbe Seed geht an die Übungsseite. Nur so entspricht die angezeigte
   * Zahl „… werden eingeplant“ exakt der später tatsächlich gebauten Runde.
   */
  const [seed, setSeed] = useState(() => Date.now() >>> 0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const loaded = await getPack(packId);
      if (!active) return;
      setPack(loaded ?? null);

      if (loaded) {
        const index = await getProgressIndex(packId);
        const packProgress = await getPackProgress(packId);
        if (!active) return;

        const directions = activeDirections(loaded.meta.direction);
        const entryIds = loaded.entries.map((entry) => entry.id);
        const now = new Date();

        setProgress(index);
        setStands(
          directions.map((direction) => ({
            direction,
            breakdown: directionBreakdown(entryIds, index, direction, loaded.meta.direction),
            mastered: entryIds.filter(
              (entryId) => (index.get(directionKey(entryId, direction))?.box ?? 0) >= LEITNER_BOX_MAX,
            ).length,
            ready: planSession(
              loaded.entries,
              index,
              loaded.meta.direction,
              Number.MAX_SAFE_INTEGER,
              now,
              mulberry32(1),
            ).targets.filter((target) => target.direction === direction).length,
          })),
        );
        setMastered(countMastered(entryIds, index, directions));
        setSessionCount(packProgress.sessionCount);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [packId, reloadToken]);

  // Eine einzige Planungsquelle für Anzeige und Runde.
  const plan = useMemo(() => {
    if (!pack) return null;
    return planSession(
      pack.entries,
      progress,
      effectiveDirection(pack.meta.direction, directionChoice),
      length,
      new Date(),
      mulberry32(seed),
    );
  }, [pack, progress, length, seed, directionChoice]);

  // Getrennte Planung mit demselben Seed – Vorschau und Runde bleiben gleich.
  const freePlan = useMemo(() => {
    if (!pack) return null;
    return planFreeSession(
      pack.entries,
      progress,
      effectiveDirection(pack.meta.direction, directionChoice),
      length,
      mulberry32(seed),
    );
  }, [pack, progress, length, seed, directionChoice]);

  if (loading) return <p className="muted">Paket wird geladen …</p>;
  if (!pack || !plan || !freePlan) {
    return (
      <div className="stack">
        <h1>Paket nicht gefunden</h1>
        <Link className="btn" to="/lernen">
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  // Die Richtungswahl gibt es nur, wo sie eine echte Wahl ist.
  const directionOptions = directionChoicesFor(pack.meta.direction);
  const roundDirection = effectiveDirection(pack.meta.direction, directionChoice);
  const possibleKinds = kindsAvailableInPack(pack.entries, roundDirection);

  /**
   * Richtung wechseln – und dabei aufräumen.
   *
   * Lückensätze gibt es nur produktiv. Wer sie auswählt und dann auf
   * Englisch → Deutsch wechselt, hätte sonst eine unsichtbare Auswahl, die die
   * Runde leer laufen ließe.
   */
  const entries = pack.entries;
  const packDirection = pack.meta.direction;

  function chooseDirection(next: DirectionChoice): void {
    setDirectionChoice(next);
    const stillPossible = kindsAvailableInPack(entries, effectiveDirection(packDirection, next));
    setSelectedKinds((current) => current.filter((kind) => stillPossible.has(kind)));
  }
  const bothDirections = pack.meta.direction === 'both';
  const lockedTotal = stands.reduce((sum, stand) => sum + stand.breakdown.locked, 0);

  const scheduledPossible = plan.readyCount > 0;
  const freePossible = freePlan.availableCount > 0;
  /*
    Diese Karte plant seit Sprint 3B.2b ausschließlich den Lernplan. Die frühere
    Modusauswahl („Lernplan“ / „Frei üben“) war ein zweiter Einstieg ins freie
    Üben und stand damit in Konkurrenz zur Karte „Auf eigene Weise lernen“.
  */
  const canStart = plan.plannedCount > 0;
  const availableForRound = plan.readyCount;

  function toggleKind(kind: ExerciseKind): void {
    setSelectedKinds((current) =>
      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
    );
  }

  function start(): void {
    const params = new URLSearchParams();
    // Nur was in dieser Richtung überhaupt möglich ist. Eine unmögliche
    // Übungsform in der URL ergäbe eine Runde ohne Aufgaben.
    const kinds = selectedKinds.filter((kind) => possibleKinds.has(kind));
    if (kinds.length > 0) params.set('kinds', kinds.join(','));
    params.set('length', String(length));
    params.set('seed', String(seed));
    // Ohne `mode` gilt der Lernplan – freies Üben startet über die Karte darüber.
    // Die Richtung: ohne Angabe übt die Runde gemischt.
    if (directionChoice !== DEFAULT_DIRECTION_CHOICE) params.set('direction', directionChoice);
    navigate(`/lernen/${packId}/uebung?${params.toString()}`);
  }

  async function handleReset(): Promise<void> {
    await resetPackProgress(packId);
    setConfirmReset(false);
    setSeed(Date.now() >>> 0);
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
          {plan.readyCount} Aufgaben jetzt bereit · {sessionCount} Übungsrunden bisher
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

      {/*
        Vier freiwillige Wege, gleichrangig nebeneinander. Sie hängen an keiner
        Fälligkeit und an keiner Freischaltung – und sie verändern nichts.
        Der Lernplan darunter bleibt der empfohlene Weg.

        Seit Sprint 3B.2b ist das der **einzige** Einstieg ins freie Üben: Die
        frühere Modusauswahl in der Lernplan-Karte war ein zweiter Weg zur
        selben Sache und damit eine Einladung zur Verwechslung.
      */}
      <Card>
        <h2>Auf eigene Weise lernen</h2>
        <p className="muted small">
          Diese vier Wege verändern deinen Lernstand nicht. Du kannst sie jederzeit nutzen.
        </p>

        <ul className="study-options">
          <li className="study-option">
            <h3 className="study-option__title">Vokabeln durchsehen</h3>
            <p className="study-option__text">
              Alle Wörter in Ruhe ansehen und Übersetzungen selbst aufdecken.
            </p>
            <Link className="btn" to={`/lernen/${packId}/durchsehen`}>
              Vokabeln durchsehen
            </Link>
          </li>

          <li className="study-option">
            <h3 className="study-option__title">Mit Karten lernen</h3>
            <p className="study-option__text">
              Vorderseite ansehen, Lösung aufdecken und im eigenen Tempo weitergehen.
            </p>
            <Link className="btn" to={`/lernen/${packId}/karten`}>
              Mit Karten lernen
            </Link>
          </li>

          <li className="study-option">
            <h3 className="study-option__title">Selbsttest</h3>
            <p className="study-option__text">
              Teste dich mit einer kurzen, gemischten Runde. Das Ergebnis bleibt auf diesem
              Gerät und verändert deinen Lernplan nicht.
            </p>
            <Link className="btn" to={`/lernen/${packId}/selbsttest`}>
              Selbsttest starten
            </Link>
          </li>

          <li className="study-option">
            <h3 className="study-option__title">Frei üben</h3>
            <p className="study-option__text">
              Richtig abgefragt werden, ohne dass sich Fächer oder Termine ändern.{' '}
              {freePossible ? (
                <>
                  {freePlan.availableCount}{' '}
                  {freePlan.availableCount === 1 ? 'Aufgabe ist' : 'Aufgaben sind'} verfügbar.
                </>
              ) : (
                <>Dafür ist bisher nichts freigeschaltet.</>
              )}
            </p>
            {/*
              Ohne freigeschaltete Aufgaben liefe die Runde leer. Statt eines
              Knopfes, der ins Nichts führt, steht hier der ehrliche Grund.
            */}
            {freePossible ? (
              <Link
                className="btn"
                to={`/lernen/${packId}/uebung?mode=free&length=${FREE_ROUND_LENGTH}&seed=${seed}`}
              >
                Frei üben starten
              </Link>
            ) : null}
          </li>
        </ul>
      </Card>

      <Card>
        <h2>Nach Lernplan üben</h2>
        <p className="muted small">
          Der empfohlene Weg: neue und jetzt fällige Aufgaben. Nur diese Runde verändert deine
          Fächer und Termine.
        </p>

        {!scheduledPossible ? (
          <Alert tone="info">
            {plan.nextDueAt ? (
              <>
                Gerade ist nichts fällig – gut so. Die nächste Wiederholung steht{' '}
                <strong>{formatDueDate(plan.nextDueAt)}</strong> an.
                {freePossible ? ' Frei üben kannst du trotzdem jederzeit.' : ''}
              </>
            ) : lockedTotal > 0 ? (
              <>
                Für die produktive Richtung ist noch nichts freigeschaltet. Übe zuerst
                Englisch → Deutsch; danach kommt Deutsch → Englisch automatisch dazu.
              </>
            ) : pack.entries.length === 0 ? (
              <>Dieses Paket enthält keine Vokabeln.</>
            ) : (
              <>Für dieses Paket gibt es gerade nichts zu üben.</>
            )}
          </Alert>
        ) : null}

        {directionOptions.length > 0 ? (
          <fieldset className="modes" style={{ border: 0, padding: 0, margin: '0 0 1rem' }}>
            <legend style={{ fontWeight: 560, fontSize: '0.92rem', padding: 0 }}>
              In welche Richtung möchtest du üben?
            </legend>
            {directionOptions.map((choice) => (
              <label className="mode" key={choice}>
                <input
                  type="radio"
                  name="practice-direction"
                  value={choice}
                  aria-label={DIRECTION_CHOICE_LABELS[choice]}
                  aria-describedby={`direction-${choice}-info`}
                  checked={directionChoice === choice}
                  onChange={() => chooseDirection(choice)}
                />
                <span>
                  <strong>{DIRECTION_CHOICE_LABELS[choice]}</strong>
                  <span id={`direction-${choice}-info`} className="small muted">
                    {' '}
                    – {DIRECTION_CHOICE_HINTS[choice]}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {canStart ? (
          <p style={{ marginBottom: '1rem' }}>
            <strong>{availableForRound}</strong>{' '}
            {availableForRound === 1 ? 'Aufgabe ist' : 'Aufgaben sind'} jetzt bereit.
            {plan.plannedCount !== availableForRound ? (
              <>
                {' '}
                <strong>{plan.plannedCount}</strong>{' '}
                {plan.plannedCount === 1 ? 'Aufgabe wird' : 'Aufgaben werden'} für diese Runde
                eingeplant.
                <br />
                <span className="small muted">
                  Die übrigen {plan.remainingReadyCount} folgen in einer weiteren Runde – wegen
                  der gewählten Rundengröße oder weil zwischen beiden Richtungen einer Vokabel
                  Abstand bleiben muss.
                </span>
              </>
            ) : null}
          </p>
        ) : null}

        <fieldset
          style={{ border: 0, padding: 0, margin: '0 0 1rem' }}
          disabled={!canStart}
        >
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

        <Field
          label="Umfang der Runde"
          hint="Obergrenze. Es werden nie mehr Aufgaben geplant, als gerade bereit sind."
        >
          {(props) => (
            <select
              {...props}
              value={length}
              disabled={!canStart}
              onChange={(event) => setLength(Number(event.target.value))}
            >
              {LENGTH_LIMITS.map((value) => (
                <option key={`limit-${value}`} value={value}>
                  Bis zu {value} Aufgaben
                </option>
              ))}
              {availableForRound > 0 ? (
                <option key="all-available" value={availableForRound}>
                  Alle bereiten ({availableForRound})
                </option>
              ) : null}
            </select>
          )}
        </Field>

        <p className="field__hint" style={{ marginTop: '0.4rem' }}>
          Falsch oder fast richtig beantwortete Aufgaben kommen in derselben Runde noch
          einmal – die Runde kann dadurch länger werden.
        </p>

        <div className="row" style={{ marginTop: '1rem' }}>
          <Button variant="primary" onClick={start} disabled={!canStart}>
            Lernrunde starten
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
