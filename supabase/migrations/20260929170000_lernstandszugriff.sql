/*
  Lernstand braucht eine Mitgliedschaft – die elfte von elf Migrationen.

  ## Der Befund

  Beim Staging am 29.09.2026 wurde eine lernende Person aus einem Kurs
  entfernt. Danach:

    courses                  200, 0 Zeilen   richtig
    course_packs             200, 0 Zeilen   richtig
    pack_progress            200, 1 Zeile    FALSCH
    begin_practice_session   204, Zähler +1  FALSCH

  Kurs und Pakete waren weg, der Lernstand nicht. Er ließ sich weiter lesen
  und über die Runden-RPC weiter verändern.

  ## Warum

  Zwei Löcher, und sie sind verschiedener Art.

  **1. Die Zugriffsregel fragte nur nach der Person.**

      using (user_id = auth.uid())

  Die Zeile trägt eine `course_id`, aber niemand verglich sie mit der
  *aktuellen* Mitgliedschaft. „Mir gehört diese Zeile" und „ich darf in diesem
  Kurs lernen" sind zwei Aussagen; geprüft wurde nur die erste.

  **2. Zwei RPCs prüften gar nichts.**

  `begin_practice_session` und `reset_my_progress` sind `security definer`.
  Sie umgehen RLS **vollständig** – eine schärfere Zugriffsregel allein hätte
  an ihnen nichts geändert. Beide fragten nur, ob überhaupt jemand angemeldet
  ist.

  `record_progress_events` war dagegen bereits richtig: `app_check_progress_
  events` prüft je Ereignis die Mitgliedschaft. Dieselbe Prüfung steht jetzt
  auch dort ausdrücklich, damit alle drei Wege nachweislich durch **eine**
  Funktion gehen und eine Mutation an ihr alle drei zu Fall bringt.

  ## Das Modell in einem Satz

  Ein Lernstand gehört der lernenden Person – erreichbar ist er, solange sie
  Mitglied des Kurses ist, zu dem er gehört.

    | Lage                        | lesen | über RPC ändern | direkt schreiben |
    | --------------------------- | ----- | --------------- | ---------------- |
    | Mitglied                    | ja    | ja              | nein, für alle   |
    | Mitglied, Kurs archiviert   | ja    | ja              | nein             |
    | entfernt                    | nein  | nein            | nein             |
    | wieder aufgenommen          | ja    | ja              | nein             |
    | fremde Person, Lehrkraft    | nie   | nie             | nie              |

  **Gelöscht wird nichts.** Das Entfernen aus einem Kurs nimmt den Zugang,
  nicht die Arbeit. Wer zurückkommt, findet seinen Stand vor – Zeile für
  Zeile, Fach für Fach.

  **Archiviert bleibt nutzbar** (ADR-12): `app_is_member_of` fragt nicht nach
  `archived`, und das bleibt so. Ein abgeschlossener Kurs ist abgeschlossen,
  nicht geschlossen.

  ## Was diese Migration nicht kann

  Sie kann nicht verhindern, dass eine `security definer`-Funktion, die später
  jemand hinzufügt, die Prüfung vergisst. Dagegen hilft nur, dass sie hier
  **eine** Funktion ist, die man aufruft, statt einer Bedingung, die man
  abschreibt – und die Prüfung in `scripts/db/rls.test.mjs`, die beim
  Entfernen der Funktion rot wird.
*/

-- --------------------------------------------------------- Die eine Prüfung

/*
  Die zentrale Frage, einmal formuliert.

  Sie ist bewusst dünn: Sie fügt `app_is_member_of` nichts hinzu, ausser einem
  Namen, der sagt, wofür die Antwort hier gebraucht wird. Genau deshalb gibt
  es sie – eine Bedingung, die an fünf Stellen ausgeschrieben steht, ist an
  fünf Stellen einzeln änderbar.

  `stable` und nicht `immutable`: Eine Mitgliedschaft kann sich zwischen zwei
  Anweisungen ändern. `security definer`, weil `course_members` selbst unter
  einer Zugriffsregel liegt und die Frage sonst je nach Blickwinkel anders
  beantwortet würde.
*/
create or replace function app_may_touch_progress(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and app_is_member_of(p_course);
$$;

comment on function app_may_touch_progress(uuid) is
  'Darf die anmeldende Person den Lernstand dieses Kurses sehen und ändern? '
  'Die eine Prüfung hinter allen Lernstandswegen – Zugriffsregeln wie RPCs. '
  'Archivierung spielt keine Rolle (ADR-12), fehlende Mitgliedschaft schon.';

/*
  Die zweite Frage: Gehört dieses Paket überhaupt in diesen Kurs?

  Mitgliedschaft allein reicht nicht, sobald eine Zeile **entsteht**. Ein
  Mitglied konnte bisher `begin_practice_session(mein_kurs, 'was-auch-immer')`
  rufen und damit eine `pack_progress`-Zeile zu einem Paket anlegen, das in
  diesem Kurs nie zugewiesen war – oder zu einem, das in einem fremden Kurs
  liegt. Die Zeile wäre nirgends sichtbar und trotzdem da: Datenmüll mit einem
  Fremdschlüssel darauf.

  `withdrawn_at is null` gehört dazu. Eine zurückgezogene Fassung ist keine
  Zuweisung mehr; wer darauf noch Runden zählte, zählte auf etwas, das die
  Lehrkraft gerade aus dem Verkehr gezogen hat.

  `archived` steht auch hier **nicht** (ADR-12). Ein abgeschlossener Kurs
  behält seine Zuweisungen, und das Lernen läuft weiter.
*/
create or replace function app_pack_is_assigned(p_course uuid, p_pack text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from course_packs cp
      join pack_revisions r on r.pack_id = cp.pack_id and r.revision = cp.revision
     where cp.course_id = p_course
       and cp.pack_id = p_pack
       and r.withdrawn_at is null
  );
$$;

comment on function app_pack_is_assigned(uuid, text) is
  'Liegt dieses Paket in diesem Kurs, mit einer Fassung, die nicht '
  'zurückgezogen ist? Die zweite Prüfung – nötig überall dort, wo ein '
  'Lernstand *entsteht*, nicht dort, wo er verschwindet.';

-- ------------------------------------------------- Die Zugriffsregeln neu

/*
  `drop` und `create` statt `alter`: Eine Richtlinie lässt sich in PostgreSQL
  nicht im Ausdruck ändern. Die alte Fassung hiess genauso; wer die Namen
  vergleicht, sieht denselben Namen mit einer anderen Bedingung – deshalb
  steht die alte Bedingung hier im Kommentar:

      using (user_id = auth.uid())
*/
drop policy if exists pack_progress_own on pack_progress;
create policy pack_progress_own on pack_progress
  for all to authenticated
  using (user_id = auth.uid() and app_may_touch_progress(course_id))
  with check (user_id = auth.uid() and app_may_touch_progress(course_id));

drop policy if exists entry_progress_own on entry_progress;
create policy entry_progress_own on entry_progress
  for all to authenticated
  using (user_id = auth.uid() and app_may_touch_progress(course_id))
  with check (user_id = auth.uid() and app_may_touch_progress(course_id));

/*
  `progress_events` bleibt bei `user_id = auth.uid()`.

  Nicht aus Nachlässigkeit: Die Tabelle trägt **keine** `course_id`. Sie ist
  kein Lernstand, sondern ein Riegel gegen Doppelzählung – eine Liste von
  Ereigniskennungen je Person. Eine Kursbedingung liesse sich dort nicht
  formulieren, ohne eine Spalte zu erfinden, die es nicht gibt.

  Geschützt wird sie anders: Direkt schreiben darf dort ab jetzt niemand mehr
  (siehe unten). Wer eine Kennung eintragen könnte, könnte ein echtes Ereignis
  vorab blockieren.
*/

-- ------------------------------------- Direkte Schreibrechte: keine mehr

/*
  Die Frage, die der Befund aufwirft: Reicht eine Zugriffsregel, oder kommt
  jemand an den RPCs vorbei?

  Heute steht in `20260913120200_zugriffsregeln.sql`:

      grant select, insert, update, delete on pack_progress to authenticated;
      grant select, insert, update, delete on entry_progress to authenticated;
      grant select, insert on progress_events to authenticated;

  Der Browser braucht davon **nur `select`**: `supabaseProgressGateway.ts`
  liest die beiden Lernstandstabellen und schreibt ausschliesslich über die
  drei RPCs. Alles Weitere ist ein offener Weg ohne Benutzer.

  Ohne Schreibrecht ist der Fassungszähler (`rev`) nicht mehr umgehbar, die
  Idempotenz nicht mehr aushebelbar und ein Zähler nicht mehr frei setzbar.
  Die `with check`-Hälfte der Regeln oben wird damit zur zweiten Sicherung
  hinter einer geschlossenen Tür – beabsichtigt, nicht überflüssig: Fiele das
  `revoke` eines Tages weg, hielte die Regel noch.

  Die RPCs merken davon nichts. Sie laufen als `security definer` unter dem
  Eigentümer und nicht unter der anmeldenden Person.
*/
revoke insert, update, delete on pack_progress from authenticated;
revoke insert, update, delete on entry_progress from authenticated;
revoke insert on progress_events from authenticated;

-- ------------------------------------------------------------- Die RPCs

/*
  `begin_practice_session` – bisher ohne jede Prüfung ausser „angemeldet".

  Der Fehlercode `42501` ist kein Schmuck: PostgREST macht daraus eine 403.
  Mit dem bisherigen `28000` sähe eine fehlende Mitgliedschaft aus wie eine
  abgelaufene Anmeldung, und die Oberfläche schickte die Person zum Anmelden,
  wo sie nichts findet.
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

  if not app_may_touch_progress(p_course) then
    raise exception 'Kein Zugriff auf den Lernstand dieses Kurses.'
      using errcode = '42501';
  end if;

  /*
    Und die zweite Frage, weil hier eine Zeile **entsteht**.

    Ohne sie legt ein Mitglied mit einer erfundenen Paketkennung – oder mit
    der eines fremden Kurses – eine `pack_progress`-Zeile an, die niemand je
    zu sehen bekommt und die trotzdem dasteht.
  */
  if not app_pack_is_assigned(p_course, p_pack) then
    raise exception 'Dieses Paket liegt nicht in diesem Kurs.'
      using errcode = '42501';
  end if;

  insert into pack_progress (user_id, course_id, pack_id, session_count, last_practiced_at)
  values (v_me, p_course, p_pack, 1, now())
  on conflict (user_id, course_id, pack_id) do update
    set session_count = pack_progress.session_count + 1,
        last_practiced_at = now();
end;
$$;

/*
  `reset_my_progress` – dieselbe Lücke, mit schwererer Folge: Sie löscht.

  Dass auch das Löschen eine Mitgliedschaft verlangt, ist eine Entscheidung
  mit einer Kehrseite: Wer aus einem Kurs entfernt wurde, kann seinen dortigen
  Lernstand nicht mehr selbst wegräumen. Das ist hier richtig – ohne
  Mitgliedschaft gibt es diesen Kurs für die Person nicht mehr, und ein
  Schreibrecht, das nur löschen darf, ist auch ein Schreibrecht. Der Weg, alle
  eigenen Daten loszuwerden, ist ein eigener und steht noch aus.

  ## Warum hier `app_pack_is_assigned` **nicht** steht

  Die Regel lautet: **Entstehen verlangt eine Zuweisung, Verschwinden nicht.**

  Eine Zuweisung kann eine Lehrkraft jederzeit zurücknehmen – ein Paket aus
  dem Kurs entfernen, eine Fassung zurückziehen. Der Lernstand dazu bleibt
  stehen; er gehört der lernenden Person. Verlangte das Löschen eine
  Zuweisung, hinge das Wegräumen der eigenen Daten an einer
  Kurationsentscheidung von jemand anderem – und genau die Zeilen, die eine
  Lehrkraft aus dem Kurs genommen hat, wären die, die niemand mehr loswird.

  Gefährlich ist das nicht: Diese Funktion legt nichts an und ändert nichts.
  Sie löscht ausschliesslich Zeilen der aufrufenden Person in einem Kurs, in
  dem sie Mitglied ist. Mehr Prüfung hiesse hier weniger Selbstbestimmung
  ohne einen Gewinn an Sicherheit.
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

  if not app_may_touch_progress(p_course) then
    raise exception 'Kein Zugriff auf den Lernstand dieses Kurses.'
      using errcode = '42501';
  end if;

  delete from entry_progress
   where user_id = v_me and course_id = p_course and pack_id = p_pack;
  delete from pack_progress
   where user_id = v_me and course_id = p_course and pack_id = p_pack;
end;
$$;

/*
  `record_packt` – der Innenteil, der die Mitgliedschaft prüft.

  `app_check_progress_events` war als einziger der drei Wege schon richtig:
  Sie prüft je Ereignis die Mitgliedschaft **und** dass die Vokabel aus einer
  Fassung stammt, die diesem Kurs zugewiesen ist. Nur stand die
  Mitgliedschaftsbedingung dort ausgeschrieben – als `join` über
  `course_members`, nicht als Aufruf.

  Sie ruft jetzt `app_may_touch_progress`. Fachlich ändert sich dadurch
  nichts; prüfbar ändert sich alles: Erst damit hängen alle drei Wege
  nachweislich an **einer** Funktion, und die Gegenprobe kann es zeigen.

  Der erste Entwurf dieser Migration stellte stattdessen eine eigene Schleife
  vor `app_check_progress_events`. Sie schützte nichts zusätzlich und machte
  die Meldung schlechter: „Dieses Paket liegt nicht in einem deiner Kurse"
  wurde von einem allgemeinen Satz verdeckt. Zwei bestehende Prüfungen haben
  das sofort gemeldet – deshalb steht die Prüfung dort, wo die Bedingung
  ohnehin schon war.
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

    `archived` wird hier **absichtlich nicht geprüft** (ADR-12): Ein
    abgeschlossener Kurs ist abgeschlossen, nicht geschlossen. Die
    organisatorische Arbeit daran endet, das Lernen nicht – die Pakete bleiben
    da, es wird weiter geübt, der Lernstand läuft mit.

    Wer wirklich keinen Zugriff mehr haben soll, verliert die Mitgliedschaft.
    Das ist eine eigene, bewusste Handlung, und sie wirkt sofort: Ohne
    Mitgliedschaft fällt die Prüfung oben durch.
  */
  /*
    Dieselben zwei Fragen wie in `begin_practice_session`, nur je Ereignis –
    und ausdrücklich über dieselben zwei Funktionen. Stünde die Bedingung hier
    ein zweites Mal ausgeschrieben, wäre sie ein zweites Mal einzeln änderbar.
  */
  if exists (
    select 1
      from jsonb_array_elements(p_events) e
     where not (
       app_may_touch_progress((e ->> 'courseId')::uuid)
       and app_pack_is_assigned((e ->> 'courseId')::uuid, e ->> 'packId')
     )
  ) then
    raise exception 'Dieses Paket liegt nicht in einem deiner Kurse.' using errcode = '42501';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_events) e
     where not exists (
       select 1
         from course_packs cp
         join pack_revisions r on r.pack_id = cp.pack_id and r.revision = cp.revision
         join lateral jsonb_array_elements(r.pack -> 'entries') x on true
        where app_may_touch_progress((e ->> 'courseId')::uuid)
          and cp.course_id = (e ->> 'courseId')::uuid
          and cp.pack_id = e ->> 'packId'
          and r.withdrawn_at is null
          and x ->> 'id' = e ->> 'entryId'
     )
  ) then
    raise exception 'Diese Vokabel steht nicht in der zugewiesenen Fassung.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function app_check_progress_events(jsonb) from public;

/*
  `record_progress_events` selbst bleibt inhaltlich unverändert. Sie steht
  hier nur noch einmal, weil eine Migration eine Funktion nicht halb ersetzen
  kann – und weil `create or replace` in einer späteren Migration sonst still
  die ältere Fassung stehen liesse.
*/
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

revoke all on function app_may_touch_progress(uuid) from public;
revoke all on function app_pack_is_assigned(uuid, text) from public;
revoke all on function record_progress_events(jsonb) from public;
revoke all on function begin_practice_session(uuid, text) from public;
revoke all on function reset_my_progress(uuid, text) from public;

grant execute on function app_may_touch_progress(uuid) to authenticated;
grant execute on function app_pack_is_assigned(uuid, text) to authenticated;
grant execute on function record_progress_events(jsonb) to authenticated;
grant execute on function begin_practice_session(uuid, text) to authenticated;
grant execute on function reset_my_progress(uuid, text) to authenticated;
