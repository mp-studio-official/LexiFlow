import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useRuntimeMode } from '../application/RepositoryContext';
import { AREA_LABELS, HOME_PER_ROLE, mayEnter, type Area } from '../runtime/access';
import type { Role } from '../application/repositories';
import { Alert } from '../ui/components';
import { HuelleDerRolle, useInHuelle } from './PortalShell';
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
 * ## Und der Satz steht in der eigenen Hülle
 *
 * Dieser Riegel steht an zwei Plätzen: **um** eine Hülle herum (Lern- und
 * Lehrkraftbereich) und **in** einer drin (die Verwaltung, die enger ist als
 * der Lehrkraftbereich um sie). Im ersten Fall ersetzte die Meldung bisher
 * die ganze Hülle: Eine lernende Person auf `/einstellungen` bekam eine
 * weiße Seite mit einem Satz darauf, ohne Navigation, ohne Marke, ohne
 * Abmelden — und hielt genau das für den Fehler, den der Satz vermeiden
 * wollte. Jetzt bringt die Meldung die Hülle **der tatsächlich angemeldeten
 * Rolle** mit; im zweiten Fall steht schon eine da, und dann bringt sie
 * keine mit. Welcher Fall vorliegt, sagt die Hülle selbst (`useInHuelle`)
 * und nicht ein Prop, das man an fünf Stellen von Hand setzt.
 *
 * Mehr Zugriff entsteht dadurch nicht. Die Entscheidung bleibt Zeile für
 * Zeile dieselbe `mayEnter`-Frage; nur die Absage sieht anders aus. Und der
 * geschützte Inhalt wird auf diesem Zweig gar nicht erst gerendert — die
 * Kinder stehen im `return` darüber und nirgendwo sonst.
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

  return <Absage area={area} role={role} />;
}

/**
 * Die Zugriffsmeldung — in der Hülle der Rolle, die wirklich angemeldet ist.
 *
 * Eigene Komponente und nicht zwei Zweige im Riegel, weil `useInHuelle` ein
 * Hook ist und über dem frühen `return` des Riegels stehen müsste. Dort
 * gelesen, wo er gebraucht wird, bleibt die Reihenfolge der Hooks
 * offensichtlich richtig statt nur zufällig.
 */
function Absage({ area, role }: { area: Area; role: Role }) {
  const inHuelle = useInHuelle();
  const meldung = (
    <Alert tone="info" title={`${AREA_LABELS[area]} – nicht für dieses Konto`}>
      Dieser Bereich gehört zu einer anderen Rolle. Dein Ausgangspunkt ist{' '}
      <a href={`#${HOME_PER_ROLE[role]}`}>{HOME_PER_ROLE[role]}</a>.
    </Alert>
  );
  if (inHuelle) return meldung;
  return <HuelleDerRolle rolle={role}>{meldung}</HuelleDerRolle>;
}
