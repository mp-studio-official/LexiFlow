// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  alsEinrichtung,
  alsPerson,
  legePersonAn,
  neueDatenbank,
  testId,
  type TestDatenbank,
} from '../../scripts/db/harness.mjs';
import {
  describeLearnerSettingsContract,
  type EinstellungsSzenario,
} from '../application/learnerSettingsContract';
import {
  createSqlLearnerSettingsRepository,
  type LearnerSettingsGateway,
} from './learnerSettingsGateway';
import { createSqlProgressOverviewRepository, type ProgressGateway } from './progressGateway';

/**
 * Einstellungen und kursübergreifender Lernstand gegen echtes PostgreSQL.
 *
 * Hier läuft derselbe Vertrag wie gegen die Fälschung – aber gegen die
 * Prüfbedingung auf `weekly_goal_days`, den Trigger gegen
 * `pg_timezone_names` und die Zugriffsregel `learner_settings_own`. Was das
 * **nicht** hinzufügt, steht in § 7.1: die HTTP-Schicht, echtes Supabase
 * Auth, die Edge-Laufzeit, das Deployment.
 */

const LEHRERIN = testId(1);
const LERNENDE = testId(2);
const ZWEITE_LERNENDE = testId(3);

/**
 * Der `LearnerSettingsGateway`, erfüllt mit direktem SQL.
 *
 * Kein `where user_id = …` beim Lesen: Was sichtbar ist, entscheidet die
 * Zugriffsregel. Ein Filter hier prüfte am Ende den Filter statt der Regel.
 *
 * Beim Schreiben steht die Kennung doch da – sie ist der Primärschlüssel.
 * Sie kommt aus `auth.uid()`, also aus der Sitzung, nicht aus einem
 * Parameter; genau so wie in der Supabase-Anbindung, wo sie aus der
 * angemeldeten Sitzung kommt.
 */
function pgliteLearnerSettingsGateway(db: TestDatenbank): LearnerSettingsGateway {
  return {
    async selectMySettings() {
      return (await db.query('select * from learner_settings')).rows[0] as never;
    },

    async upsertMySettings(aenderung) {
      const spalten: string[] = [];
      const werte: unknown[] = [];
      if (aenderung.timeZone !== undefined) {
        spalten.push('time_zone');
        werte.push(aenderung.timeZone);
      }
      if (aenderung.weeklyGoalDays !== undefined) {
        spalten.push('weekly_goal_days');
        werte.push(aenderung.weeklyGoalDays);
      }

      const felder = ['user_id', ...spalten];
      const platzhalter = felder.map((_, i) => `$${i + 1}`);
      const setzen = spalten.map((spalte) => `${spalte} = excluded.${spalte}`);

      const sql = `
        insert into learner_settings (${felder.join(', ')})
        values (${platzhalter.join(', ')})
        on conflict (user_id) do update set ${
          setzen.length > 0 ? setzen.join(', ') : 'user_id = excluded.user_id'
        }
        returning *`;
      const ich = (await db.query('select auth.uid() as ich')).rows[0] as { ich: string };
      return (await db.query(sql, [ich.ich, ...werte])).rows[0] as never;
    },
  };
}

let offeneDatenbank: TestDatenbank | undefined;

const aufbau = async (): Promise<EinstellungsSzenario> => {
  await offeneDatenbank?.close();
  const db = await neueDatenbank();
  offeneDatenbank = db;

  await legePersonAn(db, { id: LEHRERIN, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });
  await legePersonAn(db, { id: LERNENDE, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });
  await legePersonAn(db, { id: ZWEITE_LERNENDE, name: 'Dachs', kurz: 'LX-8104', rolle: 'student' });

  const repositories = {
    learnerSettings: createSqlLearnerSettingsRepository(pgliteLearnerSettingsGateway(db)),
  };

  return {
    repositories: () => repositories,
    async alsPerson(userId) {
      await alsPerson(db, userId);
    },
    personen: { lernende: LERNENDE, zweiteLernende: ZWEITE_LERNENDE },
  };
};

describeLearnerSettingsContract('Lernendeneinstellungen (PostgreSQL)', aufbau, async () => {
  await offeneDatenbank?.close();
  offeneDatenbank = undefined;
});

/* ====================================== Kursübergreifender Lernstand ==== */

/**
 * Der Teil des `ProgressGateway`, den die Übersicht braucht.
 *
 * Der Rest wirft: Dieser Test prüft die Umrechnung von `my_due_overview`,
 * und eine Methode, die hier nie aufgerufen werden darf, soll das sagen
 * statt still `undefined` zurückzugeben.
 */
function pgliteUebersichtGateway(db: TestDatenbank): ProgressGateway {
  const nichtHier = () => {
    throw new Error('Dieser Test ruft nur die Übersicht auf.');
  };
  return {
    selectPackProgress: nichtHier,
    selectEntryProgress: nichtHier,
    rpcBeginSession: nichtHier,
    rpcRecordEvents: nichtHier,
    rpcReset: nichtHier,
    async rpcDueOverview() {
      return (await db.query('select * from my_due_overview() order by pack_id')).rows as never;
    },
  };
}

describe('my_due_overview über den Vertrag', () => {
  async function szenario() {
    const db = await neueDatenbank();
    await legePersonAn(db, { id: LEHRERIN, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });
    await legePersonAn(db, { id: LERNENDE, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });
    await legePersonAn(db, {
      id: ZWEITE_LERNENDE,
      name: 'Dachs',
      kurz: 'LX-8104',
      rolle: 'student',
    });

    await alsPerson(db, LEHRERIN);
    const kurs = (
      await db.query(
        'insert into courses (owner_id, title, school_year) values ($1, $2, $3) returning id',
        [LEHRERIN, 'Englisch 7b', '2026/27'],
      )
    ).rows[0]!.id as string;
    for (const person of [LEHRERIN, LERNENDE, ZWEITE_LERNENDE]) {
      await db.query('insert into course_members (course_id, user_id, role) values ($1, $2, $3)', [
        kurs,
        person,
        person === LEHRERIN ? 'teacher' : 'student',
      ]);
    }
    await db.query('insert into packs (id, owner_id, title, grade) values ($1, $2, $3, $4)', [
      'pack-a',
      LEHRERIN,
      'Unit 3',
      '7',
    ]);
    await db.query('insert into packs (id, owner_id, title, grade) values ($1, $2, $3, $4)', [
      'pack-b',
      LEHRERIN,
      'Unit 4',
      '7',
    ]);

    await alsEinrichtung(db);
    await db.query(
      `insert into entry_progress (user_id, course_id, pack_id, entry_id, direction, due_at)
       values ($1, $2, 'pack-a', 'v-1', 'en-de', now() - interval '1 day'),
              ($1, $2, 'pack-a', 'v-2', 'en-de', now() + interval '3 days'),
              ($1, $2, 'pack-b', 'v-9', 'de-en', now() - interval '2 hours'),
              ($3, $2, 'pack-a', 'v-1', 'en-de', now() - interval '9 days')`,
      [LERNENDE, kurs, ZWEITE_LERNENDE],
    );
    await db.query(
      `insert into pack_progress (user_id, course_id, pack_id, last_practiced_at)
       values ($1, $2, 'pack-a', timestamptz '2026-10-01 07:30:00+00')`,
      [LERNENDE, kurs],
    );

    return { db, kurs, uebersicht: createSqlProgressOverviewRepository(pgliteUebersichtGateway(db)) };
  }

  it('rechnet die Zeilen in den Vertrag um', async () => {
    const { db, kurs, uebersicht } = await szenario();
    try {
      await alsPerson(db, LERNENDE);
      const zeilen = await uebersicht.myDueOverview();
      expect(zeilen).toEqual([
        {
          courseId: kurs,
          packId: 'pack-a',
          dueCount: 1,
          entryCount: 2,
          lastPracticedAt: '2026-10-01T07:30:00.000Z',
        },
        { courseId: kurs, packId: 'pack-b', dueCount: 1, entryCount: 1 },
      ]);
      /*
        `lastPracticedAt` fehlt bei `pack-b` – es ist nicht `null` und nicht
        die leere Zeichenkette. Ein optionales Feld, das manchmal `null` ist,
        bedeutete an jeder Aufrufstelle zwei Fälle statt einem.
      */
      expect('lastPracticedAt' in zeilen[1]!).toBe(false);
    } finally {
      await db.close();
    }
  });

  it('gibt Zahlen zurück, keine Zeichenketten', async () => {
    // Ein `"3"` aus JSON fiele erst drei Ebenen später auf – als `"3" + 1`.
    const { db, uebersicht } = await szenario();
    try {
      await alsPerson(db, LERNENDE);
      const [erste] = await uebersicht.myDueOverview();
      expect(typeof erste!.dueCount).toBe('number');
      expect(typeof erste!.entryCount).toBe('number');
    } finally {
      await db.close();
    }
  });

  it('zeigt nur den eigenen Lernstand', async () => {
    const { db, uebersicht } = await szenario();
    try {
      await alsPerson(db, ZWEITE_LERNENDE);
      const zeilen = await uebersicht.myDueOverview();
      expect(zeilen).toHaveLength(1);
      expect(zeilen[0]!.packId).toBe('pack-a');
      expect(zeilen[0]!.entryCount).toBe(1);

      await alsPerson(db, LEHRERIN);
      await expect(uebersicht.myDueOverview()).resolves.toEqual([]);
    } finally {
      await db.close();
    }
  });

  it('folgt der Uhr der Datenbank, nicht einem übergebenen Zeitpunkt', async () => {
    /*
      `myDueOverview()` nimmt nichts entgegen. Bewegt wird deshalb die
      Fälligkeit selbst – relativ zu `now()`, damit der Test keine eigene Uhr
      hat und an keiner Zeitgrenze kippen kann (E28).
    */
    const { db, uebersicht } = await szenario();
    try {
      await alsPerson(db, LERNENDE);
      expect((await uebersicht.myDueOverview()).map((zeile) => zeile.dueCount)).toEqual([1, 1]);

      await alsEinrichtung(db);
      await db.query(
        `update entry_progress set due_at = now() - interval '1 minute'
          where user_id = $1 and entry_id = 'v-2'`,
        [LERNENDE],
      );

      await alsPerson(db, LERNENDE);
      const nachher = await uebersicht.myDueOverview();
      expect(nachher.map((zeile) => zeile.dueCount)).toEqual([2, 1]);
      // Und sonst bewegt sich nichts: dieselben Pakete, dieselben Gesamtzahlen.
      expect(nachher.map((zeile) => zeile.entryCount)).toEqual([2, 1]);
      expect(nachher[0]!.lastPracticedAt).toBe('2026-10-01T07:30:00.000Z');
    } finally {
      await db.close();
    }
  });
});
