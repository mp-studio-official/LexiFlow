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
import { APP_CLAIM } from '../../pwa/manifest';
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
      {/*
        Der Kopf ist schlank geworden (Sprint 4B.6).

        Vorher standen hier Claim, eine sehr große Überschrift und zwei Zeilen
        Fließtext – zusammen eine halbe Bildschirmhöhe, bevor das erste Paket
        zu sehen war. Auf einem Telefon musste man scrollen, um an die Sache zu
        kommen, wegen derer man die App geöffnet hat.

        Geblieben ist die eine Zahl, die zählt, und der Satz, der das
        Versprechen trägt. Beides in einer Zeile.
      */}
      <section className="learnbar">
        <div>
          <p className="claim" style={{ margin: 0 }}>
            {APP_CLAIM}
          </p>
          {/*
            Die Überschrift bleibt stehen, was auch immer der Stand ist.

            Sie ist die Identität der Seite, nicht ihr Zustand. Eine
            Überschrift, die zwischen „Bereit für eine kurze Runde?“ und
            „Gerade ist nichts fällig“ wechselt, lässt jemanden beim
            Zurückkommen erst einmal prüfen, wo er eigentlich ist. Den Zustand
            trägt die Zeile daneben.
          */}
          <h1 className="learnbar__title">Bereit für eine kurze Runde?</h1>
        </div>

        {overview !== undefined ? (
          <p className="learnbar__stand">
            {dueTotal > 0 ? (
              <>
                <strong>{dueTotal}</strong>{' '}
                {dueTotal === 1 ? 'Vokabel ist dran' : 'Vokabeln sind dran'}
                {duePacks.length > 1 ? ` · ${duePacks.length} Pakete` : null}
              </>
            ) : overview.length > 0 ? (
              <>Gerade ist nichts fällig – freies Üben geht trotzdem.</>
            ) : null}
          </p>
        ) : null}
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
          /*
            Ein Raster statt einer Liste – und zwar erst hier.

            Für die Lehrkraft ist die Paketliste ein Arbeitsmittel: fünfzig
            Zeilen, in denen gesucht wird, und da ist eine Leserichtung besser
            als zwei. Im Lernbereich stehen eine Handvoll Pakete, und die
            sollen aussehen wie etwas, das man aufschlägt.
          */
          <div className="packgrid">
            {overview.map((pack) => (
              <PackCard
                key={pack.id}
                title={pack.title}
                art={pack.title}
                to={`/lernen/${pack.id}`}
                {...(pack.due > 0
                  ? {
                      flag: `${pack.due} ${pack.due === 1 ? 'Vokabel' : 'Vokabeln'} dran`,
                    }
                  : {})}
                meta={[
                  `${pack.total} Vokabeln`,
                  pack.gradeLabel,
                  pack.cefrLevel,
                  ...(pack.topic ? [pack.topic] : []),
                ]}
                actions={
                  <Link className="btn btn--primary btn--small" to={`/lernen/${pack.id}`}>
                    Öffnen
                  </Link>
                }
              >
                {/*
                  Der Erfolg **des Pakets** – die eine Zahl, die hier zählt.

                  Es gibt vorerst nur ein Fach, und ein Lernstand über alle
                  Pakete hinweg wäre eine Zahl ohne Gegenstand. Was jemanden
                  interessiert, ist: Wie weit bin ich mit *diesem* Paket?
                */}
                <div className="pack-card__stat">
                  <Meter
                    value={pack.mastered}
                    max={pack.total}
                    label={`Sicher gelernt in ${pack.title}`}
                  />
                  <p className="pack-card__stat-text">
                    <strong>{pack.mastered}</strong> von {pack.total} sicher
                    {pack.due > 0 ? ` · ${pack.due} bereit` : null}
                  </p>
                </div>
                {pack.direction === 'both' ? (
                  <p className="pack-card__split small muted">
                    {pack.perDirection.map((stand) => (
                      <span key={stand.direction}>
                        {DIRECTION_SHORT[stand.direction]}: {stand.mastered}/{pack.total}
                      </span>
                    ))}
                  </p>
                ) : null}
              </PackCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
