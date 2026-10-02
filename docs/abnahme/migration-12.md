# Migration 12 anwenden — `learner_settings` und `my_due_overview`

Stand 02.10.2026. Die Migration ist lokal geprüft und **noch nicht
angewandt**. Diese Anleitung ist der Weg dorthin.

Zwei Werkzeuge, bewusst getrennt:

- **Die CLI** für Historie und Anwendung — `migration list`, `db push`.
- **Der SQL Editor** für die Abnahme — `docs/abnahme/migration-12.sql`.

## Warum die Abnahme nicht über die CLI läuft

Die installierte Fassung kennt **kein** `db execute`. Nachgesehen, nicht
angenommen: `db --help` nennt als Unterbefehle `diff`, `dump`, `push`,
`pull`, `reset`, `lint`, `start`, `query`, `advisors`, `schema`. Es gäbe
`db query`, aber dafür müsste die Verbindung stehen und das Ergebnis käme
als Textblock; der SQL Editor zeigt dieselben Abfragen als Tabelle, und
vergleichen lässt sich das besser.

## Warum jedes Kommando mit `npx` beginnt

Auf dem Arbeitsrechner ist die CLI **nicht global installiert**. Eine Zeile,
die mit `supabase db push` beginnt, scheitert dort mit `command not found` —
und das sieht aus wie ein Umgebungsproblem, nicht wie ein Fehler in dieser
Anleitung. `src/application/keineTestuhr.test.ts` hält das für alle Dateien
unter `docs/abnahme/` fest.

## Der Ablauf

```bash
# ── 0 · im Projektordner ────────────────────────────────────────────────
cd "/Users/mparat/MP Studio/Development/LexiFlow"

# ── 1 · Stand der Historie ──────────────────────────────────────────────
# Erwartet: elf Versionen beidseitig, 20261002090000 nur unter Local.
npx --yes supabase@latest migration list --linked

# ── 2 · Abnahme „vorher" ────────────────────────────────────────────────
# Jetzt Abschnitt A aus docs/abnahme/migration-12.sql im SQL Editor
# ausführen und die Ergebnisse festhalten. Erst danach weiter.

# ── 3 · Trockenlauf ─────────────────────────────────────────────────────
# Zeigt, was gesendet würde. Erwartet: genau eine Migration,
# 20261002090000_lernendeneinstellungen.sql.
npx --yes supabase@latest db push --linked --dry-run

# ── 4 · Anwenden ────────────────────────────────────────────────────────
npx --yes supabase@latest db push --linked

# ── 5 · Historie erneut ─────────────────────────────────────────────────
# Erwartet: **zwölf** Versionen, Local und Remote identisch.
npx --yes supabase@latest migration list --linked

# ── 6 · Abnahme „nachher" ───────────────────────────────────────────────
# Abschnitt B aus docs/abnahme/migration-12.sql im SQL Editor.
```

## Was „bestanden" heißt

| Prüfung | erwartet |
| --- | --- |
| A1 Schema vorher | tabellen 15 · spalten 97 · regeln 27 · funktionen 33 · trigger 11 |
| B1 Schema nachher | tabellen **16** · spalten **101** · regeln **28** · funktionen **36** · trigger **13** |
| A2 / B2 Nutzdaten | identisch: 4 · 2 · 4 · 2 · 3 · 2 · 2 |
| B3 Spalten | vier; `time_zone` **ohne** Vorgabewert |
| B5 Rechte | **nur** `authenticated → INSERT,SELECT,UPDATE` |
| B6 Regel | genau eine, `(user_id = auth.uid())` in beiden Ausdrücken |
| B9 Funktion | `prosecdef false`, Argumente **leer**, nur `authenticated` |
| B11 Zeilen | 0 |
| Schritt 5 | zwölf identische Versionen |

## Der Unterschied 32 lokal / 33 im Staging

Der lokale Prüfstand (`scripts/db/harness.mjs`, PostgreSQL 17.5 als
WebAssembly) zählt vor dieser Migration **32** Routinen in `public`, das
Staging **33**. Das ist kein Fehler in den Migrationen, sondern der
Unterschied zwischen Prüfstand und echtem Projekt:

Der Prüfstand bildet von Supabase genau das nach, was die Migrationen
voraussetzen — die drei Rollen, das Schema `auth`, `auth.users` und
`auth.uid()`. Mehr nicht. Ein echtes Supabase-Projekt bringt darüber hinaus
mit, was beim Anlegen entsteht: Erweiterungen, Hilfsfunktionen, alles, was
die Plattform in `public` ablegt. Keine einzige davon stammt aus diesem
Repository — die Migrationen erzeugen beidseitig dieselben 32.

**Welche Routine die 33. ist, ist von hier aus nicht feststellbar**, und
geraten wird sie nicht. `A4` in der SQL-Datei listet sie namentlich auf;
der Vergleich mit der Liste unten nennt sie in einem Schritt.

Für die Abnahme gilt deshalb: **Maßgeblich ist der gemessene
Remote-Ausgang.** Die absoluten Nachherwerte in der Tabelle oben folgen aus
ihm. Der Beitrag dieser Migration ist in beiden Umgebungen derselbe —
+1 Tabelle, +4 Spalten, +1 Regel, +3 Funktionen, +2 Trigger.

### Die 32 Routinen aus diesem Repository

`app_ai_touch`, `app_archived_courses_are_closed`, `app_check_progress_events`,
`app_is_member_of`, `app_is_teacher_of`, `app_may_touch_progress`,
`app_my_role`, `app_owns_course`, `app_owns_pack`, `app_pack_is_assigned`,
`app_revision_is_assigned_to_me`, `app_revisions_are_frozen`,
`app_sees_profile`, `assign_pack_to_course`, `begin_practice_session`,
`confirm_recovery_code`, `consume_invite_by_hash`, `create_course`,
`create_course_invite`, `create_learner_account`, `invite_alphabet`,
`invite_code_hash`, `new_invite_code`, `note_auth_attempt`, `publish_pack`,
`record_progress_events`, `redeem_invite`, `release_invite_by_hash`,
`reset_my_progress`, `rotate_recovery_code`, `save_pack_draft`,
`withdraw_pack_revision`.

Migration 12 legt dazu: `app_check_time_zone`, `app_touch_learner_settings`,
`my_due_overview`.

## Wenn etwas nicht stimmt

Kein `migration repair`, kein zweites `db push`. Eine Korrektur ist eine
**neue additive Migration** — Migration 12 bleibt stehen, wie sie
angewandt wurde. Das ist dieselbe Regel, unter der die Historie am
02.10.2026 angeglichen wurde (`docs/migrationshistorie-audit.md`).
