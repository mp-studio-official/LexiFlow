# LexiFlow – Statusbericht zur Gegenprüfung

**Stand:** 4. September 2026
**Branch:** `sprint/4b2-authoring-and-topic-studio`, 21 Commits vor `main` (`20d5338`), linear, keine Merges, kein Remote, Arbeitsverzeichnis sauber.
**Zweck dieses Dokuments:** Es geht an eine zweite KI zur kritischen Gegenprüfung. Es ist bewusst so geschrieben, dass es ohne Zugriff auf das Repository lesbar ist. Am Ende stehen die Stellen, an denen ich meine eigenen Entscheidungen für angreifbar halte – dort ist Widerspruch ausdrücklich erwünscht.

---

## 1. Was LexiFlow ist

Ein Vokabeltrainer Englisch–Deutsch für das Gymnasium in NRW, Jahrgänge 5–10 und EF/Q1/Q2. Eine Lehrkraft erstellt Vokabelpakete und gibt sie als **eine einzelne HTML-Datei** an die Lerngruppe. Die Datei enthält den vollständigen Trainer und wird per Doppelklick geöffnet – aus Moodle, Teams, IServ, vom USB-Stick oder aus dem E-Mail-Anhang.

### Produktentscheidungen, die nicht zur Disposition stehen

Diese Punkte sind vom Auftraggeber (Lehrkraft, zugleich Produktverantwortlicher) festgelegt. Sie sind keine technischen Beschränkungen, sondern die Sache selbst:

- **Freiwillige Lernhilfe, keine Kontrolle.** Es gibt keine Konten, keine Klassenverwaltung, keine Noten. Lehrkräfte können Lernstände **nicht** einsehen.
- **Kein Backend, keine fremden Requests.** Nichts verlässt das Gerät. Kein Telemetrie-, Werbe- oder Trackingcode.
- **Lernstände bleiben lokal** im Browser der lernenden Person.
- **KI nur optional, nur lokal, austauschbar.** Chrome-eigene lokale Modelle dürfen den Erstellungsweg verbessern; das fertige Paket funktioniert ohne jedes Modell. Keine Cloud-KI, keine API-Schlüssel.
- **Safari und `file://` sind Pflichtfälle**, nicht Nice-to-have.

### Nicht-Ziele

Klassenverwaltung, Zugänge, Auswertung, Ranglisten, Streaks, Gamification-Druck. Diese fehlen mit Absicht.

---

## 2. Architektur in Kürze

| | |
| --- | --- |
| Stack | React 19, TypeScript 5.9 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), Vite 8 (Rolldown) |
| Speicher | IndexedDB via Dexie 4, aktuell Schemaversion 4 |
| Routing | `HashRouter` – die App wird statisch ausgeliefert und muss unter `file://` funktionieren |
| Validierung | Zod 4, ein Schema für Datei, Import und Einbettung |
| Austauschformat | `.vocabpack.json`, `VOCABPACK_FORMAT_VERSION = 2`, mit Migrationen |
| Portable Dateien | `vite-plugin-singlefile`; die Schülerlaufzeit ist in der Lehrkraftdatei als Zeichenkette einkompiliert |
| Wörterbuch | Wiktionary über wiktextract, CC BY-SA 4.0, 64 FNV-1a-Shards, `fflate`, 6,1 MB – nur in der Lehrkraftdatei |
| PDF-Import | `pdfjs-dist` 4.10.38 (Legacy-Build), Apache-2.0, läuft lokal |
| Laufzeitabhängigkeiten | 10 Pakete: React, React-DOM, React-Router, Dexie (+Hooks), Zod, fflate, pdfjs-dist, zwei Fontsource-Schriften |

**Codeumfang:** 128 Quelldateien, ca. 30.100 Zeilen Produktivcode, ca. 33.450 Zeilen Test- und E2E-Code.

### Der Weg durch das Produkt

1. **Erstellen** – Vokabelliste einfügen, `.vocabpack.json` importieren, aus einem Fließtext gewinnen, aus einer PDF lesen oder zu einem Thema vorschlagen lassen.
2. **Prüfen** – Kandidaten mit Wörterbuchvorschlägen, Wortart aus dem Satzkontext, Lernformvorschläge. Blockierende Befunde springen an, der Fokus wird gesetzt.
3. **Speichern** – Paket in der lokalen Bibliothek.
4. **Weitergeben** – als `.vocabpack.json` (weiterbearbeitbar), als Einzeldatei (ein Paket) oder als **Lernbereich** (mehrere Pakete, seit gestern).
5. **Lernen** – Lernplan nach Leitner, freies Üben, Durchsehen, Karten, Selbsttest mit Fehlerwiederholung, Vokabelliste zum Drucken und als `.csv`.

---

## 3. Verifikationsstand

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | grün (Cloud-Sandbox **und** Zielrechner) |
| Komponententests (Vitest, jsdom) | **1886** grün / 108 Dateien |
| E2E Web (Playwright, Chromium) | **152** grün |
| E2E portabel (`file://`, Chromium) | **29** grün |
| `verify:portable` | grün, 31 Prüfungen |
| Lehrkraftdatei | **9431,2 KiB** (Schranke 12 MiB) |
| Schülerlaufzeit | **666,9 KiB** (Schranke 1024 KiB) |

**Wichtige Einschränkung:** Automatisiert geprüft ist **ausschließlich Chromium**. Dazu unten mehr.

---

## 4. Die letzten drei Änderungsblöcke

### 4.1 `cbbbc35` – Der Lernbereich bekommt ein Gesicht

Die Lernansicht war funktional korrekt und sah aus wie ein Formular. Auftrag war, sie „cooler" zu machen, gerne mit lizenzfreien Fotos.

**Fotos wurden verworfen, und zwar aus drei unabhängigen Gründen:** Unsplash antwortet über den Egress-Proxy mit 403; Hotlinking bräche „keine fremden Requests" und das Datenschutzversprechen; Einbetten spränge die 1-MiB-Schranke der Schülerlaufzeit. Der Auftraggeber hat daraufhin **erzeugte Motive** gewählt.

Umgesetzt: aus dem Pakettitel wird deterministisch ein SVG-Motiv (`packMotif.ts` entscheidet, `PackArt.tsx` zeichnet) – sechs Kompositionen, zwei Grundtöne, zwölf Drehungen, drei Maßstäbe, ausschließlich in den drei Markenfarben über CSS-Token.

Zwei Fehler dabei, beide durch Messung gefunden: Ein FNV-1a-Hash `% 6` liest die niedrigsten Bits – acht ähnliche Titel ergaben vier von sechs Varianten. Behoben mit einer Murmur3-Lawine je Entscheidung. Und `preserveAspectRatio="none"` verzerrte Kreise zu Ellipsen; jetzt `xMidYMid slice`.

### 4.2 `452ef70` – Drei Korrekturen aus der Nutzung

**Der angedeutete Kartenstapel entfällt.** Zwei `::before`/`::after`-Blätter hinter der Lernkarte ragten darunter hinaus und überlappten die Bedienknöpfe. Schmuck vor Funktion – entfernt.

**„© OHM" steht unten** in der Anwendung, in der Schülerdatei und auf dem Ausdruck. An **einer** Stelle im Quelltext (`ui/Copyright.tsx`), mit geschütztem Leerzeichen zwischen Zeichen und Kürzel.

**Die Vokabelliste folgt einer gelieferten Vorlage.** Aus der vierspaltigen Tabelle wurde eine Liste: fett das Wort, darunter der Beispielsatz, darunter die Übersetzung. Der Grund ist nicht Geschmack – eine Lernform wie `to depend on sb./sth.` und ein ganzer Satz teilen sich in einer 28-%-Spalte nichts; beide brachen um, und aus einer Zeile wurden vier, die man nicht mehr als eine Vokabel liest.

Dazu: eine editierbare Kopfzeile oben links („E | GK | Q1 | Ohm"), am Bildschirm ein Feld, auf Papier eine Zeile; ein Titel mit Balken in Tomate (als **Rahmenlinie**, weil Browser Hintergründe standardmäßig nicht mitdrucken); und die gelieferte Schwarzweiß-Fassung des Zeichens.

**Ein echter Fehler, den das aufgedeckt hat:** Die bisherige einfarbige Logofassung legte den Durchblick mit 35 % Deckkraft auf eine voll deckende Fläche. Das „F" im Zeichen wurde dadurch nicht heller, sondern verschwand. Auf jedem bisherigen Ausdruck.

### 4.3 `4678556` – Lernbereiche: mehrere Pakete in einer Datei

Bisher: eine Datei, ein Paket. Für eine Unit reicht das; für ein Halbjahr nicht – sechs Pakete hießen sechs Dateien im Downloadordner einer fünfzehnjährigen Person.

**Der Zuschnitt, auf den es ankommt:** Es gibt jetzt *nur noch* Lernbereiche. Ein einzelnes Paket ist ein Bereich mit genau einem Paket. Kein zweiter Weg daneben, keine zweite Datenform, keine zweite Leseroutine.

**Der Lernstand hängt an der Bereichskennung.** Sie bestimmt den Namen der IndexedDB auf dem Gerät der lernenden Person. Bleibt sie gleich, findet eine neu ausgegebene Datei den vorhandenen Stand und ergänzt ihn; neue Vokabeln kommen als unbearbeitet dazu. Sie entsteht genau einmal, beim Anlegen, und es gibt **keine Funktion, die sie ändert**.

Für Einzeldateien ist die Bereichskennung die Paket-Id. Deshalb finden bereits verteilte Dateien nach einer Neuausgabe denselben Lernstand wieder. Dateien im alten Format (nacktes Paket statt Bereich) bleiben lesbar.

Weiter: Dexie-Version 4 mit einer Tabelle `areas` (reine Erweiterung, nichts zu migrieren); eine Oberfläche mit zwei Listen nebeneinander – links die Auswahl in ihrer Reihenfolge, rechts der Vorrat; umgestellt wird mit Pfeilknöpfen und nicht mit einer Ziehgeste, weil Ziehen mit der Tastatur nicht bedienbar ist.

Ein gelöschtes Paket verschwindet **nicht** still aus einem Bereich. Es steht als fehlende Zeile da und blockiert die Ausgabe. Begründung: Eine Auswahl, die sich von selbst ändert, ist keine Auswahl mehr – und eine Datei mit einem Loch darin fällt erst bei den Lernenden auf.

---

## 5. Offene Punkte

Nach Risiko geordnet. Belege sind angegeben, damit die Gegenprüfung sie nachrechnen kann.

### 5.1 Safari ist nie gemessen worden — größtes Risiko

**Beleg:** Das Fortsetzungsdokument des Projekts hält selbst fest: „Das ist eine Einschätzung nach Verfügbarkeit, **keine Messung** – ein Durchgang durch Schiene, Paketblöcke und Werkbank in echtem Safari steht aus."

Gebaut ist alles dafür, und zwar nachweislich absichtlich: kein Worker unter `file://` („ein Worker unter `file://` ist in Safari eine Wette"), keine SVG-Sprites (`<use href="#…">` bricht dort), `Promise.try` von pdf.js umgangen (in Safari erst ab 18.2), Blob-URLs statt Datei-URLs für Downloads. Die verwendeten CSS-Merkmale (`:has()`, `100dvh`) sind ab Safari 15.4 verfügbar.

Trotzdem: 181 automatisierte Browserprüfungen laufen alle in Chromium. Wenn im Piloten iPads oder Macs vorkommen – und in NRW kommen sie vor –, ist das die Stelle, an der es scheitern kann, ohne dass es vorher jemand wüsste.

**Ungeprüft bleibt insbesondere:** IndexedDB-Verhalten unter `file://` in Safari (Safari behandelt lokale Dateien restriktiver als Chromium), die 6,1-MB-Wörterbuchentpackung, der PDF-Import, und ob eine 9,4-MB-HTML-Datei dort überhaupt zügig öffnet.

### 5.2 Kein Durchgang auf einem echten Touchgerät

Alle Messungen auf 390 px stammen aus Chromium mit gesetzter Fensterbreite. Getestet sind Tap-Ziele über eine CSS-Regel (`--tap-target: 44px`), nicht über einen Finger. Ungeprüft: die iOS-Tastatur über einem Eingabefeld, Zoomverhalten bei Fokus (`font-size < 16px` löst in iOS Safari Autozoom aus), Scrollverhalten mit der klebenden Aktionsleiste.

### 5.3 Der Kognaten-Befund blockiert das Speichern

**Beleg:** `src/import/draft.ts` – die Prüfung „Übersetzung stimmt mit dem englischen Stichwort überein" erzeugt ein Issue mit `review: true`, und `blocksSaving()` gibt für ungelöste Review-Befunde `true` zurück.

Das trifft echte Kognaten: `erosion` → „Erosion", `motor` → „Motor", `Manifest Destiny` → „Manifest Destiny". Bei einem Text über Küstenerosion feuert es bei jeder zweiten Vokabel, und die Lehrkraft muss jede einzeln bestätigen.

Zwei Kandidaten, Entscheidung steht aus:
- Hinweis ohne Sperre (`review: true` entfernen) – einfach, verliert die Aufmerksamkeit für echte Copy-Paste-Fehler.
- Eine belegte Ausnahme: Wenn das Offline-Wörterbuch den identischen Ausdruck als Bedeutung führt, ist es kein Fehler. Aufwendiger, trifft aber genau.

### 5.4 Drei Namen für dieselbe Datei

Gezählt in den sichtbaren Zeichenketten: **„Einzeldatei" 15×, „Lerndatei" 16×, „Schülerdatei" 3×.** Dazu „Schülerkonten" auf der Startseite, obwohl die verbindliche Wortwahl des Projekts „Lernende / Lehrkräfte / Lerngruppe / Lernbereich" lautet.

Das ist die im Sprintplan als Phase 7 geführte Aufgabe („Inklusives und konsistentes Wording") und die einzige rein redaktionelle auf dieser Liste.

### 5.5 Die Kurzanleitung ist veraltet

`docs/KURZANLEITUNG-PORTABEL.md` beschreibt einen Knopf „Als Schülerdatei (.html) exportieren", den es so nicht mehr gibt, und kennt keine Lernbereiche. Für einen Piloten mit weiteren Lehrkräften ist genau dieses Dokument die Übergabe.

### 5.6 Das Fortsetzungsdokument endet bei `a92a9b6`

`docs/implementation/sprint-4b2.md` nennt sich „der verbindliche Fortsetzungsstand". Die letzten sechs Commits stehen nicht darin. Für ein Projekt, das ausdrücklich auf Übernahme durch jemand anderen ausgelegt ist, ist das eine Lücke im wichtigsten Dokument.

### 5.7 `main` steht unverändert

`main` = `20d5338`, der Branch 21 Commits davor. Das ist so beauftragt („main nicht verändern, nicht mergen und keinen Tag anlegen"), aber vor einem Piloten braucht es eine Entscheidung darüber.

### 5.8 Ein geprüfter, aber nicht abschließend belegter Punkt

**Frage:** Was passiert, wenn eine lernende Person erst die *neue* Datei öffnet (hebt die IndexedDB auf Schemaversion 4) und danach die *alte* Datei aus dem August (deren Laufzeit nur die Versionen 1–3 kennt)? Bei gleicher Bereichskennung ist es dieselbe Datenbank.

**Gemessen:** Mit `fake-indexeddb` öffnet Dexie die auf Version 4 gehobene Datenbank auch mit einer Laufzeit, die nur Version 3 deklariert – ohne Fehler. Das entspricht Dexies dokumentiertem Verhalten (dynamischer Modus bei höherer vorhandener Version).

**Nicht gemessen:** Dasselbe in einem echten Browser, und insbesondere in Safari. Falls es dort doch bricht, führt der Weg im Code in den Zweig „Kein dauerhafter Speicher" – eine irreführende Meldung für dieses Problem.

---

## 6. Empfehlung

**Vor dem Piloten, in dieser Reihenfolge:**

1. **Safari-Durchgang auf echtem Gerät** (Mac + iPad, mindestens ein iPhone). Lehrkraftdatei öffnen, Paket erstellen, Wörterbuch benutzen, PDF importieren, Lernbereich ausgeben; Schülerdatei öffnen, alle fünf Lernwege durchlaufen, Ausdruck erzeugen, neu laden und prüfen, ob der Lernstand steht. **Ohne diesen Durchgang würde ich keinen Piloten starten.**
2. **Kognaten-Entscheidung treffen und umsetzen** – sonst ist der Erstellungsweg bei genau den Texten unangenehm, für die er gedacht ist.
3. **Kurzanleitung aktualisieren**, um Lernbereiche ergänzen, Knopfnamen richtigstellen.
4. **Wording vereinheitlichen** (ein Name je Sache).
5. **Fortsetzungsdokument nachziehen.**

**Nicht vor dem Piloten:** neue Funktionen. Der Funktionsumfang trägt; was fehlt, ist Nachweis und Übergabe.

**Für den Piloten selbst:** Eine Lerngruppe, ein Halbjahr, ein Lernbereich, ein Rückkanal, der nicht im Produkt steckt – ein Zettel oder ein Gespräch. Weil das Produkt keine Nutzungsdaten sendet und nicht senden soll, ist die Beobachtung des Piloten eine organisatorische Aufgabe, keine technische.

---

## 7. Fragen an die Gegenprüfung

Hier halte ich meine eigenen Entscheidungen für angreifbar. Widerspruch ist der Zweck dieses Dokuments.

1. **Alles in eine Datei.** Ein Lernbereich fasst bis zu 40 Pakete. Bei 40 × 60 Vokabeln mit Beispielsätzen liegt die Datei grob bei 1,5–2 MB. Ist die Obergrenze von 40 sinnvoll gewählt, oder sollte sie an der Dateigröße hängen statt an der Paketzahl?

2. **Lernstand an der Bereichskennung.** Eine Lehrkraft, die aus Versehen einen *neuen* Bereich statt einer Bearbeitung anlegt, setzt damit den Lernstand ihrer Lerngruppe zurück, ohne es zu merken. Ich habe das über die Oberfläche entschärft („Speichern und neu ausgeben" ist der Normalweg), aber nicht verhindert. Sollte es eine Warnung geben, wenn ein neuer Bereich dieselben Pakete enthält wie ein bestehender?

3. **Der wiederholte Tabellenkopf im Ausdruck ist weggefallen.** Mit der Umstellung von Tabelle auf Liste gibt es auf Seite 2 keine Spaltenüberschriften mehr – es gibt keine Spalten. Ich halte das für einen Gewinn (fett = Wort, Anführungszeichen = Satz, darunter Deutsch). Zweite Meinung?

4. **Der Vermerk „© OHM" steht nur auf der letzten Seite.** `position: fixed` wird von Chrome im Druck nicht je Seite wiederholt (gemessen an einem erzeugten PDF: landete oben auf Seite 2). Der einzige zuverlässige Weg wäre `<tfoot>` einer Tabelle – wofür die Liste wieder eine Tabelle werden müsste. Ist der Vermerk auf jeder Seite den Rückschritt wert?

5. **Wiederholte Beschriftungen im Ausdruck weggelassen.** Die gelieferte Vorlage schrieb vor jede Zeile `context/example:` und `translation:`. Ich habe das weggelassen und lasse Typografie die Unterscheidung tragen – bei 30 Vokabeln wären es 90 Wörter, die niemand liest. Der Auftraggeber ist informiert und hat nicht widersprochen. Ist das gegenüber schwächeren Lesenden vertretbar?

6. **Die Kurszeile liegt im `localStorage`.** Nicht im Paket (ein Paket wandert zwischen Lehrkräften und Halbjahren, der Kurs nicht) und nicht im Seitenzustand (sonst tippt man sie bei zwanzig Paketen zwanzigmal). Richtiger Ort?

7. **Erzeugte Motive statt Fotos.** Ist das gestalterisch tragfähig, oder wirkt es bei sechs Paketen nebeneinander beliebig? Die Verteilung ist nach dem ersten Anlauf nachgebessert worden (Murmur3-Lawine, 12 Drehungen, 3 Maßstäbe), aber die Frage ist ästhetisch, nicht rechnerisch.

8. **Der grundsätzliche Zuschnitt.** Ein Produkt, das Lehrkräften bewusst keine Einsicht in Lernstände gibt, ist im Schulmarkt ungewöhnlich. Es ist eine bewusste Entscheidung des Auftraggebers. Übersehe ich einen Fall, in dem das im Unterrichtsalltag zum Problem wird – und lässt er sich lösen, ohne die Entscheidung aufzugeben?

9. **Testabdeckung.** 33.450 Zeilen Test zu 30.100 Zeilen Produktivcode. Ist das Verhältnis ein Zeichen von Sorgfalt oder von Überprüfung an den falschen Stellen? Konkret: Der Anteil der Prüfungen, die CSS-Regeln am Text des Stylesheets festhalten statt am gerenderten Ergebnis, ist gewachsen.

10. **Was auf dieser Liste fehlt.** Die ehrlichste Frage: Welchen Risikoposten habe ich nicht genannt, weil ich zu nah dran bin?
