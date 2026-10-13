import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Werkstatt } from './Werkstatt';
import { type Werkstattstand, anfang, werkstattZug } from './zustand';

/**
 * Die Werkstatt an der Oberfläche — jeder Pflichtzustand einmal.
 *
 * ## Warum gegen den Zustandsautomaten und nicht gegen erfundene Stände
 *
 * Ein von Hand gebauter `Werkstattstand` kann Dinge behaupten, die der
 * Automat nie erzeugt — zum Beispiel eine Vorschau ohne Befund. Eine
 * Prüfung gegen so einen Stand prüft dann eine Oberfläche für einen Fall,
 * den es nicht gibt. Alle Stände hier kommen deshalb aus `werkstattZug`.
 */

const ZWEISPALTIG = 'house\tHaus\ncar\tAuto\ntree\tBaum';

function zeichne(stand: Werkstattstand, zusatz: Partial<Parameters<typeof Werkstatt>[0]> = {}) {
  const aufZug = vi.fn();
  const aufFertig = vi.fn();
  cleanup();
  render(<Werkstatt stand={stand} aufZug={aufZug} aufFertig={aufFertig} {...zusatz} />);
  return { aufZug, aufFertig, user: userEvent.setup() };
}

function vorschau(text = ZWEISPALTIG): Werkstattstand {
  return werkstattZug(anfang(), { art: 'text-eingefuegt', text });
}

describe('die Pflichtzustände stehen wirklich da', () => {
  it('leer: nennt beide Quellen und verspricht keine Vorschau', () => {
    /*
      Verschärft statt angepasst. Vorher stand hier nur die Überschrift
      „Material einfügen"; die Browsermessung zeigte, dass dieser
      Bildschirm ausschliesslich zu einer Vokabelliste einlud, obwohl
      der Fliesstextweg dahinter längst lief. Geprüft wird jetzt, dass
      **beide** Quellen benannt sind — sonst ist der Textweg zwar
      vorhanden, aber unauffindbar.
    */
    zeichne(anfang());
    expect(screen.getByRole('heading', { name: 'Text oder Liste einfügen' })).toBeInTheDocument();
    expect(screen.getByText(/zusammenhängender englischer Text/)).toBeInTheDocument();
    expect(screen.getByText(/fertige Vokabelliste/)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('Scotland'),
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('zeigt das Dateifeld nur, wenn jemand die Datei auch liest', () => {
    /*
      Ohne `aufDatei` holt niemand den Inhalt ab. Ein Feld, dessen Datei
      nichts auslöst, ist schlimmer als keines: Es sieht aus wie ein Weg
      und ist eine Sackgasse.
    */
    zeichne(anfang());
    expect(screen.queryByLabelText('Datei auswählen')).not.toBeInTheDocument();

    zeichne(anfang(), { aufDatei: () => {} });
    expect(screen.getByLabelText('Datei auswählen')).toBeInTheDocument();
  });

  it('Datei wird gelesen: sagt welche, und sagt es als Statusmeldung', () => {
    zeichne(werkstattZug(anfang(), { art: 'datei-gewaehlt', name: 'liste.csv' }));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/liste\.csv/);
  });

  it('Vorschau: zeigt jede erkannte Vokabel zum Ändern', () => {
    zeichne(vorschau());
    expect(screen.getByDisplayValue('house')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Haus')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('teilweise unsicher: sagt es und bittet ums Nachsehen', () => {
    zeichne(vorschau('house\ncar\ntree'));
    expect(screen.getByText(/Bitte kurz nachsehen/)).toBeInTheDocument();
  });

  it('Duplikate: nennt sie oben, kennzeichnet die Zeile und begründet sie dort noch einmal', () => {
    zeichne(vorschau('house\tHaus\nhouse\tGebäude'));
    /*
      Dreimal, und das ist Absicht: einmal als Überblick oben, einmal als
      Marke an der betroffenen Zeile, einmal als Satz darunter. Die erste
      Fassung dieser Prüfung suchte nur nach dem Wortlaut und fand ihn
      dreimal — sie war zu lose, nicht die Oberfläche zu laut.
    */
    expect(screen.getByText('Doppelte Stichwörter')).toBeInTheDocument();
    const markiert = screen.getAllByText('doppelt');
    expect(markiert.length).toBe(1);
    const zeile = markiert[0]!.closest('li');
    expect(zeile?.textContent).toMatch(/kommt mehrfach vor/);
  });

  it('fehlerhafte Datei: ein Satz und ein Weg zurück, keine leere Vorschau', () => {
    const stand = werkstattZug(anfang(), {
      art: 'datei-gelesen',
      quelle: { art: 'datei', name: 'kaputt.vocabpack.json', groesse: 12, inhalt: '{nope' },
    });
    zeichne(stand);
    expect(screen.getByText(/ließ sich nicht lesen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Andere Quelle wählen' })).toBeInTheDocument();
  });

  it('zu große Datei: nennt die Grenze statt nur zu scheitern', () => {
    const stand = werkstattZug(anfang(), {
      art: 'datei-gelesen',
      quelle: { art: 'datei', name: 'riesig.csv', groesse: 99 * 1024 * 1024, inhalt: 'a;b' },
    });
    zeichne(stand);
    expect(screen.getByText(/MB/)).toBeInTheDocument();
  });

  it('erfolgreich geprüft: die Abgabe ist frei', () => {
    const stand = werkstattZug(vorschau(), { art: 'titel-geaendert', titel: 'Unit 3' });
    zeichne(stand);
    expect(screen.getByRole('button', { name: 'Lernpaket anlegen' })).toBeEnabled();
  });

  it('offline: erklärt, was weitergeht, und verspricht die Abgabe nicht', () => {
    const stand = werkstattZug(vorschau(), { art: 'titel-geaendert', titel: 'Unit 3' });
    zeichne(stand, { offline: true });
    expect(screen.getByText(/Gerade keine Verbindung/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lernpaket anlegen' })).toBeDisabled();
  });
});

describe('die Abgabe bleibt ein Rückruf', () => {
  it('ruft erst auf, wenn ein Titel dasteht', async () => {
    const { aufFertig } = zeichne(vorschau());
    expect(screen.getByRole('button', { name: 'Lernpaket anlegen' })).toBeDisabled();
    expect(aufFertig).not.toHaveBeenCalled();
  });

  it('reicht Titel und Einträge weiter — und sonst nichts', async () => {
    const stand = werkstattZug(vorschau(), { art: 'titel-geaendert', titel: 'Unit 3' });
    const { aufFertig, user } = zeichne(stand);
    await user.click(screen.getByRole('button', { name: 'Lernpaket anlegen' }));
    expect(aufFertig).toHaveBeenCalledTimes(1);
    const entwurf = aufFertig.mock.calls[0]?.[0];
    expect(entwurf.titel).toBe('Unit 3');
    expect(entwurf.eintraege).toHaveLength(3);
    expect(Object.keys(entwurf).sort()).toEqual(['eintraege', 'titel']);
  });

  it('sagt beim Blockieren, was fehlt', () => {
    zeichne(vorschau());
    expect(screen.getByText(/fehlt noch ein Name/)).toBeInTheDocument();
  });
});

describe('Korrekturen gehen an den Zustand, nicht an einen eigenen Speicher', () => {
  it('meldet eine geänderte Übersetzung als Zug', async () => {
    const { aufZug, user } = zeichne(vorschau());
    await user.type(screen.getByDisplayValue('Haus'), '!');
    expect(aufZug).toHaveBeenCalled();
    const letzter = aufZug.mock.calls.at(-1)?.[0];
    expect(letzter.art).toBe('zeilen-geaendert');
  });

  it('meldet das Abwählen einer Zeile als Zug', async () => {
    const { aufZug, user } = zeichne(vorschau());
    await user.click(screen.getAllByRole('checkbox')[0]!);
    const letzter = aufZug.mock.calls.at(-1)?.[0];
    expect(letzter.art).toBe('zeilen-geaendert');
    expect(letzter.zeilen[0].include).toBe(false);
  });
});

describe('Barrierefreiheit', () => {
  it('beschriftet jedes Eingabefeld', () => {
    zeichne(vorschau());
    for (const feld of screen.getAllByRole('textbox')) {
      expect(feld).toHaveAccessibleName();
    }
  });

  it('gibt jeder Vorschauzeile ihre Befunde als Text, nicht nur als Farbe', () => {
    zeichne(vorschau('house\tHaus\ncar\t'));
    const zeilen = screen.getAllByRole('listitem');
    const ohneUebersetzung = zeilen.find((zeile) =>
      within(zeile).queryByDisplayValue('car'),
    );
    expect(ohneUebersetzung).toBeDefined();
    expect(ohneUebersetzung!.textContent).toMatch(/Übersetzung fehlt/);
  });
});
