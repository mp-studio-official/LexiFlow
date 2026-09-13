import { isRole } from '../runtime/access';
import type { AuthRepository, Role, Session } from '../application/repositories';
import type { LearnerAuth } from './learnerAuth';

/**
 * `AuthRepository`, erfüllt mit Supabase Auth.
 *
 * ## Warum hier ein eigener, schmaler Ausschnitt steht
 *
 * `SupabaseClient['auth']` hat ein paar Dutzend Methoden. Diese Datei benutzt
 * sechs davon. Sie als eigene Schnittstelle zu beschreiben kostet zwanzig
 * Zeilen und bringt zweierlei: Ein Test kann sie ohne Netz und ohne Bibliothek
 * erfüllen, und wer liest, sieht auf einen Blick, was das Portal von seinem
 * Anmeldedienst überhaupt verlangt.
 *
 * ## Die Rolle steht nicht im Token
 *
 * Supabase kennt Konten, keine Rollen. Die Rolle steht in `profiles` und wird
 * dort von den Zugriffsregeln bewacht. Deshalb reicht `getSession()` nicht –
 * jede Sitzung wird um eine Abfrage der eigenen Rolle ergänzt.
 *
 * Das ist ein zusätzlicher Umlauf und die richtige Richtung: Eine Rolle im
 * Token wäre schnell und stünde in einem Wert, den der Browser mit sich trägt.
 * Eine Rolle in der Tabelle ist genau so aktuell wie die Tabelle, und eine
 * zurückgenommene Lehrkraftrolle wirkt sofort und nicht erst nach Ablauf.
 *
 * Kommt die Abfrage nicht durch, gilt die **engste** Rolle. Eine Sitzung ohne
 * lesbares Profil darf nicht als Lehrkraft durchgehen.
 */

/** Der Ausschnitt aus `supabase.auth`, den das Portal benutzt. */
export interface SupabaseAuthSlice {
  getSession(): Promise<{ data: { session: RohSitzung | null } }>;
  signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<{ data: { session: RohSitzung | null }; error: { message: string } | null }>;
  setSession(input: {
    access_token: string;
    refresh_token: string;
  }): Promise<{ data: { session: RohSitzung | null }; error: { message: string } | null }>;
  signOut(): Promise<{ error: { message: string } | null }>;
  onAuthStateChange(
    listener: (ereignis: string, session: RohSitzung | null) => void,
  ): { data: { subscription: { unsubscribe(): void } } };
  resetPasswordForEmail(
    email: string,
    options: { redirectTo: string },
  ): Promise<{ error: { message: string } | null }>;
  updateUser(input: { password: string }): Promise<{ error: { message: string } | null }>;
}

/** Was von einer Supabase-Sitzung hier gebraucht wird. */
export interface RohSitzung {
  user: { id: string };
  expires_at?: number | undefined;
}

/** Die eigene Rolle nachschlagen – eine Abfrage auf `profiles`. */
export type RolleLaden = (userId: string) => Promise<Role | undefined>;

export const ANMELDUNG_FEHLGESCHLAGEN = 'E-Mail-Adresse oder Kennwort stimmen nicht.';

function ablaufAls(session: RohSitzung): string | undefined {
  // Supabase zählt in Sekunden seit 1970, die Oberfläche zeigt ein Datum.
  return session.expires_at === undefined
    ? undefined
    : new Date(session.expires_at * 1000).toISOString();
}

export function createSupabaseAuthRepository(deps: {
  auth: SupabaseAuthSlice;
  ladeRolle: RolleLaden;
  learner: LearnerAuth;
  /** Wohin der Verweis aus der Wiederherstellungs-E-Mail führt. */
  recoveryRedirect: string;
}): AuthRepository {
  async function alsSitzung(roh: RohSitzung | null | undefined): Promise<Session | undefined> {
    if (!roh) return undefined;
    let rolle: Role | undefined;
    try {
      rolle = await deps.ladeRolle(roh.user.id);
    } catch {
      rolle = undefined;
    }
    const ablauf = ablaufAls(roh);
    return {
      userId: roh.user.id,
      // Im Zweifel die engste Rolle – siehe oben.
      role: isRole(rolle) ? rolle : 'student',
      ...(ablauf === undefined ? {} : { expiresAt: ablauf }),
    };
  }

  async function erwarteSitzung(
    roh: RohSitzung | null | undefined,
    fehlermeldung: string,
  ): Promise<Session> {
    const sitzung = await alsSitzung(roh);
    if (!sitzung) throw new Error(fehlermeldung);
    return sitzung;
  }

  return {
    async currentSession() {
      const { data } = await deps.auth.getSession();
      return alsSitzung(data.session);
    },

    async signInWithEmail(email, password) {
      const { data, error } = await deps.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      /*
        Der Fehlertext von Supabase wird **nicht** durchgereicht. Er
        unterscheidet Fälle, die hier niemand unterscheiden soll – und er ist
        englisch.
      */
      if (error || !data.session) throw new Error(ANMELDUNG_FEHLGESCHLAGEN);
      return erwarteSitzung(data.session, ANMELDUNG_FEHLGESCHLAGEN);
    },

    async signInWithLearnerId(learnerId, password) {
      /*
        Zwei Schritte, und der erste geht nicht an Supabase Auth: Die
        Serverfunktion prüft die Lern-ID und gibt Tokens zurück; erst danach
        bekommt der Client eine Sitzung. Der Browser erfährt dabei nie die
        technische Adresse hinter der Lern-ID.
      */
      const tokens = await deps.learner.anmelden(learnerId, password);
      const { data, error } = await deps.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      if (error) throw new Error('Die Anmeldung konnte nicht übernommen werden.');
      return erwarteSitzung(data.session, 'Die Anmeldung konnte nicht übernommen werden.');
    },

    async signOut() {
      await deps.auth.signOut();
    },

    onSessionChange(listener) {
      const { data } = deps.auth.onAuthStateChange((_ereignis, roh) => {
        /*
          Bewusst ohne `await` an der Aufrufstelle: Der Rückruf kommt aus der
          Bibliothek und darf nicht auf eine Abfrage warten. Die Rolle wird
          nachgereicht, und bis dahin meldet niemand etwas.
        */
        void alsSitzung(roh).then(listener);
      });
      return () => data.subscription.unsubscribe();
    },

    async requestEmailRecovery(email) {
      /*
        Der Rückgabewert wird verworfen, und das ist der Punkt. Supabase
        antwortet auch bei unbekannten Adressen freundlich; wer den Fehler
        hier durchreichte, baute daraus ein Verzeichnis aller Konten.
      */
      await deps.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: deps.recoveryRedirect,
      });
    },

    async redeemRecoveryCode(input) {
      const tokens = await deps.learner.wiederherstellen(input);
      const { data, error } = await deps.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      if (error) throw new Error('Die Anmeldung konnte nicht übernommen werden.');
      return erwarteSitzung(data.session, 'Die Anmeldung konnte nicht übernommen werden.');
    },

    async setPassword(newPassword) {
      const { error } = await deps.auth.updateUser({ password: newPassword });
      if (error) {
        /*
          Hier **darf** der Grund heraus: Es geht um das eigene Kennwort, und
          „zu kurz“ ist eine Auskunft, die der Person hilft und niemandem
          etwas verrät. Der englische Text von Supabase bleibt trotzdem
          draußen.
        */
        throw new Error(
          'Das Kennwort wurde nicht übernommen. Es muss mindestens acht Zeichen haben.',
        );
      }
    },
  };
}
