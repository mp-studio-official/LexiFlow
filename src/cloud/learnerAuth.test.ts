import { describe, expect, it, vi } from 'vitest';
import {
  ANMELDUNG_FEHLGESCHLAGEN,
  WIEDERHERSTELLUNG_FEHLGESCHLAGEN,
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
  body: { access_token: 'test-zugangstoken', refresh_token: 'test-erneuerungstoken' },
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
