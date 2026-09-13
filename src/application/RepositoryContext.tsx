import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { RUNTIME_MODE, RUNTIME_MODE_LABELS, type RuntimeMode } from '../runtime/mode';
import type { Repositories, RepositoryName } from './repositories';

/**
 * Woher eine Ansicht ihre Speicher bekommt.
 *
 * ## Warum nicht einfach importieren
 *
 * Bisher importierte jede Ansicht `packRepo` direkt. Das war richtig, solange
 * es einen Speicher gab. Ab jetzt gibt es zwei, und der Unterschied ist nicht
 * nur technisch: Der eine liegt im Browser der lernenden Person, der andere in
 * einer Datenbank in Frankfurt. Welcher gemeint ist, entscheidet der Modus –
 * und ein Import kann das nicht ausdrücken.
 *
 * ## Warum das nicht auf `undefined` zurückfällt
 *
 * `useProviders` in `src/providers/ProviderContext.tsx` darf das: Ein fehlender
 * Übersetzungsanbieter ist eine fehlende Bequemlichkeit. Ein fehlendes
 * Repository ist eine fehlende Grundlage. Deshalb wirft `useRepository` –
 * mit einem Satz, der den Modus nennt, statt drei Ebenen später an einem
 * `cannot read property of undefined` zu enden.
 *
 * Wer damit rechnet, dass es etwas nicht gibt, fragt `useOptionalRepository`.
 * Das ist der Unterschied zwischen „hier fehlt etwas“ und „hier ist etwas
 * kaputt“, und er soll im Aufruf stehen.
 */

interface RepositoryScope {
  repositories: Repositories;
  mode: RuntimeMode;
}

const RepositoryContext = createContext<RepositoryScope | undefined>(undefined);

export function RepositoryProvider({
  children,
  value,
  mode = RUNTIME_MODE,
}: {
  children: ReactNode;
  value: Repositories;
  /** Nur für Tests: Der Modus bestimmt sonst schon beim Bauen, was es gibt. */
  mode?: RuntimeMode;
}) {
  const scope = useMemo<RepositoryScope>(() => ({ repositories: value, mode }), [value, mode]);
  return <RepositoryContext.Provider value={scope}>{children}</RepositoryContext.Provider>;
}

function useScope(): RepositoryScope {
  const scope = useContext(RepositoryContext);
  if (!scope) {
    throw new Error(
      'Kein RepositoryProvider im Baum. Jede Anwendung – auch eine Testumgebung – muss ihre Speicher bereitstellen.',
    );
  }
  return scope;
}

/** Der Modus, in dem diese Ansicht gerade läuft. */
export function useRuntimeMode(): RuntimeMode {
  return useScope().mode;
}

/**
 * Das Repository, ohne das diese Ansicht nicht arbeiten kann.
 *
 * Der Fehlertext nennt den Modus, weil das fast immer die Ursache ist: Eine
 * Ansicht mit Kursen wurde in eine Datei gerendert, die keine hat.
 */
export function useRepository<K extends RepositoryName>(name: K): NonNullable<Repositories[K]> {
  const { repositories, mode } = useScope();
  const repository = repositories[name];
  if (!repository) {
    throw new Error(
      `Diese Ansicht braucht „${name}“, aber im Modus „${RUNTIME_MODE_LABELS[mode]}“ gibt es das nicht.`,
    );
  }
  return repository as NonNullable<Repositories[K]>;
}

/** Dasselbe für Oberflächen, die sich anpassen, statt zu scheitern. */
export function useOptionalRepository<K extends RepositoryName>(name: K): Repositories[K] {
  return useScope().repositories[name];
}

/** Gibt es das hier? Für Navigationen, die einen Punkt weglassen sollen. */
export function useHasRepository(name: RepositoryName): boolean {
  return useScope().repositories[name] !== undefined;
}
