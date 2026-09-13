// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { alsEinrichtung, alsPerson, migrationstext, neueDatenbank, testId } from './harness.mjs';

/**
 * Prüfungen an der Gestalt des Schemas – nicht an seinem Verhalten.
 *
 * Das Verhalten steht in `rls.test.mjs`: dort wird abgefragt, was jemand
 * tatsächlich zu sehen bekommt. Hier geht es um die Eigenschaften, die auch
 * für **neue** Tabellen gelten sollen, die später jemand hinzufügt. Eine
 * Tabelle ohne `row level security` ist in Supabase über den öffentlichen
 * Schlüssel für jede Person im Netz lesbar; dieser Test fängt das beim
 * Hinzufügen ab und nicht beim Ausliefern.
 */

let db;

beforeEach(async () => {
  db = await neueDatenbank();
});

afterEach(async () => {
  await db?.close();
});

async function zeilen(sql, werte = []) {
  return (await db.query(sql, werte)).rows;
}

describe('die Prüfung selbst prüft etwas', () => {
  it('ohne Rollenwechsel sind Zeilen sichtbar, mit Rollenwechsel nicht', async () => {
    /*
      Die Gegenprobe. Ohne sie könnte jede Prüfung in `rls.test.mjs` aus dem
      falschen Grund bestehen – etwa weil das Einfügen fehlschlug und
      schlicht nichts da ist. Hier wird dieselbe Zeile einmal gesehen und
      einmal nicht; damit steht fest, dass der Rollenwechsel wirkt.
    */
    const person = testId(101);
    const andere = testId(102);
    await alsEinrichtung(db);
    await db.query('insert into auth.users (id) values ($1), ($2)', [person, andere]);
    await db.query(
      `insert into profiles (id, display_name, short_code, role)
       values ($1, 'Eine', 'LX-1111', 'teacher'), ($2, 'Andere', 'LX-2222', 'teacher')`,
      [person, andere],
    );
    await db.query('insert into courses (owner_id, title) values ($1, $2)', [person, 'Kurs']);

    // Als Einrichtung: beide Profile und der Kurs sind da.
    expect(await zeilen('select * from profiles')).toHaveLength(2);
    expect(await zeilen('select * from courses')).toHaveLength(1);

    // Als die andere Person: nichts davon.
    await alsPerson(db, andere);
    expect(await zeilen('select * from courses')).toHaveLength(0);
    expect(await zeilen('select * from profiles')).toHaveLength(1);
  });
});

describe('jede Tabelle ist geschützt', () => {
  it('auf keiner Tabelle in public fehlt row level security', async () => {
    const offen = await zeilen(`
      select tablename from pg_tables
      where schemaname = 'public'
        and not exists (
          select 1 from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = pg_tables.tablename and c.relrowsecurity
        )
      order by 1
    `);
    expect(offen.map((zeile) => zeile.tablename)).toEqual([]);
  });

  it('jede Tabelle hat mindestens eine Regel – oder steht hier mit Begründung', async () => {
    /*
      Eingeschaltete Zeilensicherheit ohne Regel heißt: niemand sieht etwas.
      Das ist sicher und meistens ein Versehen – deshalb fällt es auf.

      Eine Tabelle darf ohne Regel bleiben, wenn sie **niemandem** außer der
      Serverfunktion gehört. Dann steht sie hier, mit dem Grund daneben.
    */
    const absichtlichOhneRegel = {
      auth_rate_limit:
        'Der Versuchszähler gehört der Serverfunktion (Service Role). Wer ihn läse, sähe, welche Lern-IDs versucht wurden.',
    };

    const ohne = await zeilen(`
      select t.tablename
      from pg_tables t
      left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
      where t.schemaname = 'public'
      group by t.tablename
      having count(p.policyname) = 0
      order by 1
    `);
    expect(ohne.map((zeile) => zeile.tablename)).toEqual(Object.keys(absichtlichOhneRegel));

    // Und sie darf dann auch für Angemeldete kein einziges Recht haben.
    for (const tabelle of Object.keys(absichtlichOhneRegel)) {
      const rechte = await zeilen(
        `select privilege_type from information_schema.role_table_grants
          where grantee = 'authenticated' and table_schema = 'public' and table_name = $1`,
        [tabelle],
      );
      expect(rechte, tabelle).toEqual([]);
    }
  });

  it('die Rolle ohne Anmeldung hat auf keiner Tabelle ein Recht', async () => {
    const rechte = await zeilen(`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
      order by 1, 2
    `);
    expect(rechte).toEqual([]);
  });
});

describe('Lernstände sind an die aufrufende Person gebunden', () => {
  const TABELLEN = ['pack_progress', 'entry_progress', 'progress_events'];

  it('jede Lernstandstabelle hat genau eine Regel, und die nennt auth.uid()', async () => {
    for (const tabelle of TABELLEN) {
      const regeln = await zeilen(
        `select policyname, cmd, qual, with_check from pg_policies
         where schemaname = 'public' and tablename = $1`,
        [tabelle],
      );

      expect(regeln, `${tabelle}`).toHaveLength(1);
      const regel = regeln[0];
      // `ALL` – eine Regel für Lesen, Schreiben, Ändern, Löschen. Vier
      // getrennte Regeln wären vier Gelegenheiten, eine davon zu lockern.
      expect(regel.cmd, `${tabelle}`).toBe('ALL');
      expect(regel.qual, `${tabelle}`).toMatch(/user_id = auth\.uid\(\)/);
      expect(regel.with_check, `${tabelle}`).toMatch(/user_id = auth\.uid\(\)/);
    }
  });

  it('keine Regel auf ihnen erwähnt Kurse, Mitgliedschaft oder Rollen', async () => {
    /*
      Der Test, der eine spätere „Klassenübersicht" abfängt. Jede denkbare
      Auswertung bräuchte in genau diesen Regeln einen Bezug auf den Kurs
      oder die Rolle der fragenden Person. Steht dort nichts dergleichen,
      kann es sie nicht geben.
    */
    for (const tabelle of TABELLEN) {
      const regeln = await zeilen(
        `select coalesce(qual, '') || ' ' || coalesce(with_check, '') as bedingung
         from pg_policies where schemaname = 'public' and tablename = $1`,
        [tabelle],
      );
      for (const regel of regeln) {
        for (const wort of ['course_members', 'app_is_teacher_of', 'app_my_role', 'app_is_member_of']) {
          expect(regel.bedingung, `${tabelle} erwähnt ${wort}`).not.toContain(wort);
        }
      }
    }
  });

  it('keine Funktion gibt fremde Lernstände heraus', async () => {
    const verdaechtig = await zeilen(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (p.prosrc like '%pack_progress%' or p.prosrc like '%entry_progress%')
      order by 1
    `);
    expect(verdaechtig.map((zeile) => zeile.proname)).toEqual([]);
  });
});

describe('Rollen lassen sich nicht selbst vergeben', () => {
  it('authenticated darf auf profiles nur den Anzeigenamen ändern', async () => {
    const spalten = await zeilen(`
      select column_name from information_schema.column_privileges
      where grantee = 'authenticated'
        and table_schema = 'public' and table_name = 'profiles'
        and privilege_type = 'UPDATE'
      order by 1
    `);
    expect(spalten.map((zeile) => zeile.column_name)).toEqual(['display_name']);
  });
});

describe('die security-definer-Funktionen bleiben eng', () => {
  it('jede von ihnen hat einen festgesetzten search_path', async () => {
    /*
      Ohne festen `search_path` könnte eine Person mit Schreibrecht auf ein
      Schema im Suchpfad eine Tabelle gleichen Namens unterschieben – und die
      Funktion befragte sie mit erhöhten Rechten.
    */
    const funktionen = await zeilen(`
      select proname, proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
      order by 1
    `);
    expect(funktionen.length).toBeGreaterThan(5);
    for (const funktion of funktionen) {
      expect(
        (funktion.proconfig ?? []).some((eintrag) => eintrag.startsWith('search_path=')),
        `${funktion.proname} ohne search_path`,
      ).toBe(true);
    }
  });

  it('gibt jede von ihnen genau das zurück, was hier steht', async () => {
    /*
      Eine `security definer`-Funktion läuft mit erhöhten Rechten. Was sie
      zurückgibt, ist damit an den Zugriffsregeln vorbei sichtbar – also
      gehört jeder Rückgabetyp einzeln aufgeschrieben und begründet.

      Kommt eine Funktion hinzu, fällt dieser Test auf. Das ist der Zweck:
      Der Satz „gibt eine Tabelle zurück" soll nie unbemerkt entstehen.
    */
    const erwartet = {
      // Ja/Nein über die **aufrufende** Person – geben keine Zeile heraus.
      app_is_member_of: 'boolean',
      app_is_teacher_of: 'boolean',
      app_owns_course: 'boolean',
      app_owns_pack: 'boolean',
      app_sees_profile: 'boolean',
      app_revision_is_assigned_to_me: 'boolean',
      app_my_role: 'app_role',
      confirm_recovery_code: 'boolean',
      note_auth_attempt: 'boolean',

      // Der Kurs, dem gerade beigetreten wurde – danach ohnehin sichtbar.
      redeem_invite: 'courses',
      create_course: 'courses',

      // Die eben erzeugte Einladung samt Klartext. Sie ist der einzige
      // Rückgabewert, der etwas enthält, das nirgends gespeichert wird –
      // und genau deshalb gibt es ihn nur hier und nur einmal.
      create_course_invite:
        'TABLE(invite_id uuid, code text, label text, expires_at timestamp with time zone, max_uses integer)',

      // Die Kurskennung einer belegten Einladung. Nicht für Angemeldete
      // freigegeben – nur die Serverfunktion ruft sie auf.
      consume_invite_by_hash: 'uuid',

      // Schreiben, ohne etwas herauszugeben.
      release_invite_by_hash: 'void',
      create_learner_account: 'void',
      rotate_recovery_code: 'void',
    };

    const funktionen = await zeilen(`
      select p.proname, pg_get_function_result(p.oid) as ergebnis
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
      order by 1
    `);

    const gefunden = Object.fromEntries(
      funktionen.map((funktion) => [funktion.proname, funktion.ergebnis]),
    );
    expect(gefunden).toEqual(erwartet);
  });
});

describe('Veröffentlichtes bleibt, was es war', () => {
  it('ein Trigger schützt die Revisionen – nicht nur eine fehlende Berechtigung', async () => {
    const trigger = await zeilen(`
      select tgname from pg_trigger
      where tgrelid = 'pack_revisions'::regclass and not tgisinternal
    `);
    expect(trigger.map((zeile) => zeile.tgname)).toContain('pack_revisions_frozen');
  });

  it('es gibt keine Löschregel für Revisionen', async () => {
    const regeln = await zeilen(`
      select policyname, cmd from pg_policies
      where schemaname = 'public' and tablename = 'pack_revisions'
      order by 1
    `);
    expect(regeln.map((zeile) => zeile.cmd).sort()).toEqual(['INSERT', 'SELECT', 'UPDATE']);
  });
});

describe('die Migrationen als Text', () => {
  it('enthalten keinen Schlüssel, keine Adresse und kein Kennwort', async () => {
    const text = migrationstext();
    for (const verdaechtig of [
      'supabase.co',
      'eyJ', // der Anfang eines JWT
      'sb_secret',
      'sb_publishable',
      'service_role_key',
      'password',
    ]) {
      expect(text.toLowerCase(), `„${verdaechtig}“ steht in einer Migration`).not.toContain(
        verdaechtig.toLowerCase(),
      );
    }
  });

  it('sind auf Deutsch kommentiert und erklären, warum', async () => {
    // Keine Kosmetik: Diese Dateien sind die Sicherheitsarchitektur. Wer sie
    // in zwei Jahren ändert, soll den Grund neben der Regel finden.
    const text = migrationstext();
    const kommentarzeilen = text.split('\n').filter((zeile) => zeile.trim().startsWith('--'));
    expect(kommentarzeilen.length).toBeGreaterThan(60);
  });
});
