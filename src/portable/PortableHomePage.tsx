import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card, Meter } from '../ui/components';
import { getEntries, getPackMeta } from '../data/packRepo';
import { getProgressIndex } from '../data/progressRepo';
import { countMastered } from '../domain/leitner';
import { countReady } from '../domain/exercises';
import { directionKey } from '../domain/ids';
import { GRADE_LABELS } from '../domain/cefr';
import { APP_CLAIM } from '../pwa/manifest';
import {
  activeDirections,
  LEITNER_BOX_MAX,
  TASK_DIRECTION_LABELS,
  type TaskDirection,
} from '../domain/schema';

/**
 * Die Startseite der Schülerdatei: genau ein Paket.
 *
 * Sie liest bewusst **nicht** `listPacks()`, sondern nur die eine Paket-Id,
 * die in dieser Datei steckt. Selbst wenn im Browser Daten einer anderen
 * Schülerdatei lägen, kämen sie hier nicht zum Vorschein.
 */
export function PortableHomePage({ packId }: { packId: string }) {
  const overview = useLiveQuery(async () => {
    const meta = await getPackMeta(packId);
    if (!meta) return null;

    const entries = await getEntries(packId);
    const progress = await getProgressIndex(packId);
    const directions = activeDirections(meta.direction);
    const entryIds = entries.map((entry) => entry.id);

    return {
      meta,
      total: entries.length,
      mastered: countMastered(entryIds, progress, directions),
      // Dieselbe Regel wie die Rundenplanung – die Zahl bleibt ehrlich.
      due: countReady(entries, progress, meta.direction, new Date()),
      perDirection: directions.map((direction: TaskDirection) => ({
        direction,
        mastered: entryIds.filter(
          (entryId) => (progress.get(directionKey(entryId, direction))?.box ?? 0) >= LEITNER_BOX_MAX,
        ).length,
      })),
    };
  }, [packId]);

  if (overview === undefined) return <p className="muted">Paket wird geladen …</p>;
  if (overview === null) {
    return (
      <div className="stack">
        <h1>Paket nicht gefunden</h1>
        <p className="muted">Diese Datei konnte ihr Vokabelpaket nicht öffnen.</p>
      </div>
    );
  }

  const { meta, total, mastered, due, perDirection } = overview;

  return (
    <div className="stack stack--editorial">
      <section className="hero" style={{ paddingBottom: 0 }}>
        <p className="claim">{APP_CLAIM}</p>
        <h1 className="display">{meta.title}</h1>
        <p className="lede">
          {due > 0 ? (
            <>
              <strong>
                {due} {due === 1 ? 'Vokabel ist' : 'Vokabeln sind'} dran
              </strong>{' '}
              – was du übst und wie lange, sieht niemand außer dir.
            </>
          ) : (
            <>
              Gerade ist nichts fällig. Du kannst trotzdem jederzeit üben – das ändert deinen
              Lernplan nicht.
            </>
          )}
        </p>
      </section>

      <Card>
        <h2 style={{ marginTop: 0 }}>{meta.title}</h2>
        <p className="muted small">
          {GRADE_LABELS[meta.grade]} · {meta.cefrLevel}
          {meta.topic ? ` · ${meta.topic}` : ''} · {total}{' '}
          {total === 1 ? 'Vokabel' : 'Vokabeln'}
        </p>
        {meta.description ? <p>{meta.description}</p> : null}

        <Meter value={mastered} max={Math.max(total, 1)} label="Sicher gelernte Vokabeln" />
        <p className="small muted">
          {mastered} von {total} sicher · {due} zum Üben bereit
        </p>
        <ul className="small muted" style={{ margin: '0 0 1rem', paddingLeft: '1.1rem' }}>
          {perDirection.map((stand) => (
            <li key={stand.direction}>
              {TASK_DIRECTION_LABELS[stand.direction]}: {stand.mastered} von {total}
            </li>
          ))}
        </ul>

        <div className="row">
          <Link className="btn btn--primary" to={`/lernen/${packId}`}>
            Paket öffnen
          </Link>
        </div>
      </Card>
    </div>
  );
}
