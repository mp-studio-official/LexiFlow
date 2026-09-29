# Sprint 5A in Betrieb nehmen: lokales Staging, dann GitHub Pages

Eine nummerierte Anleitung für Marc. **Nichts davon ist gelaufen.** Wer sie
abarbeitet, führt jeden Schritt zum ersten Mal aus und prüft damit zum ersten
Mal, was bisher nur lokal geprüft ist.

Ergänzt `docs/portal-uebergabe.md` (der kurze Überblick) und
`docs/portal-datenschutz-und-sicherheit.md` (was gespeichert wird und wer es
sieht). Diese Datei hier ist die ausführliche, abhakbare Fassung.

---

## 0. Ausgangslage – geprüft am 13.09.2026

| | |
| --- | --- |
| Branch | `sprint/5a-cloud-portal-foundation` |
| HEAD | `9987b70` (vor diesem Dokumentationscommit) |
| Working Tree | sauber |
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
| **S – nur mit echtem Supabase nachweisbar** | Alles, was zwischen Browser und SQL liegt. | **seit 29.09.2026 in weiten Teilen belegt** – siehe 0.5 |

### 0.2b Was inzwischen wirklich gelaufen ist

Dieses Dokument war bis zum 29.09.2026 eine Anleitung, deren Schritte niemand
ausgeführt hatte. Das gilt nicht mehr, und wo es nicht mehr gilt, steht es
jetzt auch da. Der Stand ist in **0.5** zusammengefasst; die einzelnen
Abschnitte tragen ihn an Ort und Stelle.

### 0.3 Die Reihenfolge – und warum GitHub Pages erst spät kommt

**Vor dem Merge wird nicht über GitHub Pages geprüft.** Der Grund ist eine
Eigenheit von GitHub Actions, nicht eine Vorsichtsmaßnahme:

> Ein Ablauf mit `workflow_dispatch` bekommt seinen „Run workflow"-Knopf in der
> Oberfläche nur, wenn **seine Datei auf dem Default-Branch liegt**. Für einen
> Zweig lässt er sich dann zwar auswählen, aber der Knopf selbst erscheint erst
> mit der Datei auf `main`. `deploy.yml` liegt heute ausschließlich auf dem
> Sprintzweig – und `main` soll unangetastet bleiben.

Daraus folgt die Reihenfolge:

| Schritt | Wo | Abschnitt |
| --- | --- | --- |
| 1 | Supabase-Stagingprojekt anlegen | 2, 3 |
| 2 | **Lokal gebautes Portal** dagegen laufen lassen | 5 |
| 3 | Vollständige Abnahme gegen das lokale Portal | 6, 7, 8 |
| 4 | Erst wenn grün: **Fast-Forward nach `main`** | 9 |
| 5 | Erstes GitHub-Pages-Deployment | 10 |
| 6 | Abschließende Abnahme auf den echten Adressen | 11 |

Was sich damit **nicht** verschiebt: Das lokale Portal läuft gegen dasselbe
echte Supabase-Projekt. Auth, JWT, PostgREST, Zugriffsregeln, Edge Functions,
Wiederherstellung, Lernstandsfassungen und das KI-Gateway sind damit vollständig
geprüft, bevor irgendetwas nach `main` geht. Offen bleibt nur, was an der
**Auslieferung** hängt: echte Adressen, Grundpfad, Direktaufrufe, Neuladen,
Service Worker.

### 0.4 Zwei Lücken, die dieses Dokument schließt

Beim Zusammenstellen sind zwei Dinge aufgefallen, die im Code **absichtlich**
fehlen und deshalb im Staging von Hand zu tun sind:

1. **Es gibt keine Selbstregistrierung für Lehrkräfte.** Die Anmeldeseite kann
   nur `signInWithEmail`. Ein Lehrkraftkonto entsteht im Supabase-Dashboard –
   nicht in der Anwendung. Das ist richtig so (wer sich selbst zur Lehrkraft
   machen kann, sieht fremde Kursmitglieder).
2. **Es gibt keinen Trigger, der beim Anlegen eines Kontos ein Profil
   erzeugt.** Für Lernende macht das `create_learner_account`; für Lehrkräfte
   macht es niemand. Ohne Profilzeile gibt `app_my_role()` nichts zurück, und
   die Lehrkraft kann keinen Kurs anlegen.

**Für dieses Staging mit *einer* Lehrkraft ist Handarbeit freigegeben** –
Dashboard plus das dokumentierte SQL in 6.1/6.2. Beides im Dashboard: das
Konto über Authentication → Users, die Profilzeile über den SQL-Editor. **Der
Secret Key wird dafür nicht herausgegeben**, siehe den Kasten in 1.4.

> **Aber sie ist ein Blocker für mehr.** Siehe Abschnitt 14: Vor einer
> Weitergabe an mehrere Lehrkräfte muss die manuelle Konto- und
> Profilerstellung durch einen kontrollierten Admin-Prozess ersetzt werden.

---

### 0.5 Stand 29.09.2026 – was im echten Stagingprojekt belegt ist

Ein Stagingprojekt existiert. Dieser Abschnitt sagt, was dort **wirklich
gelaufen** ist, und trennt es von dem, was weiterhin aussteht.

| Schritt | Stand |
| --- | --- |
| Projekt in Frankfurt angelegt | **belegt** |
| Migrationen 1–11 angewandt, über den SQL-Editor | **belegt** |
| Rechtestand, geschützte Spalten, Vorgaberechte (3.2.1–3.2.3) | **belegt** |
| Function Secrets `LEXIFLOW_ALLOWED_ORIGINS`, `LEXIFLOW_AI_MASTER_KEY_V1` gesetzt | **belegt** (dass der Hauptschlüssel *gelesen* wird, noch nicht) |
| Beide Edge Functions deployt, `verify_jwt = false` aktiv | **belegt**, siehe 3.5 |
| Portal als Produktionsbuild unter `/LexiFlow/portal/` | **belegt**, kein Testfassungsband, keine Schlüssel im Bündel |
| Admin- und Lehrkraftkonto, Rollenauflösung, PostgREST, RLS | **belegt**, siehe 6.1–6.3 |
| Kurs, Einladungscode, zwei Lernendenkonten, Beitritt | **belegt**, siehe 6.4–6.6 |
| Mitgliedschaft entfernen → Zugriff endet, Lernstand bleibt | **belegt**, siehe 6.12 |
| Paket veröffentlichen, beide Lernrichtungen (6.7) | offen |
| Persönlicher Lernstand über zwei Geräte, Revisionskonflikt (6.8, 6.9) | offen |
| Kurs archivieren und weiterlernen (6.10) | offen |
| KI-Zugang mit echtem Anbieterschlüssel (6.11) | offen |
| Sicherheitsabnahme (Abschnitt 7) | teilweise – siehe dort |
| Safari und Mobil (Abschnitt 8) | offen |
| Merge, Tag, GitHub Pages (9, 10) | offen |

> ### Ein Befund, der dabei gefunden und behoben wurde
>
> Am 29.09.2026 zeigte sich beim Entfernen einer lernenden Person aus einem
> Kurs: Kurs und Pakete verschwanden für sie, **der Lernstand nicht**. Er war
> weiter lesbar, und `begin_practice_session` zählte weiter hoch.
>
> Ursache waren zwei verschiedene Löcher. Die Zugriffsregel auf
> `pack_progress` und `entry_progress` fragte nur `user_id = auth.uid()` und
> nie, ob die Person noch Mitglied ist. Und zwei RPCs sind `security definer`
> – sie umgehen jede Zugriffsregel und prüften selbst nur, ob überhaupt jemand
> angemeldet ist.
>
> **Migration 11** schließt beides über eine einzige Funktion
> (`app_may_touch_progress`), nimmt `authenticated` die direkten Schreibrechte
> auf den Lernstandstabellen und verlangt beim Anlegen einer Runde zusätzlich
> eine gültige Paketzuweisung (`app_pack_is_assigned`). Die Abnahme dazu steht
> in 6.12.

---

## 1. Was Marc anlegen oder bereitstellen muss

### 1.1 Konten

| Nr. | Was | Wo | Anmerkung |
| --- | --- | --- | --- |
| 1.1.1 | Supabase-Konto | supabase.com | falls noch nicht vorhanden |
| 1.1.2 | GitHub-Konto `mp-studio-official` | github.com | vorhanden |
| 1.1.3 | E-Mail für das **Admin**-Testkonto | frei wählbar | erreichbar nur nötig, wenn E-Mail-Wiederherstellung geprüft wird |
| 1.1.4 | E-Mail für das **Lehrkraft**-Testkonto | frei wählbar | muss von 1.1.3 verschieden sein |

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
| 1.3.2 | **Lokale Herkunft** (Phase 2–3 der Reihenfolge) | `http://localhost:4173` |
| 1.3.3 | Lokal: kontofreie PWA | `http://localhost:4173/LexiFlow/` |
| 1.3.4 | Lokal: Portal | `http://localhost:4173/LexiFlow/portal/` |
| 1.3.5 | Lokal: Rückkehradresse Kennwort | `http://localhost:4173/LexiFlow/portal/#/kennwort-neu` |
| 1.3.6 | Später: Pages-Herkunft | `https://mp-studio-official.github.io` |
| 1.3.7 | Später: kontofreie PWA | `https://mp-studio-official.github.io/LexiFlow/` |
| 1.3.8 | Später: Portal | `https://mp-studio-official.github.io/LexiFlow/portal/` |
| 1.3.9 | Später: Rückkehradresse Kennwort | `https://mp-studio-official.github.io/LexiFlow/portal/#/kennwort-neu` |

**Beide Herkünfte** (1.3.2 und 1.3.6) gehören in die Allowlists – die lokale
von Anfang an, die Pages-Herkunft spätestens vor Abschnitt 10.

### 1.4 Secrets und Werte

**Keiner dieser Werte gehört in diesen Chat.** Marc trägt sie direkt in
Supabase beziehungsweise GitHub ein; unten steht jeweils, wo.

| Nr. | Name | Art | Wo eintragen |
| --- | --- | --- | --- |
| 1.4.1 | Projekt-URL | öffentlich | lokale `.env`, später GitHub → Variables, und Supabase-Funktionen |
| 1.4.2 | Publishable Key (früher „anon") | öffentlich | dito |
| 1.4.3 | Secret Key (früher „service_role") | **geheim** | **nirgends von Hand** – die Edge-Laufzeit injiziert ihn (3.4) |
| 1.4.4 | `LEXIFLOW_ALLOWED_ORIGINS` | unkritisch | Supabase → Edge Function Secrets |
| 1.4.5 | `LEXIFLOW_AI_MASTER_KEY_V1` | **geheim** | nur Supabase → Edge Function Secrets |
| 1.4.6 | KI-Anbieterschlüssel | **geheim** | **nicht hier** – die Lehrkraft trägt ihn im Portal ein (6.11); er landet verschlüsselt in der Datenbank |

> ### Vier Schlüsselklassen, vier verschiedene Wege
>
> „Gehört nicht in Supabase" ist für den Anbieterschlüssel **falsch** – er wird
> dort sehr wohl gespeichert. Was nicht passiert, ist etwas anderes: Er wird
> nicht von Hand eingetragen und ist kein gemeinsames Projekt-Secret. Die
> Unterscheidung ist nicht akademisch, denn sie entscheidet, wer ihn lesen kann.
>
> | Schlüssel | Wo er eingegeben wird | Wo er liegt | Wer ihn im Klartext bekommt |
> | --- | --- | --- | --- |
> | **Anbieterschlüssel** (je Lehrkraft) | Portalformular der Lehrkraft | `ai_connections.secret_ciphertext`, AES-GCM-versiegelt | nur die vorgesehene Edge Function, im Arbeitsspeicher, für einen Aufruf |
> | **Hauptschlüssel** `LEXIFLOW_AI_MASTER_KEY_V1` | Supabase → Edge Function Secrets | nur dort | nur die Laufzeit der Funktion |
> | **Publishable Key** | `.env`, GitHub → Variables | im ausgelieferten Bündel | jeder – **so gedacht** |
> | **Secret Key** (`service_role`) | Supabase → Edge Function Secrets | nur dort | nur die Laufzeit der Funktion |
>
> Der Weg des Anbieterschlüssels ist also: **Browser → Edge Function →
> versiegelt in die Datenbank.**
>
> Was daraus **nicht** folgt: dass er als Function Secret abgelegt werden
> dürfte. Ein Function Secret gilt projektweit; der Anbieterschlüssel gehört
> einer Lehrkraft und wird pro Verbindung an ihre Kennung gebunden (AAD,
> siehe 7.6.3 bis 7.6.5).

> ### Wogegen die Verschlüsselung schützt – und wogegen nicht
>
> Eine frühere Fassung dieses Abschnitts behauptete, den Anbieterschlüssel
> könne **niemand** lesen, „auch nicht mit Dashboard-Zugang". Das war zu viel
> versprochen. Was tatsächlich gilt:
>
> | | |
> | --- | --- |
> | Der Schlüssel liegt **nicht im Klartext** in der Datenbank | |
> | Reiner Datenbankzugriff, ein `select`, ein Dump oder ein Backup zeigen **nur den Chiffretext** | der Hauptschlüssel liegt nicht in der Datenbank, sondern in den Function Secrets |
> | Entsiegelt wird **ausschließlich** innerhalb der vorgesehenen Edge Function | und nur für die Dauer eines Aufrufs |
>
> **Die Grenze.** Wer vollständige Kontrolle über das Supabase-Projekt hat –
> also über Function-Code *und* Function Secrets – kann eine Funktion
> deployen, die den Hauptschlüssel liest und Anbieterschlüssel im Klartext
> ausgibt. Dagegen schützt keine Verschlüsselung, die den Schlüssel im selben
> Projekt aufbewahrt, und dieses Dokument behauptet das auch nicht.
>
> Die Verschlüsselung schützt also gegen **Datenbanklecks, weitergegebene
> Dumps, Backups in falschen Händen und versehentliche Offenlegung** – nicht
> gegen einen böswilligen oder kompromittierten Projektadministrator. Wer das
> auch abdecken will, braucht ein Schlüsselmaterial außerhalb von Supabase
> (KMS/HSM); das ist bewusst nicht Teil dieses Sprints.
>
> Für Lehrkräfte heißt das im Klartext: Ihr Anbieterschlüssel ist vor anderen
> Lehrkräften, vor Lernenden und vor einem Datenbankleck geschützt. Er ist
> nicht vor dem geschützt, der das Projekt betreibt. Die Portaltexte dürfen
> nicht mehr versprechen als das.

> ### Zum Secret Key: zwei Dinge, die oft verwechselt werden
>
> **Erhöhte Rechte im Dashboard** und **den Schlüssel in der Hand haben** sind
> nicht dasselbe. Der SQL-Editor im Supabase-Dashboard arbeitet an den
> Zugriffsregeln vorbei, weil er *innerhalb* von Supabase läuft – angemeldet
> über Marcs Supabase-Konto, protokolliert, jederzeit entziehbar. Der
> Schlüssel selbst wird dabei nirgendwohin kopiert.
>
> Der Secret Key aus 1.4.3 dagegen ist ein Wert, der wandert. Wo er ankommt,
> ist er dauerhaft, unprotokolliert und nicht einzeln zurückziehbar.
>
> **Daraus folgt für dieses Dokument:** Der Secret Key wird an genau einer
> Stelle eingetragen – Supabase → Edge Function Secrets – und sonst nirgends.
> Für die Handarbeit in 6.1/6.2 wird er **nicht gebraucht**; sie läuft
> vollständig über Dashboard und SQL-Editor. Wer ihn dafür herauskopiert, tut
> mehr als nötig.

> ### ⚠ Der früher im Chat gepostete Gemini-Schlüssel
>
> Er gilt als **kompromittiert** und wird hier nirgends verwendet. Für ihn gilt
> die Tabelle oben **nicht**: Auch der ordentliche Weg über das Portalformular
> ist ihm verschlossen. Ein verbrannter Schlüssel wird durch sorgfältige
> Aufbewahrung nicht wieder gut – wer ihn kennt, ruft den Anbieter auf Marcs
> Rechnung, ganz ohne LexiFlow.
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
| 2.2 | Region **Frankfurt (eu-central-1)** wählen | steht nachträglich nicht mehr um |
| 2.3 | Datenbankkennwort erzeugen, in den Passwortmanager | nicht im Chat, nicht in einer Datei im Repository |
| 2.4 | Warten, bis das Projekt bereit ist | |
| 2.5 | Projekt-URL notieren (1.3.1) | |
| 2.6 | Publishable Key und Secret Key holen | **nur der Publishable Key** darf ins Bündel |

> **Zur Region.** Frankfurt ist richtig und ist trotzdem **kein
> Datenschutznachweis**. Ohne sie fängt die Prüfung nicht an; mit ihr ist sie
> nicht fertig. Siehe `docs/portal-datenschutz-und-sicherheit.md`, Abschnitt 8.

> **Zu den Schlüsselnamen.** Supabase hat die Benennung gewechselt: ältere
> Projekte zeigen `anon` und `service_role`, neuere `publishable` und `secret`.
> Gemeint ist dasselbe Paar.
>
> In den Edge Functions kommt eine zweite Verschiebung dazu: Die Laufzeit
> injiziert heute `SUPABASE_PUBLISHABLE_KEYS` und `SUPABASE_SECRET_KEYS` – in
> der **Mehrzahl**, und als JSON-Wörterbuch mit dem Eintrag `default`. Welchen
> Namen der Code in welcher Reihenfolge liest, steht im Kasten bei 3.4.
>
> Der Publishable Key wird trotzdem hier notiert: Das **Frontend** braucht ihn
> als `VITE_SUPABASE_PUBLISHABLE_KEY` (4.1, 4.2), und dort injiziert ihn
> niemand.

---

## 3. Reihenfolge: Migrationen, Zugriffsregeln, Auth, Edge Functions

**Die Reihenfolge ist nicht beliebig.** Jeder Schritt setzt den vorigen voraus.

### 3.1 Migrationen (zuerst)

**Elf** Dateien aus `supabase/migrations/`, **in der Reihenfolge ihrer
Namen**:

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
| 3.1.9 | `20260920090000_dienstrechte.sql` | die Rechte der **Serverfunktionen** |
| 3.1.10 | `20260920140000_rechte_zuruecksetzen.sql` | Rechte **abräumen** und neu aufbauen |
| 3.1.11 | `20260929170000_lernstandszugriff.sql` | Lernstand braucht eine **Mitgliedschaft** |

**Datei für Datei im SQL-Editor.** Nicht über `supabase db push`.

> ### Warum `db push` hier nicht benutzt werden darf
>
> **Belegt am 29.09.2026:** `npx supabase@latest migration list` zeigt für
> alle elf lokalen Dateien eine **leere Remote-Spalte**. Die zehn ersten
> wurden über den SQL-Editor eingespielt und stehen deshalb nicht in
> `supabase_migrations.schema_migrations` – der Historie, aus der die CLI
> ihren Abgleich bildet.
>
> Für die CLI sind damit **alle elf offen**. Ein `db push` spielte sie alle
> ein: auf eine Datenbank, in der zehn davon längst wirken. Was dabei
> passiert, hängt an jeder einzelnen Anweisung – `create table` bricht ab,
> `create or replace function` läuft durch, ein `insert` verdoppelt.
> Vorhersagen lässt sich das nicht, und eine Migration, deren Wirkung man
> nicht vorhersagen kann, führt man nicht aus.
>
> **Der Weg dahin, dass `db push` wieder benutzbar wird**, ist eine
> kontrollierte Angleichung der Historie: die bereits angewandten Dateien mit
> `supabase migration repair --status applied <version>` als erledigt
> eintragen und erst danach `migration list` zur Kontrolle. Das ist ein
> eigener Vorgang mit eigener Abnahme und **nicht** Teil dieses Dokuments.
>
> Bis dahin gilt: **SQL-Editor, Datei für Datei, in der Reihenfolge der
> Namen.**

> ### Zu 3.1.9 und 3.1.10 – zwei Nachzügler, ein Grund
>
> Die ersten acht vergeben Rechte an `anon` und `authenticated`. Die beiden
> Serverfunktionen sprechen aber als **`service_role`**, und für die stand in
> keiner Migration ein `grant`. **3.1.9** hat das nachgeholt.
>
> Beim echten Staging zeigte sich, dass das die halbe Antwort war. Im
> Stagingprojekt waren Vorgaberechte dieser Form wirksam:
>
> ```sql
> alter default privileges for role postgres in schema public
>   grant all on tables to anon, authenticated, service_role;
> ```
>
> Migrationen laufen als `postgres`. **Jede Tabelle, die eine Migration
> anlegt, ist im Moment ihrer Entstehung bereits für alle drei Rollen
> freigegeben** – mit `select, insert, update, delete, truncate, references,
> trigger`, bevor in der Migration ein `grant` steht.
>
> **Was belegt ist:** Die Kontrollabfrage zeigt diese Rechte im echten
> Projekt. Beim Anlegen der Tabellen waren die Vorgaberechte also wirksam.
>
> **Was nicht belegt ist:** *warum*. Die Einstellung „Automatically expose new
> tables" im Erstellungsdialog – in Supabases Dokumentation „Default
> privileges for new entities" – beschreibt genau diese Vergabe an die
> Data-API-Rollen, und sie war beim Anlegen des Projekts abgewählt. Ob sie
> nicht gespeichert wurde, anders gesetzt war oder die Plattform sich anders
> verhielt, lässt sich aus der Datenbank nicht ablesen. Die Liste
> veröffentlichter Schemata ist eine **andere** Einstellung und hat damit
> nichts zu tun.
>
> **Was folgt:** LexiFlow verlässt sich nicht mehr darauf. `grant` ergänzt
> nur, 3.1.9 konnte davon also nichts wegnehmen. **3.1.10** räumt zuerst ab,
> vergibt die genaue Matrix neu und setzt eigene Vorgaberechte. Der
> Rechtestand ist danach unabhängig davon, wie ein Projekt erstellt wurde.
>
> Dabei kam ein zweiter Fall heraus, der nicht gemeldet war: `…120200` räumt
> für `anon` und `authenticated` ab – aber als **dritte von zehn**.
> `learner_accounts` (4), `auth_rate_limit` (5), `ai_connections` und
> `ai_allowed_hosts` (8) entstehen danach und behielten ihre Vorgaberechte.
> Gemessen hieß das: eine lernende Person konnte ihren eigenen
> `recovery_code_hash` lesen, eine Lehrkraft die Siegelspalten ihrer eigenen
> KI-Verbindungen lesen **und schreiben**. Beides Zusagen aus den Migrationen
> 4 und 8, beide wirkungslos. 3.1.10 stellt sie her.
>
> **Wer bei Migration 5 oder 9 stehen geblieben ist**, wendet einfach die
> fehlenden der Reihe nach an. Beide Nachzügler legen nichts an und ändern
> keine Datenzeile – sie vergeben und entziehen ausschließlich Rechte. Die
> bereits angewandten bleiben unangetastet.

> **Ab dem ersten Anwenden sind Migrationen additiv.** Bis hierher wurden sie
> beim Weiterbauen in sich geändert – das ging, weil es nirgends eine Datenbank
> gab, auf der sie schon gelaufen wären. Ab jetzt wäre eine geänderte Datei
> zwei verschiedene Schemata unter demselben Namen.
>
> **Was das genau heißt – und was nicht.** Es heißt: Eine bereits angewandte
> Datei wird nicht mehr nachträglich verändert. Korrekturen kommen als **neue**
> Migration mit neuem Zeitstempel dazu; die alte bleibt stehen, auch wenn sie
> etwas anlegt, das die neue sofort wieder ändert. Das ist unbequem zu lesen
> und dafür überall gleich.
>
> Es heißt **nicht**, dass ein Fehler unumkehrbar wäre. Für ein Stagingprojekt
> ohne echte Daten bleiben zwei Wege offen: ein Backup einspielen, oder das
> Projekt wegwerfen und die elf Migrationen auf einem frischen anwenden. Das
> zweite kostet eine halbe Stunde und ist oft das ehrlichere Ergebnis.
>
> Teuer wird das Zurückrollen erst, wenn echte Lernstände in der Datenbank
> liegen. Genau deshalb steht in Abschnitt 14, dass vor einem Pilotbetrieb
> mehr zu klären ist als die Kontoanlage.

### 3.2 Zugriffsregeln prüfen (nicht einschalten)

Die Regeln kommen **mit** den Migrationen. Zu prüfen ist nur, dass sie
angekommen sind:

```sql
-- Erwartet: keine Zeile.
select tablename from pg_tables
 where schemaname = 'public'
   and not exists (
     select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = pg_tables.tablename
        and c.relrowsecurity
   );

-- Erwartet: je eine Regel, cmd = 'ALL'.
select tablename, cmd, count(*) from pg_policies
 where schemaname = 'public'
   and tablename in ('pack_progress','entry_progress','progress_events')
 group by 1,2;
```

### 3.2.1 Der Rechtestand – **eine** Abfrage

Eigener Schritt, weil hier zweimal eine Lücke saß. Diese Abfrage vergleicht
den gesamten Rechtestand mit dem, was die Migrationen vorsehen, und liefert
**nur Abweichungen**.

> **Richtig ist: keine einzige Zeile.** Jede Zeile ist ein Befund – gleich,
> ob sie zu viel oder zu wenig meldet.

```sql
with erwartet (rolle, tabelle, rechte) as (values
  ('service_role','profiles','SELECT'),
  ('service_role','learner_accounts','SELECT'),
  ('service_role','ai_connections','DELETE,INSERT,SELECT,UPDATE'),
  ('service_role','ai_allowed_hosts','SELECT'),
  ('authenticated','profiles','INSERT,SELECT'),
  ('authenticated','courses','DELETE,INSERT,SELECT,UPDATE'),
  ('authenticated','course_members','DELETE,INSERT,SELECT'),
  ('authenticated','course_invites','INSERT,SELECT,UPDATE'),
  ('authenticated','packs','DELETE,INSERT,SELECT,UPDATE'),
  ('authenticated','pack_drafts','DELETE,INSERT,SELECT,UPDATE'),
  ('authenticated','pack_revisions','INSERT,SELECT,UPDATE'),
  ('authenticated','course_packs','DELETE,INSERT,SELECT,UPDATE'),
  ('authenticated','pack_progress','DELETE,INSERT,SELECT,UPDATE'),
  ('authenticated','entry_progress','DELETE,INSERT,SELECT,UPDATE'),
  ('authenticated','progress_events','INSERT,SELECT'),
  ('authenticated','ai_allowed_hosts','DELETE,INSERT,SELECT,UPDATE'),
  ('authenticated','ai_connections','DELETE')
  -- `anon` steht absichtlich nirgends: keine Tabelle, kein Recht.
  -- `learner_accounts` und `ai_connections` haben für `authenticated`
  -- zusätzlich Spaltenrechte; die prüft 3.2.2.
),
ist as (
  select grantee::text as rolle, table_name::text as tabelle,
         string_agg(distinct privilege_type, ',' order by privilege_type) as rechte
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon','authenticated','service_role')
   group by 1,2
)
select coalesce(i.rolle, e.rolle) as rolle,
       coalesce(i.tabelle, e.tabelle) as tabelle,
       coalesce(e.rechte, '— keines vorgesehen —') as soll,
       coalesce(i.rechte, '— fehlt —') as ist
  from ist i full outer join erwartet e
    on e.rolle = i.rolle and e.tabelle = i.tabelle
 where i.rechte is distinct from e.rechte
 order by 1, 2;
```

**Wie die Zeilen zu lesen sind:**

| Was dasteht | Was es heißt |
| --- | --- |
| `soll` zeigt „keines vorgesehen" | ein Recht, das niemand geschrieben hat – 3.1.10 fehlt oder lief nicht durch |
| `ist` nennt `TRUNCATE`, `TRIGGER` oder `REFERENCES` | Supabases Vorgaberechte stehen noch |
| `ist` zeigt „fehlt" | eine Vergabe aus 3.1.10 ist nicht angekommen; das Portal wird Fehler werfen |
| `anon` taucht überhaupt auf | `anon` soll **keine** Tabelle haben |

> **Zwei frühere Fassungen dieses Abschnitts haben hier etwas Falsches
> behauptet**, und beide Male war der Fehler derselbe: aus einer Beobachtung
> eine Ursache zu machen.
>
> Zuerst hieß es, überzählige Rechte bedeuteten, „Automatically expose new
> tables" sei eingeschaltet. Dann hieß es, diese Einstellung habe mit den
> Vorgaberechten nichts zu tun. **Beides war unbelegt.** Der Erstellungsdialog
> beschreibt die Einstellung ausdrücklich als die, die den Data-API-Rollen
> Rechte auf neue Tabellen gibt; Supabases Dokumentation nennt sie „Default
> privileges for new entities".
>
> Was diese Abfrage zeigt, ist der **Zustand**, nicht seine Ursache. Sie sagt,
> ob der Rechtestand stimmt – und das ist alles, was sie für die Abnahme sagen
> muss. Nach 3.1.10 hängt er nicht mehr an der Projekteinstellung.

### 3.2.2 Die drei geschützten Spalten

Die Abfrage oben sieht Tabellen, nicht Spalten. Zwei Zusagen hängen aber an
Spaltenrechten:

```sql
-- Erwartet: keine Zeile.
select grantee, table_name, column_name, privilege_type
  from information_schema.role_column_grants
 where table_schema = 'public'
   and grantee in ('anon', 'authenticated')
   and (
     (table_name = 'learner_accounts' and column_name = 'recovery_code_hash')
     or (table_name = 'ai_connections'
         and column_name in ('secret_ciphertext','secret_iv','secret_key_version'))
   );

-- Erwartet: false, dreimal.
select has_table_privilege('service_role','entry_progress','select') as lernstand,
       has_table_privilege('anon','learner_accounts','truncate')     as anon_truncate,
       has_function_privilege('anon','invite_code_hash(text)','execute') as anon_hash;
```

> Die erste Abfrage ist die, die im Stagingprojekt vor 3.1.10 Zeilen geliefert
> hätte. Der Hash ist der, von dem `…120300` schreibt: „Ohne dieses
> Spaltenrecht könnte jede lernende Person ihren eigenen Code-Hash lesen und
> in Ruhe durchprobieren, bis der Klartext feststeht."

### 3.2.3 Die Vorgaberechte selbst — die wichtigste Abfrage

3.2.1 und 3.2.2 prüfen **bestehende** Objekte. Diese hier prüft, was die
**nächste** Migration erben wird. Sie ist die einzige, die den Unterschied
sichtbar macht, an dem eine frühere Fassung von 3.1.10 gescheitert wäre.

```sql
-- Erwartet: keine Zeile.
select
  eigentuemer.rolname as eigentuemer,
  coalesce(schema_name.nspname, '(global)') as geltungsbereich,
  case vorgabe.defaclobjtype
    when 'r' then 'Tabellen'
    when 'S' then 'Sequenzen'
    when 'f' then 'Funktionen'
    else vorgabe.defaclobjtype::text
  end as objektart,
  coalesce(empfaenger.rolname, 'PUBLIC') as empfaenger,
  recht.privilege_type
from pg_default_acl vorgabe
join pg_roles eigentuemer
  on eigentuemer.oid = vorgabe.defaclrole
left join pg_namespace schema_name
  on schema_name.oid = vorgabe.defaclnamespace
cross join lateral aclexplode(vorgabe.defaclacl) recht
left join pg_roles empfaenger
  on empfaenger.oid = recht.grantee
where eigentuemer.rolname = 'postgres'
  -- Nur, was LexiFlow betrifft: ohne Schemabezug oder in `public`.
  -- Alles andere gehört der Plattform. Siehe den Kasten unten.
  and (vorgabe.defaclnamespace = 0 or schema_name.nspname = 'public')
  and (
    empfaenger.rolname in ('anon', 'authenticated', 'service_role')
    or recht.grantee = 0
  )
order by geltungsbereich, objektart, empfaenger, recht.privilege_type;
```

> ### `storage` und die übrigen Plattformschemata bleiben unangetastet
>
> Ein Supabase-Projekt hat mehr Schemata als `public`: `storage`, `graphql`,
> `realtime`, `vault`, `extensions` und je nach Projekt weitere. Sie gehören
> der Plattform, nicht dieser Anwendung, und **ihre Vorgaberechte dürfen nicht
> verändert werden** — sie sind der Grund, warum Storage-Uploads, Realtime und
> die GraphQL-Schnittstelle überhaupt funktionieren. Wer dort abräumt, um eine
> Abfrage leer zu bekommen, repariert die Anzeige und zerbricht die Funktion.
>
> LexiFlow legt in keinem dieser Schemata etwas an. Migration 3.1.10 fasst sie
> auch nicht an: Sie nennt `in schema public` und die Form ohne Schemabezug,
> und beide berühren `storage` nicht.
>
> Deshalb die Zeile `defaclnamespace = 0 or nspname = 'public'`. Ohne sie
> meldete die Abfrage Vorgaberechte aus `storage` als Befund — und der
> naheliegende nächste Schritt wäre genau der falsche. Eine Kontrollabfrage,
> die zum Abräumen fremder Schemata einlädt, ist schlimmer als keine.
>
> `scripts/db/rechtestand.test.mjs` hält das fest: Eine Prüfung legt ein
> fremdes Schema mit eigenen Vorgaberechten an und besteht darauf, dass die
> Kontrolle **weiterhin leer** bleibt.

**Warum die Spalte `geltungsbereich` das Entscheidende ist.**
`alter default privileges` kennt zwei Formen: eine **mit** Schemabezug
(`in schema public`) und eine **ohne**. Das sind zwei getrennte Einträge, und
ein `revoke` trifft nur den Bereich, den es nennt.

Eine frühere Fassung von 3.1.10 entzog nur `in schema public`. Gegen eine
Vorgabe ohne Schemabezug wirkte sie **gar nicht** — die nächste angelegte
Tabelle hätte weiter alle sieben Rechte für alle drei Rollen geerbt, und
3.2.1 hätte davon nichts gesehen, weil sie bestehende Tabellen prüft. In
PGlite nachgestellt und gemessen. 3.1.10 entzieht seither in **beiden**
Bereichen.

**Wie die Zeilen zu lesen sind:**

| Was dasteht | Was es heißt |
| --- | --- |
| Zeilen mit `public` | eine schemabezogene Vorgabe steht noch — 3.1.10 fehlt oder lief nicht durch |
| Zeilen mit `(global)` | eine Vorgabe ohne Schemabezug steht noch — dasselbe |
| Empfänger `PUBLIC` bei `Funktionen` | jede künftige Funktion wäre für jeden ausführbar |
| Ein anderer `eigentuemer` als `postgres` | die Abfrage filtert ihn weg. Setzt jemand Vorgaben unter einer anderen Rolle, entzieht 3.1.10 sie nicht — dann den Filter `where eigentuemer.rolname = 'postgres'` entfernen und nachsehen, wer sie gesetzt hat |
| Ein anderes Schema als `public` | die Abfrage filtert es weg, und das ist **Absicht**. `storage`, `graphql`, `realtime` und die übrigen gehören der Plattform; ihre Vorgaberechte bleiben, wie sie sind |

> **Zwei Grenzen dieser Abfrage, beide bewusst.**
>
> **Die Rolle.** `alter default privileges for role X` wirkt nur auf Objekte,
> die **X** anlegt. Migrationen laufen als `postgres`, deshalb steht das in
> 3.1.10. Eine Vorgabe unter `supabase_admin` oder einer anderen Rolle bliebe
> stehen — sichtbar wird sie nur, wenn der Filter fällt. Wer ihn fallen lässt,
> sieht dann auch die Plattformrollen und sollte nichts davon anfassen.
>
> **Das Schema.** Alles außer `public` und der Form ohne Schemabezug ist
> ausgeblendet. Diese Abfrage ist eine Abnahme für LexiFlow, keine
> Bestandsaufnahme des Projekts.

### 3.3 Auth konfigurieren

| Nr. | Einstellung | Wert |
| --- | --- | --- |
| 3.3.1 | Site URL | `http://localhost:4173/LexiFlow/portal/` (später auf 1.3.8 umstellen) |
| 3.3.2 | Redirect URLs | `http://localhost:4173/LexiFlow/portal/**` **und** `https://mp-studio-official.github.io/LexiFlow/portal/**` |
| 3.3.3 | E-Mail-Bestätigung | für Staging **aus** – sonst hängt jedes Testkonto an einem Postfach |
| 3.3.4 | Selbstregistrierung („Allow new users to sign up") | **aus** |

Zu 3.3.4: Die Anwendung bietet ohnehin keinen Weg dazu (0.4.1). Es
abzuschalten ist der zweite Riegel – sonst könnte jemand mit dem Publishable
Key direkt an der API ein Konto anlegen.

Zu 3.3.2: Beide Einträge gleich von Anfang an. Die Rückkehradresse entsteht im
Code aus `location.origin` plus Grundpfad plus `#/kennwort-neu` und steht
nirgends fest geschrieben – deshalb muss die Allowlist den Pfad mit `**`
abdecken.

> **E-Mail-Versand** wird nur für die Kennwortwiederherstellung von
> **Lehrkräften** gebraucht. Für Lernende gibt es sie nicht (ADR-5, ADR-11) –
> dort ist der Wiederherstellungscode der Weg. Ohne SMTP-Einrichtung ist
> Abnahme 7.9 nicht durchführbar; alles andere schon.

### 3.4 Function Secrets

**Zu setzen sind genau zwei.** Alles Übrige injiziert die Edge-Laufzeit selbst.

| Nr. | Name | Wert |
| --- | --- | --- |
| 3.4.1 | `LEXIFLOW_ALLOWED_ORIGINS` | `http://localhost:4173,https://mp-studio-official.github.io` |
| 3.4.2 | `LEXIFLOW_AI_MASTER_KEY_V1` | 32 Byte, base64 – siehe unten |

Den Hauptschlüssel erzeugen, **nicht** von Hand und nicht in einem
Web-Generator:

```
openssl rand -base64 32
```

Direkt in das Supabase-Feld einfügen. Er gehört in **keine** `.env`, in keine
GitHub-Variable und in kein Bündel – eine Variable mit Präfix `VITE_` landet im
ausgelieferten JavaScript.

> ### Was Supabase selbst setzt – und warum man es nicht nachbauen kann
>
> Die Edge-Laufzeit injiziert in jede Funktion:
>
> | Name | Form |
> | --- | --- |
> | `SUPABASE_URL` | die Projekt-URL, eine gewöhnliche Zeichenkette |
> | `SUPABASE_PUBLISHABLE_KEYS` | ein **JSON-Wörterbuch**; der übliche Eintrag heißt `default` |
> | `SUPABASE_SECRET_KEYS` | dito |
>
> Die beiden Mehrzahlnamen tragen also nicht den Schlüssel, sondern ein
> Wörterbuch davon: `{"default":"sb_secret_…"}`.
>
> **Eigene Secrets mit Präfix `SUPABASE_` lehnt das Dashboard ab.** Wer die
> fehlende Einzahlform `SUPABASE_SECRET_KEY` von Hand nachtragen will, kommt
> also nicht durch — und das ist gut so, denn der Wert wäre eine Kopie, die
> beim nächsten Schlüsselwechsel veraltet.
>
> `supabase/functions/_shared/umgebung.ts` liest deshalb in dieser
> Reihenfolge:
>
> | Wert | zuerst | dann | zuletzt |
> | --- | --- | --- | --- |
> | Publishable | `SUPABASE_PUBLISHABLE_KEYS.default` | `SUPABASE_PUBLISHABLE_KEY` | `SUPABASE_ANON_KEY` |
> | Secret | `SUPABASE_SECRET_KEYS.default` | `SUPABASE_SECRET_KEY` | `SUPABASE_SERVICE_ROLE_KEY` |
>
> Die beiden Nachzügler sind für `supabase functions serve` und für ältere
> Projekte da. Im Stagingprojekt greift die erste Spalte.
>
> **Ein gesetztes, aber kaputtes Wörterbuch fällt nicht still zurück.** Kein
> gültiges JSON, kein Eintrag `default`, ein leerer Eintrag: Die Funktion
> bricht mit einem Satz ab, der den Namen der Variablen und die Art des
> Fehlers nennt — **nie einen Schlüsselwert**. Ein Function-Log ist der letzte
> Ort, an dem ein Schlüssel stehen sollte. Still auf einen anderen Namen
> auszuweichen hieße, womöglich mit einem veralteten Schlüssel
> weiterzuarbeiten, und das fiele niemandem auf.

> **`LEXIFLOW_ALLOWED_ORIGINS` sind Herkünfte, keine Pfade.** Beide Funktionen
> vergleichen den `Origin`-Header, und der enthält nie einen Pfad. Mit Komma
> getrennt, ohne Leerzeichen dahinter ist am sichersten (der Code trimmt,
> aber darauf muss man sich nicht verlassen).

### 3.5 Edge Functions deployen

| Nr. | Funktion | Zweck |
| --- | --- | --- |
| 3.5.1 | `learner-auth` | Anmeldung, Registrierung, Wiederherstellung für Lernende |
| 3.5.2 | `ai-gateway` | der einzige Weg vom Portal zu einem KI-Anbieter |

```
supabase functions deploy learner-auth
supabase functions deploy ai-gateway
```

> ### Zur Funktionsauthentifizierung – `supabase/config.toml`
>
> Die Datei liegt im Repository und wird beim Deployen mitgelesen. Sie setzt
> für **beide** Funktionen `verify_jwt = false`:
>
> ```toml
> [functions.learner-auth]
> verify_jwt = false
>
> [functions.ai-gateway]
> verify_jwt = false
> ```
>
> **Das ist kein Wegfall der Autorisierung.** Es ist die Entscheidung, sie
> dort zu behalten, wo sie die richtige Frage stellt.
>
> | Funktion | warum ohne Plattformprüfung | was stattdessen prüft |
> | --- | --- | --- |
> | `learner-auth` | Wer hier anruft, hat **noch kein Konto** – er legt es gerade an. Eine Sitzung, die geprüft werden könnte, gibt es nicht. Mit `verify_jwt = true` wäre die Funktion unerreichbar für genau die, für die sie da ist. | Herkunft (`LEXIFLOW_ALLOWED_ORIGINS`, 403 vor dem Lesen des Rumpfs), Einladungscode, Wiederherstellungscode, Bremse |
> | `ai-gateway` | Die Plattformprüfung fragt „stammt das Token aus diesem Projekt?" — nicht „wer ist das?". In älteren Projekten akzeptierte sie sogar den Publishable Key, der selbst ein JWT ist. | `wer()` reicht den Bearer-Token an `auth.getUser()`; fehlt, verfällt oder erfindet ihn jemand, kommt `undefined` heraus, und `handle` lehnt in seiner ersten Zeile mit 401 ab. Danach kommen nur `teacher` und `admin` weiter. |
>
> **Ohne diese Datei hinge das Verhalten am Plattformstandard** — und was
> heute voreingestellt ist, kann morgen anders voreingestellt sein, ohne dass
> jemand im Repository etwas geändert hätte. Der Fehlschlag wäre ein „401"
> beim ersten echten Aufruf, bei einer lernenden Person.
>
> `scripts/funktionskonfiguration.test.mjs` hält beide Zeilen fest und fällt
> auf, wenn eine dritte Funktion dazukommt, ohne dass jemand über ihre
> Authentifizierung entschieden hat.

> ### Was der Browser an `learner-auth` schickt
>
> Nur `apikey` mit dem Publishable Key. **Keinen `Authorization`-Kopf.**
>
> Er stand dort einmal, mit dem Publishable Key als Wert — eine Gewohnheit aus
> der Zeit der `anon`-Keys, die JWTs waren. Neue Publishable Keys
> (`sb_publishable_…`) sind keine. Ein Empfänger, der dort ein JWT erwartet,
> lehnt mit „ungültiges Token" ab, und die Meldung zeigt dann in die falsche
> Richtung.
>
> Bei `ai-gateway` steht im `Authorization`-Kopf dagegen das Token der
> **angemeldeten Lehrkraft** — das ist genau der Wert, den die Funktion prüft.

> ### Stand 29.09.2026: beide sind deployt und geprüft
>
> Dieser Absatz sagte bis dahin „beide sind nie gelaufen". Das stimmt nicht
> mehr.
>
> | Was | Ergebnis |
> | --- | --- |
> | `learner-auth` deployt | ja |
> | `ai-gateway` deployt | ja, nach der Korrektur der endungslosen Importe (Commit `d89e79d`) |
> | ohne `Origin`, beide | `403` mit `Nicht erlaubt.` – also hat **unser** Code geantwortet, nicht die Plattformprüfung |
> | JWT-Prüfung im Dashboard, beide | aus |
> | `learner-auth`, erlaubte Herkunft, ungültiger Code | `400` `{"fehler":"abgelehnt"}`, `Access-Control-Allow-Origin` exakt die erlaubte Adresse |
> | `ai-gateway`, erlaubte Herkunft, ohne Token | `401` |
> | `ai-gateway`, erfundenes Token | `401` |
> | `ai-gateway`, `OPTIONS` | `204` mit den drei erwarteten `access-control-*`-Zeilen |
> | `ai-gateway`, `GET` / unlesbarer Rumpf | `405` / `400`, beide `{"fehler":"abgelehnt"}` |
>
> Die Unterscheidung `403` gegen `401 Missing authorization header` ist dabei
> der eigentliche Nachweis: Sie zeigt, dass `supabase/config.toml` übernommen
> wurde und `verify_jwt = false` wirklich aktiv ist.
>
> Das saubere `401` bei `ai-gateway` belegt zusätzlich, dass die Funktion
> `SUPABASE_URL` und den Secret Key in ihrer Umgebung **findet** – ein
> fehlender Wert käme als Serverfehler heraus, nicht als Ablehnung. Noch
> **nicht** belegt ist `LEXIFLOW_AI_MASTER_KEY_V1`: Er wird erst beim Ver- und
> Entschlüsseln gelesen, also erst mit einer echten Anbieterverbindung.

**Die Kerne** sind unabhängig davon mit 160 Prüfungen abgenommen; was oben
dazugekommen ist, sind die Deno-Mäntel und die Plattform darum.

---

## 4. Welcher Wert wohin

### 4.1 Für das lokale Staging (Abschnitte 5–8)

Eine `.env` im Projektwurzelverzeichnis, nach dem Muster von `.env.example`.
Sie ist von Git ausgeschlossen.

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

**`VITE_LEXIFLOW_FAKE_CLOUD` darf dort nicht stehen.** Steht es doch, baut das
Portal gegen erfundene Konten – erkennbar am roten Band auf jeder Seite.

### 4.2 Für GitHub Pages (ab Abschnitt 10)

| Wert aus Supabase | Wohin | Als was |
| --- | --- | --- |
| Projekt-URL | GitHub → Settings → Secrets and variables → Actions → **Variables** → `VITE_SUPABASE_URL` | Variable, nicht Secret |
| Publishable Key | dieselbe Stelle → `VITE_SUPABASE_PUBLISHABLE_KEY` | Variable, nicht Secret |

**Warum Variables und nicht Secrets:** Beide Werte stehen ohnehin im
ausgelieferten Bündel und lassen sich aus jedem Browser auslesen. Als Secret
wären sie in den Actions-Protokollen maskiert – das erschwert das Nachsehen,
ohne etwas zu schützen.

### 4.3 In Supabase (immer)

**Von Hand zu setzen sind genau zwei:** `LEXIFLOW_ALLOWED_ORIGINS` und
`LEXIFLOW_AI_MASTER_KEY_V1` – siehe 3.4.

`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS` und `SUPABASE_SECRET_KEYS`
injiziert die Laufzeit selbst. Eigene Secrets mit Präfix `SUPABASE_` lehnt
das Dashboard ohnehin ab.

**Der Hauptschlüssel gehört ausschließlich dorthin.**

**Der Anbieterschlüssel gehört ausdrücklich *nicht* in diese Liste** – aber
nicht, weil er nicht nach Supabase käme. Er kommt dorthin, nur über einen
anderen Weg: Die Lehrkraft gibt ihn im Portal ein (6.11), die Edge Function
versiegelt ihn, und er liegt verschlüsselt in `ai_connections`. Ein Function
Secret gälte projektweit und wäre für eine zweite Lehrkraft bereits falsch.
Siehe den Kasten „Vier Schlüsselklassen" in 1.4.

---

## 5. Das lokale Portal gegen echtes Supabase

Das ist der Prüfstand für alles vor dem Merge.

### 5.1 Warum der gebaute Stand und nicht der Entwicklungsserver

| | Entwicklungsserver | Gebauter Stand, lokal ausgeliefert |
| --- | --- | --- |
| Bauzeitfahnen | eine Konfiguration für beide Einstiege – der kontofreie Teil liefe im Portalmodus | je Einstieg richtig |
| Herkunft | eine, aber mit falschen Fahnen | **eine**, mit richtigen Fahnen |
| Grundpfad | `/` | `/LexiFlow/` – wie später |
| Code | unminifiziert, anders gebündelt | **derselbe**, der später deployt wird |

Der zweite Weg ist derselbe, den die Portal-E2E-Suite seit Phase 3 benutzt. Er
ist erprobt.

### 5.2 Starten

```
LEXIFLOW_BASE=/LexiFlow/ npm run build
LEXIFLOW_BASE=/LexiFlow/ npx vite preview --port 4173 --strictPort
```

Danach erreichbar:

| Adresse | Was |
| --- | --- |
| `http://localhost:4173/LexiFlow/` | die kontofreie PWA |
| `http://localhost:4173/LexiFlow/portal/` | das Portal gegen **echtes** Supabase |

Beide unter **einer** Herkunft – das ist die Voraussetzung dafür, dass das
Portal Pakete aus dem lokalen Speicher der kontofreien Anwendung übernehmen
kann (ADR-10).

### 5.3 Vor der ersten Anmeldung prüfen

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 5.3.1 | `LEXIFLOW_BASE=/LexiFlow/ npm run verify:deploy` | „Die Auslieferung ist in Ordnung." |
| 5.3.2 | Portal öffnen | **kein** rotes Band „Testfassung ohne Server" |
| 5.3.3 | Portal öffnen | **keine** Seite „LexiFlow ist noch nicht eingerichtet" – sonst fehlt die `.env` |
| 5.3.4 | Entwicklerwerkzeuge → Netzwerk | Anfragen gehen an `<ref>.supabase.co`, nicht ins Leere |

Schlägt 5.3.2 an: **abbrechen**. Es ist mit `VITE_LEXIFLOW_FAKE_CLOUD=1`
gebaut worden, und dann prüft die ganze Abnahme darunter eine Fälschung.

### 5.4 Was hier **nicht** geprüft werden kann

Und deshalb in Abschnitt 11 wiederkommt:

- die echten Adressen und ob der Grundpfad dort trägt
- Direktaufrufe tiefer Adressen und Neuladen auf einer Unterseite
- der Service Worker der PWA gegenüber dem Portal (er braucht HTTPS oder
  `localhost` – und hier ist beides teilweise gegeben, aber nicht die
  Pages-Situation)
- die PWA-Installation
- Safari und Mobilgeräte auf der echten Adresse

---

## 6. Staging-Abnahme mit echten Konten

**Gegen das lokale Portal aus Abschnitt 5.** Alles hier ist **Stufe S** – zum
ersten Mal gegen echtes Supabase. In Klammern steht, was vorher schon galt.

### 6.1 Das Admin-Konto anlegen (Hand, einmalig freigegeben)

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

### 6.2 Das Lehrkraftkonto anlegen (Hand, einmalig freigegeben)

Wie 6.1, mit E-Mail 1.1.4, `display_name` etwa `A. Beispiel`, `short_code`
`LX-4821`, Rolle `teacher`.

```sql
insert into profiles (id, display_name, short_code, role)
values ('<uuid>', 'A. Beispiel', 'LX-4821', 'teacher');
```

> Ohne Profilzeile gibt `app_my_role()` nichts zurück, und der Kursanlegeknopf
> scheitert – ohne erkennbaren Grund. Das ist die Lücke aus 0.4.2, und sie ist
> für **dieses** Staging mit einer Lehrkraft ausdrücklich freigegeben.
> Abschnitt 14 sagt, was vor einer Weitergabe an mehrere Lehrkräfte an ihre
> Stelle treten muss.

> **Beide Schritte bleiben im Dashboard.** Weder 6.1 noch 6.2 braucht den
> Secret Key irgendwo außerhalb von Supabase – kein `psql` mit dem Schlüssel in
> der Befehlszeile, kein Skript auf dem Laptop, keine Zwischenablage. Wenn ein
> Weg hier den Secret Key verlangt, ist es der falsche Weg.

### 6.3 Anmelden als Lehrkraft

| Nr. | Erwartung |
| --- | --- |
| 6.3.1 | `…/portal/#/anmelden` → „Ich unterrichte" → E-Mail + Kennwort |
| 6.3.2 | Landet auf „Kurse"; in der Navigation **kein** Punkt „Verwaltung" |
| 6.3.3 | Im Netzwerkverlauf: ein Token kommt von `…/auth/v1/token` |

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
| 6.5.5 | In der Datenbank: `select code_hash, label from course_invites` | nur Hash und Kürzel, **kein Klartext** |

### 6.6 Zwei Lernende anlegen

| Nr. | Schritt |
| --- | --- |
| 6.6.1 | Abmelden. `…/portal/#/beitreten` |
| 6.6.2 | Code aus 6.5.1, „Weiter", „Konto anlegen" |
| 6.6.3 | Name „Fuchs", Kennwort zweimal |
| 6.6.4 | **Wiederherstellungscode notieren** – er wird genau einmal gezeigt |
| 6.6.5 | Dasselbe für „Dachs" mit demselben Kurscode |
| 6.6.6 | Beide erscheinen in der Mitgliederliste der Lehrkraft |

**Zu prüfen:** In der Mitgliederliste steht **keine** Zahl über das Üben –
keine Spalte „geübt", „Fortschritt", „zuletzt aktiv" oder „%". (L, P)

**Und:** `select * from auth.users` – die Lernenden haben eine technische
Adresse unter `.invalid`, keine echte (ADR-5).

### 6.7 Paket veröffentlichen, beide Lernrichtungen

| Nr. | Schritt |
| --- | --- |
| 6.7.1 | In `http://localhost:4173/LexiFlow/` ein Paket anlegen, Lernrichtung **„beide Richtungen"** |
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
| 6.9.4 | In beiden neu laden | derselbe Stand; die später gesendete Antwort hat gewonnen |
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

**Gegenprobe zur Uhr:** In einem Fenster die Systemuhr um zwei Stunden
vorstellen, dort antworten, dann im anderen Fenster antworten – der **zuletzt
gesendete** Stand gilt, nicht der mit der späteren Uhrzeit.

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
| 6.11.1 | Als Lehrkraft `…/portal/#/ki` | Satz „kommt nie wieder heraus" steht **vor** dem Feld |
| 6.11.2 | Anbieter „Google Gemini" | **kein** Adressfeld |
| 6.11.3 | Name + neuer Schlüssel + Modell, speichern | „Der Schlüssel ist von hier an nicht mehr lesbar" |
| 6.11.4 | Angezeigt wird nur `••••••••` + letzte vier Zeichen | |
| 6.11.5 | „Verbindung prüfen" | erster echter Anbieteraufruf überhaupt |
| 6.11.6 | Entwicklerwerkzeuge → Netzwerk | **kein** Aufruf an den Anbieter aus dem Browser; nur an `functions/v1/ai-gateway` |
| 6.11.7 | Anbieter „OpenAI-kompatibel", eigene Adresse `https://beliebig.example/v1/` | **„Dieser Host ist nicht freigegeben."** |

Die Gegenprobe zum Kasten in 1.4 steht in **7.6**: Der Anbieterschlüssel *wird*
in Supabase gespeichert, und dort ist zu belegen, dass er unlesbar abgelegt
ist. „Da steht Base64" ist dafür **kein** Nachweis – Base64 ist eine
Kodierung, keine Verschlüsselung. Ein im Klartext hinterlegter Schlüssel sähe
base64-kodiert genauso unverdächtig aus.

> **Nebenbei zu prüfen** (6.11.1): Der Hinweistext sagt „kommt nie wieder
> heraus – **auch nicht für dich**". Die Einschränkung „für dich" ist das,
> was den Satz richtig macht; ohne sie verspräche er mehr, als der Kasten in
> 1.4 hält. Falls jemand ihn je kürzt, wird aus einer wahren Aussage eine
> falsche.

### 6.12 Mitgliedschaft entfernen → Schreibzugriff endet

| Nr. | Schritt | Erwartung |
| --- | --- | --- |
| 6.12.1 | Als Lehrkraft „Dachs" aus „Englisch 7b" entfernen | verschwindet aus der Liste |
| 6.12.2 | Als „Dachs" den Kurs öffnen | **nicht mehr sichtbar** |
| 6.12.3 | Falls noch eine Übungsseite offen ist: antworten | Hinweis „konnte nicht gespeichert werden" |
| 6.12.4 | In der Datenbank: alter Lernstand von Dachs | **bleibt stehen** – entfernt wurde der Zugriff, nicht die Vergangenheit |

> ### Bestanden am 29.09.2026 – und beim ersten Versuch durchgefallen
>
> Der erste Durchgang deckte den Befund aus 0.5 auf. Nach **Migration 11**
> wurde derselbe Ablauf wiederholt, mit demselben Konto.
>
> **Ausgangslage:** Dachs Mitglied von „Englisch 7b", Lernstand
> `session_count = 1`, `answered_count = 1`, `correct_count = 1`.
>
> **Vor der Entfernung, als Mitglied:**
>
> | Versuch | Ergebnis |
> | --- | --- |
> | `begin_practice_session` mit einem **nicht zugewiesenen** Paket | `403` / `42501` |
> | direkter `INSERT` in `pack_progress` | `403` / `42501` |
>
> **Nach der Entfernung aus dem Kurs:**
>
> | Weg | vorher | jetzt |
> | --- | --- | --- |
> | `courses` | 200, 0 Zeilen | 200, 0 Zeilen |
> | `course_packs` | 200, 0 Zeilen | 200, 0 Zeilen |
> | `pack_progress` | **200, 1 Zeile** | **200, 0 Zeilen** |
> | `begin_practice_session` | **204, Zähler +1** | **403 / 42501** |
> | `record_progress_events` | – | `403` / `42501` |
> | `reset_my_progress` | – | `403` / `42501` |
> | direkter `INSERT` in `pack_progress` | – | `403` / `42501` |
>
> **Nach der Wiederaufnahme** desselben Kontos mit einem neuen, auf **eine**
> Nutzung begrenzten Einladungscode:
>
> - genau ein Kurs und genau ein Paket sichtbar;
> - Lernstand weiterhin **exakt 1 / 1 / 1** – nicht neu angelegt, sondern
>   wiedergefunden;
> - **kein** neues Konto entstanden;
> - Dachs wieder in der Mitgliederliste;
> - Einladung „1 von 1, ausgeschöpft".
>
> Damit ist belegt: Entfernen sperrt sofort, löscht aber nichts, und die
> Wiederaufnahme stellt den Zugriff auf **denselben** Lernstand her. Das
> Archivierungsverhalten (ADR-12) bleibt davon unberührt – ein archivierter
> Kurs ist abgeschlossen, nicht geschlossen.

---

## 7. Sicherheitsabnahme

Gegen dasselbe lokale Portal und dieselbe Supabase-Instanz. Alles Stufe **S**,
sofern nicht anders vermerkt.

### 7.1 Zugriffsregeln über PostgREST

Der eigentliche Test: **nicht** über die Oberfläche, sondern mit `curl` und dem
Publishable Key plus dem Zugangstoken einer angemeldeten Lehrkraft. (P lokal,
S über HTTP)

| Nr. | Anfrage | Erwartung |
| --- | --- | --- |
| 7.1.1 | `GET /rest/v1/pack_progress` als Lehrkraft | **leer** |
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
| 7.4.2 | Nach `testkennwort`, `fuchs-7390`, `Testfassung ohne Server` | **nichts** |
| 7.4.3 | Nach `LEXIFLOW_AI_MASTER_KEY` | nichts |
| 7.4.4 | `LEXIFLOW_BASE=/LexiFlow/ npm run verify:deploy` | „Die Auslieferung ist in Ordnung." (L) |

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

**Was hier zu belegen ist**, in dieser Reihenfolge: Der gespeicherte Wert
enthält den Klartext nicht; zweimal derselbe Schlüssel ergibt zwei
verschiedene Chiffretexte; entsiegeln geht nur mit der richtigen Bindung; ein
verschobener Chiffretext scheitert; und über keine reguläre API kommt der
Schlüssel zurück.

> **„Es sieht nach Base64 aus" belegt nichts.** Base64 ist eine Kodierung.
> `select encode('AIza…'::bytea, 'base64')` sieht genauso aus wie ein
> Chiffretext. Die Prüfungen unten fragen deshalb nicht, wie der Wert
> *aussieht*, sondern was er **nicht enthält** und was sich mit ihm **nicht
> anstellen lässt**.

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 7.6.1 | **Kein Klartext im gespeicherten Wert** – die Abfrage steht unter der Tabelle | **0 Zeilen**, beide Male |
| 7.6.2 | **Zufälliges Siegel.** Denselben Testschlüssel ein zweites Mal als neue Verbindung speichern, dann beide vergleichen: `select count(distinct secret_ciphertext), count(distinct secret_iv) from ai_connections` | **2 und 2** – gleicher Eingabewert, verschiedene Chiffretexte und IVs |
| 7.6.3 | **Bindung an die Verbindung.** Chiffretext, IV und `secret_key_version` von Verbindung A auf B schreiben, dann B „prüfen" | **409**, „lässt sich nicht entsiegeln" |
| 7.6.4 | **Bindung an die Lehrkraft.** `owner_id` einer Verbindung auf die zweite Lehrkraft ändern, dann als diese „prüfen" | **409** – derselbe Chiffretext, andere Kennung, keine Entsiegelung |
| 7.6.5 | **Bindung an Anbieter und Schlüsselversion.** `adapter` auf einen anderen Wert ändern, „prüfen"; danach `secret_key_version` verstellen, „prüfen" | jeweils **409** |
| 7.6.6 | **Keine reguläre API gibt ihn zurück.** Als Lehrkraft über PostgREST: `GET /rest/v1/ai_connections?select=*`, dann gezielt `select=secret_ciphertext`, `select=secret_iv`, `select=secret_key_version` | `*` liefert die Zeile **ohne** die drei Spalten; die gezielten Abfragen **permission denied** |
| 7.6.7 | dasselbe als Admin und als Lernende | ebenso |
| 7.6.8 | Die Portalseite „KI-Zugang" nach dem Speichern neu laden, Netzwerkverlauf ansehen | nur `masked_secret`; in keiner Antwort ein vollständiger Schlüssel |
| 7.6.9 | `LEXIFLOW_AI_MASTER_KEY_V1` löschen, Verbindung aufrufen | **503**; die Zeile **bleibt stehen** |
| 7.6.10 | Schlüssel wieder setzen | funktioniert wieder |

**Die Abfrage zu 7.6.1** – `:klartext` durch den Testschlüssel ersetzen, beide
Zeilen müssen `0` ergeben:

```sql
-- Steht der Schlüssel so in der Spalte?
select count(*) from ai_connections
 where secret_ciphertext like '%' || :klartext || '%';

-- Und steht er drin, nachdem die Base64-Hülle abgezogen ist?
select count(*) from ai_connections
 where encode(decode(secret_ciphertext, 'base64'), 'escape')
       like '%' || :klartext || '%';
```

Die zweite Zeile ist die wichtigere. Sie fängt den Fall ab, dass jemand den
Schlüssel nur kodiert statt verschlüsselt hat – dann sähe die Spalte aus wie
ein Chiffretext, und die erste Abfrage fände trotzdem nichts.

7.6.1 und 7.6.2 sind die eigentliche Verschlüsselungsabnahme, 7.6.3 bis 7.6.5
die der AAD-Bindung, 7.6.6 bis 7.6.8 die der Spaltenrechte, 7.6.9 die des
kontrollierten Fehlers.

> **Warum 7.6.2 kein Detail ist.** Zwei gleiche Eingaben, die zwei gleiche
> Chiffretexte ergeben, verraten schon, *dass* zwei Lehrkräfte denselben
> Schlüssel benutzen – und bei einem festen IV wäre das Verfahren gebrochen,
> nicht nur schwach. Der Test misst, ob der 96-Bit-IV wirklich je
> Verschlüsselung neu gezogen wird.

> **7.6.1 bis 7.6.5 laufen im SQL-Editor des Dashboards**, nicht mit dem Secret
> Key in einem lokalen Werkzeug. Dass die Zugriffsregeln dort nicht greifen,
> ist genau der Punkt – erhöhte Rechte braucht die Prüfung, den
> herauskopierten Schlüssel nicht.

> **Nach 7.6.3 bis 7.6.5 die verstellten Zeilen löschen**, nicht
> zurückschreiben. Es sind Testverbindungen mit einem Testschlüssel; eine
> halb reparierte Zeile ist später schwerer zu deuten als eine fehlende.

### 7.7 Rollen

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 7.7.1 | Als Lernende `#/kurse` aufrufen | Umleitung, kein Lehrkraftbereich |
| 7.7.2 | Als Lernende `#/ki` aufrufen | kein Zugang |
| 7.7.3 | Netzwerkverlauf einer lernenden Person | **kein** `TeacherArea`-Bündel geladen |
| 7.7.4 | `update profiles set role='teacher' where id=<selbst>` per PostgREST | **abgelehnt** |

### 7.8 Wiederherstellung

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 7.8.1 | Als „Fuchs" abmelden, „Zugang verloren", Lern-ID + Wiederherstellungscode | neues Kennwort setzbar |
| 7.8.2 | **Denselben** Code ein zweites Mal benutzen | **abgelehnt** – er wird bei Benutzung gewechselt |
| 7.8.3 | Der neue Code wird genau einmal angezeigt | |
| 7.8.4 | Mit falschem Code | dieselbe Meldung wie mit falscher Lern-ID |

### 7.9 E-Mail-Wiederherstellung (nur mit SMTP)

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 7.9.1 | Als Lehrkraft „Kennwort vergessen" | E-Mail kommt an |
| 7.9.2 | Link öffnen | landet auf `#/kennwort-neu`, Route hat überlebt |
| 7.9.3 | Adresszeile nach dem Laden | **kein** `?code=` mehr |
| 7.9.4 | Als **Lernende** nach E-Mail-Wiederherstellung suchen | gibt es nicht – nur der Code |

---

## 8. Safari und Mobil, lokal

Was ohne echte Adresse geht. Der Rest steht in Abschnitt 11.

| Nr. | Gerät / Browser | Prüfung |
| --- | --- | --- |
| 8.1 | Safari (macOS) | `…/LexiFlow/` – Paket anlegen, üben, Lernstand bleibt nach Neuladen |
| 8.2 | Safari (macOS) | `…/LexiFlow/portal/` – anmelden, üben, Lernstand bleibt |
| 8.3 | Safari (macOS), privates Fenster | Portal lädt und sagt verständlich, wenn Speicher fehlt |
| 8.4 | Safari (macOS), 390 px Fensterbreite | Kursseite, Beitrittsseite, Übungsseite, KI-Seite ohne horizontalen Überlauf |
| 8.5 | Safari | eine portable Lerndatei per `file://` öffnen und üben |
| 8.6 | iOS-Gerät im selben Netz | `http://<Rechner-IP>:4173/LexiFlow/portal/` – Anmeldung, eine Übungsrunde |

Zu 8.6: Dafür muss die Rechner-IP in `LEXIFLOW_ALLOWED_ORIGINS` und in den
Auth-Redirect-URLs stehen. Wer das nicht einrichten will, verschiebt die
Mobilabnahme vollständig auf Abschnitt 11 – dort ist sie ohnehin Pflicht.

---

## 9. Fast-Forward nach `main`

**Erst wenn Abschnitt 6, 7 und 8 grün sind.**

| Nr. | Schritt |
| --- | --- |
| 9.1 | Prüfen, dass `github.com/mp-studio-official/LexiFlow` existiert und **leer** ist. Hat es Inhalt: **nicht** überschreiben, erst klären |
| 9.2 | `git remote add origin git@github.com:mp-studio-official/LexiFlow.git` |
| 9.3 | `git push -u origin sprint/5a-cloud-portal-foundation` |
| 9.4 | **Grünes `ci.yml` abwarten** – der erste Lauf der Kette auf fremder Hardware |
| 9.5 | Variables setzen (4.2) und das Environment schützen (10.1) – **vor** dem Merge |
| 9.6 | `git checkout main && git merge --ff-only sprint/5a-cloud-portal-foundation` |
| 9.7 | `git push origin main` |

**Niemals `--force`.** Wird ein Push abgelehnt, ist das die Auskunft, dass dort
Historie liegt, die niemand angesehen hat.

**`--ff-only` und kein `--squash`.** Die 17 Commits erzählen den Sprint; ein
Quetschcommit wirft die Begründungen weg, die in jeder Nachricht stehen.

> **Der Push auf `main` löst das Deployment aus.** `deploy.yml` hört auf
> `push: main`. Deshalb muss 9.5 vorher erledigt sein – sonst deployt der erste
> Lauf ein Portal ohne Konfiguration.

---

## 10. Erstes GitHub-Pages-Deployment

### 10.1 Das Environment schützen (vor dem Merge)

| Nr. | Schritt |
| --- | --- |
| 10.1.1 | Settings → Environments → `github-pages` |
| 10.1.2 | „Deployment branches and tags" → **Selected branches and tags** |
| 10.1.3 | Regel hinzufügen: nur `main` |

Damit kann kein Zweig und kein Pull Request aus Versehen nach Pages
ausliefern – auch dann nicht, wenn jemand später einen zweiten Ablauf schreibt.

### 10.2 Pages einschalten

| Nr. | Einstellung | Wert |
| --- | --- | --- |
| 10.2.1 | Settings → Pages → Source | **GitHub Actions** (nicht „Deploy from a branch") |
| 10.2.2 | Variables | siehe 4.2 |

### 10.3 Der erste Lauf

`deploy.yml` läuft auf den Push nach `main`: erst die vollständige Prüfkette,
dann ein **frischer** Build, dann `npm run verify:deploy`, dann erst das
Hochladen.

| Zeichen | Bedeutung |
| --- | --- |
| Portal zeigt „noch nicht eingerichtet" | Variables fehlen (4.2) |
| `verify:deploy` bricht ab | Es liegt etwas in `dist/`, das dort nicht hingehört – **nicht** übergehen |
| Rotes Band auf der Live-Seite | eine Testfassung wurde deployt – **sofort** Pages abschalten (12.2) |

Die Meldung von `verify:deploy` sagt absichtlich nicht, *welcher Wert* gefunden
wurde: Ein CI-Protokoll ist der letzte Ort, an dem ein Schlüssel landen sollte.

### 10.4 Nachziehen

| Nr. | Schritt |
| --- | --- |
| 10.4.1 | Supabase → Auth → Site URL auf 1.3.8 umstellen |
| 10.4.2 | Prüfen, dass beide Herkünfte in `LEXIFLOW_ALLOWED_ORIGINS` stehen |
| 10.4.3 | Prüfen, dass beide Redirect-URLs in der Allowlist stehen |

---

## 11. Abnahme auf GitHub Pages

Das, was Abschnitt 5.4 offengelassen hat.

### 11.1 Die echten Adressen

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 11.1.1 | `https://…/LexiFlow/` | die kontofreie PWA, **ohne** Anmeldung |
| 11.1.2 | `https://…/LexiFlow/portal/` | das Portal, **ohne** `portal.html` im Pfad |
| 11.1.3 | `https://…/LexiFlow/portal/portal.html` | existiert nicht |
| 11.1.4 | Netzwerkverlauf beider Seiten | **keine** Anfrage außerhalb von `/LexiFlow/` |

### 11.2 Grundpfad und Direktaufrufe

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 11.2.1 | `…/LexiFlow/portal/#/anmelden` direkt aufrufen | Anmeldeseite, keine 404 |
| 11.2.2 | `…/LexiFlow/portal/#/beitreten` direkt | Beitrittsseite |
| 11.2.3 | Auf einer Kursseite **neu laden** | dieselbe Seite, angemeldet |
| 11.2.4 | Mitten in einer Übungsrunde neu laden | Runde beginnt neu, **Lernstand ist erhalten** |
| 11.2.5 | Zurück- und Vorwärts-Knopf des Browsers | funktionieren |
| 11.2.6 | Ein Link aus dem Portal auf „LexiFlow ohne Konto" | landet auf `…/LexiFlow/`, nicht auf `/` |

11.2.6 ist der Fehler, den ein Unterpfad-Deployment typischerweise hat und den
lokal unter `/` nie auffällt.

### 11.3 Service-Worker-Abgrenzung

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 11.3.1 | `…/LexiFlow/` besuchen, warten bis der Worker aktiv ist | in den Entwicklerwerkzeugen sichtbar |
| 11.3.2 | Dann `…/LexiFlow/portal/` aufrufen | **das Portal**, nicht die PWA (L) |
| 11.3.3 | Portal neu laden | weiterhin das Portal |
| 11.3.4 | PWA installieren, dann 11.3.2 wiederholen | dasselbe |
| 11.3.5 | Aus der installierten PWA heraus auf die Portaladresse | das Portal |

### 11.4 Übernahme vom Gerät (ADR-10)

| Nr. | Prüfung | Erwartung |
| --- | --- | --- |
| 11.4.1 | In `…/LexiFlow/` ein Paket anlegen | |
| 11.4.2 | Im Portal „Material" → „Alle übernehmen" | das Paket erscheint |
| 11.4.3 | Das Paket in `…/LexiFlow/` ist **noch da** | es wird nichts verschoben |

### 11.5 Safari und Mobil auf der echten Adresse

| Nr. | Gerät | Prüfung |
| --- | --- | --- |
| 11.5.1 | Safari (macOS) | beide Adressen, Anmeldung, eine Übungsrunde |
| 11.5.2 | Safari (macOS), privates Fenster | Portal lädt und erklärt fehlenden Speicher |
| 11.5.3 | Safari (iOS) | beide Adressen, Anmeldung, eine Übungsrunde |
| 11.5.4 | Safari (iOS) | kein horizontaler Überlauf auf **keiner** Portalseite |
| 11.5.5 | Safari (iOS) | die untere Navigationsleiste erscheint statt der Seitenschiene |
| 11.5.6 | Safari (iOS) | **Abmelden** ist erreichbar – siehe Hinweis unten |
| 11.5.7 | Chrome (Android) | dasselbe wie 11.5.3 bis 11.5.5 |
| 11.5.8 | iOS | eine portable Lerndatei aus „Dateien" öffnen und üben |
| 11.5.9 | VoiceOver (iOS) | eine Übungsrunde bedienen |
| 11.5.10 | iOS | PWA über „Zum Home-Bildschirm" installieren, dann 11.3.2 |

Zu 11.5.6: In der unteren Leiste gibt es heute **kein** „Abmelden". Für das
Staging genügt es, das festzuhalten; ob es ein Mangel ist, ist eine fachliche
Frage und steht in der Liste vor dem Merge (13.4).

Zu 11.5.8: Die portablen Dateien sind von Supabase unabhängig und müssen sich
verhalten wie vor Sprint 5A – die Größen sind unverändert
(9482,3 KiB / 674,7 KiB).

---

## 12. Rückbauplan

**Voraussetzung: Es ist wenig zu verlieren.** Vor Abschnitt 9 ist `main`
unangetastet und es gibt keinen Remote; danach enthält das Staging nur
Testdaten.

### 12.1 Sofort abbrechen, wenn

| Zeichen | Bedeutung |
| --- | --- |
| Rotes Band „Testfassung ohne Server" auf einer erreichbaren Seite | eine Testfassung läuft – sofort abschalten |
| Ein Anbieterschlüssel im Bündel auffindbar | Schlüssel widerrufen, dann Ursache suchen |
| Eine Lehrkraft sieht einen fremden Lernstand | die Kernzusage ist verletzt – stilllegen, nichts löschen |
| `verify:deploy` bricht ab | **nicht** übergehen |

### 12.2 Wenn das **lokale** Staging scheitert (vor dem Merge)

| Nr. | Schritt |
| --- | --- |
| 12.2.1 | `vite preview` beenden, `.env` löschen |
| 12.2.2 | Supabase-Projekt behalten oder löschen – es hängt nichts daran |
| 12.2.3 | **Nichts** am Git zu tun: kein Remote, kein Push, `main` unberührt |
| 12.2.4 | Befund aufschreiben, korrigieren, von Abschnitt 5 an wiederholen |

Das ist der ganze Vorteil dieser Reihenfolge: Ein gescheitertes Staging kostet
nichts als Zeit.

### 12.3 Wenn das **Pages**-Deployment scheitert (nach dem Merge)

| Nr. | Schritt |
| --- | --- |
| 12.3.1 | Settings → Pages → Source auf „None" |
| 12.3.2 | Laufende Actions abbrechen |
| 12.3.3 | `main` **nicht** zurücksetzen – der Stand war lokal abgenommen |
| 12.3.4 | Den Fehler auf einem Zweig beheben, erneut per Fast-Forward |
| 12.3.5 | **Kein** `push --force`, **kein** History-Rewrite |

### 12.4 Supabase zurückbauen

| Nr. | Schritt |
| --- | --- |
| 12.4.1 | Edge Functions löschen (`learner-auth`, `ai-gateway`) |
| 12.4.2 | Alle Function Secrets löschen – **besonders** `LEXIFLOW_AI_MASTER_KEY_V1` |
| 12.4.3 | Publishable und Secret Key rotieren |
| 12.4.4 | Jeden KI-Anbieterschlüssel **beim Anbieter widerrufen**, der eingetragen war |
| 12.4.5 | Staging-Projekt löschen, wenn es nicht weiterverwendet wird |

Zu 12.4.4: Ein Schlüssel, der auf einem Server lag, ist durch Löschen der
Datenbank nicht widerrufen.

### 12.5 Was bleibt

Das Produkt. `/LexiFlow/` ohne Konto und beide portablen Dateien brauchen
nichts von alledem. Ein gescheitertes Staging nimmt LexiFlow nichts weg.

---

## 13. Checkliste „bereit für den Merge nach main"

Erst abhaken, dann mergen. Ein „fast" zählt nicht.

### 13.1 Werkstatt

- [ ] `ci.yml` grün auf dem Sprintzweig, auf GitHubs Hardware
- [ ] 2830 Prüfungen grün, keine übersprungen
- [ ] 159 E2E der kontofreien Anwendung **unverändert**
- [ ] 29 portable, 31 Portal-E2E grün
- [ ] `npm run verify:portable` – 32 Prüfungen, Größen 9482,3 / 674,7 KiB
- [ ] `LEXIFLOW_BASE=/LexiFlow/ npm run verify:deploy` in Ordnung

### 13.2 Lokales Staging gegen echtes Supabase

- [ ] Abschnitt 5.3 grün – **kein** rotes Band, **keine** Einrichtungsseite
- [ ] Abschnitt 6 vollständig, jeder Punkt einmal wirklich getan
- [ ] 6.9 (Revisionskonflikt) bestanden, auch die Uhren-Gegenprobe
- [ ] 6.10 (archivierter Kurs) bestanden
- [ ] 6.12 (Mitgliedschaft entfernt) bestanden
- [ ] Abschnitt 7 vollständig, besonders 7.1, 7.4, 7.5, 7.6
- [ ] Abschnitt 8, mindestens Safari auf macOS

### 13.3 Vorbereitet für Pages

- [ ] Repository-Variables gesetzt (4.2)
- [ ] Environment `github-pages` auf `main` beschränkt (10.1)
- [ ] Pages-Source auf „GitHub Actions" (10.2)
- [ ] Beide Herkünfte in `LEXIFLOW_ALLOWED_ORIGINS`
- [ ] Beide Redirect-URLs in der Auth-Allowlist

### 13.4 Entscheidungen, die vor dem Merge fallen sollten

- [ ] Soll ein Trigger Profile für neue Konten anlegen? (0.4.2, Abschnitt 14)
- [ ] Soll „Abmelden" auch in die untere Navigationsleiste? (11.5.6)
- [ ] Bleibt `deploy.yml` auf `push: main`?

### 13.5 Ehrlichkeit

- [ ] Was im Staging **nicht** geprüft werden konnte, ist aufgeschrieben
- [ ] Kein Punkt gilt als bestanden, weil er „eigentlich klar" ist
- [ ] Der kompromittierte Gemini-Schlüssel ist beim Anbieter widerrufen
- [ ] Kein Secret steht in einer Datei im Repository

### 13.6 Der Merge selbst

- [ ] `main` ist weiterhin Vorfahr von HEAD → `--ff-only` geht durch
- [ ] **Kein** `--squash` – die 17 Commits erzählen den Sprint
- [ ] Tag erst **nach** grünem Deploy und grüner Abnahme aus Abschnitt 11
- [ ] Danach ist `docs/portal-uebergabe.md`, Abschnitt 8, überholt und gehört
      nachgezogen – dort steht heute, dass nichts gelaufen ist

---

## 14. Blocker vor einer Weitergabe an mehrere Lehrkräfte

**Für dieses Staging mit einer Lehrkraft ist die Handarbeit aus 6.1/6.2
freigegeben. Für mehr ist sie es nicht.**

Was heute passiert, wenn eine zweite Lehrkraft dazukommt: Jemand legt im
Supabase-Dashboard ein Konto an, kopiert eine UUID, denkt sich eine
Kurzkennung aus und schreibt ein `insert` in den SQL-Editor. Das hat drei
Probleme, und keines davon ist Bequemlichkeit:

| Problem | Folge |
| --- | --- |
| Es braucht **Dashboard-Zugang zum Produktivprojekt** | wer eine Lehrkraft anlegen darf, kann dort alles – auch Lernstände lesen, was dem Produktversprechen widerspricht |
| Eine Kurzkennung von Hand | Tippfehler, Dopplungen, und `LX-0002` beschreibt Reihenfolge statt nichts |
| Kein Protokoll auf Anwendungsebene | Supabase hält fest, *dass* jemand SQL ausgeführt hat; es steht nirgends, dass es eine Rollenvergabe war und für wen |

> **Was hier *nicht* das Problem ist.** Der Secret Key muss dafür nicht
> herausgegeben werden – der SQL-Editor läuft innerhalb von Supabase. Eine
> frühere Fassung dieses Abschnitts hat das anders behauptet; das war falsch.
> Der Engpass ist der Dashboard-Zugang selbst, nicht ein wandernder Schlüssel.
> Und genau deshalb skaliert der Weg nicht: Dashboard-Zugang lässt sich nicht
> auf „darf Lehrkräfte anlegen" einschränken.

**Was an ihre Stelle treten muss** (eigener Sprint, nicht dieser):

1. Ein Weg in der Verwaltungsoberfläche, mit dem eine Person mit Rolle `admin`
   ein Lehrkraftkonto anlegt – **ohne Dashboard-Zugang und ohne Secret Key im
   Browser**.
2. Der Secret Key bleibt dabei **ausschließlich serverseitig**: Er lebt
   weiterhin nur in den Edge Function Secrets, die Funktion benutzt ihn, und
   er verlässt Supabase auch dann nicht, wenn die Verwaltung ihn indirekt
   auslöst. Eine Lösung, die ihn an einen Menschen, einen Client oder ein
   Skript weitergibt, ist keine Lösung, sondern dieselbe Handarbeit mit
   Oberfläche.
3. Profil und Kurzkennung entstehen **serverseitig**, mit derselben Erzeugung
   wie bei Lernenden (`kurzkennungAus`, aus kryptografischem Zufall).
4. Ein fachlicher Vermerk, wer wem wann welche Rolle gegeben hat – in der
   Anwendung, nicht im Protokoll des Datenbankanbieters.
5. Ein Weg, eine Rolle wieder zu entziehen.

Solange das fehlt, gilt: **ein Staging, eine Lehrkraft, Handarbeit
dokumentiert.** Kein Pilotbetrieb an einer Schule.

---

## 15. Was dieses Dokument nicht kann

Es kann nicht sagen, ob das Staging gelingt. Jede Zeile über Supabase, GitHub
Pages und die Edge-Laufzeit ist aus dem Code abgeleitet, nicht aus Erfahrung
mit diesem Projekt in Betrieb – es gibt keine.

Der erste Mensch, der Abschnitt 6, 7 und 11 abarbeitet, wird Dinge finden, die
hier nicht stehen. Das ist kein Mangel der Anleitung, sondern der Grund, warum
es ein Staging gibt.
