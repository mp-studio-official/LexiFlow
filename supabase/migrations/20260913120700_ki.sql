-- ===========================================================================
-- LexiFlow – Sprint 5A, Phase 7: KI-Zugang
-- ===========================================================================
--
-- Zwei Tabellen, und beide sind vor allem dafür da, etwas **nicht** zu können.
--
-- ## 1. `ai_allowed_hosts` – die Freigabeliste
--
-- Ein Server, der auf Zuruf beliebige Adressen abruft, ist ein offener Proxy
-- im eigenen Netz (ADR-9). Was der Browser einer Lehrkraft nicht erreicht –
-- `169.254.169.254`, `localhost`, die Datenbank nebenan –, erreicht eine Edge
-- Function sehr wohl.
--
-- Deshalb ist „eigener Endpunkt" hier keine Einstellung im Formular, sondern
-- ein Eintrag, den eine **Verwaltung** vornimmt. Eine Lehrkraft kann wählen,
-- was freigegeben ist; sie kann nichts freigeben.
--
-- Lesen darf die Liste jede angemeldete Person: Sie enthält nichts Geheimes,
-- und die Oberfläche braucht sie, um eine Auswahl anzubieten statt eines
-- Textfelds, in das man alles eintragen kann.
--
-- ## 2. `ai_connections` – die Verbindungen
--
-- Der Anbieterschlüssel liegt **versiegelt** darin (AES-GCM, siehe
-- `supabase/functions/ai-gateway/tresor.ts`). Der Browser bekommt ihn nie zu
-- sehen – und damit das nicht nur eine Zusage der Serverfunktion ist, hat die
-- Rolle `authenticated` auf die drei Siegelspalten **kein Leserecht**. Selbst
-- wer die Tabelle über PostgREST direkt abfragt, bekommt sie nicht.
--
-- Das ist der Unterschied zwischen „die Anwendung zeigt es nicht an" und „es
-- wird nicht herausgegeben".
--
-- ## Was hier nicht steht
--
-- Kein Protokoll der Aufrufe. Wer wann welchen Text an ein Modell geschickt
-- hat, wäre eine Auswertung über Lehrkräfte – und es gibt keinen Grund, sie
-- anzulegen. Die Bremse zählt Versuche in `auth_rate_limit`, ohne zu merken,
-- worum es ging.

-- --------------------------------------------------------- Freigabeliste --

create table ai_allowed_hosts (
  -- Der Hostname, klein geschrieben, ohne Schema und ohne Pfad. Kein Muster:
  -- Ein Suffixvergleich erlaubte `api.openai.com.boese.example`.
  host text primary key check (
    host = lower(host)
    and host !~ '[^a-z0-9.-]'
    and char_length(host) between 4 and 253
  ),
  note text check (note is null or char_length(note) <= 200),
  approved_by uuid not null references profiles (id),
  approved_at timestamptz not null default now()
);

comment on table ai_allowed_hosts is
  'Von einer Verwaltung freigegebene KI-Hosts. Die Serverfunktion prüft '
  'zusätzlich Schema, Port, IP-Literale und Sonderformen – diese Liste ist '
  'das erste Tor, nicht das einzige.';

-- ------------------------------------------------------------ Verbindungen

create table ai_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,

  label text not null check (char_length(label) between 1 and 80),
  adapter text not null check (
    adapter in ('gemini', 'openai-kompatibel', 'anthropic-kompatibel', 'browsermodell')
  ),
  base_url text not null default '' check (char_length(base_url) <= 300),
  model text not null default '' check (char_length(model) <= 80),

  -- Nur die Maske geht nach außen. Sie entsteht aus dem Klartext, **bevor** er
  -- versiegelt wird – sonst wäre jede Liste ein Grund zu entsiegeln.
  masked_secret text not null default '' check (char_length(masked_secret) <= 40),

  -- Die drei Siegelspalten. Für `authenticated` nicht lesbar (siehe unten).
  secret_ciphertext text not null default '',
  secret_iv text not null default '',
  secret_key_version integer not null default 0 check (secret_key_version >= 0),

  active boolean not null default true,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_connections_owner_idx on ai_connections (owner_id);

comment on column ai_connections.secret_ciphertext is
  'AES-GCM, versiegelt mit dem Hauptschlüssel aus den Function Secrets. '
  'Mitversiegelt sind Schlüsselfassung, Eigentümerin, Verbindung und Anbieter '
  '– ein Chiffretext lässt sich damit nicht in eine fremde Zeile kopieren.';

-- ------------------------------------------------------------ Zugriffsregeln

alter table ai_allowed_hosts enable row level security;
alter table ai_connections enable row level security;

/*
  Lesen: jede angemeldete Person. Ändern: nur die Verwaltung.

  Zwei getrennte Regeln statt einer mit `ALL`, weil hier tatsächlich zwei
  verschiedene Dinge erlaubt sind – anders als bei den Lernständen, wo eine
  Regel für alles der Punkt ist.
*/
create policy ai_hosts_lesen on ai_allowed_hosts
  for select to authenticated
  using (true);

create policy ai_hosts_verwalten on ai_allowed_hosts
  for all to authenticated
  using (app_my_role() = 'admin')
  with check (app_my_role() = 'admin' and approved_by = auth.uid());

/*
  Verbindungen gehören ihrer Eigentümerin, und nur Lehrkräfte legen welche an.

  `using` ohne Rollenprüfung, `with check` mit: Wer die Rolle verliert, soll
  seine Verbindungen noch sehen und löschen können – aber keine neuen anlegen.
  Andersherum entstünden Zeilen, die niemand mehr aufräumen kann.
*/
create policy ai_verbindungen_eigene on ai_connections
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and app_my_role() in ('teacher', 'admin'));

-- ------------------------------------------------------------ Berechtigungen

grant select on ai_allowed_hosts to authenticated;
grant insert, update, delete on ai_allowed_hosts to authenticated;

/*
  Spaltenweise. Das ist der eigentliche Riegel unter der Zusage „der Browser
  sieht den Schlüssel nie": Die drei Siegelspalten stehen in keinem `select`,
  das eine angemeldete Person stellen kann – auch nicht in einem, das sie
  selbst über PostgREST formuliert.

  Geschrieben wird dort ausschließlich von der Serverfunktion mit Service
  Role, und die geht an den Zugriffsregeln vorbei.
*/
grant select (
  id, owner_id, label, adapter, base_url, model, masked_secret,
  active, last_checked_at, created_at, updated_at
) on ai_connections to authenticated;

grant insert (id, owner_id, label, adapter, base_url, model, active) on ai_connections to authenticated;
grant update (label, model, active) on ai_connections to authenticated;
grant delete on ai_connections to authenticated;

-- Ein `updated_at`, das sich selbst pflegt – sonst pflegt es niemand.
create or replace function app_ai_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger ai_connections_touch
  before update on ai_connections
  for each row execute function app_ai_touch();
