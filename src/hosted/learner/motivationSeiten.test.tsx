import { describe, expect, it } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FortschrittInhalt } from './FortschrittPage';
import type { Fortschrittsbild } from './fortschrittDaten';

/**
 * Die Motivation auf „Mein Fortschritt" — und ihre Grenze.
 *
 * Geprüft wird vor allem, was **nicht** dasteht: kein Vergleich, keine
 * fremde Zahl, keine Lehrkraftsicht.
 */

const LEER: Fortschrittsbild = {
  woche: [],
  lerntage: [],
  gesamt: { beherrscht: 0, offen: 0, gesamt: 0 },
  kurse: [],
  schwierige: [],
};

function zeichne(bild: Fortschrittsbild) {
  cleanup();
  render(
    <MemoryRouter>
      <FortschrittInhalt bild={bild} zielSetzen={() => {}} zoneSetzen={() => {}} />
    </MemoryRouter>,
  );
  return document.querySelector('[data-bereich="auszeichnungen"]') as HTMLElement | null;
}

describe('die Auszeichnungen auf „Mein Fortschritt"', () => {
  it('stehen auch bei einem frischen Konto da — alle, und alle offen', () => {
    zeichne(LEER);
    const abschnitt = screen.getByRole('heading', { level: 2, name: 'Auszeichnungen' }).closest('section');
    expect(abschnitt).not.toBeNull();
    expect(within(abschnitt!).getAllByRole('listitem').length).toBeGreaterThanOrEqual(6);
    expect(within(abschnitt!).queryByText('erreicht')).toBeNull();
  });

  it('erkennen einen Lerntag aus den durchgereichten Tagen — nicht nur aus dieser Woche', () => {
    /*
      `woche` trägt nur die letzten sieben Tage. Der **erste** Lerntag
      liegt oft weiter zurück; ohne die rohe Liste wäre die Auszeichnung
      jede Woche wieder weg.
    */
    zeichne({ ...LEER, lerntage: [{ localDay: '2026-01-07', taskCount: 12 }] });
    const abschnitt = screen.getByRole('heading', { level: 2, name: 'Auszeichnungen' }).closest('section');
    const ersterLerntag = within(abschnitt!).getByText('Erster Lerntag').closest('li');
    expect(ersterLerntag?.textContent).toMatch(/erreicht/);
  });

  it('zählen ein vollständig beherrschtes Paket', () => {
    zeichne({
      ...LEER,
      kurse: [
        {
          courseId: 'k1',
          titel: 'Englisch 7b',
          pakete: [
            {
              courseId: 'k1',
              packId: 'p1',
              titel: 'Unit 3',
              stand: { beherrscht: 12, offen: 0, gesamt: 12 },
            },
          ],
          stand: { beherrscht: 12, offen: 0, gesamt: 12 },
        },
      ],
      gesamt: { beherrscht: 12, offen: 0, gesamt: 12 },
    });
    const abschnitt = screen.getByRole('heading', { level: 2, name: 'Auszeichnungen' }).closest('section');
    expect(within(abschnitt!).getByText('Ein Paket durch').closest('li')?.textContent).toMatch(
      /erreicht/,
    );
  });

  it('nennt niemanden außer der lernenden Person', () => {
    zeichne({ ...LEER, lerntage: [{ localDay: '2026-01-07', taskCount: 12 }] });
    const abschnitt = screen.getByRole('heading', { level: 2, name: 'Auszeichnungen' }).closest('section');
    expect(abschnitt!.textContent).not.toMatch(
      /Platz|Rang|Klasse\b|Durchschnitt|Mitschüler|besser als|Rangliste/i,
    );
    expect(abschnitt!.textContent).toMatch(/Lehrkräfte sehen davon nichts/);
  });
});
