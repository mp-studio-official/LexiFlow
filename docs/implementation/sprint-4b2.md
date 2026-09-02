# Sprint 4B.2 – Arbeitsstand

Diese Datei ist der **verbindliche Fortsetzungsstand**. Wer die Arbeit
übernimmt – nach einer Kontextverdichtung, in einer neuen Sitzung, in einem
Jahr –, liest hier, was fertig ist, was als Nächstes kommt und welche
Entscheidungen schon gefallen sind. Sie wird nach jeder Phase fortgeschrieben.

## Rahmen

| | |
| --- | --- |
| Projektordner | `/Users/mparat/MP Studio/Development/LexiFlow` |
| Branch | `sprint/4b2-authoring-and-topic-studio` |
| Ausgangspunkt | `main` = `20d5338` (4B.1 per Fast-Forward übernommen) |
| Remote | keines |
| Tags | keine neuen |
| Logo-Arbeitsdateien | `Logo/`, über `.git/info/exclude` von Git ausgenommen |

Verbindliche Palette: Aubergine `#2F092D`, Tomato `#FF2E2D`,
Parchment `#F8EFE3`. Orange ist mit 4B.1c entfallen.

## Phasenübersicht

| Phase | Inhalt | Stand | Commit |
| --- | --- | --- | --- |
| 0 | 4B.1 übernehmen, Branch anlegen | ✅ | – (nur Branchoperationen) |
| 1 | Strukturierte Vokabeln, eindeutige Antworttrennung | ✅ | siehe unten |
| 2 | Strukturierte Quellen und lokaler PDF-Import | **in Arbeit** – Parser fertig, PDF-Kern fertig, Oberfläche offen | |
| 3 | Empfehlungen kompakt und modern | offen | |
| 4 | „Prüfen & Speichern“ und direkte Weitergabe | offen | |
| 5 | Materialverwaltung für mehrere Pakete | offen | |
| 6 | „Zu einem Thema“ offline in Safari | offen | |
| 7 | Inklusives und konsistentes Wording | offen | |

---

## Phase 0 – 4B.1 übernommen

`main` wurde mit `git merge --ff-only sprint/4b1-recommendation-workflow` von
`75447a6` auf `20d5338` gehoben; kein Rebase, kein Squash, kein Merge-Commit.
Die Historie ist linear (`git rev-list --merges` seit `75447a6` = 0).

**Stolperstelle für die nächste Sitzung.** Der Projektordner ist über die
Gerätebrücke gemountet. Verliert die Sitzung ihr Löschrecht für diesen Ordner
– das passiert beim Neuverbinden der Brücke –, kann Git seine `.git/index`
nicht mehr ersetzen: Jeder `checkout`, `reset` und `commit` bricht ab und
lässt eine `.git/index.lock` liegen. Erkennungszeichen:

```
warning: unable to unlink '…/.git/index.lock': Operation not permitted
fatal: Could not reset index file to revision '…'.
```

Abhilfe: Löschrecht für den Ordner neu anfragen, dann
`rm -f .git/index.lock`. Ein `mv .git/index.lock …` funktioniert auch ohne
Löschrecht, hilft aber nur einmal – der nächste Git-Aufruf legt die Sperre
neu an.

---

## Phase 1 – Strukturierte Vokabeln und eindeutige Antworttrennung

### 1.1 Kommas zerstören keine Antworten mehr

**Der Fehler.** `splitMeanings()` trennte an `;`, `,` **und** ` / `. Damit
wurde „einen Begriff, eine Redewendung prägen“ beim Speichern in zwei
Antworten zerlegt; die Karte zeigte nur noch „einen Begriff“. Die zweite
Hälfte des Satzes war weg, ohne dass irgendwo etwas davon stand.

**Die neue Regel.** Nur das Semikolon trennt. Ein Komma gehört mitten in eine
deutsche Bedeutung; ein Schrägstrich verbindet Wortformen (`der/die
Angestellte`, `a phrase / term`) und trennt sie nicht. Beides ist damit
**Inhalt**.

`src/domain/normalize.ts` führt jetzt drei Funktionen statt einer:

| Funktion | trennt an | wofür |
| --- | --- | --- |
| `splitAnswers` | nur `;` | `germanAnswers`, `acceptedEnglishAnswers` |
| `splitList` | `,` und `;` | Themen-Tags und andere Aufzählungen |
| `formatAnswers` | – | die sichtbare Kurzschreibweise `a; b; c` |

Die Trennung in zwei Splitter ist der Kern: Ein Tag enthält kein Komma, eine
Antwort sehr wohl. Eine Funktion für beides musste einen der Fälle verlieren.

Intern bleibt eine Antwortliste **immer** ein Array. Das Semikolon ist nur die
Schreibweise in Eingabefeldern und in der Anzeige. `checkAnswer` prüft
weiterhin jede Antwort einzeln und nie einen zusammengesetzten String;
zusätzlich zerlegt es eine Eingabe der Lernenden am Semikolon (vorher am
Komma), damit „von der Karte abschreiben“ automatisch das Richtige trifft.

Angepasst: `draft.ts`, `enrichment.ts`, `sentenceAssist.ts`, `topicDraft.ts`,
`suggestions.ts`, `answerCheck.ts`, `CardStudyPage`, `VocabBrowsePage`,
`ExerciseView`, `SessionPage` und der Hinweistext im Importassistenten.

**Beispieldatei.** `examples/vokabeln-beispiel.csv` ist semikolongetrennt –
dort kollidiert das Spaltentrennzeichen mit dem neuen Antworttrennzeichen.
Gelöst durch Anführungszeichen um die Zelle (`"überfüllt; voll"`), was der
CSV-Parser seit jeher beherrscht. Neu darin: eine Zeile `to coin a phrase`
mit der Antwort `einen Begriff, eine Redewendung prägen` als dauerhafte
Gegenprobe.

### 1.2 Grammatisch vollständige Lernformen

`english` **ist** die Lernform – es gibt kein zweites, dekoratives Feld
daneben. Bestehende Einträge tragen dort weiterhin ein schlichtes `crowded`
und bleiben gültig. Neu daneben, alle optional:

| Feld | Beispiel | Wozu |
| --- | --- | --- |
| `lemma` | `accuse` | Nachschlagen, Suche, Dublettenprüfung |
| `complementPattern` | `sb. of sth.` | die **belegte** Rektion |
| `grammaticalNumber` | `plural` | `restraints (pl.)` |
| `lexicalGroupId` | `g1` | verbindet verwandte Formen |

`src/domain/learningForm.ts` baut Lernformen aus diesen Teilen und liest sie
wieder auseinander:

- `buildLearningForm` setzt `to` vor ein Verb im Infinitiv, lässt Phrasal
  Verbs vollständig (`to single out`, nie `to single`), setzt kein zweites
  `to` und hängt ein Muster nur an, wenn eines übergeben wurde.
- `lemmaFromLearningForm` entfernt `to`, Zahlmarker und Platzhalter – schneidet
  aber **mitten in einer Wendung nichts ab**: `to coin a phrase` ergibt
  `coin a phrase`, nicht `coin`. Wo die Vokabel aufhört, kann diese Funktion
  nicht wissen.
- `impliedAnswers` erzeugt ausschließlich **Verkürzungen** der vorhandenen
  Form (`to accuse sb. of sth.` → `to accuse`, `accuse`). Nichts wird
  hinzuerfunden.

**Die Grenze, die dieses Modul zieht:** Es gibt keine Tabelle „welches Verb
hat welche Rektion“. Eine solche wäre nach zwanzig Einträgen unvollständig und
nach fünfzig falsch. `sb.`, `sth.` und Präpositionen kommen ausschließlich aus
einem übergebenen Muster – aus Quelle, Wörterbuch oder eindeutigem Kontext.

Die Verkürzungen zählen jetzt auch beim Abfragen: `solutionsOf` in
`exercises.ts` und `answersFor` in `studyView.ts` nehmen `impliedAnswers`
mit auf.

### 1.3 Verbundene Wortarten

Jede Lernform bleibt ein **eigener Eintrag** mit eigener Wortart, eigener
Bedeutung und eigenem Lernstand. `lexicalGroupId` ist eine Anzeigebeziehung,
kein gemeinsamer Lerngegenstand – im Test muss erkennbar bleiben, welche
konkrete Form gefragt ist.

`groupRelatedForms` stellt Formen derselben Gruppe zusammen und **erfindet
keine Gruppe** für Einträge ohne eine, auch wenn sie zufällig dasselbe Lemma
teilen. Ob zwei Formen zusammengehören, entscheidet die Lehrkraft beim
Erstellen, nicht eine Ähnlichkeitsrechnung beim Anzeigen.

### 1.4 Migration

Austauschformat `VOCABPACK_FORMAT_VERSION` 1 → **2**.

Die Migration `v1ToV2` hebt **nur die Versionsnummer** an und rührt keinen
Wert an. Das ist Absicht: Man könnte hier aus `to apologise` ein Lemma
`apologise` ableiten oder aus `restraints` einen Plural machen – beides wäre
geraten. Ein abgeleitetes Lemma ist eine Vermutung, ein gespeichertes eine
Auskunft, und der Unterschied verschwände in dem Moment, in dem die Migration
ihn wegschreibt. Wo ein Lemma gebraucht wird, leitet `lemmaOf()` es zur
Laufzeit ab – sichtbar als das, was es ist.

**IndexedDB braucht keine neue Schemaversion.** Alle neuen Felder sind
optional, Dexie speichert ganze Objekte, und die Lernstandsschlüssel
(`packId::entryId::direction`) sind unverändert. Ein Test in
`migration.test.ts` hält fest, dass ein vor 4B.2 gespeicherter Eintrag
unverändert gelesen wird **und** seinen Lernstand behält, auch nachdem seine
Lernform auf `to accuse sb. of sth.` geändert wurde.

Die Portabilitätstests prüfen die Formatversion jetzt gegen
`VOCABPACK_FORMAT_VERSION` statt gegen eine feste `1` – sie müssen bei der
nächsten Formatänderung nicht wieder angefasst werden.

### 1.5 Nebenbei behoben

`ImportWizardPage.text.test.tsx > „ist mit der Tastatur bedienbar“` war unter
voller Parallellast wiederholt rot (Timeout, nicht Inhalt). Der Test prüfte
damit die Auslastung des Rechners statt der Tastaturbedienung; er wartet
jetzt mit `findBy…`/`waitFor` auf den Zustandswechsel.

### Verifikation Phase 1

| | |
| --- | --- |
| `npm run typecheck` | grün |
| `npm run test` | **1510** grün / 85 Dateien (vorher 1478 / 84) |
| `npm run build` | grün |

Neu: `learningForm.test.ts` (18), Migrations- und Rundlauftests in
`vocabpack.test.ts` (+5), IndexedDB-Verträglichkeit in `migration.test.ts`
(+2), Antworttrennung in `normalize.test.ts` (+6) und `answerCheck.test.ts`
(+1), Valenzverkürzung in `exercises.test.ts` (+1).

### Was Phase 1 **nicht** getan hat

- Die Oberfläche zeigt die neuen Felder noch nicht an. `DraftRow` trägt sie,
  `draftsToEntries` schreibt sie, aber Editor und Empfehlungskarten bekommen
  ihre Eingabefelder erst in Phase 3 und 4.
- Bestehende Pakete, in denen eine Antwort schon **falsch** am Komma zerlegt
  wurde, werden nicht geheilt. Das wäre Raten: Aus zwei Arraywerten lässt sich
  nicht rekonstruieren, ob dort einmal ein Komma stand. Die neue Regel
  verhindert weiteren Schaden; vorhandene Pakete bleiben, wie sie sind.

---

## Phase 2 – PDF-Import und gegliederte Listen

### 2.0 Die PDF-Abhängigkeit – Entscheidung, Lizenz, Größengate

**`pdfjs-dist` 4.10.38, Legacy-Build, Apache-2.0.** Die Lizenz erlaubt die
Weitergabe im eigenen Produkt ohne Copyleft. Attribution und Änderungsvermerk
liegen in `third_party/pdfjs/NOTICE.md`, der unveränderte Lizenztext daneben in
`third_party/pdfjs/LICENSE`; in der Anwendung steht beides unter **Daten &
Datenschutz** → „Mitgelieferte fremde Bestandteile“ (`src/ui/thirdParty.ts`).
Das npm-Paket enthält selbst **keine** `NOTICE`-Datei – Abschnitt 4 (d) greift
also nicht; 4 (a) und 4 (b) sind mit Lizenzkopie und Änderungsabschnitt
erfüllt. Der ausgelieferte Code ist unverändert; geändert ist nur, *wie* er
aufgerufen wird.

Drei Dinge mussten gelöst werden, und alle drei sind der Grund für die
Versionswahl:

**Kein externer Worker.** pdf.js lagert die Arbeit normalerweise in eine
zweite Datei aus. Ohne echten Worker fällt es auf einen „fake worker“ zurück –
und der holt sich seinen Code zur **Laufzeit** über
`await import(GlobalWorkerOptions.workerSrc)`. Unter `file://` gäbe es diese
URL nicht; die Funktion schlüge erst dann fehl, wenn jemand eine PDF auswählt.
pdf.js sieht dafür einen Ausweg vor: Steht der Handler unter
`globalThis.pdfjsWorker`, wird nichts nachgeladen. Genau das tut `pdfText.ts` –
der Workercode wird mitgebündelt.

**Browserreichweite.** pdf.js 6 benutzt `Promise.try`, das es in Safari erst ab
18.2 gibt, und greift beim **Auswerten des Moduls** darauf zu – also vor jeder
Stelle, an der man das abfangen könnte. Verwendet wird deshalb der
**Legacy-Build** der 4er-Reihe plus eine eigene `Promise.try`-Ergänzung.

**Die Ergänzung selbst.** Zwei Zusagen, beide geprüft:

| Zusage | Prüfung |
| --- | --- |
| steht **vor** dem Laden von pdf.js | `ensurePromiseTry()` synchron vor den `import()`-Ausdrücken; Wirkungstest „steht bereit, bevor pdf.js geladen wird“ |
| überschreibt eine native Implementierung **nicht** | `??=`; Test „überschreibt eine vorhandene Implementierung nicht“ |

Der Fehler, den das gekostet hat: Die erste Fassung rief nur `fn()` auf. pdf.js
ruft `Promise.try(handler, docParams)` – der Handler bekam `undefined` und brach
mit „Cannot destructure property 'docId'“ ab, und zwar erst beim **zweiten**
Dokument, weil das erste noch mit der nativen Fassung lief. Seitdem gibt es zwei
Tests dafür: einen auf die Argumentweitergabe und einen, der zwei Dokumente
nacheinander liest (`pdfText.test.ts`, und derselbe Fall als E2E-Fall in
`e2e-portable/pdf-import.spec.ts`).

**Größengate: bestanden.**

| Datei | vor 4B.2 | jetzt | Grenze |
| --- | --- | --- | --- |
| `LexiFlow-Lehrkraft.html` | 7617,4 KiB | **9320,2 KiB (9,10 MiB)** | 12 MiB |
| `LexiFlow-Schuelerlaufzeit.html` | 628,6 KiB | **629,0 KiB** | 700 KiB |

Die Schülerdatei wächst um **415 Byte** – und zwar **nicht** durch den
PDF-Import: In ihr steht keine Zeile pdf.js (geprüft in
`scripts/verify-portable.mjs` und `src/portable/pdfOffline.artifact.test.ts` auf
die Marker `WorkerMessageHandler`, `pdfjsWorker`, `InvalidPDFException`). Die
415 Byte stammen aus Phase 1: den neuen optionalen Schemafeldern (`lemma`,
`complementPattern`, `grammaticalNumber`, `lexicalGroupId`) und der
Lernformlogik, die Karten und Übungen auch in der Schülerdatei brauchen. Damit
bleibt die Regel gewahrt, dass Lern-Dateien keine Lehrkraftbibliotheken tragen.

Beide Schranken sind seit 4B.2 **im Skript** verankert, nicht nur im Bericht:
`verify-portable.mjs` bricht ab, wenn die Lehrkraftdatei 12 MiB oder die
Schülerlaufzeit 700 KiB erreicht.

### 2.1 Der strukturierte Parser

`src/import/structuredList.ts`. Die Referenzliste aus dem Auftrag wird
**vollständig** gelesen; `structuredList.test.ts` führt sie wortgleich als
Prüfstein.

| Eingabe | Ergebnis |
| --- | --- |
| `• to coin a phrase / term` | Verb, Schrägstrich bleibt Teil der Vokabel |
| `context/example: „…coined the phrase…“` | Beispielsatz, Anführungszeichen ab |
| `translation: einen Begriff, eine Redewendung prägen` | **eine** Antwort |
| `enduring` | eine Vokabel, keine geratene Wortart |
| `restraints (pl.)` | Substantiv, `grammaticalNumber: plural` |
| `attainability (n.) / attainable (adj.)` | **zwei** Einträge, gemeinsame Gruppe |
| `endeavor (n./v.)` | `endeavor` (n.) und `to endeavor` (v.), gemeinsame Gruppe |
| `to single out sb./sth.` | Verb, Lemma `single out`, Muster `sb./sth.` |
| `Manifest Destiny` | Eigenname, unverändert, kein `to` |
| `to surmount obstacles` | eine Vokabel – **nicht** zu `to surmount` gekürzt |
| `ethnic stock` | eine Vokabel |

Der Schrägstrich ist die interessante Stelle: Er trennt **nur**, wenn jede
Seite ihre eigene Wortartklammer trägt. `to coin a phrase / term` und
`sb./sth.` bleiben eine Vokabel, weil eine falsch zerlegte Wendung eine
erfundene Vokabel wäre.

Was der Parser nicht versteht, markiert er sichtbar: Ein unbekannter
Klammerzusatz (`(irreg.)`) wird zu einem „Bitte prüfen“ an der Entwurfszeile,
eine Feldzeile ohne Vokabel darüber landet in `unassigned` statt im Papierkorb.

**Nachgeschärft beim Verdrahten:** Aus einem PDF-Anhang fallen Kolumnentitel
und Seitenzahlen mit heraus („Unit 7 – Vokabelanhang“, „Seite 143“). Sie wurden
zunächst zu Vokabeln mit leerer Übersetzung – also genau zu dem Müll, den die
Vorschau der Lehrkraft gerade abnehmen sollte. Die Regel jetzt: Eine Kopfzeile
**ohne** Aufzählungszeichen, **ohne** Wortartklammer und **ohne** ein einziges
Feld darunter wird keine Vokabel, sondern geht nach `unassigned` – und steht
damit sichtbar in der Prüfansicht. Weggeräumt, nicht unterschlagen. Vier Tests
in `structuredList.test.ts` halten die drei Gegenfälle fest (Aufzählungszeichen,
Wortartklammer, Feld darunter).

### 2.2 PDF-Import

`src/import/pdfText.ts` liest auswählbaren Text, Seite für Seite, mit
Fortschritt und Abbruch (`AbortSignal`). Grenzen: 25 MB, 60 Seiten.

**Zeilen aus Textstücken.** pdf.js liefert Stücke mit Position, keine Zeilen.
Gruppiert wird nach der **Grundlinie** (`transform[5]`, auf ganze Punkte
gerundet), innerhalb der Zeile nach `x` sortiert. Ob ein Leerzeichen
dazwischengehört, entscheidet die **Lücke**: Viele PDF-Erzeuger schreiben
Wortzwischenräume nicht als Leerzeichen, sondern setzen das nächste Stück weiter
rechts ab – aus „erste Zeile“ würde sonst „ersteZeile“; andere schreiben das
Leerzeichen mit, dort darf keines dazukommen. Regel: Leerzeichen, wenn zwischen
`x + width` und dem nächsten `x` mehr als ein Viertel der Zeilenhöhe liegt.

Kein OCR und keine Behauptung davon: Eine Seite ohne auswählbaren Text ergibt
`kind: 'no-text'` und den Satz aus dem Auftrag.

**Die Oberfläche** (`src/routes/teacher/PdfSourcePanel.tsx`, lazy geladen):
Ablagefläche mit echtem Knopf, Fortschritt je Seite, „Abbrechen“, und dazwischen
eine **bearbeitbare Vorschau**. Die ist kein Zierrat: Extrahierter PDF-Text
enthält immer Kopfzeilen, Seitenzahlen und Fußnoten, und ein Textfeld räumt die
in zehn Sekunden weg, wo zwanzig Entwurfszeilen eine Viertelstunde kosten.

### 2.3 Der Beleg: keine Laufzeitdateien, kein Netz

Drei Ebenen, weil keine allein genügt:

| Ebene | Datei | Aussage |
| --- | --- | --- |
| Quelltext | `src/import/pdfText.test.ts` | 20 Tests: Polyfill, Zeilenbildung, echte PDF, gescannte PDF, Grenzen, Abbruch |
| gebaute Datei | `src/portable/pdfOffline.artifact.test.ts` | pdf.js **und** Workercode sind eingebettet; `workerSrc`, `cMapUrl`, `standardFontDataUrl` zeigen nirgendwohin; Lizenzangabe steckt in der Datei; 12-MiB-Schranke; Schülerdatei unberührt |
| laufender Browser | `e2e-portable/pdf-import.spec.ts` | die gebaute Datei über `file://`, **jede** Nicht-`file:`/`data:`/`blob:`-Anfrage per `route.abort('failed')` blockiert – und der Import läuft trotzdem durch |

Der dritte ist der eigentliche Beleg: Die ersten beiden können nur sagen „wir
sehen keinen Weg nach draußen“. Erst dort wird die Datei wirklich benutzt, und
zwar mit gekapptem Netz. Fünf Fälle: Text-PDF lesen, bis ins gespeicherte Paket
führen, gescannte PDF ablehnen, **zweimal hintereinander** lesen (der
`Promise.try`-Fall), Lizenzangabe sichtbar.

### 2.4 Was Phase 2 **nicht** belegt

**Safari ist nicht automatisiert geprüft.** In dieser Umgebung läuft nur
Chromium. Was für Safari getan wurde, ist die Vorsorge – Legacy-Build,
`Promise.try`-Ergänzung, kein Worker, keine Blob-URL –, nicht der Nachweis.
`playwright.portable.config.ts` nimmt WebKit mit, wenn `LEXIFLOW_WEBKIT=1`
gesetzt und WebKit installiert ist; auch das wäre eine technische Annäherung,
kein Safari. Der eine Handgriff, der bleibt, steht im Bericht.

### Verifikation Phase 2

| Schritt | Ergebnis |
| --- | --- |
| `npm run typecheck` | grün |
| `npm run test` | **1564** grün / 88 Dateien |
| `npm run build` | grün |
| `npm run build:portable` | grün, 9320,2 KiB / 629,0 KiB |
| `npm run verify:portable` | grün, 25 Prüfungen |
| `npm run e2e` | **103** grün (Chromium) |
| `npm run e2e:portable` | **19** grün (Chromium, `file://`) |

Nebenbei behoben: Vier E2E-Dateien prüften `formatVersion === 1` als Zahl und
wurden von der Migration auf Version 2 aus Phase 1 rot. Sie lesen jetzt
`VOCABPACK_FORMAT_VERSION` – dieselbe Korrektur wie in den Portabilitätstests,
nur eine Ebene höher.

---
