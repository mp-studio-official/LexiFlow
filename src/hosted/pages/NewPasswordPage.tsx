import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { HOME_PER_ROLE } from '../../runtime/access';
import { withoutAuthParams } from '../../runtime/entryUrls';
import { Alert, Button, Card, Field } from '../../ui/components';
import { useSession } from '../SessionContext';

/** Dieselbe Mindestlänge wie in der Serverfunktion – dort ist sie verbindlich. */
export const KENNWORT_MINDESTLAENGE = 8;

/**
 * Ein neues Kennwort setzen, nach dem Verweis aus der E-Mail.
 *
 * ## Wie jemand hierherkommt
 *
 * Über den Verweis in der Wiederherstellungs-E-Mail. Der bringt einen Code im
 * Abfrageteil der Adresse mit (`?code=…`, PKCE), den der Supabase-Client beim
 * Start selbst gegen eine Sitzung eintauscht. Diese Seite wartet also nicht
 * auf ein Formular, sondern auf eine Sitzung, die schon unterwegs ist –
 * deshalb ist `laedt` hier ein eigener Zustand und nicht „nicht angemeldet“.
 *
 * ## Warum die Adresse danach aufgeräumt wird
 *
 * Der Code ist nach dem Eintausch verbraucht, steht aber weiter in der
 * Adresszeile – und damit im Verlauf, in jedem geteilten Screenshot und im
 * `Referer` der nächsten Anfrage. Ein `replaceState` kostet nichts und nimmt
 * ihn weg.
 */
export function NewPasswordPage() {
  const auth = useOptionalRepository('auth');
  const { status, role } = useSession();
  const navigate = useNavigate();
  const [kennwort, setKennwort] = useState('');
  const [wiederholung, setWiederholung] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fertig, setFertig] = useState(false);

  useEffect(() => {
    const aufgeraeumt = withoutAuthParams(window.location.href);
    if (aufgeraeumt !== window.location.href) {
      window.history.replaceState(null, '', aufgeraeumt);
    }
  }, []);

  async function absenden(event: FormEvent) {
    event.preventDefault();
    setFehler('');

    if (kennwort.length < KENNWORT_MINDESTLAENGE) {
      setFehler(`Das Kennwort braucht mindestens ${KENNWORT_MINDESTLAENGE} Zeichen.`);
      return;
    }
    if (kennwort !== wiederholung) {
      // Zwei Felder, weil ein Tippfehler hier niemandem auffiele – bis zur
      // nächsten Anmeldung, und dann ist der Verweis verbraucht.
      setFehler('Die beiden Eingaben sind nicht gleich.');
      return;
    }
    if (!auth) {
      setFehler('In dieser Fassung gibt es keine Anmeldung.');
      return;
    }

    setLaeuft(true);
    try {
      await auth.setPassword(kennwort);
      setFertig(true);
      setKennwort('');
      setWiederholung('');
    } catch (error) {
      setFehler(error instanceof Error ? error.message : 'Das Kennwort wurde nicht übernommen.');
    } finally {
      setLaeuft(false);
    }
  }

  if (status === 'laedt') {
    return <p className="muted">Der Verweis wird geprüft …</p>;
  }

  if (status !== 'angemeldet') {
    return (
      <div className="stack">
        <h1>Dieser Verweis gilt nicht mehr</h1>
        <Alert tone="warning" title="Abgelaufen oder schon benutzt">
          Wiederherstellungsverweise gelten nur kurz und nur einmal. Fordere einfach einen neuen an.
        </Alert>
        <p>
          <Link className="btn btn--primary" to="/wiederherstellen">
            Neuen Verweis anfordern
          </Link>
        </p>
      </div>
    );
  }

  if (fertig) {
    return (
      <div className="stack">
        <h1>Das Kennwort ist gesetzt</h1>
        <Alert tone="success">Du bist angemeldet. Ab jetzt gilt das neue Kennwort.</Alert>
        <Button variant="primary" onClick={() => navigate(role ? HOME_PER_ROLE[role] : '/')}>
          Weiter zu deinem Bereich
        </Button>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Neues Kennwort</h1>
      <Card>
        <form className="stack" onSubmit={absenden}>
          <Field
            label="Neues Kennwort"
            hint={`Mindestens ${KENNWORT_MINDESTLAENGE} Zeichen. Ein Satz, den du dir merken kannst, ist besser als ein kurzes Kunstwort.`}
          >
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="new-password"
                value={kennwort}
                onChange={(event) => setKennwort(event.target.value)}
                required
              />
            )}
          </Field>

          <Field label="Noch einmal">
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="new-password"
                value={wiederholung}
                onChange={(event) => setWiederholung(event.target.value)}
                required
              />
            )}
          </Field>

          {fehler ? <Alert tone="error">{fehler}</Alert> : null}

          <Button type="submit" variant="primary" disabled={laeuft}>
            {laeuft ? 'Einen Moment …' : 'Kennwort setzen'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default NewPasswordPage;
