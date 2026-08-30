import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Announcer, Button, Card } from '../../ui/components';
import { DraftTable } from './DraftTable';
import { MetadataForm, type MetaDraft } from './MetadataForm';
import { deletePack, getPack, savePack } from '../../data/packRepo';
import {
  draftFromEntry,
  draftsToEntries,
  emptyDraft,
  summarize,
  validateDrafts,
  type DraftRow,
} from '../../import/draft';
import { countClozeReady, serializePack, suggestFilename } from '../../domain/vocabpack';
import { describeUpdateSummary } from '../../domain/packDiff';
import { downloadText } from '../../ui/download';
import { suggestCefrLevel } from '../../domain/cefr';
import type { PackMeta } from '../../domain/schema';

export function PackEditorPage() {
  const { packId = '' } = useParams();
  const navigate = useNavigate();

  const [meta, setMeta] = useState<MetaDraft | null>(null);
  const [original, setOriginal] = useState<PackMeta | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const pack = await getPack(packId);
      if (!active) return;
      if (!pack) {
        setLoading(false);
        return;
      }
      setOriginal(pack.meta);
      setMeta({
        title: pack.meta.title,
        topic: pack.meta.topic,
        grade: pack.meta.grade,
        cefrLevel: pack.meta.cefrLevel,
        cefrLevelOverridden: pack.meta.cefrLevelOverridden,
        direction: pack.meta.direction,
        description: pack.meta.description ?? '',
      });
      setDrafts(validateDrafts(pack.entries.map(draftFromEntry)));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [packId]);

  if (loading) return <p className="muted">Paket wird geladen …</p>;
  if (!meta || !original) {
    return (
      <div className="stack">
        <h1>Paket nicht gefunden</h1>
        <p className="muted">Es existiert kein Paket mit dieser Kennung auf diesem Gerät.</p>
        <Link className="btn" to="/material">
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  const summary = summarize(drafts);
  const entries = draftsToEntries(drafts, 'manual');
  const clozeReady = countClozeReady(entries);

  async function handleSave(): Promise<void> {
    if (!meta || !original) return;
    if (!meta.title.trim()) {
      setError('Bitte einen Titel angeben.');
      return;
    }
    if (entries.length === 0) {
      setError('Das Paket muss mindestens eine gültige Vokabel enthalten.');
      return;
    }
    const result = await savePack({
      meta: {
        ...original,
        title: meta.title.trim(),
        topic: meta.topic.trim(),
        grade: meta.grade,
        cefrLevel: meta.cefrLevel,
        cefrLevelOverridden: meta.cefrLevel !== suggestCefrLevel(meta.grade),
        direction: meta.direction,
        ...(meta.description.trim() ? { description: meta.description.trim() } : {}),
        updatedAt: new Date().toISOString(),
      },
      entries,
    });
    setError('');
    setStatus(
      `Gespeichert – ${entries.length} Vokabeln. ${describeUpdateSummary(result.summary)}`,
    );
  }

  function handleExport(): void {
    if (!meta || !original) return;
    const pack = {
      meta: {
        ...original,
        title: meta.title.trim(),
        topic: meta.topic.trim(),
        grade: meta.grade,
        cefrLevel: meta.cefrLevel,
        cefrLevelOverridden: meta.cefrLevel !== suggestCefrLevel(meta.grade),
        direction: meta.direction,
        ...(meta.description.trim() ? { description: meta.description.trim() } : {}),
      },
      entries,
    };
    downloadText(suggestFilename(pack.meta), serializePack(pack));
    setStatus('Export erstellt.');
  }

  async function handleDelete(): Promise<void> {
    await deletePack(packId);
    navigate('/material');
  }

  return (
    <div className="stack">
      <div>
        <h1>{original.title}</h1>
        <p className="muted small">
          Zuletzt geändert: {new Date(original.updatedAt).toLocaleString('de-DE')} ·{' '}
          {summary.total} Zeilen · {clozeReady} mit Lückensatz-tauglichem Beispielsatz
        </p>
      </div>

      <Announcer message={status} />
      {status ? <Alert tone="success">{status}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card>
        <h2>Metadaten</h2>
        <MetadataForm value={meta} onChange={setMeta} />
      </Card>

      <section className="stack" aria-labelledby="vokabeln">
        <div className="row">
          <h2 id="vokabeln" style={{ margin: 0 }}>
            Vokabeln
          </h2>
          <span className="spacer" />
          <Button small onClick={() => setDrafts(validateDrafts([...drafts, emptyDraft()]))}>
            Zeile hinzufügen
          </Button>
        </div>
        <DraftTable drafts={drafts} onChange={setDrafts} />
      </section>

      <div className="row">
        <Button variant="primary" onClick={() => void handleSave()}>
          Änderungen speichern
        </Button>
        <Button onClick={handleExport}>Als .vocabpack.json exportieren</Button>
        <Link className="btn" to={`/lernen/${packId}`}>
          Im Schülerbereich ansehen
        </Link>
        <span className="spacer" />
        {confirmDelete ? (
          <>
            <span className="small">Paket wirklich löschen?</span>
            <Button variant="danger" onClick={() => void handleDelete()}>
              Endgültig löschen
            </Button>
            <Button variant="quiet" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </Button>
          </>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Paket löschen
          </Button>
        )}
      </div>
    </div>
  );
}
