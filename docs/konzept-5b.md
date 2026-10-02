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
eingebettet vor. Die Forderung „freie Schriften lokal mitliefern, keine
externe Schriftanforderung" ist damit **bereits erfüllt** und bleibt es. Die
*unbestimmte* Erstwahl Satoshi ist mit E10 weggefallen und seit **P1a**
(Block 5B.1) auch aus `tokens.css` verschwunden — `src/styles/neueToken.test.ts`
hält das fest (Abschnitt 12).

> **Damit kein Missverständnis entsteht:** Dass die Token gut sind und die
> Kontrastprüfung grün läuft, heißt **nicht**, dass das sichtbare Design dem
> Zielbild schon entspricht. Es entspricht ihm nicht. Gute Token sind die
> Voraussetzung dafür, dass 5B das Aussehen ändern kann, ohne die Zugäng-
> lichkeit zu verlieren — sie sind nicht das Ergebnis.

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

### 1.4 Lehrkraftseite — und in welcher Laufzeit

Der vorige Stand dieses Dokuments sagte, der Lehrkraftablauf sei „überwiegend
gebaut". Das war **irreführend**, weil es die entscheidende Frage nicht
stellte: gebaut *wo*.

LexiFlow hat drei Auslieferungen. Sie liegen unter demselben Ursprung, teilen
sich die Domainlogik — und sonst fast nichts.

| Auslieferung | Adresse | wer sie benutzt |
| --- | --- | --- |
| **kontofreie Lehrkraft-App** | `/LexiFlow/` | eine Lehrkraft am eigenen Gerät, ohne Konto |
| **Cloud-Portal** | `/LexiFlow/portal/` | Lehrkräfte und Lernende mit Konto |
| **portable Lerndatei** | eine HTML-Datei | Lernende, auch offline und per `file://` |

#### Die Werkstatt liegt nicht im Portal

Das Portal kennt fünf Bereiche: `lernen`, `kurse`, `material`, `ki`,
`verwaltung` (`src/hosted/HostedApp.tsx`). Eine Route zum Erstellen oder
Bearbeiten eines Pakets ist **nicht** darunter.

`src/hosted/teacher/MaterialPage.tsx` listet Pakete, veröffentlicht sie,
friert Fassungen ein und weist sie Kursen zu. Zum Erstellen verweist es über
`soloUrlFrom()` auf die kontofreie Anwendung. Daneben steht
`LocalImportPanel`: Weil beide Auslieferungen denselben Ursprung haben und
IndexedDB dem Ursprung gehört, kann das Portal die Pakete **übernehmen**, die
in der kontofreien Anwendung entstanden sind — ohne Datei, ohne Hochladen.

Das ist eine hübsche Lösung. Es ist aber keine Werkstatt im Portal, und für
eine Lehrkraft, die das Portal von einem anderen Gerät aus benutzt, gibt es
ihren Inhalt nicht.

#### Die acht Schritte, je Laufzeit

| # | Schritt | kontofreie App | Cloud-Portal | portable Lerndatei | gemeinsame Domainlogik | für 5B noch nötig |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Kurs/Lerngruppe, Thema, Niveau | Thema und Niveau ja (Lernbereiche); **Kurse nein** | Kurse ja; Thema/Niveau nur am übernommenen Paket | — | `cefr.ts`, `learningArea.ts` | Kurs, Thema und Niveau **im Portal** in einem Schritt |
| 2 | PDF, Foto, Excel, Lerndatei, Text einlesen | ja (`ImportWizardPage`, `PdfSourcePanel`) | **nein** | — | `import/`, `textExtraction.ts` | vollständig ins Portal zu bringen |
| 3 | KI analysiert und strukturiert | ja, am Gerät (Chrome-Modell) | **nein** für die Analyse; `ai-gateway` deckt bisher nur den Anbieterzugang | — | `ai/` | Analyse über das Portal, mit dem hinterlegten Anbieter |
| 4 | Wörter im Quelltext auswählen | ja (`SourceTextPane`, `TextCandidateReview`) | **nein** | — | `textExtraction.ts` | vollständig ins Portal zu bringen |
| 5 | Vorschläge: Übersetzung, Wortart, Lernform, Beispielsätze | ja (Wörterbuch + KI + `SentenceAssistant`) | **nein** | — | `dictionary/`, `import/enrichment.ts` | vollständig ins Portal zu bringen |
| 6 | Lehrkraft prüft und bestätigt | ja (`PackEditorPage`, `DraftTable`) | **nein** | — | `schema.ts`, `packDiff.ts` | vollständig ins Portal zu bringen |
| 7a | sofort veröffentlichen | — (kein Konto) | **ja**, mit Revisionen | — | `packDiff.ts` | — |
| 7b | zeitgesteuert veröffentlichen | — | **nein** | — | — | neu, serverseitig |
| 8 | Export als Lerndatei, Tabelle, Offline-HTML | ja | Lerndatei ja (`soloUrlFrom`), Tabelle/HTML **nein** | — | `portable/`, `ui/packDownloads.ts` | Export im Portal vervollständigen |

**Die ehrliche Zusammenfassung:** Von den acht Schritten läuft im Portal heute
**einer** vollständig (7a) und einer teilweise (1 und 8). Die Schritte 2 bis 6
— also die eigentliche Paketerstellung — existieren im Portal **gar nicht**.
Das Portal kann bisher nur übernehmen, was anderswo entstanden ist.

„Im Repository vorhanden" heißt hier ausdrücklich **nicht** „im Portal
nutzbar". Der Portalaufwand für 5B ist entsprechend groß; ihn kleinzurechnen,
weil der Code existiert, wäre der teuerste Fehler dieses Konzepts.

Ausdrücklich **nicht** vorhanden, in keiner Laufzeit: zeitgesteuerte
Veröffentlichung, Titelbilder.

#### Und auf der Lernendenseite

| Funktion | kontofreie App | Cloud-Portal | portable Lerndatei | gemeinsame Domainlogik |
| --- | --- | --- | --- | --- |
| Paketliste, Paketdetail | ja | ja (über Kurse) | ja | `studyView.ts` |
| Runde üben | ja | ja (`PracticePage`) | ja | `exercises.ts`, `session.ts` |
| Karteikarten (`CardStudyPage`) | ja | **nein** | ja | `exercises.ts` |
| Selbsttest (`SelfTestPage`) | ja | **nein** | ja | `selfTest.ts` |
| Freies Üben (`FreePracticeSetupPage`) | ja | **nein** | ja | `freePractice.ts` |
| Vokabelliste durchsehen | ja | **nein** | ja | `vocabTable.ts` |
| Lernstand über Geräte hinweg | nein | ja | nein | `progressEvents.ts` |

Auch hier gilt: Die Übungsformen **existieren**, aber im Portal ist bisher nur
eine davon erreichbar. Der Bereich „Üben" aus Abschnitt 4.3 ist im Portal
deshalb überwiegend Neubau, nicht Umbau.

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

1. **Der Grund tritt zurück, die Aurora gibt Tiefe, die Tinte trägt.**
   ~~Papier trägt, Farbe ereignet sich. Rund 90 % der Fläche bleiben Parchment
   und Aubergine.~~ **Ersetzt durch E19** (Abschnitt 14, 30.09.2026): Der Grund
   ist kühl-hell, die Hauptfarbe Anthrazit, die Aurora ein Flächenakzent.
   Aubergine und Tomato bleiben Markenakzente; Tomato darf gezielt Fortschritt
   oder einzelne aktive Akzente tragen.
2. **Weniger Kanten, mehr Luft.** Rahmen nur, wo etwas begrenzt werden muss
   (Eingabefelder, Auswahl). Karten trennen sich durch Fläche, Abstand und
   einen weichen Schatten.
3. **Lernende bekommen Raum, Lehrkräfte bekommen Dichte.** Eine Lernansicht
   darf großzügig sein. Ein Kandidateneditor mit 80 Wörtern darf es nicht.
4. **Kein Marketing in der Arbeit.** Große Bildflächen gehören auf Landing-,
   Beitritts- und Startseiten. In „Üben" und im Paketeditor nicht.

### Was sich sichtbar ändern muss

5B ist keine Aufräumaktion unter der Oberfläche. Deutlich anzupassen sind:

| Was | woran man die Änderung sieht |
| --- | --- |
| **Typografie** | kräftige Überschriften in Manrope 700–800 (~~editoriale Überschriftenstimme, Newsreader~~ — **ersetzt durch E21**), ruhigere, größere Fließtextmaße, weniger Schriftgrade je Ansicht |
| **Seitenaufbau** | ein Seitentitelbereich statt Überschrift-im-Fluss; breitere Ränder; ein Rhythmus statt handgesetzter Abstände |
| **Navigation** | unten auf dem Telefon, als kompakte Icon-Leiste am Schreibtisch; Lernende vier Ziele auf beiden Größen, Lehrkräfte fünf am Schreibtisch und vier auf dem Telefon (**E23**) |
| **Karten** | Kurs- und Paketkarten mit Cover, Metadaten am Fuß, **einer** deutlichen Aktion |
| **Bilder** | Cover gibt es überhaupt erst — heute ist jede Liste textgrau |
| **Abstände** | mehr Weißraum, weniger Rahmen; Trennung durch Fläche statt durch Linien |
| **mobile Bedienung** | einspaltig, 44 px, sticky Aktionen, umschaltbare Werkstattansichten |

Die Wärme und Großzügigkeit kommen von Corely, die Lernkartenlogik und die
Metadatenzeile von CourseSite. Kopiert wird nichts: kein Layout, kein
Markenelement, keine Farbe.

### Farben — **ersetzt durch E19**

> Dieser Abschnitt hieß bis zum 30.09.2026 „Farben — verbindlich und
> unverändert" und schrieb Aubergine, Tomato und Parchment als tragende
> Palette der Oberfläche fest. **Diese Festlegung gilt nicht mehr.** Sie ist
> nicht ergänzt, sondern ersetzt; die neue steht in E19 (Abschnitt 14).

| Rolle | Farbe |
| --- | --- |
| Grundfläche | kühl-hell `#F6F7FB` |
| Tinte, Navigation, primäre Aktion | Anthrazit `#121318` |
| Flächenakzent, Titelbilder | Aurora: Violett, Rosa, Himmelblau, Pfirsich |
| Markenakzent, Logo, Fortschritt | Aubergine `#2F092D`, Tomato `#FF2E2D` |
| ~~Grundfläche~~ | ~~Parchment `#F8EFE3`~~ — kein Standardhintergrund mehr |

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

Vier Ziele, weil fünf auf 390 px nicht mehr lesbar beschriftet sind. Am
Schreibtisch bleiben es dieselben vier — hier gäbe es Platz für mehr, aber
kein fünftes Ziel, das dorthin gehörte (E23).

### 3.2 Lehrkräfte — fünf Ziele am Schreibtisch, vier auf dem Telefon

Verbindlich festgelegt in **E23**. Die Zahl ist nicht für beide Größen
dieselbe, weil der Platz es nicht ist.

**Schreibtisch — fünf Ziele in der Icon-Leiste:**

| Ziel | Inhalt |
| --- | --- |
| **Start** | Einstieg der Lehrkraft: Kurse, zuletzt bearbeitete Pakete, Hinweise |
| **Kurse** | Lerngruppen, Einladungscodes, Archivierung |
| **Lernpakete** | erstellen, bearbeiten, veröffentlichen, exportieren |
| **KI-Zugang** | Schlüssel, Anbieter, Kontingent — eigenes Ziel, weil daneben Platz ist |
| **Einstellungen** | Konto, Daten, Export, KI-Zugang — und für Admins der Einstieg zur Verwaltung |

**Telefon — vier Ziele in der unteren Navigation:**

| Ziel | Inhalt |
| --- | --- |
| **Start** | wie am Schreibtisch |
| **Kurse** | wie am Schreibtisch |
| **Lernpakete** | wie am Schreibtisch |
| **Einstellungen** | dieselbe Fläche wie am Schreibtisch — **einschließlich KI-Zugang** |

Auf dem Telefon ist KI-Zugang also **innerhalb** von Einstellungen erreichbar,
nicht als eigenes Navigationsziel. Das ist eine bewusste responsive
Verdichtung und **keine** unterschiedliche Berechtigung und keine
unterschiedliche Funktion: Eine Lehrkraft kann auf dem Telefon genau das, was
sie am Schreibtisch kann; nur der Weg dorthin ist einen Schritt länger.

**Die Verwaltung ist kein Navigationsziel.** `#/verwaltung` — Konten und
Rollen — bleibt, was sie ist: eine Fläche hinter `RequireArea area="admin"`.
Sie steht in keiner der beiden Listen oben, weder am Schreibtisch noch auf
dem Telefon, und auch nicht „nur für Admins eingeblendet". Wer Admin ist,
findet den Einstieg **innerhalb** der Einstellungen. Der Unterschied ist
nicht kosmetisch: Ein Navigationsziel, das die Mehrheit einer Rolle nicht
öffnen darf, ist entweder tot oder ein Loch in der Autorisierung.

Der Lernbereich ist für Lehrkräfte kein Navigationsziel, sondern eine
Vorschau: „Als Lernende ansehen" steht im Kopfbereich, nicht in der
Navigation (vgl. Variante B).

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

- Ein Tag zählt nach **zehn regulär bewerteten Aufgaben** — in **jeder**
  Übungsform, nicht nur mit Karteikarten (E1).
- Dasselbe gespeicherte Ereignis zählt **nicht zweimal**. Wiederholt ein Gerät
  nach einem Abbruch seine Ereignisse, steht der Tag danach so da wie vorher.
- **Zwei automatische Ruhetage je Kalenderwoche** unterbrechen die Serie
  nicht. Nicht ansammelbar, nicht vorher zu wählen (E2).
- Maßgeblich ist die **Zeitzone der lernenden Person**; serverseitig
  entscheidet nie die Gerätezeit.
- Eine unterbrochene Serie wird ruhig gemeldet und die längste bisherige
  bleibt sichtbar.
- Kein Zähler, der rot wird. Keine Erinnerung, die drängt.

Damit ist die Serie eine Eigenschaft der **Ereignisse** und gehört neben
`application/progressEvents.ts`, nicht in eine Ansicht. Die Zeitzone der
Person muss dafür bekannt und gespeichert sein — das ist sie heute nicht.

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

**Erledigt in P1a (5B.1):** `--font-sans` und `--font-display` haben Satoshi verloren; Manrope steht jetzt vorn (E10).
Manrope trägt die Oberfläche, Newsreader bekommt mit `--font-display` die
editoriale Überschriftenrolle; `--font-quote` bleibt daneben die Stimme im
Lernmaterial. Zwei Token, eine Schriftdatei. Eine Schrift, die nur auf manchen
Geräten vorhanden ist, erzeugt ein Design, das sich nicht reproduzieren lässt.

**Kommt dazu:**

| Token | wofür |
| --- | --- |
| `--cover-ratio` | ein einziges Seitenverhältnis für alle Paketcover: **16 : 10** (E4) |
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

- Bottom-Navigation auf dem Telefon; höchstens fünf Ziele, in 5B vier —
  für Lernende **und** für Lehrkräfte (E23).
- Am Schreibtisch tritt an ihre Stelle die kompakte Icon-Leiste: Lernende
  vier Ziele, Lehrkräfte fünf.
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

Die drei sind **nicht derselbe Speicherfall** und werden nicht so behandelt
(E6):

| Quelle | Ablage | Auslieferung |
| --- | --- | --- |
| Upload | Supabase Storage, privat | kurzlebige signierte Adressen |
| eingebautes Cover | gebündeltes Asset | öffentlich, wie jedes Asset |
| Unsplash | nichts Eigenes, nur eine externe Kennung | nach Unsplashs API-Regeln |

Ein öffentlich lesbarer Bucket wäre ein weitergebbarer Link — auch zu einem
Bild, das eine Lehrkraft für **eine** Klasse hochgeladen hat.

### 8.3 Uploads

| Anforderung | Festlegung |
| --- | --- |
| Formate | JPEG, PNG, WebP; HEIC nur nach Konvertierung |
| SVG | **nicht** ungeprüft. SVG ist ausführbares Markup. |
| Prüfung | MIME-Typ **und** Dateisignatur, serverseitig; der Browser ist keine Instanz |
| lokale Auswahl | höchstens **10 MB** (E5). Nicht 5 MB: Smartphone-Fotos sind regelmäßig größer, und eine Grenze, die den Normalfall abweist, ist keine Grenze, sondern ein Fehler. |
| vor dem Hochladen, im Browser | auf höchstens **1600 px Breite** skalieren, Metadaten entfernen, auf eine vernünftige Zielgröße komprimieren |
| hochgeladen wird | **nur das verarbeitete Bild.** Das Original verlässt das Gerät nicht und wird nicht gespeichert. |
| serverseitig erneut | Dateisignatur, MIME-Typ, **Pixelmaße** und **Ergebnisgröße** |
| Größen | mehrere Breiten aus dem verarbeiteten Bild (400 / 800 / 1600 px) |
| EXIF | vollständig entfernen, **einschließlich Standort** |
| Ausschnitt | Fokuspunkt, den die Lehrkraft setzt; Standard Bildmitte. Er ist kein Feinschliff, sondern verhindert, dass ein Bild auf schmalen Geräten an der falschen Stelle beschnitten wird. |
| Ablage | Supabase Storage, eigener Bucket, **privat**; ausgeliefert über kurzlebige signierte Adressen (E6) |
| Offline-Export | komprimiert eingebettet |

**Heute existiert dafür nichts** — weder Bucket noch Migration noch Feld. Das
ist ein eigener Block (siehe `docs/umsetzungsplan-5b.md`).

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
| R9 | Zeitgesteuerte Veröffentlichung | braucht serverseitige Zeit | Sichtbarkeit aus `freigegeben && publish_at <= now()` in der Zugriffsregel; kein Zustand, der umgeschaltet wird (E8) |
| **R10** | **Der Portalaufwand wird unterschätzt** | Die Schritte 2 bis 6 existieren im Portal **gar nicht** (1.4). Wer „der Code ist da" mit „das Portal kann das" verwechselt, plant den größten Block von 5B weg. | Abschnitt 1.4 nennt je Schritt die Laufzeit; der Umsetzungsplan trägt den Portalbau als eigene Blöcke aus |
| R11 | Zeitzone der lernenden Person | Serie und Ruhetage sind ohne sie nicht berechenbar; es gibt sie heute nicht | eigener kleiner Schritt in 5B.5, vor der Serienlogik |
| R12 | Zwei Rollen für Newsreader | editoriale Überschrift und Materialstimme verwischen | zwei Token (`--font-display`, `--font-quote`), im Designsystem benannt und geprüft |

---

## 10. Umsetzung — siehe Umsetzungsplan

Die Reihenfolge der Blöcke, ihre Abhängigkeiten, ihr Status, die
Abnahmeschritte und die Commitgrenzen stehen in
**`docs/umsetzungsplan-5b.md`**.

Hier standen sie bis zum 01.10.2026 ebenfalls — und damit zweimal. **E11**
hat das entschieden: Dieses Dokument bleibt das Produktziel und die
verbindliche Quelle für die Entscheidungen E1 bis E23; der Umsetzungsplan
trägt den Weg dorthin und schreibt keine Entscheidung ab, sondern verweist
auf sie.

Zwei Listen, die dasselbe meinen, laufen auseinander — und zwar still: Beide
sehen danach weiter richtig aus, nur nicht mehr gleich.

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
- [ ] `--font-sans` und `--font-display` nennen **keine** Schrift, die nicht
      mitgeliefert wird — geprüft als Text in `tokens.css`.
- [ ] Jede Ansicht sieht in Chromium und WebKit gleich aus, ohne dass jemand
      eine Schrift installiert hat.

### Lernendenbereich

- [ ] „Heute" zeigt alle sieben Bereiche aus 4.1, jeder mit definiertem leerem
      Zustand.
- [ ] Ein neues Konto ohne jede Aktivität sieht eine vollständige, nicht
      kaputte Seite.
- [ ] „Üben" zeigt ausschließlich Karten, deren Voraussetzung erfüllt ist.
- [ ] „Mein Fortschritt" enthält keinen Wert über eine andere Person.
- [ ] Zehn bewertete Aufgaben lassen einen Tag zählen — **in jeder**
      Übungsform, geprüft je Form.
- [ ] Dieselben Ereignisse ein zweites Mal eingespielt ändern die Serie nicht.
- [ ] Zwei Ruhetage je Woche unterbrechen die Serie nicht; ein dritter schon —
      als Prüfung der Domainfunktion, ohne Oberfläche.
- [ ] Die Serie rechnet in der Zeitzone der Person, nicht in der des Servers
      und nicht in der des Geräts.
- [ ] Ein neues Konto hat **kein** Wochenziel, bis jemand eines wählt.
- [ ] Kein Element droht, mahnt oder zählt herunter.

### Lehrkraftbereich

- [ ] Am Schreibtisch **fünf** Navigationsziele: Start · Kurse · Lernpakete ·
      KI-Zugang · Einstellungen.
- [ ] Auf dem Telefon **vier**: Start · Kurse · Lernpakete · Einstellungen.
- [ ] `#/verwaltung` steht in **keiner** Navigation — in keiner Rolle und auf
      keiner Größe. Der Einstieg für Admins liegt innerhalb der Einstellungen.
- [ ] Eine Lehrkraft ohne Adminrolle bekommt kein Navigationsziel, das sie
      nicht öffnen darf.
- [ ] KI-Zugang ist auf dem Telefon innerhalb von Einstellungen erreichbar —
      geprüft als Weg, nicht als Behauptung.
- [ ] Keine Funktion und keine Berechtigung hängt an der Bildschirmbreite: Was
      am Schreibtisch geht, geht auf dem Telefon auch.
- [ ] Der Lernbereich ist für Lehrkräfte sichtbar als Vorschau gekennzeichnet.
- [ ] Kein Weg führt von einer Lehrkraftansicht zum Lernstand einer
      namentlichen Person — **auch kein aggregierter** (E7).
- [ ] Ein Paket lässt sich **im Portal** aus einem PDF, einem Foto, einer
      Tabelle oder einem Text erzeugen, ohne die kontofreie Anwendung zu
      öffnen.
- [ ] Ein Paket mit `publish_at` in der Zukunft ist für die Lerngruppe nicht
      abrufbar — geprüft über PostgREST, nicht nur in der Oberfläche.
- [ ] Dasselbe Paket ist nach Erreichen des Zeitpunkts abrufbar, **ohne** dass
      jemand oder etwas einen Zustand umgeschaltet hat.

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
- [ ] Eine Datei über 10 MB wird schon bei der Auswahl abgelehnt, mit einem
      Satz, der sagt warum.
- [ ] Was im Bucket ankommt, ist höchstens 1600 px breit — das Original ist
      nirgends gespeichert.
- [ ] Eine Adresse zu einem hochgeladenen Cover ist nach Ablauf der Signatur
      nicht mehr abrufbar.
- [ ] Ein Offline-Export mit Cover bleibt innerhalb des Größenbudgets.
- [ ] Wer ein Paket nicht sehen darf, kann sein Cover nicht abrufen.

### Portabilität

- [ ] Die portable Lerndatei funktioniert weiterhin unter `file://` und in
      Safari.
- [ ] `scripts/verify-portable.mjs` läuft grün.
- [ ] Keine externe Schriftanforderung im Bündel.

---

## 12. Entscheidungen E1 bis E10 — getroffen

Marc hat am 29.09.2026 entschieden. Die Entscheidungen sind für 5B verbindlich
und stehen hier in der Fassung, die gilt — nicht als Vorschlag.

### E1 — Wann ein Tag für die Lernserie zählt

Ein Tag zählt nach **zehn regulär bewerteten Aufgaben**.

- Es zählt **jede** Übungsform, nicht nur Karteikarten. Eine Serie, die nur
  eine Form anerkennt, erzieht zu dieser Form.
- Idempotenz ist Pflicht: Dasselbe gespeicherte Ereignis darf den Zähler nicht
  ein zweites Mal erhöhen. Wiederholt ein Gerät nach einem Abbruch dieselben
  Ereignisse, ist der Tag danach genauso gezählt wie vorher.
- Damit ist die Serie eine Eigenschaft der **Ereignisse**, nicht der
  Oberfläche, und gehört in die Domainlogik neben `progressEvents.ts`.

### E2 — Ruhetage

**Zwei automatische Ruhetage je Kalenderwoche.** Nicht ansammelbar, nicht
vorher zu wählen, nicht zu beantragen.

Maßgeblich ist die **Zeitzone der lernenden Person**. Für serverseitige
Entscheidungen gilt nicht die Gerätezeit: Eine falsch gestellte Uhr darf nicht
darüber entscheiden, ob eine Serie hält — dieselbe Überlegung wie bei `rev`
gegen Zeitstempel im Lernstand.

Daraus folgt eine Anforderung, die es heute nicht gibt: Die Zeitzone der
Person muss bekannt und gespeichert sein.

### E3 — Wochenziel

**Standardmäßig aus.** Beim Einstieg darf LexiFlow freundlich anbieten, eines
zu wählen; das Angebot ist einmalig und wegklickbar. Später jederzeit änderbar
und abschaltbar.

Ein voreingestelltes Ziel wäre eine Vorgabe, keine Wahl.

### E4 — Coverformat

**16 : 10**, als `--cover-ratio`. Der Fokuspunkt ist kein Feinschliff: Er
verhindert, dass ein Bild auf schmalen Geräten an der falschen Stelle
beschnitten wird.

### E5 — Bild-Uploads: Grenzen und Verarbeitung

Nicht 5 MB — normale Smartphone-Fotos sind regelmäßig größer, und eine Grenze,
die den Normalfall abweist, ist keine Grenze, sondern ein Fehler.

| Stufe | Regel |
| --- | --- |
| lokale Auswahl | höchstens **10 MB** |
| vor dem Hochladen, im Browser | skalieren auf höchstens **1600 px Breite**, Metadaten entfernen, auf eine vernünftige Zielgröße komprimieren |
| hochgeladen wird | **nur das verarbeitete Bild.** Das Original verlässt das Gerät nicht und wird nicht gespeichert. |
| serverseitig erneut | Dateisignatur, MIME-Typ, **Pixelmaße** und **Ergebnisgröße** |

Die serverseitige Prüfung wiederholt die Browserprüfung nicht aus Misstrauen
gegen die Lehrkraft, sondern weil der Browser keine Instanz ist: Was dort
geprüft wurde, kann auf dem Weg ersetzt worden sein.

### E6 — Drei Bildquellen, drei Speicherfälle

Sie sind **nicht** derselbe Fall und werden nicht so behandelt.

| Quelle | Ablage | Auslieferung |
| --- | --- | --- |
| **Upload der Lehrkraft** | Supabase Storage, **privat** | kurzlebige signierte Adressen |
| **eingebautes LexiFlow-Cover** | gebündeltes Asset | öffentlich, wie jedes Asset |
| **Unsplash** (später) | nichts Eigenes; externe Kennung | nach Unsplashs API-Regeln |

Ein öffentlich lesbarer Bucket wäre ein Link, den jede Person weitergeben
kann — auch zu einem Bild, das eine Lehrkraft für eine Klasse hochgeladen hat.

### E7 — Lernstände für Lehrkräfte

**In 5B keine.** Weder individuell noch aggregiert.

Eine spätere Änderung braucht eine eigene fachliche **und**
datenschutzrechtliche Entscheidung und ist keine Designfrage. Dieses Konzept
trifft sie nicht und bereitet sie auch nicht vor.

### E8 — Zeitgesteuerte Veröffentlichung

Ausgewertet **beim Abruf**, anhand der **serverseitigen Datenbankzeit**. Kein
Gerätezeitstempel, zunächst kein `pg_cron`.

Es wird kein Zustand umgeschaltet. Sichtbarkeit ergibt sich aus
Freigabestatus **und** `publish_at <= now()` — beides in der Zugriffsregel.
Ein Stand, der umgeschaltet werden muss, kann in einem falschen Zustand
hängen bleiben; ein Stand, der sich aus einem Vergleich ergibt, kann das
nicht.

Benachrichtigungen („dein Paket ist jetzt da") wären ein eigener Prozess und
sind nicht Teil davon.

### E9 — Navigation der Lernenden

Genau **vier** Ziele: Heute · Lernen · Üben · Mein Fortschritt. **Dieselben
vier auf beiden Größen** — die Verdichtung aus E23 betrifft nur Lehrkräfte.
Auf dem Telefon darf „Mein Fortschritt" zu „Fortschritt" verkürzt beschriftet
sein; das Ziel bleibt dasselbe.

### E10 — Schriften *(teilweise überholt durch E21)*

> **Stand 30.09.2026:** Die Streichung von Satoshi gilt weiter und ist in P1a
> umgesetzt. Die Festlegung von Newsreader als editoriale Displayschrift der
> Oberfläche ist durch **E21** ersetzt: Überschriften stehen in Manrope
> 700–800, Newsreader nur noch punktuell auf Titelbildern.

Satoshi ist **nicht** mehr die unbestimmte erste Wahl. Eine Schrift, die nur
auf manchen Geräten da ist, erzeugt ein Design, das sich nicht reproduzieren
lässt — und genau das stand bis P1a in `--font-sans` und `--font-display`.

Verbindlich, beide bereits lokal eingebettet:

| Rolle | Schrift |
| --- | --- |
| Oberfläche, Bedienelemente, Fließtext | **Manrope** |
| editoriale Überschriften | **Newsreader**, gezielt |

Satoshi ist in **P1a** entfernt worden: Es gab weder eine eindeutig
dokumentierte Lizenz noch eine mitgelieferte Datei. Manrope steht seither in
beiden Token an erster Stelle; `src/styles/neueToken.test.ts` prüft, dass die
ausgelieferte Schrift auch die erste ist.

Die Umschaltung von `--font-display` auf Newsreader ist **P1b** und wartet auf
die Freigabe der statischen Entwürfe: Sie änderte jeden bestehenden Bildschirm
sichtbar, bevor jemand den neuen gesehen hat. P1a hat dafür `--font-editorial`
angelegt — definiert und noch nirgends benutzt.

Newsreader trägt damit zwei Rollen — Beispielsätze im Lernmaterial und
editoriale Überschriften. Sie sind auseinanderzuhalten: `--font-quote` bleibt
die redaktionelle Stimme **im Material**, `--font-display` wird die Stimme
**der Oberfläche**. Zwei Token, eine Schriftdatei.

---

## 13. Was dieses Dokument ausdrücklich nicht sagt

- Es sagt nicht, dass eine dieser Ansichten existiert. Abschnitt 1 nennt je
  Punkt den Ist-Zustand.
- Es sagt nicht, dass 5A abgenommen ist. Stand 29.09.2026: elf Migrationen
  angewandt, beide Secrets gesetzt, **beide Edge Functions deployt und
  geprüft**, Konten, Kurs, Beitritt und der Entzug einer Mitgliedschaft im
  echten Stagingprojekt abgenommen. Offen sind Veröffentlichung, Lernstand
  über zwei Geräte, Archivierung, KI-Zugang, die Sicherheitsabnahme, Safari
  und Mobil sowie Merge und Pages. Der vollständige Stand steht in
  `inbetriebnahme-staging.md`, Abschnitt 0.5.
- Es sagt **nicht**, dass eine Funktion im Cloud-Portal nutzbar ist, nur weil
  ihr Code im Repository liegt. Abschnitt 1.4 nennt je Schritt die Laufzeit.
  Im Portal existieren die Schritte 2 bis 6 der Paketerstellung gar nicht.
- Es sagt **nicht**, dass das sichtbare Design dem Zielbild schon nahekommt,
  nur weil die Token und die Kontrastprüfung in Ordnung sind. Sie sind die
  Voraussetzung, nicht das Ergebnis.
- Es legt keinen Termin fest und keinen Aufwand.
- Es ersetzt keine Datenschutzfolgenabschätzung für Bild-Uploads. Die ist ein
  eigener Vorgang, bevor Block 5B.8 beginnt.
- Es trifft keine Entscheidung über Lernstände für Lehrkräfte. E7 sagt „in 5B
  nicht" — das ist ein Aufschub, kein Nein für immer, und die spätere
  Entscheidung braucht mehr als dieses Dokument.

---

## 14. Entscheidungen E19 bis E23 — die visuelle Richtung, neu gefasst

Marc hat am 30.09.2026 nach Ansicht der Variante B entschieden, E23 am
01.10.2026 nach Freigabe der Icon-Leiste. Diese Entscheidungen **ersetzen**
ältere Festlegungen dieses Dokuments; wo sie einander widersprechen, gilt was
hier steht.

### E19 — Die Oberflächenpalette wird ersetzt

Abschnitt 2 dieses Dokuments nannte Aubergine, Tomato und Parchment als
tragende Palette der Oberfläche und Abschnitt 2 „Farben — verbindlich und
unverändert" schrieb sie fest. **Diese Festlegung gilt nicht mehr.** Sie ist
nicht ergänzt, sondern ersetzt.

| Rolle | neu |
| --- | --- |
| Grundfläche | kühl-hell `#F6F7FB` |
| Tinte, Navigation, primäre Aktion | Anthrazit `#121318` |
| Flächenakzent, Titelbilder | Aurora: Violett `#CDBCFF`, Rosa `#FFC7E0`, Himmelblau `#BFE3FF`, Pfirsich `#FFD9BE` |
| Markenakzent | Aubergine `#2F092D`, Tomato `#FF2E2D` |

Was das im Einzelnen heißt:

- **Parchment ist kein Standardhintergrund mehr.** Es verschwindet als
  tragende Fläche.
- **Aubergine und Tomato bleiben Markenakzente** und Bestandteil der
  bestehenden farbigen Logovarianten. Tomato darf zusätzlich gezielt
  Fortschritt oder einzelne aktive Akzente tragen.
- **Die Aurorafarben tragen nie Text.** Sie sind Fläche, Tiefe und Stimmung.
  Ein Kontrast, der über einen Verlauf hinweg schwankt, ist keiner.
- Die semantischen Farben bleiben, was sie waren: Semantik, keine Marke. Ihre
  Werte sind an den neuen Grund angepasst und in
  `docs/mockups/portal-variante-b/system.html` nachgerechnet.

**Der Satz „Papier trägt, Farbe ereignet sich" aus Abschnitt 2 ist damit
hinfällig.** An seine Stelle tritt: *Der Grund tritt zurück, die Aurora gibt
Tiefe, die Tinte trägt.*

### E20 — Das Logo bleibt, wie es ist

Die Schwarz-Weiß-Fassung bleibt unverändert die Mastervariante. Aus ihr werden
**Formensprache, Überlagerung, Tiefe und Rundungen** abgeleitet — zwei
überlagerte, leicht perspektivische Flächen mit großen Radien.

Daraus folgt ausdrücklich **nicht** die Verpflichtung, Flächen wie das Logo zu
färben. Das Logo wird nicht umgefärbt; die Oberfläche ahmt es nicht nach, sie
lernt von ihm.

### E21 — Typografie, neu gefasst

E10 hatte Newsreader als editoriale Displayschrift der Oberfläche festgelegt.
**Das gilt nicht mehr.**

| Rolle | Schrift |
| --- | --- |
| Seiten- und UI-Überschriften | **Manrope 700–800** |
| Oberfläche, Bedienelemente, Fließtext | **Manrope 400–600** |
| Titelbilder der Lernpakete | **Newsreader**, punktuell — und nur dort |

Der Grund ist derselbe, aus dem E10 Satoshi gestrichen hat: Eine
Displayschrift, die überall steht, bestimmt den Charakter der Oberfläche.
Newsreader gibt ihr einen redaktionellen, gedruckten Ton; die Richtung, die
jetzt gilt, ist moderner und leichter, und die trägt eine kräftige Grotesk.

**Damit ist P1b in seiner bisherigen Fassung gegenstandslos.** Der Block hieß
„die Umschaltung von `--font-display` auf Newsreader" und wartete auf die
Freigabe der Entwürfe. Diese Freigabe ist erfolgt — und hat den Block
aufgehoben, nicht ausgelöst. Das in P1a angelegte Token `--font-editorial`
behält seinen Wert (Newsreader) und seinen Zweck, aber sein Einsatzort ist
jetzt das Titelbild und nicht die Überschrift.

### E22 — Kein Dunkelmodus in 5B

Ausdrücklich ausgeschlossen. Keine provisorische Invertierung, keine
ungeprüften Dark-Mode-Token.

Pastellverläufe lassen sich nicht invertieren: Was hell und zurückhaltend ist,
wird dunkel nicht automatisch dunkel und zurückhaltend, sondern schmutzig. Ein
Dunkelmodus ist ein eigener, vollständig geprüfter Block — dieselbe
Überlegung, die schon in `tokens.css` steht, jetzt als Entscheidung.

### E23 — Navigationsziele je Rolle und Größe

Die Icon-Leiste am Schreibtisch hat Platz, den die untere Navigation auf
390 px nicht hat. Daraus folgt eine Zahl je Rolle **und** Größe, nicht eine
Zahl je Rolle. Verbindlich:

<!-- navigation:anfang — maschinell geprüft von pruefe-variante.mjs, Reihenfolge verbindlich -->

| Rolle | Größe | Ziele |
| --- | --- | --- |
| Lehrkraft | Schreibtisch | `#/start` · `#/kurse` · `#/pakete` · `#/ki` · `#/einstellungen` |
| Lehrkraft | Telefon | `#/start` · `#/kurse` · `#/pakete` · `#/einstellungen` |
| Lernende | Schreibtisch | `#/heute` · `#/lernen` · `#/ueben` · `#/fortschritt` |
| Lernende | Telefon | `#/heute` · `#/lernen` · `#/ueben` · `#/fortschritt` |

<!-- navigation:ende -->

Beschriftet sind sie: Start · Kurse · Lernpakete · KI-Zugang · Einstellungen
(Lehrkraft, Schreibtisch), Start · Kurse · Lernpakete · Einstellungen
(Lehrkraft, Telefon), Heute · Lernen · Üben · Mein Fortschritt (Lernende,
beide Größen).

Zwei Dinge daran sind leicht misszuverstehen und deshalb ausdrücklich gesagt:

1. **`#/einstellungen` ist auf beiden Größen dasselbe Ziel und für jede
   Lehrkraft zugänglich.** Auf dem Telefon liegt dort zusätzlich der
   KI-Zugang; es gibt keinen zweiten KI-Bereich.

   **`#/einstellungen` ist nicht `#/verwaltung`.** Die Verwaltung ist die
   bestehende Fläche für Konten und Rollen, geschützt durch
   `RequireArea area="admin"` in `src/hosted/HostedApp.tsx`. Sie gehört
   **nicht** zur Rollennavigation: Eine normale Lehrkraft sieht sie nicht und
   darf sie nicht öffnen. Wer Admin ist, findet **innerhalb** der
   Einstellungen einen Einstieg dorthin — ein Weg, kein Navigationsziel.

   Diese Unterscheidung ist am 01.10.2026 nachgetragen worden. Die erste
   Fassung von E23 setzte „Verwaltung" und „Einstellungen" gleich. Das hätte
   zwei Fehler auf einmal erzeugt: tote Navigation für jede Lehrkraft ohne
   Adminrolle — oder, wenn man sie hätte funktionieren lassen wollen, eine
   aufgeweichte Autorisierung. Ein Navigationsziel, das für die Hälfte seiner
   Rolle ins Leere führt, ist kein Entwurfsdetail.
2. **Es ist eine Verdichtung, keine Beschneidung.** Rolle, Berechtigung und
   Funktionsumfang sind auf beiden Größen identisch. Wer das Gegenteil aus
   „vier statt fünf" liest, liest einen Fehler hinein, den es nicht gibt.

KI-Zugang ist am Schreibtisch ein eigenes Ziel, obwohl er einmal im Halbjahr
gebraucht wird. Das war in der alten Fassung das Argument, ihn wegzuräumen —
es galt für eine beschriftete Navigation mit vier Plätzen. Eine Icon-Leiste
mit fünf Symbolen kostet keine Breite; der Platz, den er beansprucht, ist
76 px mal 44 px, und die sind ohnehin da.

#### Die Tabelle beschreibt den Endzustand am Ende von 5B

Nicht den Zustand während der Umsetzung. Das ist keine Abschwächung, sondern
die einzige Lesart, die funktioniert: Von den neun Zielen oben existieren
heute drei als Route (`#/kurse`, `#/ki`, `#/lernen`). Fünf — `#/start`,
`#/einstellungen`, `#/heute`, `#/ueben`, `#/fortschritt` — müssen erst gebaut
werden, und `#/pakete` wird zunächst auf `#/material` weitergeleitet (E13).

Eine Navigation, die alle neun zeigt, würde heute überwiegend ins Leere
führen — und zwar unsichtbar, weil die Wildcard in `HostedApp.tsx` alles
Unbekannte still auf `/` umleitet. Ein totes Ziel sähe damit nicht kaputt
aus, sondern wie ein Sprung zur Startseite.

**Progressive Freischaltung.** Jedes Ziel trägt in der Portalkonfiguration
einen Umsetzungszustand:

| Zustand | Bedeutung |
| --- | --- |
| `vorhanden` | Die Route existiert mit Inhalt. Das Ziel wird gerendert. |
| `weiterleitung` | Eine echte, geprüfte Weiterleitung erreicht ihr Ziel. Das Ziel wird gerendert. |
| `geplant` | Noch nicht gebaut. Das Ziel wird **nicht** gerendert — nicht sichtbar, nicht fokussierbar, nicht im Accessibility-Baum. |

Vier Regeln dazu, und sie sind der Grund, warum das kein Schlupfloch ist:

1. Ein Ziel wird **ausschließlich in demselben Commit** von `geplant` auf
   `vorhanden` gesetzt, in dem seine Route und deren Inhalt entstehen.
2. `weiterleitung` ist nur zulässig, wenn die Weiterleitung implementiert
   **und** geprüft ist — geprüft heißt: aufgerufen, und das erwartete Ziel
   wurde erreicht.
3. Jedes gerenderte Ziel ist tatsächlich auflösbar. Nachgewiesen wird das
   gegen den echten Router, nicht per Textsuche: Das Ziel wird aufgerufen,
   und es wird belegt, dass weder die Wildcard noch die öffentliche
   Landungsseite gegriffen hat.
4. Der Umsetzungszustand gehört in die Portalkonfiguration, **nicht** in den
   allgemeinen Baustein. Die Hülle bekommt die sichtbaren Einträge als
   Eigenschaften gereicht und weiß nichts von Routen, Rollen, Anmeldung oder
   Cloud.

**Am Ende von 5B bestätigt eine eigene Abnahme, dass kein Ziel mehr
`geplant` ist.** Das ist der Punkt, an dem die Tabelle oben wieder
wörtlich gilt — fünf Ziele am Schreibtisch, vier auf dem Telefon.

Eine dauerhafte Prüfung, die *mindestens ein* geplantes Ziel verlangt, gibt
es ausdrücklich nicht: Sie würde am Ende rot, wenn alles fertig ist. Die
Invarianten sind stattdessen: jedes Ziel hat genau einen nachvollziehbaren
Zustand, jedes gerenderte Ziel löst auf, kein geplantes Ziel wird gerendert.

#### Die Entwürfe zeigen den Endzustand, die Hülle die freigeschaltete Teilmenge

`docs/mockups/portal-variante-b/` bildet alle Ziele aus E23 ab — sie sind der
Entwurf dessen, was am Ende dasteht, und sollen es bleiben. Die produktive
Hülle zeigt währenddessen weniger. Dass die Entwürfe und das laufende Portal
sich darin unterscheiden, ist deshalb **kein Befund**, sondern die
Arbeitsteilung zwischen Entwurf und Umsetzung.

Die Prüfung in `pruefe-variante.mjs` vergleicht aus demselben Grund die
Entwürfe gegen **diese Tabelle** und nicht gegen das Portal.

Die Gegenprüfung steht in `docs/mockups/portal-variante-b/pruefe-variante.mjs`
(Abschnitt 5): Sie liest die Tabelle oben aus diesem Dokument und vergleicht
sie mit den tatsächlichen Navigationen in den Entwürfen — getrennt nach
Schreibtisch (`.rail__nav`) und Telefon (`.unten`). Weichen Dokument und
Entwurf voneinander ab, ist die Prüfung rot. Dieselbe Prüfung hält fest, dass
die beiden Größen sich für Lernende **nicht** unterscheiden dürfen.

### Wo die Richtung zu sehen ist

`docs/mockups/portal-variante-b/` — **die künftige verbindliche Richtung.**
`docs/mockups/portal/` bleibt als Vergleich erhalten und beschreibt die
Fassung, die abgelöst wurde. Aufbau, UX, Navigation, Zustände,
Informationsarchitektur und alle Datenschutzregeln sind in beiden identisch;
unterschieden sind sie nur in der visuellen Ebene.

---

## 15. Entscheidungen E11 bis E18 — nachgetragen

### Woher der Wortlaut stammt

Am 29.09.2026 lag für den Designblock eine **Entscheidungsvorlage** vor: eine
Bestandsaufnahme aller Portalrouten mit ihrem Ist-Zustand, dazu ein Abschnitt
„Entscheidungen, die deine Freigabe brauchen" mit acht nummerierten Fragen
und je einem Vorschlag. Marc hat diese acht Fragen am selben Tag beantwortet;
seine Antworten sind E11 bis E18 und sind seitdem verbindlich.

Die Vorlage selbst ist **nie in dieses Projektverzeichnis gelangt** — sie
bestand nur im Arbeitsgespräch. Deshalb steht ihr Inhalt, soweit er
entschieden wurde, ab hier hier: im Konzept, versioniert, auffindbar.

**Zwei Antworten weichen vom damaligen Vorschlag ab** (E12 und E16). Das ist
unten vermerkt, weil der Vorschlag sonst leicht für die Entscheidung gehalten
wird — er war das Gegenteil davon.

### Was in diesem Abschnitt steht und was nicht

Jede Entscheidung erscheint in ihrem **ursprünglichen Wortlaut**. Alles, was
später daraus geworden ist — Ausgestaltungen, Details, Umsetzungen — steht
als solches gekennzeichnet darunter und **nicht** als die Entscheidung
selbst. Diese Trennung ist der Grund für diesen Nachtrag: In der ersten
Fassung vom 01.10.2026 waren vier spätere Erkenntnisse an die Stelle der
Entscheidungen getreten, die sie präzisieren sollten.

---

### E11 — Zwei Dokumente, zwei Aufgaben

**Das Portaldesign-Dokument ist der operative Umsetzungsplan;
`konzept-5b.md` bleibt das Produktziel.** Die doppelte Blockliste in
Abschnitt 10 wird durch einen Verweis auf den Umsetzungsplan ersetzt.

Der Grund: Zwei Listen, die dasselbe meinen und auseinanderlaufen, sind
schlimmer als eine ungenaue.

> **Erledigt am 01.10.2026.** Der Umsetzungsplan liegt als
> `docs/umsetzungsplan-5b.md` im Verzeichnis, Abschnitt 10 ist ein Verweis.
>
> Die Vorlage vom 29.09.2026, die E11 ursprünglich meinte, ist nie
> hierhergelangt und wurde **nicht** übernommen: Sie steht an mehreren
> Stellen gegen das, was seitdem entschieden wurde — bei E12 und E16 sogar
> gegen die Antwort, die auf ihre eigene Frage gegeben wurde. Ein überholter
> Plan als „operativer Plan" wäre dasselbe Problem noch einmal, nur mit
> vertauschten Rollen. Der neue Plan ist auf dem Stand von heute, E19 bis E23
> eingeschlossen.

### E12 — Eigenes Lehrkräfte-Dashboard

**Lehrkräfte bekommen ein eigenes Dashboard unter `#/start`.** Die Kursliste
bleibt ein eigener Bereich. **„Als Lernende ansehen"** liegt im Kopfbereich,
nicht in der Navigation.

> **Abweichung vom Vorschlag.** Die Vorlage schlug das Gegenteil vor — kein
> Dashboard, Einstieg über die Kursliste, mit der Begründung, eine
> Zwischenseite mit Zahlen wäre ein Klick ohne Inhalt. Marc hat anders
> entschieden. Die Sorge hinter dem Vorschlag ist dadurch nicht erledigt,
> sondern in die Ausgestaltung gewandert: Auf dem Dashboard stehen Zahlen
> über *eigene Inhalte*, nie über das Lernen anderer.

> **Später präzisiert durch E23.** Die endgültige Navigation — fünf Ziele am
> Schreibtisch, vier auf dem Telefon, `#/einstellungen` statt `#/verwaltung` —
> steht in Abschnitt 14.

**Dashboard-Ausgestaltung zu E12** *(spätere Festlegung, aus den Entwürfen
vom 30.09.2026; nicht Teil der ursprünglichen Entscheidung)*

„Offene Stellen und Prüfhinweise" heißt **ausschließlich**: Lücken und
Widersprüche in den **eigenen Paketentwürfen** — fehlende Übersetzungen,
doppelte Einträge, Abweichungen vom Wörterbuch. **Keine** Rückfragen von
Lernenden, **keine** Nachrichtenfunktion.

Das Dashboard trägt sieben Blöcke: Entwürfe mit offenen Stellen · Kurse ·
demnächst Veröffentlichtes · KI-Zugang · Schnellaktionen · Neues ·
Kopfbereich mit „Als Lernende ansehen". Dazu die ausdrückliche
Datenschutzzusage: keine individuellen Lernstände, keine Aktivitätszeiten,
keine Trefferquoten, keine Klassendurchschnitte, keine anonymisierten
Lernaggregate, keine Ranglisten. Die reine Mitgliederzahl eines Kurses ist
zulässig.

### E13 — `#/material` wird zu `#/pakete`

**Mit dauerhafter Weiterleitung.** „Material" ist ein Wort aus der
Werkzeugsicht; was dort liegt, sind Lernpakete.

> Die Weiterleitung ist **dauerhaft**, nicht übergangsweise: Adressen, die
> jemand gespeichert oder weitergegeben hat, sollen nicht ins Leere laufen.
> Die Regeln, unter denen ein weitergeleitetes Ziel in der Navigation
> erscheinen darf, stehen in E23.

### E14 — Die Übungsrunde blendet die Navigation aus

**Während einer laufenden Übungsrunde werden Seiten- und Bottom-Navigation
ausgeblendet.** Verlassen wird die Runde nur über **„Runde beenden"**, mit
Rückfrage.

**Spätere Ausgestaltung zu E14** *(aus den Entwürfen vom 30.09.2026)*

- **Jede abgeschlossene Antwort ist sofort gesichert.** Browser-Zurück,
  Neuladen und Schließen dürfen nicht still zu Datenverlust führen.
- Die Rückfrage erscheint **nur, wenn wirklich etwas verloren ginge**, und
  benennt genau *was*. Eine Rückfrage, die bei jedem Verlassen kommt, wird
  weggeklickt — und dann auch die eine, die zählt.
- **„Hierbleiben" führt zurück ins Antwortfeld**, nicht an den Seitenanfang.

### E15 — Die statischen Entwürfe

**Sieben eigenständige statische HTML-Entwürfe unter
`docs/mockups/portal/`, mit Übersicht.** Verbindlich dabei: Desktop **und**
Telefon, definierte Zustände, Tastaturfokus, **reale deutsche Texte** statt
Platzhalter, **beide** Rollennavigationen — und **keine Produktivänderung**.

Ansehbar, versioniert, ohne Produktivcode.

### E16 — Umsetzungsreihenfolge

**Lehrkräfte-Dashboard zuerst, danach der Lernendenbereich, danach der
übrige Lehrkraftbereich.**

> **Abweichung vom Vorschlag.** Die Vorlage schlug „Lernende vor Lehrkräften"
> vor, weil der Lernendenbereich im Portal am dünnsten ist und am häufigsten
> benutzt wird. Entschieden wurde die angepasste Reihenfolge oben — sie folgt
> E12: Das Dashboard ist die neue Entscheidung und wird deshalb zuerst
> greifbar gemacht.

**Umsetzung von E15 und E16** *(die konkreten sieben Blätter, Commit
`11fb4ce`; nicht die Definition von E16)*

| # | Blatt | Rolle | greift auf |
| --- | --- | --- | --- |
| 1 | Lehrkräfte-Dashboard | Lehrkraft | E12, E18 |
| 2 | Heute (Startseite Lernende) | Lernende | E1, E2, E3, E9 |
| 3 | Kursdetailseite | Lehrkraft | E7 |
| 4 | Lernpaketkarte und -detail | Lernende | E4, E17 |
| 5 | Übungsbereich | Lernende | E14 |
| 6 | Werkstatt | Lehrkraft | E5 |
| 7 | Navigation, beide Systeme | beide | E12, E13, E15 |

Jedes Blatt zeigt denselben Bildschirm auf Desktop 1440 × 900 und Telefon
390 × 844, in den Zuständen normal, ladend, leer, fehlerhaft und — wo es
etwas bedeutet — offline.

### E17 — Titelbilder vor der Werkstatt

**Der Titelbildbaustein kommt vor der Werkstatt**, nicht nach ihr: Die
Paketkarte braucht das Cover, und die Werkstatt braucht den Uploadschritt.

Zum Baustein gehören: **Uploadformate**, der **16 : 10-Zuschnitt** und ein
**Fokuspunkt**, ein **Pflicht-Alternativtext**, ein **Standardmotiv**,
**responsive Größen**, **Verarbeitung und Validierung**, ein **privater
Bucket** sowie **kurzlebige signierte URLs**.

**Externe Bildquellen sind nicht Teil von 5B.**

**Detail zu E17** *(spätere Festlegung, aus den Entwürfen vom 30.09.2026)*

Das Standardmotiv muss **auch ohne hochgeladenes Bild tragen**: eine gesetzte
Fläche mit Thema und Titel, kein grauer Kasten mit Symbol. Ein fehlendes Bild
hinterlässt kein Loch. In der Variante B sind das zwei überlagerte
Aurora-Flächen; hochgeladene Bilder bleiben echte Titelbilder.

### E18 — `global.css` wird schrittweise entschlackt

**Jeder umgestellte Baustein entfernt seine alten Regeln im selben Block**;
der Schlussblock räumt nur den Rest auf.

> Damit ist E18 die Entscheidung, die hinter dem Abnahmekriterium „mindestens
> 40 % kürzer" steht, und hinter dem Bericht `scripts/stilumfang.mjs`.
>
> **Ein Hinweis aus 5B.1, der zu E18 gehört:** `.app-nav`, `.bottom-nav` und
> die übrigen Hüllenklassen gehören `AppShell` **und** `PortalShell`
> gemeinsam. Solange nur eine der beiden umgestellt ist, kann ihr Block seine
> Altregeln **nicht** entfernen, ohne die andere zu zerstören. „Im selben
> Block" heißt deshalb genauer: im selben Block, sofern keine zweite Hülle
> dieselben Regeln noch braucht; sonst im Block, der die letzte von ihnen
> umstellt.

---

## 16. Entscheidung E24 — wann ein Wort schwierig ist

**Getroffen am 02.10.2026, bei der Abnahme von 5B.5.**

Abschnitt 4.3 nennt „Schwierige Wörter" als Ableitung aus `wrongCount` und
Fach, legt die Schwelle aber nicht fest. Hier steht sie.

### E24 — Zwei Fehler und ein niedriges Fach

Ein Wort steht in „Schwierige Wörter", wenn **beides** gilt:

- **mindestens zwei falsche Antworten** (`wrongCount >= 2`), und
- **aktuelles Leitner-Fach 1 oder 2** (`box <= 2`).

Gerechnet wird **je Richtung** und ausschließlich auf dem **eigenen**
Lernstand. Ein Wort kann also in Englisch → Deutsch schwierig sein und in
Deutsch → Englisch nicht; das ist kein Sonderfall, sondern der Normalfall beim
produktiven Üben.

**Ab Fach 3 verschwindet das Wort aus der Liste** — auch dann, wenn es früher
oft danebenging.

> **Warum beide Bedingungen und nicht eine.**
>
> Nur `wrongCount`: Ein Wort, das vor Wochen zweimal danebenging und
> inzwischen in Fach 5 sitzt, ist gelernt. Es weiter als schwierig zu führen,
> hielte eine Niederlage fest, die vorbei ist — und eine Liste, die nur
> wächst, liest irgendwann niemand mehr.
>
> Nur das Fach: Jedes frisch begonnene Wort steht in Fach 1. „Neu" ist nicht
> „schwierig"; diese Liste wäre am ersten Tag am längsten und am Ende leer.
>
> **Warum zwei Fehler und nicht einer.** Ein einzelner Fehler ist oft ein
> Vertipper oder eine Unachtsamkeit. Zwei sind ein Muster.
>
> **Warum das Fach und nicht ein eigener Zähler.** Das Fach ist die Größe, die
> ohnehin entscheidet, wann ein Wort wieder drankommt. Ein zweiter Begriff von
> „sitzt" wäre ein zweiter Ort, an dem dieselbe Frage anders beantwortet wird.

**Keine Rangliste, kein Vergleich, keine Strafe.** Die Liste ist ein
Übungseinstieg, keine Bewertung — und sie ist für Lehrkräfte nicht einsehbar,
wie jeder Lernstand (Abschnitt 4.4).

**Umgesetzt** in `src/domain/schwierigeWoerter.ts` (`SCHWIERIG_AB_FEHLERN`,
`SCHWIERIG_BIS_FACH`, `istSchwierig`), zuerst benutzt von 5B.5 (`5ce0363`).
Eine Änderung der Schwelle ist eine Änderung dieser Entscheidung, nicht eine
Änderung einer Zahl.

---

## 17. Entscheidungen E25 bis E28 — die Grundlage von „Heute" und „Fortschritt"

**Getroffen am 02.10.2026**, nach der Machbarkeitsprüfung in
`docs/datenlage-heute-fortschritt.md` (`afb16f9`).

### E25 — Keine Lernzeit

**„Lernzeit" wird weder angezeigt noch geschätzt**, solange sie nicht
verlässlich gemessen wird.

Was stattdessen genügt: die Zahl bearbeiteter Aufgaben, Lerntage und der
Lernstand selbst.

> **Warum.** Es gibt kein Sitzungsende — weder in der Datenbank noch im
> Quelltext. Die beiden denkbaren Ersatzgrößen messen etwas anderes: Die
> Seitenöffnungszeit misst, wie lange ein Tab offen war; der Abstand zwischen
> zwei Antworten misst den Abstand zwischen zwei **Uploads**. Eine Zahl, die
> nach Messung aussieht und keine ist, ist schlechter als keine Zahl.

Damit entfällt „Lernzeit" aus 4.4 und aus dem Block 5B.6.

### E26 — Das Wochenziel zählt Lerntage

**Einheit: Lerntage pro Woche, zulässig 1 bis 7.** Standardmäßig **aus**
(`null`, E3). **Kein Minutenziel und kein Aufgabenziel.**

> **Warum Lerntage.** Minuten scheiden mit E25 aus. Ein Aufgabenziel stellte
> eine zweite Schwelle neben die zehn aus E1 — zwei Zahlen, die beide „genug
> für heute" bedeuten, erklären sich gegenseitig weg. Lerntage benutzen genau
> die Größe, die E1 und E2 ohnehin definieren: Ein Tag zählt nach zehn
> bewerteten Aufgaben, und die Ruhetage aus E2 passen ohne eine weitere Regel
> dazu.

### E27 — Die Zeitzone wird bestätigt, nie stillschweigend gespeichert

- `time_zone` ist zunächst **`null`** — es gibt **keine** feste Voreinstellung
  in der Datenbank.
- Der Browser **darf** über `Intl.DateTimeFormat().resolvedOptions().timeZone`
  einen **Vorschlag** liefern.
- Gespeichert wird **erst nach ausdrücklicher Bestätigung** durch die lernende
  Person.
- Ein später erkanntes anderes Gerät oder eine andere Zeitzone überschreibt
  den gespeicherten Wert **niemals automatisch**.
- Solange keine Zeitzone bestätigt ist, werden **Serie und lokale
  Wochenberechnung nicht als belastbare Zahl angezeigt**. Stattdessen
  erscheint eine ruhige, **nicht blockierende** Aufforderung zur Bestätigung.
- Die Gerätezeit entscheidet weiterhin **nie** selbst über den Erhalt einer
  Serie.

> **Warum keine stille Übernahme.** Ein automatisch gespeicherter Wert sieht
> aus wie eine Angabe der Person und ist keine. Wer im Zug mit einem Telefon
> in einer anderen Zeitzone lernt, bekäme eine Tagesgrenze zugewiesen, die
> niemand gewählt hat — und sie stünde danach als Wahrheit in der Datenbank.
> Ein Vorschlag, der bestätigt werden muss, kostet einmal einen Klick und ist
> danach überprüfbar.
>
> **Warum keine Voreinstellung in der Datenbank.** `Europe/Berlin` wäre für
> fast alle richtig und für manche falsch — und man sähe den beiden Fällen
> nicht an, welcher vorliegt. `null` sagt wahrheitsgemäß „nicht bestätigt".

**Wo das sichtbar wird:** Die Bestätigung gehört in **5B.4** („Heute"), weil
die Serie dort zuerst gezeigt wird. Das spätere **Bearbeiten** von Zeitzone
und Wochenziel gehört spätestens in **5B.6** („Mein Fortschritt"). **5B.4a**
baut nur Datenmodell, Datenzugriff und Prüfungen — keinen Bildschirm.

### E28 — Der Zeitpunkt einer Lernaktivität ist der Serverzeitpunkt

Für Serie und Lerntag gilt **ausschließlich** `progress_events.recorded_at` —
der Zeitpunkt, zu dem der Server die Antwort angenommen hat.

**Der Zielkonflikt, ausdrücklich:** Offline hochgeladene Aktivität zählt zum
Tag der **Synchronisierung**, nicht rückwirkend zum Tag der Antwort. Wer
abends offline übt und am nächsten Morgen synchronisiert, bekommt den
nächsten Tag gutgeschrieben.

> **Warum trotzdem so.** Die Alternative wäre `occurredAt` vom Gerät — und
> damit entschiede eine Uhr, die niemand überprüfen kann, über den Erhalt
> einer Serie. Eine Serie, die sich durch Zurückstellen der Uhr retten lässt,
> ist keine.
>
> Der Preis ist benannt und wird **nicht verdeckt**: keine heimliche
> Verwendung von Clientzeit, keine Mischform, keine „Kulanzstunde". Wenn die
> Anzeige später erklärt, warum ein Tag fehlt, dann mit diesem Satz.
