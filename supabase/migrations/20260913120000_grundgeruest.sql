-- ===========================================================================
-- LexiFlow – Sprint 5A, Phase 2: das Grundgerüst
-- ===========================================================================
--
-- Was hier steht, ist die Form der Daten. Wer sie sehen darf, steht in
-- `20260913120200_zugriffsregeln.sql` – und das ist kein Anhang, sondern die
-- eigentliche Sicherheitsarchitektur: Der Publishable Key im Browser ist kein
-- Geheimnis (ADR-3), also trägt RLS die ganze Last.
--
-- ## Zwei Grundsätze, die sich durch alles ziehen
--
-- 1. **Es gibt keine Spalte für den Lernstand einer anderen Person.** Nicht
--    verborgen, nicht gesperrt – nicht vorhanden. Eine Lehrkraft kann in
--    diesem Schema nicht erfahren, wie oft jemand geübt hat, weil die Frage
--    keine Tabelle hat, die sie beantwortet.
--
-- 2. **Veröffentlichtes ist unveränderlich.** Eine Revision, die eine
--    Lerngruppe bekommen hat, bleibt, was sie war (ADR-4). Dafür sorgt ein
--    Trigger und nicht nur eine fehlende Berechtigung: Der Trigger gilt auch
--    für die Eigentümerin und für Wartungszugriffe.
--
-- ## Das Paket liegt als JSONB, nicht in Spalten
--
-- Die Zod-Schemata in `src/domain/schema.ts` sind die Wahrheit über das
-- Paketformat, mit eigener Versionskette und eigenen Migrationen. Dasselbe
-- noch einmal in Tabellenspalten zu zerlegen hieße, zwei Wahrheiten zu
-- pflegen – und die SQL-Kopie veraltete als Erste. Was gefiltert wird (Titel,
-- Jahrgang), steht zusätzlich in Spalten; alles andere im JSONB.

-- ---------------------------------------------------------------- Rollen --

-- Drei Rollen, so aufgezählt wie in `src/application/repositories.ts`. Ein
-- Aufzählungstyp und kein `text`: Ein Tippfehler soll beim Schreiben
-- auffallen und nicht beim Lesen einer Zugriffsregel, die stillschweigend
-- nichts trifft.
create type app_role as enum ('admin', 'teacher', 'student');

-- --------------------------------------------------------------- Profile --

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- Bei Lernenden ein selbst gewähltes Pseudonym. Kein Klarname verlangt,
  -- keiner erzwungen – wer „Fuchs" heißen will, heißt Fuchs.
  display_name text not null check (char_length(display_name) between 1 and 60),

  -- Die kurze neutrale Kennung neben dem Namen. Zwei Lernende dürfen sich
  -- gleich nennen; ohne ein zweites Merkmal wäre beim Entfernen aus einem
  -- Kurs nicht entscheidbar, wer gemeint ist. Sie beschreibt niemanden: kein
  -- Namensbestandteil, kein Geburtsjahr.
  short_code text not null unique check (short_code ~ '^LX-[0-9A-Z]{4}$'),

  role app_role not null default 'student',
  created_at timestamptz not null default now()
);

comment on table profiles is
  'Ein Profil je Konto. Enthält bewusst keine E-Mail-Adresse: Für Lehrkräfte '
  'führt Supabase Auth sie, für Lernende gibt es keine (ADR-5).';

-- ----------------------------------------------------------------- Kurse --

create table courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 1000),

  -- Freitext, etwa „2026/27". Kein Datum: Ein Schuljahr ist keine Zeitspanne,
  -- mit der gerechnet würde, sondern eine Beschriftung.
  school_year text check (char_length(school_year) <= 20),

  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index courses_owner_idx on courses (owner_id);

create table course_members (
  course_id uuid not null references courses (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role app_role not null,
  joined_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

create index course_members_user_idx on course_members (user_id);

comment on table course_members is
  'Wer in welchem Kurs ist. Hier steht keine Zahl über das Lernen – nicht '
  'einmal ein Zeitpunkt des letzten Übens.';

-- ----------------------------------------------------------- Einladungen --

create table course_invites (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,

  -- Der Code selbst steht nirgends. Gespeichert ist sein SHA-256; die
  -- Einlösung vergleicht Hash gegen Hash (siehe `redeem_invite`). Wer die
  -- Datenbank liest, kann damit keinem Kurs beitreten.
  code_hash text not null unique,

  -- Die drei ersten Zeichen des Codes, damit eine Lehrkraft ihre eigenen
  -- Einladungen auseinanderhalten kann, ohne den Code aufzubewahren.
  label text not null check (char_length(label) between 1 and 8),

  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  revoked boolean not null default false,
  created_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index course_invites_course_idx on course_invites (course_id);

-- ---------------------------------------------------------------- Pakete --

create table packs (
  /*
    Text und nicht `uuid`, und das ist eine fachliche Entscheidung:

    Die Paketkennung kommt vom Client. Sie steht seit Sprint 1 in jeder
    Paketdatei, in jeder Lerndatei und in jedem lokalen Lernstand – und sie
    muss **unverändert** übernommen werden, sonst wäre „ein Paket ins Konto
    übernehmen" beim zweiten Mal ein zweites Paket (ADR-4).

    `newId()` liefert in heutigen Browsern eine UUID, hat aber einen Rückfall
    für Umgebungen ohne sicheren Kontext. Eine `uuid`-Spalte lehnte eine so
    entstandene Kennung ab – und zwar erst beim Übernehmen, Jahre später, bei
    genau der Person mit dem alten Browser.
  */
  id text primary key check (char_length(id) between 1 and 100),
  owner_id uuid not null references profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  grade text not null check (char_length(grade) between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index packs_owner_idx on packs (owner_id);

comment on table packs is
  'Die Identität eines Pakets. Sie überlebt jede Bearbeitung und jede '
  'Veröffentlichung – ein Kurs verweist auf eine Revision, nie auf einen '
  'Entwurf (ADR-4).';

create table pack_drafts (
  pack_id text primary key references packs (id) on delete cascade,
  format_version integer not null check (format_version > 0),
  pack jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table pack_drafts is
  'Der Arbeitsstand. Kein halbfertiger Entwurf ist je für Lernende sichtbar – '
  'dafür gibt es hier keine Zugriffsregel, nicht nur keinen Knopf.';

create table pack_revisions (
  pack_id text not null references packs (id) on delete cascade,
  revision integer not null check (revision > 0),
  format_version integer not null check (format_version > 0),
  pack jsonb not null,
  published_by uuid not null references profiles (id) on delete restrict,
  published_at timestamptz not null default now(),

  -- Zurückziehen löscht nicht. Eine Lerngruppe, die mit dieser Revision übt,
  -- soll nicht mitten im Halbjahr vor einer leeren Seite stehen; und eine
  -- gelöschte Revision machte jeden Verweis darauf zur Lüge.
  withdrawn_at timestamptz,

  primary key (pack_id, revision)
);

create table course_packs (
  course_id uuid not null references courses (id) on delete cascade,
  pack_id text not null references packs (id) on delete cascade,
  revision integer not null,

  -- „position" wäre in SQL ein Funktionsname und müsste überall in
  -- Anführungszeichen stehen.
  sort_order integer not null default 0,

  assigned_at timestamptz not null default now(),
  primary key (course_id, pack_id),
  foreign key (pack_id, revision) references pack_revisions (pack_id, revision)
);

-- -------------------------------------------------------------- Lernstand --

-- ACHTUNG beim Weiterbauen: In den folgenden drei Tabellen ist `user_id`
-- immer die aufrufende Person. Es gibt keine Ansicht, keine Funktion und
-- keine Zugriffsregel, die daraus etwas anderes macht. Wer hier eine
-- „Klassenübersicht" ergänzen möchte, ändert damit die Zusage des Produkts
-- und nicht nur eine Tabelle.

create table pack_progress (
  user_id uuid not null references profiles (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  pack_id text not null references packs (id) on delete cascade,
  session_count integer not null default 0 check (session_count >= 0),
  answered_count integer not null default 0 check (answered_count >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  last_practiced_at timestamptz,
  primary key (user_id, course_id, pack_id)
);

create table entry_progress (
  user_id uuid not null references profiles (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  pack_id text not null references packs (id) on delete cascade,

  -- Die Vokabelkennung aus dem Paket-JSON, kein Fremdschlüssel: Vokabeln sind
  -- keine Zeilen in dieser Datenbank (siehe oben, JSONB).
  entry_id text not null check (char_length(entry_id) between 1 and 100),

  direction text not null check (direction in ('en-de', 'de-en')),
  box smallint not null default 1 check (box between 1 and 5),
  correct_count integer not null default 0 check (correct_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  streak integer not null default 0 check (streak >= 0),
  last_answered_at timestamptz,
  due_at timestamptz not null,

  -- Die Fassung dieses Lernstands. Sie zählt bei jeder übernommenen Änderung
  -- um eins hoch und ist der Schiedsrichter zwischen zwei Geräten: Wer
  -- schreibt, nennt die Fassung, von der er ausging.
  rev integer not null default 0 check (rev >= 0),

  -- Welches Ereignis diese Fassung erzeugt hat. Damit ist eine Wiederholung
  -- desselben Schreibvorgangs von einem echten Konflikt unterscheidbar –
  -- ohne sie würde ein erneut gesendetes Ereignis entweder doppelt angewandt
  -- oder als Konflikt gemeldet, obwohl es längst drinsteht.
  last_event_id uuid,

  primary key (user_id, course_id, pack_id, entry_id, direction)
);

comment on column entry_progress.direction is
  'Lernstände werden je Abfragerichtung getrennt geführt – genauso wie lokal '
  'in IndexedDB seit Sprint 1.';

comment on column entry_progress.rev is
  'Fassungszähler. Entschieden wird nach ihr und nach nichts sonst – nicht '
  'nach der Fachnummer (ein Rückfall von Fach 5 auf Fach 1 ist ein richtiges '
  'Ergebnis) und nicht nach einem Zeitstempel vom Gerät (Geräteuhren sind '
  'nicht überprüfbar).';

create table progress_events (
  -- Die vom Client vergebene Kennung. Sie ist der ganze Trick an der
  -- Idempotenz: Eine Antwort, die unterwegs verlorengeht, darf gefahrlos
  -- erneut gesendet werden. Ohne sie zählte ein Wackler im WLAN eine Vokabel
  -- zweimal.
  event_id uuid primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  recorded_at timestamptz not null default now()
);

create index progress_events_user_idx on progress_events (user_id);

-- ------------------------------------------- Unveränderlichkeit erzwingen --

create or replace function app_revisions_are_frozen()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Eine veröffentlichte Revision wird nicht gelöscht (% / %). Zum Zurückziehen: withdrawn_at setzen.',
      old.pack_id, old.revision;
  end if;

  -- Genau ein Feld darf sich ändern. Alles andere ist der Inhalt, den eine
  -- Lerngruppe bereits bekommen hat.
  if new.pack_id is distinct from old.pack_id
     or new.revision is distinct from old.revision
     or new.format_version is distinct from old.format_version
     or new.pack is distinct from old.pack
     or new.published_by is distinct from old.published_by
     or new.published_at is distinct from old.published_at then
    raise exception 'Eine veröffentlichte Revision ist unveränderlich (% / %). Änderbar ist nur withdrawn_at.',
      old.pack_id, old.revision;
  end if;

  return new;
end;
$$;

/*
  Ein archivierter Kurs ist **abgeschlossen, nicht geschlossen** (ADR-12).

  Er bleibt für seine Mitglieder sichtbar, es wird darin weiter geübt, und der
  Lernstand wird weiter gespeichert. Was endet, ist die organisatorische
  Arbeit daran: keine neuen Mitglieder (`redeem_invite`), keine neuen
  Zuweisungen (`assign_pack_to_course`) – und keine gewöhnlichen Änderungen am
  Kurs selbst. Das steht hier.

  Änderbar bleibt genau ein Feld: `archived`. Ein archivierter Kurs lässt sich
  wieder öffnen, und danach ist alles wieder erlaubt. Andersherum wäre das
  Archivieren eine Einbahnstraße, und niemand träute sich, den Knopf zu
  drücken.

  **Warum ein Trigger und keine Regel.** Eine Zugriffsregel sieht in `using`
  die alte und in `with check` die neue Zeile, aber nie beide zugleich. „Nur
  dieses eine Feld darf sich geändert haben" lässt sich damit nicht sagen.
*/
create or replace function app_archived_courses_are_closed()
returns trigger
language plpgsql
as $$
begin
  if not old.archived then return new; end if;

  if new.owner_id is distinct from old.owner_id
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.school_year is distinct from old.school_year then
    raise exception 'Dieser Kurs ist archiviert (%). Zum Ändern zuerst wieder öffnen.', old.id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger courses_archived_closed
  before update on courses
  for each row execute function app_archived_courses_are_closed();

create trigger pack_revisions_frozen
before update or delete on pack_revisions
for each row execute function app_revisions_are_frozen();
