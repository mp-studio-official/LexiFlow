-- Migration 15 – ein Konto stilllegen.
--
-- ## Was im Pilot fehlte
--
-- Für eine lernende Person gab es den Weg schon, und er ist belegt: Die
-- Lehrkraft entfernt die Mitgliedschaft, der Zugriff endet sofort, der
-- Lernstand bleibt liegen (Inbetriebnahme §6.12, Migration 11). Das ist die
-- normale Handlung, sie geschieht in der Anwendung und braucht kein
-- Dashboard.
--
-- Was fehlte, ist der **Notfall**: ein Konto, bei dem die Zugangsdaten
-- weitergegeben wurden, das in mehreren Kursen steckt, oder bei dem die
-- Lehrkraft nicht die Person ist, die es stilllegen soll. Dafür gab es
-- nichts – für keine Rolle, auch nicht für die Verwaltung.
--
-- ## Der Schalter liegt an einer Stelle
--
-- `disabled_at` auf dem Profil, und vier Funktionen fragen danach. Es sind
-- genau die vier, an denen in diesem Schema **jede** Sichtbarkeit hängt:
-- Mitgliedschaft, Lehrkraftrolle im Kurs, Kursbesitz, Paketbesitz. Wer dort
-- nicht durchkommt, kommt nirgends durch – Kurse, Pakete, Fassungen,
-- Lernstand, Ereignisse.
--
-- Ein eigener Riegel je Tabelle wäre der andere Weg gewesen, und er wäre
-- der schlechtere: Beim nächsten neuen Bereich hätte ihn jemand vergessen,
-- und niemand hätte es gemerkt, weil ein vergessener Riegel sich wie ein
-- funktionierender anfühlt.
--
-- ## Was ausdrücklich **nicht** passiert
--
-- - **Kein Löschen.** Das Profil bleibt, der Lernstand bleibt, die
--   Mitgliedschaften bleiben. Stilllegen ist umkehrbar; Löschen nicht, und
--   im Zweifel soll die umkehrbare Handlung die sein, die zur Hand ist.
-- - **Keine Anmeldesperre.** Wer stillgelegt ist, kann sich weiterhin
--   anmelden und sieht dann nichts. Das ist keine Nachlässigkeit, sondern
--   die Grenze dieses Schemas: Die Anmeldung führt Supabase Auth, nicht
--   diese Datenbank. Die Pilotabnahme hält genau das fest.
-- - **Keine Lehrkraftbefugnis.** `authenticated` bekommt auf `disabled_at`
--   kein Schreibrecht. Dass eine Lehrkraft ein Konto über ihren eigenen Kurs
--   hinaus stilllegen darf, wäre die erste Befugnis dieser Art im Produkt –
--   und damit eine fachliche Entscheidung, keine Migration.

alter table profiles add column disabled_at timestamptz;

comment on column profiles.disabled_at is
  'Gesetzt: Das Konto ist stillgelegt und kommt nirgends mehr durch. '
  'Umkehrbar durch Zurücksetzen auf null. Kein Löschen, keine Anmeldesperre.';

create or replace function app_account_is_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  /*
    `not exists` und nicht `exists (… disabled_at is null)`: Ein Konto ohne
    Profilzeile ist nicht stillgelegt, es ist unfertig. Die zweite Fassung
    hätte es mit abgeräumt – und damit den Anlegevorgang mit erschlagen.
  */
  select not exists (
    select 1 from profiles where id = auth.uid() and disabled_at is not null
  );
$$;

comment on function app_account_is_active() is
  'Der Hauptschalter: Vier Funktionen fragen danach, und an denen hängt '
  'jede Sichtbarkeit. Ein eigener Riegel je Tabelle wäre beim nächsten '
  'Bereich vergessen worden.';

revoke all on function app_account_is_active() from public;
grant execute on function app_account_is_active() to authenticated;

-- ------------------------------------------------- Die vier Zugänge -----

create or replace function app_is_member_of(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_account_is_active() and exists (
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
  select app_account_is_active() and exists (
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
  select app_account_is_active()
     and exists (select 1 from courses where id = p_course and owner_id = auth.uid());
$$;

create or replace function app_owns_pack(p_pack text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_account_is_active()
     and exists (select 1 from packs where id = p_pack and owner_id = auth.uid());
$$;

-- ------------------------------------------------- Wer schalten darf -----

/*
  Nur serverseitig. `service_role` ist die Rolle hinter dem Secret Key, und
  der verlässt Supabase nie – die Edge Functions benutzen ihn, kein Browser
  und kein Mensch.

  `authenticated` steht hier bewusst nicht, auch nicht für die Verwaltung:
  Die Spaltenrechte auf `profiles` sind seit Migration 14 der Riegel gegen
  Selbsterhebung, und ein `update (disabled_at)` daneben wäre das erste Loch
  darin – jemand könnte zumindest andere stilllegen.
*/
grant update (disabled_at) on profiles to service_role;

-- --------------------------------------------- Der Besitz geht mit --------

/*
  Hier wurde der erste Entwurf von seiner eigenen Prüfung widerlegt, und
  danach noch einmal.

  **Erstens:** Der Schalter lag in den vier Hilfsfunktionen, und das schien
  zu genügen. Die Prüfung „eine stillgelegte Lehrkraft kommt auch über den
  Kursbesitz nicht mehr hinein" blieb rot: Die Regeln auf `courses`, `packs`
  und `ai_connections` fragen gar nicht `app_owns_course`, sie vergleichen
  `owner_id = auth.uid()` selbst. Eine Lehrkraft sah ihre Kurse weiter.

  **Zweitens:** Der naheliegende Schluss – die Regeln eben durch die
  Hilfsfunktionen schicken – war falsch, und zwar auf die unangenehme Art.
  `insert … returning id` prüft die Leseregel auf der **neu entstehenden**
  Zeile. `app_owns_course(id)` schlägt dafür in `courses` nach, und eine
  `stable` Funktion sieht den Stand vom Anfang der Anweisung: Die Zeile ist
  dort noch nicht. Ergebnis: Keine Lehrkraft konnte mehr einen Kurs anlegen.
  27 Prüfungen in `dienstrechte.test.mjs` wurden rot, und das zu Recht.

  Deshalb steht unten weiterhin `owner_id = auth.uid()` – ein Vergleich auf
  der Zeile selbst, ohne Nachschlagen – und daneben der Schalter. Was
  dazukommt, ist ausschließlich die Frage, ob das Konto noch aktiv ist; die
  Regeln behalten Namen und Bedeutung.
*/

drop policy courses_select on courses;
create policy courses_select on courses
  for select to authenticated
  using ((owner_id = auth.uid() and app_account_is_active()) or app_is_member_of(id));

drop policy courses_insert on courses;
create policy courses_insert on courses
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and app_account_is_active()
    and app_my_role() in ('teacher', 'admin')
  );

drop policy courses_update on courses;
create policy courses_update on courses
  for update to authenticated
  using (owner_id = auth.uid() and app_account_is_active())
  with check (owner_id = auth.uid() and app_account_is_active());

drop policy courses_delete on courses;
create policy courses_delete on courses
  for delete to authenticated
  using (owner_id = auth.uid() and app_account_is_active());

drop policy packs_all on packs;
create policy packs_all on packs
  for all to authenticated
  using (owner_id = auth.uid() and app_account_is_active())
  with check (owner_id = auth.uid() and app_account_is_active());

/*
  `ai_connections`: `using` bleibt ohne Rollenprüfung – wer die Rolle
  verliert, soll seine Verbindungen noch sehen und löschen können (Migration
  7). Wer stillgelegt ist, soll das nicht: Stillgelegt heißt stillgelegt, und
  eine Verbindung zu löschen ist auch eine Handlung.
*/
drop policy ai_verbindungen_eigene on ai_connections;
create policy ai_verbindungen_eigene on ai_connections
  for all to authenticated
  using (owner_id = auth.uid() and app_account_is_active())
  with check (
    owner_id = auth.uid()
    and app_account_is_active()
    and app_my_role() in ('teacher', 'admin')
  );
