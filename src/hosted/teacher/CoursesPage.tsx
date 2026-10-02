import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { Alert, Button, Card, EmptyState, Field } from '../../ui/components';
import type { Course } from '../../application/repositories';
import { Verbindungsfehler } from '../verbindung';

/**
 * Die Kursliste einer Lehrkraft.
 *
 * ## Was hier bewusst **nicht** steht
 *
 * Keine Zahl über das Üben. Nicht „12 von 25 haben angefangen“, nicht „zuletzt
 * aktiv vor drei Tagen“, nicht einmal ein Punkt hinter einem Namen. Solche
 * Anzeigen entstehen fast von selbst, wenn man eine Kursliste baut – und jede
 * einzelne wäre das Gegenteil dessen, wofür dieses Produkt da ist.
 *
 * Die Datenbank gibt sie ohnehin nicht her (Phase 2). Hier steht es trotzdem,
 * weil der Grund am Ort der Versuchung stehen soll.
 */
export function CoursesPage() {
  const courses = useOptionalRepository('courses');
  const [kurse, setKurse] = useState<Course[] | undefined>(undefined);
  /*
    Ein Zustand statt einer Fehlermeldung. Hier stand vorher `fehler` mit dem
    Text der Ausnahme – und darunter trotzdem die Liste, die es nicht gab.
    Das Anlegen hat seine eigene Meldung, in `NeuerKurs`; die hier sagt, dass
    es überhaupt nichts zu zeigen gibt.
  */
  const [ladefehler, setLadefehler] = useState(false);
  const [zeigeArchiv, setZeigeArchiv] = useState(false);

  const laden = useCallback(async () => {
    if (!courses) return;
    setLadefehler(false);
    try {
      setKurse(await courses.myCourses());
    } catch {
      /*
        Vorher stand hier die Meldung des Fehlers, und `kurse` blieb
        `undefined`. Sichtbar war dann „Kurse werden geladen …" – für immer,
        neben einem technischen Satz. Eine Ladeanzeige, die nie endet, ist
        die unehrlichste Antwort von allen.
      */
      setLadefehler(true);
    }
  }, [courses]);

  useEffect(() => {
    void laden();
  }, [laden]);

  if (!courses) return <Alert tone="info">In dieser Fassung gibt es keine Kurse.</Alert>;

  const aktive = (kurse ?? []).filter((kurs) => !kurs.archived);
  const archivierte = (kurse ?? []).filter((kurs) => kurs.archived);

  if (ladefehler) {
    /*
      Auch das Anlegen fällt weg: Ein Formular, dessen Absenden gleich wieder
      scheitert, ist ein Versprechen, das die Verbindung nicht hält.
    */
    return (
      <div className="stack">
        <h1>Kurse</h1>
        <Verbindungsfehler was="Die Kursliste" erneut={() => void laden()} />
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Kurse</h1>

      <NeuerKurs onAngelegt={laden} />

      {kurse === undefined ? <p className="muted">Kurse werden geladen …</p> : null}

      {kurse !== undefined && aktive.length === 0 ? (
        <EmptyState title="Noch kein Kurs">
          <p style={{ marginBottom: 0 }}>
            Ein Kurs ist eine Lerngruppe. Danach gibt es einen Einladungscode zum Vorlesen.
          </p>
        </EmptyState>
      ) : null}

      <Kursliste kurse={aktive} />

      {archivierte.length > 0 ? (
        <Card quiet>
          <Button
            small
            variant="quiet"
            aria-expanded={zeigeArchiv}
            onClick={() => setZeigeArchiv((vorher) => !vorher)}
          >
            {zeigeArchiv ? 'Archiv einklappen' : `Archiv (${archivierte.length})`}
          </Button>
          {zeigeArchiv ? (
            <>
              <p className="small muted">
                Abgeschlossene Kurse bleiben für ihre Lerngruppe da: Dort wird weiter geübt, und
                der Lernstand läuft mit. Sie nehmen nur niemanden mehr auf und lassen sich nicht
                mehr ändern.
              </p>
              <Kursliste kurse={archivierte} />
            </>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function Kursliste({ kurse }: { kurse: readonly Course[] }) {
  if (kurse.length === 0) return null;
  return (
    <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {kurse.map((kurs) => (
        <li key={kurs.id}>
          <Card>
            <h2 style={{ marginTop: 0, marginBottom: '0.2rem' }}>
              <Link to={`/kurse/${kurs.id}`}>{kurs.title}</Link>
            </h2>
            <p className="small muted" style={{ margin: 0 }}>
              {[kurs.schoolYear ? `Schuljahr ${kurs.schoolYear}` : '', kurs.archived ? 'archiviert' : '']
                .filter(Boolean)
                .join(' · ') || 'aktiv'}
            </p>
            {kurs.description ? <p style={{ marginBottom: 0 }}>{kurs.description}</p> : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}

function NeuerKurs({ onAngelegt }: { onAngelegt: () => Promise<void> }) {
  const courses = useOptionalRepository('courses');
  const [offen, setOffen] = useState(false);
  const [titel, setTitel] = useState('');
  const [schuljahr, setSchuljahr] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  async function absenden(event: FormEvent) {
    event.preventDefault();
    setFehler('');
    if (!courses) return;

    setLaeuft(true);
    try {
      await courses.createCourse({
        title: titel,
        ...(schuljahr.trim() ? { schoolYear: schuljahr.trim() } : {}),
      });
      setTitel('');
      setSchuljahr('');
      setOffen(false);
      await onAngelegt();
    } catch (error) {
      setFehler(error instanceof Error ? error.message : 'Der Kurs wurde nicht angelegt.');
    } finally {
      setLaeuft(false);
    }
  }

  if (!offen) {
    return (
      <Button variant="primary" onClick={() => setOffen(true)}>
        Kurs anlegen
      </Button>
    );
  }

  return (
    <Card>
      <form className="stack" onSubmit={absenden}>
        <Field label="Name des Kurses" hint="Zum Beispiel „Englisch 7b“.">
          {(props) => (
            <input
              {...props}
              type="text"
              value={titel}
              onChange={(event) => setTitel(event.target.value)}
              required
              autoFocus
            />
          )}
        </Field>

        <Field label="Schuljahr (freiwillig)" hint="Zum Beispiel „2026/27“.">
          {(props) => (
            <input
              {...props}
              type="text"
              value={schuljahr}
              onChange={(event) => setSchuljahr(event.target.value)}
            />
          )}
        </Field>

        {fehler ? <Alert tone="error">{fehler}</Alert> : null}

        <div className="row">
          <Button type="submit" variant="primary" disabled={laeuft}>
            {laeuft ? 'Einen Moment …' : 'Anlegen'}
          </Button>
          <Button variant="quiet" onClick={() => setOffen(false)}>
            Abbrechen
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default CoursesPage;
