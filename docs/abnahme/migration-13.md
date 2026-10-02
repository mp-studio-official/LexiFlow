# Migration 13 — lokale Lerntage

**Angewandt und abgenommen im Staging am 03.10.2026.**

Diese Datei war die Anleitung dorthin und ist jetzt das Protokoll.

> ## Migration 13 ist ab jetzt unveränderlich
>
> Sie steht im Staging. `supabase/migrations/20261003090000_lokale_lerntage.sql`
> wird **nicht mehr bearbeitet** — kein Tippfehler, kein Kommentar, keine
> „kleine" Ergänzung. `db push` vergleicht Versionen, nicht Inhalte; eine
> nachträglich geänderte Datei gilt als angewandt und läuft nie wieder.
>
> **Jede weitere Datenbankänderung ist eine neue additive Migration** — auch
> eine Korrektur an dem, was 12 oder 13 angelegt haben.

## Die gemessenen Werte

| | vorher | nachher |
| --- | --- | --- |
| Tabellen | 16 | **16** |
| Spalten | 101 | **101** |
| Regeln | 28 | **28** |
| Funktionen | 36 | **38** |
| Trigger | 13 | **13** |

Nur die Funktionen wachsen, und zwar um genau zwei. Alles andere steht
still: Migration 13 legt nichts ab.

Nutzdaten **unverändert**: 4 Profile · 2 Kurse · 4 Mitgliedschaften ·
2 Pakete · 3 Fassungen · 2 Paketstände · 2 Eintragsstände · 4 Ereignisse.
`learner_settings` weiterhin **0 Zeilen**.

Die Einzelprüfungen aus Abschnitt B, alle bestanden:

- genau **zwei** neue Funktionen, beide `security definer` **false**, beide
  **ohne Argumente**;
- `EXECUTE` ausschließlich für `authenticated`;
- `my_local_today()` liefert ohne Einstellung **genau eine** Zeile mit drei
  `null`-Werten — die Zusage, auf die es ankommt: eine Antwort auch dann,
  wenn es nichts zu sagen gibt;
- `my_learning_days()` bleibt ohne Einstellung leer;
- Historie: **13** Versionen, zuletzt `20261003090000`.

## Die WebKit-Abnahme

Am selben Tag nachgeholt und bestanden: „Heute" misst in **Chromium und
WebKit** bei 390, 768, 1024 und 1440 px ohne waagerechten Überlauf, ohne
Bedienelement unter 44 × 44 px und mit allen sieben Bereichen.

Sie konnte in der Entwicklungsumgebung nicht laufen — weder der
Cloud-Container noch die lokale VM erreichen `cdn.playwright.dev`. Dass das
Skript dort „NICHT gemessen: WebKit" auf stderr meldete statt „bestanden in
zwei Browsern", war der Unterschied zwischen einer offenen Abnahme und einer
behaupteten.

Der Lauf brauchte außerdem `bc0b108`: `esbuild` war nur über Vites
optionalen Peer-Vertrag im Lockfile und auf dem Arbeitsrechner nicht
installiert.

## Der Ablauf, so wie er gelaufen ist

Dieselbe Trennung wie bei Migration 12: die CLI für Historie und Anwendung,
der SQL Editor für die Abnahme (`docs/abnahme/migration-13.sql`).

## Was sie tut — und was nicht

Sie legt **zwei Lesefunktionen** an:

- `my_local_today()` → der heutige Kalendertag und der Montag der laufenden
  Woche, in der **bestätigten** Zeitzone. Immer genau eine Zeile; ohne
  bestätigte Zeitzone beide Daten `null`.
- `my_learning_days()` → Aufgaben je lokalem Kalendertag aus
  `progress_events.recorded_at`. Ohne bestätigte Zeitzone leer. **Ohne
  Zeitfenster**: Zurück kommt die ganze Lerngeschichte, aggregiert zu einer
  Zeile je Tag — eine feste Grenze hätte eine lange Serie und die längste
  bisherige (§ 4.5) still gekappt.

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

## Warum kein Zeitfenster

In der ersten Fassung stand `recorded_at >= now() - interval '400 days'`.
Die Zahl war erfunden. Sie hätte zweierlei still abgeschnitten: eine Serie,
die länger als gut ein Jahr läuft, und die längste bisherige Serie aus
§ 4.5 — und zwar lautlos, denn eine gekappte Historie sieht aus wie eine
kurze.

Teuer wird der Verzicht nicht: Die Funktion gibt **je lokalem Tag eine
Zeile** zurück, nicht je Ereignis. Die Zeilenzahl wächst mit den Tagen, an
denen jemand gelernt hat — ein Schuljahr hat davon etwa zweihundert.
Gelesen wird über `progress_events_user_idx` auf `(user_id)`, und die
Zugriffsregel schneidet ohnehin auf die eigene Person zu.

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
| lokaler Prüfstand | vorher **35**, nachher **37** — immer genau eine weniger |
| A2 / B2 Nutzdaten | identisch, Ereignisse und Einstellungen eingeschlossen |
| B3 Signaturen | beide `prosecdef false`, Argumente **leer**, nur `authenticated` |
| B4 Regeln | unverändert, 28 Zeilen |
| B5 | genau eine Zeile, alle drei Spalten `null` |
| B6 | keine Zeile |
| Schritt 5 | dreizehn identische Versionen |

Die absolute Zahl 36 ist der **gemessene** Ausgang des Stagings nach
Migration 12. Der lokale Prüfstand zählt dort **35** — genau **eine**
weniger, und zwar `rls_auto_enable`, eine Funktion der Plattform, die keine
Migration dieses Repositorys erzeugt. Es ist nicht mehr als diese eine; die
früher hier stehende Formulierung „zwei weniger … und die übrigen
Plattformroutinen" war falsch.

Nach Migration 13 sind es lokal **37** und im Staging erwartet **38**.
Maßgeblich ist wie immer der Remote-Ausgang; der Beitrag dieser Migration
ist in beiden Umgebungen **+2 Funktionen und sonst nichts**.

## Wenn später etwas nicht stimmt

Kein `migration repair`, kein zweites `db push`, keine Bearbeitung einer
angewandten Migrationsdatei. Eine Korrektur ist eine **neue additive
Migration**.
