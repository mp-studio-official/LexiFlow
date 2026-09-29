/**
 * Die Supabase-Umgebung einer Edge Function – **eine** Stelle für beide.
 *
 * ## Warum es diese Datei gibt
 *
 * Die Edge-Laufzeit injiziert heute `SUPABASE_URL`,
 * `SUPABASE_PUBLISHABLE_KEYS` und `SUPABASE_SECRET_KEYS`. Die beiden
 * `*_KEYS`-Werte sind **JSON-Wörterbücher**; der übliche Schlüssel liegt
 * unter `default`.
 *
 * Beide Serverfunktionen lasen dagegen `SUPABASE_PUBLISHABLE_KEY` und
 * `SUPABASE_SECRET_KEY` – die Einzahlformen. Die stehen nicht zuverlässig zur
 * Verfügung, und nachhelfen lässt sich nicht: Eigene Secret-Namen mit Präfix
 * `SUPABASE_` weist das Dashboard ab.
 *
 * Der Fehler wäre erst beim ersten echten Aufruf aufgefallen, und zwar als
 * `undefined` im Client-Konstruktor – also weit entfernt von seiner Ursache.
 *
 * ## Warum diese Datei nichts von Deno weiß
 *
 * Sie bekommt die Umgebung als gewöhnliches Wörterbuch übergeben und gibt
 * Werte zurück. Kein `Deno.env`, kein Netz, keine Uhr. Damit ist sie unter
 * vitest prüfbar wie jede andere Logik – und das ist der Grund, warum es sie
 * als eigene Datei gibt und nicht als zwei Zeilen in jedem Mantel.
 *
 * Die Mäntel (`index.ts`) reichen `Deno.env.toObject()` herein. Das ist
 * dieselbe Aufteilung wie bei den Ports: Der Mantel holt, der Kern entscheidet.
 */

/** Die drei Werte, die beide Funktionen brauchen. */
export interface SupabaseUmgebung {
  url: string;
  publishableKey: string;
  secretKey: string;
  /**
   * Woher jeder Wert kam – **Namen, keine Werte**.
   *
   * Im Staging ist die erste Frage bei jedem Fehlschlag „welche Variable hat
   * eigentlich gegriffen?". Diese Angabe beantwortet sie, ohne dass jemand
   * versucht wäre, zum Nachsehen einen Schlüssel auszugeben.
   */
  herkunft: { url: string; publishableKey: string; secretKey: string };
}

/**
 * Die Suchreihenfolge je Wert.
 *
 * Zuerst das Wörterbuch der heutigen Laufzeit, dann die Einzahlform, dann der
 * alte Name. Die beiden Nachzügler sind für `supabase functions serve` und
 * für ältere Projekte da, nicht für den Regelfall.
 */
const PUBLISHABLE = {
  woerterbuch: 'SUPABASE_PUBLISHABLE_KEYS',
  einzeln: ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY'],
} as const;

const SECRET = {
  woerterbuch: 'SUPABASE_SECRET_KEYS',
  einzeln: ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
} as const;

/** Leer, nur Leerzeichen oder gar nicht gesetzt zählt als „nicht da". */
function gesetzt(wert: string | undefined): string | undefined {
  const sauber = (wert ?? '').trim();
  return sauber === '' ? undefined : sauber;
}

/**
 * Einen Schlüssel aus dem Wörterbuch holen.
 *
 * Gibt `undefined` zurück, wenn die Variable **gar nicht** gesetzt ist – dann
 * sind die Einzelnamen dran. Ist sie gesetzt und trotzdem unbrauchbar, wirft
 * sie: Ein injiziertes, aber kaputtes Wörterbuch still zu übergehen hieße,
 * mit einem womöglich veralteten Schlüssel aus einer anderen Variablen
 * weiterzumachen – und das fällt niemandem auf.
 */
function ausWoerterbuch(name: string, roh: string | undefined): string | undefined {
  const text = gesetzt(roh);
  if (text === undefined) return undefined;

  let gelesen: unknown;
  try {
    gelesen = JSON.parse(text);
  } catch {
    throw new Error(`${name} ist gesetzt, aber kein gültiges JSON.`);
  }

  if (gelesen === null || typeof gelesen !== 'object' || Array.isArray(gelesen)) {
    throw new Error(`${name} ist gesetzt, aber kein JSON-Wörterbuch.`);
  }

  const eintrag = (gelesen as Record<string, unknown>)['default'];
  if (eintrag === undefined) {
    throw new Error(`${name} enthält keinen Eintrag "default".`);
  }
  if (typeof eintrag !== 'string') {
    throw new Error(`${name}.default ist keine Zeichenkette.`);
  }

  const wert = gesetzt(eintrag);
  if (wert === undefined) {
    throw new Error(`${name}.default ist leer.`);
  }
  return wert;
}

/** Ein Schlüssel samt Herkunft, oder ein Fehler, der alle Namen nennt. */
function schluessel(
  env: Record<string, string | undefined>,
  quelle: { woerterbuch: string; einzeln: readonly string[] },
  bezeichnung: string,
): { wert: string; herkunft: string } {
  const ausDict = ausWoerterbuch(quelle.woerterbuch, env[quelle.woerterbuch]);
  if (ausDict !== undefined) {
    return { wert: ausDict, herkunft: `${quelle.woerterbuch}.default` };
  }

  for (const name of quelle.einzeln) {
    const wert = gesetzt(env[name]);
    if (wert !== undefined) return { wert, herkunft: name };
  }

  const gesucht = [`${quelle.woerterbuch}.default`, ...quelle.einzeln].join(', ');
  throw new Error(`${bezeichnung} fehlt. Gesucht in dieser Reihenfolge: ${gesucht}.`);
}

/**
 * Die Umgebung lesen – oder mit einem Satz scheitern, der sagt, was fehlt.
 *
 * **Kein Schlüsselwert erscheint jemals in einer Meldung.** Eine
 * Fehlermeldung landet im Function-Log, und ein Log ist der letzte Ort, an
 * dem ein Schlüssel stehen sollte. Genannt werden ausschließlich Namen von
 * Variablen und die Art des Fehlers.
 */
export function leseSupabaseUmgebung(
  env: Record<string, string | undefined>,
): SupabaseUmgebung {
  const url = gesetzt(env['SUPABASE_URL']);
  if (url === undefined) {
    throw new Error('SUPABASE_URL fehlt. Die Edge-Laufzeit setzt sie normalerweise selbst.');
  }

  const publishable = schluessel(env, PUBLISHABLE, 'Der Publishable Key');
  const secret = schluessel(env, SECRET, 'Der Secret Key');

  return {
    url,
    publishableKey: publishable.wert,
    secretKey: secret.wert,
    herkunft: {
      url: 'SUPABASE_URL',
      publishableKey: publishable.herkunft,
      secretKey: secret.herkunft,
    },
  };
}
