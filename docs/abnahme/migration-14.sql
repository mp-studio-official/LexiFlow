-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  Abnahme Migration 14 — Rollenriegel bei der Selbstanlage            ║
-- ║  NOCH NICHT AUSGEFÜHRT. Vorbereitet am 02.10.2026.                   ║
-- ║  Für den Supabase SQL Editor; B bleibt jederzeit wiederholbar.       ║
-- ║  A vor dem Anwenden, B danach. Nichts hier verändert Daten.          ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- ## Diese Migration wird NICHT mit `db push` angewandt
--
-- 14 und 15 stehen beide aus. `db push` kennt keine Zielfassung — das ist
-- keine Vermutung, es steht in der Hilfe der CLI 2.119.0: `--dry-run`,
-- `--include-all`, `--linked`, sonst nichts. Ein Aufruf wendet also **beide**
-- an, und danach ist Abschnitt B hier nicht mehr prüfbar: Er erwartet 101
-- Spalten und 39 Funktionen, und mit 15 stünden dort 102 und 40.
--
-- Der Weg ist deshalb: **SQL Editor, dann die Historie nachtragen.** Er
-- steht Zeile für Zeile in `docs/pilot-abnahme.md`, Teil A2. Dort steht auch
-- der Rückfall für den Fall, dass der Nachtrag schiefgeht.
--
-- Migration 14 legt **keine** Tabelle und **keine** Spalte an. Sie verengt
-- ein Recht, tauscht eine Regel aus und fügt einen Auslöser hinzu.
--
-- Erwartete Veränderung: Funktionen +1, Trigger +1. Regeln bleiben gleich
-- (eine abgelegt, eine angelegt). Tabellen, Spalten und Nutzdaten unberührt.


-- ══════════════════════════ A · VORHER ════════════════════════════════

-- A0 · Die Einstellung, die nicht in der Datenbank steht
-- Vor dem Anwenden im Dashboard prüfen und notieren:
--   Authentication → Sign In / Providers → Email → "Allow new users to sign up"
-- Erwartet: AUS. Migration 14 ist trotzdem erforderlich — Sicherheit darf
-- nicht allein an einem Schalter hängen, den irgendwann jemand umlegt.

-- A1 · Umfang des Schemas
-- Erwartet (Ausgang nach Migration 13, gemessen am 03.10.2026):
--   tabellen 16 · spalten 101 · regeln 28 · funktionen 38 · trigger 13
--
-- Hinweis, der dazugehört: Der lokale Prüfstand zählt 37 Funktionen (genau
-- eine weniger — `rls_auto_enable`, eine Funktion der Plattform) und **5**
-- Trigger. Die Differenz bei den Triggern ist mit 8 deutlich größer und ist
-- bislang **nicht erklärt**. Wer A1 ausführt und dort nicht 13 sieht, soll
-- nicht anwenden, sondern nachsehen.
select
  (select count(*) from information_schema.tables   where table_schema   = 'public') as tabellen,
  (select count(*) from information_schema.columns  where table_schema   = 'public') as spalten,
  (select count(*) from pg_policies                 where schemaname     = 'public') as regeln,
  (select count(*) from information_schema.routines where routine_schema = 'public') as funktionen,
  (select count(*) from pg_trigger where not tgisinternal)                           as trigger;

-- A2 · Umfang der Nutzdaten — muss nachher unverändert sein
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

-- A3 · Die Rolle jedes bestehenden Profils — muss nachher gleich sein
-- Migration 14 fasst keine Zeile an. Wenn sich hier etwas ändert, ist etwas
-- anderes passiert als das, was in der Datei steht.
select role, count(*) from profiles group by role order by role;

-- A4 · Der Befund selbst, schriftlich
-- Erwartet VORHER: with_check = (id = auth.uid())
select polname, pg_get_expr(polwithcheck, polrelid) as with_check
  from pg_policy
 where polrelid = 'public.profiles'::regclass
   and polname = 'profiles_insert_self';

-- A5 · Die Rechte auf `profiles`, vorher
-- Erwartet VORHER, gemessen am Prüfstand: INSERT 5 · SELECT 5 · UPDATE 1
--
-- Achtung, diese Zahlen sind leicht misszuverstehen. `role_column_grants`
-- listet **auch Tabellenrechte**, und zwar je Spalte aufgefächert:
-- `grant insert on profiles` erscheint dort als fünf Zeilen, weil die
-- Tabelle fünf Spalten hat. „5" heisst hier also nicht „fünf einzeln
-- vergebene Spalten", sondern „die ganze Tabelle".
--
-- Nur `UPDATE 1` ist ein echtes Spaltenrecht (`display_name`, Migration 3).
--
-- Nach Migration 14 steht dort INSERT **3** – dann ist es ein echtes
-- Spaltenrecht, und das ist der sichtbare Unterschied. SELECT bleibt 5.
-- (Eine frühere Fassung dieser Zeile behauptete „Spaltenebene nur
-- display_name". Das war falsch und hätte beim Lesen der Ausgabe für
-- Verwirrung gesorgt.)
select privilege_type, count(*) as spalten
  from information_schema.role_column_grants
 where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated'
 group by 1 order by 1;


-- A6 · Der Beleg, dass `db push` beide anwenden würde
-- Auf dem Arbeitsrechner, nicht im Editor:
--   npx --yes supabase@latest db push --linked --dry-run
-- Erwartet: **beide** Dateien in der Liste — 20261004090000_rollenriegel
-- und 20261005090000_konto_stilllegen. Genau deshalb wird hier nicht
-- gepusht. Die Ausgabe gehört ins Protokoll; sie ist der Beleg.

-- ══════════════════════════ B · NACHHER ═══════════════════════════════

-- B1 · Umfang des Schemas
-- Erwartet: tabellen 16 · spalten 101 · regeln 28 · funktionen 39 · trigger 14
select
  (select count(*) from information_schema.tables   where table_schema   = 'public') as tabellen,
  (select count(*) from information_schema.columns  where table_schema   = 'public') as spalten,
  (select count(*) from pg_policies                 where schemaname     = 'public') as regeln,
  (select count(*) from information_schema.routines where routine_schema = 'public') as funktionen,
  (select count(*) from pg_trigger where not tgisinternal)                           as trigger;

-- B2 · Nutzdaten — Zeile für Zeile identisch mit A2
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

-- B3 · Rollen unverändert — identisch mit A3
select role, count(*) from profiles group by role order by role;

-- B4 · Riegel 2: die Regel nennt jetzt die Rolle
-- Erwartet: ((id = auth.uid()) AND (role = 'student'::app_role))
select polname, pg_get_expr(polwithcheck, polrelid) as with_check
  from pg_policy
 where polrelid = 'public.profiles'::regclass
   and polname = 'profiles_insert_self';

-- B5 · Riegel 1: INSERT nur noch auf drei Spalten
-- Erwartet drei Zeilen: display_name · id · short_code
-- Die Zählung aus A5 steht dann auf INSERT 3 · SELECT 5 · UPDATE 1.
select column_name
  from information_schema.role_column_grants
 where table_schema = 'public' and table_name = 'profiles'
   and grantee = 'authenticated' and privilege_type = 'INSERT'
 order by column_name;

-- B6 · UPDATE weiterhin nur auf den Anzeigenamen
-- Erwartet genau eine Zeile: display_name
select column_name
  from information_schema.role_column_grants
 where table_schema = 'public' and table_name = 'profiles'
   and grantee = 'authenticated' and privilege_type = 'UPDATE'
 order by column_name;

-- B7 · Auf Tabellenebene steht kein INSERT mehr
-- Erwartet: eine Zeile, SELECT
select privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated'
 order by 1;

-- B8 · Riegel 3: der Auslöser ist da und läuft mit Aufruferrechten
-- Erwartet: tgname profiles_block_self_role_change · tgenabled O ·
--           prosecdef false (NICHT security definer — sonst wäre
--           `current_user` der Besitzer und der Riegel wirkungslos)
select t.tgname, t.tgenabled, p.proname, p.prosecdef
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal;

-- B9 · Die Migrationshistorie — VOR dem Nachtrag
-- Erwartet: **13** Versionen, zuletzt 20261003090000.
-- Das ist kein Fehler: Der SQL Editor führt Anweisungen aus, er schreibt
-- keine Historie. Der Nachtrag ist Schritt A2.5 in docs/pilot-abnahme.md.
select count(*) as versionen, max(version) as zuletzt
  from supabase_migrations.schema_migrations;

-- B9b · Die Migrationshistorie — NACH dem Nachtrag
-- Erwartet: 14 Versionen, zuletzt 20261004090000
select count(*) as versionen, max(version) as zuletzt
  from supabase_migrations.schema_migrations;

-- B9c · Der zweite Beleg: Jetzt steht nur noch 15 aus
-- Auf dem Arbeitsrechner:
--   npx --yes supabase@latest db push --linked --dry-run
-- Erwartet: **nur** 20261005090000_konto_stilllegen. Steht 14 noch dabei,
-- ist der Nachtrag nicht angekommen — dann nicht weiter, sondern nachsehen.

-- B10 · Der eigentliche Nachweis, gegen echte Zugriffsregeln
-- NICHT im SQL Editor ausführbar: Der Editor spricht als Besitzer, und für
-- den gelten weder Regeln noch Spaltenrechte. Dieser Punkt wird im Portal
-- geprüft — siehe docs/abnahme/migration-14.md, Abschnitt „Was der SQL
-- Editor nicht zeigen kann".
