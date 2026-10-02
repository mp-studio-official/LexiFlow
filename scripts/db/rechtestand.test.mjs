// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
 * Der vollständige Rechtestand, ausgeschrieben.
 *
 * ## Warum ausgeschrieben und nicht stichprobenweise
 *
 * Die bisherigen Prüfungen fragten „darf diese Rolle das?". Damit findet man
 * fehlende Rechte. Überzählige findet man so nicht – niemand prüft, was
 * jemand **nicht** darf, wenn niemand auf die Idee kommt, dass er es dürfte.
 *
 * Genau daran ist Migration 9 vorbeigelaufen. Sie hat `grant` geschrieben,
 * und `grant` ergänzt. Was Supabase vorher vergeben hatte, stand weiter da,
 * und jede Prüfung blieb grün, weil jede Prüfung nach zu wenig suchte.
 *
 * Diese Datei dreht die Frage um: Sie schreibt die **erwartete Matrix
 * vollständig hin** und vergleicht. Jedes Recht, das jemand später ergänzt,
 * fällt auf – auch eines, an das beim Schreiben dieser Datei niemand gedacht
 * hat. Das ist der Unterschied zwischen einer Liste von Stichproben und einer
 * Zusage.
 *
 * ## Voraussetzung
 *
 * `harness.mjs` bildet seit September 2026 Supabases Vorgaberechte nach –
 * jede Tabelle, die eine Migration anlegt, kommt mit vollen Rechten für alle
 * drei Rollen auf die Welt. Ohne diese Nachbildung prüfte diese Datei eine
 * Datenbank, in der das Problem gar nicht auftreten kann.
 */

const LEHRERIN = testId(1);
const LERNENDE = testId(2);

let db;

beforeEach(async () => {
  db = await neueDatenbank();
});

afterEach(async () => {
  await db?.close();
});

/** Die Tabellenrechte als `{ rolle: { tabelle: 'PRIV,PRIV' } }`. */
async function tabellenrechte() {
  const ergebnis = await db.query(`
    select grantee, table_name,
           string_agg(distinct privilege_type, ',' order by privilege_type) as rechte
      from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee in ('anon', 'authenticated', 'service_role')
     group by 1, 2`);
  const matrix = { anon: {}, authenticated: {}, service_role: {} };
  for (const zeile of ergebnis.rows) matrix[zeile.grantee][zeile.table_name] = zeile.rechte;
  return matrix;
}

/**
 * Die Vorgaberechte, die LexiFlow betreffen – wörtlich die Abfrage aus
 * `docs/inbetriebnahme-staging.md`, Abschnitt 3.2.3.
 *
 * ## Warum die Eingrenzung hier steht und nicht im Test
 *
 * Zwei Prüfungen unten benutzen sie: die eine erwartet nach den Migrationen
 * eine leere Antwort, die andere baut ein fremdes Plattformschema daneben auf
 * und erwartet **dieselbe** leere Antwort. Stünde die Abfrage zweimal da,
 * könnte eine Fassung eingegrenzt sein und die andere nicht – und die
 * Regressionprüfung bewiese dann nur sich selbst.
 *
 * ## Die beiden Filter
 *
 * `defaclrole = postgres`, weil `alter default privileges for role X` nur auf
 * Objekte wirkt, die X anlegt; Migrationen laufen als `postgres`.
 *
 * `defaclnamespace = 0 or nspname = 'public'` – ohne Schemabezug oder
 * `public`. Alles andere gehört der Plattform: `storage`, `graphql`,
 * `realtime`, `vault`. Deren Vorgaberechte sind der Grund, warum
 * Storage-Uploads und Realtime funktionieren, und sie werden nicht angefasst.
 */
async function vorgaberechte() {
  const ergebnis = await db.query(`
    select coalesce(bereich.nspname, '(global)') as geltungsbereich,
           vorgabe.defaclobjtype::text as objektart,
           coalesce(empfaenger.rolname, 'PUBLIC') as empfaenger,
           recht.privilege_type
      from pg_default_acl vorgabe
      join pg_roles eigentuemer on eigentuemer.oid = vorgabe.defaclrole
      left join pg_namespace bereich on bereich.oid = vorgabe.defaclnamespace
      cross join lateral aclexplode(vorgabe.defaclacl) recht
      left join pg_roles empfaenger on empfaenger.oid = recht.grantee
     where eigentuemer.rolname = 'postgres'
       and (vorgabe.defaclnamespace = 0 or bereich.nspname = 'public')
       and (empfaenger.rolname in ('anon','authenticated','service_role')
            or recht.grantee = 0)`);
  return ergebnis.rows;
}

/* ------------------------------------------------------------------------ */
/* Der Dienst: genau vier Tabellen, genau diese Rechte                       */
/* ------------------------------------------------------------------------ */

describe('service_role', () => {
  it('hat Rechte auf **genau** diesen vier Tabellen', async () => {
    const matrix = await tabellenrechte();
    expect(matrix.service_role).toEqual({
      profiles: 'SELECT',
      learner_accounts: 'SELECT',
      ai_connections: 'DELETE,INSERT,SELECT,UPDATE',
      ai_allowed_hosts: 'SELECT',
    });
  });

  it('hat auf den Lernstandstabellen **nichts**', async () => {
    /*
      Die Zeile, die das Produktversprechen trägt. Vor Migration 10 standen
      hier sieben Rechte je Tabelle, aus Supabases Vorgabe – ein Dienst mit
      Leserecht auf Lernstände, ohne dass es jemand geschrieben hätte.
    */
    const matrix = await tabellenrechte();
    for (const tabelle of [
      'courses',
      'course_members',
      'pack_progress',
      'entry_progress',
      'progress_events',
    ]) {
      expect(matrix.service_role[tabelle], tabelle).toBeUndefined();
    }
  });

  it('liest einen Lernstand auch tatsächlich nicht', async () => {
    // Die Rechtematrix ist das eine, der Versuch das andere.
    await legePersonAn(db, { id: LERNENDE, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });
    await alsDienst(db);
    expect(await fehlerVon(db.query('select * from entry_progress'))).toMatch(/permission denied/i);
    expect(await fehlerVon(db.query('select * from pack_progress'))).toMatch(/permission denied/i);
  });

  it('darf genau fünf serverexklusive Funktionen ausführen', async () => {
    const ergebnis = await db.query(`
      select p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
         and has_function_privilege('service_role', p.oid, 'execute')
       order by 1`);
    expect(ergebnis.rows.map((z) => z.proname)).toEqual([
      'consume_invite_by_hash',
      'create_learner_account',
      'note_auth_attempt',
      'release_invite_by_hash',
      'rotate_recovery_code',
    ]);
  });
});

/* ------------------------------------------------------------------------ */
/* Die Browserrollen                                                         */
/* ------------------------------------------------------------------------ */

describe('anon', () => {
  it('hat auf **keiner** Tabelle ein Recht', async () => {
    /*
      So war es immer gemeint – Migration 3 vergibt ausschließlich an
      `authenticated`. Sichtbar war es nie: Auf den vier später entstandenen
      Tabellen hatte `anon` aus der Vorgabe alles, `truncate` eingeschlossen.
    */
    const matrix = await tabellenrechte();
    expect(matrix.anon).toEqual({});
  });

  it('kann `learner_accounts` nicht leeren', async () => {
    /*
      `truncate` unterliegt **keiner** Zugriffsregel. Das Recht war da, und
      RLS hätte es nicht aufgehalten.

      Zur Einordnung, die dazugehört: PostgREST kennt kein `truncate`, über
      die HTTP-Schnittstelle war es also nicht erreichbar. Es war kein
      offenes Tor – es war ein Schlüssel, den niemand ausgehändigt hatte und
      der trotzdem im Schloss steckte.
    */
    await legePersonAn(db, { id: LERNENDE, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });
    await alsEinrichtung(db);
    await db.query(
      'insert into learner_accounts (user_id, learner_id, recovery_code_hash) values ($1, $2, $3)',
      [LERNENDE, 'fuchs-7390', 'hash'],
    );

    await alsUnangemeldet(db);
    expect(await fehlerVon(db.query('truncate learner_accounts cascade'))).toMatch(
      /permission denied/i,
    );

    await alsEinrichtung(db);
    const rest = await db.query('select count(*)::int as n from learner_accounts');
    expect(rest.rows[0].n).toBe(1);
  });

  it('kann die Bremse weder lesen noch leeren', async () => {
    await alsEinrichtung(db);
    await db.query(
      "insert into auth_rate_limit (schluessel, fenster_beginn, versuche) values ('x', now(), 5)",
    );
    await alsUnangemeldet(db);
    expect(await fehlerVon(db.query('select * from auth_rate_limit'))).toMatch(/permission denied/i);
    expect(await fehlerVon(db.query('truncate auth_rate_limit'))).toMatch(/permission denied/i);
  });
});

describe('authenticated', () => {
  it('hat genau die Tabellenrechte aus den Migrationen 3, 4, 8 und 11', async () => {
    const matrix = await tabellenrechte();
    expect(matrix.authenticated).toEqual({
      profiles: 'INSERT,SELECT',
      courses: 'DELETE,INSERT,SELECT,UPDATE',
      course_members: 'DELETE,INSERT,SELECT',
      course_invites: 'INSERT,SELECT,UPDATE',
      packs: 'DELETE,INSERT,SELECT,UPDATE',
      pack_drafts: 'DELETE,INSERT,SELECT,UPDATE',
      pack_revisions: 'INSERT,SELECT,UPDATE',
      course_packs: 'DELETE,INSERT,SELECT,UPDATE',
      /*
        Nur noch `select` – seit Migration 11.

        Der Browser liest die beiden Lernstandstabellen und schreibt
        ausschliesslich über `begin_practice_session`,
        `record_progress_events` und `reset_my_progress`. Ein Schreibrecht
        daneben wäre ein Weg an der Mitgliedschaftsprüfung vorbei: Die RPCs
        prüfen sie, ein direktes `update` prüfte nur die Zugriffsregel – und
        die kann kein `rev` schützen und keine Doppelzählung verhindern.
      */
      pack_progress: 'SELECT',
      entry_progress: 'SELECT',
      /*
        Und hier auch kein `insert` mehr: Wer eine Ereigniskennung selbst
        eintragen könnte, könnte ein echtes Ereignis vorab blockieren und die
        Idempotenz zu einer Behauptung machen.
      */
      progress_events: 'SELECT',
      /*
        Seit 5B.4a. Kein `delete`: Eine gelöschte Zeile behauptete „nie
        bestätigt", wo einmal bestätigt wurde (E27). Wer seine Zeitzone
        loswerden will, setzt sie auf `null`.

        Dass hier `authenticated` steht und nicht „die eigene Person", ist
        kein Widerspruch: Das Tabellenrecht sagt nur, wer die Tabelle
        überhaupt anfassen darf. Welche Zeile das ist, entscheidet
        `learner_settings_own` – geprüft in `lernendeneinstellungen.test.mjs`.
      */
      learner_settings: 'INSERT,SELECT,UPDATE',
      ai_allowed_hosts: 'DELETE,INSERT,SELECT,UPDATE',
      // Nur `delete` auf Tabellenebene – der Rest ist spaltenweise.
      ai_connections: 'DELETE',
    });
    // `learner_accounts` steht bewusst nicht in der Liste: dort gibt es
    // ausschließlich ein Spaltenrecht, und das zählt hier nicht mit.
    expect(matrix.authenticated['learner_accounts']).toBeUndefined();
    expect(matrix.authenticated['auth_rate_limit']).toBeUndefined();
  });

  it('kann den Wiederherstellungs-Hash **nicht** lesen', async () => {
    /*
      Die Zusage aus `…120300_anmeldung.sql`, wörtlich: „Ohne dieses
      Spaltenrecht könnte jede lernende Person ihren eigenen Code-Hash lesen
      und in Ruhe durchprobieren, bis der Klartext feststeht."

      Im nachgebildeten Supabase-Zustand war sie vor Migration 10 **unwahr**:
      Das Tabellenrecht aus der Vorgabe deckte alle Spalten ab, und die
      Zugriffsregel erlaubt die eigene Zeile.
    */
    await legePersonAn(db, { id: LERNENDE, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });
    await alsEinrichtung(db);
    await db.query(
      'insert into learner_accounts (user_id, learner_id, recovery_code_hash) values ($1, $2, $3)',
      [LERNENDE, 'fuchs-7390', 'GEHEIMER-HASH'],
    );

    await alsPerson(db, LERNENDE);
    expect(await fehlerVon(db.query('select recovery_code_hash from learner_accounts'))).toMatch(
      /permission denied/i,
    );

    // Die erlaubten vier Spalten gehen weiterhin.
    const erlaubt = await db.query('select user_id, learner_id from learner_accounts');
    expect(erlaubt.rows).toHaveLength(1);
  });

  it('kann die Siegelspalten weder lesen noch schreiben', async () => {
    /*
      Die Zusage aus `…120700_ki.sql`: „Die drei Siegelspalten stehen in
      keinem `select`, das eine angemeldete Person stellen kann."

      Vorher konnte die eigene Lehrkraft sie lesen **und überschreiben** –
      am Gateway vorbei. Das Siegel selbst hätte gehalten (die AAD-Bindung
      ist unabhängig davon), aber die Zusage hielt nicht.
    */
    await legePersonAn(db, { id: LEHRERIN, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });
    await alsEinrichtung(db);
    await db.query(
      `insert into ai_connections (owner_id, label, adapter, model, masked_secret,
                                   secret_ciphertext, secret_iv, secret_key_version)
       values ($1, 'Zugang', 'gemini', 'gemini-2.0-flash', '****', 'CHIFFRE', 'IV', 1)`,
      [LEHRERIN],
    );

    await alsPerson(db, LEHRERIN);
    /*
      Der Wert je Spalte muss zum Typ passen. Ein `'x'` in
      `secret_key_version` lässt Postgres schon an der Typprüfung scheitern –
      der Test wäre dann grün, ohne je bei der Rechteprüfung angekommen zu
      sein. Ein Test, der aus dem falschen Grund besteht, ist keiner.
    */
    for (const [spalte, wert] of [
      ['secret_ciphertext', "'x'"],
      ['secret_iv', "'x'"],
      ['secret_key_version', '7'],
    ]) {
      expect(await fehlerVon(db.query(`select ${spalte} from ai_connections`)), spalte).toMatch(
        /permission denied/i,
      );
      expect(
        await fehlerVon(db.query(`update ai_connections set ${spalte} = ${wert}`)),
        `${spalte} schreiben`,
      ).toMatch(/permission denied/i);
    }

    // Die Maske bleibt sichtbar – sonst wäre die Oberfläche kaputt.
    const maske = await db.query('select masked_secret from ai_connections');
    expect(maske.rows[0].masked_secret).toBe('****');
  });

  it('kann die serverexklusiven Funktionen weiterhin nicht ausführen', async () => {
    await legePersonAn(db, { id: LERNENDE, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });
    await alsPerson(db, LERNENDE);
    for (const sql of [
      "select note_auth_attempt('x', 3, '900 seconds')",
      "select consume_invite_by_hash('x')",
      "select release_invite_by_hash('x')",
      "select rotate_recovery_code('" + LERNENDE + "', 'h')",
    ]) {
      expect(await fehlerVon(db.query(sql)), sql).toMatch(/permission denied/i);
    }
  });
});

/* ------------------------------------------------------------------------ */
/* Keine Rechte, die niemand braucht                                         */
/* ------------------------------------------------------------------------ */

describe('die groben Rechte', () => {
  it('niemand hat TRUNCATE, TRIGGER oder REFERENCES', async () => {
    /*
      Die drei aus Supabases Vorgabe, die am deutlichsten zeigen, dass sie
      niemand geschrieben hat: Kein Teil dieser Anwendung leert eine Tabelle,
      legt einen Trigger an oder setzt einen Fremdschlüssel zur Laufzeit.

      `truncate` ist dabei das unangenehmste, weil es als einziges an den
      Zugriffsregeln vorbeigeht.
    */
    const ergebnis = await db.query(`
      select grantee, table_name, privilege_type
        from information_schema.role_table_grants
       where table_schema = 'public'
         and grantee in ('anon', 'authenticated', 'service_role')
         and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')`);
    expect(ergebnis.rows).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ */
/* Die Vorgabe für künftige Objekte                                          */
/* ------------------------------------------------------------------------ */

describe('was als Nächstes angelegt wird', () => {
  it('eine neue Tabelle kommt ohne Rechte auf die Welt', async () => {
    /*
      Der Test, ohne den die Korrektur bis zur nächsten Migration hält. Er
      legt eine Tabelle an – genau so, wie es eine künftige Migration täte –
      und sieht nach, was sie mitbringt.

      Vorher: sieben Rechte für jede der drei Rollen, ohne ein einziges
      `grant`.
    */
    await alsEinrichtung(db);
    await db.exec('create table probe_kuenftige_tabelle (id integer primary key);');

    const ergebnis = await db.query(`
      select grantee, privilege_type
        from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'probe_kuenftige_tabelle'
         and grantee in ('anon', 'authenticated', 'service_role')`);
    expect(ergebnis.rows).toEqual([]);
  });

  it('und eine neue Sequenz ebenso wenig', async () => {
    await alsEinrichtung(db);
    await db.exec('create sequence probe_kuenftige_sequenz;');

    const ergebnis = await db.query(`
      select grantee, privilege_type
        from information_schema.role_usage_grants
       where object_schema = 'public' and object_name = 'probe_kuenftige_sequenz'
         and grantee in ('anon', 'authenticated', 'service_role')`);
    expect(ergebnis.rows).toEqual([]);
  });

  it('und eine neue Funktion ist für niemanden ausführbar', async () => {
    /*
      Postgres gibt jeder neuen Funktion `execute` für `public`. Ohne die
      umgedrehte Vorgabe in Migration 10 stünde die nächste Funktion, die
      jemand anlegt, wieder für jeden Besucher offen – und die Suche nach
      übersehenen PUBLIC-Rechten finge von vorn an.
    */
    await alsEinrichtung(db);
    await db.exec(
      'create function probe_kuenftige_funktion() returns integer language sql as $$ select 1 $$;',
    );

    const ergebnis = await db.query(`
      select exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) as public_darf,
             has_function_privilege('anon',          p.oid, 'execute') as anon_darf,
             has_function_privilege('authenticated', p.oid, 'execute') as auth_darf,
             has_function_privilege('service_role',  p.oid, 'execute') as dienst_darf
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'probe_kuenftige_funktion'`);
    const z = ergebnis.rows[0];
    expect(z.public_darf, 'PUBLIC darf die neue Funktion ausführen').toBe(false);
    expect(z.anon_darf).toBe(false);
    expect(z.auth_darf).toBe(false);
    expect(z.dienst_darf).toBe(false);
  });

  it('und in `pg_default_acl` steht für diese Rollen nichts mehr', async () => {
    /*
      Die eigentliche Kontrolle, und die einzige, die **beide**
      Geltungsbereiche sieht.

      `alter default privileges` kennt eine Vorgabe mit Schemabezug und eine
      ohne. Ein `revoke` trifft nur den Bereich, den es nennt. Eine frühere
      Fassung von Migration 10 nannte nur `in schema public` – gegen eine
      Vorgabe ohne Schemabezug wirkte sie **gar nicht**, und die Prüfungen
      oben hätten es nicht gemerkt, weil der Harness damals ebenfalls nur
      den einen Bereich setzte. Ein Prüfstand, der nur den freundlichen Fall
      aufbaut, bestätigt nur den freundlichen Fall.

      Diese Abfrage ist die aus der Inbetriebnahme, Abschnitt 3.2.3 – mit
      derselben Eingrenzung: ohne Schemabezug oder `public`. Alles andere
      gehört der Plattform, und die Prüfung darunter sagt, warum das so
      bleiben muss.
    */
    expect(await vorgaberechte()).toEqual([]);
  });

  it('und Vorgaben fremder Plattformschemata lösen keinen Fehlalarm aus', async () => {
    /*
      Ein Supabase-Projekt hat mehr Schemata als `public`: `storage`,
      `graphql`, `realtime`, `vault` und weitere. Sie gehören der Plattform.
      Ihre Vorgaberechte sind der Grund, warum Storage-Uploads und Realtime
      funktionieren, und sie **dürfen nicht verändert werden**.

      Ohne die Eingrenzung auf `public` und den Bereich ohne Schemabezug
      meldete die Kontrolle solche Vorgaben als Befund. Der naheliegende
      nächste Schritt wäre dann, sie abzuräumen – also die Anzeige zu
      reparieren und die Funktion zu zerbrechen.

      Diese Prüfung baut den Fall nach: ein fremdes Schema mit genau den
      Vorgaberechten, die im echten Projekt dort stehen. Die Kontrolle muss
      leer bleiben.
    */
    await alsEinrichtung(db);
    await db.exec(`
      create schema storage;
      alter default privileges for role postgres in schema storage
        grant all on tables to anon, authenticated, service_role;
      alter default privileges for role postgres in schema storage
        grant all on sequences to anon, authenticated, service_role;
      alter default privileges for role postgres in schema storage
        grant execute on functions to public;
    `);

    // Die Vorgaben stehen wirklich da – sonst prüfte der Test nichts.
    const fremd = await db.query(`
      select count(*)::int as n
        from pg_default_acl v
        join pg_namespace s on s.oid = v.defaclnamespace
       where s.nspname = 'storage'`);
    expect(fremd.rows[0].n, 'die Vorgaben im fremden Schema fehlen').toBeGreaterThan(0);

    // Und die Kontrolle sieht sie trotzdem nicht.
    expect(await vorgaberechte()).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ */
/* Was PUBLIC noch darf                                                      */
/* ------------------------------------------------------------------------ */

describe('PUBLIC', () => {
  it('darf keine Funktion dieses Schemas mehr ausführen', async () => {
    const ergebnis = await db.query(`
      select p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
         and (p.proacl is null or exists (
               select 1 from aclexplode(p.proacl) a where a.grantee = 0))
       order by 1`);
    expect(ergebnis.rows.map((z) => z.proname)).toEqual([]);
  });

  it('und die Trigger feuern trotzdem weiter', async () => {
    /*
      Der Grund, warum der Test oben nicht genügt. Drei der fünf entzogenen
      Funktionen sind Triggerfunktionen. Postgres prüft `execute` beim
      **Anlegen** des Triggers, nicht beim Auslösen – aber das ist eine
      Aussage über fremdes Verhalten, und die gehört belegt, nicht geglaubt.
    */
    await legePersonAn(db, { id: LEHRERIN, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });

    await alsPerson(db, LEHRERIN);
    const kurse = await db.query(
      'insert into courses (owner_id, title, school_year) values ($1, $2, $3) returning id',
      [LEHRERIN, 'Englisch 7b', '2026/27'],
    );
    const kurs = kurse.rows[0].id;
    await db.query('update courses set archived = true where id = $1', [kurs]);

    // `app_archived_courses_are_closed` muss weiterhin zuschlagen.
    const fehler = await fehlerVon(
      db.query('update courses set title = $2 where id = $1', [kurs, 'Neuer Name']),
    );
    expect(fehler, 'der Trigger auf archivierten Kursen feuert nicht mehr').toBeTruthy();

    // Und `app_ai_touch` pflegt `updated_at` weiter.
    await alsEinrichtung(db);
    const verbindung = await db.query(
      `insert into ai_connections (owner_id, label, adapter, model)
       values ($1, 'Z', 'gemini', 'm') returning id, updated_at`,
      [LEHRERIN],
    );
    await db.query('update ai_connections set label = $2 where id = $1', [
      verbindung.rows[0].id,
      'Anders',
    ]);
    const danach = await db.query('select updated_at from ai_connections where id = $1', [
      verbindung.rows[0].id,
    ]);
    expect(
      danach.rows[0].updated_at.getTime(),
      '`app_ai_touch` pflegt `updated_at` nicht mehr',
    ).toBeGreaterThanOrEqual(verbindung.rows[0].updated_at.getTime());
  });

  it('`invite_code_hash` bleibt für Angemeldete nutzbar', async () => {
    // Entzogen wurde `public`, nicht `authenticated`. Die Oberfläche braucht sie.
    await legePersonAn(db, { id: LEHRERIN, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });
    await alsPerson(db, LEHRERIN);
    const ergebnis = await db.query("select invite_code_hash('ABCD1234') as h, invite_alphabet() as a");
    expect(ergebnis.rows[0].h).toBeTruthy();
    expect(ergebnis.rows[0].a).toBeTruthy();
  });

  it('aber für nicht angemeldete Besucher nicht mehr', async () => {
    await alsUnangemeldet(db);
    expect(await fehlerVon(db.query("select invite_code_hash('ABCD1234')"))).toMatch(
      /permission denied/i,
    );
  });
});
