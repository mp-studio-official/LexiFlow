import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Alert, Button, Card, Meter } from '../../ui/components';
import { PackUpdateConfirm } from '../../ui/PackUpdateConfirm';
import { usePackImport } from '../../ui/usePackImport';
import { getEntries, listPacks } from '../../data/packRepo';
import { getProgressIndex } from '../../data/progressRepo';
import { countMastered } from '../../domain/leitner';
import { countReady } from '../../domain/exercises';
import { directionKey } from '../../domain/ids';
import { GRADE_LABELS } from '../../domain/cefr';
import {
  activeDirections,
  LEITNER_BOX_MAX,
  type LearningDirection,
  type TaskDirection,
} from '../../domain/schema';

interface DirectionStand {
  direction: TaskDirection;
  mastered: number;
}

interface PackOverview {
  id: string;
  title: string;
  topic: string;
  gradeLabel: string;
  cefrLevel: string;
  direction: LearningDirection;
  total: number;
  mastered: number;
  due: number;
  perDirection: DirectionStand[];
}

const DIRECTION_SHORT: Record<TaskDirection, string> = {
  'en-de': 'verstehen (EN→DE)',
  'de-en': 'anwenden (DE→EN)',
};

export function StudentHomePage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const importer = usePackImport();

  const overview = useLiveQuery<PackOverview[]>(async () => {
    const packs = await listPacks();
    const now = Date.now();

    return Promise.all(
      packs.map(async (meta) => {
        const entries = await getEntries(meta.id);
        const progress = await getProgressIndex(meta.id);
        const directions = activeDirections(meta.direction);
        const entryIds = entries.map((entry) => entry.id);

        // Dieselbe Regel wie die Sitzungsplanung, damit die Zahl stimmt.
        const ready = countReady(entries, progress, meta.direction, new Date(now));

        return {
          id: meta.id,
          title: meta.title,
          topic: meta.topic,
          gradeLabel: GRADE_LABELS[meta.grade],
          cefrLevel: meta.cefrLevel,
          direction: meta.direction,
          total: entries.length,
          mastered: countMastered(entryIds, progress, directions),
          due: ready,
          perDirection: directions.map((direction) => ({
            direction,
            mastered: entryIds.filter(
              (entryId) => (progress.get(directionKey(entryId, direction))?.box ?? 0) >= LEITNER_BOX_MAX,
            ).length,
          })),
        };
      }),
    );
  }, []);

  return (
    <div className="stack">
      <div>
        <h1>Lernen</h1>
        <p className="muted" style={{ maxWidth: '46rem' }}>
          Deine Pakete und dein Lernstand liegen nur auf diesem Gerät. Niemand sonst kann
          sehen, was oder wie lange du übst.
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
        <Button variant="primary" onClick={() => fileInput.current?.click()}>
          Paket hinzufügen (.vocabpack.json)
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          aria-label="Vokabelpaket auswählen"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importer.importFile(file);
          }}
        />
      </div>

      {overview === undefined ? (
        <p className="muted">Pakete werden geladen …</p>
      ) : overview.length === 0 ? (
        <Card quiet>
          <p style={{ margin: 0 }}>
            Noch keine Pakete auf diesem Gerät. Füge eine Paketdatei hinzu oder erstelle
            unter <Link to="/material">Material erstellen</Link> selbst eine Liste.
          </p>
        </Card>
      ) : (
        <div className="card-grid">
          {overview.map((pack) => (
            <Card key={pack.id}>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '0.2rem' }}>{pack.title}</h2>
              <p className="muted small" style={{ marginBottom: '0.7rem' }}>
                {pack.gradeLabel} · {pack.cefrLevel} · {pack.total} Vokabeln
                {pack.topic ? ` · ${pack.topic}` : ''}
              </p>
              <Meter
                value={pack.mastered}
                max={pack.total}
                label={`Sicher gelernt in ${pack.title}`}
              />
              <p className="small muted" style={{ margin: '0.4rem 0 0.6rem' }}>
                {pack.mastered} von {pack.total} sicher · {pack.due} zum Üben bereit
              </p>
              {pack.direction === 'both' ? (
                <ul className="small muted" style={{ margin: '0 0 0.8rem', paddingLeft: '1.1rem' }}>
                  {pack.perDirection.map((stand) => (
                    <li key={stand.direction}>
                      {DIRECTION_SHORT[stand.direction]}: {stand.mastered} von {pack.total}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link className="btn btn--primary btn--small" to={`/lernen/${pack.id}`}>
                Öffnen
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
