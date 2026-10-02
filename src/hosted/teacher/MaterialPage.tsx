import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { soloUrlFrom } from '../../runtime/entryUrls';
import { Alert, Button, Card, EmptyState } from '../../ui/components';
import { Verbindungsfehler } from '../verbindung';
import type { Course, PackSummary } from '../../application/repositories';

/**
 * Das Material einer Lehrkraft: Pakete, Fassungen, Zuweisungen.
 *
 * ## Die drei Zustände, die sichtbar sein müssen
 *
 * 1. **Nur ein Entwurf** – niemand außer ihr sieht ihn.
 * 2. **Veröffentlicht** – es gibt eine eingefrorene Fassung.
 * 3. **Veröffentlicht, aber geändert** – der Entwurf ist weitergelaufen.
 *
 * Der dritte ist der, den eine Oberfläche gern verschweigt. Ohne ihn ändert
 * jemand ein Paket, sieht „veröffentlicht" und wundert sich wochenlang, warum
 * die Lerngruppe die Änderung nicht hat.
 *
 * ## Warum die Übernahme vom Gerät lazy geladen wird
 *
 * Sie braucht den lokalen Speicher (Dexie) – für eine Lehrkraft, die das
 * einmal im Leben tut. Statisch importiert läge er in jedem Portalbündel.
 */
const LocalImportPanel = lazy(() => import('./LocalImportPanel'));

export function MaterialPage() {
  const packs = useOptionalRepository('packs');
  const publication = useOptionalRepository('publication');
  const courses = useOptionalRepository('courses');

  const [liste, setListe] = useState<PackSummary[] | undefined>(undefined);
  const [kurse, setKurse] = useState<Course[]>([]);
  const [fehler, setFehler] = useState('');
  const [meldung, setMeldung] = useState('');
  /*
    Getrennt von `fehler`: Der sagt, dass eine **Handlung** nicht geklappt
    hat, und steht neben einer Liste, die es gibt. Dieser sagt, dass es die
    Liste nicht gibt – und dann darf darunter nichts stehen, was aussieht,
    als gäbe es sie doch. Vorher blieb `liste` undefiniert und darunter stand
    „Material wird geladen …", ohne Ende.
  */
  const [ladefehler, setLadefehler] = useState(false);

  const laden = useCallback(async () => {
    if (!packs) return;
    setLadefehler(false);
    try {
      setListe(await packs.list());
      if (courses) setKurse((await courses.myCourses()).filter((kurs) => !kurs.archived));
    } catch {
      setLadefehler(true);
    }
  }, [packs, courses]);

  useEffect(() => {
    void laden();
  }, [laden]);

  if (!packs || !publication) {
    return <Alert tone="info">In dieser Fassung gibt es kein Material im Konto.</Alert>;
  }

  async function tue(was: () => Promise<string>) {
    setFehler('');
    setMeldung('');
    try {
      setMeldung(await was());
      await laden();
    } catch (error) {
      setFehler(error instanceof Error ? error.message : 'Das hat nicht geklappt.');
    }
  }

  if (ladefehler) {
    return (
      <div className="stack">
        <h1>Material</h1>
        <Verbindungsfehler was="Das Material" erneut={() => void laden()} />
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Material</h1>

      {fehler ? <Alert tone="error">{fehler}</Alert> : null}
      {meldung ? (
        <Alert tone="success">
          {meldung}
        </Alert>
      ) : null}

      <Suspense fallback={<p className="muted">Der Übernahmebereich wird geladen …</p>}>
        <LocalImportPanel onUebernommen={laden} />
      </Suspense>

      {liste === undefined ? <p className="muted">Material wird geladen …</p> : null}

      {liste !== undefined && liste.length === 0 ? (
        <EmptyState title="Noch kein Paket im Konto">
          <p style={{ marginBottom: 0 }}>
            Pakete entstehen weiterhin in{' '}
            <a href={soloUrlFrom(import.meta.env.BASE_URL)}>LexiFlow ohne Konto</a> – dort gibt es
            die Werkstatt mit Text, Liste und Thema. Hier werden sie veröffentlicht und einer
            Lerngruppe zugewiesen.
          </p>
        </EmptyState>
      ) : null}

      {(liste ?? []).map((paket) => (
        <Card key={paket.id}>
          <h2 style={{ marginTop: 0, marginBottom: '0.2rem' }}>{paket.title}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Klasse {paket.grade} · {paket.entryCount} Vokabeln · <Zustand paket={paket} />
          </p>

          <div className="row" style={{ marginTop: '0.8rem', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              small
              onClick={() =>
                tue(async () => {
                  const revision = await publication.publish(paket.id);
                  return `„${paket.title}" ist als Fassung ${revision.revision} veröffentlicht.`;
                })
              }
            >
              {paket.publishedRevision === undefined ? 'Veröffentlichen' : 'Neue Fassung veröffentlichen'}
            </Button>

            {paket.publishedRevision === undefined ? null : (
              <Button
                small
                variant="quiet"
                onClick={() =>
                  tue(async () => {
                    await publication.withdraw(paket.id, paket.publishedRevision!);
                    return `Fassung ${paket.publishedRevision} ist zurückgezogen und aus allen Kursen genommen.`;
                  })
                }
              >
                Fassung {paket.publishedRevision} zurückziehen
              </Button>
            )}
          </div>

          {paket.publishedRevision !== undefined && kurse.length > 0 ? (
            <Zuweisung
              paket={paket}
              kurse={kurse}
              onZuweisen={(courseId) =>
                tue(async () => {
                  await publication.assignToCourse(courseId, paket.id, paket.publishedRevision!, 0);
                  const kurs = kurse.find((eintrag) => eintrag.id === courseId);
                  return `„${paket.title}" liegt jetzt in „${kurs?.title ?? 'dem Kurs'}".`;
                })
              }
            />
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function Zustand({ paket }: { paket: PackSummary }) {
  if (paket.publishedRevision === undefined) return <>nur Entwurf</>;
  if (paket.hasUnpublishedChanges) {
    return (
      <>
        Fassung {paket.publishedRevision} veröffentlicht – <strong>Entwurf ist neuer</strong>
      </>
    );
  }
  return <>Fassung {paket.publishedRevision} veröffentlicht</>;
}

function Zuweisung({
  paket,
  kurse,
  onZuweisen,
}: {
  paket: PackSummary;
  kurse: readonly Course[];
  onZuweisen: (courseId: string) => Promise<void>;
}) {
  const [kurs, setKurs] = useState('');

  return (
    <div className="row" style={{ marginTop: '0.8rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor={`kurs-${paket.id}`}>Einer Lerngruppe geben</label>
        <select
          id={`kurs-${paket.id}`}
          value={kurs}
          onChange={(event) => setKurs(event.target.value)}
        >
          <option value="">Kurs wählen …</option>
          {kurse.map((eintrag) => (
            <option key={eintrag.id} value={eintrag.id}>
              {eintrag.title}
            </option>
          ))}
        </select>
      </div>
      <Button
        small
        disabled={kurs === ''}
        onClick={() => {
          void onZuweisen(kurs);
        }}
      >
        Zuweisen
      </Button>
    </div>
  );
}

export default MaterialPage;
