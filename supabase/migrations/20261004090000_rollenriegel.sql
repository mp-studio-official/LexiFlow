-- Migration 14 – der Rollenriegel bei der Selbstanlage.
--
-- ## Der Befund
--
-- `profiles_insert_self` (Migration 3) schränkte nur `id = auth.uid()` ein.
-- Die Spalte `role` war weder in der Regel noch in der Rechtevergabe erwähnt:
-- `grant select, insert on profiles to authenticated` galt für die ganze
-- Tabelle. Ein Konto konnte sich sein eigenes Profil also als `teacher` oder
-- `admin` anlegen. Erst das spätere **Ändern** der Rolle scheiterte, und zwar
-- am Spaltenrecht auf `update` – also an der zweiten Tür, nicht an der ersten.
--
-- ## Warum additiv und nicht als Korrektur in Migration 3
--
-- Migration 3 liegt im Staging. Eine angewandte Migration wird nicht
-- geändert; `db push` vergleicht Fassungen, nicht Inhalte, und eine stille
-- Abweichung zwischen lokal und entfernt ist schlimmer als der Befund.
--
-- ## Warum nicht „es reicht, die Registrierung auszuschalten"
--
-- Ausnutzbar ist der Befund nur, wenn jemand überhaupt ein Konto anlegen
-- kann. Die offene Registrierung per E-Mail **muss** im Staging aus sein –
-- das steht in `docs/pilot-0.1-readiness.md` und in der Inbetriebnahme. Aber
-- eine Zugriffsregel, die nur hält, weil nebenan ein Schalter richtig steht,
-- ist keine. Der Schalter wird irgendwann umgelegt, und dabei liest niemand
-- diese Datei.
--
-- ## Drei Riegel, nicht einer
--
-- 1. **Rechtevergabe**: `insert` gilt nur noch für drei Spalten. Wer `role`
--    überhaupt nennt, bekommt „permission denied" – bevor eine Regel befragt
--    wird.
-- 2. **Zugriffsregel**: Selbst angelegt wird ausschließlich `student`. Das
--    fängt den Fall ab, dass die Rechtevergabe später wieder geweitet wird.
-- 3. **Auslöser auf `update`**: Die eigene Rolle lässt sich nicht ändern,
--    auch nicht, wenn eines Tages `grant update (role)` dazukäme.
--
-- Drei, weil jeder einzelne von ihnen durch eine spätere, gut gemeinte Zeile
-- an anderer Stelle aufgehen kann.
--
-- ## Was dieser Riegel ausdrücklich nicht zumacht
--
-- `create_learner_account` ist `security definer` und läuft als Besitzer –
-- der Weg über den Einladungscode bleibt unberührt. Das Anlegen einer
-- Lehrkraft von Hand (Inbetriebnahme §6.2) läuft ebenfalls als Besitzer und
-- bleibt möglich. Was zumacht, ist allein der Weg, den der Browser geht.

-- ------------------------------------------------------------ 1. Rechte --

revoke insert on profiles from authenticated;

/*
  `created_at` fehlt mit Absicht: Es hat eine Vorgabe, und ein Zeitpunkt, den
  der Browser bestimmt, ist kein Zeitpunkt (E28). `role` fehlt mit derselben
  Absicht – die Vorgabe ist `student`.
*/
grant insert (id, display_name, short_code) on profiles to authenticated;

-- ------------------------------------------------------------- 2. Regel --

drop policy profiles_insert_self on profiles;

create policy profiles_insert_self on profiles
  for insert to authenticated
  with check (id = auth.uid() and role = 'student');

comment on policy profiles_insert_self on profiles is
  'Selbstanlage: nur das eigene Profil und nur als Lernende. Lehrkraft und '
  'Verwaltung entstehen auf dem sicheren Weg, nie im Browser.';

-- ----------------------------------------------------------- 3. Auslöser --

/*
  Ausdrücklich **ohne** `security definer`. In einer Funktion mit
  Besitzerrechten ist `current_user` der Besitzer – der Vergleich unten träfe
  nie zu, und der Riegel wäre eine Zeile, die aussieht, als täte sie etwas.
  (Genau das war der erste Entwurf; die Prüfung „bliebe auch dann verriegelt"
  hat es gezeigt.) Rechte braucht diese Funktion keine: Sie liest `old`,
  `new` und eine Sitzungseinstellung.
*/
create or replace function app_block_self_role_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  angemeldet uuid;
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  /*
    `auth.uid()` wird hier **nicht** aufgerufen, und das ist kein Geschmack:
    Sie wirft, wenn `request.jwt.claims` leer ist – und genau so spricht der
    Besitzer, unter dem die Migrationen und die Handarbeit aus §6.2 laufen.
    Ein Auslöser, der dort wirft, machte aus dem Riegel eine Sackgasse: Es
    gäbe überhaupt keinen Weg mehr, eine Lehrkraft anzulegen.

    (Gefunden, weil die Prüfung „hindert die Einrichtung nicht daran" rot
    wurde. Sie steht deshalb in `scripts/db/rollenriegel.test.mjs`.)
  */
  if current_user <> 'authenticated' then
    return new;
  end if;

  angemeldet := nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid;

  -- Nur die **eigene** Zeile. Eine Verwaltung, die eine fremde Rolle setzt,
  -- geht den vorgesehenen Weg und wird hier nicht behindert.
  if angemeldet is not null and angemeldet = old.id then
    raise exception 'Die eigene Rolle kann nicht geändert werden.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_block_self_role_change
  before update on profiles
  for each row
  execute function app_block_self_role_change();

comment on function app_block_self_role_change() is
  'Riegel 3 von 3 gegen die Selbsterhebung: greift auch dann, wenn das '
  'Spaltenrecht auf `role` eines Tages wieder vergeben wird.';
