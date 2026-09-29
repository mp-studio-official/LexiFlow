# Sprint 5B — Produkt- und Designkonzept

**Stand:** 29.09.2026 · **Gilt für:** Sprint 5B · **Status:** verbindlich als
Zielbild, nicht als Umsetzungsstand

---

## 0. Wozu dieses Dokument

Sprint 5A hat die Cloud tragfähig gemacht: Konten, Kurse, Pakete, Lernstände,
Zugriffsregeln, zwei Serverfunktionen. Was dabei **nicht** entstanden ist, ist
eine Produktoberfläche, die man jemandem zeigen möchte. Das Portal trägt
dieselbe Hülle wie die lokale Werkstatt, und die Werkstatt ist über vier
Sprints gewachsen, nicht entworfen worden.

Dieses Dokument legt fest, **was** 5B bauen soll und **woran** man erkennt,
dass es gebaut ist. Es baut nichts.

### Zwei Regeln, die dieses Dokument einhält

1. **Was existiert, steht unter „Ist". Was geplant ist, steht unter „Soll".**
   Kein Satz in diesem Dokument behauptet eine Funktion, die es nicht gibt.
   Wo etwas zur Hälfte da ist, steht, welche Hälfte.
2. **Kein Umbau im laufenden Sprint 5A.** Dieses Dokument ist ein
   Dokumentationscommit. Der erste Zeilencode zu 5B entsteht, wenn 5A
   abgenommen und zusammengeführt ist.

### Visuelle Referenzen

| Referenz | was daraus übernommen wird | was ausdrücklich **nicht** |
| --- | --- | --- |
| `corelypilates.framer.website` | das Gefühl: warm, großzügig, editorial, bildstark; viel Weißraum; wenige, ruhige Flächen statt Rahmen | die Marketinghaltung. Ein bildschirmfüllender Hero gehört auf eine Startseite, nicht in eine Arbeitsansicht. |
| `coursesite.framer.website` | die Informationsarchitektur: Lernangebote als erfassbare Karten, Metadaten am Kartenfuß, eine deutliche Hauptaktion je Karte | die Farbwelt und die Typografie |

Beide sind **Inspiration, keine Vorlage.** Es wird kein Layout nachgebaut und
kein Markenelement übernommen.

---

## 1. Ist-Zustand — was heute wirklich existiert

Erhoben am 29.09.2026 durch Lesen des Repositorys, nicht aus dem Gedächtnis.

### 1.1 Drei Hüllen, drei Navigationen

| Hülle | Datei | Navigation heute |
| --- | --- | --- |
| lokale App | `src/ui/AppShell.tsx` | Lernen · Erstellen · Daten |
| portable Lerndatei | `src/portable/StudentShell.tsx` | eigener, reduzierter Kopf |
| Cloud-Portal | `src/hosted/PortalShell.tsx` | Lernende: Lernen · Beitreten · Daten — Lehrkräfte: Kurse · Material · KI-Zugang · Lernen · Daten — zusätzlich Verwaltung für Admin |

Eine mobile Navigation am unteren Rand **gibt es bereits** (`bottom-nav` in
`AppShell` und `PortalShell`), samt Token `--bottom-nav-height`,
`--tap-target: 44px` und `--safe-bottom`.

### 1.2 Designsystem

`src/styles/tokens.css` (318 Zeilen) ist erheblich weiter, als der optische
Eindruck vermuten lässt. Vorhanden und **durch Tests festgehalten**:

- drei Markenfarben und ausschließlich abgeleitete Werte daneben; jede
  Ableitung mit ihrer Mischung im Kommentar;
- gemessene Kontraste, nachgerechnet bei jedem Testlauf
  (`src/styles/contrast.test.ts`);
- eine Laufweitenleiter, die an die Schriftgröße gebunden ist
  (`tracking.test.ts`);
- Radien nach Rolle (Bedienelement / Fläche / Pille), drei Schattenstufen,
  ein eigener Navigationsschatten;
- Bewegung: `--duration-fast`, `--duration-base`, ein eigener, schnellerer
  `--duration-press`, zwei Druckmaßstäbe für Karten und Chips;
- Fokus-Token inklusive einer Variante für dunkle Flächen;
- weitere Stiltests: `hover.test.ts`, `press.test.ts`, `print.test.ts`,
  `tapTargets.test.ts`.

**Das Problem liegt nicht bei den Token, sondern darüber:**
`src/styles/global.css` hat **4 740 Zeilen**. Dort steht seitenbezogenes CSS
neben Bausteinen. Genau das ist der Gegenstand von 5B.

Schriften: **Manrope Variable** und **Newsreader Variable** liegen lokal
eingebettet vor; Satoshi wird nur benutzt, wenn jemand sie installiert hat
(Lizenzlage für die Weitergabe ungeklärt). Die Forderung „freie Schriften
lokal mitliefern, keine externe Schriftanforderung" ist damit **bereits
erfüllt** und bleibt es.

### 1.3 Lernendenseite

| Gefordert für 5B | Ist |
| --- | --- |
| „Heute" | **existiert nicht.** `StudentHomePage` listet Pakete. |
| „Lernen" (Kurse → Pakete) | teilweise: Pakete ja, Kursgliederung im Portal ja, aber nicht als eigener Bereich gedacht |
| „Üben" mit Formenauswahl | Formen **existieren**: `flashcard`, `multiple-choice`, `open-translation`, `cloze-bank`, `cloze-free`, gruppiert in offen / halboffen / geschlossen (`src/domain/exercises.ts`). Ein Bereich, der sie zur Wahl stellt, existiert nicht — es gibt `FreePracticeSetupPage`, `CardStudyPage`, `SelfTestPage` als getrennte Einstiege. |
| „Mein Fortschritt" | **existiert nicht als Ansicht.** Die Daten dahinter teilweise: `EntryProgress` (Leitner-Fach 1–5 je Richtung, richtig/falsch, `streak`, `dueAt`) und `PackProgress` (Sitzungen, beantwortet, richtig). |
| Lernzeit | **existiert nicht.** Keine Zeitmessung im Code. |
| Lernserie (Tage in Folge) | **existiert nicht.** Das vorhandene `streak` zählt richtige Antworten hintereinander, nicht Tage. |
| Wochenziel | **existiert nicht.** |

### 1.4 Lehrkraftseite

Vorhanden: Import (PDF, Foto, Tabelle, Text), Textwerkstatt mit
Kandidatenauswahl, Wörterbuch- und KI-Vorschläge, Beispielsatzassistent,
Lernbereiche, Paketeditor, Veröffentlichung mit Revisionen, KI-Zugang mit
verschlüsselter Schlüsselablage, Export als Lerndatei, Tabelle und
Offline-HTML.

Der in 5B beschriebene Ablauf ist damit **überwiegend gebaut**. Was fehlt, ist
nicht der Ablauf, sondern seine Form: er verteilt sich über Seiten, die
einzeln entstanden sind.

Ausdrücklich **nicht** vorhanden: zeitgesteuerte Veröffentlichung.

### 1.5 Paketmodell

`VOCABPACK_FORMAT_VERSION = 2`. Ein Eintrag trägt heute schon mehr als zwei
Textfelder:

`english` (die Lernform, darf `to accuse sb. of sth.` sein) · `lemma` ·
`complementPattern` · `grammaticalNumber` (nur Substantive) ·
`lexicalGroupId` (verbindet Wortfamilien) · `germanAnswers[]` ·
`acceptedEnglishAnswers[]` · `partOfSpeech` · `exampleSentences[]` (englisch,
optional deutsch) · `topicTags[]` · `notes` · `difficulty` · `sourceType`.

`src/domain/migrations.ts` hebt ältere Dateien an — ein Migrationsweg
existiert also bereits und muss nicht erfunden werden.

**Nicht vorhanden:** Fundstelle getrennt von Lernform · Stammformen
(`tell – told – told`) · grammatischer Hinweis als eigenes Feld · Singular/
Plural als Paar · Partikel und Präposition strukturiert · **jedes Bildfeld**.

### 1.6 Cloud

Zehn Migrationen, angewandt. **Kein Storage-Bucket** — für Titelbilder ist in
der Datenbank noch nichts angelegt. Zwei Edge Functions, zum Zeitpunkt dieses
Dokuments **noch nicht deployt**.

### 1.7 Geprüfte Bildschirmbreiten

`playwright.config.ts` führt **ein** Projekt: `Desktop Chrome`. Weder Safari
noch WebKit noch eine mobile Breite laufen automatisiert. 44-px-Flächen und
Kontraste werden als CSS geprüft, nicht im gerenderten Bild.

Das ist der wichtigste Befund dieses Abschnitts: **Mobilfähigkeit ist heute
behauptet, nicht bewiesen.**

---

## 2. Zielbild

LexiFlow soll sich anfühlen wie ein gut gemachtes Lernheft, nicht wie ein
Verwaltungswerkzeug — und wie ein Werkzeug, nicht wie eine Werbeseite.

Vier Sätze, an denen sich jede Entscheidung in 5B messen lässt:

1. **Papier trägt, Farbe ereignet sich.** Rund 90 % der Fläche bleiben
   Parchment und Aubergine. Tomato erscheint für aktive Zustände und die eine
   primäre Aktion einer Ansicht — nicht zweimal auf demselben Bildschirm.
2. **Weniger Kanten, mehr Luft.** Rahmen nur, wo etwas begrenzt werden muss
   (Eingabefelder, Auswahl). Karten trennen sich durch Fläche, Abstand und
   einen weichen Schatten.
3. **Lernende bekommen Raum, Lehrkräfte bekommen Dichte.** Eine Lernansicht
   darf großzügig sein. Ein Kandidateneditor mit 80 Wörtern darf es nicht.
4. **Kein Marketing in der Arbeit.** Große Bildflächen gehören auf Landing-,
   Beitritts- und Startseiten. In „Üben" und im Paketeditor nicht.

### Farben — verbindlich und unverändert

| Rolle | Farbe |
| --- | --- |
| Tinte, Navigation, primäre Aktion | Aubergine `#2F092D` |
| aktive Zustände, Marker, Akzent | Tomato `#FF2E2D` |
| Grundfläche | Parchment `#F8EFE3` |

Keine weitere dominante Markenfarbe. Semantische Farben (Erfolg, Warnung,
Fehler) bleiben, was sie sind: Semantik, keine Marke.

**Tomato als Text bleibt verboten** außer auf Aubergine. Auf Papier erreicht
Tomato 3,25 : 1; für Schrift gilt weiterhin die dunkle Ableitung
`--accent-ink` (5,87 : 1). Diese Regel ist nicht verhandelbar und wird
weiterhin von `contrast.test.ts` nachgerechnet.

---

## 3. Informationsarchitektur je Rolle

### 3.1 Lernende — vier Ziele

| Ziel | Inhalt | Ist |
| --- | --- | --- |
| **Heute** | Einstieg: weiterlernen, fällig, Kurse, zuletzt benutzt, Woche, Serie, Ziele | neu |
| **Lernen** | Kurse und die zugehörigen Lernpakete | teilweise vorhanden, neu zu ordnen |
| **Üben** | Übungsformen quer über Pakete | Formen vorhanden, Bereich neu |
| **Mein Fortschritt** | ausschließlich die eigene Person | neu |

Vier Ziele, weil fünf auf 390 px nicht mehr lesbar beschriftet sind.

### 3.2 Lehrkräfte — vier Ziele

| Ziel | Inhalt |
| --- | --- |
| **Kurse** | Lerngruppen, Einladungscodes, Archivierung |
| **Lernpakete** | erstellen, bearbeiten, veröffentlichen, exportieren |
| **Lernen/Vorschau** | derselbe Lernbereich wie bei Lernenden, ausdrücklich zur Vorschau |
| **Einstellungen** | KI-Zugang, Konto, Daten |

„KI-Zugang" wandert unter **Einstellungen**. Er ist einmal im Halbjahr
relevant und beansprucht heute ein Fünftel der Navigation.

**Lehrkräfte dürfen den Lernbereich weiter verwenden.** Sichtbar als Vorschau
gekennzeichnet, damit nicht der Eindruck entsteht, hier werde der Lernstand
einer Klasse geführt.

### 3.3 Was die Navigation nicht tut

Es gibt **keinen** Navigationspunkt, der Lehrkräften Lernstände Einzelner
zeigt. Das ist keine Auslassung, sondern die Architekturentscheidung aus
Sprint 1 und bleibt in 5B unangetastet.

---

## 4. Die wichtigsten Bildschirme

### 4.1 Heute (neu)

Eine Spalte auf Mobil, zwei ab 1024 px. Von oben:

1. **Weiterlernen** — eine einzige große Karte mit dem zuletzt benutzten
   Paket und genau einer Aktion. Wer nichts entscheiden will, drückt hier.
2. **Fällige Wiederholungen** — Anzahl aus `dueAt`, eine Aktion. Bei null
   fälligen Karten ein ruhiger leerer Zustand, **keine Ermahnung**.
3. **Meine Kurse** — waagerecht scrollende Kurskarten.
4. **Zuletzt verwendet** — bis zu vier Paketkarten mit Cover.
5. **Diese Woche** — sieben Punkte, ein Punkt je Tag.
6. **Lernserie** — siehe 4.5.
7. **Ziele** — freiwillig, standardmäßig aus.

### 4.2 Lernen

Kurse als Abschnitte, darunter die Pakete des Kurses als Karten mit Cover,
Titel, Niveau, Anzahl Vokabeln, Fortschrittsbalken. Einspaltig bis 768 px.

### 4.3 Üben

Ein Raster aus Übungsmoduskarten. Jede Karte: Name, ein Satz Erklärung,
Verfügbarkeit.

| Karte | Ist |
| --- | --- |
| Englisch → Deutsch | vorhanden (`open-translation`, Richtung `en-de`) |
| Deutsch → Englisch | vorhanden (`open-translation`, Richtung `de-en`) |
| Karteikarten | vorhanden (`flashcard`) |
| Lückentexte | vorhanden (`cloze-bank`, `cloze-free`) |
| Fällige Wiederholungen | Daten vorhanden (`dueAt`), Einstieg neu |
| Schwierige Wörter | **neu** — Ableitung aus `wrongCount` und Fach |
| Zeitformen | **neu**, setzt das Datenmodell aus Abschnitt 7 voraus |
| Kleine Spiele | **später**, nicht Teil von 5B |

Eine Karte, deren Voraussetzung fehlt, wird **nicht angezeigt** — nicht
ausgegraut. Ein ausgegrauter Knopf ist ein Versprechen ohne Termin.

### 4.4 Mein Fortschritt

Ausschließlich die eigene Person. Kurs- und Paketfortschritt, beherrschte und
offene Vokabeln (Fach 4–5 gegen Fach 1–3), Lernzeit, Lernserie, Wochenziel,
persönliche schwierige Wörter mit direktem Übungseinstieg.

**Keine Ranglisten. Keine Vergleiche mit anderen. Keine Herzen, keine
Strafen.** Lernstände bleiben privat und sind für Lehrkräfte nicht
einsehbar — auch nicht aggregiert, solange das nicht ausdrücklich entschieden
ist.

### 4.5 Die Lernserie — ausdrücklich flexibel

Eine Serie, die beim ersten freien Tag auf null fällt, bestraft Krankheit und
Wochenenden. Die Regel für 5B:

- Ein Tag zählt ab einer kleinen, erreichbaren Menge (Vorschlag: zehn
  beantwortete Karten).
- **Zwei Ruhetage je Kalenderwoche** unterbrechen die Serie nicht.
- Eine unterbrochene Serie wird ruhig gemeldet und die längste bisherige
  bleibt sichtbar.
- Kein Zähler, der rot wird. Keine Erinnerung, die drängt.

Die konkrete Schwelle ist eine fachliche Entscheidung — siehe Abschnitt 11.

### 4.6 Lehrkraft: Lernpakete und Paketwerkstatt

Der Ablauf, den 5B in eine Form bringt:

| # | Schritt | Ist |
| --- | --- | --- |
| 1 | Kurs/Lerngruppe, Thema, Niveau | vorhanden |
| 2 | PDF, Foto, Excel, Lerndatei oder Text einlesen | vorhanden |
| 3 | KI analysiert und strukturiert | vorhanden |
| 4 | Wörter/Wortgruppen im Quelltext auswählen | vorhanden (`SourceTextPane`, `TextCandidateReview`) |
| 5 | Vorschläge für Übersetzung, Wortart, Lernform, Beispielsätze | vorhanden (Wörterbuch + KI) |
| 6 | Lehrkraft prüft und bestätigt | vorhanden |
| 7 | sofort oder zeitgesteuert veröffentlichen | sofort vorhanden, **zeitgesteuert neu** |
| 8 | Export als Lerndatei, Tabelle, Offline-HTML | vorhanden |

**KI-Ergebnisse sind immer Vorschläge.** Kein Paket wird ungeprüft
veröffentlicht. Das gilt heute und bleibt in 5B eine Eigenschaft des Ablaufs,
nicht eine Einstellung.

---

## 5. Designsystem

### 5.1 Token — was bleibt, was dazukommt

**Bleibt unverändert:** Farben, Kontrastregeln, Laufweitenleiter, Radien,
Fokus, Bewegung, Druckmaßstäbe. Die Token sind nicht das Problem.

**Kommt dazu:**

| Token | wofür |
| --- | --- |
| `--cover-ratio` | ein einziges Seitenverhältnis für alle Paketcover (Vorschlag 16 : 10) |
| `--elevation-card`, `--elevation-card-hover` | Rollennamen statt `--shadow-2` in 40 Regeln |
| `--stack-*` | senkrechter Rhythmus als Leiter statt handgesetzter Abstände |
| `--skeleton-*` | Ladeflächen |

**Wird nicht eingeführt:** eine vierte Markenfarbe, ein zweiter Radiensatz,
ein Dunkelmodus (bleibt eigenes, vollständig geprüftes Thema).

### 5.2 Bausteine

Jeder Baustein ist eine Datei in `src/ui/` mit eigenem Test. Kein
seitenbezogenes CSS mehr in `global.css` für das, was mehr als einmal
vorkommt.

| Baustein | Ist |
| --- | --- |
| App-Shell | vorhanden (dreifach — in 5B **eine** Hülle mit Rollenprofilen) |
| Navigation oben / Bottom-Navigation | vorhanden, wird vereinheitlicht |
| Seitentitel | neu |
| Kurskarte | neu |
| Lernpaketkarte mit Cover | `PackCard` vorhanden, Cover neu |
| Fortschrittsanzeige | teilweise vorhanden, wird Baustein |
| Statistik-/Serienkarte | neu |
| Übungsmoduskarte | neu |
| Leere Zustände | verstreut vorhanden, wird Baustein |
| Hinweise und Fehler | teilweise (`Disclosure`, `InfoDisclosure`) |
| Formulare | verstreut, wird Baustein |
| Uploadbereich | teilweise (Import), wird Baustein |
| Sticky Aktionsleiste | neu |
| Skeleton- und Ladezustände | neu |

### 5.3 Die Größenschranke

Die portable Lerndatei ist eine Einzel-HTML. Jeder Baustein, der dort landet,
wächst sie.

**Regel:** Bausteine, die nur Lehrkräfte oder nur das Portal brauchen
(Uploadbereich, Kurskarte, sticky Aktionsleiste), dürfen **nicht** in den
portablen Pfad. Die bestehende Größenprüfung
(`src/domain/learningAreaSize.test.ts`, `scripts/verify-portable.mjs`) bleibt
die Wache.

**Es wird keine Funktion entfernt, um ein Größenbudget zu halten.** Wenn ein
Budget nicht reicht, wird es begründet angehoben oder der Baustein bleibt
draußen — beides ist eine Entscheidung, keine stille Kürzung.

---

## 6. Mobil und Barrierefreiheit

### 6.1 Zu prüfende Breiten

390 px · 768 px · 1024 px · 1440 px, jeweils in **Chromium und WebKit**.

Heute läuft nur Desktop Chrome. 5B muss `playwright.config.ts` um WebKit und
die vier Breiten erweitern — sonst ist „mobilfähig" weiterhin eine Behauptung.

### 6.2 Regeln

- Bottom-Navigation für Lernende; höchstens fünf Ziele, in 5B vier.
- Einspaltige Paketkarten bis 768 px.
- Interaktionsflächen mindestens 44 × 44 px (`--tap-target` existiert).
- **Keine Funktion nur über Hover.** Jede Hover-Aufdeckung braucht einen
  zweiten Weg.
- Tabellen (Entwurfstabelle, Vokabelliste) unter 768 px als Karten.
- Wichtige Aktionen sticky am unteren Rand, oberhalb der Bottom-Navigation
  und der Safe Area.
- Quelltext und Kandidateneditor mobil als **umschaltbare** Ansichten, nicht
  als geteilter Bildschirm (`SplitPane` bleibt der Desktopfall).

### 6.3 Barrierefreiheit

- Sichtbarer Tastaturfokus überall; die Token existieren.
- Beschriftungen für Screenreader an jedem Bedienelement ohne Text.
- Kontrast nach WCAG AA; die Messung existiert und wird auf neue Bausteine
  ausgedehnt.
- `prefers-reduced-motion` respektieren: Bewegung reduziert, nicht nur
  verkürzt.
- Bei 200 % Zoom darf kein Inhalt verloren gehen — zu prüfen bei 390 px und
  1024 px.
- Farbe trägt nie allein eine Information.

---

## 7. Grammatisches Datenmodell — Schemafassung 3

### 7.1 Warum

Eine Vokabel ist nicht zwei Textfelder. Marcs Beispiel:

| Feld | Wert |
| --- | --- |
| Fundstelle | `told` |
| Lernform | `to tell sb. sth.` |
| grammatischer Hinweis | Past Simple von `to tell sb. sth.` |
| Wortart | Verb |
| Formen | `tell – told – told` |
| Übersetzung | jdm. etw. erzählen |
| Quellsatz | aus dem Text |
| Beispielsatz | optional, didaktisch |

Heute ließe sich davon abbilden: Lernform, Wortart, Ergänzungsmuster,
Übersetzung, Beispielsätze. **Nicht** abbildbar: Fundstelle, Hinweis,
Stammformen.

### 7.2 Die Erweiterung

Alle neuen Felder sind **optional**. Ein Paket der Fassung 2 bleibt gültig.

```
occurrence?      die Form, wie sie im Text stand ("told")
grammarNote?     der Hinweis in Worten ("Past Simple von to tell sb. sth.")
inflection?      strukturierte Formen, je nach Wortart:
                   Verb:       base, pastSimple, pastParticiple,
                               thirdPerson?, presentParticiple?,
                               irregular: boolean, particle?, preposition?
                   Substantiv: singular, plural, uncountable?, pluralOnly?
                   Adjektiv:   comparative?, superlative?
sourceSentence?  der Satz, in dem die Fundstelle stand
```

**Wortfamilien** werden nicht neu erfunden: `lexicalGroupId` existiert und
verbindet bereits `attainability (n.)` mit `attainable (adj.)`. Jede Wortart
bleibt ein eigener Eintrag mit eigenem Lernstand — das ist richtig und bleibt.

### 7.3 Kompatibilität

`VOCABPACK_FORMAT_VERSION` steigt auf **3**. `src/domain/migrations.ts`
bekommt einen Schritt 2 → 3, der **nichts erfindet**: keine Stammformen
ableiten, keine Fundstelle raten. Ein Eintrag ohne diese Angaben bleibt ein
Eintrag ohne diese Angaben.

Rückwärts: ein Paket der Fassung 3 lässt sich als Fassung 2 exportieren, indem
die neuen Felder wegfallen. Der Lerngegenstand bleibt vollständig, nur der
grammatische Zusatz geht verloren. Das muss beim Export **angesagt** werden.

Eine Prüfung hält fest, dass jede Datei aus Sprint 1 bis 5A weiterhin
eingelesen wird.

---

## 8. Titelbilder für Lernpakete

### 8.1 Grundsatz

Ein Titelbild ist **nie Pflicht**. Ohne Bild erzeugt LexiFlow ein Ersatzcover
aus Thema, Farbe und grafischem Muster.

Dafür muss nichts erfunden werden: `src/ui/PackArt.tsx` und
`src/ui/packMotif.ts` zeichnen bereits ein Motiv aus dem Titel, ausschließlich
in den drei Markenfarben, als SVG, `aria-hidden`. Das ist die interne
Coverquelle. In 5B bekommt es das Seitenverhältnis `--cover-ratio` und eine
Titelfläche.

### 8.2 Quellen, in dieser Reihenfolge

1. **Upload durch die Lehrkraft** — Stufe 1, Teil von 5B.
2. **Eingebaute LexiFlow-Cover** — vorhanden, wird ausgebaut.
3. **Unsplash** — Stufe 2, **nicht Teil von 5B**.

### 8.3 Uploads

| Anforderung | Festlegung |
| --- | --- |
| Formate | JPEG, PNG, WebP; HEIC nur nach Konvertierung |
| SVG | **nicht** ungeprüft. SVG ist ausführbares Markup. |
| Prüfung | MIME-Typ **und** Dateisignatur, serverseitig; der Browser ist keine Instanz |
| Größe | harte Obergrenze vor dem Hochladen und noch einmal danach |
| Verarbeitung | automatische Kompression, mehrere Größen (Vorschlag: 400 / 800 / 1600 px Breite) |
| EXIF | vollständig entfernen, **einschließlich Standort** |
| Ausschnitt | Fokuspunkt, den die Lehrkraft setzt; Standard Bildmitte |
| Ablage | Supabase Storage, eigener Bucket, Zugriffsregeln wie die Pakete: lesen darf, wer das Paket sehen darf |
| Offline-Export | komprimiert eingebettet |

**Heute existiert dafür nichts** — weder Bucket noch Migration noch Feld. Das
ist ein eigener Block (Abschnitt 10).

### 8.4 Datenmodell für das Cover

```
cover?  {
  source:      'upload' | 'builtin' | 'unsplash'
  path?        Speicherpfad im Bucket (bei upload)
  externalId?  externe Kennung (bei unsplash)
  alt          Alternativtext — Pflicht, sobald ein Bild da ist
  focus?       { x, y } in 0..1
  dominant?    dominante Farbe für Ladezustand und Ersatzfläche
  attribution? { name, profileUrl, sourceUrl }
}
```

Der Alternativtext ist Pflicht, weil ein Titelbild ohne ihn eine Ansicht für
Screenreader unbrauchbar macht — und weil niemand ihn nachträgt.

### 8.5 Unsplash — Stufe 2, Bedingungen vorab

Nicht in 5B umsetzen. Festgehalten, damit die Architektur es später nicht
ausschließt:

- offizielle API, **kein** Scraping;
- Zugang ausschließlich serverseitig — derselbe Weg wie beim KI-Zugang;
- die Lehrkraft wählt bewusst aus, keine automatische Auswahl;
- Fotograf:in und Unsplash automatisch korrekt nennen und verlinken;
- Download-Ereignis gemäß API-Vorgabe melden;
- hoher Inhaltsfilter;
- **keine automatische Auswahl von Bildern mit erkennbaren Kindern**;
- die Hotlinking-Vorgabe und der Offline-Export vertragen sich möglicherweise
  nicht. Bis das geklärt ist, verwenden Offline-Exporte ein hochgeladenes
  oder internes Cover.

**Keine Unsplash-Zugangsdaten anfordern oder einbauen**, bevor Architektur und
Nutzungsbedingungen abgenommen sind.

---

## 9. Abhängigkeiten und Risiken

| # | Risiko | Wirkung | Umgang |
| --- | --- | --- | --- |
| R1 | `global.css` mit 4 740 Zeilen | jede Änderung trifft unabsehbar viel | Bausteine ziehen Regeln heraus; die Datei schrumpft messbar je Block |
| R2 | drei Hüllen | dieselbe Änderung dreimal | eine Hülle mit Rollenprofilen; zuerst Bausteine, dann Zusammenführung |
| R3 | portable Datei wächst | Größenbudget reißt | Bausteine nach Pfad trennen (5.3); bestehende Größenprüfung bleibt |
| R4 | Schemafassung 3 | ältere Pakete brechen | alle Felder optional, Migrationsschritt ohne Erfindung, Prüfung gegen Altdateien |
| R5 | Bild-Uploads | Speicherkosten, Rechte, Missbrauch | harte Grenzen, Serverprüfung, kein SVG, EXIF weg |
| R6 | Lernserie und Ziele | Druck statt Motivation | Ruhetage, kein Rot, Ziele freiwillig und standardmäßig aus |
| R7 | Safari und Mobil ungeprüft | Fehler erst bei Lernenden | WebKit und vier Breiten in die E2E-Prüfung, **vor** dem ersten 5B-Block |
| R8 | 5B beginnt vor 5A-Abnahme | zwei bewegliche Teile | 5B beginnt erst nach dem Merge von 5A |
| R9 | Zeitgesteuerte Veröffentlichung | braucht serverseitige Zeit | Serverzeit, nie Gerätezeit; eigener Block |

---

## 10. Umsetzung in getrennt prüfbaren Blöcken

Jeder Block ist für sich lauffähig, für sich prüfbar und für sich
zurücknehmbar. Die Reihenfolge ist nicht beliebig: 5B.0 ist die Messlatte für
alles danach.

| Block | Inhalt | hängt ab von |
| --- | --- | --- |
| **5B.0** | Prüfbank: WebKit und vier Breiten in Playwright, Tapziel- und Kontrastprüfung auf gerenderte Ansichten ausgedehnt | — |
| **5B.1** | Token-Ergänzungen und die ersten Bausteine: Seitentitel, Kurskarte, Paketkarte mit Coverfläche, Fortschrittsanzeige, leere Zustände | 5B.0 |
| **5B.2** | Eine Hülle mit Rollenprofilen; Navigation Lernende (4 Ziele) und Lehrkräfte (4 Ziele); KI-Zugang unter Einstellungen | 5B.1 |
| **5B.3** | „Heute" | 5B.2 |
| **5B.4** | „Üben" als Bereich; Karte „Schwierige Wörter"; „Fällige Wiederholungen" als Einstieg | 5B.2 |
| **5B.5** | „Mein Fortschritt" samt Lernzeit, Lernserie mit Ruhetagen, freiwilligem Wochenziel | 5B.3 |
| **5B.6** | Schemafassung 3 und Migrationsschritt 2 → 3, ohne Oberfläche | — (parallel möglich) |
| **5B.7** | Grammatik in der Oberfläche: Eingabe im Paketeditor, Anzeige auf der Lernkarte, Übungsform „Zeitformen" | 5B.6, 5B.4 |
| **5B.8** | Titelbilder Stufe 1: Bucket, Migration, Upload, Prüfung, Größen, Fokuspunkt, Einbettung im Offline-Export | 5B.1 |
| **5B.9** | Mobile Sonderfälle: Tabellen als Karten, umschaltbare Werkstattansichten, sticky Aktionsleisten | 5B.2 |
| **5B.10** | Zeitgesteuerte Veröffentlichung | — |

Nicht Teil von 5B: Unsplash, kleine Spiele, Dunkelmodus.

---

## 11. Abnahmekriterien

Messbar heißt: eine Prüfung kann es entscheiden, nicht ein Eindruck.

### Prüfbank

- [ ] Playwright führt Chromium **und** WebKit bei 390, 768, 1024 und 1440 px.
- [ ] Kein waagerechtes Scrollen bei 390 px auf keiner Route.
- [ ] Bei 200 % Zoom ist auf jeder geprüften Route jede Hauptaktion erreichbar.
- [ ] Jede Interaktionsfläche misst gerendert mindestens 44 × 44 px.

### Designsystem

- [ ] `global.css` ist um mindestens 40 % kürzer als die heutigen 4 740 Zeilen.
- [ ] Jeder Baustein aus 5.2 liegt in `src/ui/` mit eigenem Test.
- [ ] `contrast.test.ts` läuft unverändert grün; kein neuer Farbwert außerhalb
      der Token.
- [ ] Auf keinem Bildschirm steht Tomato als Text auf Papier.
- [ ] Keine vierte Markenfarbe im Bündel.

### Lernendenbereich

- [ ] „Heute" zeigt alle sieben Bereiche aus 4.1, jeder mit definiertem leerem
      Zustand.
- [ ] Ein neues Konto ohne jede Aktivität sieht eine vollständige, nicht
      kaputte Seite.
- [ ] „Üben" zeigt ausschließlich Karten, deren Voraussetzung erfüllt ist.
- [ ] „Mein Fortschritt" enthält keinen Wert über eine andere Person.
- [ ] Zwei Ruhetage je Woche unterbrechen die Serie nicht — als Prüfung der
      Domainfunktion, ohne Oberfläche.
- [ ] Kein Element droht, mahnt oder zählt herunter.

### Lehrkraftbereich

- [ ] Vier Navigationsziele; KI-Zugang unter Einstellungen.
- [ ] Der Lernbereich ist für Lehrkräfte sichtbar als Vorschau gekennzeichnet.
- [ ] Kein Weg führt von einer Lehrkraftansicht zum Lernstand einer
      namentlichen Person.

### Datenmodell

- [ ] Jede Paketdatei aus Sprint 1 bis 5A wird unverändert eingelesen.
- [ ] Der Migrationsschritt 2 → 3 erfindet keine Angabe — geprüft an einem
      Paket ohne Stammformen.
- [ ] Ein Export nach Fassung 2 verliert nur den grammatischen Zusatz und sagt
      es an.
- [ ] `tell – told – told` ist strukturiert abbildbar und auf der Lernkarte
      sichtbar.

### Titelbilder

- [ ] Ein Paket ohne Bild zeigt ein Ersatzcover, nie eine leere Fläche.
- [ ] Ein Upload ohne Alternativtext lässt sich nicht speichern.
- [ ] Eine als JPEG umbenannte Datei anderen Typs wird serverseitig abgelehnt.
- [ ] Ein SVG-Upload wird abgelehnt.
- [ ] Ein Bild mit Standort-EXIF liegt ohne diese Daten im Bucket.
- [ ] Ein Offline-Export mit Cover bleibt innerhalb des Größenbudgets.
- [ ] Wer ein Paket nicht sehen darf, kann sein Cover nicht abrufen.

### Portabilität

- [ ] Die portable Lerndatei funktioniert weiterhin unter `file://` und in
      Safari.
- [ ] `scripts/verify-portable.mjs` läuft grün.
- [ ] Keine externe Schriftanforderung im Bündel.

---

## 12. Entscheidungen, die Marc treffen muss

Diese sind **nicht** getroffen. Ich baue nichts davon auf Verdacht.

| # | Frage | mein Vorschlag |
| --- | --- | --- |
| E1 | Ab wie vielen Karten zählt ein Tag für die Lernserie? | zehn beantwortete Karten |
| E2 | Zwei Ruhetage je Kalenderwoche — richtig? | ja, und nicht ansammelbar |
| E3 | Ist ein Wochenziel standardmäßig **aus**? | ja. Ein voreingestelltes Ziel ist eine Vorgabe, keine Wahl. |
| E4 | Seitenverhältnis der Cover | 16 : 10 |
| E5 | Obergrenze für Bild-Uploads | 5 MB vor der Verarbeitung |
| E6 | Wird der Bucket öffentlich lesbar oder über signierte Adressen? | signierte Adressen — sonst ist jedes Cover ein öffentlicher Link |
| E7 | Dürfen Lehrkräfte **aggregierte** Kursfortschritte sehen (ohne Namen)? | in 5B **nein**. Das ist eine eigene Entscheidung mit eigener Datenschutzfolge. |
| E8 | Zeitgesteuerte Veröffentlichung: pg_cron oder Prüfung beim Abruf? | Prüfung beim Abruf — kein zusätzlicher Dienst, keine zusätzliche Fehlerquelle |
| E9 | Wird die Navigation bei Lernenden wirklich auf vier Ziele begrenzt? | ja |
| E10 | Bleibt Satoshi als nicht mitgelieferte Erstwahl? | ja, solange die Lizenzlage ungeklärt ist |

---

## 13. Was dieses Dokument ausdrücklich nicht sagt

- Es sagt nicht, dass eine dieser Ansichten existiert. Abschnitt 1 nennt je
  Punkt den Ist-Zustand.
- Es sagt nicht, dass 5A abgenommen ist. Zum Zeitpunkt dieses Dokuments sind
  die zehn Migrationen angewandt und die beiden Secrets gesetzt; deployt ist
  nichts, und die Abnahme gegen die echte Laufzeit steht aus.
- Es legt keinen Termin fest.
- Es ersetzt keine Datenschutzfolgenabschätzung für Bild-Uploads. Die ist ein
  eigener Vorgang, bevor Block 5B.8 beginnt.
