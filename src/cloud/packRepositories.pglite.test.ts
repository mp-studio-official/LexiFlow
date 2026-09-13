// @vitest-environment node
import {
  alsPerson,
  legePersonAn,
  neueDatenbank,
  testId,
  type TestDatenbank,
} from '../../scripts/db/harness.mjs';
import { describePackContract, type PaketSzenario } from '../application/packContract';
import { createSqlCourseRepositories } from './courseGateway';
import { createSqlPackRepositories, type PackGateway } from './packGateway';
import { pgliteCourseGateway } from './pgliteGateways';

/**
 * Der Paketvertrag gegen echtes PostgreSQL.
 *
 * Hier läuft derselbe Ablauf wie gegen die Fälschung – aber gegen das Schema,
 * die Bedingungen, den Einfrier-Trigger und die Zugriffsregeln, die auch im
 * Ernstfall gelten. Was das **nicht** hinzufügt, steht in § 7.1: die
 * HTTP-Schicht, echtes Supabase Auth, die Edge-Laufzeit, das Deployment.
 */

/**
 * Der `PackGateway`, erfüllt mit direktem SQL.
 *
 * Eine Methode, eine Anweisung – wie beim Kursgateway. Was hier an Logik
 * stünde, liefe im Ernstfall nicht mit und wäre eine Prüfung, die sich selbst
 * belügt.
 */
function pglitePackGateway(db: TestDatenbank): PackGateway {
  async function einzeln<T>(sql: string, werte: readonly unknown[]): Promise<T | undefined> {
    return (await db.query<T>(sql, werte)).rows[0];
  }

  return {
    async selectOverview() {
      /*
        Ein Verbund über drei Tabellen statt dreier Abfragen: Die Liste einer
        Lehrkraft soll in einem Umlauf stehen. Die Zugriffsregeln gelten
        dabei für jede beteiligte Tabelle einzeln – genau das wird hier
        mitgeprüft.
      */
      return (
        await db.query(
          `select p.id, p.title, p.grade, p.created_at, p.updated_at,
                  coalesce(jsonb_array_length(d.pack -> 'entries'), 0) as entry_count,
                  r.revision as published_revision,
                  r.published_at
             from packs p
             left join pack_drafts d on d.pack_id = p.id
             left join lateral (
               select revision, published_at from pack_revisions
                where pack_id = p.id order by revision desc limit 1
             ) r on true
            order by p.updated_at desc`,
        )
      ).rows as never;
    },

    async selectDraft(packId) {
      return einzeln('select * from pack_drafts where pack_id = $1', [packId]);
    },

    async rpcSaveDraft(input) {
      const zeile = await einzeln('select * from save_pack_draft($1, $2, $3, $4, $5)', [
        input.packId,
        input.title,
        input.grade,
        input.formatVersion,
        JSON.stringify(input.pack),
      ]);
      if (!zeile) throw new Error('Das Paket wurde nicht gespeichert.');
      return zeile as never;
    },

    async deletePack(packId) {
      await db.query('delete from packs where id = $1', [packId]);
    },

    async rpcPublish(packId) {
      const zeile = await einzeln('select * from publish_pack($1)', [packId]);
      if (!zeile) throw new Error('Die Veröffentlichung ist nicht zustande gekommen.');
      return zeile as never;
    },

    async rpcWithdraw(packId, revision) {
      await db.query('select withdraw_pack_revision($1, $2)', [packId, revision]);
    },

    async selectRevisions(packId) {
      return (
        await db.query(
          `select pack_id, revision, format_version, published_by, published_at, withdrawn_at
             from pack_revisions where pack_id = $1 order by revision`,
          [packId],
        )
      ).rows as never;
    },

    async rpcAssign(courseId, packId, revision, sortOrder) {
      await db.query('select assign_pack_to_course($1, $2, $3, $4)', [
        courseId,
        packId,
        revision,
        sortOrder,
      ]);
    },

    async deleteAssignment(courseId, packId) {
      await db.query('delete from course_packs where course_id = $1 and pack_id = $2', [
        courseId,
        packId,
      ]);
    },

    async selectCourseRevisions(courseId) {
      return (
        await db.query(
          `select r.*
             from course_packs cp
             join pack_revisions r on r.pack_id = cp.pack_id and r.revision = cp.revision
            where cp.course_id = $1 and r.withdrawn_at is null
            order by cp.sort_order`,
          [courseId],
        )
      ).rows as never;
    },
  };
}

const PERSONEN = {
  lehrerin: testId(901),
  zweiteLehrkraft: testId(902),
  lernende: testId(903),
};

let offeneDatenbank: TestDatenbank | undefined;

describePackContract(
  'SQL gegen PostgreSQL 17.5 (PGlite)',
  async (): Promise<PaketSzenario> => {
    const db = await neueDatenbank();
    offeneDatenbank = db;

    await legePersonAn(db, { id: PERSONEN.lehrerin, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });
    await legePersonAn(db, { id: PERSONEN.zweiteLehrkraft, name: 'B. Beispiel', kurz: 'LX-5930', rolle: 'teacher' });
    await legePersonAn(db, { id: PERSONEN.lernende, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });

    const { packs, publication } = createSqlPackRepositories(pglitePackGateway(db));
    const { courses, invitations } = createSqlCourseRepositories(pgliteCourseGateway(db));

    return {
      repositories: () => ({ packs, publication }),
      alsPerson: (userId) => alsPerson(db, userId),
      personen: PERSONEN,
      async kursMitLernender() {
        await alsPerson(db, PERSONEN.lehrerin);
        const kurs = await courses.createCourse({ title: 'Englisch 7b' });
        const { code } = await invitations.createInvite(kurs.id, {});

        await alsPerson(db, PERSONEN.lernende);
        await invitations.redeemCode(code);

        await alsPerson(db, PERSONEN.lehrerin);
        return kurs.id;
      },
    };
  },
  async () => {
    await offeneDatenbank?.close();
    offeneDatenbank = undefined;
  },
);
