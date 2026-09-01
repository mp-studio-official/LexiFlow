import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Announcer, Badge, Button, Card, Field } from '../../ui/components';
import { useTranslationProvider } from '../../providers/ProviderContext';
import {
  describeCandidateForms,
  describeCandidateInflections,
  type TextCandidate,
} from '../../domain/textExtraction';
import type { CandidateSelection } from '../../import/textDraft';
import type { LearningContext } from '../../import/enrichment';
import type { ProviderState } from '../../providers/state';
import type { TranslationProvider } from '../../translation/TranslationProvider';
import { describePrepareError, type TranslationPreparation } from '../../translation/preparation';
import type { DictionaryProvider } from '../../dictionary/DictionaryProvider';
import { createOfflineDictionary } from '../../dictionary/offlineDictionary';
import {
  partOfSpeechOf,
  safeAutoAnswer,
  summarizeLookup,
  type DictionarySuggestionSummary,
} from '../../import/dictionarySuggestions';
import {
  DEFAULT_RECOMMENDATION_COUNT,
  RECOMMENDATION_COUNTS,
  RECOMMENDATION_SORT_LABELS,
  describeReplacement,
  familyKey,
  familyKeys,
  replaceOpenRecommendations,
  type RecommendationInput,
  type RecommendationSort,
} from '../../import/recommendation';
import type { TopicSuggestion } from '../../import/topicSuggestion';
import { CEFR_LEVELS, GRADES, GRADE_LABELS } from '../../domain/cefr';
import type { CefrLevel, Grade } from '../../domain/cefr';
import { PART_OF_SPEECH, PART_OF_SPEECH_LABELS, type PartOfSpeech } from '../../domain/schema';
import { DictionarySuggestionList } from './DictionarySuggestionList';

/**
 * Schritt 2 des Import-Assistenten: **Empfehlungen generieren**.
 *
 * Vorher stand hier eine Liste aller gefundenen Wörter mit Häkchen davor. Das
 * sah nach Kontrolle aus und war in Wahrheit eine Zumutung: fünfzig Zeilen in
 * Textreihenfolge, davon die Hälfte Wörter, die eine neunte Klasse längst kann,
 * und die Aufgabe, daraus die richtigen zehn anzuhaken.
 *
 * Jetzt macht LexiFlow den ersten Vorschlag und die Lehrkraft korrigiert ihn.
 * Drei Dinge folgen daraus:
 *
 * - **Keine Häkchen.** Was hier steht, ist der Vorschlag; was eine deutsche
 *   Antwort hat, wird übernommen. Eine Zeile ohne Antwort ist keine abgewählte
 *   Vokabel, sondern eine offene Frage – und die Zählung sagt das auch so.
 * - **Nachlegen statt Durchklicken.** „Offene Empfehlungen ersetzen“ holt neue
 *   Wörter, ohne die schon beantworteten anzurühren. Was dabei weicht, ist
 *   nicht weg, sondern steht unter „Frühere Empfehlungen“.
 * - **Das Wörterbuch arbeitet vorher.** Es läuft einmal über alle Kandidaten,
 *   noch bevor die erste Empfehlung entsteht – seine Auskunft ist eines der
 *   Merkmale, aus denen die Empfehlung sich ergibt.
 *
 * Ein maschineller Übersetzungsvorschlag gilt weiterhin **nie** als geprüft.
 * Er steht neben dem Eingabefeld und muss übernommen oder abgetippt werden.
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
  /** Die Antwort. Nicht leer heißt: Diese Vokabel geht ins Paket. */
  german: string;
  /** Der Lexemschlüssel – über ihn werden Wortfamilien auseinandergehalten. */
  family: string;
  /** Alle beanspruchten Familien; bei Mehrwortbegriffen auch die der Teile. */
  families: readonly string[];
  /** Vorausgefüllt aus dem Wörterbuch, jederzeit änderbar. */
  partOfSpeech: PartOfSpeech | '';
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
  suggestedSentence?: string | undefined;
  translation: RowTranslation;
  error?: string | undefined;
}

function toRow(input: RecommendationInput): CandidateRow {
  const { candidate, dictionary } = input;
  const local = candidate.abbreviation?.german.trim() ?? '';
  const base: CandidateRow = {
    candidate,
    german: '',
    family: familyKey(candidate.english, dictionary),
    families: familyKeys(candidate.english, dictionary),
    partOfSpeech: partOfSpeechOf(dictionary),
    dictionary,
    translation: 'idle',
  };

  // Für bekannte Abkürzungen kennt das Lexikon die deutsche Entsprechung. Sie
  // ist ein Vorschlag wie jeder andere – ungeprüft, aber ohne Modell.
  if (local.length > 0) {
    return { ...base, suggestion: local, suggestionSource: 'local', translation: 'suggested' };
  }
  return base;
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

function hasAnswer(row: CandidateRow): boolean {
  return row.german.trim().length > 0;
}

/**
 * Woher der Themenvorschlag kommt – oder dass es keinen gibt.
 *
 * Der dritte Fall ist der wichtigste: Wenn im Text nichts heraussticht,
 * erfindet LexiFlow kein Thema und sagt das auch. Ein falscher Vorschlag muss
 * bemerkt und weggeklickt werden; ein leeres Feld ist eine Aufgabe.
 */
export function describeTopicSuggestion(
  source: TopicSuggestion['source'],
  topic: string | undefined,
): string {
  if (!topic) {
    return 'Aus diesem Text ließ sich kein Thema ableiten – trag es selbst ein, wenn du magst.';
  }
  return source === 'heading'
    ? `Aus der Überschrift des Textes vorgeschlagen: „${topic}“. Frei änderbar.`
    : `Aus den häufigsten Begriffen des Textes vorgeschlagen: „${topic}“. Frei änderbar.`;
}

/** „7 Vokabeln werden übernommen · 3 Empfehlungen sind noch offen.“ */
export function describeProgress(taken: number, open: number): string {
  const links =
    taken === 1 ? '1 Vokabel wird übernommen' : `${taken} Vokabeln werden übernommen`;
  if (open === 0) return `${links}. Keine Empfehlung ist mehr offen.`;
  const rechts =
    open === 1 ? '1 Empfehlung ist noch offen' : `${open} Empfehlungen sind noch offen`;
  return `${links} · ${rechts}.`;
}

export interface TextCandidateReviewProps {
  /** **Alle** Kandidaten der Analyse – die Auswahl trifft dieser Schritt. */
  candidates: readonly TextCandidate[];
  /** Derselbe Lernkontext wie im übrigen Assistenten – Änderungen wandern nach oben. */
  context: LearningContext;
  onContextChange: (context: LearningContext) => void;
  /** Ein Themenvorschlag aus dem Text, sofern etwas herausstach. */
  suggestedTopic?: string;
  /** Woraus er entstanden ist – die Beschriftung sagt es dazu. */
  topicSource?: TopicSuggestion['source'];
  /**
   * Trägt der Quelltext Zeitschriftenapparat? Dann werden `issue`, `volume`
   * und Verwandtes abgewertet – sie sind Kopfdaten, nicht Lernvokabeln.
   */
  publicationContext?: boolean;
  /**
   * Die im Klickpfad der Analyse gestartete Vorbereitung.
   *
   * Ist sie da, wartet diese Ansicht auf **dieselbe** Zusage – die Hauptaktion
   * hat sie schließlich versprochen. Ein zweiter `prepare()`-Aufruf findet
   * nicht statt.
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
  suggestedTopic,
  topicSource = 'none',
  publicationContext,
  preparation,
  dictionary,
  onApply,
  onBack,
}: TextCandidateReviewProps) {
  const provider = useTranslationProvider();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Anbieter, für den `prepare('en','de')` erfolgreich war – sonst `null`. */
  const preparedRef = useRef<TranslationProvider | null>(null);

  /* ------------------------------------------------------------ Einstellungen */
  const [sort, setSort] = useState<RecommendationSort>('recommended');
  const [count, setCount] = useState<number>(DEFAULT_RECOMMENDATION_COUNT);

  /* ------------------------------------------------------------- Wörterbuch */
  /** Was das Wörterbuch zu jedem Kandidaten weiß. Einmal berechnet, dann fest. */
  const [lookups, setLookups] = useState<ReadonlyMap<string, DictionarySuggestionSummary>>(
    new Map(),
  );
  const [dictionaryState, setDictionaryState] = useState<'prueft' | 'laeuft' | 'fertig' | 'fehlt'>(
    'prueft',
  );

  /* --------------------------------------------------------- Die Empfehlungen */
  const [rows, setRows] = useState<CandidateRow[]>([]);
  /** Ersetzte und entfernte Empfehlungen – aufhebbar, nicht verloren. */
  const [earlier, setEarlier] = useState<CandidateRow[]>([]);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [generated, setGenerated] = useState(false);

  const [providerState, setProviderState] = useState<ProviderState | 'checking'>('checking');
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [providerError, setProviderError] = useState('');

  /**
   * Was „Abbrechen“ gerade bedeutet: während der Vorbereitung den
   * Modelldownload, während der Übersetzungen die laufende Schleife.
   */
  const cancelRef = useRef<(() => void) | null>(null);
  const rowsRef = useRef(rows);
  const runTranslationRef = useRef<(targets: readonly CandidateRow[]) => Promise<void>>(
    () => Promise.resolve(),
  );
  /**
   * Die Vorbereitung ist durch, aber es gibt noch keine Empfehlungen.
   *
   * Das ist der Normalfall geworden: Das Sprachmodell wird beim „Text
   * analysieren“ angestoßen und ist oft eher fertig als die Lehrkraft mit
   * Jahrgang und Niveau. Früher lief die Übersetzung sofort nach der
   * Vorbereitung an – über eine Zeilenliste, die es zu diesem Zeitpunkt gar
   * nicht mehr gibt. Deshalb wird das Versprechen hier gemerkt und beim ersten
   * Empfehlungslauf eingelöst.
   */
  const awaitingAutoTranslation = useRef(false);

  // Fokus nach der Analyse auf die Ergebnisüberschrift.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  /*
    Das Offline-Wörterbuch läuft **von selbst**, gleich nach der Analyse – und
    zwar über alle Kandidaten, nicht nur über die späteren Empfehlungen.

    Der Grund ist die Reihenfolge: Ob das Wörterbuch ein Wort kennt, ist eines
    der Merkmale, aus denen sich die Empfehlung ergibt. Erst empfehlen und dann
    nachschlagen hieße, mit halber Auskunft zu entscheiden.

    Kein Knopf, keine Erlaubnis, kein Modell: Es ist der verlässliche Grundweg
    und funktioniert in Safari wie in Chrome.
  */
  useEffect(() => {
    let active = true;
    const source = dictionary ?? defaultDictionary();

    void (async () => {
      // Ein Wörterbuch, das nicht antwortet, darf die Hauptaktion nicht
      // dauerhaft sperren: Ohne Wörterbuch sind die Empfehlungen schlechter,
      // aber sie gibt es.
      let available = false;
      try {
        available = await source.isAvailable();
      } catch {
        available = false;
      }
      if (!available) {
        if (active) setDictionaryState('fehlt');
        return;
      }
      if (!active) return;
      setDictionaryState('laeuft');

      const found = new Map<string, DictionarySuggestionSummary>();
      for (const candidate of candidates) {
        try {
          const summary = summarizeLookup(await source.lookup(candidate.english));
          if (summary) found.set(candidate.id, summary);
        } catch {
          // Ein kaputtes Fach kostet dieses eine Wort, nicht den ganzen Lauf.
        }
      }

      if (!active) return;
      setLookups(found);
      setDictionaryState('fertig');
      setStatus(
        found.size === 0
          ? 'Das Offline-Wörterbuch hat zu diesen Wörtern nichts gefunden.'
          : `Offline-Wörterbuch: ${found.size} von ${candidates.length} Wörtern gefunden.`,
      );
    })();

    return () => {
      active = false;
    };
    // Absichtlich nur beim ersten Aufbau: Die Kandidatenliste steht zu diesem
    // Zeitpunkt fest.
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
        // Vorbereitung nicht zurückstufen.
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

  /* --------------------------------------------------------- Empfehlen */

  const inputs = useMemo<RecommendationInput[]>(
    () => candidates.map((candidate) => ({ candidate, dictionary: lookups.get(candidate.id) })),
    [candidates, lookups],
  );

  const update = useCallback((id: string, changes: Partial<CandidateRow>): void => {
    setRows((current) =>
      current.map((row) => (row.candidate.id === id ? { ...row, ...changes } : row)),
    );
  }, []);

  /**
   * Der einzige Weg, auf dem Empfehlungen entstehen – für den ersten Lauf wie
   * für jede Wiederholung.
   *
   * Beantwortete Zeilen bleiben **immer** stehen. Das ist der ganze Unterschied
   * zu einem „neu berechnen“, das alles wegwirft: Wer schon zehn Minuten
   * Antworten getippt hat, darf eine Einstellung ändern dürfen, ohne dafür zu
   * bezahlen. Nachgelegt wird nur bis zur gewünschten Anzahl.
   *
   * `excludeShown` unterscheidet die beiden Anlässe: Beim Ersetzen sollen
   * ausdrücklich **andere** Wörter kommen, bei geänderten Einstellungen darf
   * ein Wort auch wieder auftauchen, wenn es zum neuen Niveau nun passt.
   */
  const refill = useCallback(
    (options: { excludeShown: boolean; announce: (result: { added: number; requested: number }) => string }): void => {
      const result = replaceOpenRecommendations<CandidateRow>({
        inputs,
        rows: rowsRef.current,
        earlier,
        context: { grade: context.grade, cefrLevel: context.cefrLevel },
        sort,
        count,
        excludeShown: options.excludeShown,
        ...(publicationContext === undefined ? {} : { publicationContext }),
        toRow,
      });

      setRows(result.rows);
      setEarlier(result.earlier);
      setGenerated(true);
      setStatus(options.announce(result));

      // Ein bereits eingelöstes Modellversprechen gilt für die neuen Zeilen.
      const freshRows = result.rows.slice(result.rows.length - result.added);
      if (awaitingAutoTranslation.current && freshRows.length > 0) {
        awaitingAutoTranslation.current = false;
        void runTranslationRef.current(freshRows);
      }
      // Der Fokus wandert ans Ergebnis; sonst steht man nach dem Klick weiter
      // oben und weiß nicht, dass sich unten etwas geändert hat.
      window.requestAnimationFrame(() => resultRef.current?.focus());
    },
    [count, sort, inputs, context.grade, context.cefrLevel, earlier, publicationContext],
  );

  function generate(): void {
    refill({
      excludeShown: false,
      announce: (result) =>
        result.added === 0
          ? 'Der Text gibt keine weiteren geeigneten Vokabeln her.'
          : `${result.added} Empfehlungen erzeugt. Bitte durchsehen und ergänzen.`,
    });
  }

  function replaceOpen(): void {
    refill({ excludeShown: true, announce: describeReplacement });
  }

  /**
   * Eine Zeile zurücklegen – nicht wegwerfen.
   *
   * Gesucht wird außerhalb der Aktualisierungsfunktion: Diese läuft beim
   * Rendern und im StrictMode zweimal; ein `setEarlier` darin legte die Zeile
   * doppelt ab.
   */
  function setAside(id: string): void {
    const row = rowsRef.current.find((item) => item.candidate.id === id);
    if (!row) return;
    setRows((current) => current.filter((item) => item.candidate.id !== id));
    setEarlier((current) => [row, ...current]);
    setStatus(`„${row.candidate.english}“ steht jetzt unter „Frühere Empfehlungen“.`);
  }

  /**
   * Eine frühere Empfehlung zurückholen.
   *
   * Sie legt sich **oben drauf** und verdrängt nichts – auch dann nicht, wenn
   * die Liste dadurch länger wird als die eingestellte Anzahl. Etwas
   * stillschweigend hinauszuwerfen, um Platz zu machen, wäre das Gegenteil
   * dessen, was dieser Knopf verspricht. Damit niemand nachzählen muss, sagt
   * die Meldung, wie viele Zeilen jetzt dastehen.
   */
  function restore(id: string): void {
    const row = earlier.find((item) => item.candidate.id === id);
    if (!row) return;
    setEarlier((current) => current.filter((item) => item.candidate.id !== id));
    setRows((current) => [...current, row]);
    const gesamt = rowsRef.current.length + 1;
    setStatus(
      `„${row.candidate.english}“ wieder aufgenommen. Die Liste hat jetzt ${gesamt} Empfehlungen` +
        (gesamt > count ? ` – mehr als die eingestellten ${count}. Es wurde nichts verdrängt.` : '.'),
    );
  }

  /**
   * Die Sammelaktion – und ihre Grenze.
   *
   * Was `safeAutoAnswer` durchlässt, sind unmarkierte Entsprechungen einer
   * einzigen Bedeutungsgruppe. Alles andere bleibt liegen: mehrdeutige Wörter,
   * veraltete Angaben, Klammerbedingungen und erschlossene Querverweise. Die
   * bleiben als Ein-Klick-Vorschlag daneben stehen – sichtbar, aber nicht
   * eingetragen.
   */
  function fillSafeTranslations(): void {
    /*
      Gezählt wird **vor** dem Setzen, nicht in der Aktualisierungsfunktion.

      Ein früherer Entwurf zählte in `setRows(current => …)` hoch und meldete
      danach das Ergebnis – nur läuft diese Funktion erst beim nächsten Rendern,
      und im StrictMode zweimal. Die Meldung sagte deshalb verlässlich „Es gab
      nichts einzutragen“, während die Felder sich sichtbar füllten.
    */
    const filled = rowsRef.current
      .filter((row) => !hasAnswer(row))
      .map((row) => ({ row, answer: safeAutoAnswer(row.dictionary) }));
    const taken = filled.filter((item) => item.answer).length;
    const left = filled.filter((item) => !item.answer && item.row.dictionary).length;

    setRows((current) =>
      current.map((row) => {
        if (hasAnswer(row)) return row;
        const answer = safeAutoAnswer(row.dictionary);
        if (!answer) return row;
        return { ...row, german: answer, suggestionSource: 'dictionary', translation: 'accepted' };
      }),
    );
    setStatus(
      taken === 0
        ? 'Es gab nichts, was sich ohne Rückfrage eintragen ließe.'
        : `${taken} Übersetzungen eingetragen. Bitte trotzdem durchsehen.` +
          (left > 0
            ? ` ${left} Wörter blieben leer, weil sie mehrdeutig oder markiert sind – die Vorschläge stehen jeweils darunter.`
            : ''),
    );
  }

  /* ------------------------------------------------------------ Übersetzen */

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
      setStatus('Es sind keine offenen Empfehlungen da, für die sich ein Vorschlag lohnte.');
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
   * Klick im ersten Schritt angestoßen hat. Geht es schief, steht der Grund
   * hier, mit „Erneut versuchen“ und der Handeingabe daneben.
   */
  useEffect(() => {
    if (!preparation || preparation.provider !== provider) return;

    let active = true;
    setBusy(true);
    setProviderState('downloading');
    setStatus('Das Sprachmodell wird vorbereitet.');

    const unsubscribe = preparation.onProgress((value) => {
      if (active) setProgress(value);
    });
    cancelRef.current = () => preparation.cancel();

    void preparation.outcome.then((outcome) => {
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
      // Übersetzt wird, was offen ist – nicht, was ohnehin schon eine Antwort
      // hat. Der Rest der Empfehlungen soll nicht überschrieben werden.
      const open = rowsRef.current.filter((row) => !hasAnswer(row));
      if (open.length === 0) {
        // Noch keine Empfehlungen: Das Versprechen wird beim Empfehlen eingelöst.
        awaitingAutoTranslation.current = true;
        setStatus('Das Sprachmodell ist bereit. Die Vorschläge kommen mit den Empfehlungen.');
        return;
      }
      void runTranslationRef.current(open);
    });

    return () => {
      active = false;
      unsubscribe();
      // Bewusst **kein** `cancel()` hier: React ruft diese Aufräumfunktion im
      // StrictMode auch beim reinen Neuaufbau.
    };
  }, [preparation, provider]);

  /* ----------------------------------------------------------- Übergeben */

  const taken = rows.filter(hasAnswer);
  const open = rows.length - taken.length;

  function apply(): void {
    const selections: CandidateSelection[] = taken.map((row) => ({
      candidate: headwordOf(row),
      german: row.german,
      partOfSpeech: row.partOfSpeech,
      translationAccepted: row.translation === 'accepted' && row.suggestionSource === 'model',
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
        : 'Vorschläge für offene Empfehlungen erzeugen';

  return (
    <div className="stack">
      <div>
        <h2 id="empfehlungen-heading" ref={headingRef} tabIndex={-1}>
          Empfehlungen generieren
        </h2>
        <p className="muted small">
          Aus {candidates.length} gefundenen Wörtern schlägt LexiFlow die vor, die zum Jahrgang und
          Niveau passen. Das ist eine <strong>Schätzung aus messbaren Merkmalen</strong> – Länge,
          Wortbildung, Häufigkeit und Stellung im Text sowie die Auskunft des Offline-Wörterbuchs –,
          keine geprüfte Wortliste. Alles wurde auf diesem Gerät berechnet. Beispielsätze stammen
          unverändert aus deinem Text; Übersetzungen erfindet LexiFlow nicht.
        </p>
      </div>

      <Announcer message={status} />

      {/* ---------------------------------------------------- Einstellungen */}
      <Card>
        <h3 style={{ fontSize: '1rem' }}>Wofür sind die Vokabeln?</h3>
        <p className="muted small">
          Jahrgang und Niveau bestimmen die Auswahl. Sie stehen im letzten Schritt schon bereit.
        </p>
        <div className="field-grid">
          {/*
            Das Thema ist vorgeschlagen und trotzdem ein ganz normales Feld.

            Die Beschriftung sagt, woher der Vorschlag kommt – aus einer
            Überschrift oder aus den häufigsten Begriffen –, und sie sagt es
            auch, wenn es keinen gibt. „Kein Vorschlag“ ist eine Auskunft;
            ein stillschweigend leeres Feld ist keine.
          */}
          <Field label="Thema" hint={describeTopicSuggestion(topicSource, suggestedTopic)}>
            {(props) => (
              <input
                {...props}
                type="text"
                value={context.topic}
                placeholder="z. B. Coastal erosion"
                onChange={(event) => onContextChange({ ...context, topic: event.target.value })}
              />
            )}
          </Field>
          <Field label="Jahrgang">
            {(props) => (
              <select
                {...props}
                value={context.grade}
                onChange={(event) =>
                  onContextChange({ ...context, grade: event.target.value as Grade })
                }
              >
                {GRADES.map((grade) => (
                  <option key={grade} value={grade}>
                    {GRADE_LABELS[grade]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="GeR-Niveau" hint="Folgt dem Jahrgang, bis du widersprichst.">
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
          <Field label="Sortierung">
            {(props) => (
              <select
                {...props}
                value={sort}
                onChange={(event) => setSort(event.target.value as RecommendationSort)}
              >
                {(Object.keys(RECOMMENDATION_SORT_LABELS) as RecommendationSort[]).map((value) => (
                  <option key={value} value={value}>
                    {RECOMMENDATION_SORT_LABELS[value]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field
            label="Anzahl"
            hint="Obergrenze. Gibt der Text weniger her, werden keine erfunden."
          >
            {(props) => (
              <select
                {...props}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              >
                {RECOMMENDATION_COUNTS.map((value) => (
                  <option key={value} value={value}>
                    {value} Vokabeln
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <div className="row" style={{ marginTop: '0.75rem' }}>
          <Button
            variant="primary"
            onClick={generate}
            disabled={dictionaryState === 'prueft' || dictionaryState === 'laeuft'}
          >
            {generated ? 'Empfehlungen neu berechnen' : 'Empfehlungen generieren'}
          </Button>
          {dictionaryState === 'laeuft' || dictionaryState === 'prueft' ? (
            <span className="small muted" role="status">
              Das Offline-Wörterbuch schlägt gerade nach …
            </span>
          ) : null}
        </div>
        {generated ? (
          <p className="small muted" style={{ margin: '0.6rem 0 0' }}>
            Neu berechnet wird nur, was noch keine Antwort hat. Beantwortete Vokabeln bleiben
            stehen.
          </p>
        ) : null}
      </Card>

      {/*
        Der Browserhinweis – einmal je Ansicht, nicht bei jeder Suche.

        Erkannt wird über Feature Detection (`getAvailability`), nicht über den
        User-Agent: Was ein Browser kann, sagt der Browser, nicht sein Name.
        Und der Hinweis behauptet nicht, Chrome könne das überall – er nennt die
        Bedingung mit.
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
              Das integrierte Offline-Wörterbuch steht hier gerade nicht zur Verfügung. Empfehlungen
              sowie Wortform- und Abkürzungserkennung funktionieren unverändert; deutsche Antworten
              trägst du selbst ein.
            </>
          )}{' '}
          {providerState === 'unavailable' ? (
            <>
              Für zusätzliche, kontextbezogene KI-Vorschläge kannst du LexiFlow in einer aktuellen
              Desktop-Version von Google Chrome öffnen – dort sind sie verfügbar, sofern Chrome und
              das Gerät die lokalen Modelle unterstützen.
            </>
          ) : (
            <>
              In diesem Browser kann zusätzlich ein lokales Sprachmodell kontextbezogene Vorschläge
              erzeugen.
            </>
          )}
        </Alert>
      ) : null}

      {/* ------------------------------------------- Optionale Modellhilfe */}
      <Card quiet>
        <h3 style={{ fontSize: '1rem' }}>Übersetzungsvorschläge aus dem Sprachmodell (optional)</h3>
        {providerState === 'checking' ? (
          <p className="small muted" role="status">
            Verfügbarkeit wird geprüft …
          </p>
        ) : providerState === 'unavailable' ? (
          <p className="small muted">
            Dieser Browser bietet keine lokale Übersetzung. Das Offline-Wörterbuch und die
            Handeingabe funktionieren unverändert.
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
                Der Browser lädt das Sprachmodell gerade herunter. Du kannst die Vorschläge
                jetzt anstoßen; sie beginnen, sobald das Modell bereit ist.
              </p>
            ) : null}
            {!busy && providerState === 'downloadable' ? (
              <p className="small muted">
                Das Sprachmodell ist noch nicht auf diesem Gerät. Es wird erst nach deinem
                Klick geladen.
              </p>
            ) : null}
            <div className="row">
              <Button
                small
                disabled={busy || !canTranslate || !generated}
                onClick={() => void runTranslation(rows.filter((row) => !hasAnswer(row)))}
              >
                {translateLabel}
              </Button>
              {/*
                „Abbrechen“ steht hier, nicht im Ergebnisbereich: Der
                Modelldownload läuft schon, während oben noch das Niveau
                eingestellt wird. Ein Abbruch, den man erst nach dem Empfehlen
                erreicht, kommt für einen Gigabyte zu spät.
              */}
              {busy ? (
                <Button small onClick={() => cancelRef.current?.()}>
                  Abbrechen
                </Button>
              ) : null}
            </div>
            {!generated ? (
              <p className="small muted" style={{ margin: '0.4rem 0 0' }}>
                Vorschläge gibt es, sobald Empfehlungen da sind. Läuft das Modell schon, kommen sie
                mit dem ersten Empfehlungslauf von selbst.
              </p>
            ) : null}
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
              onClick={() => void runTranslation(rows.filter((row) => !hasAnswer(row)))}
            >
              Erneut versuchen
            </Button>
          </Alert>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------- Ergebnis */}
      {generated ? (
        <>
          <div>
            <h3 id="ergebnis-heading" ref={resultRef} tabIndex={-1} style={{ fontSize: '1.05rem' }}>
              Vorgeschlagene Vokabeln ({rows.length})
            </h3>
            <p className="small" style={{ margin: 0 }}>
              <strong>{describeProgress(taken.length, open)}</strong>
            </p>
            <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
              Es gibt hier keine Häkchen: Was eine deutsche Antwort hat, wird übernommen. Eine
              Zeile ohne Antwort ist eine offene Frage, keine abgewählte Vokabel.
            </p>
          </div>

          <Card quiet>
            <div className="row">
              <Button
                small
                onClick={fillSafeTranslations}
                title="Nur unmarkierte Entsprechungen einer einzigen Bedeutung"
              >
                Übersetzungsvorschläge eintragen
              </Button>
              <Button small onClick={replaceOpen} disabled={open === 0}>
                <span aria-hidden="true">↻</span> Offene Empfehlungen ersetzen
              </Button>
              <span className="spacer" />
              {earlier.length > 0 ? (
                <Button
                  small
                  variant="quiet"
                  aria-expanded={earlierOpen}
                  aria-controls="fruehere-empfehlungen"
                  onClick={() => setEarlierOpen((value) => !value)}
                >
                  Frühere Empfehlungen ({earlier.length})
                </Button>
              ) : null}
            </div>
            <p className="small muted" style={{ margin: '0.6rem 0 0' }}>
              „Übersetzungsvorschläge eintragen“ füllt nur, was das Wörterbuch ohne Rückfrage
              hergibt. Mehrdeutiges, Veraltetes und über einen Querverweis Erschlossenes bleibt
              leer und steht als Vorschlag darunter.
            </p>
          </Card>

          {earlier.length > 0 ? (
            <div id="fruehere-empfehlungen" hidden={!earlierOpen}>
              <Card quiet>
                <h4 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem' }}>
                  Frühere Empfehlungen ({earlier.length})
                </h4>
                <p className="small muted">
                  Ersetzt oder entfernt – aber nicht verloren. Jede lässt sich zurückholen.
                </p>
                <ul className="earlier">
                  {earlier.map((row) => (
                    <li key={row.candidate.id}>
                      <span>{row.candidate.english}</span>{' '}
                      <Button
                        small
                        variant="quiet"
                        aria-label={`${row.candidate.english} wieder aufnehmen`}
                        onClick={() => restore(row.candidate.id)}
                      >
                        Wieder aufnehmen
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <Alert tone="info">
              Es sind keine Empfehlungen übrig. Hole frühere zurück, ändere die Einstellungen oder
              gehe zurück zum Text.
            </Alert>
          ) : null}

          <ul className="candidates">
            {rows.map((row) => {
              const { candidate } = row;
              const label = candidate.english;
              const inflections = describeCandidateInflections(candidate);
              const answered = hasAnswer(row);

              return (
                <li key={candidate.id} className="candidate" data-answered={answered ? '' : undefined}>
                  <div className="candidate__head">
                    <strong>{label}</strong>
                    <span className="spacer" />
                    <Badge>{candidate.occurrences}× im Text</Badge>
                    {answered ? (
                      <Badge tone="success">wird übernommen</Badge>
                    ) : (
                      <Badge tone="warning">noch offen</Badge>
                    )}
                    {candidate.abbreviation ? (
                      <Badge tone={candidate.abbreviation.resolved ? 'success' : 'warning'}>
                        {candidate.abbreviation.resolved
                          ? 'Abkürzung erkannt'
                          : 'Abkürzung – muss geprüft werden'}
                      </Badge>
                    ) : null}
                    {candidate.isLikelyProperNoun ? <Badge tone="warning">Eigenname?</Badge> : null}
                    <Button
                      small
                      variant="quiet"
                      aria-label={`${label} entfernen`}
                      onClick={() => setAside(candidate.id)}
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
                    <span className="visually-hidden">Originalsatz: </span>„{candidate.sourceSentence}“
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

                  <div className="field-grid">
                    <div className="field">
                      <label htmlFor={`de-${candidate.id}`}>Deutsche Antwort für „{label}“</label>
                      <input
                        id={`de-${candidate.id}`}
                        type="text"
                        value={row.german}
                        onChange={(event) =>
                          update(candidate.id, {
                            german: event.target.value,
                            translation:
                              row.translation === 'accepted' ? 'suggested' : row.translation,
                          })
                        }
                      />
                      <span className="field__hint">
                        Leer heißt: Diese Vokabel geht nicht ins Paket.
                      </span>
                    </div>
                    <div className="field">
                      <label htmlFor={`pos-${candidate.id}`}>Wortart für „{label}“</label>
                      <select
                        id={`pos-${candidate.id}`}
                        value={row.partOfSpeech}
                        onChange={(event) =>
                          update(candidate.id, {
                            partOfSpeech: event.target.value as PartOfSpeech | '',
                          })
                        }
                      >
                        <option value="">–</option>
                        {PART_OF_SPEECH.map((pos) => (
                          <option key={pos} value={pos}>
                            {PART_OF_SPEECH_LABELS[pos]}
                          </option>
                        ))}
                      </select>
                    </div>
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
                      onAccept={(german) => update(candidate.id, { german, translation: 'accepted' })}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <div className="row">
        <Button onClick={onBack}>Zurück zum Text</Button>
        <Button variant="primary" disabled={taken.length === 0} onClick={apply}>
          {taken.length === 1
            ? '1 Vokabel prüfen & speichern'
            : `${taken.length} Vokabeln prüfen & speichern`}
        </Button>
      </div>
    </div>
  );
}
