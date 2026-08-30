# LexiFlow

Vokabeltrainer-PWA für Englisch–Deutsch, Gymnasium NRW (Jahrgänge 5–10, EF, Q1, Q2).
Freiwillige Lernhilfe – ohne Konten, ohne Backend, ohne KI, ohne Tracking.

* **Sprint 1** – vollständiges lokales Grundsystem.
* **Sprint 1.1** – Datenintegrität und Lernlogik: paketbezogene Schlüssel,
  verlustfreier Editor, sicheres Aktualisieren, getrennte Lernstände je
  Richtung, Wiedervorlage innerhalb einer Runde.
* **Sprint 1.2** – Lernqualität und Barrierefreiheit: rezeptiv vor produktiv,
  gemischte Reihenfolge mit Geschwisterabstand, Kategorie „Neu“ in der
  Lernstandsanzeige, automatisierte Axe-Prüfung.

---

## Schnellstart

```bash
npm install
npm run dev          # http://localhost:5173
```

Weitere Befehle:

| Befehl | Zweck |
| --- | --- |
| `npm run typecheck` | TypeScript im Strict Mode prüfen (`tsc --noEmit`) |
| `npm test` | Unit-, Komponenten- und Integrationstests (Vitest) |
| `npm run test:watch` | Tests im Watch-Modus |
| `npm run e2e` | Alle Playwright-Tests (baut vorher automatisch) |
| `npm run e2e:smoke` | Nur der End-to-End-Smoke-Test |
| `npm run e2e:a11y` | Nur die Barrierefreiheitstests (Axe, Tastatur, 390 px) |
| `npm run build` | Typecheck + Produktions-Build nach `dist/` |
| `npm run preview` | Produktions-Build lokal ausliefern (Port 4173) |
| `npm run verify` | Typecheck → Tests → Build → alle E2E-Tests |

Für die E2E-Tests wird einmalig ein Browser benötigt:

```bash
npx playwright install chromium
```

Ist bereits ein Chromium vorhanden, kann sein Pfad über
`PLAYWRIGHT_CHROMIUM_PATH=/pfad/zu/chromium` gesetzt werden.

### Zum Ausprobieren

Unter `examples/` liegen eine Beispiel-CSV und ein fertiges Beispielpaket.
Beide werden von `src/domain/examplePack.test.ts` bei jedem Testlauf geprüft.

---

## Grundprinzipien in der Umsetzung

| Prinzip | Wie es technisch abgesichert ist |
| --- | --- |
| Keine Konten, keine Lehrkraft-Einsicht | Es existiert keine Auth-Schicht und kein Rückkanal. Der Lehrkraft-Bereich ist eine reine Editier-Oberfläche. |
| Lernstände nur lokal | `directionProgress`/`packProgress` liegen in IndexedDB. Der einzige Schreibpfad ist `src/data/progressRepo.ts`; es gibt keine Export- oder Sendefunktion dafür. Ein Test prüft, dass Exporte keine Lernstandsfelder enthalten. |
| Keine Telemetrie, keine externen Ressourcen | Keine Analytics-Abhängigkeit, keine Web-Fonts, keine CDN-Einbindung. Der Service Worker cached ausschließlich eigene Assets (`runtimeCaching: []`). Der E2E-Smoke-Test schlägt fehl, sobald ein Request an einen fremden Host geht. |
| Ohne Backend und ohne KI lauffähig | Reine Client-App, statisch deploybar. `AiProvider` ist vorbereitet, aber der Standardanbieter (`nullAiProvider`) wird nie aufgerufen. |
| Keine manipulativen Mechanismen | Kein Punktesystem, keine Serien-Belohnung, keine Rangliste. Sichtbar ist nur der eigene Leitner-Stand. |

---

## Architektur

```
src/
  domain/        reine Logik, ohne React und ohne IndexedDB
    schema.ts        Zod-Schemata, Richtungen, abgeleitete Typen
    cefr.ts          NRW-Jahrgang → GeR-Niveau
    normalize.ts     Normalisierung, Levenshtein, Bedeutungs-Splitting
    answerCheck.ts   Antwortprüfung (richtig / fast richtig / falsch)
    leitner.ts       Leitner-System, Mastery über alle aktiven Richtungen
    exercises.ts     Aufgabenbau und Auswahl der (Vokabel, Richtung)-Paare
    session.ts       Warteschlange einer Runde inkl. Wiedervorlage
    packDiff.ts      Fingerprint lernrelevanter Felder, Paketvergleich
    vocabpack.ts     Serialisierung des .vocabpack.json
    migrations.ts    Migrationskette für ältere Dateiformate
  data/          Persistenz (Dexie/IndexedDB)
    db.ts            Schema-Versionen 1 → 3 inklusive Datenmigration
    packRepo.ts      Pakete lesen/schreiben, Lernstände abgleichen
    progressRepo.ts  Lernstände je Paket, Vokabel und Richtung
  import/        Importpipeline
    csv.ts           CSV-Parser + Erkennung von Trennzeichen, Paste-Parser
    xlsx.ts          minimaler XLSX-Leser (fflate + DOMParser)
    columnDetect.ts  automatische Spaltenerkennung
    draft.ts         Entwurfszeilen (alle Felder), Prüfung, Duplikate
  ai/AiProvider.ts   vorbereitete, austauschbare Schnittstelle (ungenutzt)
  ui/            Bausteine, Importlogik (usePackImport), Bestätigungsdialog
  routes/        Seiten (Start, Lehrkraft, Schülerbereich, Datenschutz)
e2e/             Playwright: Smoke-Test und Barrierefreiheitstests
examples/        Beispiel-CSV und Beispielpaket
```

Die Abhängigkeitsrichtung ist strikt: `routes → data → domain`. `domain` kennt
weder React noch die Datenbank und ist deshalb vollständig ohne Mocks testbar.

### Routen

| Pfad | Inhalt |
| --- | --- |
| `/` | Startseite mit „Lernen“ und „Material erstellen“ |
| `/material` | Lehrkraft-Bereich (ohne Login): Paketliste, Export, Löschen |
| `/material/import` | Importassistent: Quelle → Vorschau → Metadaten |
| `/material/:packId` | Paketeditor (Metadaten und Vokabeln) |
| `/lernen` | Lokale Paketsammlung mit Lernstand |
| `/lernen/:packId` | Paketdetails, Leitner-Übersicht je Richtung, Optionen |
| `/lernen/:packId/uebung` | Übungssitzung |
| `/datenschutz` | Was gespeichert wird und wie es gelöscht wird |

`HashRouter` statt `BrowserRouter`, damit Unterseiten auf GitHub Pages auch beim
direkten Aufruf und Neuladen funktionieren – ohne Server-Rewrites.

---

## Datenmodell

### Vokabeleintrag

```ts
interface VocabEntry {
  id: string;
  english: string;
  germanAnswers: string[];            // mindestens eine, alle gelten als richtig
  acceptedEnglishAnswers: string[];   // Varianten für die Richtung DE → EN
  partOfSpeech?: 'noun' | 'verb' | 'adjective' | 'adverb'
               | 'phrase' | 'preposition' | 'other';
  exampleSentences: { english: string; german?: string }[];
  topicTags: string[];
  notes?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  sourceType: 'manual' | 'import' | 'text-ai' | 'topic-ai';
}
```

Die Entwurfszeile des Editors (`DraftRow`) bildet **jedes** dieser Felder ab –
inklusive beliebig vieler Beispielsätze mit optionaler deutscher Entsprechung.
`src/import/draftRoundtrip.test.ts` sichert ab, dass Öffnen und unverändertes
Speichern denselben Eintrag ergibt.

### Paket-Metadaten

```ts
interface PackMeta {
  id: string;
  title: string;
  topic: string;
  grade: '5'|'6'|'7'|'8'|'9'|'10'|'EF'|'Q1'|'Q2';
  cefrLevel: 'A1+'|'A2'|'A2+'|'A2/B1'|'B1'|'B1+'|'B1/B2'|'B2'|'B2/C1';
  cefrLevelOverridden: boolean;
  direction: 'en-de' | 'de-en' | 'both';
  description?: string;
  createdAt: string;                  // ISO
  updatedAt: string;                  // ISO
}
```

GeR-Vorschlag: 5 → A1+, 6 → A2, 7 → A2+, 8 → A2/B1, 9 → B1, 10 → B1+,
EF → B1/B2, Q1 → B2, Q2 → B2/C1. Überschreibbar; die Abweichung wird vermerkt.

### Austauschformat `.vocabpack.json`

```jsonc
{
  "kind": "lexiflow.vocabpack",
  "formatVersion": 1,
  "app": { "name": "LexiFlow", "version": "0.1.0" },
  "meta":    { /* PackMeta */ },
  "entries": [ /* VocabEntry[] */ ]
}
```

Lernstände sind **nicht** Teil der Datei. `src/domain/migrations.ts` hebt ältere
Dateien schrittweise auf die aktuelle Version; unbekannt hohe Versionen werden
mit einer verständlichen Meldung abgelehnt, statt Felder still zu verlieren.

---

## Datenbankschema (IndexedDB via Dexie)

| Tabelle | Schlüssel | Inhalt |
| --- | --- | --- |
| `packs` | `id` | Paket-Metadaten |
| `packEntries` | `[packId+id]` | Vokabeln, Reihenfolge über `position` |
| `directionProgress` | `key = packId::entryId::direction` | Lernstand je Vokabel **und** Richtung |
| `packProgress` | `packId` | Rundenzähler, Antwortzähler |

```ts
interface EntryProgress {
  key: string;                  // `${packId}::${entryId}::${direction}`
  packId: string;
  entryId: string;
  direction: 'en-de' | 'de-en';
  box: 1 | 2 | 3 | 4 | 5;       // Leitner-Fach
  correctCount: number;
  wrongCount: number;
  streak: number;
  lastAnsweredAt?: string;
  dueAt: string;                // nächste Fälligkeit (ISO)
}
```

### Schema-Historie und Migration

**Version 1 (Sprint 1)** hatte zwei Konstruktionsfehler:

* `entries` nutzte `entry.id` als **globalen** Primärschlüssel. Zwei Pakete mit
  denselben Entry-IDs – etwa zwei Listen, die beide bei „1“ zu zählen beginnen –
  hätten sich gegenseitig überschrieben.
* `entryProgress` hatte den Schlüssel `packId::entryId`. Rezeptives und
  produktives Üben teilten sich damit einen Datensatz.

IndexedDB kann den Primärschlüssel einer bestehenden Tabelle nicht ändern.
Deshalb legt **Version 2** die Tabellen `packEntries` und `directionProgress`
neu an und kopiert die Daten im `upgrade`-Schritt; **Version 3** entfernt die
alten Tabellen. Die Zweiteilung ist nötig, weil in Version 2 noch aus den alten
Tabellen gelesen wird.

Migrationsverhalten im Detail:

* Alle Vokabeln werden vollständig übernommen (`position` bleibt erhalten).
* Bestehende Lernstände werden der **ersten aktiven Richtung** des jeweiligen
  Pakets zugeordnet: bei `en-de` und `both` also `en-de`, bei `de-en` eben
  `de-en`. Die Gegenrichtung startet bei `both` neu – das ist der einzige,
  bewusst in Kauf genommene Verlust. Er betrifft nur lokal vorhandene Daten aus
  Sprint 1; die App war nie veröffentlicht.
* Pakete und Paketstatistik bleiben unverändert.
* Eine frisch angelegte Datenbank wird direkt im Schema 3 erzeugt.

`src/data/migration.test.ts` legt eine echte Datenbank im alten Schema an,
öffnet sie mit der neuen Klasse und prüft das Ergebnis.

---

## Lernlogik

### Leitner mit fünf Fächern, getrennt je Richtung

Richtig → ein Fach weiter, falsch → zurück in Fach 1, „fast richtig“ → Fach
bleibt und die Aufgabe wird in ~10 Minuten erneut fällig. Wiederholungs-
intervalle der Fächer 1–5: sofort, 1, 3, 7, 21 Tage.

Bei `direction: 'both'` werden **EN→DE** und **DE→EN** vollständig unabhängig
geführt: eigener Datensatz, eigenes Fach, eigene Fälligkeit. Eine richtige
EN→DE-Antwort verändert DE→EN nicht. Eine Vokabel gilt erst dann als sicher,
wenn **alle aktiven Richtungen** Fach 5 erreicht haben; die Paketansicht zeigt
den rezeptiven und den produktiven Stand getrennt.

### Rezeptiv vor produktiv

Neue Vokabeln werden bei `both` zuerst **rezeptiv** (EN→DE) eingeführt. Die
produktive Richtung schaltet sich erst frei, wenn EN→DE Fach 2 erreicht hat –
also nach der ersten richtigen Antwort. Weil eine Runde aus dem Lernstand zu
Rundenbeginn geplant wird, taucht die Gegenrichtung frühestens in der **nächsten**
Runde auf, nie unmittelbar nach der ersten rezeptiven Antwort. Sonst wäre
„crowded → überfüllt“ direkt gefolgt von „überfüllt → crowded“ kein Abfragen,
sondern ein Erinnerungshinweis.

Pakete mit ausschließlich `de-en` sind davon nicht betroffen: Sie starten
unverändert sofort produktiv. Wurde produktiv einmal geübt, bleibt es
freigeschaltet – ein Rückfall auf Fach 1 sperrt nichts wieder.

### Reihenfolge und Abstände

Innerhalb gleichwertiger Prioritätsgruppen wird mit dem injizierbaren RNG
gemischt, damit nicht dauerhaft die Importreihenfolge geübt wird; mit festem
Seed bleibt jede Reihenfolge reproduzierbar. Die Priorität selbst bleibt
erhalten: fällig (niedrigstes Fach zuerst) vor neu vor noch nicht fällig.

Zwischen den beiden Richtungen derselben Vokabel liegen mindestens
`MIN_SIBLING_GAP` (3) andere Aufgaben. Lässt sich eine Kombination innerhalb der
Rundenlänge nicht regelkonform platzieren, entfällt sie und kommt in einer der
nächsten Runden dran. Auch Wiedervorlagen nach Fehlern halten diesen Abstand
ein; findet sich keine passende Stelle, unterbleibt die Wiedervorlage – die
Vokabel steht durch das zurückgesetzte Fach ohnehin bald wieder an.

Bei Paketen mit nur einer Richtung wird auch nur diese geführt. Wechselt die
Lernrichtung später, bleiben vorhandene Lernstände der anderen Richtung liegen
und zählen wieder mit, sobald sie erneut aktiviert wird.

### Wiedervorlage innerhalb der Runde

Eine Runde ist eine Warteschlange, keine feste Liste. Wer eine Aufgabe falsch
oder „fast richtig“ beantwortet, bekommt sie **einmal** später in derselben
Runde erneut – nach Möglichkeit mit mindestens zwei anderen Aufgaben dazwischen.
Ist die Runde dafür zu kurz, rückt die Wiederholung ans Ende. Jede Aufgabe
erscheint höchstens zweimal; auch die Wiederholung wird nicht erneut eingereiht,
eine Endlosschleife ist damit ausgeschlossen. Die Anzeige „Aufgabe 2 von 9“
wächst entsprechend mit.

### Antwortprüfung (unverändert aus Sprint 1)

Tolerant gegenüber allem, was nichts über Vokabelwissen aussagt:

* Groß-/Kleinschreibung, Mehrfach-Leerzeichen, geschützte Leerzeichen
* typografische Zeichen (`’ → '`, `– → -`, `…`)
* abschließende und führende Satzzeichen
* führende Artikel und Infinitiv-`to`, Klammerzusätze wie `(sich)` oder `[BE]`
* mehrere korrekte Übersetzungen – eine genügt

Ein kleiner Tippfehler (Levenshtein ≤ 1 bei 5–8 Zeichen, ≤ 2 ab 9 Zeichen) ergibt
**„fast richtig“**, nie „richtig“: Die Vokabel bleibt im selben Fach und kommt
in derselben Runde noch einmal. Bei Wörtern bis 4 Zeichen gibt es keine Toleranz
(`haus` ≠ `maus`).

Britische und amerikanische Schreibungen sowie Synonyme gelten nur dann als
richtig, wenn sie in `acceptedEnglishAnswers` hinterlegt sind – im Editor unter
„Details“ pflegbar. Es gibt bewusst **keine** semantische oder KI-gestützte
Bewertung im Schülerbereich.

---

## Übungsformen

| Form | Voraussetzung |
| --- | --- |
| Karteikarte | immer |
| Multiple Choice (4 Optionen) | mindestens 3 weitere Vokabeln im Paket |
| Offene Übersetzung | immer |
| Lückensatz mit Wortbank | produktive Richtung **und** Beispielsatz mit dem Stichwort |
| Lückensatz ohne Wortbank | dito |

Lückensätze verlangen die Zielsprache Englisch und zählen deshalb als
Richtung **DE→EN**. In einem rein rezeptiven Paket (`en-de`) stehen sie nicht
zur Verfügung; die Paketansicht sagt das ausdrücklich.

Ohne eigene Auswahl richtet sich die Übungsform nach Leitner-Fach und Richtung:
rezeptiv von Karteikarte über Multiple Choice zur offenen Übersetzung, produktiv
zusätzlich über Lückensätze mit und ohne Wortbank.

Reihenfolge: fällige Kombinationen zuerst (niedrigstes Fach zuerst), dann noch
nie geübte, dann die übrigen – innerhalb gleichwertiger Gruppen gemischt.

---

## Lernstandsanzeige

Die Fachgrafik hat eine eigene Spalte **„Neu“** vor Fach 1. Eine noch nie geübte
Vokabel steht damit nicht in Fach 1 – sonst sähe ein frisches Paket aus, als sei
bereits etwas bearbeitet worden, und die Zahlen widersprächen sich („Fach 1: 0“
bei gleichzeitig vier bereiten Aufgaben).

```
Neu: 4 · Fach 1: 0 · Fach 2: 0 · Fach 3: 0 · Fach 4: 0 · Fach 5: 0
```

Die Beschriftung der Grafik (`role="img"` mit `aria-label`) nennt dieselben
Kategorien, ergänzt um noch nicht freigeschaltete Vokabeln. Ist die produktive
Richtung bei `both` noch komplett gesperrt, steht dort statt der Grafik:

> Produktiv noch nicht begonnen – wird nach der ersten erfolgreichen rezeptiven
> Wiederholung freigeschaltet.

Die Zahl „Aufgaben jetzt bereit“ stammt aus **derselben** Funktion, die auch die
Sitzung plant (`countReady` → `eligibleTargets`). Ein neues `both`-Paket mit vier
Vokabeln zeigt deshalb vier bereite Aufgaben, nicht acht.

---

## Pakete aktualisieren, ohne Lernstände zu verlieren

Wird eine `.vocabpack.json` importiert, deren Paket-ID bereits vorhanden ist,
erscheint **vor** dem Speichern eine Bestätigung mit einer Vorschau:

> 12 Lernstände erhalten, 3 neue Vokabeln, 2 geänderte zurückgesetzt,
> 1 entfernte Vokabel gelöscht.

Verglichen wird ein Fingerprint über die **lernrelevanten** Felder:
`english`, `germanAnswers`, `acceptedEnglishAnswers` und `exampleSentences`.
Nicht enthalten sind `partOfSpeech`, `topicTags`, `notes`, `difficulty` und
`sourceType` – Korrekturen daran ändern nichts an der abgefragten Vokabel.
Auch Paket-Metadaten wie Titel, Thema oder Beschreibung setzen nie einen
Lernstand zurück, und das Umsortieren gleichwertiger Übersetzungen ebenso wenig.

Regeln:

* unbekannte Paket-ID → als neues Paket hinzufügen
* bekannte Paket-ID → Bestätigung, dann Abgleich
* gleicher Fingerprint → Lernstand bleibt (in allen Richtungen)
* neuer Eintrag → ohne Lernstand
* entfernter Eintrag → Lernstand wird gelöscht
* geänderter Eintrag → Lernstand dieses Eintrags wird zurückgesetzt

Dieselbe Logik greift beim Speichern im Paketeditor.

---

## Bedienung und Barrierefreiheit

* durchgehende Tastaturbedienung; sichtbare Fokusringe (`:focus-visible`,
  zusätzlich abgesichert für `forced-colors`)
* Multiple Choice und Wortbank zusätzlich über die Zifferntasten 1–4
* Enter prüft die Eingabe, danach liegt der Fokus auf „Weiter“
* Feedback wird über eine `aria-live="polite"`-Region angesagt
* Detailbereich der Vorschau als Disclosure mit `aria-expanded`
* Formularfelder mit `<label>`, Hinweisen und Fehlern über `aria-describedby`
* „Zum Inhalt springen“-Link, semantische Überschriftenhierarchie
* Farbpaare auf WCAG 2.2 AA ausgelegt; helles und dunkles Farbschema
* `prefers-reduced-motion` wird respektiert
* Zielgrößen ≥ 44 px in der Höhe für Schaltflächen und Optionen

### Automatisierte Prüfung

`e2e/a11y.spec.ts` prüft mit `@axe-core/playwright` (Regelsätze WCAG 2.0/2.1/2.2
Level A und AA) fünf Zustände: Startseite, Importvorschau samt geöffnetem
Detailbereich, Paketdetail mit Lernstand, laufende Übung und sichtbares Feedback
nach einer Antwort. Befunde der Stufen `serious` und `critical` lassen den Test
fehlschlagen.

Zusätzlich getestet:

* Skip-Link erhält als Erstes den Fokus und springt nach `Enter` in den Inhalt
* sichtbarer Fokusring (Outline ≥ 2 px) bei Tastaturnavigation
* der Hauptablauf – Übung starten, Lösung aufdecken, einschätzen, weiter – ist
  vollständig mit der Tastatur bedienbar, inklusive Zifferntasten bei Multiple
  Choice und Fokus auf „Weiter“ nach der Antwort
* 390 px Smartphone-Breite ohne horizontalen Seitenüberlauf auf Startseite,
  Schülerbereich, Datenschutz, Importvorschau, Paketdetail, Übung und Feedback
* die breite Lehrkraft-Tabelle scrollt in ihrem eigenen Container
  (`.table-wrap`), ohne die Seite zu verbreitern

---

## Deployment auf GitHub Pages

`.github/workflows/deploy.yml` prüft (Typecheck, Tests, E2E-Smoke) und
veröffentlicht `dist/`. Der Basis-Pfad kommt aus `LEXIFLOW_BASE`:

```bash
LEXIFLOW_BASE=/lexiflow/ npm run build
```

Die App ist installierbar (Manifest, Icons, Service Worker mit Precaching) und
funktioniert vollständig offline.

---

## Entscheidungen

1. **Zusammengesetzter Primärschlüssel `[packId+id]`** statt eines
   zusammengesetzten Strings: nativ von IndexedDB unterstützt, kein Parsen
   nötig, und `packId` bleibt als eigener Index nutzbar.
2. **Zwei Schemaversionen für einen Schlüsselwechsel.** Sauberer als ein Reset
   und der von Dexie vorgesehene Weg.
3. **Leitner mit fünf Fächern** statt SM-2. Nachvollziehbar erklärbar, gut
   testbar und ohne Belohnungsmechanik.
4. **Fingerprint ohne Metadaten.** Eine Tippfehlerkorrektur in einer Notiz darf
   niemandem den Lernstand kosten.
5. **Höchstens eine Wiederholung je Aufgabe und Runde.** Verhindert Drill und
   macht die Rundenlänge vorhersagbar (maximal doppelt so lang).
6. **Eigener CSV-Parser und eigener XLSX-Leser.** Für Vokabellisten wird nur
   Zelltext gebraucht; das spart eine große Tabellenbibliothek im Bundle.
7. **`HashRouter`** wegen statischem Hosting ohne Server-Rewrites.
8. **Lückensätze nur mit passendem Beispielsatz** – es werden keine Sätze
   erfunden. Die Importvorschau weist darauf hin.
9. **Lernstände nie im Export.** Weitergabe von Paketen soll niemals
   versehentlich Nutzungsdaten mitliefern.
10. **KI nur als Schnittstelle.** `AiProvider` definiert Vertrag und
    Datenschutzhinweise; aufgerufen wird nichts.
11. **Freischaltung über das Leitner-Fach statt über einen Zähler.** Fach 2 ist
    die vorhandene, erklärbare Größe für „einmal richtig gewusst“.
12. **Nicht platzierbare Kombinationen entfallen, statt den Abstand zu
    verletzen.** Eine kurze Runde wird lieber kürzer als didaktisch wertlos.
13. **Axe-Schwelle bei `serious`.** Best-Practice-Regeln (`minor`/`moderate`)
    blockieren nicht, werden im Fehlerfall aber mit ausgegeben.

## Bekannte Restprobleme und offene Fragen

* **Kein Zusammenführen über Paketgrenzen.** Zwei getrennt erstellte Pakete mit
  denselben Vokabeln bleiben zwei Pakete; Lernstände werden nicht geteilt.
* **Zuordnung nur über `id`.** Wird eine Vokabel mit neuer ID exportiert (etwa
  aus einer neu aufgebauten Liste), gilt sie als neu, auch wenn das Stichwort
  identisch ist. Eine zusätzliche Zuordnung über `english` wäre denkbar.
* **Migration bei `both`.** Vorhandene Lernstände landen in der rezeptiven
  Richtung; die produktive beginnt neu.
* **Wiederholung am Rundenende.** Ist die Runde sehr kurz, kann die
  Wiederholung direkt auf den ersten Versuch folgen.
* **Stille Verkürzung von Runden.** Lässt sich die Gegenrichtung nicht
  regelkonform einplanen, wird die Runde kürzer als gewählt, ohne dass die
  Oberfläche das begründet.
* **Ausgelassene Wiedervorlage.** Findet sich keine zulässige Stelle, entfällt
  die Wiederholung in dieser Runde kommentarlos.
* **Axe deckt nicht alles ab.** Automatische Prüfungen finden etwa 30–40 % der
  Barrieren; ein manueller Screenreader-Durchgang steht aus.
* **Nur Chromium in der E2E-Stufe.** Firefox und WebKit werden nicht geprüft.
* **Artikel bei Substantiven** sind weiterhin optional („Nachbarschaft“ =
  „die Nachbarschaft“). Für die Oberstufe evtl. zu großzügig.
* **Kein automatischer Barrierefreiheitstest.** Ein Axe-Durchlauf in der
  E2E-Stufe wäre der nächste sinnvolle Schritt.
* **PWA-Update** läuft still (`autoUpdate`), ohne Hinweis auf eine neue Version.
