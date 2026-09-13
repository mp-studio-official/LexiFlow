import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useOptionalRepository, useRuntimeMode } from '../application/RepositoryContext';
import { roleForPortableMode } from '../runtime/access';
import type { Role, Session } from '../application/repositories';

/**
 * Wer hier gerade arbeitet – und ob das schon feststeht.
 *
 * ## Der dritte Zustand ist der wichtige
 *
 * `angemeldet` und `abgemeldet` sind offensichtlich. `laedt` ist der, den man
 * beim ersten Mal vergisst: Beim Aufruf einer Seite steht die Sitzung noch
 * nicht fest, weil sie aus dem Speicher gelesen werden muss. Wer diesen
 * Zustand mit „abgemeldet“ zusammenwirft, wirft jede angemeldete Person beim
 * Neuladen einmal auf die Anmeldeseite – und die Route, die sie eigentlich
 * öffnen wollte, ist dann weg.
 *
 * ## In portablen Dateien gibt es nichts zu laden
 *
 * Dort existiert kein `auth`-Repository. Die Rolle folgt aus der Gestalt der
 * Datei (`roleForPortableMode`), und der Zustand ist sofort endgültig. Das ist
 * kein Sonderfall im Code, sondern derselbe Code mit einem Repository weniger.
 */

export type SessionStatus = 'laedt' | 'angemeldet' | 'abgemeldet';

export interface SessionState {
  status: SessionStatus;
  session: Session | undefined;
  role: Role | undefined;
}

const SessionCtx = createContext<SessionState | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const auth = useOptionalRepository('auth');
  const mode = useRuntimeMode();
  const portableRole = roleForPortableMode(mode);

  const [session, setSession] = useState<Session | undefined>(undefined);
  const [geladen, setGeladen] = useState(auth === undefined);

  useEffect(() => {
    if (!auth) return;
    let aktiv = true;

    void auth.currentSession().then((gefunden) => {
      if (!aktiv) return;
      setSession(gefunden);
      setGeladen(true);
    });

    /*
      Auch auf spätere Änderungen hören: Läuft eine Sitzung ab, während jemand
      auf einer Kursseite steht, soll die Seite das sagen – nicht erst der
      nächste fehlschlagende Aufruf.
    */
    const abmelden = auth.onSessionChange((neue) => {
      if (!aktiv) return;
      setSession(neue);
      setGeladen(true);
    });

    return () => {
      aktiv = false;
      abmelden();
    };
  }, [auth]);

  const value = useMemo<SessionState>(() => {
    if (!auth) {
      return { status: portableRole ? 'angemeldet' : 'abgemeldet', session: undefined, role: portableRole };
    }
    if (!geladen) return { status: 'laedt', session: undefined, role: undefined };
    return {
      status: session ? 'angemeldet' : 'abgemeldet',
      session,
      role: session?.role,
    };
  }, [auth, geladen, portableRole, session]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionCtx);
  if (!value) throw new Error('Kein SessionProvider im Baum.');
  return value;
}
