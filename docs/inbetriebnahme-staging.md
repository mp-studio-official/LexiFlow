# Sprint 5A in Betrieb nehmen: Staging und GitHub Pages

Eine nummerierte Anleitung für Marc. **Nichts davon ist gelaufen.** Wer sie
abarbeitet, führt jeden Schritt zum ersten Mal aus und prüft damit zum ersten
Mal, was bisher nur lokal geprüft ist.

Ergänzt `docs/portal-uebergabe.md` (der kurze Überblick) und
`docs/portal-datenschutz-und-sicherheit.md` (was gespeichert wird und wer es
sieht). Diese Datei hier ist die ausführliche, abhakbare Fassung für ein
**Staging**.

---

## 0. Ausgangslage – geprüft am 13.09.2026

| | |
| --- | --- |
| Branch | `sprint/5a-cloud-portal-foundation` |
| HEAD | `9987b70c371da6ed1f64784bcb350eb8852d69ba` |
| Working Tree | sauber, keine uncommitteten Änderungen |
| `main` | `20d5338` – **unverändert**, und Vorfahr von HEAD (Fast-Forward möglich) |
| Remote | **keiner** |
| Tags | `v0.1.0-sprint1`, `v0.2.0`, `v0.3.0` – **kein** 5A-Tag |
| Sprint 5A | **17 Commits**, `f8d5871` … `9987b70`, linear, **keine Merges** |

### 0.1 Die 17 Commits

| # | Commit | Inhalt |
| --- | --- | --- |
| 1 | `f8d5871` | Phase 0 – Audit, Ausgangsmessung, ADR-1 bis ADR-9 |
| 2 | `b76a025` | Phase 1 – Laufzeitmodus, Verträge, Portal ohne Backend |
| 3 | `6946139` | Phase 2 – Schema und Zugriffsregeln |
| 4 | `a8a44a8` | Phase 3 – zweiter Eingang, Anmeldung, Wiederherstellung |
| 5 | `56faa8c` | Phase 4 – Kurse, Codes, Serverfunktion aufgetrennt |
| 6 | `f041d87` | Nachtrag Commit-ID Phase 4 |
| 7 | `085b0c8` | Phase 5 – Pakete, Fassungen, Zuweisung |
| 8 | `faa9696` | Nachtrag Commit-ID Phase 5 |
| 9 | `bfc41e9` | Phase 6 – Lernstand im Konto |
| 10 | `1ef1613` | Nachtrag Commit-ID Phase 6 |
| 11 | `3adef03` | **Phase 6b – Korrektur**: Fassung statt Client-Zeitstempel |
| 12 | `19e3303` | Nachtrag Commit-ID Phase 6b |
| 13 | `0144644` | Phase 7 – KI-Zugang, Tresor, SSRF-Schutz |
| 14 | `31db6c0` | Nachtrag Commit-ID Phase 7 |
| 15 | `9a19cd8` | Phase 8 – Prüfkette, Deployment, Riegel davor |
| 16 | `a7111e1` | Phase 9 – Datenschutz, Sicherheit, Übergabe |
| 17 | `9987b70` | Nachtrag Commit-IDs Phase 8 und 9 |

### 0.2 Drei Stufen von „geprüft"

Dieser Unterschied zieht sich durch das ganze Dokument. Jede Abnahme unten ist
einer der drei Stufen zugeordnet.

| Stufe | Was sie bedeutet | Umfang heute |
| --- | --- | --- |
| **L – lokal bewiesen** | Reine Logik, in dieser Werkstatt ausgeführt. Gilt unverändert auch im Staging. | 2830 Prüfungen, davon 160 für die Serverfunktionskerne |
| **P – mit PGlite simuliert** | Echtes PostgreSQL 17.5, echte Migrationen, echte Regeln – aber `auth.uid()`, die Rollen und das Schema `auth` sind **nachgebaut**. GoTrue, PostgREST und die Edge-Laufzeit fehlen. | 109 Prüfungen |
| **S – nur mit echtem Supabase nachweisbar** | Alles, was zwischen Browser und SQL liegt. | **offen** |

Was unter **S** fällt: reales Supabase Auth (GoTrue), echte JWT-Claims,
PostgREST, beide Edge-Laufzeiten, Function Secrets, E-Mail-Versand,
Schlüsselrotation, jeder KI-Anbieter, das Deployment.

### 0.3 Zwei Lücken, die dieses Dokument schließt

Beim Zusammenstellen dieser Anleitung sind zwei Dinge aufgefallen, die im Code
**absichtlich** fehlen und deshalb im Staging von Hand zu tun sind:

1. **Es gibt keine Selbstregistrierung für Lehrkräfte.** Die Anmeldeseite kann
   nur `signInWithEmail`. Ein Lehrkraftkonto entsteht im Supabase-Dashboard –
   nicht in der Anwendung. Das ist richtig so (wer sich selbst zur Lehrkraft
   machen kann, sieht fremde Kursmitglieder), heißt aber: Schritt 5.3 unten ist
   Pflicht.
2. **Es gibt keinen Trigger, der beim Anlegen eines Kontos ein Profil
   erzeugt.** Für Lernende macht das `create_learner_account`; für Lehrkräfte
   macht es niemand. Ohne Profilzeile gibt `app_my_role()` nichts zurück, und
   die Lehrkraft kann keinen Kurs anlegen. Auch das steht in Schritt 5.3.

> **Ob daraus später ein Trigger werden soll, ist eine fachliche Frage und hier
> nicht entschieden.** Für ein Staging mit drei Lehrkräften ist Handarbeit
> richtig; für eine Schule mit dreißig wäre sie es nicht.

---

## 1. Was Marc anlegen oder bereitstellen muss

### 1.1 Konten

| Nr. | Was | Wo | Anmerkung |
| --- | --- | --- | --- |
| 1.1.1 | Supabase-Konto | supabase.com | falls noch nicht vorhanden |
| 1.1.2 | GitHub-Konto `mp-studio-official` | github.com | vorhanden |
| 1.1.3 | Eine E-Mail-Adresse für das **Admin**-Testkonto | frei wählbar | erreichbar sein muss sie nur, wenn E-Mail-Wiederherstellung geprüft wird |
| 1.1.4 | Eine E-Mail-Adresse für das **Lehrkraft**-Testkonto | frei wählbar | dito, muss von 1.1.3 verschieden sein |

Lernende brauchen **keine** E-Mail-Adresse. Sie bekommen eine Lern-ID.

### 1.2 Projekte

| Nr. | Was | Einstellung |
| --- | --- | --- |
| 1.2.1 | Supabase-Projekt „LexiFlow Staging" | Region **Frankfurt (eu-central-1)** |
| 1.2.2 | GitHub-Repository `mp-studio-official/LexiFlow` | leer oder mit der lokalen Historie vereinbar |

### 1.3 URLs

| Nr. | Wert | Beispiel |
| --- | --- | --- |
| 1.3.1 | Projekt-URL | `https://<ref>.supabase.co` |
| 1.3.2 | Pages-Ursprung | `https://mp-studio-official.github.io` |
| 1.3.3 | Kontofreie PWA | `https://mp-studio-official.github.io/LexiFlow/` |
| 1.3.4 | Portal | `https://mp-studio-official.github.io/LexiFlow/portal/` |
| 1.3.5 | Rückkehradresse Kennwort | `https://mp-studio-official.github.io/LexiFlow/portal/#/kennwort-neu` |

### 1.4 Secrets und Werte

**Keiner dieser Werte gehört in diesen Chat.** Marc trägt sie direkt in
Supabase beziehungsweise GitHub ein; unten steht jeweils, wo.

| Nr. | Name | Art | Wo eintragen |
| --- | --- | --- | --- |
| 1.4.1 | Projekt-URL | öffentlich | GitHub → Variables **und** Supabase-Funktionen |
| 1.4.2 | Publishable Key (früher „anon") | öffentlich | GitHub → Variables |
| 1.4.3 | Secret Key (früher „service_role") | **geheim** | nur Supabase → Edge Function Secrets |
| 1.4.4 | `LEXIFLOW_ALLOWED_ORIGINS` | unkritisch | Supabase → Edge Function Secrets |
| 1.4.5 | `LEXIFLOW_AI_MASTER_KEY_V1` | **geheim** | nur Supabase → Edge Function Secrets |
| 1.4.6 | KI-Anbieterschlüssel | **geheim** | **nirgends hier** – die Lehrkraft trägt ihn im Portal ein |

> ### ⚠ Der früher im Chat gepostete Gemini-Schlüssel
>
> Er gilt als **kompromittiert** und wird hier nirgends verwendet. Er darf
> weder in Supabase noch in GitHub noch im Portal eingetragen werden.
>
> **Bitte beim Anbieter widerrufen**, falls noch nicht geschehen – ein
> Schlüssel, der einmal in einem Chatverlauf stand, ist unabhängig davon
> verbrannt, wer den Verlauf sehen kann. Für das Staging einen **neuen**
> Schlüssel erzeugen und ihn ausschließlich über das Portalformular eingeben
> (Schritt 6.11).

---

## 2. Das Supabase-Projekt

| Nr. | Schritt | Prüfen |
| --- | --- | --- |
| 2.1 | Neues Projekt anlegen, Name „LexiFlow Staging" | |
| 2.2 | Region **Frankfurt (eu-central-1)** wählen | Region steht nachträglich nicht mehr um |
| 2.3 | Datenbankkennwort erzeugen und im Passwortmanager ablegen | nicht im Chat, nicht in einer Datei im Repository |
| 2.4 | Warten, bis das Projekt bereit ist | |
| 2.5 | Projekt-URL notieren (1.3.1) | |
| 2.6 | Publishable Key und Secret Key aus den Projekteinstellungen holen | **nur der Publishable Key** darf später ins Bündel |

> **Zur Region.** Frankfurt ist richtig und ist trotzdem **kein
> Datenschutznachweis**. Ohne sie fängt die Prüfung nicht an; mit ihr ist sie
> nicht fertig. Siehe `docs/portal-datenschutz-und-sicherheit.md`, Abschnitt 8.

> **Zu den Schlüsselnamen.** Supabase hat die Benennung gewechselt: ältere
> Projekte zeigen `anon` und `service_role`, neuere `publishable` und `secret`.
> Gemeint ist jeweils dasselbe Paar. Der Code liest sie unter den Namen
> `SUPABASE_PUBLISHABLE_KEY` und `SUPABASE_SECRET_KEY`.

---

## 3. Reihenfolge: Migrationen, Zugriffsregeln, Auth, Edge Functions

**Die Reihenfolge ist nicht beliebig.** Jeder Schritt setzt den vorigen voraus.

### 3.1 Migrationen (zuerst)

Acht Dateien aus `supabase/migrations/`, **in der Reihenfolge ihrer Namen**:

| Nr. | Datei | Was entsteht |
| --- | --- | --- |
| 3.1.1 | `20260913120000_grundgeruest.sql` | 11 Tabellen, Typ `app_role`, 2 Trigger |
| 3.1.2 | `20260913120100_hilfsfunktionen.sql` | die Ja/Nein-Funktionen der Regeln |
| 3.1.3 | `20260913120200_zugriffsregeln.sql` | Rechte + 23 Regeln |
| 3.1.4 | `20260913120300_anmeldung.sql` | Lernendenkonten, Wiederherstellung |
| 3.1.5 | `20260913120400_kurse_und_codes.sql` | Kurse, Einladungen, Bremse |
| 3.1.6 | `20260913120500_pakete_und_revisionen.sql` | Pakete, Fassungen, Zuweisung |
| 3.1.7 | `20260913120600_lernstand.sql` | Schreibweg + Eingangsprüfung |
| 3.1.8 | `20260913120700_ki.sql` | KI-Verbindungen, Freigabeliste |

Entweder über die Supabase-CLI (`supabase db push`) oder durch Einfügen in den
SQL-Editor, Datei für Datei.

> **Ab dem ersten Anwenden sind Migrationen additiv.** Bis hierher wurden sie
> beim Weiterbauen in sich geändert – das ging, weil es nirgends eine Datenbank
> gab, auf der sie schon gelaufen wären. Ab jetzt wäre eine geänderte Datei
> zwei verschiedene Schemata unter demselben Namen.

### 3.2 Zugriffsregeln prüfen (nicht einschalten)

Die Regeln kommen **mit** den Migrationen. Es gibt nichts einzuschalten. Zu
prüfen ist nur, dass sie angekommen sind:

```sql
-- Erwartet: keine Zeile.
select tablename from pg_tables
 where schemaname = 'public'
   and not exists (
     select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = pg_tables.tablename
        and c.relrowsecurity
   );

-- Erwartet: 'ALL' und je eine Regel.
select tablename, cmd, count(*) from pg_policies
 where schemaname = 'public'
   and tablename in ('pack_progress','entry_progress','progress_events')
 group by 1,2;
```

### 3.3 Auth konfigurieren

| Nr. | Einstellung | Wert |
| --- | --- | --- |
| 3.3.1 | Site URL | `https://mp-studio-official.github.io/LexiFlow/portal/` |
| 3.3.2 | Redirect URLs (Allowlist) | `https://mp-studio-official.github.io/LexiFlow/portal/**` |
| 3.3.3 | E-Mail-Bestätigung | für Staging **aus** – sonst ist jedes Testkonto von einem Postfach abhängig |
| 3.3.4 | Selbstregistrierung („Allow new users to sign up") | **aus** |

Zu 3.3.4: Die Anwendung bietet ohnehin keinen Weg dazu (siehe 0.3.1). Es
abzuschalten ist der zweite Riegel – sonst könnte jemand mit dem Publishable
Key direkt an der API ein Konto anlegen.

Zu 3.3.2: Die genaue Rückkehradresse ist 1.3.5. Sie entsteht im Code aus
`location.origin` plus Grundpfad plus `#/kennwort-neu` und steht nirgends fest
geschrieben – deshalb muss die Allowlist den Pfad mit `**` abdecken.

> **E-Mail-Versand** wird nur für die Kennwortwiederherstellung von
> **Lehrkräften** gebraucht. Für Lernende gibt es sie nicht (ADR-5, ADR-11) –
> dort ist der Wiederherstellungscode der Weg. Ohne SMTP-Einrichtung ist
> Abnahme 7.9 unten nicht durchführbar; alles andere schon.

### 3.4 Function Secrets

Vor dem Deployen der Funktionen setzen – eine Funktion ohne ihre Secrets läuft
los und bricht beim ersten Aufruf ab.

| Nr. | Name | Wert |
| --- | --- | --- |
| 3.4.1 | `SUPABASE_URL` | die Projekt-URL |
| 3.4.2 | `SUPABASE_PUBLISHABLE_KEY` | der Publishable Key |
| 3.4.3 | `SUPABASE_SECRET_KEY` | der Secret Key |
| 3.4.4 | `LEXIFLOW_ALLOWED_ORIGINS` | `https://mp-studio-official.github.io` |
| 3.4.5 | `LEXIFLOW_AI_MASTER_KEY_V1` | 32 Byte, base64 – siehe unten |

Den Hauptschlüssel erzeugen, **nicht** von Hand und nicht in einem
Web-Generator:

```
openssl rand -base64 32
```

Direkt in das Supabase-Feld einfügen. Er gehört in **keine** `.env`, in keine
GitHub-Variable und in kein Bündel – eine Variable mit Präfix `VITE_` landet im
ausgelieferten JavaScript.

> **Zu 3.4.1–3.4.3:** Supabase injiziert manche dieser Werte je nach
> Projektalter automatisch, teils unter abweichenden Namen (`SUPABASE_ANON_KEY`
> statt `SUPABASE_PUBLISHABLE_KEY`). Der Code liest ausschließlich die oben
> genannten Namen. **Nach dem Deployen in den Function-Logs prüfen**, ob ein
> Aufruf an einem fehlenden Wert scheitert; im Zweifel alle drei ausdrücklich
> setzen.

> **`LEXIFLOW_ALLOWED_ORIGINS` ist der Ursprung, nicht der Pfad.** Beide
> Funktionen vergleichen den `Origin`-Header, und der enthält nie einen Pfad.
> Mehrere Werte mit Komma trennen (etwa für eine lokale Entwicklungsadresse).

### 3.5 Edge Functions deployen

| Nr. | Funktion | Zweck |
| --- | --- | --- |
| 3.5.1 | `learner-auth` | Anmeldung, Registrierung, Wiederherstellung für Lernende |
| 3.5.2 | `ai-gateway` | der einzige Weg vom Portal zu einem KI-Anbieter |

```
supabase functions deploy learner-auth
supabase functions deploy ai-gateway
```

**Beide sind nie gelaufen** (Stufe S). Ihre Kerne sind mit 160 Prüfungen
abgenommen; die Deno-Mäntel darum sind es nicht.

---

## 4. Welcher Wert wohin

| Wert aus Supabase | Wohin | Als was |
| --- | --- | --- |
| Projekt-URL | GitHub → Settings → Secrets and variables → Actions → **Variables** → `VITE_SUPABASE_URL` | Variable, nicht Secret |
| Publishable Key | GitHub → dieselbe Stelle → `VITE_SUPABASE_PUBLISHABLE_KEY` | Variable, nicht Secret |
| Projekt-URL | Supabase → Edge Functions → Secrets → `SUPABASE_URL` | Secret |
| Publishable Key | dito → `SUPABASE_PUBLISHABLE_KEY` | Secret |
| Secret Key | dito → `SUPABASE_SECRET_KEY` | **Secret, nirgendwo sonst** |
| – | dito → `LEXIFLOW_ALLOWED_ORIGINS` | Secret |
| – | dito → `LEXIFLOW_AI_MASTER_KEY_V1` | **Secret, nirgendwo sonst** |

**Warum Variables und nicht Secrets bei GitHub:** Beide Werte stehen ohnehin im
ausgelieferten Bündel und lassen sich aus jedem Browser auslesen. Als Secret
wären sie in den Actions-Protokollen maskiert – das erschwert das Nachsehen,
ohne etwas zu schützen.

**Für lokale Entwicklung** zusätzlich eine `.env` nach dem Muster von
`.env.example` (von Git ausgeschlossen). Dort gehören **nur** die beiden
öffentlichen Werte hinein.

---

## 5. GitHub Pages und Actions

### 5.1 Repository und Remote

| Nr. | Schritt |
| --- | --- |
| 5.1.1 | Prüfen, ob `github.com/mp-studio-official/LexiFlow` existiert und **leer** ist |
| 5.1.2 | Falls es Inhalt hat: **nicht** überschreiben. Erst klären, was dort liegt |
| 5.1.3 | `git remote add origin git@github.com:mp-studio-official/LexiFlow.git` |
| 5.1.4 | `git push -u origin sprint/5a-cloud-portal-foundation` – **nur den Sprintzweig** |
| 5.1.5 | `main` erst später und erst nach Abschnitt 10 |

**Niemals `--force`.** Wenn ein Push abgelehnt wird, ist das die Auskunft, dass
dort Historie liegt, die niemand angesehen hat.

### 5.2 Pages einschalten

| Nr. | Einstellung | Wert |
| --- | --- | --- |
| 5.2.1 | Settings → Pages → Source | **GitHub Actions** (nicht „Deploy from a branch") |
| 5.2.2 | Variables setzen | siehe Abschnitt 4 |

### 5.3 Die beiden Adressen

Ein Build erzeugt **beide** Auslieferungen in einem `dist/`:

| Adresse | Was | Woraus |
| --- | --- | --- |
| `/LexiFlow/` | die bestehende kontofreie PWA, **unverändert** | `vite.config.ts` → `dist/` |
| `/LexiFlow/portal/` | das gehostete Portal | `vite.portal.config.ts` → `dist/portal/` |

Der Grundpfad kommt aus `LEXIFLOW_BASE=/LexiFlow/` und steht nirgends fest
geschrieben. Beide liegen unter **einem** Ursprung – deshalb kann das Portal
Pakete aus dem lokalen Speicher der kontofreien Anwendung übernehmen (ADR-10).

### 5.4 Die zwei Abläufe

| Datei | Wann | Was |
| --- | --- | --- |
| `.github/workflows/ci.yml` | jeder Zweig, jeder PR | Typen, 2830 Prüfungen, drei E2E-Suiten, Größenwacht |
| `.github/workflows/deploy.yml` | nur `main` | dieselbe Kette, dann frischer Build, dann `verify:deploy`, dann erst Pages |

**Erst grünes `ci.yml` auf dem Sprintzweig abwarten.** Das ist der erste Lauf
der ganzen Kette auf fremder Hardware und findet erfahrungsgemäß Dinge, die
lokal nie auffallen.

### 5.5 Der erste Deploy

Da `deploy.yml` nur auf `main` läuft und `main` noch nicht bewegt werden soll,
gibt es für ein Staging zwei Wege:

| Weg | Vorgehen | Bewertung |
| --- | --- | --- |
| **A** | `deploy.yml` von Hand über „Run workflow" auf dem Sprintzweig starten | einfach; der Ablauf hat `workflow_dispatch` |
| **B** | warten, bis nach Abschnitt 10 gemergt wird | sauberer, aber dann ist Staging = Produktion |

**Empfehlung: Weg A.** Ein Staging, das erst nach dem Merge entsteht, ist kein
Staging.

---

## 6. Staging-Abnahme mit echten Konten

Alles hier ist **Stufe S** – zum ersten Mal gegen echtes Supabase. Was in
Klammern steht, ist der Stand vorher.

### 6.1 Das Admin-Konto anlegen (Hand)

| Nr. | Schritt |
| --- | --- |
| 6.1.1 | Supabase → Authentication → Users → „Add user" mit E-Mail 1.1.3 |
| 6.1.2 | Die `id` der neuen Zeile kopieren |
| 6.1.3 | Im SQL-Editor das Profil anlegen: |

```sql
insert into profiles (id, display_name, short_code, role)
values ('<uuid>', 'Verwaltung', 'LX-0001', 'admin');
```

`short_code` muss `^LX-[0-9A-Z]{4}$` erfüllen und eindeutig sein.

### 6.2 Das Lehrkraftkonto anlegen (Hand)

Wie 6.1, mit E-Mail 1.1.4, `display_name` etwa `A. Beispiel`, `short_code`
`LX-4821`, Rolle `teacher`.

> Ohne Profilzeile gibt `app_my_role()` nichts zurück, und der Kursanlegeknopf
> scheitert. Das ist die Lücke aus 0.3.2.

### 6.3 Anmelden als Lehrkraft

| Nr. | Erwartung |
| --- | --- |
| 6.3.1 | `/LexiFlow/portal/#/anmelden` → „Ich unterrichte" → E-Mail + Kennwort |
| 6.3.2 | Landet auf „Kurse"; in der Navigation **kein** Punkt „Verwaltung" |
| 6.3.3 | **Kein rotes Band** „Testfassung ohne Server" (sonst wurde mit `VITE_LEXIFLOW_FAKE_CLOUD=1` gebaut – abbrechen, siehe 9) |

### 6.4 Mehrere Kurse

| Nr. | Schritt |
| --- | --- |
| 6.4.1 | Kurs „Englisch 7b" anlegen, Schuljahr 2026/27 |
| 6.4.2 | Kurs „Englisch 8a" anlegen |
| 6.4.3 | Beide erscheinen in der Liste, keiner im Archiv |

### 6.5 Kurscode

| Nr. | Schritt | Erwartung |
| --- | --- | --- |
| 6.5.1 | In „Englisch 7b" „Code erzeugen" | achtstellig, `[A-Z2-9]` |
| 6.5.2 | Code notieren | **Er wird genau einmal angezeigt** |
| 6.5.3 | Weg und zurück navigieren | Code weg, nur dreistelliges Kürzel bleibt |
| 6.5.4 | Zweiten Code für „Englisch 8a" erzeugen | |

### 6.6 Zwei Lernende anlegen

| Nr. | Schritt |
| --- | --- |
| 6.6.1 | Abmelden. `/LexiFlow/portal/#/beitreten` |
| 6.6.2 | Code aus 6.5.1, „Weiter", „Konto anlegen" |
| 6.6.3 | Name „Fuchs", Kennwort zweimal |
| 6.6.4 | **Wiederherstellungscode notieren** – er wird genau einmal gezeigt |
| 6.6.5 | Dasselbe für „Dachs" mit demselben Kurscode |
| 6.6.6 | Beide erscheinen in der Mitgliederliste der Lehrkraft |

**Zu prüfen:** In der Mitgliederliste steht **keine** Zahl über das Üben –
keine Spalte „geübt", „Fortschritt", „zuletzt aktiv" oder „%". (L, P)

### 6.7 Paket veröffentlichen, beide Lernrichtungen

| Nr. | Schritt |
| --- | --- |
| 6.7.1 | In `/LexiFlow/` (kontofrei) ein Paket anlegen, Lernrichtung **„beide Richtungen"** |
| 6.7.2 | Als Lehrkraft ins Portal, „Material" → „Alle übernehmen" |
| 6.7.3 | Paket erscheint mit „nur Entwurf" |
| 6.7.4 | „Veröffentlichen" → „als Fassung 1 veröffentlicht" |
| 6.7.5 | „Einer Lerngruppe geben" → Englisch 7b → „Zuweisen" |
| 6.7.6 | Zweites Paket mit Richtung **`en-de`** anlegen, übernehmen, veröffentlichen, Englisch 8a zuweisen |

**Der Zustand, der zählt:** In `/LexiFlow/` das erste Paket ändern, dann im
Portal nachsehen – es muss „Fassung 1 veröffentlicht – **Entwurf ist neuer**"
stehen. (L)

### 6.8 Persönlicher Lernstand

| Nr. | Schritt | Erwartung |
| --- | --- | --- |
| 6.8.1 | Als „Fuchs" anmelden, Kurs öffnen, „Üben" | Runde startet |
| 6.8.2 | Ein paar Vokabeln beantworten | „Noch N in dieser Runde" zählt herunter |
| 6.8.3 | Runde beenden | „N Antworten in …" |
| 6.8.4 | „Noch eine Runde" | bei `beide Richtungen`: die produktive Richtung kommt dazu; bei `en-de`: „Gerade nichts fällig" samt Datum |
| 6.8.5 | Als „Dachs" anmelden | **eigener, leerer** Lernstand |
| 6.8.6 | Als Lehrkraft in die Mitgliederliste | weiterhin **keine** Zahl über das Üben |

### 6.9 Parallele Geräte und Revisionskonflikt

**Die Kernabnahme von Phase 6b.** Zwei Browser (oder ein normales und ein
privates Fenster), beide als „Fuchs" angemeldet.

| Nr. | Schritt | Erwartung |
| --- | --- | --- |
| 6.9.1 | In beiden dieselbe Runde öffnen, **noch nicht antworten** | beide zeigen denselben Stand |
| 6.9.2 | In Fenster A eine Vokabel **richtig** beantworten | |
| 6.9.3 | In Fenster B **dieselbe** Vokabel **falsch** beantworten | **kein sichtbarer Fehler** |
| 6.9.4 | In beiden neu laden | derselbe Stand; die falsche Antwort hat gewonnen, weil sie später kam |
| 6.9.5 | In der Datenbank nachsehen: | |

```sql
select entry_id, direction, box, rev, last_answered_at
  from entry_progress order by rev desc limit 5;

-- Erwartet: answered_count = Summe beider Antworten, nichts doppelt.
select answered_count, correct_count from pack_progress;
```

**Was hier bewiesen wird:** Der Konflikt wird aufgelöst, ohne dass die
lernende Person etwas merkt, und die Antwort zählt **genau einmal**. Lokal ist
das der Test `verbraucht die Ereigniskennung nicht, wenn der Schreibvorgang
abgelehnt wird` (L, P) – hier zum ersten Mal über echtes PostgREST.

**Gegenprobe:** Eine falsch gestellte Uhr darf nicht gewinnen. In einem Fenster
die Systemuhr um zwei Stunden vorstellen, dort antworten, dann im anderen
Fenster antworten – der **zuletzt gesendete** Stand gilt, nicht der mit der
späteren Uhrzeit.

### 6.10 Kurs archivieren und weiterlernen (ADR-12)

| Nr. | Schritt | Erwartung |
| --- | --- | --- |
| 6.10.1 | Als Lehrkraft „Englisch 7b" archivieren | „Dieser Kurs ist abgeschlossen … der Lernstand läuft mit" |
| 6.10.2 | Kurs umbenennen versuchen | **wird abgelehnt** |
| 6.10.3 | „Code erzeugen" | **nicht angeboten** |
| 6.10.4 | Alten Code in einem neuen Fenster einlösen | **abgelehnt** |
| 6.10.5 | Als „Fuchs" den Kurs öffnen | sichtbar, Hinweis „abgeschlossen" |
| 6.10.6 | **Weiter üben** | funktioniert, Lernstand wird gespeichert |
| 6.10.7 | Kurs wieder öffnen, umbenennen | funktioniert wieder |

### 6.11 KI-Zugang

**Mit einem neuen Schlüssel** – nicht mit dem kompromittierten (1.4.6).

| Nr. | Schritt | Erwartung |
| --- | --- | --- |
| 6.11.1 | Als Lehrkraft `/LexiFlow/portal/#/ki` | Satz „kommt nie wieder heraus" steht **vor** dem Feld |
| 6.11.2 | Anbieter „Google Gemini" | **kein** Adressfeld |
| 6.11.3 | Name + neuer Schlüssel + Modell, speichern | „Der Schlüssel ist von hier an nicht mehr lesbar" |
| 6.11.4 | Angezeigt wird nur `••••••••` + letzte vier Zeichen | |
| 6.11.5 | „Verbindung prüfen" | erster echter Anbieteraufruf überhaupt |
| 6.11.6 | Entwicklerwerkzeuge → Netzwerk | **kein** Aufruf an den Anbieter aus dem Browser; nur an `functions/v1/ai-gateway` |
| 6.11.7 | Anbieter „OpenAI-kompatibel", eigene Adresse `https://beliebig.example/v1/` | **„Dieser Host ist nicht freigegeben."** |

### 6.12 Mitgliedschaft entfernen → Schreibzugriff endet

| Nr. | Schritt | Erwartung |
| --- | --- | --- |
| 6.12.1 | Als Lehrkraft „Dachs" aus „Englisch 7b" entfernen | verschwindet aus der Liste |
| 6.12.2 | Als „Dachs" den Kurs öffnen | **nicht mehr sichtbar** |
| 6.12.3 | Falls noch eine Übungsseite offen ist: antworten | Hinweis „konnte nicht gespeichert werden" |
| 6.12.4 | In der Datenbank: alter Lernstand von Dachs | **bleibt stehen** – entfernt wurde der Zugriff, nicht die Vergangenheit |

---

## 7. Sicherheitsabnahme

Alles Stufe **S**, sofern nicht anders vermerkt.

### 7.1 Zugriffsregeln über PostgREST

Der eigentliche Test: **nicht** über die Oberfläche, sondern mit `curl` und dem
Publishable Key plus dem Zugangstoken einer angemeldeten Lehrkraft. (P lokal,
S über HTTP)

| Nr. | Anfrage | Erwartung |
| --- | --- | --- |
| 7.1.1 | `GET /rest/v1/pack_progress` als Lehrkraft | **leer**, nicht die Zeilen der Lernenden |
| 7.1.2 | `GET /rest/v1/entry_progress?user_id=eq.<fuchs>` als Lehrkraft | **leer** |
| 7.1.3 | `GET /rest/v1/pack_progress?select=count` als Lehrkraft | **0** – eine Zahl über jemanden ist auch eine Auskunft |
| 7.1.4 | dasselbe als Admin | **leer** – es gibt keine Rolle mit dieser Einsicht |
| 7.1.5 | `GET /rest/v1/ai_connections?select=secret_ciphertext` | **permission denied** |
| 7.1.6 | `GET /rest/v1/ai_connections?select=*` | **permission denied** |
| 7.1.7 | `GET /rest/v1/courses` ohne Token, nur mit Publishable Key | **leer** |
| 7.1.8 | `GET /rest/v1/auth_rate_limit` mit Token | **permission denied** |

### 7.2 JWT-Claims

| Nr. | Prüfung |
| --- | --- |
| 7.2.1 | Token im Browser auslesen, auf jwt.io **ohne Signaturprüfung** ansehen |
| 7.2.2 | `sub` ist die eigene `id`, `role` ist `authenticated` |
| 7.2.3 | **Keine** Anwendungsrolle (`teacher`/`admin`) im Token – sie steht in `profiles` und wird serverseitig gelesen |
| 7.2.4 | Token mit veränderter `sub` an PostgREST senden | **401**, Signatur passt nicht |

### 7.3 Edge Functions

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 7.3.1 | `POST /functions/v1/ai-gateway` ohne `Origin` | **403** |
| 7.3.2 | mit fremdem `Origin` | **403** |
| 7.3.3 | mit richtigem `Origin`, ohne `Authorization` | **401** |
| 7.3.4 | als **Lernende** mit gültigem Token | **403**, „Lehrkräften vorbehalten" |
| 7.3.5 | `{"aktion":"aufrufen","id":"<fremd>"}` | **404** |
| 7.3.6 | `learner-auth` mit falscher Lern-ID / falschem Kennwort / falschem Code | **derselbe** Status und Rumpf |
| 7.3.7 | 11-mal hintereinander anmelden | **429** |

### 7.4 Secret-Leaks

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 7.4.1 | Im Browser: Quelltext aller Portal-Bündel nach `sk-`, `sb_secret`, `service_role` durchsuchen | nichts |
| 7.4.2 | Nach `testkennwort`, `fuchs-7390`, `Testfassung ohne Server` | **nichts** – sonst wurde eine Testfassung deployt |
| 7.4.3 | Nach `LEXIFLOW_AI_MASTER_KEY` | nichts |
| 7.4.4 | Actions-Protokoll des Deploys durchsehen | keine Werte, nur Namen |
| 7.4.5 | `npm run verify:deploy` lokal nach `npm run build` | „Die Auslieferung ist in Ordnung." (L) |

### 7.5 SSRF-Schutz

Als Lehrkraft im KI-Formular, Anbieter „OpenAI-kompatibel". Jede Adresse muss
**abgelehnt** werden, mit einem Grund:

| Nr. | Adresse | Erwarteter Grund |
| --- | --- | --- |
| 7.5.1 | `http://api.openai.com/v1/` | nur HTTPS |
| 7.5.2 | `https://169.254.169.254/` | IP-Adresse |
| 7.5.3 | `https://127.0.0.1/v1/` | IP-Adresse |
| 7.5.4 | `https://[::1]/v1/` | IP-Adresse |
| 7.5.5 | `https://2130706433/v1/` | IP-Adresse |
| 7.5.6 | `https://metadata.google.internal/` | Host nicht freigegeben |
| 7.5.7 | `https://api.openai.com@boese.example/` | Zugangsdaten im URL |
| 7.5.8 | `https://api.openai.com.boese.example/` | Host nicht freigegeben |
| 7.5.9 | `https://api.openai.com:6379/` | nur Port 443 |

Dann einen Host **freigeben** und erneut prüfen:

```sql
insert into ai_allowed_hosts (host, approved_by)
values ('ki.schule.example', '<admin-uuid>');
```

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 7.5.10 | Als **Lehrkraft** einen Host eintragen wollen (PostgREST) | **abgelehnt** |
| 7.5.11 | Nach der Freigabe `https://ki.schule.example/v1/` speichern | angenommen |
| 7.5.12 | Host wieder entfernen, dann „Verbindung prüfen" | **abgelehnt**, ohne Grund zu nennen |

Zu 7.5.12: Beim Speichern nennt die Funktion den Grund (die Lehrkraft soll ihn
erfahren), beim Aufruf nicht – dort wäre er ein Scanner für das interne Netz.

> **DNS-Rebinding bleibt ungelöst** und ist nicht abnehmbar. Eingegrenzt allein
> durch die Freigabeliste. Siehe ADR-9.

### 7.6 KI-Schlüssel

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 7.6.1 | `select masked_secret from ai_connections` als Lehrkraft | nur die Maske |
| 7.6.2 | `select secret_ciphertext …` | **permission denied** |
| 7.6.3 | Mit Service Role: `secret_ciphertext` ansehen | Base64, **nicht** der Klartext |
| 7.6.4 | `secret_iv` bei zwei Verbindungen vergleichen | **verschieden** |
| 7.6.5 | Chiffretext von Verbindung A auf Verbindung B kopieren (Service Role), dann B aufrufen | **409**, „lässt sich nicht entsiegeln" |
| 7.6.6 | `LEXIFLOW_AI_MASTER_KEY_V1` löschen, Verbindung aufrufen | **503**; die Zeile **bleibt stehen** |
| 7.6.7 | Schlüssel wieder setzen | funktioniert wieder |

7.6.5 ist die Abnahme der AAD-Bindung, 7.6.6 die des kontrollierten Fehlers.

### 7.7 Rollen

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 7.7.1 | Als Lernende `#/kurse` aufrufen | Umleitung, kein Lehrkraftbereich |
| 7.7.2 | Als Lernende `#/ki` aufrufen | kein Zugang |
| 7.7.3 | Netzwerkverlauf einer lernenden Person | **kein** `TeacherArea`-Bündel geladen |
| 7.7.4 | `update profiles set role='teacher' where id=<selbst>` per PostgREST | **abgelehnt** |

### 7.8 Der Service Worker

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 7.8.1 | `/LexiFlow/` besuchen, warten bis der Worker aktiv ist | |
| 7.8.2 | Dann `/LexiFlow/portal/` aufrufen | **das Portal**, nicht die PWA (L) |
| 7.8.3 | PWA installieren, dann 7.8.2 wiederholen | dasselbe |

### 7.9 E-Mail-Wiederherstellung (nur mit SMTP)

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 7.9.1 | Als Lehrkraft „Kennwort vergessen" | E-Mail kommt an |
| 7.9.2 | Link öffnen | landet auf `#/kennwort-neu`, Route hat überlebt |
| 7.9.3 | Adresszeile nach dem Laden ansehen | **kein** `?code=` mehr |
| 7.9.4 | Als **Lernende** nach Wiederherstellung suchen | Weg über den Wiederherstellungscode, **keine** E-Mail |

---

## 8. Safari und Mobil

Safari ist Pflichtfall seit Sprint 1.

| Nr. | Gerät / Browser | Prüfung |
| --- | --- | --- |
| 8.1 | Safari (macOS) | `/LexiFlow/` – Paket anlegen, üben, Lernstand bleibt nach Neuladen |
| 8.2 | Safari (macOS) | `/LexiFlow/portal/` – anmelden, üben, Lernstand bleibt |
| 8.3 | Safari (macOS), privates Fenster | Portal lädt und sagt verständlich, wenn Speicher fehlt |
| 8.4 | Safari (iOS) | beide Adressen, Anmeldung, eine Übungsrunde |
| 8.5 | Safari (iOS) | kein horizontaler Überlauf auf keiner Portalseite |
| 8.6 | Chrome (Android) | dasselbe |
| 8.7 | iOS, 390 px | Kursseite, Beitrittsseite, Übungsseite, KI-Seite |
| 8.8 | iOS | die untere Navigationsleiste erscheint statt der Seitenschiene |
| 8.9 | iOS | **Abmelden** ist erreichbar – auf schmalen Fenstern nicht in der Leiste (bekannt) |
| 8.10 | Safari | eine portable Lerndatei per `file://` öffnen und üben |
| 8.11 | iOS | eine portable Lerndatei aus „Dateien" öffnen |
| 8.12 | VoiceOver (iOS) | eine Übungsrunde bedienen |

Zu 8.9: In der unteren Leiste gibt es kein „Abmelden". Für Staging genügt es,
das zu wissen; ob es ein Mangel ist, ist eine fachliche Frage.

Zu 8.10/8.11: Die portablen Dateien sind von Supabase unabhängig. Sie müssen
sich genauso verhalten wie vor Sprint 5A – die Größen sind unverändert
(9482,3 KiB / 674,7 KiB).

---

## 9. Rückbauplan

**Voraussetzung: Es ist nichts zu verlieren.** `main` ist unangetastet, es gibt
keinen Remote, und das Staging enthält nur Testdaten.

### 9.1 Sofort abbrechen, wenn

| Zeichen | Bedeutung |
| --- | --- |
| Rotes Band „Testfassung ohne Server" auf der Live-Seite | eine Testfassung wurde deployt – **sofort** Pages abschalten |
| Ein Anbieterschlüssel im Bündel auffindbar | Schlüssel widerrufen, dann Ursache suchen |
| Eine Lehrkraft sieht einen fremden Lernstand | die Kernzusage ist verletzt – Projekt stilllegen, nichts löschen |
| `verify:deploy` bricht ab | **nicht** übergehen; die Meldung sagt, was gefunden wurde |

### 9.2 Pages zurücknehmen

| Nr. | Schritt |
| --- | --- |
| 9.2.1 | Settings → Pages → Source auf „None" |
| 9.2.2 | Laufende Actions abbrechen |
| 9.2.3 | Der Zweig bleibt; nur die Auslieferung endet |

### 9.3 Supabase zurückbauen

| Nr. | Schritt |
| --- | --- |
| 9.3.1 | Edge Functions löschen (`learner-auth`, `ai-gateway`) |
| 9.3.2 | Alle Function Secrets löschen – **besonders** `LEXIFLOW_AI_MASTER_KEY_V1` |
| 9.3.3 | Publishable und Secret Key rotieren |
| 9.3.4 | Jeden KI-Anbieterschlüssel **beim Anbieter widerrufen**, der eingetragen war |
| 9.3.5 | Staging-Projekt löschen, wenn es nicht weiterverwendet wird |

Zu 9.3.4: Ein Schlüssel, der auf einem Server lag, ist durch Löschen der
Datenbank nicht widerrufen.

### 9.4 Git zurückbauen

| Nr. | Schritt |
| --- | --- |
| 9.4.1 | `git remote remove origin` |
| 9.4.2 | Den Zweig auf GitHub löschen – **nicht** lokal |
| 9.4.3 | `main` war nie beteiligt und bleibt, wie es ist |
| 9.4.4 | **Kein** `push --force`, **kein** History-Rewrite |

### 9.5 Was bleibt

Das Produkt. `/LexiFlow/` ohne Konto und beide portablen Dateien brauchen nichts
von alledem. Ein gescheitertes Staging nimmt LexiFlow nichts weg.

---

## 10. Checkliste „bereit für den Merge nach main"

Erst abhaken, dann mergen. Ein „fast" zählt nicht.

### Werkstatt

- [ ] `ci.yml` grün auf dem Sprintzweig, auf GitHubs Hardware
- [ ] 2830 Prüfungen grün, keine übersprungen
- [ ] 159 E2E der kontofreien Anwendung **unverändert**
- [ ] 29 portable, 31 Portal-E2E grün
- [ ] `npm run verify:portable` – 32 Prüfungen, Größen 9482,3 / 674,7 KiB
- [ ] `npm run verify:deploy` in Ordnung

### Staging

- [ ] Abschnitt 6 vollständig, jeder Punkt einmal wirklich getan
- [ ] 6.9 (Revisionskonflikt) bestanden, auch die Uhren-Gegenprobe
- [ ] 6.10 (archivierter Kurs) bestanden
- [ ] 6.12 (Mitgliedschaft entfernt) bestanden
- [ ] Abschnitt 7 vollständig, besonders 7.1, 7.4, 7.5, 7.6
- [ ] Abschnitt 8 auf **echter** Safari-Hardware, nicht nur im Simulator

### Ehrlichkeit

- [ ] Was im Staging **nicht** geprüft werden konnte, ist aufgeschrieben
- [ ] Kein Punkt gilt als bestanden, weil er „eigentlich klar" ist
- [ ] Der kompromittierte Gemini-Schlüssel ist beim Anbieter widerrufen
- [ ] Kein Secret steht in einer Datei im Repository
- [ ] `docs/portal-datenschutz-und-sicherheit.md`, Abschnitt 1, ist auf den
      Stand nach dem Staging gebracht – dort steht heute, dass nichts gelaufen
      ist

### Entscheidungen, die vor dem Merge fallen sollten

- [ ] Soll ein Trigger Profile für neue Konten anlegen? (0.3.2)
- [ ] Soll „Abmelden" auch in die untere Navigationsleiste? (8.9)
- [ ] Bleibt `deploy.yml` auf `push: main`, oder nur `workflow_dispatch`?

### Der Merge

- [ ] `main` ist weiterhin Vorfahr von HEAD → Fast-Forward
- [ ] Merge **ohne** `--squash` – die 17 Commits erzählen den Sprint
- [ ] Tag erst **nach** grünem Deploy
- [ ] Erst dann ist `docs/portal-uebergabe.md`, Abschnitt 8, überholt

---

## 11. Was dieses Dokument nicht kann

Es kann nicht sagen, ob das Staging gelingt. Jede Zeile über Supabase, GitHub
Pages und die Edge-Laufzeit ist aus dem Code abgeleitet, nicht aus Erfahrung
mit diesem Projekt in Betrieb – es gibt keine.

Der erste Mensch, der Abschnitt 6 und 7 abarbeitet, wird Dinge finden, die hier
nicht stehen. Das ist kein Mangel der Anleitung, sondern der Grund, warum es
ein Staging gibt.
