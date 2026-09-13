import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { HOME_PER_ROLE } from '../../runtime/access';
import { Alert, Button, Card, Field } from '../../ui/components';
import { useSession } from '../SessionContext';
import { KENNWORT_MINDESTLAENGE } from './NewPasswordPage';

/**
 * Beitritt per Code – und, wenn nötig, das Konto gleich dazu.
 *
 * ## Warum diese Seite öffentlich ist
 *
 * Der Code wird an der Tafel vorgelesen. Wer ihn eintippt, hat in diesem
 * Moment meist noch kein Konto – und eine Anmeldeseite, auf der der Code
 * keinen Platz hat, ist der Punkt, an dem eine halbe Klasse aussteigt.
 *
 * Die Seite nimmt den Code deshalb **zuerst** entgegen und fragt danach, ob
 * schon ein Konto da ist.
 *
 * ## Ohne Code kein Konto
 *
 * Es gibt keine offene Registrierung. Ein Portal, in dem sich jede Person im
 * Netz ein Konto anlegen kann, wäre ein Einladungsdienst – und LexiFlow hat
 * nichts, was einen anonymen Zugang rechtfertigte.
 *
 * ## Der Code reist nicht in der Adresse
 *
 * Er steht im Router-State, nicht in der URL. Ein Einladungscode in der
 * Adresszeile landet im Verlauf, in jedem geteilten Screenshot und im
 * `Referer` der nächsten Anfrage.
 */

type Schritt = 'code' | 'wahl' | 'registrieren' | 'notieren';

export function JoinPage() {
  const invitations = useOptionalRepository('invitations');
  const auth = useOptionalRepository('auth');
  const { status } = useSession();
  const navigate = useNavigate();

  const [schritt, setSchritt] = useState<Schritt>('code');
  const [code, setCode] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [zugang, setZugang] = useState<{ learnerId: string; recoveryCode: string } | undefined>();

  async function codeAbsenden(event: FormEvent) {
    event.preventDefault();
    setFehler('');

    if (status === 'angemeldet') {
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
      return;
    }

    setSchritt('wahl');
  }

  if (schritt === 'notieren' && zugang) {
    return <ZugangNotieren zugang={zugang} />;
  }

  if (schritt === 'registrieren') {
    return (
      <Registrieren
        code={code}
        onZurueck={() => setSchritt('wahl')}
        onFertig={(neuerZugang) => {
          setZugang(neuerZugang);
          setSchritt('notieren');
        }}
      />
    );
  }

  if (schritt === 'wahl') {
    return (
      <div className="stack">
        <h1>Bist du neu hier?</h1>
        <Card>
          <h2 style={{ marginTop: 0 }}>Ich bin neu</h2>
          <p>Du bekommst eine Lern-ID und legst ein Kennwort fest.</p>
          <Button variant="primary" onClick={() => setSchritt('registrieren')}>
            Konto anlegen
          </Button>
        </Card>
        <Card quiet>
          <h2 style={{ marginTop: 0 }}>Ich habe schon ein Konto</h2>
          <p style={{ marginBottom: '0.6rem' }}>
            Dann melde dich an – danach wird der Code eingelöst.
          </p>
          <Button
            onClick={() => navigate('/anmelden', { state: { weiter: '/beitreten', code } })}
          >
            Anmelden
          </Button>
        </Card>
        <p className="small muted">
          <Button variant="quiet" small onClick={() => setSchritt('code')}>
            Zurück zum Code
          </Button>
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Mit Code beitreten</h1>
      <p className="lead">
        Der Code ist acht Zeichen lang. Groß- und Kleinschreibung spielt keine Rolle.
      </p>

      <Card>
        <form className="stack" onSubmit={codeAbsenden}>
          <Field label="Einladungscode" hint="Zum Beispiel: MTKQ3B7F">
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

          <Button type="submit" variant="primary" disabled={laeuft || !auth}>
            {laeuft ? 'Einen Moment …' : status === 'angemeldet' ? 'Beitreten' : 'Weiter'}
          </Button>
        </form>
      </Card>

      {status === 'angemeldet' ? null : (
        <p className="small muted">
          Schon ein Konto? <Link to="/anmelden">Direkt anmelden</Link>.
        </p>
      )}
    </div>
  );
}

function Registrieren({
  code,
  onZurueck,
  onFertig,
}: {
  code: string;
  onZurueck: () => void;
  onFertig: (zugang: { learnerId: string; recoveryCode: string }) => void;
}) {
  const auth = useOptionalRepository('auth');
  const [name, setName] = useState('');
  const [kennwort, setKennwort] = useState('');
  const [wiederholung, setWiederholung] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  async function absenden(event: FormEvent) {
    event.preventDefault();
    setFehler('');

    if (kennwort.length < KENNWORT_MINDESTLAENGE) {
      setFehler(`Das Kennwort braucht mindestens ${KENNWORT_MINDESTLAENGE} Zeichen.`);
      return;
    }
    if (kennwort !== wiederholung) {
      setFehler('Die beiden Eingaben sind nicht gleich.');
      return;
    }
    if (!auth) {
      setFehler('In dieser Fassung gibt es keine Anmeldung.');
      return;
    }

    setLaeuft(true);
    try {
      const ergebnis = await auth.registerWithInviteCode({
        inviteCode: code,
        displayName: name,
        password: kennwort,
      });
      onFertig({ learnerId: ergebnis.learnerId, recoveryCode: ergebnis.recoveryCode });
    } catch (error) {
      setFehler(error instanceof Error ? error.message : 'Dieser Code gilt nicht.');
    } finally {
      setLaeuft(false);
      setKennwort('');
      setWiederholung('');
    }
  }

  return (
    <div className="stack">
      <h1>Konto anlegen</h1>
      <Card>
        <form className="stack" onSubmit={absenden}>
          <Field
            label="Wie sollst du heißen?"
            hint="Ein Spitzname genügt. Deine Lehrkraft sieht diesen Namen."
          >
            {(props) => (
              <input
                {...props}
                type="text"
                autoComplete="nickname"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
              />
            )}
          </Field>

          <Field
            label="Kennwort"
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

          <Field label="Kennwort noch einmal">
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

          <div className="row">
            <Button type="submit" variant="primary" disabled={laeuft}>
              {laeuft ? 'Einen Moment …' : 'Konto anlegen'}
            </Button>
            <Button variant="quiet" onClick={onZurueck}>
              Zurück
            </Button>
          </div>
        </form>
      </Card>

      <p className="small muted">
        LexiFlow fragt keine E-Mail-Adresse ab – weder von dir noch von deinen Eltern.
      </p>
    </div>
  );
}

/**
 * Der Schritt, ohne den die Wiederherstellung nicht trägt.
 *
 * Der Code wird **abgeschrieben**, nicht angeklickt. Ein Häkchen „habe ich
 * notiert“ setzt man in zwei Sekunden, ohne etwas notiert zu haben; ein Code,
 * den man einmal abgetippt hat, liegt wenigstens irgendwo.
 */
function ZugangNotieren({ zugang }: { zugang: { learnerId: string; recoveryCode: string } }) {
  const auth = useOptionalRepository('auth');
  const { role } = useSession();
  const navigate = useNavigate();
  const [abschrift, setAbschrift] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  async function bestaetigen(event: FormEvent) {
    event.preventDefault();
    setFehler('');
    if (!auth) return;

    setLaeuft(true);
    try {
      const passt = await auth.confirmRecoveryCode(abschrift);
      if (!passt) {
        setFehler('Das ist nicht derselbe Code. Schau noch einmal genau hin.');
        return;
      }
      navigate(HOME_PER_ROLE[role ?? 'student'], { replace: true });
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="stack">
      <h1>Dein Zugang</h1>

      <Card>
        <h2 style={{ marginTop: 0 }}>Deine Lern-ID</h2>
        <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.2rem 0' }}>{zugang.learnerId}</p>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Damit meldest du dich an – zusammen mit deinem Kennwort.
        </p>
      </Card>

      <Alert tone="warning" title="Schreib diesen Code auf. Er kommt nie wieder." className="alert--decision">
        <p
          style={{
            fontSize: '1.8rem',
            letterSpacing: 'var(--tracking-eyebrow, 0.14em)',
            fontWeight: 700,
            margin: '0.4rem 0',
          }}
        >
          {zugang.recoveryCode}
        </p>
        <p style={{ margin: 0 }}>
          Wenn du dein Kennwort vergisst, kommst du <strong>nur</strong> damit wieder herein. Deine
          Lehrkraft kann dir kein neues Kennwort geben – und das ist Absicht: Sonst könnte sie sich
          als du anmelden.
        </p>
      </Alert>

      <Card>
        <form className="stack" onSubmit={bestaetigen}>
          <Field
            label="Tipp den Code hier noch einmal ein"
            hint="So ist sicher, dass du ihn wirklich hast."
          >
            {(props) => (
              <input
                {...props}
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={abschrift}
                onChange={(event) => setAbschrift(event.target.value)}
                required
              />
            )}
          </Field>

          {fehler ? <Alert tone="error">{fehler}</Alert> : null}

          <Button type="submit" variant="primary" disabled={laeuft}>
            {laeuft ? 'Einen Moment …' : 'Weiter zum Lernen'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default JoinPage;
