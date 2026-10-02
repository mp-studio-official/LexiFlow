# Die Migrationshistorie — Bestandsaufnahme, Reparatur, Nachweis

> ## Durchgeführt und bestanden am 02.10.2026
>
> Die Angleichung ist gelaufen. **Alle elf** lokalen Versionen stehen jetzt
> identisch in `Local` und `Remote`; `supabase_migrations.schema_migrations`
> enthält genau diese elf. Migration 11 wurde mitmarkiert, nachdem die Abfrage
> aus 5.2 für **beide** Funktionen `true` ergeben hat.
>
> **Verändert wurde ausschließlich
> `supabase_migrations.schema_migrations`.** Schema- und Nutzdatenzählwerte
> waren vorher und nachher exakt gleich:
>
> | Schema | | Nutzdaten | |
> | --- | --- | --- | --- |
> | Tabellen | 15 | Profile | 4 |
> | Spalten | 97 | Kurse | 2 |
> | RLS-Regeln | 27 | Mitgliedschaften | 4 |
> | Funktionen | 33 | Pakete | 2 |
> | Trigger | 11 | Fassungen | 3 |
> | | | Paketlernstände | 2 |
> | | | Eintragslernstände | 2 |
>
> **Damit ist `supabase db push` wieder benutzbar**, und künftige Migrationen
> werden wieder kontrolliert über die CLI angewandt statt Datei für Datei im
> SQL-Editor. Der Weg über den SQL-Editor bleibt als Notweg richtig, ist aber
> nicht mehr der reguläre.
>
> Der Abschnitt 5 unten steht **unverändert** da: Er ist der Ablauf, der
> gelaufen ist, und damit der Beleg — nicht eine Anleitung für etwas, das noch
> kommt. Wer ihn später wieder braucht (ein zweites Projekt, ein neues
> Staging), findet ihn hier, geprüft.

Die folgende Bestandsaufnahme beschreibt den Stand **vor** dem 02.10.2026.

---

## 1. Das verknüpfte Projekt

| | |
| --- | --- |
| Projekt-Ref | steht in `supabase/.temp/linked-project.json` — nicht hierher kopiert |
| Projektname | `lexiflow` |
| `config.toml` | `project_id = "lexiflow"`, **kein** Ref, keine URL, kein Schlüssel |
| CLI | `supabase@2.119.0` über `npx` |

> `supabase/.temp/` ist lokaler CLI-Zustand und gehört keinem Commit an. Dass
> der Ref nur dort steht und nicht in `config.toml`, ist Absicht: Die
> Konfiguration im Repository bindet sich an kein bestimmtes Projekt.

---

## 2. Die lokalen Migrationen

Elf Dateien, lexikografisch sortiert — und diese Sortierung **ist** die
Anwendungsreihenfolge. Keine doppelte Version, keine Lücke im Schema der
Namen.

| # | Version | Datei | Zeilen | letzter Commit |
| --- | --- | --- | --- | --- |
| 1 | `20260913120000` | `grundgeruest.sql` | 333 | `9a19cd8` · 13.09. |
| 2 | `20260913120100` | `hilfsfunktionen.sql` | 191 | `085b0c8` · 13.09. |
| 3 | `20260913120200` | `zugriffsregeln.sql` | 237 | `085b0c8` · 13.09. |
| 4 | `20260913120300` | `anmeldung.sql` | 119 | `a8a44a8` · 13.09. |
| 5 | `20260913120400` | `kurse_und_codes.sql` | 437 | `56faa8c` · 13.09. |
| 6 | `20260913120500` | `pakete_und_revisionen.sql` | 217 | `085b0c8` · 13.09. |
| 7 | `20260913120600` | `lernstand.sql` | 428 | `9a19cd8` · 13.09. |
| 8 | `20260913120700` | `ki.sql` | 164 | `0144644` · 13.09. |
| 9 | `20260920090000` | `dienstrechte.sql` | 158 | `5136e62` · 20.09. |
| 10 | `20260920140000` | `rechte_zuruecksetzen.sql` | 280 | `ddd9f06` · 28.09. |
| 11 | `20260929170000` | `lernstandszugriff.sql` | 615 | `114c033` · 29.09. |

**Keine Datei wurde nach dem 29.09.2026 geändert.** Was auf der Platte liegt,
ist damit der Stand, der auch eingespielt wurde — mit der einen Einschränkung
aus Abschnitt 4.

---

## 3. Die Remote-Historie — und warum sie hier nicht steht

`npx supabase migration list --linked` bricht ab:

```
Access token not provided. Supply an access token by running `supabase login`
or setting the SUPABASE_ACCESS_TOKEN environment variable.
```

Ein Zugangstoken wird hier **nicht** angefordert und nicht im Chat
entgegengenommen. Die Remote-Spalte dieser Tabelle füllt deshalb der erste
Schritt in Abschnitt 5, und zwar durch Marc, auf seinem Rechner.

**Was aus der Dokumentation belegt ist** (`portal-uebergabe.md`,
`inbetriebnahme-staging.md`, beide vom 29.09.2026):

> `npx supabase@latest migration list` zeigt für **alle elf** lokalen Dateien
> eine leere Remote-Spalte. Die Migrationen wurden über den SQL-Editor
> eingespielt und stehen deshalb nicht in
> `supabase_migrations.schema_migrations`.

| Frage | Antwort aus dem Repository | Gemessen am 02.10.2026 |
| --- | --- | --- |
| Welche Versionen fehlen remote? | **alle elf**, Stand 29.09.2026 | bestätigt — und seitdem alle elf eingetragen |
| Gibt es Remote-Einträge ohne lokale Datei? | **keine** — die Historie ist leer, nicht abweichend | bestätigt |
| Sind Versionen eindeutig und in Reihenfolge? | ja (Abschnitt 2) | bestätigt |

> Das ist ein **Dokumentationsstand, keine Messung von heute.** Abschnitt 5.1
> misst ihn nach, bevor irgendetwas markiert wird. Weicht er ab, gilt
> Abschnitt 6.

---

## 4. Die eine offene Frage: Migration 11

Hier widersprechen sich zwei Stellen derselben Dokumentation, und von der
Antwort hängt ab, welche Datei markiert werden darf.

**Gegen eine Anwendung** — `inbetriebnahme-staging.md`, 3.1:

> „Die **zehn ersten** wurden über den SQL-Editor eingespielt."

Und Marcs Commit `114c033` vom 29.09.2026, 16:53:

> „Nachtrag zu `b6e80a0`, **vor der Anwendung**. Migration 11 ist nirgends
> angewandt — weder im Staging noch sonstwo."

**Für eine Anwendung** — `inbetriebnahme-staging.md`, 6.12, „Bestanden am
29.09.2026":

> „Nach **Migration 11** wurde derselbe Ablauf wiederholt."
>
> | `begin_practice_session` mit einem **nicht zugewiesenen** Paket | `403` / `42501` |

Dieses `403` kann **nur** aus `app_pack_is_assigned` kommen — der Funktion,
die erst `114c033` hinzugefügt hat. Die Abnahme beschreibt also eine
Datenbank, in der Migration 11 in ihrer **endgültigen** Fassung läuft.

**Beantwortet am 02.10.2026:** Die Abfrage aus 5.2 ergab für beide Funktionen
`true` — Migration 11 lief vollständig. Die Vermutung unten hat sich damit
bestätigt, und 11 wurde mitmarkiert. Der Rest dieses Abschnitts bleibt stehen,
weil er die Frage festhält, die beantwortet werden **musste**, bevor irgendwer
etwas markiert.

**Wahrscheinlich** war damals: alle elf sind angewandt, und der Satz „die zehn
ersten" stammt aus den Stunden davor. **Belegt** war es nicht, und der
Unterschied ist nicht akademisch:

- Ist 11 angewandt und wird **nicht** markiert, spielt ein späteres `db push`
  sie ein zweites Mal. `create or replace function` läuft durch, `revoke`
  läuft durch — aber `alter table … add constraint` bricht ab, und man steht
  mit einer halb gelaufenen Migration da.
- Ist 11 **nicht** angewandt und wird markiert, gilt sie für immer als
  erledigt, **ohne je gelaufen zu sein**. Die Mitgliedschaftsprüfung fehlte
  dann dauerhaft — und das ist genau die Lücke, wegen der es Migration 11
  gibt.

Der zweite Fall ist der gefährlichere. Deshalb entscheidet nicht die
Dokumentation, sondern eine Abfrage an der Datenbank (Abschnitt 5.2).

---

## 5. Der Reparaturablauf — ausgeführt am 02.10.2026

### 5.1 Vorprüfung (nur lesend)

```bash
cd "<Projektordner>"

# 1. Arbeitsverzeichnis sauber, richtiger Zweig
git status --short
git log --oneline -1

# 2. Anmeldung an der CLI (öffnet den Browser; kein Token in den Chat)
npx supabase login

# 3. Der Ist-Stand, den alles Weitere voraussetzt
npx supabase migration list --linked
```

**Erwartet:** elf Zeilen, Spalte `Local` gefüllt, Spalte `Remote` leer.

### 5.2 Die Entscheidung über Migration 11 (nur lesend)

Im SQL-Editor des Projekts:

```sql
select
  to_regprocedure('public.app_pack_is_assigned(uuid, text)') is not null
    as migration_11_wirkt,
  to_regprocedure('public.app_may_touch_progress(uuid)') is not null
    as migration_11_teil_1_wirkt;
```

| Ergebnis | Bedeutung | Folge |
| --- | --- | --- |
| beide `true` | Migration 11 läuft vollständig | 11 **mitmarkieren** |
| beide `false` | Migration 11 lief nie | 11 **nicht** markieren — erst anwenden |
| gemischt | nur die erste Hälfte lief | **abbrechen**, Abschnitt 6 |

### 5.3 Die Repair-Befehle, einzeln

**Nur ausführen, wenn 5.1 und 5.2 wie erwartet ausgefallen sind.** Einer nach
dem anderen, Ausgabe jeweils ansehen. *(Alle elf sind gelaufen — die zehn
unten plus `20260929170000`, nach `true / true` in 5.2.)*

```bash
npx supabase migration repair --status applied 20260913120000
npx supabase migration repair --status applied 20260913120100
npx supabase migration repair --status applied 20260913120200
npx supabase migration repair --status applied 20260913120300
npx supabase migration repair --status applied 20260913120400
npx supabase migration repair --status applied 20260913120500
npx supabase migration repair --status applied 20260913120600
npx supabase migration repair --status applied 20260913120700
npx supabase migration repair --status applied 20260920090000
npx supabase migration repair --status applied 20260920140000
```

Und **nur bei „beide `true`" in 5.2** zusätzlich:

```bash
npx supabase migration repair --status applied 20260929170000
```

**Was ausdrücklich nicht markiert werden darf:**

- `20260929170000`, solange 5.2 nicht „beide `true`" ergeben hat;
- jede Version, die 5.1 bereits als `Remote` gefüllt zeigt — doppeltes
  Markieren derselben Version ist kein Grenzfall, den man ausprobiert;
- jede Version, zu der es **keine lokale Datei** gibt. Dafür ist
  `--status reverted` da, und das ist eine eigene Entscheidung mit eigener
  Begründung, nicht Teil dieses Ablaufs.

### 5.4 Kontrolle

```bash
npx supabase migration list --linked
```

**Erwartet:** dieselben elf Zeilen, jetzt mit gefüllter `Remote`-Spalte (bzw.
zehn, falls 11 nicht markiert wurde). Keine zusätzliche Zeile, keine
verschwundene.

### 5.5 Nachweis, dass weder Schema noch Nutzdaten berührt wurden

`migration repair` schreibt ausschließlich in
`supabase_migrations.schema_migrations`. Dass das stimmt, wird nicht geglaubt,
sondern gemessen — **vor** 5.3 und **nach** 5.4 dieselbe Abfrage, die
Ergebnisse vergleichen:

```sql
-- A) Umfang des Schemas
select
  (select count(*) from information_schema.tables      where table_schema = 'public') as tabellen,
  (select count(*) from information_schema.columns     where table_schema = 'public') as spalten,
  (select count(*) from pg_policies                    where schemaname   = 'public') as regeln,
  (select count(*) from information_schema.routines    where routine_schema = 'public') as funktionen,
  (select count(*) from pg_trigger where not tgisinternal)                              as trigger;

-- B) Umfang der Nutzdaten
select
  (select count(*) from profiles)        as profile,
  (select count(*) from courses)         as kurse,
  (select count(*) from course_members)  as mitglieder,
  (select count(*) from packs)           as pakete,
  (select count(*) from pack_revisions)  as fassungen,
  (select count(*) from pack_progress)   as lernstand_paket,
  (select count(*) from entry_progress)  as lernstand_eintrag;

-- C) Die Historie selbst – die einzige Tabelle, die sich ändern darf
select version from supabase_migrations.schema_migrations order by version;
```

**Bestanden heißt:** A und B vorher und nachher **identisch**; C vorher leer
(oder wie in 5.1 gesehen) und nachher genau die markierten Versionen.

### 5.6 Abbruchbedingungen

Abbrechen und **nichts weiter ausführen**, wenn:

- 5.1 eine Version mit gefüllter `Remote`-Spalte zeigt, die lokal fehlt;
- 5.1 weniger oder mehr als elf lokale Zeilen zeigt;
- 5.2 ein gemischtes Ergebnis liefert;
- ein `repair`-Befehl etwas anderes meldet als seinen Erfolg;
- 5.4 eine Zeile zeigt, die in 5.3 nicht markiert wurde;
- 5.5 in A oder B **irgendeine** Abweichung zeigt.

In allen Fällen gilt: `db push` bleibt gesperrt, und der SQL-Editor bleibt der
Weg. Nichts davon ist dringend.

### 5.7 Rückweg bei einer unerwarteten Liste

Eine versehentlich markierte Version wird mit

```bash
npx supabase migration repair --status reverted <version>
```

wieder aus der Historie genommen. Das ändert **nur** die Historienzeile — am
Schema ändert es nichts, und es macht insbesondere eine nie gelaufene
Migration nicht nachträglich wirksam. Danach 5.4 und 5.5 wiederholen.

---

## 6. Wenn die Liste anders aussieht als erwartet

Dann ist die Dokumentation von 29.09.2026 überholt, und dieser Abschnitt 5
beschreibt einen Zustand, den es nicht mehr gibt. Dann: **nichts markieren**,
die tatsächliche Ausgabe von `migration list` sichern, und die Tabelle in
Abschnitt 3 daraus neu aufstellen. Eine Reparatur gegen eine falsche Annahme
ist schlimmer als keine.

---

## 7. Was jetzt möglich ist

`supabase db push` für **neue** Migrationen — und damit 5B.8 (Schemafassung 3)
und 5B.9. Beide stehen im Umsetzungsplan seit dem 02.10.2026 auf `offen`
statt `blockiert`.

Dass es bis hierher elf Dateien von Hand waren, war kein Rückstand, sondern
eine bewusste Entscheidung: lieber elf Einfügevorgänge als ein `db push`,
dessen Wirkung niemand vorhersagen kann. Diese Lage ist jetzt beendet — nicht
umgangen.

**Noch nicht getan und ausdrücklich nicht Teil dieses Commits:** kein
`db push`, keine neue Migration, keine Schemaänderung. Die Historie ist
angeglichen; was darauf aufbaut, ist 5B.8.
