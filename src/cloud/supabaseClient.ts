import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { RUNTIME_MODE, RUNTIME_MODE_LABELS, mayUseBackend, type RuntimeMode } from '../runtime/mode';
import type { HostedConfig } from '../runtime/hostedConfig';

/**
 * Die einzige Stelle, an der ein Supabase-Client entsteht.
 *
 * ## Der zweite Riegel
 *
 * Der erste ist der Bündler: In der kontofreien PWA, der Lehrkraftdatei und
 * der Lerndatei wird diese Datei nirgends importiert, also liegt sie dort
 * nicht im Bündel (`portableIsolation.test.ts` prüft das am Importgraph).
 *
 * Der zweite ist die Prüfung unten. Sollte je ein Importfehler den Cloudzweig
 * doch in ein portables Bündel ziehen, käme er trotzdem nicht ins Netz –
 * `mayUseBackend` ist dann `false`, und statt einer stillen Verbindung gibt es
 * eine Ausnahme mit dem Namen des Modus darin.
 *
 * Zwei Riegel für dieselbe Zusage sind keine Doppelung: Der eine ist
 * nachweisbar, der andere überlebt einen Fehler im Nachweis.
 *
 * ## Warum PKCE
 *
 * `flowType: 'pkce'` ist hier keine Geschmacksfrage. Das Portal benutzt
 * `HashRouter`, trägt seine Route also hinter `#`. Der implizite Ablauf gäbe
 * seine Antwort **ebenfalls** hinter `#` zurück und überschriebe damit genau
 * diesen Teil: Die Anwendung landete auf einer unbekannten Seite, und das
 * Zugangstoken stünde in Adresszeile, Verlauf und jedem geteilten Screenshot.
 *
 * PKCE antwortet mit `?code=…` im Abfrageteil. Der verträgt sich mit einer
 * Route hinter der Raute, und der Code ist nach einem Eintausch verbraucht.
 * Siehe `src/runtime/entryUrls.ts`.
 */

/** Der Name, unter dem die Sitzung im Browser liegt. */
export const AUTH_STORAGE_KEY = 'lexiflow-portal-auth';

export function createSupabaseClient(
  config: HostedConfig,
  mode: RuntimeMode = RUNTIME_MODE,
): SupabaseClient {
  if (!mayUseBackend(mode)) {
    throw new Error(
      `Im Modus „${RUNTIME_MODE_LABELS[mode]}“ gibt es kein Backend. Hier darf kein Supabase-Client entstehen.`,
    );
  }

  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      flowType: 'pkce',
      /*
        Die Sitzung überlebt das Schließen des Tabs. Das ist die richtige
        Voreinstellung für ein Werkzeug, das mehrmals täglich geöffnet wird –
        und sie ist widerrufbar: „Abmelden“ räumt den Speicher.
      */
      persistSession: true,
      autoRefreshToken: true,
      /*
        Den Code aus der Adresse selbst einlösen. Ohne das müsste die
        Anwendung das nachbauen, und zwar an genau einer Stelle richtig.
      */
      detectSessionInUrl: true,
      storageKey: AUTH_STORAGE_KEY,
    },
    global: {
      headers: {
        // Damit im Serverlog erkennbar ist, welche Auslieferung spricht.
        'x-lexiflow-client': 'portal',
      },
    },
  });
}
