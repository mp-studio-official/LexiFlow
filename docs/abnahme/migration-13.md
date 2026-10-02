# Migration 13 anwenden — lokale Lerntage

Stand 03.10.2026. Die Migration ist lokal geprüft und **noch nicht
angewandt**. Dieselbe Trennung wie bei Migration 12: die CLI für Historie
und Anwendung, der SQL Editor für die Abnahme
(`docs/abnahme/migration-13.sql`).

## Was sie tut — und was nicht

Sie legt **zwei Lesefunktionen** an:

- `my_local_today()` → der heutige Kalendertag und der Montag der laufenden
  Woche, in der **bestätigten** Zeitzone. Immer genau eine Zeile; ohne
  bestätigte Zeitzone beide Daten `null`.
- `my_learning_days()` → Aufgaben je lokalem Kalendertag aus
  `progress_events.recorded_at`. Ohne bestätigte Zeitzone leer.

Sie legt **keine** Tabelle an, **keine** Spalte, **keine** Zugriffsregel und
**keinen** Trigger. Sie ändert nichts an Migration 12 — die ist seit dem
02.10.2026 angewandt und damit unveränderlich.

Beide Funktionen laufen mit den Rechten der **aufrufenden** Person, haben
**keine Parameter** und sind nur für `authenticated` ausführbar.

## Warum keine Parameter

Weil ein Parameter die Tagesgrenze an die aufrufende Seite durchreichte.
Ein `p_zone` oder `p_heute` spart beim Prüfen eine Zeile — und am Ende
entschiede die Geräteuhr, welcher Tag ein Lerntag ist. Genau das schließt
E28 aus, und `src/application/keineTestuhr.test.ts` macht es rot, sobald
einer zurückkommt.

Der Preis ist ehrlich benannt: Der Prüfstand kann die Uhr nicht stellen. Er
legt stattdessen seine Ereignisse mit einem festen `recorded_at` an und
bewegt die Daten statt der Zeit.

## Warum jedes Kommando mit `npx` beginnt

Auf dem Arbeitsrechner ist die CLI **nicht global installiert**. Eine
Zeile, die mit `supabase db push` beginnt, scheitert dort mit
`command not found` — und das sieht aus wie ein Umgebungsproblem, nicht wie
ein Fehler in dieser Anleitung.

Die Abnahme läuft nicht über die CLI: Die installierte Fassung kennt **kein**
`db execute`. Nachgesehen mit `db --help` — die Unterbefehle sind `diff`,
`dump`, `push`, `pull`, `reset`, `lint`, `start`, `query`, `advisors`,
`schema`.

## Der Ablauf

```bash
# ── 0 · im Projektordner ────────────────────────────────────────────────
cd "/Users/mparat/MP Studio/Development/LexiFlow"

# ── 1 · Stand der Historie ──────────────────────────────────────────────
# Erwartet: zwölf Versionen beidseitig, 20261003090000 nur unter Local.
npx --yes supabase@latest migration list --linked

# ── 2 · Abnahme „vorher" ────────────────────────────────────────────────
# Abschnitt A aus docs/abnahme/migration-13.sql im SQL Editor ausführen
# und die Ergebnisse festhalten. Erst danach weiter.

# ── 3 · Trockenlauf ─────────────────────────────────────────────────────
# Erwartet: genau eine Migration, 20261003090000_lokale_lerntage.sql.
npx --yes supabase@latest db push --linked --dry-run

# ── 4 · Anwenden ────────────────────────────────────────────────────────
npx --yes supabase@latest db push --linked

# ── 5 · Historie erneut ─────────────────────────────────────────────────
# Erwartet: **dreizehn** Versionen, Local und Remote identisch.
npx --yes supabase@latest migration list --linked

# ── 6 · Abnahme „nachher" ───────────────────────────────────────────────
# Abschnitt B aus docs/abnahme/migration-13.sql im SQL Editor.
```

## Was „bestanden" heißt

| Prüfung | erwartet |
| --- | --- |
| A1 Schema vorher | 16 · 101 · 28 · **36** · 13 |
| B1 Schema nachher | 16 · 101 · 28 · **38** · 13 — **nur** die Funktionen wachsen |
| A2 / B2 Nutzdaten | identisch, Ereignisse und Einstellungen eingeschlossen |
| B3 Signaturen | beide `prosecdef false`, Argumente **leer**, nur `authenticated` |
| B4 Regeln | unverändert, 28 Zeilen |
| B5 | genau eine Zeile, alle drei Spalten `null` |
| B6 | keine Zeile |
| Schritt 5 | dreizehn identische Versionen |

Die absolute Zahl 36 ist der **gemessene** Ausgang des Stagings nach
Migration 12 (der lokale Prüfstand zählt zwei weniger, weil ihm
`rls_auto_enable` und die übrigen Plattformroutinen fehlen). Maßgeblich ist
wie immer der Remote-Ausgang; der Beitrag dieser Migration ist in beiden
Umgebungen **+2 Funktionen und sonst nichts**.

## Wenn später etwas nicht stimmt

Kein `migration repair`, kein zweites `db push`, keine Bearbeitung einer
angewandten Migrationsdatei. Eine Korrektur ist eine **neue additive
Migration**.
