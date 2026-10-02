import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

/**
 * Der eine Durchgang, durch den jedes Verlassen geht — E14.
 *
 * ## Warum es diesen Umweg gibt
 *
 * „Runde beenden" steht im Inhalt, „Abmelden" in der Hülle. Beide verlassen
 * dieselbe Runde, und beide müssten dieselbe Frage stellen. Baute sie jeder
 * für sich, gäbe es zwei Antworten auf dieselbe Frage — und die zweite fiele
 * erst auf, wenn jemand sich mitten im Tippen abmeldet und seine Eingabe
 * stillschweigend verliert.
 *
 * Deshalb meldet die Runde **eine** Wache an, und alle Ausgänge fragen sie.
 * Wer nichts angemeldet hat, bekommt „ja, geh" — das ist der Normalfall
 * überall außerhalb einer Runde.
 *
 * ## Was hier **nicht** entschieden wird
 *
 * Ob etwas verloren ginge. Das steht in `src/domain/rundenverlust.ts`, rein
 * und ohne Oberfläche. Hier steht nur, **wen** man fragt.
 */

/** Darf gegangen werden? `false` heißt: Die Person hat „Hierbleiben" gewählt. */
type Wache = () => Promise<boolean>;

/**
 * Die Antwort des Durchgangs — **`true` oder ein Versprechen**, nie beides.
 *
 * Ist keine Wache angemeldet, ist die Antwort `true`, und zwar *sofort*: kein
 * `await`, kein Mikrotask. Das ist kein Mikro-Optimieren, sondern nötig.
 * Abmelden verlässt einen geschützten Bereich; wird die Sitzung beendet,
 * während die Seite noch dort steht, schickt `RequireArea` einen zur
 * Anmeldung. Ein einziger Mikrotask zwischen Klick und Weiterleitung reicht,
 * damit das passiert — und man landet nach dem Abmelden auf „Anmelden" statt
 * auf der Startseite.
 *
 * Entschieden wird trotzdem nur an einer Stelle; der Aufrufer unterscheidet
 * nicht *ob* er darf, sondern nur, ob er schon eine Antwort hat.
 */
type Antwort = true | Promise<boolean>;

interface Schutz {
  /** Die Runde meldet ihre Wache an; die Rückgabe meldet sie wieder ab. */
  anmelden: (wache: Wache) => () => void;
  /** Jeder Ausgang fragt hier, bevor er geht. */
  darfVerlassen: () => Antwort;
}

const SchutzContext = createContext<Schutz | undefined>(undefined);

export function VerlassenSchutzProvider({ children }: { children: ReactNode }) {
  const wache = useRef<Wache | undefined>(undefined);

  const anmelden = useCallback((neue: Wache) => {
    wache.current = neue;
    return () => {
      /*
        Nur abmelden, wenn es noch die eigene ist: Beim Wechsel von einer
        Runde zur nächsten läuft das Anmelden der neuen vor dem Aufräumen der
        alten, und ein blindes `undefined` löschte die neue gleich wieder.
      */
      if (wache.current === neue) wache.current = undefined;
    };
  }, []);

  const darfVerlassen = useCallback((): Antwort => {
    const aktuelle = wache.current;
    return aktuelle ? aktuelle() : true;
  }, []);

  const wert = useMemo(() => ({ anmelden, darfVerlassen }), [anmelden, darfVerlassen]);
  return <SchutzContext.Provider value={wert}>{children}</SchutzContext.Provider>;
}

/**
 * Für die Ausgänge: fragen, bevor man geht.
 *
 * Ohne Provider — etwa in einem Test, der nur eine Seite rendert — gibt es
 * nichts zu schützen, und die Antwort ist „ja". Ein Fehler wäre hier falsch:
 * Er machte das Abmelden kaputt, um auf einen fehlenden Schutz hinzuweisen.
 */
export function useDarfVerlassen(): () => Antwort {
  const schutz = useContext(SchutzContext);
  return useCallback((): Antwort => (schutz ? schutz.darfVerlassen() : true), [schutz]);
}

/**
 * Der Ausgang in einer Zeile: fragen, und gehen, sobald man darf.
 *
 * Damit steht die Fallunterscheidung „schon entschieden oder noch nicht"
 * genau einmal im Projekt — nicht bei jedem Ausgang neu.
 */
export function gehenWenn(antwort: Antwort, gehen: () => void): void {
  if (antwort === true) {
    gehen();
    return;
  }
  void antwort.then((darf) => {
    if (darf) gehen();
  });
}

/**
 * Für die Runde: die Wache anmelden, solange etwas zu verlieren ist.
 *
 * `verlust` entscheidet, ob überhaupt gefragt wird — ohne Verlust geht jeder
 * Ausgang sofort durch, auch dieser. `frage` öffnet die Rückfrage und löst
 * auf, wenn die Person entschieden hat.
 */
export function useVerlassenWache(verlust: boolean, frage: () => Promise<boolean>): void {
  const schutz = useContext(SchutzContext);
  const frageRef = useRef(frage);
  frageRef.current = frage;

  useEffect(() => {
    if (!schutz) return;
    return schutz.anmelden(async () => (verlust ? frageRef.current() : true));
  }, [schutz, verlust]);
}

/**
 * Der Schutz gegen Wege, die der Router nicht sieht.
 *
 * **Neuladen und Schließen** gehen über `beforeunload`. Der Browser zeigt
 * dort seinen eigenen Text; das ist nicht zu ändern und auch nicht schlimm —
 * wichtig ist, dass er **nur** im Verlustfall erscheint. Ein dauerhaft
 * angemeldeter Handler fragt bei jedem Schließen, und das ist die Art von
 * Warnung, die man wegklickt.
 *
 * **Browser-Zurück** geht über `popstate`. Dort gibt es kein „abbrechen":
 * Der Schritt ist schon passiert, wenn das Ereignis kommt. Also wird er
 * rückgängig gemacht (`pushState`) und die Rückfrage geöffnet; sagt die
 * Person „beenden", geht der Ausgang den regulären Weg.
 */
export function useAussenschutz(verlust: boolean, frage: () => Promise<boolean>, verlassen: () => void): void {
  const frageRef = useRef(frage);
  frageRef.current = frage;
  const verlassenRef = useRef(verlassen);
  verlassenRef.current = verlassen;

  useEffect(() => {
    if (!verlust) return;

    function beiEntladen(ereignis: BeforeUnloadEvent) {
      ereignis.preventDefault();
      /* Ältere Browser brauchen den Rückgabewert, neuere ignorieren ihn. */
      ereignis.returnValue = '';
    }

    function beiZurueck() {
      /* Den Schritt zurücknehmen, bevor gefragt wird – sonst steht man schon woanders. */
      window.history.pushState(null, '', window.location.href);
      void frageRef.current().then((darf) => {
        if (darf) verlassenRef.current();
      });
    }

    window.history.pushState(null, '', window.location.href);
    window.addEventListener('beforeunload', beiEntladen);
    window.addEventListener('popstate', beiZurueck);
    return () => {
      window.removeEventListener('beforeunload', beiEntladen);
      window.removeEventListener('popstate', beiZurueck);
    };
  }, [verlust]);
}

/** Nur für Tests: ob gerade eine Wache angemeldet ist. */
export function useSchutzVorhanden(): boolean {
  return useContext(SchutzContext) !== undefined;
}

export { SchutzContext };
