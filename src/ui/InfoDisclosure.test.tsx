import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfoDisclosure } from './InfoDisclosure';

function renderDisclosure() {
  render(
    <div>
      <InfoDisclosure label="Was passiert mit meinem Text?" title="Verarbeitung auf dem Gerät">
        <p>Der Text wird auf diesem Gerät verarbeitet und nicht übertragen.</p>
      </InfoDisclosure>
      <button type="button">Woanders</button>
    </div>,
  );
  return screen.getByRole('button', { name: 'Was passiert mit meinem Text?' });
}

describe('Aufklappbarer Hinweis', () => {
  it('sagt vor dem Klick, dass etwas dahintersteckt', () => {
    const toggle = renderDisclosure();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls');
    expect(screen.queryByText(/nicht übertragen/)).not.toBeInTheDocument();
  });

  it('zeigt den Hinweis auf Klick und verbindet ihn mit der Schaltfläche', async () => {
    const toggle = renderDisclosure();
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('group', { name: 'Verarbeitung auf dem Gerät' });
    expect(panel).toHaveAttribute('id', toggle.getAttribute('aria-controls'));
    expect(panel).toHaveTextContent('nicht übertragen');
  });

  it('schließt mit Escape und gibt den Fokus zurück', async () => {
    /*
      Der entscheidende Test. Wer mit der Tastatur arbeitet, öffnet den Kasten,
      liest ihn und will weiter – ohne sich durch den Inhalt zurückzuhangeln.
    */
    const toggle = renderDisclosure();
    await userEvent.click(toggle);
    await userEvent.keyboard('{Escape}');

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('schließt beim Klick daneben, ohne den Fokus zurückzureißen', async () => {
    const toggle = renderDisclosure();
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name: 'Woanders' }));

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).not.toHaveFocus();
  });

  it('lässt sich über die eigene Schaltfläche wieder schließen', async () => {
    const toggle = renderDisclosure();
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });
});
