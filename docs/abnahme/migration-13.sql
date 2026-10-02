-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  Abnahme Migration 13 — my_local_today und my_learning_days          ║
-- ║  AUSGEFÜHRT am 03.10.2026, alle Prüfungen bestanden.                 ║
-- ║  Für den Supabase SQL Editor; B bleibt jederzeit wiederholbar.       ║
-- ║  A vor dem Anwenden, B danach. Nichts hier verändert Daten.          ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- Migration 13 legt **keine** Tabelle und **keine** Spalte an. Sie fügt
-- zwei Lesefunktionen hinzu, die die bestätigte Zeitzone aus Migration 12
-- benutzen. `learner_settings`, die Zugriffsregeln und alle Rechte bleiben
-- unberührt.


-- ══════════════════════════ A · VORHER ════════════════════════════════

-- A1 · Umfang des Schemas
-- Erwartet (Ausgang nach Migration 12, gemessen am 02.10.2026):
--   tabellen 16 · spalten 101 · regeln 28 · funktionen 36 · trigger 13
-- Der lokale Prüfstand zählt hier 35 — genau eine weniger (`rls_auto_enable`,
-- eine Funktion der Plattform). Maßgeblich ist der Remote-Ausgang.
select
  (select count(*) from information_schema.tables   where table_schema   = 'public') as tabellen,
  (select count(*) from information_schema.columns  where table_schema   = 'public') as spalten,
  (select count(*) from pg_policies                 where schemaname     = 'public') as regeln,
  (select count(*) from information_schema.routines where routine_schema = 'public') as funktionen,
  (select count(*) from pg_trigger where not tgisinternal)                           as trigger;

-- A2 · Umfang der Nutzdaten — muss nachher unverändert sein
-- Erwartet: profile 4 · kurse 2 · mitglieder 4 · pakete 2 · fassungen 3
--           lernstand_paket 2 · lernstand_eintrag 2 · ereignisse (notieren)
select
  (select count(*) from profiles)         as profile,
  (select count(*) from courses)          as kurse,
  (select count(*) from course_members)   as mitglieder,
  (select count(*) from packs)            as pakete,
  (select count(*) from pack_revisions)   as fassungen,
  (select count(*) from pack_progress)    as lernstand_paket,
  (select count(*) from entry_progress)   as lernstand_eintrag,
  (select count(*) from progress_events)  as ereignisse,
  (select count(*) from learner_settings) as einstellungen;

-- A3 · Die beiden Funktionen darf es noch nicht geben
-- Erwartet: keine Zeile.
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('my_local_today', 'my_learning_days');


-- ══════════════════════════ B · NACHHER ═══════════════════════════════

-- B1 · Umfang des Schemas
-- Erwartet absolut: tabellen 16 · spalten 101 · regeln 28 · funktionen 38
--                   trigger 13   (lokaler Prüfstand: 37)
-- Nur die Funktionen wachsen, und zwar um genau zwei. Alles andere steht
-- still: Migration 13 legt nichts ab.
select
  (select count(*) from information_schema.tables   where table_schema   = 'public') as tabellen,
  (select count(*) from information_schema.columns  where table_schema   = 'public') as spalten,
  (select count(*) from pg_policies                 where schemaname     = 'public') as regeln,
  (select count(*) from information_schema.routines where routine_schema = 'public') as funktionen,
  (select count(*) from pg_trigger where not tgisinternal)                           as trigger;

-- B2 · Nutzdaten — **identisch** zu A2.
select
  (select count(*) from profiles)         as profile,
  (select count(*) from courses)          as kurse,
  (select count(*) from course_members)   as mitglieder,
  (select count(*) from packs)            as pakete,
  (select count(*) from pack_revisions)   as fassungen,
  (select count(*) from pack_progress)    as lernstand_paket,
  (select count(*) from entry_progress)   as lernstand_eintrag,
  (select count(*) from progress_events)  as ereignisse,
  (select count(*) from learner_settings) as einstellungen;

-- B3 · Die beiden Funktionen, ihre Signatur und ihre Rechte
-- Erwartet zwei Zeilen:
--   my_learning_days · definer false · argumente '' · angemeldet true
--                      dienst false · besucher false
--   my_local_today   · ebenso
-- Die leere Argumentliste ist die Zusage aus E28: keine Personenkennung,
-- keine Zeitzone, kein Datum, keine Uhr von aussen.
--
-- `my_learning_days` hat ausserdem **kein Zeitfenster**: Sie liefert die
-- ganze Lerngeschichte, aggregiert zu einer Zeile je lokalem Tag.
select p.proname,
       p.prosecdef                                               as security_definer,
       pg_get_function_arguments(p.oid)                          as argumente,
       has_function_privilege('authenticated', p.oid, 'execute') as angemeldet,
       has_function_privilege('service_role',  p.oid, 'execute') as dienst,
       has_function_privilege('anon',          p.oid, 'execute') as besucher
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('my_local_today', 'my_learning_days')
 order by p.proname;

-- B4 · Die Zugriffsregeln sind unverändert
-- Erwartet: dieselben 28 Zeilen wie vor der Migration, insbesondere
-- learner_settings_own, pack_progress_own, entry_progress_own,
-- progress_events_own — Migration 13 fasst keine Regel an.
select schemaname, tablename, policyname
  from pg_policies where schemaname = 'public' order by tablename, policyname;

-- B5 · `my_local_today` antwortet auch ohne alles
-- Im SQL Editor läuft dies als `postgres`, nicht als angemeldete Person;
-- `auth.uid()` ist dort leer. Erwartet deshalb: **genau eine Zeile**, alle
-- drei Spalten null. Das ist der Nachweis, auf den es ankommt — die
-- Funktion gibt auch dann eine Antwort, wenn es nichts zu sagen gibt.
select * from my_local_today();

-- B6 · `my_learning_days` ist dann leer
-- Erwartet: keine Zeile. Ohne bestätigte Zeitzone gibt es keine
-- Tagesgrenze, und ein Tag in UTC wäre erfunden.
select * from my_learning_days();

-- B7 · Die Historie
-- Erwartet: dreizehn Zeilen, die letzte 20261003090000.
select version from supabase_migrations.schema_migrations order by version;
