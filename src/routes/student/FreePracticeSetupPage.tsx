import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Announcer, Button, Card } from '../../ui/components';
import { getPack } from '../../data/packRepo';
import { getProgressIndex } from '../../data/progressRepo';
import {
  EXERCISE_KINDS,
  EXERCISE_LABELS,
  GROUP_OF_KIND,
  KIND_GROUPS,
  KIND_GROUP_NAMES,
  kindsAvailableInPack,
  type ExerciseKind,
} from '../../domain/exercises';
import {
  FREE_ROUND_DEFAULT_LENGTH,
  FREE_ROUND_LENGTHS,
  freeAvailableCount,
  previewFreeRound,
} from '../../domain/freePractice';
import {
  DEFAULT_DIRECTION_CHOICE,
  DIRECTION_CHOICE_HINTS,
  DIRECTION_CHOICE_LABELS,
  directionChoicesFor,
  effectiveDirection,
  type DirectionChoice,
} from '../../domain/practiceDirection';
import { GRADE_LABELS } from '../../domain/cefr';
import type { EntryProgress, VocabPack } from '../../domain/schema';

/**
 * Freies Üben einrichten – Richtung, Umfang und Übungsformen.
 *
 * Bis Sprint 3B.2b steckte diese Auswahl in der Lernplan-Karte der Paketseite
 * und war dort ein zweiter, verwechselbarer Einstieg ins freie Üben. Sie ganz
 * zu streichen war der falsche Schluss: Wer gezielt Deutsch → Englisch oder nur
 * Lückensätze üben möchte, darf dafür nicht auf selbst getippte URL-Parameter
 * angewiesen sein. Seit Sprint 3B.2b1 steht sie deshalb hier – als eigener,
 * lazy geladener Schritt hinter „Runde anpassen“, sichtbar getrennt vom
 * Lernplan und ohne die Paketseite schwerer zu machen.
 *
 * Diese Seite **plant nur**. Sie schreibt keinen Lernstand (aus `data/` wird
 * ausschließlich gelesen) und baut keine zweite Übungslogik: Sie erzeugt die
 * bekannten URL-Parameter und überlässt der Übungsseite den Rest.
 */

/** Was am Ende in der Adresszeile steht – dieselben Parameter wie bisher. */
function buildRoundUrl(
  packId: string,
  choice: DirectionChoice,
  kinds: readonly ExerciseKind[],
  length: number,
  seed: number,
): string {
  const params = new URLSearchParams();
  params.set('mode', 'free');
  // Die Auswahl wird ausdrücklich mitgegeben – nur so ist die Runde genau die,
  // die die Vorschau gezeigt hat.
  if (kinds.length > 0) params.set('kinds', kinds.join(','));
  params.set('length', String(length));
  params.set('seed', String(seed));
  if (choice !== DEFAULT_DIRECTION_CHOICE) params.set('direction', choice);
  return `/lernen/${packId}/uebung?${params.toString()}`;
}

export function FreePracticeSetupPage() {
  const { packId = '' } = useParams();
  const navigate = useNavigate();

  const [pack, setPack] = useState<VocabPack | null>(null);
  const [progress, setProgress] = useState<ReadonlyMap<string, EntryProgress>>(new Map());
  const [loading, setLoading] = useState(true);

  const [choice, setChoice] = useState<DirectionChoice>(DEFAULT_DIRECTION_CHOICE);
  const [kinds, setKinds] = useState<ExerciseKind[]>([]);
  /** `null` = „Alle verfügbaren“; die Zahl ergibt sich aus der Richtung. */
  const [length, setLength] = useState<number | null>(FREE_ROUND_DEFAULT_LENGTH);
  const [status, setStatus] = useState('');
  const [seed] = useState(() => Date.now() >>> 0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const loaded = await getPack(packId);
      if (!active) return;
      if (loaded) {
        const index = await getProgressIndex(packId);
        if (!active) return;
        setProgress(index);
      }
      setPack(loaded ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [packId]);

  const entries = pack?.entries ?? [];
  const packDirection = pack?.meta.direction ?? 'en-de';

  /** Welche Formen dieses Paket in der gewählten Richtung wirklich hergibt. */
  const possibleKinds = useMemo(
    () => kindsAvailableInPack(entries, effectiveDirection(packDirection, choice)),
    [entries, packDirection, choice],
  );

  // Ohne eigene Wahl gilt „alles, was geht“ – so ist die Vorschau nie leer.
  const selected = kinds.length > 0 ? kinds : EXERCISE_KINDS.filter((kind) => possibleKinds.has(kind));

  const available = useMemo(
    () => freeAvailableCount(entries, packDirection, choice),
    [entries, packDirection, choice],
  );
  const requested = length ?? available;

  const preview = useMemo(
    () => previewFreeRound(entries, progress, packDirection, choice, selected, requested, seed),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `selected` ist aus kinds/possibleKinds abgeleitet.
    [entries, progress, packDirection, choice, kinds.join(','), requested, seed],
  );

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

  /**
   * Richtung wechseln – und dabei aufräumen.
   *
   * Lückensätze gibt es nur produktiv. Wer sie wählt und dann auf
   * Englisch → Deutsch wechselt, hätte sonst eine unsichtbare Auswahl. Was
   * wegfällt, wird gesagt, nicht stillschweigend entfernt.
   */
  function chooseDirection(next: DirectionChoice): void {
    const stillPossible = kindsAvailableInPack(entries, effectiveDirection(packDirection, next));
    setChoice(next);
    setKinds((current) => {
      const kept = current.filter((kind) => stillPossible.has(kind));
      const dropped = current.filter((kind) => !stillPossible.has(kind));
      if (dropped.length > 0) {
        setStatus(
          `${dropped.map((kind) => EXERCISE_LABELS[kind]).join(' und ')} ${
            dropped.length === 1 ? 'ist' : 'sind'
          } in dieser Richtung nicht möglich und wurde${dropped.length === 1 ? '' : 'n'} abgewählt.`,
        );
      } else {
        setStatus(`Richtung: ${DIRECTION_CHOICE_LABELS[next]}.`);
      }
      return kept;
    });
  }

  /** Mindestens eine Form muss stehen bleiben – sonst gäbe es keine Runde. */
  function toggleKind(kind: ExerciseKind): void {
    const current = selected;
    if (current.includes(kind)) {
      if (current.length === 1) {
        setStatus('Mindestens eine Übungsform muss ausgewählt bleiben.');
        return;
      }
      setKinds(current.filter((item) => item !== kind));
      setStatus(`${EXERCISE_LABELS[kind]} abgewählt.`);
      return;
    }
    setKinds([...current, kind]);
    setStatus(`${EXERCISE_LABELS[kind]} ausgewählt.`);
  }

  function start(): void {
    if (preview.plannedCount === 0) return;
    navigate(buildRoundUrl(packId, choice, selected, requested, seed));
  }

  const groupsWithKinds = KIND_GROUPS.map((group) => ({
    group,
    kinds: EXERCISE_KINDS.filter((kind) => GROUP_OF_KIND[kind] === group && possibleKinds.has(kind)),
  })).filter((entry) => entry.kinds.length > 0);

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Frei üben</p>
        <h1>{pack.meta.title}</h1>
        <p className="muted small">
          {GRADE_LABELS[pack.meta.grade]} · {pack.meta.cefrLevel} · Diese Runde verändert deinen
          Lernplan und deine Termine nicht.
        </p>
      </div>

      <Announcer message={status} />

      <Card>
        <h2>Runde anpassen</h2>

        {choices.length > 0 ? (
          <fieldset className="self-test__group">
            <legend>Richtung</legend>
            {choices.map((option) => (
              <label className="checkbox" key={option}>
                <input
                  type="radio"
                  name="free-direction"
                  value={option}
                  aria-label={DIRECTION_CHOICE_LABELS[option]}
                  aria-describedby={`free-direction-${option}-info`}
                  checked={choice === option}
                  onChange={() => chooseDirection(option)}
                />
                <span>
                  <strong>{DIRECTION_CHOICE_LABELS[option]}</strong>
                  <span id={`free-direction-${option}-info`} className="small muted">
                    {' '}
                    – {DIRECTION_CHOICE_HINTS[option]}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <fieldset className="self-test__group">
          <legend>Umfang der Runde</legend>
          {FREE_ROUND_LENGTHS.map((option) => (
            <label className="checkbox" key={option}>
              <input
                type="radio"
                name="free-length"
                value={option}
                checked={length === option}
                onChange={() => {
                  setLength(option);
                  setStatus(`Umfang: bis zu ${option} Aufgaben.`);
                }}
              />
              <span>Bis zu {option} Aufgaben</span>
            </label>
          ))}
          <label className="checkbox">
            <input
              type="radio"
              name="free-length"
              value="all"
              checked={length === null}
              onChange={() => {
                setLength(null);
                setStatus(`Umfang: alle verfügbaren Aufgaben.`);
              }}
            />
            <span>Alle verfügbaren ({available})</span>
          </label>
        </fieldset>

        <fieldset className="self-test__group">
          <legend>Übungsformen</legend>
          {/* Nach Anspruch gruppiert – der Name der Gruppe steht als Text da,
              nicht nur als Anordnung. */}
          {groupsWithKinds.map(({ group, kinds: groupKinds }) => (
            <div className="kind-group" key={group}>
              <p className="kind-group__name">{KIND_GROUP_NAMES[group]}</p>
              {groupKinds.map((kind) => (
                <label className="checkbox" key={kind}>
                  <input
                    type="checkbox"
                    checked={selected.includes(kind)}
                    onChange={() => toggleKind(kind)}
                  />
                  <span>{EXERCISE_LABELS[kind]}</span>
                </label>
              ))}
            </div>
          ))}
          <p className="small muted" style={{ margin: '0.4rem 0 0' }}>
            Angeboten wird nur, was dieses Paket in dieser Richtung hergibt. Mindestens eine
            Übungsform muss ausgewählt bleiben.
          </p>
        </fieldset>

        {/*
          Ehrliche Vorschau in drei Schritten: was es gibt, was die gewählten
          Formen davon hergeben, was daraus wirklich wird. Gebaut wird dabei die
          Runde, die gleich startet – gezählt wird nicht geschätzt.
        */}
        <div className="self-test__preview">
          <p style={{ margin: 0 }}>
            <strong>{available}</strong>{' '}
            {available === 1 ? 'Aufgabe steht' : 'Aufgaben stehen'} in dieser Richtung zur
            Verfügung.
          </p>
          <p style={{ margin: '0.3rem 0 0' }}>
            Für <strong>{preview.possibleCount}</strong> davon ist eine der gewählten Übungsformen
            möglich.
          </p>
          <p style={{ margin: '0.3rem 0 0' }}>
            <strong>{preview.plannedCount}</strong>{' '}
            {preview.plannedCount === 1 ? 'Aufgabe wird' : 'Aufgaben werden'} eingeplant.
          </p>
          {preview.remainingAvailableCount > 0 ? (
            <p className="small muted" style={{ margin: '0.3rem 0 0' }}>
              Die übrigen {preview.remainingAvailableCount} folgen in einer weiteren Runde – wegen
              der gewählten Rundengröße oder weil zwischen beiden Richtungen einer Vokabel Abstand
              bleiben muss.
            </p>
          ) : preview.possibleCount < requested ? (
            <p className="small muted" style={{ margin: '0.3rem 0 0' }}>
              Mehr gibt dieses Paket mit dieser Auswahl nicht her – erfunden wird nichts.
            </p>
          ) : null}
        </div>

        {preview.plannedCount === 0 ? (
          <Alert tone="info">
            Mit dieser Auswahl ist keine Aufgabe möglich. Die gewählten Übungsformen gibt dieses
            Paket in dieser Richtung nicht her – wähle zusätzlich eine andere Übungsform oder eine
            andere Richtung.
          </Alert>
        ) : null}

        <div className="row" style={{ marginTop: '1rem' }}>
          <Button variant="primary" onClick={start} disabled={preview.plannedCount === 0}>
            Frei üben starten
          </Button>
          <Link className="btn" to={`/lernen/${packId}`}>
            Zurück zum Paket
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default FreePracticeSetupPage;
