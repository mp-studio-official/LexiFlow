import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  type Auszeichnung,
  auszeichnungen,
  frischErreicht,
  rundenfortschritt,
  tagesstand,
} from '../../../domain/motivation';
import { Abschlussfeier, Auszeichnungsliste, Rundenbalken, Tagesziel } from './Motivation';

/**
 * Die Motivation an der Oberfläche.
 *
 * Geprüft wird vor allem, was **nicht** dasteht: kein Vergleich, keine
 * fremde Zahl, kein Aufhalten, keine Information, die nur in einer
 * Bewegung steckt.
 */

const LEER = {
  lerntage: [],
  beherrschung: { beherrscht: 0, offen: 0, gesamt: 0 },
  paketstaende: [],
};

function zeichne(baum: React.ReactElement) {
  cleanup();
  render(baum);
  return userEvent.setup();
}

describe('das Tagesziel', () => {
  it('nennt Stand und Rest als Text, nicht nur als Balken', () => {
    zeichne(<Tagesziel stand={tagesstand({ localDay: 'x', taskCount: 6 })} />);
    expect(screen.getByText(/Noch 4 Aufgaben/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '6');
  });

  it('lobt beim Erreichen, ohne nachzuschieben', () => {
    zeichne(<Tagesziel stand={tagesstand({ localDay: 'x', taskCount: 12 })} />);
    expect(screen.getByText('Heute geschafft.')).toBeInTheDocument();
    expect(screen.queryByText(/noch/i)).not.toBeInTheDocument();
  });

  it('übertreibt nicht: der Balken geht nicht über das Ziel hinaus', () => {
    /*
      Die Begrenzung macht `Fortschritt`, nicht diese Komponente — hier
      stand erst ein eigenes `Math.min`, und eine Mutationsprobe zeigte,
      dass es tot war. Die Zusage gilt trotzdem und wird hier geprüft:
      Fiele die Begrenzung im Baustein weg, stünde `aria-valuenow` auf 40
      und diese Prüfung würde rot.
    */
    zeichne(<Tagesziel stand={tagesstand({ localDay: 'x', taskCount: 40 })} />);
    const balken = screen.getByRole('progressbar');
    expect(balken).toHaveAttribute('aria-valuenow', '10');
    expect(balken).toHaveAttribute('aria-valuemax', '10');
  });
});

describe('der Rundenbalken', () => {
  it('sagt den Stand als Zahl', () => {
    zeichne(<Rundenbalken stand={rundenfortschritt(7, 20)} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '7');
  });

  it('ruft nicht nach jeder Antwort dazwischen', () => {
    /*
      Eine Vorlesehilfe, die „8 von 20" meldet, übertönt die Rückmeldung,
      auf die es ankommt. Der Stand ist abrufbar; er drängt sich nicht auf.
    */
    const { container } = render(<Rundenbalken stand={rundenfortschritt(7, 20)} />);
    expect(container.querySelector('[aria-live]')).toBeNull();
    cleanup();
  });
});

describe('die Abschlussfeier hält niemanden auf', () => {
  it('ist kein Dialog und fängt keinen Fokus', () => {
    const { container } = render(<Abschlussfeier frisch={[]} runde={rundenfortschritt(20, 20)} />);
    expect(container.querySelector('dialog')).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    cleanup();
  });

  it('lässt sich sofort weiterklicken, ohne auf eine Bewegung zu warten', async () => {
    const weiter = vi.fn();
    const user = zeichne(
      <Abschlussfeier frisch={[]} runde={rundenfortschritt(20, 20)} aufWeiter={weiter} />,
    );
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(weiter).toHaveBeenCalledTimes(1);
  });

  it('nennt frisch Erreichtes in einer einzigen Ansage', () => {
    const frisch = frischErreicht(
      auszeichnungen(LEER),
      auszeichnungen({ ...LEER, beherrschung: { beherrscht: 10, offen: 0, gesamt: 10 } }),
    );
    zeichne(<Abschlussfeier frisch={frisch} runde={rundenfortschritt(20, 20)} />);
    const ansage = screen.getByRole('status');
    expect(ansage).toHaveTextContent(/Runde geschafft/);
    expect(ansage).toHaveTextContent(/Zehn sitzen/);
  });

  it('feiert auch ohne neue Auszeichnung die Runde selbst', () => {
    zeichne(<Abschlussfeier frisch={[]} runde={rundenfortschritt(20, 20)} />);
    expect(screen.getByRole('status')).toHaveTextContent('Runde geschafft.');
  });
});

describe('die Auszeichnungsliste', () => {
  const liste: Auszeichnung[] = auszeichnungen({
    ...LEER,
    beherrschung: { beherrscht: 12, offen: 3, gesamt: 15 },
  });

  it('zeigt erreichte und offene, und versteckt nichts', () => {
    zeichne(<Auszeichnungsliste auszeichnungen={liste} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(liste.length);
    expect(screen.getAllByText('erreicht').length).toBeGreaterThan(0);
  });

  it('kennzeichnet „erreicht" als Text und nicht nur über die Fläche', () => {
    const { container } = render(<Auszeichnungsliste auszeichnungen={liste} />);
    const erreicht = container.querySelectorAll('[data-erreicht="ja"]');
    expect(erreicht.length).toBeGreaterThan(0);
    for (const eintrag of erreicht) {
      expect(eintrag.textContent).toMatch(/erreicht/);
    }
    cleanup();
  });

  it('zeigt bei offenen den eigenen Stand', () => {
    zeichne(<Auszeichnungsliste auszeichnungen={liste} />);
    expect(screen.getByText('12 von 50')).toBeInTheDocument();
  });

  it('nennt niemanden außer der lernenden Person', () => {
    const { container } = render(<Auszeichnungsliste auszeichnungen={liste} />);
    expect(container.textContent).not.toMatch(
      /Platz|Rang|Klasse|Durchschnitt|andere|Mitschüler|besser als/i,
    );
    cleanup();
  });
});

describe('Bewegung ist eine Zugabe', () => {
  const css = readFileSync(resolve(import.meta.dirname, 'motivation.css'), 'utf8');

  it('jede Bewegung steht unter `prefers-reduced-motion`', () => {
    const bewegt = /transition:|animation:/.test(css);
    expect(bewegt, 'ohne Bewegung prüft diese Wache nichts').toBe(true);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('und die Rücknahme schaltet sie wirklich ab', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/transition:\s*none/);
    expect(block).toMatch(/opacity:\s*1/);
  });
});
