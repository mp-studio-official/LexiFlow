import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Announcer, Badge, Button, Card } from '../../ui/components';
import { useProviders } from '../../providers/ProviderContext';
import { PART_OF_SPEECH_LABELS, type PartOfSpeech } from '../../domain/schema';
import type { ProviderState } from '../../providers/state';
import type { DraftRow } from '../../import/draft';
import {
  SUGGESTION_FIELDS,
  SUGGESTION_FIELD_LABELS,
  SUGGESTION_SOURCE_LABELS,
  acceptAllForField,
  acceptSuggestion,
  countOpen,
  isOpen,
  openSuggestions,
  rejectSuggestion,
  suggestionFor,
  type DraftSuggestion,
  type SuggestionField,
} from '../../import/suggestions';
import {
  applyRuleSuggestions,
  modelRequestFor,
  modelSuggestions,
  modelTargets,
  translationSuggestion,
  translationTargets,
  type LearningContext,
} from '../../import/enrichment';
import { addSuggestions } from '../../import/suggestions';

/**
 * „Vorschläge ergänzen“ – der optionale Komfortteil des Imports.
 *
 * Drei Quellen, streng getrennt gehalten:
 *
 * 1. **Feste Regeln** – ohne Download, ohne Modell, sofort. Sie laufen beim
 *    Öffnen der Vorschau automatisch, weil dafür nichts geladen werden muss.
 * 2. **Lokale Übersetzung** – nur für Zeilen ohne deutsche Antwort.
 * 3. **Lokales Sprachmodell** – Wortart, Schwierigkeit, Themen-Tags.
 *
 * Beides Letztere startet ausschließlich ein ausdrücklicher Klick. Kein
 * Vorschlag landet je von allein in einem Feld, und ein belegtes Feld wird
 * niemals überschrieben – auch nicht durch eine Sammelaktion.
 */

const SOURCE_LANGUAGE = 'en';
const TARGET_LANGUAGE = 'de';
const CAPABILITY = 'enrich-entry' as const;

export interface EnrichmentPanelProps {
  drafts: DraftRow[];
  context: LearningContext;
  onChange: (drafts: DraftRow[]) => void;
}

type Phase = 'idle' | 'preparing' | 'running';

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Unbekannter Fehler.';
}

function describeValue(suggestion: DraftSuggestion): string {
  if (suggestion.field === 'partOfSpeech') {
    return PART_OF_SPEECH_LABELS[suggestion.value as PartOfSpeech] ?? suggestion.value;
  }
  if (suggestion.field === 'difficulty') return `${suggestion.value} von 5`;
  return suggestion.value;
}

export function EnrichmentPanel({ drafts, context, onChange }: EnrichmentPanelProps) {
  const { translation, ai } = useProviders();
  const abortRef = useRef<AbortController | null>(null);
  /** Anbieter, für die `prepare` erfolgreich war – Verfügbarkeit ist nicht Bereitschaft. */
  const preparedTranslation = useRef<unknown>(null);
  const preparedAi = useRef<unknown>(null);

  const [translationState, setTranslationState] = useState<ProviderState | 'checking'>('checking');
  const [aiState, setAiState] = useState<ProviderState | 'checking'>('checking');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [panelError, setPanelError] = useState('');

  /**
   * Feste Regeln brauchen weder Download noch Modell – sie laufen sofort und
   * erneut, sobald sich der Lernkontext ändert (ein nachgetragenes Thema soll
   * als Tag vorgeschlagen werden). Übernommen wird trotzdem nichts.
   */
  const appliedContext = useRef('');
  useEffect(() => {
    const key = `${drafts.length}|${context.grade}|${context.cefrLevel}|${context.topic}`;
    if (drafts.length === 0 || appliedContext.current === key) return;
    appliedContext.current = key;
    onChange(applyRuleSuggestions(drafts, context));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- der Schlüssel oben ist die Bedingung.
  }, [drafts.length, context.grade, context.cefrLevel, context.topic]);

  useEffect(() => {
    let active = true;
    if (preparedTranslation.current !== translation) preparedTranslation.current = null;
    void translation
      .getAvailability(SOURCE_LANGUAGE, TARGET_LANGUAGE)
      .then((state) => active && setTranslationState(state))
      .catch(() => active && setTranslationState('unavailable'));
    return () => {
      active = false;
    };
  }, [translation]);

  useEffect(() => {
    let active = true;
    if (preparedAi.current !== ai) preparedAi.current = null;
    void ai
      .getAvailability(CAPABILITY)
      .then((state) => active && setAiState(state))
      .catch(() => active && setAiState('unavailable'));
    return () => {
      active = false;
    };
  }, [ai]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * Sichtbar ist eine Zeile, sobald es etwas zu entscheiden **oder** etwas zu
   * erfahren gibt. Eine Zeile, bei der beide Quellen gescheitert sind, hat
   * keinen Vorschlag – ihre Fehlermeldung darf trotzdem nicht verschwinden.
   */
  const visibleRows = useMemo(
    () => drafts.filter((draft) => openSuggestions(draft).length > 0 || errors[draft.id]),
    [drafts, errors],
  );

  const translatable = translationTargets(drafts);
  const enrichable = modelTargets(drafts);
  const translationPossible =
    translationState === 'downloadable' ||
    translationState === 'downloading' ||
    translationState === 'available';
  const aiPossible = aiState === 'downloadable' || aiState === 'downloading' || aiState === 'available';
  const needsDownload = translationState === 'downloadable' || aiState === 'downloadable';
  const busy = phase !== 'idle';

  const update = useCallback(
    (id: string, change: (draft: DraftRow) => DraftRow): void => {
      onChange(drafts.map((draft) => (draft.id === id ? change(draft) : draft)));
    },
    [drafts, onChange],
  );

  /**
   * Erzeugt Vorschläge.
   *
   * **User-Activation:** Ein Browser gewährt sie nur für die synchrone Phase des
   * Klick-Handlers. Deshalb werden beide `prepare()`-Aufrufe **hier, vor jedem
   * `await`, gestartet** und erst danach gemeinsam abgewartet. Würde der zweite
   * erst nach dem ersten `await` folgen, verweigerte der Browser ihm den
   * Modelldownload.
   *
   * **Unabhängigkeit:** `Promise.allSettled` – scheitert ein Anbieter, arbeitet
   * der andere weiter. Nur der erfolgreiche gilt als vorbereitet und wird beim
   * nächsten Lauf nicht erneut geladen.
   */
  async function run(): Promise<void> {
    if (busy) return; // keine doppelte Ausführung
    const controller = new AbortController();
    abortRef.current = controller;
    setPanelError('');
    setErrors({});
    setDone(0);

    let working = drafts;
    const commit = (): void => onChange(working);
    const fail = (id: string, message: string): void => {
      setErrors((current) => ({ ...current, [id]: message }));
    };

    setPhase('preparing');
    setStatus('Die lokalen Modelle werden vorbereitet.');
    setProgress(0);

    /*
     * Fünf Dinge, die auseinandergehalten gehören:
     *
     * 1. `hasWork`    – der Anbieter ist für diese Fähigkeit verfügbar **und**
     *                   es gibt überhaupt passende Zeilen.
     * 2. `already`    – dieser Anbieter wurde in dieser Ansicht schon
     *                   erfolgreich vorbereitet.
     * 3. `start`      – jetzt muss vorbereitet werden.
     * 4. `settled`    – die gerade gestartete Vorbereitung ist gelungen.
     * 5. `usable`     – daraus folgt erst, ob der Anbieter benutzt werden darf.
     *
     * Der Unterschied ist nicht kosmetisch: Ein nicht gestarteter Anbieter
     * bekommt unten ein `Promise.resolve()`, damit `allSettled` eine feste
     * Stellenzahl hat. „Erfüllt" heißt dann aber **nicht** „nutzbar" – sonst
     * würde ein gar nicht verfügbarer Nullanbieter anschließend für jede Zeile
     * aufgerufen.
     */
    const translationHasWork = translationPossible && translatable.length > 0;
    const aiHasWork = aiPossible && enrichable.length > 0;
    const translationAlreadyPrepared = preparedTranslation.current === translation;
    const aiAlreadyPrepared = preparedAi.current === ai;
    const startTranslation = translationHasWork && !translationAlreadyPrepared;
    const startAi = aiHasWork && !aiAlreadyPrepared;

    setTotal((translationHasWork ? translatable.length : 0) + (aiHasWork ? enrichable.length : 0));

    const share = { translation: 0, ai: 0 };
    const report = (which: 'translation' | 'ai') => (value: number) => {
      share[which] = value;
      const active = [startTranslation ? share.translation : null, startAi ? share.ai : null].filter(
        (item): item is number => item !== null,
      );
      if (active.length > 0) setProgress(active.reduce((a, b) => a + b, 0) / active.length);
    };

    // --- synchron, solange die User-Activation gilt ---
    const translationReady = startTranslation
      ? translation.prepare(SOURCE_LANGUAGE, TARGET_LANGUAGE, report('translation'), controller.signal)
      : Promise.resolve();
    const aiReady = startAi
      ? ai.prepare(CAPABILITY, report('ai'), controller.signal)
      : Promise.resolve();

    // --- ab hier darf gewartet werden ---
    try {
      const [translationResult, aiResult] = await Promise.allSettled([translationReady, aiReady]);

      // Erfolg zählt nur für tatsächlich gestartete Vorbereitungen.
      const translationSettled = startTranslation && translationResult.status === 'fulfilled';
      const aiSettled = startAi && aiResult.status === 'fulfilled';
      const translationFailed = startTranslation && translationResult.status === 'rejected';
      const aiFailed = startAi && aiResult.status === 'rejected';

      if (translationSettled) preparedTranslation.current = translation;
      if (aiSettled) preparedAi.current = ai;
      if (translationFailed) preparedTranslation.current = null;
      if (aiFailed) preparedAi.current = null;

      // Benutzt wird ein Anbieter nur, wenn er Arbeit hat **und** bereit ist.
      const translationUsable =
        translationHasWork && (translationAlreadyPrepared || translationSettled);
      const aiUsable = aiHasWork && (aiAlreadyPrepared || aiSettled);

      if (!controller.signal.aborted) {
        const problems: string[] = [];
        if (translationFailed) {
          problems.push(`Übersetzung: ${describeError(translationResult.reason)}`);
        }
        if (aiFailed) problems.push(`Sprachmodell: ${describeError(aiResult.reason)}`);

        if (problems.length === 2) {
          setPanelError(`Keines der lokalen Modelle konnte vorbereitet werden. ${problems.join(' · ')}`);
        } else if (problems.length === 1) {
          // Nur behaupten, das andere arbeite weiter, wenn es das wirklich tut.
          const otherWorks = translationFailed ? aiUsable : translationUsable;
          setPanelError(
            otherWorks
              ? `Ein Modell konnte nicht vorbereitet werden, das andere arbeitet weiter. ${problems[0]}`
              : `Diese Vorschläge konnten nicht erzeugt werden. ${problems[0]}`,
          );
        }
      }

      setProgress(null);
      setPhase('running');
      if (translationUsable) {
        setTranslationState((state) => (state === 'downloading' ? 'available' : state));
      }
      if (aiUsable) setAiState((state) => (state === 'downloading' ? 'available' : state));

      // Erst jetzt steht fest, was wirklich bearbeitet wird.
      const plannedTranslation = translationUsable ? translatable : [];
      const plannedAi = aiUsable ? enrichable : [];
      const steps = plannedTranslation.length + plannedAi.length;
      const uniqueRows = new Set([...plannedTranslation, ...plannedAi].map((draft) => draft.id)).size;
      setTotal(steps);

      let processed = 0;

      // Bewusst nacheinander: ein lokales Modell rechnet ohnehin seriell.
      for (const draft of plannedTranslation) {
        if (controller.signal.aborted) break;
        try {
          const value = await translation.translate(draft.english.trim(), controller.signal);
          working = working.map((row) =>
            row.id === draft.id ? addSuggestions(row, translationSuggestion(value)) : row,
          );
        } catch (error: unknown) {
          if (!controller.signal.aborted) {
            // Ein Fehler betrifft genau diese Zeile, nie die ganze Runde.
            fail(draft.id, `Übersetzung: ${describeError(error)}`);
          }
        }
        processed += 1;
        setDone(processed);
      }

      for (const draft of plannedAi) {
        if (controller.signal.aborted) break;
        try {
          const request = modelRequestFor(draft, context);
          const result = await ai.enrichEntry(
            {
              english: request.english,
              germanAnswers: request.germanAnswers,
              ...(request.exampleSentence
                ? { exampleSentences: [{ english: request.exampleSentence }] }
                : {}),
            },
            {
              grade: request.grade,
              cefrLevel: request.cefrLevel,
              ...(request.topic ? { topic: request.topic } : {}),
              signal: controller.signal,
            },
          );
          working = working.map((row) =>
            row.id === draft.id ? addSuggestions(row, modelSuggestions(result)) : row,
          );
        } catch (error: unknown) {
          if (!controller.signal.aborted) {
            fail(draft.id, `Sprachmodell: ${describeError(error)}`);
          }
        }
        processed += 1;
        setDone(processed);
      }

      commit();
      // Eine Zeile kann zwei Schritte auslösen (Übersetzung und Sprachmodell) –
      // sie bleibt trotzdem **eine** Vokabel.
      setStatus(
        controller.signal.aborted
          ? `Abgebrochen. ${processed} von ${steps} Vorschlagsschritten erledigt.`
          : uniqueRows === 0
            ? 'Es konnten keine Vorschläge erzeugt werden.'
            : `Fertig. Vorschläge für ${uniqueRows} ${
                uniqueRows === 1 ? 'Vokabel' : 'Vokabeln'
              } liegen zur Prüfung bereit.`,
      );
    } catch (error: unknown) {
      // Hierher führt nur ein unerwarteter Fehler; die Vorbereitung selbst ist
      // über `allSettled` bereits behandelt.
      commit();
      setProgress(null);
      if (!controller.signal.aborted) setPanelError(describeError(error));
    } finally {
      setPhase('idle');
      setProgress(null);
      abortRef.current = null;
    }
  }

  function acceptAll(field: SuggestionField): void {
    const count = countOpen(drafts, field);
    if (count === 0) return;
    onChange(acceptAllForField(drafts, field));
    setStatus(
      `${count} ${count === 1 ? 'Vorschlag' : 'Vorschläge'} für „${SUGGESTION_FIELD_LABELS[field]}“ übernommen.`,
    );
  }

  const buttonLabel = needsDownload
    ? 'Sprachmodelle laden und Vorschläge erzeugen'
    : 'Lokale Vorschläge erzeugen';
  const canRun =
    (translationPossible && translatable.length > 0) || (aiPossible && enrichable.length > 0);

  return (
    <Card>
      <h2 style={{ fontSize: '1.05rem' }}>Vorschläge ergänzen</h2>
      <p className="muted small">
        Alles läuft auf diesem Gerät: <strong>Es werden keine Daten übertragen.</strong> Vorschläge
        sind <strong>ungeprüft</strong> und werden nie automatisch übernommen – du entscheidest je
        Feld. Vorhandene Angaben bleiben unangetastet. Das fertige Paket enthält nur deine
        geprüften Werte und funktioniert später ohne jedes Modell.
      </p>

      <Announcer message={status} />

      <ul className="sources">
        <li>
          <strong>Feste Regeln</strong> – Wortart bei eindeutigen Mustern und das Thema als Tag.
          <span className="muted"> Immer verfügbar, ohne Download.</span>
        </li>
        <li>
          <strong>Lokale Übersetzung</strong> –{' '}
          {translationState === 'checking'
            ? 'wird geprüft …'
            : translationState === 'unavailable'
              ? 'in diesem Browser nicht verfügbar. Deutsche Antworten trägst du selbst ein.'
              : `deutsche Antwort für ${translatable.length} noch leere ${
                  translatable.length === 1 ? 'Zeile' : 'Zeilen'
                }.`}
        </li>
        <li>
          <strong>Lokales Sprachmodell</strong> –{' '}
          {aiState === 'checking'
            ? 'wird geprüft …'
            : aiState === 'unavailable'
              ? 'in diesem Browser nicht verfügbar. Wortart und Schwierigkeit trägst du selbst ein.'
              : `Wortart, Schwierigkeit und Themen-Tags für ${enrichable.length} ${
                  enrichable.length === 1 ? 'Zeile' : 'Zeilen'
                }.`}
        </li>
      </ul>

      <div className="row">
        <Button variant="primary" small disabled={busy || !canRun} onClick={() => void run()}>
          {buttonLabel}
        </Button>
        {busy ? (
          <Button small onClick={() => abortRef.current?.abort()}>
            Abbrechen
          </Button>
        ) : null}
      </div>

      {busy ? (
        <p style={{ margin: '0.6rem 0 0' }} aria-busy="true">
          {phase === 'preparing' ? (
            <>
              <label htmlFor="enrich-progress" className="small muted">
                Sprachmodell wird vorbereitet
              </label>
              <br />
              <progress id="enrich-progress" max={1} value={progress ?? 0}>
                {Math.round((progress ?? 0) * 100)} %
              </progress>{' '}
              <span className="small muted">{Math.round((progress ?? 0) * 100)} %</span>
            </>
          ) : (
            <span className="small muted" role="status">
              {done} von {total} Vorschlagsschritten erledigt · {Math.max(0, total - done)}{' '}
              verbleiben
            </span>
          )}
        </p>
      ) : null}

      {panelError ? <Alert tone="error">{panelError}</Alert> : null}

      {visibleRows.length > 0 ? (
        <>
          <div className="row" style={{ marginTop: '0.9rem' }}>
            {SUGGESTION_FIELDS.map((field) => {
              const count = countOpen(drafts, field);
              return count > 0 ? (
                <Button key={field} small onClick={() => acceptAll(field)}>
                  Alle {SUGGESTION_FIELD_LABELS[field]} übernehmen ({count})
                </Button>
              ) : null;
            })}
          </div>

          <ul className="suggestions">
            {visibleRows.map((draft) => (
              <li key={draft.id} className="suggestion-row">
                <p className="suggestion-row__head">
                  <strong>{draft.english || '(ohne Stichwort)'}</strong>
                  {!draft.include ? <span className="muted small"> · abgewählt</span> : null}
                </p>
                {errors[draft.id] ? (
                  <Alert tone="error">
                    <span className="visually-hidden">{draft.english}: </span>
                    {errors[draft.id]} Für diese Vokabel gibt es keinen Vorschlag – trage sie
                    selbst ein oder erzeuge die Vorschläge erneut.
                  </Alert>
                ) : null}
                {SUGGESTION_FIELDS.filter((field) => isOpen(draft, field)).map((field) => {
                  const suggestion = suggestionFor(draft, field) as DraftSuggestion;
                  return (
                    <div key={field} className="suggestion">
                      <p className="small" style={{ margin: 0 }}>
                        <Badge tone="warning">Vorschlag</Badge>{' '}
                        <span className="muted">{SUGGESTION_FIELD_LABELS[field]}:</span>{' '}
                        <strong>{describeValue(suggestion)}</strong>{' '}
                        <span className="muted small">
                          ({SUGGESTION_SOURCE_LABELS[suggestion.source]}
                          {suggestion.confidence === 'unsicher' ? ', ungeprüft' : ''})
                        </span>
                      </p>
                      <div className="row">
                        <Button
                          small
                          aria-label={`${SUGGESTION_FIELD_LABELS[field]} für ${draft.english} übernehmen`}
                          onClick={() => update(draft.id, (row) => acceptSuggestion(row, field))}
                        >
                          Übernehmen
                        </Button>
                        <Button
                          small
                          variant="quiet"
                          aria-label={`${SUGGESTION_FIELD_LABELS[field]} für ${draft.english} ablehnen`}
                          onClick={() => update(draft.id, (row) => rejectSuggestion(row, field))}
                        >
                          Ablehnen
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="small muted" style={{ margin: '0.9rem 0 0' }}>
          Zurzeit liegen keine offenen Vorschläge vor. Alles, was du übernommen oder selbst
          eingetragen hast, steht in der Tabelle darunter.
        </p>
      )}
    </Card>
  );
}

export default EnrichmentPanel;
