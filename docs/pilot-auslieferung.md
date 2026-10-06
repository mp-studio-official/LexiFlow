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

## Zwei Dinge, die vorher zu klären sind

### 0.1 Dieser Zweig liegt noch auf keinem Server

`git remote -v` in diesem Projektordner ist **leer**. Die 147 Commits des
Sprintzweigs stehen ausschliesslich auf dem Arbeitsrechner. Ohne ein Remote
gibt es keinen Ablauf, der laufen könnte – Actions laufen bei GitHub, nicht
hier.

`docs/inbetriebnahme-staging.md` nennt als Ziel
`github.com/mp-studio-official/LexiFlow` (§1.2.2, §9.1) und verlangt dort
ausdrücklich: Hat es Inhalt, **nicht** überschreiben, erst klären.

Der Zweig gehört also hochgeladen, und zwar **als Zweig** – `main` bleibt
dabei unberührt:

```
git remote add origin https://github.com/mp-studio-official/LexiFlow.git
git push -u origin sprint/5a-cloud-portal-foundation
```

### 0.2 `workflow_dispatch` verlangt den Standardzweig

Das ist keine Vermutung, es steht in der GitHub-Dokumentation:

> „To trigger the `workflow_dispatch` event, your workflow must be in the
> default branch."

`pilot.yml` liegt auf dem Sprintzweig. Standardzweig ist `main`. Damit
erscheint die Schaltfläche „Run workflow" **nicht**, und auch der Weg über
die API findet den Ablauf nicht.

Drei Wege, und nur zwei kommen in Frage:

| Weg | Urteil |
| --- | --- |
| **Standardzweig auf den Pilotzweig umstellen** (Settings → General → Default branch) | **empfohlen.** Das ist eine Projekteinstellung und ändert an `main` keinen einzigen Commit. Mit einem Klick zurückzustellen. |
| `pilot.yml` nach `main` committen | **nein** – das ändert `main`, und genau das ist untersagt |
| Statt `workflow_dispatch` ein `push` auf einen eigenen Auslieferungszweig | möglich, denn `push` kennt die Standardzweig-Regel nicht – aber es heisst wieder „ausgeliefert wird, weil jemand committet hat". Der Rückfall, falls der Standardzweig nicht bewegt werden soll. |

> **Was „Standardzweig umstellen" bedeutet und was nicht.** Die Commits auf
> `main` bleiben Zeichen für Zeichen stehen; `deploy.yml` läuft weiterhin nur
> auf `main` und damit gar nicht. Was sich ändert: welchen Zweig GitHub beim
> Öffnen des Projekts zeigt, und wohin ein `git clone` zeigt. Nach der
> Pilotabnahme wird zurückgestellt.

---

## Was Marc einmalig anlegt

**Nichts davon gehört in den Chat.** Alle Werte werden direkt bei GitHub
hinterlegt.

### 1. Das Pilotprojekt

Ein leeres Projekt: **`mp-studio-official/LexiFlow-Pilot`**, privat oder
öffentlich – für GitHub Pages auf einem kostenlosen Konto muss es
**öffentlich** sein.

> **Reihenfolge beachten.** Pages lässt sich nur auf einen Zweig stellen,
> den es **gibt**. `gh-pages` entsteht erst beim ersten Lauf des Ablaufs.
> Also: Projekt anlegen → Werte hinterlegen (unten) → Ablauf einmal laufen
> lassen → **dann** *Settings → Pages → Source: Deploy from a branch →
> `gh-pages` / `(root)`*. Eine frühere Fassung dieses Absatzes hat das
> andersherum beschrieben; so geht es nicht.

Die Pilotadresse lautet damit:
`https://mp-studio-official.github.io/LexiFlow-Pilot/portal/`

### 2. Variablen im Arbeitsprojekt

Im **Arbeitsprojekt** (`LexiFlow`), nicht im Pilotprojekt:
*Settings → Secrets and variables → Actions → Variables → New repository
variable*

| Name | Wert | Öffentlich? |
| --- | --- | --- |
| `LEXIFLOW_PILOT_OWNER` | `mp-studio-official` | ja – steht ohnehin in jeder Adresse |
| `LEXIFLOW_PILOT_REPO` | `LexiFlow-Pilot` | ja – Zielprojekt **und** Grundpfad |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | **ja** – steht in jedem Browserbündel |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | der Publishable Key (`sb_publishable_…`) | **ja** – dafür ist er gemacht |

> **Diese vier dürfen öffentlich sein, und zwar alle vier.** Die beiden
> Supabase-Werte stehen nach jedem Build im ausgelieferten JavaScript; sie
> geheim halten zu wollen wäre eine Täuschung über das, was ein
> Browserbündel ist. Was sie schützt, sind die Zugriffsregeln, nicht ihre
> Verborgenheit.

> **Niemals hier und niemals im Chat:** der **Secret Key** / die Service
> Role, das **Datenbankkennwort**, `LEXIFLOW_AI_MASTER_KEY_V1`, ein
> Anbieterschlüssel. Nichts davon gehört in eine Actions-Variable, in ein
> Secret dieses Projekts oder in eine Nachricht. Sie leben in den **Supabase
> Function Secrets** und verlassen Supabase nicht.

`LEXIFLOW_PILOT_REPO` ist beides: Das Zielprojekt heißt so, und die
Pilotadresse liegt deshalb unter `/LexiFlow-Pilot/`. Ein getrennter Wert
wäre eine Gelegenheit, zwei Dinge auseinanderlaufen zu lassen.

### 3. Ein Geheimnis im Arbeitsprojekt

*Settings → Developer settings → Personal access tokens → Fine-grained
tokens → Generate new token*

| Feld | Wert |
| --- | --- |
| Resource owner | `mp-studio-official` |
| Repository access | **Only select repositories** → ausschliesslich `LexiFlow-Pilot` |
| Repository permissions | **Contents: Read and write** – und sonst **nichts** |
| Expiration | so kurz, wie der Pilot dauert |

Dann im **Arbeitsprojekt**: *Settings → Secrets and variables → Actions →
Secrets → New repository secret*, Name **`LEXIFLOW_PILOT_TOKEN`**, Wert der
Token.

> **Der Token geht aus dem Browser direkt in das Secret-Feld und in nichts
> sonst** – nicht in den Chat, nicht in eine Datei, nicht in die Zwischenablage
> länger als nötig. GitHub zeigt ihn genau einmal.

Nicht mehr Rechte, nicht mehr Projekte: Der Token schreibt eine
Auslieferung; er soll nichts anderes können. Mit `Contents: write` auf einem
leeren Projekt ist der Schaden bei einem Verlust ein überschriebener
`gh-pages`-Zweig.

> **Was hier ausdrücklich nicht steht:** der Secret Key von Supabase, der
> Hauptschlüssel und jeder Anbieterschlüssel. Die bleiben serverseitig, in
> den Function Secrets, und haben in einem Auslieferungsablauf nichts zu
> suchen.

### 4. Supabase

*Authentication → URL Configuration → Redirect URLs → Add URL*

```
https://mp-studio-official.github.io/LexiFlow-Pilot/portal/**
```

Die bestehenden Einträge bleiben stehen. Ohne diesen führt die
Kennwortwiederherstellung einer Lehrkraft ins Leere: Die Rückkehradresse
entsteht im Code aus `location.origin` plus Grundpfad plus
`#/kennwort-neu` und steht nirgends fest geschrieben, deshalb muss die
Allowlist den Pfad mit `**` abdecken (Inbetriebnahme §3.3.2).

> **`LEXIFLOW_ALLOWED_ORIGINS` braucht *keine* Änderung.** Dort steht
> `http://localhost:4173,https://mp-studio-official.github.io`. Ein Ursprung
> ist Schema plus Host – ohne Pfad. Die Pilotadresse liegt auf demselben
> Host wie die spätere Hauptadresse, also ist sie bereits abgedeckt. Diesen
> Wert „vorsichtshalber" zu ergänzen hiesse, einen zweiten Eintrag für
> denselben Ursprung zu pflegen.

Unabhängig vom Pilot und schon belegt: **„Allow new users to sign up" ist
aus** (06.10.2026, `docs/pilot-abnahme.md` A1).

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
