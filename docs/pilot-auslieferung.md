# Pilot 0.1 aus dem bestehenden LexiFlow-Projekt ausliefern

> **Noch nicht ausgeliefert.** Dieses Dokument beschreibt den Weg und ist
> geprüft, soweit er sich ohne Deployment prüfen lässt. Der Ablauf
> `.github/workflows/pilot.yml` läuft ausschließlich auf Zuruf.

## Die Entscheidung

Quelltext und Pilotseite liegen im bestehenden öffentlichen GitHub-Projekt
`mp-studio-official/LexiFlow`. Ein zweites Projekt wird nicht angelegt.

Der Pilotzweig bleibt vom lokalen `main` getrennt. Die Veröffentlichung
verändert `main` nicht: GitHub Actions checkt den ausdrücklich gewählten
Pilotzweig aus, prüft ihn, baut `dist/` und übergibt dieses Verzeichnis über
GitHubs offiziellen Pages-Ablauf. Es gibt weder einen `gh-pages`-Push noch
einen persönlichen Zugriffstoken im Projekt.

Die Pilotadresse lautet:

`https://mp-studio-official.github.io/LexiFlow/portal/`

## Warum kein persönlicher Deployment-Token nötig ist

Der Auftrag `ausliefern` besitzt nur die von GitHub Pages verlangten
kurzlebigen Rechte:

- `contents: read`
- `pages: write`
- `id-token: write`

Er verwendet `actions/configure-pages`, `actions/upload-pages-artifact` und
`actions/deploy-pages`. Der Zugriff gilt nur während des Laufs. Es gibt kein
Secret `LEXIFLOW_PILOT_TOKEN`, kein Zielprojekt und keinen dauerhaft
gespeicherten Cross-Repository-Zugang.

## Einmalige Einrichtung

### 1. Den Pilotzweig hochladen

Das Remote ist lokal bereits als
`https://github.com/mp-studio-official/LexiFlow.git` eingetragen. Hochgeladen
wird nur der Pilotzweig:

```sh
git push -u origin sprint/5a-cloud-portal-foundation
```

Da das GitHub-Projekt leer angelegt wurde, wird der erste hochgeladene Zweig
voraussichtlich sein Standardzweig. Danach im GitHub-Projekt kontrollieren:
*Settings → General → Default branch*. Steht dort der Pilotzweig, ist kein
weiterer Schritt nötig. `main` wird nicht hochgeladen und nicht verändert.

`workflow_dispatch` ist nur verfügbar, wenn die Workflowdatei auf dem
Standardzweig liegt. Falls GitHub wider Erwarten einen anderen Standardzweig
setzt, wird die Projekteinstellung auf den Pilotzweig gestellt; kein Commit
wird dabei verändert.

### 2. Zwei Actions-Variablen

Im Projekt `LexiFlow` unter *Settings → Secrets and variables → Actions →
Variables*:

| Name | Wert | Warum öffentlich |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | steht im Browserbündel |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | ist für den Browser bestimmt |

Nicht benötigt werden `LEXIFLOW_PILOT_OWNER`, `LEXIFLOW_PILOT_REPO` und
`LEXIFLOW_PILOT_TOKEN`.

Niemals in GitHub hinterlegen: Secret Key / Service Role,
`LEXIFLOW_AI_MASTER_KEY_V1`, Datenbankkennwort oder Anbieterschlüssel. Diese
bleiben in den Supabase Function Secrets.

### 3. GitHub Pages

Unter *Settings → Pages → Build and deployment* wird **GitHub Actions** als
Quelle gewählt. Der Workflow veröffentlicht sein geprüftes Artefakt direkt;
ein `gh-pages`-Zweig wird nicht benötigt.

### 4. Supabase-Rückkehradresse

Die operative Adresse ist bereits als Rückkehradresse vorhanden:

```text
https://mp-studio-official.github.io/LexiFlow/portal/**
```

Der zusätzlich vorbereitete Eintrag für `LexiFlow-Pilot` ist für diesen Weg
nicht erforderlich, aber unschädlich. `LEXIFLOW_ALLOWED_ORIGINS` bleibt
unverändert, weil ein Ursprung nur aus Schema und Host besteht.

## Der Lauf

*Actions → „Pilot 0.1 ausliefern" → Run workflow →* Zweig wählen und bei
`bestaetigung` genau `pilot` eingeben.

Der Ablauf:

1. weist jede andere Bestätigung zurück;
2. fährt Typecheck, alle Tests und die drei E2E-Suiten;
3. baut die portablen Dateien und prüft ihre Größe;
4. checkt für die Auslieferung frisch aus und baut ohne Fake-Cloud;
5. prüft `dist/` mit `verify:deploy`, einschließlich Pilotband und Grundpfad;
6. lädt ausschließlich `dist/` als Pages-Artefakt hoch;
7. veröffentlicht es über die geschützte Umgebung `github-pages`.

## Rückfall

### Adresse sofort abschalten

*Settings → Pages* und die Veröffentlichung deaktivieren. Supabase-Daten
werden davon nicht berührt.

### Vorherigen Stand erneut veröffentlichen

In *Actions* den erfolgreichen Lauf des gewünschten älteren Commits öffnen
und **Re-run all jobs** wählen. Er baut den alten Stand frisch und ersetzt
die Pages-Auslieferung.

### Unterricht fortsetzen

Die Lehrkraft erhält vor dem Pilot die geprüfte portable Lerndatei. Sie läuft
ohne Konto und ohne Netz. Ihr lokaler Lernstand ist vom gemeinsamen
Portal-Lernstand getrennt; nach einer Rückkehr ins Portal steht dort der
Stand von vor dem Ausfall.

## Noch nicht belegt

Der Workflow ist noch nicht auf GitHub gelaufen. Erst ein grüner Lauf, die
erreichbare Adresse und die Browserabnahme machen aus diesem beschriebenen
Weg eine belegte Auslieferung.
