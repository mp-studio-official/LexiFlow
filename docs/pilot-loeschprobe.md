# Die Löschprobe (Teil E2)

> **Live belegt am 12.10.2026.** Die Probe lief ausschließlich mit dem
> künstlichen Konto `Probe Loeschen`. Gelöscht wurde es über den vorgesehenen
> Weg im Supabase-Dashboard; das bleibende Kontrollkonto `Probe Sperre`, Kurs
> und Paket blieben erhalten.

## Warum es diese Probe gibt

Im Elternblatt steht der Satz „Ein Wort genügt – das Konto und der gesamte
Lernstand werden gelöscht." Dieser Satz ist entweder belegt oder eine
Behauptung. Zwischen beidem liegt genau diese Probe.

## Was gelöscht werden muss, damit „gelöscht" stimmt

Ein Lernendenkonto hinterlässt Spuren in sieben Tabellen. Die Probe prüft
jede einzeln – nicht, weil Zweifel am Schema bestehen, sondern weil eine
vergessene Tabelle genau so aussieht wie eine gelöschte.

| Tabelle | Was dort steht |
| --- | --- |
| `auth.users` | das Konto selbst |
| `profiles` | Name, Kurzkennung, Rolle |
| `learner_accounts` | Lern-ID und der Hash des Wiederherstellungscodes |
| `learner_settings` | Zeitzone, Wochenziel |
| `course_members` | die Mitgliedschaft im Kurs |
| `pack_progress` / `entry_progress` | der Lernstand |
| `progress_events` | die gezählten Aufgaben |

## Der Weg: eine Zeile, und der Rest folgt

`profiles.id` verweist auf `auth.users (id)` mit `on delete cascade`, und
alle sieben oben hängen über `profiles` oder direkt an `auth.users` – jeweils
mit `cascade`. Das Löschen des Kontos räumt deshalb alles mit ab.

> **Warum das trotzdem nachgemessen wird.** „Es steht `cascade` im Schema"
> ist eine Aussage über die Datei, nicht über die Datenbank. Gemessen wird,
> was danach wirklich dasteht.

> **Eine Grenze, die dazugehört.** Bei einer **Lehrkraft** geht das so
> nicht: `courses.owner_id` und `pack_revisions.published_by` verweisen mit
> `on delete restrict`. Ein Lehrkraftkonto lässt sich erst löschen, wenn
> geklärt ist, was mit ihren Kursen und veröffentlichten Fassungen
> geschieht. Das ist kein Mangel, sondern die richtige Reihenfolge – aber es
> heisst, dass die Zusage „Löschen auf Zuruf" im Elternblatt für
> **Lernende** gilt. Für Lehrkräfte wäre es ein eigener Vorgang.

---

## Ablauf

### L0 Ein Konto eigens für die Probe

- [x] **Getan:** Im Pilotkurs über den Einladungscode ein Konto angelegt.
      Name: **`Probe Loeschen`**. Lern-ID und Wiederherstellungscode
      notieren.
- **Erwartet:** Das Konto existiert, Rolle `student`.
- **Danach:** Es gibt ein Konto, dessen einziger Zweck das Löschen ist.

> Der Name ist mit Absicht unübersehbar. Ein Testkonto, das „Max" heisst,
> wird irgendwann für einen echten Max gehalten.

### L1 Spuren erzeugen – sonst prüft die Probe nichts

- [x] **Getan:** Als dieses Konto angemeldet, **mindestens zwölf Aufgaben**
      beantworten (über die Lerntagsschwelle von zehn), in beiden
      Lernrichtungen. Eine Zeitzone bestätigen und ein Wochenziel setzen.
- **Erwartet:** Danach gibt es Zeilen in allen sieben Tabellen.

### L2 Vorher zählen

- [x] **Getan:** Im SQL Editor mit der Kennung des Testkontos gezählt:

```
-- <TESTKONTO> durch die UUID des Probekontos ersetzen
select 'auth.users'        as tabelle, count(*) from auth.users        where id      = '<TESTKONTO>'
union all select 'profiles',           count(*) from profiles          where id      = '<TESTKONTO>'
union all select 'learner_accounts',   count(*) from learner_accounts  where user_id = '<TESTKONTO>'
union all select 'learner_settings',   count(*) from learner_settings  where user_id = '<TESTKONTO>'
union all select 'course_members',     count(*) from course_members    where user_id = '<TESTKONTO>'
union all select 'pack_progress',      count(*) from pack_progress     where user_id = '<TESTKONTO>'
union all select 'entry_progress',     count(*) from entry_progress    where user_id = '<TESTKONTO>'
union all select 'progress_events',    count(*) from progress_events   where user_id = '<TESTKONTO>';
```

- **Erwartet:** **Jede** Zeile grösser als 0. Steht irgendwo 0, ist L1 nicht
  vollständig gelaufen – dann nicht löschen, sondern nachholen. Eine Probe,
  die eine leere Tabelle leert, beweist nichts.
- **Gemessen vorher:** `auth.users 1 · profiles 1 · learner_accounts 1 ·
  learner_settings 1 · course_members 1 · pack_progress 1 ·
  entry_progress 4 · progress_events 13`.
- [x] **Getan:** Dieselbe Abfrage für das zweite, bleibende Testkonto
      ausführen und die Zahlen notieren.
- **Erwartet:** Zahlen grösser als 0. Sie sind die Gegenprobe in L5.
- **Gemessen vorher (`Probe Sperre`):** in allen acht Zählwerten jeweils
  **1**.

### L3 Die Kennung sichern

- [x] **Getan:** Die UUID des Probekontos vor der Löschung notiert.
- **Warum:** Nach dem Löschen ist sie nirgends mehr nachzuschlagen, und ohne
  sie lässt sich L4 nicht ausführen.

### L4 Löschen

- [x] **Getan:** Im Supabase-Dashboard: *Authentication → Users →* das Konto
      `Probe Loeschen` → **Delete user**.
- **Erwartet:** Das Konto verschwindet aus der Liste.
- **Danach:** Alle sieben Tabellen sollten die Zeilen verloren haben.
- **Gemessen:** Supabase bestätigte die erfolgreiche Löschung; Konto und UUID
  verschwanden aus der Nutzerliste.

> **Warum über das Dashboard und nicht per SQL.** Weil genau das der Weg
> ist, den später jemand geht, wenn eine Familie anruft. Eine Probe auf
> einem Weg, den niemand benutzt, prüft den falschen Weg.
>
> **Warum nicht über die Anwendung.** Weil es dort keinen Weg gibt. Das ist
> der ehrliche Stand: Löschen ist im Pilot eine Handlung der Administration,
> und genau deshalb steht im Elternblatt eine Ansprechperson und keine
> Schaltfläche.

### L5 Nachher zählen

- [x] **Getan:** Dieselbe Abfrage aus L2 mit derselben UUID ausgeführt.
- **Erwartet:** **Jede** Zeile **0**. Acht Nullen, keine Ausnahme.
- **Gemessen nachher:** alle acht Zählwerte **0**.
- [x] **Getan:** Die Abfrage für das zweite Testkonto wiederholt.
- **Erwartet:** **Unverändert** gegenüber L2. Das ist die Gegenprobe: Ein
  Löschvorgang, der zu viel mitnimmt, fällt sonst erst auf, wenn es jemandem
  weh tut.
- **Gemessen nachher (`Probe Sperre`):** unverändert in allen acht
  Zählwerten jeweils **1**.

### L6 Der Kurs steht noch

- [x] **Getan:** Kurs- und Paketbestand gegen das bleibende Kontrollkonto
      nachgemessen.
- **Erwartet:** Der Kurs, das Paket und die übrigen Mitglieder sind da. In
  der Mitgliederliste fehlt `Probe Loeschen`.
- **Gemessen:** `kurs_bleibt = true`, `paket_bleibt = true`; die gelöschte
  Mitgliedschaft steht auf **0**, die Kontrollmitgliedschaft auf **1**.

### L7 Eintragen

- [x] **Getan:** Die gemessenen Zahlen in `docs/pilot-abnahme.md`, Teil E2,
      eintragen; Datum und wer es ausgeführt hat.
- **Danach:** Der Satz im Elternblatt ist belegt und keine Behauptung mehr.
- **Ausgeführt am 12.10.2026:** durch den Projektinhaber im
  Supabase-Dashboard, begleitet und nachgemessen durch Codex.

---

## Was diese Probe nicht zeigt

Sie zeigt nicht, dass Supabase die Daten physisch von allen Datenträgern
entfernt hat, und auch nicht, was in einer Sicherung liegt. Beides ist eine
Frage an den Anbieter, keine an dieses Schema.

Der zweite Punkt hat gerade keine praktische Bedeutung: Der kostenfreie
Tarif enthält **keine** Sicherungen (siehe Teil E4). Sobald sich das ändert,
gehört die Frage „was passiert mit gelöschten Daten in einer Sicherung?" in
dieselbe Entscheidung.
