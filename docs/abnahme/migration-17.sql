/*
  Migration 17 — persönliche Lerncoach-Zugänge

  STATUS: AM 13.10.2026 IM STAGING AUSGEFÜHRT.

  `KI_IM_PILOT` bleibt trotz der Anwendung gesperrt. Die Migration schafft
  nur den persönlichen, eigentumsgebundenen Zugang; sie schaltet keinen
  Anbieter und keine Oberfläche frei.

  Anwenden:

    npx --yes supabase@latest db push --linked --dry-run

  Gemessen: ausschließlich
  `20261007090000_lerncoach_byok.sql`.

    npx --yes supabase@latest db push --linked --skip-vault

  Ergebnis: genau diese eine Fassung angewandt. Danach zeigte
  `migration list --linked` die Fassung lokal und remote; ein erneuter
  Trockenlauf meldete die entfernte Datenbank als aktuell.

  SQL-Nachmessung am 13.10.2026:

    B1  16 Tabellen · 102 Spalten · 28 Regeln · 40 Funktionen · 14 Trigger
    B2  owner_id = auth.uid(), aktives Konto und Rolle aus
        student · teacher · admin
    B3  0 für authenticated lesbare Geheimspalten
    B4  17 Fassungen · zuletzt 20261007090000

  Damit sind Migrationsziel, Regelwortlaut, Geheimnisschutz und Historie am
  echten Stagingprojekt belegt.
*/

-- A1 / B1 — Umfang bleibt bis auf die Historie gleich.
select
  (select count(*) from information_schema.tables   where table_schema   = 'public') as tabellen,
  (select count(*) from information_schema.columns  where table_schema   = 'public') as spalten,
  (select count(*) from pg_policies                 where schemaname     = 'public') as regeln,
  (select count(*) from information_schema.routines where routine_schema = 'public') as funktionen,
  (select count(*) from pg_trigger where not tgisinternal)                           as trigger;

-- Gemessen nachher: 16 · 102 · 28 · 40 · 14.

-- A2 / B2 — Wortlaut der einzigen geänderten Regel.
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename = 'ai_connections'
   and policyname = 'ai_verbindungen_eigene';

-- Vorher nennt `with_check` teacher und admin.
-- Nachher nennt es student, teacher und admin; `qual` bleibt auf der eigenen
-- aktiven Person. Keine Regel auf fremde Eigentümer und kein `true`.

-- A3 / B3 — die Siegelspalten bleiben für Browserrollen unlesbar.
select grantee, privilege_type, column_name
  from information_schema.column_privileges
 where table_schema = 'public'
   and table_name = 'ai_connections'
   and column_name in ('secret_ciphertext', 'secret_iv', 'secret_key_version')
 order by grantee, column_name, privilege_type;

-- Gemessen: kein `authenticated` mit SELECT auf einer der drei Spalten.

-- B4 — Historie.
select count(*) as versionen, max(version) as zuletzt
  from supabase_migrations.schema_migrations;

-- Gemessen danach: 17 · 20261007090000.
