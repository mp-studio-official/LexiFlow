import { Link } from 'react-router-dom';
import { Card } from '../../ui/components';
import { mayEnter } from '../../runtime/access';
import { useRuntimeMode } from '../../application/RepositoryContext';
import { useSession } from '../SessionContext';

/**
 * Die Einstellungen der Lehrkraft — ein Verzeichnis, keine neue Funktion.
 *
 * ## Was hier steht und warum nicht mehr
 *
 * Ausschließlich Wege zu Dingen, die es **gibt**: der KI-Zugang, die
 * Datenschutzseite, und für die Verwaltung der Einstieg zu Konten und Rollen.
 * Keine erfundene Einstellung, kein Platzhalter „kommt später" — eine Seite,
 * die vier Dinge verspricht und eines kann, ist schlechter als eine, die
 * eines verspricht.
 *
 * ## Warum es diese Seite jetzt gibt
 *
 * Wegen des Adminzugangs. E23 nimmt `#/verwaltung` aus der Navigation; der
 * neue Einstieg liegt hier. Gäbe es diese Seite nicht, bevor die Hülle
 * umschaltet, hätte eine Verwaltung nach dem Verlassen der Verwaltung keinen
 * regulären Weg zurück — der alte Navigationspunkt wäre weg, der neue noch
 * nicht da. Übrig bliebe die Adresszeile.
 *
 * ## Der Adminabschnitt wird nicht ausgegraut, sondern nicht gerendert
 *
 * Eine normale Lehrkraft findet hier nichts über Konten und Rollen — keinen
 * abgeblendeten Eintrag, keinen Hinweis, dass es ihn gibt. Ein gesperrter
 * Eintrag erzählt von einer Tür, und das ist eine Auskunft, die niemand
 * gegeben hat.
 *
 * Die Prüfung hier entscheidet **nichts** über den Zugang: `#/verwaltung`
 * bleibt hinter `RequireArea area="admin"`. Diese Seite blendet nur ein, was
 * ohnehin erreichbar wäre — wer das Gegenteil annimmt, hielte eine
 * Oberfläche für eine Sicherheitsgrenze.
 */
export function SettingsPage() {
  const { role } = useSession();
  const mode = useRuntimeMode();
  const istVerwaltung = mayEnter({ role, area: 'admin', mode });

  return (
    <div className="stack">
      <h1>Einstellungen</h1>

      <Card>
        <h2>KI-Zugang</h2>
        <p>
          Anbieter und Schlüssel für die Unterstützung beim Erstellen von Lernpaketen. Der
          Schlüssel bleibt auf dem Server.
        </p>
        <Link to="/ki">KI-Zugang öffnen</Link>
      </Card>

      <Card>
        <h2>Daten und Datenschutz</h2>
        <p>Was gespeichert wird, wo es liegt und was Lehrkräfte sehen — und was nicht.</p>
        <Link to="/datenschutz">Datenschutz öffnen</Link>
      </Card>

      {istVerwaltung ? (
        <Card>
          <h2>Konten und Rollen</h2>
          <p>
            Konten anlegen, Rollen vergeben, Zugänge entziehen. Auch hier gilt: keine Einsicht in
            individuelle Lernstände — die gibt es in keiner Rolle.
          </p>
          <Link to="/verwaltung">Konten und Rollen verwalten</Link>
        </Card>
      ) : null}
    </div>
  );
}
