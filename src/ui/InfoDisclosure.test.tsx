import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfoDisclosure } from './InfoDisclosure';

function renderDisclosure() {
  render(
    <div>
      <div className="card-head">
        <h2>Woher kommen die Vokabeln?</h2>
        <InfoDisclosure label="Hinweis zur Textverarbeitung" title="Verarbeitung auf diesem Gerät">
          <p>Der Text wird auf diesem Gerät verarbeitet und nicht übertragen.</p>
        </InfoDisclosure>
      </div>
      <button type="button">Woanders</button>
    </div>,
  );
  return screen.getByRole('button', { name: 'Hinweis zur Textverarbeitung' });
}

describe('Der Hinweis als kleines i', () => {
  it('trägt seinen Namen im aria-label, nicht als sichtbaren Text', () => {
    const toggle = renderDisclosure();
    // Sichtbar ist nur das Symbol – und das ist für die Hilfstechnik unsichtbar.
    expect(toggle).toHaveTextContent('i');
    expect(screen.getByText('i')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText('Was passiert mit meinem Text?')).not.toBeInTheDocument();
  });

  it('steht direkt hinter der Überschrift', () => {
    const toggle = renderDisclosure();
    const kopf = screen.getByRole('heading', { name: 'Woher kommen die Vokabeln?' }).parentElement;
    expect(kopf).toContainElement(toggle);
  });

  it('sagt vor dem Klick, dass etwas dahintersteckt', () => {
    const toggle = renderDisclosure();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls');
    expect(screen.queryByText(/nicht übertragen/)).not.toBeInTheDocument();
  });

  it('hält eine Klickfläche von mindestens 44 × 44 px vor', () => {
    /*
      Die Zielgröße gilt für die Fläche, nicht für das Gemalte. Der Kreis ist
      klein, der Knopf darum herum ist es nicht – sonst trifft ihn auf einem
      Telefon niemand zuverlässig.

      Geprüft wird die Rechenregel, nicht der gerenderte Pixelwert: jsdom rechnet
      kein Layout. `--tap-target` ist der Token, den auch der Rest der App für
      Mindestziele verwendet.
    */
    const toggle = renderDisclosure();
    expect(toggle).toHaveClass('info__button');
  });

  it('zeigt den Hinweis auf Klick und verbindet ihn mit der Schaltfläche', async () => {
    const toggle = renderDisclosure();
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('group', { name: 'Verarbeitung auf diesem Gerät' });
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

  it('schließt beim zweiten Klick auf das i', async () => {
    const toggle = renderDisclosure();
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/nicht übertragen/)).not.toBeInTheDocument();
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

  it('ist mit der Tastatur erreichbar und bedienbar', async () => {
    const toggle = renderDisclosure();
    toggle.focus();
    expect(toggle).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});
