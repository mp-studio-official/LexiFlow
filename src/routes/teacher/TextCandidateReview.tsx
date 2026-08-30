import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Announcer, Badge, Button, Card } from '../../ui/components';
import { useTranslationProvider } from '../../providers/ProviderContext';
import { sortCandidates, type CandidateSort, type TextCandidate } from '../../domain/textExtraction';
import { orderByRecommendation } from '../../import/textRecommendation';
import { describeCandidateCount } from '../../import/candidateLimit';
import type { CandidateSelection } from '../../import/textDraft';
import type { LearningContext } from '../../import/enrichment';
import type { ProviderState } from '../../providers/state';
import type { TranslationProvider } from '../../translation/TranslationProvider';

/**
 * Die Priorisierung lädt erst, wenn die Kandidatenansicht offen ist – der
 * Schülerbereich bekommt davon nichts ab.
 */
const TextRecommendationPanel = lazy(() => import('./TextRecommendationPanel'));

/** Sortierung dieser Ansicht: die beiden bekannten plus „Empfehlungen zuerst“. */
type ReviewSort = CandidateSort | 'recommended';

/**
 * Prüfansicht der Textwerkstatt.
 *
 * Ein maschineller Übersetzungsvorschlag gilt hier **nie** als geprüft: Er
 * steht getrennt neben dem Eingabefeld und muss ausdrücklich übernommen oder
 * abgetippt werden. Ohne Übersetzungs-Anbieter bleibt die Ansicht vollständig
 * benutzbar – dann wird eben alles von Hand eingetragen.
 *
 * Wichtig ist die Trennung zweier Dinge:
 *
 * - **Verfügbarkeit** (`providerState`) beantwortet nur die Frage, ob sich ein
 *   Modell überhaupt nutzbar machen lässt. Auch `available` heißt lediglich
 *   „liegt auf dem Gerät“ – eine Translator-Instanz gibt es damit noch nicht.
 * - **Vorbereitung** (`preparedRef`) hält fest, für welchen Anbieter `prepare()`
 *   tatsächlich erfolgreich durchgelaufen ist. Nur dann darf übersetzt werden.
 *
 * `prepare()` läuft ausschließlich nach einem ausdrücklichen Klick und wird im
 * Klickpfad ohne vorherige Warteschritte aufgerufen, damit die User-Activation
 * des Browsers erhalten bleibt (der Modelldownload verlangt sie).
 */

const SOURCE_LANGUAGE = 'en';
const TARGET_LANGUAGE = 'de';

type RowTranslation = 'idle' | 'pending' | 'suggested' | 'accepted' | 'error';

interface CandidateRow {
  candidate: TextCandidate;
  selected: boolean;
  german: string;
  suggestion?: string | undefined;
  suggestedSentence?: string | undefined;
  translation: RowTranslation;
  error?: string | undefined;
}

function toRow(candidate: TextCandidate): CandidateRow {
  return { candidate, selected: true, german: '', translation: 'idle' };
}

export interface TextCandidateReviewProps {
  candidates: readonly TextCandidate[];
  /** Derselbe Lernkontext wie im übrigen Assistenten – Änderungen wandern nach oben. */
  context: LearningContext;
  onContextChange: (context: LearningContext) => void;
  /** Die vor der Analyse gewählte Obergrenze – für die ehrliche Anzeige. */
  requestedCount: number;
  onApply: (selections: CandidateSelection[]) => void;
  onBack: () => void;
}

export function TextCandidateReview({
  candidates,
  context,
  onContextChange,
  requestedCount,
  onApply,
  onBack,
}: TextCandidateReviewProps) {
  const provider = useTranslationProvider();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Anbieter, für den `prepare('en','de')` erfolgreich war – sonst `null`. */
  const preparedRef = useRef<TranslationProvider | null>(null);

  const [rows, setRows] = useState<CandidateRow[]>(() => candidates.map(toRow));
  const [sort, setSort] = useState<ReviewSort>('text-order');
  /** Empfehlungen des Sprachmodells – reine Markierung, nie eine Auswahl. */
  const [recommendedIds, setRecommendedIds] = useState<readonly string[]>([]);
  const [providerState, setProviderState] = useState<ProviderState | 'checking'>('checking');
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [providerError, setProviderError] = useState('');

  // Fokus nach der Analyse auf die Ergebnisüberschrift.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    // Ein anderer Anbieter bedeutet: nichts ist mehr vorbereitet.
    if (preparedRef.current !== provider) preparedRef.current = null;
    void provider
      .getAvailability(SOURCE_LANGUAGE, TARGET_LANGUAGE)
      .then((state) => {
        if (active) setProviderState(state);
      })
      .catch(() => {
        if (active) setProviderState('unavailable');
      });
    return () => {
      active = false;
    };
  }, [provider]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const recommended = useMemo(() => new Set(recommendedIds), [recommendedIds]);

  const ordered = useMemo(() => {
    const base: CandidateSort = sort === 'recommended' ? 'text-order' : sort;
    const bySort = sortCandidates(
      rows.map((row) => row.candidate),
      base,
    );
    const index = new Map(rows.map((row) => [row.candidate.id, row]));
    const inOrder = bySort.flatMap((candidate) => {
      const row = index.get(candidate.id);
      return row ? [row] : [];
    });

    if (sort !== 'recommended') return inOrder;
    // Empfohlene nach vorn – entfernte Kandidaten kommen dadurch nicht zurück.
    return orderByRecommendation(
      inOrder.map((row) => ({ id: row.candidate.id, row })),
      recommendedIds,
    ).map((item) => item.row);
  }, [rows, sort, recommendedIds]);

  const selectedRows = rows.filter((row) => row.selected);
  const missingGerman = selectedRows.filter((row) => row.german.trim().length === 0).length;

  const update = useCallback((id: string, changes: Partial<CandidateRow>): void => {
    setRows((current) =>
      current.map((row) => (row.candidate.id === id ? { ...row, ...changes } : row)),
    );
  }, []);

  function setAllSelected(selected: boolean): void {
    setRows((current) => current.map((row) => ({ ...row, selected })));
  }

  /**
   * Der **einzige** Weg, auf dem eine Empfehlung die Auswahl verändert – und
   * er verlangt einen ausdrücklichen Klick.
   */
  function selectOnlyRecommended(): void {
    setRows((current) =>
      current.map((row) => ({ ...row, selected: recommended.has(row.candidate.id) })),
    );
    setStatus('Nur die empfohlenen Kandidaten sind jetzt ausgewählt.');
  }

  /**
   * Nimmt die Empfehlungen entgegen. Bewusst ohne jede Änderung an `selected`:
   * markiert wird, ausgewählt nicht.
   */
  function applyRecommendations(ids: string[]): void {
    setRecommendedIds(ids);
    setSort('recommended');
  }

  function remove(id: string): void {
    setRows((current) => current.filter((row) => row.candidate.id !== id));
  }

  /** Übersetzt eine einzelne Zeile; Fehler bleiben auf diese Zeile beschränkt. */
  const translateRow = useCallback(
    async (row: CandidateRow, signal: AbortSignal): Promise<void> => {
      update(row.candidate.id, { translation: 'pending', error: undefined });
      try {
        const word = await provider.translate(row.candidate.english, signal);
        const sentence = await provider.translate(row.candidate.sourceSentence, signal);
        update(row.candidate.id, {
          suggestion: word.trim(),
          suggestedSentence: sentence.trim(),
          translation: 'suggested',
          error: undefined,
        });
      } catch (error: unknown) {
        if (signal.aborted) {
          update(row.candidate.id, { translation: 'idle' });
          return;
        }
        update(row.candidate.id, {
          translation: 'error',
          error: error instanceof Error ? error.message : 'Übersetzung fehlgeschlagen.',
        });
      }
    },
    [provider, update],
  );

  async function runTranslation(targets: readonly CandidateRow[]): Promise<void> {
    if (targets.length === 0) {
      setStatus('Es sind keine Kandidaten ausgewählt.');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setProviderError('');

    try {
      // `available` heißt nur „lässt sich nutzbar machen“. Eine Instanz gibt es
      // erst nach erfolgreichem `prepare()` – deshalb hängt der Aufruf an der
      // Vorbereitung, nicht am gemeldeten Zustand. Vor dem Aufruf steht bewusst
      // kein `await`, damit die User-Activation aus dem Klick erhalten bleibt.
      if (preparedRef.current !== provider) {
        setProviderState('downloading');
        setStatus('Das Sprachmodell wird vorbereitet.');
        setProgress(0);
        await provider.prepare(
          SOURCE_LANGUAGE,
          TARGET_LANGUAGE,
          (value) => setProgress(value),
          controller.signal,
        );
        preparedRef.current = provider;
        setProviderState('available');
        setProgress(null);
      }

      // Bewusst nacheinander: ein lokales Modell verarbeitet ohnehin seriell.
      let done = 0;
      for (const row of targets) {
        if (controller.signal.aborted) break;
        await translateRow(row, controller.signal);
        done += 1;
        setStatus(`${done} von ${targets.length} Vorschlägen erzeugt.`);
      }
      if (controller.signal.aborted) setStatus('Übersetzung abgebrochen.');
    } catch (error: unknown) {
      // Abbruch wie Fehler: nicht als vorbereitet behandeln.
      preparedRef.current = null;
      setProgress(null);
      if (controller.signal.aborted) {
        setStatus('Laden abgebrochen.');
        setProviderState('downloadable');
      } else {
        setProviderState('downloadable');
        setProviderError(
          error instanceof Error
            ? `Das Sprachmodell konnte nicht geladen werden: ${error.message}`
            : 'Das Sprachmodell konnte nicht geladen werden.',
        );
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function apply(): void {
    const selections: CandidateSelection[] = rows
      .filter((row) => row.selected)
      .map((row) => ({
        candidate: row.candidate,
        german: row.german,
        translationAccepted: row.translation === 'accepted',
        includeSentence: true,
        ...(row.suggestedSentence && row.translation === 'accepted'
          ? { germanSentence: row.suggestedSentence }
          : {}),
      }));
    onApply(selections);
  }

  // Auch `downloading` führt über die Schaltfläche zur Initialisierung: Der
  // Browser lädt dann bereits, und `prepare()` wartet dieses Laden ab.
  const canTranslate =
    providerState === 'available' ||
    providerState === 'downloadable' ||
    providerState === 'downloading';

  const translateLabel =
    providerState === 'downloadable'
      ? 'Sprachmodell laden und Vorschläge erzeugen'
      : providerState === 'downloading'
        ? 'Laden abwarten und Vorschläge erzeugen'
        : 'Vorschläge für Auswahl erzeugen';

  return (
    <div className="stack">
      <div>
        <h2 id="kandidaten-heading" ref={headingRef} tabIndex={-1}>
          Gefundene Vokabelkandidaten ({rows.length})
        </h2>
        <p className="muted small">
          <strong>{describeCandidateCount(candidates.length, requestedCount)}</strong> Alles wurde
          auf diesem Gerät berechnet und ist deterministisch. Beispielsätze stammen unverändert aus
          deinem Text; Übersetzungen erfindet LexiFlow nicht. Der vollständige Text wird weder
          gespeichert noch an ein Sprachmodell übergeben.
        </p>
      </div>

      <Announcer message={status} />

      <Card quiet>
        <div className="row">
          <Button small onClick={() => setAllSelected(true)}>
            Alle auswählen
          </Button>
          <Button small onClick={() => setAllSelected(false)}>
            Keine auswählen
          </Button>
          <span className="spacer" />
          <label className="checkbox">
            <span>Sortierung:</span>
            <select
              aria-label="Sortierung der Kandidaten"
              value={sort}
              onChange={(event) => setSort(event.target.value as ReviewSort)}
            >
              <option value="text-order">Reihenfolge im Text</option>
              <option value="frequency">Häufigkeit</option>
              <option value="recommended" disabled={recommendedIds.length === 0}>
                Empfehlungen zuerst
              </option>
            </select>
          </label>
        </div>

        {recommendedIds.length > 0 ? (
          <div className="row" style={{ marginTop: '0.5rem' }}>
            <Button small onClick={selectOnlyRecommended}>
              Nur Empfehlungen auswählen
            </Button>
            <Button small onClick={() => setAllSelected(true)}>
              Alle wieder auswählen
            </Button>
            <span className="small muted">
              {recommendedIds.length} Kandidaten sind für diese Lerngruppe empfohlen.
            </span>
          </div>
        ) : null}

        <p className="small muted" style={{ margin: '0.6rem 0 0' }}>
          {selectedRows.length} von {rows.length} ausgewählt
          {missingGerman > 0 ? ` · ${missingGerman} ohne deutsche Antwort` : ''}
        </p>
      </Card>

      <Suspense
        fallback={
          <p className="small muted" role="status">
            Priorisierung wird geladen …
          </p>
        }
      >
        <TextRecommendationPanel
          candidates={rows.map((row) => row.candidate)}
          context={context}
          onContextChange={onContextChange}
          onRecommend={applyRecommendations}
        />
      </Suspense>

      <Card quiet>
        <h3 style={{ fontSize: '1rem' }}>Übersetzungsvorschläge (optional)</h3>
        {providerState === 'checking' ? (
          <p className="small muted" role="status">
            Verfügbarkeit wird geprüft …
          </p>
        ) : providerState === 'unavailable' ? (
          <p className="small muted">
            Dieser Browser bietet keine lokale Übersetzung. Trage die deutschen Antworten
            selbst ein – alles andere funktioniert unverändert.
          </p>
        ) : (
          <>
            <p className="small muted">{provider.info.dataNotice}</p>
            <p className="small muted">
              Vorschläge sind <strong>ungeprüft</strong>. Sie werden nie automatisch
              übernommen – du entscheidest je Vokabel.
            </p>
            {!busy && providerState === 'downloading' ? (
              <p className="small muted" role="status">
                Der Browser lädt das Sprachmodell gerade herunter. Du kannst die
                Vorschläge jetzt anstoßen; sie beginnen, sobald das Modell bereit ist.
              </p>
            ) : null}
            {!busy && providerState === 'downloadable' ? (
              <p className="small muted">
                Das Sprachmodell ist noch nicht auf diesem Gerät. Es wird erst nach
                deinem Klick geladen.
              </p>
            ) : null}
            <div className="row">
              <Button
                variant="primary"
                small
                disabled={busy || !canTranslate}
                onClick={() => void runTranslation(selectedRows)}
              >
                {translateLabel}
              </Button>
              {busy ? (
                <Button small onClick={() => abortRef.current?.abort()}>
                  Abbrechen
                </Button>
              ) : null}
            </div>
            {progress !== null ? (
              <p style={{ margin: '0.6rem 0 0' }}>
                <label htmlFor="model-progress" className="small muted">
                  Sprachmodell wird vorbereitet
                </label>
                <br />
                <progress id="model-progress" max={1} value={progress}>
                  {Math.round(progress * 100)} %
                </progress>{' '}
                <span className="small muted">{Math.round(progress * 100)} %</span>
              </p>
            ) : null}
          </>
        )}
        {providerError ? <Alert tone="error">{providerError}</Alert> : null}
      </Card>

      {rows.length === 0 ? (
        <Alert tone="info">
          Es sind keine Kandidaten mehr übrig. Gehe zurück und passe den Text oder die Optionen
          an.
        </Alert>
      ) : null}

      <ul className="candidates">
        {ordered.map((row) => {
          const { candidate } = row;
          const label = candidate.english;
          const hasGerman = row.german.trim().length > 0;
          /** Nur ausgewählte Zeilen ohne Antwort sind wirklich fehlerhaft. */
          const missing = row.selected && !hasGerman;

          return (
            <li key={candidate.id} className="candidate">
              <div className="candidate__head">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    aria-label={`${label} übernehmen`}
                    onChange={(event) => update(candidate.id, { selected: event.target.checked })}
                  />
                  <strong>{label}</strong>
                </label>
                <span className="spacer" />
                <Badge>
                  {candidate.occurrences}× im Text
                </Badge>
                <Badge>aus Text</Badge>
                {recommended.has(candidate.id) ? (
                  <Badge tone="success">Für Lerngruppe empfohlen</Badge>
                ) : null}
                {candidate.isLikelyProperNoun ? <Badge tone="warning">Eigenname?</Badge> : null}
                <Button
                  small
                  variant="quiet"
                  aria-label={`${label} entfernen`}
                  onClick={() => remove(candidate.id)}
                >
                  Entfernen
                </Button>
              </div>

              <p className="candidate__sentence">
                <span className="visually-hidden">Originalsatz: </span>
                „{candidate.sourceSentence}“
              </p>

              <div className="field">
                <label htmlFor={`de-${candidate.id}`}>Deutsche Antwort für „{label}“</label>
                <input
                  id={`de-${candidate.id}`}
                  type="text"
                  value={row.german}
                  aria-invalid={missing ? true : undefined}
                  aria-describedby={missing ? `de-${candidate.id}-fehler` : undefined}
                  onChange={(event) =>
                    update(candidate.id, {
                      german: event.target.value,
                      translation: row.translation === 'accepted' ? 'suggested' : row.translation,
                    })
                  }
                />
                {missing ? (
                  <span id={`de-${candidate.id}-fehler`} className="field__error">
                    Ohne deutsche Antwort lässt sich diese Vokabel nicht speichern.
                  </span>
                ) : null}
              </div>

              {row.translation === 'pending' ? (
                <p className="small muted" role="status">
                  Vorschlag wird erzeugt …
                </p>
              ) : null}

              {row.translation === 'error' ? (
                <Alert tone="error">
                  {row.error ?? 'Übersetzung fehlgeschlagen.'}{' '}
                  <Button
                    small
                    aria-label={`Übersetzung für ${label} erneut versuchen`}
                    disabled={busy}
                    onClick={() => void runTranslation([row])}
                  >
                    Erneut versuchen
                  </Button>
                </Alert>
              ) : null}

              {row.suggestion && row.translation !== 'pending' ? (
                <div className="candidate__suggestion">
                  <p className="small" style={{ margin: 0 }}>
                    <Badge tone="warning">maschineller Vorschlag</Badge>{' '}
                    <strong>{row.suggestion}</strong>
                  </p>
                  {row.suggestedSentence ? (
                    <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
                      Kontext (Hilfestellung, nicht geprüft): „{row.suggestedSentence}“
                    </p>
                  ) : null}
                  <Button
                    small
                    aria-label={`Vorschlag für ${label} übernehmen`}
                    disabled={row.translation === 'accepted' && row.german === row.suggestion}
                    onClick={() =>
                      update(candidate.id, {
                        german: row.suggestion ?? '',
                        translation: 'accepted',
                      })
                    }
                  >
                    Vorschlag übernehmen
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="row">
        <Button onClick={onBack}>Zurück zum Text</Button>
        <Button variant="primary" disabled={selectedRows.length === 0} onClick={apply}>
          {selectedRows.length} Vokabeln in die Vorschau übernehmen
        </Button>
      </div>
    </div>
  );
}
