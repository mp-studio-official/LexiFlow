/**
 * LexiFlow – Anmeldung und Wiederherstellung für Lernende.
 *
 * ## Warum es diese Funktion gibt
 *
 * Supabase Auth führt Konten über E-Mail-Adressen. Lernende haben keine
 * (ADR-5). Diese Funktion ist der **einzige** Ort, an dem aus einer Lern-ID
 * eine technische Adresse wird. Sie erscheint nie in der Oberfläche, ist keine
 * Kontaktadresse, und der Browser erfährt die Bildungsregel nicht – stünde sie
 * im Bündel, könnte jede Person sie für jede Lern-ID nachrechnen.
 *
 * ## Was diese Funktion ausdrücklich NICHT kann
 *
 * Ein fremdes Kennwort setzen. Es gibt keine Aktion dafür, und das ist keine
 * Auslassung: Wer ein fremdes Kennwort setzen kann, kann sich als diese Person
 * anmelden – und sähe damit ihren Lernstand. Sämtliche Zugriffsregeln aus
 * Phase 2 wären mit einem Klick umgangen, und niemand würde es bemerken.
 *
 * Die Wiederherstellung geht deshalb ausschließlich über den Code, den die
 * lernende Person selbst hat.
 *
 * ## Stand: nicht ausgeführt
 *
 * Dieser Quelltext ist geschrieben und gelesen, aber **nie gelaufen**: Es gibt
 * in diesem Sprint kein Supabase-Projekt, keine Schlüssel und kein Deployment.
 * Was hier steht, ist ein Entwurf mit Begründung – kein geprüfter Dienst. Der
 * Unterschied gehört in jeden Bericht (§ 7 der Sprintdokumentation).
 *
 * Läuft unter Deno in der Supabase-Edge-Laufzeit. Die Importe unten sind
 * deshalb URL-Importe und für TypeScript in diesem Projekt nicht auflösbar –
 * `tsconfig.json` schließt `supabase/` bewusst aus.
 */

// @ts-nocheck -- Deno-Laufzeit, nicht Teil des Browser-Projekts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Die Endung, unter der die technischen Adressen liegen. */
const TECHNISCHE_DOMAIN = 'lernende.lexiflow.invalid';

/*
  `.invalid` ist von der IETF für genau diesen Zweck reserviert (RFC 2606):
  Eine Adresse darunter kann es im Netz nicht geben. Damit ist ausgeschlossen,
  dass je eine Nachricht an eine lernende Person hinausgeht – auch dann nicht,
  wenn jemand später versehentlich eine Benachrichtigung einschaltet.
*/

/** Eine Meldung für jeden Fehlschlag – siehe `src/cloud/learnerAuth.ts`. */
const ABGELEHNT = { fehler: 'abgelehnt' };

function antwort(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'authorization, apikey, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
      // Diese Antwort enthält Tokens. Sie gehört in keinen Zwischenspeicher.
      'cache-control': 'no-store',
    },
  });
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

function technischeAdresse(learnerId: string): string {
  /*
    Kleinschreibung und ein enger Zeichenvorrat. Eine Lern-ID wird vorgelesen
    und abgeschrieben; alles andere wäre eine Fehlerquelle, und ein zu weiter
    Zeichenvorrat wäre zusätzlich eine Einladung, hier etwas einzuschmuggeln,
    das anderswo als Adresse gelesen wird.
  */
  const sauber = learnerId.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(sauber)) return '';
  return `${sauber}@${TECHNISCHE_DOMAIN}`;
}

async function sha256Hex(text: string): Promise<string> {
  const daten = new TextEncoder().encode(text);
  const puffer = await crypto.subtle.digest('SHA-256', daten);
  return [...new Uint8Array(puffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (anfrage: Request) => {
  const ursprung = erlaubterUrsprung(anfrage);
  if (!ursprung) return new Response('Nicht erlaubt.', { status: 403 });
  if (anfrage.method === 'OPTIONS') return antwort({}, 204, ursprung);
  if (anfrage.method !== 'POST') return antwort(ABGELEHNT, 405, ursprung);

  let eingabe: Record<string, unknown>;
  try {
    eingabe = await anfrage.json();
  } catch {
    return antwort(ABGELEHNT, 400, ursprung);
  }

  const aktion = String(eingabe.aktion ?? '');
  const learnerId = String(eingabe.learnerId ?? '');
  const adresse = technischeAdresse(learnerId);
  if (!adresse) return antwort(ABGELEHNT, 400, ursprung);

  const projektUrl = Deno.env.get('SUPABASE_URL')!;
  const publishable = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
  /*
    Der geheime Schlüssel steht ausschließlich hier in den Function Secrets.
    Er gelangt in kein Bündel, in keine Umgebungsvariable des Frontends und in
    keine Antwort.
  */
  const geheim = Deno.env.get('SUPABASE_SECRET_KEY')!;

  /** Anmelden und die Tokens zurückgeben – mit dem öffentlichen Schlüssel. */
  async function anmelden(password: string): Promise<Response> {
    const client = createClient(projektUrl, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email: adresse, password });
    if (error || !data.session) return antwort(ABGELEHNT, 400, ursprung);
    return antwort(
      {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
      200,
      ursprung,
    );
  }

  if (aktion === 'anmelden') {
    const password = String(eingabe.password ?? '');
    if (password.length < 1) return antwort(ABGELEHNT, 400, ursprung);
    return anmelden(password);
  }

  if (aktion === 'wiederherstellen') {
    const code = String(eingabe.recoveryCode ?? '');
    const neuesKennwort = String(eingabe.newPassword ?? '');
    /*
      Die Mindestlänge steht hier und nicht nur im Formular. Ein Formular ist
      eine Bitte; ein Server ist eine Regel.
    */
    if (code.length < 4 || neuesKennwort.length < 8) return antwort(ABGELEHNT, 400, ursprung);

    const dienst = createClient(projektUrl, geheim, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const hash = await sha256Hex(code.trim().toUpperCase());
    const { data: konto } = await dienst
      .from('learner_accounts')
      .select('user_id')
      .eq('learner_id', learnerId.trim().toLowerCase())
      .eq('recovery_code_hash', hash)
      .maybeSingle();

    // Unbekannte Lern-ID und falscher Code sehen von außen gleich aus.
    if (!konto) return antwort(ABGELEHNT, 400, ursprung);

    const { error: setzfehler } = await dienst.auth.admin.updateUserById(konto.user_id, {
      password: neuesKennwort,
    });
    if (setzfehler) return antwort(ABGELEHNT, 400, ursprung);

    /*
      Der Code bleibt gültig. Er ist das einzige, was diese Person zwischen
      sich und ein verlorenes Konto stellen kann – ihn nach einmaligem
      Gebrauch zu verbrennen hieße, beim zweiten Vergessen endgültig
      auszusperren. Was ihn wertlos macht, ist das Anlegen eines neuen Codes,
      und das entscheidet die lernende Person selbst.
    */
    return anmelden(neuesKennwort);
  }

  return antwort(ABGELEHNT, 400, ursprung);
});
