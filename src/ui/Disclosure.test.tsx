import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Disclosure } from './Disclosure';

/**
 * Der Aufklapper trägt in 4B.2 die Hinweise, die vorher als große Kästen über
 * den Ergebnissen standen. Damit hängt an ihm eine Zusage: **Zugeklappt heißt
 * zugeklappt** – auch für eine Vorlesehilfe. Ein Hinweis, der zwar unsichtbar
 * ist, aber trotzdem vorgelesen wird, wäre schlechter als der große Kasten
 * vorher, weil er dann nur noch für Sehende verschwindet.
 */

describe('Der Aufklapper', () => {
  it('ist zu und sagt das auch', () => {
    render(
      <Disclosure summary="Frühere Empfehlungen" count={4}>
        <p>Ersetzt oder entfernt – aber nicht verloren.</p>
      </Disclosure>,
    );

    const knopf = screen.getByRole('button', { name: 'Frühere Empfehlungen (4)' });
    expect(knopf).toHaveAttribute('aria-expanded', 'false');
    expect(knopf).toHaveAttribute('aria-controls');
    expect(screen.queryByText(/nicht verloren/)).not.toBeInTheDocument();
  });

  it('zeigt seinen Inhalt erst nach dem Klick', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure summary="Frühere Empfehlungen">
        <p>Ersetzt oder entfernt – aber nicht verloren.</p>
      </Disclosure>,
    );

    await user.click(screen.getByRole('button', { name: 'Frühere Empfehlungen' }));

    expect(screen.getByText(/nicht verloren/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Frühere Empfehlungen' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('behält seine Beschriftung über beide Zustände', async () => {
    /*
      Eine Schaltfläche, die zwischen „Anzeigen“ und „Ausblenden“ wechselt,
      wechselt ihren Namen – wer sie über die Sprachsteuerung anspricht oder in
      einer Elementliste sucht, findet sie beim zweiten Mal nicht mehr. Was
      wechselt, ist `aria-expanded` und das Dreieck.
    */
    const user = userEvent.setup();
    render(
      <Disclosure summary="Alle Bedeutungen anzeigen">
        <p>Inhalt</p>
      </Disclosure>,
    );

    const knopf = screen.getByRole('button', { name: 'Alle Bedeutungen anzeigen' });
    await user.click(knopf);
    await user.click(knopf);

    expect(screen.getByRole('button', { name: 'Alle Bedeutungen anzeigen' })).toBeInTheDocument();
    expect(knopf).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Inhalt')).not.toBeInTheDocument();
  });

  it('ist mit der Tastatur zu bedienen', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure summary="Formen im Text und Herkunft">
        <p>Im Text: islands, island</p>
      </Disclosure>,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: /Formen im Text/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText(/islands/)).toBeInTheDocument();
  });

  it('zeigt einen Hinweis auch im zugeklappten Zustand', () => {
    // Der eine Satz, der sagt, ob sich das Öffnen lohnt.
    render(
      <Disclosure summary="Woher die Vorschläge kommen" hint="Offline-Wörterbuch und Wortformen.">
        <p>Langer Text</p>
      </Disclosure>,
    );

    expect(screen.getByText('Offline-Wörterbuch und Wortformen.')).toBeInTheDocument();
    expect(screen.queryByText('Langer Text')).not.toBeInTheDocument();
  });

  it('lässt sich offen starten, wo das die richtige Voreinstellung ist', () => {
    render(
      <Disclosure summary="Offen" defaultOpen>
        <p>Sofort da</p>
      </Disclosure>,
    );
    expect(screen.getByText('Sofort da')).toBeInTheDocument();
  });
});
