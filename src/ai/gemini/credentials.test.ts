import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ApiKey,
  KEY_STORAGE_NOTICE,
  forgetKey,
  isRemembered,
  loadKey,
  looksLikeApiKey,
  maskKey,
  resetSessionKeyForTests,
  saveKey,
} from './credentials';
import { TEST_API_KEY } from './fakeGemini';

/**
 * Der API-Schlüssel und die Wege, auf denen er **nicht** abhandenkommt.
 *
 * Diese Datei prüft keine Verschlüsselung – es gibt keine, und die Oberfläche
 * sagt das. Sie prüft die alltäglichen Lecks: einen Zustandsbaum, der
 * serialisiert wird; ein Template-Literal in einer Fehlermeldung; ein
 * `console.log` beim Suchen eines ganz anderen Fehlers; ein Kästchen, das
 * gesetzt aussieht, obwohl nichts gemerkt wurde.
 *
 * Verwendet wird durchgehend `TEST_API_KEY` – ein Wert, der auf den ersten
 * Blick als Attrappe zu erkennen ist.
 */

beforeEach(() => {
  resetSessionKeyForTests();
  window.localStorage.clear();
});

afterEach(() => {
  resetSessionKeyForTests();
  window.localStorage.clear();
});

describe('Der Schlüssel plaudert nicht', () => {
  it('zeigt beim Serialisieren nur eine Maske', () => {
    /*
      Der wahrscheinlichste Weg nach draußen: Irgendwo wird ein Zustand
      protokolliert, und der Schlüssel hängt darin.
    */
    const key = new ApiKey(TEST_API_KEY);
    const text = JSON.stringify({ gemini: { key } });

    expect(text).not.toContain(TEST_API_KEY);
    expect(text).toContain('TEST…0000');
  });

  it('zeigt in einem Template-Literal nur eine Maske', () => {
    // Der zweitwahrscheinlichste: `throw new Error(\`… ${key}\`)`.
    const key = new ApiKey(TEST_API_KEY);
    expect(`Schlüssel: ${key}`).not.toContain(TEST_API_KEY);
    expect(String(key)).toBe('TEST…0000');
  });

  it('wird bei `{...spread}` nicht mitkopiert', () => {
    /*
      Eine private Klasseneigenschaft und kein Feld – genau deshalb. Ein
      `{ ...credentials }` in irgendeinem Reducer nähme ein Feld mit.
    */
    const key = new ApiKey(TEST_API_KEY);
    expect(JSON.stringify({ ...key })).not.toContain(TEST_API_KEY);
  });

  it('gibt den Klartext nur über einen benannten Aufruf heraus', () => {
    // `reveal()` ist im Quelltext zählbar; ein Feldzugriff wäre es nicht.
    expect(new ApiKey(TEST_API_KEY).reveal()).toBe(TEST_API_KEY);
  });
});

describe('Die Maske', () => {
  it('zeigt genug zum Unterscheiden und zu wenig zum Rekonstruieren', () => {
    expect(maskKey('AIzaSyD-1234567890abcdefgh')).toBe('AIza…efgh');
  });

  it('verdeckt einen kurzen Wert vollständig', () => {
    // Bei zehn Zeichen wären acht davon zu viel.
    expect(maskKey('kurz12345')).toBe('••••••••');
  });

  it('macht aus einem leeren Wert keine Maske', () => {
    expect(maskKey('   ')).toBe('');
  });
});

describe('Sieht das nach einem Schlüssel aus', () => {
  it('nimmt einen plausiblen an', () => {
    expect(looksLikeApiKey(TEST_API_KEY)).toBe(true);
  });

  it('lehnt offensichtliche Platzhalter ab', () => {
    /*
      Diese Prüfung soll den Tippfehler abfangen, nicht das Format erraten.
      Ob der Schlüssel gilt, weiß nur Google.
    */
    expect(looksLikeApiKey('')).toBe(false);
    expect(looksLikeApiKey('   ')).toBe(false);
    expect(looksLikeApiKey('dein Schlüssel hier')).toBe(false);
    expect(looksLikeApiKey('zu-kurz')).toBe(false);
  });
});

describe('Wo der Schlüssel liegt', () => {
  it('merkt sich standardmäßig nichts über die Sitzung hinaus', () => {
    saveKey(TEST_API_KEY, false);

    expect(loadKey()?.storage).toBe('session');
    expect(isRemembered()).toBe(false);
    expect(window.localStorage.getItem('lexiflow.gemini.key')).toBeNull();
  });

  it('legt ihn nur auf ausdrücklichen Wunsch ins Gerät', () => {
    saveKey(TEST_API_KEY, true);

    expect(isRemembered()).toBe(true);
    expect(loadKey()?.storage).toBe('session');
  });

  it('findet einen gemerkten Schlüssel nach einem Neuladen wieder', () => {
    saveKey(TEST_API_KEY, true);
    resetSessionKeyForTests(); // das Neuladen

    const geladen = loadKey();
    expect(geladen?.storage).toBe('device');
    expect(geladen?.key.reveal()).toBe(TEST_API_KEY);
  });

  it('vergisst einen nur für die Sitzung gesetzten nach dem Neuladen', () => {
    saveKey(TEST_API_KEY, false);
    resetSessionKeyForTests();

    expect(loadKey()).toBeUndefined();
  });

  it('räumt den gemerkten mit weg, wenn das Kästchen ausgeht', () => {
    /*
      Sonst entstünde der schlechteste aller Zustände: Das Kästchen ist aus,
      und im Speicher liegt trotzdem noch einer.
    */
    saveKey(TEST_API_KEY, true);
    saveKey(TEST_API_KEY, false);

    expect(isRemembered()).toBe(false);
  });

  it('vergisst ihn auf Wunsch vollständig', () => {
    saveKey(TEST_API_KEY, true);
    forgetKey();

    expect(loadKey()).toBeUndefined();
    expect(isRemembered()).toBe(false);
  });

  it('behandelt einen leeren Wert wie „vergessen“', () => {
    saveKey(TEST_API_KEY, true);
    expect(saveKey('   ', true)).toBeUndefined();
    expect(isRemembered()).toBe(false);
  });
});

describe('Der Hinweis zur Speicherung', () => {
  it('beschönigt die Lage nicht', () => {
    /*
      Wer glaubt, der Schlüssel sei sicher verwahrt, geht mit ihm anders um.
      Der Satz muss die drei Dinge sagen, die stimmen: kein Server, Speicher
      des Browsers, geteilte Geräte sind ein Problem.
    */
    expect(KEY_STORAGE_NOTICE).toContain('ohne Server');
    expect(KEY_STORAGE_NOTICE).toContain('Browsers');
    expect(KEY_STORAGE_NOTICE).toContain('teilt');
    expect(KEY_STORAGE_NOTICE).not.toMatch(/sicher verwahrt|verschlüsselt/);
  });
});
