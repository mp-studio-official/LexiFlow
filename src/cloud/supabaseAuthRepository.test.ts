import { describe, expect, it, vi } from 'vitest';
import {
  ANMELDUNG_FEHLGESCHLAGEN,
  createSupabaseAuthRepository,
  type RohSitzung,
  type SupabaseAuthSlice,
} from './supabaseAuthRepository';
import type { LearnerAuth } from './learnerAuth';
import type { Role } from '../application/repositories';

/**
 * Die Anmeldung des Portals, geprüft ohne Netz und ohne Bibliothek.
 *
 * Der schmale Ausschnitt `SupabaseAuthSlice` zahlt sich hier aus: Eine
 * Fälschung davon sind dreißig Zeilen, und damit lässt sich jeder Fall
 * durchspielen, den ein echter Dienst erzeugen könnte.
 */

const NUTZER = '00000000-0000-4000-8000-000000000001';
const TOKENS = { accessToken: 'test-zugang', refreshToken: 'test-erneuerung' };

function sitzung(userId = NUTZER, expiresAt?: number): RohSitzung {
  return { user: { id: userId }, ...(expiresAt === undefined ? {} : { expires_at: expiresAt }) };
}

function fakeAuth(over: Partial<SupabaseAuthSlice> = {}) {
  let hörer: ((ereignis: string, session: RohSitzung | null) => void) | undefined;
  const abbestellt = vi.fn();
  const basis: SupabaseAuthSlice = {
    getSession: async () => ({ data: { session: null } }),
    signInWithPassword: async () => ({ data: { session: sitzung() }, error: null }),
    setSession: async () => ({ data: { session: sitzung() }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: (listener) => {
      hörer = listener;
      return { data: { subscription: { unsubscribe: abbestellt } } };
    },
    resetPasswordForEmail: async () => ({ error: null }),
    updateUser: async () => ({ error: null }),
    ...over,
  };
  return { auth: basis, melde: (s: RohSitzung | null) => hörer?.('X', s), abbestellt };
}

function fakeLearner(over: Partial<LearnerAuth> = {}): LearnerAuth {
  return {
    anmelden: async () => TOKENS,
    wiederherstellen: async () => TOKENS,
    registrieren: async () => ({ ...TOKENS, learnerId: 'fuchs-1234', recoveryCode: 'AAAA-BBBB-CCCC-DDDD' }),
    ...over,
  };
}

function baue(options: {
  auth?: SupabaseAuthSlice;
  rolle?: Role | undefined;
  ladeRolle?: (userId: string) => Promise<Role | undefined>;
  learner?: LearnerAuth;
  bestaetigeCode?: (code: string) => Promise<boolean>;
} = {}) {
  const { auth } = options.auth ? { auth: options.auth } : fakeAuth();
  return createSupabaseAuthRepository({
    auth,
    ladeRolle: options.ladeRolle ?? (async () => options.rolle ?? 'teacher'),
    learner: options.learner ?? fakeLearner(),
    bestaetigeCode: options.bestaetigeCode ?? (async () => true),
    recoveryRedirect: 'https://beispiel.invalid/LexiFlow/portal/#/kennwort-neu',
  });
}

describe('die laufende Sitzung', () => {
  it('ist undefined, solange niemand angemeldet ist', async () => {
    expect(await baue().currentSession()).toBeUndefined();
  });

  it('trägt die Rolle aus dem Profil, nicht aus dem Token', async () => {
    const { auth } = fakeAuth({ getSession: async () => ({ data: { session: sitzung() } }) });
    const repo = baue({ auth, rolle: 'teacher' });
    expect(await repo.currentSession()).toMatchObject({ userId: NUTZER, role: 'teacher' });
  });

  it('rechnet den Ablauf in ein Datum um', async () => {
    const { auth } = fakeAuth({
      getSession: async () => ({ data: { session: sitzung(NUTZER, 1_800_000_000) } }),
    });
    const gefunden = await baue({ auth }).currentSession();
    expect(gefunden?.expiresAt).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });

  it('fällt auf die engste Rolle zurück, wenn das Profil nicht lesbar ist', async () => {
    /*
      Der wichtigste Fall in dieser Datei. Eine Sitzung ohne lesbares Profil
      darf nicht als Lehrkraft durchgehen – sonst entschiede ein Netzfehler
      über Berechtigungen.
    */
    const { auth } = fakeAuth({ getSession: async () => ({ data: { session: sitzung() } }) });
    const repo = baue({
      auth,
      ladeRolle: async () => {
        throw new Error('keine Verbindung');
      },
    });
    expect((await repo.currentSession())?.role).toBe('student');
  });

  it('tut dasselbe bei einer unbekannten Rollenangabe', async () => {
    const { auth } = fakeAuth({ getSession: async () => ({ data: { session: sitzung() } }) });
    const repo = baue({ auth, ladeRolle: async () => 'direktorin' as Role });
    expect((await repo.currentSession())?.role).toBe('student');
  });
});

describe('Anmeldung mit E-Mail', () => {
  it('schneidet Leerraum ab und schreibt klein', async () => {
    const signInWithPassword = vi
      .fn<SupabaseAuthSlice['signInWithPassword']>()
      .mockResolvedValue({ data: { session: sitzung() }, error: null });
    const { auth } = fakeAuth({ signInWithPassword });
    await baue({ auth }).signInWithEmail('  Lehrerin@Beispiel.invalid ', 'testkennwort');
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'lehrerin@beispiel.invalid',
      password: 'testkennwort',
    });
  });

  it('reicht den Fehlertext des Dienstes nicht durch', async () => {
    const { auth } = fakeAuth({
      signInWithPassword: async () => ({
        data: { session: null },
        error: { message: 'Invalid login credentials for user teacher@school.example' },
      }),
    });
    const meldung = await baue({ auth })
      .signInWithEmail('x@y.invalid', 'z')
      .catch((e: Error) => e.message);

    expect(meldung).toBe(ANMELDUNG_FEHLGESCHLAGEN);
    expect(meldung).not.toContain('school.example');
  });
});

describe('Anmeldung mit Lern-ID', () => {
  it('geht über die Serverfunktion und übernimmt deren Tokens', async () => {
    const setSession = vi
      .fn<SupabaseAuthSlice['setSession']>()
      .mockResolvedValue({ data: { session: sitzung() }, error: null });
    const anmelden = vi.fn<LearnerAuth['anmelden']>().mockResolvedValue(TOKENS);
    const { auth } = fakeAuth({ setSession });

    const ergebnis = await baue({ auth, learner: fakeLearner({ anmelden }), rolle: 'student' })
      .signInWithLearnerId('fuchs-7390', 'testkennwort');

    expect(anmelden).toHaveBeenCalledWith('fuchs-7390', 'testkennwort');
    expect(setSession).toHaveBeenCalledWith({
      access_token: TOKENS.accessToken,
      refresh_token: TOKENS.refreshToken,
    });
    expect(ergebnis.role).toBe('student');
  });

  it('benutzt `signInWithPassword` nicht – dort stünde eine Adresse', async () => {
    const signInWithPassword = vi.fn<SupabaseAuthSlice['signInWithPassword']>();
    const { auth } = fakeAuth({ signInWithPassword });
    await baue({ auth }).signInWithLearnerId('fuchs-7390', 'testkennwort');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('gibt den Fehler der Serverfunktion unverändert weiter', async () => {
    // Sie hat ihn bereits vereinheitlicht (siehe `learnerAuth.ts`); ihn hier
    // noch einmal zu übersetzen hieße, zwei Wahrheiten zu pflegen.
    const learner = fakeLearner({
      anmelden: async () => {
        throw new Error('Lern-ID oder Kennwort stimmen nicht.');
      },
    });
    const meldung = await baue({ learner })
      .signInWithLearnerId('fuchs-7390', 'x')
      .catch((e: Error) => e.message);
    expect(meldung).toBe('Lern-ID oder Kennwort stimmen nicht.');
  });
});

describe('Wiederherstellung', () => {
  it('fordert für Lehrkräfte einen Verweis an – mit der Rückkehradresse des Portals', async () => {
    const resetPasswordForEmail = vi
      .fn<SupabaseAuthSlice['resetPasswordForEmail']>()
      .mockResolvedValue({ error: null });
    const { auth } = fakeAuth({ resetPasswordForEmail });

    await baue({ auth }).requestEmailRecovery(' Lehrerin@Beispiel.invalid ');

    expect(resetPasswordForEmail).toHaveBeenCalledWith('lehrerin@beispiel.invalid', {
      redirectTo: 'https://beispiel.invalid/LexiFlow/portal/#/kennwort-neu',
    });
  });

  it('schweigt auch dann, wenn der Dienst einen Fehler meldet', async () => {
    /*
      Absicht. Ein durchgereichter Fehler unterschiede „Adresse unbekannt“ von
      „verschickt“ – und baute daraus ein Verzeichnis aller Konten.
    */
    const { auth } = fakeAuth({
      resetPasswordForEmail: async () => ({ error: { message: 'User not found' } }),
    });
    await expect(baue({ auth }).requestEmailRecovery('gibtsnicht@beispiel.invalid')).resolves.toBeUndefined();
  });

  it('löst für Lernende den Code ein und meldet gleich an', async () => {
    const wiederherstellen = vi.fn<LearnerAuth['wiederherstellen']>().mockResolvedValue(TOKENS);
    const ergebnis = await baue({
      learner: fakeLearner({ wiederherstellen }),
      rolle: 'student',
    }).redeemRecoveryCode({
      learnerId: 'fuchs-7390',
      recoveryCode: 'test-code',
      newPassword: 'neues-testkennwort',
    });

    expect(wiederherstellen).toHaveBeenCalledWith({
      learnerId: 'fuchs-7390',
      recoveryCode: 'test-code',
      newPassword: 'neues-testkennwort',
    });
    expect(ergebnis.userId).toBe(NUTZER);
  });
});

describe('ein neues Kennwort setzen', () => {
  it('reicht es an den Dienst weiter', async () => {
    const updateUser = vi
      .fn<SupabaseAuthSlice['updateUser']>()
      .mockResolvedValue({ error: null });
    const { auth } = fakeAuth({ updateUser });
    await baue({ auth }).setPassword('neues-testkennwort');
    expect(updateUser).toHaveBeenCalledWith({ password: 'neues-testkennwort' });
  });

  it('sagt bei einem Fehlschlag, woran es liegen dürfte – auf Deutsch', async () => {
    const { auth } = fakeAuth({
      updateUser: async () => ({ error: { message: 'Password should be at least 8 characters' } }),
    });
    const meldung = await baue({ auth }).setPassword('kurz').catch((e: Error) => e.message);
    expect(meldung).toMatch(/acht Zeichen/);
    expect(meldung).not.toMatch(/[Pp]assword should/);
  });
});

describe('Änderungen der Sitzung', () => {
  it('werden gemeldet und lassen sich wieder abbestellen', async () => {
    const { auth, melde, abbestellt } = fakeAuth();
    const gesehen: (string | undefined)[] = [];
    const ab = baue({ auth, rolle: 'student' }).onSessionChange((s) => gesehen.push(s?.userId));

    melde(sitzung());
    await vi.waitFor(() => expect(gesehen).toHaveLength(1));
    melde(null);
    await vi.waitFor(() => expect(gesehen).toHaveLength(2));

    expect(gesehen).toEqual([NUTZER, undefined]);

    ab();
    expect(abbestellt).toHaveBeenCalled();
  });

  it('eine alte Rollenabfrage setzt die Sitzung nach dem Abmelden nicht wieder ein', async () => {
    let rolleFreigeben!: (rolle: Role | undefined) => void;
    const rolleKommtSpaeter = new Promise<Role | undefined>((resolve) => {
      rolleFreigeben = resolve;
    });
    const { auth, melde } = fakeAuth();
    const gesehen: (string | undefined)[] = [];
    baue({ auth, ladeRolle: () => rolleKommtSpaeter }).onSessionChange((s) =>
      gesehen.push(s?.userId),
    );

    /*
      Genau die Live-Reihenfolge: Ein angemeldetes Ereignis wartet noch auf
      das Profil, danach kommt SIGNED_OUT. Das Abmelden muss gewinnen, auch
      wenn die ältere Abfrage erst anschließend fertig wird.
    */
    melde(sitzung());
    melde(null);
    await vi.waitFor(() => expect(gesehen).toEqual([undefined]));
    rolleFreigeben('student');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(gesehen).toEqual([undefined]);
  });
});
