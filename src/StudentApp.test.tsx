import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StudentApp } from './StudentApp';
import { makePack } from './test/fixtures';

/**
 * Die Lerndatei kann keine Lehrkraftroute rendern.
 *
 * ## Zwei Prüfungen, die zusammengehören
 *
 * `src/runtime/portableIsolation.test.ts` zeigt, dass die Lehrkraftansichten
 * gar nicht im Bündel liegen. Dieser Test hier zeigt das Verhalten davor: Was
 * passiert, wenn jemand `#/material` eintippt, weil er die Adresse aus der
 * Lehrkraftdatei kennt?
 *
 * Nicht ein Fehler, nicht eine leere Seite – die Startseite. Eine Adresse, die
 * es hier nicht gibt, ist kein Zwischenfall, und sie soll sich auch nicht wie
 * einer anfühlen.
 */

const pack = makePack();
const area = { id: 'bereich-1', title: 'Unit 3 – City life' };

beforeEach(() => {
  window.location.hash = '';
});

afterEach(() => {
  window.location.hash = '';
});

async function oeffne(hash: string) {
  window.location.hash = hash;
  render(<StudentApp area={area} packs={[pack]} />);
  // Der erste Rendervorgang prüft den Speicher; danach steht die Seite.
  return screen.findByRole('heading', { level: 1 });
}

describe('Lehrkraftadressen in der Lerndatei', () => {
  for (const adresse of [
    '#/material',
    '#/material/import',
    '#/material/assistent',
    '#/material/lernbereiche/neu',
    '#/material/pack-1',
    '#/verwaltung',
    '#/kurse',
  ]) {
    it(`${adresse} endet auf der Startseite des Lernbereichs`, async () => {
      const ueberschrift = await oeffne(adresse);
      expect(ueberschrift).toHaveTextContent(area.title);
      // Kein Wort aus der Werkstatt – auch nicht in einer Fehlermeldung.
      expect(document.body).not.toHaveTextContent('Empfehlungen generieren');
      expect(document.body).not.toHaveTextContent('Gemini');
    });
  }
});

describe('die Lernwege selbst bleiben erreichbar', () => {
  it('die Startseite nennt den Bereich', async () => {
    const ueberschrift = await oeffne('#/');
    expect(ueberschrift).toHaveTextContent(area.title);
  });
});

describe('die Hülle der Lerndatei', () => {
  it('hat keine Navigation zu einem Lehrkraftbereich', async () => {
    await oeffne('#/');
    const verweise = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(verweise.filter((ziel) => ziel.includes('material'))).toEqual([]);
    expect(verweise.filter((ziel) => ziel.includes('kurse'))).toEqual([]);
  });

  it('sagt zu, dass sie nichts sendet', async () => {
    await oeffne('#/');
    expect(document.body).toHaveTextContent(/sendet nichts/i);
  });
});
