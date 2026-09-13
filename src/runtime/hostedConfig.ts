/**
 * Die beiden Werte, die das Portal überhaupt braucht – und was passiert, wenn
 * sie fehlen.
 *
 * ## Nur zwei, und beide dürfen öffentlich sein
 *
 * Projekt-URL und Publishable Key. Mehr gelangt nie in ein Browserbündel. Der
 * Secret Key und die Service Role existieren ausschließlich in den Function
 * Secrets und werden hier nicht einmal erwähnt, damit niemand auf die Idee
 * kommt, sie „nur kurz" über eine Umgebungsvariable hereinzureichen.
 *
 * Dass der Publishable Key öffentlich ist, ist keine Nachlässigkeit, sondern
 * die Bauart: Er identifiziert das Projekt und erlaubt für sich genommen gar
 * nichts. Die gesamte Sicherheit liegt in den Zugriffsregeln der Datenbank.
 * Wer das eine liest, sollte das andere mitlesen.
 *
 * ## Fehlende Konfiguration ist ein Zustand, kein Absturz
 *
 * Ein Portal ohne Werte ist der Normalfall beim ersten Auschecken und beim
 * ersten Deployment. Es darf deshalb nicht weiß bleiben und keine Ausnahme
 * werfen, sondern muss sagen, was fehlt und wo es hingehört. Deshalb gibt
 * diese Datei ein Ergebnis zurück und wirft nicht.
 */

export interface HostedConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export type HostedConfigResult =
  | { ok: true; config: HostedConfig }
  | { ok: false; missing: readonly string[]; invalid: readonly string[] };

/** Die Namen, unter denen die Werte erwartet werden – auch für `.env.example`. */
export const HOSTED_ENV_KEYS = {
  url: 'VITE_SUPABASE_URL',
  key: 'VITE_SUPABASE_PUBLISHABLE_KEY',
} as const;

/**
 * Sieht das nach einer Supabase-Projekt-URL aus?
 *
 * Absichtlich großzügig bei der Form und streng beim Protokoll: Ein eigenes
 * Hosting oder eine lokale Entwicklungsinstanz hat eine andere Adresse als
 * `*.supabase.co`, und die auszuschließen wäre falsch. Was **nicht**
 * verhandelbar ist, ist HTTPS – über eine ungesicherte Verbindung ginge das
 * Zugangstoken jeder anmeldenden Person im Klartext hinaus.
 *
 * `http://localhost` bleibt erlaubt, weil die lokale Supabase-Instanz genau so
 * erreichbar ist und dort kein Netzweg dazwischenliegt.
 */
export function looksLikeSupabaseUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}

/**
 * Sieht das nach einem Schlüssel aus?
 *
 * Wie in `ai/gemini/credentials.ts`: Diese Prüfung fängt den Tippfehler und
 * den vergessenen Platzhalter ab, nicht das Format. Ob der Schlüssel gilt,
 * weiß nur Supabase.
 */
export function looksLikePublishableKey(value: string): boolean {
  const key = value.trim();
  if (key.length < 20 || key.length > 500) return false;
  if (/\s/.test(key)) return false;
  // Offensichtliche Platzhalter aus `.env.example` sind kein Schlüssel.
  return !/^(dein|your|xxx|placeholder|<)/i.test(key);
}

/**
 * Liest die Konfiguration aus einer Umgebung.
 *
 * Die Umgebung wird übergeben und nicht importiert. Das ist der Unterschied
 * zwischen einer Funktion, die man prüfen kann, und einer, die man nur laufen
 * lassen kann: `import.meta.env` lässt sich im Test nicht sauber verstellen.
 */
export function readHostedConfig(env: Record<string, string | undefined>): HostedConfigResult {
  const rohUrl = env[HOSTED_ENV_KEYS.url]?.trim() ?? '';
  const rohKey = env[HOSTED_ENV_KEYS.key]?.trim() ?? '';

  const missing: string[] = [];
  if (!rohUrl) missing.push(HOSTED_ENV_KEYS.url);
  if (!rohKey) missing.push(HOSTED_ENV_KEYS.key);
  if (missing.length > 0) return { ok: false, missing, invalid: [] };

  const invalid: string[] = [];
  if (!looksLikeSupabaseUrl(rohUrl)) invalid.push(HOSTED_ENV_KEYS.url);
  if (!looksLikePublishableKey(rohKey)) invalid.push(HOSTED_ENV_KEYS.key);
  if (invalid.length > 0) return { ok: false, missing: [], invalid };

  return { ok: true, config: { supabaseUrl: rohUrl, supabasePublishableKey: rohKey } };
}

/**
 * Der Satz, der auf der Einrichtungsseite steht.
 *
 * Er nennt die Variablen beim Namen. Eine Meldung wie „Konfiguration
 * unvollständig" zwingt jemanden, im Quelltext nachzusehen; diese hier sagt,
 * was einzutragen ist.
 */
export function describeHostedConfigProblem(result: HostedConfigResult): string {
  if (result.ok) return '';
  if (result.missing.length > 0) {
    return `Diese Werte fehlen: ${result.missing.join(' und ')}. Sie gehören in die Datei .env (Vorlage: .env.example) beziehungsweise in die Variablen des Deployments.`;
  }
  return `Diese Werte sind unbrauchbar: ${result.invalid.join(' und ')}. Die Projektadresse muss mit https:// beginnen, der Schlüssel ist eine längere Zeichenfolge ohne Leerzeichen.`;
}
