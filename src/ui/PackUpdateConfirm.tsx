import { Alert, Button, Card } from './components';
import type { PendingPackUpdate } from './usePackImport';

/**
 * Bestätigung vor dem Überschreiben eines bereits vorhandenen Pakets.
 * Zeigt vorab, was mit den Lernständen geschieht.
 */
export function PackUpdateConfirm({
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: PendingPackUpdate;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { summary } = pending;

  return (
    <Card>
      <h2 style={{ fontSize: '1.05rem' }}>Dieses Paket ist bereits vorhanden</h2>
      <p>
        „{pending.existingTitle}“ liegt schon auf diesem Gerät. Beim Aktualisieren passiert
        Folgendes:
      </p>
      <ul>
        <li>
          <strong>{summary.kept}</strong> unveränderte{' '}
          {summary.kept === 1 ? 'Vokabel behält ihren' : 'Vokabeln behalten ihren'} Lernstand
        </li>
        <li>
          <strong>{summary.added}</strong> neue {summary.added === 1 ? 'Vokabel' : 'Vokabeln'}{' '}
          {summary.added === 1 ? 'kommt' : 'kommen'} hinzu
        </li>
        <li>
          <strong>{summary.changed}</strong> inhaltlich geänderte{' '}
          {summary.changed === 1 ? 'Vokabel wird' : 'Vokabeln werden'} im Lernstand zurückgesetzt
        </li>
        <li>
          <strong>{summary.removed}</strong> entfernte {summary.removed === 1 ? 'Vokabel' : 'Vokabeln'}{' '}
          {summary.removed === 1 ? 'verliert ihren' : 'verlieren ihren'} Lernstand
        </li>
      </ul>
      <Alert tone="info">
        Änderungen an Titel, Thema oder Beschreibung wirken sich nie auf Lernstände aus.
      </Alert>
      <div className="row" style={{ marginTop: '1rem' }}>
        <Button variant="primary" disabled={busy} onClick={onConfirm}>
          Paket aktualisieren
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </Card>
  );
}
