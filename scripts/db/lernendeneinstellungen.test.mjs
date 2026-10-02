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
 * Lernendeneinstellungen und kursübergreifender Lernstand (5B.4a).
 *
 * ## Was hier geprüft wird – und was nicht
 *
 * Geprüft wird, was die **Datenbank** herausgibt, nicht was eine Oberfläche
 * anzeigt. Die Zusage „keine Lehrkraftkontrolle über individuelle
 * Lernstände" ist nur dann eine Zusage, wenn sie auch gegenüber jemandem
 * gilt, der den öffentlichen Schlüssel, den Tabellennamen und die Kennung
 * kennt und direkt fragt.
 *
 * ## Warum leere Ergebnisse und nicht Fehler
 *
 * Beim Lesen liefert eine nicht erfüllte Zugriffsregel **keine Zeilen**.
 * Beim Schreiben gibt es einen Fehler. Dieser Unterschied ist in Postgres
 * Absicht; die Prüfungen unten folgen ihm, statt ihn zu glätten.
 */

const LEHRERIN = testId(1);
const LERNENDE = testId(2);
const ZWEITE_LERNENDE = testId(3);

let db;
let kurs;
const paket = 'pack-unit-3-city-life';
const zweitesPaket = 'pack-unit-4-school';

beforeEach(async () => {
  db = await neueDatenbank();

  await legePersonAn(db, { id: LEHRERIN, name: 'A. Beispiel', kurz: 'LX-4821', rolle: 'teacher' });
  await legePersonAn(db, { id: LERNENDE, name: 'Fuchs', kurz: 'LX-7390', rolle: 'student' });
  await legePersonAn(db, { id: ZWEITE_LERNENDE, name: 'Dachs', kurz: 'LX-8104', rolle: 'student' });

  await alsPerson(db, LEHRERIN);
  const kurse = await db.query(
    'insert into courses (owner_id, title, school_year) values ($1, $2, $3) returning id',
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
});

afterEach(async () => {
  await db?.close();
});

/* ============================================ Die eigene Zeile =========== */

describe('Einstellungen – die eigene Person', () => {
  it('kann anlegen, lesen und ändern', async () => {
    await alsPerson(db, LERNENDE);

    await db.query(
      'insert into learner_settings (user_id, time_zone, weekly_goal_days) values ($1, $2, $3)',
      [LERNENDE, 'Europe/Berlin', 4],
    );

    const gelesen = await db.query('select time_zone, weekly_goal_days from learner_settings');
    expect(gelesen.rows).toEqual([{ time_zone: 'Europe/Berlin', weekly_goal_days: 4 }]);

    await db.query('update learner_settings set weekly_goal_days = 6 where user_id = $1', [
      LERNENDE,
    ]);
    const danach = await db.query('select weekly_goal_days from learner_settings');
    expect(danach.rows[0].weekly_goal_days).toBe(6);
  });

  it('kann keine Zeile für jemand anderen anlegen', async () => {
    /*
      Die Hälfte der Regel, die ohne `with check` fehlte: Ohne sie dürfte man
      zwar nur die eigene Zeile anfassen – aber eine neue mit fremder Kennung
      anlegen.
    */
    await alsPerson(db, LERNENDE);
    expect(
      await fehlerVon(
        db.query('insert into learner_settings (user_id, time_zone) values ($1, $2)', [
          ZWEITE_LERNENDE,
          'Europe/Berlin',
        ]),
      ),
    ).toMatch(/row-level security/i);
  });

  it('kann die eigene Zeile nicht jemand anderem zuschreiben', async () => {
    await alsPerson(db, LERNENDE);
    await db.query('insert into learner_settings (user_id) values ($1)', [LERNENDE]);
    expect(
      await fehlerVon(
        db.query('update learner_settings set user_id = $1', [ZWEITE_LERNENDE]),
      ),
    ).toMatch(/row-level security/i);
  });

  it('kann nicht löschen – auch die eigene Zeile nicht', async () => {
    /*
      Kein `delete` auf Tabellenebene (E27): Eine gelöschte Zeile behauptete
      „nie bestätigt", wo einmal bestätigt wurde. Wer die Zeitzone loswerden
      will, setzt sie auf `null`.
    */
    await alsPerson(db, LERNENDE);
    await db.query('insert into learner_settings (user_id) values ($1)', [LERNENDE]);
    expect(await fehlerVon(db.query('delete from learner_settings'))).toMatch(
      /permission denied/i,
    );
  });
});

/* ============================================ Fremde Augen ============== */

describe('Einstellungen – alle anderen', () => {
  beforeEach(async () => {
    await alsPerson(db, LERNENDE);
    await db.query(
      'insert into learner_settings (user_id, time_zone, weekly_goal_days) values ($1, $2, $3)',
      [LERNENDE, 'Europe/Berlin', 4],
    );
  });

  it('eine fremde lernende Person sieht nichts', async () => {
    await alsPerson(db, ZWEITE_LERNENDE);
    const ergebnis = await db.query('select * from learner_settings where user_id = $1', [
      LERNENDE,
    ]);
    expect(ergebnis.rows).toHaveLength(0);
  });

  it('eine fremde lernende Person kann nichts ändern', async () => {
    await alsPerson(db, ZWEITE_LERNENDE);
    const ergebnis = await db.query(
      'update learner_settings set weekly_goal_days = 1 where user_id = $1 returning user_id',
      [LERNENDE],
    );
    // Kein Fehler, aber auch keine Zeile: `using` lässt die fremde gar nicht
    // erst sehen, und was man nicht sieht, ändert man nicht.
    expect(ergebnis.rows).toHaveLength(0);

    await alsPerson(db, LERNENDE);
    const unveraendert = await db.query('select weekly_goal_days from learner_settings');
    expect(unveraendert.rows[0].weekly_goal_days).toBe(4);
  });

  it('die Lehrkraft desselben Kurses sieht nichts', async () => {
    /*
      Der eigentliche Grund für die eigene Tabelle. Auf `profiles` dürfte
      diese Lehrkraft lesen – `profiles_select` erlaubt es über
      `app_sees_profile(id)`, und Zugriffsregeln wirken zeilenweise. Hier
      gibt es diese Regel nicht, also auch nicht diesen Weg.
    */
    await alsPerson(db, LEHRERIN);
    const ergebnis = await db.query('select * from learner_settings');
    expect(ergebnis.rows).toHaveLength(0);

    const gezielt = await db.query('select * from learner_settings where user_id = $1', [LERNENDE]);
    expect(gezielt.rows).toHaveLength(0);
  });

  it('die Lehrkraft kommt auch über `profiles` nicht heran', async () => {
    // Die Gegenprobe zur Begründung: Das Profil **sieht** sie sehr wohl.
    await alsPerson(db, LEHRERIN);
    const profil = await db.query('select display_name from profiles where id = $1', [LERNENDE]);
    expect(profil.rows).toHaveLength(1);

    const verbund = await db.query(
      `select s.time_zone
         from profiles p left join learner_settings s on s.user_id = p.id
        where p.id = $1`,
      [LERNENDE],
    );
    expect(verbund.rows[0].time_zone).toBeNull();
  });

  it('ohne Anmeldung gibt es kein Recht auf der Tabelle', async () => {
    await alsUnangemeldet(db);
    expect(await fehlerVon(db.query('select * from learner_settings'))).toMatch(
      /permission denied/i,
    );
  });

  it('der Dienst hat auf der Tabelle kein Recht', async () => {
    /*
      Keine Service-Role-Ausnahme – und zwar nicht als Regel, sondern schon
      beim Recht. `service_role` umgeht Zugriffsregeln (`bypassrls`), aber
      keine Rechtevergabe.
    */
    await alsDienst(db);
    expect(await fehlerVon(db.query('select * from learner_settings'))).toMatch(
      /permission denied/i,
    );
    expect(
      await fehlerVon(db.query('insert into learner_settings (user_id) values ($1)', [LERNENDE])),
    ).toMatch(/permission denied/i);
  });
});

/* ============================================ Die Werte ================= */

describe('Wochenziel', () => {
  beforeEach(async () => {
    await alsPerson(db, LERNENDE);
  });

  it('nimmt 1 bis 7 an', async () => {
    for (const tage of [1, 2, 3, 4, 5, 6, 7]) {
      await db.query(
        `insert into learner_settings (user_id, weekly_goal_days) values ($1, $2)
         on conflict (user_id) do update set weekly_goal_days = excluded.weekly_goal_days`,
        [LERNENDE, tage],
      );
      const gelesen = await db.query('select weekly_goal_days from learner_settings');
      expect(gelesen.rows[0].weekly_goal_days).toBe(tage);
    }
  });

  it('lehnt 0 ab', async () => {
    expect(
      await fehlerVon(
        db.query('insert into learner_settings (user_id, weekly_goal_days) values ($1, 0)', [
          LERNENDE,
        ]),
      ),
    ).toMatch(/weekly_goal_days/i);
  });

  it('lehnt 8 ab', async () => {
    expect(
      await fehlerVon(
        db.query('insert into learner_settings (user_id, weekly_goal_days) values ($1, 8)', [
          LERNENDE,
        ]),
      ),
    ).toMatch(/weekly_goal_days/i);
  });

  it('lehnt eine negative Zahl ab', async () => {
    expect(
      await fehlerVon(
        db.query('insert into learner_settings (user_id, weekly_goal_days) values ($1, -1)', [
          LERNENDE,
        ]),
      ),
    ).toMatch(/weekly_goal_days/i);
  });

  it('lässt `null` zu – das ist „kein Ziel" und die Voreinstellung', async () => {
    await db.query('insert into learner_settings (user_id) values ($1)', [LERNENDE]);
    const gelesen = await db.query('select weekly_goal_days from learner_settings');
    expect(gelesen.rows[0].weekly_goal_days).toBeNull();
  });
});

describe('Zeitzone', () => {
  beforeEach(async () => {
    await alsPerson(db, LERNENDE);
  });

  it('nimmt einen gültigen IANA-Namen an', async () => {
    await db.query('insert into learner_settings (user_id, time_zone) values ($1, $2)', [
      LERNENDE,
      'Europe/Berlin',
    ]);
    const gelesen = await db.query('select time_zone from learner_settings');
    expect(gelesen.rows[0].time_zone).toBe('Europe/Berlin');
  });

  it('nimmt auch eine Zeitzone außerhalb Europas an', async () => {
    // Keine abgeschriebene Liste, keine stille Einengung auf Deutschland.
    await db.query('insert into learner_settings (user_id, time_zone) values ($1, $2)', [
      LERNENDE,
      'Pacific/Auckland',
    ]);
    const gelesen = await db.query('select time_zone from learner_settings');
    expect(gelesen.rows[0].time_zone).toBe('Pacific/Auckland');
  });

  it('lehnt einen erfundenen Namen ab', async () => {
    expect(
      await fehlerVon(
        db.query('insert into learner_settings (user_id, time_zone) values ($1, $2)', [
          LERNENDE,
          'Europa/Bielefeld',
        ]),
      ),
    ).toMatch(/Unbekannte Zeitzone/);
  });

  it('lehnt einen Zeitversatz als Zeitzone ab', async () => {
    /*
      `+02:00` ist keine Zeitzone, sondern ein Versatz zu einem Zeitpunkt –
      im Winter ist er falsch. Genau deshalb steht in der Spalte ein
      IANA-Name und nicht die Abweichung, die ein Browser leicht liefert.
    */
    expect(
      await fehlerVon(
        db.query('insert into learner_settings (user_id, time_zone) values ($1, $2)', [
          LERNENDE,
          '+02:00',
        ]),
      ),
    ).toMatch(/Unbekannte Zeitzone/);
  });

  it('lehnt einen ungültigen Namen auch beim Ändern ab', async () => {
    await db.query('insert into learner_settings (user_id, time_zone) values ($1, $2)', [
      LERNENDE,
      'Europe/Berlin',
    ]);
    expect(
      await fehlerVon(db.query('update learner_settings set time_zone = $1', ['Mars/Olympus'])),
    ).toMatch(/Unbekannte Zeitzone/);

    const unveraendert = await db.query('select time_zone from learner_settings');
    expect(unveraendert.rows[0].time_zone).toBe('Europe/Berlin');
  });

  it('lässt `null` zu – das heißt „nicht bestätigt"', async () => {
    await db.query('insert into learner_settings (user_id) values ($1)', [LERNENDE]);
    const gelesen = await db.query('select time_zone from learner_settings');
    expect(gelesen.rows[0].time_zone).toBeNull();
  });

  it('lässt sich wieder auf `null` zurücksetzen', async () => {
    await db.query('insert into learner_settings (user_id, time_zone) values ($1, $2)', [
      LERNENDE,
      'Europe/Berlin',
    ]);
    await db.query('update learner_settings set time_zone = null');
    const gelesen = await db.query('select time_zone from learner_settings');
    expect(gelesen.rows[0].time_zone).toBeNull();
  });

  it('hat keine Voreinstellung in der Datenbank', async () => {
    /*
      E27 in einer Zeile: Wer eine Zeile anlegt, ohne etwas zu sagen, hat
      **nicht** Berlin bestätigt. Eine Voreinstellung hier wäre von einer
      Bestätigung später nicht mehr zu unterscheiden.
    */
    const vorgabe = await db.query(`
      select column_default
        from information_schema.columns
       where table_name = 'learner_settings' and column_name = 'time_zone'`);
    expect(vorgabe.rows[0].column_default).toBeNull();
  });
});

describe('Fehlende Zeile', () => {
  it('ist der Normalfall und kein Fehler', async () => {
    /*
      Niemand legt beim Anmelden eine Zeile an. „Keine Zeile" muss deshalb
      lesbar heißen: Ziel aus, Zeitzone unbestätigt – nicht „Fehler" und
      nicht „Zeitzone Berlin".
    */
    await alsPerson(db, LERNENDE);
    const ergebnis = await db.query('select * from learner_settings where user_id = $1', [
      LERNENDE,
    ]);
    expect(ergebnis.rows).toHaveLength(0);
  });
});

describe('updated_at', () => {
  it('wird von der Datenbank gesetzt, nicht vom Client', async () => {
    /*
      Dieselbe Begründung wie bei `recorded_at` (E28): Ein Zeitstempel vom
      Client ist eine Angabe über eine Uhr, die niemand nachprüfen kann.
      Hier zählt er für nichts Fachliches – aber eine Spalte, die einmal
      Clientzeiten enthält, wird später für Fachliches benutzt.
    */
    await alsPerson(db, LERNENDE);
    const vergangenheit = '2001-01-01T00:00:00Z';
    await db.query(
      'insert into learner_settings (user_id, updated_at) values ($1, $2)',
      [LERNENDE, vergangenheit],
    );
    const gelesen = await db.query('select updated_at from learner_settings');
    expect(new Date(gelesen.rows[0].updated_at).getFullYear()).toBeGreaterThan(2001);
  });
});

/* ====================================== Kursübergreifender Lernstand ==== */

describe('my_due_overview', () => {
  beforeEach(async () => {
    await alsPerson(db, LEHRERIN);
    await db.query('insert into packs (id, owner_id, title, grade) values ($1, $2, $3, $4)', [
      paket,
      LEHRERIN,
      'Unit 3 – City life',
      '7',
    ]);
    await db.query('insert into packs (id, owner_id, title, grade) values ($1, $2, $3, $4)', [
      zweitesPaket,
      LEHRERIN,
      'Unit 4 – School',
      '7',
    ]);

    /*
      Gesät wird als Eigentümer: `authenticated` hat auf den
      Lernstandstabellen seit Migration 11 nur noch `select`.
    */
    await alsEinrichtung(db);
    await db.query(
      `insert into entry_progress (user_id, course_id, pack_id, entry_id, direction, due_at)
       values ($1, $2, $3, 'v-1', 'en-de', now() - interval '1 day'),
              ($1, $2, $3, 'v-2', 'en-de', now() + interval '3 days'),
              ($1, $2, $4, 'v-9', 'de-en', now() - interval '2 hours')`,
      [LERNENDE, kurs, paket, zweitesPaket],
    );
    await db.query(
      `insert into pack_progress (user_id, course_id, pack_id, last_practiced_at)
       values ($1, $2, $3, now() - interval '1 day')`,
      [LERNENDE, kurs, paket],
    );
    // Eine fremde Zeile im selben Kurs und Paket – sie darf nie auftauchen.
    await db.query(
      `insert into entry_progress (user_id, course_id, pack_id, entry_id, direction, due_at)
       values ($1, $2, $3, 'v-1', 'en-de', now() - interval '5 days')`,
      [ZWEITE_LERNENDE, kurs, paket],
    );
  });

  it('fasst alle Kurse und Pakete der eigenen Person in einer Abfrage zusammen', async () => {
    await alsPerson(db, LERNENDE);
    const ergebnis = await db.query('select * from my_due_overview() order by pack_id');
    expect(ergebnis.rows).toHaveLength(2);

    const erstes = ergebnis.rows.find((z) => z.pack_id === paket);
    expect(erstes.due_count).toBe(1);
    expect(erstes.entry_count).toBe(2);
    expect(erstes.last_practiced_at).not.toBeNull();

    const zweites = ergebnis.rows.find((z) => z.pack_id === zweitesPaket);
    expect(zweites.due_count).toBe(1);
    expect(zweites.entry_count).toBe(1);
    // Nie geübt im Sinne von `pack_progress`: kein Eintrag, also null.
    expect(zweites.last_practiced_at).toBeNull();
  });

  it('zählt ausschließlich den eigenen Lernstand', async () => {
    /*
      Die fremde Zeile liegt im selben Kurs und Paket und ist seit fünf Tagen
      fällig. Käme sie mit, stünde dort `due_count = 2`.
    */
    await alsPerson(db, LERNENDE);
    const meins = await db.query('select due_count from my_due_overview() where pack_id = $1', [
      paket,
    ]);
    expect(meins.rows[0].due_count).toBe(1);

    /*
      Die zweite lernende Person ist **Mitglied desselben Kurses**. Ohne diese
      Mitgliedschaft käme bei ihr schon deshalb nichts an, weil
      `entry_progress_own` seit Migration 11 zusätzlich
      `app_may_touch_progress(course_id)` verlangt – die Prüfung wäre grün und
      bewiese die falsche Sache.
    */
    await alsPerson(db, LEHRERIN);
    await db.query('insert into course_members (course_id, user_id, role) values ($1, $2, $3)', [
      kurs,
      ZWEITE_LERNENDE,
      'student',
    ]);

    await alsPerson(db, ZWEITE_LERNENDE);
    const andere = await db.query('select * from my_due_overview()');
    expect(andere.rows).toHaveLength(1);
    expect(andere.rows[0].due_count).toBe(1);
    expect(andere.rows[0].entry_count).toBe(1);
  });

  it('gibt der Lehrkraft nichts über ihre Lernenden', async () => {
    await alsPerson(db, LEHRERIN);
    const ergebnis = await db.query('select * from my_due_overview()');
    expect(ergebnis.rows).toHaveLength(0);
  });

  it('nimmt keine fremde Personenkennung entgegen', async () => {
    /*
      Nicht „die Funktion prüft den Parameter", sondern: Es gibt ihn nicht.
      Eine Signatur, die eine Kennung annimmt, wäre die Hintertür selbst –
      geprüft am Katalog, nicht an einem Aufrufversuch.
    */
    await alsEinrichtung(db);
    const signatur = await db.query(`
      select pg_get_function_arguments(p.oid) as argumente
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'my_due_overview'`);
    expect(signatur.rows).toHaveLength(1);
    /*
      Leer – und zwar vollständig leer. Bis zum 02.10.2026 stand hier ein
      `p_now timestamptz default now()`. Er war als Erleichterung für Tests
      gedacht und wäre über RPC, Gateway und Repository bis in den
      Produktivaufruf durchgereicht worden; dort hätte irgendwann eine
      Geräteuhr daringestanden (E28).
    */
    expect(signatur.rows[0].argumente).toBe('');
  });

  it('läuft mit den Rechten der aufrufenden Person, nicht des Eigentümers', async () => {
    // `security definer` wäre hier ein zweiter Weg an den Zugriffsregeln
    // vorbei – und müsste jede Prüfung selbst nachbauen.
    await alsEinrichtung(db);
    const art = await db.query(`
      select prosecdef
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'my_due_overview'`);
    expect(art.rows[0].prosecdef).toBe(false);
  });

  it('ist für Besucher ohne Konto und für den Dienst nicht ausführbar', async () => {
    await alsUnangemeldet(db);
    expect(await fehlerVon(db.query('select * from my_due_overview()'))).toMatch(
      /permission denied/i,
    );
    await alsDienst(db);
    expect(await fehlerVon(db.query('select * from my_due_overview()'))).toMatch(
      /permission denied/i,
    );
  });

  it('vergleicht gegen die Uhr der Datenbank – nachgewiesen an den Daten', async () => {
    /*
      Ohne Parameter lässt sich die Uhr nicht stellen. Bewegt wird deshalb
      das, was im Produkt auch wirklich wandert: die Fälligkeit.

      Das ist nicht der schwächere Nachweis, sondern der ehrlichere. Eine
      Prüfung, die die Uhr verstellt, braucht einen Vertrag, in dem die Uhr
      verstellbar ist – und genau der darf hier nicht entstehen (E28). Alle
      Zeitpunkte unten sind relativ zu `now()`; der Test hat keine eigene Uhr
      und kann deshalb auch nicht an einer Zeitgrenze kippen.
    */
    await alsPerson(db, LERNENDE);

    const vorher = await db.query('select * from my_due_overview() where pack_id = $1', [paket]);
    expect(vorher.rows[0].due_count).toBe(1);
    expect(vorher.rows[0].entry_count).toBe(2);

    await alsEinrichtung(db);
    await db.query(
      `update entry_progress set due_at = now() - interval '1 minute'
        where user_id = $1 and pack_id = $2 and entry_id = 'v-2'`,
      [LERNENDE, paket],
    );

    await alsPerson(db, LERNENDE);
    const nachher = await db.query('select * from my_due_overview() where pack_id = $1', [paket]);
    expect(nachher.rows[0].due_count).toBe(2);
    expect(nachher.rows[0].entry_count).toBe(2);
  });

  it('hat überhaupt keine Parameter – auch keinen für einen Zeitpunkt', async () => {
    // Die Gegenprobe zur Zeile oben: Der Aufruf mit einem Argument scheitert.
    await alsPerson(db, LERNENDE);
    expect(await fehlerVon(db.query('select * from my_due_overview(now())'))).toMatch(
      /does not exist|function my_due_overview/i,
    );
  });
});
