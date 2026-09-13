import { useEffect, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { Alert, Card, EmptyState } from '../../ui/components';
import type { Course } from '../../application/repositories';

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
  const [kurs, setKurs] = useState<Course | undefined>(undefined);

  useEffect(() => {
    if (!courses || !courseId) return;
    let aktiv = true;
    void courses.getCourse(courseId).then((gefunden) => {
      if (aktiv) setKurs(gefunden);
    });
    return () => {
      aktiv = false;
    };
  }, [courses, courseId]);

  return (
    <div className="stack">
      <h1>{kurs?.title ?? 'Kurs'}</h1>
      <Alert tone="info" title="Kommt in Phase 5">
        Die veröffentlichten Pakete dieses Kurses – und ab Phase 6 der eigene Lernstand dazu, auf
        jedem Gerät.
      </Alert>
      <p className="small muted">
        <Link to="/lernen">Zurück zu deinen Kursen</Link>
      </p>
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
