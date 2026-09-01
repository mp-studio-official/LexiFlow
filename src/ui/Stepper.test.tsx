import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Stepper, type StepperItem } from './Stepper';

type Id = 'text' | 'empfehlungen' | 'pruefen';

const STEPS: readonly StepperItem<Id>[] = [
  { id: 'text', label: 'Text analysieren', reachable: true },
  { id: 'empfehlungen', label: 'Empfehlungen generieren', reachable: true },
  { id: 'pruefen', label: 'Prüfen & Speichern', reachable: false },
];

function renderStepper(current: Id = 'empfehlungen', onNavigate = vi.fn()) {
  render(<Stepper steps={STEPS} current={current} onNavigate={onNavigate} />);
  return onNavigate;
}

describe('Schrittanzeiger', () => {
  it('nennt den aktuellen Schritt als solchen', () => {
    renderStepper();
    expect(screen.getByRole('button', { name: 'Schritt 2: Empfehlungen generieren' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('button', { name: 'Schritt 1: Text analysieren' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('macht erreichbare Schritte anklickbar', async () => {
    const onNavigate = renderStepper();
    await userEvent.click(screen.getByRole('button', { name: 'Schritt 1: Text analysieren' }));
    expect(onNavigate).toHaveBeenCalledWith('text');
  });

  it('lässt einen noch nicht erreichbaren Schritt stehen, aber nicht anklicken', async () => {
    /*
      Ausblenden wäre die einfachere Lösung und die schlechtere: Der dritte
      Schritt ist der Grund, warum jemand die ersten beiden macht. Er bleibt
      sichtbar und sagt der Hilfstechnik, warum er nicht geht.
    */
    const onNavigate = renderStepper();
    const dritter = screen.getByRole('button', { name: /Schritt 3: Prüfen & Speichern/ });
    expect(dritter).toBeDisabled();
    await userEvent.click(dritter);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(dritter).toHaveAccessibleName(/noch nicht erreichbar/);
  });

  it('nummeriert die Schritte auch für die Hilfstechnik', () => {
    /*
      Der Schritt heißt genauso wie seine Hauptaktion – „Text analysieren“
      steht als Stepper-Knopf und als Schaltfläche im Schritt. Die Nummer im
      zugänglichen Namen hält beides auseinander, ohne die sichtbare
      Beschriftung zu verlängern.
    */
    renderStepper();
    expect(screen.getByRole('button', { name: 'Schritt 1: Text analysieren' })).toBeInTheDocument();
    expect(screen.getByText('Text analysieren')).toBeInTheDocument();
    expect(screen.getByText('1')).toHaveAttribute('aria-hidden', 'true');
  });

  it('steht in einer benannten Navigation', () => {
    renderStepper();
    expect(screen.getByRole('navigation', { name: 'Schritte' })).toBeInTheDocument();
  });
});

describe('Der Zustand hängt nicht an der Farbe', () => {
  it('nennt den aktuellen Schritt auch ohne Farbe', () => {
    /*
      WCAG 1.4.1: Farbe darf nicht das einzige Merkmal sein. Der aktuelle
      Schritt trägt `aria-current`, eine gefüllte Nummer und einen Marker unter
      der Beschriftung – drei Signale, von denen nur eines farbig ist.
    */
    renderStepper();
    const aktuell = screen.getByRole('button', { name: 'Schritt 2: Empfehlungen generieren' });
    expect(aktuell).toHaveAttribute('aria-current', 'step');
    // Und der gesperrte Schritt sagt es im Namen, nicht über die Farbe.
    expect(screen.getByRole('button', { name: /Schritt 3/ })).toHaveAccessibleName(
      /noch nicht erreichbar/,
    );
  });

  it('trägt die Schrittnummer im Namen, nicht nur im Bild', () => {
    renderStepper();
    for (const [index, step] of STEPS.entries()) {
      expect(
        screen.getByRole('button', { name: new RegExp(`^Schritt ${index + 1}: ${step.label}`) }),
      ).toBeInTheDocument();
    }
  });

  it('lässt sich vollständig mit der Tastatur bedienen', async () => {
    const onNavigate = vi.fn();
    render(<Stepper steps={STEPS} current="empfehlungen" onNavigate={onNavigate} />);

    const erster = screen.getByRole('button', { name: 'Schritt 1: Text analysieren' });
    erster.focus();
    expect(erster).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledWith('text');

    // Ein gesperrter Schritt nimmt den Fokus gar nicht erst an.
    await userEvent.tab();
    expect(screen.getByRole('button', { name: /Schritt 3/ })).not.toHaveFocus();
  });
});
