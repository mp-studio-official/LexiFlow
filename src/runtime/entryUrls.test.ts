import { describe, expect, it } from 'vitest';
import {
  authCodeFrom,
  callbackUrl,
  portalUrlFrom,
  soloUrlFrom,
  withoutAuthParams,
} from './entryUrls';

/**
 * Die Adressen unter einem Unterpfad.
 *
 * Jede Prüfung hier läuft zweimal: einmal mit `/` – so sieht es lokal aus –
 * und einmal mit `/LexiFlow/`, wie auf GitHub Pages. Genau dieser Unterschied
 * ist die Fehlerquelle: Ein fest geschriebenes `/portal/` funktioniert lokal
 * tadellos und führt nach dem Deployment ins Leere.
 */

const LOKAL = '/';
const PAGES = '/LexiFlow/';

describe('vom kontofreien Teil zum Portal', () => {
  it('hängt das Portal an den Grundpfad', () => {
    expect(portalUrlFrom(LOKAL)).toBe('/portal/');
    expect(portalUrlFrom(PAGES)).toBe('/LexiFlow/portal/');
  });

  it('verträgt einen Grundpfad ohne Schrägstrich am Ende', () => {
    expect(portalUrlFrom('/LexiFlow')).toBe('/LexiFlow/portal/');
  });

  it('verdoppelt das Portal nicht, wenn es schon drinsteht', () => {
    expect(portalUrlFrom('/LexiFlow/portal/')).toBe('/LexiFlow/portal/');
  });
});

describe('vom Portal zurück', () => {
  it('nimmt das Portalsegment weg', () => {
    expect(soloUrlFrom('/LexiFlow/portal/')).toBe('/LexiFlow/');
    expect(soloUrlFrom('/portal/')).toBe('/');
  });

  it('lässt einen Grundpfad ohne Portalsegment in Ruhe', () => {
    expect(soloUrlFrom(PAGES)).toBe('/LexiFlow/');
  });

  it('ist die Umkehrung des Hinwegs', () => {
    for (const grund of [LOKAL, PAGES, '/tief/verschachtelt/']) {
      expect(soloUrlFrom(portalUrlFrom(grund))).toBe(grund);
    }
  });
});

describe('die Rückkehradresse nach der Anmeldung', () => {
  it('enthält den Grundpfad des Portals', () => {
    expect(callbackUrl('https://beispiel.invalid', '/LexiFlow/portal/')).toBe(
      'https://beispiel.invalid/LexiFlow/portal/',
    );
  });

  it('kann eine Route hinter der Raute tragen', () => {
    expect(callbackUrl('https://beispiel.invalid', '/LexiFlow/portal/', '/kennwort-neu')).toBe(
      'https://beispiel.invalid/LexiFlow/portal/#/kennwort-neu',
    );
  });

  it('verträgt einen Ursprung mit Schrägstrich am Ende', () => {
    expect(callbackUrl('https://beispiel.invalid/', '/portal/')).toBe(
      'https://beispiel.invalid/portal/',
    );
  });

  it('lässt keinen Anmeldeparameter hinter der Raute entstehen', () => {
    /*
      Der Kern der Sache. Bei einem Anmeldeablauf, der seine Antwort hinter
      der Raute zurückgibt, überschriebe sie genau den Teil, der bei
      `HashRouter` die Route trägt – und das Zugangstoken stünde in der
      Adresszeile. LexiFlow benutzt deshalb PKCE mit `?code=…`. Diese Adresse
      darf nichts enthalten, was danach aussieht.
    */
    const adresse = callbackUrl('https://beispiel.invalid', '/LexiFlow/portal/', '/kennwort-neu');
    expect(adresse).not.toContain('access_token');
    expect(adresse).not.toContain('#access');
    expect(adresse.split('#')[1]).toBe('/kennwort-neu');
  });

  it('ist unter jedem Grundpfad eine absolute Adresse', () => {
    for (const grund of ['/portal/', '/LexiFlow/portal/']) {
      const adresse = callbackUrl('https://mp-studio-official.github.io', grund, '/x');
      expect(() => new URL(adresse)).not.toThrow();
      expect(new URL(adresse).pathname).toBe(grund);
    }
  });
});

describe('der Code aus der Adresse', () => {
  it('wird gefunden, wenn er da ist', () => {
    expect(authCodeFrom('?code=abc123')).toBe('abc123');
    expect(authCodeFrom('?state=x&code=abc123')).toBe('abc123');
  });

  it('fehlt sonst – und ein leerer Wert zählt als fehlend', () => {
    expect(authCodeFrom('')).toBeUndefined();
    expect(authCodeFrom('?state=x')).toBeUndefined();
    expect(authCodeFrom('?code=')).toBeUndefined();
  });
});

describe('das Aufräumen der Adresse', () => {
  it('entfernt die verbrauchten Parameter und lässt den Rest stehen', () => {
    const nachher = withoutAuthParams(
      'https://beispiel.invalid/LexiFlow/portal/?code=abc&state=xy&von=mail#/kennwort-neu',
    );
    expect(nachher).toBe('https://beispiel.invalid/LexiFlow/portal/?von=mail#/kennwort-neu');
  });

  it('behält Grundpfad und Route unverändert', () => {
    const nachher = new URL(
      withoutAuthParams('https://beispiel.invalid/LexiFlow/portal/?code=abc#/kurse'),
    );
    expect(nachher.pathname).toBe('/LexiFlow/portal/');
    expect(nachher.hash).toBe('#/kurse');
    expect(nachher.search).toBe('');
  });

  it('entfernt auch eine Fehlermeldung des Anmeldedienstes', () => {
    // Sie gehört in eine Meldung auf der Seite, nicht in den Verlauf.
    const nachher = withoutAuthParams(
      'https://beispiel.invalid/portal/?error=access_denied&error_description=abgelehnt',
    );
    expect(nachher).toBe('https://beispiel.invalid/portal/');
  });
});
