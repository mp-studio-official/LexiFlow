/**
 * Der Anmeldeweg der Lernenden – über eine Serverfunktion, nicht direkt.
 *
 * ## Warum nicht einfach `signInWithPassword`
 *
 * Supabase Auth führt Konten über E-Mail-Adressen. Lernende haben keine
 * (ADR-5): Eine Klasse siebter Jahrgangsstufe hat keine verlässlichen privaten
 * Adressen, und sie zu verlangen verschiebt ein Datenschutzproblem in die
 * Elternhäuser.
 *
 * Also bildet **ausschließlich die Serverfunktion** aus der Lern-ID eine
 * technische Adresse. Sie erscheint nie in der Oberfläche, ist keine
 * Kontaktadresse und gehört niemandem. Der Browser kennt sie nicht – täte er
 * es, stünde die Bildungsregel im Bündel, und jede Person könnte daraus die
 * Adresse jeder Lern-ID errechnen.
 *
 * ## Warum ein austauschbarer Transport
 *
 * Dieselbe Entscheidung wie beim Gemini-Zweig in Sprint 4C: Der Aufruf ins
 * Netz ist ein Parameter, kein Import. Damit lässt sich jeder Fall – Erfolg,
 * falsches Kennwort, Serverfehler, unsinnige Antwort – prüfen, ohne dass je
 * eine Anfrage das Testgerät verlässt.
 */

/** Was diese Datei vom Netz braucht – mehr nicht. */
export interface LearnerAuthTransport {
  (anfrage: { url: string; body: unknown }): Promise<{ status: number; body: unknown }>;
}

export interface LearnerTokens {
  accessToken: string;
  refreshToken: string;
}

/** Was bei einer Registrierung zusätzlich zurückkommt – genau einmal. */
export interface LearnerRegistrierung extends LearnerTokens {
  learnerId: string;
  recoveryCode: string;
}

/** Die Adresse der Funktion, abgeleitet aus der Projektadresse. */
export function learnerAuthEndpoint(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/learner-auth`;
}

/**
 * Eine Meldung für jeden Fehlschlag.
 *
 * „Lern-ID unbekannt“ gegen „Kennwort falsch“ zu unterscheiden wäre
 * freundlicher und wäre ein Verzeichnis: Wer Lern-IDs durchprobiert, erführe,
 * welche es gibt – in einer Schule ist das eine Namensliste.
 */
export const ANMELDUNG_FEHLGESCHLAGEN = 'Lern-ID oder Kennwort stimmen nicht.';
export const WIEDERHERSTELLUNG_FEHLGESCHLAGEN = 'Diese Angaben passen nicht zusammen.';
export const REGISTRIERUNG_FEHLGESCHLAGEN = 'Dieser Code gilt nicht.';
const NETZ_FEHLER = 'Der Anmeldedienst ist gerade nicht erreichbar. Bitte später noch einmal.';

function tokensAus(body: unknown): LearnerTokens | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const werte = body as Record<string, unknown>;
  const accessToken = werte['access_token'];
  const refreshToken = werte['refresh_token'];
  if (typeof accessToken !== 'string' || accessToken === '') return undefined;
  if (typeof refreshToken !== 'string' || refreshToken === '') return undefined;
  return { accessToken, refreshToken };
}

async function rufe(
  transport: LearnerAuthTransport,
  url: string,
  body: unknown,
  fehlermeldung: string,
): Promise<LearnerTokens> {
  let antwort: { status: number; body: unknown };
  try {
    antwort = await transport({ url, body });
  } catch {
    /*
      Ein Netzfehler ist etwas anderes als eine Ablehnung, und die Oberfläche
      soll das auch sagen: Beim einen hilft Warten, beim anderen nicht.
    */
    throw new Error(NETZ_FEHLER);
  }

  if (antwort.status >= 500) throw new Error(NETZ_FEHLER);

  const tokens = tokensAus(antwort.body);
  /*
    Kein Blick auf einen Fehlertext aus der Antwort. Was zählt, ist, ob
    brauchbare Tokens da sind – alles andere ist dieselbe Ablehnung. So kann
    auch eine geschwätzigere Serverfassung später nichts durchreichen, was
    hier niemand sehen soll.
  */
  if (antwort.status !== 200 || !tokens) throw new Error(fehlermeldung);
  return tokens;
}

function textFeld(body: unknown, name: string): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const wert = (body as Record<string, unknown>)[name];
  return typeof wert === 'string' && wert.length > 0 ? wert : undefined;
}

export function createLearnerAuth(options: {
  supabaseUrl: string;
  transport: LearnerAuthTransport;
}) {
  const url = learnerAuthEndpoint(options.supabaseUrl);

  return {
    /** Anmeldung mit Lern-ID und Kennwort. */
    async anmelden(learnerId: string, password: string): Promise<LearnerTokens> {
      return rufe(
        options.transport,
        url,
        { aktion: 'anmelden', learnerId: learnerId.trim(), password },
        ANMELDUNG_FEHLGESCHLAGEN,
      );
    },

    /**
     * Wiederherstellung mit dem eigenen Code – und gleich ein neues Kennwort.
     *
     * In einem Schritt, nicht in zweien. Ein Zwischenzustand „Code stimmte,
     * Kennwort noch offen“ wäre eine halb offene Tür: Wer den Code hat,
     * hätte damit ein Zeitfenster, in dem das Konto niemandem gehört.
     */
    async wiederherstellen(input: {
      learnerId: string;
      recoveryCode: string;
      newPassword: string;
    }): Promise<LearnerTokens> {
      return rufe(
        options.transport,
        url,
        {
          aktion: 'wiederherstellen',
          learnerId: input.learnerId.trim(),
          recoveryCode: input.recoveryCode.trim(),
          newPassword: input.newPassword,
        },
        WIEDERHERSTELLUNG_FEHLGESCHLAGEN,
      );
    },
    /**
     * Ein Konto anlegen – mit einem Einladungscode als Eintrittskarte.
     *
     * Die Lern-ID vergibt der Server, nicht der Browser: Sie muss eindeutig
     * sein, und Eindeutigkeit entscheidet sich dort, wo die Tabelle steht.
     */
    async registrieren(input: {
      inviteCode: string;
      displayName: string;
      password: string;
    }): Promise<LearnerRegistrierung> {
      let antwort: { status: number; body: unknown };
      try {
        antwort = await options.transport({
          url,
          body: {
            aktion: 'registrieren',
            inviteCode: input.inviteCode.trim(),
            displayName: input.displayName.trim(),
            password: input.password,
          },
        });
      } catch {
        throw new Error(NETZ_FEHLER);
      }
      if (antwort.status >= 500) throw new Error(NETZ_FEHLER);

      const tokens = tokensAus(antwort.body);
      const learnerId = textFeld(antwort.body, 'learnerId');
      const recoveryCode = textFeld(antwort.body, 'recoveryCode');
      /*
        Alle drei oder keines. Eine Registrierung ohne Wiederherstellungscode
        wäre ein Konto, das beim ersten vergessenen Kennwort verloren ist –
        und niemand würde es merken, bis es zu spät ist.
      */
      if (antwort.status !== 200 || !tokens || !learnerId || !recoveryCode) {
        throw new Error(REGISTRIERUNG_FEHLGESCHLAGEN);
      }
      return { ...tokens, learnerId, recoveryCode };
    },
  };
}

export type LearnerAuth = ReturnType<typeof createLearnerAuth>;

/**
 * Der Transport für den Ernstfall.
 *
 * ## Warum hier kein `Authorization`-Kopf steht
 *
 * Er stand hier, mit dem Publishable Key als Wert. Das war aus zwei Gründen
 * falsch.
 *
 * **Erstens ist ein neuer Publishable Key kein JWT.** Die alten `anon`-Keys
 * waren welche, und daher stammt die Gewohnheit, sie als `Bearer` zu senden.
 * Die neuen (`sb_publishable_…`) sind es nicht. Ein Empfänger, der dort ein
 * JWT erwartet, lehnt ab – und die Meldung sagt dann „ungültiges Token", was
 * in die falsche Richtung zeigt.
 *
 * **Zweitens braucht diese Funktion keinen.** Sie läuft mit
 * `verify_jwt = false` (siehe `supabase/config.toml`) und autorisiert im
 * eigenen Code: Herkunft, Einladungscode, Wiederherstellungscode, Bremse.
 *
 * Bleibt `apikey`. Der Publishable Key ist kein Geheimnis (ADR-3), steht
 * ohnehin im Bündel, und die Funktionsschicht erwartet ihn dort.
 */
export function createFetchTransport(publishableKey: string): LearnerAuthTransport {
  return async ({ url, body }) => {
    const antwort = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: publishableKey,
      },
      body: JSON.stringify(body),
      // Kein Cookie, kein Zwischenspeicher: Hier geht ein Kennwort hinaus.
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });

    let gelesen: unknown;
    try {
      gelesen = await antwort.json();
    } catch {
      gelesen = undefined;
    }
    return { status: antwort.status, body: gelesen };
  };
}
