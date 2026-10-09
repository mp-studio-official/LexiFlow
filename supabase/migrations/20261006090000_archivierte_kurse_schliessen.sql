/*
  Archivierte Kurse auch für die anonyme Kontoanlage schließen.

  `redeem_invite` prüft den Kurs nach dem Verbrauch des Codes. Die Edge
  Function für ein neues Lernkonto ruft dagegen bewusst die schmalere
  Dienstfunktion `consume_invite_by_hash` auf, bevor sie ein Auth-Konto
  anlegt. Ohne die Kursbedingung hier konnte dieser Weg noch eine
  Mitgliedschaft in einem archivierten Kurs erzeugen.

  Prüfung und Hochzählen bleiben eine einzige Anweisung: So kann weder ein
  abgelaufener/voller Code noch ein gleichzeitig archivierter Kurs einen
  Platz verbrauchen.
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
     and exists (
       select 1
         from courses
        where courses.id = course_invites.course_id
          and not courses.archived
     )
     and not revoked
     and (expires_at is null or expires_at > now())
     and (max_uses is null or used_count < max_uses)
  returning course_id into v_course;

  return v_course;
end;
$$;

revoke all on function consume_invite_by_hash(text) from public;
revoke all on function consume_invite_by_hash(text) from anon;
revoke all on function consume_invite_by_hash(text) from authenticated;
grant execute on function consume_invite_by_hash(text) to service_role;
