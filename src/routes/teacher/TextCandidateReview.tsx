import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Announcer, Badge, Button, Card, Field, Meter } from '../../ui/components';
import { useTranslationProvider } from '../../providers/ProviderContext';
import {
  candidateLiteral,
  segmentSentences,
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
  type ScoredCandidate,
} from '../../import/recommendation';
import { CEFR_LEVELS, GRADES, GRADE_LABELS } from '../../domain/cefr';
import type { CefrLevel, Grade } from '../../domain/cefr';
import { PART_OF_SPEECH, PART_OF_SPEECH_LABELS, type PartOfSpeech } from '../../domain/schema';
import { DictionarySuggestionList } from './DictionarySuggestionList';
import { GeminiTranslations } from '../../ai/gemini/ui/GeminiTranslations';
import { GeminiAction } from '../../ai/gemini/ui/GeminiAction';
import { geminiAssistant } from '../../ai/gemini/assistant';
import { GeminiError } from '../../ai/gemini/errors';
import { buildCandidateContext, resolveRecommendations } from '../../import/textRecommendation';
import { Disclosure } from '../../ui/Disclosure';
import { mergeMultiwordTokens, tokenizeSource } from '../../import/sourceTokens';
import { pickFromSource } from '../../import/sourcePick';
import { contextPartOfSpeech } from '../../import/contextPartOfSpeech';
import { SourceTextLegend, SourceTextPane, type WordState } from './SourceTextPane';
import { InfoDisclosure } from '../../ui/InfoDisclosure';
import {
  particleAfter,
  proposeLearningForm,
  type LearningFormProposal,
} from '../../import/learningFormProposal';
import { SplitPane } from '../../ui/SplitPane';

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
 * Ab wie vielen Zeichen der Originalsatz zusammengeklappt gezeigt wird.
 *
 * Die Zahl ist eine Schätzung, keine Messung – und das mit Absicht. Wie viele
 * Zeilen ein Satz belegt, hängt an Fensterbreite, Schriftgröße und Zoom; das
 * im Browser auszumessen hieße, bei jedem Rendern Layout zu erzwingen und die
 * Liste bei jeder Fensteränderung springen zu lassen. Das Kürzen selbst
 * übernimmt CSS (`line-clamp: 2`) und trifft es genau; die Schätzung
 * entscheidet nur, ob der Knopf „Ganzen Satz zeigen“ dazugehört.
 *
 * Der Fehler ist deshalb absichtlich einseitig: 150 Zeichen sind auf einer
 * üblichen Kartenbreite eher **weniger** als zwei Zeilen. Auf einem breiten
 * Bildschirm steht der Knopf damit gelegentlich an einem Satz, der ohnehin
 * ganz zu sehen ist – das kostet einen folgenlosen Klick. Der umgekehrte
 * Fehler wäre der schlimme: ein gekürzter Satz ohne Weg zum Rest.
 */
export const SENTENCE_CLAMP_CHARS = 150;

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
  /**
   * Die vorgeschlagene **Lernform** samt Herkunft und offener Frage.
   *
   * Sie ist das, was die Zeile anzeigt und was ins Paket geht – nicht
   * `candidate.english`, das die Textform ist (`depend`, `restraints`).
   */
  proposal: LearningFormProposal;
  suggestedSentence?: string | undefined;
  translation: RowTranslation;
  error?: string | undefined;
  /**
   * Gesetzt, wenn die Form zu mehreren Grundformen gehören könnte und der Satz
   * die Frage nicht beantwortet hat – „lives“ ohne Artikel und ohne Pronomen.
   * Das Stichwort ist dann die Textform, und die Zeile sagt es dazu.
   */
  baseFormHint?: string | undefined;
  /**
   * Was mit der deutschen Antwort dieser Zeile bisher geschehen ist.
   *
   * Bis Sprint 5A entschied genau eine Frage darüber, ob eine Zeile „offen“
   * ist: Steht etwas im Feld? Das kann zwei völlig verschiedene Dinge
   * bedeuten – hier war noch nie jemand, oder hier stand etwas und die
   * Lehrkraft hat es **weggemacht**. Das zweite ist eine Entscheidung, und sie
   * zurückzunehmen, weil das Ergebnis zufällig genauso aussieht wie das erste,
   * war der Fehler.
   */
  antwortStand: AntwortStand;
  /**
   * Woher diese Zeile kommt.
   *
   * `maschinell` – sie ist ein Vorschlag. Eine Schätzung aus messbaren
   * Merkmalen, die beim Ersetzen offener Empfehlungen zur Disposition steht.
   * `quelltext`  – jemand hat sie im Text markiert und aufgenommen. Sie steht
   * nicht da, weil eine Schätzung sie vorgeschlagen hat.
   *
   * Der Unterschied entscheidet, was „Offene Empfehlungen ersetzen“ meint:
   * die Empfehlungen, nicht die Auswahl.
   */
  herkunft: Herkunft;
  /**
   * Die Fassung dieser Zeile.
   *
   * Eine Zeile kann entfernt und wieder aufgenommen werden; die Kennung des
   * Kandidaten bleibt dabei dieselbe. Eine Antwort, die für die alte Zeile
   * unterwegs war, träfe sonst die neue. Die Fassung sagt, für welche Zeile
   * eine Antwort gestartet wurde – passt sie nicht, wird die Antwort
   * verworfen.
   */
  fassung: number;
}

/**
 * `unberuehrt` – hier war noch niemand.
 * `automatisch` – das Wörterbuch hat eingetragen, niemand hat hingesehen.
 * `geaendert`   – die Lehrkraft hat etwas hineingeschrieben.
 * `geleert`     – die Lehrkraft hat das Feld **absichtlich** leer gemacht.
 */
export type AntwortStand = 'unberuehrt' | 'automatisch' | 'geaendert' | 'geleert';

/** Vorgeschlagen oder ausgesucht. */
export type Herkunft = 'maschinell' | 'quelltext';

/** Hat sich die Lehrkraft mit dieser Zeile befasst? */
export function vonHandBeruehrt(row: { antwortStand: AntwortStand }): boolean {
  return row.antwortStand === 'geaendert' || row.antwortStand === 'geleert';
}

/**
 * Die Wortarten, die in **dieser** Liste markiert werden.
 *
 * Das Kürzel `(n.)` / `(adj.)` ist dazu da, verwandte Formen auseinander-
 * zuhalten – `attainability` neben `attainable`. Stehen zwei Kandidaten in
 * derselben Wortfamilie, bekommen beide ihr Kürzel; ein Wort, das allein
 * dasteht, bekommt keines. Eine Liste, in der hinter jedem Substantiv `(n.)`
 * steht, liest sich wie ein Wörterbuchauszug.
 */
function familiesNeedingLabels(inputs: readonly (RecommendationInput | ScoredCandidate)[]): Set<string> {
  const seen = new Map<string, number>();
  for (const input of inputs) {
    const key =
      'family' in input ? input.family : familyKey(input.candidate.english, input.dictionary);
    if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, count]) => count > 1).map(([key]) => key));
}

function toRow(
  input: RecommendationInput | ScoredCandidate,
  markedFamilies: ReadonlySet<string> = new Set(),
  fassung = 0,
  herkunft: Herkunft = 'maschinell',
): CandidateRow {
  const { candidate, dictionary, phrase } = input;
  const local = candidate.abbreviation?.german.trim() ?? '';
  const scored = 'families' in input ? input : undefined;
  const family = scored?.family ?? familyKey(candidate.english, dictionary);

  /*
    Die Lernform entsteht **hier**, nicht erst beim Speichern.

    Der Empfehlungsschritt ist die Stelle, an der die Lehrkraft die Vokabel
    zum ersten Mal sieht – und wenn dort `depend` steht und im Paket später
    `to depend`, hat sie etwas anderes geprüft als das, was entstanden ist.
  */
  const proposal = proposeLearningForm({
    written: candidate.english,
    sourceSentence: candidate.sourceSentence,
    dictionary,
    phrase,
    markPartOfSpeech: markedFamilies.has(family),
  });

  const base: CandidateRow = {
    candidate,
    german: '',
    family,
    // Eine ungeklärte Form beansprucht alle denkbaren Familien – siehe
    // `scoreCandidates`. Neu berechnen würde genau diesen Schutz verlieren.
    families: scored?.families ?? familyKeys(candidate.english, dictionary),
    partOfSpeech: proposal.partOfSpeech || partOfSpeechOf(dictionary),
    dictionary,
    proposal,
    translation: 'idle',
    antwortStand: 'unberuehrt',
    herkunft,
    fassung,
    ...(scored?.baseFormHint ? { baseFormHint: scored.baseFormHint } : {}),
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
  /**
   * Der analysierte Text selbst – links in der Werkbank zum Nachschlagen.
   *
   * Optional, weil diese Ansicht auch ohne ihn vollständig arbeitet: Fehlt er,
   * bleibt die linke Spalte die Einstellungsspalte, und die Werkbank hat eine
   * Seite weniger. Ein Platzhalter wäre schlechter als nichts.
   */
  sourceText?: string;
  /*
    Der Themenvorschlag selbst steht im Lernkontext (`context.topic`) und
    wird oben im Assistenten gesetzt. Woher er stammt, stand bis 4B.5 als
    Hinweis unter dem Feld; er ist mit dem Hinweis weggefallen und nicht
    stillschweigend nach innen gewandert.
  */
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
  sourceText,
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
  /** Und was es zu `Wort + Partikel` weiß – der Beleg für ein Phrasal Verb. */
  const [phrases, setPhrases] = useState<ReadonlyMap<string, DictionarySuggestionSummary>>(
    new Map(),
  );
  const [dictionaryState, setDictionaryState] = useState<'prueft' | 'laeuft' | 'fertig' | 'fehlt'>(
    'prueft',
  );

  /**
   * Kandidaten, die es ohne die Analyse nicht gäbe.
   *
   * Sie entstehen, wenn jemand im Quelltext ein Wort oder eine Wortgruppe
   * markiert, die nicht vorgeschlagen war – `depend on` etwa, das die Analyse
   * nur findet, wenn es mehrfach beieinandersteht. Sie stehen getrennt von
   * `candidates`, weil sie nicht in den Empfehlungspool gehören: Vorgeschlagen
   * wird, was der Text hergibt; ausgesucht wird von Hand.
   */
  const [picked, setPicked] = useState<TextCandidate[]>([]);
  const knownCandidates = useMemo(() => [...candidates, ...picked], [candidates, picked]);

  /* --------------------------------------------------------- Die Empfehlungen */
  const [rows, setRows] = useState<CandidateRow[]>([]);
  /** Ersetzte und entfernte Empfehlungen – aufhebbar, nicht verloren. */
  const [earlier, setEarlier] = useState<CandidateRow[]>([]);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [generated, setGenerated] = useState(false);
  /** Karten, deren Originalsatz gerade in voller Länge steht. */
  const [openSentences, setOpenSentences] = useState<ReadonlySet<string>>(new Set());

  function toggleSentence(id: string): void {
    setOpenSentences((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

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
      const phrases = new Map<string, DictionarySuggestionSummary>();
      for (const candidate of candidates) {
        try {
          const summary = summarizeLookup(await source.lookup(candidate.english));
          if (summary) found.set(candidate.id, summary);

          /*
            Der zweite Nachschlag: Steht im Belegsatz hinter dem Wort ein
            Partikel, wird gefragt, ob das Wörterbuch `single out` kennt.

            Er passiert **hier**, im selben Durchlauf – nicht später je Zeile.
            Ein Wörterbuchzugriff mitten im Tippen wäre eine Verzögerung an
            der schlechtesten Stelle, und er würde für jede Zeile einmal
            passieren statt einmal überhaupt.
          */
          const particle = particleAfter(candidate.sourceSentence, candidate.english);
          if (particle) {
            const phrase = summarizeLookup(
              await source.lookup(`${candidate.english} ${particle}`),
            );
            if (phrase) phrases.set(candidate.id, phrase);
          }
        } catch {
          // Ein kaputtes Fach kostet dieses eine Wort, nicht den ganzen Lauf.
        }
      }

      if (!active) return;
      setPhrases(phrases);
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

  /**
   * Bildwechsel, die den Abbau dieser Ansicht nicht überleben.
   *
   * `requestAnimationFrame` verschiebt eine Arbeit auf das nächste Bild. Wird
   * die Ansicht vorher abgebaut, läuft die Arbeit trotzdem – nur gibt es die
   * Ansicht dann nicht mehr, für die sie gedacht war. Im Betrieb ist das
   * selten und meist harmlos; in einer Prüfung, in der gleich darauf dieselbe
   * Ansicht noch einmal aufgebaut wird, ist es ein Fokus, der in eine fremde
   * Eingabe springt – mitten im Tippen.
   *
   * Deshalb merkt sich diese Ansicht ihre offenen Bildwechsel und nimmt sie
   * beim Abbau zurück.
   */
  const bildwechselRef = useRef<Set<number>>(new Set());
  const naechstesBild = useCallback((tun: () => void): void => {
    const handle = window.requestAnimationFrame(() => {
      bildwechselRef.current.delete(handle);
      tun();
    });
    bildwechselRef.current.add(handle);
  }, []);
  useEffect(
    () => () => {
      for (const handle of bildwechselRef.current) window.cancelAnimationFrame(handle);
      bildwechselRef.current.clear();
    },
    [],
  );

  /**
   * Einen Fokus setzen – aber nur, wenn ihn seither niemand anders gesetzt hat.
   *
   * Der Fokus soll dorthin wandern, wo gerade etwas passiert ist. Das ist
   * richtig, und es geschieht eine Bildlänge später, damit das Ziel da ist.
   *
   * Eine Bildlänge ist kurz, aber nicht null. Wer unmittelbar nach dem Klick
   * zu tippen anfängt, tippt in ein Feld, aus dem der Fokus gleich
   * herausspringt – und die Zeichen ab dem zweiten landen nirgends. Gemessen
   * wurde genau das: Nach `user.type(feld, 'überfüllt')` stand „ü“ im Feld und
   * der Fokus auf der Ergebnisüberschrift.
   *
   * Also gilt dieselbe Regel wie für die Antwortfelder: Was die Lehrkraft tut,
   * hat Vorrang vor dem, was vorhin angestoßen wurde. Hat sie den Fokus
   * inzwischen selbst gesetzt, bleibt er, wo sie ihn hingesetzt hat.
   */
  const fokussiereSpaeter = useCallback(
    (ziel: () => HTMLElement | null | undefined): void => {
      const vorher = document.activeElement;
      naechstesBild(() => {
        if (document.activeElement !== vorher) return;
        ziel()?.focus();
      });
    },
    [naechstesBild],
  );

  /**
   * Die Karten und Antwortfelder dieser Ansicht – als Verweise, nicht als
   * Adressen im Dokument.
   *
   * `document.getElementById('de-text:crowded')` sucht im **ganzen** Dokument.
   * Steht dort eine zweite Fassung dieser Ansicht – in einer Prüfung ist das
   * der Normalfall –, trifft die Suche womöglich die falsche. Ein Verweis, den
   * React beim Einhängen selbst einträgt und beim Aushängen wieder entfernt,
   * kann das nicht: Er zeigt auf ein Element dieser Ansicht oder auf nichts.
   */
  const kartenRef = useRef(new Map<string, HTMLElement>());
  const felderRef = useRef(new Map<string, HTMLElement>());
  const merkeKarte = useCallback((id: string, element: HTMLElement | null): void => {
    if (element) kartenRef.current.set(id, element);
    else kartenRef.current.delete(id);
  }, []);
  const merkeFeld = useCallback((id: string, element: HTMLElement | null): void => {
    if (element) felderRef.current.set(id, element);
    else felderRef.current.delete(id);
  }, []);

  /* --------------------------------------------------------- Empfehlen */

  const inputs = useMemo<RecommendationInput[]>(
    () =>
      candidates.map((candidate) => ({
        candidate,
        dictionary: lookups.get(candidate.id),
        phrase: phrases.get(candidate.id),
      })),
    [candidates, lookups, phrases],
  );

  const update = useCallback((id: string, changes: Partial<CandidateRow>): void => {
    setRows((current) =>
      current.map((row) => (row.candidate.id === id ? { ...row, ...changes } : row)),
    );
  }, []);

  /**
   * Der Zähler, aus dem die Fassungen der Zeilen kommen.
   *
   * Er liegt in einem Ref und nicht im Modul: Ein Modulzähler wäre über alle
   * Ansichten hinweg derselbe – und damit ein gemeinsamer Zustand zwischen
   * Prüfungen, also genau die Art Verbindung, die dieser Commit auflöst.
   */
  const fassungRef = useRef(0);
  const naechsteFassung = useCallback((): number => {
    fassungRef.current += 1;
    return fassungRef.current;
  }, []);

  /**
   * Eine Änderung, die nur ankommt, wenn sie noch dieselbe Zeile meint.
   *
   * Für alles, was **später** eintrifft: Wurde die Zeile inzwischen entfernt
   * und wieder aufgenommen, ist sie eine andere Zeile mit derselben Kennung.
   * Die alte Antwort gehört dann nicht mehr hierher.
   */
  const updateFassung = useCallback(
    (id: string, fassung: number, changes: Partial<CandidateRow>): void => {
      setRows((current) =>
        current.map((row) =>
          row.candidate.id === id && row.fassung === fassung ? { ...row, ...changes } : row,
        ),
      );
    },
    [],
  );

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
    (options: {
      excludeShown: boolean;
      announce: (result: { added: number; requested: number }) => string;
      /**
       * Der Vorrat, aus dem geschöpft wird. Ohne Angabe: alles, was der Text
       * hergab.
       *
       * Der optionale Assistent gibt hier eine **Vorauswahl** hinein statt
       * eigene Zeilen zu bauen. Damit läuft ein Gemini-Vorschlag durch genau
       * dieselbe Maschine wie ein lokaler: dieselbe Bewertung, dieselben
       * Wortartkürzel, dieselben Wörterbuchantworten, dieselbe Behandlung
       * beantworteter Zeilen. Ein zweiter Weg, auf dem Empfehlungen entstehen,
       * wäre ein zweiter Weg, auf dem sie sich unterscheiden können.
       */
      pool?: readonly RecommendationInput[];
    }): void => {
      /*
        Welche Wortfamilien in dieser Liste mehrfach vorkommen, entscheidet
        über die Wortartkürzel – und das lässt sich erst sagen, wenn die
        Kandidaten beisammen sind. Gerechnet wird über **alle** Kandidaten,
        nicht nur über die ausgewählten: Sonst bekäme dasselbe Wort mal ein
        Kürzel und mal keines, je nachdem, wie viele gerade angezeigt werden.
      */
      const markedFamilies = familiesNeedingLabels(inputs);

      /*
        Von Hand aus dem Text geholte Zeilen bleiben, wo sie sind.

        „Offene Empfehlungen ersetzen“ räumt weg, was der Vorschlag hergegeben
        und niemand beantwortet hat. Eine Vokabel, die jemand im Text markiert
        hat, ist das Gegenteil davon – sie steht da, weil sie ausgesucht wurde.
        Sie wegzuräumen wäre auch nicht wiederherstellbar: Sie stammt nicht aus
        `inputs`, also könnte kein späterer Lauf sie zurückholen.
      */
      /*
        Geschützt ist, was **ausgesucht** wurde – nicht, was angefasst wurde.

        Das ist die Grenze zwischen zwei Vorgängen, die leicht zusammenfallen,
        aber nicht dasselbe sind:

        - Was **von selbst** geschieht – ein Wörterbuch- oder Modellergebnis,
          das später eintrifft –, darf eine geleerte Antwort nie wieder
          füllen. Dafür sorgt `antwortStand` in `applyDictionaryDefaults` und
          in `updateFassung`.
        - Was **ausdrücklich verlangt** wird – dieser Knopf –, tauscht offene
          maschinelle Empfehlungen aus. Eine geleerte Empfehlung ist offen.
          Sie hier stehen zu lassen hieße, den Knopf zu ignorieren, den
          jemand gerade gedrückt hat. Sie geht unter „Frühere Empfehlungen“
          und lässt sich von dort zurückholen – verloren ist sie nicht.

        Eine im Quelltext markierte Zeile bleibt dagegen auch leer stehen. Sie
        ist keine Empfehlung, und dieser Knopf heißt nicht „Auswahl ersetzen“.
        Sie verschwindet, wenn dieselbe Person sie entfernt.

        Eine nicht leere Antwort ist ohnehin sicher: `replaceOpenRecommenda-
        tions` fasst nur an, was leer ist.
      */
      const geschuetzt = (row: CandidateRow): boolean => row.herkunft === 'quelltext';
      const handpicked = rowsRef.current.filter(geschuetzt);
      const machine = rowsRef.current.filter((row) => !geschuetzt(row));

      const result = replaceOpenRecommendations<CandidateRow>({
        inputs: options.pool ?? inputs,
        rows: machine,
        earlier,
        context: { grade: context.grade, cefrLevel: context.cefrLevel },
        sort,
        count,
        excludeShown: options.excludeShown,
        ...(publicationContext === undefined ? {} : { publicationContext }),
        toRow: (scored) => toRow(scored, markedFamilies, naechsteFassung()),
      });

      /*
        Die sicheren Wörterbuchantworten stehen sofort da – kein Knopf davor.
        Was mehrdeutig ist, bleibt leer und wartet auf einen Blick.
      */
      const withDefaults = applyDictionaryDefaults(result.rows);
      const filled = countFilled(result.rows, withDefaults);

      /*
        Auch die geschützten Zeilen laufen durch `applyDictionaryDefaults`.

        Nicht, weil dort etwas passieren soll – sie sind beim Aufnehmen schon
        gefüllt worden –, sondern damit die Regel „was die Lehrkraft angefasst
        hat, bleibt“ an der Stelle greift, an der sie gebrochen würde. Stünde
        sie nur im Filter zwei Zeilen weiter oben, wäre sie an einer Stelle
        notiert, an der niemand nach ihr sucht.
      */
      setRows([...applyDictionaryDefaults(handpicked), ...withDefaults]);
      setEarlier(result.earlier);
      setGenerated(true);
      setStatus(
        filled === 0
          ? options.announce(result)
          : `${options.announce(result)} ${filled} Übersetzungen aus dem Wörterbuch eingetragen – bitte durchsehen.`,
      );

      // Ein bereits eingelöstes Modellversprechen gilt für die neuen Zeilen.
      const freshRows = result.rows.slice(result.rows.length - result.added);
      if (awaitingAutoTranslation.current && freshRows.length > 0) {
        awaitingAutoTranslation.current = false;
        void runTranslationRef.current(freshRows);
      }
      // Der Fokus wandert ans Ergebnis; sonst steht man nach dem Klick weiter
      // oben und weiß nicht, dass sich unten etwas geändert hat.
      fokussiereSpaeter(() => resultRef.current);
    },
    [count, sort, inputs, context.grade, context.cefrLevel, earlier, publicationContext],
  );

  /**
   * **Eine** Aktion für beide Anlässe.
   *
   * Bis 4B.1 standen hier zwei Knöpfe – „Empfehlungen neu berechnen“ oben und
   * „Offene Empfehlungen ersetzen“ unten – die dieselbe Funktion mit einem
   * anderen Schalter riefen. Zwei Knöpfe für eine Sache heißt: Man muss den
   * Unterschied kennen, um den richtigen zu treffen, und der Unterschied stand
   * nirgends.
   *
   * Offen ist offen: ein leeres Antwortfeld **und** ein weggeräumter Platz.
   * Beides zählt `replaceOpenRecommendations` gleich – nachgelegt wird bis zur
   * eingestellten Anzahl, beantwortete Zeilen bleiben unangetastet.
   *
   * Den einen Unterschied, der wirklich einer ist, entscheidet die Aktion
   * selbst: Wurde seit dem letzten Lauf **nichts** an den Einstellungen
   * geändert, will man offensichtlich *andere* Wörter – dann bleiben die schon
   * gezeigten außen vor. Wurde Jahrgang, Niveau, Sortierung oder Anzahl
   * geändert, ist es eine neue Frage, und ein vorhin zurückgelegtes Wort darf
   * wiederkommen, wenn es jetzt passt.
   */
  const settingsSignature = `${context.grade}|${context.cefrLevel}|${sort}|${count}`;
  const lastRun = useRef<string | null>(null);

  function recalculate(): void {
    const unchanged = lastRun.current === settingsSignature;
    lastRun.current = settingsSignature;
    refill({
      excludeShown: unchanged,
      announce: (result) =>
        generated
          ? describeReplacement(result)
          : result.added === 0
            ? 'Der Text gibt keine geeigneten Vokabeln her.'
            : `${result.added} Empfehlungen erzeugt. Bitte durchsehen und ergänzen.`,
    });
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
   * Zu einer vorhandenen Zeile springen – die Antwort auf „habe ich das schon?“.
   *
   * Nicht nur scrollen: Der Fokus geht auf das Antwortfeld. Wer im Text auf ein
   * markiertes Wort klickt, will meistens **an** dieser Zeile etwas tun, und
   * eine Zeile, die man erst noch mit der Maus suchen muss, ist nur die halbe
   * Antwort. Für die Tastaturbedienung ist es die ganze: Ohne Fokuswechsel
   * bliebe man im Text stehen und wüsste nicht, dass unten etwas passiert ist.
   */
  const goToRow = useCallback(
    (id: string): void => {
      fokussiereSpaeter(() => {
        const card = kartenRef.current.get(id);
        // `scrollIntoView` gibt es nicht überall – in jsdom nicht, und in älteren
        // Safari-Versionen ohne die Optionen. Ein fehlender Bildlauf darf den
        // Fokuswechsel nicht verhindern; der ist die eigentliche Zusage.
        card?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        return felderRef.current.get(id) ?? card;
      });
    },
    [fokussiereSpaeter],
  );

  /**
   * Ein Wort oder eine Wortgruppe aus dem Quelltext aufnehmen.
   *
   * Wer den Text liest und denkt „das brauchen sie auch“, soll es nicht in
   * einer Zwanzigerliste rechts wiederfinden müssen. Die Zeile entsteht auf
   * demselben Weg wie jede andere (`toRow`) und bekommt dieselbe
   * Wörterbuchantwort, die auch die Empfehlung bekommen hätte – sonst hinge
   * die Herkunft einer Vokabel davon ab, wie man sie aufgenommen hat.
   *
   * Vier Fälle, vier Antworten:
   *
   * - Sie steht schon in der Liste → dorthin springen, nicht verdoppeln.
   * - Sie liegt unter „Frühere Empfehlungen“ → zurückholen statt verdoppeln.
   * - Sie ist bekannt, aber nicht in der Liste → aus den Kandidaten aufnehmen.
   * - Sie ist neu (`depend on`, ein übergangenes Wort) → Kandidat bauen,
   *   nachschlagen, aufnehmen.
   *
   * Der letzte Fall ist der einzige, der wartet: Ein Wörterbuchzugriff dauert.
   * Er passiert trotzdem, weil eine Zeile ohne Vorschlag, die zwei Sekunden
   * später einen gehabt hätte, niemand nachträgt.
   */
  async function takeFromSource(from: number, to: number): Promise<void> {
    if (!sourceText) return;

    const result = pickFromSource({
      sourceText,
      tokens: sourceTokens,
      from,
      to,
      candidates: knownCandidates,
      sentences,
    });

    if (result.kind === 'rejected') {
      setStatus(result.reason);
      return;
    }

    if (result.kind === 'existing') {
      const id = result.candidateId;
      const vorhanden = rowsRef.current.find((row) => row.candidate.id === id);
      if (vorhanden) {
        setStatus(`„${vorhanden.proposal.english}“ steht schon in der Liste.`);
        goToRow(id);
        return;
      }

      if (earlier.some((row) => row.candidate.id === id)) {
        restore(id);
        goToRow(id);
        return;
      }

      const input = inputs.find((item) => item.candidate.id === id);
      if (!input) return;
      const [neu] = applyDictionaryDefaults([
        toRow(input, familiesNeedingLabels(inputs), naechsteFassung(), 'quelltext'),
      ]);
      if (!neu) return;
      addRow(neu);
      return;
    }

    const candidate = result.candidate;
    const source = dictionary ?? defaultDictionary();

    let summary: DictionarySuggestionSummary | undefined;
    let phrase: DictionarySuggestionSummary | undefined;
    try {
      summary = summarizeLookup(await source.lookup(candidate.english));
      /*
        Der zweite Nachschlag entfällt bei einer markierten Wortgruppe: Sie
        **ist** schon die Wendung. Ihn trotzdem zu machen ergäbe
        `depend on on`.
      */
      if (!candidate.normalizedEnglish.includes(' ')) {
        const particle = particleAfter(candidate.sourceSentence, candidate.english);
        if (particle) phrase = summarizeLookup(await source.lookup(`${candidate.english} ${particle}`));
      }
    } catch {
      // Ohne Wörterbuchauskunft ist die Zeile leerer, aber es gibt sie.
    }

    const input: RecommendationInput = {
      candidate,
      ...(summary ? { dictionary: summary } : {}),
      ...(phrase ? { phrase } : {}),
    };

    const [neu] = applyDictionaryDefaults([
      toRow(input, familiesNeedingLabels([...inputs, input]), naechsteFassung(), 'quelltext'),
    ]);
    if (!neu) return;

    /*
      Die Auskunft mit ablegen.

      Die Zeile trägt ihre Wörterbuchantwort selbst, aber `phrases` wird an
      anderer Stelle noch einmal befragt – etwa wenn jemand die Wortart ändert
      und die Lernform neu berechnet wird. Stünde sie dort nicht, verlöre die
      Vokabel beim Umstellen der Wortart genau die Angabe, wegen der sie
      aufgenommen wurde.
    */
    setPicked((current) => [...current, candidate]);
    if (summary) setLookups((current) => new Map(current).set(candidate.id, summary));
    if (phrase) setPhrases((current) => new Map(current).set(candidate.id, phrase));
    addRow(neu);
  }

  /**
   * Eine Zeile ans Ende hängen und dorthin springen.
   *
   * Ans **Ende**, damit nichts an Ort und Stelle springt, während jemand
   * daneben tippt. Und die Ergebnisliste aufmachen, falls sie noch zu ist: Wer
   * ein Wort anklickt, bevor er einmal „Empfehlungen generieren“ gedrückt hat,
   * hat trotzdem eine Vokabel erzeugt, und sie muss sichtbar sein. Ohne das
   * läge sie in `rows`, während der Bereich, der `rows` zeigt, noch hinter
   * `generated` verborgen ist: ein Klick ohne jede Wirkung.
   */
  function addRow(row: CandidateRow): void {
    setGenerated(true);
    setRows((current) => [...current, row]);
    setStatus(
      hasAnswer(row)
        ? `„${row.proposal.english}“ aufgenommen – mit Übersetzungsvorschlag aus dem Wörterbuch.`
        : `„${row.proposal.english}“ aufgenommen. Die Übersetzung fehlt noch.`,
    );
    goToRow(row.candidate.id);
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
    /*
      Eine neue Fassung, obwohl es dieselbe Zeile ist.

      Zwischen Entfernen und Zurückholen kann eine Antwort unterwegs gewesen
      sein, die für die alte Zeile gestartet wurde. Die Kennung des Kandidaten
      unterscheidet die beiden nicht – sie kommt aus dem Text und bleibt.
    */
    setRows((current) => [...current, { ...row, fassung: naechsteFassung() }]);
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
/**
 * Trägt ein, was das Wörterbuch **ohne Rückfrage** hergibt.
 *
 * Bis 4B.3 war das ein Knopf: „Übersetzungsvorschläge eintragen“. Der ist weg,
 * und zwar nicht aus Platzgründen. Er war ein Zwischenschritt, den man in
 * jedem Durchgang als Erstes drückte – also keine Wahl, sondern eine Frage
 * ohne zweite Antwort. Was ohne Rückfrage feststeht, kann gleich dastehen.
 *
 * „Ohne Rückfrage“ ist dabei eng gefasst und bleibt es (siehe `safeAutoAnswer`):
 * genau eine Wortart, genau eine Bedeutung, keine Registermarkierung, kein
 * Querverweis. Alles Mehrdeutige bleibt leer und steht als Chip darunter – ein
 * Klick entfernt, aber eben ein Klick, den jemand trifft.
 *
 * Die Wortart kommt aus demselben Befund mit: Sie stand vorher schon in der
 * Zeile, nur eben unbenutzt.
 *
 * Und der **Satz** kommt mit: Ob `island` hier ein Substantiv ist, steht nicht
 * im Wörterbuch, sondern im Text. Ohne diese Auskunft bliebe „Insel“ liegen,
 * nur weil `island` auch ein Verb sein kann – siehe `contextPartOfSpeech`.
 * Gefragt wird nach der Form, die **im Satz** steht (`islands`, nicht
 * `island`): Nur zu ihr gibt es eine Fundstelle.
 */
function applyDictionaryDefaults(rows: readonly CandidateRow[]): CandidateRow[] {
  return rows.map((row) => {
    if (hasAnswer(row)) return row;
    /*
      Und hier liegt der zweite Teil derselben Regel: Ein leeres Feld ist kein
      freies Feld. Wer die automatische Antwort weggenommen oder etwas
      geschrieben und wieder gelöscht hat, hat entschieden. Das Wörterbuch darf
      ergänzen, wo noch nichts war – nicht dort, wo jemand aufgeräumt hat.
    */
    if (vonHandBeruehrt(row)) return row;
    const context = contextPartOfSpeech(
      row.candidate.sourceSentence,
      candidateLiteral(row.candidate),
    );
    const answer = safeAutoAnswer(row.dictionary, row.partOfSpeech || context);
    if (!answer) return row;
    /*
      Die Wortart mitschreiben, wenn der Satz sie geklärt hat.

      Sie stand vorher oft auf „–“, weil das Wörterbuch mehrere kennt. Wer die
      Antwort aus dem Kontext bekommt, hat die Wortart damit auch – sie noch
      einmal von Hand wählen zu lassen wäre Arbeit ohne Erkenntnis. Eine
      bereits gesetzte Wortart bleibt unangetastet.
    */
    return {
      ...row,
      german: answer,
      ...(row.partOfSpeech ? {} : context ? { partOfSpeech: context } : {}),
      suggestionSource: 'dictionary',
      translation: 'accepted',
      antwortStand: 'automatisch',
    };
  });
}

/** Wie viele Zeilen dabei gefüllt wurden – für die Ansage. */
function countFilled(before: readonly CandidateRow[], after: readonly CandidateRow[]): number {
  return after.filter((row, index) => {
    const previous = before[index];
    return previous !== undefined && !hasAnswer(previous) && hasAnswer(row);
  }).length;
}

  /* ------------------------------------------------------------ Übersetzen */

  /** Übersetzt eine einzelne Zeile; Fehler bleiben auf diese Zeile beschränkt. */
  const translateRow = useCallback(
    async (row: CandidateRow, signal: AbortSignal): Promise<void> => {
      /*
        Die Fassung wird **jetzt** festgehalten, nicht bei der Rückkehr.
        Zwischen Start und Antwort kann die Zeile entfernt und wieder
        aufgenommen worden sein; dann gehört diese Antwort nicht mehr hierher.
      */
      const fassung = row.fassung;
      updateFassung(row.candidate.id, fassung, { translation: 'pending', error: undefined });
      // Ein lokal bekannter Vorschlag bleibt stehen: „die Quadratmeile“ kommt
      // aus dem Lexikon und ist dort richtig. Der Beispielsatz wird trotzdem
      // übersetzt – der hilft unabhängig davon.
      const keepLocal = row.suggestionSource === 'local' && row.translation !== 'accepted';
      try {
        const word = keepLocal
          ? (row.suggestion ?? '')
          : (await provider.translate(row.candidate.english, signal)).trim();
        const sentence = await provider.translate(row.candidate.sourceSentence, signal);
        updateFassung(row.candidate.id, fassung, {
          suggestion: word,
          suggestionSource: keepLocal ? 'local' : 'model',
          suggestedSentence: sentence.trim(),
          translation: 'suggested',
          error: undefined,
        });
      } catch (error: unknown) {
        if (signal.aborted) {
          updateFassung(row.candidate.id, fassung, { translation: 'idle' });
          return;
        }
        updateFassung(row.candidate.id, fassung, {
          translation: 'error',
          error: error instanceof Error ? error.message : 'Übersetzung fehlgeschlagen.',
        });
      }
    },
    [provider, updateFassung],
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
  /*
    Die offenen Fragen zur Lernform – nur an Zeilen, die auch ins Paket gehen.

    Eine unbeantwortete Vokabel wird gar nicht übernommen; die Frage danach,
    ob ihr `on` dazugehört, ist dann keine. Sie mitzuzählen hieße, vor dem
    Speichern auf etwas hinzuweisen, das nicht gespeichert wird.
  */
  const openQuestions = taken.filter((row) => row.proposal.needsReview);

  /*
    Der zerlegte Quelltext. `useMemo`, weil er sich nur ändert, wenn Text oder
    Kandidaten sich ändern – und nicht bei jedem Tastendruck in einem
    Antwortfeld. Bei 20.000 Zeichen wäre das sonst spürbar.
  */
  const sourceTokens = useMemo(
    () =>
      sourceText
        ? mergeMultiwordTokens(
            tokenizeSource(sourceText, knownCandidates),
            knownCandidates,
          )
        : [],
    [sourceText, knownCandidates],
  );

  const sentences = useMemo(
    () => (sourceText ? segmentSentences(sourceText) : []),
    [sourceText],
  );

  /**
   * Wie ein Wort im Text aussieht: übernommen, in der Liste, oder noch nicht da.
   *
   * „Übernommen“ heißt hier: Die Zeile hat eine deutsche Antwort und geht
   * damit ins Paket. „In der Liste“ heißt: Die Zeile steht da, aber die
   * Antwort fehlt noch. Der Unterschied ist genau der, den man beim Lesen
   * wissen will – „habe ich das schon erledigt?“, nicht „habe ich es schon
   * angeklickt?“.
   */
  const wordState = useCallback(
    (candidateId: string): WordState => {
      const row = rows.find((item) => item.candidate.id === candidateId);
      if (!row) return 'open';
      return hasAnswer(row) ? 'taken' : 'listed';
    },
    [rows],
  );

  function apply(): void {
    const selections: CandidateSelection[] = taken.map((row) => ({
      candidate: headwordOf(row),
      german: row.german,
      partOfSpeech: row.partOfSpeech,
      /*
        Die Lernform wandert mit – genau die, die in der Zeile stand.

        Sie im Entwurf neu zu berechnen wäre die zweite Gelegenheit, etwas
        anderes herauszubekommen als das, was die Lehrkraft geprüft hat.
      */
      learningForm: row.proposal.english,
      lemma: row.proposal.lemma,
      grammaticalNumber: row.proposal.grammaticalNumber,
      complementPattern: row.proposal.complementPattern,
      formNeedsReview: row.proposal.needsReview,
      ...(row.proposal.reviewReason ? { formReviewReason: row.proposal.reviewReason } : {}),
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
        : 'KI-Vorschläge für offene Empfehlungen';

  function translateOpen(): void {
    void runTranslation(rows.filter((row) => !hasAnswer(row)));
  }

  return (
    <div className="stack">
      {/*
        Die Erklärung steht hinter einem **i**, nicht über der Seite.

        Sie ist wichtig – sie sagt, dass die Empfehlung eine Schätzung ist und
        keine geprüfte Wortliste – und sie ist beim zweiten Mal gelesen. Fünf
        Zeilen Fließtext über dem Arbeitsbereich schiebt jeden Durchgang die
        eigentliche Arbeit nach unten. Hinter dem **i** ist sie da, wenn man
        sie sucht, und im Weg ist sie nie.
      */}
      <div className="section-title">
        <h2 id="empfehlungen-heading" ref={headingRef} tabIndex={-1}>
          Empfehlungen generieren
        </h2>
        <InfoDisclosure label="Wie die Empfehlungen entstehen" title="Wie die Empfehlungen entstehen">
          <p className="small" style={{ marginTop: 0 }}>
            Aus {candidates.length} gefundenen Wörtern schlägt LexiFlow die vor, die zum Jahrgang
            und Niveau passen. Das ist eine <strong>Schätzung aus messbaren Merkmalen</strong> –
            Länge, Wortbildung, Häufigkeit und Stellung im Text sowie die Auskunft des
            Offline-Wörterbuchs –, keine geprüfte Wortliste.
          </p>
          <p className="small" style={{ marginBottom: 0 }}>
            Alles wurde auf diesem Gerät berechnet. Beispielsätze stammen unverändert aus deinem
            Text; Übersetzungen erfindet LexiFlow nicht.
          </p>
        </InfoDisclosure>
      </div>

      <Announcer message={status} />

      {/*
        Die Werkbank: links die Quelle, rechts das Ergebnis.

        Bis 4B.2 lagen Einstellungen und Empfehlungen untereinander. Wer die
        Anzahl änderte, scrollte danach an den Einstellungen vorbei nach unten,
        um zu sehen, was daraus geworden ist – und wer beim Beantworten oben
        nachsehen wollte, welcher Jahrgang eingestellt ist, scrollte zurück und
        verlor die Zeile. Nebeneinander ist beides gleichzeitig da.

        Die linke Spalte trägt den Text zum Nachschlagen: Beim Beantworten von
        „shore“ ist der Satz, in dem es stand, die halbe Antwort.
      */}
      <SplitPane
        className="workbench"
        source={
        /* ---------------------------------------------- Einstellungen */
        <div className="stack stack--tight">
          {sourceText ? (
            <div>
              {/*
                Die Bedienung liegt hinter dem **i**, nicht unter dem Text.

                Als Legende unter dem Textfeld kostete sie drei Zeilen Höhe für
                eine Auskunft, die man einmal liest. Neben der Überschrift
                kostet sie keine – die Zeile gibt es ohnehin.
              */}
              <div className="section-title" style={{ marginBottom: 'var(--space-2)' }}>
                <h3 className="eyebrow" style={{ margin: 0 }}>
                  Dein Text
                </h3>
                <InfoDisclosure
                  label="Wie der Text zu bedienen ist"
                  title="Wie der Text zu bedienen ist"
                >
                  <SourceTextLegend />
                </InfoDisclosure>
              </div>
              {/*
                Der Text ist Lesestoff **und** Werkzeug.

                Nur lesen, nicht bearbeiten: Geändert wird der Text in Schritt 1,
                und eine zweite Eingabestelle für denselben Inhalt wäre eine
                Einladung, zwei verschiedene Fassungen zu erzeugen. Die Höhe ist
                trotzdem ziehbar – wie viel Text man gleichzeitig sehen will,
                weiß nur, wer ihn liest.

                Wie aus dem Text ein Werkzeug wird, ohne dass er aufhört, ein
                Text zu sein, steht in `SourceTextPane`.
              */}
              <SourceTextPane
                tokens={sourceTokens}
                stateOf={wordState}
                onTake={(from, to) => void takeFromSource(from, to)}
                busy={dictionaryState === 'prueft' || dictionaryState === 'laeuft'}
              />
            </div>
          ) : null}

          <div>
            {/*
              Die Einstellungen stehen in einer 21 rem schmalen Spalte – dort
              ist senkrechter Platz das knappe Gut. Vier volle Felder
              untereinander plus Erklärtexte schoben den Knopf unter die
              Falzkante, und wer die Anzahl änderte, musste zum Auslösen erst
              scrollen.

              `field-grid--tight` legt zwei Felder nebeneinander, wo sie
              zusammengehören (Jahrgang und Niveau), und macht die Bedienhöhe
              kleiner. Der Hinweis „Folgt dem Jahrgang, bis du widersprichst“
              ist weg: Das Feld zeigt beim Öffnen des Jahrgangs, dass es
              mitgeht, und wer widerspricht, merkt es daran, dass es stehen
              bleibt.
            */}
            <h3 style={{ fontSize: '1rem', margin: '0 0 var(--space-2)' }}>
              Wofür sind die Vokabeln?
            </h3>
            <div className="field-grid field-grid--tight">
              {/*
                Das Thema ist vorgeschlagen und trotzdem ein ganz normales Feld.

                Der Hinweis, woher der Vorschlag stammt, ist seit 4B.5 weg. In
                der 21 rem schmalen Spalte lief er über drei Zeilen und schob
                die drei Felder darunter aus dem Bild – für eine Auskunft, die
                man beim ersten Mal liest und danach nie wieder braucht. Dass
                der Vorschlag aus dem Text kommt, sagt das ausgefüllte Feld
                selbst; änderbar ist es ohnehin.
              */}
              <Field label="Thema">
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
              {/*
                „Obergrenze. Gibt der Text weniger her, werden keine erfunden.“
                stand hier bis 4B.5. Der Satz ist richtig, aber er beantwortet
                eine Frage, die niemand stellt, bevor sie eintritt – und wenn
                sie eintritt, sagt die Meldung nach dem Empfehlen dasselbe:
                „5 neue Empfehlungen – gewünscht waren 10. Mehr geeignete
                Wörter enthält der Text nicht; erfunden wird nichts.“
              */}
              <Field label="Anzahl">
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
                onClick={recalculate}
                disabled={dictionaryState === 'prueft' || dictionaryState === 'laeuft'}
              >
                {generated ? 'Offene Empfehlungen neu berechnen' : 'Empfehlungen generieren'}
              </Button>
              {dictionaryState === 'laeuft' || dictionaryState === 'prueft' ? (
                <span className="small muted" role="status">
                  Das Offline-Wörterbuch schlägt gerade nach …
                </span>
              ) : null}
            </div>
            {generated ? (
              <p className="small muted" style={{ margin: '0.6rem 0 0' }}>
                Offen ist, was kein Antwortfeld gefüllt hat – und was du entfernt hast. Beides wird neu
                besetzt; beantwortete Vokabeln bleiben unangetastet.
              </p>
            ) : null}

            {/*
              Der optionale Assistent steht **unter** der lokalen Empfehlung und
              nicht daneben: Die nachrechenbare Heuristik ist der Weg, Gemini
              die Zutat. Ohne eingetragenen Schlüssel steht hier nichts.
            */}
            <GeminiAction
              capability="recommend-from-text"
              label="Weitere Empfehlungen mit Gemini"
              ariaLabel="Weitere Empfehlungen mit Gemini erzeugen"
              disabled={dictionaryState === 'prueft' || dictionaryState === 'laeuft'}
              run={async (signal) => {
                /*
                  Gefragt wird nur nach dem, was noch nicht auf dem Tisch liegt.
                  Ein Modell, das die schon beantworteten Vokabeln noch einmal
                  empfiehlt, kostet Geld für eine Antwort, die niemand braucht.
                */
                const gezeigt = new Set([
                  ...rowsRef.current.map((row) => row.candidate.id),
                  ...earlier.map((row) => row.candidate.id),
                ]);
                const offen = inputs.filter((eintrag) => !gezeigt.has(eintrag.candidate.id));
                if (offen.length === 0) {
                  throw new GeminiError(
                    'bad-response',
                    'Es sind keine weiteren Kandidaten übrig, nach denen sich fragen ließe.',
                    false,
                  );
                }

                /*
                  `buildCandidateContext` vergibt neutrale Schlüssel (`c1`, `c2`
                  …) und schneidet bei sechzig ab. Der eingefügte Text geht
                  nicht hinaus – nur Wort, Häufigkeit und **ein** Satz je
                  Kandidat.
                */
                const kontext = buildCandidateContext(offen.map((eintrag) => eintrag.candidate));
                const empfehlungen = await geminiAssistant().suggestFromText(kontext.payload, {
                  grade: context.grade,
                  cefrLevel: context.cefrLevel,
                  maxItems: count,
                  signal,
                });

                const { ids } = resolveRecommendations(empfehlungen, kontext, count);
                if (ids.length === 0) {
                  throw new GeminiError(
                    'bad-response',
                    'Gemini hat keine der übrigen Vokabeln empfohlen. Die lokale Empfehlung steht weiterhin zur Verfügung.',
                    true,
                  );
                }

                const auswahl = new Set(ids);
                lastRun.current = settingsSignature;
                refill({
                  excludeShown: false,
                  pool: inputs.filter((eintrag) => auswahl.has(eintrag.candidate.id)),
                  announce: (result) =>
                    `${result.added} von Gemini empfohlene Vokabeln aufgenommen – ungeprüft, bitte durchsehen.`,
                });
              }}
            />
          </div>
        </div>
        }
      >
        {/* --------------------------------------------------- Ergebnisse */}
        <div className="stack">
      {/*
        Was gerade passiert – und sonst nichts.

        Hier standen bis 4B.2 zwei große Hinweisflächen: ein Kasten über das
        Offline-Wörterbuch und eine Karte über das optionale Sprachmodell.
        Zusammen gut zwanzig Zeilen Text **vor** dem ersten Ergebnis. Beim
        ersten Mal liest man sie, beim zweiten überfliegt man sie, ab dem
        dritten scrollt man an ihnen vorbei – und scrollt dabei über die
        Empfehlungen hinaus, um die es geht.

        Der Text ist nicht weg. Er steht unter den Ergebnissen in zwei
        zugeklappten Aufklappern, mit derselben Zahl und derselben Aussage.
        Hier oben bleibt, was sich gerade ändert: ein laufender Download und
        ein Fehler.
      */}
      {progress !== null || busy ? (
        <div className="row" role="status">
          {progress !== null ? (
            <>
              <label htmlFor="model-progress" className="small muted">
                Sprachmodell wird vorbereitet
              </label>
              <progress id="model-progress" max={1} value={progress}>
                {Math.round(progress * 100)} %
              </progress>
              <span className="small muted">{Math.round(progress * 100)} %</span>
            </>
          ) : (
            <span className="small muted">Vorschläge werden erzeugt …</span>
          )}
          {/*
            „Abbrechen“ steht oben, nicht bei den Ergebnissen: Der Download
            läuft schon, während unten noch nichts steht. Ein Abbruch, den man
            erst nach dem Empfehlen erreicht, kommt für ein Gigabyte zu spät.
          */}
          <Button small onClick={() => cancelRef.current?.()}>
            Abbrechen
          </Button>
        </div>
      ) : null}

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
          </div>

          {/*
            Kein Kasten mehr um eine Zeile.

            Hier stand eine `Card` – sinnvoll, solange sie zwei Knöpfe und
            einen Erklärabsatz trug. Übrig ist ein einzelner Knopf, und ein
            gerahmter Kasten um einen Knopf sieht aus, als stünde etwas darin.
          */}
          <div className="row">
            {/*
                Der Sammelknopf „Übersetzungsvorschläge eintragen“ ist weg.

                Er tat etwas, das niemand anders wollte: Was das Wörterbuch
                **ohne Rückfrage** hergibt – genau eine Wortart, genau eine
                Bedeutung, keine Markierung –, kann auch gleich dastehen. Ein
                Knopf, den man in jedem Durchgang als Erstes drückt, ist keine
                Wahl, sondern ein Zwischenschritt. Eingetragen wird jetzt beim
                Empfehlen selbst (siehe `applyDictionaryDefaults`).

                Die Modellaktion bleibt ein Knopf: Sie lädt ein Sprachmodell
                herunter, und das passiert nicht ungefragt.
              */}
              {providerState !== 'unavailable' && providerState !== 'checking' ? (
                <Button small disabled={busy || !canTranslate} onClick={translateOpen}>
                  {translateLabel}
                </Button>
              ) : null}
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
              /*
                Die Zeile zeigt die **Lernform**, nicht die Textform.

                Im Text steht `depend`, `restraints`, `single`. Als Vokabel
                taugt davon keines – und wenn die Lehrkraft hier `depend`
                prüft und im Paket später `to depend` steht, hat sie etwas
                anderes freigegeben als das, was entstanden ist. Deshalb steht
                die fertige Form schon hier, samt der Frage, wo eine offen ist.
              */
              const label = row.proposal.english || candidate.english;
              const answered = hasAnswer(row);
              const sentence = candidate.sourceSentence;
              const longSentence = sentence.length > SENTENCE_CLAMP_CHARS;
              const sentenceOpen = openSentences.has(candidate.id);
              const flags =
                Boolean(candidate.abbreviation) ||
                Boolean(candidate.isLikelyProperNoun) ||
                Boolean(row.baseFormHint);

              return (
                <li
                  key={candidate.id}
                  id={`kandidat-${candidate.id}`}
                  ref={(element) => {
                    merkeKarte(candidate.id, element);
                  }}
                  className="candidate"
                  data-answered={answered ? '' : undefined}
                >
                  {/*
                    Der Kopf trägt vier Dinge und nicht mehr: das Wort, wie oft
                    es im Text steht, den Zustand und den Weg hinaus. Bis 4B.1
                    standen hier bis zu fünf Badges nebeneinander – bei zehn
                    Karten waren das fünfzig kleine Kästchen, und keines davon
                    hat man noch gelesen.
                  */}
                  <div className="candidate__head">
                    <strong className="candidate__word">{label}</strong>
                    <Badge>{candidate.occurrences}× im Text</Badge>
                    <span className="spacer" />
                    {/*
                      Der Zustand steht **nicht** nur in der Farbe: Zeichen und
                      Wort sagen dasselbe, und beide sind auch dann da, wenn
                      jemand keine Farben unterscheidet.
                    */}
                    <span className="candidate__state" data-state={answered ? 'taken' : 'open'}>
                      <span aria-hidden="true" className="candidate__mark">
                        {answered ? '✓' : '○'}
                      </span>
                      {answered ? 'wird übernommen' : 'noch offen'}
                    </span>
                    <Button
                      small
                      variant="quiet"
                      aria-label={`${label} entfernen`}
                      onClick={() => setAside(candidate.id)}
                    >
                      Entfernen
                    </Button>
                  </div>

                  {/*
                    Was besonders ist, steht nur dann da, wenn es besonders ist.
                    Eine Abkürzung, ein möglicher Eigenname, eine unklare
                    Grundform: drei Fälle, die eine Entscheidung verlangen – und
                    in den meisten Karten schlicht nicht vorkommen.
                  */}
                  {flags ? (
                    <p className="candidate__flags">
                      {candidate.abbreviation ? (
                        <Badge tone={candidate.abbreviation.resolved ? 'success' : 'warning'}>
                          {candidate.abbreviation.resolved
                            ? 'Abkürzung erkannt'
                            : 'Abkürzung – muss geprüft werden'}
                        </Badge>
                      ) : null}
                      {candidate.isLikelyProperNoun ? <Badge tone="warning">Eigenname?</Badge> : null}
                      {row.baseFormHint ? <Badge tone="warning">{row.baseFormHint}</Badge> : null}
                    </p>
                  ) : null}

                  {/*
                    Die offene Frage zur Lernform – und ihre Antwort gleich
                    daneben.

                    Steht im Text „depend on“ und kennt das Wörterbuch
                    „depend on“ nicht, ist die Rektion eine Vermutung. Sie
                    stillschweigend zu übernehmen wäre falsch; sie zu
                    verschweigen aber auch, denn dann lernt jemand `to depend`
                    und schreibt später `depend of`.

                    Also steht die Frage da, wörtlich, mit einem Knopf, der
                    sie beantwortet. Ein Klick ist die Entscheidung der
                    Lehrkraft – und damit eine zulässige Quelle.
                  */}
                  {row.proposal.needsReview && row.proposal.reviewSuggestion ? (
                    <p className="candidate__review">
                      <Badge tone="warning">Bitte prüfen</Badge>{' '}
                      <span>{row.proposal.reviewReason}</span>{' '}
                      <Button
                        small
                        aria-label={`Lernform „${row.proposal.reviewSuggestion}“ übernehmen`}
                        onClick={() =>
                          update(candidate.id, {
                            proposal: {
                              ...row.proposal,
                              english: row.proposal.reviewSuggestion ?? row.proposal.english,
                              complementPattern: 'sb./sth.',
                              needsReview: false,
                              reviewReason: '',
                            },
                          })
                        }
                      >
                        „{row.proposal.reviewSuggestion}“ übernehmen
                      </Button>
                    </p>
                  ) : null}

                  {/*
                    Der Originalsatz ist der Grund, warum man einer Empfehlung
                    zustimmt oder nicht – er gehört sichtbar in die Karte. Zwei
                    Zeilen reichen dafür fast immer; für den Rest gibt es den
                    Knopf. Gekürzt wird nur die **Darstellung**: Im Dokument
                    steht der ganze Satz, eine Vorlesehilfe liest ihn vollständig.
                  */}
                  <p
                    className="candidate__sentence"
                    data-clamped={longSentence && !sentenceOpen ? '' : undefined}
                  >
                    <span className="visually-hidden">Originalsatz: </span>„{sentence}“
                  </p>
                  {longSentence ? (
                    <button
                      type="button"
                      className="candidate__more"
                      aria-expanded={sentenceOpen}
                      /*
                        Sichtbar steht nur „Ganzen Satz zeigen“ – das Stichwort
                        gehört in den zugänglichen Namen, nicht in die
                        Beschriftung. Bei zehn Karten stünde sonst zehnmal ein
                        Wort in Klammern, das die Karte darüber schon trägt.
                        Für eine Vorlesehilfe, die Schaltflächen aus dem
                        Zusammenhang gerissen vorliest, ist es dagegen nötig.
                      */
                      aria-label={`Ganzen Satz für ${label} ${sentenceOpen ? 'kürzen' : 'zeigen'}`}
                      onClick={() => toggleSentence(candidate.id)}
                    >
                      {sentenceOpen ? 'Satz kürzen' : 'Ganzen Satz zeigen'}
                    </button>
                  ) : null}

                  {/*
                    Die Langform einer Abkürzung ist eine Aufgabe, kein Detail –
                    sie bleibt offen stehen. „US“ ohne Auflösung ist keine
                    Vokabel, sondern zwei Buchstaben.
                  */}
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

                  <div className="candidate__fields">
                    <div className="field">
                      <label htmlFor={`de-${candidate.id}`}>Deutsche Antwort für „{label}“</label>
                      <input
                        id={`de-${candidate.id}`}
                        ref={(element) => {
                          merkeFeld(candidate.id, element);
                        }}
                        type="text"
                        value={row.german}
                        placeholder="leer lassen heißt: nicht ins Paket"
                        onChange={(event) =>
                          update(candidate.id, {
                            german: event.target.value,
                            /*
                              Leer machen ist eine Eingabe wie jede andere –
                              nur die, die man hinterher nicht mehr sieht.
                            */
                            antwortStand:
                              event.target.value.trim() === '' ? 'geleert' : 'geaendert',
                            translation:
                              row.translation === 'accepted' ? 'suggested' : row.translation,
                          })
                        }
                      />
                    </div>
                    {/*
                      Die Wortart ist ein schmales Feld, kein halbes Formular:
                      Sie steht meistens schon da, weil das Wörterbuch sie kennt
                      oder weil ein Chip sie mitgebracht hat.
                    */}
                    <div className="field field--compact">
                      <label htmlFor={`pos-${candidate.id}`}>Wortart für „{label}“</label>
                      <select
                        id={`pos-${candidate.id}`}
                        value={row.partOfSpeech}
                        onChange={(event) => {
                          /*
                            Die Wortart ändert die Lernform: Wer bei `coin`
                            „Verb“ wählt, meint `to coin`. Die Form hier
                            stehenzulassen hieße, die Auswahl entgegenzunehmen
                            und zu ignorieren.
                          */
                          const partOfSpeech = event.target.value as PartOfSpeech | '';
                          update(candidate.id, {
                            partOfSpeech,
                            proposal: proposeLearningForm({
                              written: candidate.english,
                              sourceSentence: candidate.sourceSentence,
                              dictionary: row.dictionary,
                              phrase: phrases.get(candidate.id),
                              partOfSpeech,
                              markPartOfSpeech: row.proposal.english !== candidate.english
                                ? /\((?:n|adj|adv)\.\)$/.test(row.proposal.english)
                                : false,
                            }),
                          });
                        }}
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

                  {row.dictionary ? (
                    <DictionarySuggestionList
                      label={label}
                      summary={row.dictionary}
                      current={row.german}
                      /*
                        Die Wortart kommt mit dem Klick. Überschrieben wird sie
                        nur, solange das Feld leer ist: Wer sie von Hand gesetzt
                        hat, hat sie entschieden.
                      */
                      onAccept={(german, partOfSpeech) =>
                        update(candidate.id, {
                          german,
                          translation: 'accepted',
                          ...(partOfSpeech && !row.partOfSpeech ? { partOfSpeech } : {}),
                        })
                      }
                    />
                  ) : null}

                  {/*
                    Der optionale Assistent steht **unter** dem Wörterbuch und
                    nicht an seiner Stelle. Ist kein Schlüssel eingetragen,
                    rendert er gar nichts – dann sieht diese Zeile aus wie
                    immer.
                  */}
                  <GeminiTranslations
                    label={label}
                    english={row.proposal.english || candidate.english}
                    sentence={candidate.sourceSentence}
                    partOfSpeech={row.partOfSpeech || undefined}
                    context={{ grade: context.grade, cefrLevel: context.cefrLevel }}
                    current={row.german}
                    onAccept={(german) =>
                      update(candidate.id, { german, translation: 'accepted' })
                    }
                  />

                  {row.suggestion && row.translation !== 'pending' ? (
                    <p className="candidate__suggestion">
                      {row.suggestionSource === 'local' ? (
                        <Badge>lokal</Badge>
                      ) : (
                        <Badge tone="warning">KI, ungeprüft</Badge>
                      )}{' '}
                      <button
                        type="button"
                        className="chip"
                        aria-label={`Vorschlag „${row.suggestion}“ für ${label} übernehmen`}
                        disabled={row.translation === 'accepted' && row.german === row.suggestion}
                        onClick={() =>
                          update(candidate.id, {
                            german: row.suggestion ?? '',
                            translation: 'accepted',
                            // Einen Vorschlag anzunehmen ist eine Entscheidung.
                            antwortStand: 'geaendert',
                          })
                        }
                      >
                        {row.suggestion}
                      </button>
                    </p>
                  ) : null}

                  {/*
                    Alles Weitere – benannt, nicht als „Details“.

                    Was im Text tatsächlich stand, welche Beugungen vorkamen und
                    warum die Grundform offen ist: wichtig, wenn man es braucht,
                    und Ballast in jeder anderen Karte.
                  */}
                  {/*
                    „Formen im Text und Herkunft“ ist weg (4B.4).

                    Der Aufklapper stand unter **jeder** Zeile und wurde fast
                    nie geöffnet – zwanzig Zeilen, zwanzig zugeklappte Kästen,
                    die die Liste um ein Drittel verlängerten. Was er trug, ist
                    entweder anderswo besser aufgehoben (die Beugungen im
                    Belegsatz darüber) oder betrifft nur Ausnahmefälle.

                    Zwei dieser Ausnahmen bleiben – aber nur, wenn sie
                    zutreffen, und dann offen statt zugeklappt: Eine ungeklärte
                    Grundform ist eine Entscheidung, keine Fußnote, und eine
                    Satzübersetzung aus dem Modell muss als ungeprüft
                    dastehen.
                  */}
                  {row.baseFormHint ? (
                    <p className="small muted" style={{ margin: 0 }}>
                      „{label}“ könnte auch eine gebeugte Form sein. Der Satz gibt nicht her,
                      welche Grundform gemeint ist – deshalb steht hier die Form aus dem Text.
                      Ändern lässt sie sich im letzten Schritt.
                    </p>
                  ) : null}
                  {row.suggestedSentence ? (
                    <p className="small muted" style={{ margin: 0 }}>
                      Übersetzung des Beispielsatzes (Hilfestellung, nicht geprüft):
                      „{row.suggestedSentence}“
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {/*
            Die beiden Hinweisflächen, die bis 4B.1 über den Ergebnissen
            standen. Hier unten, zugeklappt, mit derselben Aussage.
          */}
          <Disclosure
            summary="Woher die Vorschläge kommen"
            hint="Offline-Wörterbuch, Wortformerkennung – und was dein Browser zusätzlich kann."
          >
            <p className="small">
              {dictionaryState === 'fehlt'
                ? 'Das integrierte Offline-Wörterbuch steht hier gerade nicht zur Verfügung. Empfehlungen sowie Wortform- und Abkürzungserkennung funktionieren unverändert; deutsche Antworten trägst du selbst ein.'
                : 'Das integrierte Offline-Wörterbuch funktioniert auch in Safari. Übersetzungsvorschläge sowie Wortform- und Abkürzungserkennung laufen vollständig auf deinem Gerät.'}
            </p>
            <p className="small">
              {providerState === 'unavailable'
                ? 'Für zusätzliche, kontextbezogene KI-Vorschläge kannst du LexiFlow in einer aktuellen Desktop-Version von Google Chrome öffnen – dort sind sie verfügbar, sofern Chrome und das Gerät die lokalen Modelle unterstützen.'
                : 'In diesem Browser kann zusätzlich ein lokales Sprachmodell kontextbezogene Vorschläge erzeugen.'}
            </p>
            <p className="small muted">
              Erkannt wird das über die Auskunft des Browsers selbst, nicht über seinen Namen.
            </p>
          </Disclosure>

          <Disclosure
            summary="Übersetzungsvorschläge aus dem Sprachmodell"
            hint="Optional, lokal, ungeprüft – und nie automatisch übernommen."
          >
            {providerState === 'checking' ? (
              <p className="small muted" role="status">
                Verfügbarkeit wird geprüft …
              </p>
            ) : providerState === 'unavailable' ? (
              <p className="small">
                Dieser Browser bietet keine lokale Übersetzung. Das Offline-Wörterbuch und die
                Handeingabe funktionieren unverändert.
              </p>
            ) : (
              <>
                <p className="small">{provider.info.dataNotice}</p>
                <p className="small">
                  Vorschläge sind <strong>ungeprüft</strong>. Sie werden nie automatisch
                  übernommen – du entscheidest je Vokabel.
                </p>
                {providerState === 'downloadable' ? (
                  <p className="small muted">
                    Das Sprachmodell ist noch nicht auf diesem Gerät. Es wird erst nach deinem Klick
                    geladen.
                  </p>
                ) : null}
                {providerState === 'downloading' ? (
                  <p className="small muted" role="status">
                    Der Browser lädt das Sprachmodell gerade herunter. Du kannst die Vorschläge
                    jetzt anstoßen; sie beginnen, sobald das Modell bereit ist.
                  </p>
                ) : null}
                {/*
                  Hier steht **kein** zweiter Knopf. Die Aktion liegt oben bei
                  den anderen Aktionen; sie hier zu wiederholen hieße, zwei
                  Schaltflächen mit demselben Namen auf einer Seite zu haben –
                  und eine Suche nach diesem Namen fände dann zwei Elemente
                  statt einem. Für eine Vorlesehilfe ist das keine Bequemlichkeit,
                  sondern eine Mehrdeutigkeit.
                */}
                <p className="small muted">
                  Angestoßen wird das oben mit „{translateLabel}“.
                </p>
              </>
            )}
          </Disclosure>
        </>
      ) : null}

        </div>
      </SplitPane>

      {/*
        Die Aktionsleiste klebt am unteren Rand (Sprint 4B.3, Entwurfsroute B).

        Vorher standen „Zurück zum Text“ und „prüfen & speichern“ am Fuß der
        Seite. Bei zwanzig Empfehlungen sind das drei Bildschirmhöhen: Wer bei
        Vokabel sieben ist, sieht weder, wie weit er ist, noch den Weg
        weiter – und scrollt zum Speichern an allem vorbei, was er gerade
        bearbeitet hat.

        Jetzt ist beides immer da. Und mit ihm die eine Zahl, die vor dem
        Speichern auffallen muss: die offenen Fragen zur Lernform.
      */}
      {generated ? (
        <div className="actionbar">
          <Meter
            value={taken.length}
            max={rows.length}
            label={`${taken.length} von ${rows.length} Empfehlungen beantwortet`}
          />
          <span className="actionbar__status">
            <strong>
              {taken.length} von {rows.length}
            </strong>{' '}
            beantwortet
            {open > 0 ? ` · ${open} offen` : null}
          </span>

          {/*
            Die offenen Formfragen stehen **neben** dem Speichern-Knopf, nicht
            irgendwo oben in der Liste.

            Eine Frage, die man nur findet, wenn man scrollt, ist vor dem
            Speichern keine. Hier steht sie im Blick, mit einem Weg hin: Der
            Knopf springt zur ersten Zeile, die sie stellt, und setzt den Fokus
            dorthin – wer mit der Tastatur arbeitet, landet ebenfalls dort.

            Gezählt werden nur Zeilen, die auch ins Paket gehen. Eine offene
            Frage an einer Vokabel ohne Antwort ist keine: Die Vokabel wird gar
            nicht übernommen.
          */}
          {openQuestions.length > 0 ? (
            <span className="actionbar__review">
              <Badge tone="warning">Bitte prüfen</Badge>
              <Button
                small
                onClick={() => {
                  const first = openQuestions[0];
                  if (!first) return;
                  const element = kartenRef.current.get(first.candidate.id);
                  element?.scrollIntoView?.({ block: 'center' });
                  element?.querySelector<HTMLButtonElement>('.candidate__review button')?.focus();
                }}
              >
                {openQuestions.length === 1
                  ? '1 offene Frage zur Lernform'
                  : `${openQuestions.length} offene Fragen zur Lernform`}
              </Button>
            </span>
          ) : null}

          {/*
            Die beiden Knöpfe bleiben beieinander.

            Mit einem `spacer` dazwischen riss die Leiste beim Umbruch
            auseinander: „Zurück zum Text“ oben rechts, „Speichern“ unten
            links. Als eigene Gruppe wandern sie zusammen in die nächste
            Zeile – und stehen dort in derselben Reihenfolge wie vorher.
          */}
          <span className="actionbar__actions">
            <Button onClick={onBack}>Zurück zum Text</Button>
            <Button variant="primary" disabled={taken.length === 0} onClick={apply}>
              {taken.length === 1
                ? '1 Vokabel prüfen & speichern'
                : `${taken.length} Vokabeln prüfen & speichern`}
            </Button>
          </span>
        </div>
      ) : (
        <div className="row">
          <Button onClick={onBack}>Zurück zum Text</Button>
        </div>
      )}
    </div>
  );
}
