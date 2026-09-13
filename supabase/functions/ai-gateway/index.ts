/**
 * LexiFlow – der einzige Weg vom Portal zu einem KI-Anbieter.
 *
 * ## Was in dieser Datei steht – und was nicht
 *
 * Der **Mantel**: Herkunft prüfen, Token prüfen, JSON lesen, Ports bauen,
 * `handle` aufrufen, antworten. Keine Entscheidung. Alles, was entscheidet,
 * steht in `core.ts`, `ziel.ts` und `tresor.ts` und ist dort mit Fakes
 * geprüft – 123 Prüfungen, kein einziger Netzaufruf, kein einziger echter
 * Schlüssel.
 *
 * Was offen bleibt, bleibt offen: Dieser Mantel und das Deployment sind **nie
 * gelaufen**. Es gibt kein Supabase-Projekt, keine Function Secrets und keinen
 * Anbieterschlüssel. Das steht so auch in § 7.1 der Sprintdokumentation.
 *
 * ## Die zwei Dinge, die nur hier stehen können
 *
 * 1. **Keine Weiterleitung.** `redirect: 'manual'` – eine Umleitung ist der
 *    übliche Weg, aus einer geprüften Adresse eine ungeprüfte zu machen. Der
 *    Kern bekommt das Ziel gemeldet und lehnt ab.
 * 2. **Eine Größengrenze, die wirklich greift.** Gelesen wird strömend und
 *    abgebrochen, sobald die Grenze überschritten ist. `await antwort.text()`
 *    hätte die Antwort zu diesem Zeitpunkt längst vollständig im Speicher.
 */

// @ts-nocheck -- Deno-Laufzeit mit URL-Importen, nicht Teil des Browser-Projekts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handle, type Ports } from './core.ts';

function kopfzeilen(origin: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  };
}

function erlaubterUrsprung(anfrage: Request): string | undefined {
  const erlaubt = (Deno.env.get('LEXIFLOW_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((eintrag) => eintrag.trim())
    .filter(Boolean);
  const ursprung = anfrage.headers.get('origin') ?? '';
  return erlaubt.includes(ursprung) ? ursprung : undefined;
}

/**
 * Strömend lesen und abbrechen, sobald es zu viel wird.
 *
 * Der Unterschied zu `text()` ist nicht theoretisch: Ein Anbieter, der
 * hundert Megabyte schickt – aus Versehen oder nicht –, füllte sonst den
 * Speicher der Funktion, bevor irgendjemand eine Grenze prüfen könnte.
 */
async function liesBegrenzt(
  antwort: Response,
  hoechstensBytes: number,
): Promise<{ text: string; abgeschnitten: boolean }> {
  const leser = antwort.body?.getReader();
  if (!leser) return { text: '', abgeschnitten: false };

  const stuecke: Uint8Array[] = [];
  let gelesen = 0;

  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    if (!value) continue;
    gelesen += value.byteLength;
    if (gelesen > hoechstensBytes) {
      await leser.cancel();
      return { text: '', abgeschnitten: true };
    }
    stuecke.push(value);
  }

  const zusammen = new Uint8Array(gelesen);
  let stelle = 0;
  for (const stueck of stuecke) {
    zusammen.set(stueck, stelle);
    stelle += stueck.byteLength;
  }
  return { text: new TextDecoder().decode(zusammen), abgeschnitten: false };
}

function bastlePorts(): Ports {
  const projektUrl = Deno.env.get('SUPABASE_URL')!;
  const geheim = Deno.env.get('SUPABASE_SECRET_KEY')!;
  const dienst = createClient(projektUrl, geheim, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    now: () => new Date(),
    randomBytes: (anzahl) => crypto.getRandomValues(new Uint8Array(anzahl)),
    newId: () => crypto.randomUUID(),
    /*
      Die Function Secrets. Der Hauptschlüssel steht ausschließlich hier – in
      keinem Bündel, in keiner Tabelle und in keiner Antwort.
    */
    env: Deno.env.toObject(),

    db: {
      async myRole(userId) {
        const { data } = await dienst.from('profiles').select('role').eq('id', userId).maybeSingle();
        return data?.role ?? undefined;
      },
      async listConnections(userId) {
        const { data } = await dienst
          .from('ai_connections')
          .select('*')
          .eq('owner_id', userId)
          .order('created_at');
        return (data ?? []).map(alsZeile);
      },
      async readConnection(userId, id) {
        const { data } = await dienst
          .from('ai_connections')
          .select('*')
          .eq('owner_id', userId)
          .eq('id', id)
          .maybeSingle();
        return data ? alsZeile(data) : undefined;
      },
      async saveConnection(zeile) {
        const { error } = await dienst.from('ai_connections').upsert({
          id: zeile.id,
          owner_id: zeile.ownerId,
          label: zeile.label,
          adapter: zeile.adapter,
          base_url: zeile.baseUrl,
          model: zeile.model,
          masked_secret: zeile.maskedSecret,
          secret_ciphertext: zeile.secret.ciphertext,
          secret_iv: zeile.secret.iv,
          secret_key_version: zeile.secret.keyVersion,
          active: zeile.active,
        });
        if (error) throw new Error(error.message);
      },
      async deleteConnection(userId, id) {
        await dienst.from('ai_connections').delete().eq('owner_id', userId).eq('id', id);
      },
      async markChecked(userId, id, zeitpunkt) {
        await dienst
          .from('ai_connections')
          .update({ last_checked_at: zeitpunkt })
          .eq('owner_id', userId)
          .eq('id', id);
      },
      async allowedHosts() {
        const { data } = await dienst.from('ai_allowed_hosts').select('host');
        return (data ?? []).map((zeile: { host: string }) => zeile.host);
      },
      async noteCall(userId) {
        /*
          Dieselbe Bremse wie bei der Anmeldung, mit einem eigenen Präfix. Sie
          zählt Versuche und merkt sich nicht, worum es ging – ein Protokoll
          der KI-Aufrufe wäre eine Auswertung über Lehrkräfte.
        */
        const { data, error } = await dienst.rpc('note_auth_attempt', {
          p_schluessel: `ai:${userId}`,
          p_hoechstzahl: 120,
          p_fenster: '3600 seconds',
        });
        return error ? false : Boolean(data);
      },
    },

    http: {
      async senden({ url, headers, body, hoechstensBytes }) {
        const antwort = await fetch(url, {
          method: 'POST',
          headers,
          body,
          // Der Punkt, der nur hier stehen kann.
          redirect: 'manual',
        });

        if (antwort.status >= 300 && antwort.status < 400) {
          return {
            status: antwort.status,
            text: '',
            abgeschnitten: false,
            weiterleitungNach: antwort.headers.get('location') ?? 'unbekannt',
          };
        }

        const gelesen = await liesBegrenzt(antwort, hoechstensBytes);
        return { status: antwort.status, ...gelesen };
      },
    },
  };
}

function alsZeile(zeile: Record<string, unknown>) {
  return {
    id: zeile['id'] as string,
    ownerId: zeile['owner_id'] as string,
    label: zeile['label'] as string,
    adapter: zeile['adapter'] as never,
    baseUrl: zeile['base_url'] as string,
    model: zeile['model'] as string,
    maskedSecret: zeile['masked_secret'] as string,
    secret: {
      ciphertext: zeile['secret_ciphertext'] as string,
      iv: zeile['secret_iv'] as string,
      keyVersion: zeile['secret_key_version'] as number,
    },
    capabilities: [],
    active: zeile['active'] as boolean,
    ...(zeile['last_checked_at'] ? { lastCheckedAt: zeile['last_checked_at'] as string } : {}),
  };
}

/**
 * Wer ruft an?
 *
 * Die Kennung kommt aus dem Token und **nie** aus dem Rumpf. Ein Feld
 * `userId` in der Anfrage gibt es nicht; wäre es da, ließe sich damit im
 * Namen einer anderen Lehrkraft anrufen.
 */
async function wer(anfrage: Request): Promise<string | undefined> {
  const kopf = anfrage.headers.get('authorization') ?? '';
  const token = kopf.toLowerCase().startsWith('bearer ') ? kopf.slice(7).trim() : '';
  if (token === '') return undefined;

  const projektUrl = Deno.env.get('SUPABASE_URL')!;
  const publishable = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
  const client = createClient(projektUrl, publishable, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await client.auth.getUser();
  return data.user?.id;
}

Deno.serve(async (anfrage: Request) => {
  const ursprung = erlaubterUrsprung(anfrage);
  if (!ursprung) return new Response('Nicht erlaubt.', { status: 403 });
  if (anfrage.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: kopfzeilen(ursprung) });
  }
  if (anfrage.method !== 'POST') {
    return new Response(JSON.stringify({ fehler: 'abgelehnt' }), {
      status: 405,
      headers: kopfzeilen(ursprung),
    });
  }

  let eingabe: Record<string, unknown>;
  try {
    eingabe = await anfrage.json();
  } catch {
    return new Response(JSON.stringify({ fehler: 'abgelehnt' }), {
      status: 400,
      headers: kopfzeilen(ursprung),
    });
  }

  const antwort = await handle(eingabe, await wer(anfrage), bastlePorts());
  return new Response(JSON.stringify(antwort.body), {
    status: antwort.status,
    headers: kopfzeilen(ursprung),
  });
});
