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

- [ ] **Tun:** Diese Ausgabe vollständig in ein neues Query im SQL Editor
      einfügen und ausführen. Es sind 129 Zeilen; die erste ist `begin;`,
      die letzte `commit;`.

- **Erwartet:** „Success. No rows returned."
- **Danach:** Riegel 1 bis 3 stehen. Die Historie **noch nicht**.
- **Warum die Klammer:** Die Migration ist reines DDL, und DDL ist in
  Postgres transaktional. Scheitert eine Zeile, wird nichts davon wirksam –
  statt eines halb angewandten Schemas, das in keinem Protokoll steht.
- **Wenn ein Fehler kommt:** `rollback;` ausführen, A1 wiederholen (die
  Werte müssen unverändert sein), Fehlermeldung notieren, hier anhalten.

**A3.4 Nachher messen – bevor irgendetwas nachgetragen wird**

- [ ] **Tun:** `docs/abnahme/migration-14.sql`, Abschnitte B1 bis B8.
- **Erwartet:** `funktionen 39 · trigger 14`; Regeln (28), Tabellen (16),
  Spalten (101) und **alle** Nutzdaten unverändert gegenüber A2; B4 nennt
  `role = 'student'`; B5 genau drei Spalten; B8 `prosecdef = false`.
- [ ] **Tun:** B9 ausführen.
- **Erwartet:** **13** Versionen, zuletzt `20261003090000`. Das ist richtig
  so: Der Editor schreibt keine Historie.

> **Diese Reihenfolge ist der Sinn der Sache.** Der Nachtrag unten markiert
> eine Fassung als angewandt, **ohne sie auszuführen**. Würde er vor der
> Messung stehen und die Migration wäre in Wahrheit gescheitert, trüge die
> Historie eine Lüge – und `db push` liefe nie wieder darüber. Deshalb erst
> messen, dann nachtragen.

**A3.5 Die Historie nachtragen**

- [ ] **Tun:**

```
npx --yes supabase@latest migration repair --linked --status applied 20261004090000
```

- **Erwartet:** Bestätigung, dass die Fassung als angewandt eingetragen ist.
- **Danach:** `db push` hält 14 für erledigt.
- **Rückfall:** Falsch eingetragen? Der Eintrag lässt sich zurücknehmen:

```
npx --yes supabase@latest migration repair --linked --status reverted 20261004090000
```

  Das ändert **nur** die Historie, nicht das Schema. Was im Editor gelaufen
  ist, bleibt gelaufen – ein tatsächliches Zurücknehmen der Migration wäre
  eine **neue additive Migration 16**, niemals eine Änderung an 14.

**A3.6 Nachsehen, dass es gewirkt hat**

- [ ] **Tun:**

```
npx --yes supabase@latest migration list --linked
```

- **Erwartet:** `20261004090000` steht in **beiden** Spalten (Local und
  Remote). `20261005090000` nur links.
- [ ] **Tun:** `docs/abnahme/migration-14.sql`, B9b im SQL Editor.
- **Erwartet:** 14 Versionen, zuletzt `20261004090000`.
- [ ] **Tun:**

```
npx --yes supabase@latest db push --linked --dry-run
```

- **Erwartet:** **Nur** `20261005090000_konto_stilllegen`.
- **Danach:** Das ist der Beweis, dass Folge B genau eine Migration anwendet.
  Steht 14 hier noch dabei, ist A3.5 nicht angekommen – dann nicht weiter.

**A3.7 Das Protokoll umschreiben**

- [ ] **Tun:** In `docs/abnahme/migration-14.sql` den Kopf von „NOCH NICHT
      AUSGEFÜHRT" auf „ausgeführt am …" ändern und die gemessenen Werte
      eintragen.
- **Danach:** `20261004090000_rollenriegel.sql` ist **unveränderlich**.
  Prüfung 4 in `npm run pilot:pruefen` zählt 14 als angewandt.

---

### A4 · Folge B – Migration 15 anwenden und abnehmen

**A4.1 Der Trockenlauf**

- [ ] **Tun:**

```
npx --yes supabase@latest db push --linked --dry-run
```

- **Erwartet:** **Genau eine** Datei: `20261005090000_konto_stilllegen`.
- **Wenn zwei dastehen:** Folge A ist nicht abgeschlossen. Zurück zu A3.5.

**A4.2 Die Lage vorher messen**

- [ ] **Tun:** `docs/abnahme/migration-15.sql`, Abschnitte A1 bis A3.
- **Erwartet:** `spalten 101 · funktionen 39 · trigger 14` – also genau der
  Stand, den Folge A hinterlassen hat.

**A4.3 Anwenden**

- [ ] **Tun:**

```
npx --yes supabase@latest db push --linked --skip-vault
```

- **Erwartet:** Genau eine angewandte Fassung: `20261005090000`.
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

- [ ] **Tun:** `docs/abnahme/migration-15.sql`, Abschnitte B1 bis B8.
- **Erwartet:** `spalten 102 · funktionen 40`; Regeln 28, Trigger 14 und alle
  Nutzdaten unverändert; B3 zeigt **0** stillgelegte Konten; B6 zeigt
  `service_role · disabled_at` und `authenticated · display_name`, **nicht**
  `authenticated · disabled_at`; B7 zeigt 15 Versionen; B8 nichts
  Ausstehendes mehr.

**A4.5 Das Protokoll umschreiben**

- [ ] **Tun:** Kopf und Werte in `docs/abnahme/migration-15.sql` eintragen.
- **Danach:** Prüfung 4 wird grün.

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

## Teil B – Der Live-Happy-Path

Dieser Teil holt nach, was `inbetriebnahme-staging.md` §0.5 als offen
führt. Er läuft auf der **Pilotadresse**, nicht lokal.

### B1 Lehrkraft anmelden

- [ ] **Tun:** Pilotadresse öffnen, anmelden.
- **Erwartet:** Oben steht das Band „Pilotfassung 0.1 …". Danach der Start
  der Lehrkraft.
- **Danach:** Eine Sitzung besteht.

### B2 Kurs anlegen

- [ ] **Tun:** Kurse → Neuer Kurs.
- **Erwartet:** Der Kurs steht in der Liste.

### B3 Paket übernehmen

- [ ] **Tun:** Material → Übernehmen, eine bestehende Paketdatei wählen.
- **Erwartet:** Das Paket steht als Entwurf im Konto.
- [ ] **Tun:** Dieselbe Datei ein zweites Mal übernehmen.
- **Erwartet:** **Dasselbe** Paket, kein zweites (ADR-4).

### B4 Veröffentlichen — §6.7

- [ ] **Tun:** Material → Veröffentlichen.
- **Erwartet:** Eine Fassung entsteht, Nummer 1.
- **Danach:** Es gibt eine unveränderliche Fassung. Der Entwurf lässt sich
  weiter bearbeiten, ohne dass die Lerngruppe etwas davon sieht.

### B5 Kurs zuweisen

- [ ] **Tun:** Zuweisen.
- **Erwartet:** Das Paket erscheint im Kurs.

### B6 Einladungscode

- [ ] **Tun:** Kurs → Einladungscode, Gültigkeit und Plätze setzen.
- **Erwartet:** Acht Zeichen.
- **Danach:** Der Code steht **nirgends** gespeichert – nur sein
  Fingerabdruck.

### B7 Zwei Lernende treten bei

- [ ] **Tun:** In einem **anderen** Browser (oder privaten Fenster) beitreten,
      zweimal.
- **Erwartet:** Je eine Lern-ID und ein Wiederherstellungscode, je **einmal**
  sichtbar. Beide notieren.
- **Danach:** Zwei Konten, beide `student`.

### B8 Beide Lernrichtungen und die Übungsformen — §6.7

- [ ] **Tun:** Als Lernende üben: Englisch → Deutsch **und** Deutsch →
      Englisch; Karteikarten, Selbsttest, freies Üben, Vokabelliste.
- **Erwartet:** Jede Form startet und zählt.
- **Danach:** Es gibt Lernstand und Ereignisse.

### B9 Fortschritt synchronisieren — §6.8

- [ ] **Tun:** Dieselbe Person auf einem **zweiten** Gerät anmelden.
- **Erwartet:** Derselbe Stand.
- **Danach:** Der Lernstand hängt am Konto, nicht am Gerät.

### B10 Revisionskonflikt — §6.9

- [ ] **Tun:** Auf beiden Geräten üben, ohne dazwischen neu zu laden.
- **Erwartet:** Kein stiller Verlust: Das zweite Gerät merkt den Konflikt.
- **Danach:** Der beschriebene Konfliktweg ist einmal wirklich gelaufen.

### B11 Archivieren und weiterlernen — §6.10

- [ ] **Tun:** Kurs archivieren, dann als Lernende weiterüben.
- **Erwartet:** Die Gruppe übt weiter, der Lernstand läuft weiter; niemand
  kommt neu hinzu, alte Codes führen nicht mehr hinein (ADR-12).

### B12 §0.5 berichtigen

- [ ] **Tun:** Die Zeilen 6.7 bis 6.10 in `inbetriebnahme-staging.md` §0.5
      auf **belegt** setzen.
- **Danach:** Prüfung 5 wird grün.

---

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

### E1 Einwilligung und Hinweis

- [ ] **Tun:** Die Erziehungsberechtigten der Lerngruppe informieren; den
      Datenschutzhinweis im Portal gegenlesen.
- **Erwartet:** Es steht dort, **was** gespeichert wird (Pseudonym,
  Kurzkennung, Lernstand), **was nicht** (kein Klarname, keine E-Mail für
  Lernende, keine Lernzeit) und **wer es sieht**.
- **Danach:** Der Pilot hat eine Grundlage. Ohne diesen Punkt beginnt er
  nicht.

### E2 Löschen auf Zuruf

- [ ] **Tun:** Den Weg aufschreiben, wie ein Konto samt Lernstand gelöscht
      wird, wenn jemand es verlangt. Einmal durchspielen.
- **Erwartet:** Es gibt einen Weg, und jemand hat ihn gemacht.
- **Danach:** „Wir löschen das dann" ist keine Behauptung mehr.

### E3 Ansprechperson

- [ ] **Tun:** In `docs/anleitung-portal-lehrkraft.md` die drei Zeilen
      ausfüllen: Name, Weg, Reaktionszeit.

### E4 Sicherung

- [ ] **Tun:** Im Dashboard nachsehen, **wie oft** gesichert wird und wie
      lange die Sicherungen bleiben. Eintragen.
- **Erwartet:** Zwei Zahlen, keine Vermutung.

### E5 Rückfall

- [ ] **Tun:** Die portable Lerndatei aller Pakete bauen und der Lehrkraft
      **vor** dem Pilot übergeben.
- [ ] **Tun:** Sie einmal öffnen, ohne Netz.
- **Erwartet:** Sie läuft.
- **Danach:** Der Unterricht hängt nicht an der Adresse. Was dabei verloren
  ginge – der gemeinsame Lernstand – ist bekannt und in Kauf genommen
  (`docs/pilot-auslieferung.md`).

---

## Teil F – Ausliefern

### F1 Werte hinterlegen

- [ ] **Tun:** Pilotprojekt anlegen, Pages einschalten, Variablen und das
      eine Geheimnis hinterlegen – alles nach `docs/pilot-auslieferung.md`.
      **Nichts davon in den Chat.**

### F2 Redirect-URL

- [ ] **Tun:** Die Pilotadresse in Supabase als Redirect-URL eintragen.
- **Erwartet:** Sonst führt die Kennwortwiederherstellung ins Leere.

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
