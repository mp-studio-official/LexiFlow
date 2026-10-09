import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANMELDUNG_FEHLGESCHLAGEN,
  WIEDERHERSTELLUNG_FEHLGESCHLAGEN,
  createFetchTransport,
  createLearnerAuth,
  learnerAuthEndpoint,
  type LearnerAuthTransport,
} from './learnerAuth';

/**
 * Der Anmeldeweg der Lernenden – vollständig ohne Netz geprüft.
 *
 * Alle Werte hier sind offensichtliche Testwerte; es gibt kein Supabase-Projekt
 * und keine echte Funktion. Geprüft wird, was der Browser **sendet** und was er
 * aus einer Antwort **macht** – beides Fragen, die kein Server beantworten muss.
 */

const TEST_URL = 'https://beispiel-projekt.supabase.co';

function transportMit(antwort: { status: number; body: unknown }) {
  const gesendet: { url: string; body: unknown }[] = [];
  const transport: LearnerAuthTransport = async (anfrage) => {
    gesendet.push(anfrage);
    return antwort;
  };
  return { transport, gesendet };
}

function auth(antwort: { status: number; body: unknown }) {
  const { transport, gesendet } = transportMit(antwort);
  return { auth: createLearnerAuth({ supabaseUrl: TEST_URL, transport }), gesendet };
}

const ERFOLG = {
  status: 200,
  body: {
    access_token: 'test-zugangstoken',
    refresh_token: 'test-erneuerungstoken',
    recoveryCode: 'NEUER-TESTCODE-ZUM-PROBIEREN',
  },
};

describe('die Adresse der Funktion', () => {
  it('hängt am Projekt und nicht an einer festen Zeichenkette', () => {
    expect(learnerAuthEndpoint(TEST_URL)).toBe(
      'https://beispiel-projekt.supabase.co/functions/v1/learner-auth',
    );
  });

  it('verträgt einen Schrägstrich am Ende', () => {
    expect(learnerAuthEndpoint(`${TEST_URL}/`)).toBe(learnerAuthEndpoint(TEST_URL));
  });
});

describe('Anmeldung', () => {
  it('sendet Lern-ID und Kennwort – und sonst nichts', async () => {
    const { auth: anmeldung, gesendet } = auth(ERFOLG);
    await anmeldung.anmelden('  Fuchs-7390 ', 'testkennwort');

    expect(gesendet).toHaveLength(1);
    expect(gesendet[0]!.body).toEqual({
      aktion: 'anmelden',
      learnerId: 'Fuchs-7390',
      password: 'testkennwort',
    });
  });

  it('gibt die Tokens zurück', async () => {
    const { auth: anmeldung } = auth(ERFOLG);
    expect(await anmeldung.anmelden('fuchs-7390', 'testkennwort')).toEqual({
      accessToken: 'test-zugangstoken',
      refreshToken: 'test-erneuerungstoken',
    });
  });

  it('meldet dasselbe, egal ob Lern-ID oder Kennwort nicht stimmte', async () => {
    /*
      Der Kern: Zwei unterscheidbare Meldungen wären ein Verzeichnis aller
      Lern-IDs, und in einer Schule ist das eine Namensliste.
    */
    const unbekannt = auth({ status: 400, body: { error: 'user not found' } });
    const falsch = auth({ status: 400, body: { error: 'invalid password' } });

    const einer = await unbekannt.auth.anmelden('gibtsnicht', 'x').catch((e: Error) => e.message);
    const anderer = await falsch.auth.anmelden('fuchs-7390', 'falsch').catch((e: Error) => e.message);

    expect(einer).toBe(ANMELDUNG_FEHLGESCHLAGEN);
    expect(anderer).toBe(ANMELDUNG_FEHLGESCHLAGEN);
  });

  it('reicht keinen Text aus der Antwort durch', async () => {
    // Eine geschwätzigere Serverfassung darf hier nichts durchschleusen.
    const { auth: anmeldung } = auth({
      status: 400,
      body: { error: 'no user with email fuchs-7390@lernende.invalid' },
    });
    const meldung = await anmeldung.anmelden('fuchs-7390', 'x').catch((e: Error) => e.message);
    expect(meldung).not.toContain('@');
    expect(meldung).not.toContain('lernende');
  });

  it('unterscheidet einen Serverausfall von einer Ablehnung', async () => {
    // Beim einen hilft Warten, beim anderen nicht – das darf die Oberfläche
    // sagen.
    const { auth: anmeldung } = auth({ status: 503, body: undefined });
    const meldung = await anmeldung.anmelden('fuchs-7390', 'x').catch((e: Error) => e.message);
    expect(meldung).toMatch(/nicht erreichbar/);
  });

  it('behandelt einen Netzfehler wie einen Ausfall, nicht wie eine Ablehnung', async () => {
    const transport = vi.fn<LearnerAuthTransport>().mockRejectedValue(new Error('offline'));
    const anmeldung = createLearnerAuth({ supabaseUrl: TEST_URL, transport });
    const meldung = await anmeldung.anmelden('fuchs-7390', 'x').catch((e: Error) => e.message);
    expect(meldung).toMatch(/nicht erreichbar/);
  });

  it('lehnt eine Antwort ohne brauchbare Tokens ab, auch bei Status 200', async () => {
    for (const body of [
      undefined,
      {},
      { access_token: 'nur-eines' },
      { access_token: '', refresh_token: 'x' },
      { access_token: 42, refresh_token: 'x' },
    ]) {
      const { auth: anmeldung } = auth({ status: 200, body });
      const meldung = await anmeldung.anmelden('fuchs-7390', 'x').catch((e: Error) => e.message);
      expect(meldung, JSON.stringify(body)).toBe(ANMELDUNG_FEHLGESCHLAGEN);
    }
  });
});

describe('Wiederherstellung', () => {
  it('setzt Code und neues Kennwort in einem Schritt', async () => {
    /*
      Ein Zwischenzustand „Code stimmte, Kennwort noch offen“ wäre eine halb
      offene Tür: Wer den Code hätte, hätte ein Zeitfenster, in dem das Konto
      niemandem gehört.
    */
    const { auth: anmeldung, gesendet } = auth(ERFOLG);
    await anmeldung.wiederherstellen({
      learnerId: 'fuchs-7390',
      recoveryCode: '  test-code  ',
      newPassword: 'neues-testkennwort',
    });

    expect(gesendet[0]!.body).toEqual({
      aktion: 'wiederherstellen',
      learnerId: 'fuchs-7390',
      recoveryCode: 'test-code',
      newPassword: 'neues-testkennwort',
    });
  });

  it('meldet bei falschem Code dasselbe wie bei unbekannter Lern-ID', async () => {
    const { auth: anmeldung } = auth({ status: 400, body: { error: 'bad code' } });
    const meldung = await anmeldung
      .wiederherstellen({ learnerId: 'fuchs-7390', recoveryCode: 'falsch', newPassword: 'x' })
      .catch((e: Error) => e.message);
    expect(meldung).toBe(WIEDERHERSTELLUNG_FEHLGESCHLAGEN);
  });

  it('gibt den vom Server gedrehten Ersatzcode an die Oberfläche weiter', async () => {
    const { auth: anmeldung } = auth(ERFOLG);
    await expect(
      anmeldung.wiederherstellen({
        learnerId: 'fuchs-7390',
        recoveryCode: 'alter-code',
        newPassword: 'neues-testkennwort',
      }),
    ).resolves.toMatchObject({ recoveryCode: 'NEUER-TESTCODE-ZUM-PROBIEREN' });
  });

  it('akzeptiert keinen Erfolg ohne Ersatzcode', async () => {
    const { auth: anmeldung } = auth({
      status: 200,
      body: { access_token: 'test-zugangstoken', refresh_token: 'test-erneuerungstoken' },
    });
    const meldung = await anmeldung
      .wiederherstellen({
        learnerId: 'fuchs-7390',
        recoveryCode: 'alter-code',
        newPassword: 'neues-testkennwort',
      })
      .catch((error: Error) => error.message);
    expect(meldung).toBe(WIEDERHERSTELLUNG_FEHLGESCHLAGEN);
  });
});

describe('was niemals gesendet wird', () => {
  it('keine E-Mail-Adresse – auch keine abgeleitete', async () => {
    /*
      ADR-5 in einer Prüfung: Die technische Adresse hinter einer Lern-ID
      bildet ausschließlich die Serverfunktion. Stünde die Regel im Bündel,
      könnte jede Person sie für jede Lern-ID nachrechnen.
    */
    const { auth: anmeldung, gesendet } = auth(ERFOLG);
    await anmeldung.anmelden('fuchs-7390', 'testkennwort');
    await anmeldung.wiederherstellen({
      learnerId: 'fuchs-7390',
      recoveryCode: 'c',
      newPassword: 'p',
    });

    for (const anfrage of gesendet) {
      expect(JSON.stringify(anfrage.body)).not.toContain('@');
    }
  });

  it('keine Kursdaten und kein Lernstand', async () => {
    const { auth: anmeldung, gesendet } = auth(ERFOLG);
    await anmeldung.anmelden('fuchs-7390', 'testkennwort');
    const gesendeteFelder = Object.keys(gesendet[0]!.body as Record<string, unknown>);
    expect(gesendeteFelder.sort()).toEqual(['aktion', 'learnerId', 'password']);
  });
});

describe('der Transport für den Ernstfall', () => {
  /*
    `createFetchTransport` ist das einzige Stück dieser Datei, das wirklich
    `fetch` aufruft. Geprüft wird hier nicht, was zurückkommt, sondern was
    **hinausgeht** – und vor allem, was nicht.
  */
  function abgefangen() {
    const rufe: { url: string; init: RequestInit }[] = [];
    const impl = vi.fn(async (url: string, init: RequestInit) => {
      rufe.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', impl);
    return rufe;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sendet **keinen** `Authorization`-Kopf', async () => {
    /*
      Er stand hier einmal, mit dem Publishable Key als Wert. Neue
      Publishable Keys (`sb_publishable_…`) sind keine JWTs; ein Empfänger,
      der dort eines erwartet, lehnt mit „ungültiges Token" ab – und das
      zeigt in die falsche Richtung.

      Gebraucht wird er ohnehin nicht: `learner-auth` läuft mit
      `verify_jwt = false` und autorisiert im eigenen Code.
    */
    const rufe = abgefangen();
    const transport = createFetchTransport('sb_publishable_TESTWERT');
    await transport({ url: 'https://beispiel.example/functions/v1/learner-auth', body: {} });

    const kopf = new Headers(rufe[0]!.init.headers);
    expect(kopf.get('authorization'), 'der Authorization-Kopf ist zurück').toBeNull();
  });

  it('sendet den Publishable Key als `apikey`', async () => {
    const rufe = abgefangen();
    const transport = createFetchTransport('sb_publishable_TESTWERT');
    await transport({ url: 'https://beispiel.example/functions/v1/learner-auth', body: {} });

    const kopf = new Headers(rufe[0]!.init.headers);
    expect(kopf.get('apikey')).toBe('sb_publishable_TESTWERT');
  });

  it('schickt weder Cookies noch Zwischenspeicher mit', async () => {
    // Hier geht ein Kennwort hinaus.
    const rufe = abgefangen();
    const transport = createFetchTransport('sb_publishable_TESTWERT');
    await transport({ url: 'https://beispiel.example/functions/v1/learner-auth', body: {} });

    expect(rufe[0]!.init.credentials).toBe('omit');
    expect(rufe[0]!.init.cache).toBe('no-store');
  });

  it('gibt den Publishable Key in keinem Kopf zweimal aus', async () => {
    /*
      Die eigentliche Regressionswache: Egal, welcher Kopf später dazukommt –
      der Schlüssel darf genau einmal vorkommen, nämlich in `apikey`.
    */
    const rufe = abgefangen();
    const transport = createFetchTransport('sb_publishable_TESTWERT');
    await transport({ url: 'https://beispiel.example/functions/v1/learner-auth', body: {} });

    const mitSchluessel: string[] = [];
    new Headers(rufe[0]!.init.headers).forEach((wert, name) => {
      if (wert.includes('sb_publishable_TESTWERT')) mitSchluessel.push(name);
    });
    expect(mitSchluessel).toEqual(['apikey']);
  });
});
