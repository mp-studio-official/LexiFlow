import { useEffect, useRef, useState } from 'react';
import { Alert, Announcer, Badge, Button } from '../../ui/components';
import { useProviders } from '../../providers/ProviderContext';
import {
  SENTENCE_MODE_LABELS,
  addSuggestedSentence,
  availableModes,
  canAddSentence,
  checkSentenceSuggestion,
  replaceSentenceWith,
  sentenceRequestFor,
  MAX_SENTENCES,
} from '../../import/sentenceAssist';
import type { DraftRow } from '../../import/draft';
import type { LearningContext } from '../../import/enrichment';
import type { ProviderState } from '../../providers/state';
import type { SentenceMode } from '../../ai/AiProvider';
import { geminiAssistant } from '../../ai/gemini/assistant';
import { GeminiAction } from '../../ai/gemini/ui/GeminiAction';
import { GeminiError } from '../../ai/gemini/errors';

/**
 * Satzassistent – im vorhandenen Detailbereich einer Entwurfszeile.
 *
 * Bewusst **kein zweiter Editor**: Die gespeicherten Sätze bleiben oben, der
 * Vorschlag steht getrennt darunter und wandert nur durch einen ausdrücklichen
 * Klick nach oben. Es gibt keine automatische Übernahme und kein stilles
 * Überschreiben – Ersetzen ist eine eigene Schaltfläche mit eigener Auswahl.
 *
 * Ohne Prompt-API erscheint hier ein ruhiger Hinweis, keine Warnung: Die
 * manuelle Satzbearbeitung darüber funktioniert unverändert weiter.
 */

const CAPABILITY = 'alternative-sentence' as const;

export interface SentenceAssistantProps {
  draft: DraftRow;
  context: LearningContext;
  onChange: (draft: DraftRow) => void;
  /** Für Beschriftungen – dieselbe Bezeichnung wie in der Tabellenzeile. */
  rowLabel: string;
}

export function SentenceAssistant({ draft, context, onChange, rowLabel }: SentenceAssistantProps) {
  const { ai } = useProviders();
  const abortRef = useRef<AbortController | null>(null);
  /** Anbieter, für den `prepare` erfolgreich war – Verfügbarkeit ist nicht Bereitschaft. */
  const preparedFor = useRef<unknown>(null);

  const [state, setState] = useState<ProviderState | 'checking'>('checking');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState<{ english: string; german: string } | null>(null);
  /**
   * Woher der Vorschlag stammt.
   *
   * Beide Wege enden im selben Kasten unten – und dürfen das, weil beide
   * Vorschläge und nicht Antworten liefern. Die Herkunft steht trotzdem daran:
   * Ein lokal erzeugter Satz hat das Gerät nicht verlassen, ein Gemini-Satz
   * schon, und wer den Kasten später wiederfindet, soll das noch erkennen.
   */
  const [origin, setOrigin] = useState<'lokal' | 'gemini'>('lokal');
  const [lastMode, setLastMode] = useState<SentenceMode>('create');
  const [replaceTarget, setReplaceTarget] = useState('');

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
  const modes = availableModes(draft);
  const hasSentences = draft.sentences.length > 0;
  const target = replaceTarget || draft.sentences[0]?.id || '';

  /**
   * Erzeugt einen Vorschlag. `prepare()` steht vor jedem `await`, damit die
   * User-Activation des Klicks für den Modelldownload erhalten bleibt.
   */
  async function generate(mode: SentenceMode): Promise<void> {
    if (busy) return;
    setLastMode(mode);
    setError('');
    setSuggestion(null);
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
      setStatus('Ein Satzvorschlag wird erzeugt.');

      const answer = await ai.alternativeSentence(sentenceRequestFor(draft, mode), {
        grade: context.grade,
        cefrLevel: context.cefrLevel,
        ...(context.topic.trim() ? { topic: context.topic.trim() } : {}),
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        setStatus('Abgebrochen.');
        return;
      }

      // Erst prüfen, dann zeigen. Was hier durchfällt, sieht niemand als Angebot.
      const checked = checkSentenceSuggestion(answer, draft);
      if (!checked.ok) {
        setError(`${checked.message} Du kannst es erneut versuchen.`);
        setStatus('Der Vorschlag wurde verworfen.');
        return;
      }

      setOrigin('lokal');
      setSuggestion({ english: checked.english, german: checked.german });
      setStatus('Ein Satzvorschlag liegt vor. Er wurde noch nicht übernommen.');
    } catch (caught: unknown) {
      preparedFor.current = null;
      setProgress(null);
      if (controller.signal.aborted) {
        setStatus('Abgebrochen.');
      } else {
        setError(
          caught instanceof Error
            ? `Der Satz konnte nicht erzeugt werden: ${caught.message}`
            : 'Der Satz konnte nicht erzeugt werden.',
        );
      }
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  function accept(): void {
    if (!suggestion) return;
    onChange(addSuggestedSentence(draft, suggestion));
    setSuggestion(null);
    setStatus('Der Vorschlag wurde als weiterer Beispielsatz übernommen.');
  }

  function replace(): void {
    if (!suggestion || !target) return;
    onChange(replaceSentenceWith(draft, target, suggestion));
    setSuggestion(null);
    setStatus('Der ausgewählte Beispielsatz wurde ersetzt.');
  }

  return (
    <div className="sentence-assistant">
      <Announcer message={status} />

      {state === 'checking' ? (
        <p className="small muted" role="status" style={{ margin: '0.4rem 0 0' }}>
          Verfügbarkeit wird geprüft …
        </p>
      ) : !possible ? (
        <p className="small muted" style={{ margin: '0.4rem 0 0' }}>
          Satzvorschläge sind in diesem Browser nicht verfügbar. Beispielsätze lassen sich oben
          unverändert von Hand eintragen.
        </p>
      ) : (
        <>
          <p className="small muted" style={{ margin: '0.4rem 0 0' }}>
            Satzvorschläge sind <strong>ungeprüft</strong> und werden nie automatisch übernommen.
          </p>
          <div className="row">
            {modes.map((mode) => (
              <Button
                key={mode}
                small
                disabled={busy}
                aria-busy={busy}
                aria-label={`${SENTENCE_MODE_LABELS[mode]}, ${rowLabel}`}
                onClick={() => void generate(mode)}
              >
                {needsDownload
                  ? `Sprachmodell laden – ${SENTENCE_MODE_LABELS[mode]}`
                  : SENTENCE_MODE_LABELS[mode]}
              </Button>
            ))}
            {busy ? (
              <Button small variant="quiet" onClick={() => abortRef.current?.abort()}>
                Abbrechen
              </Button>
            ) : null}
          </div>

          {busy && progress !== null ? (
            <p style={{ margin: '0.4rem 0 0' }}>
              <label htmlFor={`sentence-progress-${draft.id}`} className="small muted">
                Sprachmodell wird vorbereitet
              </label>
              <br />
              <progress id={`sentence-progress-${draft.id}`} max={1} value={progress}>
                {Math.round(progress * 100)} %
              </progress>{' '}
              <span className="small muted">{Math.round(progress * 100)} %</span>
            </p>
          ) : null}

          {error ? (
            <Alert tone="error">
              {error}{' '}
              <Button
                small
                disabled={busy}
                aria-label={`Satzvorschlag für ${rowLabel} neu versuchen`}
                onClick={() => void generate(lastMode)}
              >
                Neu versuchen
              </Button>
            </Alert>
          ) : null}

        </>
      )}

      {/*
        Der optionale Assistent steht eigenständig da – nicht innerhalb des
        Zweigs oben. Sonst wäre er ausgerechnet dort unsichtbar, wo er am
        meisten nützt: in einem Browser ohne lokales Sprachmodell. Ohne
        eingetragenen Schlüssel rendert er nichts.
      */}
      <GeminiAction
        capability="suggest-example-sentences"
        label="Beispielsatz mit Gemini vorschlagen"
        ariaLabel={`Beispielsatz für ${rowLabel} mit Gemini vorschlagen`}
        disabled={busy}
        run={async (signal) => {
          const request = sentenceRequestFor(draft, modes[0] ?? 'create');
          const antwort = await geminiAssistant().suggestSentences(
            {
              english: request.english,
              germanAnswers: request.germanAnswers,
              ...(request.partOfSpeech ? { partOfSpeech: request.partOfSpeech } : {}),
              existingSentences: request.existingSentences,
            },
            {
              grade: context.grade,
              cefrLevel: context.cefrLevel,
              ...(context.topic.trim() ? { topic: context.topic.trim() } : {}),
              maxItems: 1,
              signal,
            },
          );

          /*
            Dieselbe Prüfung wie beim lokalen Modell: Ein Satz ohne die Vokabel
            darin, ein doppelter oder ein zu langer ist kein Angebot, sondern
            Arbeit für die Lehrkraft. Dass der Satz aus dem Netz kam, macht ihn
            nicht besser.
          */
          const erster = antwort.value[0];
          const checked = checkSentenceSuggestion(erster ?? { english: '' }, draft);
          if (!checked.ok) {
            throw new GeminiError('bad-response', `${checked.message} Du kannst es erneut versuchen.`, true);
          }

          setOrigin('gemini');
          setSuggestion({ english: checked.english, german: checked.german });
        }}
      />

      {suggestion ? (
        <div className="candidate__suggestion" style={{ marginTop: '0.5rem' }}>
          <p className="small" style={{ margin: 0 }}>
            <Badge tone="warning">
              {origin === 'gemini' ? 'Gemini, ungeprüft' : 'ungeprüfter Vorschlag'}
            </Badge>{' '}
            <strong>{suggestion.english}</strong>
          </p>
          {suggestion.german ? (
            <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
              {suggestion.german}
            </p>
          ) : null}

          {hasSentences && draft.sentences.length > 1 ? (
            <div className="field" style={{ marginTop: '0.4rem' }}>
              <label htmlFor={`replace-${draft.id}`}>Zu ersetzender Beispielsatz</label>
              <select
                id={`replace-${draft.id}`}
                value={target}
                onChange={(event) => setReplaceTarget(event.target.value)}
              >
                {draft.sentences.map((sentence, index) => (
                  <option key={sentence.id} value={sentence.id}>
                    {index + 1}. {sentence.english || '(leer)'}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="row" style={{ marginTop: '0.4rem' }}>
            <Button
              small
              variant="primary"
              disabled={!canAddSentence(draft)}
              aria-label={`Vorschlag für ${rowLabel} als weiteren Satz übernehmen`}
              onClick={accept}
            >
              Als weiteren Satz übernehmen
            </Button>
            {hasSentences ? (
              <Button
                small
                aria-label={`Vorhandenen Satz für ${rowLabel} ersetzen`}
                onClick={replace}
              >
                Vorhandenen Satz ersetzen
              </Button>
            ) : null}
            <Button
              small
              variant="quiet"
              aria-label={`Vorschlag für ${rowLabel} ablehnen`}
              onClick={() => {
                setSuggestion(null);
                setStatus('Der Vorschlag wurde abgelehnt.');
              }}
            >
              Ablehnen
            </Button>
            <Button
              small
              variant="quiet"
              disabled={busy}
              aria-label={`Satzvorschlag für ${rowLabel} neu erzeugen`}
              onClick={() => void generate(lastMode)}
            >
              Neu versuchen
            </Button>
          </div>

          {!canAddSentence(draft) ? (
            <p className="small muted" style={{ margin: '0.4rem 0 0' }}>
              Diese Vokabel hat bereits {MAX_SENTENCES} Beispielsätze. Ein weiterer lässt sich
              nicht hinzufügen – ersetzen geht weiterhin.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default SentenceAssistant;
