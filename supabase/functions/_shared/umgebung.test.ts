// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { leseSupabaseUmgebung } from './umgebung';

/**
 * Die Umgebung beider Serverfunktionen.
 *
 * ## Warum das geprüft gehört
 *
 * Die Edge-Laufzeit injiziert `SUPABASE_PUBLISHABLE_KEYS` und
 * `SUPABASE_SECRET_KEYS` als JSON-Wörterbücher. Der bisherige Code las die
 * Einzahlformen, die nicht zuverlässig gesetzt sind. Der Fehlschlag wäre ein
 * `undefined` im Client-Konstruktor gewesen – zur Laufzeit, beim ersten
 * echten Aufruf, weit weg von seiner Ursache.
 *
 * Hier ist er eine Zeile mit einem Namen darin.
 *
 * ## Offensichtlich erfundene Werte
 *
 * Alle Schlüssel unten sind als Testwerte erkennbar. Es gibt keinen Grund,
 * hier je einen echten zu hinterlegen, und diese Datei ist der Ort, an dem
 * jemand auf die Idee kommen könnte.
 */

const URL = 'https://beispiel.supabase.co';
const PUB = 'sb_publishable_TESTWERT';
const SEC = 'sb_secret_TESTWERT';

/** Die heutige Laufzeit: URL plus zwei Wörterbücher. */
function heutigeLaufzeit(): Record<string, string | undefined> {
  return {
    SUPABASE_URL: URL,
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUB }),
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: SEC }),
  };
}

describe('die heutige Edge-Laufzeit', () => {
  it('liest beide Schlüssel aus `default`', () => {
    const umgebung = leseSupabaseUmgebung(heutigeLaufzeit());
    expect(umgebung.url).toBe(URL);
    expect(umgebung.publishableKey).toBe(PUB);
    expect(umgebung.secretKey).toBe(SEC);
  });

  it('nennt die Herkunft mit Namen', () => {
    /*
      Im Staging ist die erste Frage bei jedem Fehlschlag, welche Variable
      gegriffen hat. Diese Angabe beantwortet sie, ohne einen Wert auszugeben.
    */
    const umgebung = leseSupabaseUmgebung(heutigeLaufzeit());
    expect(umgebung.herkunft).toEqual({
      url: 'SUPABASE_URL',
      publishableKey: 'SUPABASE_PUBLISHABLE_KEYS.default',
      secretKey: 'SUPABASE_SECRET_KEYS.default',
    });
  });

  it('übergeht weitere Einträge neben `default`', () => {
    const env = {
      ...heutigeLaufzeit(),
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: SEC, zweitschluessel: 'sb_secret_ANDERS' }),
    };
    expect(leseSupabaseUmgebung(env).secretKey).toBe(SEC);
  });
});

describe('die Rückfallnamen', () => {
  it('nimmt `SUPABASE_PUBLISHABLE_KEY`, wenn das Wörterbuch fehlt', () => {
    const env = {
      SUPABASE_URL: URL,
      SUPABASE_PUBLISHABLE_KEY: PUB,
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: SEC }),
    };
    const umgebung = leseSupabaseUmgebung(env);
    expect(umgebung.publishableKey).toBe(PUB);
    expect(umgebung.herkunft.publishableKey).toBe('SUPABASE_PUBLISHABLE_KEY');
  });

  it('nimmt danach `SUPABASE_ANON_KEY`', () => {
    const env = {
      SUPABASE_URL: URL,
      SUPABASE_ANON_KEY: PUB,
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: SEC }),
    };
    const umgebung = leseSupabaseUmgebung(env);
    expect(umgebung.publishableKey).toBe(PUB);
    expect(umgebung.herkunft.publishableKey).toBe('SUPABASE_ANON_KEY');
  });

  it('nimmt `SUPABASE_SECRET_KEY`, wenn das Wörterbuch fehlt', () => {
    const env = {
      SUPABASE_URL: URL,
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUB }),
      SUPABASE_SECRET_KEY: SEC,
    };
    const umgebung = leseSupabaseUmgebung(env);
    expect(umgebung.secretKey).toBe(SEC);
    expect(umgebung.herkunft.secretKey).toBe('SUPABASE_SECRET_KEY');
  });

  it('nimmt danach `SUPABASE_SERVICE_ROLE_KEY`', () => {
    const env = {
      SUPABASE_URL: URL,
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUB }),
      SUPABASE_SERVICE_ROLE_KEY: SEC,
    };
    const umgebung = leseSupabaseUmgebung(env);
    expect(umgebung.secretKey).toBe(SEC);
    expect(umgebung.herkunft.secretKey).toBe('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('bevorzugt die Einzahlform vor dem alten Namen', () => {
    const env = {
      SUPABASE_URL: URL,
      SUPABASE_PUBLISHABLE_KEY: PUB,
      SUPABASE_ANON_KEY: 'sb_publishable_VERALTET',
      SUPABASE_SECRET_KEY: SEC,
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_VERALTET',
    };
    const umgebung = leseSupabaseUmgebung(env);
    expect(umgebung.publishableKey).toBe(PUB);
    expect(umgebung.secretKey).toBe(SEC);
  });

  it('bevorzugt das Wörterbuch vor allen Einzelnamen', () => {
    const env = {
      ...heutigeLaufzeit(),
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_VERALTET',
      SUPABASE_SECRET_KEY: 'sb_secret_VERALTET',
    };
    const umgebung = leseSupabaseUmgebung(env);
    expect(umgebung.publishableKey).toBe(PUB);
    expect(umgebung.secretKey).toBe(SEC);
  });
});

describe('ein kaputtes Wörterbuch', () => {
  /*
    Absicht: Ein gesetztes, aber unbrauchbares Wörterbuch fällt **nicht**
    still auf die Einzelnamen zurück. Es zu übergehen hieße, mit einem
    womöglich veralteten Schlüssel aus einer anderen Variablen
    weiterzumachen – und das fällt niemandem auf. Lauter Abbruch ist hier die
    freundlichere Antwort.
  */
  const mitKaputtemSecret = (wert: string) => ({
    ...heutigeLaufzeit(),
    SUPABASE_SECRET_KEYS: wert,
    SUPABASE_SECRET_KEY: 'sb_secret_WUERDE_SONST_GREIFEN',
  });

  it('meldet ungültiges JSON', () => {
    expect(() => leseSupabaseUmgebung(mitKaputtemSecret('{kein json'))).toThrow(
      /SUPABASE_SECRET_KEYS ist gesetzt, aber kein gültiges JSON/,
    );
  });

  it('meldet ein JSON, das kein Wörterbuch ist', () => {
    expect(() => leseSupabaseUmgebung(mitKaputtemSecret('"nur ein Text"'))).toThrow(
      /kein JSON-Wörterbuch/,
    );
    expect(() => leseSupabaseUmgebung(mitKaputtemSecret('["a"]'))).toThrow(/kein JSON-Wörterbuch/);
    expect(() => leseSupabaseUmgebung(mitKaputtemSecret('null'))).toThrow(/kein JSON-Wörterbuch/);
  });

  it('meldet einen fehlenden Eintrag `default`', () => {
    const env = mitKaputtemSecret(JSON.stringify({ produktion: SEC }));
    expect(() => leseSupabaseUmgebung(env)).toThrow(
      /SUPABASE_SECRET_KEYS enthält keinen Eintrag "default"/,
    );
  });

  it('meldet ein `default`, das keine Zeichenkette ist', () => {
    const env = mitKaputtemSecret(JSON.stringify({ default: 42 }));
    expect(() => leseSupabaseUmgebung(env)).toThrow(/SUPABASE_SECRET_KEYS\.default ist keine/);
  });

  it('meldet ein leeres `default`', () => {
    const env = mitKaputtemSecret(JSON.stringify({ default: '   ' }));
    expect(() => leseSupabaseUmgebung(env)).toThrow(/SUPABASE_SECRET_KEYS\.default ist leer/);
  });

  it('gilt genauso für das Publishable-Wörterbuch', () => {
    const env = { ...heutigeLaufzeit(), SUPABASE_PUBLISHABLE_KEYS: '{kein json' };
    expect(() => leseSupabaseUmgebung(env)).toThrow(/SUPABASE_PUBLISHABLE_KEYS/);
  });
});

describe('fehlende Werte', () => {
  it('meldet eine fehlende Projekt-URL', () => {
    const { SUPABASE_URL: _weg, ...ohne } = heutigeLaufzeit();
    expect(() => leseSupabaseUmgebung(ohne)).toThrow(/SUPABASE_URL fehlt/);
  });

  it('meldet einen fehlenden Publishable Key und nennt alle Namen', () => {
    const env = { SUPABASE_URL: URL, SUPABASE_SECRET_KEYS: JSON.stringify({ default: SEC }) };
    expect(() => leseSupabaseUmgebung(env)).toThrow(
      /Der Publishable Key fehlt.*SUPABASE_PUBLISHABLE_KEYS\.default, SUPABASE_PUBLISHABLE_KEY, SUPABASE_ANON_KEY/s,
    );
  });

  it('meldet einen fehlenden Secret Key und nennt alle Namen', () => {
    const env = { SUPABASE_URL: URL, SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUB }) };
    expect(() => leseSupabaseUmgebung(env)).toThrow(
      /Der Secret Key fehlt.*SUPABASE_SECRET_KEYS\.default, SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY/s,
    );
  });

  it('behandelt leere und aus Leerzeichen bestehende Werte als nicht gesetzt', () => {
    const env = {
      SUPABASE_URL: URL,
      SUPABASE_PUBLISHABLE_KEY: '',
      SUPABASE_ANON_KEY: '   ',
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: SEC }),
    };
    expect(() => leseSupabaseUmgebung(env)).toThrow(/Der Publishable Key fehlt/);
  });

  it('schneidet Leerzeichen an den Rändern ab', () => {
    // Ein Wert, der beim Einfügen ins Dashboard ein Leerzeichen mitbekommt,
    // soll funktionieren und nicht als anderer Schlüssel gelten.
    const env = { ...heutigeLaufzeit(), SUPABASE_URL: `  ${URL}  ` };
    expect(leseSupabaseUmgebung(env).url).toBe(URL);
  });
});

describe('keine Meldung gibt je einen Schlüssel preis', () => {
  it('nennt Namen und Fehlerart, nie den Wert', () => {
    /*
      Eine Fehlermeldung landet im Function-Log. Ein Log ist der letzte Ort,
      an dem ein Schlüssel stehen sollte – und der bequemste Ort, an dem ein
      „nur zum Nachsehen" ausgegebener Wert für immer liegen bleibt.

      Geprüft wird über alle Fehlerwege hinweg, nicht an einem Beispiel.
    */
    const faelle: Record<string, string | undefined>[] = [
      { SUPABASE_URL: `  ${URL}  `, SUPABASE_PUBLISHABLE_KEYS: `{"default":"${PUB}"` },
      { SUPABASE_URL: URL, SUPABASE_SECRET_KEYS: `"${SEC}"` },
      { SUPABASE_URL: URL, SUPABASE_SECRET_KEYS: JSON.stringify({ falsch: SEC }) },
      { SUPABASE_URL: URL, SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUB }) },
      { SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SECRET_KEY: SEC },
    ];

    for (const env of faelle) {
      let meldung = '';
      try {
        leseSupabaseUmgebung(env);
        throw new Error(`Dieser Fall hätte scheitern müssen: ${JSON.stringify(Object.keys(env))}`);
      } catch (fehler) {
        meldung = fehler instanceof Error ? fehler.message : String(fehler);
      }
      expect(meldung, 'die Meldung enthält den Publishable Key').not.toContain(PUB);
      expect(meldung, 'die Meldung enthält den Secret Key').not.toContain(SEC);
    }
  });
});
