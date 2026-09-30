# Die Prüfbank für Breiten — Aufbau und P0-Ausgangsmessung

Stand: 30.09.2026. Gemessen auf `bda06e6`, auf einem Mac, mit Chromium und
WebKit.

## 1. Wozu sie da ist

Bis Sprint 5B fuhr Playwright genau ein Projekt: Desktop Chrome auf 1280 px.
Jede Aussage über Mobilfähigkeit und über Safari war damit eine Behauptung —
geprüft war die eine Breite, auf der ohnehin niemand ein Problem hat.

Wer eine Oberfläche umbaut und die Prüfbank danach nachzieht, hat für die Dauer
des Umbaus keine. Deshalb steht sie vor dem Umbau.

## 2. Was sie fährt

| | Konfiguration | Port | Grundpfad | Projekte | Prüfungen |
| --- | --- | --- | --- | --- | --- |
| Ablauf App | `playwright.config.ts` | 4173 | `/` | 1 | 159 |
| Ablauf Portal | `playwright.portal.config.ts` | 4183 | `/LexiFlow/` | 1 | 31 |
| **Breiten App** | `playwright.breiten.config.ts` | **4291** | `/` | 8 | **192** |
| **Breiten Portal** | `playwright.portal-breiten.config.ts` | **4292** | `/LexiFlow/portal/` | 8 | **192** |

Die acht Breitenprojekte sind vier Breiten (390, 768, 1024, 1440) mal zwei
Maschinen (Chromium, WebKit). Sie fahren **nur** Prüfungen mit der Marke
`@breiten`; das Ablaufprojekt schließt genau diese aus. Ein Ablauf ist kein
Layout — ihn achtmal zu fahren kostete das Achtfache und fände nichts.

Befehle:

```
npm run e2e:breiten          # kontofreie Anwendung
npm run e2e:breiten:portal   # Portal
```

Nacheinander, nicht gleichzeitig: Beide bauen in dasselbe `dist/`.

## 3. Die sechs Aussagen je Ansicht

| Aussage | wo sie steht | gilt für |
| --- | --- | --- |
| kein waagerechter Überlauf | `keinQuerlauf` | alle vier Breiten |
| Tippziele ≥ 44 × 44 px | `tippzieleGrossGenug` | 390 und 768 |
| der Fokus ist zu sehen | `fokusIndikatorIstSichtbar` | alle vier Breiten |
| der Skip-Link kommt ins Bild | `skiplinkKommtInsBild` | alle vier Breiten |
| man kommt mit der Tastatur hin | `tastaturErreichbarkeit` | alle vier Breiten |
| doppelte Vergrößerung | `zoomProbe` | alle vier Breiten |

### Warum Fokus und Tastatur getrennt sind

Weil es zwei Aussagen sind. Solange sie eine waren — „drücke Tab, danach muss
etwas den Fokus haben" —, fiel sie unter WebKit 28-mal durch, ohne dass an der
Gestaltung etwas gewesen wäre: **Safari auf macOS springt mit Tab
standardmäßig nur Formularfelder an.** Das ist eine Systemeinstellung, kein
Mangel der Oberfläche.

Die Fokusgestaltung wird deshalb ohne Tab geprüft: ein sichtbares,
fokussierbares Element wird gezielt fokussiert, der Stil davor und danach
verglichen. Die Tastaturerreichbarkeit steht daneben und bildet die
Besonderheit ab — hat eine Ansicht keine sichtbaren Formularfelder, wird sie
unter WebKit mit Begründung übersprungen.

### Was die Tippzielprüfung misst — und was nicht

Sie misst Touchflächen, die es **jetzt gerade** gibt.

| Zustand | woran erkennbar | was geprüft wird |
| --- | --- | --- |
| gar nicht gerendert | keine Rechtecke, `display:none`, `visibility:hidden` | nichts |
| nur technisch da / außerhalb des Bildes | `opacity:0`, `clip`, `clip-path`, Kante ≤ 4 px, aus dem Bild geschoben | nur der Auslöser, **falls** deklarativ erkennbar |
| wahrnehmbar | alles andere | es selbst |

Deklarativ erkennbar heißt `label[for]`, ein umschließendes `label`,
`aria-labelledby` — oder `data-tippziel-fuer="<id>"`. Letzteres ist der
bewusste Weg für programmgesteuerte Auslöser (`onClick={() =>
fileInput.current?.click()}`). **Im Markup steht es heute nirgends**; es
einzutragen wäre eine Produktivänderung und ist nicht freigegeben.

Fehlt die deklarative Beziehung, sagt diese Prüfung **nichts**. Ob ein
programmgesteuerter Auslöser existiert und funktioniert, ist eine
Funktionsfrage und gehört in einen eigenen Test. Geraten wird nicht.

Der Skip-Link ist aus demselben Grund kein Fall für sie: Er liegt absichtlich
über dem Bild und kommt bei `:focus` herein. Dass ihn niemand antippt, ist sein
Zweck.

## 4. Was die Prüfbank sich selbst schuldet

Fünf Prüfungen wachen über sie, alle unter `scripts/`. Jede steht für einen
Fehler, der in einem echten Lauf aufgetreten ist:

| Datei | wacht über |
| --- | --- |
| `pruefbank.test.mjs` | Breiten, Maschinen, Ports, Grundpfade, `reuseExistingServer`, die Trennung der Konfigurationen |
| `breitenaufbau.test.mjs` | die Türprüfung: falscher Pfad, 404, SPA-Rückfall, fehlende Wurzel, kein Server |
| `serialisierung.test.mjs` | dass die Messfunktionen den Weg in die Seite überleben |
| `tippziele.test.mjs`, `formularfelder.test.mjs`, `skiplink.test.mjs`, `fokus.test.mjs` | die Regeln selbst |

Die Messfunktionen (`e2e/tippziele.ts`, `e2e/fokus.ts`, `e2e/skiplink.ts`) sind
bewusst **in sich geschlossen**: Playwright reicht ihren Quelltext in die Seite,
Vitest ruft sie unter jsdom auf, und `serialisierung.test.mjs` führt sie in
einem eigenen Realm ohne Modulumgebung aus. Vorher war ein vollständiger
Browserlauf die einzige Art, einen Fehler in der Regel zu finden — das hat
vier Läufe gekostet.

## 5. Die vier Fehler, die vier Läufe gekostet haben

Sie stehen hier, weil die Lehre daraus für 5B gilt.

| Lauf | Befund | Ursache |
| --- | --- | --- |
| 1 | 48 Fälle fielen nach je 7 s mit „element(s) not found" | Auf Port 4173 lief die Staging-Vorschau; `reuseExistingServer` hat sie still übernommen. **Keine** Layoutprüfung wurde erreicht. |
| 2 | 32 WebKit-Fokusfehler, `input.visually-hidden 1×1` | Fokus und Tastatur waren eine Prüfung; ein verstecktes Feld galt als Tippziel. |
| 3 | alle 32 schmalen Messungen `TIPPZIELAUSWAHL is not defined` | Eine Modulvariable als Vorgabewert. Playwright überträgt den Quelltext, nicht die Funktion. |
| 4 | `a.skip-link` und die Dateifelder als „ohne sichtbaren Auslöser" | Falsche Zuständigkeit — und weil diese Zusicherung zuerst kam, verdeckte sie alle echten Größenbefunde. |

Gemeinsame Lehre: **Eine Prüfung, die grün ist, kann trotzdem nichts geprüft
haben.** Jede der vier Korrekturen hat deshalb eine Wache bekommen, die den
Rückfall rot macht.

## 6. Die P0-Ausgangsmessung

Gemessen auf `bda06e6`. Chromium und WebKit liefern fachlich dieselben
Befunde; die 1-px-Abweichung eines Textlinks ist normale Schriftmetrik.

| Suite | Prüfungen | bestanden | übersprungen | Tippzielfehler |
| --- | --- | --- | --- | --- |
| kontofreie App | 192 | 144 | 32 | 16 |
| Portal | 192 | 148 | 28 | 16 |

Alles außer den Tippzielen ist grün: kein waagerechter Überlauf, Zoomprobe
bestanden, Fokus sichtbar, Skip-Link kommt ins Bild, Tastatur erreichbar.

### Kontofreie Anwendung (390 und 768 px)

| Ansicht | Befund | gemessen |
| --- | --- | --- |
| Startseite | `a.brand` 119 × 28 | 6 |
| Lehrkraftbereich | `a.brand` 119 × 28 · `button.btn.btn--small` 273 × 36 · `a.btn.btn--small` 176 × 36 · `a` 170 × 18 | 11 |
| Lernbereich | `a.brand` 119 × 28 · `button.btn.btn--quiet` 247 × 36 | 6 |
| Datenschutz | `a.brand` 119 × 28 · drei Links je 73 × 18 | 8 |

### Portal (390 und 768 px)

| Ansicht | Befund | gemessen |
| --- | --- | --- |
| Anmeldung | `a.brand` 119 × 28 · Eingabefeld 308 × 21 (390) bzw. 674 × 21 (768) · drei Links ≈ 103/104 × 18, 112 × 18, 122 × 18 | 9 |
| Lernbereich | `a.brand` 119 × 28 · `a` 138 × 22 | 5 |
| Kursbereich der Lehrkraft | `a.brand` 119 × 28 | 7 |
| Paketbereich der Lehrkraft | `a.brand` 119 × 28 · bei 768 zusätzlich `a` 150 × 22 | 7 |

### Das Muster hinter den Zahlen

Drei Klassen von Mängeln, nicht sechzehn Einzelfälle:

1. **Die Wortmarke** (`a.brand`, 119 × 28) — in **jeder** Ansicht beider
   Auslieferungen. Ein Verweis auf die Startseite, 28 px hoch. Er ist der
   einzige Befund, der überall auftritt.
2. **Schaltflächen bei 36 px** (`.btn--small`, `.btn--quiet`) — die kleine
   Knopfgröße ist unter dem Maß. Das ist eine Entscheidung im Designsystem,
   keine Eigenheit einer Ansicht.
3. **Textverweise und Eingabefelder bei 18 bis 22 px** — Fußzeilenverweise und
   ein Eingabefeld ohne eigene Mindesthöhe. Ihre Fläche ist die Zeilenhöhe der
   Schrift.

Alle drei fallen in den Zuständigkeitsbereich des Umbaus: Kopfzeile,
Schaltflächengrößen, Fußzeile und Formularfelder werden in 5B ohnehin neu
gesetzt.

### Wie mit diesen Befunden umgegangen wird

**Sie werden nicht isoliert im alten Design repariert**, soweit das kommende
responsive Design sie ohnehin ersetzt. Sie bleiben als Akzeptanzkriterien
aktiv: Jeder neu gestaltete Bildschirm muss seine Zeile in der Tabelle oben
grün machen.

Bis dahin sind die 32 Fehlschläge der bekannte, gemessene Ausgangszustand —
und kein Grund, die Prüfung abzuschalten oder ihre Erwartung zu senken.

## 7. Nachtrag: die verbindliche visuelle Richtung

Seit dem 30.09.2026 ist **Variante B** die verbindliche Richtung
(`docs/mockups/portal-variante-b/`, Entscheidungen E19 bis E22 in
`docs/konzept-5b.md`): kühl-heller Grund, Anthrazit als Hauptfarbe, Aurora als
Flächenakzent, Manrope 700–800 in den Überschriften, kein Dunkelmodus in 5B.

Für diese Prüfbank ändert das **nichts**. Sie misst Geometrie, Fokus und
Erreichbarkeit — keine Farben und keine Schriften. Die Akzeptanzkriterien aus
Abschnitt 6 gelten unverändert, und jeder neu gestaltete Bildschirm muss seine
Zeile grün machen, gleich in welcher visuellen Ebene er gebaut ist.

Die Entwürfe haben eine eigene Prüfung, die zusätzlich die Regeln der Variante
absichert (Glas nur an erlaubten Stellen, deckender Rückfall ohne
`backdrop-filter`, gerechnete Kontraste):

```
node docs/mockups/portal-variante-b/pruefe-variante.mjs
node docs/mockups/portal/pruefe-entwuerfe.mjs
```
