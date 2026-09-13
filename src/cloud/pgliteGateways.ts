/**
 * Die PGlite-Anbindungen – Prüfwerkzeug, nicht Anwendung.
 *
 * ## Warum diese Datei in `src/` liegt, obwohl sie nie ausgeliefert wird
 *
 * Sie wird von zwei Prüfungen gebraucht (Kurse und Pakete) und ist
 * TypeScript – in `scripts/` müsste sie JavaScript sein und verlöre damit
 * genau die Typprüfung, die sie mit den Verträgen verbindet.
 *
 * Ausgeliefert wird sie trotzdem nicht: Kein Einstiegspunkt importiert sie,
 * und `src/runtime/portableIsolation.test.ts` prüft die Importgraphen aller
 * drei Einstiege. Was hier steht, kommt in kein Bündel.
 *
 * ## Warum die Anbindungen so dumm wie möglich sind
 *
 * Eine Methode, eine Anweisung. Was hier an Logik stünde, wäre Logik, die im
 * Ernstfall **nicht** läuft – dort spricht PostgREST. Eine Prüfung gegen eine
 * klügere Testanbindung prüfte am Ende die Testanbindung.
 */

import type { TestDatenbank } from '../../scripts/db/harness.mjs';
import type { CourseGateway } from './courseGateway';

/**
 * Der `CourseGateway`, erfüllt mit direktem SQL.
 *
 * Bewusst ohne jede Eigenintelligenz: eine Methode, eine Anweisung. Was hier
 * an Logik stünde, wäre Logik, die im Ernstfall **nicht** läuft – und damit
 * eine Prüfung, die sich selbst belügt.
 */
export function pgliteCourseGateway(db: TestDatenbank): CourseGateway {
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
