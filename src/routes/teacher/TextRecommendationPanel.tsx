import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Announcer, Button, Card, Field } from '../../ui/components';
import { useProviders } from '../../providers/ProviderContext';
import { CEFR_LEVELS, GRADES, GRADE_LABELS, type CefrLevel, type Grade } from '../../domain/cefr';
import {
  buildCandidateContext,
  describeRecommendations,
  resolveRecommendations,
} from '../../import/textRecommendation';
import { MAX_CONTEXT_CANDIDATES } from '../../ai/AiProvider';
import type { TextCandidate } from '../../domain/textExtraction';
import type { LearningContext } from '../../import/enrichment';
import type { ProviderState } from '../../providers/state';

/**
 * **Außer Dienst seit Sprint 4B.1.** Kein Aufrufer rendert diese Ansicht mehr.
 *
 * Sie beantwortete dieselbe Frage wie der neue Empfehlungsschritt – welche
 * Wörter lohnen sich für diese Lerngruppe? – nur mit einem Sprachmodell statt
 * mit einer nachrechenbaren Heuristik. Zwei Antworten auf eine Frage sind eine
 * zu viel, und die schlechtere ist die, die je nach Browser ausfällt und bei
 * zweimaligem Fragen zweimal anders antwortet.
 *
 * Der Code bleibt stehen, weil `resolveRecommendations` und
 * `buildCandidateContext` die Sorgfalt enthalten, die ein solcher Aufruf
 * braucht – neutrale Schlüssel statt interner IDs, Obergrenze, nie der
 * vollständige Text. Wer je wieder ein Modell an dieser Stelle einsetzt, soll
 * damit anfangen und nicht bei null.
 *
 * ---
 *
 * „Für Lerngruppe priorisieren“ – Empfehlungen innerhalb der gefundenen
 * Kandidaten.
 *
 * Was diese Ansicht **nicht** tut: Sie wählt nichts ab und nichts an. Eine
 * Empfehlung ist eine Markierung, mehr nicht; die Auswahl verändert erst ein
 * ausdrücklicher Klick auf „Nur Empfehlungen auswählen“ eine Ebene höher.
 *
 * Und sie schickt niemals den eingefügten Text an das Modell – nur die schon
 * lokal gefundenen Kandidaten mit neutralem Schlüssel und je einem Satz.
 */

const CAPABILITY = 'suggest-from-text' as const;

export const RECOMMENDATION_COUNT_OPTIONS = [5, 10, 15, 20] as const;

export interface TextRecommendationPanelProps {
  /** Die aktuell angezeigten Kandidaten – entfernte sind hier schon weg. */
  candidates: readonly TextCandidate[];
  context: LearningContext;
  onContextChange: (context: LearningContext) => void;
  /** Meldet das Ergebnis nach oben; verändert dort **keine** Auswahl. */
  onRecommend: (recommendedIds: string[]) => void;
}

export function TextRecommendationPanel({
  candidates,
  context,
  onContextChange,
  onRecommend,
}: TextRecommendationPanelProps) {
  const { ai } = useProviders();
  const abortRef = useRef<AbortController | null>(null);
  /** Fähigkeit, für die `prepare` erfolgreich war – Verfügbarkeit ist nicht Bereitschaft. */
  const preparedFor = useRef<unknown>(null);

  const [state, setState] = useState<ProviderState | 'checking'>('checking');
  const [count, setCount] = useState<number>(10);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');

  useEffect(() => {
    let active = true;
    if (preparedFor.current !== ai) preparedFor.current = null;
    void ai
      .getAvailability(CAPABILITY)
      .then((next) => active && setState(next))
      .catch(() => active && setState('unavailable'));
    return () => {
      active = false;
    };
  }, [ai]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const possible = state === 'downloadable' || state === 'downloading' || state === 'available';
  const needsDownload = state === 'downloadable' || state === 'downloading';

  /** Der Modellkontext – neutrale Schlüssel, höchstens 60 Kandidaten. */
  const modelContext = useMemo(() => buildCandidateContext(candidates), [candidates]);

  /**
   * `prepare()` steht vor jedem `await`, damit die User-Activation des Klicks
   * für den Modelldownload erhalten bleibt.
   */
  async function generate(): Promise<void> {
    if (busy) return;
    if (candidates.length === 0) {
      setError('Es sind keine Kandidaten mehr da, die sich priorisieren ließen.');
      return;
    }
    setError('');
    setSummary('');
    setBusy(true);
    setStatus('Das Sprachmodell wird vorbereitet.');
    setProgress(0);

    const controller = new AbortController();
    abortRef.current = controller;

    const alreadyPrepared = preparedFor.current === ai;
    const ready = alreadyPrepared
      ? Promise.resolve()
      : ai.prepare(CAPABILITY, (value) => setProgress(value), controller.signal);

    try {
      await ready;
      if (!alreadyPrepared) preparedFor.current = ai;
      setProgress(null);
      // Vorbereitet heißt vorbereitet: Die Schaltfläche darf jetzt nicht mehr
      // behaupten, das Modell müsse erst geladen werden.
      setState('available');
      setStatus('Die Kandidaten werden für die Lerngruppe bewertet.');

      const answer = await ai.suggestFromText(modelContext.payload, {
        grade: context.grade,
        cefrLevel: context.cefrLevel,
        ...(context.topic.trim() ? { topic: context.topic.trim() } : {}),
        maxItems: count,
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        setStatus('Abgebrochen.');
        return;
      }

      // Nur bekannte Schlüssel – aus einer erfundenen Antwort wird nichts.
      const result = resolveRecommendations(answer, modelContext, count);
      if (result.ids.length === 0) {
        setError(
          'Das Sprachmodell hat keine verwertbaren Empfehlungen geliefert. Du kannst es erneut versuchen.',
        );
        setStatus('Es konnten keine Empfehlungen erzeugt werden.');
        return;
      }

      const message = describeRecommendations(result, modelContext);
      setSummary(message);
      setStatus(`${message} Die Auswahl wurde nicht verändert.`);
      onRecommend(result.ids);
    } catch (caught: unknown) {
      preparedFor.current = null;
      setProgress(null);
      if (controller.signal.aborted) {
        setStatus('Abgebrochen.');
      } else {
        setError(
          caught instanceof Error
            ? `Die Empfehlungen konnten nicht erzeugt werden: ${caught.message}`
            : 'Die Empfehlungen konnten nicht erzeugt werden.',
        );
      }
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  return (
    <Card quiet>
      <h3 style={{ fontSize: '1rem' }}>Für Lerngruppe priorisieren</h3>
      <Announcer message={status} />

      <p className="small muted">
        LexiFlow empfiehlt Kandidaten relativ zu dieser Lerngruppe. Die Empfehlung ist keine
        automatische Auswahl und keine Lehrplanzusage.
      </p>

      <div className="field-grid">
        <Field label="Jahrgang">
          {(props) => (
            <select
              {...props}
              value={context.grade}
              onChange={(event) =>
                onContextChange({ ...context, grade: event.target.value as Grade })
              }
            >
              {GRADES.map((value) => (
                <option key={value} value={value}>
                  {GRADE_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="GeR-Niveau">
          {(props) => (
            <select
              {...props}
              value={context.cefrLevel}
              onChange={(event) =>
                onContextChange({ ...context, cefrLevel: event.target.value as CefrLevel })
              }
            >
              {CEFR_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Thema (optional)" hint="Wird auch als Thema des Pakets übernommen.">
          {(props) => (
            <input
              {...props}
              type="text"
              value={context.topic}
              onChange={(event) => onContextChange({ ...context, topic: event.target.value })}
            />
          )}
        </Field>

        <Field label="Anzahl Empfehlungen" hint="Obergrenze. Weniger ist möglich.">
          {(props) => (
            <select
              {...props}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            >
              {RECOMMENDATION_COUNT_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value} Empfehlungen
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {state === 'checking' ? (
        <p className="small muted" role="status">
          Verfügbarkeit wird geprüft …
        </p>
      ) : !possible ? (
        <p className="small muted">
          Dieser Browser bietet kein lokales Sprachmodell. Die Textanalyse, die Übersetzung und die
          Auswahl funktionieren unverändert – priorisiert wird dann von Hand.
        </p>
      ) : (
        <>
          <p className="small muted">
            An das Sprachmodell gehen höchstens {MAX_CONTEXT_CANDIDATES} Kandidaten mit je einem
            Originalsatz – <strong>nicht der eingefügte Text</strong>, keine Paketdaten und keine
            Lernstände. Gerade sind es {modelContext.payload.length} von {modelContext.total}.
          </p>
          <div className="row">
            <Button variant="primary" small disabled={busy} aria-busy={busy} onClick={() => void generate()}>
              {needsDownload
                ? 'Lokales Sprachmodell laden und Empfehlungen erzeugen'
                : 'Empfehlungen erzeugen'}
            </Button>
            {busy ? (
              <Button small onClick={() => abortRef.current?.abort()}>
                Abbrechen
              </Button>
            ) : null}
          </div>

          {busy && progress !== null ? (
            <p style={{ margin: '0.6rem 0 0' }}>
              <label htmlFor="recommendation-progress" className="small muted">
                Sprachmodell wird vorbereitet
              </label>
              <br />
              <progress id="recommendation-progress" max={1} value={progress}>
                {Math.round(progress * 100)} %
              </progress>{' '}
              <span className="small muted">{Math.round(progress * 100)} %</span>
            </p>
          ) : null}

          {summary ? (
            <p className="small" style={{ margin: '0.6rem 0 0' }}>
              <strong>{summary}</strong> Die bisherige Auswahl blieb unverändert.
            </p>
          ) : null}
        </>
      )}

      {error ? <Alert tone="error">{error}</Alert> : null}
    </Card>
  );
}

export default TextRecommendationPanel;
