# Pilot 0.1 – Abnahmeprotokoll

> **Noch nicht abgearbeitet.** Jedes offene Kästchen ist eine Handlung am
> echten System. `npm run pilot:pruefen` zählt sie: Solange eines offen ist,
> ist Prüfung 10 rot.

Jeder Punkt nennt **was zu tun ist**, **was dabei herauskommen muss** und
**was sich danach geändert hat**. Wo etwas anderes herauskommt: nicht
weitermachen, eintragen, melden.

---

## Teil A – Bevor jemand sich anmeldet

### A1 Die offene Registrierung ist aus

- [x] **Tun:** Dashboard → Authentication → Sign In / Providers → Email →
      „Allow new users to sign up".
- **Erwartet:** **aus**.
- **Gemessen am 06.10.2026: aus.** Migration 14 kommt trotzdem – der
  Schalter wird irgendwann umgelegt, und dabei liest niemand die
  Migrationsdatei.
- **Danach:** Niemand legt sich selbst ein Konto an. Ist sie an, ist der
  Rollenbefund aus `docs/abnahme/migration-14.md` scharf – dann erst
  ausschalten, dann weiter.

### A2 Warum `db push` hier nicht einfach laufen darf

Beide Migrationen stehen aus. `db push` kennt **keine Zielfassung** – die
Hilfe der CLI 2.119.0 nennt `--dry-run`, `--include-all`, `--linked`,
`--db-url`, `--password`, sonst nichts. Ein Aufruf wendet deshalb **alles**
an, was in der Historie fehlt: 14 **und** 15.

Damit wäre Abschnitt B von Migration 14 nicht mehr prüfbar. Er erwartet 101
Spalten und 39 Funktionen; mit 15 stünden dort 102 und 40 – und niemand
könnte danach noch sagen, ob 14 für sich richtig gelaufen ist.

**Verhindert wird es durch die Reihenfolge, nicht durch eine Option:**

1. Migration 14 läuft im **SQL Editor**. Der schreibt keine Historie – für
   `db push` bleibt sie damit „ausstehend", obwohl sie angewandt ist.
2. Der Nachtrag (`migration repair --status applied`) setzt sie in die
   Historie. Erst danach weiß `db push`, dass sie erledigt ist.
3. Ab da ist 15 die **einzige** ausstehende Fassung. `db push` kann sie gar
   nicht mehr mit 14 zusammen anwenden, weil 14 nicht mehr aussteht.

> **`--include-all` kommt in keinem Schritt vor.** Diese Option nimmt
> ausdrücklich alles mit, was in der Historie fehlt – sie ist genau das
> Gegenteil dessen, was hier gebraucht wird.

> **Keine Migrationsdatei wird verschoben, umbenannt oder gelöscht**, um die
> Reihenfolge zu erzwingen. Das wäre der bequeme Weg und der schlechteste:
> `db push` vergleicht Fassungen, nicht Inhalte, und eine Datei, die einmal
> weg war, kommt als „nie angewandt" zurück.

---

### A3 · Folge A – Migration 14 anwenden und abnehmen

**A3.1 Der Beleg, dass beide anstünden**

- [x] **Tun:**

```
npx --yes supabase@latest db push --linked --dry-run
```

- **Erwartet:** Beide Dateien in der Liste – `20261004090000_rollenriegel`
  **und** `20261005090000_konto_stilllegen`.
- **Danach:** Nichts. Ein Trockenlauf ändert nichts. Die Ausgabe gehört ins
  Protokoll: Sie ist der Grund für alles, was jetzt folgt.

**Gelaufen am 06.10.2026. Die Ausgabe:**

```
Initialising login role...
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
 • 20261004090000_rollenriegel.sql
 • 20261005090000_konto_stilllegen.sql
Finished supabase db push.
```

Damit ist belegt, was vorher nur aus der Hilfe der CLI abgeleitet war: Ein
Aufruf ohne Trockenlauf hätte **beide** angewandt, und Abschnitt B von
Migration 14 wäre nie prüfbar gewesen.
- **Wenn nur eine Datei dasteht:** Dann ist eine der beiden schon angewandt.
  Nicht weitermachen – erst `npx --yes supabase@latest migration list
  --linked` ansehen und klären, welche.

**A3.2 Die Lage vorher messen**

- [x] **Tun:** `docs/abnahme/migration-14.sql`, Abschnitte A1 bis A5, im SQL
      Editor. Werte notieren.
- **Gelaufen am 06.10.2026. Alle fünf wie erwartet:**

| | gemessen | erwartet |
| --- | --- | --- |
| A1 Schema | `16 · 101 · 28 · 38 · 13` | ✔ |
| A2 Nutzdaten | 4 Profile · 2 Kurse · 4 Mitgliedschaften · 2 Pakete · 3 Fassungen · 2 + 2 Lernstände · 4 Ereignisse · 0 Einstellungen | ✔ |
| A3 Rollen | `admin 1 · teacher 1 · student 2` | ✔ (= 4 Profile) |
| A4 Regel | `with_check = (id = auth.uid())` | ✔ — **der Befund, am echten Projekt bestätigt** |
| A5 Rechte | `INSERT 5 · SELECT 5 · UPDATE 1` | ✔ |

- **Zu A4:** Das ist der ganze Grund für Migration 14. Die Regel nennt die
  Rolle nicht; was sie zulässt, entscheidet allein die Rechtevergabe – und
  die steht laut A5 auf der ganzen Tabelle.
- **Zu A5:** Die Ansicht fächert Tabellenrechte je Spalte auf: `grant insert
  on profiles` steht dort als fünf Zeilen, weil die Tabelle fünf Spalten
  hat. Nach Migration 14 steht dort **3** – dann ist es ein echtes
  Spaltenrecht.
- **Zu A2 und A3:** Diese beiden sind die Vergleichswerte für B2 und B3.
  Migration 14 fasst keine Zeile an; weicht dort nachher etwas ab, ist etwas
  anderes passiert als das, was in der Datei steht.
- **Danach:** Nichts. Alles in A ist lesend.

**A3.3 Die Migration ausführen – in einer Transaktion**

Der einzufügende Text entsteht aus der Migrationsdatei selbst – nicht aus
einer zweiten Fassung davon, die irgendwann abweicht:

```
printf 'begin;\n'; cat supabase/migrations/20261004090000_rollenriegel.sql; printf '\ncommit;\n'
```

- [x] **Tun:** Diese Ausgabe vollständig in ein neues Query im SQL Editor
      einfügen und ausführen. Es sind 129 Zeilen; die erste ist `begin;`,
      die letzte `commit;`.
- **Gelaufen am 06.10.2026: „Success. No rows returned."**

- **Erwartet:** „Success. No rows returned."
- **Danach:** Riegel 1 bis 3 stehen. Die Historie **noch nicht**.
- **Warum die Klammer:** Die Migration ist reines DDL, und DDL ist in
  Postgres transaktional. Scheitert eine Zeile, wird nichts davon wirksam –
  statt eines halb angewandten Schemas, das in keinem Protokoll steht.
- **Wenn ein Fehler kommt:** `rollback;` ausführen, A1 wiederholen (die
  Werte müssen unverändert sein), Fehlermeldung notieren, hier anhalten.

**A3.4 Nachher messen – bevor irgendetwas nachgetragen wird**

- [x] **Tun:** `docs/abnahme/migration-14.sql`, Abschnitte B1 bis B8.
- [x] **Tun:** B9 ausführen.
- **Gelaufen am 06.10.2026. Alle neun wie erwartet:**

| | gemessen | Vergleich |
| --- | --- | --- |
| B1 Schema | `16 · 101 · 28 · **39** · **14**` | Funktionen +1, Trigger +1; Tabellen, Spalten und Regeln unverändert |
| B2 Nutzdaten | identisch mit A2 | keine Zeile angefasst |
| B3 Rollen | identisch mit A3 | niemand hat eine andere Rolle bekommen |
| B4 Regel | `id = auth.uid()` **und** `role = 'student'` | Riegel 2 steht |
| B5 INSERT | `display_name · id · short_code` | Riegel 1 steht – `role` ist nicht dabei |
| B6 UPDATE | `display_name` | unverändert |
| B7 Tabellenebene | nur `SELECT` | das Tabellenrecht auf INSERT ist weg |
| B8 Auslöser | `profiles_block_self_role_change · O · app_block_self_role_change · false` | Riegel 3 steht, und **mit Aufruferrechten** |
| B9 Historie | `13` Versionen, zuletzt `20261003090000` | richtig: Der Editor schreibt keine Historie |

- **Zu B8:** `prosecdef = false` ist der Wert, an dem es hängt. Mit
  Besitzerrechten wäre `current_user` der Besitzer, der Vergleich träfe nie
  zu, und Riegel 3 wäre eine Zeile, die nur so aussieht, als täte sie etwas.
  Genau das war mein erster Entwurf.
- **Zu B1:** Die Regeln stehen auf 28, obwohl Migration 14 eine ablegt und
  eine anlegt. Das ist die Probe darauf, dass beides passiert ist – eine
  Regel mehr oder weniger hiesse, dass `drop` oder `create` nicht lief.

> **Diese Reihenfolge ist der Sinn der Sache.** Der Nachtrag unten markiert
> eine Fassung als angewandt, **ohne sie auszuführen**. Würde er vor der
> Messung stehen und die Migration wäre in Wahrheit gescheitert, trüge die
> Historie eine Lüge – und `db push` liefe nie wieder darüber. Deshalb erst
> messen, dann nachtragen.

**A3.5 Die Historie nachtragen**

- [x] **Tun:**

```
npx --yes supabase@latest migration repair --linked --status applied 20261004090000
```

- **Erwartet:** Bestätigung, dass die Fassung als angewandt eingetragen ist.
- **Gelaufen am 06.10.2026:**
  `Repaired migration history: [20261004090000] => applied`
- **Danach:** `db push` hält 14 für erledigt.
- **Rückfall:** Falsch eingetragen? Der Eintrag lässt sich zurücknehmen:

```
npx --yes supabase@latest migration repair --linked --status reverted 20261004090000
```

  Das ändert **nur** die Historie, nicht das Schema. Was im Editor gelaufen
  ist, bleibt gelaufen – ein tatsächliches Zurücknehmen der Migration wäre
  eine **neue additive Migration 16**, niemals eine Änderung an 14.

**A3.6 Nachsehen, dass es gewirkt hat**

- [x] **Tun:**

```
npx --yes supabase@latest migration list --linked
```

- **Gelaufen am 06.10.2026:** Fassungen 1 bis 14 in **beiden** Spalten,
  `20261004090000` darunter; `20261005090000` ausschliesslich links.
- [x] **Tun:**

```
npx --yes supabase@latest db push --linked --dry-run
```

- **Gelaufen am 06.10.2026:** `Would push these migrations:` –
  `20261005090000_konto_stilllegen.sql`, und sonst nichts.
- **Danach:** Damit ist belegt, dass Migration 14 **nicht erneut** laufen
  würde und Folge B genau eine Migration anwendet.

**A3.7 Das Protokoll umschreiben**

- [x] **Tun:** In `docs/abnahme/migration-14.sql` den Kopf von „NOCH NICHT
      AUSGEFÜHRT" auf „ausgeführt am …" ändern und die gemessenen Werte
      eintragen.
- **Erledigt am 06.10.2026.** Die Datei ist jetzt das Protokoll.
- **Danach:** `20261004090000_rollenriegel.sql` ist **unveränderlich**.
  Prüfung 4 in `npm run pilot:pruefen` zählt 14 als angewandt.

---

### A4 · Folge B – Migration 15 anwenden und abnehmen

**A4.1 Der Trockenlauf**

- [x] **Tun:**

```
npx --yes supabase@latest db push --linked --dry-run
```

- **Erwartet:** **Genau eine** Datei: `20261005090000_konto_stilllegen`.
- **Gelaufen am 06.10.2026: genau diese eine.**
- **Wenn zwei dastehen:** Folge A ist nicht abgeschlossen. Zurück zu A3.5.

**A4.2 Die Lage vorher messen**

- [x] **Tun:** `docs/abnahme/migration-15.sql`, Abschnitte A1 bis A3.
- **Gelaufen am 06.10.2026. Alle drei wie erwartet:**

| | gemessen |
| --- | --- |
| A1 Schema | `16 · 101 · 28 · 39 · 14` – genau der Stand, den Folge A hinterlassen hat |
| A2 Nutzdaten | 4 Profile · 2 Kurse · 4 Mitgliedschaften · 2 Pakete · 3 Fassungen · 2 Eintragsstände · 4 Ereignisse |
| A3 Regeln | genau sechs; **keine** nennt `app_account_is_active` |

- **Zu A3:** Das ist der Ausgangspunkt, gegen den B5 vergleicht. Migration 15
  legt diese sechs ab und legt sie neu an – nachher muss der Schalter in
  jeder stehen. Stünde er jetzt schon irgendwo, wäre die Migration teilweise
  gelaufen, und das wäre der Fall zum Anhalten.

**A4.3 Anwenden**

- [x] **Tun:**

```
npx --yes supabase@latest db push --linked --skip-vault
```

- **Erwartet:** Genau eine angewandte Fassung: `20261005090000`.
- **Gelaufen am 06.10.2026: genau diese eine.**
- **Danach:** Der Sperrschalter steht. Die Historie schreibt `db push`
  selbst – **kein** Nachtrag, und auch keiner „zur Sicherheit".
- **Warum `--skip-vault`:** `db push` gleicht sonst vorher Vault-Geheimnisse
  aus `config.toml` ab. Dort steht keines – die Option sagt das ausdrücklich,
  statt sich darauf zu verlassen, dass eine Datei leer bleibt.
- **Wenn der Lauf abbricht:** `npx --yes supabase@latest migration list
  --linked` zeigt, ob 15 angekommen ist. Steht sie remote, aber das Schema
  passt nicht zu B1, ist das der Fall für eine neue additive Migration – nicht
  für eine Änderung an 15.

**A4.4 Nachher messen**

- [x] **Tun:** `docs/abnahme/migration-15.sql`, Abschnitte B1 bis B8.
- **Gelaufen am 06.10.2026. Alle neun wie erwartet:**

| | gemessen | Vergleich |
| --- | --- | --- |
| B1 Schema | `16 · **102** · 28 · **40** · 14` | Spalten +1, Funktionen +1; Regeln und Trigger unverändert |
| B2 Nutzdaten | identisch mit A2 | keine Zeile angefasst |
| B3 Stillgelegte | **0** | die Migration legt niemanden still |
| B4 Schalter | vier Funktionen nennen `app_account_is_active` | Mitgliedschaft, Lehrkraftrolle, Kursbesitz, Paketbesitz |
| B5 Regeln | **alle sechs** nennen ihn | fehlte er in einer, hätte der Besitz ein Loch |
| B6 Schreibrechte | `authenticated · display_name`, `service_role · disabled_at` | **kein** `authenticated · disabled_at` |
| B6b Rechte gesamt | `INSERT 3 · SELECT 6 · UPDATE 1` | SELECT wächst um `disabled_at`, wie vorhergesagt |
| B7 Historie | `15` Versionen, zuletzt `20261005090000` | `db push` hat sie selbst geschrieben – kein Nachtrag |
| B8 Trockenlauf | nichts Ausstehendes | beide Migrationen sind durch |

- **Zu B5:** Das ist der Punkt, an dem mein erster Entwurf fiel. Er legte den
  Schalter nur in die vier Hilfsfunktionen; die Regeln auf `courses`, `packs`
  und `ai_connections` fragen die aber gar nicht. „Alle sechs" ist der
  Nachweis, dass der Besitz jetzt mitgeht.
- **Zu B6:** Der Riegel gegen eine Befugnis, die es in diesem Produkt nicht
  gibt. Stünde dort `authenticated · disabled_at`, könnte eine Lehrkraft ein
  fremdes Konto stilllegen.

**A4.5 Das Protokoll umschreiben**

- [x] **Tun:** Kopf und Werte in `docs/abnahme/migration-15.sql` eintragen.
- **Erledigt am 06.10.2026.** Die Datei ist jetzt das Protokoll, und
  `20261005090000_konto_stilllegen.sql` ist unveränderlich.
- **Danach:** Prüfung 4 ist grün. Teil A ist abgeschlossen.

**A4.6 Nachtrag vom 09.10.2026 – Migration 16**

- [x] **Getan:** `docs/abnahme/migration-16.sql` angewandt; Historie lokal
  und remote deckungsgleich, anschließender Trockenlauf leer.
- **Warum:** Die anonyme Kontoanlage umging beim Verbrauch des Codes die
  Archivprüfung aus `redeem_invite`. Die rote PGlite-Gegenprobe hat den Weg
  reproduziert; Migration 16 schließt ihn in derselben atomaren Anweisung,
  die auch Ablauf, Widerruf und Platzgrenze prüft.
- **Live-Gegenprobe:** Die vorbereitete Kontoanlage mit dem alten Code des
  archivierten Kurses endete mit „Dieser Code gilt nicht.“ Es entstanden
  weder Lern-ID noch Wiederherstellungscode noch Sitzung. §6.10 ist damit
  vollständig belegt.

---

### A5 Was in keinem Schritt vorkommt

| | Warum |
| --- | --- |
| `db push` ohne vorherigen `--dry-run` | Was angewandt wird, sieht man vorher an, nicht danach |
| `--include-all` | nimmt ausdrücklich alles mit, was in der Historie fehlt |
| Eine Migrationsdatei verschieben, umbenennen oder löschen | `db push` vergleicht Fassungen, nicht Inhalte; die Datei käme als „nie angewandt" zurück |
| Eine angewandte Migration nachträglich ändern | gilt als angewandt und läuft nie wieder – Korrekturen sind neue additive Migrationen |
| `migration repair` vor der Messung | er trägt „angewandt" ein, ohne auszuführen; vor der Messung trüge die Historie womöglich eine Lüge |

---

## Teil B – Der Live-Happy-Path, in einem Durchgang

Dieser Teil holt nach, was `inbetriebnahme-staging.md` §0.5 als offen führt:
Veröffentlichen, beide Lernrichtungen, Synchronisieren, Archivieren. Er
läuft auf der **Pilotadresse**, nicht lokal.

**Er ist ein Durchgang, keine Liste.** Die dreizehn Schritte hängen aneinander
– ohne veröffentlichte Fassung gibt es nichts zuzuweisen, ohne Zuweisung
nichts zu üben. Wer mittendrin abbricht, fängt bei B2 wieder an.

### Vorher bereitlegen

- Zwei Geräte oder zwei Browser (für B9/B10 zwingend: zwei **Sitzungen**
  derselben lernenden Person).
- Ein drittes Fenster oder ein privates Fenster für die Lehrkraft.
- Eine fertige Paketdatei mit **mindestens zwölf** Einträgen – zehn ist die
  Lerntagsschwelle, und darunter zeigt „Heute" nichts Belastbares.
- Testnamen, die als Test erkennbar sind: `Probe Fuchs`, `Probe Dachs`.
  **Keine echten Namen, keine echten Lernenden** – Teil E ist nicht fertig.

### Der Durchgang

| # | Schritt | Erwartet | §0.5 |
| --- | --- | --- | --- |
| 1 | Pilotadresse öffnen, als Lehrkraft anmelden | **Sichtprüfung:** das Pilotband steht oben, auf dieser und jeder weiteren Seite | belegt |
| 2 | Kurse → Neuer Kurs | Der Kurs steht in der Liste | belegt |
| 3 | Material → Übernehmen, Paketdatei wählen | Das Paket steht als Entwurf im Konto | — |
| 4 | Dieselbe Datei **noch einmal** übernehmen | **Dasselbe** Paket, kein zweites (ADR-4) | — |
| 5 | Material → Veröffentlichen | Eine Fassung entsteht, Nummer 1 | **§6.7** |
| 6 | Material → Zuweisen | Das Paket erscheint im Kurs | belegt |
| 7 | Kurs → Einladungscode, Gültigkeit und Plätze setzen | Acht Zeichen | belegt |
| 8 | Im zweiten Browser beitreten: `Probe Fuchs` | **Sichtprüfung:** Lern-ID und Wiederherstellungscode erscheinen, **je einmal**. Beide abschreiben – sie sind danach weg | belegt |
| 9 | Im dritten Fenster beitreten: `Probe Dachs` | dito | belegt |
| 10 | Als `Probe Fuchs` je eine Runde in **beiden** Richtungen, über **alle vier** Übungsformen: Karteikarten, Selbsttest, freies Üben, Vokabelliste. Mindestens zwölf Aufgaben insgesamt | Jede Form startet und zählt; „Heute" zeigt danach einen Lerntag | **§6.7** |
| 11 | Dieselbe Person auf dem **zweiten** Gerät anmelden | **Sichtprüfung:** derselbe Lernstand, dieselbe Serie | **§6.8** |
| 12 | Auf **beiden** Geräten üben, ohne dazwischen neu zu laden | **Sichtprüfung:** kein stiller Verlust – nach dem Neuladen zeigen beide Geräte denselben Stand; die später gesendete Antwort hat gewonnen. Es gibt dabei bewusst keine sichtbare Konfliktmeldung (§6.9). | **§6.9** |
| 13 | Als Lehrkraft den Kurs archivieren, dann als `Probe Fuchs` weiterüben | Die Gruppe übt weiter, der Lernstand läuft mit; niemand kommt neu hinzu, alte Codes führen nicht mehr hinein (ADR-12) | **§6.10** |

### Die vier Stellen, an denen wirklich jemand hinsehen muss

Alles andere ist „klappt oder klappt nicht" und meldet sich von selbst.
Diese vier melden sich **nicht**, wenn sie falsch laufen:

1. **Schritt 1 – das Pilotband.** Eine Auslieferung ohne Band sieht aus wie
   ein fertiges Produkt. `verify:deploy` prüft, dass der Text im Bündel
   steht; dass er auch **sichtbar** ist, sieht nur ein Mensch.
2. **Schritt 8/9 – Lern-ID und Wiederherstellungscode.** Sie erscheinen
   genau einmal. Wer hier nicht mitschreibt, merkt es erst, wenn jemand sein
   Kennwort vergisst – und dann ist es zu spät.
3. **Schritt 11 – derselbe Stand.** Ein leerer Stand auf dem zweiten Gerät
   sieht aus wie „noch nichts geübt" und nicht wie ein Fehler.
4. **Schritt 12 – der Revisionskonflikt.** Der gefährlichste Fall im ganzen
   Protokoll: Die Auflösung ist absichtlich unsichtbar. Deshalb vorher
   notieren, in welchem Fach ein bestimmtes Wort steht, auf beiden Geräten
   antworten und danach auf beiden neu laden. Beide müssen denselben Stand
   zeigen; die später gesendete Antwort muss gewonnen haben.

### Ergebnis 08./09.10.2026

Der Durchgang lief auf der öffentlichen Pilotadresse ausschließlich mit
künstlichen Testdaten (`Pilotprobe 2026-10-08`, `Probe Fuchs`, `Probe Dachs`).

| Schritte | Ergebnis |
| --- | --- |
| 1–9 | Pilotband sichtbar; Kurs, Paket, Fassung 1, Zuweisung, Einladung und zwei künstliche Lernkonten funktionierten. Lern-ID und Wiederherstellungscode wurden jeweils einmal angezeigt und außerhalb des Projekts gesichert. |
| 10 | Beide Lernrichtungen und alle vier Übungswege liefen; die Vokabelliste zeigte alle zwölf Einträge. „Heute" zeigte danach einen Lerntag. |
| 11 | Derselbe Lernstand und dieselbe Serie waren in zwei getrennten Browsersitzungen sichtbar. |
| 12 | Beide Sitzungen öffneten dieselbe Karte. Sitzung A antwortete zuerst, Sitzung B danach ohne Neuladen. Nach dem Neuladen zeigten beide 21 Antworten und denselben Stand; anschließend stieg der Stand regulär auf 22. Keine sichtbare Konfliktmeldung – wie in §6.9 festgelegt. |
| 13 | Archivierung, ausgeblendete Änderungen und Codeerzeugung, sichtbarer abgeschlossener Kurs, Weiterüben und gespeicherter Lernstand sind live belegt. Dabei wurde ein Fehler gefunden: archivierte Kurse fehlten zunächst in „Heute", „Üben" und „Mein Fortschritt". Korrigiert in `8c8f5d4`, GitHub-Prüfkette 4.018 Tests grün, danach auf der Pilotadresse in allen vier Lernendenbereichen live bestätigt. Die letzte Gegenprobe deckte einen zweiten Weg auf: Die anonyme Kontoanlage verbrauchte den Code vor der Archivprüfung. Korrigiert mit Migration 16; der erneute Live-Versuch endete neutral mit „Dieser Code gilt nicht.“ und ohne Lern-ID, Wiederherstellungscode oder Sitzung. |

### Danach

- [x] **Getan:** Schritte 1 bis 13 einschließlich der vier Sichtprüfungen.
- [x] **Getan:** Die Zeilen 6.7 bis 6.10 in
      `inbetriebnahme-staging.md` §0.5 auf **belegt** gesetzt.
- **Ergebnis:** Prüfung 5 ist grün.
- [ ] **Tun:** Die Testkonten stehen lassen – Teil C und D arbeiten damit
      weiter, und `Probe Loeschen` aus der Löschprobe kommt noch dazu.


## Teil C – Rollen, Rechte, Wiederherstellung

### C1 Die Lehrkraft sieht keine Lernstände

- [ ] **Tun:** Als Lehrkraft jeden Bildschirm durchgehen.
- **Erwartet:** **Keine** Zahl über das Üben – nicht „zuletzt aktiv", nicht
  „x von y", kein Punkt hinter einem Namen.
- **Danach:** Das Produktversprechen ist einmal mit Augen geprüft.

### C2 Die Selbsterhebung geht nicht

- [ ] **Tun:** Als **lernende** Person, in der Browserkonsole auf der
      Pilotadresse, eine Rollenänderung am eigenen Profil versuchen.
- **Erwartet:** Abgelehnt.
- **Danach:** Riegel 3 aus Migration 14 ist am echten System belegt – das
  ist der Punkt, den der SQL Editor **nicht** zeigen kann, weil er als
  Besitzer spricht.

### C3 Mitgliedschaft entfernen

- [ ] **Tun:** Kurs → Mitglieder → Entfernen.
- **Erwartet:** Für die Person verschwinden Kurs und Pakete sofort.
- [ ] **Tun:** Wieder beitreten lassen.
- **Erwartet:** Der Lernstand ist noch da.

### C4 Ein Konto stilllegen

- [ ] **Tun:** Serverseitig `disabled_at` setzen (nur `service_role`).
- **Erwartet:** Die Person sieht **nichts** mehr – keine Kurse, keine Pakete.
- [ ] **Tun:** Dieselbe Person versucht sich anzumelden.
- **Erwartet:** Die Anmeldung **gelingt**, und danach ist nichts zu sehen.
  Das ist kein Fehler: Die Anmeldung führt Supabase Auth, nicht diese
  Datenbank. Steht es hier anders, ist etwas anderes passiert.
- [ ] **Tun:** `disabled_at` zurück auf `null`.
- **Erwartet:** Alles ist wieder da, einschließlich Lernstand.

### C5 Kennwort vergessen

- [ ] **Tun:** Als Lernende: Lern-ID + Wiederherstellungscode → neues
      Kennwort.
- **Erwartet:** Es klappt, und es kommt ein **neuer** Code.
- [ ] **Tun:** Den **alten** Code noch einmal benutzen.
- **Erwartet:** Abgelehnt.

### C6 Abmelden

- [ ] **Tun:** Abmelden, dann zurück-Taste.
- **Erwartet:** Keine Inhalte mehr, auch nicht kurz.
- [ ] **Tun:** Mitten in einer Übungsrunde abmelden.
- **Erwartet:** Die Rückfrage „ginge etwas verloren?" erscheint (E14).

---

## Teil D – Fehler, Offline, Leerzustände

### D1 Ohne Netz

- [ ] **Tun:** Netzwerk in den Entwicklerwerkzeugen auf „Offline", dann
      Kurse, Material, Heute, Mein Fortschritt und eine Übungsrunde öffnen.
- **Erwartet:** Überall **„Keine Verbindung"** und **„Erneut versuchen"**.
  Nirgends eine Ladeanzeige, die stehen bleibt. Nirgends „Noch kein Kurs"
  oder „Noch kein Paket".
- [ ] **Tun:** Netz wieder an, „Erneut versuchen".
- **Erwartet:** Die Ansicht lädt.

### D2 Nichts wird falsch zugesagt

- [ ] **Tun:** Offline eine Antwort geben.
- **Erwartet:** Keine Meldung, die Speichern behauptet.

### D3 Leere Zustände

- [ ] **Tun:** Mit einem frischen Lernendenkonto anmelden, **bevor** ein
      Paket zugewiesen ist.
- **Erwartet:** Erklärte Leerzustände, kein Fehler.

### D4 KI ist sichtbar gesperrt

- [ ] **Tun:** Als Lehrkraft den KI-Zugang öffnen.
- **Erwartet:** „Im Pilot nicht freigegeben", kein Feld für einen Schlüssel.
- [ ] **Tun:** Netzwerkanzeige mitlaufen lassen.
- **Erwartet:** **Kein** Aufruf von `ai-gateway`, in keiner Ansicht.

---

## Teil E – Datenschutz, Support, Sicherung, Rückfall

**Dieser Teil steht vor der Auslieferung an Menschen, nicht danach.**
Solange er offen ist, arbeitet der Pilot ausschließlich mit künstlichen
Testkonten; die Adresse geht an keine Lehrkraft, keine Lernenden und keine
Erziehungsberechtigten.

### E1 Information für Erziehungsberechtigte und Lernende

- [ ] **Tun:** `docs/pilot-information-eltern.md` durchgehen, die eckigen
      Klammern ausfüllen (Schule, Ansprechperson, Enddatum) und verteilen.
- **Erwartet:** Das Blatt sagt, **was** gespeichert wird (Pseudonym,
  Kurzkennung, Lern-ID, Lernstand), **was nicht** (kein Klarname, keine
  E-Mail, keine Lernzeit), **wer es sieht** (die Lehrkraft nur die
  Mitgliedschaft) und **wie es wieder weggeht**.
- **Danach:** Der Pilot hat eine Grundlage. Ohne diesen Punkt beginnt er
  nicht.

> **Vorbereitet am 06.10.2026, noch nicht verteilt.** Ein Blatt mit `[…]`
> darin ist keine Information.

### E2 Löschen auf Zuruf – praktisch belegt

- [ ] **Tun:** `docs/pilot-loeschprobe.md` abarbeiten, L0 bis L7.
- **Erwartet:** Acht Zählwerte auf **0** für das Probekonto, **unverändert**
  für ein zweites Testkonto, Kurs und Paket stehen noch.
- **Danach:** Der Satz „ein Wort genügt" im Elternblatt ist belegt.

> **Vorbereitet am 06.10.2026, noch nichts gelöscht.** Die Probe läuft mit
> einem Konto namens `Probe Loeschen`, das eigens dafür angelegt wird – nie
> mit dem Konto einer echten Person. Sie setzt Teil B voraus, weil es vorher
> nichts zu löschen gibt.

### E3 Ansprechperson

- [ ] **Tun:** In `docs/anleitung-portal-lehrkraft.md` **und** im
      Elternblatt dieselbe Person eintragen: Name, Weg, Reaktionszeit.
- **Erwartet:** Zwei Dokumente, eine Person. Stehen dort zwei verschiedene,
  meldet am Ende niemand etwas.

### E4 Sicherung — **offen, und ein Pilotblocker**

> **Befund vom 06.10.2026, im Dashboard abgelesen.** Das Stagingprojekt
> läuft im **kostenfreien Tarif**. Die tägliche Sicherung um Mitternacht
> gilt dort **nicht**: Projektsicherungen sind nicht enthalten, planmäßige
> Sicherungen über sieben Tage gibt es erst im Pro-Tarif.
>
> **Es gibt derzeit kein Sicherungsintervall und keine Aufbewahrungsdauer.**
> Dieser Punkt wird **nicht** abgehakt, und er wird auch nicht durch einen
> Satz ersetzt.

Vor dem ersten echten Konto ist eine der beiden Entscheidungen zu treffen:

| | Weg | Was dann gilt |
| --- | --- | --- |
| **a** | **Pro-Tarif vor echten Schülerdaten** | tägliche Sicherung, sieben Tage Aufbewahrung – die Zahlen hier eintragen |
| **b** | **Ein eigenes Verfahren**, ausdrücklich beschrieben und **praktisch getestet** | Intervall, Ablageort, Aufbewahrungsdauer und ein gelaufener Wiederherstellungsversuch – alles vier, sonst ist es kein Verfahren |

- [ ] **Tun:** Entscheidung treffen und eintragen.
- [ ] **Tun:** Bei (b) zusätzlich: einen Wiederherstellungsversuch
      durchführen und das Ergebnis festhalten.
- **Bis dahin:** **nur künstliche Testdaten.** Das ist keine Vorsicht,
  sondern die einzige Haltung, die zu „es gibt keine Sicherung" passt – ein
  verlorener Lernstand einer echten Lerngruppe wäre nicht
  wiederherstellbar.

### E5 Rückfall: die portable Lerndatei

**Technisch belegt am 06.10.2026.** Die portablen Dateien sind neu gebaut:

| Datei | SHA-256 |
| --- | --- |
| `LexiFlow-Lehrkraft.html` | `816ebfcd06599811456ed6fb691bbb14dd37febf0f23bcc2384bf875d91dadc7` |
| `LexiFlow-Lernlaufzeit.html` | `ae26b455ca32c72b5e69ea03f3cd55f13d3b26e025808b7d22b4e4cc10ca9903` |

- `npm run verify:portable`: **32** Prüfungen grün.
- `npm run e2e:portable`, außerhalb der macOS-Sandbox: **29 von 29** grün,
  einschließlich `file://` und der Offlinefälle.

- [x] **Technisch:** Die Dateien existieren, sind geprüft und laufen ohne
      Netz und ohne Konto.
- [ ] **Offen – die eigentliche Zusage:** Die Dateien liegen **auf dem
      Rechner der Lehrkraft**, sie hat sie **einmal selbst geöffnet**, und
      sie weiss, dass das der Rückfall ist.

> **Warum das zwei Punkte sind.** Eine Datei, die geprüft im Projektordner
> liegt, hilft am Mittwoch niemandem. „Der Unterricht hängt nicht an dieser
> Adresse" ist erst wahr, wenn die Datei dort ist, wo unterrichtet wird.
> Diese Zeile bleibt offen, bis die Übergabe stattgefunden hat.


## Teil F – Ausliefern

> **Teil F liegt bei Codex.** GitHub-Anbindung, Pilotzweig, Ablauf, Pages
> und das Deployment selbst werden dort bearbeitet, ebenso die technische
> Browserabnahme. Dieses Protokoll führt die Punkte weiter mit, damit der
> Stand an **einer** Stelle steht – es arbeitet sie nicht parallel ab.
>
> **Teil F wird nicht ausgelöst, solange E4 offen ist.** Eine erreichbare
> Adresse ohne Sicherungsverfahren ist für künstliche Testdaten in Ordnung
> und für echte Konten nicht. Das ist die Reihenfolge, auf die es hier
> ankommt.

### F1 Werte hinterlegen

- [ ] **Tun:** Den Sprintzweig nach `github.com/mp-studio-official/LexiFlow`
      hochladen. Das Remote ist inzwischen eingetragen; `main` wird nicht
      hochgeladen.
- [ ] **Prüfen:** Der Pilotzweig ist der Standardzweig. Beim bislang leeren
      Projekt sollte der erste hochgeladene Zweig diese Rolle automatisch
      erhalten. Nur falls nicht: *Settings → General → Default branch*.
- [ ] **Tun:** Zwei Variablen im bestehenden Projekt hinterlegen –
      `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY`, nach
      `docs/pilot-auslieferung.md`.
- [ ] **Tun:** *Settings → Pages → Build and deployment → Source: GitHub
      Actions*.
- **Erwartet:** Zwei öffentliche Buildvariablen, **kein** persönlicher
  Deployment-Token, kein zweites Projekt und kein `gh-pages`-Zweig.

### F2 Redirect-URL

- [x] **Tun:** Die Pilotadresse in Supabase als Redirect-URL eintragen.
- **Erledigt.** Die operative Adresse
  `https://mp-studio-official.github.io/LexiFlow/portal/**` war bereits
  vorhanden. Der am 06.10.2026 zusätzlich eingetragene Weg unter
  `LexiFlow-Pilot` ist für die geänderte Auslieferung nicht nötig, aber
  unschädlich.
- **Danach:** Die Kennwortwiederherstellung einer Lehrkraft findet von der
  Pilotadresse aus zurück. `LEXIFLOW_ALLOWED_ORIGINS` blieb unberührt – ein
  Ursprung ist Schema plus Host ohne Pfad, und der Host ist derselbe.

### F3 Der Lauf

- [ ] **Tun:** Actions → „Pilot 0.1 ausliefern" → `pilot` eintippen.
- **Erwartet:** Prüfkette grün; `verify:deploy` meldet die geprüften Dateien
  und **keinen** Abbruch; der Schiebeschritt meldet das Ziel.
- **Danach:** Die Pilotadresse zeigt das Portal, mit Band.

### F4 Nachsehen

- [ ] **Tun:** Die Adresse in Safari und auf einem Telefon öffnen.
- **Erwartet:** Band oben, kein waagerechtes Scrollen, Anmeldung erreichbar.

---

## Was dieses Protokoll nicht kann

Es kann nicht sagen, ob der Pilot gelingt. Es sagt, was vorher einmal
gelaufen sein muss. Der erste Mensch, der Teil B abarbeitet, wird Dinge
finden, die hier nicht stehen – und genau dafür gibt es ihn.
