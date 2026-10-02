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
 * Der Rollenriegel bei der Selbstanlage (Migration 14).
 *
 * ## Der Befund, der dazu geführt hat
 *
 * `profiles_insert_self` schränkte **nur** `id = auth.uid()` ein. Die Spalte
 * `role` war nicht erwähnt, und `grant insert on profiles` galt für die
 * ganze Tabelle. Ein Konto konnte sich sein eigenes Profil also mit
 * `role = 'teacher'` anlegen; erst das spätere **Ändern** scheiterte am
 * Spaltenrecht auf `update`.
 *
 * ## Warum das nicht an einer Dashboard-Einstellung hängen darf
 *
 * Ausnutzbar ist der Befund nur, wenn jemand überhaupt ein Konto anlegen
 * kann – also wenn die Registrierung per E-Mail eingeschaltet ist. Sie muss
 * im Staging **aus** sein (siehe `docs/pilot-0.1-readiness.md`). Aber eine
 * Zugriffsregel, die nur deshalb hält, weil nebenan ein Schalter richtig
 * steht, ist keine: Der Schalter wird einmal umgelegt, und niemand liest
 * dabei diese Datei.
 *
 * ## Was hier geprüft wird – und was ausdrücklich nicht
 *
 * Geprüft wird die **Datenbank**. Ob die Oberfläche eine Rolle anbietet, ist
 * eine andere Frage und ein schwächerer Riegel: Wer die Regel umgehen will,
 * benutzt keine Oberfläche.
 */

const LEHRERIN = testId(1);
const LERNENDE = testId(2);
/** Ein Konto ohne Profil – der Ausgangspunkt jeder Selbstanlage. */
const NEULING = testId(9);

let db;

beforeEach(async () => {
  db = await neueDatenbank();
  await legePersonAn(db, { id: LEHRERIN, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });
  await legePersonAn(db, { id: LERNENDE, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });
  await alsEinrichtung(db);
  await db.query('insert into auth.users (id) values ($1)', [NEULING]);
});

afterEach(async () => {
  await db?.close();
});

/** Eine Selbstanlage, genau so, wie ein Browser sie abschickt. */
async function legeSelbstAn(person, rolle, kurz) {
  await alsPerson(db, person);
  const spalten = rolle === undefined ? '(id, display_name, short_code)' : '(id, display_name, short_code, role)';
  const werte = rolle === undefined ? [person, 'Neu', kurz] : [person, 'Neu', kurz, rolle];
  const platzhalter = werte.map((_, i) => `$${i + 1}`).join(', ');
  return fehlerVon(db.query(`insert into profiles ${spalten} values (${platzhalter})`, werte));
}

describe('Selbstanlage eines Profils', () => {
  it('lehnt die Rolle teacher ab', async () => {
    expect(await legeSelbstAn(NEULING, 'teacher', 'LX-0001')).toBeDefined();
  });

  it('lehnt die Rolle admin ab', async () => {
    expect(await legeSelbstAn(NEULING, 'admin', 'LX-0002')).toBeDefined();
  });

  /*
    Diese Erwartung stand hier zuerst andersherum: `student` ausdrücklich
    anzugeben sollte erlaubt sein. Das Spaltenrecht ist strenger, und zwar
    richtigerweise – wer `role` überhaupt nennen darf, nennt irgendwann etwas
    anderes. Die Lernendenrolle entsteht aus der Vorgabe, nicht aus einer
    Angabe des Browsers.
  */
  it('lehnt jede ausdrückliche Rollenangabe ab – auch student', async () => {
    expect(await legeSelbstAn(NEULING, 'student', 'LX-0003')).toBeDefined();
  });

  it('legt die Lernendenrolle über die Vorgabe an', async () => {
    expect(await legeSelbstAn(NEULING, undefined, 'LX-0004')).toBeUndefined();
    await alsEinrichtung(db);
    const { rows } = await db.query('select role from profiles where id = $1', [NEULING]);
    expect(rows[0].role).toBe('student');
  });

  it('bliebe auch dann verriegelt, wenn das Spaltenrecht zurückkäme', async () => {
    /*
      Riegel 2 für sich allein. Hier wird genau der Fehler nachgestellt, der
      eines Tages passiert: Jemand vergibt `insert (role)` wieder – etwa
      beim Nachziehen einer Rechteliste. Dann hält nur noch die Regel, und
      sie muss halten.
    */
    await alsEinrichtung(db);
    await db.query('grant insert (role) on profiles to authenticated');
    expect(await legeSelbstAn(NEULING, 'teacher', 'LX-0009')).toBeDefined();
    expect(await legeSelbstAn(NEULING, 'admin', 'LX-0010')).toBeDefined();
    expect(await legeSelbstAn(NEULING, 'student', 'LX-0011')).toBeUndefined();
  });

  it('lehnt ein fremdes Profil weiterhin ab', async () => {
    await alsPerson(db, NEULING);
    const fehler = await fehlerVon(
      db.query('insert into profiles (id, display_name, short_code) values ($1, $2, $3)', [
        testId(99),
        'Fremd',
        'LX-0005',
      ]),
    );
    expect(fehler).toBeDefined();
  });

  it('lehnt sie ohne Anmeldung ab', async () => {
    await alsUnangemeldet(db);
    const fehler = await fehlerVon(
      db.query('insert into profiles (id, display_name, short_code) values ($1, $2, $3)', [
        NEULING,
        'Neu',
        'LX-0006',
      ]),
    );
    expect(fehler).toBeDefined();
  });
});

describe('Die eigene Rolle nachträglich ändern', () => {
  it('ist für die lernende Person nicht möglich', async () => {
    await alsPerson(db, LERNENDE);
    expect(await fehlerVon(db.query('update profiles set role = $1 where id = $2', ['teacher', LERNENDE]))).toBeDefined();
  });

  it('bliebe auch dann verriegelt, wenn das Spaltenrecht zurückkäme', async () => {
    /*
      Riegel 3 für sich allein – derselbe nachgestellte Fehler wie oben, nur
      auf `update`. Ohne den Auslöser wäre die Selbsterhebung hier wieder da.
    */
    await alsEinrichtung(db);
    await db.query('grant update (role) on profiles to authenticated');
    await alsPerson(db, LERNENDE);
    const fehler = await fehlerVon(
      db.query('update profiles set role = $1 where id = $2', ['admin', LERNENDE]),
    );
    expect(fehler).toContain('eigene Rolle');
  });

  it('hindert die Einrichtung nicht daran, eine fremde Rolle zu setzen', async () => {
    /*
      Der vorgesehene Weg: Die Verwaltung vergibt eine Rolle. Ein Auslöser,
      der auch das verböte, machte aus dem Riegel eine Sackgasse.
    */
    await alsEinrichtung(db);
    expect(
      await fehlerVon(db.query('update profiles set role = $1 where id = $2', ['teacher', LERNENDE])),
    ).toBeUndefined();
  });

  it('ist auch dann nicht möglich, wenn nur der Anzeigename mitgeschickt wird', async () => {
    /*
      Der Spaltenriegel auf `update` greift, sobald `role` in der Anweisung
      steht – auch neben einer erlaubten Spalte. Diese Prüfung hält fest,
      dass die erlaubte Spalte die verbotene nicht mitnimmt.
    */
    await alsPerson(db, LERNENDE);
    const fehler = await fehlerVon(
      db.query('update profiles set display_name = $1, role = $2 where id = $3', ['Fuchs II', 'admin', LERNENDE]),
    );
    expect(fehler).toBeDefined();
  });
});

describe('Die legitimen Wege bleiben offen', () => {
  it('der Anzeigename lässt sich weiterhin ändern', async () => {
    await alsPerson(db, LERNENDE);
    expect(
      await fehlerVon(db.query('update profiles set display_name = $1 where id = $2', ['Fuchs II', LERNENDE])),
    ).toBeUndefined();
  });

  it('`create_learner_account` legt weiterhin ein Lernendenprofil an', async () => {
    await alsEinrichtung(db);
    const { rows: kurse } = await db.query(
      'insert into courses (owner_id, title) values ($1, $2) returning id',
      [LEHRERIN, 'Englisch 7a'],
    );
    const kurs = kurse[0].id;
    await db.query('insert into auth.users (id) values ($1)', [testId(10)]);

    await alsDienst(db);
    const fehler = await fehlerVon(
      db.query('select create_learner_account($1, $2, $3, $4, $5, $6)', [
        testId(10),
        'dachs-1',
        'Dachs',
        'LX-0007',
        'hash',
        kurs,
      ]),
    );
    expect(fehler).toBeUndefined();

    await alsEinrichtung(db);
    const { rows } = await db.query('select role from profiles where id = $1', [testId(10)]);
    expect(rows[0].role).toBe('student');
  });

  it('die Einrichtung legt weiterhin ein Lehrkraftprofil an', async () => {
    /*
      Der Weg aus §6.2 der Inbetriebnahme: von Hand, über den SQL-Editor,
      also als Besitzer. Er darf von Migration 14 nicht getroffen werden –
      sonst gäbe es für den Pilot überhaupt keine Lehrkraft mehr.
    */
    await alsEinrichtung(db);
    await db.query('insert into auth.users (id) values ($1)', [testId(11)]);
    const fehler = await fehlerVon(
      db.query('insert into profiles (id, display_name, short_code, role) values ($1, $2, $3, $4)', [
        testId(11),
        'B. Beispiel',
        'LX-0008',
        'teacher',
      ]),
    );
    expect(fehler).toBeUndefined();
  });
});
