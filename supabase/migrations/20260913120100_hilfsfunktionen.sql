-- ===========================================================================
-- LexiFlow – Sprint 5A, Phase 2: Hilfsfunktionen
-- ===========================================================================
--
-- ## Warum diese Funktionen `security definer` sind
--
-- Eine Zugriffsregel auf `courses`, die in `course_members` nachschlägt, löst
-- dort **erneut** die Zugriffsregeln aus. Bei sich gegenseitig befragenden
-- Tabellen ergibt das eine Rekursion, die Postgres abbricht – und selbst wo
-- sie es nicht tut, ist das Ergebnis schwer vorhersagbar.
--
-- Diese Funktionen umgehen das, indem sie mit den Rechten ihrer Eigentümerin
-- laufen. Das ist mächtig und deshalb eng geschnitten: Jede beantwortet genau
-- eine Ja/Nein-Frage über die **aufrufende** Person und gibt nie eine Zeile
-- heraus. `search_path` ist festgesetzt, damit niemand durch eine
-- untergeschobene Tabelle gleichen Namens etwas anderes befragen lässt.

-- ------------------------------------------------ Fragen über mich selbst --

create or replace function app_my_role()
returns app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function app_is_member_of(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from course_members
    where course_id = p_course and user_id = auth.uid()
  );
$$;

create or replace function app_is_teacher_of(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from course_members
    where course_id = p_course
      and user_id = auth.uid()
      and role in ('teacher', 'admin')
  );
$$;

create or replace function app_owns_course(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from courses where id = p_course and owner_id = auth.uid());
$$;

create or replace function app_owns_pack(p_pack text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from packs where id = p_pack and owner_id = auth.uid());
$$;

/*
  Darf ich dieses Profil sehen?

  Zwei Fälle, und beide sind eng: das eigene Profil, und ein Profil aus einem
  Kurs, in dem ich unterrichte. Kein dritter. Eine Lehrkraft sieht damit
  Anzeigename, Kennung und Rolle der Menschen in ihrem Kurs – das ist, was auf
  der Mitgliederliste steht, und nichts darüber hinaus.
*/
create or replace function app_sees_profile(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_profile = auth.uid()
     or exists (
       select 1
       from course_members fremd
       join course_members meins on meins.course_id = fremd.course_id
       where fremd.user_id = p_profile
         and meins.user_id = auth.uid()
         and meins.role in ('teacher', 'admin')
     );
$$;

/*
  Ist mir diese Revision in einem Kurs zugewiesen?

  Das ist der einzige Weg, auf dem eine lernende Person überhaupt an ein Paket
  kommt: veröffentlicht, einem ihrer Kurse zugewiesen, nicht zurückgezogen.
*/
create or replace function app_revision_is_assigned_to_me(p_pack text, p_revision integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from course_packs cp
    join course_members cm on cm.course_id = cp.course_id
    where cp.pack_id = p_pack
      and cp.revision = p_revision
      and cm.user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------- Code einlösen ----

/*
  Der Beitritt per Code.

  Er **muss** eine Funktion sein und kann keine Zugriffsregel sein: Um einen
  Code zu prüfen, müsste man die Einladungen lesen dürfen – und wer die
  Einladungen eines Kurses lesen darf, sieht auch, welche es sonst noch gibt.
  Diese Funktion dreht das um: Sie nimmt den Code entgegen, vergleicht Hash
  gegen Hash und gibt entweder den Kurs zurück oder einen Fehler. Die
  Einladungstabelle bleibt für Lernende unsichtbar.

  Der Vergleich läuft über `sha256` aus dem Postgres-Kern – ohne `pgcrypto`,
  das in einer WebAssembly-Instanz nicht sicher verfügbar ist und hier auch
  nichts hinzufügte.
*/
create or replace function redeem_invite(p_code text)
returns courses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text;
  v_invite course_invites;
  v_course courses;
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;

  -- Groß-/Kleinschreibung und Leerraum sollen nicht entscheiden, ob ein an der
  -- Tafel vorgelesener Code funktioniert.
  v_hash := encode(sha256(convert_to(upper(btrim(p_code)), 'UTF8')), 'hex');

  select * into v_invite from course_invites where code_hash = v_hash;

  -- Eine einzige Meldung für „gibt es nicht", „zurückgezogen" und
  -- „abgelaufen": Der Unterschied hilft niemandem beim Beitreten und verriete
  -- beim Durchprobieren, welche Codes existieren.
  if v_invite.id is null
     or v_invite.revoked
     or (v_invite.expires_at is not null and v_invite.expires_at < now())
     or (v_invite.max_uses is not null and v_invite.used_count >= v_invite.max_uses) then
    raise exception 'Dieser Code gilt nicht.' using errcode = '22023';
  end if;

  select * into v_course from courses where id = v_invite.course_id;

  -- Ein zweiter Beitritt mit demselben Code ist kein Fehler, sondern ein
  -- zweiter Klick. Er zählt die Nutzung dann auch nicht erneut.
  if not exists (
    select 1 from course_members
    where course_id = v_course.id and user_id = v_me
  ) then
    insert into course_members (course_id, user_id, role)
    values (v_course.id, v_me, coalesce(app_my_role(), 'student'::app_role));

    update course_invites set used_count = used_count + 1 where id = v_invite.id;
  end if;

  return v_course;
end;
$$;
