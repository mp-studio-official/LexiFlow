import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SplitPane } from './SplitPane';

/**
 * Sprint 4B.3: Der Griff zwischen Quelle und Ergebnis.
 *
 * Was hier geprüft wird, ist **nicht** das Ziehen mit der Maus – jsdom rechnet
 * kein Layout, `getBoundingClientRect()` liefert überall Nullen, und ein Test
 * darauf würde eine Zahl prüfen, die im Browser ganz anders ausfällt. Das
 * Ziehen gehört in den E2E-Lauf.
 *
 * Prüfbar und wichtiger ist das andere: dass der Griff **ohne Maus**
 * vollständig bedienbar ist und dabei sagt, was er tut. Das ist die Hälfte, die
 * beim Nachbauen eines Entwurfs regelmäßig verlorengeht.
 */

function setup(props: Partial<Parameters<typeof SplitPane>[0]> = {}) {
  render(
    <SplitPane source={<p>Die Quelle</p>} {...props}>
      <p>Das Ergebnis</p>
    </SplitPane>,
  );
  return userEvent.setup();
}

function grip(): HTMLElement {
  return screen.getByRole('separator', { name: 'Breite der Quellspalte' });
}

describe('Werkbank', () => {
  it('zeigt beide Spalten', () => {
    setup();
    expect(screen.getByText('Die Quelle')).toBeInTheDocument();
    expect(screen.getByText('Das Ergebnis')).toBeInTheDocument();
  });

  it('sagt als Trenner, wo er steht und wie weit er kann', () => {
    setup({ initialWidth: 21, minWidth: 15, maxWidth: 38 });

    const separator = grip();
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('aria-valuenow', '21');
    expect(separator).toHaveAttribute('aria-valuemin', '15');
    expect(separator).toHaveAttribute('aria-valuemax', '38');
  });

  it('ist mit der Tastatur erreichbar', async () => {
    const user = setup();
    await user.tab();
    // Vor dem Griff liegt nur Text, kein Bedienelement.
    expect(grip()).toHaveFocus();
  });

  it('verstellt die Breite mit den Pfeiltasten', async () => {
    const user = setup({ initialWidth: 21 });
    grip().focus();

    await user.keyboard('{ArrowRight}');
    expect(grip()).toHaveAttribute('aria-valuenow', '22');

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(grip()).toHaveAttribute('aria-valuenow', '20');
  });

  it('geht mit Umschalt in größeren Schritten', async () => {
    const user = setup({ initialWidth: 21 });
    grip().focus();

    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(grip()).toHaveAttribute('aria-valuenow', '25');
  });

  it('springt mit Pos1 und Ende an die Grenzen', async () => {
    const user = setup({ initialWidth: 21, minWidth: 15, maxWidth: 38 });
    grip().focus();

    await user.keyboard('{End}');
    expect(grip()).toHaveAttribute('aria-valuenow', '38');

    await user.keyboard('{Home}');
    expect(grip()).toHaveAttribute('aria-valuenow', '15');
  });

  it('läuft nicht über die Grenzen hinaus', async () => {
    const user = setup({ initialWidth: 16, minWidth: 15, maxWidth: 17 });
    grip().focus();

    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(grip()).toHaveAttribute('aria-valuenow', '15');

    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(grip()).toHaveAttribute('aria-valuenow', '17');
  });

  it('schreibt die Breite als benutzerdefinierte Eigenschaft ins Markup', async () => {
    /*
      Die Breite steht in `--split-width` und nicht in `grid-template-columns`:
      So bleibt das Raster im Stylesheet – mit allem, was dort noch dranhängt,
      etwa dem Umbruch auf schmalen Fenstern – und der Inline-Stil trägt nur
      die eine Zahl, die wirklich vom Zustand abhängt.
    */
    const user = setup({ initialWidth: 21 });
    const frame = grip().parentElement as HTMLElement;
    expect(frame.style.getPropertyValue('--split-width')).toBe('21rem');

    grip().focus();
    await user.keyboard('{ArrowRight}');
    expect(frame.style.getPropertyValue('--split-width')).toBe('22rem');
  });
});
