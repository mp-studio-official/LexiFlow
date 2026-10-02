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
 * Lokale Lerntage gegen echtes PostgreSQL (Migration 13).
 *
 * ## Worum es hier geht
 *
 * Um die Tagesgrenze. Eine Serie ist eine Aussage über Tage, und welcher Tag
 * gerade ist, hängt davon ab, wo jemand wohnt. Diese Prüfungen zeigen, dass
 * **die gespeicherte Zeitzone** entscheidet – nicht UTC, nicht der Server,
 * nicht irgendein Gerät (E27, E28).
 *
 * ## Warum die Zeitpunkte so gewählt sind
 *
 * `2026-10-05 23:30 UTC` ist in Berlin noch der 6. Oktober (01:30), in
 * Auckland schon der 6. (12:30), in New York noch der 5. (19:30). Ein
 * einziger Zeitstempel fällt damit je nach Zeitzone auf zwei verschiedene
 * Kalendertage – und genau das muss man sehen können.
 */

const LEHRERIN = testId(1);
const LERNENDE = testId(2);
const ZWEITE_LERNENDE = testId(3);

/** Ein Zeitpunkt, der in Europa schon zum Folgetag gehört und in Amerika nicht. */
const ABENDS_UTC = '2026-10-05T23:30:00Z';
/** Derselbe Tag, früher – in jeder dieser Zeitzonen der 5. Oktober. */
const MITTAGS_UTC = '2026-10-05T12:00:00Z';

let db;

beforeEach(async () => {
  db = await neueDatenbank();
  await legePersonAn(db, { id: LEHRERIN, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });
  await legePersonAn(db, { id: LERNENDE, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });
  await legePersonAn(db, { id: ZWEITE_LERNENDE, name: 'Dachs', kurz: 'LX-8104', rolle: 'student' });
});

afterEach(async () => {
  await db?.close();
});

/** Eine bestätigte Zeitzone für diese Person – über den normalen Weg. */
async function bestaetige(person, zone) {
  await alsPerson(db, person);
  await db.query(
    `insert into learner_settings (user_id, time_zone) values ($1, $2)
     on conflict (user_id) do update set time_zone = excluded.time_zone`,
    [person, zone],
  );
}

/**
 * Ereignisse einspielen – als Einrichtung.
 *
 * `authenticated` hat auf `progress_events` seit Migration 11 nur `select`;
 * geschrieben wird ausschließlich über `record_progress_events`. Diese
 * Prüfungen wollen die Tagesgrenze prüfen und nicht den Schreibweg, deshalb
 * stehen die Zeilen hier unmittelbar.
 */
async function spieleEin(person, zeitpunkt, anzahl, praefix = 'e') {
  await alsEinrichtung(db);
  for (let i = 0; i < anzahl; i += 1) {
    await db.query(
      `insert into progress_events (event_id, user_id, recorded_at)
       values ($1, $2, $3) on conflict (event_id) do nothing`,
      [`00000000-0000-4000-9000-${praefix.padEnd(8, '0')}${String(i).padStart(4, '0')}`, person, zeitpunkt],
    );
  }
}

/* ============================================ my_local_today ============ */

describe('my_local_today', () => {
  it('gibt auch ohne Einstellungen und ohne Ereignisse genau eine Zeile', async () => {
    /*
      Der Fall, für den die Funktion so gebaut ist: ein frisches Konto. Keine
      Zeile in `learner_settings`, kein einziges Ereignis – und trotzdem eine
      Antwort, damit die Seite „unbestätigt" von „Fehler" unterscheiden kann.
    */
    await alsPerson(db, LERNENDE);
    const ergebnis = await db.query('select * from my_local_today()');
    expect(ergebnis.rows).toHaveLength(1);
    expect(ergebnis.rows[0].time_zone).toBeNull();
    expect(ergebnis.rows[0].local_day).toBeNull();
    expect(ergebnis.rows[0].week_start).toBeNull();
  });

  it('nennt den lokalen Tag, sobald die Zeitzone bestätigt ist', async () => {
    await bestaetige(LERNENDE, 'Europe/Berlin');
    const ergebnis = await db.query('select * from my_local_today()');
    expect(ergebnis.rows).toHaveLength(1);
    expect(ergebnis.rows[0].time_zone).toBe('Europe/Berlin');
    expect(ergebnis.rows[0].local_day).not.toBeNull();
    expect(ergebnis.rows[0].week_start).not.toBeNull();
  });

  it('beginnt die Woche am Montag', async () => {
    /*
      E2 spricht von der Kalenderwoche. In Deutschland beginnt sie montags,
      und `date_trunc('week', …)` tut dasselbe – nachgesehen, nicht
      angenommen: Der Wochenbeginn muss ein Montag sein und höchstens sechs
      Tage zurückliegen.
    */
    await bestaetige(LERNENDE, 'Europe/Berlin');
    const ergebnis = await db.query(`
      select week_start,
             extract(isodow from week_start)::int as wochentag,
             (local_day - week_start)::int        as versatz
        from my_local_today()`);
    expect(ergebnis.rows[0].wochentag).toBe(1);
    expect(ergebnis.rows[0].versatz).toBeGreaterThanOrEqual(0);
    expect(ergebnis.rows[0].versatz).toBeLessThanOrEqual(6);
  });

  it('gibt zwei Personen in verschiedenen Zeitzonen verschiedene Tage', async () => {
    /*
      Der Nachweis, dass wirklich die **gespeicherte** Zeitzone zählt und
      nicht die des Servers. Kiritimati liegt bei UTC+14, Niue bei UTC-11:
      25 Stunden Abstand – zwischen diesen beiden ist es nie derselbe
      Kalendertag.
    */
    await bestaetige(LERNENDE, 'Pacific/Kiritimati');
    const frueh = await db.query('select local_day from my_local_today()');

    await bestaetige(ZWEITE_LERNENDE, 'Pacific/Niue');
    const spaet = await db.query('select local_day from my_local_today()');

    expect(String(frueh.rows[0].local_day)).not.toBe(String(spaet.rows[0].local_day));
  });

  it('hat keine Parameter', async () => {
    await alsEinrichtung(db);
    const signatur = await db.query(`
      select pg_get_function_arguments(p.oid) as argumente, p.prosecdef
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'my_local_today'`);
    expect(signatur.rows).toHaveLength(1);
    expect(signatur.rows[0].argumente).toBe('');
    expect(signatur.rows[0].prosecdef).toBe(false);
  });
});

/* ============================================ my_learning_days ========== */

describe('my_learning_days', () => {
  it('ist ohne bestätigte Zeitzone leer', async () => {
    /*
      Nicht „in UTC gerechnet". Ohne Tagesgrenze gibt es keinen Tag, und eine
      Zahl auszugeben wäre erfunden, nicht vorsichtig (E27).
    */
    await spieleEin(LERNENDE, MITTAGS_UTC, 12);
    await alsPerson(db, LERNENDE);
    const ergebnis = await db.query('select * from my_learning_days()');
    expect(ergebnis.rows).toHaveLength(0);
  });

  it('zählt die Aufgaben des lokalen Tages', async () => {
    await bestaetige(LERNENDE, 'Europe/Berlin');
    await spieleEin(LERNENDE, MITTAGS_UTC, 12);

    await alsPerson(db, LERNENDE);
    /*
      `local_day::text` und nicht der rohe Wert: Der Treiber macht aus einem
      `date` ein `Date` in UTC, und dessen Textform ist eine andere. Die
      Umrechnung in den Vertrag prüft `learningDays.pglite.test.ts`; hier
      geht es um den Tag, den die Datenbank bildet.
    */
    const ergebnis = await db.query(
      'select local_day::text as tag, task_count from my_learning_days()',
    );
    expect(ergebnis.rows).toHaveLength(1);
    expect(ergebnis.rows[0].tag).toBe('2026-10-05');
    expect(ergebnis.rows[0].task_count).toBe(12);
  });

  it('legt denselben Zeitpunkt je nach Zeitzone auf verschiedene Tage', async () => {
    /*
      Derselbe Zeitstempel, zwei Zeitzonen, zwei Kalendertage. Das ist die
      ganze Begründung dafür, dass die Zeitzone bestätigt sein muss, bevor
      irgendeine Serie beziffert wird.
    */
    await bestaetige(LERNENDE, 'Europe/Berlin');
    await spieleEin(LERNENDE, ABENDS_UTC, 10);

    await alsPerson(db, LERNENDE);
    const berlin = await db.query('select local_day::text as tag from my_learning_days()');
    expect(berlin.rows[0].tag).toBe('2026-10-06');

    await bestaetige(LERNENDE, 'America/New_York');
    const newYork = await db.query('select local_day::text as tag from my_learning_days()');
    expect(newYork.rows[0].tag).toBe('2026-10-05');
  });

  it('rechnet nicht ersatzweise in UTC', async () => {
    /*
      Die Gegenprobe zur Zeile oben, als eigene Prüfung: In UTC wäre der
      Zeitpunkt der 5. Oktober. In Berlin ist er der 6. Stünde hier UTC,
      verschöbe sich **jede** Serie europäischer Lernender um einen Tag,
      sobald abends geübt wird – und zwar lautlos.
    */
    await bestaetige(LERNENDE, 'Europe/Berlin');
    await spieleEin(LERNENDE, ABENDS_UTC, 10);
    await alsPerson(db, LERNENDE);
    const ergebnis = await db.query('select local_day::text as tag from my_learning_days()');
    expect(ergebnis.rows[0].tag).not.toBe('2026-10-05');
    expect(ergebnis.rows[0].tag).toBe('2026-10-06');
  });

  it('zählt ein doppelt eingespieltes Ereignis nur einmal', async () => {
    /*
      E1, und der Riegel steht im Datenmodell: `event_id` ist der
      Primärschlüssel. Hier wird derselbe Satz zweimal eingespielt – die
      Zahl darf sich nicht bewegen.
    */
    await bestaetige(LERNENDE, 'Europe/Berlin');
    await spieleEin(LERNENDE, MITTAGS_UTC, 10, 'a');

    await alsPerson(db, LERNENDE);
    const einmal = await db.query('select task_count from my_learning_days()');
    expect(einmal.rows[0].task_count).toBe(10);

    await spieleEin(LERNENDE, MITTAGS_UTC, 10, 'a');
    await alsPerson(db, LERNENDE);
    const zweimal = await db.query('select task_count from my_learning_days()');
    expect(zweimal.rows[0].task_count).toBe(10);
  });

  it('trennt zwei lokale Tage', async () => {
    await bestaetige(LERNENDE, 'Europe/Berlin');
    await spieleEin(LERNENDE, MITTAGS_UTC, 11, 'a');
    await spieleEin(LERNENDE, '2026-10-07T12:00:00Z', 4, 'b');

    await alsPerson(db, LERNENDE);
    const ergebnis = await db.query(
      'select local_day::text as tag, task_count from my_learning_days() order by 1',
    );
    expect(ergebnis.rows).toEqual([
      { tag: '2026-10-05', task_count: 11 },
      { tag: '2026-10-07', task_count: 4 },
    ]);
  });

  it('zählt ausschließlich die eigenen Ereignisse', async () => {
    await bestaetige(LERNENDE, 'Europe/Berlin');
    await bestaetige(ZWEITE_LERNENDE, 'Europe/Berlin');
    await spieleEin(LERNENDE, MITTAGS_UTC, 10, 'a');
    await spieleEin(ZWEITE_LERNENDE, MITTAGS_UTC, 30, 'b');

    await alsPerson(db, LERNENDE);
    const meins = await db.query('select task_count from my_learning_days()');
    expect(meins.rows[0].task_count).toBe(10);

    await alsPerson(db, ZWEITE_LERNENDE);
    const andere = await db.query('select task_count from my_learning_days()');
    expect(andere.rows[0].task_count).toBe(30);
  });

  it('gibt einer Lehrkraft nichts über ihre Lernenden', async () => {
    await bestaetige(LERNENDE, 'Europe/Berlin');
    await spieleEin(LERNENDE, MITTAGS_UTC, 10);

    await alsPerson(db, LEHRERIN);
    const ergebnis = await db.query('select * from my_learning_days()');
    expect(ergebnis.rows).toHaveLength(0);

    // Auch nicht über `my_local_today` – dort steht die Zeitzone drin.
    const kalender = await db.query('select time_zone from my_local_today()');
    expect(kalender.rows[0].time_zone).toBeNull();
  });

  it('hat keine Parameter und läuft mit den Rechten der aufrufenden Person', async () => {
    await alsEinrichtung(db);
    const signatur = await db.query(`
      select pg_get_function_arguments(p.oid) as argumente, p.prosecdef
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'my_learning_days'`);
    expect(signatur.rows[0].argumente).toBe('');
    expect(signatur.rows[0].prosecdef).toBe(false);
  });
});

/* ============================================ Die Rechte ================ */

describe('Die Rechte an beiden Funktionen', () => {
  it('liegen ausschließlich bei angemeldeten Personen', async () => {
    await alsEinrichtung(db);
    const rechte = await db.query(`
      select p.proname,
             has_function_privilege('authenticated', p.oid, 'execute') as angemeldet,
             has_function_privilege('service_role',  p.oid, 'execute') as dienst,
             has_function_privilege('anon',          p.oid, 'execute') as besucher
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('my_local_today', 'my_learning_days')
       order by p.proname`);
    expect(rechte.rows).toEqual([
      { proname: 'my_learning_days', angemeldet: true, dienst: false, besucher: false },
      { proname: 'my_local_today', angemeldet: true, dienst: false, besucher: false },
    ]);
  });

  it('sind für Besucher ohne Konto und für den Dienst nicht aufrufbar', async () => {
    await alsUnangemeldet(db);
    expect(await fehlerVon(db.query('select * from my_local_today()'))).toMatch(
      /permission denied/i,
    );
    await alsDienst(db);
    expect(await fehlerVon(db.query('select * from my_learning_days()'))).toMatch(
      /permission denied/i,
    );
  });
});
