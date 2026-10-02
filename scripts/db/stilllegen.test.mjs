// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  alsDienst,
  alsEinrichtung,
  alsPerson,
  fehlerVon,
  legePersonAn,
  neueDatenbank,
  testId,
} from './harness.mjs';

/**
 * Ein Konto stilllegen (Migration 15).
 *
 * ## Die zwei Wege, und warum es zwei sind
 *
 * Der **normale** Weg ist die Mitgliedschaft: Die Lehrkraft entfernt jemanden
 * aus ihrem Kurs, und dort endet der Zugriff. Er ist seit Migration 11 da und
 * im Staging belegt. Er gehört der Lehrkraft, weil der Kurs ihr gehört.
 *
 * Der **Notfall** ist das Konto: weitergegebene Zugangsdaten, mehrere Kurse,
 * oder eine Lage, in der die Lehrkraft nicht die Person ist, die entscheidet.
 * Dafür gab es nichts – für keine Rolle.
 *
 * ## Was diese Datei zeigt
 *
 * Dass der Schalter an **einer** Stelle sitzt und trotzdem überall wirkt:
 * Kurse, Pakete, Fassungen, Lernstand. Und dass er umkehrbar ist – denn eine
 * Stilllegung, die man nicht zurücknehmen kann, ist ein Löschen mit anderem
 * Namen.
 */

const LEHRERIN = testId(1);
const LERNENDE = testId(2);

let db;
let kurs;
let paket;

beforeEach(async () => {
  db = await neueDatenbank();
  await legePersonAn(db, { id: LEHRERIN, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });
  await legePersonAn(db, { id: LERNENDE, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });

  await alsEinrichtung(db);
  const { rows } = await db.query(
    'insert into courses (owner_id, title) values ($1, $2) returning id',
    [LEHRERIN, 'Englisch 7a'],
  );
  kurs = rows[0].id;
  await db.query('insert into course_members (course_id, user_id, role) values ($1, $2, $3)', [
    kurs,
    LEHRERIN,
    'teacher',
  ]);
  await db.query('insert into course_members (course_id, user_id, role) values ($1, $2, $3)', [
    kurs,
    LERNENDE,
    'student',
  ]);
  const paketZeile = await db.query(
    "insert into packs (id, owner_id, title, grade) values ('p-1', $1, 'Unit 1', '7') returning id",
    [LEHRERIN],
  );
  paket = paketZeile.rows[0].id;
});

afterEach(async () => {
  await db?.close();
});

/** Der Schalter – so, wie ihn eine Serverfunktion umlegt. */
async function legeStill(person) {
  await alsDienst(db);
  await db.query('update profiles set disabled_at = now() where id = $1', [person]);
}

async function zaehleKurse(person) {
  await alsPerson(db, person);
  const { rows } = await db.query('select count(*)::int as n from courses');
  return rows[0].n;
}

describe('solange niemand stillgelegt ist', () => {
  it('ändert Migration 15 nichts', async () => {
    expect(await zaehleKurse(LERNENDE)).toBe(1);
    expect(await zaehleKurse(LEHRERIN)).toBe(1);
  });

  it('steht `disabled_at` auf null', async () => {
    await alsEinrichtung(db);
    const { rows } = await db.query('select count(*)::int as n from profiles where disabled_at is not null');
    expect(rows[0].n).toBe(0);
  });
});

describe('eine stillgelegte lernende Person', () => {
  it('sieht ihren Kurs nicht mehr', async () => {
    await legeStill(LERNENDE);
    expect(await zaehleKurse(LERNENDE)).toBe(0);
  });

  it('kommt an den Lernstand nicht mehr heran', async () => {
    await legeStill(LERNENDE);
    await alsPerson(db, LERNENDE);
    const fehler = await fehlerVon(db.query('select begin_practice_session($1, $2)', [kurs, paket]));
    expect(fehler).toBeDefined();
  });

  it('behält ihren Lernstand – er wird nicht gelöscht', async () => {
    /*
      Der Unterschied zum Löschen, und er ist der ganze Punkt: Wer
      zurückkommt, findet seinen Stand vor. Eine Stilllegung, die nebenbei
      Daten wegnimmt, ist keine.
    */
    await alsEinrichtung(db);
    await db.query(
      `insert into entry_progress (user_id, course_id, pack_id, entry_id, direction, box, due_at, rev)
       values ($1, $2, $3, 'e-1', 'en-de', 2, now(), 1)`,
      [LERNENDE, kurs, paket],
    );
    await legeStill(LERNENDE);
    await alsEinrichtung(db);
    const { rows } = await db.query('select count(*)::int as n from entry_progress where user_id = $1', [
      LERNENDE,
    ]);
    expect(rows[0].n).toBe(1);
  });

  it('ist wieder da, wenn der Schalter zurückgeht', async () => {
    await legeStill(LERNENDE);
    expect(await zaehleKurse(LERNENDE)).toBe(0);
    await alsDienst(db);
    await db.query('update profiles set disabled_at = null where id = $1', [LERNENDE]);
    expect(await zaehleKurse(LERNENDE)).toBe(1);
  });

  it('nimmt niemanden sonst mit', async () => {
    await legeStill(LERNENDE);
    expect(await zaehleKurse(LEHRERIN)).toBe(1);
  });
});

describe('eine stillgelegte Lehrkraft', () => {
  it('kommt auch über den Kursbesitz nicht mehr hinein', async () => {
    /*
      Der Fall, den ein Riegel allein auf der Mitgliedschaft verfehlt hätte:
      Eine Lehrkraft sieht ihre Kurse über `app_owns_course`, nicht über die
      Mitgliedschaft.
    */
    await legeStill(LEHRERIN);
    expect(await zaehleKurse(LEHRERIN)).toBe(0);
  });

  it('sieht auch ihre Pakete nicht mehr', async () => {
    await legeStill(LEHRERIN);
    await alsPerson(db, LEHRERIN);
    const { rows } = await db.query('select count(*)::int as n from packs');
    expect(rows[0].n).toBe(0);
  });
});

describe('wer den Schalter umlegen darf', () => {
  it('die lernende Person selbst nicht', async () => {
    await alsPerson(db, LERNENDE);
    expect(
      await fehlerVon(db.query('update profiles set disabled_at = null where id = $1', [LERNENDE])),
    ).toBeDefined();
  });

  it('die Lehrkraft nicht', async () => {
    await alsPerson(db, LEHRERIN);
    expect(
      await fehlerVon(db.query('update profiles set disabled_at = now() where id = $1', [LERNENDE])),
    ).toBeDefined();
  });

  it('eine Serverfunktion schon', async () => {
    await alsDienst(db);
    expect(
      await fehlerVon(db.query('update profiles set disabled_at = now() where id = $1', [LERNENDE])),
    ).toBeUndefined();
  });

  it('eine Serverfunktion aber weiterhin keine Rolle', async () => {
    /*
      Das neue Schreibrecht ist auf genau eine Spalte beschränkt. Ohne diese
      Prüfung wäre „grant update (disabled_at)" beim nächsten Lesen nicht von
      „grant update" zu unterscheiden.
    */
    await alsDienst(db);
    expect(
      await fehlerVon(db.query('update profiles set role = $1 where id = $2', ['admin', LERNENDE])),
    ).toBeDefined();
  });
});
