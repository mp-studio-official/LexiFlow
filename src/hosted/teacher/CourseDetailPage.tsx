import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { Alert, Button, Card, Field } from '../../ui/components';
import type { Course, CourseInvite, CourseMember } from '../../application/repositories';

/**
 * Ein Kurs: wer drin ist, und wie man hineinkommt.
 *
 * ## Der Code steht genau einmal auf dem Bildschirm
 *
 * Danach nie wieder – auch nicht für die Lehrkraft, die ihn erzeugt hat. In
 * der Datenbank liegt nur sein Hash (Phase 4). Das ist unbequem und richtig:
 * Ein Code, den man jederzeit nachschlagen kann, liegt am Ende in einer
 * Tabelle, einem Screenshot und einem Chatverlauf.
 *
 * Deshalb sagt die Oberfläche es **vorher** und zeigt den Code so groß, dass
 * er sich vorlesen lässt.
 *
 * ## Was in der Mitgliederliste steht
 *
 * Name, Kennung, Beitritt. Keine Zahl über das Üben – es gibt sie nicht, und
 * es soll sie auch nicht geben.
 */
export function CourseDetailPage() {
  const { courseId } = useParams();
  const courses = useOptionalRepository('courses');
  const [kurs, setKurs] = useState<Course | undefined>(undefined);
  const [mitglieder, setMitglieder] = useState<CourseMember[]>([]);
  const [fehler, setFehler] = useState('');
  const [geladen, setGeladen] = useState(false);

  const laden = useCallback(async () => {
    if (!courses || !courseId) return;
    try {
      setKurs(await courses.getCourse(courseId));
      setMitglieder(await courses.members(courseId));
    } catch (error) {
      setFehler(error instanceof Error ? error.message : 'Der Kurs ist nicht abrufbar.');
    } finally {
      setGeladen(true);
    }
  }, [courses, courseId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  if (!courses || !courseId) return <Alert tone="info">In dieser Fassung gibt es keine Kurse.</Alert>;
  if (!geladen) return <p className="muted">Der Kurs wird geladen …</p>;
  if (!kurs) {
    return (
      <div className="stack">
        <h1>Kurs nicht gefunden</h1>
        <p>
          <Link to="/kurse">Zurück zu deinen Kursen</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        <Link to="/kurse">Alle Kurse</Link>
      </p>
      <h1>{kurs.title}</h1>
      {kurs.archived ? (
        <Alert tone="info" title="Dieser Kurs ist abgeschlossen">
          Die Lerngruppe sieht ihn weiter und übt darin weiter – der Lernstand läuft mit. Was endet,
          ist die Arbeit daran: Niemand kommt mehr hinzu, alte Einladungscodes führen nicht mehr
          hinein, und der Kurs lässt sich nicht mehr ändern. Wer wirklich keinen Zugriff mehr haben
          soll, wird aus der Mitgliederliste entfernt.
        </Alert>
      ) : null}

      {fehler ? <Alert tone="error">{fehler}</Alert> : null}

      <Einladungen courseId={courseId} archiviert={kurs.archived} />

      <Card>
        <h2 style={{ marginTop: 0 }}>Wer im Kurs ist</h2>
        {mitglieder.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            Noch niemand. Gib den Einladungscode an deine Lerngruppe weiter.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <caption className="visually-hidden">
                Mitglieder dieses Kurses – Name, Kennung, Rolle und Beitrittsdatum
              </caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Kennung</th>
                  <th scope="col">Rolle</th>
                  <th scope="col">
                    <span className="visually-hidden">Entfernen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {mitglieder.map((mitglied) => (
                  <tr key={mitglied.userId}>
                    <td>{mitglied.displayName}</td>
                    <td>{mitglied.shortCode}</td>
                    <td>{mitglied.role === 'student' ? 'lernt' : 'unterrichtet'}</td>
                    <td>
                      <Button
                        small
                        variant="quiet"
                        aria-label={`${mitglied.displayName} aus dem Kurs entfernen`}
                        onClick={() => {
                          void courses.removeMember(courseId, mitglied.userId).then(laden);
                        }}
                      >
                        Entfernen
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted" style={{ marginBottom: 0 }}>
          Hier steht nichts darüber, wie viel jemand geübt hat. Das ist Absicht und keine
          Auslassung: Lernstände gehören den Lernenden.
        </p>
      </Card>

      <Card quiet>
        <h2 style={{ marginTop: 0 }}>Kurs {kurs.archived ? 'wieder öffnen' : 'archivieren'}</h2>
        <p>
          {kurs.archived
            ? 'Ein geöffneter Kurs nimmt wieder Mitglieder auf und lässt sich wieder ändern.'
            : 'Am Ende des Halbjahrs: Die Lerngruppe übt weiter und behält ihren Lernstand. Nur die Arbeit am Kurs endet – keine neuen Mitglieder, keine neuen Zuweisungen, keine Änderungen.'}
        </p>
        <Button
          onClick={() => {
            void courses.setArchived(courseId, !kurs.archived).then(laden);
          }}
        >
          {kurs.archived ? 'Wieder öffnen' : 'Archivieren'}
        </Button>
      </Card>
    </div>
  );
}

function Einladungen({ courseId, archiviert }: { courseId: string; archiviert: boolean }) {
  const invitations = useOptionalRepository('invitations');
  const [liste, setListe] = useState<CourseInvite[]>([]);
  const [frischerCode, setFrischerCode] = useState('');
  const [plaetze, setPlaetze] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  const laden = useCallback(async () => {
    if (!invitations) return;
    try {
      setListe(await invitations.listForCourse(courseId));
    } catch {
      setListe([]);
    }
  }, [invitations, courseId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  if (!invitations) return null;

  function istAusgeschoepft(einladung: CourseInvite) {
    return einladung.maxUses !== undefined && einladung.usedCount >= einladung.maxUses;
  }

  async function erzeugen(event: FormEvent) {
    event.preventDefault();
    setFehler('');
    setLaeuft(true);
    try {
      const anzahl = plaetze.trim() === '' ? undefined : Number.parseInt(plaetze, 10);
      const { code } = await invitations!.createInvite(courseId, {
        ...(anzahl !== undefined && Number.isFinite(anzahl) ? { maxUses: anzahl } : {}),
      });
      setFrischerCode(code);
      await laden();
    } catch (error) {
      setFehler(error instanceof Error ? error.message : 'Die Einladung wurde nicht angelegt.');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card>
      <h2 style={{ marginTop: 0 }}>Einladungscode</h2>

      {frischerCode ? (
        <Alert tone="success" title="Diesen Code jetzt weitergeben">
          <p
            style={{
              fontSize: '2rem',
              letterSpacing: 'var(--tracking-eyebrow, 0.14em)',
              fontWeight: 700,
              margin: '0.4rem 0',
            }}
          >
            {frischerCode}
          </p>
          <p style={{ margin: 0 }}>
            Er steht <strong>nur jetzt</strong> hier. Gespeichert ist nur seine Prüfsumme – auch du
            kannst ihn später nicht mehr nachschlagen. Wenn er verloren geht, erzeuge einfach einen
            neuen.
          </p>
        </Alert>
      ) : null}

      {archiviert ? (
        <p className="muted">
          Ein abgeschlossener Kurs nimmt niemanden mehr auf. Öffne ihn wieder, wenn du einladen
          willst.
        </p>
      ) : (
        <form className="stack" onSubmit={erzeugen}>
          <Field
            label="Wie viele dürfen damit beitreten? (freiwillig)"
            hint="Leer lassen heißt: beliebig viele. Eine Zahl ist sicherer, wenn der Code an der Tafel steht."
          >
            {(props) => (
              <input
                {...props}
                type="number"
                min={1}
                inputMode="numeric"
                value={plaetze}
                onChange={(event) => setPlaetze(event.target.value)}
              />
            )}
          </Field>

          {fehler ? <Alert tone="error">{fehler}</Alert> : null}

          <Button type="submit" variant="primary" disabled={laeuft}>
            {laeuft ? 'Einen Moment …' : 'Code erzeugen'}
          </Button>
        </form>
      )}

      {liste.length > 0 ? (
        <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
          <table>
            <caption className="visually-hidden">
              Ausgegebene Einladungen dieses Kurses – Kürzel, Nutzung und Zustand
            </caption>
            <thead>
              <tr>
                <th scope="col">Kürzel</th>
                <th scope="col">Genutzt</th>
                <th scope="col">Zustand</th>
                <th scope="col">
                  <span className="visually-hidden">Zurückziehen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {liste.map((einladung) => {
                const ausgeschoepft = istAusgeschoepft(einladung);
                return (
                  <tr key={einladung.id}>
                    <td>{einladung.label}…</td>
                    <td>
                      {einladung.usedCount}
                      {einladung.maxUses === undefined ? '' : ` von ${einladung.maxUses}`}
                    </td>
                    <td>
                      {einladung.revoked
                        ? 'zurückgezogen'
                        : ausgeschoepft
                          ? 'ausgeschöpft'
                          : 'gültig'}
                    </td>
                    <td>
                      {einladung.revoked || ausgeschoepft ? null : (
                        <Button
                          small
                          variant="quiet"
                          aria-label={`Einladung ${einladung.label} zurückziehen`}
                          onClick={() => {
                            void invitations!.revokeInvite(einladung.id).then(laden);
                          }}
                        >
                          Zurückziehen
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}

export default CourseDetailPage;
