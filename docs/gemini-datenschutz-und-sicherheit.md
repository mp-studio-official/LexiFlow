# Der optionale Gemini-Assistent: Datenschutz- und Sicherheitsbericht

Stand: Sprint 4C, Branch `sprint/4c-optional-gemini-assistant`, Commit `2c8cefa`.
Nicht nach `main` gemergt, kein Tag.

Dieser Bericht sagt, was der optionale Assistent tut, was er ausdrücklich nicht
tut, was davon durch Tests abgesichert ist – und was noch niemand nachgeprüft
hat. Der letzte Teil ist der wichtigste.

---

## 1. Der Grundsatz

LexiFlow bleibt vollständig ohne Gemini nutzbar. Der Assistent ist eine Zutat
für Lehrkräfte bei der Materialerstellung, kein Bestandteil des Lernens.

Die bisherige Zusage „keine fremden Requests" gilt weiterhin – jetzt genauer
formuliert:

| Lage | Was ins Netz geht |
| --- | --- |
| Kein Schlüssel eingetragen | **nichts** |
| Schlüssel eingetragen, kein Knopf gedrückt | **nichts** |
| Schlüssel eingetragen und eine Aktion ausgelöst | genau die Inhalte, die vor dem Klick benannt sind |
| Lernbereich, Lerndatei, Lernlaufzeit | **nichts** – dort ist kein Gemini-Code |

Ohne eingetragenen Schlüssel rendern die Aktionen in den Werkstätten gar nichts.
Es gibt keinen ausgegrauten Knopf und keinen Hinweis auf eine Funktion, die man
erst einrichten müsste.

---

## 2. Was übertragen wird

Jede Fähigkeit trägt ihre eigene Liste (`src/ai/gemini/capabilities.ts`,
`TRANSMITTED`). Dieselbe Liste zeigt die Oberfläche **vor** der Anfrage an –
sie ist nicht Dokumentation neben dem Code, sondern der Text, den der Code
selbst ausgibt.

| Fähigkeit | Was hinausgeht |
| --- | --- |
| Übersetzung vorschlagen | die englische Lernform; der eine Satz, in dem sie vorkommt; Jahrgang und GeR-Niveau |
| Eintrag ergänzen | Lernform, bisherige Bedeutungen, Jahrgang, GeR-Niveau |
| Beispielsätze vorschlagen | Lernform, Bedeutungen, die vorhandenen Sätze **dieser** Vokabel, Jahrgang, GeR-Niveau |
| Beispielsatz vereinfachen | der eine Satz, Jahrgang, GeR-Niveau |
| Weitere Empfehlungen aus dem Text | die lokal gefundenen Wortkandidaten, je **ein** Satz je Kandidat, Jahrgang, GeR-Niveau |
| Vorschläge zu einem Thema | das Thema, Jahrgang, GeR-Niveau, ein begrenzter Auszug vorhandener Stichwörter |
| Lernform prüfen | die englische Lernform, die Wortart |

### Was nie übertragen wird

* **Kein vollständiger Quelltext.** Auch nicht bei der Textempfehlung: Der
  eingefügte Text wird lokal in Kandidaten zerlegt, und nach draußen geht diese
  Liste, gedeckelt auf 60 Kandidaten mit je einem Satz. Ein Aufsatz, in dem ein
  Wort vorkommt, verlässt das Gerät nicht, weil jemand „Empfehlungen" geklickt
  hat.
* Keine Namen und keine personenbezogenen Daten.
* Keine Lernstände. Der Assistent wird im Lernbereich nicht einmal geladen.
* Keine Paket- oder Eintragskennungen. Die Kandidaten bekommen neutrale
  Schlüssel (`c1`, `c2` …), die nur innerhalb einer Anfrage gelten.
* Keine anderen Vokabeln eines Pakets – außer dem ausdrücklich benannten,
  begrenzten Stichwortauszug bei „Vorschläge zu einem Thema".

Marcs Vorgabe erlaubt einen vollständigen Text bei einer ausdrücklich
gestarteten Textanalyse. Erlaubt ist nicht gefordert: Der bestehende Weg über
Kandidaten liefert dieselbe Empfehlung, ohne die Erlaubnis in Anspruch zu
nehmen. `sendsFullText` steht deshalb bei allen sieben Fähigkeiten auf `false`,
und ein Test hält das fest – wer je eine Fähigkeit baut, die den ganzen Text
sendet, muss das Feld setzen und den Test bewusst anfassen.

---

## 3. Der Schlüssel

### Wo er liegt

* **Standard: nur im Arbeitsspeicher.** Ein Neuladen vergisst ihn.
* **Auf Wunsch: `localStorage`**, ausschließlich in der Lehrkraftanwendung. Das
  Kästchen ist aus, bis jemand es setzt, und zeigt danach den **tatsächlichen**
  Zustand (`isRemembered()`): In einem privaten Fenster kann das Merken
  scheitern, und ein Kästchen, das gesetzt aussieht, ohne dass etwas gemerkt
  wurde, wäre eine Lüge.
* „Zugangsdaten vergessen" räumt beide Speicher.

### Ehrlich benannte Grenze

LexiFlow hat kein Backend. Ein gemerkter Schlüssel liegt im Speicher des
Browsers und kann dort nicht so gut geschützt werden wie hinter einem Server.
Die Oberfläche sagt das (`KEY_STORAGE_NOTICE`), ohne es zu beschönigen; ein Test
verbietet die Wörter „sicher verwahrt" und „verschlüsselt" in diesem Hinweis.
Gegen einen Angreifer mit Zugriff auf das Gerät hilft hier nichts.

### Wogegen vorgesorgt ist

Gegen die alltäglichen Wege, auf denen Geheimnisse abfließen:

* Der Schlüssel ist ein Gegenstand (`class ApiKey`) und keine Zeichenkette.
  `toJSON`, `toString` und die Node-Inspektion geben eine **Maske** zurück
  (`AIza…4f2c`). Ein versehentlich protokollierter Zustandsbaum enthält ihn
  nicht.
* Der Wert ist eine private Klasseneigenschaft (`#value`), kein Feld – ein
  `{...credentials}` in irgendeinem Reducer kopiert ihn nicht mit.
* Herausgelesen wird er nur über `reveal()`. Diese Stelle ist im Quelltext
  zählbar: heute genau zwei Aufrufer.
* Er steht **im Header** (`x-goog-api-key`) und nicht in der Adresse. Adressen
  landen in Server-Logs, Proxy-Logs, im Verlauf und in `Referer`-Kopfzeilen.
* Er wird nach dem Übernehmen **nie wieder vollständig angezeigt**. „Anzeigen"
  zeigt, was gerade getippt wird, und schaltet nach zehn Sekunden von selbst
  zurück.
* Der Anbieter hält ihn nicht fest, sondern holt ihn bei jeder Anfrage neu.
  „Vergessen" wirkt sofort und überall.

### Wo er nachweislich nicht vorkommt

Geprüft durch Tests: Anfragerumpf, URL, Fehlermeldungen der Oberfläche,
`JSON.stringify` eines Zustands, Template-Literale. Geprüft durch
`verify:portable`: die weitergegebenen HTML-Dateien.

---

## 4. Die Lerndatei

Das ist die Zusage, die den Assistenten überhaupt vertretbar macht.

`npm run verify:portable` bricht ab, wenn in `LexiFlow-Lernlaufzeit.html` eines
davon vorkommt: `generativelanguage.googleapis.com`, `x-goog-api-key`,
`lexiflow.gemini.key`, `GEMINI_BASE_URL`, `generateContent`. Eine Lerndatei kann
also gar nicht ins Netz telefonieren, unabhängig davon, was in der
Lehrkraftanwendung eingerichtet ist.

Die Trennung entsteht baulich: `StudentApp.tsx` kennt weder die
Einrichtungsseite noch die Werkstätten. Die Prüfung stellt fest, ob das so
geblieben ist – ein einziger unbedachter Import würde den ganzen Zweig
hineinziehen und die Prüfung umwerfen.

Größe der Lernlaufzeit nach Sprint 4C: **667,5 KiB** (vorher 667,4 KiB; die
0,1 KiB sind eine CSS-Regel). Schranke: 1024 KiB.
Lehrkraftdatei: 9467,7 KiB, Schranke 12 MiB.

In der Lehrkraftdatei **darf** die Adresse stehen – ein Schlüssel niemals.
Auch das wird geprüft, nicht weil ein Programmierfehler das erzeugen könnte,
sondern weil ein menschlicher es könnte: ein Schlüssel, der zum Ausprobieren
kurz in eine Konstante geschrieben und dort vergessen wird.

---

## 5. Quelltexte sind nicht vertrauenswürdig

Der Text, aus dem eine Lehrkraft Vokabeln zieht, kommt aus dem Internet, aus
einer PDF oder von einer Schülerin. Er kann einen Satz enthalten wie „Ignoriere
die vorherigen Anweisungen". Drei Schichten greifen ineinander:

1. **Einzäunen.** Fremder Text steht zwischen Markierungen mit einer
   Zufallskennung je Anfrage (`<<<QUELLE-a1b2…>>>`). Wer den Text schreibt,
   kennt die Kennung nicht. Ein fester Zaun wäre nach einmal Hinsehen bekannt.
2. **Entschärfen.** `asData` wirft Steuerzeichen und unsichtbare Richtungs- und
   Breite-null-Zeichen weg, kürzt hart (ohne „…", das zum Erfinden einlädt) und
   entfernt die Kennung aus dem Inhalt.
3. **Begrenzen.** Jede Antwort muss einem festen Schema genügen, und die
   Textempfehlung darf **nur Schlüssel** zurückgeben, die sie selbst bekommen
   hat.

Die dritte Schicht ist die belastbare. Die ersten beiden erschweren den Angriff;
erst das Schema macht den Erfolg wertlos: Ein Modell, das der Einflüsterung
folgt, kann inhaltlich danebenliegen, aber keine Vokabel unterschieben, die im
Text nie stand.

Ergänzend: In keiner Anfrage steht `tools`. Kein `googleSearch`, kein
`urlContext`, keine Funktionsaufrufe – ein Modell, das im Netz nachsehen darf,
trüge den Schülertext weiter, und ein präparierter Quelltext hätte damit einen
Weg nach draußen.

---

## 6. Vorschläge bleiben Vorschläge

Jeder Gemini-Vorschlag trägt intern Fähigkeit, Modellkennung, Zeitpunkt und
Status. Der Anfangszustand ist **immer** `ungeprüft` und lässt sich nicht
übergeben – ein Aufrufer, der `uebernommen` setzen könnte, täte es irgendwann.

* Nichts wird automatisch übernommen, nichts ohne Bestätigung gespeichert.
* Nichts von Hand Eingetragenes wird überschrieben: Übernehmen heißt ergänzen
  (mit Semikolon, ohne Dubletten, über dieselben Funktionen wie das Wörterbuch).
* Auch ein `ok` der Lernformprüfung ist ein Vorschlag, kein Häkchen. Eine
  grammatische Lernform gilt nicht als richtig, weil ein Modell das gesagt hat.
* Deutsche Alternativen kommen als getrennte Einträge, nicht als eine
  Zeichenkette mit Semikola. Die sichtbare Kurzform entsteht erst in der
  Oberfläche – was einmal zusammengeklebt ist, wird nie wieder sauber getrennt.
* Herkunftsvermerke gehören in die Lehrkraftansicht. `stripProvenance` entfernt
  sie rekursiv vor dem Export.
* Die Reihenfolge bleibt: erst das Offline-Wörterbuch und die deterministischen
  lokalen Regeln, dann optional das lokale Browsermodell, und erst danach – nur
  auf Klick – Gemini.

---

## 7. Fehler

Der Rumpf einer Google-Fehlerantwort wird **gelesen**, um den Fall einzuordnen,
und kein Zeichen daraus wird angezeigt. Eine solche Antwort enthält den Grund,
oft ein Stück der Anfrage, gelegentlich eine Adresse – und sie ist auf Englisch.

| Fall | Meldung sagt | Erneuter Klick sinnvoll |
| --- | --- | --- |
| kein Schlüssel | wo das Feld ist | – |
| Schlüssel abgelehnt (400 `API_KEY_INVALID`, 401) | vollständig kopieren, neu eintragen | nein |
| keine Berechtigung (403) | Berechtigung in der Google-Konsole prüfen | nein |
| Modell unbekannt (404) | anderes Modell wählen | nein |
| Kontingent (429) | später, oder Konsole ansehen | ja |
| Fehler bei Google (5xx) | ein Versuch lohnt sich meist | ja |
| inhaltlich gesperrt | Text oder Thema anders fassen | – |
| Antwort unbrauchbar | nichts übernommen | ja |
| Zeitüberschreitung / kein Netz / Abbruch | je eigene Meldung | ja / ja / nein |

Ein ungültiger Schlüssel kommt bei Gemini als **400** mit
`reason: API_KEY_INVALID`, nicht als 401. Ohne den Blick in den Rumpf bekäme
ausgerechnet die häufigste Fehleingabe die unbrauchbarste Meldung.

**Nie wird von selbst wiederholt.** Ein automatischer zweiter Versuch bei 429
macht aus einem überschrittenen Kontingent zwei, und beide gehen auf dieselbe
Rechnung. Der Knopf „Noch einmal versuchen" erscheint nur, wo das Aussicht hat.

---

## 8. Was geprüft ist – und was nicht

### Geprüft (automatisiert, ohne eine einzige echte API-Anfrage)

97 Tests unter `src/ai/gemini`, eingebettet in 2053 Unit-Tests insgesamt, dazu
156 E2E, 29 Portable-E2E, `verify:portable` und der Portable-Build. Alle
verwenden `TEST_API_KEY` – einen Wert, der auf den ersten Blick als Attrappe zu
erkennen ist, damit niemand versucht ist, ihn durch einen echten zu ersetzen.

Belegt sind unter anderem: Der Schlüssel steht nicht in der Adresse und nicht im
Rumpf. Keine Anfrage ohne ausdrückliche Aktion – auch nicht beim Öffnen einer
Seite. Kein Werkzeug aktiviert. Timeout, Abbruch, 400/401/403/404/429/500,
ungültiges JSON, falsches Schema, abgeschnittene und gesperrte Antworten.
Manuelle Eingaben werden nicht überschrieben. Gemini-Ausgaben bleiben
ungeprüft. Die Lernlaufzeit enthält keine Gemini-Spur. Ohne Schlüssel ist die
Anwendung unverändert – das belegen die 862 bestehenden Werkstatt-Tests, die
alle ohne Schlüssel laufen.

### Nicht geprüft

* **Safari.** Kein automatisierter Test in diesem Projekt ist ein
  Safari-Nachweis. Chromium- und fake-indexeddb-Tests sagen über Safari nichts.
* **Eine echte API-Anfrage.** Es wurde nie eine gestellt. Ob Google die Anfragen
  in dieser Form annimmt, ob die Modellkennungen stimmen und ob
  `responseJsonSchema` so wirkt wie erwartet, weiß erst der erste Lauf mit einem
  echten Schlüssel.
* **Gemini-Aufrufe aus Safari über `file://`.** Siehe unten – das ist das
  größte offene Risiko.

---

## 9. Das größte offene Risiko: `file://` und CORS

Eine Anfrage aus einer HTML-Datei, die per Doppelklick geöffnet wurde, hat den
Ursprung `null`. Ob die Gemini-API eine solche Anfrage annimmt, ist **nicht
geprüft** und lässt sich ohne echten Schlüssel auch nicht prüfen. Es ist gut
möglich, dass Safari oder Google sie ablehnt.

Falls das so ist, gilt Marcs Vorgabe, und sie ist richtig: **nicht umgehen und
keinen versteckten Proxy einbauen.** Die Folge wäre dann schlicht: Der
Assistent funktioniert in der über einen Server aufgerufenen Lehrkraftanwendung
und nicht in der Einzeldatei. Das wäre eine hinnehmbare Einschränkung –
niemand braucht ihn zum Lernen, und Lehrkräfte können die Anwendung auch aus
einem lokalen Server oder von einer Adresse aus öffnen.

Was in diesem Fall passiert, ist heute schon in Ordnung: Der Transport meldet
„Keine Verbindung zur Gemini-API" und reicht keinen fremden Fehlertext durch.
Sollte sich der Fall bestätigen, gehört ein eigener Hinweis auf die
Einrichtungsseite – der lässt sich erst formulieren, wenn bekannt ist, wie der
Fehlschlag aussieht.

---

## 10. Der manuelle Abnahmetest

Mit eigenem Schlüssel, in echtem Safari, in `LexiFlow-Lehrkraft.html` über
`file://`.

1. **Einrichten.** Material → „Optionaler Gemini-Assistent". Schlüssel
   eintragen, „Anzeigen" prüfen (schaltet nach zehn Sekunden zurück),
   „Schlüssel übernehmen". Erwartung: Das Feld ist leer, der Status zeigt eine
   Maske, „nur für diese Sitzung".
2. **Verbindung testen.** Erwartung: „Verbindung steht" – oder eine deutsche
   Meldung ohne englischen Originaltext, ohne Adresse, ohne Schlüssel. **Falls
   hier ein Verbindungsfehler kommt: das ist der `file://`-Fall aus Abschnitt 9.
   Bitte so berichten und nicht umgehen.**
3. **Eine Übersetzung erzeugen.** Import → Text einfügen → Empfehlungen
   generieren → bei einer Zeile „Gemini-Übersetzungen vorschlagen". Erwartung:
   Der Satz darüber nennt vorher, was übertragen wird; die Vorschläge tragen
   „Gemini, ungeprüft"; ein Klick **ergänzt** ein bereits gefülltes Feld.
4. **Einen Beispielsatz erzeugen.** In derselben Zeile „Beispielsatz mit Gemini
   vorschlagen". Erwartung: Der Vorschlag steht getrennt und wird erst durch
   „übernehmen" oder „ersetzen" wirksam.
5. **Eine Textempfehlung erzeugen.** In den Einstellungen der Kandidatenprüfung
   „Weitere Empfehlungen mit Gemini". Erwartung: Neue Zeilen kommen dazu,
   beantwortete bleiben unangetastet.
6. **Zugangsdaten vergessen.** Erwartung: Status „Nicht eingerichtet", und die
   Knöpfe aus 3–5 sind verschwunden.
7. **Neu laden und prüfen.** Erwartung: weiterhin nicht eingerichtet.
8. **Merken prüfen.** Schlüssel erneut eintragen, diesmal mit Häkchen, neu
   laden. Erwartung: Er ist noch da und wird als „auf diesem Gerät gemerkt"
   angezeigt – aber nie im Klartext.
9. **Lernbereich exportieren.** Die erzeugte Datei im Texteditor öffnen und nach
   `generativelanguage`, `x-goog-api-key` und dem eigenen Schlüssel suchen.
   Erwartung: kein Treffer. (Dasselbe prüft `npm run verify:portable`
   automatisch für die Lernlaufzeit.)
10. **Die Lerndatei öffnen** und darin arbeiten. Erwartung: keine Spur des
    Assistenten, keine Netzanfrage.

Der Safari-Test zum Lernstand aus Sprint 4B.2 bleibt davon unberührt und steht
weiterhin aus.

---

## 11. Was noch offen ist

* Der Abnahmetest oben, insbesondere die `file://`-Frage.
* „Eintrag ergänzen", „Beispielsatz vereinfachen" und „Vorschläge zu einem
  Thema" sind im Anbieter vollständig gebaut und getestet, haben aber noch
  keinen eigenen Knopf in der Oberfläche. Sie laufen heute nur über die
  bestehenden Wege des lokalen Modells mit.
* „Lernform prüfen" wird bisher nur vom Verbindungstest benutzt. Ein eigener
  Knopf an der Zeile wäre der nächste sinnvolle Schritt – zusammen mit einer
  Ansicht für die Herkunftsvermerke, die heute erfasst, aber nirgends angezeigt
  werden.
* Eine Anzeige der verbrauchten Anfragen wäre hilfreich, ist aber ohne
  Rückmeldung von Google nur eine Schätzung.
