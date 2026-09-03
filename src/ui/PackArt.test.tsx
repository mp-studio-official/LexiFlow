import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { PackArt } from './PackArt';
import { packMotif } from './packMotif';

/**
 * Das gezeichnete Motiv.
 *
 * Zwei Zusagen, und die zweite ist die wichtigere:
 *
 * 1. Es steht **nicht** im Baum der Hilfstechnik. Ein Bild ohne Aussage, das
 *    beschrieben wird, ist Lärm vor dem Titel, um den es geht.
 * 2. Es bringt **keine** eigene Farbe mit. Eine Bildwelt, die neben der
 *    Palette herläuft, ist keine Bildwelt, sondern ein zweites Design – und
 *    die Palette ist in diesem Projekt bindend.
 */

function svgOf(seed: string): SVGSVGElement {
  const { container } = render(<PackArt seed={seed} />);
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('Kein Motiv gerendert.');
  return svg as SVGSVGElement;
}

describe('Das Motiv ist Schmuck', () => {
  it('steht nicht im Baum der Hilfstechnik', () => {
    const svg = svgOf('Unit 3 – City life');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
  });

  it('trägt keinen Text – auch keinen versteckten', () => {
    // Weder `<title>` noch `<desc>`: Beide würden vorgelesen.
    const svg = svgOf('Unit 3 – City life');
    expect(svg.querySelector('title')).toBeNull();
    expect(svg.querySelector('desc')).toBeNull();
    expect(svg.textContent?.trim()).toBe('');
  });
});

describe('Das Motiv bleibt in der Palette', () => {
  it('benutzt ausschließlich die drei Farben des Projekts – über die Token', () => {
    /*
      Geprüft am Markup und nicht am Pixel: Ein Hexwert im Motiv fiele hier
      auf, ein gerenderter Farbwert sagte dagegen nur, was der Browser aus den
      Token gemacht hat. Ändert sich die Palette, sollen die Motive mitgehen.
    */
    const erlaubt = new Set([
      'var(--brand-aubergine)',
      'var(--brand-tomato)',
      'var(--brand-parchment)',
      'var(--nav)',
      'none',
    ]);

    for (const titel of ['Unit 1 – At home', 'Halong Bay', 'Phrasal verbs', 'Irregular verbs']) {
      const svg = svgOf(titel);
      for (const element of svg.querySelectorAll('*')) {
        for (const attribut of ['fill', 'stroke', 'stop-color']) {
          const wert = element.getAttribute(attribut);
          if (!wert) continue;
          // Der Verweis auf den eigenen Verlauf ist keine Farbe.
          if (wert.startsWith('url(#')) continue;
          expect(erlaubt, `${titel}: ${attribut}="${wert}"`).toContain(wert);
        }
      }
    }
  });

  it('nennt Komposition und Grundton als Datenattribut', () => {
    // Nicht für die Anzeige, sondern für Tests und die Fehlersuche im Browser.
    const art = packMotif('Unit 3 – City life');
    const svg = svgOf('Unit 3 – City life');
    expect(svg).toHaveAttribute('data-variant', art.variant);
    expect(svg).toHaveAttribute('data-ground', art.ground);
  });
});

describe('Zwei Motive nebeneinander', () => {
  it('bekommen verschiedene Verlaufskennungen', () => {
    /*
      `useId` und nicht ein Zähler: Zwei Verläufe mit derselben `id` auf einer
      Seite sind ein Fehler, den man erst sieht, wenn zufällig zwei Karten mit
      demselben Grundton nebeneinanderstehen – und dann zeigen beide denselben.
    */
    const { container } = render(
      <>
        <PackArt seed="Unit 1" />
        <PackArt seed="Unit 2" />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((node) => node.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
