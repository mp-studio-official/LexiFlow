import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Alert, Badge, Button, Card } from '../../ui/components';
import { PackUpdateConfirm } from '../../ui/PackUpdateConfirm';
import { usePackImport } from '../../ui/usePackImport';
import { deletePack, getPack, listPacks } from '../../data/packRepo';
import { db } from '../../data/db';
import { serializePack, suggestFilename } from '../../domain/vocabpack';
import { downloadText } from '../../ui/download';
import { GRADE_LABELS } from '../../domain/cefr';
import { DIRECTION_LABELS } from '../../domain/schema';

export function TeacherHomePage() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const importer = usePackImport({
    onSaved: (packId, _summary, isNew) => {
      if (isNew) navigate(`/material/${packId}`);
    },
  });

  const packs = useLiveQuery(() => listPacks(), [], undefined);
  const counts = useLiveQuery(
    async () => {
      const rows = await db.packEntries.toArray();
      const map = new Map<string, number>();
      for (const row of rows) map.set(row.packId, (map.get(row.packId) ?? 0) + 1);
      return map;
    },
    [],
    new Map<string, number>(),
  );

  async function handleExport(packId: string): Promise<void> {
    const pack = await getPack(packId);
    if (!pack) return;
    downloadText(suggestFilename(pack.meta), serializePack(pack));
  }

  async function handleDelete(packId: string): Promise<void> {
    await deletePack(packId);
    setPendingDelete(null);
    importer.setMessage({ tone: 'success', text: 'Paket gelöscht.' });
  }

  return (
    <div className="stack">
      <div>
        <h1>Material erstellen</h1>
        <p className="muted" style={{ maxWidth: '46rem' }}>
          Dieser Bereich ist ohne Anmeldung nutzbar. Er dient ausschließlich dem Erstellen
          und Weitergeben von Vokabelpaketen – Lernstände von Schülerinnen und Schülern
          sind hier grundsätzlich nicht einsehbar.
        </p>
      </div>

      {importer.message ? (
        <Alert tone={importer.message.tone}>{importer.message.text}</Alert>
      ) : null}

      {importer.pending ? (
        <PackUpdateConfirm
          pending={importer.pending}
          busy={importer.busy}
          onConfirm={() => void importer.confirm()}
          onCancel={importer.cancel}
        />
      ) : null}

      <div className="row">
        <Button variant="primary" onClick={() => navigate('/material/import')}>
          Neues Paket aus Liste erstellen
        </Button>
        <Button onClick={() => navigate('/material/import?quelle=text')}>
          Aus englischem Text erstellen
        </Button>
        <Button onClick={() => fileInput.current?.click()}>
          Paketdatei öffnen (.vocabpack.json)
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          aria-label="LexiFlow-Paketdatei auswählen"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importer.importFile(file);
          }}
        />
      </div>

      <section aria-labelledby="paketliste">
        <h2 id="paketliste">Vorhandene Pakete</h2>
        {packs === undefined ? (
          <p className="muted">Pakete werden geladen …</p>
        ) : packs.length === 0 ? (
          <Card quiet>
            <p style={{ margin: 0 }}>
              Noch keine Pakete. Beginne mit <Link to="/material/import">einer Vokabelliste</Link>.
            </p>
          </Card>
        ) : (
          <div className="card-grid">
            {packs.map((meta) => (
              <Card key={meta.id}>
                <h3 style={{ marginBottom: '0.25rem' }}>{meta.title}</h3>
                <p className="muted small" style={{ marginBottom: '0.6rem' }}>
                  {GRADE_LABELS[meta.grade]} · {meta.cefrLevel} · {counts?.get(meta.id) ?? 0}{' '}
                  Vokabeln
                  <br />
                  {DIRECTION_LABELS[meta.direction]}
                  {meta.topic ? ` · ${meta.topic}` : ''}
                </p>
                {pendingDelete === meta.id ? (
                  <div className="row">
                    <span className="small">Paket und zugehörige Lernstände löschen?</span>
                    <Button small variant="danger" onClick={() => void handleDelete(meta.id)}>
                      Löschen
                    </Button>
                    <Button small variant="quiet" onClick={() => setPendingDelete(null)}>
                      Abbrechen
                    </Button>
                  </div>
                ) : (
                  <div className="row">
                    <Link className="btn btn--small" to={`/material/${meta.id}`}>
                      Bearbeiten
                    </Link>
                    <Button small onClick={() => void handleExport(meta.id)}>
                      Exportieren
                    </Button>
                    <Button small variant="danger" onClick={() => setPendingDelete(meta.id)}>
                      Löschen
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <Card quiet>
        <p className="small" style={{ margin: 0 }}>
          <Badge>Hinweis</Badge> Exportierte Dateien enthalten nur die Vokabeln und die
          Metadaten des Pakets. Lernstände werden nie exportiert.
        </p>
      </Card>
    </div>
  );
}
