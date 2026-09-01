import { useState } from 'react';
import { Alert, Button, Card } from '../ui/components';
import { clearAllLocalData } from '../data/db';
import { DictionaryLicencePanel } from './teacher/DictionaryLicencePanel';

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
