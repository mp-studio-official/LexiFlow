# Bestandsaufnahme: Rohtext-Workflow im Cloud-Portal

Stand: Zweig `claude/product-wiring`, HEAD `f177235`.
Zweck: offenlegen, **was direkt wiederverwendet wird** und **was wegen Portal-,
Wörterbuch- oder Gatewaygrenzen angepasst werden muss** – bevor die erste Zeile
Produktivcode entsteht.

Noch kein Produktivcode geschrieben. Dieses Dokument ist die Grundlage der
Entscheidung.

---

## 1. Der alte Ablauf, wie er heute in der Lehrkraftdatei läuft

`src/routes/teacher/ImportWizardPage.tsx` (1432 Z.) kennt
`Step = 'source' | 'candidates' | 'review'` und
`SourceKind = 'paste' | 'pdf' | 'text' | 'topic' | 'csv' | 'xlsx' | 'json'`.

Der Fließtextweg (`'text'`, `'topic'`) geht als einziger über den Schritt
`'candidates'`:

```
Rohtext
  → analyzeText()                     src/domain/textExtraction.ts
  → TextCandidate[]                   (Beispielsatz exakt aus dem Quelltext)
  → TextCandidateReview               src/routes/teacher/TextCandidateReview.tsx
     ├─ SourceTextPane                Quelltext als bedienbarer Text
     ├─ pickFromSource()              Wort/Wendung direkt aus dem Text ergänzen
     ├─ Wörterbuchvorschläge          src/import/dictionarySuggestions.ts
     └─ GeminiTranslations            direkter Anbieteraufruf aus dem Browser
  → CandidateSelection[]
  → candidatesToDrafts()              src/import/textDraft.ts
  → DraftRow[] → Schritt 'review' → draftsToEntries() → VocabPack
```

Wichtig für die Portierung: Ab `candidatesToDrafts` ist der Fließtextweg mit
jedem anderen Importweg identisch. Die Trennstelle ist also sauber und liegt
genau dort, wo sie liegen muss.

---

## 2. Importgraph – gemessen, nicht vermutet

Transitive Auflösung über relative Importe (gleiches Verfahren wie
`portableIsolation.test.ts`, inkl. `import type`):

| Datei | Z. | erreicht `src/dictionary/**` | erreicht `src/ai/**` |
| --- | --- | --- | --- |
| `src/domain/textExtraction.ts` | 637 | **nein** | nein |
| `src/import/sourceTokens.ts` | 227 | **nein** | nein |
| `src/import/sourcePick.ts` | 261 | **nein** | nein |
| `src/import/textDraft.ts` | 100 | **nein** | nein |
| `src/import/contextPartOfSpeech.ts` | – | **nein** | nein |
| `src/translation/preparation.ts` | – | **nein** | nein |
| `src/routes/teacher/SourceTextPane.tsx` | 348 | **nein** | nein |
| `src/import/textRecommendation.ts` | 151 | nein | **ja** (`src/ai/AiProvider`, nur Typen) |
| `src/import/enrichment.ts` | – | nein | **ja** (`src/ai/AiProvider`, nur Typen) |
| `src/import/dictionarySuggestions.ts` | – | **ja** | nein |
| `src/import/learningFormProposal.ts` | – | **ja** (über `dictionarySuggestions`) | nein |
| `src/import/recommendation.ts` | – | **ja** | nein |
| `src/routes/teacher/TextCandidateReview.tsx` | 2329 | **ja** (u. a. `dictionary/data/dictionary.json`, 6,1 MB) | **ja** (16 Dateien, inkl. `gemini/transport.ts`) |

Die beiden entscheidenden Zeilen stehen unten: **`TextCandidateReview.tsx`
zieht sowohl den 6,1-MB-Datensatz als auch den direkten Gemini-Weg ins
Bündel.** Beides ist im Portal ausgeschlossen –
`portableIsolation.test.ts` („das Portal erreicht das Wörterbuch nicht") und
die Auflage, dass Übersetzungen über den serverseitigen `AiGateway` laufen.

---

## 3. Was direkt wiederverwendet wird

Ohne Änderung, weil wörterbuch- und netzfrei:

| Baustein | wofür |
| --- | --- |
| `analyzeText` / `extractTextCandidates` / `sortCandidates` | Schritt 2+3: Kandidaten aus dem konkreten Text |
| `segmentSentences`, `normalizeToken`, `candidateLiteral` | Satzgrenzen, Quellsatzbezug |
| `describeCandidateForms`, `describeCandidateInflections` | Lernformen und Beugungen |
| `tokenizeSource`, `mergeMultiwordTokens`, `candidateFormIndex` | Quelltext als bedienbarer Text |
| `pickFromSource`, `describeSelection` | Schritt 5: Wort direkt aus dem Quelltext ergänzen |
| `contextPartOfSpeech` | Wortart aus der Textstelle, ohne Wörterbuch |
| `CandidateSelection`, `candidatesToDrafts` | Schritt 6: Übergang in den bestehenden Entwurfsweg |
| `SourceTextPane` (348 Z.) | komplette Quelltextanzeige inkl. Tastaturbedienung |
| `PackRepository.saveDraft` über `WerkstattPage` | Entwurf speichern, nichts veröffentlichen |

`SourceTextPane` ist der Glücksfall dieser Aufnahme: 348 Zeilen mit der ganzen
mühsamen Tastatur- und Screenreader-Arbeit, und sie importiert nichts außer
`sourcePick`/`sourceTokens`. Sie wird nach `src/hosted/teacher/werkstatt/`
übernommen – einzige Anpassung: Klassenpräfix `.huelle` bzw. `.app-*` gemäß
Portalregel.

---

## 4. Was angepasst werden muss – und warum

### 4.1 `TextCandidateReview.tsx` (2329 Z.) wird **nicht** übernommen

Grund ist nicht ihre Größe, sondern ihr Importgraph: Sie hängt an
`createOfflineDictionary` (6,1 MB), an `recommendation.ts` und
`learningFormProposal.ts` (beide über `dictionarySuggestions` am Wörterbuch)
und an `GeminiTranslations` → `geminiAssistant` → `gemini/transport.ts`, also
am direkten Anbieteraufruf aus dem Browser. Jede dieser vier Kanten ist im
Portal verboten. Eine „portierte" Fassung wäre eine Neufassung mit altem Namen.

**Konsequenz:** Es entsteht eine eigene, portal-saubere Prüfansicht unter
`src/hosted/teacher/werkstatt/`. Sie übernimmt die *Interaktionsentscheidungen*
der alten Ansicht (Quelltext links, Kandidatenliste rechts, Aufnehmen per
Auswahl, jede Zeile prüf-, änder- und entfernbar), aber keinen ihrer
verbotenen Importe. Was dabei wegfällt, steht in 4.2 und 4.3.

### 4.2 Wörterbuchvorschläge fallen im Portal weg

`dictionarySuggestions`, `recommendation` und `learningFormProposal` bleiben
der Lehrkraftdatei vorbehalten. Im Portal gibt es für Wortart und Lernform
damit zwei Quellen statt drei:

1. `contextPartOfSpeech` – aus der Textstelle, wörterbuchfrei.
2. `describeCandidateForms`/`describeCandidateInflections` – aus `wordForms`,
   also aus dem Text selbst.
3. die Lehrkraft.

Das ist eine **Funktionsminderung gegenüber der Lehrkraftdatei** und als solche
hier festgehalten, nicht stillschweigend weggelassen. Der Alternativweg wäre,
den Datensatz ins Portal zu holen – ausdrücklich untersagt.

### 4.3 Übersetzungen laufen über den `AiGateway`, nicht über Gemini im Browser

Alt: `geminiAssistant` ruft den Anbieter direkt aus der Seite auf, mit einem im
Browser liegenden Schlüssel.
Neu: `AiGateway.invoke({ connectionId, capability, payload })` aus
`src/application/repositories.ts` – eine gespeicherte Lehrkraftverbindung,
Schlüssel ausschließlich serverseitig im Tresor der Serverfunktion.

Dabei gilt unverändert `KI_IM_PILOT = 'gesperrt'`: `ohneGesperrteKi` entfernt
`repositories.ai` im Pilotbetrieb vollständig. **Dieser Arbeitsblock hebt das
nicht auf.** Die Werkstatt muss deshalb so gebaut sein, dass sie **ohne**
`ai` vollständig bedienbar bleibt: Kandidaten, Quellsätze, Wortarten,
Lernformen und manuelle Übersetzung funktionieren lokal; der
Übersetzungsvorschlag ist ein zusätzlicher Knopf, der bei fehlender oder
gesperrter Verbindung ruhig und erklärend abwesend ist – nicht als Fehler.

Offen und von Codex abhängig: `supabase/functions/ai-gateway/core.ts` nimmt
`capability` heute als freie Zeichenkette (`|| 'allgemein'`) entgegen. Eine
Fähigkeit „Übersetzungsvorschläge zu Textkandidaten" ist dort **noch nicht
definiert**. Ich lege den Vertrag portalseitig als Typ fest und rufe ihn über
`invoke` auf; die serverseitige Umsetzung bleibt Codex' Spur.

### 4.4 Fließtext wird eine eigene Quellenart

Heute fällt in `src/import/universal.ts` alles ohne erkennbare zweite Spalte
auf:

```ts
return {
  art: 'eingefuegte-liste',
  begruendung: 'Eine Zeile je Vokabel, ohne erkennbare zweite Spalte …',
  sicher: false,
};
```

Der Scotland/Wales-Text landet damit heute als **einspaltige Vokabelliste** –
genau der Fehler, der abgestellt werden soll. `Quellenart` bekommt daher
`'fliesstext'`, und `erkenneQuelle` entscheidet vor der Listenannahme anhand
von Satzzeichenverteilung, Wörtern je Zeile und Satzlänge. Listen-, Tabellen-
und Dateiimport bleiben unverändert daneben bestehen.

### 4.5 Wo die Verdrahtung liegen darf

`src/integrationsgrenze.test.ts` verbietet `src/hosted/teacher/werkstatt/**`
jeden Import von `application`, `cloud`, `supabase`, `SessionContext`,
`repositories` und `HostedApp`. Die Werkstattbausteine bleiben deshalb reine
Funktionen und reine Komponenten; **Repository- und Gatewayzugriff stehen
ausschließlich in `src/hosted/teacher/WerkstattPage.tsx`**, so wie bisher schon
für `packs.saveDraft`.

---

## 5. Daraus folgende Arbeitsschritte

1. `'fliesstext'` als erkannte Quellenart in `universal.ts`, mit Gegenprobe am
   Scotland/Wales-Text und an einer echten Liste (keine Verwechslung in beide
   Richtungen).
2. `SourceTextPane` portal-sauber nach `src/hosted/teacher/werkstatt/`.
3. Textzustand und Kandidatenprüfung als eigene, wörterbuchfreie Fassung;
   Übergabe an `candidatesToDrafts`.
4. Übersetzungsvorschlag über `AiGateway.invoke`, abwesend bei gesperrter KI.
5. Verdrahtung in `WerkstattPage` unter `#/pakete/neu`, Speichern nur als
   Entwurf auf ausdrückliche Bestätigung.
6. Integrationsgegenprobe mit dem Scotland/Wales-Text.

Grün bleiben müssen dabei: `portableIsolation.test.ts` (kein Wörterbuch im
Portal), `integrationsgrenze.test.ts`, `kiSperre.test.tsx`
(`KI_IM_PILOT === 'gesperrt'`), `portal.test.ts` (`.huelle`-Präfix).

Keine Veröffentlichung, kein Deployment, keine Aufhebung der Pilotsperre.
