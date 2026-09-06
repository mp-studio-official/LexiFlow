import { describe, expect, it } from 'vitest';

import { asGeminiError, errorForStatus, geminiError } from './errors';
import { replyWithError, TEST_API_KEY } from './fakeGemini';
import { GeminiTransportError } from './transport';

/**
 * Was eine Lehrkraft im Fehlerfall zu sehen bekommt.
 *
 * Zwei Fragen an jede Meldung: Sagt sie, was zu tun ist? Und verrät sie nichts,
 * was Google mitgeschickt hat?
 */

/** Eine Fehlerantwort, in der wirklich etwas zu verraten wäre. */
function geschwaetzig(status: number): string {
  const antwort = replyWithError(
    status,
    `API key not valid. Please pass a valid API key. key=${TEST_API_KEY} at https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`,
  );
  return 'throws' in antwort ? '' : antwort.text;
}

describe('Die Google-Meldung bleibt drin', () => {
  it('zeigt weder Schlüssel noch Adresse noch englischen Originaltext', () => {
    for (const status of [400, 401, 403, 404, 429, 500, 503]) {
      const fehler = errorForStatus(status, geschwaetzig(status));

      expect(fehler.message, `${status}`).not.toContain(TEST_API_KEY);
      expect(fehler.message, `${status}`).not.toContain('generativelanguage');
      expect(fehler.message, `${status}`).not.toContain('API key not valid');
      expect(fehler.message, `${status}`).not.toContain('API_KEY_INVALID');
      // Auch die Statusnummer nicht: „403" hilft niemandem weiter.
      expect(fehler.message, `${status}`).not.toContain(String(status));
    }
  });

  it('verkraftet einen Rumpf, der gar kein JSON ist', () => {
    const fehler = errorForStatus(500, '<html>Gateway Timeout</html>');
    expect(fehler.kind).toBe('server');
    expect(fehler.message).not.toContain('html');
  });
});

describe('Die Einordnung', () => {
  it('erkennt den ungültigen Schlüssel, obwohl Google 400 sendet', () => {
    /*
      Der häufigste Fehler überhaupt – ein halb kopierter Schlüssel – kommt bei
      Gemini als 400 und nicht als 401. Ohne den Blick in den Rumpf bekäme
      ausgerechnet er die unbrauchbarste Meldung.
    */
    expect(errorForStatus(400, geschwaetzig(400)).kind).toBe('invalid-key');
    expect(errorForStatus(400, geschwaetzig(400)).message).toContain('vollständig kopiert');
  });

  it('unterscheidet fehlende Berechtigung von falschem Schlüssel', () => {
    const ohneGrund = JSON.stringify({ error: { code: 403, message: 'Forbidden' } });
    expect(errorForStatus(403, ohneGrund).kind).toBe('forbidden');
    expect(errorForStatus(403, geschwaetzig(403)).kind).toBe('invalid-key');
  });

  it('ordnet die übrigen Fälle zu', () => {
    const leer = '{}';
    expect(errorForStatus(400, leer).kind).toBe('bad-request');
    expect(errorForStatus(401, leer).kind).toBe('invalid-key');
    expect(errorForStatus(404, leer).kind).toBe('unknown-model');
    expect(errorForStatus(429, leer).kind).toBe('quota');
    expect(errorForStatus(500, leer).kind).toBe('server');
    expect(errorForStatus(503, leer).kind).toBe('server');
  });
});

describe('Ein erneuter Versuch', () => {
  it('lohnt sich bei Kontingent, Serverfehler und Zeitüberschreitung', () => {
    expect(geminiError('quota').retryable).toBe(true);
    expect(geminiError('server').retryable).toBe(true);
    expect(geminiError('timeout').retryable).toBe(true);
    expect(geminiError('bad-response').retryable).toBe(true);
  });

  it('lohnt sich nicht bei einem falschen Schlüssel oder Modell', () => {
    // Sonst drückt jemand fünfmal auf denselben Knopf und ändert nichts.
    expect(geminiError('invalid-key').retryable).toBe(false);
    expect(geminiError('unknown-model').retryable).toBe(false);
    expect(geminiError('no-key').retryable).toBe(false);
    expect(geminiError('aborted').retryable).toBe(false);
  });
});

describe('Fremde Fehler', () => {
  it('übernimmt die Art eines Transportfehlers', () => {
    expect(asGeminiError(new GeminiTransportError('x', 'timeout')).kind).toBe('timeout');
    expect(asGeminiError(new GeminiTransportError('x', 'aborted')).kind).toBe('aborted');
    expect(asGeminiError(new GeminiTransportError('x', 'offline')).kind).toBe('offline');
  });

  it('macht aus einem unbekannten Fehler keine unbekannte Meldung', () => {
    /*
      Der wichtigste Zweig: Die `message` eines fremden Fehlers kann alles
      enthalten – eine Adresse, einen Rumpf, im schlimmsten Fall den Schlüssel.
      Sie wird deshalb nicht durchgereicht.
    */
    const fremd = new Error(`Etwas ging schief mit key=${TEST_API_KEY}`);
    const fehler = asGeminiError(fremd);

    expect(fehler.kind).toBe('bad-response');
    expect(fehler.message).not.toContain(TEST_API_KEY);
  });

  it('erkennt einen Abbruch auch als DOMException', () => {
    expect(asGeminiError(new DOMException('Aborted', 'AbortError')).kind).toBe('aborted');
  });
});
