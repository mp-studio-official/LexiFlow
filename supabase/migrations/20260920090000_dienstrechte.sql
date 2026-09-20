-- LexiFlow – die Rechte der Serverfunktionen.
--
-- ## Warum diese Datei nachträglich kommt
--
-- Die Serverfunktionen sprechen mit der Datenbank über einen Client mit dem
-- Secret Key. Der landet in PostgREST als Rolle `service_role` – nicht als
-- Besitzer der Objekte und nicht als `authenticated`. Diese Rolle hat in
-- diesem Schema bisher **kein einziges Recht** bekommen.
--
-- Solange ein Supabase-Projekt „Automatically expose new tables" eingeschaltet
-- hat, fällt das nicht auf: Supabase verteilt dann von sich aus großzügige
-- Rechte an `service_role`, und alles läuft – aus einem Grund, der nichts mit
-- diesen Migrationen zu tun hat. In einem Projekt mit abgeschalteter
-- Automatik läuft nichts.
--
-- Besonders unangenehm ist die Stelle in `…120400_kurse_und_codes.sql`: Dort
-- werden die serverseitigen Funktionen mit `revoke all … from public`
-- zugesperrt und anschließend nur an `authenticated` zurückgegeben. Genau die
-- fünf, die **ausschließlich** eine Serverfunktion aufruft, bekommen niemand
-- zurück. Das ist kein Versehen an einer Stelle, sondern die Lücke zwischen
-- zwei richtigen Gedanken: „nichts für alle" und „nur für Angemeldete" – und
-- dazwischen fehlt „das hier für den Dienst".
--
-- ## Warum additiv
--
-- Die Migrationen 1 bis 4 sind im Stagingprojekt bereits angewandt. Eine
-- angewandte Datei wird nicht mehr verändert; Korrekturen kommen als neue
-- Datei mit neuem Zeitstempel. Diese hier läuft daher **nach** allen
-- bisherigen und darf nichts voraussetzen, was erst später entsteht – alle
-- Tabellen und Funktionen, die sie anspricht, stammen aus 1 bis 8.
--
-- ## Der Maßstab: was die Funktionen wirklich tun
--
-- Jede Zeile unten hat einen Aufruf im Quelltext als Grund. Kein
-- `grant … on all tables`, kein `grant … on all functions`. Die Zuordnung
-- steht im Kommentar daneben, damit beim nächsten Umbau auffällt, wenn ein
-- Recht ohne Aufrufer übrig bleibt – oder ein Aufruf ohne Recht dazukommt.
-- `scripts/db/dienstrechte.test.mjs` prüft genau diese Zuordnung.

-- --------------------------------------------------------------- Das Schema --

/*
  Ohne `usage` ist jedes weitere Recht wirkungslos: Die Rolle dürfte die
  Tabelle lesen, käme aber nicht an das Schema, in dem sie steht.

  `…120200_zugriffsregeln.sql` vergibt dieses Recht an `anon` und
  `authenticated` und übergeht `service_role` – dort fängt die Lücke an.
*/
grant usage on schema public to service_role;

-- ------------------------------------------------------- Tabellen: lesen nur --

/*
  `ai-gateway`: `.from('profiles').select('role')`.

  Die Serverfunktion muss vor jedem KI-Aufruf wissen, ob die anfragende Person
  Lehrkraft ist. Sie kann dafür nicht die Zugriffsregeln der Person benutzen –
  sie spricht als Dienst, nicht als Person.

  Nur `select`. Eine Serverfunktion, die Rollen ändern könnte, wäre der
  Selbstbedienungsladen, den `…120200` ausdrücklich verhindert.
*/
grant select on profiles to service_role;

/*
  `learner-auth`: `.from('learner_accounts').select('user_id, recovery_code_hash')`
  und `.select('user_id')`.

  Hier steht bewusst kein Spaltenfilter. `…120300_anmeldung.sql` gibt
  `authenticated` genau vier Spalten und hält `recovery_code_hash` zurück –
  weil niemand im Browser den Hash eines fremden oder eigenen
  Wiederherstellungscodes sehen soll. Die Serverfunktion dagegen **muss** ihn
  lesen: Sie vergleicht ihn beim Wiederherstellen. Das ist der einzige Ort im
  System, an dem dieser Hash gebraucht wird, und die Rolle, die ihn lesen
  darf, ist die einzige, die nie in einem Browser sitzt.

  Kein `insert`, kein `update`: Geschrieben wird ausschließlich über
  `create_learner_account` und `rotate_recovery_code` – beide
  `security definer`, beide unten mit `execute` versehen. Wer den Hash über
  eine dieser Funktionen setzt, durchläuft ihre Prüfungen; wer die Tabelle
  direkt beschriebe, nicht.
*/
grant select on learner_accounts to service_role;

-- -------------------------------------------- Tabellen: das KI-Gateway schreibt --

/*
  `ai-gateway`: `.select('*')`, `.upsert(…)`, `.update({last_checked_at})`,
  `.delete()` auf `ai_connections`.

  Vier Rechte, vier Aufrufe. `upsert` braucht `insert` **und** `update`: Es
  wird zu `insert … on conflict do update`, und ohne beide scheitert es erst
  beim zweiten Speichern derselben Verbindung – der unangenehmste Zeitpunkt.

  Hier steht bewusst kein Spaltenfilter: `…120700_ki.sql` gibt
  `authenticated` die Spalten einzeln und lässt `secret_ciphertext`,
  `secret_iv` und `secret_key_version` weg. Genau die drei schreibt und liest
  diese Rolle. Das ist die Arbeitsteilung, auf der die ganze Versiegelung
  beruht: Die Siegelspalten gehören dem Dienst, und nur ihm.
*/
grant select, insert, update, delete on ai_connections to service_role;

/*
  `ai-gateway`: `.from('ai_allowed_hosts').select('host')`.

  Die Freigabeliste wird beim Aufruf gelesen, nie von der Serverfunktion
  geändert. Gepflegt wird sie von der Verwaltung über die Oberfläche – dafür
  hat `authenticated` in `…120700` seine Rechte. Ein `insert` hier wäre ein
  Weg, die eigene Freigabeliste zu erweitern, und damit ein Loch im
  SSRF-Schutz.
*/
grant select on ai_allowed_hosts to service_role;

-- ------------------------------------------------- Funktionen: die fünf Aufrufe --

/*
  Alle fünf sind `security definer` mit festgesetztem `search_path`. Sie
  laufen also mit den Rechten ihres Besitzers, und `execute` ist das einzige,
  was die aufrufende Rolle braucht – keine Rechte auf die Tabellen dahinter.

  Das ist der Grund, warum diese Migration so kurz ausfällt: Der Schreibweg
  ist längst eingeschnürt, es fehlte nur die Erlaubnis, ihn zu betreten.
*/

-- `learner-auth` und `ai-gateway`: die Bremse, mit verschiedenen Präfixen.
grant execute on function note_auth_attempt(text, integer, interval) to service_role;

-- `learner-auth`: Platz in einem Kurs belegen und wieder freigeben.
grant execute on function consume_invite_by_hash(text) to service_role;
grant execute on function release_invite_by_hash(text) to service_role;

-- `learner-auth`: Konto anlegen, Wiederherstellungscode wechseln.
grant execute on function create_learner_account(uuid, text, text, text, text, uuid)
  to service_role;
grant execute on function rotate_recovery_code(uuid, text) to service_role;

-- ------------------------------------------------------------ Was hier fehlt --

/*
  Absichtlich **nicht** vergeben, obwohl es naheliegend wäre:

  - `execute` auf `redeem_invite`, `create_course`, `publish_pack`,
    `record_progress_events` und die übrigen Funktionen aus 5 bis 7. Sie
    gehören einer angemeldeten Person und lesen `auth.uid()`. Unter
    `service_role` ist `auth.uid()` leer; sie würden nicht heimlich etwas
    Falsches tun, sondern scheitern – aber ein Recht, das nur zum Scheitern
    führt, ist ein Recht, das jemand später falsch benutzt.

  - Rechte auf `courses`, `course_members`, `pack_progress`, `entry_progress`
    und `progress_events`. Keine Serverfunktion fasst sie an. Besonders die
    letzten drei: Ein Dienst mit Leserecht auf Lernstände wäre genau die
    Einsicht, die dieses Produkt niemandem geben will – auch sich selbst
    nicht.

  - `grant … to authenticated` oder `anon` in irgendeiner Form. Diese Datei
    vergibt ausschließlich an `service_role`. Was der Browser darf, steht in
    `…120200` und `…120700` und ändert sich hier nicht.
*/
