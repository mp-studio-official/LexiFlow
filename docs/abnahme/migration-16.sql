/*
  Migration 16 – archivierte Kurse auch für neue Lernkonten schließen

  STATUS: ANGEWANDT UND LIVE GEGENEPRÜFT AM 09.10.2026

  Anlass: Der Live-Durchgang am 08./09.10.2026 zeigte, dass der bestehende
  Beitritt eines angemeldeten Kontos archivierte Kurse ablehnt. Die anonyme
  Kontoanlage benutzt jedoch direkt `consume_invite_by_hash`; dort fehlte
  die Kursbedingung. Der PGlite-Gegentest gab vor dieser Migration die
  Kurskennung zurück und verbrauchte einen Platz.

  Reihenfolge außerhalb des SQL Editors:

    npx --yes supabase@latest db push --linked --dry-run
    npx --yes supabase@latest db push --linked --skip-vault

  Der Trockenlauf muss genau
  `20261006090000_archivierte_kurse_schliessen.sql` nennen.

  Tatsächlicher Ablauf am 09.10.2026:

  - Trockenlauf: genau diese eine Fassung.
  - `db push --linked --skip-vault`: genau diese eine Fassung angewandt.
  - `migration list --linked`: 16 Fassungen in beiden Spalten, zuletzt
    `20261006090000`.
  - anschließender Trockenlauf: `Remote database is up to date.`
  - Live-Gegenprobe: Der alte Code des archivierten Kurses erreichte noch
    das Kontoformular, die Kontoanlage endete dann neutral mit „Dieser Code
    gilt nicht.“ Es erschienen weder Lern-ID noch Wiederherstellungscode noch
    Anmeldung. Damit stoppte der Ablauf vor `createUser`.

  A1/A2 und B1–B3 wurden nicht zusätzlich im SQL Editor ausgeführt. Der
  Schemaumfang wird deshalb hier nicht als entfernt gemessen ausgegeben.
  Belegt sind stattdessen die unveränderte reine `create or replace
  function`-Migration, 65 grüne PostgreSQL-/Schema-/Unveränderlichkeitstests,
  die deckungsgleiche Historie, der leere Trockenlauf und die Live-Ablehnung.
*/

-- A1 – Ausgangsstand. Lesend.
select
  (select count(*) from information_schema.tables   where table_schema   = 'public') as tabellen,
  (select count(*) from information_schema.columns  where table_schema   = 'public') as spalten,
  (select count(*) from pg_policies                 where schemaname     = 'public') as regeln,
  (select count(*) from information_schema.routines where routine_schema = 'public') as funktionen,
  (select count(*) from pg_trigger where not tgisinternal)                           as trigger;

-- Erwartet vor und nach Migration 16: 16 · 102 · 28 · 40 · 14.

-- A2 – der fehlende Schutz ist am entfernten Stand noch sichtbar. Lesend.
select
  position('archived' in lower(p.prosrc)) > 0 as archivschutz_schon_da,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'consume_invite_by_hash';

-- Erwartet vor Migration 16: false · true.

-- B1 – Schemaumfang nach dem Push. Lesend.
select
  (select count(*) from information_schema.tables   where table_schema   = 'public') as tabellen,
  (select count(*) from information_schema.columns  where table_schema   = 'public') as spalten,
  (select count(*) from pg_policies                 where schemaname     = 'public') as regeln,
  (select count(*) from information_schema.routines where routine_schema = 'public') as funktionen,
  (select count(*) from pg_trigger where not tgisinternal)                           as trigger;

-- Erwartet: unverändert 16 · 102 · 28 · 40 · 14.

-- B2 – Schutz und Ausführungsart. Lesend.
select
  position('not courses.archived' in lower(p.prosrc)) > 0 as archivschutz_ok,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'consume_invite_by_hash';

-- Erwartet: true · true.

-- B3 – nur der Dienst darf den Platz vor der Kontoanlage verbrauchen. Lesend.
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'consume_invite_by_hash'
order by grantee, privilege_type;

-- Erwartet: genau service_role · EXECUTE (plus Eigentümerdarstellung, falls
-- das Dashboard sie ausweist), aber weder anon noch authenticated noch PUBLIC.

-- B4 – Historie. Lesend.
select count(*) as versionen, max(version) as zuletzt
from supabase_migrations.schema_migrations;

-- Erwartet: 16 · 20261006090000.

-- B5 – danach in der Pilotadresse.
-- Den vorbereiteten alten Code eines archivierten Kurses mit einem neuen,
-- künstlichen Namen einlösen. Erwartet: die neutrale Ablehnung; es entsteht
-- weder ein Auth-Konto noch eine Mitgliedschaft und used_count bleibt 0.
