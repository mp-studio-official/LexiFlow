-- ===========================================================================
-- LexiFlow – Sprint 5A, Phase 6: Lernstand im Konto
-- ===========================================================================
--
-- Die Tabellen stehen seit Phase 2, und ihre eine Zugriffsregel steht dort
-- auch: `user_id = auth.uid()`, je Tabelle genau eine, ohne Ausnahme. Was hier
-- hinzukommt, ist der **Schreibweg** – und er hat genau zwei Aufgaben.
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
-- ## Was hier ausdrücklich NICHT passiert: das Leitner-Rechnen
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

create or replace function record_progress_events(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_event jsonb;
  v_neu integer := 0;
begin
  if v_me is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;
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

  for v_event in select * from jsonb_array_elements(p_events)
  loop
    /*
      Der Riegel. Ist die Kennung schon da, trifft `on conflict` und es wird
      keine Zeile eingefügt – dann überspringt die Schleife alles Weitere.
      Damit ist dasselbe Ereignis zweimal gesendet dasselbe wie einmal.
    */
    insert into progress_events (event_id, user_id)
    values ((v_event ->> 'eventId')::uuid, v_me)
    on conflict (event_id) do nothing;

    if not found then
      continue;
    end if;

    v_neu := v_neu + 1;

    -- Der Zähler je Paket.
    insert into pack_progress (
      user_id, course_id, pack_id, answered_count, correct_count, last_practiced_at
    )
    values (
      v_me,
      (v_event ->> 'courseId')::uuid,
      v_event ->> 'packId',
      1,
      case when v_event ->> 'outcome' = 'correct' then 1 else 0 end,
      (v_event ->> 'occurredAt')::timestamptz
    )
    on conflict (user_id, course_id, pack_id) do update
      set answered_count = pack_progress.answered_count + 1,
          correct_count = pack_progress.correct_count
            + case when v_event ->> 'outcome' = 'correct' then 1 else 0 end,
          -- `greatest`: Ein spät eintreffendes Ereignis darf den Zeitpunkt
          -- nicht zurückdrehen.
          last_practiced_at = greatest(
            pack_progress.last_practiced_at,
            (v_event ->> 'occurredAt')::timestamptz
          );

    /*
      Der Leitner-Stand, gerechnet auf dem Gerät (siehe oben). Hier wird er
      nur abgelegt – mit einer Ausnahme: Ein Stand, der **älter** ist als der
      gespeicherte, wird nicht übernommen. Zwei Geräte, die kurz
      nacheinander senden, sollen nicht rückwärtslaufen.
    */
    insert into entry_progress (
      user_id, course_id, pack_id, entry_id, direction,
      box, correct_count, wrong_count, streak, last_answered_at, due_at
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
      (v_event ->> 'occurredAt')::timestamptz,
      (v_event #>> '{entryState,dueAt}')::timestamptz
    )
    on conflict (user_id, course_id, pack_id, entry_id, direction) do update
      set box = excluded.box,
          correct_count = excluded.correct_count,
          wrong_count = excluded.wrong_count,
          streak = excluded.streak,
          last_answered_at = excluded.last_answered_at,
          due_at = excluded.due_at
      where entry_progress.last_answered_at is null
         or entry_progress.last_answered_at <= excluded.last_answered_at;
  end loop;

  return v_neu;
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

revoke all on function record_progress_events(jsonb) from public;
revoke all on function begin_practice_session(uuid, text) from public;
revoke all on function reset_my_progress(uuid, text) from public;

grant execute on function record_progress_events(jsonb) to authenticated;
grant execute on function begin_practice_session(uuid, text) to authenticated;
grant execute on function reset_my_progress(uuid, text) to authenticated;
