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

| Block | Inhalt | Entscheidungen | hängt ab von | Status | Commit |
| --- | --- | --- | --- | --- | --- |
| **5B.2a** | Navigationsdefinition: Darstellung in `src/ui/`, Umsetzungszustand in `src/hosted/` | E12, E13, E23 | 5B.1 | **fertig** | `0a34eb1`, `0abf13d` |
| **5B.2b** | Die Zeichen der Icon-Leiste | E23 | 5B.2a | **fertig** | `3f5728f`, `9a91fae` |
| **5B.2c** | Die Hülle als Baustein — unbenutzt, isoliert, ohne Routing- und Rollenwissen | E12, E23 | 5B.2b | **fertig** | `75d232f`, `846f81a`, `e75387b` |
| **5B.2c′** | **Übergangsredirect** `#/pakete` → `#/material`, mit Integrationsprüfung am Router | E13 | 5B.2c | **fertig** | `b880c2f` |
| **5B.7** | **Einstellungen unter `#/einstellungen`** — vorgezogen, siehe unten | E23 | 5B.2c′ | **fertig** | `f5a3b93`, `e0b41f1` |
| **5B.2d** | Das Portal schaltet um — **erste sichtbare Produktivänderung** | E12, E23 | **5B.7** | **fertig** | `431285e`, `d8739e7` |
| **5B.2e** | Bereinigung nach dem Hüllenwechsel | E18 | 5B.2d | **fertig** | `59cfcd9` |

> **5B.2 ist damit abgeschlossen.** Die gemeinsame Hülle trägt das Portal auf
> beiden Größen; die alten Hüllen der Fassung ohne Konto und der portablen
> Lerndatei stehen unverändert daneben.

> Zusammengeführt werden ausschließlich die drei Portalhüllen (`PublicShell`,
> `LearnerShell`, `TeacherShell`). `AppShell` und `StudentShell` bleiben in
> 5B.2 unverändert; die portablen Bündel dürfen sich um kein Byte ändern.
>
> Nach 5B.2d sind sichtbar: **Kurse · Lernpakete · KI-Zugang ·
> Einstellungen** (Lehrkraft, Einstellungen seit dem vorgezogenen 5B.7) und
> **Lernen** (Lernende). Alles andere bleibt `geplant` — siehe die
> progressive Freischaltung in E23.

#### Was 5B.2d abgenommen hat (`431285e`)

Die drei Portalhüllen sind dünne Adapter der gemeinsamen Hülle; die
sichtbaren Ziele kommen ausschließlich aus `src/hosted/navigationsziele.ts`.
Abgenommen wurde:

- **Erhaltene Zugangswege**, am echten Router geprüft
  (`src/hosted/wege.test.tsx`, 29 Prüfungen): „Mit Code beitreten" innerhalb
  von `/lernen`, Lernbereich, Datenschutz in der Fußzeile, Abmelden als
  Handlung, „Als Lernende ansehen" im Kopf, die Ziele je Breite, der einzige
  reguläre Einstieg zur Verwaltung über die Einstellungen, der öffentliche
  Bereich ohne jede Bereichsnavigation, Marke und Sprungziel. Kein Test wertet
  Wildcard oder Landungsseite als Erfolg.
- **Route → aktives Ziel je Breite:** `/ki` am Schreibtisch „KI-Zugang", auf
  dem Telefon „Einstellungen"; `/verwaltung` in beiden Größen
  „Einstellungen"; `/material` und `/pakete` „Lernpakete".
- **Browsermessung** bei 390, 768, 1024 und 1440 px über sechs Fälle:
  genau eine sichtbare Navigation je Haltepunkt, die andere aus dem
  Accessibility-Baum; kein waagerechter Überlauf; keine Tippziele unter
  44 × 44 px; Tooltip bei Hover und Fokus; Leiste konstant 76 px; aktiver
  Zustand ohne Farbe 2,9 % Flächenunterschied; die feste untere Leiste
  verdeckt weder Kopf noch Inhalt noch Fußzeile.
- **Portable Artefakte bytegleich** vor und nach dem Commit
  (`9958108c…`, `826a589c…`); `AppShell` und `StudentShell` unverändert.
- **Zehn Gegenproben**, alle rot.

#### Weiterhin `geplant`: vier Ziele

| Ziel | Beschriftung | schaltet frei in |
| --- | --- | --- |
| ~~`#/start`~~ | ~~Start~~ | **frei seit `8d74160` (5B.3)** |
| ~~`#/ueben`~~ | ~~Üben~~ | **frei seit `5ce0363` (5B.5)** |
| `#/heute` | Heute | 5B.4 |
| `#/fortschritt` | Fortschritt | 5B.6 |

Jedes dieser Ziele wechselt seinen Zustand **in demselben Commit**, in dem
seine Route und sein Inhalt entstehen — nicht früher.

#### Nachtrag zu 5B.2d: der Kontobereich am Telefon (`d8739e7`)

Der Fuß der Icon-Leiste trägt „Abmelden" und die Fußziele; am Telefon ist
diese Leiste verborgen. Dort war „Abmelden" damit nicht erreichbar — **schon
vor 5B.2d nicht**, denn in der alten Hülle lag derselbe Knopf in `.app-nav`,
die unter 62rem ebenfalls `display: none` trug.

Im Kopf steht jetzt ein Kontoknopf, der einen Disclosure-Bereich mit
denselben `fussZiele` und `fussAktionen` öffnet. Kein `role="menu"`: ohne das
vollständige Menü-Tastaturmuster wäre die Rolle ein Versprechen ohne Deckung.
Geschlossen trägt der Bereich `hidden` und ist damit weder im
Accessibility-Baum noch in der Tabreihenfolge; ab 62rem verschwindet der
Knopf, weil der Fuß der Leiste dann wieder da ist.

#### 5B.2e: die Bereinigung nach dem Wechsel (`59cfcd9`)

5B.2d hat ausdrücklich nichts gelöscht. Was danach wirklich entfernbar war,
hat 5B.2e entfernt — nach **E18**: eine Regel fällt erst in dem Block, der
ihren letzten tatsächlichen Verbraucher umstellt.

**Entfernt: 42 Zeilen** — `src/styles/portal.css` samt Import in
`portal-main.tsx`. Ihre einzige Regel, `button.app-nav__link`, galt dem
Abmeldeknopf der alten Portalhülle.

**Aus `global.css`: null Zeilen.** Der Stilumfang bleibt bei 4740. Das ist
der Befund, nicht ein Versäumnis: Die Klassen, die nach „alte Portalregeln"
aussehen, haben alle noch einen Verbraucher.

| Selektorfamilie | letzter Verbraucher | fällt mit |
| --- | --- | --- |
| `.app`, `.app-body`, `.app-main` | `AppShell`, `StudentShell`, `StudentApp`, `student-main` | dem Umbau beider Hüllen |
| `.app-header*`, `.app-footer*`, `.brand`, `.skip-link` | `AppShell`, `StudentShell` | dem Umbau beider Hüllen |
| `.app-nav*`, `.bottom-nav*`, `.app-work` | `AppShell` | dem Umbau der Fassung ohne Konto |

`src/styles/huellenklassen.test.ts` hält diese Besitzverhältnisse als Wache
fest: Verschwindet eine Regel, die noch jemand rendert, wird sie rot.

#### Warum 5B.7 vor 5B.2d steht

Die Nummer bleibt; die Reihenfolge ändert sich. Der Grund ist der
**Adminzugang**, und er ist keine Feinheit:

E23 nimmt `#/verwaltung` aus der Navigation. Der neue Einstieg liegt
innerhalb von `#/einstellungen` — und das gibt es noch nicht. Schaltet die
Hülle vorher um, landet eine Verwaltung nach der Anmeldung über
`HOME_PER_ROLE.admin` zwar weiterhin in der Verwaltung, hätte aber **keinen
regulären Weg zurück**: Der alte Navigationspunkt ist weg, der neue noch
nicht da. Übrig bliebe die Adresszeile.

Das ist der allgemeine Fall, auf den beim Umschalten zu achten ist: Ein
Hüllenwechsel **entfernt** Zugangswege. Jeder davon muss seinen neuen Ort
schon haben, bevor der alte verschwindet — nicht danach.

#### E13 in zwei Phasen — und warum die Richtung wichtig ist

E13 sagt: `#/material` wird zu `#/pakete`, mit dauerhafter Weiterleitung. Das
geschieht in **zwei Phasen mit entgegengesetzter Richtung**, und sie dürfen
nicht gleichzeitig gelten — sonst zeigen beide Adressen aufeinander, und
daraus wird eine Schleife.

| Phase | Kanonisch | Weiterleitung | Block |
| --- | --- | --- | --- |
| **Übergang** | `#/material` (dort liegt die Seite heute) | `#/pakete` → `#/material` | 5B.2c′ |
| **Endzustand** | `#/pakete` | `#/material` → `#/pakete` | der Block, der die Seite umbenennt |

**Im Übergang gibt es ausdrücklich keine Weiterleitung von `#/material`.**
Die alte Adresse bleibt die echte, bis die Seite umzieht; erst dann dreht
sich die Richtung, und erst dann ist die Weiterleitung die aus E13 gemeinte
dauerhafte.

Der Block, der die Seite umbenennt, entfernt im selben Zug die Weiterleitung
dieser Phase. Zwei Weiterleitungen gleichzeitig wären kein Grenzfall, sondern
eine Seite, die nicht mehr lädt.

### Bereiche

| Block | Inhalt | Entscheidungen | hängt ab von | Status |
| --- | --- | --- | --- | --- |
| **5B.3** | Lehrkräfte-Dashboard unter `#/start` | E12, E18 | 5B.2d | **fertig** (`8d74160`) |
| **5B.4** | „Heute" | E1, E2, E3, E9 | 5B.2d | offen |
| **5B.5** | „Üben" als Bereich; Karte „Schwierige Wörter"; fällige Wiederholungen als Einstieg | E14, **E24** | 5B.2d | **fertig** (`5ce0363`, `8467267`, `3365861`) |
| **5B.6** | „Mein Fortschritt": Lernzeit, Lernserie mit Ruhetagen, freiwilliges Wochenziel | E1, E2, E3, E6 | 5B.4 | offen |
| ~~**5B.7**~~ | ~~Einstellungen~~ — **vorgezogen vor 5B.2d**, siehe oben | E23 | 5B.2c′ | — |

> Die Reihenfolge folgt **E16**: Lehrkräfte-Dashboard zuerst, dann der
> Lernendenbereich, dann der übrige Lehrkraftbereich. **Ausgenommen 5B.7**,
> das vor 5B.2d gezogen wurde — E16 ordnet die Bereiche, nicht die
> Voraussetzungen der Hülle. Jeder dieser Blöcke
> schaltet sein Ziel von `geplant` auf `vorhanden` — **in demselben Commit**,
> in dem die Route und ihr Inhalt entstehen.

### Daten, Bilder, Werkstatt

| Block | Inhalt | Entscheidungen | hängt ab von | Status |
| --- | --- | --- | --- | --- |
| **5B.8** | Schemafassung 3 und Migrationsschritt 2 → 3, ohne Oberfläche | — | — (parallel) | offen |
| **5B.9** | Titelbilder Stufe 1: Bucket, Migration, Upload, Prüfung, Größen, Fokuspunkt, Alternativtext, Einbettung im Offline-Export | E4, E17 | 5B.1 | offen |
| **5B.10** | Grammatik in der Oberfläche: Eingabe im Paketeditor, Anzeige auf der Lernkarte, Übungsform „Zeitformen" | E8 | 5B.8, 5B.5 | offen |
| **5B.11** | Zeitgesteuerte Veröffentlichung: `publish_at`, Auswertung beim Abruf über die Zugriffsregel | E6 | — | offen |
| **5B.12** | Mobile Sonderfälle: Tabellen als Karten, umschaltbare Werkstattansichten, sticky Aktionsleisten | — | 5B.2d | offen |

> **Die Blockade ist aufgehoben — am 02.10.2026.** Die Angleichung der
> Migrationshistorie ist gelaufen und bestanden: Alle elf lokalen Versionen
> stehen identisch in `Local` und `Remote`, Migration 11 wurde nach einer
> lesenden Prüfung beider Funktionen mitmarkiert, und verändert wurde
> **ausschließlich** `supabase_migrations.schema_migrations` — Schema- und
> Nutzdatenzählwerte waren vorher und nachher exakt gleich (15 Tabellen, 97
> Spalten, 27 Regeln, 33 Funktionen, 11 Trigger; 4 Profile, 2 Kurse, 4
> Mitgliedschaften, 2 Pakete, 3 Fassungen, 2 + 2 Lernstände).
>
> `supabase db push` ist damit wieder benutzbar; künftige Migrationen laufen
> wieder kontrolliert über die CLI statt Datei für Datei im SQL-Editor. Der
> Ablauf samt Nachweis steht in `docs/migrationshistorie-audit.md`.
>
> **Noch nicht getan:** kein `db push`, keine neue Migration, keine
> Schemaänderung. Das ist 5B.8.

> **5B.8 und 5B.9 waren an derselben Stelle blockiert:** Beide bringen eine
> Migration, und solange die Historie nicht angeglichen war, kam jede weitere
> Migration nur über den SQL-Editor herein. Seit dem 02.10.2026 ist das
> erledigt; beide stehen auf `offen`.
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

#### Was 5B.5 abgenommen hat

| Teil | Commit |
| --- | --- |
| Der Bereich „Üben", die Karten, die Einengung der Runde | `5ce0363` |
| **E24** — wann ein Wort schwierig ist, im Konzept | `8467267` |
| **E14 vollständig** — Ausgang, Verlustregel, Rückfrage | `3365861` |

**Sichtbar sind heute vier Karten**, und nur, wenn ihr Weg funktioniert:
Fällige Wiederholungen, Schwierige Wörter, Englisch → Deutsch, Deutsch →
Englisch. **Karteikarten und Lückentexte fehlen mit Absicht** — die
Aufgabenformen gibt es, aber das Portal hat keinen Einstieg, der eine Form
auswählt. Das stellt **5B.15** her.

**E14 gilt jetzt ganz:** keine Bereichsnavigation in der laufenden Runde, der
Ausgang heißt „Runde beenden", und **jeder** Ausgang — auch „Abmelden",
Browser-Zurück, Neuladen und Schließen — fragt dieselbe Regel
(`src/domain/rundenverlust.ts`), ob etwas verloren ginge. Die Rückfrage
erscheint nur dann, und „Hierbleiben" setzt den Fokus zurück ins Antwortfeld.

### Vor 5B.2d: kein Weg darf verschwinden

Ein Hüllenwechsel entfernt Zugangswege. Bevor umgeschaltet wird, muss für
jeden bestehenden Weg nachgewiesen sein, dass es ihn danach noch gibt:

- Lernende: **„Mit Code beitreten"** bleibt aus dem Lernbereich erreichbar.
- **Datenschutz** liegt in der Fußzeile beziehungsweise in den Einstellungen.
- Lehrkräfte: **„Als Lernende ansehen"** liegt im Kopf und führt zu `/lernen`.
- **Abmelden** bleibt eine echte Handlung, kein Verweis.
- Die **Adminverwaltung** ist ausschließlich über die Einstellungen
  erreichbar.
- Die **Marke** führt zum gültigen Rollenstart, nicht blind zur öffentlichen
  Landungsseite.
- Die **`PublicShell`** bleibt ohne Bereichsnavigation.
- Die **Lazy-Trennung** zwischen Lernenden- und Lehrkraftbündel bleibt
  erhalten.

Jeder dieser Punkte bekommt in 5B.2d eine Prüfung am echten Router. „Ist noch
da" ist keine Beobachtung, sondern eine Behauptung, solange sie niemand
nachgesehen hat.

**Erledigt mit `431285e`:** alle acht Punkte stehen als Prüfung in
`src/hosted/wege.test.tsx`.

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

- ~~**Die Angleichung der Migrationshistorie.**~~ **Erledigt am 02.10.2026**
  — durchgeführt, bestanden, nachgewiesen in
  `docs/migrationshistorie-audit.md`. `db push` ist wieder benutzbar; 5B.8
  und 5B.9 sind frei.
- ~~**`src/data/repos.test.ts > packRepo > listet Pakete nach
  Änderungsdatum`**~~ **Erledigt** (`aa166c5`): Der Test nahm an, zwei
  Speicherungen fielen nie in dieselbe Millisekunde. Ursache belegt, Test
  deterministisch gemacht, Produktivcode unverändert.
- **Nicht Teil von 5B:** Unsplash und andere externe Bildquellen (E17),
  kleine Spiele, Dunkelmodus (E22).
