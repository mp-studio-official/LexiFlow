import { Alert, Card } from '../../ui/components';
import { HOSTED_ENV_KEYS, describeHostedConfigProblem, type HostedConfigResult } from '../../runtime/hostedConfig';

/**
 * Was statt des Portals erscheint, wenn die Konfiguration fehlt.
 *
 * Das ist der Normalfall beim ersten Auschecken und beim ersten Deployment –
 * kein Fehler, sondern ein unfertiger Schritt. Eine weiße Seite oder ein
 * „Etwas ist schiefgelaufen“ würde jemanden in die Entwicklerkonsole zwingen;
 * diese Seite sagt, welche zwei Werte fehlen und wohin sie gehören.
 *
 * Sie zeigt **keine** Werte an, auch keine teilweise vorhandenen – siehe die
 * Prüfung in `hostedConfig.test.ts`.
 */
export function SetupPage({ result }: { result: HostedConfigResult }) {
  return (
    <div className="stack">
      <h1>LexiFlow ist noch nicht eingerichtet</h1>

      <Alert tone="warning" title="Zwei Werte fehlen oder stimmen nicht">
        {describeHostedConfigProblem(result)}
      </Alert>

      <Card quiet>
        <h2 style={{ marginTop: 0 }}>Die Vorlage</h2>
        <pre>
          <code>
            {`${HOSTED_ENV_KEYS.url}=https://<projekt>.supabase.co\n${HOSTED_ENV_KEYS.key}=<publishable key>`}
          </code>
        </pre>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Beide Werte dürfen öffentlich sein – sie stehen im ausgelieferten Bündel. Der geheime
          Schlüssel gehört <strong>nicht</strong> hierher, sondern ausschließlich in die Secrets der
          Funktionen.
        </p>
      </Card>

      <Card quiet>
        <h2 style={{ marginTop: 0 }}>Die portablen Dateien sind davon nicht betroffen</h2>
        <p style={{ marginBottom: 0 }}>
          Die Lehrkraftdatei und die Lerndateien brauchen keine Konfiguration – sie haben kein
          Backend und können auch keines bekommen.
        </p>
      </Card>
    </div>
  );
}

export default SetupPage;
