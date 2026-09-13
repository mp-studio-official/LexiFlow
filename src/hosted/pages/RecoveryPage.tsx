import { Link } from 'react-router-dom';
import { Alert, Card } from '../../ui/components';

/**
 * Kennwort vergessen – zwei Wege, weil es zwei Arten von Konten gibt.
 *
 * ## Warum hier heute nur Text steht
 *
 * Die Wiederherstellung selbst entsteht in Phase 3 (Anmeldung). Diese Seite
 * gibt es trotzdem schon, weil die Anmeldeseite auf sie verweist und ein
 * toter Verweis schlimmer ist als eine ehrliche Auskunft.
 *
 * Sie verspricht nichts, was nicht passiert: Es steht kein Formular darauf,
 * das eine E-Mail verschickt, die niemand verschickt.
 */
export function RecoveryPage() {
  return (
    <div className="stack">
      <h1>Kennwort vergessen</h1>

      <Alert tone="info" title="Noch nicht eingerichtet">
        Die Wiederherstellung wird gerade gebaut. Bis dahin hilft der Weg unten – er funktioniert
        ohne diese Seite.
      </Alert>

      <Card>
        <h2 style={{ marginTop: 0 }}>Wenn du lernst</h2>
        <p>
          Wende dich an deine Lehrkraft. Sie kann dir ein neues Kennwort geben, das nur einmal
          gilt und beim nächsten Anmelden geändert wird.
        </p>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Es gibt bewusst keinen E-Mail-Weg für Lernende: LexiFlow kennt deine E-Mail-Adresse
          nicht und soll sie auch nicht kennen.
        </p>
      </Card>

      <Card quiet>
        <h2 style={{ marginTop: 0 }}>Wenn du unterrichtest</h2>
        <p style={{ marginBottom: 0 }}>
          Die Wiederherstellung läuft über die E-Mail-Adresse des Kontos. Solange das noch nicht
          eingerichtet ist, hilft die Person weiter, die das Portal betreut.
        </p>
      </Card>

      <p className="small muted">
        <Link to="/anmelden">Zurück zur Anmeldung</Link>
      </p>
    </div>
  );
}

export default RecoveryPage;
