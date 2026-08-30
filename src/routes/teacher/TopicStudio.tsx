import { useEffect, useRef, useState } from 'react';
import { Alert, Announcer, Button, Card, Field } from '../../ui/components';
import { useProviders } from '../../providers/ProviderContext';
import { CEFR_LEVELS, GRADES, GRADE_LABELS, type CefrLevel, type Grade } from '../../domain/cefr';
import type { ProviderState } from '../../providers/state';
import type { DraftRow } from '../../import/draft';
import {
  emptyTopicDraft,
  headwordsForPrompt,
  summarizeTopicResult,
  topicSuggestionsToDrafts,
  type TopicDraftResult,
} from '../../import/topicDraft';
import { MAX_CONTEXT_HEADWORDS } from '../../ai/AiProvider';

/**
 * Themenwerkstatt: zu einem Thema passende Vokabelvorschläge – lokal erzeugt.
 *
 * Drei Zusagen, die diese Ansicht einlöst:
 *
 * 1. **Nichts ohne Klick.** Das Sprachmodell wird erst nach einer ausdrücklichen
 *    Aktion geladen; `prepare()` läuft im Klickpfad ohne vorherigen Wartepunkt,
 *    damit die User-Activation für den Download erhalten bleibt.
 * 2. **Nichts ungeprüft.** Die Vorschläge gehen als ganz normale Entwurfszeilen
 *    in die vorhandene Vorschau; gespeichert wird erst dort.
 * 3. **Kein Sackgassen-Browser.** Ohne Prompt-API gibt es keine Fehlermeldung,
 *    sondern zwei benutzbare Auswege.
 */

const CAPABILITY = 'suggest-from-topic' as const;

export const COUNT_OPTIONS = [5, 10, 15, 20] as const;

export const DIFFICULTY_LABELS: Readonly<Record<1 | 2 | 3 | 4 | 5, string>> = {
  1: '1 – sehr leicht',
  2: '2 – eher leicht',
  3: '3 – mittel',
  4: '4 – anspruchsvoll',
  5: '5 – sehr anspruchsvoll',
};

export interface TopicStudioProps {
  topic: string;
  grade: Grade;
  cefrLevel: CefrLevel;
  /**
   * **Alle** Stichwörter, die nicht erneut vorgeschlagen werden sollen. Sie
   * gehen vollständig in den lokalen Filter; das Sprachmodell sieht davon nur
   * den begrenzten Auszug aus `headwordsForPrompt`.
   */
  existingEnglish: readonly string[];
  onTopicChange: (topic: string) => void;
  onGradeChange: (grade: Grade) => void;
  onCefrChange: (level: CefrLevel) => void;
  /** Übergibt fertige Entwurfszeilen an die Vorschau. */
  onDrafts: (drafts: DraftRow[], info: TopicDraftResult | null) => void;
  /** Wechselt zur Quelle „Einfügen“. */
  onPasteInstead: () => void;
  /** Bereits erzeugte Vorschläge – für die Rückfrage vor dem Ersetzen. */
  hasExistingDrafts?: boolean;
}

export function TopicStudio({
  topic,
  grade,
  cefrLevel,
  existingEnglish,
  onTopicChange,
  onGradeChange,
  onCefrChange,
  onDrafts,
  onPasteInstead,
  hasExistingDrafts = false,
}: TopicStudioProps) {
  const { ai } = useProviders();
  const abortRef = useRef<AbortController | null>(null);
  /** Fähigkeit, für die `prepare` erfolgreich war – Verfügbarkeit ist nicht Bereitschaft. */
  const preparedFor = useRef<unknown>(null);

  const [state, setState] = useState<ProviderState | 'checking'>('checking');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [count, setCount] = useState<number>(10);
  const [excludeExisting, setExcludeExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [topicError, setTopicError] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);

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
  const trimmedTopic = topic.trim();

  /**
   * Erzeugt Vorschläge. `prepare()` steht bewusst vor jedem `await`, damit die
   * User-Activation des Klicks für den Modelldownload erhalten bleibt.
   */
  async function generate(): Promise<void> {
    if (busy) return; // keine doppelte Ausführung
    if (trimmedTopic.length === 0) {
      setTopicError('Bitte gib ein Thema an.');
      return;
    }
    setTopicError('');
    setConfirmReplace(false);
    setError('');
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
      setStatus(`Es werden bis zu ${count} Vorschläge erzeugt.`);

      // Das Modell bekommt nur einen begrenzten Auszug; der vollständige
      // Bestand bleibt für den lokalen Filter weiter unten reserviert.
      const promptHeadwords = excludeExisting ? headwordsForPrompt(existingEnglish) : [];

      const suggestions = await ai.suggestFromTopic(trimmedTopic, {
        grade,
        cefrLevel,
        topic: trimmedTopic,
        difficulty,
        maxItems: count,
        ...(promptHeadwords.length > 0 ? { existingEnglish: promptHeadwords } : {}),
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        setStatus('Abgebrochen.');
        return;
      }

      const result = topicSuggestionsToDrafts(suggestions, {
        maxItems: count,
        topic: trimmedTopic,
        ...(excludeExisting ? { existingEnglish } : {}),
      });

      if (result.accepted === 0) {
        setError(
          'Das Sprachmodell hat keine brauchbaren Vorschläge geliefert. Versuche es erneut oder ändere das Thema.',
        );
        setStatus('Es konnten keine Vorschläge erzeugt werden.');
        return;
      }

      const summary = summarizeTopicResult(result);
      setStatus([summary.headline, summary.detail].filter(Boolean).join(' '));
      onDrafts(result.drafts, result);
    } catch (caught: unknown) {
      preparedFor.current = null;
      setProgress(null);
      if (controller.signal.aborted) {
        setStatus('Abgebrochen.');
      } else {
        setError(
          caught instanceof Error
            ? `Die Vorschläge konnten nicht erzeugt werden: ${caught.message}`
            : 'Die Vorschläge konnten nicht erzeugt werden.',
        );
      }
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  function start(): void {
    // Bestehende Ergebnisse werden nie ohne Rückfrage ersetzt.
    if (hasExistingDrafts && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    void generate();
  }

  return (
    <div className="stack">
      <Card>
        <h2>Vokabeln zu einem Thema</h2>
        <p className="muted small">
          Die Vorschläge entstehen <strong>auf diesem Gerät</strong> mit dem eingebauten
          Sprachmodell des Browsers. Es werden keine Daten an LexiFlow oder einen Cloud-Dienst
          übertragen. Das fertige Paket braucht später kein Modell.
        </p>

        <Announcer message={status} />

        <Field
          label="Thema"
          hint="Pflichtfeld. Es wird auch als Thema des Pakets übernommen, z. B. „City life“."
          {...(topicError ? { error: topicError } : {})}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              value={topic}
              onChange={(event) => {
                onTopicChange(event.target.value);
                if (event.target.value.trim()) setTopicError('');
              }}
            />
          )}
        </Field>

        <div className="field-grid">
          <Field label="Jahrgang">
            {(props) => (
              <select
                {...props}
                value={grade}
                onChange={(event) => onGradeChange(event.target.value as Grade)}
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
                value={cefrLevel}
                onChange={(event) => onCefrChange(event.target.value as CefrLevel)}
              >
                {CEFR_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field
            label="Gewünschte Schwierigkeit"
            hint="Die Schwierigkeit bezieht sich auf die ausgewählte Lerngruppe, nicht auf eine allgemeingültige Wortbewertung."
          >
            {(props) => (
              <select
                {...props}
                value={difficulty}
                onChange={(event) =>
                  setDifficulty(Number(event.target.value) as 1 | 2 | 3 | 4 | 5)
                }
              >
                {([1, 2, 3, 4, 5] as const).map((value) => (
                  <option key={value} value={value}>
                    {DIFFICULTY_LABELS[value]}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Anzahl" hint="Obergrenze. Weniger ist möglich – ehrlicher als aufgefüllt.">
            {(props) => (
              <select
                {...props}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              >
                {COUNT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} Vokabeln
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        {existingEnglish.length > 0 ? (
          <label className="checkbox" style={{ marginTop: '0.6rem' }}>
            <input
              type="checkbox"
              checked={excludeExisting}
              onChange={(event) => setExcludeExisting(event.target.checked)}
            />
            <span>
              Bereits vorhandene Vokabeln nicht erneut vorschlagen
              <span className="muted small">
                {' '}
                – {existingEnglish.length} Stichwörter. Bereits vorhandene Vokabeln werden
                vollständig auf diesem Gerät herausgefiltert.{' '}
                {existingEnglish.length > MAX_CONTEXT_HEADWORDS
                  ? `Zur Vermeidung offensichtlicher Dubletten erhält das lokale Sprachmodell höchstens ${MAX_CONTEXT_HEADWORDS} englische Stichwörter.`
                  : `Zur Vermeidung offensichtlicher Dubletten erhält das lokale Sprachmodell diese ${existingEnglish.length} englischen Stichwörter.`}{' '}
                Übersetzungen, Lernstände und Paket-IDs werden nie übergeben.
              </span>
            </span>
          </label>
        ) : null}

        {state === 'checking' ? (
          <p className="small muted" role="status" style={{ marginTop: '0.8rem' }}>
            Verfügbarkeit wird geprüft …
          </p>
        ) : possible ? (
          <>
            <p className="small muted" style={{ marginTop: '0.8rem' }}>
              Vorschläge sind <strong>ungeprüft</strong>. Sie ersetzen keine fachliche Prüfung –
              Übersetzungen, Schwierigkeit und Beispielsätze bleiben deine Entscheidung.
            </p>
            <div className="row">
              <Button variant="primary" disabled={busy} aria-busy={busy} onClick={start}>
                {needsDownload
                  ? 'Lokales Sprachmodell laden und Vorschläge erzeugen'
                  : 'Vokabelvorschläge erzeugen'}
              </Button>
              {busy ? (
                <Button onClick={() => abortRef.current?.abort()}>Abbrechen</Button>
              ) : null}
            </div>

            {confirmReplace ? (
              <Alert tone="warning">
                Es liegen bereits Vorschläge in der Vorschau. Eine neue Auswahl ersetzt sie
                vollständig.
                <div className="row" style={{ marginTop: '0.5rem' }}>
                  <Button small variant="primary" onClick={() => void generate()}>
                    Vorschläge ersetzen
                  </Button>
                  <Button small variant="quiet" onClick={() => setConfirmReplace(false)}>
                    Abbrechen
                  </Button>
                </div>
              </Alert>
            ) : null}

            {busy && progress !== null ? (
              <p style={{ margin: '0.6rem 0 0' }}>
                <label htmlFor="topic-progress" className="small muted">
                  Sprachmodell wird vorbereitet
                </label>
                <br />
                <progress id="topic-progress" max={1} value={progress}>
                  {Math.round(progress * 100)} %
                </progress>{' '}
                <span className="small muted">{Math.round(progress * 100)} %</span>
              </p>
            ) : null}
          </>
        ) : (
          <Alert tone="info">
            <p style={{ margin: '0 0 0.6rem' }}>
              Die automatische Themenwerkstatt ist in diesem Browser nicht verfügbar. Du kannst
              stattdessen eine Liste einfügen oder eine leere Liste zu diesem Thema anlegen.
            </p>
            <div className="row">
              <Button small onClick={onPasteInstead}>
                Liste einfügen
              </Button>
              <Button
                small
                onClick={() => {
                  if (trimmedTopic.length === 0) {
                    setTopicError('Bitte gib ein Thema an.');
                    return;
                  }
                  onDrafts(emptyTopicDraft(trimmedTopic), null);
                }}
              >
                Leere Liste anlegen
              </Button>
            </div>
          </Alert>
        )}

        {error ? <Alert tone="error">{error}</Alert> : null}
      </Card>
    </div>
  );
}

export default TopicStudio;
