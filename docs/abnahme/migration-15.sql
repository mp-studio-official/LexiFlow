-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  Abnahme Migration 15 — ein Konto stilllegen                         ║
-- ║  ANGEWANDT UND ABGENOMMEN am 06.10.2026. Alle Werte wie erwartet.    ║
-- ║  Diese Datei war die Anleitung dorthin und ist jetzt das Protokoll.  ║
-- ║  B bleibt wiederholbar. Nichts hier verändert Daten.                 ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- ## `20261005090000_konto_stilllegen.sql` ist ab jetzt unveränderlich
--
-- Sie steht im Staging. `db push` vergleicht Fassungen, nicht Inhalte; eine
-- nachträglich geänderte Datei gilt als angewandt und läuft nie wieder.
-- Jede Korrektur an dem, was sie angelegt hat, ist eine neue additive
-- Migration.
--
-- ## Sie wurde mit `db push` angewandt — als einzige
--
-- Anders als 14: Nachdem 14 in `supabase_migrations.schema_migrations`
-- stand, war 15 die einzige ausstehende Fassung. Der Trockenlauf vom
-- 06.10.2026 nannte genau eine Datei, und der Lauf wendete genau eine an.
--
--   npx --yes supabase@latest db push --linked --dry-run
--   → 20261005090000_konto_stilllegen.sql   (genau eine)
--   npx --yes supabase@latest db push --linked --skip-vault
--   → 20261005090000_konto_stilllegen.sql   (genau eine angewandt)
--
-- **Kein Nachtrag.** `db push` schreibt die Historie selbst; ein
-- `migration repair` daneben wäre hier nicht Vorsicht, sondern eine zweite
-- Quelle für dieselbe Aussage.
--
-- ## Die gemessenen Werte
--
-- |            | vorher | nachher |
-- | ---------- | ------ | ------- |
-- | Tabellen   |     16 |      16 |
-- | Spalten    |    101 |     102 |
-- | Regeln     |     28 |      28 |
-- | Funktionen |     39 |      40 |
-- | Trigger    |     14 |      14 |
--
-- Nutzdaten unverändert: 4 Profile · 2 Kurse · 4 Mitgliedschaften ·
-- 2 Pakete · 3 Fassungen · 2 Eintragsstände · 4 Ereignisse.
--
-- Die Regelzahl bleibt bei 28, obwohl sechs abgelegt und sechs angelegt
-- werden. Das ist die Probe darauf, dass beides lief.
--
-- Einzelnachweise, alle bestanden:
--
--   • B3: **0** stillgelegte Konten — die Migration legt niemanden still;
--   • B4: vier Funktionen nennen `app_account_is_active` (Mitgliedschaft,
--     Lehrkraftrolle im Kurs, Kursbesitz, Paketbesitz);
--   • B5: **alle sechs** Regeln nennen ihn — fehlte er in einer, hätte der
--     Besitz ein Loch, und genau das hatte der erste Entwurf;
--   • B6: `authenticated · display_name` und `service_role · disabled_at`,
--     **kein** `authenticated · disabled_at` — eine Lehrkraft kann kein
--     fremdes Konto stilllegen;
--   • B6b: INSERT 3 · SELECT 6 · UPDATE 1 — SELECT wächst um
--     `disabled_at`, wie vorhergesagt;
--   • B7: 15 Versionen, zuletzt `20261005090000`;
--   • B8: der abschließende Trockenlauf meldet nichts Ausstehendes.
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

-- B6b · Was beim **Lesen** dazukommt, und warum das in Ordnung ist
-- Erwartet: INSERT 3 · SELECT 6 · UPDATE 1 (vorher SELECT 5).
-- `grant select on profiles` gilt für die ganze Tabelle, also auch für die
-- neue Spalte. Zwei Folgen, beide bedacht:
--   • Eine stillgelegte Person kann ihr eigenes `disabled_at` lesen. Gut so:
--     Es ist ihr Zustand.
--   • Eine Lehrkraft sieht es bei den Profilen, die sie ohnehin sieht
--     (`app_sees_profile`, also ihre Kursmitglieder). Das ist keine Aussage
--     über das Lernen und bleibt deshalb offen — eine Spaltenverengung
--     dafür wäre eine neue Entscheidung, keine Nebensache dieser Migration.
select privilege_type, count(*) as spalten
  from information_schema.role_column_grants
 where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated'
 group by 1 order by 1;

-- B7 · Historie
-- Erwartet: 15 Versionen, zuletzt 20261005090000.
-- Hier steht die Zahl **ohne** Nachtrag richtig: `db push` schreibt die
-- Historie selbst. Das ist der ganze Unterschied zu Migration 14.
select count(*) as versionen, max(version) as zuletzt
  from supabase_migrations.schema_migrations;

-- B8 · Nichts steht mehr aus
--   npx --yes supabase@latest db push --linked --dry-run
-- Erwartet: keine ausstehende Migration.
