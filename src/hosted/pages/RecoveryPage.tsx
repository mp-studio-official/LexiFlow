import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { HOME_PER_ROLE } from '../../runtime/access';
import { Alert, Button, Card, Field } from '../../ui/components';
import { KENNWORT_MINDESTLAENGE } from './NewPasswordPage';

/**
 * Kennwort vergessen – zwei Wege, weil es zwei Arten von Konten gibt.
 *
 * ## Warum Lernende **nicht** zur Lehrkraft geschickt werden
 *
 * Der erste Entwurf dieser Seite tat genau das: „Wende dich an deine
 * Lehrkraft, sie gibt dir ein neues Kennwort.“ Das ist bequem und zerstört
 * die zentrale Zusage dieses Produkts. Wer ein fremdes Kennwort setzen kann,
 * kann sich als diese Person anmelden – und sieht dann ihren Lernstand. Für
 * die Datenbank **ist** er sie; sämtliche Zugriffsregeln aus Phase 2 wären
 * mit einem Klick umgangen, und niemand würde es bemerken.
 *
 * Deshalb: ein Wiederherstellungscode, der der lernenden Person gehört. Er
 * wird beim Anlegen des Kontos einmal angezeigt und bestätigt (ADR-5). Der
 * Preis ist ehrlich zu nennen: Wer Code **und** Kennwort verliert, verliert
 * das Konto. Das steht so auch auf der Seite.
 */
export function RecoveryPage() {
  return (
    <div className="stack">
      <h1>Kennwort vergessen</h1>
      <LernendeWiederherstellung />
      <LehrkraftWiederherstellung />
      <p className="small muted">
        <Link to="/anmelden">Zurück zur Anmeldung</Link>
      </p>
    </div>
  );
}

function LernendeWiederherstellung() {
  const auth = useOptionalRepository('auth');
  const navigate = useNavigate();
  const [learnerId, setLearnerId] = useState('');
  const [code, setCode] = useState('');
  const [kennwort, setKennwort] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  async function absenden(event: FormEvent) {
    event.preventDefault();
    setFehler('');

    if (kennwort.length < KENNWORT_MINDESTLAENGE) {
      setFehler(`Das neue Kennwort braucht mindestens ${KENNWORT_MINDESTLAENGE} Zeichen.`);
      return;
    }
    if (!auth) {
      setFehler('In dieser Fassung gibt es keine Anmeldung.');
      return;
    }

    setLaeuft(true);
    try {
      /*
        Code einlösen und neues Kennwort setzen in **einem** Schritt. Ein
        Zwischenzustand „Code stimmte, Kennwort noch offen“ wäre eine halb
        offene Tür.
      */
      const session = await auth.redeemRecoveryCode({
        learnerId,
        recoveryCode: code,
        newPassword: kennwort,
      });
      navigate(HOME_PER_ROLE[session.role], { replace: true });
    } catch (error) {
      setFehler(error instanceof Error ? error.message : 'Diese Angaben passen nicht zusammen.');
    } finally {
      setLaeuft(false);
      setKennwort('');
    }
  }

  return (
    <Card>
      <h2 style={{ marginTop: 0 }}>Wenn du lernst</h2>
      <p>
        Du hast beim Anlegen deines Kontos einen Wiederherstellungscode bekommen und bestätigt,
        dass du ihn hast. Mit ihm kommst du wieder herein.
      </p>

      <form className="stack" onSubmit={absenden}>
        <Field label="Lern-ID" hint="Keine E-Mail-Adresse – die Kennung von deiner Lehrkraft.">
          {(props) => (
            <input
              {...props}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={learnerId}
              onChange={(event) => setLearnerId(event.target.value)}
              required
            />
          )}
        </Field>

        <Field label="Wiederherstellungscode">
          {(props) => (
            <input
              {...props}
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          )}
        </Field>

        <Field label="Neues Kennwort" hint={`Mindestens ${KENNWORT_MINDESTLAENGE} Zeichen.`}>
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

        {fehler ? <Alert tone="error">{fehler}</Alert> : null}

        <Button type="submit" variant="primary" disabled={laeuft}>
          {laeuft ? 'Einen Moment …' : 'Neues Kennwort setzen'}
        </Button>
      </form>

      <Alert tone="warning" title="Wenn auch der Code weg ist" className="alert--decision">
        Dann lässt sich das Konto nicht wiederherstellen – auch nicht von deiner Lehrkraft und
        nicht von der Schule. Das ist keine Lücke, sondern die Kehrseite davon, dass niemand sonst
        in dein Konto kommt. Deine Lehrkraft kann dir ein neues Konto anlegen; der Lernstand des
        alten ist dann verloren.
      </Alert>
    </Card>
  );
}

function LehrkraftWiederherstellung() {
  const auth = useOptionalRepository('auth');
  const [email, setEmail] = useState('');
  const [gesendet, setGesendet] = useState(false);
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  async function absenden(event: FormEvent) {
    event.preventDefault();
    setFehler('');
    if (!auth) {
      setFehler('In dieser Fassung gibt es keine Anmeldung.');
      return;
    }

    setLaeuft(true);
    try {
      await auth.requestEmailRecovery(email);
      setGesendet(true);
    } catch {
      // Nur ein Netzfehler kann hier ankommen – ob es die Adresse gibt, sagt
      // die Schnittstelle absichtlich nicht.
      setFehler('Der Dienst ist gerade nicht erreichbar. Bitte später noch einmal.');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card quiet>
      <h2 style={{ marginTop: 0 }}>Wenn du unterrichtest</h2>
      {gesendet ? (
        <Alert tone="success" title="Wenn es ein Konto zu dieser Adresse gibt, ist die E-Mail unterwegs">
          {/*
            Die Formulierung ist Absicht. „Wir haben Ihnen eine E-Mail
            geschickt“ verriete, dass es das Konto gibt – und wer Adressen
            durchprobiert, hätte daraus ein Verzeichnis.
          */}
          Schau auch im Spam-Ordner nach. Der Verweis gilt nur kurz und nur einmal.
        </Alert>
      ) : (
        <form className="stack" onSubmit={absenden}>
          <Field label="E-Mail-Adresse" hint="Die Adresse, mit der das Konto angelegt wurde.">
            {(props) => (
              <input
                {...props}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            )}
          </Field>

          {fehler ? <Alert tone="error">{fehler}</Alert> : null}

          <Button type="submit" disabled={laeuft}>
            {laeuft ? 'Einen Moment …' : 'Wiederherstellung anfordern'}
          </Button>
        </form>
      )}
    </Card>
  );
}

export default RecoveryPage;
