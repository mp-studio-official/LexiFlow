import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useRuntimeMode } from '../application/RepositoryContext';
import { AREA_LABELS, HOME_PER_ROLE, mayEnter, type Area } from '../runtime/access';
import { Alert } from '../ui/components';
import { useSession } from './SessionContext';

/**
 * Der Riegel vor einem Bereich.
 *
 * ## Drei Antworten, nicht zwei
 *
 * 1. **Noch unbekannt** – die Sitzung wird gelesen. Hier darf nichts
 *    entschieden werden; eine Weiterleitung wäre ein Fehlurteil.
 * 2. **Nicht angemeldet** – zur Anmeldung, und zwar *mit* dem Ziel im Gepäck.
 *    Wer einen Kurslink aus einer E-Mail öffnet, soll nach der Anmeldung im
 *    Kurs landen und nicht auf einer Startseite.
 * 3. **Angemeldet, aber falsch** – kein Weiterleiten. Eine lernende Person,
 *    die auf `/kurse` landet und wortlos zurückgeschoben wird, hält das für
 *    einen Fehler der Anwendung. Ein Satz, der sagt, was hier ist und wohin es
 *    stattdessen geht, ist ehrlicher.
 *
 * ## Und noch einmal: das ist keine Sicherheitsgrenze
 *
 * Dieser Riegel steht im Browser. Er sorgt für eine Oberfläche ohne
 * Sackgassen. Die Grenze, die zählt, zieht die Datenbank (Phase 2).
 */
export function RequireArea({ area, children }: { area: Area; children: ReactNode }) {
  const { status, role } = useSession();
  const mode = useRuntimeMode();
  const location = useLocation();

  if (status === 'laedt') {
    return <p className="muted">Einen Moment – die Anmeldung wird geprüft …</p>;
  }

  if (mayEnter({ role, area, mode })) return <>{children}</>;

  if (!role) {
    return (
      <Navigate
        to="/anmelden"
        replace
        state={{ weiter: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  return (
    <Alert tone="info" title={`${AREA_LABELS[area]} – nicht für dieses Konto`}>
      Dieser Bereich gehört zu einer anderen Rolle. Dein Ausgangspunkt ist{' '}
      <a href={`#${HOME_PER_ROLE[role]}`}>{HOME_PER_ROLE[role]}</a>.
    </Alert>
  );
}
