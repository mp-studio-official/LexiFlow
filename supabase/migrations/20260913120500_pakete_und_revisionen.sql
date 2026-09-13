-- ===========================================================================
-- LexiFlow – Sprint 5A, Phase 5: Pakete, Revisionen, Zuweisung
-- ===========================================================================
--
-- Die Tabellen dazu stehen seit Phase 2. Was hier hinzukommt, sind die
-- Abläufe – und wie schon bei den Einladungen liegen sie in der Datenbank,
-- weil sie sonst nicht richtig zu bekommen wären:
--
-- **Ein Paket und sein Entwurf gehören zusammen.** Getrennt geschrieben
-- entstünde bei einem Fehlschlag ein Paket ohne Inhalt – in der Liste
-- sichtbar, beim Öffnen leer.
--
-- **Eine Revisionsnummer darf es nur einmal geben.** Der Primärschlüssel
-- `(pack_id, revision)` macht aus zwei gleichzeitigen Veröffentlichungen
-- einen Fehler statt zweier Fassungen mit derselben Nummer. Das ist die
-- richtige Reihenfolge: erst unmöglich machen, dann abfangen.
--
-- **Zurückziehen heißt: aus den Kursen verschwinden.** Die Revision bleibt
-- lesbar (ADR-4), aber sie wird aus `course_packs` entfernt. Eine Lerngruppe,
-- die mit ihr übt, soll sie nicht weiter angeboten bekommen – und ein
-- „zurückgezogen“, das nichts bewirkt, wäre eine Beschriftung ohne Wirkung.

-- ------------------------------------------------------- Entwurf sichern --

/*
  Paket und Entwurf in einem Schritt.

  Das `where` im `on conflict` ist der Eigentumsnachweis: Trifft es nicht,
  kommt keine Zeile zurück, und die Funktion bricht ab. Ohne das könnte jede
  Lehrkraft mit geratener Kennung ein fremdes Paket überschreiben – die
  Zugriffsregel auf `packs` greift hier nicht, weil `security definer` an ihr
  vorbeiläuft.
*/
create or replace function save_pack_draft(
  p_pack_id text,
  p_title text,
  p_grade text,
  p_format_version integer,
  p_pack jsonb
)
returns packs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pack packs;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;
  if coalesce(app_my_role()::text, '') not in ('teacher', 'admin') then
    raise exception 'Material legen Lehrkräfte an.' using errcode = '42501';
  end if;

  if p_pack_id is null or char_length(p_pack_id) < 1 then
    -- Die Kennung kommt vom Client und bleibt, wie sie ist; siehe die
    -- Begründung an der Spalte selbst.
    raise exception 'Ein Paket braucht eine Kennung.' using errcode = '22023';
  end if;

  insert into packs (id, owner_id, title, grade)
  values (p_pack_id, auth.uid(), p_title, p_grade)
  on conflict (id) do update
    set title = excluded.title,
        grade = excluded.grade,
        updated_at = now()
    where packs.owner_id = auth.uid()
  returning * into v_pack;

  if v_pack.id is null then
    raise exception 'Dieses Paket gehört jemand anderem.' using errcode = '42501';
  end if;

  insert into pack_drafts (pack_id, format_version, pack)
  values (v_pack.id, p_format_version, p_pack)
  on conflict (pack_id) do update
    set format_version = excluded.format_version,
        pack = excluded.pack,
        updated_at = now();

  return v_pack;
end;
$$;

-- --------------------------------------------------------- Veröffentlichen --

/*
  Den Entwurf als Revision einfrieren.

  Die Nummer entsteht in **einer** Anweisung. Zwei gleichzeitige
  Veröffentlichungen könnten trotzdem dieselbe lesen – und genau dann greift
  der Primärschlüssel und lässt die zweite scheitern. Das ist gewollt: Lieber
  ein Fehler, den man wiederholt, als zwei Revisionen mit der Nummer 3.
*/
create or replace function publish_pack(p_pack text)
returns pack_revisions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revision pack_revisions;
begin
  if not app_owns_pack(p_pack) then
    raise exception 'Dieses Paket gehört jemand anderem.' using errcode = '42501';
  end if;
  if not exists (select 1 from pack_drafts where pack_id = p_pack) then
    raise exception 'Kein Entwurf zu diesem Paket.' using errcode = '22023';
  end if;

  insert into pack_revisions (pack_id, revision, format_version, pack, published_by)
  select
    d.pack_id,
    coalesce((select max(r.revision) from pack_revisions r where r.pack_id = p_pack), 0) + 1,
    d.format_version,
    d.pack,
    auth.uid()
  from pack_drafts d
  where d.pack_id = p_pack
  returning * into v_revision;

  return v_revision;
end;
$$;

/*
  Zurückziehen.

  Zwei Wirkungen, und die zweite ist die, auf die es ankommt: Die Revision
  bekommt einen Zeitpunkt (sie bleibt lesbar, ADR-4), und sie verschwindet aus
  allen Kursen. Ohne das Zweite wäre „zurückgezogen“ eine Beschriftung, die
  nichts tut.
*/
create or replace function withdraw_pack_revision(p_pack text, p_revision integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app_owns_pack(p_pack) then
    raise exception 'Dieses Paket gehört jemand anderem.' using errcode = '42501';
  end if;

  update pack_revisions
     set withdrawn_at = now()
   where pack_id = p_pack and revision = p_revision and withdrawn_at is null;

  delete from course_packs where pack_id = p_pack and revision = p_revision;
end;
$$;

-- ------------------------------------------------------------- Zuweisen ----

/*
  Eine Revision einem Kurs zuweisen.

  Drei Bedingungen, und jede hat einen Grund:

  1. **Lehrkraft dieses Kurses.** Sonst könnte jede Person Material in fremde
     Kurse legen.
  2. **Kein archivierter Kurs.** Archivieren heißt „vorbei“; neues Material
     gehört in den nächsten Kurs.
  3. **Nur eigene oder bereits zugewiesene Revisionen.** `security definer`
     läuft an der Zugriffsregel auf `pack_revisions` vorbei – ohne diese
     Bedingung ließe sich mit einer geratenen Kennung fremdes Material
     verteilen.
*/
create or replace function assign_pack_to_course(
  p_course uuid,
  p_pack text,
  p_revision integer,
  p_sort_order integer default 0
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app_is_teacher_of(p_course) then
    raise exception 'Nur Lehrkräfte dieses Kurses.' using errcode = '42501';
  end if;
  if exists (select 1 from courses where id = p_course and archived) then
    raise exception 'Ein archivierter Kurs bekommt kein neues Material.' using errcode = '22023';
  end if;
  if not (app_owns_pack(p_pack) or app_revision_is_assigned_to_me(p_pack, p_revision)) then
    raise exception 'Diese Fassung gibt es nicht.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from pack_revisions
    where pack_id = p_pack and revision = p_revision and withdrawn_at is null
  ) then
    raise exception 'Diese Fassung gibt es nicht.' using errcode = '22023';
  end if;

  insert into course_packs (course_id, pack_id, revision, sort_order)
  values (p_course, p_pack, p_revision, p_sort_order)
  on conflict (course_id, pack_id) do update
    set revision = excluded.revision,
        sort_order = excluded.sort_order,
        assigned_at = now();
end;
$$;

-- ------------------------------------------------------- Zugriffsrechte ----

revoke all on function save_pack_draft(text, text, text, integer, jsonb) from public;
revoke all on function publish_pack(text) from public;
revoke all on function withdraw_pack_revision(text, integer) from public;
revoke all on function assign_pack_to_course(uuid, text, integer, integer) from public;

grant execute on function save_pack_draft(text, text, text, integer, jsonb) to authenticated;
grant execute on function publish_pack(text) to authenticated;
grant execute on function withdraw_pack_revision(text, integer) to authenticated;
grant execute on function assign_pack_to_course(uuid, text, integer, integer) to authenticated;
