/*
  Lernendeneinstellungen: Zeitzone und Wochenziel — die zwölfte Migration.

  ## Wofür

  Serie und Ruhetage (E1, E2) brauchen eine Tagesgrenze, und eine Tagesgrenze
  braucht eine Zeitzone. Es gibt sie heute nicht (R11). Dieselbe Zeile trägt
  das freiwillige Wochenziel (E3, E26).

  Diese Migration legt **nur** ab. Sie rechnet keine Serie, zählt keine Tage
  und zeigt nichts an.

  ## Warum eine eigene Tabelle und nicht zwei Spalten auf `profiles`

  `profiles_select` erlaubt das Lesen über `app_sees_profile(id)` — also jeder
  Lehrkraft eines Kurses, in dem die Person Mitglied ist. Zugriffsregeln
  wirken **zeilenweise**: Eine neue Spalte auf `profiles` wäre für diese
  Lehrkräfte mitlesbar, ohne dass irgendwo „Lehrkraft darf Zeitzone sehen"
  stünde.

  Eine Zeitzone ist ein schwacher Ortshinweis, ein Wochenziel eine persönliche
  Absicht. Beides gehört nicht in eine Zeile, die jemand anderes lesen darf —
  und der Unterschied zwischen „niemand sieht es" und „niemand sieht es,
  solange niemand die Abfrage ändert" ist genau diese Tabelle.

  ## E27: `time_zone` ist zunächst `null`

  **Keine Voreinstellung.** `Europe/Berlin` wäre für fast alle richtig und für
  manche falsch — und man sähe den beiden Fällen nicht an, welcher vorliegt.
  `null` sagt wahrheitsgemäß „nicht bestätigt". Geschrieben wird erst, wenn
  die lernende Person einen Vorschlag ausdrücklich bestätigt; ein später
  erkanntes anderes Gerät überschreibt nichts.

  **Eine fehlende Zeile ist kein Fehler**, sondern der Normalfall: Ziel aus,
  Zeitzone unbestätigt.

  ## Was hier ausdrücklich nicht steht

  Kein Serienzähler, keine Ruhetagsliste, keine Lernzeit (E25). Serie,
  Ruhetage und Wochenaktivität folgen vollständig aus `progress_events` und
  der Zeitzone; ein gespeicherter Zähler wäre ein zweiter Ort für dieselbe
  Wahrheit — und der erste, der nach einem Nachtrag falsch steht.
*/

-- ------------------------------------------------------------- Die Tabelle

create table learner_settings (
  /*
    Auf `auth.users`, nicht auf `profiles`.

    Die Einstellungen gehören dem Konto, nicht der Darstellung. Ein Profil
    kann in einer späteren Fassung anders geschnitten sein; die Anmeldung
    nicht. `on delete cascade` nimmt die Zeile mit, wenn das Konto geht —
    dieselbe Zusage wie bei `profiles`.
  */
  user_id uuid primary key references auth.users (id) on delete cascade,

  /*
    Ein IANA-Name, oder `null`. `null` heißt **nicht bestätigt** und ist der
    Anfangszustand jeder Person (E27). Geprüft wird unten per Trigger.
  */
  time_zone text,

  /*
    Lerntage je Woche, 1 bis 7 (E26). `null` heißt **kein Ziel**, und das ist
    die Voreinstellung (E3) — ein voreingestelltes Ziel wäre eine Vorgabe,
    keine Wahl.

    Kein Minuten- und kein Aufgabenziel: Minuten scheiden mit E25 aus, und ein
    Aufgabenziel stellte eine zweite Schwelle neben die zehn aus E1.
  */
  weekly_goal_days smallint check (weekly_goal_days between 1 and 7),

  updated_at timestamptz not null default now()
);

comment on table learner_settings is
  'Was eine lernende Person über sich selbst festlegt. Liest und schreibt '
  'ausschließlich sie selbst – auch keine Lehrkraft ihrer Kurse (E27).';

comment on column learner_settings.time_zone is
  'IANA-Name, oder null = nicht bestätigt. Wird nie stillschweigend gesetzt '
  'und nie automatisch überschrieben (E27).';

comment on column learner_settings.weekly_goal_days is
  'Lerntage je Woche, 1 bis 7 (E26). null = kein Ziel, und das ist die '
  'Voreinstellung (E3).';

-- --------------------------------------------- Gültigkeit der Zeitzone

/*
  Warum ein Trigger und kein `check`.

  Naheliegend wäre `check (time_zone in (select name from pg_timezone_names))`
  — und das lehnt Postgres ab: In einer Prüfbedingung sind keine
  Unterabfragen erlaubt. Die andere Variante wäre eine abgeschriebene Liste
  gültiger Namen, und die veraltet still: Zeitzonen ändern sich, die Liste im
  Repository nicht.

  Der Trigger fragt die Datenbank selbst. `null` bleibt ausdrücklich erlaubt —
  es ist kein ungültiger Wert, sondern der Anfangszustand.
*/
create or replace function app_check_time_zone()
returns trigger
language plpgsql
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if new.time_zone is null then
    return new;
  end if;
  if not exists (select 1 from pg_timezone_names where name = new.time_zone) then
    raise exception 'Unbekannte Zeitzone: %', new.time_zone using errcode = '22023';
  end if;
  return new;
end;
$$;

comment on function app_check_time_zone() is
  'Lässt nur gültige IANA-Namen zu – und null, denn das heißt „nicht '
  'bestätigt". Als Trigger, weil eine Prüfbedingung keine Unterabfrage darf.';

create trigger learner_settings_time_zone
  before insert or update of time_zone on learner_settings
  for each row execute function app_check_time_zone();

/*
  `updated_at` wird gesetzt, nicht übergeben. Ein Zeitstempel, den der Client
  mitschickt, ist eine Angabe über eine Uhr, die niemand überprüfen kann —
  dieselbe Begründung wie bei `recorded_at` (E28).
*/
create or replace function app_touch_learner_settings()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger learner_settings_touch
  before insert or update on learner_settings
  for each row execute function app_touch_learner_settings();

-- ---------------------------------------------------------- Die Regeln

alter table learner_settings enable row level security;

/*
  Zuerst alles weg, dann genau das Nötige.

  Im Stagingprojekt waren Vorgaberechte wirksam, die jeder neuen Tabelle volle
  Rechte für `anon`, `authenticated` und `service_role` gaben – im Moment
  ihrer Entstehung, bevor hier ein `grant` steht (siehe Migration 10). `grant`
  kann davon nichts wegnehmen; nur `revoke`.

  Ohne diese Zeilen hinge die Dichtheit dieser Tabelle davon ab, wie das
  Projekt erstellt wurde.
*/
revoke all on learner_settings from anon, authenticated, service_role;

/*
  Kein `delete`: Eine Zeile zu löschen hieße „nicht bestätigt" zu behaupten,
  wo einmal bestätigt wurde. Wer seine Zeitzone loswerden will, setzt sie auf
  `null`; wer sein Konto loswerden will, nimmt die Zeile über `on delete
  cascade` mit.
*/
grant select, insert, update on learner_settings to authenticated;

/*
  **Eine** Bedingung, und sie steht in `using` und `with check`.

  `using` sagt, welche Zeile man anfassen darf; `with check`, wie sie danach
  aussehen darf – ohne sie könnte man die eigene Zeile ändern und sie dabei
  jemand anderem zuschreiben.

  Hier ist das `with check` allerdings **redundant**, und das soll dastehen,
  statt als zweiter Riegel zu gelten: Bei einer Regel `for all` ohne eigenes
  `with check` benutzt PostgreSQL den `using`-Ausdruck für beides. Die
  Gegenprobe zeigt es – `with check` wegzulassen ändert nichts, es durch
  `true` zu ersetzen macht die Prüfung rot. Ausgeschrieben steht es
  trotzdem: Wer die Regel später auf `for select` und `for update` aufteilt,
  erbt die Vorgabe nicht mehr.

  Keine Ausnahme für Lehrkräfte, keine für die Verwaltung, keine für
  `service_role`. Eine Lehrkraft, die diese Tabelle abfragt, bekommt ihre
  eigene Zeile und sonst nichts – auch dann, wenn sie den Schlüssel, den
  Tabellennamen und die Kennung kennt.
*/
create policy learner_settings_own on learner_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------- Der eigene Lernstand über alle Kurse

/*
  Warum es diese Funktion gibt.

  „Heute" braucht fällige Wiederholungen und zuletzt benutzte Pakete über
  **alle** Kurse. Die heutigen Schnittstellen fragen je Kurs und Paket
  einzeln; eine Seite, die das nachbaut, führt eine Kaskade von Abfragen aus,
  deren Zahl mit den Kursen wächst – und zwar bei jedem Öffnen.

  Eine Abfrage statt vieler, und zwar serverseitig zusammengefasst. Die
  Zugriffsregeln bleiben dabei unberührt: Die Funktion ist **nicht**
  `security definer`, sie läuft mit den Rechten der aufrufenden Person. Was
  sie sieht, sieht diese Person ohnehin – `entry_progress` und `pack_progress`
  tragen seit Migration 11 die Mitgliedschaftsprüfung.

  ## Diese Funktion nimmt überhaupt nichts entgegen

  **Keine Personenkennung.** `auth.uid()` steht in der Abfrage; eine Kennung
  von außen entgegenzunehmen wäre genau die Hintertür, die ADR-1 ausschließt.

  **Und kein Zeitpunkt.** Bis zum 02.10.2026 stand hier ein
  `p_now timestamptz default now()` – gedacht als Erleichterung für Tests.
  Das war ein Fehler, und zwar ein folgenreicher: Der Parameter wäre über
  RPC, Gateway und Repository bis in den Produktivaufruf durchgereicht
  worden, und dort hätte irgendwann eine Geräteuhr daringestanden. Genau das
  schließt E28 aus. Ein Prüfstand, der eine Uhr braucht, macht die Testdaten
  relativ zu `now()` – er verändert nicht den Vertrag, an dem später das
  Produkt hängt.

  Die Fälligkeit vergleicht deshalb gegen `now()`, also gegen die **Uhr der
  Datenbank**. Die ist dieselbe Uhr, die `progress_events.recorded_at`
  stempelt.

  ## Offen gesagt: `where user_id = auth.uid()` ist hier redundant

  Nachgemessen, nicht angenommen. Die Gegenprobe hat den Filter entfernt –
  und es kam trotzdem nur der eigene Lernstand heraus, weil
  `entry_progress_own` und `pack_progress_own` schon zeilenweise filtern.
  Rot wird die Prüfung erst, wenn der Filter **und** die Rechte der
  aufrufenden Person wegfallen (`security definer`).

  Der Filter bleibt trotzdem stehen, und zwar aus zwei Gründen: Er sagt an
  der Stelle, an der gruppiert wird, worüber gruppiert wird – und er hält,
  falls jemand diese Funktion eines Tages doch auf `security definer`
  umstellt. Was er nicht ist: der Riegel. Der Riegel sind die Zugriffsregeln.
*/
create or replace function my_due_overview()
returns table (
  course_id uuid,
  pack_id text,
  due_count integer,
  entry_count integer,
  last_practiced_at timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    coalesce(e.course_id, p.course_id) as course_id,
    coalesce(e.pack_id, p.pack_id)     as pack_id,
    coalesce(e.due_count, 0)           as due_count,
    coalesce(e.entry_count, 0)         as entry_count,
    p.last_practiced_at
  from (
    select
      course_id,
      pack_id,
      count(*) filter (where due_at <= now())::integer as due_count,
      count(*)::integer                                as entry_count
    from entry_progress
    where user_id = auth.uid()
    group by course_id, pack_id
  ) e
  full join (
    select course_id, pack_id, last_practiced_at
    from pack_progress
    where user_id = auth.uid()
  ) p on p.course_id = e.course_id and p.pack_id = e.pack_id;
$$;

comment on function my_due_overview() is
  'Fällige und bearbeitete Vokabeln je Kurs und Paket – nur die eigenen. '
  'Eine Abfrage statt einer Kaskade; keine Parameter, weder für eine fremde '
  'Person noch für einen Zeitpunkt.';

revoke all on function my_due_overview() from public;
revoke all on function my_due_overview() from anon;
grant execute on function my_due_overview() to authenticated;

/*
  Die beiden Triggerfunktionen bekommen ausdrücklich kein Ausführungsrecht.

  Seit Migration 10 ist das ohnehin die Vorgabe — eine neue Funktion ist von
  sich aus für niemanden ausführbar. Die Zeilen stehen trotzdem hier: Sie
  machen aus einer Eigenschaft der Umgebung eine Aussage dieser Migration,
  und sie bleiben richtig, falls jemand die Vorgabe später wieder umdreht.

  Die Trigger feuern weiter. Postgres prüft `execute` beim **Anlegen** des
  Triggers, nicht bei jedem Auslösen — nachgesehen, nicht angenommen, und
  unten geprüft.
*/
revoke all on function app_check_time_zone() from public, anon, authenticated, service_role;
revoke all on function app_touch_learner_settings() from public, anon, authenticated, service_role;

/*
  Und `service_role` bekommt `my_due_overview` nicht. Sie wäre dort auch
  nutzlos — `auth.uid()` ist unter dem Secret Key leer, die Funktion gäbe
  nichts zurück. Nutzlos und nicht vergeben sind aber zwei verschiedene
  Dinge, und nur das zweite bleibt richtig, wenn die Funktion sich ändert.
*/
revoke all on function my_due_overview() from service_role;
