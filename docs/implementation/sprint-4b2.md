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
| 2 | Strukturierte Quellen und lokaler PDF-Import | ✅ | `5a56b84` |
| 3 | Empfehlungen kompakt und modern | ✅ | siehe unten |
| 4 | „Prüfen & Speichern“ und direkte Weitergabe | ✅ | siehe unten |
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
## Phase 3 – Empfehlungen kompakt

### 3.1 Was vorher im Weg stand

Der Empfehlungsschritt hatte **vor** der ersten Empfehlung zwei große
Hinweisflächen: einen Kasten „Lokale Grundvorschläge“ und eine Karte
„Übersetzungsvorschläge aus dem Sprachmodell (optional)“ – zusammen gut zwanzig
Zeilen Text. Beim ersten Mal liest man das, beim zweiten überfliegt man es, ab
dem dritten scrollt man daran vorbei – und scrollt dabei über die Empfehlungen
hinaus, um die es geht.

Darunter kamen die Karten, und jede trug bis zu fünf Badges im Kopf, eine
Formenzeile, den Originalsatz in voller Länge, zwei Felder, einen gestrichelten
Vorschlagskasten und einen eingefärbten Wörterbuchkasten mit allen Bedeutungen
untereinander. Bei zehn Empfehlungen füllte allein die Wörterbuchauskunft zwei
Bildschirmhöhen.

### 3.2 Die Hinweise: unter die Ergebnisse, zugeklappt

Beide Flächen stehen jetzt **unter** der Liste, in zwei benannten Aufklappern
(`src/ui/Disclosure.tsx`): „Woher die Vorschläge kommen“ und
„Übersetzungsvorschläge aus dem Sprachmodell“. Der Text ist wörtlich derselbe.

Oben bleibt nur, was sich gerade ändert: ein laufender Modelldownload mit
Fortschritt und „Abbrechen“, und ein Fehler mit „Erneut versuchen“.

Der Aufklapper rendert seinen Inhalt **erst beim Öffnen**. Das ist der
Unterschied zwischen aufgeräumt und versteckt: Ein Hinweis, der unsichtbar ist,
aber trotzdem vorgelesen wird, wäre schlechter als der große Kasten vorher, weil
er dann nur noch für Sehende verschwindet. `<details>` wurde deshalb nicht
verwendet – dort steht der Inhalt auch zugeklappt im Dokument.

Die Beschriftung wechselt zwischen den Zuständen **nicht**. Was wechselt, ist
`aria-expanded` und ein Dreieck. Eine Schaltfläche, die von „Anzeigen“ zu
„Ausblenden“ wird, wechselt ihren Namen – wer sie über die Sprachsteuerung
anspricht oder in einer Elementliste sucht, findet sie beim zweiten Mal nicht.

### 3.3 Die Karte

| Was | Wo |
| --- | --- |
| Englische Form | Kopf, links |
| Häufigkeit („3× im Text“) | Kopf, daneben |
| Zustand („✓ wird übernommen“ / „○ noch offen“) | Kopf, rechts |
| „Entfernen“ | Kopf, ganz rechts |
| Abkürzung, Eigenname, unklare Grundform | eigene Zeile – **nur wenn zutreffend** |
| Originalsatz | höchstens zwei Zeilen, mit „Ganzen Satz zeigen“ |
| Deutsche Antwort | breites Feld |
| Wortart | schmales Feld daneben |
| Wörterbuch | 2–3 Chips in einer Zeile |
| Formen, Beugungen, Herkunft, Satzübersetzung | Aufklapper „Formen im Text und Herkunft“ |
| Weitere Bedeutungen mit Angaben | Aufklapper „Weitere Bedeutungen anzeigen (n)“ |

**Der Zustand hängt nicht an der Farbe.** „✓ wird übernommen“ gegen „○ noch
offen“ – Zeichen und Wort sagen dasselbe. Vorher waren das ein grünes und ein
gelbes Badge, und Gelb heißt „Achtung“; eine Vokabel ohne Antwort ist aber keine
Warnung, sondern eine Aufgabe. Aus demselben Grund trägt eine offene Karte kein
Fehlerrot, sondern tritt auf die abgesenkte Fläche zurück.

**Nebenbei repariert:** Der Zustand der Karte hing an
`:has(input[type='checkbox']:checked)`. Häkchen gibt es seit 4B.1 nicht mehr;
der Selektor traf ins Leere, und **jede** Karte sah deshalb aus wie abgewählt.
Jetzt steht der Zustand als `data-answered` im Markup – an derselben Stelle, an
der ihn auch der Test liest.

**Der Originalsatz** wird per CSS (`line-clamp: 2`) gekürzt, nicht im Markup:
Im Dokument steht der ganze Satz, eine Vorlesehilfe liest ihn vollständig. Ob
der Knopf „Ganzen Satz zeigen“ dazugehört, entscheidet eine Zeichenzahl
(`SENTENCE_CLAMP_CHARS = 150`) und keine Messung – Layout bei jedem Rendern zu
erzwingen und die Liste bei jeder Fensteränderung springen zu lassen wäre der
schlechtere Handel. Der Fehler ist absichtlich einseitig: Auf einem breiten
Bildschirm steht der Knopf gelegentlich an einem Satz, der ohnehin ganz zu sehen
ist. Der umgekehrte Fehler wäre der schlimme.

### 3.4 Chips statt Liste – und das Semikolon

Die wahrscheinlichsten Antworten stehen als **Chips** in der Karte: echte
`<button>`-Elemente mit Fläche, Kante, mindestens 32 px Höhe und Fokusring.
Vorher war das ein Wort mit gestricheltem Unterstrich – das sah aus wie ein Link
und versprach damit einen Ortswechsel, den es nicht gibt. Ein schon eingesetzter
Chip ist deaktiviert und trägt ein „✓“ davor, damit auch das nicht nur an der
Farbe hängt.

Ausgewählt werden die Chips **über** Bedeutungen hinweg, nicht innerhalb einer:
Wer `bank` nachschlägt, soll *Bank* und *Ufer* nebeneinander sehen und nicht drei
Synonyme für dasselbe.

**Zwei echte Fehler dabei behoben** – beide Nachzügler aus Phase 1:

1. `DictionarySuggestionList` verband mehrere Bedeutungen mit einem **Komma**.
   Seit Phase 1 ist ein Komma ein Zeichen *innerhalb* einer Antwort. „Unfall,
   Notaufnahme“ wäre damit **eine** falsche Antwort geworden. Jetzt laufen
   Zusammenführen und Formatieren über `splitAnswers`/`formatAnswers` – dieselben
   Funktionen wie im Editor und im Export.
2. `safeAutoAnswer` (die Sammelaktion „Übersetzungsvorschläge eintragen“) hatte
   denselben Fehler: `station` → „Bahnhof, Station“ war eine Antwort, die nur
   richtig war, wenn jemand beide Wörter mit genau diesem Komma tippte. Jetzt
   „Bahnhof; Station“ – zwei Antworten, jede für sich richtig.

### 3.5 Die Wortart kommt mit der gewählten Bedeutung

Wer bei `book` auf „das Buch“ klickt, hat die Bedeutungsgruppe gewählt – und
die ist ein Substantiv. Das Feld daneben leer zu lassen und dieselbe Auskunft
noch einmal von Hand treffen zu lassen wäre Arbeit ohne Erkenntnis.

Der Unterschied zu `partOfSpeechOf` ist der Anlass, nicht die Tabelle: Dort geht
es um „lässt sich das vorausfüllen, **bevor** jemand entschieden hat?“ – und die
Antwort ist bei `book` mit Recht nein. Hier hat jemand entschieden.
`partOfSpeechOfSource` ist die zweite, kleinere Funktion dafür. Überschrieben
wird nichts: Steht in der Wortart schon etwas, bleibt es stehen.

### 3.6 Eine Aktion statt zweier

„Empfehlungen neu berechnen“ (oben) und „Offene Empfehlungen ersetzen“ (unten)
riefen dieselbe Funktion mit einem anderen Schalter. Zwei Knöpfe für eine Sache
heißt: Man muss den Unterschied kennen, um den richtigen zu treffen – und der
Unterschied stand nirgends.

Jetzt heißt der eine Knopf vor dem ersten Lauf **„Empfehlungen generieren“** und
danach **„Offene Empfehlungen neu berechnen“**. Offen ist offen: ein leeres
Antwortfeld **und** ein entfernter Platz. Beides zählt
`replaceOpenRecommendations` gleich.

Den einen Unterschied, der wirklich einer ist, entscheidet die Aktion selbst:

| Lage | Verhalten |
| --- | --- |
| Einstellungen seit dem letzten Lauf **unverändert** | „gib mir andere“ – schon gezeigte Wörter bleiben außen vor |
| Jahrgang, Niveau, Sortierung oder Anzahl **geändert** | neue Frage – ein zurückgelegtes Wort darf wiederkommen, wenn es jetzt passt |

Frühere Empfehlungen bleiben wie bisher aufklappbar und einzeln
zurückholbar.

### Verifikation Phase 3

| Schritt | Ergebnis |
| --- | --- |
| `npm run typecheck` | grün |
| `npm run test` | **1579** grün / 89 Dateien |
| `npm run build` | grün |
| `npm run build:portable` | grün, 9326,8 KiB / 631,6 KiB |
| `npm run verify:portable` | grün, 25 Prüfungen |
| `npm run e2e` | **111** grün (Chromium), davon 8 neu in `e2e/recommendation-compact.spec.ts` |
| `npm run e2e:portable` | **19** grün (Chromium, `file://`) |

Die Schülerlaufzeit wächst um 2,6 KiB – die Aufklapper-Komponente und ihr CSS,
die auch die Lernansichten nutzen. Schranke 700 KiB, unverändert eingehalten.

---
## Phase 4 – „Prüfen & Speichern“ und die Weitergabe

### 4.1 Das Beschreibungsfeld beginnt mit einer Zeile

`src/ui/GrowingTextarea.tsx`. Die Beschreibung ist optional und meistens leer.
Ein Feld, das dafür von vornherein zwei oder drei Zeilen belegt, sagt das
Gegenteil: Es sieht aus wie eine Aufgabe, drängt die Felder darunter aus dem
Bild und schiebt auf einem Telefon die Hauptaktion unter den Falz. Wer dann doch
fünf Zeilen schreibt, bekommt beim starren Feld ein Rollbalken-Guckloch und
sieht seinen eigenen Text nicht mehr im Zusammenhang.

Im Paketeditor war es bis 4B.1 sogar ein einzeiliges `<input>` – zwei Sätze
darin waren immer nur ausschnittweise lesbar. Beide Stellen benutzen jetzt
dasselbe Feld.

Gemessen wird mit `height: auto` → `scrollHeight` → `height`. Der erste Schritt
ist der wichtige: Ohne ihn misst man die alte Höhe, und das Feld kann nie wieder
schrumpfen. `useLayoutEffect` statt `useEffect`, damit die Höhe **vor** dem
Zeichnen steht – sonst blitzt beim Öffnen kurz die einzeilige Fassung auf. Wo
`scrollHeight` 0 ist (eine Testumgebung ohne Layout), wird nichts gesetzt; ein
`height: 0px` wäre dort ein unsichtbares Feld.

Kein Ziehgriff (`resize: none`): Er würde die gemessene Höhe beim nächsten
Tastendruck wieder überschreiben. Ein Bedienelement, das nichts bewirkt, ist
schlimmer als keines.

Dass es im Browser wirklich wächst **und wieder schrumpft**, prüft
`e2e/pack-handover.spec.ts` an echten Pixelhöhen – in jsdom wäre das eine Zahl
ohne Bedeutung.

### 4.2 Die Übersichtszeile

Fünf Spalten statt sieben:

| Spalte | Inhalt |
| --- | --- |
| ✓ | Übernehmen |
| Vokabel | Englisch **oben**, Deutsch darunter, Meldungen darunter |
| Wortart | kompaktes Auswahlfeld |
| Beispielsatz | „Beispielsatz anzeigen (n)“ / „Beispielsatz ausblenden“ |
| Status | „OK“ oder „Bitte prüfen“, darunter „Entfernen“ |

**Warum untereinander.** Vorher teilten sich zwei Textfelder, ein Auswahlfeld,
ein Knopf und eine Fehlerliste dieselbe Zeilenbreite; auf einem Laptop war jedes
Feld so schmal, dass „sich entschuldigen“ nicht hineinpasste. Untereinander
bekommt jedes die volle Spaltenbreite – und die Zeile liest sich als das, was
sie ist: **eine** Vokabel mit zwei Seiten.

**Der Status sagt „ob“, die Meldung sagt „was“.** Bis 4B.1 stand in der
Statusspalte eine Aufzählung aller Meldungen, jede mit einem Etikett „Fehler“
oder „Hinweis“. Bei drei Hinweisen war diese Spalte höher als die ganze übrige
Zeile. Jetzt steht dort ein kurzes „OK“ oder „Bitte prüfen“, und der Grund steht
klein unter dem Feld, das er angeht – dort, wo man ihn behebt.

„Bitte prüfen“ statt „Fehler“ ist kein Euphemismus, sondern die genauere
Auskunft: Eine fehlende Übersetzung ist eine offene Aufgabe, kein Schaden. Für
das, was wirklich blockiert, bleibt das Rot – als Zeichen `!` vor der Meldung
und als roter Badge, nicht als eingefärbte Zeile.

**Der Beispielsatz** ist zugeklappt und benannt. „Details“ sagte nichts;
„Beispielsatz anzeigen (1)“ sagt, was dahintersteckt und wie viel. Offen nimmt
der Bereich die volle Tabellenbreite (`colSpan`), geprüft an der gemessenen
Breite im Browser.

### 4.3 Die Weitergabe steht dort, wo man nach dem Speichern hinsieht

Die Karte „Weitergeben an die Lerngruppe“ trug bis 4B.1 nur Erklärtext. Die drei
Aktionen dazu lagen ganz unten in einer Reihe mit „Änderungen speichern“ und
„Paket löschen“ – wer gerade gespeichert hatte, suchte den nächsten Schritt also
neben dem gefährlichsten Knopf.

Jetzt stehen sie in der Karte, unter dem Satz, der sie erklärt:

| Vorher | Jetzt |
| --- | --- |
| „Als Schülerdatei (.html) exportieren“ | **„Als Einzeldatei herunterladen (.html)“** |
| „Als .vocabpack.json exportieren“ | **„Als LexiFlow-Paket herunterladen (.vocabpack.json)“** |
| „Im Schülerbereich ansehen“ | **„Im Lernbereich ansehen“** |

„Herunterladen“ statt „exportieren“: Das eine sagt, was passiert, das andere ist
Fachsprache. Und ein Satz sagt jetzt, wozu das LexiFlow-Paket gut ist – die
Datei zum Weiterbearbeiten, nicht die zum Weitergeben.

Unten bleiben „Änderungen speichern“ und, davon abgesetzt, „Paket löschen“.

**Bewusst noch nicht geändert:** Die Meldung nach dem Export heißt weiterhin
„Schülerdatei erstellt“, und im Code stehen `studentExport`, `StudentShell` und
Verwandtes. Wording ist Phase 7; hier wurde nur geändert, was der Auftrag für
Phase 4 wörtlich benannt hat.

### 4.4 Ein echter Befund aus dem eigenen Test

Beim abschließenden Durchlauf war `e2e/sentence-assistant.spec.ts` **manchmal**
rot: Axe meldete `color-contrast`, Wirkung „serious“, am Element
`.btn--primary.btn--small`. Einzeln lief der Test dreimal grün, im vollen
Durchlauf fiel er etwa jedes zweite Mal um.

Nachgemessen war der Ruhezustand einwandfrei: gesperrter Knopf 5,2 : 1, freier
Knopf 15,4 : 1. Der Fehler steckte im **Übergang**. Der Primärknopf wechselt
beim Freischalten beide Werte zugleich – die Schrift springt sofort auf
Parchment, die Fläche wandert über 150 ms Übergangszeit erst nach Aubergine. In
diesen Millisekunden steht Hell auf Hell: rund 1,1 : 1. Nur unter Last
überschneiden sich Messung und Übergang so, dass Axe es erwischt.

Behoben ist der **Zustand**, nicht der Test: Der gesperrte Primärknopf trägt
jetzt eine dunkle, gedämpfte Fläche (`--ink-muted`) mit heller Schrift
(`--surface`, 6,4 : 1). Die Schriftfarbe muss beim Freischalten gar nicht mehr
wechseln, und jeder Zwischenwert des Übergangs ist dunkler als der
Ausgangston – der Kontrast steigt unterwegs, statt einzubrechen.

Danach lief `npm run e2e` **dreimal hintereinander** vollständig grün. Der Fix
liegt als eigener kleiner Commit hinter dem Phasencommit: Bestehende Commits
werden in diesem Projekt nicht nachträglich verändert.

### 4.5 Zwei Nachbesserungen aus dem ersten Blick auf die Bilder

Die Bildschirmaufnahmen für den Zwischenbericht haben zwei Dinge gezeigt, die
kein Test gemeldet hätte:

**Eine anonyme Tabellenzelle.** `display: flex` stand direkt auf den `<td>`.
Damit nimmt der Browser die Zelle aus dem Tabellenlayout und erzeugt eine
anonyme Zelle darum: Zeilenhöhen und Trennlinien verrutschten, und am
Tabellenende stand ein leerer Kasten. Der Flex-Container steckt jetzt **in** der
Zelle.

**Ein Schadensbericht.** Eine Zeile mit blockierendem Befund war vollflächig rot
eingefärbt. Bei einer frisch eingelesenen Liste ist die Hälfte der Zeilen ohne
Übersetzung – die Seite sah aus, als wäre etwas kaputt, dabei ist eine fehlende
Übersetzung eine Aufgabe. Jetzt trägt die Zeile eine 3 px breite Kante links;
gesagt wird es dreifach und ohne Farbe als einziges Merkmal: Kante, Status
(„Bitte prüfen“) und Meldung mit „!“ unter dem Feld.

Ebenfalls aus den Bildern: Der Knopf am Originalsatz hieß sichtbar „Ganzen Satz
zeigen (erosion)“ – bei zehn Karten zehnmal ein Wort in Klammern, das die Karte
darüber schon trägt. Das Stichwort steht jetzt nur noch im zugänglichen Namen,
wo es für eine Vorlesehilfe gebraucht wird.

**Offen und bewusst nicht angefasst:** Die Zusammenfassung über der Tabelle sagt
weiterhin „3 Zeilen · 2 werden übernommen · 1 Fehler · 0 Duplikate“, während die
Zeile selbst „Bitte prüfen“ sagt. Das ist eine Wortwahl und gehört zu Phase 7.

### Verifikation Phase 4

| Schritt | Ergebnis |
| --- | --- |
| `npm run typecheck` | grün |
| `npm run test` | **1593** grün / 90 Dateien |
| `npm run build` | grün |
| `npm run build:portable` | grün, 9329,0 KiB / 632,5 KiB |
| `npm run verify:portable` | grün, 25 Prüfungen |
| `npm run e2e` | **121** grün (Chromium), dreimal hintereinander; davon 10 neu in `e2e/pack-handover.spec.ts` |
| `npm run e2e:portable` | **19** grün (Chromium, `file://`) |

---

# Sprint 4B.3 – Entwurfsroute B als Design

Nach den drei Entwurfsrouten (`docs/mockups/`) ist **Route B – Werkbank** die
gewählte. Dieser Abschnitt hält fest, was davon umgesetzt ist, was bewusst
abweicht und was dabei an echten Fehlern aufgefallen ist.

## Was Route B im Produkt heißt

**Eine dunkle Fläche statt zwei.** Vorher: ganzbreite Kopfzeile in Aubergine,
darunter eine schwebende, abgerundete Navigationsfläche *innerhalb* der
Inhaltsspalte – zwei dunkle Flächen mit einem Streifen Papier dazwischen. Jetzt
eine durchgehende Schiene, bündig am linken Fensterrand, über die volle Höhe.
Sie trägt das Zeichen oben links (und es führt zur Startseite) und die drei
Bereiche mit je einer Zeile Erklärung.

**Abweichung vom Entwurf, bewusst:** Im Entwurf ist die Schiene 56 px schmal
mit senkrecht gestellten Beschriftungen. Senkrechte Schrift liest sich messbar
langsamer, und die drei Bereiche verlieren dabei ihre Erklärungen. Übernommen
ist die **Haltung** – eine durchgehende dunkle Kante statt eines schwebenden
Kastens –, nicht die Breite.

**Pakete als Blöcke.** `PackCard` ist von der gleichmäßig gerahmten Karte zur
Zeile mit eigener Fläche geworden: Kante links in Aubergine, Titel und Anzahl
in einer Zeile, Metadaten dicht darunter. Eine Kachelwand sieht auf einem
Entwurfsbild besser aus und ist beim Suchen schlechter – die Augen springen in
zwei Richtungen statt in einer.

**Die beiden Downloads als Zeichen.** Sie standen bisher nur auf der
Paketseite; wer aus der Liste heraus weitergeben wollte, musste erst hinein.
Jetzt stehen sie in jedem Block – mit einem Namen, der das Paket nennt
(`Unit 7 – Coastal erosion als Einzeldatei herunterladen (.html)`), damit in
einer Liste mit acht Paketen nicht acht gleichnamige Schaltflächen stehen.
Die Logik liegt seit 4B.3 in `src/ui/packDownloads.ts` – **einmal**, von
Materialseite und Paketseite gemeinsam benutzt.

**`Paketdatei öffnen` am Kopf der Liste.** Vorher der vierte Knopf unter den
drei Erstellungswegen – zwischen Dingen, die etwas Neues anfangen, obwohl er
etwas Vorhandenes hereinholt. Jetzt steht er über der Liste, in die das
geöffnete Paket fällt.

**Feine Striche statt Rahmen.** Empfehlungsliste (`.candidates`) und
Vokabeltabelle (`.table-wrap`) haben ihre Umrandung verloren; geblieben ist ein
Haarstrich zwischen den Zeilen. Sechzehn Kästen untereinander sind sechzehn
Ränder, die das Auge nachzieht – Arbeit, die nichts erklärt.

**Die Werkbank.** `src/ui/SplitPane.tsx`: links die Quelle, rechts das
Ergebnis. Der analysierte Text steht zum Nachschlagen daneben – beim Antworten
auf „shore“ ist der Satz, in dem es stand, die halbe Antwort. Die Spaltenbreite
ist ziehbar **und** mit den Pfeiltasten stellbar; der Griff ist ein
`role="separator"` mit `aria-valuenow/min/max`, kein `<div>` mit Mauslauschern.

## Zwei echte Fehler, die dabei aufgefallen sind

**Die portable Lerndatei stand auf breiten Fenstern ohne Marke da.** Die neue
Schiene brachte ein `@media (min-width: 62rem) { .app-header { display: none } }`
mit – und `StudentShell` benutzt dieselbe Klasse, hat aber keine Schiene, die
die Aufgabe der Kopfzeile übernehmen könnte. Auf einem Laptop zeigte die
Lerndatei damit gar kein Zeichen mehr. Gefunden hat das der portable E2E-Lauf
(`trägt das Logo als Pfad`), erklärt erst der Blick auf die Regel.

Behoben mit `.app:has(.app-nav) .app-header { display: none }` – die Regel sagt
jetzt, was sie meint: Die Kopfzeile geht nur dort, wo eine Schiene ihre Aufgabe
übernimmt. Festgehalten wird das von zwei neuen portablen Prüfungen, die die
Marke auf Laptop- **und** Telefonbreite verlangen.

**Ein sporadisch fallender Test war ein Fokus-Rennen, keine Langsamkeit.**
`ImportWizardPage.text.test.tsx` → „ist mit der Tastatur bedienbar“ fiel in der
vollen Suite gelegentlich um, allein gestartet nie. Der erste Verdacht –
Rechnerauslastung – war falsch, und eine großzügigere Frist hat es nicht
behoben: Der Fehlschlag ist alles-oder-nichts, 220 ms oder gar nicht.

Die Ursache: Nach dem Empfehlungslauf wandert der Fokus per
`requestAnimationFrame` auf die Ergebnisüberschrift – absichtlich, damit nach
dem Klick niemand oben stehen bleibt. Der Test griff sich davor den Stepper und
verlor den Fokus einen Wimpernschlag später wieder; `{Enter}` lief ins Leere.
Der Test wartet jetzt erst ab, dass die Anwendung ihren Fokus gesetzt hat.

## Was vom Entwurf noch offen ist

- **Die klebende Aktionsleiste mit Fortschrittsmesser** unten im
  Empfehlungsschritt. Die Aktionen stehen weiterhin am Fuß der Seite.
- **Lernbereichsübersichten** haben den Blockstil automatisch übernommen
  (gemeinsame `PackCard`), aber keinen eigenen Durchgang bekommen.

## Verifikation 4B.3 (Designblock)

| Schritt | Ergebnis |
| --- | --- |
| `npm run typecheck` | grün |
| `npm run test` | **1601** grün / 91 Dateien, zweimal hintereinander |
| `npm run build` | grün |
| `npm run build:portable` | grün, **9340,5 KiB** / 636,0 KiB (Grenze 12 MiB) |
| `npm run verify:portable` | grün, 25 Prüfungen |
| `npm run e2e` | **121** grün (Chromium) |
| `npm run e2e:portable` | **21** grün (Chromium, `file://`) – 2 neu |

Neue Dateien: `src/ui/Icon.tsx`, `src/ui/IconButton.tsx`, `src/ui/SplitPane.tsx`
(+ Test), `src/ui/packDownloads.ts`.

**Safari:** Automatisiert geprüft ist ausschließlich Chromium. `:has()` (neu in
der Shell-Regel) ist ab Safari 15.4 verfügbar und wird im Projekt schon
verwendet; `100dvh` ab Safari 15.4; `resize: vertical` und `position: sticky`
sind alt. Das ist eine Einschätzung nach Verfügbarkeit, **keine Messung** – ein
Durchgang durch Schiene, Paketblöcke und Werkbank in echtem Safari steht aus.

## Block A – Grammatisch vollständige englische Lernformen

Eigener Commit, bewusst getrennt vom Designblock: Der eine ändert, wie die
Anwendung aussieht, der andere, was sie über eine Vokabel weiß.

### Der Fehler, um den es geht

Die Textanalyse findet Wörter so, wie sie im Text stehen: `depend`, `single`,
`restraints`, `attainable`. Als Vokabel taugt davon keines. Ein Vokabelheft
schreibt `to depend on sb./sth.` – weil die Rektion zur Vokabel gehört. Wer
`depend` lernt, schreibt später `depend of`.

### Zwei Seiten, und die zweite war die schlimmere

**Erzeugen.** `src/import/learningFormProposal.ts` baut aus einem gefundenen
Wort eine Lernform – aus belegten Quellen und sonst gar nicht. Verben bekommen
`to`, ein vom Wörterbuch belegtes Phrasal Verb behält seine Partikel
(`to single out`), ein über die Grundform gefundener Plural wird markiert
(`restraints (pl.)`).

**Prüfen.** Hier saß der eigentliche Fehler, und er war unsichtbar:
`impliedAnswers` hat das **Lemma** als gültige Antwort mitgeliefert. Zu
`to depend on sb./sth.` ist das Lemma `depend` – die Antwortprüfung hat also
genau den Fehler durchgewunken, dessentwegen die Lernform überhaupt
vollständig ist. Weglassbar sind jetzt nur noch das führende `to`, die
Klammerzusätze und die Platzhalter; Partikel und Präpositionen sind es nicht.

| Antwort | vorher | jetzt |
| --- | --- | --- |
| `to depend on` | falsch | **richtig** |
| `depend` | **richtig** | falsch |
| `to single out` | falsch | **richtig** |
| `single` | **richtig** | falsch |
| `to coin a phrase` | falsch | **richtig** |
| `to coin` | falsch | falsch |

### Die Grenze: `single out` ja, `depend on` nein

Das ausgelieferte Wörterbuch führt `single out` als eigenes Mehrwortverb –
Satz und Wörterbuch sagen dasselbe, das ist eine Auskunft, und die Form
entsteht ohne Rückfrage.

`depend on` steht **nicht** im Bestand. Dass im Satz hinter `depend` ein `on`
folgt, ist ein Hinweis und kein Beweis: In „to arrive on Monday“ steht dort
auch eine Präposition, und die gehört nicht zum Wort. Die Zeile bleibt deshalb
bei `to depend` und stellt die Frage im Klartext – „Im Text steht ‚depend on‘.
Gehört ‚on‘ zur Vokabel?“ – mit einem Knopf, der sie beantwortet. Ein Klick
ist die Entscheidung der Lehrkraft und damit eine zulässige Quelle; eine
Vermutung ist es nicht.

Es gibt **keine** Tabelle „welches Verb hat welche Rektion“. Die wäre nach
zwanzig Einträgen unvollständig und nach fünfzig falsch – und sie würde genau
dort raten, wo Raten am teuersten ist: in dem Feld, das anschließend jemand
auswendig lernt.

### Eine Entscheidung, die zur Bestätigung ansteht

Das Wortartkürzel (`attainability (n.)`, `attainable (adj.)`) wird **nur**
gesetzt, wenn zwei Kandidaten derselben Wortfamilie in der Liste stehen – dort
also, wo es tatsächlich unterscheidet. Ein allein stehendes Substantiv bleibt
`erosion`, nicht `erosion (n.)`.

Der Grund: Eine Liste, in der hinter jedem Wort die Wortart steht, liest sich
wie ein Wörterbuchauszug, und die Wortart hat im Editor ihre eigene Spalte.
Die Anforderung („Wortarten sichtbar markiert“) lässt beide Lesarten zu; wenn
die durchgehende Markierung gewünscht ist, ist es eine Zeile
(`markPartOfSpeech: true` in `toRow`).

### Verifikation Block A

| Schritt | Ergebnis |
| --- | --- |
| `npm run typecheck` | grün |
| `npm run test` | **1657** grün / 93 Dateien |
| `npm run build` | grün |
| `npm run build:portable` | grün, **9346,3 KiB** / 636,8 KiB |
| `npm run verify:portable` | grün, 25 Prüfungen |
| `npm run e2e` | **122** grün (Chromium), davon 1 neu für die Lernformen |
| `npm run e2e:portable` | **21** grün (Chromium, `file://`) |

Neue Dateien: `src/import/learningFormProposal.ts` (+ Test),
`src/import/learningFormChain.test.ts` – Letzterer ist das Akzeptanzkriterium:
Er führt alle acht Beispiele der Anforderung durch Entwurf, gespeichertes
Paket, Karten, Durchsehen, Selbsttest, Export und erneuten Import.

## Block B – Das Paket als druckbare Vokabeltabelle

Eigener Commit. Zwei Aktionen, vier Fassungen, keine neue Abhängigkeit.

### Warum hier keine PDF-Bibliothek steht

Sie wäre ein zweiter Satz Schriften, ein zweites Layoutmodell und ein Megabyte,
das in **jeder** portablen Datei mitreist – für eine Aufgabe, die jeder Browser
seit zwanzig Jahren beherrscht. Der Ausdruck ist deshalb eine ganz normale
Seite mit einem `@media print`-Block, und `window.print()` öffnet den Dialog des
Systems. „Als PDF sichern“ steht dort in Safari genauso wie in Chrome.

Der Nebeneffekt ist der eigentliche Gewinn: Wer den Ausdruck ändern will,
ändert CSS. Wer ein PDF anders haben will, ändert eine Bibliothek.

### Die vier Fassungen

| Fassung | Weg dorthin |
| --- | --- |
| normale Lehrkraftanwendung | Paketseite → „Vokabelliste drucken / als PDF speichern“ |
| portable Lehrkraftdatei | derselbe Knopf, dieselbe Ansicht |
| normaler Lernbereich | Paketseite → Zeile „Vokabelliste“ unter den vier Lernwegen |
| exportierte Lerndatei | derselbe Weg |

Im Lernbereich ist die Liste bewusst **kein fünfter Lernweg**: Sie steht als
ruhige Zeile unter den vier Kästen, nicht als fünfter daneben. Nützlich ist sie
– manche lernen vom Papier, und vor einer Arbeit will man den Zettel in der
Hand haben –, aber ein Lernweg ist sie nicht.

### Was auf dem Papier passiert

`@page size: A4 portrait` mit 16 mm Rand; viele Drucker können die äußersten
Millimeter nicht, und eine abgeschnittene letzte Spalte macht die Liste
wertlos. Navigation, Schaltflächen und Einstellungen sind im Druck
`display: none` – ein ausgedruckter Knopf ist ein Fleck.

Drei Regeln tragen den Umbruch, und jede einzelne sieht man erst nach dem
Drucken:

- `thead { display: table-header-group }` – **nur** damit wiederholt ein
  Browser den Tabellenkopf. Ohne sie steht er einmal auf Seite 1, und wer
  Seite 3 in der Hand hält, rät, welche Spalte welche ist.
- `break-inside: avoid` an `tr` **und** an der Zelle – manche Engines beachten
  die Regel nur an der einen, manche nur an der anderen.
- `orphans`/`widows` – keine einzelne Zeile allein auf einer Seite.

Weil diese Regeln einzeln unscheinbar sind und beim Aufräumen als Erste
gelöscht werden, hält `src/styles/print.test.ts` sie fest, und der E2E-Lauf
misst sie im Druckmedium an den **berechneten** Werten.

### Ein Fehler, den erst die Messung gezeigt hat

Der Ausdruck hatte sandfarbene 2-px-Linien statt feiner grauer. Ursache: Weit
oben im Stylesheet steht `tbody tr:not([hidden]) > td { border-bottom: 2px … }`.
Die Regel gehört zur Entwurfstabelle, trifft aber **jede** Tabelle im Dokument
und hat durch `:not(…)` genug Gewicht, um eine Regel mit einer einzigen Klasse
zu schlagen – auch im Druck. Am Bildschirm fällt das nicht auf, auf Papier
schon.

Behoben mit zwei Klassen im Selektor (`.sheet .sheet__table td`). Die leckende
Regel bleibt stehen: Sie einzuschränken hieße, alle Tabellen des Projekts
umzustellen, und das ist eine eigene Aufgabe. Eine E2E-Messung wacht darüber,
dass die Vokabelliste ihr entkommt.

### Die Tabellendatei

UTF-8 **mit BOM** – ohne die drei Bytes liest Excel unter Windows die Datei als
Windows-1252, und aus „überfüllt“ wird „Ã¼berfÃ¼llt“. Trennzeichen ist das
Semikolon, weil ein Komma im deutschen Excel auf das Dezimaltrennzeichen
träfe und die ganze Datei in Spalte A landete. Zeilenende `\r\n` nach RFC 4180.

**Jedes** Feld steht in Anführungszeichen, nicht nur die, die es brauchen: In
diesen Daten kommen Semikolon, Komma, Anführungszeichen und Zeilenumbrüche
alle vor, und ein Feld, das immer gequotet ist, kann keines davon falsch
machen. Ein `"` im Inhalt wird verdoppelt.

Spalten: Englisch · Deutsch · Wortart · Beispielsatz Englisch · Beispielsatz
Deutsch · Thema · Jahrgang · GeR-Niveau. Mehrere Bedeutungen stehen mit
Semikolon **in einer Zelle** – „einen Begriff, eine Redewendung prägen“ bleibt
eine Bedeutung mit einem Komma darin.

Weder Ausdruck noch Tabelle verändern etwas: `tableRows` sortiert mit
`toSorted`, nicht mit `sort`, damit das Umstellen der Reihenfolge beim Drucken
nicht die Reihenfolge im Speicher ändert. Ein Test hält das fest.

### Nebenbefund: eine Fixture, die Felder verschluckt hat

`makeEntry` hat `lemma`, `complementPattern`, `grammaticalNumber` und
`lexicalGroupId` stillschweigend weggelassen. Ein Test, der
`grammaticalNumber: 'plural'` übergibt und ein Objekt ohne dieses Feld
zurückbekommt, prüft anschließend etwas anderes als das, was er zu prüfen
glaubt. Aufgefallen an einer Wortart, die „Substantiv“ statt „Substantiv,
Plural“ meldete.

### Ebenfalls geändert: geschriebene Wortartkürzel bleiben stehen

Wer `attainable (adj.)` einfügt, bekam bisher `attainable` plus ein Feld
„Adjektiv“. Es ging dabei keine Information verloren, aber die Vokabel auf der
Karte änderte sich stillschweigend – und `restraints (pl.)` behielt seine
Klammer, `(adj.)` nicht. Jetzt bleibt beides stehen. **Hinzugefügt** wird ein
Kürzel weiterhin nie: Aus `erosion` mit erkannter Wortart wird kein
`erosion (n.)`.

### Verifikation Block B

| Schritt | Ergebnis |
| --- | --- |
| `npm run typecheck` | grün |
| `npm run test` | **1698** grün / 96 Dateien |
| `npm run build` | grün |
| `npm run build:portable` | grün, **9366,4 KiB** (Schranke 12 MiB) / **646,7 KiB** (Schranke 700 KiB) |
| `npm run verify:portable` | grün, 25 Prüfungen |
| `npm run e2e` | **130** grün (Chromium), davon 7 neu in `e2e/vocab-list.spec.ts` |
| `npm run e2e:portable` | **23** grün (Chromium, `file://`), davon 2 neu |

Die beiden neuen portablen Prüfungen sind das geforderte Abnahmekriterium: In
der **Lehrkraftdatei** und in einer **exportierten Lerndatei** wird das Paket
geöffnet, die Druckansicht aufgerufen, die vollständigen Lernformen und
Übersetzungen in der Tabelle gefunden, die `.csv` heruntergeladen und ihr
Inhalt geprüft – jeweils über `file://`, ohne Server, mit der Zusicherung,
dass **keine** fremde Anfrage das Gerät verlässt.

**Safari:** Automatisiert geprüft ist ausschließlich Chromium. Der Ausdruck
benutzt nur `@page`, `display: table-header-group`, `break-inside` und
`window.print()` – alles seit Jahren in Safari vorhanden. Ob „Als PDF sichern“
im Safari-Druckdialog das erwartete Blatt liefert, ist damit **plausibel, aber
nicht gemessen**; ein Durchgang in echtem Safari steht aus.

## Die klebende Aktionsleiste – und die Sichtbarkeit der Prüfhinweise

Der letzte offene Punkt aus dem Entwurf, zusammen mit der bestätigten
Anforderung, dass ein Prüfhinweis **vor dem Speichern zuverlässig auffällt**.
Beides gehört in dieselbe Leiste, deshalb in denselben Commit.

### Warum die Leiste klebt

Bei zwanzig Empfehlungen sind die Aktionen am Seitenfuß drei Bildschirmhöhen
entfernt. Wer bei Vokabel sieben ist, sieht weder, wie weit er ist, noch den
Weg weiter – und scrollt zum Speichern an allem vorbei, was er gerade
bearbeitet hat. Jetzt stehen Fortschritt, Rückweg und Speichern immer im Bild.

`position: sticky`, nicht `fixed`: Eine feste Leiste läge auch über kurzen
Seiten und verdeckte auf einem Telefon im Querformat die halbe Liste. Auf
schmalen Fenstern rückt sie um die Höhe der Bereichsnavigation nach oben –
sonst läge der Speichern-Knopf hinter „Lernen · Erstellen · Daten“.

### Der Fehler, den die Messung gezeigt hat

Die offenen Fragen zur Lernform sollten neben dem Speichern-Knopf stehen. Beim
Zählen fiel auf, wie viele es waren: An einem echten Text stand **eine**
sichtbare Frage im Empfehlungsschritt – und **zwölf** „Bitte prüfen“ in der
Entwurfstabelle.

Der Grund: `needsReview` wurde auch gesetzt, wenn nur die **Wortart** unklar
blieb. Das ist im Englischen der Normalfall – `coin`, `wall`, `plan`, `try`,
`shore` sind Substantiv **und** Verb, und das Wörterbuch sagt zu Recht nichts
Eindeutiges. Eine Warnung an jeder Zeile ist aber eine Warnung an keiner: Die
eine Frage, die wirklich beantwortet werden muss, ging darin unter – genau die,
die auffallen soll.

`needsReview` ist jetzt dem vorbehalten, was es benennt: einer offenen Frage
zur **Form**, zu der es eine konkrete Antwort und einen Knopf gibt. Die
ungesicherte Wortart geht dabei nicht verloren – `partOfSpeech` bleibt leer,
und das Auswahlfeld daneben steht sichtbar auf „–“. Eine fehlende Wortart ist
kein Fehler; ein Paket ohne sie ist gültig.

Gemessen am selben Text: 10 Zeilen, neunmal „OK“, **einmal** „Bitte prüfen“ mit
dem Wortlaut „Im Text steht ‚depend on‘. Gehört ‚on‘ zur Vokabel?“ – im
Empfehlungsschritt, in der Leiste neben dem Speichern-Knopf und in der
Entwurfstabelle.

### Der Weg zur Frage

Die Leiste zählt nur Zeilen, die auch ins Paket gehen: Eine offene Frage an
einer Vokabel ohne Antwort ist keine, weil die Vokabel gar nicht übernommen
wird. Der Knopf daneben springt zur ersten betroffenen Zeile **und setzt den
Fokus auf die Bestätigung** – wer mit der Tastatur arbeitet, landet ebenfalls
dort.

### Zu den beiden bestätigten Entscheidungen

Beide sind so umgesetzt, wie bestätigt, und durch Tests festgehalten:

- Das Wortartkürzel erscheint zur **Unterscheidung verwandter Formen**
  (`attainability (n.)` neben `attainable (adj.)`), bei **grammatisch
  relevanten Angaben** (`restraints (pl.)` – immer) und wenn es die Lehrkraft
  **geschrieben** hat. Sonst nicht: `erosion` bleibt `erosion`.
- Verben tragen unabhängig davon ihr `to`; notwendige Partikel, Präpositionen
  und belegte Ergänzungsmuster bleiben Bestandteil der Lernform und sind in der
  Antwortprüfung nicht weglassbar.
- Geschriebene Kürzel laufen unverändert durch Import, Bearbeitung, Speichern,
  Lernansichten und Export – festgehalten von
  `src/import/learningFormChain.test.ts`.

### Verifikation

| Schritt | Ergebnis |
| --- | --- |
| `npm run typecheck` | grün |
| `npm run test` | **1701** grün / 96 Dateien |
| `npm run build` | grün |
| `npm run build:portable` | grün, **9368,6 KiB** (Schranke 12 MiB) / **647,4 KiB** (Schranke 700 KiB) |
| `npm run verify:portable` | grün, 25 Prüfungen |
| `npm run e2e` | **131** grün (Chromium), davon 1 neu für die Leiste |
| `npm run e2e:portable` | **23** grün (Chromium, `file://`) |

Der neue E2E-Test misst im Browser, was jsdom nicht kann: dass die Leiste nach
4000 px Scrollen noch im Bild steht, dass der Fortschritt mitzählt, dass der
Knopf zur offenen Frage führt und den Fokus auf die Bestätigung setzt – und
dass die Leiste danach nichts Offenes mehr meldet.

**Safari:** weiterhin ausschließlich Chromium automatisiert. `position: sticky`
ist dort alt; der manuelle Durchgang steht aus.
