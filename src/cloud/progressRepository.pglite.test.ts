// @vitest-environment node
import {
  alsPerson,
  legePersonAn,
  neueDatenbank,
  testId,
  type TestDatenbank,
} from '../../scripts/db/harness.mjs';
import { describeProgressContract, type LernstandSzenario } from '../application/progressContract';
import { makePack } from '../test/fixtures';
import { createSqlCourseRepositories } from './courseGateway';
import { createSqlPackRepositories } from './packGateway';
import {
  createSqlProgressRepository,
  type ConflictRow,
  type ProgressGateway,
} from './progressGateway';
import { pgliteCourseGateway, pglitePackGateway } from './pgliteGateways';

/**
 * Der Lernstandsvertrag gegen echtes PostgreSQL.
 *
 * Hier läuft derselbe Ablauf wie gegen die Fälschung – aber gegen
 * `record_progress_events`, den Primärschlüssel auf `progress_events`, die
 * Bedingungen auf `box`, `streak` und `due_at` und die Zugriffsregel
 * `user_id = auth.uid()`. Was das **nicht** hinzufügt, steht in § 7.1: die
 * HTTP-Schicht, echtes Supabase Auth, die Edge-Laufzeit, das Deployment.
 */

/**
 * Der `ProgressGateway`, erfüllt mit direktem SQL.
 *
 * Eine Methode, eine Anweisung – und **kein** `where user_id = …`. Was
 * sichtbar ist, entscheidet die Zugriffsregel; ein Filter hier prüfte am Ende
 * den Filter statt der Regel.
 */
function pgliteProgressGateway(db: TestDatenbank): ProgressGateway {
  return {
    async selectPackProgress(courseId, packId) {
      return (
        await db.query('select * from pack_progress where course_id = $1 and pack_id = $2', [
          courseId,
          packId,
        ])
      ).rows[0] as never;
    },

    async selectEntryProgress(courseId, packId) {
      return (
        await db.query(
          `select * from entry_progress
            where course_id = $1 and pack_id = $2
            order by entry_id, direction`,
          [courseId, packId],
        )
      ).rows as never;
    },

    async rpcBeginSession(courseId, packId) {
      await db.query('select begin_practice_session($1, $2)', [courseId, packId]);
    },

    async rpcRecordEvents(events) {
      return (
        await db.query<ConflictRow>('select * from record_progress_events($1)', [
          JSON.stringify(events),
        ])
      ).rows;
    },

    async rpcDueOverview(now) {
      return (
        await db.query(
          now === undefined
            ? 'select * from my_due_overview() order by pack_id'
            : 'select * from my_due_overview($1) order by pack_id',
          now === undefined ? [] : [now],
        )
      ).rows as never;
    },

    async rpcReset(courseId, packId) {
      await db.query('select reset_my_progress($1, $2)', [courseId, packId]);
    },
  };
}

const PERSONEN = {
  lehrerin: testId(911),
  lernende: testId(912),
  zweiteLernende: testId(913),
};

let offeneDatenbank: TestDatenbank | undefined;

describeProgressContract(
  'SQL gegen PostgreSQL 17.5 (PGlite)',
  async (): Promise<LernstandSzenario> => {
    const db = await neueDatenbank();
    offeneDatenbank = db;
    let kursId = '';

    await legePersonAn(db, {
      id: PERSONEN.lehrerin,
      name: 'A. Beispiel',
      kurz: 'LX-4821',
      rolle: 'teacher',
    });
    await legePersonAn(db, {
      id: PERSONEN.lernende,
      name: 'Fuchs',
      kurz: 'LX-7390',
      rolle: 'student',
    });
    await legePersonAn(db, {
      id: PERSONEN.zweiteLernende,
      name: 'Dachs',
      kurz: 'LX-8104',
      rolle: 'student',
    });

    const { courses, invitations } = createSqlCourseRepositories(pgliteCourseGateway(db));
    const { packs, publication } = createSqlPackRepositories(pglitePackGateway(db));
    const progress = createSqlProgressRepository(pgliteProgressGateway(db));

    return {
      repositories: () => ({ progress }),
      alsPerson: (userId) => alsPerson(db, userId),
      personen: { lernende: PERSONEN.lernende, zweiteLernende: PERSONEN.zweiteLernende },
      async kursMitPaket() {
        await alsPerson(db, PERSONEN.lehrerin);
        const kurs = await courses.createCourse({ title: 'Englisch 7b' });
        const { code } = await invitations.createInvite(kurs.id, {});
        const pack = makePack();
        await packs.saveDraft(pack);
        const revision = await publication.publish(pack.meta.id);
        await publication.assignToCourse(kurs.id, pack.meta.id, revision.revision, 0);

        for (const person of [PERSONEN.lernende, PERSONEN.zweiteLernende]) {
          await alsPerson(db, person);
          await invitations.redeemCode(code);
        }

        kursId = kurs.id;
        return {
          courseId: kurs.id,
          packId: pack.meta.id,
          entryIds: pack.entries.map((eintrag) => eintrag.id),
        };
      },
      async archiviereKurs() {
        await alsPerson(db, PERSONEN.lehrerin);
        await courses.setArchived(kursId, true);
      },
      /*
        Entfernen und wieder aufnehmen – über die Tabelle, nicht über ein
        Repository: Es gibt dafür keinen Weg im Lernendenteil, und der
        Lehrkraftweg würde hier die Lehrkraftoberfläche prüfen statt der
        Zugriffsregel.
      */
      async entferneAusKurs() {
        await alsPerson(db, PERSONEN.lehrerin);
        await db.query('delete from course_members where course_id = $1 and user_id = $2', [
          kursId,
          PERSONEN.lernende,
        ]);
      },
      async nimmWiederAuf() {
        await alsPerson(db, PERSONEN.lehrerin);
        await db.query(
          "insert into course_members (course_id, user_id, role) values ($1, $2, 'student')",
          [kursId, PERSONEN.lernende],
        );
      },
    };
  },
  async () => {
    await offeneDatenbank?.close();
    offeneDatenbank = undefined;
  },
);
