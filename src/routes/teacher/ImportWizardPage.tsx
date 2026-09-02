import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Announcer, Button, Card, Field } from '../../ui/components';
import { Stepper, type StepperItem } from '../../ui/Stepper';
import { InfoDisclosure } from '../../ui/InfoDisclosure';
import { DraftTable } from './DraftTable';
import { emptyMetaDraft, type MetaDraft } from './MetadataForm';
import { useTranslationProvider } from '../../providers/ProviderContext';
import type { ProviderState } from '../../providers/state';
import {
  startPreparation,
  type TranslationPreparation,
} from '../../translation/preparation';

/** Die Textwerkstatt übersetzt ausschließlich Englisch → Deutsch. */
const TRANSLATION_SOURCE = 'en';
const TRANSLATION_TARGET = 'de';
import {
  COLUMN_ROLES,
  COLUMN_ROLE_LABELS,
  detectColumns,
  type ColumnMapping,
  type ColumnRole,
} from '../../import/columnDetect';
import {
  buildDrafts,
  deselectDuplicates,
  draftsToEntries,
  emptyDraft,
  summarize,
  validateDrafts,
  draftFromEntry,
  type DraftRow,
} from '../../import/draft';
import { parseCsv, parsePastedText } from '../../import/csv';
import { looksStructured, parseStructuredList, structuredToDrafts } from '../../import/structuredList';
import { TextCandidateReview } from './TextCandidateReview';
import { syncManualEdits } from '../../import/suggestions';
import {
  existingHeadwords,
  summarizeTopicResult,
  type TopicDraftResult,
} from '../../import/topicDraft';
import { db } from '../../data/db';
import type { LearningContext } from '../../import/enrichment';
import { CEFR_LEVELS, GRADES, GRADE_LABELS, suggestCefrLevel } from '../../domain/cefr';
import type { CefrLevel, Grade } from '../../domain/cefr';
import { candidatesToDrafts, type CandidateSelection } from '../../import/textDraft';
import { countCandidates } from '../../import/candidateLimit';
import { suggestTopic, type TopicSuggestion } from '../../import/topicSuggestion';
import { looksLikePublication } from '../../import/recommendation';
import { DIRECTION_LABELS, LEARNING_DIRECTIONS, type LearningDirection } from '../../domain/schema';
import {
  MAX_TEXT_LENGTH,
  TextTooLongError,
  analyzeText,
  type TextAnalysis,
  type TextCandidate,
} from '../../domain/textExtraction';
import { readXlsx, XlsxReadError, type XlsxSheet } from '../../import/xlsx';
import { parsePackFile } from '../../domain/vocabpack';
import { getPackMeta, previewPackUpdate, savePack } from '../../data/packRepo';
import { PackUpdateConfirm } from '../../ui/PackUpdateConfirm';
import type { PendingPackUpdate } from '../../ui/usePackImport';
import { describeUpdateSummary, summarizeDiff } from '../../domain/packDiff';
import { newId } from '../../domain/ids';
import type { SourceType, VocabPack } from '../../domain/schema';

/**
 * Die Vorschlagswerkstatt lädt erst, wenn eine Vorschau geöffnet wird. Der
 * Schülerbereich bekommt davon nichts ab.
 */
const EnrichmentPanel = lazy(() => import('./EnrichmentPanel'));

/** Auch die Themenwerkstatt lädt erst, wenn sie gebraucht wird. */
const TopicStudio = lazy(() => import('./TopicStudio'));

/**
 * Der PDF-Weg lädt erst beim Anklicken – und mit ihm pdf.js. Wer nie eine PDF
 * öffnet, lädt die Bibliothek nie.
 */
const PdfSourcePanel = lazy(() => import('./PdfSourcePanel'));

type SourceKind = 'paste' | 'pdf' | 'text' | 'topic' | 'csv' | 'xlsx' | 'json';

/**
 * Drei Schritte statt vier.
 *
 * „Vorschau prüfen“ und „Metadaten & speichern“ waren zwei Seiten für eine
 * Handlung: nachsehen, ob es stimmt, und speichern. Wer im vierten Schritt den
 * Titel eintippt, hat die Tabelle nicht mehr vor Augen, und wer in der Vorschau
 * etwas ändert, muss noch einmal weiterklicken, um es zu sichern. Jetzt steht
 * beides zusammen.
 */
type Step = 'source' | 'candidates' | 'review';

const SOURCE_LABELS: Readonly<Record<SourceKind, string>> = {
  paste: 'Einfügen',
  pdf: 'PDF-Datei',
  text: 'Aus englischem Text',
  topic: 'Zu einem Thema',
  csv: 'CSV-Datei',
  xlsx: 'XLSX-Datei',
  json: 'LexiFlow-Paket (.vocabpack.json)',
};

const EXAMPLE = `to apologise\tsich entschuldigen
crowded\tvoll, überfüllt
neighbourhood\tNachbarschaft, Viertel`;

export function ImportWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('source');
  const [source, setSource] = useState<SourceKind>(() => {
    const requested = searchParams.get('quelle');
    if (requested === 'text') return 'text';
    if (requested === 'thema') return 'topic';
    if (requested === 'pdf') return 'pdf';
    return 'paste';
  });
  const [pasteText, setPasteText] = useState('');
  const [splitMeaningsOption, setSplitMeaningsOption] = useState(true);
  /** Zeilen, die der strukturierte Parser keiner Vokabel zuordnen konnte. */
  const [unassignedLines, setUnassignedLines] = useState<string[]>([]);

  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [sheets, setSheets] = useState<XlsxSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [meta, setMeta] = useState<MetaDraft>(emptyMetaDraft());
  const [sourceType, setSourceType] = useState<SourceType>('import');

  // Themenwerkstatt
  const [topicInfo, setTopicInfo] = useState<TopicDraftResult | null>(null);
  const [existingEnglish, setExistingEnglish] = useState<string[]>([]);

  // Textwerkstatt
  const translationProvider = useTranslationProvider();
  /**
   * Zustand der lokalen Übersetzung. Er entscheidet nur über die Beschriftung
   * der Schaltfläche – nie darüber, ob analysiert werden kann.
   */
  const [translationState, setTranslationState] = useState<ProviderState>('unavailable');
  /**
   * Die im Klickpfad gestartete Vorbereitung. Sie wird an die Prüfansicht
   * weitergereicht, damit dort **dieselbe** Zusage abgewartet wird, statt eine
   * zweite zu starten.
   */
  const [preparation, setPreparation] = useState<TranslationPreparation | null>(null);
  /** Dieselbe Zusage als Ref – zum Abbrechen, ohne von `preparation` abzuhängen. */
  const preparationRef = useRef<TranslationPreparation | null>(null);
  const [englishText, setEnglishText] = useState('');
  const [analysis, setAnalysis] = useState<TextAnalysis | null>(null);
  /** Der Themenvorschlag aus dem Text – leer, wenn nichts heraussticht. */
  const [topicHint, setTopicHint] = useState('');
  /** Woraus er entstanden ist – für eine ehrliche Beschriftung im Schritt 2. */
  const [topicSource, setTopicSource] = useState<TopicSuggestion['source']>('none');
  /**
   * Sieht der Text nach einer Publikation mit Kopfdaten aus?
   *
   * Dann ist `issue` die Heftnummer und keine Vokabel. Erkannt wird der
   * Apparat, nicht der Inhalt – in einem Text über ein Streitthema bleibt
   * `issue` ein ganz normales Wort.
   */
  const [publicationContext, setPublicationContext] = useState(false);
  /**
   * „Bereit oder ladbar“ – nur dann verspricht die Schaltfläche Übersetzungen.
   * Ein nicht gestarteter Anbieter gilt nie als vorbereitet.
   */
  const translatorReady =
    translationState === 'available' ||
    translationState === 'downloadable' ||
    translationState === 'downloading';
  /**
   * Eine Hauptaktion, eine Beschriftung.
   *
   * Vorher hieß sie je nach Browserlage anders und versprach im günstigen Fall
   * gleich Übersetzungen mit. Der Schritt heißt aber „Text analysieren“ – und
   * genau das tut sie überall gleich. Was das Sprachmodell zusätzlich kann,
   * steht dort, wo es angeboten wird: im nächsten Schritt.
   */
  const analyzeLabel = 'Text analysieren';
  /**
   * **Alle** Kandidaten der Analyse. Die Auswahl trifft der Empfehlungsschritt,
   * nicht mehr ein Zahlenfeld vor der Analyse: Wer vorher „10“ einstellt, weiß
   * ja noch nicht, was der Text hergibt.
   */
  const [candidates, setCandidates] = useState<TextCandidate[]>([]);

  const [error, setError] = useState<string>('');
  const [announcement, setAnnouncement] = useState<string>('');
  /** Beim Import einer Paketdatei bleibt deren ID erhalten, damit spätere
   *  Fassungen dasselbe Paket aktualisieren statt zu duplizieren. */
  const [importedPackId, setImportedPackId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPackUpdate | null>(null);
  const [saved, setSaved] = useState<{ packId: string; text: string } | null>(null);

  const summary = summarize(drafts);

  /**
   * Jede Änderung an den Entwürfen läuft hier durch: Ändert die Lehrkraft ein
   * Feld selbst, verliert der zugehörige Vorschlag seinen Anspruch darauf.
   */
  function updateDrafts(next: DraftRow[]): void {
    // Nach jeder Änderung neu prüfen: Eine übernommene Übersetzung muss den
    // Fehler „Deutsche Übersetzung fehlt" sofort auflösen.
    setDrafts((current) => validateDrafts(syncManualEdits(current, next)));
  }

  /** Die ehrliche Mengenanzeige der Themenwerkstatt – gemessen am Gewünschten. */
  const topicSummary = useMemo(
    () => (topicInfo ? summarizeTopicResult(topicInfo) : null),
    [topicInfo],
  );

  /** Genau der Ausschnitt der Metadaten, den die Vorschläge brauchen. */
  const learningContext: LearningContext = useMemo(
    () => ({ grade: meta.grade, cefrLevel: meta.cefrLevel, topic: meta.topic }),
    [meta.grade, meta.cefrLevel, meta.topic],
  );

  function setGrade(grade: Grade): void {
    setMeta((current) => ({
      ...current,
      grade,
      cefrLevel: current.cefrLevelOverridden ? current.cefrLevel : suggestCefrLevel(grade),
    }));
  }

  function setCefrLevel(level: CefrLevel): void {
    setMeta((current) => ({
      ...current,
      cefrLevel: level,
      cefrLevelOverridden: level !== suggestCefrLevel(current.grade),
    }));
  }

  function applyRows(rows: string[][], kind: SourceType): void {
    if (rows.length === 0) {
      setError('Es konnten keine Zeilen gelesen werden.');
      return;
    }
    const detected = detectColumns(rows);
    setRawRows(rows);
    setMapping(detected);
    setSourceType(kind);
    const built = buildDrafts(rows, detected, { splitMultipleMeanings: splitMeaningsOption });
    setDrafts(built);
    setError('');
    setStep('review');
    setAnnouncement(`${built.length} Zeilen erkannt. Vorschau geöffnet.`);
  }

  /** Beendet eine noch laufende Vorbereitung – etwa beim Verlassen der Prüfung. */
  function stopPreparation(): void {
    preparationRef.current?.cancel();
    preparationRef.current = null;
    setPreparation(null);
  }

  /**
   * Reine, lokale Analyse – kein Netzwerkzugriff, keine Speicherung des Textes.
   *
   * Reihenfolge im Klickpfad, und zwar in genau dieser:
   *
   * 1. Text lokal analysieren. Das ist eine reine Funktion und dauert
   *    Millisekunden.
   * 2. Bei einem Fehler oder ohne brauchbare Kandidaten: melden und **nichts**
   *    laden. Ein Modelldownload für einen zu langen Text wäre reine
   *    Verschwendung – möglicherweise über Gigabyte.
   * 3. Erst danach die Vorbereitung starten. Zwischen Analyse und `prepare()`
   *    steht kein `await`, deshalb gilt die User-Activation des Klicks noch,
   *    die der Browser für den Modelldownload verlangt.
   */
  function handleAnalyze(): void {
    const text = englishText.trim();
    if (text.length === 0) {
      setError('Bitte zuerst einen englischen Text einfügen.');
      return;
    }
    // Eine frühere Vorbereitung gilt nicht mehr; sie darf nicht weiterladen.
    stopPreparation();

    try {
      const result = analyzeText(englishText);
      if (result.candidates.length === 0) {
        setAnalysis(null);
        setCandidates([]);
        setError(
          'In diesem Text wurden keine geeigneten Vokabelkandidaten gefunden. Er ist möglicherweise zu kurz oder besteht überwiegend aus Funktionswörtern und Eigennamen.',
        );
        return;
      }
      setAnalysis(result);
      setCandidates(result.candidates);
      // Ein Themenvorschlag – oder keiner. Erfunden wird nichts.
      /*
        Der Themenvorschlag wird **eingetragen**, nicht nur angedeutet.

        Ein Vorschlag, der als Platzhalter im leeren Feld steht, ist keiner:
        Wer ihn übernehmen will, muss ihn abtippen. Eingetragen ist er in einem
        Klick wieder weg – und was die Lehrkraft schon selbst geschrieben hat,
        wird nie überschrieben.
      */
      const topic = suggestTopic(englishText);
      setTopicHint(topic.topic);
      setTopicSource(topic.source);
      if (topic.topic && !meta.topic.trim()) {
        setMeta((current) => (current.topic.trim() ? current : { ...current, topic: topic.topic }));
      }
      setPublicationContext(looksLikePublication(englishText));
      setError('');

      // Jetzt – und nur jetzt – lohnt sich das Modell. Immer noch synchron:
      // zwischen `analyzeText` und hier steht kein `await`.
      if (translatorReady) {
        const started = startPreparation(
          translationProvider,
          TRANSLATION_SOURCE,
          TRANSLATION_TARGET,
        );
        preparationRef.current = started;
        setPreparation(started);
      }

      setStep('candidates');
      const counts = countCandidates(result.candidates);
      setAnnouncement(
        `${counts.usable} geeignete Wörter aus ${result.sentenceCount} Sätzen gefunden.` +
          (counts.unresolved > 0
            ? ` ${counts.unresolved === 1 ? '1 Abkürzung muss' : `${counts.unresolved} Abkürzungen müssen`} geprüft werden.`
            : ''),
      );
    } catch (caught: unknown) {
      setAnalysis(null);
      setError(
        caught instanceof TextTooLongError
          ? caught.message
          : 'Der Text konnte nicht analysiert werden.',
      );
    }
  }

  /**
   * Vorhandene englische Stichwörter – mehr geht nie an das Sprachmodell.
   * Geladen wird erst, wenn die Themenwerkstatt tatsächlich gewählt ist.
   */
  /**
   * Nur *fragen*, nichts starten: `getAvailability` lädt kein Modell. Ohne
   * diese Trennung würde die Oberfläche Bereitschaft behaupten, die niemand
   * hergestellt hat.
   */
  useEffect(() => {
    if (source !== 'text') return;
    let active = true;
    void translationProvider
      .getAvailability(TRANSLATION_SOURCE, TRANSLATION_TARGET)
      .then((state) => {
        if (active) setTranslationState(state);
      })
      .catch(() => {
        if (active) setTranslationState('unavailable');
      });
    return () => {
      active = false;
    };
  }, [source, translationProvider]);

  useEffect(() => {
    if (source !== 'topic') return;
    let active = true;
    void db.packEntries
      .toArray()
      .then((rows) => {
        if (active) setExistingEnglish(existingHeadwords(rows.map((row) => ({ english: row.english }))));
      })
      .catch(() => {
        if (active) setExistingEnglish([]);
      });
    return () => {
      active = false;
    };
  }, [source]);

  /** Übernimmt die Zeilen der Themenwerkstatt in die bekannte Vorschau. */
  function handleTopicDrafts(rows: DraftRow[], info: TopicDraftResult | null): void {
    setDrafts(validateDrafts(rows));
    setTopicInfo(info);
    setSourceType('topic-ai');
    setRawRows([]);
    setMapping(null);
    setError('');
    setStep('review');
    setAnnouncement(
      info
        ? `${summarizeTopicResult(info).headline} Vorschau geöffnet.`
        : 'Leere Liste angelegt. Vorschau geöffnet.',
    );
  }

  function handleCandidates(selections: CandidateSelection[]): void {
    // Die Prüfung ist vorbei; ein noch laufender Modelldownload wird hier
    // gebraucht von niemandem mehr.
    stopPreparation();
    const built = candidatesToDrafts(selections);
    setDrafts(built);
    setSourceType('import');
    setRawRows([]);
    setMapping(null);
    setError('');
    setStep('review');
    setAnnouncement(`${built.length} Vokabeln in die Vorschau übernommen.`);
  }

  /**
   * Eingefügten Text übernehmen – strukturiert, wenn er es hergibt.
   *
   * Zwei Wege, und die Entscheidung trifft der Text selbst: Trägt er
   * Aufzählungszeichen, `translation:`-Zeilen oder Wortartkürzel, liest ihn
   * `structuredList.ts` samt Wortart, Beispielsatz und verbundenen Formen.
   * Sonst bleibt es beim schlichten Zeilenparser, der seit Sprint 1 genügt.
   */
  function acceptPastedText(text: string): void {
    if (looksStructured(text)) {
      const parsed = parseStructuredList(text);
      const built = structuredToDrafts(parsed);
      if (built.length === 0) {
        setError('Es konnten keine Vokabeln gelesen werden.');
        return;
      }
      setRawRows([]);
      setMapping(null);
      setSourceType('import');
      setDrafts(built);
      setError('');
      setStep('review');
      const offen = parsed.unassigned.length;
      setAnnouncement(
        `${built.length} Vokabeln erkannt. Vorschau geöffnet.` +
          (offen > 0 ? ` ${offen} Zeile${offen === 1 ? '' : 'n'} konnte nicht zugeordnet werden.` : ''),
      );
      setUnassignedLines(parsed.unassigned);
      return;
    }

    setUnassignedLines([]);
    applyRows(parsePastedText(text), 'import');
  }

  function handlePaste(): void {
    acceptPastedText(pasteText);
  }

  async function handleFile(file: File): Promise<void> {
    setError('');
    try {
      if (source === 'csv') {
        applyRows(parseCsv(await file.text()), 'import');
      } else if (source === 'xlsx') {
        const parsed = readXlsx(await file.arrayBuffer());
        setSheets(parsed);
        setSheetIndex(0);
        applyRows(parsed[0]?.rows ?? [], 'import');
      } else {
        const result = parsePackFile(await file.text());
        if (!result.ok) {
          setError(result.errors.join(' · '));
          return;
        }
        setRawRows([]);
        setMapping(null);
        setSourceType('import');
        setImportedPackId(result.pack.meta.id);
        setDrafts(validateDrafts(result.pack.entries.map(draftFromEntry)));
        setMeta({
          title: result.pack.meta.title,
          topic: result.pack.meta.topic,
          grade: result.pack.meta.grade,
          cefrLevel: result.pack.meta.cefrLevel,
          cefrLevelOverridden: result.pack.meta.cefrLevelOverridden,
          direction: result.pack.meta.direction,
          description: result.pack.meta.description ?? '',
        });
        setStep('review');
        setAnnouncement(`${result.pack.entries.length} Vokabeln aus der Paketdatei gelesen.`);
      }
    } catch (caught: unknown) {
      setError(
        caught instanceof XlsxReadError
          ? caught.message
          : 'Die Datei konnte nicht gelesen werden. Bitte Format prüfen.',
      );
    }
  }

  function changeSheet(index: number): void {
    setSheetIndex(index);
    const rows = sheets[index]?.rows ?? [];
    const detected = detectColumns(rows);
    setRawRows(rows);
    setMapping(detected);
    setDrafts(buildDrafts(rows, detected, { splitMultipleMeanings: splitMeaningsOption }));
  }

  function changeRole(columnIndex: number, role: ColumnRole): void {
    if (!mapping) return;
    const roles = mapping.roles.map((current, index) => {
      if (index === columnIndex) return role;
      // Englisch und Deutsch dürfen nur einmal vergeben sein.
      if ((role === 'english' || role === 'german') && current === role) return 'ignore';
      return current;
    });
    const next: ColumnMapping = { ...mapping, roles };
    setMapping(next);
    setDrafts(buildDrafts(rawRows, next, { splitMultipleMeanings: splitMeaningsOption }));
  }

  function toggleHeader(hasHeader: boolean): void {
    if (!mapping) return;
    const next: ColumnMapping = { ...mapping, hasHeader };
    setMapping(next);
    setDrafts(buildDrafts(rawRows, next, { splitMultipleMeanings: splitMeaningsOption }));
  }

  function buildPack(): VocabPack | undefined {
    if (!meta.title.trim()) {
      setError('Bitte einen Titel angeben.');
      return undefined;
    }
    const entries = draftsToEntries(drafts, sourceType);
    if (entries.length === 0) {
      setError('Es ist keine gültige Vokabel ausgewählt.');
      return undefined;
    }
    const now = new Date().toISOString();
    return {
      meta: {
        id: importedPackId ?? newId(),
        title: meta.title.trim(),
        topic: meta.topic.trim(),
        grade: meta.grade,
        cefrLevel: meta.cefrLevel,
        cefrLevelOverridden: meta.cefrLevel !== suggestCefrLevel(meta.grade),
        direction: meta.direction,
        ...(meta.description.trim() ? { description: meta.description.trim() } : {}),
        createdAt: now,
        updatedAt: now,
      },
      entries,
    };
  }

  async function persist(pack: VocabPack): Promise<void> {
    const result = await savePack(pack);
    setPending(null);
    if (result.isNew) {
      navigate(`/material/${result.packId}`);
      return;
    }
    setSaved({
      packId: result.packId,
      text: `„${pack.meta.title}“ wurde aktualisiert. ${describeUpdateSummary(result.summary)}`,
    });
  }

  async function handleSave(): Promise<void> {
    const pack = buildPack();
    if (!pack) return;
    setError('');

    const existing = await getPackMeta(pack.meta.id);
    if (!existing) {
      await persist(pack);
      return;
    }
    const diff = await previewPackUpdate(pack);
    setPending({ pack, existingTitle: existing.title, summary: summarizeDiff(diff) });
  }

  /**
   * Die Schritte, wie sie für diese Quelle tatsächlich gelten.
   *
   * Nur der Weg über einen englischen Text hat einen Empfehlungsschritt: Aus
   * einer CSV-Datei gibt es nichts zu empfehlen, dort stehen die Vokabeln
   * schon. Der Assistent zeigt deshalb zwei oder drei Schritte – aber nie
   * einen, den es für diese Quelle gar nicht gibt.
   */
  const steps: StepperItem<Step>[] =
    source === 'text'
      ? [
          { id: 'source', label: 'Text analysieren', reachable: true },
          {
            id: 'candidates',
            label: 'Empfehlungen generieren',
            reachable: analysis !== null,
          },
          { id: 'review', label: 'Prüfen & Speichern', reachable: drafts.length > 0 },
        ]
      : [
          { id: 'source', label: 'Quelle wählen', reachable: true },
          { id: 'review', label: 'Prüfen & Speichern', reachable: drafts.length > 0 },
        ];

  return (
    <div className="stack">
      <div>
        <h1>Vokabelpaket erstellen</h1>
        <Stepper
          steps={steps}
          current={step}
          onNavigate={(next) => {
            // Zurück in den ersten Schritt heißt nicht: von vorn anfangen. Der
            // Text steht noch da, die Empfehlungen bleiben, wie sie waren.
            setError('');
            setStep(next);
          }}
        />
      </div>

      <Announcer message={announcement} />
      {error ? <Alert tone="error">{error}</Alert> : null}

      {saved ? (
        <Alert tone="success">
          {saved.text}{' '}
          <Link to={`/material/${saved.packId}`}>Paket öffnen</Link>
        </Alert>
      ) : null}

      {pending ? (
        <PackUpdateConfirm
          pending={pending}
          busy={false}
          onConfirm={() => void persist(pending.pack)}
          onCancel={() => {
            setPending(null);
            setError('');
            setSaved(null);
          }}
        />
      ) : null}

      {step === 'source' ? (
        <Card>
          {/*
            Der Datenschutzhinweis sitzt als kleines **i** direkt hinter der
            Überschrift.

            Als beschrifteter Knopf („Was passiert mit meinem Text?“) stand er
            als eigene Zeile im Weg und sah aus wie eine Aktion. Ein i neben der
            Überschrift ist die richtige Größe: Es sagt „hier steht noch etwas“
            und beansprucht nichts.
          */}
          <div className="card-head">
            <h2>Woher kommen die Vokabeln?</h2>
            <InfoDisclosure
              label="Hinweis zur Textverarbeitung"
              title="Verarbeitung auf diesem Gerät"
            >
              <p>
                Der Text wird auf diesem Gerät verarbeitet und nicht übertragen. Der vollständige
                eingefügte Text wird nicht als eigener Datensatz gespeichert.
              </p>
              <p>
                Die Originalsätze der übernommenen Vokabeln werden dagegen als Beispielsätze Teil
                des Pakets und beim Export mitgegeben; du kannst sie in „Prüfen &amp; Speichern“
                bearbeiten oder entfernen.
              </p>
              <p>
                Verwende nur Texte, die du verwenden darfst, und füge keine personenbezogenen Daten
                von Schülerinnen und Schülern ein.
              </p>
            </InfoDisclosure>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: '0 0 1rem' }}>
            <legend className="visually-hidden">Importquelle</legend>
            <div className="row">
              {(Object.keys(SOURCE_LABELS) as SourceKind[]).map((kind) => (
                <label key={kind} className="checkbox">
                  <input
                    type="radio"
                    name="source"
                    value={kind}
                    checked={source === kind}
                    onChange={() => setSource(kind)}
                  />
                  {SOURCE_LABELS[kind]}
                </label>
              ))}
            </div>
          </fieldset>

          {source === 'topic' ? (
            <Suspense
              fallback={
                <p className="muted small" role="status">
                  Themenwerkstatt wird geladen …
                </p>
              }
            >
              <TopicStudio
                topic={meta.topic}
                grade={meta.grade}
                cefrLevel={meta.cefrLevel}
                existingEnglish={existingEnglish}
                onTopicChange={(topic) => setMeta((current) => ({ ...current, topic }))}
                onGradeChange={setGrade}
                onCefrChange={setCefrLevel}
                onDrafts={handleTopicDrafts}
                onPasteInstead={() => setSource('paste')}
                hasExistingDrafts={drafts.length > 0}
              />
            </Suspense>
          ) : source === 'text' ? (
            <div className="stack">
              <Field
                label="Englischer Text"
                hint={`Bis zu ${MAX_TEXT_LENGTH.toLocaleString('de-DE')} Zeichen. LexiFlow zerlegt den Text lokal in Sätze und Wörter. Gespeichert wird nur, was du übernimmst: die Vokabeln und ihre Originalsätze.`}
              >
                {(props) => (
                  <textarea
                    {...props}
                    value={englishText}
                    spellCheck={false}
                    onChange={(event) => setEnglishText(event.target.value)}
                  />
                )}
              </Field>
              <p className="small muted" style={{ margin: 0 }}>
                {englishText.length.toLocaleString('de-DE')} von{' '}
                {MAX_TEXT_LENGTH.toLocaleString('de-DE')} Zeichen
              </p>
              {/*
                Die drei Schalter „Funktionswörter“, „Eigennamen“ und
                „Gewünschte Anzahl“ sind weg.

                Sie standen vor der Analyse und verlangten damit Entscheidungen
                über einen Text, den noch niemand gesehen hatte. Wie viele
                Vokabeln herauskommen sollen, gehört in den Empfehlungsschritt –
                dort ist die Zahl änderbar, ohne den Text neu zu analysieren.
                Funktionswörter und Eigennamen bleiben schlicht draußen: Sie
                waren als Notausgang gedacht und sind in keinem Durchgang
                gebraucht worden.
              */}

              <div className="row">
                <Button
                  variant="primary"
                  onClick={handleAnalyze}
                  disabled={englishText.trim().length === 0}
                >
                  {analysis ? 'Text erneut analysieren' : analyzeLabel}
                </Button>
                {/* Der Weg zurück zu den Empfehlungen steht oben im Stepper –
                    eine zweite Schaltfläche dafür wäre eine zweite Wahrheit. */}
              </div>
              {/*
                Die Schaltfläche heißt nur noch „Text analysieren“ – dann darf
                sie im Hintergrund auch nichts Ungesagtes tun. Ein
                Modelldownload kann Hunderte von Megabyte kosten; wer ihn
                auslöst, soll das vorher gelesen haben.
              */}
              {translatorReady ? (
                <p className="small muted" style={{ margin: 0 }}>
                  Dieser Browser bietet lokale Übersetzung an. Beim Analysieren wird das
                  Sprachmodell im Hintergrund vorbereitet – der Download kann groß sein und lässt
                  sich im nächsten Schritt abbrechen. Die Analyse selbst läuft ohne Modell.
                </p>
              ) : null}
            </div>
          ) : source === 'pdf' ? (
            <Suspense fallback={<p className="muted">PDF-Import wird geladen …</p>}>
              <PdfSourcePanel onAccept={acceptPastedText} />
            </Suspense>
          ) : source === 'paste' ? (
            <div className="stack">
              <Field
                label="Vokabelliste einfügen"
                hint="Eine Vokabel pro Zeile – Tabulator oder „ – “ trennt Englisch und Deutsch. Eine schon gegliederte Liste mit Aufzählungspunkten, „translation:“ und Wortartkürzeln wird als solche erkannt."
              >
                {(props) => (
                  <textarea
                    {...props}
                    value={pasteText}
                    spellCheck={false}
                    onChange={(event) => setPasteText(event.target.value)}
                  />
                )}
              </Field>
              <div className="row">
                <Button variant="primary" onClick={handlePaste} disabled={pasteText.trim().length === 0}>
                  Weiter zur Vorschau
                </Button>
                <Button variant="quiet" onClick={() => setPasteText(EXAMPLE)}>
                  Beispiel einfügen
                </Button>
              </div>
            </div>
          ) : (
            <div className="stack">
              <p className="muted small">
                {source === 'csv'
                  ? 'Trennzeichen (Semikolon, Komma, Tabulator) wird automatisch erkannt.'
                  : source === 'xlsx'
                    ? 'Gelesen wird der reine Zelltext des gewählten Tabellenblatts.'
                    : 'Ein zuvor exportiertes LexiFlow-Paket. Ältere Formatversionen werden migriert.'}
              </p>
              <input
                ref={fileInput}
                type="file"
                aria-label={`${SOURCE_LABELS[source]} auswählen`}
                accept={source === 'csv' ? '.csv,text/csv' : source === 'xlsx' ? '.xlsx' : '.json,application/json'}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void handleFile(file);
                }}
              />
            </div>
          )}

          <label className="checkbox" style={{ marginTop: '1rem' }}>
            <input
              type="checkbox"
              checked={splitMeaningsOption}
              onChange={(event) => setSplitMeaningsOption(event.target.checked)}
            />
            <span>
              Mehrere Antworten am Semikolon trennen – jede gilt dann als richtige Antwort. Ein
              Komma bleibt Teil der Antwort: „einen Begriff, eine Redewendung prägen“ ist
              <strong> eine</strong> Bedeutung.
            </span>
          </label>
        </Card>
      ) : null}

      {/*
        Der Empfehlungsschritt bleibt **eingehängt**, sobald es ihn gibt – auch
        wenn gerade ein anderer Schritt zu sehen ist.

        Sonst wäre der Stepper ein Versprechen, das er nicht hält: Wer im dritten
        Schritt merkt, dass eine Vokabel fehlt, klickt auf den zweiten und fände
        ihn leer vor, weil React die Komponente beim Ausblenden abgebaut und
        beim Zurückkommen neu aufgebaut hätte. Getippte Antworten, ersetzte
        Empfehlungen, frühere Empfehlungen – alles weg. `hidden` nimmt den
        Bereich aus dem Bild **und** aus dem Baum der Hilfstechnik, lässt den
        Zustand aber stehen.
      */}
      {analysis ? (
        <div hidden={step !== 'candidates'}>
          <TextCandidateReview
            candidates={candidates}
            context={learningContext}
            suggestedTopic={topicHint}
            topicSource={topicSource}
            publicationContext={publicationContext}
            preparation={preparation}
            onContextChange={(next) => {
              // Derselbe Meta-Zustand wie im übrigen Assistenten – der letzte
              // Schritt findet die Angaben schon vor.
              if (next.grade !== meta.grade) setGrade(next.grade);
              if (next.cefrLevel !== meta.cefrLevel) setCefrLevel(next.cefrLevel);
              if (next.topic !== meta.topic)
                setMeta((current) => ({ ...current, topic: next.topic }));
            }}
            onApply={handleCandidates}
            onBack={() => {
              stopPreparation();
              setStep('source');
            }}
          />
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="stack">
          {/*
            Zeilen, die der strukturierte Parser keiner Vokabel zuordnen
            konnte. Sie stillschweigend wegzuwerfen wäre bequem und falsch –
            vielleicht steht dort etwas Wichtiges. Also stehen sie hier, zum
            Nachtragen von Hand.
          */}
          {unassignedLines.length > 0 ? (
            <Alert tone="info">
              <p>
                {unassignedLines.length}{' '}
                {unassignedLines.length === 1 ? 'Zeile wurde' : 'Zeilen wurden'} keiner Vokabel
                zugeordnet und deshalb nicht übernommen:
              </p>
              <ul className="small">
                {unassignedLines.slice(0, 8).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {unassignedLines.length > 8 ? (
                <p className="small muted">… und {unassignedLines.length - 8} weitere.</p>
              ) : null}
            </Alert>
          ) : null}

          {sheets.length > 1 ? (
            <Card quiet>
              <Field label="Tabellenblatt">
                {(props) => (
                  <select
                    {...props}
                    value={sheetIndex}
                    onChange={(event) => changeSheet(Number(event.target.value))}
                  >
                    {sheets.map((sheet, index) => (
                      <option key={sheet.name} value={index}>
                        {sheet.name} ({sheet.rows.length} Zeilen)
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </Card>
          ) : null}

          {mapping ? (
            <Card quiet>
              <h2 style={{ fontSize: '1.05rem' }}>Spaltenzuordnung</h2>
              <p className="muted small">
                Automatisch erkannt. Bei Bedarf anpassen – die Vorschau aktualisiert sich sofort.
              </p>
              <div className="field-grid">
                {mapping.roles.map((role, index) => (
                  <Field key={index} label={mapping.headers[index] ?? `Spalte ${index + 1}`}>
                    {(props) => (
                      <select
                        {...props}
                        value={role}
                        onChange={(event) => changeRole(index, event.target.value as ColumnRole)}
                      >
                        {COLUMN_ROLES.map((option) => (
                          <option key={option} value={option}>
                            {COLUMN_ROLE_LABELS[option]}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                ))}
              </div>
              <label className="checkbox" style={{ marginTop: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={mapping.hasHeader}
                  onChange={(event) => toggleHeader(event.target.checked)}
                />
                <span>Erste Zeile ist eine Kopfzeile</span>
              </label>
            </Card>
          ) : null}

          {sourceType === 'topic-ai' ? (
            <Alert tone="warning">
              Diese Vorschläge sind ungeprüft. Kontrolliere besonders Übersetzungen,
              Schwierigkeit und Beispielsätze.
              {topicSummary ? (
                <>
                  {' '}
                  <strong>{topicSummary.headline}</strong>
                  {topicSummary.detail ? ` ${topicSummary.detail}` : ''}
                  {topicSummary.sentences ? ` ${topicSummary.sentences}` : ''}
                </>
              ) : null}
              <div className="row" style={{ marginTop: '0.5rem' }}>
                <Button small onClick={() => setStep('source')}>
                  Neue Auswahl erzeugen
                </Button>
              </div>
            </Alert>
          ) : null}

          {/*
            Das Paket, in einer Karte.

            Vorher stand hier nur die Tabelle und der Titel kam eine Seite
            später. Wer speichern will, muss aber beides zugleich sehen: was
            drin ist und wie es heißt.
          */}
          <Card>
            <h2 style={{ fontSize: '1.05rem' }}>Das Paket</h2>
            <div className="field-grid">
              <Field
                label="Titel"
                hint="Erscheint in der Paketliste, z. B. „Unit 3 – Sports“."
                {...(error && !meta.title.trim() ? { error: 'Bitte einen Titel angeben.' } : {})}
              >
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    value={meta.title}
                    required
                    onChange={(event) => setMeta({ ...meta, title: event.target.value })}
                  />
                )}
              </Field>
              <Field
                label="Lernrichtung"
                hint="Lückensätze und produktives Abfragen brauchen „Deutsch → Englisch“ oder beide Richtungen."
              >
                {(props) => (
                  <select
                    {...props}
                    value={meta.direction}
                    onChange={(event) =>
                      setMeta({ ...meta, direction: event.target.value as LearningDirection })
                    }
                  >
                    {LEARNING_DIRECTIONS.map((direction) => (
                      <option key={direction} value={direction}>
                        {DIRECTION_LABELS[direction]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>

            <Field
              label="Beschreibung (optional)"
              hint="Kurzer Hinweis für Lernende, z. B. worauf zu achten ist. Kann leer bleiben."
            >
              {(props) => (
                <textarea
                  {...props}
                  rows={2}
                  value={meta.description}
                  onChange={(event) => setMeta({ ...meta, description: event.target.value })}
                />
              )}
            </Field>

            {/*
              Der Lernkontext, kompakt.

              Auf dem Textweg ist er im Empfehlungsschritt gesetzt worden und
              hat dort die Auswahl bestimmt – ihn hier noch einmal als drei
              Auswahlfelder anzubieten hieße, dieselbe Entscheidung zweimal
              treffen zu lassen und die Empfehlungen stillschweigend veralten
              zu lassen. Auf den anderen Wegen gibt es diesen Schritt nicht;
              dort steht der Kontext hier und ist änderbar.
            */}
            {source === 'text' ? (
              <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
                Lernkontext: <strong>{GRADE_LABELS[meta.grade]}</strong> ·{' '}
                <strong>{meta.cefrLevel}</strong>
                {meta.topic ? (
                  <>
                    {' '}
                    · Thema <strong>{meta.topic}</strong>
                  </>
                ) : null}{' '}
                — im Schritt „Empfehlungen generieren“ änderbar.
              </p>
            ) : (
              <div className="field-grid">
                <Field label="Jahrgang">
                  {(props) => (
                    <select
                      {...props}
                      value={meta.grade}
                      onChange={(event) => setGrade(event.target.value as Grade)}
                    >
                      {GRADES.map((grade) => (
                        <option key={grade} value={grade}>
                          {GRADE_LABELS[grade]}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field
                  label="GeR-Niveau"
                  hint={
                    meta.cefrLevelOverridden
                      ? `Abweichend vom Vorschlag (${suggestCefrLevel(meta.grade)}) gesetzt.`
                      : `Automatisch vorgeschlagen: ${suggestCefrLevel(meta.grade)}.`
                  }
                >
                  {(props) => (
                    <select
                      {...props}
                      value={meta.cefrLevel}
                      onChange={(event) => setCefrLevel(event.target.value as CefrLevel)}
                    >
                      {CEFR_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Thema" hint="Wird als Themen-Tag vorgeschlagen, z. B. „City life“.">
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      value={meta.topic}
                      onChange={(event) => setMeta({ ...meta, topic: event.target.value })}
                    />
                  )}
                </Field>
              </div>
            )}

            <p className="small muted" style={{ margin: '0.6rem 0 0' }}>
              Die GeR-Zuordnung folgt der üblichen Orientierung für Gymnasien in NRW und ist ein
              Vorschlag – schulinterne Lehrpläne können abweichen.
            </p>
          </Card>

          {/*
            Die Vorschlagswerkstatt schlägt Schwierigkeit und Themen-Tags vor –
            genau die beiden Angaben, die der Textweg nicht mehr zeigt. Sie dort
            trotzdem anzubieten wäre widersprüchlich: Man könnte etwas
            übernehmen, das man anschließend nirgends sieht.
          */}
          {source === 'text' ? null : (
            <Suspense
              fallback={
                <p className="muted small" role="status">
                  Vorschlagswerkstatt wird geladen …
                </p>
              }
            >
              <EnrichmentPanel drafts={drafts} context={learningContext} onChange={updateDrafts} />
            </Suspense>
          )}

          <div className="row">
            <p className="small" style={{ margin: 0 }}>
              {summary.total} Zeilen · <strong>{summary.selected}</strong> werden übernommen ·{' '}
              {summary.errors} Fehler · {summary.duplicates} Duplikate
            </p>
            <span className="spacer" />
            {summary.duplicates > 0 ? (
              <Button small onClick={() => updateDrafts(deselectDuplicates(drafts))}>
                Duplikate abwählen
              </Button>
            ) : null}
            <Button small onClick={() => updateDrafts(validateDrafts([...drafts, emptyDraft()]))}>
              Zeile hinzufügen
            </Button>
          </div>

          {/*
            Der Textweg zeigt weniger. Alle anderen Wege zeigen alles – dort
            können die Angaben aus einem vorhandenen Paket stammen, und die
            dürfen nicht stillschweigend unsichtbar werden.
          */}
          <DraftTable
            drafts={drafts}
            onChange={updateDrafts}
            sentenceContext={learningContext}
            variant={source === 'text' ? 'text' : 'full'}
          />

          <div className="row">
            <Button onClick={() => setStep(source === 'text' ? 'candidates' : 'source')}>
              Zurück
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleSave()}
              disabled={summary.selected === 0}
            >
              Paket speichern ({summary.selected} Vokabeln)
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
