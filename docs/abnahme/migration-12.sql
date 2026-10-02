-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  Abnahme Migration 12 — learner_settings und my_due_overview         ║
-- ║  AUSGEFÜHRT am 02.10.2026, alle Prüfungen bestanden.                 ║
-- ║  Für den Supabase SQL Editor. A vor dem Anwenden, B danach.          ║
-- ║  Nichts hier verändert Daten; B bleibt jederzeit wiederholbar.       ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- Diese Datei wird **nicht** von der CLI ausgeführt. Die installierte
-- Fassung kennt kein `db execute` (nachgesehen mit `db --help`: die
-- Unterbefehle sind diff, dump, push, pull, reset, lint, start, query,
-- advisors, schema). Der SQL Editor ist der verlässliche Weg, und er zeigt
-- die Ergebnisse so, dass sie sich vergleichen lassen.


-- ══════════════════════════ A · VORHER ════════════════════════════════
-- Vor `db push` ausführen. Die beiden Ergebniszeilen festhalten.

-- A1 · Umfang des Schemas
-- Erwartet (zuletzt real gemessener Staging-Ausgang):
--   tabellen 15 · spalten 97 · regeln 27 · funktionen 33 · trigger 11
select
  (select count(*) from information_schema.tables   where table_schema   = 'public') as tabellen,
  (select count(*) from information_schema.columns  where table_schema   = 'public') as spalten,
  (select count(*) from pg_policies                 where schemaname     = 'public') as regeln,
  (select count(*) from information_schema.routines where routine_schema = 'public') as funktionen,
  (select count(*) from pg_trigger where not tgisinternal)                           as trigger;

-- A2 · Umfang der Nutzdaten — muss nachher unverändert sein
-- Erwartet: profile 4 · kurse 2 · mitglieder 4 · pakete 2 · fassungen 3
--           lernstand_paket 2 · lernstand_eintrag 2
select
  (select count(*) from profiles)       as profile,
  (select count(*) from courses)        as kurse,
  (select count(*) from course_members) as mitglieder,
  (select count(*) from packs)          as pakete,
  (select count(*) from pack_revisions) as fassungen,
  (select count(*) from pack_progress)  as lernstand_paket,
  (select count(*) from entry_progress) as lernstand_eintrag;

-- A3 · Die Tabelle darf es noch nicht geben
-- Erwartet: eine Zeile mit false.
select to_regclass('public.learner_settings') is not null as gibt_es_schon;

-- A4 · Welche 33 Funktionen das sind
--
-- Beantwortet am 02.10.2026: Die zusätzliche war `rls_auto_enable`, eine
-- Funktion der Plattform. Keine Migration dieses Repositorys erzeugt sie,
-- und keine verlässt sich auf sie. Die Abfrage bleibt stehen — bei der
-- nächsten Migration ist dieselbe Frage wieder zu stellen.
select routine_name, routine_type, external_language
  from information_schema.routines
 where routine_schema = 'public'
 order by routine_name;


-- ══════════════════════════ B · NACHHER ═══════════════════════════════
-- Nach `db push` ausführen.

-- B1 · Umfang des Schemas
-- Erwartet absolut: tabellen 16 · spalten 101 · regeln 28 · funktionen 36
--                   trigger 13
-- Das ist der Zuwachs +1 / +4 / +1 / +3 / +2 auf den Ausgang aus A1.
select
  (select count(*) from information_schema.tables   where table_schema   = 'public') as tabellen,
  (select count(*) from information_schema.columns  where table_schema   = 'public') as spalten,
  (select count(*) from pg_policies                 where schemaname     = 'public') as regeln,
  (select count(*) from information_schema.routines where routine_schema = 'public') as funktionen,
  (select count(*) from pg_trigger where not tgisinternal)                           as trigger;

-- B2 · Nutzdaten — **identisch** zu A2. Diese Migration legt nichts an und
-- löscht nichts.
select
  (select count(*) from profiles)       as profile,
  (select count(*) from courses)        as kurse,
  (select count(*) from course_members) as mitglieder,
  (select count(*) from packs)          as pakete,
  (select count(*) from pack_revisions) as fassungen,
  (select count(*) from pack_progress)  as lernstand_paket,
  (select count(*) from entry_progress) as lernstand_eintrag;

-- B3 · Die Spalten
-- Erwartet vier Zeilen:
--   user_id          uuid        · nullable NO  · default null
--   time_zone        text        · nullable YES · default null
--   weekly_goal_days smallint    · nullable YES · default null
--   updated_at       timestamptz · nullable NO  · default now()
-- Entscheidend: `time_zone` hat **keinen** Vorgabewert. null heißt
-- wahrheitsgemäß „nicht bestätigt" (E27).
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'learner_settings'
 order by ordinal_position;

-- B4 · Die Prüfbedingung auf dem Wochenziel
-- Erwartet: eine Zeile, deren Bedingung 1 und 7 nennt.
select con.conname, pg_get_constraintdef(con.oid) as bedingung
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
 where c.relname = 'learner_settings' and con.contype = 'c';

-- B5 · Die Rechte
-- Erwartet **genau eine** Zeile:
--   authenticated · INSERT,SELECT,UPDATE
-- Kein DELETE. Keine Zeile für anon, keine für service_role.
select grantee, string_agg(privilege_type, ',' order by privilege_type) as rechte
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'learner_settings'
   and grantee in ('anon', 'authenticated', 'service_role')
 group by grantee
 order by grantee;

-- B6 · Die Zugriffsregel
-- Erwartet **genau eine** Zeile:
--   learner_settings_own · ALL · authenticated
--   qual und with_check jeweils (user_id = auth.uid())
select policyname, cmd, roles::text as fuer, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'learner_settings';

-- B7 · Row Level Security ist eingeschaltet
-- Erwartet: true. Ohne diese Zeile wäre B6 eine Zierde.
select relrowsecurity as rls_an, relforcerowsecurity as rls_erzwungen
  from pg_class where oid = 'public.learner_settings'::regclass;

-- B8 · Die beiden Trigger
-- Erwartet zwei Zeilen:
--   learner_settings_time_zone · app_check_time_zone
--   learner_settings_touch     · app_touch_learner_settings
select t.tgname, p.proname as funktion, pg_get_triggerdef(t.oid) as definition
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'public.learner_settings'::regclass and not t.tgisinternal
 order by t.tgname;

-- B9 · Die Funktion und ihre Rechte
-- Erwartet **genau eine** Zeile:
--   my_due_overview · prosecdef false · argumente '' (leer!)
--   angemeldet true · dienst false · besucher false
-- Die leere Argumentliste ist die Zusage: kein Parameter für eine fremde
-- Person und keiner für einen Zeitpunkt (E28).
select p.proname,
       p.prosecdef                                         as security_definer,
       pg_get_function_arguments(p.oid)                    as argumente,
       has_function_privilege('authenticated', p.oid, 'execute') as angemeldet,
       has_function_privilege('service_role',  p.oid, 'execute') as dienst,
       has_function_privilege('anon',          p.oid, 'execute') as besucher
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'my_due_overview';

-- B10 · Die beiden Triggerfunktionen sind für niemanden ausführbar
-- Erwartet zwei Zeilen, alle drei Spalten false. Die Trigger feuern
-- trotzdem: Postgres prüft `execute` beim Anlegen des Triggers.
select p.proname,
       has_function_privilege('authenticated', p.oid, 'execute') as angemeldet,
       has_function_privilege('service_role',  p.oid, 'execute') as dienst,
       has_function_privilege('anon',          p.oid, 'execute') as besucher
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('app_check_time_zone', 'app_touch_learner_settings')
 order by p.proname;

-- B11 · Die Tabelle ist leer
-- Erwartet: 0. 5B.4a legt für niemanden eine Zeile an; eine fehlende Zeile
-- ist der Normalfall und heißt „Ziel aus, Zeitzone unbestätigt".
select count(*) as zeilen from learner_settings;

-- B12 · Die Historie
-- Erwartet: zwölf Zeilen, die letzte 20261002090000.
select version from supabase_migrations.schema_migrations order by version;
