import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GrowingTextarea } from './GrowingTextarea';

/**
 * Was hier geprüft werden kann und was nicht.
 *
 * Die **Höhe** lässt sich in jsdom nicht prüfen: Dort gibt es kein Layout,
 * `scrollHeight` ist immer 0, und ein Test, der eine ausgerechnete Höhe
 * behauptete, würde eine Zahl prüfen, die im Browser ganz anders ausfällt. Was
 * hier steht, sind die Zusagen, die auch ohne Layout gelten – dass das Feld mit
 * einer Zeile beginnt, dass es sich normal bedienen lässt und dass es in einer
 * Umgebung ohne Layout **keine** unsinnige Höhe setzt.
 *
 * Dass es im Browser wirklich wächst, prüft `e2e/pack-handover.spec.ts`.
 */

describe('Das mitwachsende Textfeld', () => {
  it('beginnt mit einer Zeile', () => {
    render(<GrowingTextarea aria-label="Beschreibung" defaultValue="" />);
    expect(screen.getByLabelText('Beschreibung')).toHaveAttribute('rows', '1');
  });

  it('nimmt eine andere Untergrenze an, wo eine sinnvoll ist', () => {
    render(<GrowingTextarea aria-label="Text" minRows={4} defaultValue="" />);
    expect(screen.getByLabelText('Text')).toHaveAttribute('rows', '4');
  });

  it('reicht die Eingabe unverändert weiter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<GrowingTextarea aria-label="Beschreibung" defaultValue="" onChange={onChange} />);

    await user.type(screen.getByLabelText('Beschreibung'), 'Hallo');

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0] as { target: HTMLTextAreaElement };
    expect(last.target.value).toBe('Hallo');
  });

  it('setzt ohne Layout keine unsinnige Höhe', () => {
    /*
      Der Fehler, den diese Zeile verhindert: `height = scrollHeight + 'px'`
      ergibt in jsdom `height: 0px` – ein unsichtbares Feld. Im Browser stört
      das niemanden, in einer Testumgebung würde es jeden Test an diesem Feld
      scheitern lassen, und zwar aus einem Grund, der mit der Sache nichts zu
      tun hat.
    */
    render(<GrowingTextarea aria-label="Beschreibung" defaultValue="viel Text" />);
    const feld = screen.getByLabelText('Beschreibung') as HTMLTextAreaElement;
    expect(feld.style.height).not.toBe('0px');
  });

  it('behält die eigene Klasse neben der mitgegebenen', () => {
    render(<GrowingTextarea aria-label="Beschreibung" className="eigen" defaultValue="" />);
    const feld = screen.getByLabelText('Beschreibung');
    expect(feld).toHaveClass('growing');
    expect(feld).toHaveClass('eigen');
  });
});
