-- ===========================================================================
-- LexiFlow – Sprint 5A, Phase 3: Anmeldung und Wiederherstellung
-- ===========================================================================
--
-- ## Lernende haben keine E-Mail-Adresse (ADR-5)
--
-- Supabase Auth führt Konten über E-Mail-Adressen. Eine Klasse siebter
-- Jahrgangsstufe hat keine verlässlichen privaten Adressen, und sie zu
-- verlangen verschiebt ein Datenschutzproblem in die Elternhäuser.
--
-- Deshalb bildet **ausschließlich die Serverfunktion** aus der Lern-ID eine
-- technische Adresse. Diese Tabelle hält die Zuordnung fest – ohne die Adresse
-- selbst zu speichern: Sie ist aus der Lern-ID ableitbar, und was ableitbar
-- ist, muss nicht zweimal existieren und zweimal aktuell gehalten werden.
--
-- ## Warum die Wiederherstellung kein Weg über die Lehrkraft ist
--
-- Der naheliegende Entwurf wäre: Die Lehrkraft setzt ein neues Kennwort.
-- Bequem – und er zerstört die zentrale Zusage dieses Produkts. Wer ein
-- fremdes Kennwort setzen kann, kann sich damit anmelden; für die Datenbank
-- **ist** er dann diese Person und sieht ihren Lernstand. Alle Regeln aus
-- Phase 2 wären mit einem Klick umgangen, und niemand würde es merken.
--
-- Stattdessen: ein Wiederherstellungscode, der der lernenden Person gehört.
-- Er wird beim Anlegen des Kontos einmal angezeigt und muss **bestätigt**
-- werden – sonst schreibt ihn niemand auf, und der erste Ernstfall ist auch
-- der letzte.
--
-- Gespeichert ist nur sein SHA-256. Wer die Datenbank liest, kann damit kein
-- Konto übernehmen.

create table learner_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,

  -- Klein geschrieben, damit „Fuchs-7390" und „fuchs-7390" dieselbe Kennung
  -- sind: Sie wird vorgelesen und abgeschrieben, nicht kopiert.
  learner_id text not null unique
    check (learner_id = lower(learner_id) and char_length(learner_id) between 4 and 40),

  recovery_code_hash text not null,

  -- Solange das leer ist, hat niemand bestätigt, den Code zu haben. Die
  -- Oberfläche erinnert dann bei jeder Anmeldung daran.
  recovery_confirmed_at timestamptz,

  created_at timestamptz not null default now()
);

comment on table learner_accounts is
  'Die Zuordnung Lern-ID → Konto. Enthält keine E-Mail-Adresse und keinen '
  'Klartext des Wiederherstellungscodes.';

/*
  Den Code bestätigen.

  Eine Funktion und keine Zugriffsregel: Zum Vergleichen müsste die Person
  sonst den Hash lesen dürfen, und ein lesbarer Hash ist eine Einladung, ihn
  offline durchzuprobieren. So bleibt die Spalte unsichtbar, und die Antwort
  ist ein Wahrheitswert.
*/
create or replace function confirm_recovery_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_hash text;
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;

  v_hash := encode(sha256(convert_to(upper(btrim(p_code)), 'UTF8')), 'hex');

  update learner_accounts
     set recovery_confirmed_at = now()
   where user_id = v_me
     and recovery_code_hash = v_hash
     -- Zweimal bestätigen ändert nichts; der Zeitpunkt bleibt der erste.
     and recovery_confirmed_at is null;

  if found then return true; end if;

  -- Schon bestätigt gilt ebenfalls als „passt" – sonst sähe ein zweiter Klick
  -- aus wie ein falscher Code.
  return exists (
    select 1 from learner_accounts
    where user_id = v_me
      and recovery_code_hash = v_hash
      and recovery_confirmed_at is not null
  );
end;
$$;

-- ------------------------------------------------------- Zugriffsregeln ----

alter table learner_accounts enable row level security;

/*
  Nur vier Spalten, und der Hash ist keine davon.

  Eine Zugriffsregel sieht Zeilen, keine Spalten (siehe `profiles` in Phase 2).
  Ohne dieses Spaltenrecht könnte jede lernende Person ihren eigenen
  Code-Hash lesen und in Ruhe durchprobieren, bis der Klartext feststeht.
*/
grant select (user_id, learner_id, recovery_confirmed_at, created_at)
  on learner_accounts to authenticated;

-- Kein `insert`, kein `update`, kein `delete` für Angemeldete. Konten legt
-- ausschließlich die Serverfunktion mit Service Role an.

create policy learner_accounts_own on learner_accounts
  for select to authenticated
  using (user_id = auth.uid());

revoke all on function confirm_recovery_code(text) from public;
grant execute on function confirm_recovery_code(text) to authenticated;
