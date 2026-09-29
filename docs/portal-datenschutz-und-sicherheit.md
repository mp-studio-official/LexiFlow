# Das Portal: Datenschutz- und Sicherheitsbericht

Stand: Sprint 5A, Branch `sprint/5a-cloud-portal-foundation`, Phase 9.
Nicht nach `main` gemergt, kein Tag, kein Remote, nichts deployt.

Dieser Bericht sagt, was das Portal speichert, wer was sehen kann, wodurch das
abgesichert ist – und was noch niemand nachgeprüft hat. Der letzte Teil ist der
wichtigste, und er steht deshalb nicht am Ende, sondern in Abschnitt 1.

> **Kein Rechtsgutachten.** Was hier steht, ist eine technische Beschreibung.
> Ob der Betrieb an einer bestimmten Schule zulässig ist, entscheidet nicht
> diese Datei, sondern eine datenschutzrechtliche Prüfung mit den Verantwortlichen
> vor Ort. Abschnitt 8 sagt, was eine solche Prüfung von hier aus mitnehmen kann
> und was sie selbst leisten muss.

---

## 1. Was gelaufen ist – und was noch nie

Seit dem 29.09.2026 gibt es ein **Supabase-Stagingprojekt**. Dieser Abschnitt
hieß bis dahin „Was noch nie gelaufen ist" und zählte alles auf. Das stimmt so
nicht mehr, und die Trennung ist zu wichtig, um sie stehen zu lassen.

**Inzwischen gelaufen, im Staging:**

| Gelaufen | Was daran belegt ist |
| --- | --- |
| Supabase Auth (GoTrue) | Anmeldung als Lehrkraft und als lernende Person, Rollenauflösung aus `profiles` |
| echte JWT-Claims | Tokens werden ausgestellt und von PostgREST geprüft |
| PostgREST | Die Zugriffsregeln greifen über HTTP, nicht nur in SQL – geprüft am Entzug einer Mitgliedschaft |
| beide Edge-Laufzeiten | `learner-auth` und `ai-gateway` deployt; Herkunftsprüfung, Ablehnungen und CORS geprüft |
| Function Secrets | `LEXIFLOW_ALLOWED_ORIGINS` und `LEXIFLOW_AI_MASTER_KEY_V1` gesetzt; dass `ai-gateway` die Schlüssel **findet**, ist belegt |

**Weiterhin nie gelaufen:**

| Nie gelaufen | Folge |
| --- | --- |
| der Hauptschlüssel im Einsatz | Er ist gesetzt, aber noch nie zum Ver- oder Entschlüsseln benutzt; keine Rotation ist gelaufen |
| E-Mail-Versand | Keine Nachricht wurde verschickt oder empfangen |
| jeder KI-Anbieter | Kein Aufruf hat je ein Netz gesehen |
| das Deployment | Kein Remote, kein Push, kein GitHub Pages |
| ein Produktivprojekt | Alles Obige gilt für **Staging**, mit erfundenen Namen und ohne echte Lerngruppe |

**Solange das so ist, sagt dieser Bericht an keiner Stelle, dass das Portal
funktioniert.** Er sagt, was geprüft wurde und wie.

---

## 2. Der Grundsatz, an dem alles hängt

**Lernstände gehören den Lernenden.** Keine Rolle – nicht die Lehrkraft, nicht
die Verwaltung, niemand – kann den Lernstand einer anderen Person lesen.

Das ist keine Einstellung und kein Standardwert. Es ist die Bauart:

| Riegel | Wo |
| --- | --- |
| Die Zugriffsregel | Je Lernstandstabelle **genau eine** Regel: `user_id = auth.uid()`. Für Lesen, Schreiben, Ändern und Löschen zusammen – vier getrennte Regeln wären vier Gelegenheiten, eine davon zu lockern |
| Der Vertrag | `ProgressRepository` hat keine Methode und keinen Parameter für eine fremde Kennung. Was nicht beschrieben ist, entsteht nicht aus Versehen |
| Die Serverfunktionen | Nehmen keine Personenkennung entgegen – auch nicht in ihren inneren Prüfungen |
| Ein Strukturtest | Keine Zugriffsregel auf den Lernstandstabellen erwähnt `course_members`, `app_is_teacher_of`, `app_my_role` oder `app_is_member_of`. Jede denkbare „Klassenübersicht" bräuchte genau das |
| Eine Liste mit Begründung | Nur drei SQL-Funktionen dürfen Lernstandstabellen überhaupt anfassen. Kommt eine vierte hinzu, fällt ein Test auf, und jemand muss aufschreiben, wozu sie gut ist |

Geprüft wird das nicht an der Oberfläche, sondern an der Datenbank: unter der
Rolle einer Lehrkraft, mit bekannter Kurs- und Personenkennung, über die
Mitgliederliste hinweg und als Aggregat. Eine Zahl über jemanden ist auch eine
Auskunft.

---

## 3. Was gespeichert wird – vollständig

### 3.1 Im Portal (Supabase)

| Tabelle | Inhalt | Wer sieht es |
| --- | --- | --- |
| `profiles` | Anzeigename, Kurzkennung, Rolle | die Person selbst; Lehrkräfte die Namen ihrer Lerngruppe |
| `learner_accounts` | Lern-ID, **Hash** des Wiederherstellungscodes | niemand außer der Serverfunktion |
| `courses` | Titel, Beschreibung, Schuljahr, archiviert | Eigentümerin und Mitglieder |
| `course_members` | wer in welchem Kurs, mit welcher Rolle | Lehrkraft des Kurses und die Person selbst |
| `course_invites` | **Hash** des Codes, Kürzel, Ablauf, Nutzungszahl | Lehrkraft des Kurses |
| `packs`, `pack_drafts`, `pack_revisions` | Vokabelpakete | Eigentümerin; veröffentlichte Fassungen die zugewiesenen Kurse |
| `course_packs` | welche Fassung in welchem Kurs | Kursmitglieder |
| `pack_progress`, `entry_progress` | **der eigene Lernstand** | **nur die Person selbst** |
| `progress_events` | nur Ereigniskennungen, kein Inhalt | nur die Person selbst |
| `ai_connections` | Anbieter, Modell, **versiegelter** Schlüssel | die Lehrkraft – ohne die Siegelspalten |
| `ai_allowed_hosts` | freigegebene KI-Hosts | alle Angemeldeten (nichts Geheimes) |
| `auth_rate_limit` | Versuchszähler, gehashte Herkunft | niemand (keine Zugriffsregel, keine Rechte) |

### 3.2 Was ausdrücklich **nicht** gespeichert wird

- **Keine E-Mail-Adressen von Lernenden.** Sie melden sich mit einer Lern-ID an.
  Intern entsteht eine technische Adresse unter `.invalid` – einer Endung, die
  es im Netz nicht gibt.
- **Kein Protokoll der KI-Aufrufe.** Wer wann welchen Text an ein Modell
  geschickt hat, wäre eine Auswertung über Lehrkräfte.
- **Keine Dauer, keine Uhrzeit, keine Abbrüche** von Übungsrunden. Nur eine
  Zahl: „du warst schon 14-mal dran".
- **Keine IP-Adresse im Klartext.** Die Bremse kennt acht Hexziffern eines
  Hashes und speichert sie nirgends dauerhaft.
- **Keine Telemetrie, keine Werbung, kein externes Tracking.** Unverändert seit
  Sprint 1.

### 3.3 Zeitstempel kommen vom Server

Seit Phase 6b wird **kein Zeitstempel vom Gerät** gespeichert. Eine Geräteuhr
ist nicht überprüfbar; eine falsch gestellte hinterließe „zuletzt geübt: 2036".
Der Preis ist benannt: Eine Runde, die offline entstand, trägt den Zeitpunkt des
Hochladens.

---

## 4. Ohne Konto ändert sich nichts

`/LexiFlow/` bleibt, was es war: eine Anwendung ohne Konto, ohne Server, ohne
Übertragung. Der Lernstand liegt in IndexedDB und verlässt das Gerät nicht.

Die portablen Dateien ebenso. Am Bündel geprüft, nicht behauptet:

- keine Datei aus `src/hosted/` erreichbar
- kein Supabase-Client erreichbar
- kein `src/cloud/aiGateway.ts` erreichbar
- kein Code aus `supabase/functions/` in irgendeinem Browserbündel
- die kontrollierte Fälschung mit ihren Testkonten in keiner portablen Datei

Die Größen sind der zweite Beleg: Die Lernlaufzeit lag zu Sprintbeginn bei
674,6 KiB und liegt nach acht Phasen Cloudarbeit bei **674,7 KiB**. Die 0,1 KiB
sind benannt (`progressEvents.ts`, die eine Stelle, an der ein Ereignis
entsteht).

---

## 5. Anmeldung und Wiederherstellung

### 5.1 Lernende ohne E-Mail

Anmeldung mit Lern-ID und Kennwort über eine Serverfunktion. Ein Konto entsteht
**nur** mit einem gültigen Einladungscode – es gibt keinen Weg zu einem Konto
ohne Code, und die Oberfläche bietet auch keinen an.

**Der Wiederherstellungscode ist der einzige Weg zurück.** Geht er zusammen mit
dem Kennwort verloren, ist das Konto verloren. Das steht so auf der Seite, und
es ist eine bewusste Entscheidung: Die Alternative wäre, dass eine Lehrkraft
fremde Kennwörter setzen kann – und wer das kann, kann sich als diese Person
anmelden und ihren Lernstand sehen. Ein Test sucht deshalb nach jeder Funktion,
deren Name nach „Kennwort setzen" aussieht, und lässt nur begründete Ausnahmen
durch.

Der Code wird bei jeder Benutzung **gewechselt**. Ein Code, der nach dem
Einlösen weitergilt, ist ein zweiter Hauptschlüssel.

### 5.2 Eine Ablehnung sieht immer gleich aus

Unbekannte Lern-ID, falsches Kennwort, falscher Code, abgelaufene Einladung,
voller Kurs: derselbe Status, derselbe Rumpf. Jeder Unterschied wäre ein
Auskunftsdienst – wer Lern-IDs durchprobiert, erführe, welche es gibt, und in
einer Schule ist das eine Namensliste.

Die einzige Ausnahme ist die Bremse (429): „zu viele Versuche" sagt nichts über
die Existenz von irgendetwas.

### 5.3 Einladungscodes

Nur als **Hash** gespeichert. Sichtbar bleibt ein dreistelliges Kürzel – drei
Zeichen sind kein Code. Der Klartext wird genau einmal angezeigt, direkt nach
dem Erzeugen; danach gibt es ihn nicht mehr.

Ein Code erteilt **niemals** Lehrkraftrechte. Wer beitritt, tritt als lernende
Person bei – auch wenn die Einladung von einer Lehrkraft stammt. Das war in
Phase 2 anders und wurde in Phase 4 als Fehler korrigiert.

---

## 6. Der KI-Zugang

### 6.1 Zwei Wege, ohne Vermischung

| Gestalt | Weg | Wer hat den Schlüssel |
| --- | --- | --- |
| portable Lehrkraftdatei | direkt aus dem Browser | die Lehrkraft, auf ihrem Gerät |
| Portal | ausschließlich über die Serverfunktion | der Server – der Browser sieht ihn nie |

Ein Browser, der je nach Zustand mal direkt und mal über den Server geht, hätte
zwei Sicherheitsmodelle und keine prüfbare Zusage.

### 6.2 Der Schlüssel

AES-GCM aus WebCrypto. 96-Bit-Zufall je Verschlüsselung; mitversiegelt sind
Schlüsselfassung, Eigentümerin, Verbindung und Anbieter – ein Chiffretext lässt
sich damit nicht in eine fremde Zeile kopieren und nicht auf einen anderen
Anbieter umhängen.

**Der eigentliche Riegel ist ein Spaltenrecht.** Die drei Siegelspalten sind für
angemeldete Rollen nicht lesbar – auch nicht über eine selbst formulierte
Abfrage, auch nicht für die Verwaltung, auch nicht über `select *`. Das ist der
Unterschied zwischen „die Anwendung zeigt es nicht an" und „es wird nicht
herausgegeben".

### 6.3 Wohin gesendet werden darf

Offizielle Anbieter stehen fest im Quelltext. Eigene Adressen nur über eine
Liste, die eine **Verwaltung** pflegt – kein Feld im Formular. Dazu: nur HTTPS,
nur Port 443, keine Zugangsdaten im URL, kein IP-Literal in irgendeiner
Schreibweise, keine Weiterleitung, keine Kopfzeilen von außen, Größengrenzen in
beide Richtungen.

### 6.4 DNS-Rebinding: nicht gelöst

Ein freigegebener Name kann auf `127.0.0.1` zeigen. Dagegen hülfe nur eigene
Namensauflösung samt Bindung der Verbindung an die geprüfte Adresse, und eine
Edge-Laufzeit gibt das nicht her.

**Das wird nicht weggeredet.** Eingegrenzt ist es allein dadurch, dass eigene
Hosts ausschließlich über die administrative Freigabeliste erreichbar sind: Wer
einen Namen freigibt, gibt seine Auflösung mit frei.

### 6.5 Was ein Modell zu sehen bekommt

Wörter und Beispielsätze. Keine Namen, keine Lernstände, nichts aus dem
Lernbereich – unabhängig vom Anbieter. Der Serverfunktion fehlt für Lernstände
schlicht der Port.

---

## 7. Wodurch das abgesichert ist

| Art | Umfang | Was sie belegt |
| --- | --- | --- |
| PGlite (PostgreSQL 17.5) | 109 | Schema, Constraints, Transaktionen, Trigger, Zugriffsregeln in simulierten Rollenfällen |
| Repository-Verträge | je zweimal | Kurse 2 × 25, Pakete 2 × 21, Lernstand 2 × 35 – einmal Fälschung, einmal echtes PostgreSQL |
| Serverfunktionen | 160 | `learner-auth` 37, `ai-gateway` 123 (Adressprüfung 53, Tresor 29, Abläufe 41) |
| Oberfläche | der Rest von 2830 | einschließlich der Sätze, die eine Zusage tragen |
| Ende-zu-Ende | 159 + 29 + 31 | kontofrei, portabel, Portal unter dem Unterpfad |
| Größenwacht | 32 | dass Cloudcode nicht in portable Dateien wandert |

**Was PGlite nicht belegt:** GoTrue, PostgREST, die Edge-Laufzeiten. Die Regeln
sind geprüft, die Plattform darunter ist nachgebaut. Dieser Satz gehört in jeden
Bericht.

**Gegenproben.** Mehrfach wurde eine Prüfung mutwillig gebrochen, um zu sehen,
ob sie etwas prüft: Entfernt man den Fassungsriegel, fallen fünf Prüfungen um;
ersetzt man ihn durch „der bessere Stand gewinnt", fünf andere; nimmt man die
zweite Adressprüfung heraus, genau die eine, die sie beschreibt.

---

## 8. Was eine datenschutzrechtliche Prüfung von hier mitnehmen kann

**Mitnehmbar:**

- die vollständige Liste dessen, was gespeichert wird (Abschnitt 3) – sie ist
  aus dem Schema abgeleitet, nicht aus der Erinnerung
- die Zusage, dass Lernstände niemandem außer der Person selbst zugänglich sind,
  samt der Stellen, an denen das geprüft wird
- dass Lernende keine E-Mail-Adresse angeben
- dass nichts an Dritte geht, solange keine Lehrkraft einen KI-Zugang einrichtet
- dass die kontofreie Anwendung und die portablen Dateien ohne jede Übertragung
  auskommen

**Nicht von hier zu beziehen:**

- ob der Auftragsverarbeitungsvertrag mit dem Hoster trägt
- ob die Region allein genügt – sie ist kein Nachweis
- wie lange Backups des Hosters Gelöschtes noch enthalten
- ob die Schule eine Rechtsgrundlage für den Kontobetrieb hat
- ob Eltern und Lernende ausreichend informiert sind

Die zweite Liste ist nicht kürzer als die erste, und das ist der Punkt: Software
kann die halbe Arbeit machen. Die andere Hälfte ist organisatorisch.

---

## 9. Bekannte Risiken

| Risiko | Stand |
| --- | --- |
| Kennwort **und** Wiederherstellungscode verloren → Konto verloren | bewusst; steht so auf der Seite |
| DNS-Rebinding bei eigenen KI-Hosts | nicht gelöst, eingegrenzt durch die Freigabeliste |
| Der Hauptschlüssel liegt in den Function Secrets | wer sie liest, liest alle Anbieterschlüssel – die Grenze jeder serverseitigen Verschlüsselung |
| Der eigene Lernstand lässt sich beschönigen | bewusst; die Alternative wären zwei Leitner-Rechnungen, die auseinanderlaufen |
| Eine offline entstandene Runde trägt den Zeitpunkt des Hochladens | bewusst; ein Zeitstempel vom Gerät ist nicht überprüfbar |
| Backups des Hosters löschen nicht sofort mit | zu dokumentieren, nicht zu behaupten |
| Was in Abschnitt 1 unter „weiterhin nie gelaufen" steht | ungeprüft, und zwar benannt |

---

## 10. Der kürzeste Satz

Wer LexiFlow ohne Konto benutzt, überträgt nichts. Wer es mit Konto benutzt,
überträgt seinen eigenen Lernstand an einen Server, auf dem ihn niemand sonst
lesen kann – und das ist geprüft, aber noch nie im Betrieb gewesen.
