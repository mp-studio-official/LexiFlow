import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Announcer, Button, Card, Field } from '../../ui/components';
import { DraftTable } from './DraftTable';
import { MetadataForm, emptyMetaDraft, type MetaDraft } from './MetadataForm';
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
import { TextCandidateReview } from './TextCandidateReview';
import { syncManualEdits } from '../../import/suggestions';
import { existingHeadwords, type TopicDraftResult } from '../../import/topicDraft';
import { db } from '../../data/db';
import type { LearningContext } from '../../import/enrichment';
import { CEFR_LEVELS, GRADES, GRADE_LABELS, suggestCefrLevel } from '../../domain/cefr';
import type { CefrLevel, Grade } from '../../domain/cefr';
import { candidatesToDrafts, type CandidateSelection } from '../../import/textDraft';
import {
  MAX_TEXT_LENGTH,
  TextTooLongError,
  analyzeText,
  type TextAnalysis,
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

type SourceKind = 'paste' | 'text' | 'topic' | 'csv' | 'xlsx' | 'json';
type Step = 'source' | 'candidates' | 'preview' | 'meta';

const SOURCE_LABELS: Readonly<Record<SourceKind, string>> = {
  paste: 'Einfügen',
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
    return 'paste';
  });
  const [pasteText, setPasteText] = useState('');
  const [splitMeaningsOption, setSplitMeaningsOption] = useState(true);

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
  const [englishText, setEnglishText] = useState('');
  const [includeStopwords, setIncludeStopwords] = useState(false);
  const [includeProperNouns, setIncludeProperNouns] = useState(false);
  const [analysis, setAnalysis] = useState<TextAnalysis | null>(null);

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
    setStep('preview');
    setAnnouncement(`${built.length} Zeilen erkannt. Vorschau geöffnet.`);
  }

  /** Reine, lokale Analyse – kein Netzwerkzugriff, keine Speicherung des Textes. */
  function handleAnalyze(): void {
    const text = englishText.trim();
    if (text.length === 0) {
      setError('Bitte zuerst einen englischen Text einfügen.');
      return;
    }
    try {
      const result = analyzeText(englishText, { includeStopwords, includeProperNouns });
      if (result.candidates.length === 0) {
        setAnalysis(null);
        setError(
          'In diesem Text wurden keine geeigneten Vokabelkandidaten gefunden. Blende gegebenenfalls Funktionswörter oder Eigennamen ein.',
        );
        return;
      }
      setAnalysis(result);
      setError('');
      setStep('candidates');
      setAnnouncement(
        `${result.candidates.length} Kandidaten aus ${result.sentenceCount} Sätzen gefunden.`,
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
    setStep('preview');
    setAnnouncement(
      info
        ? `${info.accepted} Vorschläge erzeugt. Vorschau geöffnet.`
        : 'Leere Liste angelegt. Vorschau geöffnet.',
    );
  }

  function handleCandidates(selections: CandidateSelection[]): void {
    const built = candidatesToDrafts(selections);
    setDrafts(built);
    setSourceType('import');
    setRawRows([]);
    setMapping(null);
    setError('');
    setStep('preview');
    setAnnouncement(`${built.length} Vokabeln in die Vorschau übernommen.`);
  }

  function handlePaste(): void {
    const rows = parsePastedText(pasteText);
    applyRows(rows, 'import');
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
        setStep('preview');
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

  return (
    <div className="stack">
      <div>
        <h1>Vokabelpaket erstellen</h1>
        <ol className="steps">
          <li aria-current={step === 'source' ? 'step' : undefined}>Quelle wählen</li>
          {source === 'text' ? (
            <li aria-current={step === 'candidates' ? 'step' : undefined}>Kandidaten prüfen</li>
          ) : null}
          <li aria-current={step === 'preview' ? 'step' : undefined}>Vorschau prüfen</li>
          <li aria-current={step === 'meta' ? 'step' : undefined}>Metadaten &amp; speichern</li>
        </ol>
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
          <h2>Woher kommen die Vokabeln?</h2>
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
              <Alert tone="info">
                Der Text wird auf diesem Gerät verarbeitet und nicht übertragen. Der
                vollständige eingefügte Text wird nicht als eigener Datensatz gespeichert.
                Die Originalsätze der übernommenen Vokabeln werden dagegen als Beispielsätze
                Teil des Pakets und beim Export mitgegeben; du kannst sie in der Vorschau
                bearbeiten oder entfernen. Verwende nur Texte, die du verwenden darfst, und
                füge keine personenbezogenen Daten von Schülerinnen und Schülern ein.
              </Alert>
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
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="visually-hidden">Analyseoptionen</legend>
                <div className="row">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={includeStopwords}
                      onChange={(event) => setIncludeStopwords(event.target.checked)}
                    />
                    <span>Funktionswörter einblenden (the, and, is …)</span>
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={includeProperNouns}
                      onChange={(event) => setIncludeProperNouns(event.target.checked)}
                    />
                    <span>Wahrscheinliche Eigennamen einblenden</span>
                  </label>
                </div>
              </fieldset>
              <div className="row">
                <Button
                  variant="primary"
                  onClick={handleAnalyze}
                  disabled={englishText.trim().length === 0}
                >
                  Text lokal analysieren
                </Button>
                {analysis ? (
                  <Button variant="quiet" onClick={() => setStep('candidates')}>
                    Zurück zu den Kandidaten
                  </Button>
                ) : null}
              </div>
            </div>
          ) : source === 'paste' ? (
            <div className="stack">
              <Field
                label="Vokabelliste einfügen"
                hint="Eine Vokabel pro Zeile. Trennung durch Tabulator, Semikolon, „ – “ oder Komma."
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
              Mehrfachbedeutungen trennen (Komma, Semikolon, „ / “) – jede Bedeutung gilt dann
              als richtige Antwort.
            </span>
          </label>
        </Card>
      ) : null}

      {step === 'candidates' && analysis ? (
        <TextCandidateReview
          candidates={analysis.candidates}
          onApply={handleCandidates}
          onBack={() => setStep('source')}
        />
      ) : null}

      {step === 'preview' ? (
        <div className="stack">
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
              {topicInfo ? (
                <>
                  {' '}
                  <strong>
                    {topicInfo.accepted} von {topicInfo.received === 0 ? topicInfo.accepted : topicInfo.received}{' '}
                    Vorschlägen erzeugt
                  </strong>
                  {topicInfo.droppedSentences > 0
                    ? ` · ${topicInfo.droppedSentences} Beispielsätze wurden entfernt, weil sie das Stichwort nicht enthielten.`
                    : '.'}
                </>
              ) : null}
              <div className="row" style={{ marginTop: '0.5rem' }}>
                <Button small onClick={() => setStep('source')}>
                  Neue Auswahl erzeugen
                </Button>
              </div>
            </Alert>
          ) : null}

          <Card quiet>
            <h2 style={{ fontSize: '1.05rem' }}>Lernkontext</h2>
            <p className="muted small">
              Jahrgang, Sprachniveau und Thema helfen dabei, Schwierigkeit und Themen-Tags passend
              vorzuschlagen. Deine Eingaben stehen im nächsten Schritt schon bereit.
            </p>
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
              <Field label="GeR-Niveau">
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
          </Card>

          <Suspense
            fallback={
              <p className="muted small" role="status">
                Vorschlagswerkstatt wird geladen …
              </p>
            }
          >
            <EnrichmentPanel drafts={drafts} context={learningContext} onChange={updateDrafts} />
          </Suspense>

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

          <DraftTable drafts={drafts} onChange={updateDrafts} />

          <div className="row">
            <Button onClick={() => setStep('source')}>Zurück</Button>
            <Button variant="primary" onClick={() => setStep('meta')} disabled={summary.selected === 0}>
              Weiter zu den Metadaten
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'meta' ? (
        <div className="stack">
          <Card>
            <h2>Metadaten</h2>
            <MetadataForm value={meta} onChange={setMeta} />
          </Card>
          <div className="row">
            <Button onClick={() => setStep('preview')}>Zurück zur Vorschau</Button>
            <Button variant="primary" onClick={() => void handleSave()}>
              Paket speichern ({summary.selected} Vokabeln)
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
