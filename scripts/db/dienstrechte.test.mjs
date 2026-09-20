// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  alsDienst,
  alsEinrichtung,
  alsPerson,
  alsUnangemeldet,
  fehlerVon,
  legePersonAn,
  neueDatenbank,
  testId,
} from './harness.mjs';

/**
 * Die Rechte der Serverfunktionen, geprüft als `service_role`.
 *
 * ## Warum es diese Datei gibt
 *
 * Bei der ersten echten Inbetriebnahme fiel auf, dass keine Migration der
 * Rolle `service_role` jemals ein Recht gegeben hat. Zwei Serverfunktionen
 * sprechen aber genau als diese Rolle mit der Datenbank.
 *
 * Aufgefallen ist es einem Menschen, nicht dieser Prüfkette – obwohl es
 * 2830 Prüfungen gab und darunter ein ganzer Satz gegen echtes Postgres. Der
 * Grund steht in `harness.mjs` bei `alsEinrichtung`: Die Serverfunktion wurde
 * bis dahin als **Besitzer** der Objekte nachgestellt. Ein Besitzer hat auf
 * seinen eigenen Tabellen implizit jedes Recht. Er merkt nicht, dass ihm
 * eines fehlt, weil ihm keines fehlen kann.
 *
 * Es war also keine vergessene Prüfung, sondern eine, die aus Versehen die
 * falsche Frage stellte – und zwar so, dass sie immer grün war.
 *
 * ## Wie hier geprüft wird
 *
 * In zwei Richtungen, und beide sind nötig:
 *
 * 1. **Unter `service_role` geht, was gehen muss.** Für jeden `.from(…)` und
 *    `.rpc(…)` aus den beiden Serverfunktionen einmal die Operation selbst.
 * 2. **Unter `anon` und `authenticated` geht es weiterhin nicht.** Sonst
 *    wäre die Korrektur eine Türöffnung: Ein `grant` an die falsche Rolle
 *    fällt sonst niemandem auf, weil Richtung 1 danach ebenfalls grün ist.
 *
 * Dazu kommt eine dritte, strukturelle Prüfung am Ende: Sie liest die
 * Serverfunktionen als Text und hält fest, dass zu jedem Aufruf eine
 * Rechtevergabe existiert. Sie fängt den Fall, den die beiden anderen nicht
 * fangen können – einen **neuen** Aufruf, für den niemand einen Test
 * geschrieben hat.
 */

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const LEHRERIN = testId(1);
const LERNENDE = testId(2);
const NEUE_LERNENDE = testId(3);

let db;
let kurs;
let codeHash;

beforeEach(async () => {
  db = await neueDatenbank();

  await legePersonAn(db, { id: LEHRERIN, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });
  await legePersonAn(db, { id: LERNENDE, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });

  await alsPerson(db, LEHRERIN);
  const kurse = await db.query(
    'insert into courses (owner_id, title, school_year) values ($1, $2, $3) returning id',
    [LEHRERIN, 'Englisch 7b', '2026/27'],
  );
  kurs = kurse.rows[0].id;
  await db.query('insert into course_members (course_id, user_id, role) values ($1, $2, $3)', [
    kurs,
    LEHRERIN,
    'teacher',
  ]);

  // Eine Einladung auf dem regulären Weg – die Serverfunktion bekommt später
  // nur ihren Hash zu sehen, so wie im Betrieb auch.
  const einladung = await db.query('select * from create_course_invite($1, null, 25)', [kurs]);
  const code = einladung.rows[0].code;
  const hash = await db.query('select invite_code_hash($1) as h', [code]);
  codeHash = hash.rows[0].h;

  // Ein Lernendenkonto, damit es etwas zu lesen und zu drehen gibt.
  await alsEinrichtung(db);
  await db.query(
    'insert into learner_accounts (user_id, learner_id, recovery_code_hash) values ($1, $2, $3)',
    [LERNENDE, 'fuchs-7390', 'hash-des-alten-codes'],
  );
});

afterEach(async () => {
  await db?.close();
});

/* ------------------------------------------------------------------------ */
/* 1. Was die Serverfunktionen können müssen                                 */
/* ------------------------------------------------------------------------ */

describe('`learner-auth` als service_role', () => {
  it('liest `learner_accounts` **einschließlich** des Wiederherstellungs-Hashes', async () => {
    /*
      Der Aufruf im Quelltext:
        .from('learner_accounts').select('user_id, recovery_code_hash')

      Diese eine Spalte ist der Grund, warum die Rolle überhaupt Leserecht auf
      diese Tabelle braucht – und der Grund, warum `authenticated` es nicht
      bekommt.
    */
    await alsDienst(db);
    const ergebnis = await db.query(
      'select user_id, recovery_code_hash from learner_accounts where learner_id = $1',
      ['fuchs-7390'],
    );
    expect(ergebnis.rows).toHaveLength(1);
    expect(ergebnis.rows[0].recovery_code_hash).toBe('hash-des-alten-codes');
  });

  it('prüft, ob es eine Lern-ID schon gibt', async () => {
    // .from('learner_accounts').select('user_id').eq('learner_id', …)
    await alsDienst(db);
    const ergebnis = await db.query('select user_id from learner_accounts where learner_id = $1', [
      'gibt-es-nicht',
    ]);
    expect(ergebnis.rows).toHaveLength(0);
  });

  it('bremst – und bekommt die Bremse nicht verweigert', async () => {
    // .rpc('note_auth_attempt', …)
    await alsDienst(db);
    const erster = await db.query('select note_auth_attempt($1, $2, $3) as frei', [
      'anmeldung:fuchs-7390',
      3,
      '900 seconds',
    ]);
    expect(erster.rows[0].frei).toBe(true);
  });

  it('belegt einen Platz und gibt ihn wieder frei', async () => {
    // .rpc('consume_invite_by_hash', …) und .rpc('release_invite_by_hash', …)
    /*
      Nachgesehen wird als Einrichtung, nicht als Dienst – und das ist kein
      Umweg, sondern der Beleg für die Grenze: `service_role` bekommt kein
      Leserecht auf `course_invites`. Sie darf einen Platz belegen und wieder
      freigeben, aber die Einladungen nicht durchsehen.

      Ein erster Entwurf dieses Tests hat hier als Dienst gelesen und ist mit
      „permission denied for table course_invites" gescheitert. Die Migration
      war richtig, der Test zu großzügig.
    */
    const zaehlerstand = async () => {
      await alsEinrichtung(db);
      const ergebnis = await db.query('select used_count from course_invites where code_hash = $1', [
        codeHash,
      ]);
      return ergebnis.rows[0].used_count;
    };

    await alsDienst(db);
    const belegt = await db.query('select consume_invite_by_hash($1) as kurs', [codeHash]);
    expect(belegt.rows[0].kurs).toBe(kurs);
    expect(await zaehlerstand()).toBe(1);

    await alsDienst(db);
    await db.query('select release_invite_by_hash($1)', [codeHash]);
    expect(await zaehlerstand()).toBe(0);
  });

  it('darf `course_invites` aber nicht selbst durchsehen', async () => {
    await alsDienst(db);
    const fehler = await fehlerVon(db.query('select code_hash from course_invites'));
    expect(fehler).toMatch(/permission denied/i);
  });

  it('legt ein Lernendenkonto an', async () => {
    // .rpc('create_learner_account', …) – sechs Parameter, genau wie im Aufruf
    await alsEinrichtung(db);
    await db.query('insert into auth.users (id) values ($1)', [NEUE_LERNENDE]);

    await alsDienst(db);
    await db.query('select create_learner_account($1, $2, $3, $4, $5, $6)', [
      NEUE_LERNENDE,
      'dachs-8104',
      'Dachs',
      'LX-8104',
      'hash-des-neuen-codes',
      kurs,
    ]);

    const konten = await db.query('select learner_id from learner_accounts where user_id = $1', [
      NEUE_LERNENDE,
    ]);
    expect(konten.rows[0].learner_id).toBe('dachs-8104');
  });

  it('tauscht den Wiederherstellungscode aus', async () => {
    // .rpc('rotate_recovery_code', …)
    await alsDienst(db);
    await db.query('select rotate_recovery_code($1, $2)', [LERNENDE, 'hash-danach']);

    const konten = await db.query('select recovery_code_hash from learner_accounts where user_id = $1', [
      LERNENDE,
    ]);
    expect(konten.rows[0].recovery_code_hash).toBe('hash-danach');
  });
});

describe('`ai-gateway` als service_role', () => {
  it('liest die Rolle aus `profiles`', async () => {
    // .from('profiles').select('role').eq('id', …)
    await alsDienst(db);
    const ergebnis = await db.query('select role from profiles where id = $1', [LEHRERIN]);
    expect(ergebnis.rows[0].role).toBe('teacher');
  });

  it('schreibt, liest, ändert und löscht eine Verbindung samt Siegelspalten', async () => {
    /*
      Vier Aufrufe in einem Test, weil sie eine Kette sind:
        .upsert(…) → .select('*') → .update({last_checked_at}) → .delete()

      Der `upsert` ist der heikle: Er wird zu `insert … on conflict do update`
      und braucht beide Rechte. Deshalb steht er hier zweimal – beim zweiten
      Mal greift der `on conflict`-Zweig, und ein fehlendes `update` fiele
      genau dort auf.
    */
    const verbindung = testId(9);
    await alsDienst(db);

    const schreiben = async (maske) =>
      db.query(
        `insert into ai_connections
           (id, owner_id, label, adapter, base_url, model,
            masked_secret, secret_ciphertext, secret_iv, secret_key_version, active)
         values ($1, $2, 'Mein Zugang', 'gemini', '', 'gemini-2.0-flash',
                 $3, 'Y2hpZmZyZQ==', 'aXYtenVmYWxs', 1, true)
         on conflict (id) do update set masked_secret = excluded.masked_secret`,
        [verbindung, LEHRERIN, maske],
      );

    await schreiben('••••••••abcd');
    await schreiben('••••••••efgh');

    const gelesen = await db.query(
      'select masked_secret, secret_ciphertext, secret_iv, secret_key_version from ai_connections where id = $1',
      [verbindung],
    );
    expect(gelesen.rows[0].masked_secret).toBe('••••••••efgh');
    expect(gelesen.rows[0].secret_ciphertext).toBe('Y2hpZmZyZQ==');
    expect(gelesen.rows[0].secret_key_version).toBe(1);

    await db.query('update ai_connections set last_checked_at = now() where id = $1', [verbindung]);
    await db.query('delete from ai_connections where id = $1', [verbindung]);

    const danach = await db.query('select count(*)::int as n from ai_connections where id = $1', [
      verbindung,
    ]);
    expect(danach.rows[0].n).toBe(0);
  });

  it('liest die Freigabeliste', async () => {
    // .from('ai_allowed_hosts').select('host')
    await alsDienst(db);
    const ergebnis = await db.query('select host from ai_allowed_hosts');
    expect(Array.isArray(ergebnis.rows)).toBe(true);
  });

  it('darf die Freigabeliste **nicht** erweitern', async () => {
    /*
      Kein Aufruf im Quelltext, also kein Recht. Das ist keine Sparsamkeit um
      ihrer selbst willen: Eine Serverfunktion, die ihre eigene Freigabeliste
      ergänzen könnte, wäre der SSRF-Schutz, der sich selbst abschaltet.
    */
    await alsDienst(db);
    const fehler = await fehlerVon(
      db.query("insert into ai_allowed_hosts (host) values ('beliebig.example')"),
    );
    expect(fehler).toMatch(/permission denied/i);
  });
});

/* ------------------------------------------------------------------------ */
/* 2. Die Gegenrichtung: der Browser darf davon weiterhin nichts             */
/* ------------------------------------------------------------------------ */

describe('dieselben Wege aus dem Browser', () => {
  const SERVEREXKLUSIV = [
    ["select note_auth_attempt($1, 3, '900 seconds')", ['anmeldung:fremd']],
    ['select consume_invite_by_hash($1)', ['egal']],
    ['select release_invite_by_hash($1)', ['egal']],
    [
      'select create_learner_account($1, $2, $3, $4, $5, $6)',
      [testId(8), 'wer-auch-immer', 'Name', 'LX-9999', 'hash', null],
    ],
    ['select rotate_recovery_code($1, $2)', [testId(8), 'hash']],
  ];

  for (const [sql, werte] of SERVEREXKLUSIV) {
    const name = /select (\w+)\(/.exec(sql)[1];

    it(`\`${name}\` bleibt für angemeldete Personen gesperrt`, async () => {
      await alsPerson(db, LERNENDE);
      expect(await fehlerVon(db.query(sql, werte))).toMatch(/permission denied/i);
    });

    it(`\`${name}\` bleibt für nicht angemeldete Besucher gesperrt`, async () => {
      await alsUnangemeldet(db);
      expect(await fehlerVon(db.query(sql, werte))).toMatch(/permission denied/i);
    });
  }

  it('der Wiederherstellungs-Hash bleibt für angemeldete Personen unlesbar', async () => {
    /*
      Die Spalte, wegen der `service_role` überhaupt Leserecht braucht. Wäre
      die Korrektur versehentlich an `authenticated` gegangen, stünde hier
      der Hash – und jede lernende Person könnte den ihrer Mitlernenden lesen.
    */
    await alsPerson(db, LERNENDE);
    const fehler = await fehlerVon(db.query('select recovery_code_hash from learner_accounts'));
    expect(fehler).toMatch(/permission denied/i);
  });

  it('die Siegelspalten bleiben für angemeldete Personen unlesbar', async () => {
    await alsPerson(db, LEHRERIN);
    for (const spalte of ['secret_ciphertext', 'secret_iv', 'secret_key_version']) {
      const fehler = await fehlerVon(db.query(`select ${spalte} from ai_connections`));
      expect(fehler, spalte).toMatch(/permission denied/i);
    }
  });
});

/* ------------------------------------------------------------------------ */
/* 3. Die Wache: kein Aufruf ohne Recht                                      */
/* ------------------------------------------------------------------------ */

describe('jeder Aufruf der Serverfunktionen hat eine Rechtevergabe', () => {
  /*
    Diese Prüfung liest Quelltext, nicht Verhalten. Sie ist gegen den Fall
    geschrieben, der die ursprüngliche Lücke hat entstehen lassen: Jemand
    ergänzt einen `.from(…)` oder `.rpc(…)`, alle bestehenden Tests bleiben
    grün, und das fehlende Recht zeigt sich erst im Betrieb.

    Absichtlich grob. Sie prüft, dass es **überhaupt** ein Recht gibt, nicht
    welches – das tun die Prüfungen oben, an der Operation selbst.
  */

  const quellen = [
    'supabase/functions/learner-auth/index.ts',
    'supabase/functions/ai-gateway/index.ts',
  ].map((pfad) => readFileSync(resolve(wurzel, pfad), 'utf8'));

  /**
   * Die Migration **ohne** ihre Kommentare.
   *
   * Beim ersten Lauf sind drei Prüfungen unten fehlgeschlagen, und zwar an
   * dieser Datei selbst: Der Abschnitt „Was hier fehlt" nennt `grant … on all
   * tables` und `grant … to authenticated`, um zu begründen, warum es sie
   * nicht gibt. Ein Scanner über den Rohtext liest diese Sätze als das, wovor
   * sie warnen.
   *
   * Das ist kein Schönheitsfehler. Eine Wache, die den Warnhinweis für den
   * Einbruch hält, wird beim ersten Lauf entschärft – und steht danach nur
   * noch da.
   */
  const rechte = readFileSync(
    resolve(wurzel, 'supabase/migrations/20260920090000_dienstrechte.sql'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');

  function gesammelt(muster) {
    const treffer = new Set();
    for (const quelle of quellen) {
      for (const fund of quelle.matchAll(muster)) treffer.add(fund[1]);
    }
    return [...treffer].sort();
  }

  it('jede angesprochene Tabelle steht in der Rechtevergabe', () => {
    const tabellen = gesammelt(/\.from\(\s*'([a-z_]+)'\s*\)/g);

    // Ohne diese Zeile prüfte der Test die leere Menge und wäre immer grün.
    expect(tabellen.length).toBeGreaterThan(0);

    const ohneRecht = tabellen.filter(
      (name) => !new RegExp(`grant[^;]*\\bon ${name}\\b[^;]*to service_role`, 's').test(rechte),
    );
    expect(ohneRecht, 'Tabellen ohne `grant … to service_role`').toEqual([]);
  });

  it('jede aufgerufene Funktion steht in der Rechtevergabe', () => {
    const funktionen = gesammelt(/\.rpc\(\s*'([a-z_]+)'/g);

    expect(funktionen.length).toBeGreaterThan(0);

    const ohneRecht = funktionen.filter(
      (name) =>
        !new RegExp(`grant execute on function ${name}\\s*\\([^)]*\\)[^;]*to service_role`, 's').test(
          rechte,
        ),
    );
    expect(ohneRecht, 'Funktionen ohne `grant execute … to service_role`').toEqual([]);
  });

  it('die Rechtevergabe enthält nichts Pauschales', () => {
    /*
      `grant … on all tables in schema public to service_role` würde jede
      Prüfung oben bestehen und trotzdem das Gegenteil dessen tun, was diese
      Datei soll. Dasselbe für `all functions` und `all sequences`.
    */
    expect(rechte).not.toMatch(/grant[^;]*on all (tables|functions|sequences|routines)/is);
  });

  it('die Rechtevergabe vergibt an niemanden sonst', () => {
    // Jede `grant`-Anweisung dieser Datei endet bei `service_role`.
    const empfaenger = [...rechte.matchAll(/grant[^;]*?\sto\s+([a-z_,\s]+);/gis)].map((fund) =>
      fund[1].replace(/\s+/g, ' ').trim(),
    );
    expect(empfaenger.length).toBeGreaterThan(0);
    expect([...new Set(empfaenger)]).toEqual(['service_role']);
  });
});
