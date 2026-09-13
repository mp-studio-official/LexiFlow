import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { Alert, Button, Card, Field } from '../../ui/components';
import { useSession } from '../SessionContext';

/**
 * Beitritt per Code.
 *
 * ## Warum die Seite öffentlich ist, obwohl der Beitritt es nicht ist
 *
 * Der Code wird an der Tafel vorgelesen. Wer ihn eintippt, ist in diesem
 * Moment oft noch nicht angemeldet – und eine Anmeldeseite, auf der der Code
 * keinen Platz hat, ist der Punkt, an dem eine halbe Klasse aussteigt.
 *
 * Die Seite nimmt den Code deshalb **zuerst** entgegen und führt danach durch
 * die Anmeldung. Eingelöst wird er erst, wenn jemand angemeldet ist; ein
 * Kursbeitritt ohne Person ergibt keinen Sinn.
 */
export function JoinPage() {
  const invitations = useOptionalRepository('invitations');
  const { status } = useSession();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  async function absenden(event: FormEvent) {
    event.preventDefault();
    setFehler('');

    if (status !== 'angemeldet') {
      /*
        Der Code reist im Router-State mit, nicht in der Adresse: Ein
        Einladungscode in einer URL landet im Verlauf, in der Serverlogzeile
        des nächsten Aufrufs und in jedem geteilten Screenshot.
      */
      navigate('/anmelden', { state: { weiter: '/beitreten', code } });
      return;
    }

    if (!invitations) {
      setFehler('In dieser Fassung gibt es keine Kurse.');
      return;
    }

    setLaeuft(true);
    try {
      const kurs = await invitations.redeemCode(code);
      navigate(`/lernen/kurs/${kurs.id}`, { replace: true });
    } catch (error) {
      setFehler(error instanceof Error ? error.message : 'Dieser Code gilt nicht.');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="stack">
      <h1>Mit Code beitreten</h1>
      <p className="lead">
        Der Code ist acht Zeichen lang. Groß- und Kleinschreibung spielt keine Rolle.
      </p>

      <Card>
        <form className="stack" onSubmit={absenden}>
          <Field label="Einladungscode" hint="Zum Beispiel: MTKQ-3B7F">
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            )}
          </Field>

          {fehler ? <Alert tone="error">{fehler}</Alert> : null}

          <Button type="submit" variant="primary" disabled={laeuft}>
            {laeuft ? 'Einen Moment …' : status === 'angemeldet' ? 'Beitreten' : 'Weiter'}
          </Button>
        </form>
      </Card>

      {status === 'angemeldet' ? null : (
        <p className="small muted">
          Nach dem Eintippen fragt LexiFlow nach deiner Anmeldung – der Code bleibt so lange
          erhalten. Schon ein Konto? <Link to="/anmelden">Direkt anmelden</Link>.
        </p>
      )}
    </div>
  );
}

export default JoinPage;
