/**
 * LexiFlow – Anmeldung, Registrierung und Wiederherstellung für Lernende.
 *
 * ## Was in dieser Datei steht – und was nicht
 *
 * Hier steht der **Mantel**: Herkunft prüfen, JSON lesen, Ports bauen,
 * `handle` aufrufen, antworten. Keine Entscheidung. Alles, was entscheidet,
 * steht in `core.ts` und ist dort mit Fakes geprüft – jeder Fall: falscher
 * Code, abgelaufene Einladung, voller Kurs, zu viele Versuche, ein halb
 * angelegtes Konto.
 *
 * Diese Trennung ist der Grund, warum von „ungeprüft" nur noch dreißig Zeilen
 * übrig sind. Was an ihnen offen bleibt, bleibt offen: Der Deno-Mantel und das
 * Deployment sind **nie gelaufen** – es gibt kein Supabase-Projekt und keine
 * Schlüssel. Das steht so auch in § 7.1 der Sprintdokumentation.
 *
 * ## Warum die Ports so geschnitten sind
 *
 * Jeder Port ist eine Frage, keine Fähigkeit. `consumeInvite` belegt einen
 * Platz, statt eine Tabelle herauszugeben; `setPassword` setzt ein Kennwort,
 * statt ein Konto zu verwalten. Wer den Kern liest, sieht damit genau, was
 * diese Funktion überhaupt tun kann – und was nicht.
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
    // Diese Antworten enthalten Tokens und Codes. Sie gehören in keinen
    // Zwischenspeicher – auch nicht in den des Browsers.
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  };
}

/** Nur die eigenen Auslieferungen dürfen diese Funktion aufrufen. */
function erlaubterUrsprung(anfrage: Request): string | undefined {
  const erlaubt = (Deno.env.get('LEXIFLOW_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((eintrag) => eintrag.trim())
    .filter(Boolean);
  const ursprung = anfrage.headers.get('origin') ?? '';
  return erlaubt.includes(ursprung) ? ursprung : undefined;
}

/**
 * Eine grobe Kennzeichnung des Absenders für die Bremse.
 *
 * Gehasht und nirgends gespeichert: Sie geht nur in den Schlüssel der Bremse
 * ein. Eine IP-Adresse im Klartext in einer Tabelle wäre ein personenbezogenes
 * Datum, das dieses Produkt nicht braucht.
 */
async function herkunftAus(anfrage: Request): Promise<string> {
  const roh =
    anfrage.headers.get('cf-connecting-ip') ??
    anfrage.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unbekannt';
  const puffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(roh));
  return [...new Uint8Array(puffer)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(text: string): Promise<string> {
  const puffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(puffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bastlePorts(): Ports {
  const projektUrl = Deno.env.get('SUPABASE_URL')!;
  const publishable = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
  /*
    Der geheime Schlüssel steht ausschließlich in den Function Secrets. Er
    gelangt in kein Bündel, in keine Umgebungsvariable des Frontends und in
    keine Antwort.
  */
  const geheim = Deno.env.get('SUPABASE_SECRET_KEY')!;

  const ohneSitzung = { auth: { persistSession: false, autoRefreshToken: false } };
  const oeffentlich = createClient(projektUrl, publishable, ohneSitzung);
  const dienst = createClient(projektUrl, geheim, ohneSitzung);

  return {
    now: () => new Date(),
    randomBytes: (anzahl) => crypto.getRandomValues(new Uint8Array(anzahl)),
    sha256Hex,

    auth: {
      async signIn(email, password) {
        const { data, error } = await oeffentlich.auth.signInWithPassword({ email, password });
        if (error || !data.session) return undefined;
        return {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        };
      },
      async createUser(email, password) {
        const { data, error } = await dienst.auth.admin.createUser({
          email,
          password,
          // Es gibt keine Adresse zu bestätigen: `.invalid` ist nicht
          // erreichbar, und eine Bestätigungsmail ginge ins Leere.
          email_confirm: true,
        });
        return error || !data.user ? undefined : data.user.id;
      },
      async deleteUser(userId) {
        await dienst.auth.admin.deleteUser(userId);
      },
      async setPassword(userId, password) {
        const { error } = await dienst.auth.admin.updateUserById(userId, { password });
        return !error;
      },
    },

    db: {
      async findLearner(learnerId) {
        const { data } = await dienst
          .from('learner_accounts')
          .select('user_id, recovery_code_hash')
          .eq('learner_id', learnerId)
          .maybeSingle();
        return data ? { userId: data.user_id, recoveryCodeHash: data.recovery_code_hash } : undefined;
      },
      async learnerIdExists(learnerId) {
        const { data } = await dienst
          .from('learner_accounts')
          .select('user_id')
          .eq('learner_id', learnerId)
          .maybeSingle();
        return Boolean(data);
      },
      async consumeInvite(codeHash) {
        const { data } = await dienst.rpc('consume_invite_by_hash', { p_hash: codeHash });
        return data ?? undefined;
      },
      async releaseInvite(codeHash) {
        await dienst.rpc('release_invite_by_hash', { p_hash: codeHash });
      },
      async createLearnerAccount(input) {
        const { error } = await dienst.rpc('create_learner_account', {
          p_user: input.userId,
          p_learner_id: input.learnerId,
          p_display_name: input.displayName,
          p_short_code: input.shortCode,
          p_recovery_hash: input.recoveryHash,
          p_course: input.courseId,
        });
        // Absichtlich hart: Der Kern baut dann zurück (Konto löschen, Platz
        // freigeben). Ein stiller Fehlschlag hinterließe ein halbes Konto.
        if (error) throw new Error(error.message);
      },
      async rotateRecoveryCode(userId, neuerHash) {
        const { error } = await dienst.rpc('rotate_recovery_code', {
          p_user: userId,
          p_new_hash: neuerHash,
        });
        if (error) throw new Error(error.message);
      },
      async noteAttempt(schluessel, hoechstzahl, fensterSekunden) {
        const { data, error } = await dienst.rpc('note_auth_attempt', {
          p_schluessel: schluessel,
          p_hoechstzahl: hoechstzahl,
          p_fenster: `${fensterSekunden} seconds`,
        });
        // Fällt die Bremse aus, wird gebremst – nicht durchgewinkt.
        return error ? false : Boolean(data);
      },
    },
  };
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

  const antwort = await handle(eingabe, await herkunftAus(anfrage), bastlePorts());
  return new Response(JSON.stringify(antwort.body), {
    status: antwort.status,
    headers: kopfzeilen(ursprung),
  });
});
