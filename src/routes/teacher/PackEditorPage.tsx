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
import { countClozeReady } from '../../domain/vocabpack';
import { describeUpdateSummary } from '../../domain/packDiff';
import { downloadPackFile, downloadStudentFile } from '../../ui/packDownloads';
import { PORTABLE_BUILD } from '../../portable/studentRuntime';
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

  /** Das Paket so, wie es gerade im Formular steht – für beide Exporte. */
  function currentPack(
    form: NonNullable<typeof meta>,
    base: NonNullable<typeof original>,
  ) {
    const metaForm = form;
    const original = base;
    return {
      meta: {
        ...original,
        title: metaForm.title.trim(),
        topic: metaForm.topic.trim(),
        grade: metaForm.grade,
        cefrLevel: metaForm.cefrLevel,
        cefrLevelOverridden: metaForm.cefrLevel !== suggestCefrLevel(metaForm.grade),
        direction: metaForm.direction,
        ...(metaForm.description.trim() ? { description: metaForm.description.trim() } : {}),
      },
      entries,
    };
  }

  /*
    Beide Downloads liegen seit 4B.3 in `ui/packDownloads` – dieselbe Logik
    bedient auch die Paketblöcke auf der Materialseite. Hier bleibt nur, was
    diese Seite ausmacht: das Paket **so, wie es gerade im Formular steht**,
    und die Rückmeldung an der Stelle, an der schon „Gespeichert“ erscheint.
  */
  function handleExport(): void {
    if (!meta || !original) return;
    const outcome = downloadPackFile(currentPack(meta, original));
    setError('');
    setStatus(outcome.message);
  }

  async function handleStudentExport(): Promise<void> {
    if (!meta || !original) return;
    setError('');

    const outcome = await downloadStudentFile(currentPack(meta, original));
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    /*
      Der Größenhinweis steht **hinter** der Erfolgsmeldung und nicht statt
      ihrer: Die Datei ist erstellt. Er sagt nur, dass sie ungewöhnlich groß
      geworden ist – ein Satz zum Weitergeben, kein Fehler.
    */
    setStatus(outcome.warning ? `${outcome.message} ${outcome.warning}` : outcome.message);
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

      {/*
        Die Weitergabe ist der Grund, warum jemand ein Paket baut – und stand
        bis 4B.1 als reiner Erklärtext hier oben, während die drei Aktionen
        dazu ganz unten in einer Reihe mit „Änderungen speichern“ und „Paket
        löschen“ lagen. Wer gerade gespeichert hatte, suchte den nächsten
        Schritt also an der Stelle, an der auch der gefährlichste Knopf steht.

        Jetzt stehen die drei Wege hier, unter dem Satz, der sie erklärt. Die
        Beschriftungen sagen, was passiert (**herunterladen**, nicht
        „exportieren“) und welche Datei dabei herauskommt.
      */}
      <Card quiet>
        <h2 style={{ fontSize: '1rem', marginTop: 0 }}>Weitergeben an die Lerngruppe</h2>
        <p className="small muted">
          Die Lerndatei enthält dieses Vokabelpaket und den vollständigen Lerntrainer. Sie
          funktioniert ohne Konto und ohne Internet. Lernstände und andere Pakete wandern nicht
          mit. Personenbezogene Daten stehen nur darin, wenn du selbst welche in Titel, Thema,
          Beschreibung oder Notizen geschrieben hast.
          {PORTABLE_BUILD ? null : (
            <>
              {' '}
              Erzeugen lässt sie sich in der portablen Datei „LexiFlow-Lehrkraft.html“.
            </>
          )}
        </p>
        <div className="row">
          <Button variant="primary" onClick={() => void handleStudentExport()}>
            Als Lerndatei herunterladen (.html)
          </Button>
          <Button onClick={handleExport}>
            Als LexiFlow-Paket herunterladen (.vocabpack.json)
          </Button>
          <Link className="btn" to={`/lernen/${packId}`}>
            Im Lernbereich ansehen
          </Link>
          {/*
            Der Ausdruck gehört hierher, zu den anderen Wegen aus dem Paket
            heraus: Eine Vokabelliste auf Papier ist Weitergabe wie jede
            andere – nur ohne Gerät auf der anderen Seite.
          */}
          <Link className="btn" to={`/material/${packId}/liste`}>
            Vokabelliste drucken / als PDF speichern
          </Link>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Das LexiFlow-Paket ist die Datei zum Weiterbearbeiten – in LexiFlow wieder zu öffnen,
          aber ohne Trainer darin.
        </p>
      </Card>

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
        <DraftTable
          drafts={drafts}
          onChange={setDrafts}
          sentenceContext={{
            grade: meta.grade,
            cefrLevel: meta.cefrLevel,
            topic: meta.topic,
          }}
        />
      </section>

      <div className="row">
        <Button variant="primary" onClick={() => void handleSave()}>
          Änderungen speichern
        </Button>
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
