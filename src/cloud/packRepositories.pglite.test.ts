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
import { createSqlPackRepositories } from './packGateway';
import { pgliteCourseGateway, pglitePackGateway } from './pgliteGateways';

/**
 * Der Paketvertrag gegen echtes PostgreSQL.
 *
 * Hier läuft derselbe Ablauf wie gegen die Fälschung – aber gegen das Schema,
 * die Bedingungen, den Einfrier-Trigger und die Zugriffsregeln, die auch im
 * Ernstfall gelten. Was das **nicht** hinzufügt, steht in § 7.1: die
 * HTTP-Schicht, echtes Supabase Auth, die Edge-Laufzeit, das Deployment.
 */

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
