# Was „Heute" und „Mein Fortschritt" aus heutigen Daten können

**Nur gelesen.** Keine Migration erstellt, keine angewandt, kein `db push`,
keine Datenbankänderung. Dieses Dokument ist die Grundlage für die Planung von
5B.4 und 5B.6 — nicht ihre Umsetzung.

Stand: 02.10.2026, HEAD `f5cf872`.

---

## 1. Was heute existiert

### 1.1 Profil

`profiles` trägt `id`, `display_name`, `short_code`, `role`, `created_at` —
**mehr nicht**. Keine Zeitzone, keine Einstellung, kein Ziel.

Für die Rechte zählt eine Eigenheit: `profiles_select` erlaubt das Lesen über
`app_sees_profile(id)`, und das heißt **jede Lehrkraft eines Kurses, in dem
die Person Mitglied ist**. Postgres-RLS wirkt zeilenweise, nicht spaltenweise:
Eine neue Spalte auf `profiles` wäre damit für diese Lehrkräfte mitlesbar.
Schreiben darf nur die Person selbst, und `grant update (display_name)`
beschränkt das Schreiben heute auf genau diese eine Spalte.

### 1.2 Lernstand

| Tabelle | Felder, die hier zählen |
| --- | --- |
| `pack_progress` | `session_count`, `answered_count`, `correct_count`, `last_practiced_at` |
| `entry_progress` | `box`, `correct_count`, `wrong_count`, `streak`, `last_answered_at`, `due_at`, `rev`, `last_event_id` |
| `progress_events` | `event_id` (PK), `user_id`, `recorded_at` |

**`entry_progress.streak` ist nicht die Lernserie.** Es ist die Zahl der
richtigen Antworten in Folge **für eine Vokabel in einer Richtung** — eine
Leitner-Größe. Die Lernserie aus 4.5 (aufeinanderfolgende Lerntage) gibt es
nirgends.

**`progress_events` ist kein Ereignisprotokoll, sondern ein Riegel gegen
Doppelzählung.** Es steht kein `outcome` darin, kein Paket, keine Vokabel und
kein `occurred_at` — nur die Kennung, die Person und wann der Server sie
entgegengenommen hat.

### 1.3 Übungssitzungen

`begin_practice_session` zählt `session_count` hoch und setzt
`last_practiced_at`. **Ein Ende wird nirgends erfasst** — kein
`end_practice_session`, kein `ended_at`, keine Dauer. Der Quelltext kennt
kein Gegenstück.

### 1.4 Zeitstempel und ihre Vertrauensgrenze

| Zeitstempel | Quelle | Verlässlich für |
| --- | --- | --- |
| `progress_events.recorded_at` | `now()` am Server | **wann der Server die Antwort angenommen hat** |
| `pack_progress.last_practiced_at` | `now()` am Server | dasselbe |
| `entry_progress.last_answered_at` | aus dem Ereignis, also vom Gerät | nichts, worauf eine Regel aufbauen darf |
| `due_at` | vom Gerät gerechnet | die eigene Wiederholungsplanung |
| `occurredAt` im Ereignis | vom Gerät | wird **nicht gespeichert** |

Die Migration sagt es selbst: „`now()` und nicht `occurredAt`: Ein Zeitstempel
vom Gerät ist nicht überprüfbar. Der Preis ist benannt — eine Runde, die
offline entstand, trägt den Zeitpunkt des Hochladens."

**Das ist die entscheidende Grenze dieses Berichts.** Alles, was serverseitig
über Tage entschieden wird, kann nur auf `recorded_at` beruhen.

### 1.5 Schnittstellen

`ProfileRepository` kann `myProfile()` und `updateDisplayName()` — sonst
nichts. `ProgressRepository` kann `myPackProgress`, `myEntryProgress`,
`beginSession`, `recordEvents`, `resetMyProgress`. Für eine kursübergreifende
Abfrage („alle fälligen Wörter") gibt es **keine** Methode; heute wird je Kurs
und Paket einzeln gefragt (so macht es `UebenPage` seit 5B.5).

### 1.6 Zeitzone, Wochenziel, Lernzeit

**Nirgends gespeichert.** Weder in einer Migration noch im Quelltext noch in
der portablen Fassung. Die einzigen Treffer auf „Lernzeit" sind Sätze darüber,
dass Lehrkräfte sie **nicht** sehen.

---

## 2. Verfügbarkeit je Wert

| Wert | vorhanden | sicher ableitbar | fehlt | Migration nötig | Produktentscheidung nötig |
| --- | --- | --- | --- | --- | --- |
| zuletzt verwendetes Paket | ja — `pack_progress.last_practiced_at` | ja | — | nein | nein |
| fällige Wiederholungen | ja — `entry_progress.due_at` | ja | kursübergreifende Abfrage | nein | nein |
| Kurse | ja — `courses`, `course_members` | ja | — | nein | nein |
| Wochenaktivität (sieben Punkte) | teilweise — `progress_events.recorded_at` | ja, **in der Zeitzone der Person** | die Zeitzone | **ja** (Zeitzone) | nein |
| Lernserie | nein | nein | Zeitzone, Tagesregel als gespeicherter Stand | **ja** | nein |
| Ruhetage | nein | nein | nichts Eigenes — folgt aus der Serie | nein (über die Serie) | nein |
| Wochenziel | nein | nein | Feld **und Einheit** | **ja** | **ja** |
| beherrschte/offene Wörter | ja — `entry_progress.box` | ja (`isEntryMastered`, Fach 4–5 gegen 1–3) | kursübergreifende Abfrage | nein | nein |
| schwierige Wörter | ja — `wrong_count` + `box` | ja (E24, seit 5B.5 umgesetzt) | — | nein | nein |
| Lernzeit | **nein** | **nein** | ein Sitzungsende | **ja**, wenn überhaupt | **ja** |

### 2.1 Lernzeit — nicht seriös berechenbar

Es gibt genau zwei Kandidaten, und beide messen etwas anderes:

- **Seitenöffnungszeit.** Sie wird nirgends erfasst, und sie misst, wie lange
  ein Tab offen war — nicht, wie lange jemand gelernt hat. Ein Telefon in der
  Tasche lernt nicht.
- **Abstand zwischen zwei Antworten.** Aus `recorded_at` berechenbar, aber er
  misst den Abstand zwischen zwei **Uploads**. Offline gesammelte Antworten
  kommen gebündelt an; ihr Abstand ist dann Millisekunden, obwohl eine halbe
  Stunde Arbeit dahintersteckt. Umgekehrt steht zwischen zwei Antworten
  beliebig viel Pause.

Beides als Lernzeit auszugeben hieße, eine Zahl zu zeigen, die nach Messung
aussieht und keine ist. **Empfehlung: Lernzeit in 5B.6 nicht anzeigen** —
siehe Entscheidung 1.

### 2.2 Zehn bewertete Aufgaben je lokalem Tag — zählbar, mit einer Einschränkung

**Ja, idempotent.** `progress_events.event_id` ist Primärschlüssel, und
`insert … on conflict do nothing` lässt eine Wiederholung wirkungslos. Eine
Zählung über `recorded_at` zählt dasselbe Ereignis also genau einmal, egal wie
oft es ankommt — das ist genau die Zusage aus 4.5.

**Jedes Ereignis ist eine bewertete Aufgabe.** `record_progress_events`
schreibt eine Zeile nur beim Einreichen einer Antwort; `begin_practice_session`
schreibt keine.

**Die Einschränkung:** Gezählt wird der Tag der **Annahme**, nicht der Tag der
Antwort. Wer offline übt und am nächsten Morgen synchronisiert, bekommt den
Tag gutgeschrieben, an dem die Daten ankamen. Das ist der Preis dafür, dass
die Gerätezeit nicht entscheidet — und er ist hier zu benennen, nicht
wegzurechnen.

### 2.3 Zwei Ruhetage je Kalenderwoche — was fehlt

Nichts Eigenes. Sobald die Tage einer Person in **ihrer** Zeitzone bekannt
sind, ist die Regel eine reine Rechnung auf dieser Liste: In einer
Kalenderwoche dürfen bis zu zwei Tage ohne zehn Aufgaben liegen, ohne die
Serie zu unterbrechen; nicht ansammelbar heißt, der Vorrat beginnt mit jeder
Woche neu. Gebraucht werden: die **Zeitzone** und eine Festlegung, wann eine
Kalenderwoche beginnt — und die steht schon da (ISO-8601, Montag), weil das
Produkt deutschsprachig ist und nirgends etwas anderes behauptet.

---

## 3. Minimaler Datenentwurf — vorgeschlagen, nicht umgesetzt

> Keine dieser Migrationen ist erstellt. Dieser Abschnitt ist eine Vorlage.

### 3.1 Eine eigene Tabelle statt neuer Spalten auf `profiles`

**Vorschlag:** `learner_settings`, eine Zeile je Person.

```sql
-- NICHT ANGEWANDT – Entwurf
create table learner_settings (
  user_id uuid primary key references profiles (id) on delete cascade,
  time_zone text not null default 'Europe/Berlin',
  weekly_goal_days smallint
    check (weekly_goal_days is null or weekly_goal_days between 1 and 7),
  updated_at timestamptz not null default now()
);

/*
  Die Gültigkeit der Zeitzone als Trigger und **nicht** als `check`.

  Naheliegend wäre `check (time_zone = any (select name from
  pg_timezone_names))` — und das lehnt Postgres ab: In einer
  Prüfbedingung sind keine Unterabfragen erlaubt. Eine Liste gültiger Namen
  von Hand wäre die andere Variante und die schlechtere: Zeitzonen ändern
  sich, und eine abgeschriebene Liste veraltet still.
*/
create or replace function app_check_time_zone()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.time_zone) then
    raise exception 'Unbekannte Zeitzone: %', new.time_zone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger learner_settings_time_zone
  before insert or update of time_zone on learner_settings
  for each row execute function app_check_time_zone();
```

| Punkt | Festlegung |
| --- | --- |
| Datentyp, Nullzustand | `time_zone text not null`; `weekly_goal_days smallint **null**` — `null` heißt „kein Ziel", und das ist der Normalfall (E3) |
| Standardwert | `Europe/Berlin`. Das Produkt ist für Gymnasien in NRW; ein Standard, der für fast alle stimmt, ist besser als `null` und eine Fallunterscheidung an jeder Stelle |
| Wer liest | **ausschließlich die Person selbst** |
| Wer schreibt | **ausschließlich die Person selbst** |
| RLS | `user_id = auth.uid()` in `using` **und** `with check`, wie bei den drei Lernstandstabellen |
| Rückwärtskompatibilität | additiv; eine fehlende Zeile bedeutet „Standard", kein Fehler |
| Migration | eine neue Datei `2026…_lernendeneinstellungen.sql`, additiv — keine bestehende ändern |

**Warum eine eigene Tabelle und nicht zwei Spalten auf `profiles`:**
`profiles_select` erlaubt das Lesen über `app_sees_profile(id)`, also jeder
Lehrkraft eines gemeinsamen Kurses. RLS wirkt zeilenweise; eine Spalte auf
`profiles` wäre damit für diese Lehrkräfte sichtbar. Eine Zeitzone ist ein
schwacher Ortshinweis, und ein Wochenziel ist eine persönliche Absicht —
beides hat in einer Zeile nichts zu suchen, die jemand anderes lesen darf.
Eine eigene Tabelle mit einer eigenen Regel ist der Unterschied zwischen
„niemand sieht es" und „niemand sieht es, solange niemand die Abfrage ändert".

**Verhalten bei unbekannter Zeitzone:** Der Trigger prüft gegen
`pg_timezone_names` und lässt nur gültige IANA-Namen zu; ein unbekannter Name
wird beim Schreiben **abgelehnt**, nicht still ersetzt. Wird beim Einrichten keine
erkannt, bleibt der Standard stehen, und die Person kann ihn ändern.

**Wie der Server ausschließlich die gespeicherte Zeitzone verwendet:** Die
Tagesgrenze entsteht in SQL aus
`(progress_events.recorded_at at time zone s.time_zone)::date`, mit `s` aus
`learner_settings`. Es gibt in dieser Rechnung keinen Parameter vom Gerät —
eine Funktion, die eine Zeitzone **entgegennimmt**, wäre genau die Hintertür,
die 4.5 ausschließt.

**Datenschutzfolge:** Zwei neue persönliche Angaben, beide nur für die Person
selbst lesbar, beide in `exportMyData` aufzunehmen und beim Löschen des Kontos
über `on delete cascade` mitzunehmen. Die Zeitzone ist grob ortsbezogen;
deshalb Standard statt automatischer Erfassung, und deshalb änderbar.

### 3.2 Die Serie: gerechnet, nicht gespeichert

**Vorschlag: keine zweite Tabelle.** Serie, Ruhetage und Wochenaktivität
folgen vollständig aus `progress_events.recorded_at` und der Zeitzone. Ein
gespeicherter Serienzähler wäre ein zweiter Ort für dieselbe Wahrheit — und
der erste, der nach einem Nachtrag falsch steht.

```sql
-- NICHT ANGEWANDT – Entwurf
create or replace function my_learning_days(p_from date, p_to date)
returns table (tag date, bewertete_aufgaben integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select (e.recorded_at at time zone coalesce(s.time_zone, 'Europe/Berlin'))::date as tag,
         count(*)::integer
    from progress_events e
    left join learner_settings s on s.user_id = e.user_id
   where e.user_id = auth.uid()
     and (e.recorded_at at time zone coalesce(s.time_zone, 'Europe/Berlin'))::date
         between p_from and p_to
   group by 1;
$$;
```

| Punkt | Festlegung |
| --- | --- |
| Wer liest | nur die eigene Person — `auth.uid()` steht in der Abfrage, es gibt keinen Parameter dafür |
| RLS | unberührt; die Funktion liest nur, was die Regel ohnehin erlaubt |
| Rückwärtskompatibilität | rein additiv, keine bestehende Abfrage ändert sich |
| Migration | dieselbe additive Datei |

### 3.3 Tests und Gegenproben, die der Block mitbringen müsste

- **Idempotenz:** Dasselbe Ereignis zweimal einreichen → der Tag zählt gleich.
- **Zeitzone wirkt:** Dieselben Ereignisse, zwei verschiedene gespeicherte
  Zeitzonen → verschiedene Tagesgrenzen. **Gegenprobe:** Zeitzone ignorieren
  und UTC rechnen → der Fall um Mitternacht wird rot.
- **Gerätezeit entscheidet nicht:** Ein Ereignis mit absurdem `occurredAt` →
  der Tag ändert sich nicht. **Gegenprobe:** `occurred_at` speichern und
  danach rechnen → rot.
- **Ruhetage:** Woche mit fünf Lerntagen und zwei Lücken → Serie hält; drei
  Lücken → Serie endet. **Gegenprobe:** Ruhetage ansammelbar machen → rot.
- **Neun Aufgaben zählen nicht, zehn schon.** **Gegenprobe:** Schwelle auf
  eins setzen → rot.
- **Fremde Daten:** `my_learning_days` als andere Person → leer.
  **Gegenprobe:** `auth.uid()` durch einen Parameter ersetzen → rot.
- **Unbekannte Zeitzone:** Schreiben von `Mars/Olympus` → abgelehnt.
- **Kein Ziel ist der Normalfall:** frisches Konto → `weekly_goal_days` ist
  `null`, und die Oberfläche zeigt kein Ziel.

---

## 4. Die Zusagen, die schon stehen

Diese sind **entschieden** und nicht Teil der offenen Fragen:

- Die Zeitzone wird **gespeichert** und serverseitig verwendet; die Gerätezeit
  entscheidet nie über eine Serie (4.5).
- Das Wochenziel ist **standardmäßig aus** (E3).
- **Zwei Ruhetage je Kalenderwoche**, nicht ansammelbar, nicht wählbar (E2).
- **Zehn regulär bewertete Aufgaben** lassen einen Tag zählen, in jeder
  Übungsform (E1).
- Ereignisse zählen **idempotent** (4.5, heute schon durch den
  Primärschlüssel).
- **Keine Strafe, keine Herzen, keine Rangliste, keine rote Zahl** (R6, 4.4).
- **Nur der eigene Lernstand** (ADR-1).
- **Ohne belastbare Daten wird kein Wert angezeigt und keiner geschätzt.**

---

## 5. Was noch zu entscheiden ist — drei Fragen

### Entscheidung 1 — Lernzeit in 5B.6

**Empfehlung: nicht anzeigen, und die Stelle leer lassen statt zu schätzen.**

Aus den vorhandenen Daten ist Lernzeit nicht seriös berechenbar (2.1). Sie zu
erfassen hieße, ein Sitzungsende einzuführen — und ein Ende, das beim
Schließen des Tabs nicht ankommt, erzeugt Sitzungen, die nie enden. Der
Aufwand ist ein eigener Block, und der Nutzen ist eine Zahl, die kaum jemand
braucht: „Mein Fortschritt" lebt von beherrschten Wörtern, Serie und Kursen.

Die Alternative wäre, Lernzeit als eigenen späteren Block zu planen — mit
Sitzungsende, Zeitüberschreitung und einer ehrlichen Beschriftung („aktive
Zeit, grob"). Dagegen spricht, dass jede dieser Zahlen eine Annahme über
Verhalten ist, das niemand gemessen hat.

### Entscheidung 2 — Die Einheit des Wochenziels

**Empfehlung: Lerntage je Woche (1 bis 7), Standard `null` = aus.**

„Aufgaben, Lerntage und Minuten sind verschiedene Produkte" — das ist richtig,
und von den dreien ist nur einer heute belegbar:

- **Minuten** scheiden mit Entscheidung 1 aus.
- **Aufgaben** wären zählbar, setzen aber eine zweite Schwelle neben die zehn
  aus E1 — und zwei Zahlen, die beide „genug für heute" bedeuten, erklären
  sich gegenseitig weg.
- **Lerntage** benutzen genau die Größe, die E1 und E2 ohnehin definieren: Ein
  Tag zählt nach zehn Aufgaben. Ein Ziel von „vier Lerntagen" ist damit
  dieselbe Rechnung, nur anders gelesen, und die Ruhetage passen ohne eine
  einzige weitere Regel dazu.

### Entscheidung 3 — Woher die Zeitzone beim ersten Mal kommt

**Empfehlung: Standard `Europe/Berlin`, einmalige stille Korrektur beim ersten
Anmelden, jederzeit änderbar.**

Konkret: Beim ersten Anmelden schlägt das Gerät
`Intl.DateTimeFormat().resolvedOptions().timeZone` vor; weicht der Vorschlag
vom Standard ab, wird er **einmal** gespeichert — ohne Dialog, ohne Frage. Ab
da entscheidet nur noch der gespeicherte Wert, und die Person kann ihn in den
Einstellungen ändern.

Die Alternative — danach fragen — kostet beim ersten Start eine Frage, die
fast niemand beantworten will, und das Produkt richtet sich an Jugendliche.
Die andere Alternative — bei jedem Start übernehmen — macht die Gerätezeit
wieder maßgeblich und ist damit ausgeschlossen.
