import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { COPYRIGHT_NOTICE, Copyright } from './Copyright';
import { AppShell } from './AppShell';
import { StudentShell } from '../portable/StudentShell';

/**
 * Der Vermerk „© OHM“ steht **unten**, und zwar überall.
 *
 * Drei Orte, an denen dieses Projekt eine Seite ausliefert: die Anwendung, die
 * portable Schülerdatei und das gedruckte Blatt. Das Blatt prüft
 * `PrintablePackView.test.tsx`, die Druckregel `styles/print.test.ts`; hier
 * stehen die beiden Hüllen.
 *
 * Geprüft wird am `textContent` und nicht mit `getByText`: Zwischen Zeichen
 * und Kürzel steht ein geschütztes Leerzeichen (U+00A0), und die Textsuche
 * normalisiert es zu einem gewöhnlichen. Der Test ginge dann auch durch, wenn
 * der Schutz fehlte – und der ist der einzige Grund, warum es die Konstante
 * gibt.
 */

function notice(): string | undefined {
  return document.querySelector('.copyright')?.textContent ?? undefined;
}

describe('Der Vermerk selbst', () => {
  it('trennt Zeichen und Kürzel mit einem geschützten Leerzeichen', () => {
    expect(COPYRIGHT_NOTICE).toBe('© OHM');
    expect(COPYRIGHT_NOTICE).not.toContain(' ');
  });

  it('schreibt das Kürzel groß', () => {
    expect(COPYRIGHT_NOTICE).toContain('OHM');
  });

  it('nimmt eine zusätzliche Klasse an, ohne die eigene zu verlieren', () => {
    render(<Copyright className="woanders" />);
    const element = document.querySelector('.copyright');
    expect(element).toHaveClass('copyright');
    expect(element).toHaveClass('woanders');
  });
});

describe('Er steht in beiden Hüllen', () => {
  it('in der Anwendung', () => {
    render(
      <MemoryRouter initialEntries={['/lernen']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/lernen" element={<h1>Lernen</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(notice()).toBe(COPYRIGHT_NOTICE);
  });

  it('in der portablen Schülerdatei', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<StudentShell title="Vokabeltrainer" storage="verfuegbar" />}>
            <Route path="/" element={<h1>Start</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(notice()).toBe(COPYRIGHT_NOTICE);
  });

  it('steht in der Fußzeile und nicht irgendwo im Inhalt', () => {
    /*
      „Immer unten“ ist die ganze Anforderung. Ein Vermerk, der in der Mitte
      der Seite auftaucht, weil jemand die Komponente an eine bequemere Stelle
      gehängt hat, erfüllt sie nicht.
    */
    render(
      <MemoryRouter initialEntries={['/lernen']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/lernen" element={<h1>Lernen</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const element = document.querySelector('.copyright');
    expect(element?.closest('footer')).not.toBeNull();
    expect(screen.getByRole('main').contains(element)).toBe(false);
  });
});
