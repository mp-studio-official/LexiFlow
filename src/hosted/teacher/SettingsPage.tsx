import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Field } from '../../ui/components';
import { mayEnter } from '../../runtime/access';
import { useOptionalRepository, useRuntimeMode } from '../../application/RepositoryContext';
import { useSession } from '../SessionContext';
import { useAbmelden } from '../PortalShell';

/**
 * Die Einstellungen der Lehrkraft.
 *
 * Das eigene Profil ist hier eine echte Einstellung: Anzeigename ändern und
 * Sitzung beenden. Daneben stehen ausschließlich Wege zu Dingen, die es
 * **gibt**: KI-Zugang, Datenschutz und für die Verwaltung Konten und Rollen.
 * Kein Platzhalter „kommt später" — eine Seite, die vier Dinge verspricht und
 * eines kann, ist schlechter als eine, die eines verspricht.
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
  const profile = useOptionalRepository('profile');
  const abmelden = useAbmelden();
  const [name, setName] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [meldung, setMeldung] = useState('');
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    let lebendig = true;
    if (!profile) {
      setLaedt(false);
      return () => {
        lebendig = false;
      };
    }
    void profile
      .myProfile()
      .then((eigenes) => {
        if (lebendig) setName(eigenes?.displayName ?? '');
      })
      .catch(() => {
        if (lebendig) setFehler('Dein Profil konnte nicht geladen werden.');
      })
      .finally(() => {
        if (lebendig) setLaedt(false);
      });
    return () => {
      lebendig = false;
    };
  }, [profile]);

  async function speichern() {
    if (!profile || name.trim().length === 0) return;
    setSpeichert(true);
    setMeldung('');
    setFehler('');
    try {
      const eigenes = await profile.updateDisplayName(name.trim());
      setName(eigenes.displayName);
      setMeldung('Dein Anzeigename ist gespeichert.');
    } catch {
      setFehler('Der Anzeigename konnte nicht gespeichert werden.');
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <div className="stack">
      <h1>Einstellungen</h1>

      <Card>
        <h2>Mein Konto</h2>
        <p>So spricht LexiFlow dich an. Du kannst den Namen jederzeit ändern.</p>
        {fehler ? <Alert tone="error">{fehler}</Alert> : null}
        {meldung ? <Alert tone="success">{meldung}</Alert> : null}
        {laedt ? (
          <p className="muted">Dein Profil wird geladen …</p>
        ) : (
          <Field label="Anzeigename" hint="Dieser Name erscheint in LexiFlow.">
            {(props) => (
              <input
                {...props}
                value={name}
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
        )}
        <div className="row">
          <Button
            variant="primary"
            disabled={laedt || speichert || name.trim().length === 0}
            onClick={() => void speichern()}
          >
            {speichert ? 'Wird gespeichert …' : 'Namen speichern'}
          </Button>
          {abmelden ? (
            <Button variant="quiet" onClick={abmelden.ausloesen}>
              Abmelden und Konto wechseln
            </Button>
          ) : null}
        </div>
      </Card>

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
