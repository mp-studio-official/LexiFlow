import { Link } from 'react-router-dom';
import { Card } from '../../ui/components';
import { useSession } from '../SessionContext';
import { HOME_PER_ROLE } from '../../runtime/access';

/**
 * Die erste Seite für jemanden ohne Konto.
 *
 * Sie verkauft nichts. Sie beantwortet die drei Fragen, mit denen jemand hier
 * ankommt: Was ist das, gehöre ich hier hin, und wo ist mein Code.
 */
export function LandingPage() {
  const { status, role } = useSession();

  return (
    <div className="stack">
      <h1>LexiFlow</h1>
      <p className="lead">
        Vokabeln üben – in der Schule, zu Hause, auf dem Handy. Ohne Werbung, ohne Auswertung,
        ohne dass jemand mitliest, wie oft du etwas falsch hattest.
      </p>

      {status === 'angemeldet' && role ? (
        <Card>
          <p style={{ marginTop: 0 }}>Du bist angemeldet.</p>
          <Link className="btn btn--primary" to={HOME_PER_ROLE[role]}>
            Weiter zu deinem Bereich
          </Link>
        </Card>
      ) : (
        <div className="stack">
          <Card>
            <h2 style={{ marginTop: 0 }}>Du hast einen Code bekommen</h2>
            <p>
              Dann gehörst du zu einer Lerngruppe. Der Code ist acht Zeichen lang und steht an der
              Tafel oder in der Nachricht deiner Lehrkraft.
            </p>
            <Link className="btn btn--primary" to="/beitreten">
              Mit Code beitreten
            </Link>
          </Card>

          <Card quiet>
            <h2 style={{ marginTop: 0 }}>Du hast schon ein Konto</h2>
            <p>
              <Link to="/anmelden">Anmelden</Link> – Lehrkräfte mit ihrer E-Mail-Adresse, Lernende
              mit ihrer Lern-ID.
            </p>
          </Card>
        </div>
      )}

      <Card quiet>
        <h2 style={{ marginTop: 0 }}>Es geht auch ganz ohne Konto</h2>
        <p style={{ marginBottom: 0 }}>
          LexiFlow gibt es weiterhin als einzelne HTML-Datei, die vollständig auf dem eigenen Gerät
          läuft. Wer sie benutzt, braucht dieses Portal nicht – und umgekehrt.
        </p>
      </Card>
    </div>
  );
}

export default LandingPage;
