import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Alert, Button, EmptyState, Meter } from '../../ui/components';
import { PackCard } from '../../ui/PackCard';
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

/**
 * Lernfeed statt Dashboard (Sprint 3A).
 *
 * Die Seite fragt nicht nach Auswertung, sondern nach einer Runde. Was fällig
 * ist, steht oben; die Pakete folgen als Feed. Der Fortschritt bleibt lesbar,
 * aber ohne Punkte, Ranglisten oder Streak-Druck – die Zahlen sind dieselben
 * ehrlichen wie zuvor.
 */

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

  const dueTotal = overview?.reduce((sum, pack) => sum + pack.due, 0) ?? 0;
  const duePacks = overview?.filter((pack) => pack.due > 0) ?? [];

  return (
    <div className="stack stack--editorial">
      <section className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Lernen</p>
        <h1 className="display">Bereit für eine kurze Runde?</h1>
        {overview === undefined ? (
          <p className="lede">Deine Pakete werden geladen …</p>
        ) : dueTotal > 0 ? (
          <p className="lede">
            <strong>
              {dueTotal} {dueTotal === 1 ? 'Vokabel ist' : 'Vokabeln sind'} dran
            </strong>{' '}
            – verteilt auf {duePacks.length} {duePacks.length === 1 ? 'Paket' : 'Pakete'}. Was du
            übst und wie lange, sieht niemand außer dir.
          </p>
        ) : (
          <p className="lede">
            Gerade ist nichts fällig. Du kannst trotzdem frei üben – das ändert deinen Lernplan
            nicht.
          </p>
        )}
      </section>

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

      <section aria-labelledby="meine-pakete">
        <div className="section-head">
          <h2 id="meine-pakete" className="display display--section">
            Deine Pakete
          </h2>
          <Button variant="quiet" small onClick={() => fileInput.current?.click()}>
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
          <EmptyState
            title="Noch keine Pakete auf diesem Gerät"
            action={
              <Link className="btn btn--accent" to="/material">
                Selbst ein Paket erstellen
              </Link>
            }
          >
            <p className="empty-state__text">
              Ein Paket ist eine einzelne <code className="mono">.vocabpack.json</code>-Datei. Du
              bekommst sie von deiner Lehrkraft oder erstellst dir selbst eine – beides ohne Konto.
            </p>
            <p className="empty-state__text">
              Vorhandene Datei? Über „Paket hinzufügen“ oben landet sie direkt hier.
            </p>
          </EmptyState>
        ) : (
          <div className="feed">
            {overview.map((pack) => (
              <PackCard
                key={pack.id}
                title={pack.title}
                to={`/lernen/${pack.id}`}
                {...(pack.due > 0
                  ? {
                      flag: `${pack.due} ${pack.due === 1 ? 'Vokabel' : 'Vokabeln'} zum Üben bereit`,
                    }
                  : {})}
                meta={[
                  `${pack.total} Vokabeln`,
                  pack.gradeLabel,
                  pack.cefrLevel,
                  ...(pack.topic ? [pack.topic] : []),
                ]}
                actions={
                  <>
                    <Link className="btn btn--primary btn--small" to={`/lernen/${pack.id}`}>
                      Öffnen
                    </Link>
                    <span className="small muted">
                      {pack.due > 0 ? 'Lernplan oder freies Üben' : 'Freies Üben ist jederzeit möglich'}
                    </span>
                  </>
                }
              >
                <div className="pack-card__stat">
                  <Meter
                    value={pack.mastered}
                    max={pack.total}
                    label={`Sicher gelernt in ${pack.title}`}
                  />
                  <p className="pack-card__stat-text">
                    {pack.mastered} von {pack.total} sicher · {pack.due} zum Üben bereit
                  </p>
                </div>
                {pack.direction === 'both' ? (
                  <ul className="small muted" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {pack.perDirection.map((stand) => (
                      <li key={stand.direction}>
                        {DIRECTION_SHORT[stand.direction]}: {stand.mastered} von {pack.total}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </PackCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
