import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PackCard } from './PackCard';
import { Button, EmptyState } from './components';

/**
 * Sprint 3A: Das gemeinsame Kartenmuster und der gemeinsame Leerzustand.
 * Beide werden im Lehrkraft- wie im Schülerbereich verwendet.
 */

function renderCard(props: Partial<Parameters<typeof PackCard>[0]> = {}) {
  render(
    <MemoryRouter>
      <PackCard
        title="Unit 3 – City life"
        to="/material/pack-1"
        meta={['24 Vokabeln', 'Klasse 7', 'A2+']}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('Paketkarte', () => {
  it('macht den Titel zum Weg ins Paket', () => {
    renderCard();

    const heading = screen.getByRole('heading', { name: 'Unit 3 – City life' });
    const link = within(heading).getByRole('link', { name: 'Unit 3 – City life' });
    expect(link).toHaveAttribute('href', '/material/pack-1');
  });

  it('zeigt wenige, gezielte Metadaten', () => {
    renderCard();

    for (const item of ['24 Vokabeln', 'Klasse 7', 'A2+']) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
    // Kein Badge-Salat: Metadaten sind Text, keine Marker.
    expect(screen.queryByText('24 Vokabeln')).not.toHaveClass('badge');
  });

  it('lässt den Hinweis über dem Titel weg, wenn es keinen gibt', () => {
    renderCard();
    expect(screen.queryByText(/zum Üben bereit/)).not.toBeInTheDocument();

    renderCard({ flag: '5 Vokabeln zum Üben bereit' });
    expect(screen.getByText('5 Vokabeln zum Üben bereit')).toBeInTheDocument();
  });

  it('verschachtelt Aktionen nicht im Titel-Link', () => {
    renderCard({
      actions: (
        <>
          <Button small>Exportieren</Button>
          <Button small variant="danger">
            Löschen
          </Button>
        </>
      ),
    });

    const link = screen.getByRole('link', { name: 'Unit 3 – City life' });
    const exportButton = screen.getByRole('button', { name: 'Exportieren' });

    expect(link.contains(exportButton)).toBe(false);
    expect(exportButton.closest('a')).toBeNull();
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeInTheDocument();
  });

  it('nimmt zusätzlichen Inhalt zwischen Metadaten und Aktionen auf', () => {
    renderCard({ children: <p>0 von 24 sicher</p> });
    expect(screen.getByText('0 von 24 sicher')).toBeInTheDocument();
  });
});

describe('Leerzustand', () => {
  it('erklärt den ersten Schritt und bietet ihn an', () => {
    render(
      <MemoryRouter>
        <EmptyState title="Noch kein Material" action={<Button>Loslegen</Button>}>
          <p>So entsteht das erste Paket:</p>
        </EmptyState>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Noch kein Material' })).toBeInTheDocument();
    expect(screen.getByText('So entsteht das erste Paket:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loslegen' })).toBeInTheDocument();
  });

  it('kommt auch ohne Aktion aus', () => {
    render(<EmptyState title="Nichts da" />);
    expect(screen.getByRole('heading', { name: 'Nichts da' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
