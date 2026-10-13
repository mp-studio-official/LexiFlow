import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SCOTLAND_WALES } from '../../../testdaten/scotlandWales';
import { Textwerkstatt } from './Textwerkstatt';
import { type Textstand, textZug, textanfang } from './textzustand';

/**
 * Die Textwerkstatt an der Oberfläche — gegen den Abnahmetext.
 *
 * Alle Stände kommen aus `textZug`. Ein von Hand gebauter Stand könnte
 * Dinge behaupten, die der Automat nie erzeugt, und dann prüfte diese
 * Datei eine Oberfläche für einen Fall, den es nicht gibt.
 */

function analysiert(): Textstand {
  return textZug(textanfang(), { art: 'text-analysiert', text: SCOTLAND_WALES });
}

function zeichne(stand: Textstand, zusatz: Record<string, unknown> = {}) {
  const aufZug = vi.fn();
  const aufFertig = vi.fn();
  cleanup();
  render(<Textwerkstatt stand={stand} aufZug={aufZug} aufFertig={aufFertig} {...zusatz} />);
  return { aufZug, aufFertig, user: userEvent.setup() };
}

describe('der erste Schritt fragt nach Text, nicht nach einer Liste', () => {
  it('verspricht, dass die Analyse hier läuft', () => {
    zeichne(textanfang());
    expect(screen.getByRole('heading', { name: 'Text einfügen' })).toBeInTheDocument();
    expect(screen.getByText(/Keine Vokabelliste/)).toBeInTheDocument();
    expect(screen.getByText(/Es wird nichts gesendet/)).toBeInTheDocument();
  });

  it('analysiert erst auf Klick', async () => {
    const { aufZug, user } = zeichne(textanfang());
    expect(screen.getByRole('button', { name: 'Text analysieren' })).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'Scotland is in the North of Britain.');
    await user.click(screen.getByRole('button', { name: 'Text analysieren' }));
    expect(aufZug).toHaveBeenCalledWith(
      expect.objectContaining({ art: 'text-analysiert' }),
    );
  });
});

describe('die Prüfansicht zeigt echte Kandidaten aus dem Text', () => {
  it('zeigt den Quelltext und die Vorschläge nebeneinander', () => {
    zeichne(analysiert());
    expect(screen.getByRole('group', { name: 'Analysierter Text' }).textContent).toBe(
      SCOTLAND_WALES,
    );
    expect(screen.getByRole('heading', { name: 'Vorschläge' })).toBeInTheDocument();
  });

  it('sagt, wie viele Vorschläge aus wie vielen Sätzen stammen', () => {
    const stand = analysiert();
    expect(
      screen.queryByText(new RegExp(`${stand.zeilen.length} Vorschläge aus ${stand.saetze} Sätzen`)),
    ).toBeNull();
    zeichne(stand);
    expect(
      screen.getByText(new RegExp(`${stand.zeilen.length} Vorschläge aus ${stand.saetze} Sätzen`)),
    ).toBeInTheDocument();
  });

  it('zeigt zu jedem Vorschlag seinen Quellsatz aus dem Text', () => {
    zeichne(analysiert());
    const zitate = document.querySelectorAll('.werkstatt__satz q');
    expect(zitate.length).toBeGreaterThan(10);
    for (const zitat of zitate) {
      expect(SCOTLAND_WALES).toContain(zitat.textContent ?? '');
    }
  });

  it('hakt keinen Vorschlag von allein an', () => {
    zeichne(analysiert());
    const kaestchen = screen.getAllByRole('checkbox');
    expect(kaestchen.length).toBeGreaterThan(10);
    expect(kaestchen.filter((feld) => (feld as HTMLInputElement).checked)).toHaveLength(0);
  });

  it('zeigt die Eingabefelder erst, wenn ein Wort aufgenommen ist', () => {
    const stand = analysiert();
    zeichne(stand);
    expect(screen.queryByLabelText(/Deutsche Bedeutung/)).toBeNull();

    const mitWort = textZug(stand, { art: 'aufgenommen', id: stand.zeilen[0]!.kandidat.id });
    zeichne(mitWort);
    expect(screen.getAllByLabelText(/Deutsche Bedeutung/)).toHaveLength(1);
  });

  it('sperrt das Anlegen, solange etwas fehlt — und sagt was', () => {
    zeichne(analysiert());
    expect(screen.getByRole('button', { name: 'Lernpaket anlegen' })).toBeDisabled();
    expect(screen.getByText('Dem Lernpaket fehlt noch ein Name.')).toBeInTheDocument();
    expect(screen.getByText('Es ist noch kein Wort aufgenommen.')).toBeInTheDocument();
  });

  it('verspricht beim fertigen Stand ausdrücklich keinen Versand', async () => {
    let stand = analysiert();
    stand = textZug(stand, { art: 'titel-geaendert', titel: 'Scotland' });
    const id = stand.zeilen[0]!.kandidat.id;
    stand = textZug(stand, { art: 'aufgenommen', id });
    stand = textZug(stand, { art: 'zeile-geaendert', id, teil: { german: 'etwas' } });

    const { aufFertig, user } = zeichne(stand);
    expect(screen.getByText(/nicht veröffentlicht und keiner Lerngruppe zugewiesen/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lernpaket anlegen' }));
    expect(aufFertig).toHaveBeenCalledTimes(1);
    expect(aufFertig.mock.calls[0]![0]).toMatchObject({ titel: 'Scotland' });
  });
});

describe('die KI ist optional und ruft nicht von allein', () => {
  it('zeigt ohne Rückruf keinen KI-Knopf — die Werkstatt bleibt vollständig', () => {
    zeichne(analysiert());
    expect(screen.queryByRole('heading', { name: 'Übersetzungsvorschläge holen' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Analysierter Text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lernpaket anlegen' })).toBeInTheDocument();
  });

  it('ruft beim Öffnen keinen Anbieter', () => {
    /*
      Die Gegenprobe gegen den stillen Aufruf. Ein `useEffect`, der die
      Vorschläge „schon mal vorab" holt, wäre genau der Fall, in dem
      Text hinausgeht, ohne dass jemand geklickt hat.
    */
    const aufVorschlaege = vi.fn();
    zeichne(analysiert(), { aufVorschlaege });
    expect(aufVorschlaege).not.toHaveBeenCalled();
  });

  it('fordert ohne Auswahl erst zur Auswahl auf und sperrt den Knopf', () => {
    zeichne(analysiert(), { aufVorschlaege: vi.fn() });
    expect(screen.getByText(/Nimm zuerst Wörter auf/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vorschläge für/ })).toBeDisabled();
  });

  it('ruft erst auf Klick und sagt vorher, was hinausgeht', async () => {
    const stand = textZug(analysiert(), {
      art: 'aufgenommen',
      id: analysiert().zeilen[0]!.kandidat.id,
    });
    const aufVorschlaege = vi.fn();
    const { user } = zeichne(stand, { aufVorschlaege });

    expect(screen.getByText(/an die KI-Verbindung/)).toBeInTheDocument();
    expect(screen.getByText(/Ohne diesen Klick wird nichts gesendet/)).toBeInTheDocument();
    expect(aufVorschlaege).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Vorschläge für 1 Wort holen/ }));
    expect(aufVorschlaege).toHaveBeenCalledTimes(1);
  });

  it('nennt verworfene Vorschläge, statt sie zu verschweigen', () => {
    let stand = analysiert();
    stand = textZug(stand, { art: 'ki-gestartet' });
    stand = textZug(stand, {
      art: 'ki-vorschlaege',
      vorschlaege: [{ kandidatId: 'erfunden', german: 'die Burg' }],
    });
    zeichne(stand, { aufVorschlaege: vi.fn() });
    expect(screen.getByText(/gehörte zu keinem Wort aus deinem Text/)).toBeInTheDocument();
    expect(screen.queryByText('die Burg')).toBeNull();
  });

  it('bleibt nach einem Fehlschlag benutzbar', () => {
    const stand = textZug(textZug(analysiert(), { art: 'ki-gestartet' }), {
      art: 'ki-gescheitert',
      grund: 'Der KI-Zugang ist gerade nicht erreichbar.',
    });
    zeichne(stand, { aufVorschlaege: vi.fn() });
    expect(screen.getByText(/nicht erreichbar/)).toBeInTheDocument();
    expect(screen.getByText(/lassen sich eintippen/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Analysierter Text' })).toBeInTheDocument();
  });
});

describe('ein Wort aus dem Quelltext ergänzen', () => {
  it('meldet die Aufnahme als Zug, statt sie selbst zu entscheiden', async () => {
    const { aufZug, user } = zeichne(analysiert());
    const bereich = screen.getByRole('group', { name: 'Analysierter Text' });
    const woerter = within(bereich).getAllByText('Cardiff');
    await user.click(woerter[0]!);
    expect(aufZug).toHaveBeenCalledWith(
      expect.objectContaining({ art: 'aus-quelltext' }),
    );
  });
});
