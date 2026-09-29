# Übergabe: das Portal in Betrieb nehmen

Stand: Sprint 5A, Phase 9. Branch `sprint/5a-cloud-portal-foundation`.
Nicht nach `main` gemergt, kein Tag, kein Remote, **kein Pages-Deployment**.

> ### Was sich am 29.09.2026 geändert hat
>
> Diese Datei war eine Anleitung, deren Schritte niemand ausgeführt hatte.
> Inzwischen gibt es ein **Stagingprojekt**, und die Abschnitte 1.1 bis 1.4
> sind dort durchlaufen: elf Migrationen angewandt, beide Edge Functions
> deployt und geprüft, Konten, Kurs, Einladung, Beitritt und der Entzug einer
> Mitgliedschaft abgenommen.
>
> Was hier steht, gilt also weiterhin als Anleitung für das **nächste**
> Projekt – aber nicht mehr als Aussage darüber, dass nichts davon je gelaufen
> wäre. Wo ein Schritt inzwischen belegt ist, steht es an Ort und Stelle.
> Der vollständige Stand samt offener Punkte steht in
> `inbetriebnahme-staging.md`, Abschnitt 0.5.

---

## 0. Vorher: was es gibt und was nicht

| | |
| --- | --- |
| **Es gibt** | elf Migrationen, zwei Serverfunktionen, zwei Web-Auslieferungen, zwei portable Dateien, rund 2960 Prüfungen |
| **Es gibt inzwischen auch** | ein Supabase-Stagingprojekt mit angewandten Migrationen, gesetzten Secrets und zwei deployten Serverfunktionen |
| **Es gibt weiterhin nicht** | einen Remote, ein Pages-Deployment, ein Produktivprojekt |

LexiFlow ist **ohne all das vollständig benutzbar**. Die kontofreie Anwendung
und die portablen Dateien brauchen keinen Server. Was hier eingerichtet wird,
ist der Zusatz: Konten, Kurse und ein Lernstand, der am Gerät nicht endet.

Wer das nicht braucht, muss diese Datei nicht lesen.

---

## 1. Supabase-Projekt

### 1.1 Anlegen

Projekt in der **EU-Region**. Die Region ist kein Datenschutznachweis, aber
ohne sie fängt die Prüfung gar nicht erst an.

### 1.2 Migrationen anwenden

Elf Dateien aus `supabase/migrations/`, in der Reihenfolge ihrer Namen —
**im SQL-Editor, nicht über `supabase db push`** (die Begründung steht unten):

| Datei | Was |
| --- | --- |
| `…120000_grundgeruest.sql` | elf Tabellen, zwei Trigger |
| `…120100_hilfsfunktionen.sql` | die Ja/Nein-Funktionen der Zugriffsregeln |
| `…120200_zugriffsregeln.sql` | Rechte und 23 Regeln |
| `…120300_anmeldung.sql` | Lernendenkonten, Wiederherstellung |
| `…120400_kurse_und_codes.sql` | Kurse, Einladungen, die Bremse |
| `…120500_pakete_und_revisionen.sql` | Pakete, Fassungen, Zuweisung |
| `…120600_lernstand.sql` | der Schreibweg samt Eingangsprüfung |
| `…120700_ki.sql` | Verbindungen und Freigabeliste |
| `20260920090000_dienstrechte.sql` | die Rechte der Serverfunktionen |
| `20260920140000_rechte_zuruecksetzen.sql` | Rechte abräumen und neu aufbauen |
| `20260929170000_lernstandszugriff.sql` | Lernstand braucht eine Mitgliedschaft |

> **Die letzten beiden kamen nach.** Die ersten acht vergeben Rechte an
> `anon` und `authenticated` – die Rollen des Browsers. Die Serverfunktionen
> sprechen als `service_role`, und für die stand nirgends ein `grant`; das
> holt die neunte nach.
>
> Die zehnte räumt vorher ab. Im Stagingprojekt waren Vorgaberechte wirksam,
> die allen drei Rollen volle Tabellenrechte gaben, sobald eine Migration eine
> Tabelle anlegte. `grant` kann davon nichts wegnehmen – erst `revoke`.
>
> Warum sie wirksam waren, ist nicht geklärt und für den Betrieb auch nicht
> nötig: Die zehnte entzieht, vergibt die genaue Matrix neu und setzt eigene
> Vorgaberechte. Der Rechtestand hängt danach nicht mehr davon ab, wie ein
> Projekt erstellt wurde. Siehe `inbetriebnahme-staging.md`, 3.1 und 3.2.1.

> **Die elfte kam am 29.09.2026 dazu.** Beim Staging zeigte sich, dass eine
> aus einem Kurs entfernte Person ihren Lernstand weiter lesen und über
> `begin_practice_session` weiter verändern konnte. Die Zugriffsregel fragte
> nur nach der Person, nie nach der Mitgliedschaft, und zwei `security
> definer`-Funktionen umgingen die Regel ohnehin. Migration 11 schließt
> beides über **eine** Funktion und nimmt `authenticated` die direkten
> Schreibrechte auf den Lernstandstabellen.

> **Ab jetzt sind Migrationen additiv.** Bis zum ersten Anwenden wurden sie
> beim Weiterbauen in sich geändert – das ging, weil es nirgends eine
> Datenbank gab, auf der sie schon gelaufen wären. Mit dem ersten Anwenden
> endet das. Wer danach eine bestehende Datei ändert, hat zwei verschiedene
> Schemata mit demselben Namen.

> ### Kein `supabase db push` – belegt am 29.09.2026
>
> `npx supabase@latest migration list` zeigt für **alle elf** lokalen Dateien
> eine leere Remote-Spalte. Die Migrationen wurden über den SQL-Editor
> eingespielt und stehen deshalb nicht in
> `supabase_migrations.schema_migrations`, der Historie, aus der die CLI ihren
> Abgleich bildet.
>
> Für die CLI sind damit alle elf offen. Ein `db push` spielte sie alle ein –
> auf eine Datenbank, in der sie längst wirken. Das Ergebnis hängt an jeder
> einzelnen Anweisung und lässt sich nicht vorhersagen.
>
> Bevor `db push` wieder benutzbar wird, muss die Historie **kontrolliert**
> angeglichen werden (`supabase migration repair --status applied <version>`
> je bereits angewandter Datei, danach `migration list` zur Kontrolle). Das
> ist ein eigener Vorgang mit eigener Abnahme.
>
> Bis dahin: **SQL-Editor, Datei für Datei, in der Reihenfolge der Namen.**

### 1.3 Function Secrets

**Zwei, mehr nicht.**

| Name | Wert | Wo er herkommt |
| --- | --- | --- |
| `LEXIFLOW_ALLOWED_ORIGINS` | die Pages-Adresse(n), mit Komma getrennt | siehe Abschnitt 2 |
| `LEXIFLOW_AI_MASTER_KEY_V1` | 32 Byte, base64 | siehe unten |

> **Was Supabase selbst mitbringt.** Die Edge-Laufzeit injiziert `SUPABASE_URL`
> sowie `SUPABASE_PUBLISHABLE_KEYS` und `SUPABASE_SECRET_KEYS` – die beiden
> letzten in der **Mehrzahl** und als JSON-Wörterbuch mit dem Eintrag
> `default`. Nichts davon wird hier eingetragen.
>
> **Eigene Secrets mit Präfix `SUPABASE_` lehnt das Dashboard ab.** Wer die
> fehlende Einzahlform nachtragen will, kommt nicht durch — und bräuchte es
> auch nicht: `supabase/functions/_shared/umgebung.ts` liest zuerst
> `…_KEYS.default`, dann die älteren Einzelnamen, und meldet verständlich,
> wenn keiner greift. Ohne je einen Schlüsselwert auszugeben.

Den Hauptschlüssel erzeugen – **nicht** in einem Passwortgenerator im Browser
und nicht von Hand:

```
openssl rand -base64 32
```

Er ist der Schlüssel zu allen Anbieterschlüsseln, die Lehrkräfte eintragen
werden. Geht er verloren, sind sie unlesbar; die Verbindungen bleiben stehen
und melden sich mit einem Satz, statt gelöscht zu werden. Neu eintragen ist
dann der Weg.

**Er gehört in keine `.env`, in keine Repository-Variable und in kein Bündel.**
Eine Variable mit dem Präfix `VITE_` landet im ausgelieferten JavaScript.

### 1.4 Edge Functions deployen

`learner-auth` und `ai-gateway`.

> **Stand 29.09.2026: beide sind im Stagingprojekt deployt und geprüft.**
> Ohne `Origin` antworten beide mit `403 Nicht erlaubt.` – also aus dem
> eigenen Code, nicht aus der Plattformprüfung; im Dashboard ist die
> JWT-Prüfung bei beiden aus. `learner-auth` lehnt einen ungültigen
> Einladungscode mit `400 {"fehler":"abgelehnt"}` ab und setzt
> `Access-Control-Allow-Origin` exakt auf die erlaubte Adresse; `ai-gateway`
> antwortet ohne Token und mit erfundenem Token je `401`, auf `OPTIONS` mit
> `204`. Die Einzelheiten stehen in `inbetriebnahme-staging.md`, 3.5.
>
> `ai-gateway` ließ sich beim ersten Versuch **nicht** bündeln: `core.ts`
> importierte drei Nachbarmodule ohne `.ts`-Endung. Vite und der
> TypeScript-Dienst raten die Endung, Deno nicht. Behoben in `d89e79d`, samt
> einer Wache, die endungslose relative Importe im produktiven
> Modulgraphen findet.

> **`supabase/config.toml` liegt im Repository** und setzt für beide
> `verify_jwt = false`. Das ist kein Wegfall der Autorisierung, sondern die
> Entscheidung, sie im Code zu behalten:
>
> - **`learner-auth`** wird von Menschen aufgerufen, die noch kein Konto
>   haben. Eine Sitzung gibt es an dieser Stelle nicht — die Funktion ist der
>   Weg zu ihr. Autorisiert wird über Herkunft, Einladungscode,
>   Wiederherstellungscode und Bremse.
> - **`ai-gateway`** prüft den Bearer-Token selbst und lehnt ohne gültige
>   Nutzersitzung mit 401 ab; danach kommen nur Lehrkräfte und Verwaltung
>   weiter.
>
> Ohne die Datei hinge das am Plattformstandard. Näheres in
> `inbetriebnahme-staging.md`, Abschnitt 3.5.

### 1.5 Die erste Lehrkraft

Es gibt **absichtlich keinen Weg in der Oberfläche**, sich selbst zur Lehrkraft
zu machen. Die erste Rolle wird in der Datenbank gesetzt – im **SQL-Editor des
Dashboards**, nicht mit dem Secret Key in einem lokalen Werkzeug. Der Editor
läuft innerhalb von Supabase; der Schlüssel wird dabei nirgendwohin kopiert:

```sql
update profiles set role = 'teacher' where id = '<die uuid aus auth.users>';
```

Danach legt diese Person Kurse an und lädt per Code ein. Weitere Lehrkräfte
bekommen ihre Rolle auf demselben Weg – ein Einladungscode erteilt niemals
Lehrkraftrechte, und das ist geprüft.

---

## 2. GitHub

1. Repository anlegen **oder** prüfen, dass das vorgesehene leer ist. Erst
   dann `origin` hinzufügen. Kein Force-Push, keine fremde Historie
   überschreiben.
2. Pages auf **„GitHub Actions"** stellen (nicht auf einen Zweig).
3. Repository-**Variables** setzen – nicht Secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

   Beide stehen ohnehin im Bündel. Als Secret wären sie in Protokollen
   maskiert, was das Nachsehen erschwert, ohne etwas zu schützen.
4. `LEXIFLOW_ALLOWED_ORIGINS` in Supabase auf die Pages-Adresse setzen, also
   `https://<user>.github.io` – der Ursprung, nicht der Pfad.
5. Erst nach grünem `ci.yml` nach `main` bringen.

---

## 3. Der erste Lauf

`deploy.yml` läuft auf `main`: erst die vollständige Prüfkette, dann ein
frischer Build, dann `npm run verify:deploy`, dann erst das Hochladen.

**Was normal ist:**

- Ohne `VITE_SUPABASE_URL` zeigt das Portal seine Einrichtungsseite und sagt,
  was fehlt. Das ist kein Defekt.
- `verify:deploy` schreibt genau das als Hinweis ins Protokoll.

**Was nicht normal ist:** Wenn `verify:deploy` abbricht. Dann liegt etwas in
`dist/`, das dort nicht hingehört – und die Meldung sagt, was. Sie sagt
absichtlich nicht, *welcher Wert* gefunden wurde: Ein CI-Protokoll ist der
letzte Ort, an dem ein Schlüssel landen sollte.

---

## 4. Wenn etwas nicht geht

| Zeichen | Wahrscheinlich | Nachsehen |
| --- | --- | --- |
| Portal zeigt „noch nicht eingerichtet" | Repository-Variables fehlen | Abschnitt 2.3 |
| Anmeldung meldet „nicht möglich" | GoTrue, Lern-ID oder Kennwort – die Meldung ist absichtlich gleich | Function-Logs von `learner-auth` |
| Beitritt schlägt fehl | Code abgelaufen, widerrufen, Kurs archiviert oder voll – die Meldung ist absichtlich gleich | `course_invites` ansehen |
| Alles im Portal ist leer, aber die Anmeldung geht | Zugriffsregeln greifen, Mitgliedschaft fehlt | `course_members` |
| KI meldet „Hauptschlüssel nicht eingerichtet" | Function Secret fehlt | Abschnitt 1.3 |
| KI meldet „lässt sich nicht entsiegeln" | falscher oder gewechselter Hauptschlüssel | Verbindung neu eintragen |
| KI meldet „Host nicht freigegeben" | eigene Adresse ohne Eintrag in `ai_allowed_hosts` | dort eintragen (nur Verwaltung) |
| Der Lernstand springt zwischen zwei Geräten | so soll es nicht sein – siehe unten | |

**Zum letzten Punkt.** Zwei Geräte, die dieselbe Vokabel gleichzeitig üben,
erzeugen einen Konflikt; das Gerät lädt neu, rechnet noch einmal und sendet
dasselbe Ereignis. Davon ist nichts zu sehen, und die Antwort zählt genau
einmal. Springt der Lernstand trotzdem sichtbar, ist das ein Fehler und kein
Verhalten – die Prüfung dazu heißt
`verbraucht die Ereigniskennung nicht, wenn der Schreibvorgang abgelehnt wird`.

---

## 5. Eine Schlüsselrotation

Nie gelaufen. Der Weg ist vorgesehen:

1. `LEXIFLOW_AI_MASTER_KEY_V2` dazulegen. **`V1` bleibt.**
2. `LEXIFLOW_AI_KEY_VERSION=2` setzen.
3. Neues wird mit `V2` versiegelt, Altes bleibt mit `V1` lesbar.
4. Jede Verbindung, die eine Lehrkraft neu speichert, wandert mit.
5. Erst wenn keine Zeile mehr `secret_key_version = 1` trägt, darf `V1` weg.

```sql
select count(*) from ai_connections where secret_key_version = 1;
```

Eine Rotation, die `V1` sofort entfernt, ist keine Rotation, sondern ein
Datenverlust mit Ankündigung.

---

## 6. Was beim Betrieb zu beobachten ist

- **Die Größen.** `npm run verify:portable` bei jedem Build. Wächst die
  Lernlaufzeit, ist Cloudcode hineingeraten – das ist ein Fehler, kein Preis.
- **Die Bremse.** Häufen sich 429er bei `learner-auth`, probiert jemand
  Lern-IDs durch.
- **Die Freigabeliste.** Jeder Eintrag in `ai_allowed_hosts` ist eine
  Entscheidung, deren Auflösung mitentschieden wird (DNS-Rebinding). Die Liste
  gehört durchgesehen, nicht angesammelt.

---

## 7. Was zurückzubauen wäre

Falls das Portal doch nicht kommt: Es hängt an nichts. `main` ist unangetastet,
die kontofreie Anwendung und die portablen Dateien sind unverändert, und der
ganze Cloudzweig liegt in `src/hosted/`, `src/cloud/`, `supabase/` und den
beiden Portal-Konfigurationen. Ein Test am Importgraphen hält fest, dass nichts
davon in eine portable Datei reicht – das ist derselbe Test, der den Rückbau
einfach macht.

---

## 8. Der ehrliche Schlusssatz

Alles in dieser Datei ist geschrieben und nichts davon ausgeführt. Der erste
Mensch, der sie abarbeitet, prüft damit zum ersten Mal: reales Supabase Auth,
JWT-Claims, PostgREST, beide Edge-Laufzeiten, Function Secrets, E-Mail-Versand
und das Deployment.

Bis dahin steht in keinem Dokument dieses Projekts, dass LexiFlow im
Portalbetrieb funktioniert.
