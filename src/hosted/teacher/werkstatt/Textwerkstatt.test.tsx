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

describe('Schritt 1 zeigt eine kompakte Auswahl statt einer Wand aus Formularen', () => {
  it('zeigt den Quelltext und die Wortauswahl nebeneinander', () => {
    zeichne(analysiert());
    expect(screen.getByRole('group', { name: 'Analysierter Text' }).textContent).toBe(
      SCOTLAND_WALES,
    );
    expect(screen.getByRole('heading', { name: 'Wörter auswählen' })).toBeInTheDocument();
  });

  it('sagt, wie viele mögliche Lernwörter aus wie vielen Sätzen stammen', () => {
    const stand = analysiert();
    zeichne(stand);
    expect(
      screen.getByText(new RegExp(`${stand.zeilen.length} mögliche Lernwörter aus ${stand.saetze} Sätzen`)),
    ).toBeInTheDocument();
  });

  it('zeigt zuerst genau 15 kompakte Zeilen ohne Quellsätze und Formulare', () => {
    zeichne(analysiert());
    expect(document.querySelectorAll('.werkstatt__kompaktzeile')).toHaveLength(15);
    expect(document.querySelectorAll('.werkstatt__satz')).toHaveLength(0);
    expect(screen.queryByLabelText(/Deutsche Bedeutung für/)).toBeNull();

    const woerter = [...document.querySelectorAll('.werkstatt__kompaktwort')].map(
      (element) => element.textContent?.toLowerCase(),
    );
    expect(woerter).toEqual(
      expect.arrayContaining(['capital city', 'tradition', 'culture', 'language', 'separate']),
    );
    expect(woerter).not.toEqual(expect.arrayContaining(['five', 'million', 'people', 'art']));
  });

  it('hakt keinen Vorschlag von allein an', () => {
    zeichne(analysiert());
    const kaestchen = screen.getAllByRole('checkbox');
    expect(kaestchen.length).toBeGreaterThan(10);
    expect(kaestchen.filter((feld) => (feld as HTMLInputElement).checked)).toHaveLength(0);
  });

  it('blendet alle Treffer erst auf ausdrücklichen Klick ein', async () => {
    const { user } = zeichne(analysiert());
    expect(document.querySelectorAll('.werkstatt__kompaktzeile')).toHaveLength(15);
    await user.click(screen.getByRole('button', { name: 'Alle 67 zeigen' }));
    expect(document.querySelectorAll('.werkstatt__kompaktzeile')).toHaveLength(67);
  });

  it('kann die sichtbaren 15 mit einem einzigen Zug auswählen', async () => {
    const { aufZug, user } = zeichne(analysiert());
    await user.click(screen.getByRole('button', { name: 'Alle 15 auswählen' }));
    expect(aufZug).toHaveBeenCalledWith({
      art: 'auswahl-gesetzt',
      ids: expect.arrayContaining([expect.any(String)]),
      aufgenommen: true,
    });
  });

  it('öffnet Übersetzungen erst im zweiten Schritt und hält Details geschlossen', async () => {
    const stand = analysiert();
    const mitWort = textZug(stand, { art: 'aufgenommen', id: stand.zeilen[0]!.kandidat.id });
    const { user } = zeichne(mitWort);
    expect(screen.queryByLabelText(/Deutsche Bedeutung für/)).toBeNull();
    await user.click(screen.getByRole('button', { name: '1 Wort übersetzen' }));
    expect(screen.getByRole('heading', { name: 'Übersetzungen' })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Deutsche Bedeutung für/)).toHaveLength(1);
    expect(screen.getByText(/Details zu/).closest('details')).not.toHaveAttribute('open');
  });

  it('verspricht beim fertigen Stand ausdrücklich keinen Versand', async () => {
    let stand = analysiert();
    stand = textZug(stand, { art: 'titel-geaendert', titel: 'Scotland' });
    const id = stand.zeilen[0]!.kandidat.id;
    stand = textZug(stand, { art: 'aufgenommen', id });
    stand = textZug(stand, { art: 'zeile-geaendert', id, teil: { german: 'etwas' } });

    const { aufFertig, user } = zeichne(stand);
    await user.click(screen.getByRole('button', { name: '1 Wort übersetzen' }));
    expect(screen.getByText(/nicht veröffentlicht und keiner Lerngruppe zugewiesen/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lernpaket anlegen' }));
    expect(aufFertig).toHaveBeenCalledTimes(1);
    expect(aufFertig.mock.calls[0]![0]).toMatchObject({ titel: 'Scotland' });
  });
});

describe('die KI ist optional und ruft nicht von allein', () => {
  it('zeigt ohne Rückruf keinen KI-Knopf — die Auswahl bleibt vollständig', () => {
    zeichne(analysiert());
    expect(screen.queryByRole('heading', { name: 'Übersetzungsvorschläge holen' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Analysierter Text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alle 15 auswählen' })).toBeInTheDocument();
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

  it('ruft erst auf Klick und sagt vorher, was hinausgeht', async () => {
    const stand = textZug(analysiert(), {
      art: 'aufgenommen',
      id: analysiert().zeilen[0]!.kandidat.id,
    });
    const aufVorschlaege = vi.fn();
    const { user } = zeichne(stand, { aufVorschlaege });

    await user.click(screen.getByRole('button', { name: '1 Wort übersetzen' }));
    expect(screen.getByText(/an die KI-Verbindung/)).toBeInTheDocument();
    expect(screen.getByText(/Ohne diesen Klick wird nichts gesendet/)).toBeInTheDocument();
    expect(aufVorschlaege).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Vorschläge für 1 Wort holen/ }));
    expect(aufVorschlaege).toHaveBeenCalledTimes(1);
  });

  it('nennt verworfene Vorschläge im Übersetzungsschritt, statt sie zu verschweigen', async () => {
    let stand = analysiert();
    stand = textZug(stand, { art: 'aufgenommen', id: stand.zeilen[0]!.kandidat.id });
    stand = textZug(stand, { art: 'ki-gestartet' });
    stand = textZug(stand, {
      art: 'ki-vorschlaege',
      vorschlaege: [{ kandidatId: 'erfunden', german: 'die Burg' }],
    });
    const { user } = zeichne(stand, { aufVorschlaege: vi.fn() });
    await user.click(screen.getByRole('button', { name: '1 Wort übersetzen' }));
    expect(screen.getByText(/gehörte zu keinem Wort aus deinem Text/)).toBeInTheDocument();
    expect(screen.queryByText('die Burg')).toBeNull();
  });

  it('bleibt nach einem Fehlschlag benutzbar', async () => {
    let stand = analysiert();
    stand = textZug(stand, { art: 'aufgenommen', id: stand.zeilen[0]!.kandidat.id });
    stand = textZug(textZug(stand, { art: 'ki-gestartet' }), {
      art: 'ki-gescheitert',
      grund: 'Der KI-Zugang ist gerade nicht erreichbar.',
    });
    const { user } = zeichne(stand, { aufVorschlaege: vi.fn() });
    await user.click(screen.getByRole('button', { name: '1 Wort übersetzen' }));
    expect(screen.getByText(/nicht erreichbar/)).toBeInTheDocument();
    expect(screen.getByText(/lassen sich eintippen/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Übersetzungen' })).toBeInTheDocument();
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
