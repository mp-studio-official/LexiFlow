import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useRepository } from '../../application/RepositoryContext';
import { HOME_PER_ROLE } from '../../runtime/access';
import { Alert, Button, Card, Field } from '../../ui/components';

/**
 * Zwei Wege herein, und sie sind nicht dasselbe.
 *
 * Lehrkräfte melden sich mit einer E-Mail-Adresse an. Lernende **nie** – sie
 * haben eine Lern-ID (ADR-5). Der Grund ist nicht technisch: Eine
 * Schuladresse einer zwölfjährigen Person ist ein personenbezogenes Datum, das
 * dieses Produkt nicht braucht und deshalb nicht haben soll.
 *
 * Beide Wege stehen auf einer Seite, weil das der Moment ist, in dem sich
 * jemand fragt, wohin er gehört – und zwei getrennte Adressen diese Frage nur
 * verschieben würden.
 */

type Weg = 'lehrkraft' | 'lernend';

interface Ziel {
  weiter?: string;
}

export function LoginPage() {
  const auth = useRepository('auth');
  const navigate = useNavigate();
  const location = useLocation();
  const [weg, setWeg] = useState<Weg>('lernend');
  const [kennung, setKennung] = useState('');
  const [kennwort, setKennwort] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  /*
    Das Ziel aus dem Riegel (`RequireArea`) – wer einen Kurslink geöffnet hat,
    soll dort landen und nicht auf einer Startseite.
  */
  const ziel = (location.state as Ziel | null)?.weiter;

  async function absenden(event: FormEvent) {
    event.preventDefault();
    setFehler('');
    setLaeuft(true);
    try {
      const session =
        weg === 'lehrkraft'
          ? await auth.signInWithEmail(kennung, kennwort)
          : await auth.signInWithLearnerId(kennung, kennwort);
      navigate(ziel ?? HOME_PER_ROLE[session.role], { replace: true });
    } catch (error) {
      setFehler(error instanceof Error ? error.message : 'Anmeldung nicht möglich.');
    } finally {
      setLaeuft(false);
      setKennwort('');
    }
  }

  return (
    <div className="stack">
      <h1>Anmelden</h1>

      <div className="segmented" role="group" aria-label="Art der Anmeldung">
        <Button
          variant={weg === 'lernend' ? 'primary' : 'quiet'}
          aria-pressed={weg === 'lernend'}
          onClick={() => {
            setWeg('lernend');
            setFehler('');
          }}
        >
          Ich lerne
        </Button>
        <Button
          variant={weg === 'lehrkraft' ? 'primary' : 'quiet'}
          aria-pressed={weg === 'lehrkraft'}
          onClick={() => {
            setWeg('lehrkraft');
            setFehler('');
          }}
        >
          Ich unterrichte
        </Button>
      </div>

      <Card>
        <form className="stack" onSubmit={absenden}>
          <Field
            label={weg === 'lehrkraft' ? 'E-Mail-Adresse' : 'Lern-ID'}
            hint={
              weg === 'lehrkraft'
                ? 'Die Adresse, mit der das Konto angelegt wurde.'
                : 'Keine E-Mail-Adresse – die Lern-ID hast du von deiner Lehrkraft bekommen.'
            }
          >
            {(props) => (
              <input
                {...props}
                type={weg === 'lehrkraft' ? 'email' : 'text'}
                autoComplete={weg === 'lehrkraft' ? 'email' : 'username'}
                value={kennung}
                onChange={(event) => setKennung(event.target.value)}
                required
              />
            )}
          </Field>

          <Field label="Kennwort">
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="current-password"
                value={kennwort}
                onChange={(event) => setKennwort(event.target.value)}
                required
              />
            )}
          </Field>

          {fehler ? <Alert tone="error">{fehler}</Alert> : null}

          <Button type="submit" variant="primary" disabled={laeuft}>
            {laeuft ? 'Einen Moment …' : 'Anmelden'}
          </Button>
        </form>
      </Card>

      <p className="small muted">
        Kennwort vergessen? <Link to="/wiederherstellen">So geht es weiter</Link>. Noch kein
        Zugang, aber ein Code? <Link to="/beitreten">Mit Code beitreten</Link>.
      </p>
    </div>
  );
}

export default LoginPage;
