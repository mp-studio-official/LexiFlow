// @vitest-environment node
import {
  alsEinrichtung,
  alsPerson,
  alsUnangemeldet,
  legePersonAn,
  neueDatenbank,
  testId,
  type TestDatenbank,
} from '../../scripts/db/harness.mjs';
import { describeCourseContract, type KursSzenario } from '../application/courseContract';
import { createSqlCourseRepositories, type CourseGateway } from './courseGateway';

/**
 * Derselbe Kursvertrag – diesmal gegen echtes PostgreSQL.
 *
 * ## Was das gegenüber der Fälschung hinzufügt
 *
 * Die Fälschung prüft, ob die Verträge in sich stimmen. Hier läuft derselbe
 * Ablauf gegen **das** Schema, **die** Bedingungen, **die** Trigger und **die**
 * Zugriffsregeln, die auch im Ernstfall gelten – mit echten Rollenwechseln.
 * Eine Abweichung zwischen Fälschung und Wirklichkeit fällt damit hier auf und
 * nicht erst nach dem Umstellen.
 *
 * ## Was es nicht hinzufügt
 *
 * Die HTTP-Schicht. Die Anbindung unten spricht SQL; im Ernstfall spricht
 * `supabaseCourseGateway.ts` mit PostgREST. Beide rufen dieselben
 * Datenbankfunktionen mit denselben Argumenten auf – aber ob PostgREST das so
 * überträgt, wie dort angenommen, ist ungeprüft (§ 7.1).
 */

/* --------------------------------------------------------------- Anbindung */

/**
 * Der `CourseGateway`, erfüllt mit direktem SQL.
 *
 * Bewusst ohne jede Eigenintelligenz: eine Methode, eine Anweisung. Was hier
 * an Logik stünde, wäre Logik, die im Ernstfall **nicht** läuft – und damit
 * eine Prüfung, die sich selbst belügt.
 */
function pgliteGateway(db: TestDatenbank): CourseGateway {
  async function einzeln<T>(sql: string, werte: readonly unknown[]): Promise<T | undefined> {
    const ergebnis = await db.query<T>(sql, werte);
    return ergebnis.rows[0];
  }

  return {
    async selectMyCourses() {
      // Ohne `where`: Die Zugriffsregel entscheidet, was sichtbar ist. Genau
      // das soll geprüft werden.
      return (await db.query('select * from courses order by created_at')).rows as never;
    },

    async selectCourse(courseId) {
      return einzeln('select * from courses where id = $1', [courseId]);
    },

    async rpcCreateCourse(input) {
      const zeile = await einzeln(
        'select * from create_course($1, $2, $3)',
        [input.title, input.description, input.schoolYear],
      );
      if (!zeile) throw new Error('Der Kurs wurde nicht angelegt.');
      return zeile as never;
    },

    async updateCourse(courseId, changes) {
      /*
        Ein `update` mit veränderlicher Spaltenmenge – aber ohne
        zusammengebaute Zeichenketten: `coalesce($n, spalte)` lässt jedes
        nicht übergebene Feld stehen. Zusammengesetztes SQL wäre hier der
        Anfang einer Injektionslücke.
      */
      return einzeln(
        `update courses
            set title = coalesce($2, title),
                description = case when $6 then $3 else description end,
                school_year = case when $7 then $4 else school_year end,
                archived = coalesce($5, archived)
          where id = $1
          returning *`,
        [
          courseId,
          changes.title ?? null,
          changes.description ?? null,
          changes.school_year ?? null,
          changes.archived ?? null,
          'description' in changes,
          'school_year' in changes,
        ],
      );
    },

    async deleteCourse(courseId) {
      await db.query('delete from courses where id = $1', [courseId]);
    },

    async selectMembers(courseId) {
      /*
        Der Verbund mit `profiles` ist die Stelle, an der die Zugriffsregel auf
        Profile mitgeprüft wird: Eine Lehrkraft sieht die Namen ihrer
        Lerngruppe, sonst niemand.
      */
      return (
        await db.query(
          `select m.user_id, m.role, m.joined_at, p.display_name, p.short_code
             from course_members m
             join profiles p on p.id = m.user_id
            where m.course_id = $1
            order by m.joined_at`,
          [courseId],
        )
      ).rows as never;
    },

    async insertMember(courseId, userId, role) {
      await db.query(
        'insert into course_members (course_id, user_id, role) values ($1, $2, $3)',
        [courseId, userId, role],
      );
    },

    async deleteMember(courseId, userId) {
      await db.query('delete from course_members where course_id = $1 and user_id = $2', [
        courseId,
        userId,
      ]);
    },

    async selectInvites(courseId) {
      return (
        await db.query('select * from course_invites where course_id = $1 order by created_at', [
          courseId,
        ])
      ).rows as never;
    },

    async rpcCreateInvite(courseId, expiresAt, maxUses) {
      const zeile = await einzeln('select * from create_course_invite($1, $2, $3)', [
        courseId,
        expiresAt,
        maxUses,
      ]);
      if (!zeile) throw new Error('Die Einladung wurde nicht angelegt.');
      return zeile as never;
    },

    async updateInviteRevoked(inviteId) {
      return einzeln('update course_invites set revoked = true where id = $1 returning *', [
        inviteId,
      ]);
    },

    async rpcRedeemInvite(code) {
      const zeile = await einzeln('select * from redeem_invite($1)', [code]);
      return zeile as never;
    },
  };
}

/* ---------------------------------------------------------------- Personen */

const PERSONEN = {
  lehrerin: testId(801),
  zweiteLehrkraft: testId(802),
  lernende: testId(803),
  zweiteLernende: testId(804),
};

let offeneDatenbank: TestDatenbank | undefined;

describeCourseContract(
  'SQL gegen PostgreSQL 17.5 (PGlite)',
  async (): Promise<KursSzenario> => {
    const db = await neueDatenbank();
    offeneDatenbank = db;

    await legePersonAn(db, { id: PERSONEN.lehrerin, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });
    await legePersonAn(db, { id: PERSONEN.zweiteLehrkraft, name: 'B. Beispiel', kurz: 'LX-5930', rolle: 'teacher' });
    await legePersonAn(db, { id: PERSONEN.lernende, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });
    await legePersonAn(db, { id: PERSONEN.zweiteLernende, name: 'Dachs', kurz: 'LX-8104', rolle: 'student' });

    const { courses, invitations } = createSqlCourseRepositories(pgliteGateway(db));

    return {
      repositories: () => ({ courses, invitations }),
      alsPerson: (userId) => alsPerson(db, userId),
      abmelden: () => alsUnangemeldet(db),
      personen: PERSONEN,
      async lehrkraftEintragen(courseId, userId) {
        // Über die normalen Regeln: Die Kursleitung ist angemeldet und trägt
        // ein. Mit Einrichtungsrechten wäre es kein Beleg.
        await alsPerson(db, PERSONEN.lehrerin);
        await pgliteGateway(db).insertMember(courseId, userId, 'teacher');
      },
    };
  },
  async () => {
    await offeneDatenbank?.close();
    offeneDatenbank = undefined;
  },
);

/* ------------------------------------------- Was nur in SQL prüfbar ist --- */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('was nur an der Datenbank zu prüfen ist', () => {
  let db: TestDatenbank;
  let gateway: CourseGateway;
  let kurs: string;

  beforeEach(async () => {
    db = await neueDatenbank();
    await legePersonAn(db, { id: PERSONEN.lehrerin, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });
    await legePersonAn(db, { id: PERSONEN.lernende, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });
    await legePersonAn(db, { id: PERSONEN.zweiteLernende, name: 'Dachs', kurz: 'LX-8104', rolle: 'student' });

    gateway = pgliteGateway(db);
    await alsPerson(db, PERSONEN.lehrerin);
    kurs = (await gateway.rpcCreateCourse({ title: 'Englisch 7b', description: null, schoolYear: null })).id;
  });

  afterEach(async () => {
    await db.close();
  });

  it('speichert vom Code nur den Hash – im ganzen Datenbestand', async () => {
    const { code } = await gateway.rpcCreateInvite(kurs, null, null);

    await alsEinrichtung(db);
    const alles = await db.query<{ inhalt: string }>(
      `select coalesce(string_agg(t.zeile, ' '), '') as inhalt
         from (select course_invites::text as zeile from course_invites) t`,
    );
    expect(alles.rows[0]!.inhalt).not.toContain(code);
    // Das Kürzel darf drinstehen – drei Zeichen sind kein Code.
    expect(alles.rows[0]!.inhalt).toContain(code.slice(0, 3));
  });

  it('zählt den letzten freien Platz genau einmal', async () => {
    /*
      **Die ehrliche Grenze dieser Prüfung:** PGlite hat genau eine
      Verbindung. Echte Gleichzeitigkeit lässt sich hier nicht herstellen –
      zwei Beitritte im selben Augenblick sind nicht nachstellbar.

      Was sich prüfen lässt, ist die Eigenschaft, auf der die Sicherheit
      beruht: Prüfung und Hochzählen stehen in **einer** Anweisung. Deshalb
      unten beides – der Ablauf nacheinander (genau einer kommt durch) und die
      Form der Anweisung selbst.
    */
    const { code } = await gateway.rpcCreateInvite(kurs, null, 1);

    await alsPerson(db, PERSONEN.lernende);
    const erste = await gateway.rpcRedeemInvite(code);

    await alsPerson(db, PERSONEN.zweiteLernende);
    const zweite = await gateway.rpcRedeemInvite(code).catch(() => undefined);

    expect(erste?.id).toBe(kurs);
    expect(zweite).toBeUndefined();

    await alsPerson(db, PERSONEN.lehrerin);
    const [einladung] = await gateway.selectInvites(kurs);
    expect(einladung!.used_count).toBe(1);
  });

  it('prüft und zählt in derselben Anweisung', async () => {
    // Der strukturelle Teil der Prüfung oben: `used_count < max_uses` steht im
    // `where` desselben `update`, das hochzählt – nicht in einem `select`
    // davor. Genau das macht zwei gleichzeitige Beitritte ungefährlich.
    const quelle = await db.query<{ prosrc: string }>(
      `select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'consume_invite_by_hash'`,
    );
    const text = quelle.rows[0]!.prosrc.replace(/\s+/g, ' ');
    expect(text).toMatch(/update course_invites set used_count = used_count \+ 1 where/i);
    expect(text).toMatch(/max_uses is null or used_count < max_uses/i);
    // Kein vorgelagertes `select … into` auf dieselbe Zeile.
    expect(text).not.toMatch(/select .* from course_invites .* into/i);
  });

  it('lässt einen zurückgedrehten Platz nicht unter null fallen', async () => {
    const { code } = await gateway.rpcCreateInvite(kurs, null, 2);
    await alsEinrichtung(db);
    await db.query('select release_invite_by_hash(invite_code_hash($1))', [code]);
    const zeilen = await db.query<{ used_count: number }>('select used_count from course_invites');
    expect(zeilen.rows[0]!.used_count).toBe(0);
  });

  it('erzeugt Codes aus dem vorlesbaren Alphabet', async () => {
    await alsEinrichtung(db);
    const zeilen = await db.query<{ code: string }>(
      'select new_invite_code() as code from generate_series(1, 40)',
    );
    for (const zeile of zeilen.rows) {
      expect(zeile.code).toHaveLength(8);
      expect(zeile.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
      expect(zeile.code).not.toMatch(/[OIL01]/);
    }
    // Vierzig gleiche Codes wären ein kaputter Zufall.
    expect(new Set(zeilen.rows.map((zeile) => zeile.code)).size).toBeGreaterThan(35);
  });

  it('lässt niemanden Plätze verbrauchen, ohne beizutreten', async () => {
    // `consume_invite_by_hash` ist bewusst nicht für Angemeldete freigegeben:
    // Wer sie direkt aufriefe, könnte eine Einladung leerlaufen lassen.
    await alsPerson(db, PERSONEN.lernende);
    const fehler = await db
      .query("select consume_invite_by_hash('egal')")
      .then(() => '')
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
    expect(fehler).toMatch(/permission denied|does not exist/i);
  });
});
