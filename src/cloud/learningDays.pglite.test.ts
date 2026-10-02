// @vitest-environment node
import {
  alsEinrichtung,
  alsPerson,
  legePersonAn,
  neueDatenbank,
  testId,
  type TestDatenbank,
} from '../../scripts/db/harness.mjs';
import {
  describeLearningDaysContract,
  type LerntagsSzenario,
} from '../application/learningDaysContract';
import {
  createSqlLearningDaysRepository,
  type LearningDaysGateway,
} from './learningDaysGateway';

/**
 * Der Lerntagsvertrag gegen echtes PostgreSQL (Migration 13).
 *
 * Derselbe Ablauf wie gegen die Fälschung – aber gegen
 * `at time zone s.time_zone`, gegen den Primärschlüssel auf
 * `progress_events` und gegen die Zugriffsregeln auf beiden Tabellen.
 *
 * Geprüft wird hier zusätzlich die **Umrechnung**: Ein `date` kommt aus dem
 * Treiber als `Date` in UTC, und wer darauf `getDate()` aufriefe, verschöbe
 * westlich von Greenwich jeden Tag um eins.
 */

const LERNENDE = testId(1);
const ZWEITE_LERNENDE = testId(2);

function pgliteLearningDaysGateway(db: TestDatenbank): LearningDaysGateway {
  return {
    async rpcLocalToday() {
      return (await db.query('select * from my_local_today()')).rows[0] as never;
    },
    async rpcLearningDays() {
      return (await db.query('select * from my_learning_days() order by local_day')).rows as never;
    },
  };
}

let offen: TestDatenbank | undefined;

const aufbau = async (): Promise<LerntagsSzenario> => {
  await offen?.close();
  const db = await neueDatenbank();
  offen = db;

  await legePersonAn(db, { id: LERNENDE, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });
  await legePersonAn(db, { id: ZWEITE_LERNENDE, name: 'Dachs', kurz: 'LX-8104', rolle: 'student' });

  const repositories = {
    learningDays: createSqlLearningDaysRepository(pgliteLearningDaysGateway(db)),
  };
  let ich = LERNENDE;

  return {
    repositories: () => repositories,
    async alsPerson(userId) {
      ich = userId;
      await alsPerson(db, userId);
    },
    personen: { lernende: LERNENDE, zweiteLernende: ZWEITE_LERNENDE },
    async bestaetigeZeitzone(zone) {
      await alsPerson(db, ich);
      await db.query(
        `insert into learner_settings (user_id, time_zone) values ($1, $2)
         on conflict (user_id) do update set time_zone = excluded.time_zone`,
        [ich, zone],
      );
    },
    async spieleEin(zeitpunkt, anzahl, kennung) {
      /*
        Als Einrichtung: `authenticated` hat auf `progress_events` seit
        Migration 11 nur `select`. Geprüft wird hier die Tagesgrenze, nicht
        der Schreibweg – der hat seinen eigenen Vertrag.
      */
      await alsEinrichtung(db);
      for (let i = 0; i < anzahl; i += 1) {
        /*
          Eine Kennung, die sich aus Person, Aufruf und Nummer ergibt. Damit
          ist derselbe Aufruf zweimal derselbe Satz Ereignisse – und
          `on conflict do nothing` tut genau das, was der Primärschlüssel
          verspricht.
        */
        const nummer = `${ich.slice(-4)}${kennung}${String(i).padStart(3, '0')}`.slice(-12);
        await db.query(
          `insert into progress_events (event_id, user_id, recorded_at)
           values ($1, $2, $3) on conflict (event_id) do nothing`,
          [`00000000-0000-4000-9000-${nummer.padStart(12, '0')}`, ich, zeitpunkt],
        );
      }
      await alsPerson(db, ich);
    },
  };
};

describeLearningDaysContract('Lokale Lerntage (PostgreSQL)', aufbau, async () => {
  await offen?.close();
  offen = undefined;
});
