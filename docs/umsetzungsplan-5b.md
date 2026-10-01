# Sprint 5B — Umsetzungsplan

**Stand:** 01.10.2026 · **Entscheidung E11:** Dieses Dokument ist der
operative Umsetzungsplan; `docs/konzept-5b.md` bleibt das Produktziel.

---

## 0. Was hier steht — und was ausdrücklich nicht

Hier stehen **Reihenfolge, Abhängigkeiten, Status, Abnahmeschritte und
Commitgrenzen**. Sonst nichts.

Was ein Block *inhaltlich* erreichen soll, steht in `konzept-5b.md`: das
Zielbild, die Informationsarchitektur, die Abnahmekriterien und die
Entscheidungen **E1 bis E23**. Dieses Dokument **verweist** darauf und
schreibt es nicht ab.

Das ist der ganze Zweck von E11. Zwei Listen, die dasselbe meinen, laufen
auseinander — und zwar still: Beide sehen danach weiter richtig aus, nur
nicht mehr gleich. Wer hier eine Entscheidung nachgetragen findet, die in
`konzept-5b.md` fehlt, hat einen Fehler gefunden und keine Ergänzung.

**Die eine Ausnahme:** Jeder Block nennt die Entscheidungen, auf die er sich
stützt. Das ist ein Verweis, keine Kopie.

---

## 1. Status, und was die Wörter heißen

| Status | Bedeutung |
| --- | --- |
| **fertig** | Umgesetzt, abgenommen, im Hauptzweig des Arbeitsstandes. |
| **laufend** | In Arbeit; Commitgrenzen stehen. |
| **offen** | Noch nicht begonnen. |
| **blockiert** | Wartet auf eine Entscheidung oder einen anderen Block. |

Ein Block gilt erst als **fertig**, wenn seine Abnahmeschritte durchlaufen
sind — nicht, wenn sein Code steht.

---

## 2. Die Blöcke

### Grundlage

| Block | Inhalt | Entscheidungen | hängt ab von | Status |
| --- | --- | --- | --- | --- |
| **5B.0** | Prüfbank: WebKit und vier Breiten in Playwright; Tippziel-, Fokus-, Skiplink- und Tastaturprüfung auf gerenderte Ansichten | — | — | **fertig** |
| **5B.1** | E19-Token mit gerechneten Kontrastpaaren; ein Glasbaustein mit Rückfallwache; die UI-Bausteine, unbenutzt | E19, E21, E22 | 5B.0 | **fertig** |

> **5B.0** liegt als Ausgangsmessung in `docs/pruefbank-breiten.md`; sie ist
> die Messlatte für alles danach.
>
> **5B.1** hat zwei Befunde im freigegebenen Entwurf erzeugt
> (`--rand-bedienung`, `--tinte-3` auf tiefem Grund) — beide in
> `src/styles/contrast.test.ts` festgehalten.

### Die Hülle

| Block | Inhalt | Entscheidungen | hängt ab von | Status |
| --- | --- | --- | --- | --- |
| **5B.2a** | Navigationsdefinition: Darstellung in `src/ui/`, Umsetzungszustand in `src/hosted/` | E12, E13, E23 | 5B.1 | **offen** |
| **5B.2b** | Die Zeichen der Icon-Leiste | E23 | 5B.2a | offen |
| **5B.2c** | Die Hülle als Baustein — unbenutzt, isoliert, ohne Routing- und Rollenwissen | E12, E23 | 5B.2b | offen |
| **5B.2c′** | Der echte Redirect `#/pakete` → `#/material`, mit Integrationsprüfung am Router | E13 | 5B.2c | offen |
| **5B.2d** | Das Portal schaltet um — **erste sichtbare Produktivänderung** | E12, E23 | 5B.2c′ | offen |

> Zusammengeführt werden ausschließlich die drei Portalhüllen (`PublicShell`,
> `LearnerShell`, `TeacherShell`). `AppShell` und `StudentShell` bleiben in
> 5B.2 unverändert; die portablen Bündel dürfen sich um kein Byte ändern.
>
> Nach 5B.2d sind sichtbar: **Kurse · Lernpakete · KI-Zugang** (Lehrkraft)
> und **Lernen** (Lernende). Alles andere bleibt `geplant` — siehe die
> progressive Freischaltung in E23.

### Bereiche

| Block | Inhalt | Entscheidungen | hängt ab von | Status |
| --- | --- | --- | --- | --- |
| **5B.3** | Lehrkräfte-Dashboard unter `#/start` | E12, E18 | 5B.2d | offen |
| **5B.4** | „Heute" | E1, E2, E3, E9 | 5B.2d | offen |
| **5B.5** | „Üben" als Bereich; Karte „Schwierige Wörter"; fällige Wiederholungen als Einstieg | E14 | 5B.2d | offen |
| **5B.6** | „Mein Fortschritt": Lernzeit, Lernserie mit Ruhetagen, freiwilliges Wochenziel | E1, E2, E3, E6 | 5B.4 | offen |
| **5B.7** | Einstellungen unter `#/einstellungen`; Verwaltungseinstieg nur für Admins | E23 | 5B.2d | offen |

> Die Reihenfolge folgt **E16**: Lehrkräfte-Dashboard zuerst, dann der
> Lernendenbereich, dann der übrige Lehrkraftbereich. Jeder dieser Blöcke
> schaltet sein Ziel von `geplant` auf `vorhanden` — **in demselben Commit**,
> in dem die Route und ihr Inhalt entstehen.

### Daten, Bilder, Werkstatt

| Block | Inhalt | Entscheidungen | hängt ab von | Status |
| --- | --- | --- | --- | --- |
| **5B.8** | Schemafassung 3 und Migrationsschritt 2 → 3, ohne Oberfläche | — | — (parallel) | **blockiert** |
| **5B.9** | Titelbilder Stufe 1: Bucket, Migration, Upload, Prüfung, Größen, Fokuspunkt, Alternativtext, Einbettung im Offline-Export | E4, E17 | 5B.1 | **blockiert** |
| **5B.10** | Grammatik in der Oberfläche: Eingabe im Paketeditor, Anzeige auf der Lernkarte, Übungsform „Zeitformen" | E8 | 5B.8, 5B.5 | offen |
| **5B.11** | Zeitgesteuerte Veröffentlichung: `publish_at`, Auswertung beim Abruf über die Zugriffsregel | E6 | — | offen |
| **5B.12** | Mobile Sonderfälle: Tabellen als Karten, umschaltbare Werkstattansichten, sticky Aktionsleisten | — | 5B.2d | offen |

> **5B.8 und 5B.9 sind blockiert, und zwar an derselben Stelle:** Beide
> bringen eine Migration. Solange die Supabase-Migrationshistorie nicht
> kontrolliert angeglichen ist (`migration repair`), kommt jede weitere
> Migration nur über den SQL-Editor herein. Das ist eine Entscheidung mit
> eigener Abnahme und gehört nicht nebenbei in einen Oberflächenblock.
>
> **E17** verlangt den Titelbildbaustein **vor** der Werkstatt — deshalb
> steht 5B.9 vor 5B.13.

### Werkstatt und Übungsformen im Portal

| Block | Inhalt | Entscheidungen | hängt ab von | Status |
| --- | --- | --- | --- | --- |
| **5B.13** | Werkstatt im Portal, erste Hälfte: Einlesen (Schritt 2), Quelltextauswahl (Schritt 4) | E5 | 5B.2d, 5B.9 | offen |
| **5B.14** | Werkstatt im Portal, zweite Hälfte: Vorschläge und Prüfschritt (3, 5, 6), Export vervollständigen (8) | E5 | 5B.13 | offen |
| **5B.15** | Übungsformen im Portal erreichbar: Karteikarten, Selbsttest, freies Üben, Vokabelliste | E14 | 5B.5 | offen |

> **5B.13 bis 5B.15 sind der eigentliche Umfang.** Sie stehen hier unten,
> weil sie von der Hülle abhängen — nicht, weil sie klein wären. Wer 5B plant
> und diese drei Blöcke überliest, plant die Hälfte der Arbeit weg.

### Abschluss

| Block | Inhalt | Entscheidungen | hängt ab von | Status |
| --- | --- | --- | --- | --- |
| **5B.16** | Endabnahme: kein Navigationsziel mehr `geplant`; `global.css` auf höchstens 2 844 Zeilen; Breitensuite vollständig grün | E18, E23 | alle | offen |

---

## 3. Abnahmeschritte je Block

Dieselben vier für jeden Block, in dieser Reihenfolge. Ein Block, der einen
davon überspringt, ist nicht fertig, sondern unfertig mit grünem Anstrich.

1. **`tsc --noEmit` sauber** — vor dem Commit, nicht danach.
2. **Die betroffenen Prüfungen grün**, und mindestens eine **Gegenprobe**:
   Die neue Wache muss nachweislich rot werden, wenn der Fehler auftritt, den
   sie verhindern soll. Eine grüne Prüfung kann nichts geprüft haben.
3. **Arbeitsbaum sauber** nach jedem Commit.
4. **Stilumfang gemeldet**: `npm run stilumfang` — aktueller Stand,
   Bezugswert 4 740, Endziel 2 844.

Für Blöcke, die einen Bildschirm verändern, zusätzlich:

5. **Breitensuite** für die betroffene Auslieferung: `npm run e2e:breiten`
   beziehungsweise `e2e:breiten:portal`, vier Breiten × zwei Maschinen.
6. **Altregeln entfernt** — siehe unten.

### Zu E18: wann Altregeln fallen

E18 sagt: Jeder umgestellte Baustein entfernt seine alten Regeln im selben
Block. Die Präzisierung aus 5B.1 — „sofern keine zweite Hülle dieselben
Regeln noch braucht" — ist **kein Aufschub auf unbestimmt**, sondern eine
Zuweisung: Die Regeln fallen zwingend in dem Block, der **den letzten
tatsächlichen Verbraucher** umstellt. Für `.app-nav`, `.bottom-nav` und die
übrigen Hüllenklassen ist das der Block, der `AppShell` nachzieht. Er bekommt
diese Aufräumarbeit als Abnahmeschritt, nicht 5B.16.

---

## 4. Commitgrenzen

- **Ein Commit, ein Gedanke.** Token, Baustein, Umschaltung und Aufräumen
  sind verschiedene Gedanken.
- **Kein roter Zwischencommit**, auch kein absichtlicher. `tsc` und die
  betroffenen Prüfungen laufen **vor** dem Commit durch.
- **Bestehende Commits bleiben unverändert.** Ein Fehler wird vorwärts
  korrigiert, nicht per `amend`.
- **Ein Navigationsziel wechselt seinen Zustand nur in dem Commit**, in dem
  seine Route und deren Inhalt entstehen (E23).
- **Die Commit-Botschaft nennt die Gegenproben** und was sie rot gemacht hat.

---

## 5. Was offen ist und nicht hier entschieden wird

- **Die Angleichung der Migrationshistorie.** Sie blockiert 5B.8 und 5B.9.
  Ob `migration repair` mit eigener Abnahme durchgeführt wird oder weiter von
  Hand eingespielt wird, ist eine Entscheidung mit Folgen für das Staging und
  gehört nicht in einen Oberflächenblock.
- **`src/data/repos.test.ts > packRepo > listet Pakete nach Änderungsdatum`**
  ist zeitweise instabil. Ursache nicht untersucht.
- **Nicht Teil von 5B:** Unsplash und andere externe Bildquellen (E17),
  kleine Spiele, Dunkelmodus (E22).
