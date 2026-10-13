# Übergabe: Fließtextwerkstatt im Cloud-Portal

Zweig `claude/product-wiring`, aufgesetzt auf `f177235`.
Nichts gepusht, nichts ausgeliefert, keine Migration, die KI-Pilotsperre
unverändert `gesperrt`.

Die vorangegangene Bestandsaufnahme steht in
`docs/bestandsaufnahme-textwerkstatt.md`.

---

## 1. Commits

| Commit | Inhalt |
| --- | --- |
| `12cf9d4` | Fließtext als eigene Quellenart in `src/import/universal.ts` |
| `c348c6e` | Quelltextansicht ins Portal übernommen (`Quelltext.tsx`) |
| `50e9b58` | Textwerkstatt als Zustandsautomat (`textzustand.ts`) |
| `14bdb14` | Vertrag für Übersetzungsvorschläge am Gateway (`kivertrag.ts`) |
| `eac80de` | Die Prüfansicht (`Textwerkstatt.tsx`) |
| `27a0710` | Verdrahtung unter `#/pakete/neu` (`WerkstattPage.tsx`) |
| `12714e8` | Browserabnahme und die drei Befunde, die sie gefunden hat |

## 2. Der wiederhergestellte Ablauf

```
Text einfügen        Werkstatt → erkenneQuelle → 'fliesstext'
  ↓
lokal analysieren    analyzeText (textExtraction.ts), 67 Kandidaten aus 17 Sätzen
  ↓
im Text sehen        Quelltext (ex SourceTextPane): markiert, tastaturbedienbar
  ↓
auswählen            nichts vorausgewählt; Wort im Text aufnehmen über pickFromSource
  ↓
prüfen               Bedeutung, Lernform, Wortart, Beispielsatz — je Zeile
  ↓
Entwurf anlegen      candidatesToDrafts → draftsToEntries → packs.saveDraft
```

Keine Veröffentlichung, keine Zuweisung. Der Entwurf gehört der Lehrkraft.

## 3. Prüfungen

| Was | Ergebnis |
| --- | --- |
| `tsc --noEmit` | fehlerfrei |
| Vollständige Suite (8 Scherben) | **239 Dateien, 4326 Prüfungen, grün** |
| Neu in diesem Block | 13 Erkennung · 23 Automat · 17 Vertrag · 7 Quelltext · 16 Prüfansicht · 10 Route · 2 Abnahmetext = **88** |
| Portalgrenze (`portal.test.ts`) | grün |
| Integrationsgrenze | grün |
| Portable Isolation (Quelltext) | grün |
| KI-Pilotsperre (`kiSperre.test.tsx`) | grün, `KI_IM_PILOT === 'gesperrt'` |
| Gebautes Portalbündel | 1,1 MB, **kein `dictionary`-Chunk** |

### Mutationsproben

Jede belegt, dass die Prüfung daneben wirklich etwas hält:

| Mutation | Folge |
| --- | --- |
| Textprüfung vor die Tabellenprüfung gezogen | Satzliste wird zu Prosa → rot |
| Schwelle „Wörter je Zeile" entfernt | Wendungsliste `to depend on sth.` wird zu Prosa → rot |
| `aufgenommen: true` als Vorgabe | vier Prüfungen rot |
| Vorschlag überschreibt belegte Felder | zwei rot |
| erfundene Kennungen zugelassen | eine rot |
| `beruehrt` nie gesetzt | geleertes Feld wird wieder gefüllt → rot |
| Weiche in `WerkstattPage` abgeschaltet | acht der zehn Routenprüfungen rot |
| dieselbe Weiche, am **gebauten** Bündel | Browsermessung scheitert bei allen vier Breiten |

Die zweite Probe deckte eine echte Lücke in meinen eigenen Tests auf: Die
Schwelle „Wörter je Zeile" war durch keine Prüfung belegt.

## 4. Browsermessung

`node scripts/textwerkstatt-messen.mjs`, Chromium im Cloudcontainer,
Vorschau mit `LEXIFLOW_BASE=/LexiFlow/` und `VITE_LEXIFLOW_FAKE_CLOUD=1`.

| Breite | Kandidaten | Quellsätze | Überlauf | Tippziele < 44 px | Konsole |
| --- | --- | --- | --- | --- | --- |
| 390 | 67 | 67, alle wörtlich | 0 | 0 | leer |
| 768 | 67 | 67, alle wörtlich | 0 | 0 | leer |
| 1024 | 67 | 67, alle wörtlich | 0 | 0 | leer |
| 1440 | 67 | 67, alle wörtlich | 0 | 0 | leer |

Je Breite sechs Aufnahmen: Quelle, analysiert, ausgewählt, angelegt,
einspaltige Liste, zweispaltige Tabelle. Zusätzlich geprüft: nichts
vorausgewählt (0 Häkchen), Fokus mit der **Tabulatortaste** statt
`element.focus()`, und beide Listenarten landen nicht in der
Textwerkstatt.

Drei Befunde wurden dabei gefunden und behoben — zwei im Produkt
(Tippziele der nachträglich erscheinenden Kästchen; der
Einstiegsbildschirm lud nur zu einer Liste ein), einer doppelt im
Messskript selbst.

## 5. Datenschutz — der Wortlaut

Nirgends steht „der Text verlässt nie den Browser". Das wäre falsch,
sobald jemand Vorschläge holt. Es steht:

- Beim Einfügen: „Die Analyse läuft hier im Browser. Es wird nichts
  gesendet." — das stimmt, die Analyse ist rein lokal.
- Über dem KI-Knopf: welche aufgenommenen Wörter mit je **einem** Satz
  an die hinterlegte Verbindung gehen, was hier bleibt (übriger Text,
  Paketname, Lerngruppen), und: „Ohne diesen Klick wird nichts
  gesendet."

Geprüft in `kivertrag.test.ts` und über die Route.

## 6. Bekannte Grenzen

1. **Keine Wörterbuchvorschläge.** `dictionarySuggestions`,
   `recommendation` und `learningFormProposal` hängen am 6,1-MB-Bestand
   und bleiben der Lehrkraftdatei vorbehalten. Wortart kommt aus dem
   Satz (`contextPartOfSpeech`), Formen aus dem Text — sonst von der
   Lehrkraft. Das ist eine Funktionsminderung gegenüber der
   Lehrkraftdatei, und sie ist beabsichtigt.
2. **Reihenfolge ist Textreihenfolge, keine Empfehlung.** Die alte
   Ansicht sortierte nach Lernwert; dieser Teil hängt am Wörterbuch.
   Oben stehen deshalb auch `five` und `million`. `sortCandidates`
   kennt `'frequency'` als Alternative — eine Produktentscheidung, die
   ich nicht allein getroffen habe.
3. **Kein Mehrfach-Aufnehmen.** Jede Zeile wird einzeln angehakt. Ein
   „alle offensichtlichen übernehmen" gäbe es erst mit einer
   Vorschlagsgüte, und die kam aus dem Wörterbuch.
4. **Keine deutsche Satzübersetzung.** `germanSentence` ist im Automaten
   vorgesehen und hat in der Oberfläche noch kein Feld.
5. **Der Gatewayvertrag ist ungeprüft gegen den echten Server.** Siehe 7.
6. **PDF-Import nicht dabei.** `pdfjs-dist` ist bewusst aus dem Portal
   heraus (`portableIsolation.test.ts`); Text aus einem PDF geht über
   Kopieren und Einfügen.

## 7. Integrationsreihenfolge mit Codex-Commit `9e152c7`

`9e152c7` wurde **nicht** cherry-gepickt: Seine Vorgänger fehlen in
diesem Zweig, und ein Cherry-Pick ohne sie hätte eine Serverfunktion
ergeben, deren Hälfte fehlt.

Verdrahtet ist stattdessen die vorhandene Schnittstelle:

```ts
ai.invoke({
  connectionId,                       // erste aktive Verbindung mit der Fähigkeit
  capability: 'teacher-text/suggestions',
  payload: { kandidaten: [{ id, english, sourceSentence, partOfSpeech? }] },
})
```

Die Antwort liest `leseAntwort` tolerant: `vorschlaege` oder
`suggestions`, `id` oder `candidateId`, unbekannte Felder werden
übergangen. Ob eine Kennung aus dem Text stammt, entscheidet nicht der
Leser, sondern `textZug`.

**Reihenfolge für den Zusammenbau:**

1. Codex bringt `9e152c7` mit seinen Vorgängern auf
   `codex/integrate-next-product`.
2. Diesen Zweig darauf aufsetzen — keine Datei dieses Blocks liegt in
   `src/ai/**`, `src/cloud/**`, `supabase/**` oder `.github/**`, also
   ist kein inhaltlicher Konflikt zu erwarten.
3. **Den Namen abgleichen:** `TEXTVORSCHLAEGE` in
   `src/hosted/teacher/werkstatt/kivertrag.ts` muss die Fähigkeit sein,
   die `supabase/functions/ai-gateway/` kennt. Weicht sie ab, ist die
   dortige die richtige — hier steht eine Prüfung, die den Namen
   festhält, damit die Änderung auffällt und nicht untergeht.
4. **Die Nutzlast abgleichen:** Erwartet der Server andere Feldnamen,
   genügt `baueAnfrage`; `leseAntwort` verträgt beide verbreiteten
   Antwortformen schon.
5. Die Verbindung muss die Fähigkeit in `capabilities` führen, sonst
   sagt die Oberfläche „keine KI-Verbindung hinterlegt" — richtig, aber
   erklärungsbedürftig, wenn die Verbindung in Wahrheit existiert.
6. **Erst danach** über die Pilotsperre entscheiden. Solange
   `KI_IM_PILOT === 'gesperrt'`, entfernt `ohneGesperrteKi`
   `repositories.ai`, die Karte erscheint nicht, und die Werkstatt
   funktioniert vollständig ohne sie. Dieser Block hebt daran nichts auf.

## 8. Aufräumen

`.worktrees/_transfer/` enthält nur Übergabedateien für die
Cloudmessung (Quelltarball, Messskript). Der Ordner liegt ausserhalb des
Arbeitsbaums und ist git-ausgeschlossen; er kann gelöscht werden.
