import { useState } from 'react';
import { Alert, Button, Card } from '../ui/components';
import { clearAllLocalData } from '../data/db';
import { DictionaryLicencePanel } from './teacher/DictionaryLicencePanel';
import { THIRD_PARTY } from '../ui/thirdParty';

export function PrivacyPage() {
  const [status, setStatus] = useState<string>('');
  const [confirming, setConfirming] = useState(false);

  async function handleClear(): Promise<void> {
    await clearAllLocalData();
    setConfirming(false);
    setStatus('Alle lokal gespeicherten Pakete und Lernstände wurden gelöscht.');
  }

  return (
    <div className="stack" style={{ maxWidth: '46rem' }}>
      <h1>Daten &amp; Datenschutz</h1>

      <Card>
        <h2>Wo liegen die Daten?</h2>
        <p>
          Vokabelpakete und Lernstände werden ausschließlich in der lokalen Datenbank
          dieses Browsers gespeichert (IndexedDB). Sie werden nicht hochgeladen, nicht
          synchronisiert und nicht an Dritte übermittelt.
        </p>
        <p className="muted small">
          Wird der Browserspeicher geleert oder ein anderes Gerät verwendet, sind die
          Daten dort nicht vorhanden. Pakete lassen sich über die Exportfunktion als
          Datei sichern – Lernstände bewusst nicht.
        </p>
      </Card>

      <Card>
        <h2>Was Lehrkräfte sehen können</h2>
        <p>
          Nichts. Es gibt keine Konten, keine Anmeldung und keinen Rückkanal. Die App
          kann nicht erkennen, wer sie benutzt, wie lange geübt wurde oder welche
          Antworten gegeben wurden.
        </p>
      </Card>

      <Card>
        <h2>Netzwerk</h2>
        <p>
          Die App funktioniert vollständig offline. Es werden keine Schriftarten,
          Skripte oder Bilder von fremden Servern nachgeladen und keine
          Nutzungsstatistiken erhoben.
        </p>
      </Card>

      {/*
        Quelle und Lizenz des Wörterbuchs stehen dort, wo ohnehin steht, was mit
        Daten geschieht – und nicht in einer Fußnote, die niemand aufschlägt.
      */}
      <DictionaryLicencePanel />

      {/*
        Was mitgeliefert wird, steht dort, wo auch steht, was nicht geladen
        wird. „Keine fremden Requests“ und „fremder Code im Bündel“ sind zwei
        verschiedene Aussagen, und beide gehören auf dieselbe Seite – sonst
        klingt die erste nach mehr, als sie sagt.
      */}
      <Card>
        <h2>Mitgelieferte fremde Bestandteile</h2>
        <p className="muted small">
          Diese Bestandteile stecken <strong>in</strong> der Anwendung und werden mit ihr
          weitergegeben. Sie werden nicht nachgeladen – auch nicht beim PDF-Import.
        </p>
        <dl className="promises">
          {THIRD_PARTY.map((component) => (
            <div key={component.name}>
              <dt className="promises__term">
                {component.name} {component.version}
              </dt>
              <dd className="promises__text">
                {component.zweck}
                <br />
                <span className="muted small">
                  {component.urheber} · {component.lizenz} ·{' '}
                  <a href={component.url} rel="noreferrer">
                    Projektseite
                  </a>
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <h2>Lokale Daten löschen</h2>
        <p className="muted small">
          Entfernt alle Pakete und Lernstände aus diesem Browser. Das lässt sich nicht
          rückgängig machen.
        </p>
        {status ? <Alert tone="success">{status}</Alert> : null}
        {confirming ? (
          <div className="row" style={{ marginTop: '0.75rem' }}>
            <span>Wirklich alles löschen?</span>
            <Button variant="danger" onClick={() => void handleClear()}>
              Ja, endgültig löschen
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(false)}>
              Abbrechen
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Alle lokalen Daten löschen
          </Button>
        )}
      </Card>
    </div>
  );
}
