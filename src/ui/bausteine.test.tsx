// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { Fortschritt, Kurskarte, LeererZustand, Paketkarte } from './bausteine';

/**
 * Die Bausteine der Variante B — was sie zusagen.
 *
 * jsdom rechnet kein Layout. Geprüft wird deshalb das, was auch ohne Layout
 * falsch sein kann und wofür ein Blick auf den Entwurf nicht ausreicht: die
 * Struktur, die Hilfsmittel lesen, und die Rechenfehler, die man einem
 * Fortschrittsbalken nicht ansieht.
 */

afterEach(cleanup);

describe('Kurskarte', () => {
  it('trägt genau eine Überschrift und keinen Link um die ganze Karte', () => {
    /*
      Eine vollständig klickbare Karte hat für Hilfsmittel einen einzigen,
      sehr langen Linktext — und nimmt jeder zweiten Handlung darin den Platz.
    */
    render(
      <Kurskarte titel="Englisch 7b" eyebrow="Jahrgang 7" aktion={<button type="button">Öffnen</button>} />,
    );

    const karte = screen.getByTestId('kurskarte');
    expect(within(karte).getAllByRole('heading')).toHaveLength(1);
    expect(karte.tagName).toBe('ARTICLE');
    expect(karte.closest('a')).toBeNull();
    expect(within(karte).getByRole('button', { name: 'Öffnen' })).toBeInTheDocument();
  });

  it('hält Bezeichnung und Wert als Paar zusammen', () => {
    // „12" allein ist keine Auskunft. Als `dt`/`dd` bleibt der Bezug erhalten.
    render(
      <Kurskarte
        titel="Englisch 7b"
        angaben={[
          { label: 'Lernende', wert: 12 },
          { label: 'Lernpakete', wert: 4 },
        ]}
      />,
    );

    const liste = screen.getByTestId('kurskarte').querySelector('dl');
    expect(liste).not.toBeNull();
    expect(liste?.querySelectorAll('dt')).toHaveLength(2);
    expect(liste?.querySelectorAll('dd')).toHaveLength(2);
    expect(liste?.textContent).toContain('Lernende');
    expect(liste?.textContent).toContain('12');
  });

  it('lässt den Fuß weg, wenn es nichts zu sagen gibt', () => {
    render(<Kurskarte titel="Englisch 7b" />);
    expect(screen.getByTestId('kurskarte').querySelector('dl')).toBeNull();
  });
});

describe('Paketkarte', () => {
  it('hat die Titelbildfläche auch ohne Titelbild', () => {
    /*
      Sonst entstünden zwei verschieden hohe Karten in derselben Liste. Ohne
      Bild ist die Fläche reine Zier und deshalb vor Hilfsmitteln verborgen.
    */
    render(<Paketkarte titel="Unit 3 — Travelling" />);

    const cover = screen.getByTestId('paketkarte').querySelector('.karte__cover');
    expect(cover).not.toBeNull();
    expect(cover).toHaveAttribute('data-leer', 'ja');
    expect(cover).toHaveAttribute('aria-hidden', 'true');
  });

  it('versteckt die Fläche nicht mehr, sobald ein Bild darin hängt', () => {
    render(<Paketkarte titel="Unit 3" titelbild={<img src="/x.jpg" alt="Koffer am Bahnsteig" />} />);

    const cover = screen.getByTestId('paketkarte').querySelector('.karte__cover');
    expect(cover).not.toHaveAttribute('aria-hidden');
    expect(cover).not.toHaveAttribute('data-leer');
    expect(screen.getByAltText('Koffer am Bahnsteig')).toBeInTheDocument();
  });

  it('setzt den Titel unter die Fläche, nicht darauf', () => {
    /*
      Aurora trägt nie Schrift: Der Kontrast eines Verlaufs schwankt von Pixel
      zu Pixel. Geprüft wird die Reihenfolge im DOM — der Titel steht nach der
      Fläche und nicht in ihr.
    */
    render(<Paketkarte titel="Unit 3" />);

    const karte = screen.getByTestId('paketkarte');
    const cover = karte.querySelector('.karte__cover');
    const titel = screen.getByRole('heading', { name: 'Unit 3' });
    expect(cover).not.toBeNull();
    expect(cover?.contains(titel)).toBe(false);
    const folgt = (cover?.compareDocumentPosition(titel) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(folgt, 'der Titel steht vor der Fläche statt darunter').toBeTruthy();
  });
});

describe('Fortschritt', () => {
  it('sagt die Zahl, nicht nur den Balken', () => {
    render(<Fortschritt wert={14} max={20} label="Diese Woche" einheit="Wörter" />);

    expect(screen.getByText('14 von 20 Wörter')).toBeInTheDocument();
    const balken = screen.getByRole('progressbar', { name: 'Diese Woche' });
    expect(balken).toHaveAttribute('aria-valuenow', '14');
    expect(balken).toHaveAttribute('aria-valuemax', '20');
    expect(balken).toHaveAttribute('aria-valuetext', '14 von 20 Wörter');
  });

  it('rechnet Werte außerhalb der Skala nicht in einen Balken um, der überläuft', () => {
    /*
      Ein Lernstand, der aus einem zweiten Gerät nachträglich eintrifft, kann
      größer sein als das Ziel. Das ist kein Fehler — aber ein Balken bei
      140 % wäre einer.
    */
    const { container } = render(<Fortschritt wert={28} max={20} label="Diese Woche" />);
    const fuellung = container.querySelector<HTMLElement>('.fortschritt__fuellung');
    expect(fuellung?.style.inlineSize).toBe('100%');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
  });

  it('kommt mit 0 und mit einem leeren Ziel zurecht', () => {
    // `max = 0` käme aus einem Paket ohne Wörter. Division durch null wäre NaN.
    const { container } = render(<Fortschritt wert={0} max={0} label="Noch nichts" />);
    const fuellung = container.querySelector<HTMLElement>('.fortschritt__fuellung');
    expect(fuellung?.style.inlineSize).toBe('0%');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('weist negative Werte nicht als negativen Balken aus', () => {
    const { container } = render(<Fortschritt wert={-5} max={20} label="Diese Woche" />);
    expect(container.querySelector<HTMLElement>('.fortschritt__fuellung')?.style.inlineSize).toBe(
      '0%',
    );
  });
});

describe('LeererZustand', () => {
  it('nennt den Zustand und den Weg heraus', () => {
    render(
      <LeererZustand titel="Noch keine Lernpakete" aktion={<button type="button">Paket anlegen</button>}>
        Lege dein erstes Paket an oder übernimm eines aus der Bibliothek.
      </LeererZustand>,
    );

    expect(screen.getByRole('heading', { name: 'Noch keine Lernpakete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paket anlegen' })).toBeInTheDocument();
  });

  it('ist keine Warnung', () => {
    /*
      „Hier ist noch nichts" unterbricht niemanden. Eine `alert`-Rolle gehört
      zum Fehler, nicht zum leeren Bereich — sie hier zu vergeben hieße, jedes
      neue Konto bei jedem Seitenaufruf anzusprechen.
    */
    render(<LeererZustand titel="Noch keine Lernpakete" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
