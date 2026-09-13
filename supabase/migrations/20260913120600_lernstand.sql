-- ===========================================================================
-- LexiFlow – Sprint 5A, Phase 6: Lernstand im Konto
-- ===========================================================================
--
-- Die Tabellen stehen seit Phase 2, und ihre eine Zugriffsregel steht dort
-- auch: `user_id = auth.uid()`, je Tabelle genau eine, ohne Ausnahme. Was hier
-- hinzukommt, ist der **Schreibweg**.
--
-- ## 1. Idempotenz
--
-- Eine Antwort, die unterwegs verlorengeht, muss erneut gesendet werden
-- können. Ohne Vorkehrung zählte ein Wackler im WLAN eine Vokabel zweimal.
--
-- Die Vorkehrung ist `progress_events`: Der Client vergibt je Antwort eine
-- Kennung, und diese Tabelle merkt sich, welche verarbeitet wurden. Ein
-- `insert … on conflict do nothing` entscheidet in **einer** Anweisung, ob
-- dieses Ereignis neu ist – zwei Anweisungen hätten dieselbe Lücke wie beim
-- Einladungscode.
--
-- ## 2. Wessen Lernstand
--
-- `auth.uid()`, und nichts anderes. Die Funktion nimmt keine Kennung einer
-- Person entgegen, also kann auch keine übergeben werden. Das ist derselbe
-- Gedanke wie bei den Verträgen in `src/application/repositories.ts`: Was
-- nicht beschrieben ist, entsteht nicht aus Versehen.
--
-- ## 3. Wer gewinnt, wenn zwei Geräte schreiben – und wer ausdrücklich nicht
--
-- **Die Fassung entscheidet (`entry_progress.rev`), sonst nichts.** Ein Gerät
-- nennt beim Schreiben die Fassung, von der es ausging. Stimmt sie noch,
-- wird übernommen und hochgezählt. Stimmt sie nicht, wird **abgelehnt** und
-- die aktuelle Fassung gemeldet; das Gerät lädt neu, rechnet seine Bewertung
-- mit derselben Domainfunktion erneut und sendet dasselbe Ereignis wieder.
--
-- Ausdrücklich **nicht** entscheiden:
--
-- * **Die Fachnummer.** Fach 5, danach eine falsche Antwort, Ergebnis Fach 1 –
--   das ist ein richtiges Ergebnis und muss gespeichert werden. Ein Riegel,
--   der „den besseren Stand" behielte, ließe die Vokabel in Fach 5 stehen,
--   obwohl die Person sie gerade nicht konnte. Genau die Vokabel käme dann
--   nie wieder dran.
-- * **Der Zeitstempel vom Gerät.** Geräteuhren gehen falsch, und niemand kann
--   das nachprüfen. Entschiede `occurredAt`, dann gewänne dauerhaft das Gerät
--   mit der am weitesten vorgestellten Uhr – unbemerkt. `occurredAt` wird
--   deshalb **nicht** gespeichert und **nicht** verglichen; die Zeitstempel in
--   dieser Datenbank kommen aus `now()`.
-- * **Zähler oder Serien.** Aus demselben Grund wie die Fachnummer.
--
-- Eine Wiederholung desselben Schreibvorgangs ist kein Konflikt: Dafür merkt
-- sich die Zeile in `last_event_id`, welches Ereignis sie erzeugt hat. Ohne
-- das wäre ein zweites Mal gesendetes Ereignis entweder ein falscher Konflikt
-- oder eine zweite Anwendung derselben Antwort.
--
-- ## 4. Was hier ausdrücklich NICHT passiert: das Leitner-Rechnen
--
-- Welche Box eine Vokabel nach einer Antwort bekommt und wann sie wieder
-- fällig ist, rechnet `src/domain/leitner.ts` – seit Sprint 1, mit eigenen
-- Prüfungen, und dieselbe Rechnung läuft in jeder portablen Datei ohne
-- Server.
--
-- Dieselbe Rechnung hier in SQL zu wiederholen hieße, zwei Wahrheiten zu
-- pflegen. Sie würden auseinanderlaufen, und zwar unbemerkt: Ein Mensch, der
-- abwechselnd im Portal und in einer Lerndatei übt, bekäme zwei verschiedene
-- Vorstellungen davon, was er kann.
--
-- Der Client rechnet also und schickt das Ergebnis mit. Das heißt: Wer will,
-- kann seinen **eigenen** Lernstand beschönigen. Das ist hinnehmbar – es ist
-- seiner, niemand sonst sieht ihn, und aus ihm folgt nichts als die Auswahl
-- der nächsten Vokabel. Wer sich selbst belügt, hat weniger geübt; mehr
-- passiert nicht.
--
-- Was der Server trotzdem prüft, steht unten in `app_check_progress_events`:
-- Nicht **ob** gut gerechnet wurde, sondern ob das Ergebnis überhaupt in den
-- Wertebereich fällt, den diese Anwendung kennt – und ob die Vokabel der
-- Person überhaupt zusteht.

-- ------------------------------------------------------ Die Eingangsprüfung

/*
  Getrennt von der Schreibfunktion, weil sie etwas anderes tut: Sie schreibt
  nichts, sie lehnt ab. Alles oder nichts – geprüft wird die **ganze** Liste,
  bevor die erste Zeile entsteht. Eine halb übernommene Runde wäre schlimmer
  als eine abgelehnte.
*/
create or replace function app_check_progress_events(p_events jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fehler text;
  /*
    Auch hier keine Personenkennung als Parameter, obwohl diese Funktion nur
    von innen gerufen wird. Ein Parameter, den es nicht gibt, kann auch nicht
    eines Tages von außen gefüllt werden.
  */
  v_me uuid := auth.uid();
begin
  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'Erwartet wird eine Liste von Ereignissen.' using errcode = '22023';
  end if;

  /*
    Eine Obergrenze, damit ein einzelner Aufruf nicht beliebig lange läuft.
    Zweihundert Antworten sind mehr, als in einer Übungsrunde entstehen.
  */
  if jsonb_array_length(p_events) > 200 then
    raise exception 'Zu viele Ereignisse auf einmal.' using errcode = '22023';
  end if;

  -- 1. Der Wertebereich. Was hier durchfällt, ist kein Lernstand dieser
  --    Anwendung – gleich, ob aus einem Fehler oder aus Absicht.
  select case
           when e ->> 'eventId' is null or e ->> 'entryId' is null then 'Ein Ereignis ist unvollständig.'
           when e ->> 'direction' not in ('en-de', 'de-en') then 'Unbekannte Abfragerichtung.'
           when (e #>> '{entryState,box}')::int not between 1 and 5 then 'Fach außerhalb 1 bis 5.'
           when (e #>> '{entryState,correctCount}')::int < 0
             or (e #>> '{entryState,wrongCount}')::int < 0
             or (e #>> '{entryState,streak}')::int < 0 then 'Ein Zähler ist negativ.'
           when (e ->> 'baseRev')::int < 0 then 'Unbekannte Fassung.'
           /*
             Die Fälligkeit. Das längste Leitner-Fach sind 21 Tage
             (`BOX_INTERVAL_DAYS` in `src/domain/leitner.ts`); ein Tag Zugabe
             für Uhrenversatz. Nach hinten gibt es keine Grenze: Eine
             Fälligkeit in der Vergangenheit heißt schlicht „jetzt dran" und
             schadet niemandem. Gefährlich ist nur die andere Richtung – eine
             Vokabel, die auf das Jahr 2099 gelegt wird und nie wiederkommt.
           */
           when (e #>> '{entryState,dueAt}')::timestamptz > now() + interval '22 days'
             then 'Fälligkeit außerhalb der zulässigen Fächer.'
           else null
         end
    into v_fehler
    from jsonb_array_elements(p_events) e
   where case
           when e ->> 'eventId' is null or e ->> 'entryId' is null then true
           when e ->> 'direction' not in ('en-de', 'de-en') then true
           when (e #>> '{entryState,box}')::int not between 1 and 5 then true
           when (e #>> '{entryState,correctCount}')::int < 0
             or (e #>> '{entryState,wrongCount}')::int < 0
             or (e #>> '{entryState,streak}')::int < 0 then true
           when (e ->> 'baseRev')::int < 0 then true
           when (e #>> '{entryState,dueAt}')::timestamptz > now() + interval '22 days' then true
           else false
         end
   limit 1;

  if v_fehler is not null then
    raise exception '%', v_fehler using errcode = '22023';
  end if;

  /*
    2. Die Zugehörigkeit. Ein Lernstand entsteht nur zu einer Vokabel, die in
    einer Fassung steht, die diesem Kurs zugewiesen ist, in dem diese Person
    Mitglied ist.

    Zu einem **abgeschlossenen** Kurs wird weiterhin geschrieben. Das ist
    keine Nachlässigkeit, sondern die Einlösung eines Satzes, der seit Phase 4
    auf der Kursseite steht: „Du kannst weiter üben. Neue Pakete kommen hier
    keine mehr dazu." Ihn jetzt zu brechen hieße, einer lernenden Person den
    Lernstand wegzunehmen, während auf dem Bildschirm das Gegenteil steht.
    Siehe die offene Frage in § 5.5.7 des Fortsetzungsdokuments.
  */
  if exists (
    select 1
      from jsonb_array_elements(p_events) e
     where not exists (
       select 1
         from course_members m
         join course_packs cp on cp.course_id = m.course_id
         join pack_revisions r on r.pack_id = cp.pack_id and r.revision = cp.revision
        where m.user_id = v_me
          and m.course_id = (e ->> 'courseId')::uuid
          and cp.pack_id = e ->> 'packId'
          and r.withdrawn_at is null
     )
  ) then
    raise exception 'Dieses Paket liegt nicht in einem deiner Kurse.' using errcode = '42501';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_events) e
     where not exists (
       select 1
         from course_members m
         join course_packs cp on cp.course_id = m.course_id
         join pack_revisions r on r.pack_id = cp.pack_id and r.revision = cp.revision
         join lateral jsonb_array_elements(r.pack -> 'entries') x on true
        where m.user_id = v_me
          and m.course_id = (e ->> 'courseId')::uuid
          and cp.pack_id = e ->> 'packId'
          and r.withdrawn_at is null
          and x ->> 'id' = e ->> 'entryId'
     )
  ) then
    raise exception 'Diese Vokabel steht nicht in der zugewiesenen Fassung.' using errcode = '22023';
  end if;
end;
$$;

-- -------------------------------------------------------- Der Schreibweg

create or replace function record_progress_events(p_events jsonb)
returns table (event_id uuid, entry_id text, direction text, current_rev integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
/*
  `use_column`: Die Rückgabespalten heißen `entry_id` und `direction` – genau
  wie zwei Spalten von `entry_progress`. Ohne diese Anweisung wäre jedes
  `where direction = …` mehrdeutig. Gesammelt werden die Konflikte deshalb in
  einer Liste und ganz am Ende zurückgegeben, statt unterwegs in die
  Rückgabevariablen geschrieben zu werden.
*/
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_event jsonb;
  v_neu boolean;
  v_zeile entry_progress%rowtype;
  v_basis integer;
  v_konflikte jsonb := '[]'::jsonb;
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;

  perform app_check_progress_events(p_events);

  for v_event in select * from jsonb_array_elements(p_events)
  loop
    /*
      Der Riegel gegen Doppelzählung. Ist die Kennung schon da, trifft
      `on conflict` und es wird keine Zeile eingefügt – dann werden die
      Zähler nicht noch einmal erhöht. Der Lernstand wird trotzdem versucht:
      Ein Ereignis kann angekommen und gezählt, der Stand aber wegen eines
      Konflikts offen sein, und genau dann kommt es ein zweites Mal.
    */
    insert into progress_events (event_id, user_id)
    values ((v_event ->> 'eventId')::uuid, v_me)
    on conflict (event_id) do nothing;
    v_neu := found;

    if v_neu then
      insert into pack_progress (
        user_id, course_id, pack_id, answered_count, correct_count, last_practiced_at
      )
      values (
        v_me,
        (v_event ->> 'courseId')::uuid,
        v_event ->> 'packId',
        1,
        case when v_event ->> 'outcome' = 'correct' then 1 else 0 end,
        -- `now()` und nicht `occurredAt`: Ein Zeitstempel vom Gerät ist nicht
        -- überprüfbar. Der Preis ist benannt – eine Runde, die offline
        -- entstand, trägt den Zeitpunkt des Hochladens.
        now()
      )
      on conflict (user_id, course_id, pack_id) do update
        set answered_count = pack_progress.answered_count + 1,
            correct_count = pack_progress.correct_count
              + case when v_event ->> 'outcome' = 'correct' then 1 else 0 end,
            last_practiced_at = now();
    end if;

    -- Der Lernstand selbst – mit der Fassung als einzigem Schiedsrichter.
    select * into v_zeile
      from entry_progress
     where user_id = v_me
       and course_id = (v_event ->> 'courseId')::uuid
       and pack_id = v_event ->> 'packId'
       and entry_id = v_event ->> 'entryId'
       and direction = v_event ->> 'direction'
       for update;

    v_basis := (v_event ->> 'baseRev')::integer;

    if found and v_zeile.last_event_id = (v_event ->> 'eventId')::uuid then
      -- Schon angewandt. Eine Wiederholung ist kein Konflikt.
      continue;
    end if;

    if not found then
      if v_basis <> 0 then
        v_konflikte := v_konflikte || jsonb_build_object(
          'eventId', v_event ->> 'eventId',
          'entryId', v_event ->> 'entryId',
          'direction', v_event ->> 'direction',
          'rev', 0
        );
        continue;
      end if;

      insert into entry_progress (
        user_id, course_id, pack_id, entry_id, direction,
        box, correct_count, wrong_count, streak, last_answered_at, due_at,
        rev, last_event_id
      )
      values (
        v_me,
        (v_event ->> 'courseId')::uuid,
        v_event ->> 'packId',
        v_event ->> 'entryId',
        v_event ->> 'direction',
        (v_event #>> '{entryState,box}')::smallint,
        (v_event #>> '{entryState,correctCount}')::integer,
        (v_event #>> '{entryState,wrongCount}')::integer,
        (v_event #>> '{entryState,streak}')::integer,
        now(),
        (v_event #>> '{entryState,dueAt}')::timestamptz,
        1,
        (v_event ->> 'eventId')::uuid
      );
      continue;
    end if;

    if v_zeile.rev <> v_basis then
      /*
        Veraltet. Ob der abgelehnte Stand besser oder schlechter aussieht,
        wird nicht angesehen – genau darin liegt der Unterschied zu einem
        Riegel auf der Fachnummer.
      */
      v_konflikte := v_konflikte || jsonb_build_object(
        'eventId', v_event ->> 'eventId',
        'entryId', v_event ->> 'entryId',
        'direction', v_event ->> 'direction',
        'rev', v_zeile.rev
      );
      continue;
    end if;

    update entry_progress
       set box = (v_event #>> '{entryState,box}')::smallint,
           correct_count = (v_event #>> '{entryState,correctCount}')::integer,
           wrong_count = (v_event #>> '{entryState,wrongCount}')::integer,
           streak = (v_event #>> '{entryState,streak}')::integer,
           last_answered_at = now(),
           due_at = (v_event #>> '{entryState,dueAt}')::timestamptz,
           rev = v_zeile.rev + 1,
           last_event_id = (v_event ->> 'eventId')::uuid
     where user_id = v_me
       and course_id = (v_event ->> 'courseId')::uuid
       and pack_id = v_event ->> 'packId'
       and entry_id = v_event ->> 'entryId'
       and direction = v_event ->> 'direction'
       and rev = v_basis;
  end loop;

  return query
    select (k ->> 'eventId')::uuid,
           k ->> 'entryId',
           k ->> 'direction',
           (k ->> 'rev')::integer
      from jsonb_array_elements(v_konflikte) k;
end;
$$;

/*
  Eine begonnene Übungsrunde zählen.

  Mehr wird über Runden nicht geführt – keine Dauer, keine Uhrzeit, keine
  Abbrüche. Eine Zahl, die sagt „du warst schon 14-mal dran", ist alles, was
  ein Mensch davon braucht, und alles, was hier entstehen soll.
*/
create or replace function begin_practice_session(p_course uuid, p_pack text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;

  insert into pack_progress (user_id, course_id, pack_id, session_count, last_practiced_at)
  values (v_me, p_course, p_pack, 1, now())
  on conflict (user_id, course_id, pack_id) do update
    set session_count = pack_progress.session_count + 1,
        last_practiced_at = now();
end;
$$;

/*
  Den eigenen Lernstand zurücksetzen.

  Ohne Umweg über jemanden, und ohne dass irgendwo eine Spur bleibt: Wer
  seinen Lernstand loswerden will, soll ihn loswerden. Die Ereigniskennungen
  bleiben – sie sind kein Lernstand, sondern der Schutz gegen Doppelzählung,
  und ohne sie ließe sich eine alte Runde erneut einreichen.
*/
create or replace function reset_my_progress(p_course uuid, p_pack text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;

  delete from entry_progress
   where user_id = v_me and course_id = p_course and pack_id = p_pack;
  delete from pack_progress
   where user_id = v_me and course_id = p_course and pack_id = p_pack;
end;
$$;

revoke all on function app_check_progress_events(jsonb) from public;
revoke all on function record_progress_events(jsonb) from public;
revoke all on function begin_practice_session(uuid, text) from public;
revoke all on function reset_my_progress(uuid, text) from public;

-- `app_check_progress_events` bekommt keine Freigabe: Sie ist der Innenteil
-- von `record_progress_events` und hat von außen nichts zu suchen.
grant execute on function record_progress_events(jsonb) to authenticated;
grant execute on function begin_practice_session(uuid, text) to authenticated;
grant execute on function reset_my_progress(uuid, text) to authenticated;
