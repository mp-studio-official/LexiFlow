import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { readXlsx, XlsxReadError, type XlsxSheet } from '../../import/xlsx';
import { parsePackFile } from '../../domain/vocabpack';
import { getPackMeta, previewPackUpdate, savePack } from '../../data/packRepo';
import { PackUpdateConfirm } from '../../ui/PackUpdateConfirm';
import type { PendingPackUpdate } from '../../ui/usePackImport';
import { describeUpdateSummary, summarizeDiff } from '../../domain/packDiff';
import { newId } from '../../domain/ids';
import { suggestCefrLevel } from '../../domain/cefr';
import type { SourceType, VocabPack } from '../../domain/schema';

type SourceKind = 'paste' | 'csv' | 'xlsx' | 'json';
type Step = 1 | 2 | 3;

const SOURCE_LABELS: Readonly<Record<SourceKind, string>> = {
  paste: 'Einfügen',
  csv: 'CSV-Datei',
  xlsx: 'XLSX-Datei',
  json: 'LexiFlow-Paket (.vocabpack.json)',
};

const EXAMPLE = `to apologise\tsich entschuldigen
crowded\tvoll, überfüllt
neighbourhood\tNachbarschaft, Viertel`;

export function ImportWizardPage() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [source, setSource] = useState<SourceKind>('paste');
  const [pasteText, setPasteText] = useState('');
  const [splitMeaningsOption, setSplitMeaningsOption] = useState(true);

  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [sheets, setSheets] = useState<XlsxSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [meta, setMeta] = useState<MetaDraft>(emptyMetaDraft());
  const [sourceType, setSourceType] = useState<SourceType>('import');

  const [error, setError] = useState<string>('');
  const [announcement, setAnnouncement] = useState<string>('');
  /** Beim Import einer Paketdatei bleibt deren ID erhalten, damit spätere
   *  Fassungen dasselbe Paket aktualisieren statt zu duplizieren. */
  const [importedPackId, setImportedPackId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPackUpdate | null>(null);
  const [saved, setSaved] = useState<{ packId: string; text: string } | null>(null);

  const summary = summarize(drafts);

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
    setStep(2);
    setAnnouncement(`${built.length} Zeilen erkannt. Vorschau geöffnet.`);
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
        setStep(2);
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
          <li aria-current={step === 1 ? 'step' : undefined}>Quelle wählen</li>
          <li aria-current={step === 2 ? 'step' : undefined}>Vorschau prüfen</li>
          <li aria-current={step === 3 ? 'step' : undefined}>Metadaten &amp; speichern</li>
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

      {step === 1 ? (
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

          {source === 'paste' ? (
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

      {step === 2 ? (
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

          <div className="row">
            <p className="small" style={{ margin: 0 }}>
              {summary.total} Zeilen · <strong>{summary.selected}</strong> werden übernommen ·{' '}
              {summary.errors} Fehler · {summary.duplicates} Duplikate
            </p>
            <span className="spacer" />
            {summary.duplicates > 0 ? (
              <Button small onClick={() => setDrafts(deselectDuplicates(drafts))}>
                Duplikate abwählen
              </Button>
            ) : null}
            <Button small onClick={() => setDrafts(validateDrafts([...drafts, emptyDraft()]))}>
              Zeile hinzufügen
            </Button>
          </div>

          <DraftTable drafts={drafts} onChange={setDrafts} />

          <div className="row">
            <Button onClick={() => setStep(1)}>Zurück</Button>
            <Button variant="primary" onClick={() => setStep(3)} disabled={summary.selected === 0}>
              Weiter zu den Metadaten
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="stack">
          <Card>
            <h2>Metadaten</h2>
            <MetadataForm value={meta} onChange={setMeta} />
          </Card>
          <div className="row">
            <Button onClick={() => setStep(2)}>Zurück zur Vorschau</Button>
            <Button variant="primary" onClick={() => void handleSave()}>
              Paket speichern ({summary.selected} Vokabeln)
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
