import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Field, Meter } from '../../ui/components';
import { InfoDisclosure } from '../../ui/InfoDisclosure';
import { PackArt } from '../../ui/PackArt';
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
import { FREE_ROUND_DEFAULT_LENGTH, planFreeSession } from '../../domain/freePractice';
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
import { libraryLink } from '../../portable/singlePack';

/** Obergrenzen für eine Runde – es werden nie mehr als die bereiten Aufgaben geplant. */
const LENGTH_LIMITS = [10, 15, 25, 50] as const;

/**
 * Rundengröße für „Direkt starten“.
 *
 * Der Direktstart nimmt bewusst keine Einstellungen entgegen: gemischte
 * Richtung, automatisch passende Übungsformen, bis zu 15 Aufgaben. Wer Richtung,
 * Umfang oder Übungsformen selbst wählen will, geht über „Runde anpassen“ auf
 * die Einrichtungsseite – nicht über selbst getippte URL-Parameter.
 */
const FREE_ROUND_LENGTH = FREE_ROUND_DEFAULT_LENGTH;

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
  const library = libraryLink();
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
      {/*
        Derselbe Kopfaufbau wie in den Lernansichten: Titel links, Weg zurück
        rechts oben. In einer exportierten Einzelpaket-Datei heißt er „Start“
        und führt auf die Startseite – eine Bibliothek gibt es dort nicht.
      */}
      <div className="learn-header">
        <div className="learn-header__bar">
          <div className="learn-header__titles">
            <h1>{pack.meta.title}</h1>
            <p className="muted small learn-header__status">
              {GRADE_LABELS[pack.meta.grade]} · {pack.meta.cefrLevel} ·{' '}
              {DIRECTION_LABELS[pack.meta.direction]} · {pack.entries.length} Vokabeln
              {pack.meta.topic ? ` · ${pack.meta.topic}` : ''}
            </p>
          </div>
          <nav className="learn-header__actions" aria-label="Paketnavigation">
            <Link className="btn btn--small" to={library.to}>
              {library.label}
            </Link>
          </nav>
        </div>
        {/*
          Die Beschreibung der Lehrkraft, dezent unter dem Titel.

          Sie ist ein Hinweis, keine Überschrift: gedämpft und klein, damit sie
          den Lernstand nicht verdrängt – aber unübersehbar genug, dass man sie
          vor der ersten Runde liest.
        */}
        {pack.meta.description ? (
          <p className="muted small pack-description">{pack.meta.description}</p>
        ) : null}
      </div>

      {/*
        Der Lernstand, schlank (Sprint 4B.6).

        Vorher stand hier eine ganze Karte: Balken, ein Säulendiagramm je
        Richtung, eine Zeile in Schreibmaschinenschrift mit sechs Fächern und
        zwei Zeilen Erklärung dazu. Bei einem frischen Paket sagte das
        Diagramm „Neu: 6, Fach 1–5: 0“ – fünf leere Säulen für eine Auskunft,
        die in vier Wörtern passt.

        Geblieben ist die Zahl, um die es geht: Wie weit bin ich mit **diesem**
        Paket? Die Fächer sind nicht weg, sie liegen einen Klick tief. Wer
        wissen will, wie sich das verteilt, findet es; wer lernen will, kommt
        daran vorbei.
      */}
      <section className="standbar">
        <p className="standbar__figure">
          <strong>{mastered}</strong>
          <span>von {pack.entries.length} sicher</span>
        </p>

        <div className="standbar__meter">
          <Meter value={mastered} max={pack.entries.length} label="Sicher gelernte Vokabeln" />
          <p className="standbar__meta">
            {plan.readyCount} {plan.readyCount === 1 ? 'Aufgabe' : 'Aufgaben'} bereit ·{' '}
            {sessionCount} {sessionCount === 1 ? 'Runde' : 'Runden'} bisher
          </p>
        </div>

        <InfoDisclosure
          className="info--end"
          label="Wie sich der Lernstand auf die Fächer verteilt"
          title="Deine Fächer"
        >
          <p style={{ margin: 0 }}>
            {mastered} von {pack.entries.length} Vokabeln sicher
            {bothDirections ? ' (in beiden Richtungen in Fach 5)' : ` (Fach ${LEITNER_BOX_MAX})`}.
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

          <p className="small muted" style={{ margin: 0 }}>
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
        </InfoDisclosure>
      </section>

      {/*
        Vier freiwillige Wege, gleichrangig nebeneinander. Sie hängen an keiner
        Fälligkeit und an keiner Freischaltung – und sie verändern nichts.
        Der Lernplan darunter bleibt der empfohlene Weg.

        Seit Sprint 3B.2b ist das der **einzige** Einstieg ins freie Üben: Die
        frühere Modusauswahl in der Lernplan-Karte war ein zweiter Weg zur
        selben Sache und damit eine Einladung zur Verwechslung.
      */}
      <section aria-labelledby="eigene-wege">
        <div className="section-head">
          <h2 id="eigene-wege" className="display display--section">
            Auf eigene Weise lernen
          </h2>
          <p className="muted small" style={{ margin: 0 }}>
            Verändert deinen Lernstand nicht.
          </p>
        </div>

        {/*
          Vier Wege als Bildkarten (Sprint 4B.6).

          Vorher waren es vier beige Kästen mit je einer Überschrift, zwei
          Zeilen Text und einem Knopf – gleich groß, gleich still, und beim
          Überfliegen nicht auseinanderzuhalten. Ein Motiv je Weg gibt jedem
          ein Gesicht: Man erkennt „Karten“ am Bild, bevor man das Wort liest.

          Die Motive kommen aus demselben Verfahren wie die der Pakete, nur mit
          festen Saaten. Der Weg „Karten“ sieht deshalb in jedem Paket gleich
          aus – er ist ja auch überall derselbe.
        */}
        <ul className="modes">
          <li className="mode-card">
            <div className="mode-card__art">
              <PackArt seed="lexiflow:durchsehen" />
            </div>
            <div className="mode-card__body">
              <h3 className="mode-card__title">
                <Link className="mode-card__link" to={`/lernen/${packId}/durchsehen`}>
                  Vokabeln durchsehen
                </Link>
              </h3>
              <p className="mode-card__text">
                Alle Wörter in Ruhe ansehen und Übersetzungen selbst aufdecken.
              </p>
            </div>
          </li>

          <li className="mode-card">
            <div className="mode-card__art">
              <PackArt seed="lexiflow:karteikarten" />
            </div>
            <div className="mode-card__body">
              <h3 className="mode-card__title">
                <Link className="mode-card__link" to={`/lernen/${packId}/karten`}>
                  Mit Karten lernen
                </Link>
              </h3>
              <p className="mode-card__text">
                Vorderseite ansehen, Lösung aufdecken und im eigenen Tempo weitergehen.
              </p>
            </div>
          </li>

          <li className="mode-card">
            <div className="mode-card__art">
              <PackArt seed="lexiflow:selbsttest" />
            </div>
            <div className="mode-card__body">
              <h3 className="mode-card__title">
                <Link className="mode-card__link" to={`/lernen/${packId}/selbsttest`}>
                  Selbsttest starten
                </Link>
              </h3>
              <p className="mode-card__text">
                Rückmeldung erst am Ende, als Ergebnis mit Fehlerübersicht. Kein Lernstand.
              </p>
            </div>
          </li>

          <li className="mode-card">
            <div className="mode-card__art">
              <PackArt seed="lexiflow:frei ueben" />
            </div>
            <div className="mode-card__body">
              <h3 className="mode-card__title">
                {freePossible ? (
                  <Link
                    className="mode-card__link"
                    to={`/lernen/${packId}/uebung?mode=free&length=${FREE_ROUND_LENGTH}&seed=${seed}`}
                  >
                    Frei üben
                  </Link>
                ) : (
                  'Frei üben'
                )}
              </h3>
              <p className="mode-card__text">
                Rückmeldung sofort nach jeder Antwort, ohne Ergebnisdruck. Kein Lernstand.{' '}
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
                „Runde anpassen“ steht klein darunter, der Titel selbst startet
                sofort. Ohne freigeschaltete Aufgaben führt nichts ins Leere –
                dann ist der Titel kein Link, und der Grund steht darüber.
              */}
              {freePossible ? (
                <p className="mode-card__aside">
                  <Link className="btn btn--small btn--quiet" to={`/lernen/${packId}/frei`}>
                    Runde anpassen
                  </Link>
                </p>
              ) : null}
            </div>
          </li>
        </ul>

        {/*
          Die Vokabelliste steht **unter** den Lernwegen und ist bewusst kein
          fünfter Weg.

          Sie ist nützlich – manche lernen besser vom Papier, und vor einer
          Arbeit will man den Zettel in der Hand haben. Aber sie ist kein
          Lernweg, und als gleich großer Kasten neben „Mit Karten lernen“
          stünde sie da wie einer. Eine ruhige Zeile darunter ist erreichbar,
          ohne die vier Wege zu verdrängen.
        */}
        <p className="study-aside">
          <Link className="btn btn--small btn--quiet" to={`/lernen/${packId}/liste`}>
            Vokabelliste
          </Link>{' '}
          <span className="small muted">
            Alle Wörter als Tabelle – zum Ausdrucken, als PDF sichern oder als .csv
            herunterladen.
          </span>
        </p>
      </section>

      <Card>
        <h2>Nach Lernplan üben</h2>
        <p className="muted small">
          Der empfohlene Weg: neue und jetzt fällige Aufgaben. Nur diese Runde verändert deinen
          Lernstand und berücksichtigt Fälligkeiten.
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
