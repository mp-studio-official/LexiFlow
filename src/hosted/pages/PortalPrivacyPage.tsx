import { Alert, Card } from '../../ui/components';
import { soloUrlFrom } from '../../runtime/entryUrls';

/**
 * Was das Portal speichert – und was nicht.
 *
 * ## Warum das eine eigene Seite ist
 *
 * Die kontofreie Anwendung hat schon eine Datenschutzseite
 * (`src/routes/PrivacyPage.tsx`), und der erste Entwurf hat sie hier einfach
 * mitbenutzt. Zwei Gründe sprechen dagegen, und beide wiegen:
 *
 * 1. **Sie stimmt hier nicht.** Dort steht „alles bleibt auf diesem Gerät“.
 *    Im Portal stimmt das nicht – hier liegt etwas auf einem Server, und eine
 *    Datenschutzseite, die das Gegenteil sagt, ist schlimmer als keine.
 *
 * 2. **Sie zog das Wörterbuch mit.** Über `DictionaryLicencePanel` hing an
 *    ihr der Wiktionary-Datensatz: 6,3 MB, die im Portalbündel nichts zu
 *    suchen haben. Aufgefallen ist das an der Bündelgröße, nicht am
 *    Nachdenken – weshalb `portableIsolation.test.ts` seit Phase 3 auch den
 *    Portal-Einstieg auf das Wörterbuch prüft.
 */
export function PortalPrivacyPage() {
  return (
    <div className="stack">
      <h1>Was hier gespeichert wird</h1>

      <Alert tone="info" title="Der Unterschied zur Datei-Fassung">
        Dieses Portal speichert auf einem Server. Die HTML-Dateien von LexiFlow tun das nicht – sie
        arbeiten vollständig auf dem eigenen Gerät. Beides gibt es, und beides ist vollwertig.
      </Alert>

      <Card>
        <h2 style={{ marginTop: 0 }}>Dein Lernstand gehört dir</h2>
        <p>
          Wie oft du geübt hast, was du richtig oder falsch hattest, wann du zuletzt dran warst –
          das sehen <strong>nur du selbst</strong>. Nicht deine Lehrkraft, nicht die Schule, nicht
          die Verwaltung dieses Portals.
        </p>
        <p style={{ marginBottom: 0 }}>
          Das ist keine Einstellung, die jemand umlegen könnte: In der Datenbank gibt es für den
          Lernstand anderer Menschen keine Abfrage, die etwas zurückgäbe. Die Regel dazu steht in
          den Zugriffsregeln der Datenbank und wird bei jeder Änderung geprüft.
        </p>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>Was deine Lehrkraft sieht</h2>
        <ul>
          <li>Deinen Anzeigenamen – den du selbst wählst. Ein Spitzname genügt.</li>
          <li>Eine kurze Kennung wie „LX-7390“, damit zwei gleiche Namen unterscheidbar sind.</li>
          <li>Dass du im Kurs bist, und seit wann.</li>
        </ul>
        <p style={{ marginBottom: 0 }}>Mehr nicht. Insbesondere keine Zahl über dein Üben.</p>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>Wenn du lernst: keine E-Mail-Adresse</h2>
        <p style={{ marginBottom: 0 }}>
          Für die Anmeldung brauchst du eine Lern-ID und ein Kennwort – keine E-Mail-Adresse.
          LexiFlow fragt sie nicht ab und speichert sie nicht. Was nicht erhoben wird, kann auch
          nicht verlorengehen.
        </p>
      </Card>

      <Card quiet>
        <h2 style={{ marginTop: 0 }}>Keine Werbung, keine Auswertung, keine Weitergabe</h2>
        <p style={{ marginBottom: 0 }}>
          LexiFlow bindet keine Werbenetzwerke ein, misst kein Verhalten und gibt nichts an Dritte
          weiter. Es gibt keine Analysewerkzeuge und keine Zählpixel.
        </p>
      </Card>

      <Card quiet>
        <h2 style={{ marginTop: 0 }}>Dein Konto gehört dir</h2>
        <p style={{ marginBottom: 0 }}>
          Du kannst deine Daten als Datei herunterladen und dein Konto löschen. Beim Löschen
          verschwinden dein Profil und dein Lernstand. Kursinhalte anderer bleiben bestehen – sie
          gehören nicht dir.
        </p>
      </Card>

      <p className="small muted">
        Ganz ohne Konto geht es auch: <a href={soloUrlFrom(import.meta.env.BASE_URL)}>LexiFlow ohne
        Anmeldung</a> läuft vollständig im Browser.
      </p>
    </div>
  );
}

export default PortalPrivacyPage;
