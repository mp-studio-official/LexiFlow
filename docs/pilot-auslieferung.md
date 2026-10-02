# Pilot 0.1 ausliefern

> **Noch nicht ausgeliefert.** Dieses Dokument beschreibt den Weg und ist
> geprüft, soweit er sich ohne Deployment prüfen lässt. Der Ablauf
> `.github/workflows/pilot.yml` läuft **nur auf Zuruf** – es gibt keinen
> Auslöser, der ihn von selbst startet.

## Die Entscheidung dahinter

`main` bleibt unangetastet, bis der Pilot abgenommen ist. Der Pilot läuft auf
einem eigenen Zweig und hat eine eigene Adresse. Das ist nicht nur Vorsicht:
Zwischen `main` und dem Arbeitsstand liegen 147 Commits, und ein Merge wäre
die eine Handlung, die sich nicht zurücknehmen lässt, ohne dass es jemand
sieht.

## Warum ein zweites Projekt

GitHub Pages liefert je Projekt **eine** Seite aus. Zwei Adressen heißen
deshalb: zwei Projekte – oder eine eigene Domain. Der Ablauf baut im
Arbeitsprojekt und schiebt das Ergebnis in ein zweites, dessen Pages-Seite
die Pilotadresse ist.

Der Vollständigkeit halber die Alternativen, und warum sie es nicht sind:

| Weg | Warum nicht |
| --- | --- |
| Unterpfad im selben Projekt | Pages kennt keinen zweiten Wurzelordner; beide Auslieferungen teilten sich dieselbe Seite |
| `gh-pages`-Zweig im selben Projekt | dieselbe Adresse wie `main`, nur aus einem anderen Zweig |
| Eigene Domain | möglich und sauber, aber eine Entscheidung mit Kosten und DNS – nicht für 0.1 |

## Was Marc einmalig anlegt

**Nichts davon gehört in den Chat.** Alle Werte werden direkt bei GitHub
hinterlegt.

### 1. Das Pilotprojekt

Ein leeres Projekt, etwa `LexiFlow-Pilot`. Pages darauf einschalten:
*Settings → Pages → Source: Deploy from a branch → `gh-pages` / `(root)`.*
Der Zweig entsteht beim ersten Lauf; bis dahin zeigt Pages nichts an.

### 2. Variablen im Arbeitsprojekt

*Settings → Secrets and variables → Actions → Variables*

| Name | Wert | Wofür |
| --- | --- | --- |
| `LEXIFLOW_PILOT_OWNER` | der Kontoname | wohin geschoben wird |
| `LEXIFLOW_PILOT_REPO` | `LexiFlow-Pilot` | Zielprojekt **und** Grundpfad |
| `VITE_SUPABASE_URL` | die Staging-URL | darf öffentlich sein |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | der veröffentlichbare Schlüssel | darf öffentlich sein |

`LEXIFLOW_PILOT_REPO` ist beides: Das Zielprojekt heißt so, und die
Pilotadresse liegt deshalb unter `/LexiFlow-Pilot/`. Ein getrennter Wert
wäre eine Gelegenheit, zwei Dinge auseinanderlaufen zu lassen.

### 3. Ein Geheimnis im Arbeitsprojekt

*Settings → Secrets and variables → Actions → Secrets*

| Name | Was |
| --- | --- |
| `LEXIFLOW_PILOT_TOKEN` | ein Fine-grained Token mit **Contents: write** ausschließlich auf `LexiFlow-Pilot` |

Nicht mehr Rechte, nicht mehr Projekte. Der Token schreibt eine
Auslieferung; er soll nichts anderes können.

> **Was hier ausdrücklich nicht steht:** der Secret Key von Supabase, der
> Hauptschlüssel und jeder Anbieterschlüssel. Die bleiben serverseitig, in
> den Function Secrets, und haben in einem Auslieferungsablauf nichts zu
> suchen.

### 4. Supabase

*Authentication → URL Configuration*: Die Pilotadresse als zusätzliche
Redirect-URL eintragen, sonst führt die Kennwortwiederherstellung ins Leere.
Und, unabhängig vom Pilot: **„Allow new users to sign up" muss aus sein**
(siehe `docs/abnahme/migration-14.md`).

## Der Lauf

*Actions → „Pilot 0.1 ausliefern" → Run workflow →* Zweig wählen, in das
Feld `bestaetigung` genau `pilot` eintippen.

Was dann passiert, in dieser Reihenfolge:

1. **Bestätigung.** Steht dort nicht `pilot`, bricht der Lauf sofort ab.
2. **Prüfkette.** Typecheck, alle Prüfungen, drei E2E-Suiten, portable
   Dateien samt Größenwacht. In einem **eigenen** Auftrag.
3. **Frischer Auscheckvorgang.** Nichts aus den E2E-Läufen kann in die
   Auslieferung geraten – die Portalsuite baut mit erfundenen Konten.
4. **Bauen** mit dem Grundpfad der Pilotadresse.
5. **`npm run verify:deploy`.** Sucht die Testfassung, Geheimnisse, Pfade
   außerhalb des Grundpfads – und seit Pilot 0.1 das **Pilotband**: Fehlt es
   im gebauten Bündel, bricht der Lauf ab.
6. **Schieben** nach `gh-pages` im Pilotprojekt.

## Der Rückfall

Drei Stufen, von der kleinsten zur größten.

### Stufe 1 – die Auslieferung zurücknehmen

Der Zielzweig trägt eine Geschichte: Jeder Lauf ist ein Commit. Zurück auf
den vorherigen Stand:

```
git clone --branch gh-pages https://github.com/<Besitzer>/LexiFlow-Pilot.git
cd LexiFlow-Pilot
git reset --hard HEAD~1
git push --force
```

Pages liefert innerhalb weniger Minuten wieder den vorherigen Stand aus.

### Stufe 2 – die Adresse abschalten

*Settings → Pages → Source: None.* Die Adresse ist sofort tot. Niemand
verliert dabei Daten: Das Portal hält nichts, alles steht in Supabase.

### Stufe 3 – der Unterricht geht weiter

Das ist der Rückfall, auf den es ankommt, und er ist **vor** dem Pilot zu
treffen, nicht danach: Die Lehrkraft hat die **portable Lerndatei** ihrer
Pakete auf dem eigenen Rechner. Sie läuft ohne Konto, ohne Netz und ohne
diese Adresse.

> Was dabei verloren geht, und es soll hier stehen: der **gemeinsame
> Lernstand**. Die portable Datei führt ihren eigenen, lokal. Nach einer
> Rückkehr ins Portal steht dort der Stand von vor dem Ausfall. Das ist der
> Preis dafür, dass der Unterricht weiterläuft, und er ist der kleinere.

## Was dieser Weg nicht kann

Er ist **nicht gelaufen**. Jede Zeile hier ist aus dem Ablauf und aus
`verify-deploy.mjs` abgeleitet, nicht aus Erfahrung mit diesem Projekt im
Netz – die gibt es nicht. Belegt ist bisher nur, was sich ohne Deployment
belegen lässt: dass die Prüfkette läuft, dass `verify:deploy` das Pilotband
im gebauten Bündel findet und dass sie abbricht, wenn es fehlt.

Der erste Lauf wird Dinge zeigen, die hier nicht stehen. Dafür gibt es
Stufe 1.
