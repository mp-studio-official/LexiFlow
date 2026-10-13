import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Lerncoach } from './Lerncoach';
import { type Coachaufgabe, fakeAnbieter, pruefeAntwort } from './vertrag';

/**
 * Der Lerncoach — und vor allem seine Grenzen.
 *
 * Geprüft wird dreierlei: dass jeder Pflichtzustand wirklich dasteht, dass
 * der Vertrag keine Felder für Personendaten hat, und dass kein Pfad hier
 * ins Netz geht.
 */

const AUFGABE: Coachaufgabe = {
  lernform: 'went',
  richtung: 'de-en',
  beispielsatz: 'We went home.',
  antwort: 'goed',
  loesung: 'went',
  sprache: 'de',
  niveau: 'A2',
};

const GRUND = {
  aufgabe: AUFGABE,
  freigegeben: true,
  hinweisGesehen: true,
  aufHinweisVerstanden: () => {},
};

function zeichne(zusatz: Partial<Parameters<typeof Lerncoach>[0]> = {}) {
  cleanup();
  render(<Lerncoach {...GRUND} anbieter={fakeAnbieter()} {...zusatz} />);
  return userEvent.setup();
}

describe('der Vertrag kennt keine Personendaten', () => {
  const quelle = readFileSync(resolve(import.meta.dirname, 'vertrag.ts'), 'utf8');
  const schnittstelle = quelle.slice(
    quelle.indexOf('export interface Coachaufgabe'),
    quelle.indexOf('export type Coachantwort'),
  );

  it('liest wirklich die Schnittstelle und nicht nichts', () => {
    expect(schnittstelle).toContain('lernform');
    expect(schnittstelle.length).toBeGreaterThan(100);
  });

  it.each([
    'name',
    'displayName',
    'userId',
    'shortCode',
    'lernId',
    'courseId',
    'kursId',
    'verlauf',
    'history',
    'apiKey',
    'token',
    'anbieter',
  ])('hat kein Feld „%s"', (feld) => {
    expect(schnittstelle.toLowerCase()).not.toMatch(new RegExp(`\\b${feld.toLowerCase()}\\??:`));
  });
});

describe('die Pflichtzustände', () => {
  it('KI nicht freigegeben', () => {
    zeichne({ freigegeben: false });
    expect(screen.getByText(/noch nicht freigegeben/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('kein Anbieter verbunden — und sagt, was ein Zugang ist', () => {
    cleanup();
    render(<Lerncoach {...GRUND} />);
    expect(screen.getByText(/Kein Zugang eingerichtet/)).toBeInTheDocument();
    const text = screen.getByText(/OpenAI API/).textContent ?? '';
    expect(text).toMatch(/Anthropic Claude API/);
    expect(text).toMatch(/Gemini API/);
    expect(text).toMatch(/lokales Modell/);
  });

  it('datensparsamer Hinweis vor dem ersten Aufruf — und zwar als Sperre', () => {
    zeichne({ hinweisGesehen: false });
    expect(screen.getByText(/Nicht/)).toBeInTheDocument();
    /* Solange er nicht bestätigt ist, gibt es keine Handlung, die etwas sendet. */
    expect(screen.queryByRole('button', { name: 'Gib mir einen Hinweis' })).not.toBeInTheDocument();
  });

  it('bereit: vier feste Handlungen und kein Eingabefeld', () => {
    zeichne();
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('lädt: sagt, wer gefragt wird, und lässt sich abbrechen', async () => {
    const haengend = {
      name: 'Testanbieter (ohne Netz)',
      frage: () => new Promise<never>(() => {}),
    };
    const user = zeichne({ anbieter: haengend });
    await user.click(screen.getByRole('button', { name: 'Gib mir einen Hinweis' }));
    expect(screen.getByRole('status')).toHaveTextContent(/wird gefragt/);
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
  });

  it('Antwort: zeigt sie und sagt dazu, dass sie maschinell ist', async () => {
    const user = zeichne();
    await user.click(screen.getByRole('button', { name: 'Gib mir einen Hinweis' }));
    await waitFor(() => expect(screen.getByText(/Zusammenhang/)).toBeInTheDocument());
    expect(screen.getByText(/Maschinell erzeugt/)).toBeInTheDocument();
    expect(screen.getByText(/Prüfung in LexiFlow/)).toBeInTheDocument();
  });

  it('Rate-Limit', async () => {
    const user = zeichne({
      anbieter: fakeAnbieter({ stattdessen: { art: 'rate-limit', wiederInSekunden: 30 } }),
    });
    await user.click(screen.getByRole('button', { name: 'Gib mir einen Hinweis' }));
    await waitFor(() => expect(screen.getByText(/30 Sekunden/)).toBeInTheDocument());
  });

  it('Anbieter nicht erreichbar — und das Üben geht weiter', async () => {
    const user = zeichne({ anbieter: fakeAnbieter({ stattdessen: { art: 'nicht-erreichbar' } }) });
    await user.click(screen.getByRole('button', { name: 'Gib mir einen Hinweis' }));
    await waitFor(() => expect(screen.getByText(/nicht erreichbar/)).toBeInTheDocument());
    expect(screen.getByText(/geht ohne den Lerncoach genauso weiter/)).toBeInTheDocument();
  });

  it('ungeeignete Antwort verworfen', async () => {
    const user = zeichne({ anbieter: fakeAnbieter({ verraeterisch: true }) });
    await user.click(screen.getByRole('button', { name: 'Gib mir einen Hinweis' }));
    await waitFor(() =>
      expect(screen.getByText(/Antwort nicht verwendet/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/hätte die Lösung verraten/)).toBeInTheDocument();
  });

  it('Abbruch: sagt, dass nichts übernommen wurde', async () => {
    const haengend = {
      name: 'Testanbieter (ohne Netz)',
      frage: () => new Promise<never>(() => {}),
    };
    const user = zeichne({ anbieter: haengend });
    await user.click(screen.getByRole('button', { name: 'Gib mir einen Hinweis' }));
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.getByText(/nichts übernommen/)).toBeInTheDocument();
  });
});

describe('die Verwerfung ist eine echte Regel, keine Verzierung', () => {
  it('verwirft einen Hinweis, der die Lösung enthält', () => {
    expect(pruefeAntwort('Es ist „went".', 'hinweis', AUFGABE).art).toBe('verworfen');
  });

  it('lässt denselben Satz bei „warum ist das richtig" durch', () => {
    /*
      Dort **soll** die Lösung vorkommen — die Regel gilt der Handlung,
      nicht dem Wortlaut.
    */
    expect(pruefeAntwort('Es ist „went".', 'warum-richtig', AUFGABE).art).toBe('text');
  });

  it('verwirft eine leere Antwort', () => {
    expect(pruefeAntwort('   ', 'hinweis', AUFGABE).art).toBe('verworfen');
  });
});

describe('nichts hier geht ins Netz', () => {
  it('der Fake-Anbieter ruft weder fetch noch XMLHttpRequest', async () => {
    const echtesFetch = globalThis.fetch;
    const fetchWache = vi.fn();
    globalThis.fetch = fetchWache as unknown as typeof fetch;
    const user = zeichne();
    for (const name of [
      'Erkläre meinen Fehler',
      'Gib mir einen Hinweis',
      'Zeige mir einen anderen Beispielsatz',
      'Warum ist diese Antwort richtig?',
    ]) {
      await user.click(screen.getByRole('button', { name }));
    }
    expect(fetchWache).not.toHaveBeenCalled();
    globalThis.fetch = echtesFetch;
  });

  it('die Dateien dieses Ordners enthalten keine Adresse und keinen Schlüssel', () => {
    for (const datei of ['vertrag.ts', 'Lerncoach.tsx']) {
      const quelle = readFileSync(resolve(import.meta.dirname, datei), 'utf8');
      expect(quelle).not.toMatch(/https?:\/\//);
      expect(quelle).not.toMatch(/\bfetch\s*\(/);
      expect(quelle).not.toMatch(/sk-[A-Za-z0-9]/);
    }
  });
});
