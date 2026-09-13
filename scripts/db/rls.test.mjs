// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  alsEinrichtung,
  alsPerson,
  alsUnangemeldet,
  fehlerVon,
  legePersonAn,
  neueDatenbank,
  testId,
} from './harness.mjs';

/**
 * Die Zugriffsregeln, geprüft gegen echtes Postgres (ADR-6).
 *
 * ## Wie diese Prüfungen zu lesen sind
 *
 * Jede stellt genau die Frage, die jemand mit dem öffentlichen Schlüssel und
 * einer HTTP-Bibliothek stellen könnte. Nicht „zeigt die Oberfläche das an?",
 * sondern „gibt die Datenbank es heraus?". Das ist der Unterschied zwischen
 * einer Zusage und einer Gestaltungsentscheidung.
 *
 * ## Warum leere Ergebnisse und nicht Fehler
 *
 * Beim Lesen liefert eine nicht erfüllte Regel **keine Zeilen** – nicht einen
 * Fehler. Das ist Absicht in Postgres und richtig so: Ein „Zugriff verweigert"
 * verriete, dass es die Zeile gibt. Beim Schreiben gibt es dagegen einen
 * Fehler, weil ein stilles Nichtstun jemanden glauben ließe, es sei gespeichert.
 */

const LEHRERIN = testId(1);
const ZWEITE_LEHRKRAFT = testId(2);
const LERNENDE = testId(3);
const ZWEITE_LERNENDE = testId(4);
const VERWALTUNG = testId(5);

let db;
let kurs;
let paket;

beforeEach(async () => {
  db = await neueDatenbank();

  await legePersonAn(db, { id: LEHRERIN, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });
  await legePersonAn(db, { id: ZWEITE_LEHRKRAFT, name: 'B. Beispiel', kurz: 'LX-5930', rolle: 'teacher' });
  await legePersonAn(db, { id: LERNENDE, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });
  await legePersonAn(db, { id: ZWEITE_LERNENDE, name: 'Dachs', kurz: 'LX-8104', rolle: 'student' });
  await legePersonAn(db, { id: VERWALTUNG, name: 'Verwaltung', kurz: 'LX-0001', rolle: 'admin' });

  // Ab hier als Lehrkraft – über die normalen Regeln, nicht als Einrichtung.
  await alsPerson(db, LEHRERIN);
  const kurse = await db.query(
    'insert into courses (owner_id, title, school_year) values ($1, $2, $3) returning *',
    [LEHRERIN, 'Englisch 7b', '2026/27'],
  );
  kurs = kurse.rows[0].id;
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

  /*
    Die Paketkennung kommt vom Client und hat keinen Vorgabewert – sie muss
    unverändert übernehmbar sein (siehe die Spalte `packs.id`). Hier steht
    deshalb eine offensichtliche Testkennung, keine erzeugte.
  */
  paket = 'pack-unit-3-city-life';
  await db.query(
    'insert into packs (id, owner_id, title, grade) values ($1, $2, $3, $4)',
    [paket, LEHRERIN, 'Unit 3 – City life', '7'],
  );
  await db.query(
    'insert into pack_drafts (pack_id, format_version, pack) values ($1, 2, $2)',
    [paket, JSON.stringify({ meta: { title: 'Unit 3 – City life' }, entries: [] })],
  );
});

afterEach(async () => {
  await db?.close();
});

async function zaehle(sql, werte = []) {
  const ergebnis = await db.query(sql, werte);
  return ergebnis.rows.length;
}

/* ===================================================== Lernstand ======== */

describe('Lernstände – die Zusage, um die es geht', () => {
  beforeEach(async () => {
    await alsPerson(db, LERNENDE);
    await db.query(
      'insert into pack_progress (user_id, course_id, pack_id, answered_count, correct_count) values ($1, $2, $3, 12, 9)',
      [LERNENDE, kurs, paket],
    );
    await db.query(
      `insert into entry_progress (user_id, course_id, pack_id, entry_id, direction, due_at)
       values ($1, $2, $3, 'v-1', 'en-de', now())`,
      [LERNENDE, kurs, paket],
    );
  });

  it('die lernende Person sieht ihren eigenen', async () => {
    expect(await zaehle('select * from pack_progress')).toBe(1);
    expect(await zaehle('select * from entry_progress')).toBe(1);
  });

  it('die Lehrkraft des Kurses sieht ihn nicht', async () => {
    await alsPerson(db, LEHRERIN);
    // Die Lehrkraft kennt Kurs- und Paketkennung, sie hat beide angelegt.
    expect(await zaehle('select * from pack_progress where course_id = $1', [kurs])).toBe(0);
    expect(await zaehle('select * from entry_progress where course_id = $1', [kurs])).toBe(0);
  });

  it('auch nicht mit ausdrücklicher Nennung der Person', async () => {
    await alsPerson(db, LEHRERIN);
    expect(await zaehle('select * from pack_progress where user_id = $1', [LERNENDE])).toBe(0);
  });

  it('auch nicht über eine Verknüpfung mit der Mitgliederliste', async () => {
    // Der naheliegende Umweg: erst die Mitglieder, dann deren Lernstände.
    await alsPerson(db, LEHRERIN);
    expect(
      await zaehle(
        `select p.* from pack_progress p
         join course_members m on m.user_id = p.user_id
         where m.course_id = $1`,
        [kurs],
      ),
    ).toBe(0);
  });

  it('auch nicht als Aggregat – eine Zahl über jemanden ist auch eine Auskunft', async () => {
    await alsPerson(db, LEHRERIN);
    const ergebnis = await db.query('select count(*)::int as anzahl from pack_progress');
    expect(ergebnis.rows[0].anzahl).toBe(0);
  });

  it('die Verwaltung sieht ihn ebenfalls nicht', async () => {
    // Es gibt keine Rolle mit dieser Einsicht. Keine.
    await alsPerson(db, VERWALTUNG);
    expect(await zaehle('select * from pack_progress')).toBe(0);
    expect(await zaehle('select * from entry_progress')).toBe(0);
  });

  it('eine zweite lernende Person sieht ihn nicht', async () => {
    await alsPerson(db, ZWEITE_LERNENDE);
    expect(await zaehle('select * from pack_progress')).toBe(0);
  });

  it('niemand kann einen Lernstand auf eine andere Person schreiben', async () => {
    await alsPerson(db, LEHRERIN);
    const fehler = await fehlerVon(
      db.query(
        'insert into pack_progress (user_id, course_id, pack_id) values ($1, $2, $3)',
        [LERNENDE, kurs, paket],
      ),
    );
    expect(fehler).toMatch(/row-level security/i);
  });

  it('niemand kann einen fremden Lernstand löschen', async () => {
    await alsPerson(db, LEHRERIN);
    await db.query('delete from pack_progress where user_id = $1', [LERNENDE]);

    // Kein Fehler, aber auch keine Wirkung: Die Zeile war nie sichtbar.
    await alsPerson(db, LERNENDE);
    expect(await zaehle('select * from pack_progress')).toBe(1);
  });

  it('die eigene Zeile lässt sich nicht jemand anderem zuschreiben', async () => {
    // Ohne `with check` wäre genau das möglich – `using` allein prüft nur,
    // was man anfassen darf, nicht wie es hinterher aussieht.
    await alsPerson(db, LERNENDE);
    const fehler = await fehlerVon(
      db.query('update pack_progress set user_id = $1', [ZWEITE_LERNENDE]),
    );
    expect(fehler).toMatch(/row-level security/i);
  });

  it('eine Ereigniskennung lässt sich nicht löschen, um sie neu einzureichen', async () => {
    await alsPerson(db, LERNENDE);
    await db.query('insert into progress_events (event_id, user_id) values ($1, $2)', [
      testId(9001),
      LERNENDE,
    ]);
    const fehler = await fehlerVon(db.query('delete from progress_events'));
    expect(fehler).toMatch(/permission denied|denied for table/i);
  });
});

/* ================================================ Der Schreibweg ======== */

describe('Der Schreibweg für Lernstände', () => {
  /**
   * Ein Ereignis, wie der Client es schickt.
   *
   * Bewusst hier von Hand gebaut und nicht über `progressEvents.ts`: Diese
   * Datei prüft die Datenbank, und sie soll auch dann noch auffallen, wenn
   * jemand im TypeScript-Teil die Gestalt ändert, ohne an die Migration zu
   * denken.
   */
  function ereignis(nummer, felder = {}) {
    return {
      eventId: testId(9100 + nummer),
      courseId: kurs,
      packId: paket,
      entryId: `v-${nummer}`,
      direction: 'en-de',
      outcome: 'correct',
      occurredAt: '2026-09-14T09:00:00.000Z',
      entryState: { box: 2, correctCount: 1, wrongCount: 0, streak: 1, dueAt: '2026-09-15T09:00:00.000Z' },
      ...felder,
    };
  }

  async function sende(ereignisse) {
    const ergebnis = await db.query('select record_progress_events($1) as neu', [
      JSON.stringify(ereignisse),
    ]);
    return ergebnis.rows[0].neu;
  }

  it('meldet, wie viele Ereignisse neu waren', async () => {
    await alsPerson(db, LERNENDE);
    expect(await sende([ereignis(1), ereignis(2)])).toBe(2);
    expect(await sende([ereignis(1), ereignis(3)])).toBe(1);
  });

  it('schreibt auf die aufrufende Person – und nur auf sie', async () => {
    /*
      Die Funktion ist `security definer`, läuft also an den Zugriffsregeln
      vorbei. Genau deshalb muss hier stehen, dass sie trotzdem niemandem
      etwas unterschieben kann: Eine Lehrkraft, die dasselbe Ereignis
      schickt, schreibt ihren eigenen Lernstand – es gibt keinen Parameter
      für jemand anderen.
    */
    await alsPerson(db, LEHRERIN);
    await sende([ereignis(1)]);

    expect(await zaehle('select * from pack_progress')).toBe(1);
    const meins = await db.query('select user_id from pack_progress');
    expect(meins.rows[0].user_id).toBe(LEHRERIN);

    await alsPerson(db, LERNENDE);
    expect(await zaehle('select * from pack_progress')).toBe(0);
  });

  it('geht ohne Anmeldung gar nicht', async () => {
    await alsUnangemeldet(db);
    expect(await fehlerVon(sende([ereignis(1)]))).toMatch(/Nicht angemeldet|permission denied/i);
    expect(
      await fehlerVon(db.query('select begin_practice_session($1, $2)', [kurs, paket])),
    ).toMatch(/Nicht angemeldet|permission denied/i);
  });

  it('nimmt keine beliebig lange Liste an', async () => {
    await alsPerson(db, LERNENDE);
    const zuviele = Array.from({ length: 201 }, (unused, index) => ereignis(index + 10));
    expect(await fehlerVon(sende(zuviele))).toMatch(/Zu viele Ereignisse/);
  });

  it('nimmt nichts an, was keine Liste ist', async () => {
    await alsPerson(db, LERNENDE);
    expect(await fehlerVon(sende({ eventId: testId(9999) }))).toMatch(/Liste von Ereignissen/);
  });

  it('setzt nur den eigenen Lernstand zurück', async () => {
    await alsPerson(db, LERNENDE);
    await sende([ereignis(1)]);

    await alsPerson(db, LEHRERIN);
    await db.query('select reset_my_progress($1, $2)', [kurs, paket]);

    await alsPerson(db, LERNENDE);
    expect(await zaehle('select * from pack_progress')).toBe(1);
  });
});

/* ========================================================= Kurse ======== */

describe('Kurse', () => {
  it('die Lehrkraft sieht ihren Kurs', async () => {
    await alsPerson(db, LEHRERIN);
    expect(await zaehle('select * from courses')).toBe(1);
  });

  it('eine fremde Lehrkraft sieht ihn nicht', async () => {
    await alsPerson(db, ZWEITE_LEHRKRAFT);
    expect(await zaehle('select * from courses')).toBe(0);
  });

  it('die lernende Person sieht den Kurs, in dem sie ist', async () => {
    await alsPerson(db, LERNENDE);
    expect(await zaehle('select * from courses')).toBe(1);
  });

  it('eine lernende Person außerhalb sieht ihn nicht', async () => {
    await alsPerson(db, ZWEITE_LERNENDE);
    expect(await zaehle('select * from courses')).toBe(0);
  });

  it('eine lernende Person kann keinen Kurs anlegen', async () => {
    await alsPerson(db, LERNENDE);
    const fehler = await fehlerVon(
      db.query('insert into courses (owner_id, title) values ($1, $2)', [LERNENDE, 'Mein Kurs']),
    );
    expect(fehler).toMatch(/row-level security/i);
  });

  it('eine fremde Lehrkraft kann den Kurs nicht umbenennen', async () => {
    await alsPerson(db, ZWEITE_LEHRKRAFT);
    const ergebnis = await db.query('update courses set title = $1 where id = $2 returning *', [
      'Gekapert',
      kurs,
    ]);
    expect(ergebnis.rows).toHaveLength(0);

    await alsPerson(db, LEHRERIN);
    const nachher = await db.query('select title from courses where id = $1', [kurs]);
    expect(nachher.rows[0].title).toBe('Englisch 7b');
  });

  it('eine lernende Person sieht die Mitgliederliste nicht', async () => {
    await alsPerson(db, LERNENDE);
    const zeilen = await db.query('select * from course_members where course_id = $1', [kurs]);
    // Sie sieht genau eine Zeile: ihre eigene Mitgliedschaft.
    expect(zeilen.rows.map((zeile) => zeile.user_id)).toEqual([LERNENDE]);
  });

  it('die Lehrkraft sieht die ganze Mitgliederliste', async () => {
    await alsPerson(db, LEHRERIN);
    expect(await zaehle('select * from course_members where course_id = $1', [kurs])).toBe(2);
  });

  it('eine lernende Person kann sich nicht selbst in einen fremden Kurs eintragen', async () => {
    await alsPerson(db, ZWEITE_LERNENDE);
    const fehler = await fehlerVon(
      db.query('insert into course_members (course_id, user_id, role) values ($1, $2, $3)', [
        kurs,
        ZWEITE_LERNENDE,
        'student',
      ]),
    );
    expect(fehler).toMatch(/row-level security/i);
  });

  it('eine lernende Person kann einen Kurs von sich aus verlassen', async () => {
    await alsPerson(db, LERNENDE);
    await db.query('delete from course_members where course_id = $1 and user_id = $2', [
      kurs,
      LERNENDE,
    ]);
    expect(await zaehle('select * from courses')).toBe(0);
  });
});

/* =================================================== Einladungen ======== */

describe('Einladungen', () => {
  async function legeEinladungAn(optionen = {}) {
    await alsPerson(db, LEHRERIN);
    const code = optionen.code ?? 'MTKQ3B7F';
    const ergebnis = await db.query(
      `insert into course_invites (course_id, code_hash, label, created_by, expires_at, max_uses)
       values ($1, encode(sha256(convert_to(upper($2), 'UTF8')), 'hex'), $3, $4, $5, $6)
       returning *`,
      [kurs, code, code.slice(0, 3), LEHRERIN, optionen.expiresAt ?? null, optionen.maxUses ?? null],
    );
    return { code, invite: ergebnis.rows[0] };
  }

  it('der Klartext des Codes steht nirgends in der Tabelle', async () => {
    const { code, invite } = await legeEinladungAn();
    expect(JSON.stringify(invite)).not.toContain(code);
    expect(invite.code_hash).toHaveLength(64);
  });

  it('eine lernende Person sieht keine einzige Einladung', async () => {
    await legeEinladungAn();
    await alsPerson(db, LERNENDE);
    // Auch nicht die ihres eigenen Kurses: Sonst stünde die Liste aller
    // gültigen Codes jeder Person im Kurs offen.
    expect(await zaehle('select * from course_invites')).toBe(0);
  });

  it('der Beitritt per Code funktioniert trotzdem', async () => {
    const { code } = await legeEinladungAn();
    await alsPerson(db, ZWEITE_LERNENDE);

    const ergebnis = await db.query('select * from redeem_invite($1)', [code.toLowerCase()]);
    expect(ergebnis.rows[0].title).toBe('Englisch 7b');
    expect(await zaehle('select * from courses')).toBe(1);
  });

  it('zweimal einlösen ist kein Fehler und zählt nur einmal', async () => {
    const { code, invite } = await legeEinladungAn();
    await alsPerson(db, ZWEITE_LERNENDE);
    await db.query('select * from redeem_invite($1)', [code]);
    await db.query('select * from redeem_invite($1)', [code]);

    await alsPerson(db, LEHRERIN);
    const nachher = await db.query('select used_count from course_invites where id = $1', [invite.id]);
    expect(nachher.rows[0].used_count).toBe(1);
  });

  it('ein zurückgezogener Code gilt nicht mehr', async () => {
    const { code, invite } = await legeEinladungAn();
    await db.query('update course_invites set revoked = true where id = $1', [invite.id]);

    await alsPerson(db, ZWEITE_LERNENDE);
    const fehler = await fehlerVon(db.query('select * from redeem_invite($1)', [code]));
    expect(fehler).toMatch(/gilt nicht/);
  });

  it('ein abgelaufener Code gilt nicht mehr', async () => {
    const { code } = await legeEinladungAn({ expiresAt: '2020-01-01T00:00:00Z' });
    await alsPerson(db, ZWEITE_LERNENDE);
    expect(await fehlerVon(db.query('select * from redeem_invite($1)', [code]))).toMatch(/gilt nicht/);
  });

  it('ein aufgebrauchter Code gilt nicht mehr', async () => {
    const { code } = await legeEinladungAn({ maxUses: 1 });
    await alsPerson(db, ZWEITE_LERNENDE);
    await db.query('select * from redeem_invite($1)', [code]);

    await alsPerson(db, VERWALTUNG);
    expect(await fehlerVon(db.query('select * from redeem_invite($1)', [code]))).toMatch(/gilt nicht/);
  });

  it('ein erfundener Code klingt genauso wie ein zurückgezogener', async () => {
    // Derselbe Satz für jeden Fehlschlag – sonst verriete das Durchprobieren,
    // welche Codes es gibt.
    await legeEinladungAn();
    await alsPerson(db, ZWEITE_LERNENDE);
    const erfunden = await fehlerVon(db.query('select * from redeem_invite($1)', ['ZZZZZZZZ']));
    expect(erfunden).toMatch(/gilt nicht/);
  });

  it('ohne Anmeldung geht der Beitritt nicht', async () => {
    const { code } = await legeEinladungAn();
    await alsUnangemeldet(db);
    const fehler = await fehlerVon(db.query('select * from redeem_invite($1)', [code]));
    expect(fehler).toMatch(/permission denied|Nicht angemeldet/i);
  });
});

/* ======================================================== Pakete ======== */

describe('Pakete und Veröffentlichung', () => {
  async function veroeffentliche() {
    await alsPerson(db, LEHRERIN);
    const ergebnis = await db.query(
      `insert into pack_revisions (pack_id, revision, format_version, pack, published_by)
       values ($1, 1, 2, $2, $3) returning *`,
      [paket, JSON.stringify({ meta: { title: 'Unit 3 – City life' }, entries: [] }), LEHRERIN],
    );
    return ergebnis.rows[0];
  }

  it('den Entwurf sieht nur die Eigentümerin', async () => {
    await alsPerson(db, LERNENDE);
    expect(await zaehle('select * from pack_drafts')).toBe(0);
    await alsPerson(db, ZWEITE_LEHRKRAFT);
    expect(await zaehle('select * from pack_drafts')).toBe(0);
    await alsPerson(db, LEHRERIN);
    expect(await zaehle('select * from pack_drafts')).toBe(1);
  });

  it('eine veröffentlichte Revision allein reicht Lernenden nicht', async () => {
    await veroeffentliche();
    await alsPerson(db, LERNENDE);
    // Veröffentlicht heißt nicht zugewiesen. Ohne Zuweisung an ihren Kurs
    // sieht sie nichts.
    expect(await zaehle('select * from pack_revisions')).toBe(0);
  });

  it('nach der Zuweisung sieht die Lerngruppe die Revision', async () => {
    await veroeffentliche();
    await alsPerson(db, LEHRERIN);
    await db.query(
      'insert into course_packs (course_id, pack_id, revision, sort_order) values ($1, $2, 1, 0)',
      [kurs, paket],
    );

    await alsPerson(db, LERNENDE);
    expect(await zaehle('select * from pack_revisions')).toBe(1);
    // Den Entwurf weiterhin nicht.
    expect(await zaehle('select * from pack_drafts')).toBe(0);
  });

  it('eine fremde Lerngruppe sieht sie nicht', async () => {
    await veroeffentliche();
    await alsPerson(db, LEHRERIN);
    await db.query(
      'insert into course_packs (course_id, pack_id, revision, sort_order) values ($1, $2, 1, 0)',
      [kurs, paket],
    );
    await alsPerson(db, ZWEITE_LERNENDE);
    expect(await zaehle('select * from pack_revisions')).toBe(0);
  });

  it('eine veröffentlichte Revision lässt sich nicht mehr ändern', async () => {
    const revision = await veroeffentliche();
    const fehler = await fehlerVon(
      db.query('update pack_revisions set pack = $1 where pack_id = $2 and revision = $3', [
        JSON.stringify({ meta: { title: 'Heimlich anders' }, entries: [] }),
        revision.pack_id,
        revision.revision,
      ]),
    );
    expect(fehler).toMatch(/unveränderlich/);
  });

  it('auch nicht mit Einrichtungsrechten – der Trigger gilt für alle', async () => {
    const revision = await veroeffentliche();
    await alsEinrichtung(db);
    const fehler = await fehlerVon(
      db.query('delete from pack_revisions where pack_id = $1 and revision = $2', [
        revision.pack_id,
        revision.revision,
      ]),
    );
    expect(fehler).toMatch(/nicht gelöscht/);
  });

  it('zurückziehen ist erlaubt und ändert sonst nichts', async () => {
    const revision = await veroeffentliche();
    await db.query('update pack_revisions set withdrawn_at = now() where pack_id = $1', [
      revision.pack_id,
    ]);
    const nachher = await db.query('select * from pack_revisions where pack_id = $1', [
      revision.pack_id,
    ]);
    expect(nachher.rows[0].withdrawn_at).not.toBeNull();
    expect(nachher.rows[0].pack).toEqual(revision.pack);
  });

  it('eine lernende Person kann kein Paket zuweisen', async () => {
    await veroeffentliche();
    await alsPerson(db, LERNENDE);
    const fehler = await fehlerVon(
      db.query(
        'insert into course_packs (course_id, pack_id, revision, sort_order) values ($1, $2, 1, 0)',
        [kurs, paket],
      ),
    );
    expect(fehler).toMatch(/row-level security/i);
  });
});

/* ======================================================= Profile ======== */

describe('Profile', () => {
  it('die Lehrkraft sieht die Profile ihrer Lerngruppe', async () => {
    await alsPerson(db, LEHRERIN);
    const zeilen = await db.query('select id, display_name, short_code from profiles order by short_code');
    expect(zeilen.rows.map((zeile) => zeile.short_code)).toEqual(['LX-4821', 'LX-7390']);
  });

  it('sie sieht keine Profile außerhalb ihrer Kurse', async () => {
    await alsPerson(db, LEHRERIN);
    expect(await zaehle('select * from profiles where id = $1', [ZWEITE_LERNENDE])).toBe(0);
  });

  it('eine lernende Person sieht nur sich selbst', async () => {
    await alsPerson(db, LERNENDE);
    const zeilen = await db.query('select id from profiles');
    expect(zeilen.rows.map((zeile) => zeile.id)).toEqual([LERNENDE]);
  });

  it('niemand kann sich selbst zur Lehrkraft machen', async () => {
    /*
      Der wichtigste Schreibschutz im Schema – und er ist keine Zugriffsregel,
      sondern ein Spaltenrecht. Eine Regel sieht Zeilen, nicht Spalten: Sie
      kann „du darfst deine Zeile ändern" sagen, aber nicht „außer dieser
      einen Spalte".
    */
    await alsPerson(db, LERNENDE);
    const fehler = await fehlerVon(db.query(`update profiles set role = 'teacher'`));
    expect(fehler).toMatch(/permission denied|denied for table/i);
  });

  it('den eigenen Anzeigenamen darf man ändern', async () => {
    await alsPerson(db, LERNENDE);
    await db.query('update profiles set display_name = $1', ['Fuchs II']);
    const zeilen = await db.query('select display_name from profiles');
    expect(zeilen.rows[0].display_name).toBe('Fuchs II');
  });

  it('einen fremden Anzeigenamen nicht', async () => {
    await alsPerson(db, LEHRERIN);
    await db.query('update profiles set display_name = $1 where id = $2', ['Umbenannt', LERNENDE]);
    await alsPerson(db, LERNENDE);
    const zeilen = await db.query('select display_name from profiles');
    expect(zeilen.rows[0].display_name).toBe('Fuchs');
  });
});

/* ================================================= Ohne Anmeldung ======== */

describe('ohne Anmeldung', () => {
  it('ist keine einzige Tabelle lesbar', async () => {
    await alsUnangemeldet(db);
    for (const tabelle of [
      'profiles',
      'courses',
      'course_members',
      'course_invites',
      'packs',
      'pack_drafts',
      'pack_revisions',
      'course_packs',
      'pack_progress',
      'entry_progress',
      'progress_events',
    ]) {
      const fehler = await fehlerVon(db.query(`select * from ${tabelle}`));
      expect(fehler, `${tabelle} war ohne Anmeldung lesbar`).toMatch(/permission denied/i);
    }
  });
});

/* ============================================== Anmeldung (Phase 3) ====== */

describe('Lern-Konten', () => {
  const CODE = 'TEST-CODE-1234';

  async function legeLernkontoAn(code = CODE) {
    await alsEinrichtung(db);
    await db.query(
      `insert into learner_accounts (user_id, learner_id, recovery_code_hash)
       values ($1, 'fuchs-7390', encode(sha256(convert_to(upper($2), 'UTF8')), 'hex'))`,
      [LERNENDE, code],
    );
  }

  it('die lernende Person sieht ihre eigene Zeile', async () => {
    await legeLernkontoAn();
    await alsPerson(db, LERNENDE);
    const zeilen = await db.query('select learner_id from learner_accounts');
    expect(zeilen.rows).toEqual([{ learner_id: 'fuchs-7390' }]);
  });

  it('aber nicht den Hash ihres Codes', async () => {
    /*
      Ein lesbarer Hash ist eine Einladung, ihn offline durchzuprobieren –
      und der Code ist kurz genug, dass das gelänge.
    */
    await legeLernkontoAn();
    await alsPerson(db, LERNENDE);
    const fehler = await fehlerVon(db.query('select recovery_code_hash from learner_accounts'));
    expect(fehler).toMatch(/permission denied/i);
  });

  it('niemand sonst sieht die Zeile – auch die Lehrkraft nicht', async () => {
    await legeLernkontoAn();
    await alsPerson(db, LEHRERIN);
    expect(await zaehle('select user_id from learner_accounts')).toBe(0);
  });

  it('niemand kann eine Lern-ID anlegen oder ändern', async () => {
    // Konten legt ausschließlich die Serverfunktion mit Service Role an.
    await legeLernkontoAn();
    await alsPerson(db, LERNENDE);
    expect(
      await fehlerVon(
        db.query(`update learner_accounts set learner_id = 'jemand-anders'`),
      ),
    ).toMatch(/permission denied/i);
    expect(
      await fehlerVon(
        db.query(
          `insert into learner_accounts (user_id, learner_id, recovery_code_hash) values ($1, 'neu-0001', 'x')`,
          [ZWEITE_LERNENDE],
        ),
      ),
    ).toMatch(/permission denied/i);
  });

  it('zwei Konten können nicht dieselbe Lern-ID haben', async () => {
    await legeLernkontoAn();
    await alsEinrichtung(db);
    const fehler = await fehlerVon(
      db.query(
        `insert into learner_accounts (user_id, learner_id, recovery_code_hash) values ($1, 'fuchs-7390', 'x')`,
        [ZWEITE_LERNENDE],
      ),
    );
    expect(fehler).toMatch(/duplicate key|unique/i);
  });

  it('eine großgeschriebene Lern-ID wird gar nicht erst angenommen', async () => {
    // Sie wird vorgelesen und abgeschrieben; „Fuchs-7390" und „fuchs-7390"
    // müssen dieselbe Kennung sein, und zwar schon beim Anlegen.
    await alsEinrichtung(db);
    const fehler = await fehlerVon(
      db.query(
        `insert into learner_accounts (user_id, learner_id, recovery_code_hash) values ($1, 'Fuchs-7390', 'x')`,
        [LERNENDE],
      ),
    );
    expect(fehler).toMatch(/check constraint|learner_accounts/i);
  });
});

describe('den Wiederherstellungscode bestätigen', () => {
  const CODE = 'TEST-CODE-1234';

  beforeEach(async () => {
    await alsEinrichtung(db);
    await db.query(
      `insert into learner_accounts (user_id, learner_id, recovery_code_hash)
       values ($1, 'fuchs-7390', encode(sha256(convert_to(upper($2), 'UTF8')), 'hex'))`,
      [LERNENDE, CODE],
    );
  });

  it('mit dem richtigen Code klappt es', async () => {
    await alsPerson(db, LERNENDE);
    const ergebnis = await db.query('select confirm_recovery_code($1) as ok', [CODE]);
    expect(ergebnis.rows[0].ok).toBe(true);

    const nachher = await db.query('select recovery_confirmed_at from learner_accounts');
    expect(nachher.rows[0].recovery_confirmed_at).not.toBeNull();
  });

  it('Groß- und Kleinschreibung sowie Leerraum spielen keine Rolle', async () => {
    await alsPerson(db, LERNENDE);
    const ergebnis = await db.query('select confirm_recovery_code($1) as ok', [
      `  ${CODE.toLowerCase()}  `,
    ]);
    expect(ergebnis.rows[0].ok).toBe(true);
  });

  it('mit einem falschen Code nicht – und es bleibt unbestätigt', async () => {
    await alsPerson(db, LERNENDE);
    const ergebnis = await db.query('select confirm_recovery_code($1) as ok', ['FALSCH-0000']);
    expect(ergebnis.rows[0].ok).toBe(false);

    await alsEinrichtung(db);
    const nachher = await db.query('select recovery_confirmed_at from learner_accounts');
    expect(nachher.rows[0].recovery_confirmed_at).toBeNull();
  });

  it('ein zweiter Klick sieht nicht wie ein falscher Code aus', async () => {
    await alsPerson(db, LERNENDE);
    await db.query('select confirm_recovery_code($1) as ok', [CODE]);
    const nochmal = await db.query('select confirm_recovery_code($1) as ok', [CODE]);
    expect(nochmal.rows[0].ok).toBe(true);
  });

  it('eine andere Person bestätigt damit nichts', async () => {
    await alsPerson(db, ZWEITE_LERNENDE);
    const ergebnis = await db.query('select confirm_recovery_code($1) as ok', [CODE]);
    expect(ergebnis.rows[0].ok).toBe(false);

    await alsEinrichtung(db);
    const nachher = await db.query('select recovery_confirmed_at from learner_accounts');
    expect(nachher.rows[0].recovery_confirmed_at).toBeNull();
  });

  it('ohne Anmeldung geht es nicht', async () => {
    await alsUnangemeldet(db);
    const fehler = await fehlerVon(db.query('select confirm_recovery_code($1)', [CODE]));
    expect(fehler).toMatch(/permission denied|Nicht angemeldet/i);
  });
});

describe('kein Weg, ein fremdes Kennwort zu setzen', () => {
  it('es gibt keine Funktion dafür', async () => {
    /*
      Die Zusage aus dem Kopf von `20260913120300_anmeldung.sql`: Wer ein
      fremdes Kennwort setzen könnte, könnte sich als diese Person anmelden –
      und sähe damit ihren Lernstand. Alle Regeln aus Phase 2 wären mit einem
      Klick umgangen.

      Diese Prüfung ist grob, und sie fängt genau den Fall, der später aus
      Bequemlichkeit entsteht: „die Lehrkraft setzt eben ein neues Kennwort".
    */
    /**
     * Was das grobe Muster mitfängt, ohne mit Kennwörtern zu tun zu haben.
     *
     * Eine Ausnahme mit Begründung statt eines engeren Musters: Enger hieße,
     * dass `reset_password_for` eines Tages durchrutscht. So muss jemand,
     * der etwas mit `reset` im Namen anlegt, es hier eintragen.
     */
    const UNVERDAECHTIG = {
      reset_my_progress:
        'Löscht den eigenen Lernstand (Phase 6) – nimmt keine fremde Kennung entgegen.',
    };

    await alsEinrichtung(db);
    const funktionen = await db.query(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (p.proname like '%password%' or p.proname like '%kennwort%'
             or p.proname like '%reset%' or p.proname like '%set_pass%')
      order by 1
    `);
    expect(funktionen.rows.map((zeile) => zeile.proname)).toEqual(
      Object.keys(UNVERDAECHTIG).sort(),
    );
  });
});
