import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Announcer, Badge, Button, Card } from '../../ui/components';
import { useTranslationProvider } from '../../providers/ProviderContext';
import {
  describeCandidateForms,
  describeCandidateInflections,
  isUsableCandidate,
  sortCandidates,
  type CandidateSort,
  type TextCandidate,
} from '../../domain/textExtraction';
import { orderByRecommendation } from '../../import/textRecommendation';
import {
  countCandidates,
  describeAbbreviationProgress,
  describeCandidateCount,
} from '../../import/candidateLimit';
import type { CandidateSelection } from '../../import/textDraft';
import type { LearningContext } from '../../import/enrichment';
import type { ProviderState } from '../../providers/state';
import type { TranslationProvider } from '../../translation/TranslationProvider';
import { describePrepareError, type TranslationPreparation } from '../../translation/preparation';
import type { DictionaryProvider } from '../../dictionary/DictionaryProvider';
import { createOfflineDictionary } from '../../dictionary/offlineDictionary';
import {
  enrichWithDictionary,
  type DictionarySuggestionSummary,
} from '../../import/dictionarySuggestions';
import { DictionarySuggestionList } from './DictionarySuggestionList';

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

/**
 * Ein Wörterbuch je Sitzung, nicht je Ansicht.
 *
 * Die 6 MB werden einmal geladen und behalten dann ihre entpackten Fächer im
 * Cache. Jede Ansicht ihr eigenes Exemplar bauen zu lassen hieße, denselben
 * Datensatz mehrfach zu halten.
 */
let sharedDictionary: DictionaryProvider | undefined;
function defaultDictionary(): DictionaryProvider {
  sharedDictionary ??= createOfflineDictionary();
  return sharedDictionary;
}

type RowTranslation = 'idle' | 'pending' | 'suggested' | 'accepted' | 'error';

interface CandidateRow {
  candidate: TextCandidate;
  selected: boolean;
  german: string;
  /**
   * Nur für Abkürzungen: die von der Lehrkraft bearbeitete Langform.
   * Leer heißt „unverändert“ – der Vorschlag der Analyse gilt weiter.
   */
  english?: string | undefined;
  suggestion?: string | undefined;
  /**
   * Woher der Vorschlag stammt. `local` heißt: aus dem Abkürzungslexikon,
   * deterministisch und ohne jedes Modell – ein Modell darf ihn nicht
   * stillschweigend überschreiben.
   */
  suggestionSource?: 'local' | 'model' | 'dictionary' | undefined;
  /** Alle Wörterbuchtreffer zu dieser Zeile – Vorschläge, nie Antworten. */
  dictionary?: DictionarySuggestionSummary | undefined;
  /** Gesetzt, wenn ein Wort derselben Familie schon eine Zeile weiter oben steht. */
  family?: string | undefined;
  suggestedSentence?: string | undefined;
  translation: RowTranslation;
  error?: string | undefined;
}

function toRow(candidate: TextCandidate): CandidateRow {
  // Eine ungeklärte Abkürzung ist noch keine Vokabel: Sie bleibt sichtbar,
  // startet aber nicht ausgewählt – sonst wanderte eine offene Frage
  // unbemerkt ins Paket.
  const selected = isUsableCandidate(candidate);
  const local = candidate.abbreviation?.german.trim() ?? '';

  // Für bekannte Abkürzungen kennt das Lexikon die deutsche Entsprechung. Sie
  // ist ein Vorschlag wie jeder andere – ungeprüft, aber ohne Modell.
  if (local.length > 0) {
    return {
      candidate,
      selected,
      german: '',
      suggestion: local,
      suggestionSource: 'local',
      translation: 'suggested',
    };
  }
  return { candidate, selected, german: '', translation: 'idle' };
}

/**
 * Zählt diese Zeile als geeignete Vokabel?
 *
 * Eine ungeklärte Abkürzung zählt erst, wenn die Lehrkraft ihr eine Langform
 * und eine deutsche Antwort gegeben hat. Vorher wäre sie eine offene Frage,
 * die als erledigt gezählt wird.
 */
function rowIsUsable(row: CandidateRow): boolean {
  if (isUsableCandidate(row.candidate)) return true;

  const english = (row.english ?? row.candidate.english).trim();
  const bare = row.candidate.abbreviation?.abbreviation.trim().toLowerCase() ?? '';
  const completed = english.length > 0 && english.toLowerCase() !== bare;
  return completed && row.german.trim().length > 0;
}

/**
 * Der Kandidat, wie er in den Entwurf geht.
 *
 * Bei Abkürzungen darf die Lehrkraft die Langform korrigieren; alles andere
 * bleibt, wie die Analyse es im Text gefunden hat.
 */
function headwordOf(row: CandidateRow): TextCandidate {
  const edited = row.english?.trim();
  if (!edited || edited === row.candidate.english) return row.candidate;
  return { ...row.candidate, english: edited };
}

export interface TextCandidateReviewProps {
  candidates: readonly TextCandidate[];
  /** Derselbe Lernkontext wie im übrigen Assistenten – Änderungen wandern nach oben. */
  context: LearningContext;
  onContextChange: (context: LearningContext) => void;
  /** Die vor der Analyse gewählte Obergrenze – für die ehrliche Anzeige. */
  requestedCount: number;
  /**
   * Die im Klickpfad der Analyse gestartete Vorbereitung.
   *
   * Ist sie da, wartet diese Ansicht auf **dieselbe** Zusage und erzeugt die
   * Vorschläge danach von selbst – die Hauptaktion hat sie schließlich
   * versprochen. Ein zweiter Klick ist dafür nicht nötig, ein zweiter
   * `prepare()`-Aufruf findet nicht statt.
   */
  preparation?: TranslationPreparation | null;
  /**
   * Das Offline-Wörterbuch. Einspeisbar, damit Tests einen kleinen Bestand
   * einsetzen können; im Betrieb der eingebaute Datensatz.
   */
  dictionary?: DictionaryProvider;
  onApply: (selections: CandidateSelection[]) => void;
  onBack: () => void;
}

export function TextCandidateReview({
  candidates,
  context,
  onContextChange,
  requestedCount,
  preparation,
  dictionary,
  onApply,
  onBack,
}: TextCandidateReviewProps) {
  const provider = useTranslationProvider();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Anbieter, für den `prepare('en','de')` erfolgreich war – sonst `null`. */
  const preparedRef = useRef<TranslationProvider | null>(null);

  const [rows, setRows] = useState<CandidateRow[]>(() => candidates.map(toRow));
  /**
   * Zwei Spiegel für den automatischen Ablauf: Wenn die Vorbereitung erfüllt
   * ist, braucht der Effekt die *dann* aktuellen Zeilen und die aktuelle
   * Übersetzungsfunktion – nicht die von seinem Anlauf.
   */
  /**
   * Was „Abbrechen“ gerade bedeutet: während der Vorbereitung den
   * Modelldownload, während der Übersetzungen die laufende Schleife.
   */
  const cancelRef = useRef<(() => void) | null>(null);
  const rowsRef = useRef(rows);
  const runTranslationRef = useRef<(targets: readonly CandidateRow[]) => Promise<void>>(
    () => Promise.resolve(),
  );
  const [sort, setSort] = useState<ReviewSort>('text-order');
  /** Empfehlungen des Sprachmodells – reine Markierung, nie eine Auswahl. */
  const [recommendedIds, setRecommendedIds] = useState<readonly string[]>([]);
  const [providerState, setProviderState] = useState<ProviderState | 'checking'>('checking');
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [providerError, setProviderError] = useState('');
  const [dictionaryState, setDictionaryState] = useState<'prueft' | 'laeuft' | 'fertig' | 'fehlt'>(
    'prueft',
  );
  const [dictionaryUnambiguous, setDictionaryUnambiguous] = useState(0);

  // Fokus nach der Analyse auf die Ergebnisüberschrift.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  /*
    Das Offline-Wörterbuch läuft **von selbst**, gleich nach der Analyse.

    Kein Knopf, keine Erlaubnis, kein Modell: Es ist der verlässliche Grundweg
    und funktioniert in Safari wie in Chrome. Was es liefert, sind Vorschläge –
    eingetragen wird nichts, überschrieben schon gar nichts.
  */
  useEffect(() => {
    let active = true;
    const provider = dictionary ?? defaultDictionary();

    void (async () => {
      if (!(await provider.isAvailable())) {
        if (active) setDictionaryState('fehlt');
        return;
      }
      if (!active) return;
      setDictionaryState('laeuft');

      /*
        Gesammelt wird in einer eigenen Ablage, **nicht** in den Zeilen selbst.

        Die Suche über alle Kandidaten dauert einen Moment, und in diesem Moment
        tippt die Lehrkraft womöglich schon. Ein früherer Entwurf schrieb am
        Ende `setRows(result.rows)` – und warf damit jede Eingabe weg, die
        während der Suche entstanden war. Ein E2E-Test hat das aufgedeckt:
        Angehakte Zeilen verschwanden mitten im Ablauf wieder.

        Deshalb wird am Schluss **zusammengeführt**, nicht ersetzt: Jede Zeile
        wird über ihre Id wiedergefunden, und wer inzwischen eine Antwort trägt,
        bekommt gar keinen Vorschlag mehr.
      */
      const found = new Map<string, { summary: DictionarySuggestionSummary; family?: string }>();
      const result = await enrichWithDictionary(
        rowsRef.current,
        (row) => headwordOf(row).english,
        provider,
        (row, summary, family) => {
          found.set(row.candidate.id, { summary, ...(family ? { family } : {}) });
          return row;
        },
      );

      if (!active) return;
      setRows((current) =>
        current.map((row) => {
          const hit = found.get(row.candidate.id);
          if (!hit) return row;
          // Zweite Prüfung, jetzt gegen den *aktuellen* Stand der Zeile.
          if (row.german.trim().length > 0) return row;
          return { ...row, dictionary: hit.summary, family: hit.family };
        }),
      );
      setDictionaryState('fertig');
      setDictionaryUnambiguous(result.unambiguous);
      setStatus(
        result.filled === 0
          ? 'Das Offline-Wörterbuch hat zu diesen Wörtern nichts gefunden.'
          : `Offline-Wörterbuch: ${result.filled} von ${rowsRef.current.length} Wörtern gefunden, ` +
            `${result.unambiguous} davon eindeutig.`,
      );
    })();

    return () => {
      active = false;
    };
    // Absichtlich nur beim ersten Aufbau: Die Kandidatenliste ist zu diesem
    // Zeitpunkt vollständig, und ein erneuter Lauf würde bereits übernommene
    // Antworten wieder mit Vorschlägen überziehen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    // Ein anderer Anbieter bedeutet: nichts ist mehr vorbereitet.
    if (preparedRef.current !== provider) preparedRef.current = null;
    void provider
      .getAvailability(SOURCE_LANGUAGE, TARGET_LANGUAGE)
      .then((state) => {
        if (!active) return;
        // Ein verspätetes `getAvailability` darf eine bereits gelungene
        // Vorbereitung nicht zurückstufen: „available“ ist dann die
        // maßgebliche Auskunft, nicht der ältere Zustandsbericht.
        if (preparedRef.current === provider) return;
        setProviderState(state);
      })
      .catch(() => {
        if (active && preparedRef.current !== provider) setProviderState('unavailable');
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

  /**
   * Zwei verschiedene Zahlen, bewusst getrennt gehalten:
   *
   * - **Was der Text hergab** – das Analyseergebnis. Es steht fest, sobald die
   *   Analyse gelaufen ist, und ändert sich weder durch Bearbeiten noch durch
   *   Entfernen. Sonst stünde nach zwei vervollständigten Abkürzungen
   *   „12 von 10 gefunden“ da, und die Anzeige wäre wertlos.
   * - **Was die Lehrkraft daraus gemacht hat** – der Bearbeitungsstand.
   */
  const analysed = useMemo(() => countCandidates(candidates), [candidates]);

  const abbreviationRows = rows.filter((row) => !isUsableCandidate(row.candidate));
  const completedAbbreviations = abbreviationRows.filter(rowIsUsable).length;
  const openAbbreviations = abbreviationRows.length - completedAbbreviations;
  const abbreviationProgress =
    analysed.unresolved > 0
      ? describeAbbreviationProgress(completedAbbreviations, openAbbreviations)
      : '';

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
   * Die Sammelaktion – und ihre Grenze.
   *
   * Übernommen wird nur, was das Wörterbuch **eindeutig** hergibt: eine
   * Wortart, eine Bedeutung, eine unmarkierte Entsprechung. Alles Mehrdeutige
   * bleibt liegen, und alles, was die Lehrkraft schon geschrieben hat, wird
   * nicht angefasst. Die Zahl steht vorher auf dem Knopf, damit niemand
   * überrascht wird.
   */
  function acceptUnambiguousDictionarySuggestions(): void {
    let taken = 0;
    setRows((current) =>
      current.map((row) => {
        if (!row.dictionary?.unambiguous) return row;
        if (row.german.trim().length > 0) return row;
        taken += 1;
        return { ...row, german: row.dictionary.primary, translation: 'accepted' };
      }),
    );
    setStatus(
      taken === 0
        ? 'Es gab nichts zu übernehmen – alle eindeutigen Zeilen haben schon eine Antwort.'
        : `${taken} eindeutige Wörterbuchvorschläge übernommen. Bitte trotzdem durchsehen.`,
    );
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
      // Ein lokal bekannter Vorschlag bleibt stehen: „die Quadratmeile“ kommt
      // aus dem Lexikon und ist dort richtig. Der Beispielsatz wird trotzdem
      // übersetzt – der hilft unabhängig davon.
      const keepLocal = row.suggestionSource === 'local' && row.translation !== 'accepted';
      try {
        const word = keepLocal
          ? (row.suggestion ?? '')
          : (await provider.translate(row.candidate.english, signal)).trim();
        const sentence = await provider.translate(row.candidate.sourceSentence, signal);
        update(row.candidate.id, {
          suggestion: word,
          suggestionSource: keepLocal ? 'local' : 'model',
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
    cancelRef.current = () => controller.abort();
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
      cancelRef.current = null;
    }
  }

  // Spiegel nach jedem Rendern aktualisieren.
  useEffect(() => {
    rowsRef.current = rows;
    runTranslationRef.current = runTranslation;
  });

  /**
   * Der automatische Teil der Hauptaktion.
   *
   * Die Analyse ist längst sichtbar; hier wird nur noch abgewartet, was der
   * Klick auf „Text analysieren und Übersetzungen vorschlagen“ angestoßen hat.
   * Geht es gut, laufen die Vorschläge für die ausgewählten Zeilen von selbst
   * an – die Beschriftung hat sie versprochen. Geht es schief, steht der Grund
   * hier, mit „Erneut versuchen“ und der Handeingabe daneben.
   */
  useEffect(() => {
    if (!preparation || preparation.provider !== provider) return;

    let active = true;
    setBusy(true);
    setProviderState('downloading');
    setStatus('Das Sprachmodell wird vorbereitet.');

    // Fortschritt, der schon vor dem Öffnen dieser Ansicht gemeldet wurde,
    // kommt beim Anmelden sofort mit.
    const unsubscribe = preparation.onProgress((value) => {
      if (active) setProgress(value);
    });
    cancelRef.current = () => preparation.cancel();

    void preparation.outcome.then((outcome) => {
      // Nach dem Verlassen der Ansicht wird nichts mehr gesetzt und nichts
      // mehr übersetzt.
      if (!active) return;
      setBusy(false);
      setProgress(null);
      cancelRef.current = null;

      if (!outcome.ok) {
        preparedRef.current = null;
        setProviderState('downloadable');
        if (outcome.cancelled) {
          // Ein Abbruch ist kein Fehler: keine Alarmmeldung, keine Übersetzung.
          setStatus('Laden abgebrochen.');
          return;
        }
        setProviderError(describePrepareError(outcome.error));
        setStatus('Das Sprachmodell konnte nicht geladen werden.');
        return;
      }

      preparedRef.current = provider;
      setProviderState('available');
      void runTranslationRef.current(rowsRef.current.filter((row) => row.selected));
    });

    return () => {
      active = false;
      unsubscribe();
      // Bewusst **kein** `cancel()` hier: React ruft diese Aufräumfunktion im
      // StrictMode auch beim reinen Neuaufbau. Der Abbruch beim echten
      // Verlassen der Werkstatt gehört deshalb dorthin, wo er eindeutig ist –
      // in den Import-Assistenten, der die Vorbereitung auch gestartet hat.
    };
  }, [preparation, provider]);

  function apply(): void {
    const selections: CandidateSelection[] = rows
      .filter((row) => row.selected)
      .map((row) => ({
        candidate: headwordOf(row),
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
        <p className="muted small candidates-summary">
          <strong>
            {describeCandidateCount(analysed.usable, requestedCount, analysed.unresolved)}
          </strong>{' '}
          {abbreviationProgress ? <em>{abbreviationProgress}</em> : null} Alles wurde
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
          {dictionaryUnambiguous > 0 ? (
            <Button
              small
              onClick={acceptUnambiguousDictionarySuggestions}
              title="Nur Wörter mit genau einer unmarkierten Bedeutung"
            >
              Eindeutige Wörterbuchvorschläge übernehmen ({dictionaryUnambiguous})
            </Button>
          ) : null}
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

      {/*
        Der Browserhinweis – einmal je Ansicht, nicht bei jeder Suche.

        Erkannt wird über Feature Detection (`getAvailability`), nicht über den
        User-Agent: Was ein Browser kann, sagt der Browser, nicht sein Name.
        Und der Hinweis behauptet nicht, Chrome könne das überall – er nennt
        die Bedingung mit.
      */}
      {dictionaryState === 'fertig' || dictionaryState === 'fehlt' ? (
        <Alert tone="info" title="Lokale Grundvorschläge">
          {dictionaryState === 'fertig' ? (
            <>
              Das integrierte Offline-Wörterbuch funktioniert auch in Safari. Übersetzungsvorschläge
              sowie Wortform- und Abkürzungserkennung laufen vollständig auf deinem Gerät.
            </>
          ) : (
            <>
              Das integrierte Offline-Wörterbuch steht hier gerade nicht zur Verfügung. Wortform-
              und Abkürzungserkennung funktionieren unverändert; deutsche Antworten trägst du
              selbst ein.
            </>
          )}{' '}
          {providerState === 'unavailable' ? (
            <>
              Für zusätzliche, kontextbezogene KI-Vorschläge kannst du LexiFlow in einer aktuellen
              Desktop-Version von Google Chrome öffnen – dort sind sie verfügbar, sofern Chrome und
              das Gerät die lokalen Modelle unterstützen.
            </>
          ) : (
            <>In diesem Browser kann zusätzlich ein lokales Sprachmodell kontextbezogene Vorschläge
              erzeugen.</>
          )}
        </Alert>
      ) : null}

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
                <Button small onClick={() => cancelRef.current?.()}>
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
        {providerError ? (
          <Alert tone="error">
            {providerError} Die deutschen Antworten lassen sich weiterhin von Hand eintragen.{' '}
            <Button
              small
              disabled={busy || !canTranslate}
              onClick={() => void runTranslation(selectedRows)}
            >
              Erneut versuchen
            </Button>
          </Alert>
        ) : null}
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
          const inflections = describeCandidateInflections(candidate);
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
                {candidate.abbreviation ? (
                  <Badge tone={candidate.abbreviation.resolved ? 'success' : 'warning'}>
                    {candidate.abbreviation.resolved
                      ? 'Abkürzung erkannt'
                      : 'Abkürzung – muss geprüft werden'}
                  </Badge>
                ) : null}
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

              {/* Was im Text tatsächlich stand – ehrlicher als eine bloße Zahl. */}
              <p className="small muted" style={{ margin: '0 0 0.35rem' }}>
                {describeCandidateForms(candidate)}
                {inflections.length > 0 ? ` · ${inflections.join(' · ')}` : ''}
              </p>

              <p className="candidate__sentence">
                <span className="visually-hidden">Originalsatz: </span>
                „{candidate.sourceSentence}“
              </p>

              {candidate.abbreviation ? (
                <div className="field">
                  <label htmlFor={`en-${candidate.id}`}>
                    Langform für „{candidate.abbreviation.abbreviation}“
                  </label>
                  <input
                    id={`en-${candidate.id}`}
                    type="text"
                    value={row.english ?? candidate.english}
                    onChange={(event) => update(candidate.id, { english: event.target.value })}
                  />
                  <span className="small muted">{candidate.abbreviation.hint}</span>
                </div>
              ) : null}

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
                    {row.suggestionSource === 'local' ? (
                      <Badge>lokaler Vorschlag</Badge>
                    ) : (
                      <Badge tone="warning">maschineller Vorschlag</Badge>
                    )}{' '}
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

              {row.dictionary ? (
                <DictionarySuggestionList
                  label={label}
                  summary={row.dictionary}
                  current={row.german}
                  family={row.family}
                  onAccept={(german) =>
                    update(candidate.id, { german, translation: 'accepted' })
                  }
                />
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
