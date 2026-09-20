# Übergabe: das Portal in Betrieb nehmen

Stand: Sprint 5A, Phase 9. Branch `sprint/5a-cloud-portal-foundation`.
Nicht nach `main` gemergt, kein Tag, kein Remote, nichts deployt.

Diese Datei ist eine **Anleitung**, kein Bericht. Kein Schritt darin ist
gelaufen. Wer sie abarbeitet, tut jeden Schritt zum ersten Mal – und der
letzte Abschnitt sagt, woran man merkt, dass einer davon schiefgegangen ist.

---

## 0. Vorher: was es gibt und was nicht

| | |
| --- | --- |
| **Es gibt** | neun Migrationen, zwei Serverfunktionen, zwei Web-Auslieferungen, zwei portable Dateien, 2857 Prüfungen |
| **Es gibt nicht** | ein Supabase-Projekt, einen Hauptschlüssel, einen Remote, ein Deployment |

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

Neun Dateien aus `supabase/migrations/`, in der Reihenfolge ihrer Namen:

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

> **Die neunte kam nach.** Die ersten acht vergeben Rechte an `anon` und
> `authenticated` – die Rollen des Browsers. Die Serverfunktionen sprechen als
> `service_role`, und für die stand nirgends ein `grant`. Das fällt nur auf,
> wenn „Automatically expose new tables" abgeschaltet ist; sonst verteilt
> Supabase die Rechte selbst, und das Portal läuft aus einem Grund, der nicht
> im Repository steht.

> **Ab jetzt sind Migrationen additiv.** Bis hierher wurden sie beim
> Weiterbauen in sich geändert – das ging, weil es nirgends eine Datenbank
> gab, auf der sie schon gelaufen wären. Mit dem ersten Anwenden endet das.
> Wer danach eine bestehende Datei ändert, hat zwei verschiedene Schemata mit
> demselben Namen.

### 1.3 Function Secrets

| Name | Wert | Wo er herkommt |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` | der Secret Key des Projekts | Projekteinstellungen |
| `LEXIFLOW_ALLOWED_ORIGINS` | die Pages-Adresse(n), mit Komma getrennt | siehe Abschnitt 2 |
| `LEXIFLOW_AI_MASTER_KEY_V1` | 32 Byte, base64 | siehe unten |

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

`learner-auth` und `ai-gateway`. Beide sind nie gelaufen; der erste Aufruf ist
der erste Test ihrer Mäntel.

### 1.5 Die erste Lehrkraft

Es gibt **absichtlich keinen Weg in der Oberfläche**, sich selbst zur Lehrkraft
zu machen. Die erste Rolle wird in der Datenbank gesetzt, mit Service Role:

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
