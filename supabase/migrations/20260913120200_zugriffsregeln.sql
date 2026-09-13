-- ===========================================================================
-- LexiFlow – Sprint 5A, Phase 2: die Zugriffsregeln
-- ===========================================================================
--
-- **Das hier ist die Sicherheitsarchitektur.** Nicht der Riegel im Router,
-- nicht der fehlende Knopf in der Oberfläche – die beiden sorgen dafür, dass
-- niemand in eine Sackgasse läuft. Was tatsächlich trägt, steht in dieser
-- Datei, weil der Schlüssel im Browser öffentlich ist (ADR-3) und jede Person
-- mit diesem Schlüssel jede Abfrage stellen kann, die ihr einfällt.
--
-- ## Die Regel, auf die es ankommt
--
-- Für `pack_progress`, `entry_progress` und `progress_events` gibt es **je
-- Tabelle genau eine Bedingung**: `user_id = auth.uid()`. Keine Ausnahme für
-- Lehrkräfte, keine für die Verwaltung. Eine Lehrkraft, die diese Tabellen
-- abfragt, bekommt ihre eigenen Zeilen und sonst nichts – auch dann, wenn sie
-- den Schlüssel, die Tabellennamen und die Kurskennungen kennt.
--
-- ## Zwei Bedingungen je schreibender Regel
--
-- `using` prüft, was man anfassen darf; `with check`, wie es hinterher
-- aussehen darf. Nur `using` hieße: Ich darf meine eigene Zeile ändern – und
-- sie dabei jemand anderem zuschreiben.
--
-- ## Kein `grant` ohne Grund
--
-- Die Rolle `authenticated` bekommt je Tabelle genau die Operationen, die sie
-- braucht. Bei `profiles` sogar nur eine einzelne Spalte: Wer seine eigene
-- Zeile ändern darf, könnte sonst `role` auf `teacher` setzen. Eine
-- Zugriffsregel kann das nicht verhindern – sie sieht Zeilen, nicht Spalten.

-- ---------------------------------------------------------------- Schema --

grant usage on schema public to anon, authenticated;

-- Standardmäßig darf `authenticated` gar nichts; alles Weitere wird einzeln
-- erteilt. `anon` – nicht angemeldet – bekommt nirgends etwas.
revoke all on all tables in schema public from anon, authenticated;

-- --------------------------------------------------------------- Profile --

alter table profiles enable row level security;
grant select, insert on profiles to authenticated;
-- Nur diese eine Spalte. `role` und `short_code` ändert niemand über die
-- normale Verbindung.
grant update (display_name) on profiles to authenticated;

create policy profiles_select on profiles
  for select to authenticated
  using (app_sees_profile(id));

create policy profiles_insert_self on profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ----------------------------------------------------------------- Kurse --

alter table courses enable row level security;
grant select, insert, update, delete on courses to authenticated;

-- Die Eigentümerin steht ausdrücklich mit in der Lesebedingung. Ein `insert
-- ... returning` prüft in Postgres auch die Leseregel – ohne sie schlüge das
-- Anlegen eines Kurses fehl, bevor die Mitgliedschaft existiert.
create policy courses_select on courses
  for select to authenticated
  using (owner_id = auth.uid() or app_is_member_of(id));

create policy courses_insert on courses
  for insert to authenticated
  with check (owner_id = auth.uid() and app_my_role() in ('teacher', 'admin'));

create policy courses_update on courses
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy courses_delete on courses
  for delete to authenticated
  using (owner_id = auth.uid());

-- ----------------------------------------------------------- Mitglieder --

alter table course_members enable row level security;
grant select, insert, delete on course_members to authenticated;

create policy course_members_select on course_members
  for select to authenticated
  using (user_id = auth.uid() or app_is_teacher_of(course_id));

-- Zwei Wege hinein: Eine Lehrkraft trägt jemanden ein, oder die Eigentümerin
-- trägt sich beim Anlegen selbst ein. Der dritte Weg – Beitritt per Code –
-- läuft über `redeem_invite` und nicht über diese Regel.
create policy course_members_insert on course_members
  for insert to authenticated
  with check (
    app_is_teacher_of(course_id)
    or (user_id = auth.uid() and app_owns_course(course_id))
  );

-- Eine Lehrkraft entfernt jemanden; jede Person kann selbst gehen.
create policy course_members_delete on course_members
  for delete to authenticated
  using (app_is_teacher_of(course_id) or user_id = auth.uid());

-- ----------------------------------------------------------- Einladungen --

alter table course_invites enable row level security;
grant select, insert, update on course_invites to authenticated;

-- Für Lernende gibt es hier **keine** Regel. Sie sehen keine einzige Zeile,
-- auch nicht die des Kurses, in dem sie sind – sonst stünde die Liste aller
-- gültigen Codes eines Kurses jeder Person darin offen.
create policy course_invites_select on course_invites
  for select to authenticated
  using (app_is_teacher_of(course_id));

create policy course_invites_insert on course_invites
  for insert to authenticated
  with check (app_is_teacher_of(course_id) and created_by = auth.uid());

create policy course_invites_update on course_invites
  for update to authenticated
  using (app_is_teacher_of(course_id))
  with check (app_is_teacher_of(course_id));

-- ---------------------------------------------------------------- Pakete --

alter table packs enable row level security;
grant select, insert, update, delete on packs to authenticated;

create policy packs_all on packs
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

alter table pack_drafts enable row level security;
grant select, insert, update, delete on pack_drafts to authenticated;

-- Entwürfe sieht ausschließlich, wem das Paket gehört. Es gibt keinen Weg,
-- auf dem ein halbfertiger Stand bei einer Lerngruppe ankommt.
create policy pack_drafts_all on pack_drafts
  for all to authenticated
  using (app_owns_pack(pack_id))
  with check (app_owns_pack(pack_id));

alter table pack_revisions enable row level security;
grant select, insert, update on pack_revisions to authenticated;

create policy pack_revisions_select on pack_revisions
  for select to authenticated
  using (app_owns_pack(pack_id) or app_revision_is_assigned_to_me(pack_id, revision));

create policy pack_revisions_insert on pack_revisions
  for insert to authenticated
  with check (app_owns_pack(pack_id) and published_by = auth.uid());

-- Ändern heißt hier ausschließlich zurückziehen; der Trigger aus der ersten
-- Migration erzwingt, dass nur `withdrawn_at` anders wird. Die Regel
-- beschränkt zusätzlich, **wer** das darf.
create policy pack_revisions_withdraw on pack_revisions
  for update to authenticated
  using (app_owns_pack(pack_id))
  with check (app_owns_pack(pack_id));

alter table course_packs enable row level security;
grant select, insert, update, delete on course_packs to authenticated;

create policy course_packs_select on course_packs
  for select to authenticated
  using (app_is_member_of(course_id));

create policy course_packs_write on course_packs
  for all to authenticated
  using (app_is_teacher_of(course_id))
  with check (app_is_teacher_of(course_id));

-- -------------------------------------------------------------- Lernstand --

-- Ab hier die eine Bedingung. Wer diese Datei ändert, ändert die zentrale
-- Zusage des Produkts – „Lehrkräfte sehen nicht, wie viel jemand geübt hat" –
-- und sollte das wissen wollen.

alter table pack_progress enable row level security;
grant select, insert, update, delete on pack_progress to authenticated;

create policy pack_progress_own on pack_progress
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table entry_progress enable row level security;
grant select, insert, update, delete on entry_progress to authenticated;

create policy entry_progress_own on entry_progress
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table progress_events enable row level security;
grant select, insert on progress_events to authenticated;

-- Kein `update`, kein `delete`: Eine verarbeitete Ereigniskennung darf nicht
-- verschwinden, sonst ließe sich dasselbe Ereignis erneut einreichen und die
-- Idempotenz wäre eine Behauptung.
create policy progress_events_own on progress_events
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------ Funktionen --

-- Ausführbar für Angemeldete, nicht für Unangemeldete. `redeem_invite` prüft
-- zusätzlich selbst auf eine Sitzung – ein `grant` ist kein Ersatz für die
-- Prüfung in der Funktion.
revoke all on function redeem_invite(text) from public;
grant execute on function redeem_invite(text) to authenticated;

revoke all on function app_my_role() from public;
revoke all on function app_is_member_of(uuid) from public;
revoke all on function app_is_teacher_of(uuid) from public;
revoke all on function app_owns_course(uuid) from public;
revoke all on function app_owns_pack(uuid) from public;
revoke all on function app_sees_profile(uuid) from public;
revoke all on function app_revision_is_assigned_to_me(uuid, integer) from public;

grant execute on function app_my_role() to authenticated;
grant execute on function app_is_member_of(uuid) to authenticated;
grant execute on function app_is_teacher_of(uuid) to authenticated;
grant execute on function app_owns_course(uuid) to authenticated;
grant execute on function app_owns_pack(uuid) to authenticated;
grant execute on function app_sees_profile(uuid) to authenticated;
grant execute on function app_revision_is_assigned_to_me(uuid, integer) to authenticated;
