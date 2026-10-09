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
import { pgliteCourseGateway } from './pgliteGateways';

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

    const { courses, invitations } = createSqlCourseRepositories(pgliteCourseGateway(db));

    return {
      repositories: () => ({ courses, invitations }),
      alsPerson: (userId) => alsPerson(db, userId),
      abmelden: () => alsUnangemeldet(db),
      personen: PERSONEN,
      async lehrkraftEintragen(courseId, userId) {
        // Über die normalen Regeln: Die Kursleitung ist angemeldet und trägt
        // ein. Mit Einrichtungsrechten wäre es kein Beleg.
        await alsPerson(db, PERSONEN.lehrerin);
        await pgliteCourseGateway(db).insertMember(courseId, userId, 'teacher');
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

    gateway = pgliteCourseGateway(db);
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

  it('gibt für einen archivierten Kurs keinen Platz an die anonyme Kontoanlage', async () => {
    /*
      `redeem_invite` prüft archivierte Kurse selbst. Die anonyme
      Kontoanlage läuft aber absichtlich über die schmalere Dienstfunktion
      `consume_invite_by_hash`. Deshalb muss schon diese Funktion den Kurs
      schließen; sonst entstünde erst das Konto und danach die Mitgliedschaft.
    */
    const { code } = await gateway.rpcCreateInvite(kurs, null, 1);
    await gateway.updateCourse(kurs, { archived: true });

    await alsEinrichtung(db);
    const ergebnis = await db.query<{ course_id: string | null }>(
      'select consume_invite_by_hash(invite_code_hash($1)) as course_id',
      [code],
    );
    expect(ergebnis.rows[0]!.course_id).toBeNull();

    const einladung = await db.query<{ used_count: number }>(
      'select used_count from course_invites where course_id = $1',
      [kurs],
    );
    expect(einladung.rows[0]!.used_count).toBe(0);
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
