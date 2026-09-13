import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  RepositoryProvider,
  useHasRepository,
  useOptionalRepository,
  useRepository,
  useRuntimeMode,
} from './RepositoryContext';
import { createLocalRepositories } from './localRepositories';
import { createFakeCloud } from './fakeCloudRepositories';
import type { RepositoryName } from './repositories';

/**
 * Der Kern dieser Prüfungen ist nicht, dass React-Context funktioniert.
 *
 * Es ist, dass eine Ansicht, die etwas verlangt, das es in ihrem Modus nicht
 * gibt, **laut** scheitert – mit einem Satz, der den Modus nennt. Der stille
 * Fall (`undefined` weiterreichen) ist der, der drei Ebenen später als
 * unverständlicher Absturz ankommt.
 */

function Fragt({ name }: { name: RepositoryName }) {
  const repository = useRepository(name);
  return <p>gefunden: {typeof repository}</p>;
}

function FragtHöflich({ name }: { name: RepositoryName }) {
  const repository = useOptionalRepository(name);
  const vorhanden = useHasRepository(name);
  return (
    <p>
      {vorhanden ? 'vorhanden' : 'fehlt'} – {repository === undefined ? 'undefined' : 'objekt'}
    </p>
  );
}

function ZeigtModus() {
  return <p>Modus: {useRuntimeMode()}</p>;
}

describe('ohne Provider', () => {
  it('wirft, statt einen Standard zu erfinden', () => {
    // `useProviders` darf zurückfallen – ein fehlender Übersetzungsanbieter ist
    // eine fehlende Bequemlichkeit. Ein fehlender Speicher ist es nicht.
    expect(() => render(<Fragt name="packs" />)).toThrow(/RepositoryProvider/);
  });
});

describe('lokale Speicher', () => {
  it('stellen Pakete und Lernstände bereit', () => {
    render(
      <RepositoryProvider value={createLocalRepositories()} mode="portable-learner">
        <Fragt name="packs" />
      </RepositoryProvider>,
    );
    expect(screen.getByText(/gefunden: object/)).toBeInTheDocument();
  });

  it('kennen weder Anmeldung noch Kurse – und sagen das im Fehlertext', () => {
    expect(() =>
      render(
        <RepositoryProvider value={createLocalRepositories()} mode="portable-learner">
          <Fragt name="courses" />
        </RepositoryProvider>,
      ),
    ).toThrow(/Lerndatei/);
  });

  it('lassen sich höflich fragen, ohne zu scheitern', () => {
    render(
      <RepositoryProvider value={createLocalRepositories()} mode="portable-teacher">
        <FragtHöflich name="auth" />
      </RepositoryProvider>,
    );
    expect(screen.getByText(/fehlt – undefined/)).toBeInTheDocument();
  });

  it('enthalten kein KI-Gateway', () => {
    // Eine portable Datei darf nicht ins Netz. Ein Gateway, das dort
    // „nur“ ungenutzt läge, wäre trotzdem der Anfang vom Gegenteil.
    const speicher = createLocalRepositories();
    expect(speicher.ai).toBeUndefined();
    expect(speicher.auth).toBeUndefined();
    expect(speicher.courses).toBeUndefined();
    expect(speicher.invitations).toBeUndefined();
    expect(speicher.publication).toBeUndefined();
  });
});

describe('die kontrollierte Cloudfassung', () => {
  it('stellt Anmeldung und Kurse bereit', () => {
    render(
      <RepositoryProvider value={createFakeCloud().repositories} mode="hosted">
        <Fragt name="courses" />
      </RepositoryProvider>,
    );
    expect(screen.getByText(/gefunden: object/)).toBeInTheDocument();
  });

  it('hat noch kein KI-Gateway – Phase 7', () => {
    expect(createFakeCloud().repositories.ai).toBeUndefined();
  });
});

describe('der Modus', () => {
  it('kommt aus dem Provider und ist für Ansichten lesbar', () => {
    render(
      <RepositoryProvider value={{}} mode="portable-teacher">
        <ZeigtModus />
      </RepositoryProvider>,
    );
    expect(screen.getByText('Modus: portable-teacher')).toBeInTheDocument();
  });
});
