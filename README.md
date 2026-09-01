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
* **Sprint 1.3** – Leitner-Korrektheit und transparente Rundenplanung: eine
  zentrale Planungsfunktion, keine vorgezogenen Karten, ehrliche Rundenwahl und
  wahrheitsgemäße Wiedervorlage-Ankündigung.
* **Sprint 1.3a** – Schreibvorgänge synchronisiert: weitergeschaltet wird erst
  nach erfolgreicher Speicherung des Lernstands.
* **Sprint 3A** – Editorial-Creator-Design: ein dokumentiertes Token-System,
  lokal gebündelte Schriften, eine Creator-Studio-Shell und vier vollständig
  überarbeitete Oberflächen. Funktional ändert sich nichts.
* **Sprint 4A.1a** – Portabler Build ohne verschachtelten Paketmanager: Die
  Orchestrierung ruft Vite jetzt programmatisch auf statt über `npx`, das auf
  echten Rechnern hängen blieb.
* **Sprint 4A.1** – Portable Einzeldateien: LexiFlow als eine HTML-Datei für die
  Lehrkraft, dazu ein Export, der aus einem Paket eine eigenständige
  Schülerdatei macht. Beide laufen per Doppelklick, ohne Server und ohne Netz.
* **Sprint 3B.2b2** – Gewählte Übungsformen sind verbindlich: Wer im freien Üben
  eine Aufgabenart auswählt, bekommt genau diese – notfalls eine kürzere Runde
  statt einer stillschweigenden Ersatzform.
* **Sprint 3B.2b1** – Freies Üben bleibt einstellbar: „Direkt starten“ für die
  schnelle Runde, „Runde anpassen“ für Richtung, Umfang und Übungsformen – ohne
  URL-Parameter von Hand.
* **Sprint 3B.2b** – Selbsttest mit ehrlicher Auswertung: sich selbst prüfen,
  Fehler gezielt wiederholen, ohne Note und ohne jede Wirkung auf den Lernstand.
  Die Paketseite hat dafür genau einen Einstieg je Lernweg.
* **Sprint 3B.2a** – Durchsehen und Karten: zwei freiwillige Lernwege im
  Schülerbereich, unabhängig von Fälligkeiten und ohne jede Wirkung auf den
  Lernstand.
* **Sprint 3B.1c** – Kontrastfehler beim Routenwechsel entfernt: Die
  Seitennavigation wechselt ihre Zustände ohne Zwischenbild.
* **Sprint 3B.1b** – Vorbereitung kontrollierbar und Wortformen im Satz
  eindeutig: Fortschritt und „Abbrechen“ wirken auch beim ersten Modelldownload,
  ungültige Texte laden kein Modell, und mehrdeutige Formen wie `lives` werden
  am Satzkontext entschieden.
* **Sprint 3B.1a** – Ehrlicher Übersetzungsablauf und robuste Wortformen: Ein
  Klick genügt für Analyse **und** Vorschläge, bekannte Abkürzungen bringen ihre
  deutsche Entsprechung ohne Modell mit, ungeklärte Abkürzungen werden getrennt
  gezählt, und mehrdeutige Wortformen bleiben mehrdeutig.
* **Sprint 3B.1** – Textqualität, Übersetzung und Lernrichtungen: Wortformen
  desselben Wortes werden zu einer Vokabel zusammengefasst, Abkürzungen wie
  „600 sq mi“ in Kontext aufgelöst, Übersetzungsvorschläge sind Teil des
  Hauptwegs, und die Lernenden wählen die Richtung selbst.
* **Sprint 2B.2b** – Satzassistent und Textempfehlungen: zu einer Vokabel einen
  einfacheren Satz oder einen anderen Kontext vorschlagen lassen, und aus den
  lokal gefundenen Textkandidaten diejenigen markieren, die zur Lerngruppe
  passen. Dazu die vorab gewählte Anzahl Vokabelvorschläge aus einem Text.
* **Sprint 2B.2a1** – Ehrliche Mengenanzeige und begrenzter Prompt-Kontext: das
  Ergebnis wird an der gewünschten Anzahl gemessen, und das Sprachmodell sieht
  höchstens 200 vorhandene Stichwörter – der vollständige Dublettenfilter bleibt
  lokal.
* **Sprint 2B.2a** – Themenwerkstatt: zu einem frei gewählten Thema lokal
  Vokabelvorschläge erzeugen, prüfen und wie jede andere Liste speichern.
* **Sprint 2B.1** – Vorschläge beim Import: Übersetzung, Wortart, Schwierigkeit
  und Themen-Tags werden lokal vorgeschlagen, ausdrücklich geprüft und
  übernommen. Das fertige Paket bleibt vollständig ohne KI nutzbar.
* **Sprint 2A.2** – Freies Üben: jede freigeschaltete Vokabel ist jederzeit
  übbar, auch außerhalb des Leitner-Plans – ohne Wirkung auf Fächer, Termine
  und Statistik.
* **Sprint 2A** – Inhaltswerkstatt: aus einem englischen Text lokal
  Vokabelkandidaten gewinnen, Originalsätze prüfen und in den vorhandenen
  Entwurfs-Workflow übergeben. Optionale Übersetzungsvorschläge nur in Chrome,
  nur auf dem Gerät und nur nach ausdrücklichem Klick.

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
| `npm run build:portable` | Die beiden portablen Einzeldateien nach `dist-portable/` |
| `npm run verify:portable` | Prüft die gebauten Einzeldateien (setzt `build:portable` voraus) |
| `npx vitest run scripts/portableBuild.test.mjs` | Nur die Bau-Orchestrierung (ohne Build) |
| `npm run e2e:portable` | Der portable E2E-Ablauf über `file://` (setzt `build:portable` voraus) |
| `npx vitest run src/domain/freePractice.test.ts` | Nur Planung und Vorschau des freien Übens |
| `npx vitest run src/routes/student/freePractice.test.tsx` | Nur die Einstiege und die wirkungsfreie freie Runde |
| `npx vitest run src/routes/student/freePracticeSetup.test.tsx` | Nur „Runde anpassen“ |
| `npx playwright test e2e/free-practice.spec.ts` | Nur der E2E-Ablauf zum freien Üben |
| `npx vitest run src/domain/selfTest.test.ts` | Nur Planung, Auswertung und Fehlerrunden des Selbsttests |
| `npx vitest run src/routes/student/selfTestPage.test.tsx` | Nur die Selbsttest-Oberfläche |
| `npx playwright test e2e/self-test.spec.ts` | Nur der E2E-Ablauf des Selbsttests |
| `npx vitest run src/import/portability.test.ts` | Nur der Portabilitätsnachweis (Paket ohne KI) |
| `npx vitest run src/domain/wordRules.test.ts` | Nur die regelbasierten Vorschläge |
| `npx playwright test e2e/enrichment.spec.ts` | Nur der E2E-Ablauf zu den Vorschlägen |
| `npx vitest run src/import/topicDraft.test.ts` | Nur die Nachbearbeitung der Themenvorschläge |
| `npx vitest run src/import/topicPortability.test.ts` | Nur der Portabilitätsnachweis der Themenwerkstatt |
| `npx playwright test e2e/topic-studio.spec.ts` | Nur der E2E-Ablauf der Themenwerkstatt |
| `npx vitest run src/import/sentenceAssist.test.ts` | Nur die Prüfung der Satzvorschläge |
| `npx vitest run src/import/sentencePortability.test.ts` | Nur der Portabilitätsnachweis des Satzassistenten |
| `npx vitest run src/import/textRecommendation.test.ts` | Nur Schlüsselbildung und Empfehlungsfilter |
| `npx vitest run src/import/recommendation.test.ts` | Nur Gewichtung, Grundformen und Ausschlüsse der Rangfolge |
| `npx vitest run src/import/recommendationAcceptance.test.ts` | Nur der Akzeptanzfall am echten Fachartikel (mit echtem Wörterbuch) |
| `npx vitest run src/domain/collocations.test.ts` | Nur die Erkennung von Mehrwortbegriffen |
| `npx vitest run src/import/candidateLimit.test.ts` | Nur die gewünschte Anzahl Vokabelvorschläge |
| `npx playwright test e2e/sentence-assistant.spec.ts` | Nur der E2E-Ablauf des Satzassistenten |
| `npx playwright test e2e/text-recommendation.spec.ts` | Nur der E2E-Ablauf der Textempfehlungen |
| `npx vitest run src/ui/AppShell.test.tsx` | Nur Navigation und aktuelle Route |
| `npx vitest run src/routes/editorialSurfaces.test.tsx` | Nur die vier überarbeiteten Oberflächen |
| `npx playwright test e2e/editorial-shell.spec.ts` | Nur Shell, mobile Leiste und lokale Schriften |
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

## Drei Auslieferungsformen

LexiFlow gibt es seit Sprint 4A.1 dreimal – aus **einem** Quellbaum, mit
derselben Domänenlogik und denselben Komponenten.

| | Befehl | Ergebnis | Wofür |
| --- | --- | --- | --- |
| PWA | `npm run build` | `dist/` (viele Dateien, Service Worker, Manifest) | gehostet unter HTTPS, installierbar, offlinefähig |
| Lehrkraftdatei | `npm run build:portable` | `dist-portable/LexiFlow-Lehrkraft.html` | eine Datei, Doppelklick, ohne Server |
| Schülerdatei | Export aus der Lehrkraftdatei | z. B. `unit-3-city-life-8-lexiflow.html` | ein Paket + Trainer, für die Klasse |

**Der normale Build ist unverändert.** `npm run build` macht dasselbe wie
vorher; die portablen Ziele sind eigene Vite-Konfigurationen
(`vite.student.config.ts`, `vite.portable.config.ts`) und ein
Orchestrierungsskript (`scripts/build-portable.mjs`).

**Kein verschachtelter Paketmanager (seit Sprint 4A.1a).** Das
Orchestrierungsskript rief Vite anfangs über `execFileSync('npx', …)` auf. Aus
`npm run build:portable` heraus ist das ein npm-Prozess, der einen npm-Prozess
startet – auf echten Rechnern blieb der Build dabei ohne Ausgabe hängen, während
derselbe Vite-Schritt direkt aufgerufen in Millisekunden durchlief. Jetzt wird
Vites programmatische API benutzt (`import { build } from 'vite'`): kein
zweiter Prozess, keine Shell, kein PATH, kein plattformabhängiger Pfad nach
`node_modules/.bin`. `npm run verify:portable` startet Vitest aus demselben
Grund über `startVitest` statt über `npx`.

Der Ablauf selbst steht in `scripts/portableBuild.mjs` – einem kleinen Modul
**ohne LexiFlow-Fachwissen**: Schritte sind Funktionen, Dateizugriffe laufen
über ein injizierbares `io`. Deshalb lassen sich Reihenfolge, Abbruch nach dem
ersten Fehler und das Aufräumen prüfen, ohne einen Build zu starten
(`scripts/portableBuild.test.mjs`, Teil von `npm run test`). Dass der echte
Aufruf durchläuft und **von selbst endet**, prüft
`src/portable/buildScript.artifact.test.ts` in `npm run verify:portable` – mit
Zeitgrenze, in ein temporäres Verzeichnis (`LEXIFLOW_PORTABLE_OUT`), damit
`dist-portable/` unberührt bleibt.

Scheitert ein Schritt, endet der Prozess mit einem Code ungleich null, nennt den
gescheiterten Schritt beim Namen und lässt **keine** Enddatei zurück – auch
keine alte aus einem früheren Lauf, denn das Ausgabeverzeichnis wird zu Beginn
neu angelegt. Es gibt keine zweite,
handgeschriebene HTML-Fassung der Anwendung – die Einzeldateien entstehen aus
demselben Quellcode, nur mit `vite-plugin-singlefile` und
`assetsInlineLimit: Infinity`.

### Wie die Lehrkraftdatei die Schülerdatei erzeugt

Der Build läuft in zwei Schritten, und die Reihenfolge ist Pflicht:

1. **Schülerlaufzeit** (`student.html` → `src/student-main.tsx`) wird zu einer
   einzigen HTML-Datei gebaut. Sie enthält alles außer dem Paket: an dessen
   Stelle steht die Markierung `"__LEXIFLOW_PACK__"`.
2. **Lehrkraftdatei** wird gebaut und bekommt diese Laufzeit über ein virtuelles
   Modul als Zeichenkette einkompiliert. Deshalb kann sie unter `file://` eine
   Schülerdatei erzeugen, ohne irgendetwas nachzuladen.

Beim Export ersetzt `buildStudentHtml` die beiden Markierungen (Paket und
Fenstertitel) und bietet das Ergebnis über einen Blob-Download an – derselbe
Weg wie beim `.vocabpack.json`-Export, der unverändert daneben bleibt.

Der **Web-Build kennt die Aktion, aber nicht die Laufzeit**: Die Schülerlaufzeit
dort mitzubündeln würde das Bündel verdoppeln, für eine Funktion, die auf einer
gehosteten Instanz niemand braucht. Die Paketseite sagt deshalb, wo der Export
zu finden ist, statt einen Knopf anzubieten, der nichts erzeugen kann
(`__LEXIFLOW_PORTABLE__`, siehe `src/portable/studentRuntime.ts`).

### Die Schülerdatei ist eine eigene Anwendung

`src/StudentApp.tsx` versteckt die Lehrkraftseiten nicht – es **kennt** sie
nicht. Importwizard, Paketeditor, Themenwerkstatt, Satzassistent und die
gesamte Provider-Registrierung (Übersetzung, Sprachmodell) werden dort nicht
importiert und landen deshalb nicht im Bündel. `#/material/import` endet auf der
Startseite, weil es diese Route nicht gibt.

Enthalten sind: Paketübersicht (das eine Paket), Lernplan, freies Üben inklusive
„Runde anpassen“, Durchsehen, Karten, Selbsttest mit Fehlerwiederholung, beide
Lernrichtungen und der lokale Lernstand.

### Sichere Einbettung der Paketdaten

Die Paketdaten stehen in einem `<script id="lexiflow-pack"
type="application/json">` – einem Element, das der Browser **nicht ausführt**.
Beim Serialisieren wird jedes `<`, `>` und `&` zu einer `\u`-Folge, dazu die
JavaScript-Zeilentrenner U+2028/U+2029. Damit kann die Zeichenfolge `</script`
im eingebetteten JSON gar nicht vorkommen – unabhängig davon, was in den
Vokabeln steht. Gelesen wird mit `JSON.parse(el.textContent)` und **erneut**
gegen `vocabPackFileSchema` geprüft, mit derselben Migration wie beim
Dateiimport. Kein `eval`, kein `document.write`, kein `innerHTML`. Beschädigte
oder zu neue Daten führen zu einer verständlichen Seite statt zu einem weißen
Fenster.

Vor dem Export wird das Paket ebenfalls validiert: Eine kaputte Datei bei 28
Lernenden ist teurer als eine Fehlermeldung bei einer Lehrkraft.

### Verhalten unter `file://`

* **Hash-Routing** funktioniert unverändert; das Neuladen einer Schülerroute
  landet wieder an derselben Stelle.
* **Kein Service Worker.** Unter `file://` lässt sich keiner registrieren – die
  portablen Builds versuchen es gar nicht erst, und das ist kein Fehlerzustand.
  Im PWA-Build bleibt der Service Worker unverändert.
* **Nichts wird nachgeladen.** `npm run verify:portable` durchsucht beide
  Dateien nach jedem `src=`/`href=`, das nicht `data:` oder `#` ist – ein
  einziger Treffer lässt den Build scheitern. Die E2E-Suite behandelt zusätzlich
  jede Anfrage, die nicht `file:`, `data:` oder `blob:` ist, als Fehler.
* **Speicher wird geprüft, bevor etwas behauptet wird.** `checkStorage()` legt
  testweise eine eigene, winzige Datenbank an und räumt nur diese wieder weg.
  Fremde Browserdaten werden nie gelöscht.

**Datenbankname.** Chromium behandelt *alle* lokalen Dateien als denselben
Ursprung. Ohne Gegenmaßnahme läge der Lernstand einer Schülerdatei in derselben
Datenbank wie der der Lehrkraftdatei. Die Schülerdatei setzt deshalb vor dem
Laden der App `globalThis.__LEXIFLOW_DB__` auf `lexiflow-schueler-<paket-id>`
(siehe `src/data/db.ts`) – getrennt von der Lehrkraftdatei und von jeder anderen
Schülerdatei.

### Lernstand in der Schülerdatei

Der Lernstand liegt im Browser, nicht in der Datei. Die Schülerdatei sagt das im
Fuß jeder Seite:

> „Dein Lernstand wird in diesem Browser gespeichert. Wenn du die Datei
> umbenennst, verschiebst oder in einem anderen Browser öffnest, kann er dort
> nicht verfügbar sein.“

Lässt der Browser keinen dauerhaften Speicher zu, erscheint stattdessen ein
Hinweis und die Datei behauptet nichts Falsches.

**Noch nicht enthalten:** „Lernstand sichern“ / „Lernstand wiederherstellen“ als
lokale Datei. Das ist bewusst aufgeschoben – dafür braucht es ein eigenes,
versioniertes Dateiformat für Lernstände (mit Paketbezug, Richtungsschlüsseln
und einer Migrationsregel), und ein halbfertiges Format wäre schlimmer als
keines. Konkreter nächster Schritt: `lexiflow.progress` v1 mit `packId`,
`formatVersion`, den `directionProgress`-Datensätzen und dem Paketzähler, plus
einer Zusammenführungsregel für den Fall, dass beim Wiederherstellen schon ein
Lernstand existiert.

### Browser

Die portable E2E-Suite läuft in **Chromium**. Dort steht unter `file://`
IndexedDB zur Verfügung, und der Lernstand übersteht ein Neuladen – das ist
getestet.

**Safari ist nicht automatisiert geprüft.** Playwright-WebKit ließ sich in
dieser Umgebung nicht installieren (der Download-Host ist nicht freigegeben),
und WebKit wäre ohnehin nur eine technische Annäherung. Für den echten Test
genügt diese Liste:

1. `LexiFlow-Lehrkraft.html` per Doppelklick öffnen – Startseite sichtbar?
2. Paket über „Liste einfügen“ anlegen und speichern.
3. „Als Schülerdatei (.html) exportieren“ – kommt der Download an?
4. Die Schülerdatei per Doppelklick öffnen – Titel und Paket sichtbar?
5. Durchsehen, Karten, freie Runde, Selbsttest durchklicken.
6. Eine Lernrunde beantworten, dann Seite neu laden: Bleibt der Lernstand? Wenn
   nicht, muss der Hinweis „Kein dauerhafter Speicher“ erscheinen – ein Absturz
   oder eine falsche Zusage wäre ein Fehler.
7. Entwicklermenü → Netzwerk: Es darf keine einzige externe Anfrage geben.

### Welche Tests wo laufen

| Befehl | Umfang | Stand 4A.1c | Voraussetzung |
| --- | --- | --- | --- |
| `npm run test` | Domäne, Komponenten, Bau-Orchestrierung, Wörterbuch | 1265 in 72 Dateien | keine |
| `npm run verify:portable` | statische Prüfung der gebauten Dateien + Artefakttests (`*.artifact.test.ts`) | 18 in 2 Dateien | `npm run build:portable` |
| `npm run e2e` | die gehostete Anwendung über `vite preview` | 88 | baut selbst |
| `npm run e2e:portable` | die Einzeldateien über `file://` | 12 | `npm run build:portable` |

Die Zahlen überschneiden sich nicht: Was in `npm run test` läuft, läuft nicht
in `verify:portable` und umgekehrt.

Die Artefakttests sind in `vite.config.ts` ausdrücklich **ausgeschlossen**
(`src/**/*.artifact.test.ts`). Ohne diese Zeile liefen sie in beiden Suiten –
doppelt gezählt, und `npm run test` schlüge in einem frischen Checkout fehl,
weil `dist-portable/` noch nicht existiert.

### Größen

Wodurch die Größe entsteht: React und React-DOM, der Router, Dexie und Zod
machen den größten Block aus; dazu kommen die beiden lokal gebündelten
variablen Schriften (Manrope und Newsreader, zusammen rund 81 KiB als woff2)
sowie das vollständige CSS. Alles davon steckt als Data-URL beziehungsweise
Inline-Code im Dokument – genau deshalb braucht es kein Netz. Der Umfang des
Pakets selbst fällt kaum ins Gewicht: 100 Vokabeln sind rund 14 KiB.

---

## Grundprinzipien in der Umsetzung

| Prinzip | Wie es technisch abgesichert ist |
| --- | --- |
| Keine Konten, keine Lehrkraft-Einsicht | Es existiert keine Auth-Schicht und kein Rückkanal. Der Lehrkraft-Bereich ist eine reine Editier-Oberfläche. |
| Lernstände nur lokal | `directionProgress`/`packProgress` liegen in IndexedDB. Der einzige Schreibpfad ist `src/data/progressRepo.ts`; es gibt keine Export- oder Sendefunktion dafür. Ein Test prüft, dass Exporte keine Lernstandsfelder enthalten. |
| Keine Telemetrie, keine externen Ressourcen | Keine Analytics-Abhängigkeit, keine Web-Fonts, keine CDN-Einbindung. Der Service Worker cached ausschließlich eigene Assets (`runtimeCaching: []`). Der E2E-Smoke-Test schlägt fehl, sobald ein Request an einen fremden Host geht. |
| Ohne Backend und ohne KI lauffähig | Reine Client-App, statisch deploybar. `AiProvider` ist vorbereitet, aber der Standardanbieter (`nullAiProvider`) wird nie aufgerufen. Die Textanalyse aus Sprint 2A läuft ohne jedes Modell. |
| Übersetzung nur auf dem Gerät | `TranslationProvider` verbietet eigene `fetch`-Aufrufe; der einzige Anbieter nutzt die eingebaute Translator-API des Browsers und startet einen Modelldownload erst nach ausdrücklichem Klick. Fehlt die API, ist das ein normaler Zustand. |
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
    freePractice.ts  Planung und Vorschau fürs freie Üben – ohne Fälligkeit
    selfTest.ts      Selbsttest: Planung, Auswertung, Fehlerwiederholung
  portable/      Schülerdatei erzeugen und einlesen, Speicherprüfung
  dictionary/    Platzhalter für das Offline-Wörterbuch (Sprint 4A.2)
    session.ts       Warteschlange einer Runde inkl. Wiedervorlage
    dueDate.ts       verständliche Formulierung von Fälligkeitsterminen
    packDiff.ts      Fingerprint lernrelevanter Felder, Paketvergleich
    textExtraction.ts  lokale Textanalyse: Sätze, Wörter, Kandidaten
    collocations.ts  Mehrwortbegriffe aus Läufen von Inhaltswörtern
    stopwords.ts     englische Funktionswörter (Standardausblendung)
    wordRules.ts     sichere Wortart- und Themenregeln, ganz ohne Modell
    wordMatch.ts     Wortgrenzenprüfung „enthält der Satz das Stichwort?“
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
    textDraft.ts     Kandidaten → Entwurfszeilen (kein zweiter Editor)
    suggestions.ts   ephemere Vorschläge im Entwurf: annehmen, ablehnen, prüfen
    enrichment.ts    Bindeglied zwischen Vorschlagsquellen und Entwurf
    topicDraft.ts    Nachbearbeitung der Themenvorschläge (Dubletten, Sätze, IDs)
    sentenceAssist.ts  Prüfung und Übernahme von Satzvorschlägen (rein)
    textRecommendation.ts  neutrale Kandidatenschlüssel, Empfehlungsfilter
    recommendation.ts  Rangfolge ohne Modell: Gewichtung, Familien, Ausschlüsse
    dictionarySuggestions.ts  Wörterbuchtreffer aufbereiten, sichere Sammelübernahme
    candidateLimit.ts  gewünschte Anzahl Vokabelvorschläge (rein, ohne Modell)
  translation/   lokale Übersetzung als eigene, schmale Schnittstelle
    TranslationProvider.ts    Vertrag + nullTranslationProvider (Standard)
    chromeTranslationProvider.ts  Chrome-Translator-API, reine Feature Detection
  providers/     Registry (React-Context) und gemeinsamer Anbieterzustand
  ai/            KI als austauschbare Schnittstelle
    AiProvider.ts            Vertrag + nullAiProvider (Standard)
    chromePromptAiProvider.ts  Prompt-API des Browsers, vier Fähigkeiten
  styles/        Designsystem
    tokens.css       Farben, Typo, Abstände, Radien, Motion, Fokus, Safe Area
    fonts.css        lokale @font-face-Regeln (Manrope, Newsreader)
    global.css       Zusammensetzungen – keine Einzelwerte
  ui/            Bausteine, Importlogik (usePackImport), Bestätigungsdialog
    AppShell.tsx     Seitenspalte (Desktop) und Bodenleiste (mobil)
    PackCard.tsx     gemeinsames Kartenmuster für alle Paketlisten
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
| `/material/import?quelle=text` | Textwerkstatt: Text → Kandidaten → Vorschau → Metadaten |
| `/material/import?quelle=thema` | Themenwerkstatt: Thema → Vorschläge → Vorschau → Metadaten |
| `/material/:packId` | Paketeditor (Metadaten und Vokabeln) |
| `/lernen` | Lokale Paketsammlung mit Lernstand |
| `/lernen/:packId` | Paketdetails, Leitner-Übersicht je Richtung, Optionen |
| `/lernen/:packId/uebung` | Übungssitzung nach Lernplan |
| `/lernen/:packId/uebung?mode=free` | freie Übungsrunde (verändert keine Lernstände) |
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

### `planSession` – die einzige Planungsquelle

```ts
planSession(entries, progressIndex, packDirection, length, now, rng): {
  targets: SessionTarget[];    // die Runde, in Reihenfolge
  readyCount: number;          // freigeschaltet UND (neu ODER jetzt fällig)
  plannedCount: number;        // immer targets.length
  remainingReadyCount: number; // readyCount − plannedCount
  nextDueAt?: string;          // frühester Termin eines freigeschalteten,
                               // später fälligen Ziels
}
```

Die Funktion ist rein und die **einzige** Grundlage für Anzeige und Runde:
`countReady`, die Paketansicht, die Übungsseite und `buildSession` rufen sie
auf. Dadurch kann die Oberfläche nicht mehr vier bereite Aufgaben melden,
während die Runde acht baut.

Grundregel: Eine normale Leitner-Runde enthält **ausschließlich**
freigeschaltete Ziele, die neu oder zum Planungszeitpunkt fällig sind. Ein Ziel
mit `dueAt > now` wird nie vorgezogen – auch nicht, um eine gewünschte
Rundengröße zu füllen und auch nicht bei „Neue Runde“. Produktive Ziele, die
gerade erst durch Fach 2 freigeschaltet wurden, gelten als *neu* und dürfen
sofort in die nächste Runde. Ein Modus „Freies Üben“ ist dafür später
vorgesehen; er wird hier nicht durch die Hintertür simuliert.

Die Paketseite und die Übungsseite verwenden denselben Seed (`?seed=` in der
URL), damit die angezeigte Zahl „… werden eingeplant“ exakt der Runde
entspricht, die anschließend gebaut wird.

### Speichern vor Weiterschalten

Das Feedback erscheint sofort, „Weiter“ bzw. „Runde beenden“ bleibt jedoch
gesperrt (`disabled`, mit `aria-busy` und dem Hinweis „Lernstand wird
gespeichert …“), bis `recordAnswer` die IndexedDB-Transaktion abgeschlossen hat.
Erst danach rückt die Warteschlange vor. Scheitert das Schreiben, gilt die
Aufgabe weiter als offen: Es erscheint eine verständliche Fehlermeldung mit
„Erneut versuchen“, und es wird nicht weitergeschaltet.

`startSession` läuft ebenfalls nicht als Fire-and-forget: Die Zusage wird
festgehalten, die erste Antwort wartet darauf, und ein Fehler dort wird über
denselben Weg gemeldet und beim erneuten Versuch wiederholt.

Die Folgerundenplanung startet erst, wenn keine Speicherung mehr aussteht.
Solange ihr Ergebnis fehlt (`nextRound === null`), heißt die Schaltfläche
„Nächste Runde wird geprüft …“ und ist gesperrt; `canContinue` wird erst wahr,
wenn ein Plan vorliegt **und** `plannedCount > 0` ist.

### Reihenfolge und Abstände

Innerhalb gleichwertiger Prioritätsgruppen wird mit dem injizierbaren RNG
gemischt, damit nicht dauerhaft die Importreihenfolge geübt wird; mit festem
Seed bleibt jede Reihenfolge reproduzierbar. Die Priorität selbst bleibt
erhalten: fällig (niedrigstes Fach zuerst) vor neu vor noch nicht fällig.

Zwischen den beiden Richtungen derselben Vokabel liegen mindestens
`MIN_SIBLING_GAP` (3) andere Aufgaben. Der Abstand wird nie gelockert, um eine
gewünschte Rundengröße zu erreichen: Lässt sich eine Kombination nicht
regelkonform platzieren, entfällt sie und kommt in einer der nächsten Runden
dran.

Auch Wiedervorlagen nach Fehlern halten diesen Abstand ein. `submitVerdict`
liefert deshalb ein explizites Ergebnis:

```ts
{ state, requeued: boolean, reason?: 'answered-correctly' | 'max-attempts' | 'no-slot' }
```

Die Oberfläche verspricht eine Wiederholung nur bei `requeued: true`. Findet
sich keine zulässige Stelle (`reason: 'no-slot'`), steht dort stattdessen: „In
dieser kurzen Runde ist kein passender Wiederholungsplatz frei. Die Aufgabe
bleibt für die nächste Runde priorisiert.“ Der Lernstand wird davon nicht
berührt – das Fach ist bereits zurückgesetzt.

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

## Vokabeln zu einem Thema (Themenwerkstatt)

Statt eine Liste zu tippen, lässt sich eine zu einem Thema erzeugen: „City
life“, Jahrgang 7, A2+, gewünschte Schwierigkeit 3, zehn Vokabeln. Heraus kommen
ganz normale Entwurfszeilen, die durch dieselbe Vorschau laufen wie ein
CSV-Import.

### Alles bleibt auf dem Gerät

Die Vorschläge entstehen mit dem **eingebauten Sprachmodell des Browsers**
(Prompt-API). Es gibt keinen Cloud-Anbieter, keinen API-Schlüssel und kein
Backend; der Anwendungscode ruft nie selbst `fetch` auf. Das Modell wird **erst
nach einem ausdrücklichen Klick** geladen – mit echtem Fortschritt und
jederzeit abbrechbar.

An das Modell gehen ausschließlich: Thema, Jahrgang, GeR-Niveau, gewünschte
Schwierigkeit, gewünschte Anzahl und – falls die Option aktiv ist – ein
**begrenzter Auszug** der bereits vorhandenen englischen Stichwörter. Keine
Übersetzungen, keine Paket-IDs, keine Lernstände, keine personenbezogenen Daten.

### Dublettenfilter lokal, Prompt begrenzt

Beides wird bewusst getrennt gehalten:

* **Der lokale Filter ist vollständig.** `topicSuggestionsToDrafts` bekommt
  *alle* vorhandenen Stichwörter und entfernt jede Dublette – deterministisch
  und unabhängig von Groß-/Kleinschreibung. Das ist die verlässliche Zusage.
* **Der Prompt ist nur Hilfestellung.** Ein Vokabelbestand kann tausende
  Einträge haben; alles davon in den Kontext zu schreiben, bläht den Prompt auf,
  ohne die Antwort besser zu machen. Das Modell bekommt deshalb höchstens
  `MAX_CONTEXT_HEADWORDS = 200` Stichwörter (`headwordsForPrompt`, alphabetisch
  sortiert – dieselbe Sammlung ergibt immer denselben Prompt). Der Anbieter
  setzt dieselbe Grenze noch einmal durch, unabhängig vom Aufrufer.

Eine Dublette, die außerhalb dieser 200 lag, wird also trotzdem entfernt – nur
eben lokal statt vom Modell. In der Oberfläche steht das so: *„Bereits
vorhandene Vokabeln werden vollständig auf diesem Gerät herausgefiltert. Zur
Vermeidung offensichtlicher Dubletten erhält das lokale Sprachmodell höchstens
200 englische Stichwörter.“* Bei kleineren Beständen nennt der Text die
tatsächliche Zahl.

### Browserunterstützung

Die Themenwerkstatt braucht einen Desktop-Browser mit eingebauter Prompt-API
(derzeit Chrome, je nach Version und Gerät) **und** ein Modell, das Deutsch
erzeugen kann – die Sprachprüfung gehört zur Verfügbarkeitsabfrage. Fehlt beides,
gibt es keine Fehlermeldung, sondern zwei Auswege: „Liste einfügen“ oder „Leere
Liste anlegen“ (eine normale Zeile, das Thema schon als Tag).

### Was LexiFlow nach dem Modell noch prüft

Ein eingehaltenes JSON-Schema heißt nur, dass die Form stimmt. Danach läuft die
Antwort durch Zod und anschließend durch eine fachliche Nachbearbeitung:

* Leerzeichen normalisieren, doppelte Stichwörter (auch bei anderer
  Groß-/Kleinschreibung) und bereits vorhandene Vokabeln entfernen
* Einträge ohne deutsche Antwort verwerfen, doppelte Übersetzungen und Tags
  zusammenfassen
* auf die gewünschte Anzahl begrenzen, eigene lokale IDs vergeben,
  `sourceType: topic-ai` setzen
* **Beispielsätze prüfen:** Ein Satz wird nur übernommen, wenn er das Stichwort
  beziehungsweise die vollständige Wendung wirklich enthält. Sonst fliegt er
  raus und die Zeile sagt es. Ein unpassender Satz wäre als Lückensatz wertlos
  und als Beleg irreführend.

Eine ungültige Antwort wird **vollständig** verworfen – nichts wird still
repariert, und ein neuer Versuch ist einen Klick entfernt.

### Die Zahlen sagen, was wirklich passiert ist

Das Ergebnis trägt vier getrennte Werte (`TopicDraftResult`):

| Wert | Bedeutung |
| --- | --- |
| `requested` | die von der Lehrkraft gewählte Obergrenze |
| `received` | gültige Einträge der Modellantwort, **vor** der lokalen Prüfung |
| `accepted` | tatsächlich in die Vorschau übernommene Zeilen |
| `droppedSentences` | entfernte Beispielsätze, die das Stichwort nicht enthielten |

Bezugsgröße ist immer der Wunsch, nie die Lieferung. Liefert das Modell acht
Vorschläge, obwohl zehn angefordert waren, steht dort *„8 von 10 gewünschten
Vorschlägen übernommen.“* – **nicht** „8 von 8“. Hat zusätzlich die lokale
Prüfung zugeschlagen, wird auch das benannt: *„6 von 10 gewünschten Vorschlägen
übernommen. Das Sprachmodell lieferte 8; 2 Einträge wurden bei der lokalen
Prüfung entfernt.“* Die Formulierung entsteht in `summarizeTopicResult` – rein
und damit prüfbar. Im Paket landen diese Zählwerte nicht; sie gehören zur
Vorschau, nicht zum Vokabelpaket.

### Prüfen bleibt Pflicht

Über der Vorschau steht: *„Diese Vorschläge sind ungeprüft. Kontrolliere
besonders Übersetzungen, Schwierigkeit und Beispielsätze.“* Die
Schwierigkeitsangabe bezieht sich auf die gewählte Lerngruppe, nicht auf eine
allgemeingültige Wortbewertung. LexiFlow behauptet nicht, dass Ergebnisse
lehrplankonform oder fehlerfrei sind – **die fachliche Verantwortung bleibt bei
der Lehrkraft.**

### Fertige Pakete brauchen kein Modell

Wie bei allen anderen Quellen: Was gespeichert wird, sind normale
`VocabEntry`-Felder. Ein Integrationstest erzeugt Vorschläge mit einem
nachgebauten Browsermodell, exportiert das Paket und liest es in einer Umgebung
**ganz ohne Sprachmodell** wieder ein – Übersetzungen, Wortarten,
Schwierigkeiten, Tags und die gültigen Beispielsätze sind vollständig da,
`formatVersion` bleibt `1`, und die Lernrunde startet sofort. Weitergabe wie
immer: Paket exportieren → Datei senden → beim Empfänger „Paketdatei öffnen“.

---

## Vorschläge beim Import

Nach dem Einfügen oder Hochladen schlägt LexiFlow fehlende Angaben vor:
**deutsche Übersetzung, Wortart, Schwierigkeit und Themen-Tags**. Jeder
Vorschlag steht getrennt neben dem Feld und muss ausdrücklich übernommen
werden. Nichts davon landet je von allein im Paket.

### Was immer funktioniert – ohne Modell, ohne Download

Feste, nachvollziehbare Regeln (`src/domain/wordRules.ts`), in jedem Browser:

| Regel | Beispiel |
| --- | --- |
| `to …` ist ein Verb | „to apologise“ → Verb |
| feste Präpositionen | „between“ → Präposition |
| mehrere Wörter ohne „to“ | „as soon as possible“ → Wendung |
| Endung `-ly` ohne bekannte Ausnahme | „quickly“ → Adverb |
| Artikel unmittelbar davor im Beispielsatz | „The **neighbourhood** is crowded.“ → Substantiv |
| Paketthema als Themen-Tag | Thema „City life“ → Tag „City life“ |

Grundsatz: **Im Zweifel kein Vorschlag.** Mehrdeutige Wörter wie „book“,
„light“ oder „water“ bleiben absichtlich leer – eine erfundene Wortart wäre
schlimmer als eine leere Spalte, weil sie geprüft aussieht.

**Schwierigkeit hat bewusst keine Regel.** Aus Wortlänge oder Silbenzahl eine
Zahl von 1 bis 5 zu bilden, sähe präzise aus und wäre geraten: „nevertheless“
ist lang und für die Oberstufe leicht, „yet“ ist kurz und schwierig. Ohne
Sprachmodell bleibt das Feld leer.

Bewusst **keine NLP-Bibliothek**: Für diese Handvoll eindeutiger Muster wären
250 kB bis 1 MB Lexikon reine Bundle-Last ohne Zugewinn – ein Tagger ohne
Satzkontext rät genauso, nur weniger sichtbar. Käme das je in Frage, gehören
Lizenz, Bundle-Effekt und ein belegbarer Nutzen vorher dokumentiert.

### Was einen unterstützten Desktop-Browser braucht

| Vorschlag | Voraussetzung |
| --- | --- |
| deutsche Übersetzung | eingebaute Translator-API (derzeit Chrome, je nach Version und Gerät) |
| Schwierigkeit 1–5 | eingebautes Sprachmodell (Prompt-API) |
| Wortart über die Regeln hinaus | eingebautes Sprachmodell |
| zusätzliche Themen-Tags | eingebautes Sprachmodell |

Fehlt beides, sagt die Oberfläche das ruhig und deutlich – und der Import bleibt
in vollem Umfang benutzbar. Alles lässt sich wie bisher selbst eintragen.

**Modelle werden erst nach einem Klick geladen.** Vorher wird nichts
heruntergeladen, nichts initialisiert und kein Anbieter aufgerufen. Während des
Ladens gibt es echten Fortschritt, eine Zählung der bearbeiteten Zeilen und
jederzeit „Abbrechen“.

**Es werden keine Daten übertragen.** Beide Anbieter laufen auf dem Gerät und
rufen niemals selbst `fetch` auf; Tests prüfen genau das. Weder Vokabeln noch
Texte noch Lernstände erreichen LexiFlow oder einen Cloud-Dienst. Es gibt keinen
Cloud-Fallback, keinen API-Schlüssel und keine Umgebungsvariable für Geheimnisse.

An das Sprachmodell geht bewusst nur der nötige Ausschnitt: Stichwort,
vorhandene deutsche Antworten, **ein** Beispielsatz, Jahrgang, GeR-Niveau und
Paketthema. Keine Rohdatei, kein Volltext, keine IDs, keine Lernstände. Die
Antwort wird über ein JSON-Schema (`responseConstraint`) erzwungen und danach
zusätzlich mit Zod geprüft; was durchfällt, wird nicht teilweise übernommen,
sondern als Fehler an dieser einen Zeile gemeldet.

### Annehmen, ablehnen, selbst schreiben

Ein Vorschlag hat einen Zustand: `suggested`, `accepted`, `rejected` oder
`edited`. Daraus folgen drei Zusagen:

1. **Vorhandene Angaben werden nie überschrieben** – auch nicht von einer
   Sammelaktion. Sammelaktionen berücksichtigen ausschließlich ausgewählte
   Zeilen mit noch leerem Feld und offenem Vorschlag und nennen die Anzahl.
2. **Handarbeit hat Vorrang.** Wird ein übernommener Wert später geändert, gilt
   er als eigene Bearbeitung; der Vorschlag hat damit keinen Anspruch mehr.
3. **Abgelehntes kommt nicht wieder** – derselbe Wert wird im selben Entwurf
   nicht erneut angeboten. Ein *anderer* Wert (etwa nach geändertem Thema) darf
   erneut vorgeschlagen werden. Ein neu gestarteter Import analysiert
   selbstverständlich neu.

Bei mehreren Quellen für dasselbe Feld gilt: Sprachmodell vor Übersetzung vor
Regel – aber nur, solange der Vorschlag offen ist. Themen-Tags sind die
Ausnahme: Sie ergänzen sich, statt sich zu verdrängen.

### Der Lernkontext

Über der Vorschlagswerkstatt stehen Jahrgang, GeR-Niveau und Thema. Sie helfen
dabei, Schwierigkeit und Themen-Tags passend vorzuschlagen. Es ist derselbe
Zustand, der später im Metadaten-Schritt gespeichert wird – keine doppelte
Datenhaltung, keine zweite Wahrheit. Titel und Lernrichtung bleiben im
Metadaten-Schritt.

### Vorschläge ändern die Herkunft nicht

Ein normaler CSV-, XLSX- oder Paste-Import bleibt `sourceType: import`, auch
wenn Wortart, Schwierigkeit oder Tags vorgeschlagen wurden. `text-ai` bedeutet
weiterhin genau das, was es seit Sprint 2A bedeutet: In der Textwerkstatt wurde
ein maschineller Übersetzungsvorschlag übernommen. Vorschlagsdaten selbst
(Quelle, Zustand, Unsicherheit) bleiben im Entwurf und werden **nie**
exportiert.

Gespeichert werden nach der Übernahme ganz normale Felder: `germanAnswers`,
`partOfSpeech`, `difficulty`, `topicTags`.

### Fertige Pakete brauchen keine KI

Das ist die zentrale Zusage dieses Sprints, und ein Integrationstest
(`src/import/portability.test.ts`) hält sie fest: Ein Paket wird mit
Vorschlägen erstellt, exportiert und anschließend in einer Umgebung
**ausschließlich mit `nullTranslationProvider` und `nullAiProvider`** wieder
eingelesen. Übersetzungen, Wortarten, Schwierigkeiten und Tags sind vollständig
erhalten, `formatVersion` ist weiterhin `1`, in der Datei steht kein einziges
Provider-, Modell-, Prompt- oder Konfidenzfeld, und das Paket lässt sich sofort
üben. Der E2E-Test macht dasselbe in einem zweiten Browserkontext ohne jede
Modell-API.

**Weitergabe in drei Schritten:** Paket exportieren → Datei senden (Mail,
Messenger, USB-Stick, Lernplattform) → beim Empfänger in LexiFlow „Paketdatei
öffnen“. Lernstände sind nie Teil der Datei.

### Vorschläge können falsch sein

Maschinelle Übersetzung kennt den Kontext nicht und trifft bei mehrdeutigen
Wörtern oft die falsche Bedeutung. Ein Sprachmodell schätzt die Schwierigkeit
ohne Kenntnis der Lerngruppe und erfindet gelegentlich Tags. Deshalb ist jeder
Vorschlag als **ungeprüft** gekennzeichnet, steht getrennt vom Eingabefeld und
wird nie automatisch übernommen. **Die Lehrkraft bleibt für jede Vokabel, jede
Wortart und jede Einstufung verantwortlich.**

---

## Zwei Übungsarten: Lernplan und freies Üben

Auf der Paketseite wird ausgewählt, *was* geübt wird. Die beiden Arten sind
technisch und fachlich getrennt.

| | Lernplan | Frei üben |
| --- | --- | --- |
| Planung | `planSession` | `planFreeSession` |
| Aufgaben | neu **oder** jetzt fällig | alles Freigeschaltete, auch später Fälliges |
| Fälligkeit | entscheidet mit | spielt keine Rolle |
| Schreibt Lernstände | ja (`startSession`, `recordAnswer`) | **nein** |
| Zählt als Übungsrunde | ja | nein |
| Einstieg | Karte „Nach Lernplan üben“ | Karte „Auf eigene Weise lernen“ |
| Startschaltfläche | „Lernrunde starten“ | „Direkt starten“ / „Runde anpassen“ |
| Rundengröße | wählbar, „Alle bereiten (n)“ | 15 beim Direktstart, sonst wählbar |
| URL | ohne `mode` bzw. `mode=scheduled` | `mode=free` |

**Freies Üben verändert nichts.** Eine freie Runde ruft weder `startSession`
noch `recordAnswer` auf und löst keinen Schreibvorgang in IndexedDB aus. Nach
ihr sind `directionProgress` und `packProgress` Feld für Feld unverändert –
Fach, Fälligkeit, `correctCount`, `wrongCount`, `streak`, `sessionCount`,
`answeredCount` und `lastPracticedAt` eingeschlossen. Ein Test vergleicht den
kompletten Lernstand vor und nach einer vollständigen freien Runde.

Rückmeldung, Zwischenstand und die einmalige Wiedervorlage innerhalb der Runde
gibt es trotzdem – diese Daten leben nur so lange wie die Runde selbst. Weil
nichts gespeichert wird, entfällt auch das Warten: „Weiter“ ist unmittelbar nach
dem Feedback frei, und der Hinweis „Lernstand wird gespeichert …“ erscheint
nicht.

**Seit Sprint 3B.1 anders:** die Freischaltung. `freeTargets` kennt sie nicht
mehr – freies Üben bietet bei „beide Richtungen“ **beide sofort** an. Die
Staffelung ist eine Empfehlung für den Lernplan, der Lernstände schreibt; freies
Üben schreibt keine und kann deshalb nichts verderben (siehe „Lernrichtungen
wählen“). Unverändert gelten der Abstand zwischen den beiden Richtungen
derselben Vokabel (`arrangeTargets`) und die Rundengröße als Obergrenze.

**Eigene Begriffe.** Freies Üben spricht von *verfügbaren* Aufgaben
(`availableCount`, `plannedCount`, `remainingAvailableCount`), der Lernplan von
*bereiten* (`readyCount`, `nextDueAt`). Gezählt werden in beiden Fällen
Aufgaben, also Kombinationen aus Vokabel und Richtung – bei „beide Richtungen“
kann eine Vokabel zwei Aufgaben stellen. Die Oberfläche benennt das so.

**Ein Einstieg je Weg (seit Sprint 3B.2b).** Die Paketseite hatte zwei Wege ins
freie Üben: die Karte „Auf eigene Weise lernen“ und eine Modusauswahl
(„Lernplan“ / „Frei üben“) in der Übungskarte darunter. Zwei Wege zur selben
Sache sind eine Einladung zur Verwechslung – die Modusauswahl ist deshalb weg.
Die untere Karte heißt jetzt „Nach Lernplan üben“ und plant nur noch den
Lernplan.

**Zwei Geschwindigkeiten, keine verlorene Möglichkeit (seit Sprint 3B.2b1).**
Mit der Modusauswahl war zunächst auch die *sichtbare* Einstellbarkeit des
freien Übens verschwunden – wer Richtung oder Übungsform wählen wollte, hätte
URL-Parameter tippen müssen. Das war ein Fehler, kein Entwurf. Die Karte „Frei
üben“ hat deshalb zwei Schaltflächen:

| | „Direkt starten“ | „Runde anpassen“ |
| --- | --- | --- |
| Richtung | gemischt (bei `direction: 'both'` beide) | wählbar, sofern es eine echte Wahl gibt |
| Übungsformen | automatisch passend zum Leitner-Fach, mit Ersatzform | genau die gewählten, **ohne** Ersatzform |
| Umfang | bis zu 15 (`FREE_ROUND_DEFAULT_LENGTH`) | 5, 10, 15, 20 oder alle verfügbaren |
| Weg | direkt in die Runde | Einrichtungsseite `/lernen/:packId/frei` (lazy) |
| URL | `?mode=free&length=15&seed=…` | zusätzlich `kinds=…` und, außer bei „gemischt“, `direction=…` |

Beide Wege laufen durch **dieselbe** Planung (`planFreeSession` →
`buildTasksForTargets`); die Einrichtung erzeugt nur die bekannten URL-Parameter
und plant nichts selbst. Bestehende Links ohne `kinds` funktionieren deshalb
unverändert.

**Eine Auswahl ist eine Auswahl (seit Sprint 3B.2b2).** `buildTasksForTargets`
kennt zwei ausdrücklich benannte Regeln (`KindPolicy`):

| | `auto` | `strict` |
| --- | --- | --- |
| Gilt für | Lernplan, `buildSession`, Direktstart (freie Runde **ohne** `kinds`) | freie Runde **mit** `kinds` |
| Gewünschte Formen sind | eine Vorliebe | eine Bedingung |
| Vokabel gibt die Form nicht her | sie bekommt eine andere geeignete Form | sie kommt in dieser Runde nicht vor |
| Rundenlänge | unverändert | ehrlich kürzer |

Der Unterschied ist fachlich, nicht technisch. Im Lernplan geht es um die
**Wiederholung der Vokabel**: Eine fällige Vokabel darf nicht ausfallen, nur
weil ihr ein Beispielsatz für den Lückensatz fehlt. Beim ausdrücklichen
Zuschneiden einer freien Runde geht es um die **Form**: Wer „nur Lückensätze“
wählt, will keine heimliche Ersatzform.

Damit die Rundengröße nicht an ungeeigneten Vokabeln verloren geht, filtert
`planFreeSession` die Ziele bei strikter Auswahl **vor** der Begrenzung
(`targetsWithKinds`). Sind mehrere Formen gewählt, entscheidet der Seed, welche
eine Vokabel bekommt – nie eine ungewählte. Der Lernstand darf ausschließlich
die *automatische* Wahl der Form beeinflussen: Ob eine Vokabel überhaupt
mitspielt, hängt beim freien Üben nie am Fach und nie an `dueAt`.

Die Vorschau zählt deshalb in drei Schritten: was in dieser Richtung zur
Verfügung steht, für wie viel davon eine der gewählten Formen möglich ist, und
wie viele Aufgaben nach Rundengröße und Richtungsabstand wirklich entstehen.
Ist nichts möglich, ist der Start gesperrt und die Seite sagt, dass eine weitere
Übungsform gewählt werden muss.

Steht nichts an, ist der Lernplan gesperrt und die Schaltfläche „Lernrunde
starten“ deaktiviert; der nächste reguläre Termin bleibt sichtbar, und beide
freien Wege bleiben offen. Bei einem Paket ohne freigeschaltete Aufgaben
verschwinden beide – statt Knöpfen, die ins Leere führen, steht dort der Grund.

---

## Auf eigene Weise lernen: Durchsehen, Karten und Selbsttest

Neben dem Lernplan stehen im Schülerbereich vier freiwillige Wege: **Vokabeln
durchsehen**, **mit Karten lernen**, **Selbsttest** und **frei üben**. Sie
hängen an keiner Fälligkeit und an keiner Freischaltung, und sie verändern
**nichts** – keine Fächer, keine Termine, keinen Rundenzähler. Der Lernplan
bleibt der empfohlene Weg und ist unverändert.

| | Route | Was sie tut |
| --- | --- | --- |
| Durchsehen | `/lernen/:packId/durchsehen` | Alle Vokabeln in Ruhe ansehen, Antworten einzeln aufdecken |
| Karten | `/lernen/:packId/karten` | Vorderseite, Rückseite, mischen, im eigenen Tempo weitergehen |
| Selbsttest | `/lernen/:packId/selbsttest` | Sich selbst abfragen, am Ende eine ruhige Auswertung, Fehler gezielt wiederholen |
| Frei üben | `/lernen/:packId/uebung?mode=free` | Richtig abgefragt werden, ohne Wirkung auf den Lernstand |
| Runde anpassen | `/lernen/:packId/frei` | Richtung, Umfang und Übungsformen fürs freie Üben wählen |

Die neuen Ansichten laden **erst beim Aufruf** (`React.lazy`), damit Startseite
und Lehrkraft-Werkstätten davon nicht wachsen.

**Drei Übungswege, in einem Satz auseinandergehalten** – so steht es auch auf
der Paketseite:

| | Rückmeldung | Lernstand |
| --- | --- | --- |
| Frei üben | sofort nach jeder Antwort | wird nicht verändert |
| Selbsttest | erst am Ende, als Ergebnis mit Fehlerübersicht | wird nicht verändert |
| Nach Lernplan üben | sofort nach jeder Antwort | Fächer und Termine ändern sich |

### Eine Domänenschicht für beide

`src/domain/studyView.ts` beantwortet die Fragen, die Liste und Karten gemeinsam
haben: Was steht vorn, was hinten, welche Alternativen gibt es, welche
Zusatzangaben sind überhaupt vorhanden. Die Datei kennt weder React noch
IndexedDB noch den Lernstand.

* `promptFor` / `answersFor` – Vorder- und Rückseite je Richtung. Bei
  Englisch → Deutsch ist die Antwort die Bedeutung, bei Deutsch → Englisch das
  Wort selbst; die zusätzlich akzeptierten englischen Schreibungen sind dann
  die Alternativen.
* `buildStudyCard` – das Anzeigemodell. **Leere optionale Felder fehlen ganz**
  statt als leerer String dazustehen, damit die Oberfläche keine leeren
  Bereiche erzeugt. Dubletten unter den Antworten fallen weg.
* `buildCardSet` – die Reihenfolge des Kartensatzes.
* `filterEntries` / `matchesQuery` – die lokale Suche.

### Durchsehen

Jede Vokabel ist ein redaktioneller Eintrag mit Stichwort als Überschrift und
der Antwort darunter – keine breite Tabelle, deshalb entsteht auf 390 px kein
waagerechter Scrollbereich. Die Antwort trägt `hidden`, ist also weder sichtbar
noch im Accessibility-Tree; der Schalter daneben heißt „Antwort für *island*
anzeigen“ und meldet seinen Zustand über `aria-expanded`.

Dazu zwei Sammelaktionen und eine lokale Suche über Englisch, deutsche
Antworten, akzeptierte Schreibweisen, Themen-Tags und Notizen: Teilzeichenkette,
Groß-/Kleinschreibung egal, kein unscharfer Abgleich, kein Modell. Ohne Treffer
steht dort „Keine passende Vokabel gefunden.“

Pakete mit beiden Richtungen bieten die Wahl zwischen Englisch → Deutsch und
Deutsch → Englisch; „Gemischt“ gibt es hier bewusst nicht, weil eine Liste jede
Vokabel einmal zeigt. Ein Richtungswechsel tauscht die Seiten und **verbirgt
alle Antworten wieder** – aufgedeckte Antworten passten sonst nicht mehr zur
neuen Vorderseite. Die Suche bleibt dabei stehen.

### Karten

Der Kartensatz kommt aus denselben neutralen Bausteinen wie das freie Üben:
`freeTargets` liefert die Ziele, `shuffle` mischt (Fisher-Yates mit
injizierbarem `mulberry32`), `arrangeTargets` hält den Abstand zwischen den
beiden Richtungen derselben Vokabel. Eine zweite Mischlogik gibt es nicht.

Ein Unterschied zur Lernrunde ist nötig: `arrangeTargets` verschiebt Karten, die
sich nicht regelkonform platzieren lassen, auf die nächste Runde. Ein
Kartensatz hat keine nächste Runde – eine fehlende Karte wäre eine verlorene
Vokabel. Übrig gebliebene Karten bekommen deshalb noch einen Platz, gesucht von
hinten, damit die geordnete Reihenfolge stehen bleibt. Nur wenn gar keine Stelle
passt, gilt: lieber ein knapper Abstand als eine fehlende Karte.

**Seed und Reproduzierbarkeit.** Die Reihenfolge hängt allein am Seed; derselbe
Seed ergibt denselben Satz. „Karten mischen“ erzeugt einen neuen Seed und
beginnt von vorn. Der Seed lebt im Zustand der Seite: Beim Neuladen beginnt der
Satz neu, und es entsteht keine Historie darüber, welche Karten jemand angesehen
hat.

**Richtungen.** Pakete mit beiden Richtungen bieten Gemischt, Englisch → Deutsch
und Deutsch → Englisch; einseitige Pakete bieten keine ungültige Wahl. Eine
einzelne Richtung zeigt jeden Eintrag einmal, Gemischt beide Richtungsziele. Die
Richtung steht auf jeder Karte, und ein Wechsel startet den Satz neu – angekündigt
über den Live-Bereich.

**Tastatur.** Ist der Kartenbereich fokussiert, drehen Leertaste und Enter die
Karte um, Pfeil rechts und links wechseln sie. Der Listener hängt am
Kartenbereich, **nicht am `window`**: Sonst würde er auch feuern, während jemand
in einem Suchfeld tippt oder mit den Pfeiltasten scrollt. Auf Schaltflächen
behalten Leertaste und Enter ihre eigene Bedeutung. Der Fokus bleibt beim
Umdrehen stehen.

Am Ende steht „Du hast alle Karten angesehen.“ mit „Noch einmal“, „Neu mischen“
und dem Rückweg – keine Bewertung, kein „bestanden“, keine Statistik.

### Selbsttest

Der Selbsttest ist eine **Selbsteinschätzung, keine Prüfung**. Er fragt richtig
ab – mit denselben Aufgabenformen und derselben zentralen Antwortprüfung wie der
Lernplan –, aber niemand außer der lernenden Person erfährt das Ergebnis, und
der Lernstand bleibt unberührt.

Vier klar getrennte Zustände: **einrichten**, **bearbeiten**, **auswerten**,
**Fehler ansehen**. Ein Neuladen setzt den Test zurück; das ist Absicht, denn es
entsteht so gar keine Historie darüber, wer wie abgeschnitten hat.

**Einrichten.** Wählbar sind Richtung (nur wo es eine echte Wahl gibt), Anzahl
(5, 10, 15, 20 oder alle verfügbaren) und die Aufgabenarten – gruppiert nach dem,
was sie von der lernenden Person verlangen:

| Gruppe | Bedeutet | Übungsformen |
| --- | --- | --- |
| offen | Antwort selbst eingeben | `open-translation` |
| halboffen | Lücke im Satz ergänzen | `cloze-free`, `cloze-bank` |
| geschlossen | Aus vorgegebenen Antworten auswählen | `multiple-choice` |

Angeboten wird nur, was das Paket in der gewählten Richtung wirklich hergibt.
**Karteikarten fehlen bewusst:** Sie zeigen die Lösung und fragen nichts ab –
in einem Selbsttest wären sie eine Selbsttäuschung. Wer so lernen will, findet
den Kartenmodus daneben.

Die Anzahl ist eine **Obergrenze**, kein Versprechen. Ergibt die Auswahl weniger
Aufgaben, steht das vor dem Start da („6 Aufgaben werden zusammengestellt. Mehr
gibt dieses Paket mit dieser Auswahl nicht her – erfunden wird nichts.“).

**Planung.** `src/domain/selfTest.ts` ist rein: kein Leitner, keine Fälligkeit,
kein IndexedDB, keine Uhr. Der Zufall kommt als Seed herein.

* `availableGroups` / `kindsForGroups` – welche Gruppen dieses Paket hergibt.
* `planSelfTest` – der Testplan. Baut auf `freeTargets`, `shuffle` und
  `arrangeTargets` auf, damit dieselbe Vokabel nicht doppelt vorkommt und
  zwischen ihren beiden Richtungen Abstand bleibt. `plannedCount` ist die
  Wahrheit, `requested` der Wunsch.
* `checkTaskAnswer` – die **eine** Antwortprüfung: `checkChoice` bei Multiple
  Choice, sonst `checkAnswer`. Eine zweite, vereinfachte Prüfung gibt es
  nirgends.
* `gradeSelfTest` – zählt richtig, fast richtig und noch nicht richtig.
  **Unbeantwortete Aufgaben zählen als falsch**, nicht als „egal“.
* `planMistakeRound` – die Fehlerwiederholung: nur die Vokabeln, die noch nicht
  saßen, in derselben Richtung, mit eigenen Aufgaben-IDs (`#retry`) und einer
  neuen, ganz normalen Auswertung.

**Auswerten.** „7 von 10 richtig“, dazu der Prozentwert und eine Aufteilung in
richtig / fast richtig / noch nicht richtig. Keine Note, kein „bestanden“, keine
Ampel, keine Punkte, kein Konfetti. Die Kategorien stehen **als Wort** da –
Farbe ist nie das einzige Unterscheidungsmerkmal. Fünf Wege führen weiter:
Fehler wiederholen, Fehler ansehen, neuen Test starten, Vokabeln durchsehen,
zurück zum Paket. Ist alles richtig, entfallen die beiden Fehler-Aktionen und es
steht schlicht „Alles richtig – das sitzt.“ da.

**Fehler ansehen.** Je Fehler: Richtung, Aufgabenart, die Frage, die **eigene
Antwort als Text** (auch die bei Multiple Choice gewählte Option, in Worten),
die akzeptierten Antworten und, wenn vorhanden, der Beispielsatz. Keine roten
Anstreichungen, keine Bewertung der Person.

**Jede Wiederholung ist endlich – aber nicht die letzte.** Eine Runde läuft
einmal durch und wird danach ganz normal ausgewertet. Sind dann immer noch
Fehler offen, steht „Fehler noch einmal üben“ wieder da: Wer will, startet
bewusst eine weitere Runde, die dann nur noch die **verbliebenen** Fehler
enthält. Was beim zweiten Mal saß, kommt nicht wieder. Eine automatische
Schleife „bis alles richtig ist“ gibt es nicht – jeder Durchgang ist eine
eigene Entscheidung. Drei Tests in `selfTest.test.ts` halten genau das fest:
dass die zweite Runde kürzer ist, dass die Kette garantiert abbricht und dass
`planMistakeRound` eine Liste liefert und keine Schleife.

### Gestaltung

Alle Ansichten folgen dem Markensystem: warmes Papier, Newsreader für
Beispielsatz und Zitat, viel Luft. Die Karte ist eine ruhige Fläche mit
Schatten – **keine 3D-Drehung**, denn dabei lägen Vorder- und Rückseite
gleichzeitig im Accessibility-Tree. Die Rückseite blendet kurz ein; die
Bedienung wartet nicht darauf, und bei `prefers-reduced-motion` entfällt die
Animation.

Damit `hidden` das auch wirklich leistet, steht in `global.css` seit diesem
Sprint `[hidden] { display: none !important; }`: Die Regel des Browsers verliert
sonst gegen jede Klasse mit eigenem `display` – eine verborgen geglaubte Antwort
stünde dann sichtbar da.

### Was garantiert nicht passiert

* Kein `startSession`, kein `recordAnswer` – aus `data/` wird nur `getPack`
  gelesen. Geprüft im Komponententest über gezählte Aufrufe und in E2E über
  einen Vergleich der IndexedDB-Inhalte vor und nach allen Modi, beim Selbsttest
  ausdrücklich auch **nach der Fehlerwiederholung**.
* Keine Fälligkeitsabfrage, keine Freischaltung, keine Änderung von Fächern,
  Terminen oder Rundenzählern.
* Keine Historie darüber, was angesehen oder wie abgeschnitten wurde:
  Aufgedeckte Antworten, Kartensatz, Testantworten und Auswertung leben nur im
  Zustand der geöffneten Seite. Ein Testergebnis wird **weder gespeichert noch
  übertragen** – auch nicht in `localStorage`.
* Keine externen Requests – der E2E-Test schlägt fehl, sobald ein fremder Host
  kontaktiert wird.

---

## Lernrichtungen wählen

Ein Paket führt eine oder beide Richtungen (`meta.direction`). Was daraus wird,
entscheidet seit Sprint 3B.1 die lernende Person – vor jeder Runde, auf der
Paketseite.

| Wahl | Wirkung |
| --- | --- |
| **Gemischt** (Voreinstellung) | beide Richtungen; die Staffelung „erst verstehen, dann selbst formulieren“ gilt |
| **Englisch → Deutsch** | nur rezeptiv |
| **Deutsch → Englisch** | nur produktiv – **ohne** Freischaltbedingung |

Ein Paket mit nur einer Richtung zeigt die Auswahl gar nicht: Eine Auswahl mit
einer gültigen Option ist keine Auswahl, sondern eine Attrappe
(`directionChoicesFor`).

### Warum die Staffelung bleibt – als Empfehlung

`isDirectionUnlocked` hält bei `both` die produktive Richtung zurück, bis die
rezeptive Fach 2 erreicht hat. Als Voreinstellung ist das gute Didaktik. Als
Verbot ist es eine Bevormundung: Wer heute Vokabelarbeit schreibt, muss gezielt
produktiv üben dürfen.

Die Lösung braucht keine zweite Mechanik. Die gewählte Richtung wird zur
*wirksamen* Paketrichtung der Planung (`effectiveDirection`), und
`isDirectionUnlocked` greift ohnehin nur bei `both` – also genau im gemischten
Modus. Es gibt deshalb keinen zweiten Planungspfad, den man vergessen könnte,
und die Wahl reist als `?direction=` an die Übungsseite.

### Freies Üben

Freies Üben bietet **beide Richtungen sofort** an, ohne jede Freischaltung
(`freeTargets`). Es schreibt keine Lernstände, keine Fächer und keine Termine –
es kann also nichts verderben. Vier Vokabeln in einem Paket mit beiden
Richtungen ergeben acht Aufgaben.

### Auswahl bleibt konsistent

Lückensätze gibt es nur produktiv. Wer sie auswählt und dann auf
Englisch → Deutsch wechselt, hätte sonst eine unsichtbare, unmögliche Auswahl –
und eine Runde, die leer bliebe. Ein Richtungswechsel entfernt deshalb alle
Übungsformen, die in der neuen Richtung nicht möglich sind, und beim Start
wandert ohnehin nur die Schnittmenge mit `possibleKinds` in die URL.

### In der Runde

Gemischte Runden enthalten beide Richtungen mit dem gewohnten Abstand zwischen
Gegenrichtungen derselben Vokabel (`arrangeTargets`, `MIN_SIBLING_GAP = 3`).
Jede Aufgabe ist mit ihrer Richtung beschriftet – im Kopf der Übungsseite und
über der Aufgabe selbst („Englisch → Deutsch (rezeptiv)“).

Der Lernstand bleibt **pro Vokabel und Richtung** getrennt (`directionKey`); an
dieser Trennung ändert die Wahl nichts.

### Voreinstellung für neue Pakete

Neue Pakete – von Hand, aus einem Text oder aus der Themenwerkstatt – stehen auf
**„beide Richtungen“** (`emptyMetaDraft`). Wer eine Vokabel kann, kann sie in
beide Richtungen, und die Lernenden wählen ohnehin selbst. **Bestehende und
importierte Pakete behalten ihre Angabe**; eine gespeicherte Entscheidung wird
nie stillschweigend überschrieben.

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
nie geübte – innerhalb gleichwertiger Gruppen gemischt. Später fällige Karten
kommen in einer normalen Runde **nicht** vor.

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
Richtung im gemischten Modus noch komplett zurückgestellt, steht dort statt der
Grafik:

> Produktiv noch nicht begonnen – wird nach der ersten erfolgreichen rezeptiven
> Wiederholung freigeschaltet.

Wer nicht warten will, wählt „Deutsch → Englisch“ oder „Frei üben“; beides steht
sofort offen.

Die Zahl „Aufgaben jetzt bereit“ stammt aus **derselben** Funktion, die auch die
Sitzung plant (`planSession`). Ein neues `both`-Paket mit vier Vokabeln zeigt
deshalb vier bereite Aufgaben, nicht acht.

Vor dem Start steht getrennt, was bereit ist und was tatsächlich eingeplant wird:

> **30** Aufgaben sind jetzt bereit. **15** Aufgaben werden für diese Runde
> eingeplant. Die übrigen 15 folgen in einer weiteren Runde …

Die Rundengröße ist als Obergrenze benannt („Bis zu 15 Aufgaben“), dazu gibt es
„Alle bereiten (N)“ – N zählt weder gesperrte noch später fällige Richtungen.
Ist nichts bereit, lässt sich keine Runde starten; stattdessen steht dort der
nächste Termin („morgen um 09:00“, „in 3 Tagen (Freitag, 6.3.)“) oder ein
neutraler Leerzustand.

---

## Aus englischem Text erstellen (Textwerkstatt)

Lehrkräfte fügen einen englischen Text ein; LexiFlow zerlegt ihn **auf dem
Gerät** in Sätze und Wörter und schlägt Vokabelkandidaten vor. Zu jedem
Kandidaten steht der Originalsatz aus dem Text – unverändert, als Beleg und als
späterer Beispielsatz.

Ablauf: Text einfügen → gewünschte Anzahl wählen → lokal analysieren →
Kandidaten prüfen → deutsche Antworten eintragen → in die bekannte Vorschau
übernehmen → Metadaten und speichern.

### Gewünschte Anzahl Vokabelvorschläge

Die Anzahl wird **vor** der Analyse festgelegt: 5, 10, 15, 20, 30 oder eine
eigene Zahl zwischen 1 und 50. Sie begrenzt die **angezeigten Kandidaten
insgesamt**, nicht nur die späteren KI-Empfehlungen.

Sie ist eine Obergrenze und kein Soll. Enthält der Text weniger geeignete
Wörter, wird nichts erfunden und nichts aufgefüllt – stattdessen steht dort
ehrlich *„12 von 20 geeigneten Vokabeln gefunden. Der Text enthält nicht mehr
geeignete Kandidaten – erfunden wird nichts.“*

**Gezählt werden nur geeignete Vokabeln.** Eine ungeklärte Abkürzung ist keine:
Sie bleibt sichtbar, damit die Lehrkraft sie vervollständigen kann, belegt aber
keinen der gewünschten Plätze und ist **nicht vorausgewählt**. Die Anzeige nennt
beides getrennt:

> 10 von 10 geeigneten Vokabeln gefunden · 2 Abkürzungen müssen geprüft werden.

Diese Zahl beschreibt den **Text**, nicht die Bearbeitung: Sie ändert sich weder
durch Bearbeiten noch durch Auswählen noch durch Entfernen. Sonst stünde nach
zwei vervollständigten Abkürzungen „12 von 10 gefunden“ da. Was die Lehrkraft
daraus gemacht hat, steht in einem eigenen Satz daneben:

> 1 Abkürzung vervollständigt · 1 Abkürzung weiterhin offen.

Eine vervollständigte Abkürzung lässt sich anschließend auswählen und speichern.
Ohne offene Abkürzungen bleibt es beim bekannten Satz.

Ausgewählt werden die häufigsten Kandidaten; bei gleicher Häufigkeit entscheidet
die Reihenfolge im Text. Das ist deterministisch, nachvollziehbar und
funktioniert **ohne jedes Sprachmodell** (`limitCandidates`). Ist eine
Priorisierung für die Lerngruppe verfügbar, bewertet sie anschließend
ausschließlich diese tatsächlich aus dem Text extrahierten Kandidaten und
sortiert sie – ohne die Auswahl zu verändern.

### Was garantiert lokal bleibt

* Die Analyse ist eine reine Funktion (`extractTextCandidates`) ohne jeden
  Netzwerkzugriff und ohne Zufall – gleicher Text, gleiches Ergebnis.
* Der **vollständige eingefügte Text wird nicht als eigener Datensatz
  gespeichert**. Er lebt nur im Formularzustand der geöffneten Seite und
  verschwindet mit ihr.
* Die **Originalsätze der übernommenen Vokabeln werden als Beispielsätze Teil
  des Pakets** und landen damit auch im Export. Das ist gewollt – sie sind der
  Beleg und die Grundlage für Lückensätze. In der Vorschau lassen sie sich
  bearbeiten oder entfernen, bevor gespeichert wird. Nicht übernommene Sätze
  verlassen die Seite nie.
* Es gibt keinen Cloud-Fallback, keinen API-Schlüssel und keine
  Umgebungsvariable für Geheimnisse. Der E2E-Test schlägt fehl, sobald ein
  Request an einen fremden Host geht.
* Erfunden wird nichts: keine Übersetzung, keine Wortart, kein GeR-Niveau.
  Fehlt die deutsche Antwort, bleibt die Zeile sichtbar und ist als Fehler
  gekennzeichnet – gespeichert wird sie nicht.

### Grenzen der Analyse

* Höchstens **20.000 Zeichen**. Längere Texte werden mit einer verständlichen
  Meldung abgelehnt, nie still gekürzt.
* Funktionswörter (`the`, `and`, `is` …) und wahrscheinliche Eigennamen sind
  standardmäßig ausgeblendet und lassen sich einblenden. Die Eigennamen-Erkennung
  ist eine Heuristik (durchgehende Großschreibung auch außerhalb des
  Satzanfangs) und liegt gelegentlich daneben.
* Wortformen werden seit Sprint 3B.1 zu einer Vokabel zusammengefasst
  (siehe „Wortformen und Abkürzungen“). Mehrwortverbindungen (`look after`)
  werden weiterhin nicht erkannt; erkannt werden nur Abkürzungen aus dem
  Lexikon.
* Segmentiert wird mit `Intl.Segmenter`; fehlt die API, greift ein
  handgeschriebener, getesteter Fallback (Abkürzungen wie `Mr.` inklusive).

### Optionale Übersetzungsvorschläge

| | |
| --- | --- |
| Wo | ausschließlich in Browsern mit eingebauter Translator-API (derzeit Chrome, je nach Version und Gerät) |
| Wann | erst nach ausdrücklichem Klick – auf „Text analysieren und Übersetzungen vorschlagen“ oder später auf „Sprachmodell laden und Vorschläge erzeugen“ |
| Wohin | nirgendwohin: *„Die Übersetzung läuft lokal in Chrome. Der Text wird nicht an LexiFlow oder einen Cloud-Dienst übertragen.“* |
| Ohne Unterstützung | ein normaler Zustand, kein Fehler – alles wird von Hand eingetragen, sonst ändert sich nichts |

**Die Übersetzung liegt seit Sprint 3B.1 im Hauptweg – und seit Sprint 3B.1a
hält der Knopf sein Versprechen.** Ist ein lokales Modell verfügbar oder ladbar,
heißt die Hauptaktion der Textwerkstatt „Text analysieren und Übersetzungen
vorschlagen“; ohne Modell bleibt es bei „Text lokal analysieren“. Keine
Schaltfläche verspricht also ein Modell, das es nicht gibt.

Ein Klick, ein Ablauf:

1. Der Text wird **zuerst** lokal analysiert. Ist er zu lang oder enthält er
   keine brauchbaren Kandidaten, erscheint die Meldung – und es wird **nichts**
   geladen. Ein Modelldownload über mehrere Gigabyte für einen abgelehnten Text
   wäre reine Verschwendung.
2. Erst danach startet `prepare()`, immer noch **synchron im Klickpfad**:
   Zwischen Analyse und Vorbereitung steht kein `await`, sonst verfiele die
   User-Activation und der Download begänne nie.
3. Die Prüfansicht öffnet sich **sofort**. Sie wartet auf nichts.
4. Sobald dieselbe Zusage erfüllt ist, laufen die Vorschläge für die
   ausgewählten Kandidaten **von selbst** an. Ein zweiter Klick war der Fehler,
   den Sprint 3B.1a behoben hat.

Die Zusage wird weitergereicht, nicht wiederholt (`TranslationPreparation` in
`src/translation/preparation.ts`): Die Werkstatt startet sie, die Prüfansicht
wartet auf dasselbe Promise. Ein zweiter `prepare()`-Aufruf findet nicht statt,
und auch der Chrome-Anbieter selbst teilt eine bereits laufende Vorbereitung –
zwei `create()`-Aufrufe würden die erste Instanz verwerfen.

**Sichtbar und abbrechbar.** Der `AbortController` entsteht zusammen mit der
Vorbereitung, nicht erst in der Ansicht – sonst wäre die Schaltfläche
„Abbrechen“ während des Downloads eine Attrappe. Ebenso wird der Fortschritt
aufbewahrt: Der erste Download beginnt, bevor die Prüfansicht steht, und wer
sich später anmeldet, bekommt den zuletzt gemeldeten Wert sofort. Ein Abbruch
heißt „Laden abgebrochen“, nicht „Modellfehler“; er startet keine Übersetzung
und lässt sich mit einem neuen Klick wiederholen – dann mit einem eigenen,
frischen `AbortController`.

Verlassen der Prüfansicht bricht eine noch laufende Vorbereitung ab. Zuständig
dafür ist der Import-Assistent, der sie auch gestartet hat: Er weiß eindeutig,
wann die Prüfung wirklich verlassen wird, während React die Aufräumfunktion
eines Effekts im StrictMode auch beim reinen Neuaufbau ruft. Ein mehrere
Gigabyte großer Download soll nicht unbemerkt weiterlaufen.

**Verfügbarkeit verliert gegen Vorbereitung.** Beide werden parallel ermittelt.
Trifft die ältere Auskunft `getAvailability` **nach** einer gelungenen
Vorbereitung ein, wird sie verworfen – sonst spränge die Oberfläche von „bereit“
zurück auf „lädt“ und verlangte einen zweiten Download für ein Modell, das schon
da ist. Ein Anbieterwechsel setzt die Vorbereitung weiterhin zurück.

Fehler werden **nicht verschluckt.** Das Ergebnis der Vorbereitung erfüllt sich
immer und trägt den Fehlschlag in sich (`{ ok: false, error }`); ein
`catch(() => undefined)` würde ihn unsichtbar machen, eine offene Ablehnung
landete als „unhandled rejection“ in der Konsole. Scheitert die Vorbereitung,
steht der Grund in der Prüfansicht, daneben „Erneut versuchen“ und der Hinweis,
dass die Handeingabe weiterhin funktioniert. Fehler einzelner Übersetzungen
stehen **an der betroffenen Zeile**; Abbruch und Anbieterwechsel funktionieren
unverändert. Wird die Ansicht verlassen, werden keine Zustände mehr gesetzt und
keine Übersetzungen mehr angestoßen.

Ein Vorschlag ist **immer ungeprüft**. Er steht getrennt neben dem Eingabefeld
und wird nie automatisch übernommen; erst „Vorschlag übernehmen“ schreibt ihn in
die deutsche Antwort. Wird er anschließend bearbeitet, gilt die Zeile wieder als
eigene Eingabe. Maschinelle Übersetzung kennt den Kontext nicht: Sie trifft bei
mehrdeutigen Wörtern (`litter`, `light`, `book`) oft die falsche Bedeutung, kann
Wortarten verwechseln und ignoriert das Sprachniveau der Lerngruppe. **Die
Lehrkraft bleibt für jede Vokabel und jeden Satz verantwortlich.**

### Herkunft der Zeilen

Die vorhandenen `sourceType`-Werte werden weiterverwendet: `import` für aus dem
Text übernommene und selbst übersetzte Vokabeln, `text-ai` nur dort, wo ein
maschineller Vorschlag tatsächlich übernommen wurde. Zusätzliche Angaben
(Häufigkeit im Text, Originalsatz, Übersetzungsstand, seit Sprint 3B.1 auch die
beobachteten Wortformen und Abkürzungshinweise) leben ausschließlich im
Entwurfsmodell (`DraftProvenance`); das Austauschformat `.vocabpack.json` und
seine `formatVersion` bleiben unverändert.

### Verfügbar ist nicht vorbereitet

Zwei Dinge werden bewusst getrennt geführt:

| Begriff | Bedeutung |
| --- | --- |
| `unavailable` | Kein Modell für dieses Sprachpaar – die Oberfläche bietet keine Vorschläge an. |
| `downloadable` | Das Modell ließe sich laden, liegt aber noch nicht auf dem Gerät. |
| `downloading` | Der Browser lädt es bereits (z. B. durch einen anderen Tab angestoßen). |
| `available` | Das Modell liegt auf dem Gerät – **mehr nicht.** Eine Translator-Instanz gibt es damit noch nicht. |
| *vorbereitet* | `prepare('en','de')` ist für genau diesen Anbieter erfolgreich durchgelaufen. Erst dann darf übersetzt werden. |

Deshalb hängt der Aufruf von `prepare()` an der Vorbereitung, nicht am
gemeldeten Zustand: Auch bei `available` läuft er nach dem ersten Klick genau
einmal. `downloadable` **und** `downloading` führen beide über dieselbe
Schaltfläche zur Initialisierung – ein gemeldetes „lädt gerade“ ist kein toter
Endzustand. Ein Abbruch oder Fehler verwirft die Vorbereitung wieder, ein
Anbieterwechsel ebenfalls. `prepare()` wird direkt im Klickpfad aufgerufen, ohne
vorherigen asynchronen Zwischenschritt, damit die User-Activation erhalten
bleibt, die der Browser für den Modelldownload verlangt.

### Ausblick (nur technisch)

Der Vertrag ist bereits auf Sprint 2B ausgelegt: weitere `AiProvider`-Fähigkeiten
(Vorschläge zu einem Thema, Eintrag ergänzen, alternativer Beispielsatz) lassen
sich hinzufügen, ohne die Oberfläche der Textwerkstatt oder das Austauschformat
zu ändern. In der Anwendung selbst wird darauf bewusst nicht hingewiesen.

### Anbieter statt globalem Singleton

Übersetzung und KI sind zwei getrennte Verträge:
`TranslationProvider` (`getAvailability` / `prepare` / `translate` / `destroy`)
und `AiProvider` (Fähigkeiten `suggest-from-text`, `suggest-from-topic`,
`enrich-entry`, `alternative-sentence`). Beide melden ihren Zustand asynchron als
`unavailable | downloadable | downloading | available`, laden Modelle nur nach
ausdrücklicher Auslösung, melden echten Fortschritt und lassen sich über ein
`AbortSignal` abbrechen. Bereitgestellt werden sie über eine kleine Registry
(`ProviderRegistry`, React-Context) – in Tests vollständig ersetzbar, ohne
Modulzustand zu verbiegen. Standard bleibt in beiden Fällen der ehrliche
Nullanbieter; ein Anbieter ruft niemals selbst `fetch` auf.

---

## Wortformen und Abkürzungen im Text

Bis Sprint 3A zählte die Textanalyse Schreibweisen. Ein Absatz über eine Bucht
lieferte damit `island` **und** `islands` als zwei Vorschläge, dazu `sq` und
`mi` als zwei sinnlose Bruchstücke aus „600 sq mi“. Bei zehn gewünschten
Vokabeln belegten solche Reste die Hälfte der Liste. Seit Sprint 3B.1 sind
Wortformen und Abkürzungen eigene Schritte **vor** der Begrenzung.

### Reihenfolge der Verarbeitung

Die Reihenfolge steht als Kette in `extractTextCandidates` und ist der Kern der
Verbesserung:

1. **Tokens und Wendungen** bestimmen (`segmentSentences`, `segmentWords`)
2. **Wortformen zu lexikalischen Familien gruppieren** (`buildFamilies`)
3. **Abkürzungen im Kontext auflösen** (`findAbbreviations`)
4. **unbrauchbare Textreste** entfernen oder kennzeichnen
   (`maskUrls`, `maskEditorialMarkers`)
5. **Kandidaten sortieren** (`sortCandidates`)
6. **erst danach** auf die gewünschte Anzahl begrenzen (`limitCandidates`)

Wer zuerst begrenzt, füllt die Liste mit Beugungen und Bruchstücken. Deshalb ist
die Begrenzung der letzte Schritt – und ungeklärte Abkürzungen stehen in der
Rangfolge hinten, damit sie kein brauchbares Wort verdrängen
(`isUsableCandidate`).

### Lexikalische Familien

Eine Familie ist ein Lemma mit allen Formen, die der Text tatsächlich enthält.
Sie trägt Lemma, beobachtete Formen, Häufigkeit je Form, die gemeinsame
Häufigkeit und die Fundstellen (`LexicalFamily` in `src/domain/wordForms.ts`).

In der Prüfansicht steht das als ein Satz:

> Im Text: islands, island · insgesamt 18-mal

Dazu ein grammatischer Hinweis. Wie genau er ausfällt, hängt davon ab, was der
Text hergibt – siehe „Was der Nachbar links verrät“ weiter unten.

**Zwei Sicherheitsstufen.** Ein Vokabeltrainer ohne Wörterbuch kann englische
Morphologie nicht sicher auflösen; er kann nur entscheiden, wann er sich sicher
genug ist.

| Stufe | Regeln | Bedingung |
| --- | --- | --- |
| sicher | reguläre Plurale (`-s`, `-es`, `-ies`), zuverlässige unregelmäßige Plurale (`children`, `women`, `leaves` …) | greifen auch, wenn die Grundform im Text fehlt |
| belegpflichtig | `-ed`, `-ing`, Steigerung `-er`/`-est` | greifen nur, wenn die Grundform **im selben Text** steht |

Warum `-ed` und `-ing` belegpflichtig sind: `crowded` ist in den meisten Texten
das Adjektiv und nicht die Vergangenheit von `crowd`, und `protected area` ist
kein Beleg für die Vokabel `protect`. Steht `visit` im Text, ist die Sache
eindeutig – dann werden `visit`, `visits` und `visited` zu einer Vokabel. Steht
es nicht da, bleibt `visited` stehen. Zwei Vorschläge sind ein
Schönheitsfehler; zwei zusammengeworfene Wörter sind ein fachlicher Fehler.

**Was der Nachbar links verrät.** Vor einem Nomen steht im Englischen fast immer
ein Artikel, ein Zahlwort oder ein Possessiv („the islands“, „1,969 islands“),
vor einem Verb ein „to“ oder ein Subjektpronomen („he visits“). Mehr Kontext als
dieses eine Wort wertet die Analyse nicht aus – aber es genügt, um zwei Dinge
ehrlich zu entscheiden:

* **Die Beschriftung einer `-s`-Form.** Ohne Beleg heißt sie neutral
  *„Plural oder 3. Person Singular: visits“*; mit Nomenbeleg *„Plural: islands“*,
  mit Verbbeleg *„3. Person Singular: visits“*. Widersprüchliche Belege sind
  kein Beleg. Enthält die Familie eine `-ed`- oder `-ing`-Form, ist die Sache
  ohnehin klar.
* **Mehrdeutige `-ves`-Formen.** `lives` gehört zu `life` **oder** zu `to live`,
  `leaves` zu `leaf` oder zu `to leave` (ebenso `halves`, `shelves`). Ohne
  eindeutigen Beleg – aus dem Nachbarwort oder aus einer im Text vorhandenen
  Grundform – werden sie **gar nicht** zugeordnet und bleiben ein eigener
  Eintrag.

**`-es` ist kein einheitliches Muster.** Diese Fälle sind einzeln geregelt und
geprüft:

| Eingabe | Ergebnis | Regel |
| --- | --- | --- |
| `buses`, `gases`, `lenses` | `bus`, `gas`, `lens` | Der Singular endet selbst auf `-s` und steht in `INVARIANT_S` |
| `quizzes` | `quiz` | Sibilant + `-es`, doppelter Endkonsonant fällt |
| `heroes`, `potatoes` | `hero`, `potato` | `-oes` nach mehrsilbigem Stamm |
| `shoes`, `toes` | `shoe`, `toe` | „sho“ und „to“ sind keine Stämme (Silbenmaß 0) |
| `houses`, `noses` | `house`, `nose` | Das stumme `e` gehört zum Stamm |
| `goes`, `does` | `go`, `do` | Kurze Liste unregelmäßiger `-s`-Formen |
| `has` | `has` | Unter vier Zeichen rührt die Analyse nichts an – nie `ha` |

**Schutzmechanismen**, alle sichtbar und geprüft statt in einer Heuristik
versteckt:

* `INVARIANT_S` – `news`, `series`, `species`, `means`, `glasses`, `physics`,
  `analysis` … werden nie zerlegt.
* `NOT_INFLECTED` – `water`, `other`, `forest`, `building`, `thing`, `best` …
  enden nur zufällig wie eine Beugung. Aus `water` wird niemals `wat`.
* Mindestlänge 3 für jede erzeugte Grundform, keine Ketten über eine selbst
  gebeugte Form, und Wörter unter vier Zeichen bleiben unangetastet.
* Zusammengeführt wird nur über Morphologie, nie über Ähnlichkeit der
  Schreibung: `bank` und `banks` gehören zusammen, `banner` steht für sich.

**Beobachtete Formen sind keine akzeptierten Antworten.** `islands` wandert
nicht in `acceptedEnglishAnswers` – auf „die Insel“ ist es keine richtige
Antwort. Die Formen erscheinen als Hinweis für die Lehrkraft (im Entwurf unter
`provenance`) und wirken im Lückentext.

### Lückentexte mit gebeugten Formen

Der Lückentext erwartet die Form, die **im Beispielsatz** steht:

> Around 1,969 \_\_\_\_ fill the bay. → erwartet `islands`, nicht `island`

Möglich wird das durch `findHeadwordInSentence` (`src/domain/wordMatch.ts`), die
gemeinsame Wortsuche von Entwurfsprüfung, Satzassistent und Lückentext. Sie
sucht in drei Runden: die genaue Wendung, ihre Schreibvarianten (`to apologise`
→ `apologise`, `square mile (sq mi)` → `sq mi`) und erst zuletzt eine Beugung
desselben Wortes. Zurückgegeben wird immer die Stelle im Satz samt der Zeichen,
die dort stehen. Wortgrenzen gelten unverändert: `cat` steckt nicht in
`category`, und `water` nicht in `waiter`.

**Der Satz entscheidet auch hier.** Die dritte Runde wertet dasselbe Nachbarwort
aus wie die Textanalyse, denn dieselbe Schreibung kann zu verschiedenen Wörtern
gehören:

| Satz | gehört zu | gehört **nicht** zu |
| --- | --- | --- |
| „She lives near the bay.“ | `live` | `life` |
| „Their lives changed.“ | `life` | `live` |
| „He leaves the house early.“ | `leave` | `leaf` |
| „The leaves are red.“ | `leaf` | `leave` |

Fehlt der Kontext oder ist er widersprüchlich, gehört die Form zu **keinem** der
beiden Stichwörter – ein Eintrag `life` bekommt „Lives changed.“ dann weder als
Beispielsatz noch als Lückensatz. Eine Sonderregel nur für `lives` und `leaves`
gibt es nirgends in der Oberfläche; alles hängt am Flag `ambiguous` der
Formanalyse.

### Abkürzungen

`src/domain/abbreviations.ts` löst Abkürzungen auf – oder meldet ehrlich, dass
sie ungeklärt sind. Zwei Regeln bestimmen alles:

1. **Nichts erfinden.** Was das Lexikon nicht kennt, bekommt den Hinweis
   *„Abkürzung – Langform prüfen“* und keine geratene Langform.
2. **Kontext entscheidet.** Maßeinheiten gelten nur unmittelbar hinter einer
   Zahl. Ohne diese Bedingung würde aus „She lives in Berlin“ ein Zoll.

| | |
| --- | --- |
| Einheiten | `km`, `km²`, `cm`, `mm`, `kg`, `mph`, `km/h`, `sq mi`, `sq km`, `sq ft`, `ft`, `yd`, `mi`, `lb`, `ha`, `°C`, `°F` |
| Akronyme | `UNESCO`, `UN`, `UK`, `USA`, `EU`, `NATO`, `AD`, `BC`, `e.g.`, `i.e.`, `etc.`, `approx.` |
| Anzeige | „square mile (sq mi)“ mit dem Vorschlag „die Quadratmeile“ |
| Unbekannt | bleibt stehen, mit dem Hinweis „Abkürzung – Langform prüfen“ |

Aus „600 sq mi“ wird **ein** Vorschlag, nie `sq` und `mi`. Die längere
Abkürzung gewinnt, Punkte und fehlende Leerzeichen sind erlaubt
(`600 sq. mi.`, `12km`). Bewusst **nicht** im Lexikon stehen mehrdeutige
Kürzel: `m` kann Meter oder Million sein, `in` ist häufiger eine Präposition
als ein Zoll.

Eine unbekannte Abkürzung wird nur dort vermutet, wo normale Prosa sie nicht
hat: ein sehr kurzes Kürzel **ohne Vokal** direkt hinter einer Zahl („400 bhp“)
oder ein Wort mit Binnenpunkten („a.m.“). Deshalb bleibt „5 men“ unangetastet –
und keine Abkürzung wird gelöscht, nur weil sie kurz ist.

In der Prüfansicht ist die **Langform bearbeitbar** („Langform für „sq mi““),
ebenso Übersetzung und Hinweis; entfernen lässt sich der Vorschlag wie jeder
andere.

**Die bekannte deutsche Entsprechung erscheint sofort als Vorschlag** – bei
„square mile (sq mi)“ also „die Quadratmeile“, gekennzeichnet als *lokaler
Vorschlag*. Sie kommt aus dem Lexikon dieser Datei, ist deterministisch und
braucht **kein Übersetzungsmodell**: Auch ein Browser ohne Translator zeigt sie.
Wie jeder Vorschlag gilt sie als ungeprüft und steht neben dem Antwortfeld, bis
die Lehrkraft sie übernimmt, bearbeitet oder ablehnt. Ein Modell überschreibt
sie nicht stillschweigend – es übersetzt dann nur noch den Beispielsatz. Eine
unbekannte Abkürzung bekommt weiterhin **keine** erfundene Übersetzung.

### Redaktionelle Reste

Kopierte Wikipedia-Absätze bringen Fußnoten und Navigationstexte mit.
`maskEditorialMarkers` blendet sie **längentreu** aus – dieselbe Technik, mit
der die Analyse schon URLs ausblendet, damit alle Zeichenoffsets gültig
bleiben: `[1]`, `[citation needed]`, `[edit]`, „Jump to navigation“,
„Retrieved from“, „From Wikipedia, the free encyclopedia“, „Categories:“,
`ISBN 978-…`, `doi:`, `PMID`. Sie werden nie zu Kandidaten – und eine Fußnote
`[1]` wird auch nicht als unbekannte Abkürzung gemeldet.

### Was das Paketformat davon sieht: nichts

Familien, Häufigkeiten je Form und Abkürzungshinweise leben ausschließlich im
Entwurfsmodell (`TextCandidate`, `DraftProvenance`). Das portable Format bleibt
bei **`formatVersion 1`** und unverändert; ein Paket aus Sprint 2 öffnet sich
weiterhin, und ein neues Paket enthält weder `provenance` noch `formSummary`
noch `occurrences`. Geprüft in `src/import/textFormsPortability.test.ts`.

### Grenzen

* Ohne Wörterbuch bleibt jede Zuordnung eine Regel. Unregelmäßige Verben
  (`go`/`went`, `buy`/`bought`) werden **nicht** zusammengeführt.
* Homonyme kann die Analyse nicht trennen: `lives` als Verb und als Plural von
  `life` sind für sie dasselbe. Zugeordnet wird der Plural.
* `glasses` gilt bewusst als eigenes Wort – als Brille ist es kein Plural von
  `glass`, und welche Bedeutung ein Text meint, weiß die Datei nicht.
* Das Abkürzungslexikon ist kurz und handgepflegt. Es soll die häufigen Fälle
  des Schulalltags treffen, nicht vollständig sein.

---

## Satzassistent

Zu einer Vokabel kann das lokale Sprachmodell einen Beispielsatz vorschlagen –
im **bereits vorhandenen Detailbereich** einer Entwurfszeile, nicht in einem
zweiten Editor. Verfügbar ist er überall dort, wo die `DraftTable` steht: im
Importassistenten **und** im Paketeditor.

Ohne vorhandenen Satz gibt es „Beispielsatz vorschlagen“, mit mindestens einem
Satz „Einfacheren Satz vorschlagen“ und „Anderen Kontext vorschlagen“.

### Vorschläge sind ungeprüft – und werden nie automatisch übernommen

Der Vorschlag steht **getrennt** von den gespeicherten Feldern. Vier Aktionen
stehen zur Wahl: als weiteren Satz übernehmen, einen vorhandenen Satz ersetzen
(eigene Schaltfläche, bei mehreren Sätzen mit ausdrücklicher Auswahl), ablehnen
oder neu versuchen. Es gibt kein stilles Überschreiben. Bei bereits zehn Sätzen
– der Grenze des Paketformats – ist das Hinzufügen deaktiviert, das Ersetzen
bleibt möglich. Ein ergänzter Satz verändert den `sourceType` der Zeile nicht:
Aus einer Handarbeit wird dadurch keine Modellvokabel.

### Was LexiFlow prüft, bevor überhaupt etwas angezeigt wird

Ein Vorschlag muss nicht leer sein, innerhalb der Schemagrenze von 400 Zeichen
liegen, das Stichwort beziehungsweise die vollständige Wendung enthalten (mit
Wortgrenzen; beim Infinitiv zählt auch die Form ohne „to“), darf keinem
vorhandenen Satz entsprechen und keine HTML-Auszeichnungen enthalten. Die
deutsche Entsprechung ist optional.

**Nichts wird still repariert.** Ein zu langer Satz wird nicht gekürzt, ein
Satz mit Auszeichnungen nicht gesäubert, ein fehlendes Stichwort nicht
eingebaut – jede dieser „Reparaturen“ könnte die Bedeutung verändern. Was
durchfällt, wird mit verständlicher Begründung abgelehnt; die vorhandenen Sätze
bleiben dabei vollständig unangetastet, und ein neuer Versuch ist ein Klick
entfernt.

Ohne Prompt-API steht im geöffneten Detailbereich ein ruhiger Hinweis – keine
Warnung je Tabellenzeile. Die manuelle Satzbearbeitung funktioniert unverändert.

## Empfehlungen aus einem Text

Nach der lokalen Analyse kann das Sprachmodell markieren, welche der gefundenen
Kandidaten für die eingestellte Lerngruppe besonders lohnend erscheinen:
„Für Lerngruppe priorisieren“ mit Jahrgang, GeR-Niveau, optionalem Thema und
gewünschter Empfehlungsanzahl (5, 10, 15 oder 20).

> LexiFlow empfiehlt Kandidaten relativ zu dieser Lerngruppe. Die Empfehlung ist
> keine automatische Auswahl und keine Lehrplanzusage.

### Der Text geht nicht an das Modell

Übergeben wird **nie der eingefügte Rohtext**, sondern höchstens
`MAX_CONTEXT_CANDIDATES = 60` Kandidaten mit je vier Angaben: einem lokal
vergebenen neutralen Schlüssel (`c1`, `c2` …), dem englischen Wort, der
Häufigkeit und **genau einem** Originalsatz. Keine Paket- oder Eintrags-IDs,
keine Übersetzungen anderer Vokabeln, keine Lernstände, keine Namen. Die
Auswahl ist deterministisch (nach Häufigkeit); Kandidaten jenseits der Grenze
bleiben vollständig von Hand auswählbar.

### Das Modell kann nichts erfinden

Die Antwort besteht ausschließlich aus Schlüsseln (`{"recommendedKeys": [...]}`),
begrenzt auf 20. Zod prüft die Form, danach filtert LexiFlow lokal: unbekannte
Schlüssel raus, Dubletten raus, auf die gewünschte Anzahl begrenzt. Ein Wort,
das nicht im Text stand, kann so nicht in die Auswahl geraten. Bleibt nichts
Gültiges übrig, gibt es eine verständliche Meldung und einen neuen Versuch.

### Empfehlungen wählen nichts aus

Das ist die wichtigste Grenze dieser Funktion:

* Eine Empfehlung erzeugt ein Badge „Für Lerngruppe empfohlen“ und die
  Sortierung „Empfehlungen zuerst“ – **mehr nicht**.
* Die bestehende Auswahl bleibt nach der Erzeugung unverändert.
* Erst „Nur Empfehlungen auswählen“ verändert die Checkboxen; „Alle wieder
  auswählen“ nimmt das zurück.
* Eine manuelle Änderung gewinnt danach jederzeit.
* Entfernte Kandidaten kommen durch eine neue Empfehlung nicht zurück.
* Die Übersetzungsvorschläge bleiben eine davon getrennte Funktion.

Ist die Prompt-API nicht verfügbar, bleibt die Textwerkstatt vollständig
benutzbar – Analyse, Übersetzung und Auswahl funktionieren unverändert, und es
erscheint ein ruhiger Hinweis statt eines Fehlers.

### Fertige Pakete brauchen kein Modell

Weder Satzvorschläge noch Empfehlungen hinterlassen Spuren im Paket. Im
`.vocabpack.json` stehen keine Modell- oder Vorschlagsdaten, kein Modus, keine
Empfehlungsschlüssel und kein Anbietername – nur Vokabeln und ihre Sätze. Zwei
Integrationstests (`sentencePortability.test.ts`,
`textRecommendationPortability.test.ts`) laufen den ganzen Weg bis zur Lernrunde
auf einem Gerät ganz ohne Modelle.

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

## Offline-Wörterbuch (seit Sprint 4A.2)

LexiFlow bringt ein englisch-deutsches Wörterbuch mit, das **ohne Netz, ohne
Konto und ohne Browsermodell** arbeitet. Es ist der verlässliche Grundweg für
Übersetzungsvorschläge – in Safari genauso wie in Chrome. Ein lokales
Sprachmodell bleibt eine optionale zusätzliche Stufe, keine Voraussetzung.

Die Reihenfolge der Vorschläge:

1. Abkürzungs- und Wortformregeln (deterministisch, aus dem Text hergeleitet),
2. **das eingebaute Offline-Wörterbuch**,
3. ein lokaler Übersetzer oder ein lokales Sprachmodell, falls vorhanden,
4. die Prüfung durch die Lehrkraft.

**Kein Wörterbuchvorschlag wird ungeprüft gespeichert.** Vorschläge stehen neben
dem Antwortfeld, nie darin. Eine getippte Antwort wird nie überschrieben, ein
lokaler Abkürzungsvorschlag nie verdrängt. Schwierigkeitsgrad und Thementags
kommen nie aus Wörterbuchdaten – die Quelle kennt beides nicht.

### Quelle, Lizenz und Prüfsumme

| | |
| --- | --- |
| Quelle | englisches Wiktionary, extrahiert mit [wiktextract](https://github.com/tatuylonen/wiktextract) |
| Datei | `https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz` (2,63 GiB) |
| Dump | **2026-08-05**, Extraktion **2026-08-28**, wiktextract `872fc7b` / `4deed51` |
| SHA-256 | `4c27d202e875550c2cc7ea93a4d21ddf80440e5030606d3edbb8b0e65dc64006` |
| Lizenz Daten | **CC BY-SA 4.0** (Wiktionary, dual mit GFDL) |
| Lizenz Werkzeug | MIT (wiktextract, © Tatu Ylonen) |

Die Prüfsumme ist **lokal berechnet**, nicht offiziell veröffentlicht:
kaikki.org bietet keine an. Sie belegt Reproduzierbarkeit, nicht Echtheit
gegenüber dem Anbieter. Einzelheiten stehen in `third_party/wiktionary/SOURCE.md`.

Attribution und Lizenz sind in der Anwendung selbst sichtbar – unter
**Daten & Datenschutz**, samt Ausgabe von Quelle und Lizenz als JSON. Die
Weitergabepflichten betreffen den **Datensatz**; LexiFlows Programmcode ist
keine Bearbeitung eines Wörterbuchs, beide liegen in derselben Datei
nebeneinander. Das ist eine technische Einordnung, keine Rechtsberatung.

Zitate, Bilder, Audio, Aussprache und Etymologie sind **nicht** enthalten. Die
Umformung nimmt nur Stichwort, Wortart, Bedeutungsüberschrift, deutsche
Entsprechung, Genus und Marker.

### Die Pipeline

Zwei Schritte, beide reproduzierbar, beide ohne Laufzeit-Download:

```
node scripts/dictionary/extract-wiktextract.mjs \
  --source raw-wiktextract-data.jsonl.gz \
  --out    build/dictionary/en-de.raw.jsonl \
  --report build/dictionary/report.json

node scripts/dictionary/build-dictionary-runtime.mjs \
  --in   build/dictionary/en-de.raw.jsonl \
  --out  src/dictionary/data/dictionary.json \
  --meta src/dictionary/data/runtime-report.json \
  --source-report build/dictionary/report.json
```

Die 2,63-GB-Quelldatei liegt **außerhalb** des Repositorys und wird **nie
vollständig entpackt**: `gunzip` läuft als Transform-Stream, es liegt immer nur
eine Zeile im Speicher. Ein voller Durchlauf über 10 806 865 Zeilen dauert rund
100 Sekunden.

Am erzeugten Datensatz wird **nichts von Hand geändert**. Korrekturen gehören in
die Regeln in `scripts/dictionary/wiktextract.mjs`, wo sie durch
`scripts/dictionary/wiktextract.test.mjs` abgesichert sind.

### Was aus 22,9 GB übrig bleibt

| | |
| --- | --- |
| Rohzeilen | 10 806 865 |
| englische Einträge | 1 540 602 (alle geparst) |
| Stichwörter mit deutscher Entsprechung | 73 023 |
| davon im Laufzeitbestand (ohne Eigennamen) | **66 372** |
| Bedeutungsgruppen | 88 249 |
| deutsche Entsprechungen | 152 339 |
| mit Genus | 108 104 |
| Flexionsformen | 116 507 |
| Eigennamen entfernt | 6 651 (spart 408 KiB, 6,2 %) |
| verworfene Affixfragmente | 757 |

Abdeckung, gemessen gegen eine Häufigkeitsliste des Englischen
(direkt bzw. über die Grundform): **99,2 %** der 500 häufigsten Wörter,
**96,6 %** der 1000 häufigsten, **95,7 %** der 2000 häufigsten. Was fehlt, sind
fast ausschließlich Eigennamen und Umgangsformen (*york, gonna, wanna*) – für
einen Vokabeltrainer kein Verlust.

### Der Fall `doctor`: Verweise zwischen Stichwörtern

Im englischen Wiktionary hat `doctor` für die medizinische Bedeutung **keinen
eigenen Übersetzungsblock**, sondern einen Verweis auf `physician`. Dieser
Verweis überlebt die Extraktion nicht – im Rohdatensatz ist von `trans-see`
nichts mehr zu finden. Übrig bleibt die Glosse „A physician; a member of the
medical profession …“, deren erster Link auf `physician` zeigt.

Daraus wird der Verweis rekonstruiert, mit vier Bedingungen:

1. Der **erste Teilsatz** der Glosse ist genau das verlinkte Stichwort.
2. Das Ziel nennt das verweisende Wort in seiner **eigenen** Erklärung.
3. Es wird **eine** Bedeutung übernommen, ausgewählt über die Wortüberschneidung.
4. Tiefe eins, keine Zyklen, gleiche Wortart.

Jede der vier Bedingungen ist an einem Fehlversuch entstanden, den die Messung
am echten Datensatz gezeigt hat:

| ohne Bedingung | Ergebnis |
| --- | --- |
| 1 | `physician` erbte von `medical` |
| 2 | `crow` → *Vogel*, `hour` → *Jahreszeit*, `brown` → *kacken* |
| 3 | `word` erbte alle elf Bedeutungen von `order`, bis zum Polynomgrad |
| 4 | das Ergebnis hing an der Lesereihenfolge der Quelle |

Von 100 265 Verweiszielen werden **603** übernommen, 25 122 an Bedingung 2
abgelehnt, 49 als Zyklus abgebrochen, der Rest bleibt unauflösbar. Jede geerbte
Bedeutung trägt sichtbar `via` – sie ist eine Schlussfolgerung, keine Auskunft.

### Laufzeitformat: 64 Fächer

Eine Lehrkraftdatei liegt als **eine** HTML auf einem fremden Rechner. Beim
Öffnen darf sie nicht 66 000 Stichwörter auspacken. Der Datensatz zerfällt
deshalb in 64 Fächer; ein Suchschlüssel gehört über eine deterministische
Streuung (FNV-1a) in genau eines, und nur dieses wird entpackt.

Gestreut statt nach Anfangsbuchstaben aufgeteilt, weil Buchstaben sehr ungleich
besetzt sind und das größte Fach die Wartezeit bestimmt. Gemessen liegen die
Fächer zwischen 92 KiB und 105 KiB Base64.

Entpackt wird mit **fflate**, nicht mit `DecompressionStream`: Die browsereigene
API ist unter `file://` in Safari kein verlässlicher Weg, und genau dort muss
die Datei funktionieren. Kein Worker – ein Worker unter `file://` wäre in Safari
eine Wette. `src/dictionary/runtimeFormat.ts` und der Erzeuger werden in
`src/dictionary/dictionary.test.ts` **gegeneinander** geprüft, nicht bloß
nebeneinander gepflegt.

### Rangfolge: zurückstufen statt umsortieren

Die Quelle kennt keine Häufigkeit. Die einzige belegte Reihenfolge ist ihre
eigene – also wird nicht umsortiert, sondern **zurückgestuft**: Registermarker
(veraltet, umgangssprachlich, derb) kosten am meisten, danach sehr lange
Komposita, Mehrwortausdrücke und Klammerzusätze. Geerbte Bedeutungen stehen
hinter eigenen. Bei gleichem Zuschlag bleibt die Reihenfolge der Quelle.

Warum nicht „kürzeste zuerst“: Bei `limestone` stünde dann *Kalk* vor
*Kalkstein*.

### Größen und Zeiten

| | vor 4A.2 | mit Wörterbuch |
| --- | --- | --- |
| Laufzeitdatensatz roh (JSON der Fächer) | – | 19,2 MiB |
| deflatiert | – | 4,54 MiB |
| als Base64 im Bündel | – | 6,06 MiB |
| PWA-Bündel gesamt | 761,4 KiB | 761,4 KiB + eigener Chunk 6,06 MiB |
| **Lehrkraftdatei** | 1374,6 KiB | **7591,2 KiB (7,41 MiB)** |
| Schülerlaufzeit | 620,7 KiB | 622,0 KiB |
| Schülerdatei (Beispiel) | 621,3 KiB | 622,6 KiB |

Der Zuwachs der Schülerdatei sind 1,3 KiB CSS für die Vorschlagsanzeige – das
Wörterbuch selbst ist dort **nicht** enthalten, und ein Artefakttest hält das
fest.

Gemessen auf dem Prüfrechner (Chromium):

| | |
| --- | --- |
| Start der Lehrkraftdatei unter `file://` | 683 ms |
| Textanalyse, 20 Kandidaten | 543 ms |
| Wörterbuch für alle 20 Kandidaten | **15 ms** |
| erste Suche inkl. Entpacken eines Fachs | 9–20 ms |
| Flexionsform (zwei Fächer) | 40 ms |
| jede weitere Suche aus dem Cache | < 0,01 ms |
| JS-Heap nach der Suche | 73 MiB |

In der installierten PWA liegt das Wörterbuch **nicht** im Precache: Es wird beim
ersten Nachschlagen geholt und danach dauerhaft gecacht. Sonst zahlte jede
Schülerin beim Installieren 6 MB für etwas, das nur der Lehrkraftbereich nutzt.

### Bekannte Grenzen

* **Wiktionary ist ein Wiki.** Die Einträge sind unterschiedlich gut belegt,
  manche veraltet, manche regional, manche falsch. Deshalb prüft die Lehrkraft
  jeden Vorschlag.
* **Die Reihenfolge der Quelle ist nicht immer die didaktisch beste.**
  `limestone` liefert *Calciumcarbonat* an zweiter Stelle, `shell shock` nur
  *Kriegszitterer*. Markiertes wird zurückgestuft und gekennzeichnet; die
  pädagogische Rangfolge darüber steht in „Die Rangfolge der Empfehlung“.
* **Verweise bleiben eine Rekonstruktion.** 74 302 Verweise bleiben unauflösbar,
  weil das Ziel keine deutschen Entsprechungen hat oder die Wortart nicht passt.
* **Nur Chromium in der E2E-Stufe.** Das Format ist bewusst so gewählt, dass es
  in Safari trägt (fflate statt `DecompressionStream`, kein Worker) – geprüft
  wurde es dort aber nicht automatisiert.

## Die Rangfolge der Empfehlung (seit Sprint 4B.1)

Der Empfehlungsschritt im Textimport ordnet die gefundenen Kandidaten – **ohne
Sprachmodell**, allein aus messbaren Merkmalen und dem Offline-Wörterbuch. Er
läuft deshalb auch in Safari, offline und in der portablen Lehrkraftdatei.

> Was hier „passend zum Niveau“ heißt, ist eine Schätzung aus Länge, Silben,
> Wortbildung, Häufigkeit, Stellung im Text und Wörterbuchtreffern. Es gibt
> keine lizenzierte GeR-Wortliste in diesem Projekt, und es wird keine
> behauptet. Die Lehrkraft entscheidet.

### Was gewichtet wird

| Merkmal | Wirkung |
| --- | --- |
| Passung zum GeR-Niveau der Lerngruppe | am stärksten |
| akademische Wortbildung (`-ional`, `-atric`, `-ory` …) | hebt Fachbegriffe |
| Häufigkeit im Text | hebt Tragendes |
| frühe Stellung im Text | leicht |
| Wörterbuchtreffer vorhanden | leicht |
| Mehrwortbegriff | leicht |
| Zeitschriftenapparat im Publikationskontext | starker Abschlag |

Bei Punktgleichstand entscheidet die Stellung im Text – dieselbe Eingabe ergibt
immer dieselbe Liste.

### Mehrwortbegriffe

`attritional combat` und `psychological casualties` sind eigene Lerngegenstände
und werden als solche gefunden (`src/domain/collocations.ts`): Läufe aus
Inhaltswörtern, die an Funktionswörtern, Zahlen, kurzen Wörtern und Satzzeichen
enden. Ein **leichtes** Paar zählt erst ab der zweiten Fundstelle; ein
**schweres** – zwei lange, gewichtige Wörter, keines Alltagswortschatz – schon
beim ersten. Wer `manpower shortages` erst ab dem zweiten Vorkommen anbietet,
bietet es meistens gar nicht an.

Ein Mehrwortbegriff beansprucht auch die Familien seiner Teile: Steht
`psychological casualties` in der Liste, kommt `psychological` nicht mehr dazu.

### Grundform statt gebeugter Form

`kept`, `wrote`, `men` und `letters` sind keine Vokabeln, sondern Formen. Die
Empfehlung setzt die Grundform ein – aber nur, wenn das Wörterbuch die
Verbindung als **Beugung** ausweist (`formTags`: `plural`, `past`,
`participle` …). Zwei Gegenproben, beide aus echten Fehlläufen:

* `story` ist im Datensatz eine **Schreibvariante** von `storey`. Ersetzen hieße:
  aus der Geschichte ein Stockwerk machen.
* `crowded` ist Adjektiv (*überfüllt*) **und** Partizip von `crowd`; `litter`
  ist Substantiv (*Abfall*) **und** im Datensatz Komparativ von `lit`. Ein
  eigener Eintrag schützt das Wort – aber nur, wenn er in einer **anderen
  Wortart** steht als die Grundform. `men` und `man` sind beide Substantive;
  dort ist `men` nichts als der Plural.

Der Preis dieser Regel steht im Code, damit ihn jemand kennt: In einem Text über
Blumen wird aus `rose` ein `rise`. Das englische Stichwort ist im letzten
Schritt änderbar – eine falsche Grundform kostet einen Handgriff, eine gebeugte
Form im Paket kostet eine falsch gelernte Vokabel.

### Was gar nicht erst angeboten wird

Ausgeschlossen, nicht nur abgewertet – sonst rutscht es bei einem armen Text
doch wieder in die Liste:

* **Zahl- und Funktionswörter.** `four` stand für Klasse 5 auf Platz fünf. Es
  steht im Wörterbuch als `num` **und** als `noun`, weshalb eine Regel „nur wenn
  alle Wortarten trivial sind“ es durchließ.
* **Publikationsapparat**, aber nur in einem Text, der einen hat (Bandangabe,
  Heftnummer, DOI, Seitenspanne). In einem Text über einen politischen Streit
  bleibt `issue` genau die Vokabel, um die es geht.
* **Die Kopfzeile selbst.** Aus `Military History Quarterly, Vol. 12, Issue 3.`
  entstand der Mehrwortbegriff `military History`. Der Artikel handelt nicht von
  Militärgeschichte; das ist der Briefkopf. Ausgeschlossen wird nur, was
  **einmal** vorkommt und dabei in einer Zeile mit Apparat steht.

### Schreibung aus dem Satzanfang

Ein Wort, das im Text nur einen Satz oder eine Überschrift beginnt, stünde sonst
groß im Paket. Führt das Wörterbuch es klein, wird es klein übernommen; führt es
`Cornwall` groß, bleibt `Cornwall` groß; Akronyme bleiben unangetastet. Ohne
Wörterbuchauskunft wird **nicht** geraten – dann bleibt die Schreibung des
Textes stehen.

### Aufgefüllt wird bis zur gewünschten Anzahl

Die Zusammenführung nimmt Kandidaten heraus. Die Schleife läuft trotzdem über
alle bewerteten Kandidaten weiter, statt bei der ersten Lücke abzubrechen – sonst
bekäme die Lehrkraft statt fünfzehn Vorschlägen neun, ohne dass irgendwo stünde,
warum. Gibt der Text weniger her, ist die Liste kürzer; erfunden wird nichts.

### Geprüft wird an einem echten Artikel

`src/import/recommendationAcceptance.test.ts` läuft mit dem **echten**
Offline-Wörterbuch gegen einen Fachartikel mit Publikationsapparat und
alltagssprachlichem Anfang (`src/import/fixtures/attritionalCombat.ts`).
Geprüft werden Eigenschaften, keine Wortlisten: dass die Empfehlung nicht die
ersten Inhaltswörter nimmt, dass mehrere anspruchsvolle Begriffe weit oben
stehen, dass Mehrwortbegriffe überleben, dass keine Wortfamilie zweimal
erscheint und dass Klasse 5 und Q1 erkennbar verschiedene Listen ergeben.

## Markensystem (seit Sprint 4A.1c)

LexiFlow ist das unkomplizierte Bindeglied zwischen Unterricht und
selbstständigem Lernen: hochwertig, modern, redaktionell, aktivierend – und
dabei ruhig. Kein Schulblau, keine Pastelltöne, kein Maskottchen, keine Sterne,
Pokale, Flammen oder Konfetti, kein generisches Dashboard.

Das vorherige System „Editorial Signal“ (Sprint 3A) ist damit abgelöst. Seine
Grundhaltung – warmes Papier, ein einziger Akzent, Tokens statt Einzelwerte –
ist geblieben; Farben, Zeichen und Typografie sind neu.

### Der Claim

> **Einfach ins Lernen kommen.**

Er steht als `APP_CLAIM` in `src/pwa/manifest.ts` und wird von dort überall
gelesen: Startseiten, Fußzeile, Manifestbeschreibung, Tests. Er erscheint pro
Ansicht **einmal** – in der Fußzeile der App-Hülle und im Kopf der drei
Startseiten, nie zweimal übereinander.

In der Brand-Vorlage stand ein **anderer** Claim. Er gehört einer anderen Marke
und wird nirgends übernommen; die Texte in der Vorlage waren visuelle Richtung,
keine Produktanforderung. `src/ui/brand.test.tsx` kennt seinen Wortlaut, liest
zwölf Quelldateien – Code, Styles, Einstiegsdateien und diese Datei – und prüft,
dass er auch nicht über einen Kommentar hereinkommt. Deshalb steht er hier
nicht: Diese Datei ist eine der geprüften.

### Die vier Markenfarben

| Ton | Wert | Rolle |
| --- | --- | --- |
| Aubergine | `#3B0F3F` | Tiefe, Navigation, primäre Aktion |
| Tomato | `#E63946` | Akzent, Marker, große Displaymomente |
| Orange | `#FF8A3D` | Wärme, Auswahlkanten, Verlaufsakzente |
| Parchment | `#F8EFE3` | warmes Papier als Grundfläche |

Rund 90 % der Fläche bleibt Papier und Tinte. Farbe ist ein Ereignis, kein
Grundrauschen.

### Kontrast vor Markenreinheit

Gemessen, nicht geschätzt:

| Kombination | Verhältnis | Konsequenz |
| --- | --- | --- |
| Weiß auf Tomato | 4,17 : 1 | **reicht nicht** für Text |
| Weiß auf Orange | 2,35 : 1 | nur Fläche unter dunkler Tinte |
| Aubergine auf Tomato | 3,80 : 1 | nur Grafik, nie Text |
| Parchment auf Aubergine | 13,91 : 1 | der primäre Knopf |
| Aubergine auf Orange | 7,56 : 1 | Orange trägt dunkle Tinte |
| `--accent-ink` auf Parchment | 5,81 : 1 | der Akzentknopf |

Daraus die drei Regeln, die das System durchhält:

1. **Die primäre Aktion ist Aubergine, nicht Tomato.** Helle Schrift auf Tomato
   wäre eine hübsche Lüge. Der Akzentknopf trägt deshalb `--accent-ink`, den
   dunklen Tomato-Ton, nicht die volle Sättigung.
2. **Tomato und Orange sind Flächen- und Grafikfarben.** Als Text erscheinen nur
   ihre dunklen Ableitungen (`--accent-ink`, `--warm-ink`).
3. **Farbe trägt nie allein eine Information.** Jeder Zustand hat ein Wort, ein
   Symbol oder eine Form neben sich.

`src/styles/contrast.test.ts` liest `tokens.css`, löst `var(--…)`-Verweise auf
und rechnet die Verhältnisse bei **jedem** Testlauf nach: 41 Prüfungen, davon
23 auf 4,5 : 1 für Text, sechs auf 3 : 1 für Bedienelemente und Grafik. Zwei
Prüfungen sind bewusst umgekehrt formuliert – sie schlagen an, wenn jemand Weiß
auf Tomato oder Weiß auf Orange doch wieder lesbar rechnen will.

### Die semantischen Tokens

`src/styles/tokens.css` definiert alles an einer Stelle; `global.css` enthält
nur Zusammensetzungen. Wer einen neuen Wert braucht, legt ihn als Token an.

| Token | Wert | Rolle |
| --- | --- | --- |
| `--canvas` | Parchment | Grundfläche |
| `--surface` / `--surface-elevated` / `--surface-sunken` | `#fffcf7` / `#ffffff` / `#f0e4d4` | Karte, Hervorhebung, Rücktritt |
| `--ink` / `--ink-secondary` / `--ink-muted` | `#2a0b2d` / `#5a4a5c` / `#6e5f70` | Tinte, kein Schwarz |
| `--nav` / `--nav-ink` / `--nav-marker` | Aubergine / Parchment / Orange | Navigation |
| `--primary` / `--primary-ink` | Aubergine / Parchment | primäre Aktion |
| `--accent` / `--accent-ink` / `--accent-soft` | Tomato / `#ad2b35` / `#fbe4e5` | Akzent |
| `--warm` / `--warm-ink` / `--warm-soft` | Orange / `#8c4c22` / `#ffeedf` | Wärme, Auswahl |
| `--info` / `--info-soft` | `#3b0f3f` / `#f2e8f2` | ruhiger Hinweis |
| `--success` / `--warning` / `--danger` | `#17624a` / `#8c4c22` / `#a3202c` | Semantik |
| `--border` / `--border-strong` | `#d8c4ae` / `#8a7563` | Trennung, Bedienrand (≥ 3 : 1) |
| `--focus-ring` / `--focus-ring-on-dark` | Aubergine / Orange | Fokus |

**Hinweis und Fehler sind zwei Farbfamilien.** `--info` liegt auf Aubergine,
nicht auf Tomato. Solange die Hinweisfläche `--accent-soft` trug, war sie mit
`--danger-soft` bis auf den Hexwert identisch – im Kandidatenschritt der
Textwerkstatt stand eine rosa Auswahlfläche direkt über einer rosa
Fehlermeldung, und die ganze Seite las sich wie ein Schadensbericht. Ein Test
hält jetzt fest, dass die vier semantischen Flächen vier verschiedene sind.

**Radien haben Rollen, keine Größen:** Bedienelemente `--radius-control: 12px`,
Flächen `--radius-surface: 16px`, große Flächen `--radius-surface-lg: 22px`,
Pillen nur für Marker.

**Vorerst nur hell.** `color-scheme: light`, kein `prefers-color-scheme`-Block.
Ein automatischer Dunkelmodus würde auch die noch nicht überarbeiteten
Werkstätten betreffen; geprüft ist bisher nur die helle Fassung.

### Wortmarke und Signet

Das Zeichen ist **Code, keine Bitmap**: `src/ui/Logo.tsx` zeichnet vier Flächen
in einer 64 × 64-`viewBox`.

Die Bildidee sind **zwei geöffnete Flächen, die sich überlagern**: hinten eine
ruhige Aubergine-Fläche, davor eine leicht gekippte Tomato-Fläche, die sich wie
eine umschlagende Karte öffnet; die helle Innenfläche ist der Durchblick. Zwei
Dinge halten es von einem generischen Dokumentsymbol fern – die vordere Fläche
ist ein **Trapez**, kein Rechteck, sie steht also schräg im Raum, und die
Innenfläche sitzt **außermittig**, wodurch die Form eine Richtung bekommt statt
symmetrisch zu ruhen. Keine Ähnlichkeit zu Office-Kacheln, kein Buch, keine
Karteikarte, kein Schulsymbol.

| Baustein | Einsatz |
| --- | --- |
| `LogoMark` | Signet allein – Navigation, kompakte Köpfe |
| `Logo` | waagerechte Wortmarke: Signet plus **echter Text** |
| `LogoAppIcon` | Quadrat mit Fläche – Startbildschirm, Favicon |

Drei Fassungen: `brand` (auf Papier), `on-dark` (auf Aubergine), `mono`
(einfarbig über `currentColor`, für Druck und `forced-colors`). Die
monochrome Fassung trennt die beiden Flächen über die Deckkraft, nicht über die
Farbe – sie bleibt damit auch schwarz-weiß verständlich.

Der Schriftzug ist **Text, kein Pfad**: markierbar, vorlesbar, übersetzbar. Das
Signet daneben trägt `aria-hidden`; nur wenn es allein steht, bekommt es
`role="img"` und einen Namen.

| Datei | Zweck |
| --- | --- |
| `public/favicon.svg` | Browser-Tab, dieselbe Geometrie als vier `rect` und ein `path` |
| `public/icons/icon-192.png` | Startbildschirm |
| `public/icons/icon-512.png` | Startbildschirm, hohe Auflösung |
| `public/icons/icon-512-maskable.png` | maskierbar – Zeichen auf 56 %, randlos |

Die maskierbare Fassung ist bewusst eine eigene Datei: Dieselbe Grafik für `any`
und `maskable` hätte das Zeichen beim Ausstanzen beschnitten.

Produktname, Theme-Farbe und Manifest liegen in `src/pwa/manifest.ts` – Build
und Tests lesen dasselbe Objekt. Theme-Farbe ist Aubergine (`#3b0f3f`, die
Navigationsfarbe, die auf dem Telefon unter der Statusleiste liegt),
Hintergrundfarbe das Papier (`#f8efe3`). Der Titel lautet überall
„LexiFlow – Vokabeln lernen“. Die abgelegten Farben der beiden Vorgängersysteme
(`#1f4d6b`, `#1c4f6e`, `#8fc4e2`, `#f6f7f9`, `#14120f`, `#e2542a`, `#c3d63a`)
stehen als `RETIRED_BRAND_COLORS` im Manifest-Modul, damit ein Test sie überall
ausschließen kann.

### Typografie – und die Satoshi-Lizenzfrage

| Rolle | Schrift | Einsatz |
| --- | --- | --- |
| Wortmarke, Displaymomente | `--font-display` | Schlagzeilen, Wortmarke |
| Bedienung, Fließtext, Formulare | `--font-sans` | überall |
| Beispielsätze und Zitate | **Newsreader Variable** | `--font-quote` |

**Satoshi wird nicht mitgeliefert.** Die Vorgabe nennt Satoshi Black für die
Wortmarke und Satoshi Medium für die Oberfläche, ausschließlich aus der
offiziellen Fontshare-Quelle. Für die Einbettung in eine **portable
Einzel-HTML**, die eine Lehrkraft an eine Klasse weitergibt, ließ sich aus dem
Lizenztext nicht zweifelsfrei ableiten, dass diese Weitergabe gedeckt ist – eine
Schülerdatei ist eine Redistribution der Schriftdatei an unbestimmt viele
Empfänger, nicht bloß ein Webfont auf einer Domain. Eine ungeklärte Schrift
bettet man nicht ein, und ein Laufzeit-Request an den Fontshare-CDN ist nach den
Datenschutzprinzipien dieses Projekts ohnehin ausgeschlossen.

Der gewählte Weg (aus der Vorgabe selbst: „Falls die Weitergabe in der portablen
HTML nicht eindeutig gedeckt ist …“):

* Satoshi steht in `--font-sans` und `--font-display` **an erster Stelle**. Wer
  die Schrift lokal installiert hat, sieht sie.
* Ausgeliefert wird **Manrope Variable** als Ersatz – eine geometrische Grotesk
  mit derselben ruhigen, leicht technischen Anmutung, offen lizenziert.
* Die Wortmarke bleibt **echter Text** (kein statisches SVG), weil sie damit
  vorlesbar und markierbar bleibt; sie steht in `--weight-black` (800), der
  schwersten Stärke, die die ausgelieferte Schrift hergibt.
* Es wird **nichts** modifiziert, dekompiliert oder ohne Erlaubnis gesubsettet.

Sollte die Lizenzlage später eindeutig geklärt werden, ist der Wechsel eine
Änderung an `src/styles/fonts.css` und einer Zeile in `tokens.css` – kein
Umbau.

### Lokale Schriften, keine Runtime-Requests

Beide ausgelieferten Schriften kommen aus den Fontsource-Paketen
`@fontsource-variable/manrope` und `@fontsource-variable/newsreader`.
`src/styles/fonts.css` bindet gezielt nur die beiden **Latin-Subsets** ein, die
Deutsch und Englisch brauchen – mit `font-display: swap`.

| Datei | Größe |
| --- | --- |
| `manrope-latin-wght-normal.woff2` | 24,25 KiB |
| `newsreader-latin-wght-normal.woff2` | 56,72 KiB |
| **zusammen** | **80,97 KiB** |

Beide unter der **SIL Open Font License 1.1**: Manrope © 2019 The Manrope
Project Authors, Newsreader © 2020 The Newsreader Project Authors. Die
Lizenztexte liegen in den jeweiligen Paketen.

Es gibt **keinen** Google-Fonts-Aufruf und keinen sonstigen Laufzeit-Request.
`e2e/brand.spec.ts` prüft beides: dass überhaupt keine Anfrage die eigene
Auslieferung verlässt, dass die `.woff2`-Dateien vom eigenen Host kommen und
dass keine Satoshi-Datei angefragt wird oder in der Auslieferung liegt.

### App-Shell

* **Desktop (ab 62 rem):** eine Aubergine-Seitenspalte mit Wortmarke im Kopf und
  den drei Kernbereichen **Lernen**, **Erstellen**, **Daten**. Der aktive
  Eintrag ist heller hinterlegt **und** trägt einen Orange-Marker.
* **Mobil:** ein Aubergine-Kopf oben und eine sticky Leiste am unteren Rand mit
  denselben drei Bereichen, mindestens 44 × 44 px je Ziel und
  `safe-area-inset-bottom` berücksichtigt.

Beide Navigationen sind gleichzeitig im DOM; die jeweils unpassende ist per
`display: none` auch aus dem Accessibility-Baum entfernt. Sie tragen deshalb
unterschiedliche Namen (`Hauptnavigation`, `Bereichsnavigation`).

### Zustände, die sich nicht ähneln dürfen

Drei Stellen, an denen die erste Fassung des Markensystems am Bildschirm
scheiterte und korrigiert wurde – jede ist heute durch einen Test oder einen
Kommentar an Ort und Stelle abgesichert:

* **Kandidatenprüfung.** Ausgewählte Zeilen trugen die weiche Akzentfläche;
  weil eine frisch analysierte Vokabel noch keine deutsche Antwort hat, stand
  darunter jedes Mal eine rote Fehlermeldung. Heute: Auswahl = normales Papier
  mit **Orange-Kante**, nicht ausgewählt = abgesenkte Fläche mit gedämpftem
  Titel. Rot bleibt dem vorbehalten, was wirklich ein Fehler ist.
* **Leitner-Fächer.** Leere Fächer mit Akzentrand sahen aus wie ein roter Strich
  quer durch den Lernstand. Ein leeres Fach ist kein Fehler – der Rand ist
  wieder ruhig.
* **Selbsttest-Auswertung.** Die drei Zahlen standen in Akzentrot; „4 richtig“
  sah damit aus wie ein Befund. Heute stehen sie in normaler Tinte, die
  Bedeutung trägt das Wort daneben. Grün-Gelb-Rot wäre die naheliegende Lösung
  gewesen – und genau die Zeugnisoptik, die hier nichts zu suchen hat.

Ebenfalls neu: Abgeschaltete Schaltflächen sind kein `opacity: 0.5` mehr,
sondern ein eigener, definierter Zustand (ruhige Fläche, klarer Rand, gedämpfte
aber lesbare Schrift). WCAG verlangt das nicht; jemand, der wissen will, was
gerade fehlt, schon.

### Was das Markensystem nicht tut

Es ändert **nichts** an Datenmodell, IndexedDB, Paketformat, Lernlogik,
Importlogik, KI-Verträgen oder Datenschutzprinzipien. Jede Aktion trägt
denselben zugänglichen Namen wie vorher.

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
* `e2e/topic-studio.spec.ts`: Thema → zehn Vorschläge → bearbeiten → speichern →
  exportieren → zweiter Browserkontext **ohne jedes Modell** → Lernrunde; das
  Sprachmodell wird dabei als echte Klasse mit statischen Methoden injiziert.
  Ein eigener Fall fordert fünfzehn Vorschläge an, bekommt zehn – und prüft,
  dass dort „10 von 15“ steht und nirgends „10 von 10“
* `e2e/sentence-assistant.spec.ts`: Satz vorschlagen, ausdrücklich übernehmen,
  einen vorhandenen ersetzen, exportieren und in einem zweiten Browserkontext
  **ohne jedes Modell** öffnen und üben; dazu Importassistent und Paketeditor,
  Axe, Tastatur und 390 px
* `e2e/text-recommendation.spec.ts`: Text analysieren, Empfehlungen erzeugen und
  prüfen, dass die Auswahl dabei unverändert bleibt; „Nur Empfehlungen
  auswählen“, Export-/Import-Rundlauf ohne Modelle, die gewünschte Anzahl
  Vokabelvorschläge (auch ohne Modell und bei zu kleinem Text), Axe, Tastatur
  und 390 px
* `e2e/enrichment.spec.ts`: Vorschläge erzeugen, einzeln und gebündelt
  übernehmen, exportieren und in einem zweiten Browserkontext **ohne jede
  Modell-API** wieder importieren und üben; Axe, Tastatur und 390 px inklusive
* `e2e/free-practice.spec.ts`: freie Runde ohne fällige Aufgaben, Axe auf
  Modusauswahl und laufender Runde, Tastaturbedienung inklusive Pfeiltasten in
  der Radiogruppe, 390 px ohne Überlauf
* `e2e/text-workshop.spec.ts`: Textwerkstatt von der Analyse bis zur Übung,
  Axe-Prüfung der Kandidatenansicht, Fokus auf der Ergebnisüberschrift,
  Tastaturbedienung und 390 px ohne Überlauf

Automatisierte Tests laden **nie** ein echtes Browsermodell. Der Chrome-Anbieter
wird gegen eine nachgebaute Translator-API geprüft, die Oberfläche gegen einen
Fake-Provider (`src/test/fakeTranslator.ts`); die E2E-Stufe läuft in einem
Chromium ganz ohne Translator-API – also im Normalfall.

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
14. **Übersetzung ist kein KI-Vertrag.** Sie hat eine eigene, schmale
    Schnittstelle und lässt sich unabhängig austauschen oder weglassen.
15. **Keine Polyfills, kein WebLLM, kein Transformers.js, kein Ollama.** Nur
    das, was der Browser von sich aus mitbringt – sonst nichts.
16. **Kein Stemming und keine Mehrwortverbindungen.** Beides erfordert
    Wörterbücher oder Modelle; eine falsche Grundform wäre schlechter als zwei
    ehrliche Kandidaten.
17. **Herkunft nur im Entwurf.** Das Austauschformat bleibt unverändert, damit
    ältere Fassungen der App die Dateien weiter lesen können.
18. **Registry statt globalem Singleton.** Anbieter sind Zustand mit Lebenszeit
    (geladene Modelle); ein Modul-Singleton wäre in Tests und beim Wechsel des
    Anbieters nicht sauber zurückzusetzen.
19. **Freies Üben als eigene Planungsfunktion.** `planSession` bleibt
    unverändert die einzige Quelle des Lernplans. Eine Option („auch später
    Fälliges“) hätte diese eine Funktion mehrdeutig gemacht – und genau die
    Mehrdeutigkeit war der Grund für die Trennung in Sprint 1.3.
20. **Freie Runden schreiben nichts – auch keinen Zähler.** Eine „nur halb
    gezählte“ Runde wäre nicht erklärbar. Wer frei übt, soll ohne Folgen üben
    können.
22. **Eine Modellsitzung je Fähigkeit.** `enrich-entry` antwortet einsprachig,
    die Themenwerkstatt zweisprachig. Eine gemeinsame Sitzung wäre für eine von
    beiden falsch konfiguriert; deshalb hat jede Fähigkeit ihre eigene Sitzung,
    ihre eigene Warteschlange und dieselben Optionen in `availability` wie in
    `create`.
23. **Beispielsätze werden gegengeprüft, nicht geglaubt.** Enthält der Satz das
    Stichwort nicht, wird er verworfen – ein Lückensatz ohne Lücke ist schlimmer
    als gar keiner.
24. **Bezugsgröße ist der Wunsch, nicht die Lieferung.** „8 von 8“ wäre formal
    wahr und trotzdem irreführend, wenn zehn angefordert waren. Deshalb trägt
    das Ergebnis `requested`, `received` und `accepted` getrennt, und die
    Formulierung entsteht in einer reinen Funktion.
25. **Prompt-Kontext ist Hilfestellung, nicht Garantie.** Ein Modellkontext ist
    keine Zusage; ein Bestand von tausenden Stichwörtern würde ihn nur
    aufblähen. Das Modell bekommt höchstens 200 Stichwörter, die verlässliche
    Dublettenprüfung läuft vollständig und deterministisch lokal.
26. **Ein Vorschlag wird abgelehnt, nicht repariert.** Kürzen, Säubern oder das
    Stichwort nachträglich einbauen könnte die Bedeutung verändern. Was die
    Prüfung nicht besteht, wird begründet verworfen; die vorhandenen Sätze
    bleiben unangetastet.
27. **Das Modell antwortet mit Schlüsseln, nicht mit Wörtern.** Eine
    Empfehlungsliste aus `c1`, `c2` … kann nichts erfinden, was nicht im Text
    stand. Freitext könnte das.
28. **Empfehlen ist nicht auswählen.** Eine Markierung nimmt der Lehrkraft keine
    Entscheidung ab; die Auswahl ändert sich nur nach einem Klick, der genau das
    ankündigt.
29. **Die gewünschte Anzahl ist eine Obergrenze.** Ein Text mit zwölf brauchbaren
    Wörtern liefert zwölf Vorschläge, keine zwanzig. Auffüllen wäre erfinden.
30. **Farbe ist ein Ereignis, kein Grundrauschen.** Rund 90 % der Fläche bleibt
    neutral. Eine Oberfläche, auf der alles farbig ist, hat keine Hierarchie
    mehr – und ein Akzent, der überall steht, ist keiner.
31. **Die Grafikfarbe und der Textton sind zwei Tokens.** Tomato in voller
    Sättigung ist schön und schafft auf Weiß keine 4,5:1. Statt den Ton für
    alles zu verwässern, gibt es beide – und eine Regel, wann welcher gilt.
32. **Schriften liegen im Repository, nicht im Netz.** Ein Google-Fonts-Aufruf
    wäre genau der externe Request, den diese App überall sonst vermeidet.
33. **Der Markenname ist keine Seitenüberschrift.** Er steht in der Shell; die
    `h1` gehört dem, worum es auf der Seite geht.
34. **Ein Dunkelmodus ist ein Theme, keine Nebenwirkung.** Ein
    `prefers-color-scheme`-Block hätte auch alle noch nicht überarbeiteten
    Werkstätten umgefärbt – ungeprüft. Lieber vorerst nur hell als
    zwei Fassungen, von denen eine niemand angesehen hat.
35. **Die Marke steht im Quellbaum, nicht in der Build-Konfiguration.**
    `src/pwa/manifest.ts` wird von `vite.config.ts` und von den Tests gelesen.
    Was nur in der Konfiguration steht, prüft am Ende niemand.
36. **Kontrast schlägt Markenreinheit.** Tomato ist die Akzentfarbe der Marke
    und trotzdem nicht die Farbe des primären Knopfes: Weiß darauf erreicht
    4,17 : 1. Lieber eine Marke, die einen Ton dunkler ausfällt, als eine, die
    sich nur auf Bildschirmen mit gutem Licht lesen lässt.
37. **Kontrast wird gerechnet, nicht geschätzt.** `contrast.test.ts` liest die
    Tokendatei und rechnet jedes Paar bei jedem Testlauf nach. Ein Kommentar
    „sollte reichen“ hätte diese Wirkung nicht – und zwei der Prüfungen sind
    umgekehrt formuliert, damit niemand eine unlesbare Kombination
    zurückholt.
38. **Eine ungeklärte Schrift wird nicht eingebettet.** Satoshi steht im Stack
    an erster Stelle, ausgeliefert wird das offen lizenzierte Manrope. Eine
    Schülerdatei ist eine Weitergabe an unbestimmt viele Empfänger; wo die
    Lizenz das nicht eindeutig deckt, ist „wahrscheinlich erlaubt“ zu wenig.
39. **Das Zeichen ist Code.** Ein aus einer Vorlage ausgeschnittenes Bild wäre
    in der portablen Einzeldatei teuer, würde auf großen Displays ausfransen
    und ließe sich nicht einfarbig ausgeben. Vier Pfade in einer `viewBox`
    können all das.
21. **Der Modus steht in der URL.** Eine freie Runde ist damit teilbar und
    direkt aufrufbar; ein fehlender oder unbekannter Wert fällt auf den
    Lernplan zurück, nie umgekehrt.

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
* **Rundengröße als Obergrenze.** Ist weniger bereit oder verhindert der
  Richtungsabstand eine Platzierung, wird die Runde kürzer – das steht jetzt vor
  dem Start dort, wird aber während der Runde nicht noch einmal erklärt.
* **Vorschau nur für die aktuelle Auswahl.** Die Zahl „… werden eingeplant“ gilt
  für den gerade gewählten Umfang; Wiedervorlagen innerhalb der Runde sind darin
  naturgemäß nicht enthalten.
* **Axe deckt nicht alles ab.** Automatische Prüfungen finden etwa 30–40 % der
  Barrieren; ein manueller Screenreader-Durchgang steht aus.
* **Nur Chromium in der E2E-Stufe.** Firefox und WebKit werden nicht geprüft.
* **Artikel bei Substantiven** sind weiterhin optional („Nachbarschaft“ =
  „die Nachbarschaft“). Für die Oberstufe evtl. zu großzügig.
* **Kein automatischer Barrierefreiheitstest.** Ein Axe-Durchlauf in der
  E2E-Stufe wäre der nächste sinnvolle Schritt.
* **PWA-Update** läuft still (`autoUpdate`), ohne Hinweis auf eine neue Version.
* **Kandidaten ohne Grundform.** `child`/`children` und `run`/`running` bleiben
  getrennte Kandidaten; zusammenführen muss die Lehrkraft.
* **Eigennamen-Heuristik.** Ein Wort, das nur satzintern großgeschrieben
  vorkommt, gilt als Eigenname – bei sehr kurzen Texten trifft das gelegentlich
  das Falsche. Die Ausblendung lässt sich abschalten.
* **Übersetzungsvorschläge nur wortweise.** Übersetzt werden Stichwort und
  Originalsatz einzeln; eine Abstimmung zwischen beiden findet nicht statt.
* **Translator-API nicht in der E2E-Stufe.** Der Chrome-Pfad ist über
  Vertragstests mit einer nachgebauten API abgesichert, nicht gegen den echten
  Browser – ein echtes Modell würde die Tests vom Netz abhängig machen.
* **Freie Runden hinterlassen keine Spur.** Wer viel frei übt, sieht das
  nirgends – bewusst so, aber für manche Lernende vielleicht unbefriedigend.
* **Keine Auswahl einzelner Vokabeln.** Freies Üben nimmt immer das ganze
  freigeschaltete Paket; gezielt „nur die schweren“ geht noch nicht.
* **Übungsform richtet sich weiter nach dem Leitner-Fach.** Auch beim freien
  Üben, solange keine Form ausgewählt ist – das kann überraschen.
* **Themenvorschläge sind nur so gut wie das lokale Modell.** Die kleinen
  Browsermodelle liefern gelegentlich schiefe Bedeutungen oder Sätze; die
  Prüfung durch die Lehrkraft ist keine Formalie.
* **Keine Themenwerkstatt ohne Prompt-API.** Firefox und Safari bieten sie
  derzeit nicht; dort bleiben Einfügen und die leere Liste.
* **Satzprüfung erkennt seit Sprint 3B.1 auch Beugungen.** „She apologised“
  zählt für „to apologise“, und der Lückentext erwartet dann genau diese Form.
  Unregelmäßige Formen (`went` für `to go`) erkennt sie weiterhin nicht.
* **Empfehlungen bleiben eine Einschätzung.** Sie stützen sich auf ein kleines
  Browsermodell, das Wort, Häufigkeit und einen Satz sieht – nicht auf den
  Lehrplan und nicht auf die Lerngruppe selbst.
* **Nur 60 Kandidaten je Anfrage.** Bei einem sehr langen Text bleibt der Rest
  unbewertet. Er ist weiter von Hand auswählbar, und die Oberfläche sagt, wie
  viele es waren.
* **Die gewünschte Anzahl wählt nach Häufigkeit.** Ohne Modell ist das die beste
  verfügbare deterministische Heuristik – ein seltenes, aber zentrales Wort kann
  dabei herausfallen. Eine höhere Zahl bringt es zurück.
* **Das Redesign endet an den Werkstätten.** Importtabellen,
  Textkandidaten-Prüfung, Themenwerkstatt, Satzassistent, laufende Übungen,
  Paketeditor und Datenschutzseite haben in Sprint 3A nur die neuen Tokens und
  Bausteine geerbt. Sie sehen dadurch konsistenter aus, ihr Layout ist aber noch
  das alte – das folgt in Sprint 3B.
* **Die Importtabelle bleibt eine Tabelle.** Auf 390 px scrollt sie weiterhin in
  ihrem eigenen Container. Das ist korrekt, aber noch nicht schön.
* **Der Paketeditor trägt zwei Formsprachen.** Sein Kopf ist noch der alte,
  darunter stehen bereits die neuen Karten und Felder.
* **Keine visuelle Snapshot-Infrastruktur.** Die Sichtprüfung bei 1440 × 900,
  1024 × 768 und 390 × 844 lief von Hand; es gibt keine Screenshot-Tests, die
  eine Regression automatisch melden würden.
* **Kein Dunkelmodus.** Bis Sprint 3B sieht die App auf dunkel eingestellten
  Geräten aus wie auf hellen. Das ist Absicht, aber für manche Nutzung
  unangenehm.
* **Bundle wächst.** Die Textanalyse liegt im Hauptbündel; ein späteres
  Code-Splitting des Lehrkraft-Bereichs wäre der nächste sinnvolle Schritt.
* **Wortformen ohne Wörterbuch bleiben Regelwerk.** Unregelmäßige Verben
  (`go`/`went`, `buy`/`bought`) werden nicht zusammengeführt. Die Listen
  `INVARIANT_S`, `NOT_INFLECTED`, `AMBIGUOUS_PLURALS` und `IRREGULAR_S_FORMS`
  sind handgepflegt und decken den Schulwortschatz ab, nicht das Englische.
* **Ein abgebrochener Modelldownload bleibt beim Browser.** LexiFlow bricht die
  eigene Vorbereitung ab und übersetzt nichts mehr; ob Chrome den Download
  intern verwirft oder weiterführt, entscheidet der Browser.
* **Der Wortart-Beleg ist ein Nachbarwort, keine Wortartenerkennung.** „the
  visits“ macht aus einer Verbform einen Plural, wenn der Satz es so nahelegt.
  Deshalb ist die neutrale Beschriftung der Normalfall und die genaue die
  Ausnahme – nicht umgekehrt.
* **Das Abkürzungslexikon ist kurz.** Was nicht darin steht, wird als
  „Abkürzung – Langform prüfen“ gemeldet statt geraten. Mehrdeutige Kürzel wie
  `m` und `in` fehlen mit Absicht.
* **Der Kartensatz ist flüchtig.** Seed, Position und aufgedeckte Antworten
  leben nur in der geöffneten Seite. Das ist Absicht – aber wer neu lädt,
  beginnt von vorn.
* **Durchsehen kennt keine Sortierung.** Die Liste folgt der Paketreihenfolge;
  alphabetisch oder nach Schwierigkeit sortieren geht noch nicht.
* **Die Suche ist eine Teilzeichenkette.** Tippfehler und Beugungen findet sie
  nicht – anders als die Textanalyse wertet sie keine Wortformen aus.
* **Die Richtungswahl gilt pro Runde, nicht pro Paket.** Sie wird nicht
  gespeichert; nach dem Neuladen steht wieder „Gemischt“. Das ist bewusst
  schlicht gehalten – ob eine gemerkte Wahl hilft, zeigt erst die Nutzung.
