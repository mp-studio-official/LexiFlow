# Migration 12 — `learner_settings` und `my_due_overview`

**Angewandt und abgenommen im Staging am 02.10.2026.**

Diese Datei war die Anleitung dorthin und ist jetzt das Protokoll. Der
Ablauf unten ist gelaufen, die Messwerte sind die gemessenen.

> ## Migration 12 ist ab jetzt unveränderlich
>
> Sie steht im Staging. Die Datei
> `supabase/migrations/20261002090000_lernendeneinstellungen.sql` wird
> **nicht mehr bearbeitet** — kein Tippfehler, kein Kommentar, keine
> „kleine" Ergänzung.
>
> Der Grund ist nicht Förmlichkeit: `db push` vergleicht Versionen, nicht
> Inhalte. Eine nachträglich geänderte Datei gilt als angewandt und läuft
> nie wieder; das lokale Abbild und das Staging liefen auseinander, ohne
> dass irgendetwas rot würde. Genau diese Lage wurde am 29.09.2026
> mühsam wieder eingefangen (`docs/migrationshistorie-audit.md`).
>
> **Jede weitere Datenbankänderung ist eine neue additive Migration.**
> Auch eine Korrektur an dem, was Migration 12 angelegt hat.

## Die gemessenen Werte

| | vorher | nachher | Zuwachs |
| --- | --- | --- | --- |
| Tabellen | 15 | **16** | `learner_settings` |
| Spalten | 97 | **101** | die vier |
| Regeln | 27 | **28** | `learner_settings_own` |
| Funktionen | 33 | **36** | `app_check_time_zone`, `app_touch_learner_settings`, `my_due_overview` |
| Trigger | 11 | **13** | Zeitzonenprüfung, `updated_at` |

Nutzdaten **unverändert**: 4 Profile · 2 Kurse · 4 Mitgliedschaften ·
2 Pakete · 3 Fassungen · 2 Paketstände · 2 Eintragsstände.

Die Einzelprüfungen aus Abschnitt B der SQL-Datei, alle bestanden:

- `learner_settings`: **0 Zeilen** — niemand bekommt eine Zeile angelegt,
  und das Fehlen heißt „Ziel aus, Zeitzone unbestätigt".
- RLS **an**; `force RLS` aus, wie erwartet — erzwungen wird sie für den
  Eigentümer nicht, und der ist niemandes Verbindung.
- **Genau eine** eigene Regel, **genau zwei** eigene Trigger.
- Rechte **ausschließlich** `authenticated → INSERT, SELECT, UPDATE`.
  Kein `DELETE`, nichts für `anon`, nichts für `service_role`.
- `my_due_overview`: `security definer` **false**, **keine Argumente**.
- `EXECUTE`: `authenticated` true, `service_role` false, `anon` false.
- Historie: alle **zwölf** Versionen, einschließlich `20261002090000`.

## Die 33. Funktion war `rls_auto_enable`

Die offene Frage aus der Vorabnahme ist beantwortet, gemessen und nicht
geraten: Der lokale Prüfstand zählte vor Migration 12 **32** Routinen in
`public`, das Staging **33**. Die zusätzliche ist `rls_auto_enable` —
eine Funktion der Plattform, nicht aus diesem Repository. Keine
Migration hier erzeugt sie, und keine verlässt sich auf sie.

Für künftige Abnahmen heißt das: **Maßgeblich ist der gemessene
Remote-Ausgang**, nicht die Zahl aus `scripts/db/harness.mjs`. Der
Prüfstand bildet von Supabase nur nach, was die Migrationen voraussetzen
— drei Rollen, Schema `auth`, `auth.users`, `auth.uid()`. Der Beitrag
einer Migration ist in beiden Umgebungen derselbe; die absolute Zahl ist
es nicht.

## Warum jedes Kommando mit `npx` beginnt

Auf dem Arbeitsrechner ist die CLI **nicht global installiert**. Eine
Zeile, die mit `supabase db push` beginnt, scheitert dort mit
`command not found` — und das sieht aus wie ein Umgebungsproblem, nicht
wie ein Fehler in dieser Anleitung. `src/application/keineTestuhr.test.ts`
hält das für alle Dateien unter `docs/abnahme/` fest.

Die Abnahme lief nicht über die CLI: Die installierte Fassung kennt
**kein** `db execute`. Nachgesehen, nicht angenommen — `db --help` nennt
`diff`, `dump`, `push`, `pull`, `reset`, `lint`, `start`, `query`,
`advisors`, `schema`. Der SQL Editor zeigt dieselben Abfragen als
Tabelle.

## Der Ablauf, so wie er gelaufen ist

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

## Wenn später etwas nicht stimmt

Kein `migration repair`, kein zweites `db push`, keine Bearbeitung der
Migrationsdatei. Eine Korrektur ist eine **neue additive Migration** —
Migration 12 bleibt stehen, wie sie angewandt wurde. Dieselbe Regel, unter
der die Historie am 02.10.2026 angeglichen wurde
(`docs/migrationshistorie-audit.md`).
