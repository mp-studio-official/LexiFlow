import { useEffect, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { Alert, Card, EmptyState } from '../../ui/components';
import type { Course, PackRevision } from '../../application/repositories';

/**
 * Der Lernbereich des Portals.
 *
 * ## Was hier schon funktioniert
 *
 * Die Kursliste. Sie liest über `CourseRepository` und weiß nicht, ob dahinter
 * eine Map oder Postgres liegt – genau dafür gibt es die Verträge. In Phase 1
 * liegt eine Map dahinter (siehe `fakeCloudRepositories.ts`); ab Phase 4 ist
 * es die Datenbank, ohne dass diese Datei sich ändert.
 *
 * ## Was hier fehlt
 *
 * Das Üben selbst. Die Übungsseiten existieren seit Sprint 1 und arbeiten
 * heute gegen `packRepo` direkt; sie an die Verträge zu hängen ist Phase 6 und
 * gehört dorthin, weil dazu der Lernstand geräteübergreifend gehört. Bis dahin
 * wäre ein Verweis von hier aus ein Knopf ohne Ziel.
 */

function Kursliste() {
  const courses = useOptionalRepository('courses');
  const [kurse, setKurse] = useState<Course[] | undefined>(undefined);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    if (!courses) return;
    let aktiv = true;
    void courses
      .myCourses()
      .then((gefunden) => {
        if (aktiv) setKurse(gefunden);
      })
      .catch((error: unknown) => {
        if (aktiv) setFehler(error instanceof Error ? error.message : 'Kurse nicht abrufbar.');
      });
    return () => {
      aktiv = false;
    };
  }, [courses]);

  if (!courses) {
    return <Alert tone="info">In dieser Fassung gibt es keine Kurse.</Alert>;
  }
  if (fehler) return <Alert tone="error">{fehler}</Alert>;
  if (!kurse) return <p className="muted">Kurse werden geladen …</p>;

  if (kurse.length === 0) {
    return (
      <EmptyState title="Noch kein Kurs">
        <p>
          Du bist noch in keiner Lerngruppe. Mit dem Code deiner Lehrkraft geht es los:{' '}
          <Link to="/beitreten">Mit Code beitreten</Link>.
        </p>
      </EmptyState>
    );
  }

  return (
    <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
      {kurse.map((kurs) => (
        <li key={kurs.id}>
          <Card>
            <h2 style={{ marginTop: 0 }}>
              <Link to={`/lernen/kurs/${kurs.id}`}>{kurs.title}</Link>
            </h2>
            {kurs.description ? <p>{kurs.description}</p> : null}
            {kurs.schoolYear ? <p className="small muted">Schuljahr {kurs.schoolYear}</p> : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}

function Kurs() {
  const { courseId } = useParams();
  const courses = useOptionalRepository('courses');
  const publication = useOptionalRepository('publication');
  const [kurs, setKurs] = useState<Course | undefined>(undefined);
  const [pakete, setPakete] = useState<PackRevision[] | undefined>(undefined);

  useEffect(() => {
    if (!courses || !courseId) return;
    let aktiv = true;
    void courses.getCourse(courseId).then((gefunden) => {
      if (aktiv) setKurs(gefunden);
    });
    if (publication) {
      void publication
        .publishedForCourse(courseId)
        .then((gefunden) => {
          if (aktiv) setPakete(gefunden);
        })
        .catch(() => {
          if (aktiv) setPakete([]);
        });
    }
    return () => {
      aktiv = false;
    };
  }, [courses, publication, courseId]);

  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        <Link to="/lernen">Zurück zu deinen Kursen</Link>
      </p>
      <h1>{kurs?.title ?? 'Kurs'}</h1>
      {kurs?.archived ? (
        <Alert tone="info" title="Dieser Kurs ist abgeschlossen">
          Du kannst weiter üben. Neue Pakete kommen hier keine mehr dazu.
        </Alert>
      ) : null}

      {pakete === undefined ? <p className="muted">Pakete werden geladen …</p> : null}

      {pakete !== undefined && pakete.length === 0 ? (
        <EmptyState title="Noch keine Vokabeln">
          <p style={{ marginBottom: 0 }}>
            Deine Lehrkraft hat diesem Kurs noch kein Paket gegeben. Sobald eines da ist, steht es
            hier.
          </p>
        </EmptyState>
      ) : null}

      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {(pakete ?? []).map((paket) => (
          <li key={paket.packId}>
            <Card>
              <h2 style={{ marginTop: 0, marginBottom: '0.2rem' }}>{paket.pack.meta.title}</h2>
              <p className="small muted" style={{ margin: 0 }}>
                {paket.pack.entries.length} Vokabeln · Klasse {paket.pack.meta.grade}
              </p>
            </Card>
          </li>
        ))}
      </ul>

      {pakete !== undefined && pakete.length > 0 ? (
        <Alert tone="info" title="Üben kommt als Nächstes">
          {/*
            Ehrlich statt einladend: Ein Knopf „Üben", der nichts tut, wäre
            schlimmer als der Satz, dass es ihn noch nicht gibt. Der Lernstand
            über mehrere Geräte gehört in Phase 6, und ohne ihn wäre Üben im
            Portal ein Fortschritt, der beim nächsten Gerät wieder weg ist.
          */}
          Die Vokabeln sind da. Das Üben im Portal kommt mit dem geräteübergreifenden Lernstand –
          bis dahin geht es in einer Lerndatei, die deine Lehrkraft weitergeben kann.
        </Alert>
      ) : null}
    </div>
  );
}

export function LearnerArea() {
  return (
    <Routes>
      <Route
        index
        element={
          <div className="stack">
            <h1>Deine Kurse</h1>
            <Kursliste />
          </div>
        }
      />
      <Route path="kurs/:courseId" element={<Kurs />} />
    </Routes>
  );
}

export default LearnerArea;
