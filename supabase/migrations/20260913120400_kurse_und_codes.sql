-- ===========================================================================
-- LexiFlow – Sprint 5A, Phase 4: Kurse, Einladungen, Codes
-- ===========================================================================
--
-- Diese Migration verlegt die Abläufe rund um Einladungscodes **in die
-- Datenbank**. Nicht aus Vorliebe für SQL, sondern weil zwei davon anders
-- nicht richtig zu bekommen sind:
--
-- 1. **Der Code darf nirgends im Klartext liegen.** Er entsteht hier, sein
--    Hash wird gespeichert, und der Klartext verlässt die Funktion genau
--    einmal – als Rückgabewert. Entstünde er im Browser, hinge die Zusage an
--    der Disziplin jeder einzelnen Aufrufstelle.
--
-- 2. **Die maximale Nutzungszahl muss atomar sein.** „Erst zählen, dann
--    hochsetzen" ist zwischen zwei gleichzeitigen Beitritten eine Lücke: Beide
--    lesen 4 von 5, beide schreiben 5, zwei Personen sind auf einem Platz. Die
--    Bedingung steht deshalb im `where` derselben `update`-Anweisung, die
--    hochzählt. Postgres serialisiert Zeilenschreibzugriffe; damit kann genau
--    eine der beiden gewinnen.
--
-- Beide Funktionen sind `security definer` mit festgesetztem `search_path` –
-- die Begründung dazu steht in `20260913120100_hilfsfunktionen.sql`.

-- ------------------------------------------------------- Versuchszähler ----

/*
  Eine Bremse gegen das Durchprobieren.

  Sie gehört in die Datenbank und nicht in den Arbeitsspeicher einer
  Serverfunktion: Edge-Laufzeiten starten kalt, laufen nebeneinander und enden
  ohne Vorwarnung. Ein Zähler darin wäre bei jedem zweiten Versuch wieder bei
  null – also keine Bremse, sondern die Behauptung einer.
*/
create table auth_rate_limit (
  -- Was gebremst wird: eine Lern-ID, eine Herkunft, eine Kombination daraus.
  schluessel text primary key,
  fenster_beginn timestamptz not null,
  versuche integer not null
);

create or replace function note_auth_attempt(
  p_schluessel text,
  p_hoechstzahl integer,
  p_fenster interval
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jetzt timestamptz := now();
  v_versuche integer;
begin
  /*
    Ein einziges `insert … on conflict do update`. Zwei Anweisungen – lesen,
    dann schreiben – hätten dieselbe Lücke wie beim Einladungscode, nur mit
    umgekehrtem Vorzeichen: Zwei gleichzeitige Versuche zählten als einer.
  */
  insert into auth_rate_limit (schluessel, fenster_beginn, versuche)
  values (p_schluessel, v_jetzt, 1)
  on conflict (schluessel) do update
    set versuche = case
          when auth_rate_limit.fenster_beginn < v_jetzt - p_fenster then 1
          else auth_rate_limit.versuche + 1
        end,
        fenster_beginn = case
          when auth_rate_limit.fenster_beginn < v_jetzt - p_fenster then v_jetzt
          else auth_rate_limit.fenster_beginn
        end
  returning versuche into v_versuche;

  return v_versuche <= p_hoechstzahl;
end;
$$;

alter table auth_rate_limit enable row level security;
-- Keine Regel und kein Recht für Angemeldete: Diese Tabelle gehört der
-- Serverfunktion. Wer sie lesen könnte, sähe, welche Lern-IDs versucht wurden.

-- ------------------------------------------------------------ Codeform ----

/*
  Ziffern und Großbuchstaben ohne die Paare, die sich beim Vorlesen
  verwechseln lassen: kein O gegen 0, kein I oder L gegen 1. Der Code wird an
  der Tafel vorgelesen und abgeschrieben – das ist der Anwendungsfall, nicht
  die Entropie.

  31 Zeichen an 8 Stellen sind rund 40 Bit. Zusammen mit dem Versuchszähler
  oben ist das für einen Code, der Tage gilt, ausreichend; ein Code, der
  Monate gelten soll, gehört mit `expires_at` begrenzt.
*/
create or replace function invite_alphabet()
returns text
language sql
immutable
as $$ select 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; $$;

/*
  Ein Code aus kryptografischem Zufall.

  `random()` wäre einfacher und falsch: Es ist ein vorhersagbarer
  Pseudozufall, und wer den Zustand kennt, errät den nächsten Code – und
  damit einen Kursbeitritt. `gen_random_uuid()` speist sich aus der
  Zufallsquelle des Systems.

  Die Zurückweisung von Bytes ab 248 ist kein Zierrat: 256 ist kein Vielfaches
  von 31, ein einfaches `mod 31` bevorzugte also die ersten acht Zeichen des
  Alphabets messbar. Verworfen wird, was die Gleichverteilung stören würde.
*/
create or replace function new_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  v_alphabet text := invite_alphabet();
  v_code text := '';
  v_hex text;
  v_byte integer;
  v_i integer;
begin
  while char_length(v_code) < 8 loop
    v_hex := replace(gen_random_uuid()::text, '-', '');
    v_i := 1;
    while v_i <= 32 and char_length(v_code) < 8 loop
      v_byte := ('x' || substr(v_hex, v_i, 2))::bit(8)::integer;
      if v_byte < 248 then
        v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
      end if;
      v_i := v_i + 2;
    end loop;
  end loop;
  return v_code;
end;
$$;

/** Derselbe Hash wie überall sonst – eine Stelle, eine Schreibweise. */
create or replace function invite_code_hash(p_code text)
returns text
language sql
immutable
as $$ select encode(sha256(convert_to(upper(btrim(p_code)), 'UTF8')), 'hex'); $$;

-- --------------------------------------------------- Einladung erzeugen ----

/*
  Der Klartext kommt genau einmal zurück und wird nirgends gespeichert.

  Deshalb eine Funktion und kein `insert` aus dem Browser: Ein Client, der die
  Zeile selbst schreibt, muss den Hash selbst bilden – und wer den Hash selbst
  bildet, kann auch etwas anderes hineinschreiben.
*/
create or replace function create_course_invite(
  p_course uuid,
  p_expires_at timestamptz default null,
  p_max_uses integer default null
)
returns table (invite_id uuid, code text, label text, expires_at timestamptz, max_uses integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
  v_id uuid;
begin
  if not app_is_teacher_of(p_course) then
    raise exception 'Nur Lehrkräfte dieses Kurses.' using errcode = '42501';
  end if;
  if p_max_uses is not null and p_max_uses < 1 then
    raise exception 'Eine Einladung mit null Plätzen ergibt keinen Sinn.' using errcode = '22023';
  end if;

  -- Bei einer Kollision – rechnerisch selten, aber nicht unmöglich – einfach
  -- noch einmal. Ein `unique` auf dem Hash macht daraus keinen stillen Fehler.
  loop
    v_code := new_invite_code();
    exit when not exists (select 1 from course_invites where code_hash = invite_code_hash(v_code));
  end loop;

  insert into course_invites (course_id, code_hash, label, expires_at, max_uses, created_by)
  values (p_course, invite_code_hash(v_code), substr(v_code, 1, 3), p_expires_at, p_max_uses, auth.uid())
  returning id into v_id;

  return query select v_id, v_code, substr(v_code, 1, 3), p_expires_at, p_max_uses;
end;
$$;

-- ---------------------------------------------------- Einladung einlösen ----

/*
  Einen Platz belegen – atomar.

  Die ganze Prüfung steht im `where` **derselben** Anweisung, die hochzählt.
  Zwei gleichzeitige Beitritte auf den letzten Platz können damit nicht beide
  gewinnen: Postgres lässt die zweite Anweisung auf die erste warten und
  wertet ihre Bedingung danach erneut aus – dann ist `used_count` bereits
  gleich `max_uses`, und es wird keine Zeile mehr getroffen.

  Gibt die Kurskennung zurück oder `null`. **Ein** Rückgabewert für jeden
  Fehlschlag: unbekannt, zurückgezogen, abgelaufen, voll. Ein unterscheidbarer
  Grund verriete beim Durchprobieren, welche Codes es gibt.
*/
create or replace function consume_invite_by_hash(p_hash text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course uuid;
begin
  update course_invites
     set used_count = used_count + 1
   where code_hash = p_hash
     and not revoked
     and (expires_at is null or expires_at > now())
     and (max_uses is null or used_count < max_uses)
  returning course_id into v_course;

  return v_course;
end;
$$;

/*
  Einen eben belegten Platz wieder freigeben.

  Nötig, weil zwischen „Platz belegt" und „Konto steht" noch etwas
  schiefgehen kann. Ohne diesen Weg verlöre jeder Fehlschlag einen Platz, und
  eine Einladung für fünfundzwanzig Lernende wäre nach ein paar Aussetzern
  aufgebraucht.

  `greatest(…, 0)`: Ein Zähler unter null wäre ein stiller Rechenfehler, der
  später Plätze verschenkt.
*/
create or replace function release_invite_by_hash(p_hash text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update course_invites
     set used_count = greatest(used_count - 1, 0)
   where code_hash = p_hash;
$$;

/*
  Der Beitritt selbst.

  Drei Änderungen gegenüber der Fassung aus Phase 2:

  1. **Ein Code erteilt niemals Lehrkraftrechte.** Vorher übernahm der
     Beitritt die globale Rolle der Person – eine Lehrkraft, die einen Code
     einlöst, wäre damit Lehrkraft *dieses* Kurses geworden und hätte dessen
     Mitgliederliste und Einladungen gesehen. Ein weitergegebener Code hätte
     so Rechte verteilt, die niemand vergeben wollte. Jetzt ist die
     Mitgliedschaft aus einem Code immer `student`; weitere Lehrkräfte trägt
     die Kursleitung ausdrücklich ein.

  2. **Der Platz wird atomar belegt** (siehe oben).

  3. **Ein archivierter Kurs nimmt niemanden mehr auf.** Archivieren heißt
     „das Halbjahr ist vorbei" – ein Code aus dem letzten Jahr soll dann nicht
     mehr hineinführen. Wer schon drin ist, bleibt drin und kann weiter üben.
*/
create or replace function redeem_invite(p_code text)
returns courses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course_id uuid;
  v_course courses;
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;

  /*
    Wer schon Mitglied ist, verbraucht keinen Platz. Ein zweiter Klick auf
    denselben Verweis ist kein Beitritt, sondern ein zweiter Klick.
  */
  select c.id into v_course_id
    from course_invites i
    join course_members m on m.course_id = i.course_id and m.user_id = v_me
    join courses c on c.id = i.course_id
   where i.code_hash = invite_code_hash(p_code);

  if v_course_id is null then
    v_course_id := consume_invite_by_hash(invite_code_hash(p_code));

    if v_course_id is null then
      raise exception 'Dieser Code gilt nicht.' using errcode = '22023';
    end if;

    if exists (select 1 from courses where id = v_course_id and archived) then
      -- Der Platz wurde eben gezählt; ein archivierter Kurs nimmt niemanden
      -- mehr auf, also zurückdrehen.
      update course_invites set used_count = used_count - 1 where code_hash = invite_code_hash(p_code);
      raise exception 'Dieser Code gilt nicht.' using errcode = '22023';
    end if;

    insert into course_members (course_id, user_id, role)
    values (v_course_id, v_me, 'student');
  end if;

  select * into v_course from courses where id = v_course_id;
  return v_course;
end;
$$;

-- ------------------------------------------------------- Kurs anlegen ------

/*
  Kurs und erste Mitgliedschaft in einem Schritt.

  Getrennt wäre es eine Lücke mit Ansage: Zwischen `insert into courses` und
  `insert into course_members` kann etwas fehlschlagen, und übrig bliebe ein
  Kurs ohne Lehrkraft – sichtbar für niemanden, löschbar von niemandem, und
  auch nicht mehr zu reparieren, weil die Zugriffsregeln genau die
  Mitgliedschaft verlangen, die fehlt.
*/
create or replace function create_course(
  p_title text,
  p_description text default null,
  p_school_year text default null
)
returns courses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course courses;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;
  if coalesce(app_my_role()::text, '') not in ('teacher', 'admin') then
    raise exception 'Kurse legen Lehrkräfte an.' using errcode = '42501';
  end if;

  insert into courses (owner_id, title, description, school_year)
  values (auth.uid(), p_title, p_description, p_school_year)
  returning * into v_course;

  insert into course_members (course_id, user_id, role)
  values (v_course.id, auth.uid(), 'teacher');

  return v_course;
end;
$$;

revoke all on function create_course(text, text, text) from public;
grant execute on function create_course(text, text, text) to authenticated;

-- ------------------------------------------ Konto einer lernenden Person ----

/*
  Anlegen in einem Schritt.

  Profil, Lern-Konto und Mitgliedschaft gehören zusammen: Ein Profil ohne
  Mitgliedschaft ist ein Konto, das nirgends hingehört; eine Mitgliedschaft
  ohne Lern-Konto kann sich nie wieder anmelden. Eine Funktion heißt eine
  Transaktion – entweder alles oder nichts.

  Aufrufbar ausschließlich mit Service Role, also nur aus der Serverfunktion.
*/
create or replace function create_learner_account(
  p_user uuid,
  p_learner_id text,
  p_display_name text,
  p_short_code text,
  p_recovery_hash text,
  p_course uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into profiles (id, display_name, short_code, role)
  values (p_user, p_display_name, p_short_code, 'student');

  insert into learner_accounts (user_id, learner_id, recovery_code_hash)
  values (p_user, lower(p_learner_id), p_recovery_hash);

  insert into course_members (course_id, user_id, role)
  values (p_course, p_user, 'student');
end;
$$;

/*
  Den Wiederherstellungscode austauschen.

  ADR-11 stand ursprünglich anders da: Der Code sollte nach Gebrauch gültig
  bleiben, damit niemand beim zweiten Vergessen ausgesperrt ist. Das Austauschen
  ist die bessere Antwort auf dieselbe Sorge – der gebrauchte Code ist sofort
  wertlos, und die Person steht trotzdem nie ohne einen da, weil der neue im
  selben Schritt entsteht und einmal angezeigt wird.
*/
create or replace function rotate_recovery_code(p_user uuid, p_new_hash text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update learner_accounts
     set recovery_code_hash = p_new_hash,
         -- Ein frischer Code ist noch nicht bestätigt: Er wurde eben erst
         -- angezeigt, und ob jemand ihn aufgeschrieben hat, weiß nur er selbst.
         recovery_confirmed_at = null
   where user_id = p_user;
end;
$$;

-- ------------------------------------------------------- Zugriffsrechte ----

revoke all on function note_auth_attempt(text, integer, interval) from public;
revoke all on function create_course_invite(uuid, timestamptz, integer) from public;
revoke all on function consume_invite_by_hash(text) from public;
revoke all on function release_invite_by_hash(text) from public;
revoke all on function create_learner_account(uuid, text, text, text, text, uuid) from public;
revoke all on function rotate_recovery_code(uuid, text) from public;
revoke all on function new_invite_code() from public;

-- Nur diese eine darf eine angemeldete Person aufrufen. `consume_invite_by_hash`
-- bewusst nicht: Wer sie direkt aufriefe, könnte Plätze verbrauchen, ohne je
-- Mitglied zu werden.
grant execute on function create_course_invite(uuid, timestamptz, integer) to authenticated;
grant execute on function invite_code_hash(text) to authenticated;
grant execute on function invite_alphabet() to authenticated;
