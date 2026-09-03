import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Meter } from '../ui/components';
import { PackCard } from '../ui/PackCard';
import { getEntries, getPackMeta } from '../data/packRepo';
import { getProgressIndex } from '../data/progressRepo';
import { countMastered } from '../domain/leitner';
import { countReady } from '../domain/exercises';
import { directionKey } from '../domain/ids';
import { GRADE_LABELS } from '../domain/cefr';
import { APP_CLAIM } from '../pwa/manifest';
import { activeDirections, LEITNER_BOX_MAX, type TaskDirection } from '../domain/schema';

/**
 * Die Startseite der Lerndatei: die Pakete **dieses** Lernbereichs.
 *
 * Sie liest bewusst **nicht** `listPacks()`, sondern nur die Kennungen, die in
 * dieser Datei stecken. Selbst wenn im Browser Daten einer anderen Lerndatei
 * lägen, kämen sie hier nicht zum Vorschein – und genau das ist auch der
 * Grund, warum sie eine Liste von Kennungen bekommt und sie sich nicht selbst
 * zusammensucht.
 *
 * ## Ein Paket oder sechs – dieselbe Seite
 *
 * Bis 4B.7 zeigte diese Seite ein einzelnes Paket in einem großen Kasten mit
 * eigener Überschrift. Mit mehreren Paketen wäre daraus ein zweites Layout
 * geworden, das dasselbe tut. Jetzt ist es dieselbe Kartenwand wie im
 * Lernbereich der Anwendung, auch bei einem Paket: Eine Wand mit einer Karte
 * sieht aus wie eine Wand mit einer Karte – ein Sonderfall dafür ist ein
 * Sonderfall zu viel.
 *
 * Was bleibt, ist die Beschriftung der Aktion: **„Paket öffnen“**, nicht
 * „Öffnen“. In einer Datei, in der außer Paketen nichts liegt, ist das die
 * Auskunft, die zählt.
 */

interface PackOverview {
  id: string;
  title: string;
  topic: string;
  gradeLabel: string;
  cefrLevel: string;
  total: number;
  mastered: number;
  due: number;
  perDirection: { direction: TaskDirection; mastered: number }[];
}

export interface PortableHomePageProps {
  /** Der Titel des Lernbereichs – die Überschrift dieser Datei. */
  title: string;
  description?: string;
  /** Die Pakete in der Reihenfolge, die die Lehrkraft gewählt hat. */
  packIds: readonly string[];
}

export function PortableHomePage({ title, description, packIds }: PortableHomePageProps) {
  /*
    `packIds.join()` als Abhängigkeit und nicht das Feld selbst: Die Liste
    kommt bei jedem Rendern als neues Array an, und `useLiveQuery` verglich
    dann jedes Mal ungleich und fragte neu ab.
  */
  const key = packIds.join('|');

  const overview = useLiveQuery<PackOverview[]>(async () => {
    const now = new Date();
    const found = await Promise.all(
      packIds.map(async (packId): Promise<PackOverview | null> => {
        const meta = await getPackMeta(packId);
        if (!meta) return null;

        const entries = await getEntries(packId);
        const progress = await getProgressIndex(packId);
        const directions = activeDirections(meta.direction);
        const entryIds = entries.map((entry) => entry.id);

        return {
          id: meta.id,
          title: meta.title,
          topic: meta.topic,
          gradeLabel: GRADE_LABELS[meta.grade],
          cefrLevel: meta.cefrLevel,
          total: entries.length,
          mastered: countMastered(entryIds, progress, directions),
          // Dieselbe Regel wie die Rundenplanung – die Zahl bleibt ehrlich.
          due: countReady(entries, progress, meta.direction, now),
          perDirection: directions.map((direction: TaskDirection) => ({
            direction,
            mastered: entryIds.filter(
              (entryId) => (progress.get(directionKey(entryId, direction))?.box ?? 0) >= LEITNER_BOX_MAX,
            ).length,
          })),
        };
      }),
    );
    // Die Reihenfolge ist die der Lehrkraft; fehlende Pakete fallen still weg.
    return found.filter((pack): pack is PackOverview => pack !== null);
  }, [key]);

  if (overview === undefined) return <p className="muted">Vokabeln werden geladen …</p>;

  if (overview.length === 0) {
    return (
      <div className="stack">
        <h1>Keine Vokabeln gefunden</h1>
        <p className="muted">Diese Datei konnte ihre Vokabelpakete nicht öffnen.</p>
      </div>
    );
  }

  const dueTotal = overview.reduce((sum, pack) => sum + pack.due, 0);
  const duePacks = overview.filter((pack) => pack.due > 0);

  return (
    <div className="stack stack--editorial">
      {/*
        Derselbe schlanke Kopf wie im Lernbereich der Anwendung: eine Zeile
        Identität, eine Zeile Stand. Die Überschrift ist der Titel des
        Bereichs – das ist das, was die Lehrkraft ausgegeben hat, und das
        Erste, woran man die Datei wiedererkennt.
      */}
      <section className="learnbar">
        <div>
          <p className="claim" style={{ margin: 0 }}>
            {APP_CLAIM}
          </p>
          <h1 className="learnbar__title">{title}</h1>
        </div>

        <p className="learnbar__stand">
          {dueTotal > 0 ? (
            <>
              <strong>{dueTotal}</strong> {dueTotal === 1 ? 'Vokabel ist dran' : 'Vokabeln sind dran'}
              {duePacks.length > 1 ? ` · ${duePacks.length} Pakete` : null}
            </>
          ) : (
            <>Gerade ist nichts fällig – freies Üben geht trotzdem.</>
          )}
        </p>
      </section>

      {description ? <p className="lede">{description}</p> : null}

      <div className="packgrid">
        {overview.map((pack) => (
          <PackCard
            key={pack.id}
            title={pack.title}
            art={pack.title}
            to={`/lernen/${pack.id}`}
            {...(pack.due > 0
              ? { flag: `${pack.due} ${pack.due === 1 ? 'Vokabel' : 'Vokabeln'} dran` }
              : {})}
            meta={[
              `${pack.total} ${pack.total === 1 ? 'Vokabel' : 'Vokabeln'}`,
              pack.gradeLabel,
              pack.cefrLevel,
              ...(pack.topic ? [pack.topic] : []),
            ]}
            actions={
              <Link className="btn btn--primary btn--small" to={`/lernen/${pack.id}`}>
                Paket öffnen
              </Link>
            }
          >
            <div className="pack-card__stat">
              <Meter
                value={pack.mastered}
                max={Math.max(pack.total, 1)}
                label={`Sicher gelernt in ${pack.title}`}
              />
              <p className="pack-card__stat-text">
                <strong>{pack.mastered}</strong> von {pack.total} sicher
                {pack.due > 0 ? ` · ${pack.due} bereit` : null}
              </p>
            </div>
          </PackCard>
        ))}
      </div>

      <p className="small muted">
        Was du übst und wie lange, bleibt auf diesem Gerät. Es wird nichts gesendet und niemand
        sieht deinen Lernstand.
      </p>
    </div>
  );
}
