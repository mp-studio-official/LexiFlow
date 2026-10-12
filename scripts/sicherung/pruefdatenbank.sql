do $$
declare
  rolle text;
begin
  -- Der Rollenexport ändert die Einstellungen dieser von Supabase
  -- mitgebrachten Rollen. Eine leere PostgreSQL-Datenbank kennt sie nicht;
  -- deshalb entstehen sie hier vor dem Einspielen des Exports. Die Liste ist
  -- am 12.10.2026 direkt aus pg_roles des Pilotprojekts gemessen.
  foreach rolle in array array[
    'anon', 'authenticated', 'authenticator', 'cli_login_postgres',
    'dashboard_user', 'pgbouncer', 'service_role', 'supabase_admin',
    'supabase_auth_admin', 'supabase_etl_admin', 'supabase_privileged_role',
    'supabase_read_only_user', 'supabase_realtime_admin',
    'supabase_replication_admin', 'supabase_storage_admin'
  ] loop
    if not exists (select 1 from pg_roles where rolname = rolle) then
      execute format('create role %I nologin noinherit', rolle);
    end if;
  end loop;

  alter role service_role bypassrls;
end
$$;

create schema if not exists auth;
create schema if not exists extensions;

-- Die öffentliche LexiFlow-Struktur verweist auf Supabases verwaltete
-- Konten. Für die Wiederherstellungsprobe reichen Kennung und E-Mail: Die
-- vollständigen Auth-Daten liegen zusätzlich verschlüsselt in auth-data.dump.
create table if not exists auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', 'anon');
$$;
