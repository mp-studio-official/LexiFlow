# Variante B im Portal — Abnahme der Teile 1 bis 5

Stand: 12.10.2026 · Zweig `sprint/5a-cloud-portal-foundation` · ab `0f9ad61`

Die Informationsarchitektur, die Navigation und die Bedienung sind
unverändert. Geändert hat sich, wie das Portal aussieht.

## 1. Commits

| Commit | Teil | Was |
| --- | --- | --- |
| `110ee36` | 1 | Hülle: feste Aurora-Ebene, schwebende Iconleiste, eingerückte Glasleiste und Glaskopf am Telefon |
| `57857fa` | 2 | Portaleigene Schicht `portal.css`: Knöpfe, Formulare, Alerts, Karten, Leerzustände — jede Regel auf `.huelle` eingegrenzt |
| `bce5d82` | 5 | `/pakete` ist die Route, `/material` die dauerhafte Weiterleitung (E13 eingelöst) |
| `c439903` | 4 | `Kurskarte` und `Paketkarte` produktiv; Aurora-Standardmotiv aus der Kennung |
| `d06628d` | 3 | Routen: Abschnitte statt Karte-in-Karte, Seitenkopf mit Handlung rechts, Flussreset |

`9029120` und `711387b` liegen dazwischen und gehören nicht zu dieser
Arbeit (Webmetadaten, Pilotdomain).

Die Reihenfolge 5 vor 4 vor 3 ist Absicht: Teil 5 war eine Zeile und
machte `/pakete` zur echten Adresse, auf die Teil 3 sich dann beziehen
konnte.

## 2. Betroffene Routen

Alle fünfzehn produktiven Portalrouten:

- öffentlich: `#/anmelden`, `#/beitreten`, `#/datenschutz`, `#/kennwort-vergessen`
- Lehrkraft: `#/start`, `#/kurse`, `#/pakete`, `#/material` (Weiterleitung), `#/ki`, `#/einstellungen`, `#/verwaltung`
- Lernende: `#/lernen`, `#/heute`, `#/ueben`, `#/fortschritt`

### Geschlossen im Abschlusscommit

- **Der Bereich heißt „Lernpakete".** Seitentitel, Bereichstitel und
  Beschreibungstexte nennen ihn so; die Navigation tat es schon. Geändert
  wurden nur Stellen, an denen „Material" der **Name dieses Bereichs**
  war. Allgemeine Rede über Unterrichtsmaterial bleibt stehen — etwa
  „Materialerstellung" auf der KI-Seite, „Wer Material baut" in
  `access.ts`, „Material aus Text, Liste oder Thema" in der portablen
  `AppShell`. Der Dateiname `MaterialPage.tsx` bleibt vorerst; er ist
  nirgends sichtbar, und ein Umbenennen gehörte in einen eigenen Commit.
- **Die Absage fällt nicht mehr aus der Hülle.** Siehe Abschnitt 9.

### Akzeptierte Abweichungen

1. **Keine Oberzeile über den Seitentiteln.** Die Variante B zeigt über
   dem Titel eine Einordnung („LERNPAKETE", „DIENSTAG, 30. SEPTEMBER").
   Die produktiven Seiten haben heute keine solche Einordnung. Eine zu
   setzen hieße, eine Angabe zu behaupten, die es nicht gibt. Die
   Oberzeile bleibt deshalb **bewusst aus, solange keine echte Einordnung
   vorhanden ist**; die Regel `.seitenkopf__oberzeile` steht bereit.
2. **Die Aurora liegt `fixed`, im Mockup `absolute`.** Fest gewählt,
   damit sie beim Scrollen nicht mitwandert und auf einer langen Seite
   nicht zweimal auftaucht.
3. **Kein Seitenkopf mit Handlung rechts auf `/pakete`, `/ki`,
   `/einstellungen`.** Dort ist die Handlung kein Knopf, sondern ein
   Formular im Fluss (Übernahme vom Gerät, Zuweisung). Auf `/kurse` ist
   sie ein Auslöser und steht deshalb im Kopf.
4. **Keine echten Titelbilder.** Die Titelbildfläche der `Paketkarte`
   trägt das Aurora-Motiv; Upload und Bucket bleiben bei 5B.8 — wie
   beauftragt nicht begonnen.
5. **Der Ladezustand des Riegels steht weiterhin ohne Hülle.** Solange
   die Sitzung gelesen wird, ist die Rolle unbekannt — und damit auch,
   welche Hülle die richtige wäre. Eine zu raten hieße, für einen
   Augenblick eine Navigation zu zeigen, die der Person nicht gehört.

## 3. Typecheck und Testsuite

- `npm run typecheck` — sauber.
- Vollständige Suite in acht Scherben: **219 Dateien, 4025 Prüfungen, alle grün.**

## 4. Gegenproben

| Zusage | Eingriff | Ergebnis |
| --- | --- | --- |
| Jede Portalregel ist auf `.huelle` eingegrenzt | `.btn--schummel` ohne Präfix angehängt | rot |
| `:where(…)` täuscht die Eingrenzungswache nicht | `teileOberste` mit Klammer und mit Komma dahinter | beide Richtungen geprüft |
| Wer einen neuen Baustein benutzt, steht im Register | Eintrag `Paketkarte` entfernt | rot (2 Prüfungen) |
| Die Vokabelzahl steht unter ihrer Bezeichnung | erwartete Zahl um 1 erhöht | rot |
| Die Messung erkennt eine leere Seite | Vorschau ohne `LEXIFLOW_BASE` | 16 × `LEER` |

## 5. Messung bei 390, 768, 1024 und 1440 px

`npm run portal:messen`, fünfzehn Routen mal vier Breiten gegen die
kontrollierte Fälschung (`VITE_LEXIFLOW_FAKE_CLOUD=1`), im Containerklon
des gepushten Stands:

> Bestanden: kein Überlauf, kein Tippziel unter 44 px.

Zwei Messfehler sind dabei aufgefallen und behoben:

- **Die Messung meldete „ok" für eine weiße Seite.** Eine Vorschau ohne
  `LEXIFLOW_BASE` liefert für jede Adresse die Ersatzseite des Solo-Teils
  aus; die Portalbündel laufen ins Leere, React rendert nie. Eine leere
  Seite hat weder Überlauf noch zu kleine Tippziele — beide Prüfungen
  waren grün, weil sie nichts zu messen hatten. Die Messung verlangt
  jetzt `.huelle` und Text.
- **`lernende-einstellungen` war keine Route.** `#/einstellungen` gehört
  dem Lehrkraftbereich. Gemessen wurde vier Breiten lang eine Absage.
  Aus der Liste genommen.

## 6. Aufnahmen

Alle fünfzehn Routen, Schreibtisch (1440 px) und Telefon (390 px), als
zwei Kontaktbögen im Gesprächsverlauf. Einzelbilder liegen im
Messordner, nicht im Projekt — sie gehören zur Messung, nicht zum Stand.

## 7. Vergleich mit `docs/mockups/portal-variante-b`

| Zug der Variante B | Produktiv |
| --- | --- |
| Feste Aurora hinter dem Inhalt | ja (Teil 1) |
| Iconleiste 76 px, dauerhaft kompakt, Marker am Rand | ja |
| Nur das Zeichen in der Leiste, kein Schriftzug | ja (Teil 3 — lief vorher aus der Leiste heraus) |
| Schwebende, eingerückte Glasleiste am Telefon | ja (Teil 1) |
| Glaskopf am Telefon, schlichte Zeile am Schreibtisch | ja (Teil 1) |
| Glas nur für Leiste, Kopf und kleine Statusflächen | ja — alles in `glas.css`, mit deckendem Rückfall |
| Karten deckend, mit `--rund-gross` und flachem Schatten | ja (Teil 2) |
| Pillenförmige Knöpfe, gefüllt für die Haupthandlung | ja (Teil 2) |
| Abschnittstitel auf der Fläche, stiller Verweis daneben | ja (Teil 3) |
| Titel links, Handlung rechts | auf `/kurse`; sonst siehe Abweichung 3 |
| Kurskarte und Paketkarte im Raster | ja (Teil 4) |
| Aurora-Standardmotiv für Pakete ohne Bild | ja (Teil 4) |
| Oberzeile über dem Titel | nein — akzeptierte Abweichung 1 |
| Werkstatt, Upload, Grammatik | nicht begonnen, wie beauftragt |

## 8. Was nicht angefasst wurde

Nachgewiesen über `git diff --stat 0f9ad61 d06628d`:

- **Portable und geteilte Dateien unverändert:** `src/ui/components.tsx`,
  `src/ui/AppShell.tsx`, `src/ui/StudentShell.tsx`, `src/ui/zustaende.tsx`,
  `src/styles/global.css`, `src/styles/tokens.css`.
- **Rollen und Zugang unverändert:** `src/runtime/access.ts`,
  `src/hosted/RequireArea.tsx`, `src/hosted/SessionContext.tsx`,
  `src/application/`, `supabase/`.
- **Keine Migration, keine Datenbankänderung, keine KI-Arbeit, keine
  Änderung am Domain-Deployment.**
- **Navigation:** geändert hat sich genau ein Zustand in
  `navigationsziele.ts` — `#/pakete` von `weiterleitung` auf `vorhanden`,
  die Umkehrung von E13. Kein Ziel ist dazugekommen oder weggefallen.
- `main` ist unangetastet, es gibt keine Zusammenführung und kein Deployment.

## 9. Die Absage in der eigenen Hülle

Eine angemeldete Person, die eine Adresse einer anderen Rolle aufruft,
bekommt weiterhin denselben Satz — jetzt aber in der Hülle **ihrer
eigenen** Rolle, mit ihrer Navigation, ihrer Marke und „Abmelden".

Der Riegel `RequireArea` steht an zwei Plätzen: **um** eine Hülle herum
(Lern- und Lehrkraftbereich) und **in** einer drin (die Verwaltung, die
enger ist als der Lehrkraftbereich um sie). Im ersten Fall muss die
Meldung eine Hülle mitbringen, im zweiten darf sie es auf keinen Fall —
sonst stünde die Navigation zweimal untereinander. Welcher Fall vorliegt,
sagt die Hülle selbst über einen Kontext (`useInHuelle`) und nicht ein
Prop, das man an fünf Stellen von Hand setzt und beim sechsten vergisst.

**Kein zusätzlicher Zugriff.** Die Entscheidung ist Zeile für Zeile
dieselbe `mayEnter`-Frage; nur die Absage sieht anders aus.

**Kein geschützter Inhalt, auch nicht kurz.** Die Kinder des Riegels
stehen im `return` des erlaubten Zweigs und nirgendwo sonst; der
Absagezweig rendert sie gar nicht erst.

Geprüft werden alle drei Kombinationen, die `mayEnter` im Portal wirklich
ausschließt — eine lernende Person auf `/kurse` und auf `/verwaltung`,
eine Lehrkraft auf `/verwaltung`. Eine vierte gibt es nicht: In den
Lernbereich dürfen alle drei Rollen.

`aria-current` steht je sichtbarer Navigation genau so oft, wie es
stimmt: keinmal, wenn die aufgerufene Adresse in dieser Navigation gar
nicht vorkommt, und einmal bei einer Lehrkraft auf `/verwaltung`, weil
diese Adresse seit jeher unter „Einstellungen" hängt. Die Gegenprobe
steht daneben: Auf der eigenen Seite muss es genau einmal sein — sonst
ließe sich die erste Hälfte auch dadurch erfüllen, dass `aria-current`
nirgends mehr steht.
