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
    expect(screen.getByRole('button', { name: 'Empfehlungen generieren' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('button', { name: 'Text analysieren' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('macht erreichbare Schritte anklickbar', async () => {
    const onNavigate = renderStepper();
    await userEvent.click(screen.getByRole('button', { name: 'Text analysieren' }));
    expect(onNavigate).toHaveBeenCalledWith('text');
  });

  it('lässt einen noch nicht erreichbaren Schritt stehen, aber nicht anklicken', async () => {
    /*
      Ausblenden wäre die einfachere Lösung und die schlechtere: Der dritte
      Schritt ist der Grund, warum jemand die ersten beiden macht. Er bleibt
      sichtbar und sagt der Hilfstechnik, warum er nicht geht.
    */
    const onNavigate = renderStepper();
    const dritter = screen.getByRole('button', { name: /Prüfen & Speichern/ });
    expect(dritter).toBeDisabled();
    await userEvent.click(dritter);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(dritter).toHaveAccessibleName(/noch nicht erreichbar/);
  });

  it('nummeriert die Schritte, ohne die Beschriftung zu verwässern', () => {
    renderStepper();
    // Die Nummer ist für das Auge da; der zugängliche Name bleibt der Schritt.
    expect(screen.getByRole('button', { name: 'Text analysieren' })).toBeInTheDocument();
    expect(screen.getByText('1')).toHaveAttribute('aria-hidden', 'true');
  });

  it('steht in einer benannten Navigation', () => {
    renderStepper();
    expect(screen.getByRole('navigation', { name: 'Schritte' })).toBeInTheDocument();
  });
});
