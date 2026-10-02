-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  Abnahme Migration 15 — ein Konto stilllegen                         ║
-- ║  NOCH NICHT AUSGEFÜHRT. Vorbereitet am 02.10.2026.                   ║
-- ║  Erst wenn 14 in der Historie steht. A vorher, B danach.             ║
-- ║  Nichts hier verändert Daten.                                        ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- ## Diese Migration wird mit `db push` angewandt — als einzige
--
-- Anders als 14: Sobald 14 in `supabase_migrations.schema_migrations`
-- steht, ist 15 die einzige ausstehende Fassung, und `db push` wendet genau
-- sie an. Der Beleg dafür ist der Trockenlauf in A0 — er muss **eine**
-- Datei nennen. Nennt er zwei, steht 14 noch nicht in der Historie, und
-- dann gehört der Nachtrag aus `docs/pilot-abnahme.md` A2.5 nachgeholt,
-- bevor hier irgendetwas läuft.
--
-- Erwartete Veränderung: Spalten +1, Funktionen +1. Regeln bleiben gleich
-- (sechs abgelegt, sechs angelegt). Tabellen, Trigger und Nutzdaten unberührt.

-- ══════════════════════════ A · VORHER ════════════════════════════════

-- A0 · Der Trockenlauf — auf dem Arbeitsrechner, nicht im Editor
--   npx --yes supabase@latest db push --linked --dry-run
-- Erwartet: **genau eine** Datei, 20261005090000_konto_stilllegen.
-- Zwei Dateien heissen: 14 fehlt in der Historie. Dann hier nicht weiter.

-- A1 · Umfang des Schemas
-- Erwartet (Ausgang nach Migration 14):
--   tabellen 16 · spalten 101 · regeln 28 · funktionen 39 · trigger 14
-- Lokal: 16 · 101 · 28 · 38 · 6
select
  (select count(*) from information_schema.tables   where table_schema   = 'public') as tabellen,
  (select count(*) from information_schema.columns  where table_schema   = 'public') as spalten,
  (select count(*) from pg_policies                 where schemaname     = 'public') as regeln,
  (select count(*) from information_schema.routines where routine_schema = 'public') as funktionen,
  (select count(*) from pg_trigger where not tgisinternal)                           as trigger;

-- A2 · Nutzdaten — muss nachher unverändert sein
select
  (select count(*) from profiles)        as profile,
  (select count(*) from courses)         as kurse,
  (select count(*) from course_members)  as mitglieder,
  (select count(*) from packs)           as pakete,
  (select count(*) from pack_revisions)  as fassungen,
  (select count(*) from entry_progress)  as lernstand_eintrag,
  (select count(*) from progress_events) as ereignisse;

-- A3 · Die sechs Regeln, die ausgetauscht werden — Wortlaut notieren
select polname, pg_get_expr(polqual, polrelid) as using_ausdruck
  from pg_policy
 where polname in ('courses_select','courses_insert','courses_update','courses_delete',
                   'packs_all','ai_verbindungen_eigene')
 order by polname;

-- ══════════════════════════ B · NACHHER ═══════════════════════════════

-- B1 · Umfang des Schemas
-- Erwartet: tabellen 16 · spalten 102 · regeln 28 · funktionen 40 · trigger 14
select
  (select count(*) from information_schema.tables   where table_schema   = 'public') as tabellen,
  (select count(*) from information_schema.columns  where table_schema   = 'public') as spalten,
  (select count(*) from pg_policies                 where schemaname     = 'public') as regeln,
  (select count(*) from information_schema.routines where routine_schema = 'public') as funktionen,
  (select count(*) from pg_trigger where not tgisinternal)                           as trigger;

-- B2 · Nutzdaten — Zeile für Zeile identisch mit A2
select
  (select count(*) from profiles)        as profile,
  (select count(*) from courses)         as kurse,
  (select count(*) from course_members)  as mitglieder,
  (select count(*) from packs)           as pakete,
  (select count(*) from pack_revisions)  as fassungen,
  (select count(*) from entry_progress)  as lernstand_eintrag,
  (select count(*) from progress_events) as ereignisse;

-- B3 · Niemand ist stillgelegt — die Migration legt niemanden still
-- Erwartet: 0
select count(*) as stillgelegt from profiles where disabled_at is not null;

-- B4 · Der Schalter ist da und steht überall, wo Sichtbarkeit hängt
-- Erwartet: vier Funktionen, deren Rumpf `app_account_is_active` nennt
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosrc like '%app_account_is_active%'
 order by 1;

-- B5 · Die sechs Regeln nennen den Schalter
select polname,
       pg_get_expr(polqual, polrelid)      as using_ausdruck,
       pg_get_expr(polwithcheck, polrelid) as with_check
  from pg_policy
 where polname in ('courses_select','courses_insert','courses_update','courses_delete',
                   'packs_all','ai_verbindungen_eigene')
 order by polname;

-- B6 · Schreiben darf nur der Dienst, und nur diese eine Spalte
-- Erwartet: eine Zeile — service_role · disabled_at
select grantee, column_name
  from information_schema.role_column_grants
 where table_schema = 'public' and table_name = 'profiles'
   and privilege_type = 'UPDATE' and grantee in ('authenticated','service_role')
 order by grantee, column_name;
-- Dazu: `authenticated` · display_name. Steht dort `authenticated` neben
-- `disabled_at`, ist etwas falsch gelaufen — dann könnte eine Lehrkraft ein
-- fremdes Konto stilllegen, und das ist ausdrücklich keine Befugnis in
-- diesem Produkt.

-- B7 · Historie
-- Erwartet: 15 Versionen, zuletzt 20261005090000.
-- Hier steht die Zahl **ohne** Nachtrag richtig: `db push` schreibt die
-- Historie selbst. Das ist der ganze Unterschied zu Migration 14.
select count(*) as versionen, max(version) as zuletzt
  from supabase_migrations.schema_migrations;

-- B8 · Nichts steht mehr aus
--   npx --yes supabase@latest db push --linked --dry-run
-- Erwartet: keine ausstehende Migration.
