import { describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { analyzeText } from '../../../domain/textExtraction';
import { mergeMultiwordTokens, tokenizeSource } from '../../../import/sourceTokens';
import { SCOTLAND_WALES } from '../../../testdaten/scotlandWales';
import { Quelltext, type WordState } from './Quelltext';

/**
 * Der Quelltext im Portal — gegen den Abnahmetext, nicht gegen Beispiele.
 *
 * Erfundene Tokens wären hier besonders wertlos: Was diese Komponente
 * leistet, hängt daran, dass die Zerlegung aus `tokenizeSource` und die
 * Kandidaten aus `analyzeText` zusammenpassen. Zwei von Hand gebaute
 * Listen passen immer zusammen — echte nicht unbedingt.
 */

function aufbau(text = SCOTLAND_WALES) {
  const analyse = analyzeText(text);
  const tokens = mergeMultiwordTokens(tokenizeSource(text, analyse.candidates), analyse.candidates);
  return { analyse, tokens };
}

/**
 * Den Tabstopp ansteuern — in `act`, weil `focus` Zustand ändert.
 *
 * Ohne die Umhüllung liefe der `onFocus`-Behandler ausserhalb des
 * React-Durchlaufs, und die Prüfung sähe einen Zwischenstand. Dass die
 * Warnung dabei nur eine Warnung ist, macht sie nicht harmlos: Sie
 * verdeckt künftig echte.
 */
async function fokussiereErstesWort(): Promise<void> {
  await act(async () => {
    document.querySelector<HTMLElement>('[data-word][tabindex="0"]')?.focus();
  });
}

function zeichne(zustand: (id: string) => WordState = () => 'open') {
  const { tokens, analyse } = aufbau();
  const aufAufnehmen = vi.fn();
  cleanup();
  render(<Quelltext tokens={tokens} zustandVon={zustand} aufAufnehmen={aufAufnehmen} />);
  return { aufAufnehmen, tokens, analyse, user: userEvent.setup() };
}

describe('der Text bleibt der Text', () => {
  it('gibt den Quelltext zeichengenau wieder', () => {
    const { tokens } = zeichne();
    /*
      Die Zusage, an der eine Textansicht steht oder fällt. Wer sie liest,
      soll den Text lesen, den er eingefügt hat — nicht eine Fassung ohne
      Bindestriche, ohne Apostrophe oder ohne Absätze.
    */
    const bereich = screen.getByRole('group', { name: 'Analysierter Text' });
    expect(bereich.textContent).toBe(SCOTLAND_WALES);
    expect(tokens.map((token) => token.text).join('')).toBe(SCOTLAND_WALES);
  });

  it('zeigt gefundene Wörter aus dem Text, keine erfundenen', () => {
    const { analyse } = zeichne();
    const woerter = analyse.candidates.map((kandidat) => kandidat.normalizedEnglish);
    expect(woerter.length).toBeGreaterThan(10);
    for (const wort of woerter) {
      expect(SCOTLAND_WALES.toLowerCase()).toContain(wort.split(' ')[0]);
    }
  });
});

describe('die drei Zustände sind ohne Farbe unterscheidbar', () => {
  it('macht aus einem übernommenen Wort ein <mark>, aus einem offenen ein <span>', () => {
    const { tokens } = aufbau();
    const ersterKandidat = tokens.find((token) => token.candidateId)?.candidateId;
    expect(ersterKandidat).toBeDefined();

    cleanup();
    render(
      <Quelltext
        tokens={tokens}
        zustandVon={(id) => (id === ersterKandidat ? 'taken' : 'open')}
        aufAufnehmen={vi.fn()}
      />,
    );

    const markiert = document.querySelectorAll('mark[data-state="taken"]');
    expect(markiert.length).toBeGreaterThan(0);
    expect(document.querySelector('mark[data-state="open"]')).toBeNull();
  });
});

describe('die Bedienung', () => {
  it('hat genau einen Tabstopp für den ganzen Text', () => {
    zeichne();
    /*
      Der Grund, warum diese Komponente überhaupt übernommen wurde: 220
      Kandidaten als 220 Knöpfe waren mit der Tastatur unpassierbar.
    */
    expect(document.querySelectorAll('[data-word][tabindex="0"]')).toHaveLength(1);
  });

  it('nimmt auf Eingabetaste auf und meldet die Tokenspanne', async () => {
    const { aufAufnehmen, user } = zeichne();
    await fokussiereErstesWort();
    await user.keyboard('{Enter}');
    expect(aufAufnehmen).toHaveBeenCalledTimes(1);
    const [von, bis] = aufAufnehmen.mock.calls[0] as [number, number];
    expect(von).toBe(bis);
  });

  it('erweitert mit Umschalt und Pfeiltaste auf eine Wortgruppe', async () => {
    const { aufAufnehmen, user } = zeichne();
    await fokussiereErstesWort();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}{Enter}');
    expect(aufAufnehmen).toHaveBeenCalledTimes(1);
    const [von, bis] = aufAufnehmen.mock.calls[0] as [number, number];
    expect(bis).toBeGreaterThan(von);
  });

  it('nimmt nichts auf, solange der Text ausgewertet wird', async () => {
    const { tokens } = aufbau();
    const aufAufnehmen = vi.fn();
    cleanup();
    render(
      <Quelltext
        tokens={tokens}
        zustandVon={() => 'open'}
        aufAufnehmen={aufAufnehmen}
        beschaeftigt
      />,
    );
    const user = userEvent.setup();
    await fokussiereErstesWort();
    await user.keyboard('{Enter}');
    expect(aufAufnehmen).not.toHaveBeenCalled();
  });
});
