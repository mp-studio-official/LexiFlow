# Sprint 5A – Cloud Portal Foundation

**Zweck dieses Dokuments.** Es ist der Faden, an dem sich die Arbeit
fortsetzen lässt, wenn der Gesprächsverlauf abreißt. Es enthält den
Ausgangsstand, jede Entscheidung mit Begründung, das Schema, die
Zugriffsregeln, die offenen Risiken und – ganz am Ende – den Punkt, an dem
weiterzumachen ist.

Wer hier weiterliest, um weiterzuarbeiten, springt zuerst nach
**§ 9 Fortsetzungsstand**.

---

## 1. Ausgangslage (Phase 0)

### 1.1 Git

| | |
| --- | --- |
| Ausgangsbranch | `sprint/4d-direktheit` |
| Ausgangscommit | `3aec721` – „Das Beispielpaket muss auch eine Lerndatei ergeben" |
| `main` | `20d5338` – unverändert, wird in diesem Sprint nicht angefasst |
| Arbeitsbranch | `sprint/5a-cloud-portal-foundation`, abgezweigt von `3aec721` |
| Arbeitsverzeichnis beim Start | sauber |
| Remote | keiner |
| Historie | 75 Commits; `sprint/4c-optional-gemini-assistant` (`e7a13ff`) liegt in der Historie von HEAD |

`AGENTS.md` existiert in diesem Projekt **nicht**. Die Projektanweisungen
stehen in `README.md` (2970 Zeilen) sowie in `docs/`.

### 1.2 Ausgangsmessung – alles grün

Vollständig ausgeführt am 13.09.2026, vor jeder Änderung:

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | fehlerfrei |
| `npx vitest run` | **2114** Tests in **125** Dateien, alle grün |
| `npm run build` | erfolgreich |
| `npm run build:portable` | erfolgreich |
| `npm run verify:portable` | **32** Prüfungen, alle grün |
| `npx playwright test` | **159** E2E, alle grün |
| `npx playwright test --config playwright.portable.config.ts` | **29** Portable-E2E, alle grün |

### 1.3 Größen zum Vergleich

| Artefakt | Größe |
| --- | --- |
| `LexiFlow-Lehrkraft.html` | **9482,1 KiB** (Schranke 12 MiB) |
| `LexiFlow-Lernlaufzeit.html` | **674,6 KiB** (Schranke 1024 KiB) |
| `dist/assets/index-*.js` | 441,53 kB (gzip 140,07 kB) |
| `dist/assets/dictionary-*.js` | 6351,45 kB (gzip 4783,56 kB) |
| `dist/assets/pdf.worker-*.js` | 1350,31 kB (gzip 416,20 kB) |

Diese Zahlen sind der Maßstab für § 8: Die **Lernlaufzeit darf durch diesen
Sprint nicht wachsen.**

### 1.4 Wo die Anwendung heute ins Netz geht

Genau **eine** Stelle: `createFetchTransport` in `src/ai/gemini/transport.ts`.
Sie ruft ein injiziertes `fetchImpl` auf; alles andere im Projekt ruft nie
`fetch`. Das ist der Ankerpunkt, an dem sich die Behauptung „ohne Gemini geht
nichts hinaus" überhaupt prüfen lässt, und sie bleibt in Sprint 5A gültig.

Tatsächlich verdrahtete Fähigkeiten (Aufrufer → Fähigkeit):

| Aufrufer | Fähigkeit |
| --- | --- |
| `ai/gemini/ui/GeminiTranslations.tsx` | `translateEntry` |
| `routes/teacher/SentenceAssistant.tsx` | `suggestSentences` |
| `routes/teacher/TextCandidateReview.tsx` | `suggestFromText` |
| `routes/teacher/AssistantSettingsPage.tsx` | `testConnection` |
| `routes/teacher/EnrichmentPanel.tsx` | `enrichEntry` (über `AiProvider`) |
| `routes/teacher/TopicStudio.tsx` | `suggestFromTopic` (über `AiProvider`) |
| `routes/teacher/TextRecommendationPanel.tsx` | `suggestFromText` – **außer Dienst**, kein Aufrufer rendert die Ansicht |

### 1.5 Was wiederverwendet wird

Ohne Änderung übernehmbar, weil frei von React und Persistenz:

- `domain/schema.ts` (Zod, Paketformat), `domain/migrations.ts` (Formatkette)
- `domain/leitner.ts`, `domain/exercises.ts`, `domain/session.ts`,
  `domain/answerCheck.ts`, `domain/normalize.ts`, `domain/dueDate.ts`
- `domain/packDiff.ts` – **der Fingerprint lernrelevanter Felder ist der
  Schlüssel für § 5:** Er entscheidet beim Revisionswechsel, ob ein Lernstand
  bestehen bleibt.
- `domain/learningArea.ts`, `domain/spring.ts`, `domain/swipe.ts`
- die gesamte `import/`-Pipeline
- `ai/gemini/*` – Endpunkt, Schemata, Anfragebau, Fehlerbehandlung, Herkunft

Anzupassen, aber im Kern wiederverwendbar:

- `data/packRepo.ts` und `data/progressRepo.ts` werden zu **Implementierungen**
  von Schnittstellen, statt selbst die Schnittstelle zu sein.

### 1.6 Secret-Scan

Gesucht wurde nach Google-, OpenAI- und Anthropic-Schlüsseln, Supabase-JWTs,
Supabase-Projekt-URLs und privaten Schlüsseln – im Arbeitsbaum und über **alle
75 Commits** der Historie.

**Ergebnis: keine Fundstelle.** Gefundene Werte würden hier ohnehin nicht
stehen; es gibt keine.

Vor der Suche werden Base64-Blöcke ab 200 Zeichen entfernt: Die
Lehrkraftdatei trägt sechs Megabyte Wörterbuch, und in so viel Zeichenrauschen
kommt jedes Muster irgendwann zufällig vor (siehe `scripts/verify-portable.mjs`,
wo derselbe Fehlalarm schon einmal auftrat).

### 1.7 Umgebung

| | |
| --- | --- |
| Node | v22.22.2 |
| Docker-CLI | vorhanden (29.4.3) |
| Docker-**Daemon** | **nicht erreichbar** – `/var/run/docker.sock` fehlt |
| Supabase-CLI | nicht installiert, ohne Daemon auch nicht nutzbar |
| Deno | nicht vorhanden |

Daraus folgt ADR-6.

---

## 2. Architekturentscheidungen (ADR)

### ADR-1 – Drei benannte Laufzeitmodi statt verstreuter Abfragen

**Entscheidung.** `portable-teacher`, `portable-learner`, `hosted`. Eine
Funktion ermittelt den Modus einmal beim Start; alles Weitere liest ihn aus
einer Konfiguration.

**Warum.** Die Alternative – an jeder Stelle `if (import.meta.env.VITE_...)` –
verteilt eine Grundsatzentscheidung über hundert Dateien und macht die Zusage
„die Lerndatei enthält keinen Cloudcode" unprüfbar. Mit einem benannten Modus
lässt sich am Bündel messen, was drin ist.

**Folge.** `portable/`-Einstiegspunkte setzen den Modus fest; der
Hosted-Einstiegspunkt ist ein eigener. Ein Artefakttest prüft, dass die
Lernlaufzeit weder Supabase-Code noch Cloudrouten enthält.

> **Ergänzt in Phase 3 (ADR-10).** Es sind **vier** Modi geworden: Mit der
> zweiten Web-Auslieferung braucht die kontofreie PWA einen eigenen Namen
> (`web-solo`). Wichtiger als die Zahl ist die Richtung: Ohne gesetzte Fahne
> ist das Ergebnis jetzt der engste Web-Fall und nicht mehr `hosted`.

### ADR-2 – Repository-Schnittstellen mit Injektion

**Entscheidung.** Neun Verträge (`AuthRepository`, `ProfileRepository`,
`CourseRepository`, `InvitationRepository`, `PackRepository`,
`PublicationRepository`, `ProgressRepository`, `AccountRepository`,
`AiGateway`). Komponenten erhalten sie über einen Context, nie durch direkten
Import eines Supabase-Clients.

**Warum.** Drei Gründe, und der dritte ist der wichtigste: Testbarkeit ohne
Netz; Austauschbarkeit lokal/Cloud; und die Möglichkeit, im Portable-Modus
*gar keine* Cloudimplementierung zu laden, weil sie nirgends importiert wird.

**Folge.** Die bestehenden `packRepo`/`progressRepo` bleiben als lokale
Implementierung erhalten und funktionieren unverändert weiter.

### ADR-3 – Supabase, EU-Region, nur zwei öffentliche Werte

**Entscheidung.** Supabase als Backend, Projekt in `eu-central-1`. Ins
gehostete Frontend gelangen ausschließlich Projekt-URL und Publishable Key.
Secret Key und Service Role existieren nur in Function Secrets.

**Warum.** Ein Publishable Key ist kein Geheimnis – die Sicherheit liegt
vollständig in RLS. Genau deshalb ist RLS in § 4 kein Beiwerk, sondern die
eigentliche Sicherheitsarchitektur.

**Grenze.** Eine EU-Region ist ein Baustein und **kein** Datenschutznachweis.
Siehe § 7.

### ADR-4 – Pakete: stabile Identität, unveränderliche Revisionen

**Entscheidung.** `packs` trägt die Identität. Bearbeitung erzeugt einen
Entwurf. Veröffentlichung friert eine `pack_revisions`-Zeile ein. Kurse zeigen
auf eine konkrete Revision. Das vollständige, mit Zod validierte Paket liegt
als versioniertes JSONB in der Revision; Metadaten werden zusätzlich in Spalten
geführt, soweit sie gefiltert werden.

**Warum JSONB.** Die bestehende Zod- und Migrationslogik ist die Wahrheit über
das Paketformat und hat eine eigene Versionskette. Sie in Tabellenspalten zu
zerlegen hieße, dieselbe Wahrheit zweimal zu pflegen – und die SQL-Kopie würde
als Erste veralten.

**Folge.** Kein halbfertiger Entwurf ist je für Lernende sichtbar; alte
Revisionen bleiben lesbar.

### ADR-5 – Lernende ohne E-Mail-Adresse

**Entscheidung.** Anmeldung über **Lern-ID + Passwort**. Falls Supabase Auth
intern eine E-Mail-Adresse braucht, bildet ausschließlich die Edge Function
eine synthetische Adresse aus der Lern-ID. Sie erscheint nie in der
Oberfläche, wird nie als Kontaktadresse behandelt und steht im Dateninventar.

**Warum.** Eine Klasse siebter Jahrgangsstufe hat keine verlässlichen privaten
Adressen, und sie zu verlangen verschiebt ein Datenschutzproblem in die
Elternhäuser.

**Risiko.** Ein Passwort ohne Rückkanal ist nicht wiederherstellbar. Deshalb
der einmalige Wiederherstellungscode – und deshalb muss er beim Anlegen
**bestätigt** werden.

### ADR-6 – RLS-Tests gegen echtes Postgres per PGlite, nicht per Docker

**Entscheidung.** Die Zugriffsregeln werden mit
`@electric-sql/pglite` (Apache-2.0, reine Entwicklungsabhängigkeit) gegen
**PostgreSQL 17.5** geprüft, das als WebAssembly im Node-Prozess läuft.

**Warum.** Der Docker-Daemon ist in dieser Umgebung nicht erreichbar, die
Supabase-CLI damit nicht nutzbar. Die Alternative wäre gewesen, RLS-Tests nur
*vorzubereiten*. Geprüft wurde vorab, dass PGlite genau das kann, worauf es
ankommt: Rollenwechsel, `set role`, Policies je Operation, `auth.uid()` als
Shim – und es verhält sich dabei wie Postgres, weil es Postgres **ist**.

**Was damit ausdrücklich nicht geprüft ist.** GoTrue (die echte Anmeldung),
echte JWT-Claims, PostgREST (das API-Gateway), die Edge-Function-Laufzeit,
E-Mail-Versand, Supabase-eigene Rollen und Erweiterungen, das Deployment. Die
Policies sind echt geprüft – in **simulierten** Rollenfällen; die Plattform
darunter ist nachgebildet. § 7.1 führt beide Seiten vollständig auf, und diese
Unterscheidung gehört in jeden Bericht.

### ADR-7 – Der Hosted-Modus ist im ersten Wurf online-only

**Entscheidung.** Keine Offline-Warteschlange für Lernstände im Portal.

**Warum.** Eine halbe Synchronisation ist schlimmer als keine: Sie erzeugt
Vertrauen in gespeicherte Ergebnisse, die nie ankamen. Der verlässliche
Offline-Weg bleibt die portable Datei, und die funktioniert weiterhin ohne
jedes Backend.

### ADR-8 – Zwei Transportwege für KI, ohne Vermischung

**Entscheidung.** Im Hosted-Modus gehen KI-Anfragen ausschließlich über eine
Edge Function; der Browser sieht nie einen Anbieterschlüssel. Die portable
Lehrkraftdatei behält den bestehenden direkten Weg mit eigenem Schlüssel, weil
sie kein Backend hat.

**Warum.** Beides ist für seine Lage richtig. Falsch wäre, sie zu vermischen:
ein Browser, der je nach Zustand mal direkt und mal über den Server geht, hat
zwei Sicherheitsmodelle und keine prüfbare Zusage.

### ADR-9 – Freigabeliste statt freier URL

**Entscheidung.** Benutzerdefinierte KI-Endpunkte nur über eine administrativ
gepflegte Hostliste, nur HTTPS, ohne Weiterleitungen, mit Port- und
Größengrenzen.

**Warum.** Ein Server, der auf Zuruf beliebige URLs abruft, ist ein offener
Proxy im eigenen Netz (SSRF). Dieselbe Begründung steht seit Sprint 4C in
`src/ai/gemini/endpoint.ts` – dort für den Browser, hier für den Server, wo
sie schwerer wiegt.

**Ehrliche Grenze.** DNS-Rebinding lässt sich in einer Edge-Laufzeit ohne
eigene Namensauflösung nicht vollständig ausschließen. Das steht in § 7 und
wird nicht weggeredet.

### ADR-12 – Archiviert heißt abgeschlossen, nicht geschlossen

**Entscheidung.** Ein archivierter Kurs bleibt für seine Mitglieder sichtbar
und **lernbar**: Die Pakete bleiben da, es wird weiter geübt, der Lernstand
wird weiter gespeichert. Was endet, ist die organisatorische Arbeit am Kurs –
keine neuen Mitglieder, keine neuen Zuweisungen, keine Änderungen am Kurs
selbst. Wieder öffnen ist jederzeit möglich und hebt alles davon auf.

**Zugriff entziehen ist eine andere Handlung.** Die Mitgliedschaft entfernen –
oder später ein eigener Zustand „Lernzugriff beendet". Das Archivieren dafür zu
benutzen hieße, zwei Dinge in einen Knopf zu legen, von denen das eine
harmlos und das andere endgültig ist.

**Warum.** Ein Halbjahr endet, das Lernen nicht. Wer im Sommer die Vokabeln aus
dem Frühjahr wiederholt, soll seinen Lernstand behalten. Die Gegenrichtung wäre
schlimmer als unbequem: Auf der Kursseite einer lernenden Person stünde „Du
kannst weiter üben", und der Server lehnte still ab.

**Wo das steht.**

| Ort | Was |
| --- | --- |
| `app_check_progress_events` | prüft Mitgliedschaft, Zuweisung und Fassung – **nicht** `archived` |
| Trigger `courses_archived_closed` | lässt an einem archivierten Kurs nur noch `archived` selbst ändern |
| `redeem_invite`, `assign_pack_to_course` | lehnen bei `archived` ab (seit Phase 4 und 5) |
| Kursvertrag, Lernstandsvertrag | je zweimal abgenommen, Fälschung und PostgreSQL |
| `rls.test.mjs` | „schreibt auch in einem archivierten Kurs weiter" und „aber nicht mehr ohne Mitgliedschaft" |
| Oberfläche | „Dieser Kurs ist abgeschlossen … der Lernstand läuft mit" – bei Lehrkraft und Lerngruppe |

### ADR-10 – Zwei Web-Auslieferungen statt einer Weiche

**Entscheidung.** `/LexiFlow/` bleibt die kontofreie PWA, unverändert.
`/LexiFlow/portal/` ist eine **zweite** Auslieferung aus demselben Quellbaum,
mit eigener Vite-Konfiguration, eigenem Einstiegspunkt und eigenem Bündel.

**Warum keine Weiche zur Laufzeit.** „Ist jemand angemeldet? Dann Portal“ sieht
bequemer aus und hat einen Preis, den man erst später sieht: Beide Zweige lägen
in einem Bündel. Die Zusage „diese Auslieferung hat kein Backend“ hinge an einer
Bedingung statt an einem Import – und wäre nicht mehr am Bündel prüfbar.

**Warum keine zwei Einträge in einer Konfiguration.** `define` gilt je Build,
nicht je Einstiegspunkt. Zwei Seiten in einer Konfiguration bekämen dieselben
Fahnen, und die ganze Trennung hinge wieder an einer Laufzeitabfrage.

**Folge.** Ein vierter Laufzeitmodus, `web-solo`. Und eine Korrektur: Bis
Phase 2 galt „kein Flag gesetzt“ als `hosted` – der Standard eines Web-Builds
wäre damit der einzige Modus mit Backend gewesen. Jetzt ist der Standard der
engste Fall.

**Grenze.** Zwei Adressen muss man erklären. `/LexiFlow/` kann später eine
gemeinsame Einstiegsseite werden; das ist nicht Teil dieses Sprints.

### ADR-11 – Wiederherstellung für Lernende ohne Lehrkraft

**Entscheidung.** Lernende stellen ihr Konto mit einem **eigenen**
Wiederherstellungscode wieder her. Es gibt keinen Weg, auf dem eine Lehrkraft,
die Verwaltung oder sonst jemand ein fremdes Kennwort setzt.

**Warum.** Der naheliegende Entwurf – die Lehrkraft vergibt ein neues Kennwort –
ist bequem und hebt die zentrale Zusage dieses Produkts auf. Wer ein fremdes
Kennwort setzen kann, kann sich als diese Person anmelden; für die Datenbank
**ist** er sie und sieht ihren Lernstand. Sämtliche Zugriffsregeln aus Phase 2
wären mit einem Klick umgangen, und niemand würde es bemerken.

**Preis, offen genannt.** Wer Kennwort **und** Code verliert, verliert das
Konto samt Lernstand. Das steht so auch auf der Wiederherstellungsseite. Die
Lehrkraft kann ein neues Konto anlegen; der alte Stand ist dann fort.

**Einmalnutzung mit Austausch (berichtigt in Phase 4).** Die erste Fassung
dieser Entscheidung lautete: Der Code bleibt nach Gebrauch gültig, damit
niemand beim zweiten Vergessen ausgesperrt ist. Das war die richtige Sorge und
die falsche Antwort – ein Code, der nach einer Wiederherstellung weitergilt,
ist ein zweiter Schlüssel, der irgendwo herumliegt.

Jetzt wird er **ausgetauscht**: Der gebrauchte ist sofort wertlos, und im
selben Schritt entsteht ein neuer, der einmal angezeigt wird. Damit ist er
einmalig, ohne dass jemand ohne Code dasteht.

**Bestätigen ist Pflicht.** Beim Anlegen wird der Code nicht abgehakt, sondern
**abgeschrieben**: Ein Häkchen „habe ich notiert" setzt man in zwei Sekunden,
ohne etwas notiert zu haben. Erst die richtige Abschrift schaltet weiter
(`confirm_recovery_code`).

---

## 2b. Der Aufbau nach Phase 1

Neue Dateien, und was jede von ihnen trägt:

| Datei | Rolle |
| --- | --- |
| `src/runtime/mode.ts` | Die drei Modi, aus zwei `define`-Fahnen abgeleitet |
| `src/runtime/hostedConfig.ts` | Die zwei öffentlichen Werte; fehlende Konfiguration als Zustand, nicht als Absturz |
| `src/runtime/access.ts` | Rollen, Bereiche, `mayEnter` – eine Regel an einer Stelle |
| `src/application/repositories.ts` | Die neun Verträge |
| `src/application/RepositoryContext.tsx` | Injektion; `useRepository` wirft mit Modusnamen |
| `src/application/localRepositories.ts` | Die Verträge über IndexedDB – Standard in portablen Dateien |
| `src/application/fakeCloudRepositories.ts` | Kontrollierte Fassung für Phase 1, rein im Arbeitsspeicher |
| `src/hosted/HostedApp.tsx` | Das Portal: öffentliche Routen, zwei Shells, Code-Split |
| `src/hosted/SessionContext.tsx` | Sitzungszustand mit drei Werten (`laedt` ist der wichtige) |
| `src/hosted/RequireArea.tsx` | Der Riegel – Oberflächengrenze, **keine** Sicherheitsgrenze |
| `src/hosted/PortalShell.tsx` | `LearnerShell` und `TeacherShell` |
| `src/hosted/teacher/TeacherArea.tsx` | Der Ankerpunkt des Lehrkraftbündels |
| `src/hosted/learner/LearnerArea.tsx` | Kursliste gegen die Verträge |

### Die zweite Bauzeit-Fahne

`__LEXIFLOW_LEARNER__` kam hinzu. `__LEXIFLOW_PORTABLE__` bedeutet seit
Sprint 3 „dieser Build trägt die Lernlaufzeit als Zeichenkette bei sich“ – in
der Lerndatei ist das gerade nicht der Fall, sie *ist* die Laufzeit. Deshalb
setzt `vite.student.config.ts` nur die neue Fahne, und `resolveRuntimeMode`
prüft sie zuerst: Ein Build, der beide setzte, ergäbe die **engere** Gestalt.

### Was Phase 1 **nicht** getan hat

`src/main.tsx` rendert weiterhin `App`. Das Portal ist gebaut und geprüft,
aber nicht verdrahtet – ein Portal ohne Datenbank (Phase 2) und ohne Anmeldung
(Phase 3) wäre eine Umleitung ins Leere. Der Wechsel gehört in Phase 3.

Ebenso unangetastet: die bestehenden Lernseiten. Sie rufen `packRepo` und
`progressRepo` weiterhin direkt auf. Sie an die Verträge zu hängen gehört in
Phase 6, wo der geräteübergreifende Lernstand dazukommt.

> **Nachtrag aus Phase 6.** So ist es nicht gekommen, und das ist eine
> bewusste Abweichung: Die bestehenden Lernseiten blieben, wo sie waren.
> Begründung in § 5.5.9.

### Die Prüfungen aus Phase 1

| Zusage | Wo sie geprüft wird |
| --- | --- |
| Portabler Modus erzeugt nie einen Supabase-Client | `src/runtime/portableIsolation.test.ts` – Importgraph ab beiden Einstiegen |
| Lerndatei kann keine Lehrkraftroute rendern | `src/StudentApp.test.tsx` (Verhalten) + Importgraph (Abwesenheit) |
| Keine Oberfläche zeigt fremde Lernstände | `src/application/repositories.test.ts` (Vertrag) + `src/hosted/HostedApp.test.tsx` (Seiten) |
| Fehlende Hosted-Konfiguration wird verständlich behandelt | `src/runtime/hostedConfig.test.ts`, `HostedApp.test.tsx` |
| Bestehende portable E2E bleiben grün | 29 Portable-E2E, unverändert |

Der Importgraph-Test hat eine eigene Wache: eine frühere Fassung seines
regulären Ausdrucks verschluckte ab einem `import` **in einer Zeichenkette**
den halben Dateirest und legte den Unsinn als „Paket“ ab – die Prüfungen
darunter blieben grün, weil Unsinn kein `supabase` enthält. Seitdem prüft ein
eigener Test die Plausibilität der gesammelten Paketnamen.

---

## 2c. Die zwei Web-Adressen (Phase 3)

| Adresse | Was dort liegt | Modus | Backend |
| --- | --- | --- | --- |
| `https://mp-studio-official.github.io/LexiFlow/` | die kontofreie PWA, unverändert | `web-solo` | keines |
| `https://mp-studio-official.github.io/LexiFlow/portal/` | das Portal mit Anmeldung | `hosted` | Supabase |

Dazu unverändert die beiden Dateien: `LexiFlow-Lehrkraft.html` und jede
Lerndatei. Sie hängen an **keiner** der beiden Web-Adressen.

### Der Unterpfad ist die Fehlerquelle

Auf GitHub Pages liegt alles unter `/LexiFlow/`. Ein fest geschriebenes
`/portal/` funktioniert lokal tadellos und führt nach dem Deployment ins Leere –
dieser Fehler fällt nie beim Entwickeln auf, sondern bei allen gleichzeitig.

Deshalb steht im Quelltext nirgends ein fester Pfad. Alles leitet sich aus
`import.meta.env.BASE_URL` ab (`src/runtime/entryUrls.ts`), und die
Portalsuite läuft ausschließlich unter `/LexiFlow/`.

### Wie die Ausgabe entsteht

Die Quelldatei heißt `portal.html` und liegt im Projektstamm neben
`index.html` und `student.html`. Ausgeliefert wird sie als
`dist/portal/index.html` – nur dann öffnet `…/portal/` sie ohne Dateinamen in
der Adresse. Umbenannt wird in `closeBundle`, also auf der Platte: Der erste
Versuch tat es im Bündel und erzeugte gar keine Datei, weil Rolldown den Namen
zu dem Zeitpunkt bereits festgeschrieben hatte.

### Der Service Worker lässt das Portal in Ruhe

Beide Auslieferungen teilen sich einen Ursprung, und der Service Worker der PWA
wäre damit für das Portal zuständig. Ohne Gegenmaßnahme bekäme jemand, der
`…/portal/` aufruft, die zwischengespeicherte Startseite der kontofreien
Anwendung – besonders zuverlässig dann, wenn die PWA installiert ist. Zwei
Zeilen in `vite.config.ts` verhindern das: `globIgnores: ['portal/**']` und
`navigateFallbackDenylist`.

Die zugehörige Ende-zu-Ende-Prüfung ist eine der wenigen, die tatsächlich
etwas Unsichtbares festhält – und sie wurde gegengeprüft: Ohne die
Ausnahmeliste schlägt sie fehl.

### Anmeldung

| Wer | Womit | Weg |
| --- | --- | --- |
| Lehrkraft, Verwaltung | E-Mail + Kennwort | Supabase Auth direkt |
| Lernende | Lern-ID + Kennwort | über die Serverfunktion `learner-auth` |

Die technische Adresse hinter einer Lern-ID bildet **ausschließlich** die
Serverfunktion (ADR-5). Stünde die Bildungsregel im Bündel, könnte jede Person
sie für jede Lern-ID nachrechnen. Ein Test prüft, dass in keiner ausgehenden
Anfrage ein `@` steht.

### PKCE, nicht impliziter Ablauf

Das Portal benutzt `HashRouter` und trägt seine Route hinter `#`. Ein
Anmeldeablauf, der seine Antwort ebenfalls hinter `#` zurückgibt, überschriebe
genau diesen Teil: Die Anwendung landete auf einer unbekannten Seite, und das
Zugangstoken stünde in Adresszeile, Verlauf und jedem geteilten Screenshot.

PKCE antwortet mit `?code=…` im Abfrageteil. Der verträgt sich mit einer Route
hinter der Raute. Nach dem Eintausch räumt die Seite den verbrauchten Code aus
der Adresszeile – auch das wird unter `/LexiFlow/` geprüft.

### Was Phase 3 an der Cloudseite fertig hat

`auth` und `profile` laufen gegen Supabase. `courses`, `invitations`, `packs`,
`publication`, `progress`, `account` und `ai` sind **nicht vorhanden** – die
Oberfläche fragt mit `useOptionalRepository` und sagt ehrlich, dass es sie in
dieser Fassung noch nicht gibt, statt einen Knopf anzubieten, der abstürzt.

### Die Testfassung ohne Server

`VITE_LEXIFLOW_FAKE_CLOUD=1` baut das Portal gegen die kontrollierte Fälschung.
Nur so lässt sich die Anmeldung wirklich durchspielen, ohne dass je eine
Anfrage hinausgeht – es gibt in diesem Sprint kein Supabase-Projekt.

Die Bedingung dafür, dass es diese Fahne gibt: Eine so gebaute Auslieferung
trägt auf **jeder** Seite ein rotes Band mit dem Satz „Testfassung ohne Server:
erfundene Konten, nichts wird gespeichert.“ Ein Test hält das fest.

---

## 2d. Kurse, Mitgliedschaft und Einladungen (Phase 4)

### 2d.1 Zwei Erfüllungen, eine Prüfung

Der Kursablauf wird **zweimal** abgenommen, mit demselben Test:

| Erfüllung | Wo | Was das belegt |
| --- | --- | --- |
| kontrollierte Fälschung | `application/fakeCloud.contract.test.ts` | dass die Verträge in sich stimmen – in Millisekunden, deshalb beim Bauen der Oberfläche ständig dabei |
| SQL gegen PGlite | `cloud/courseRepositories.pglite.test.ts` | dass Schema, Bedingungen, Transaktionen und Zugriffsregeln dasselbe tun |

Der gemeinsame Ablauf steht in `src/application/courseContract.ts`. Das ist die
Antwort auf eine berechtigte Frage: Eine Fälschung beweist, dass die
Oberfläche zu einer Map passt – nicht, dass sie zu einer Datenbank passt.
Weicht eine der beiden ab, fällt es beim Ausführen auf und nicht beim
Umstellen.

An zwei Stellen antworten beide **verschieden**, und beide zu Recht: Die
Fälschung wirft „nur Lehrkräfte dieses Kurses", die Datenbank gibt still nur
die eigene Zeile heraus. Das Zweite ist das bessere – ein „Zugriff verweigert"
verriete, dass es da etwas gibt. Der Vertrag prüft deshalb das Ergebnis und
nicht die Form der Absage.

### 2d.2 Die Abläufe liegen in SQL

`create_course`, `create_course_invite`, `consume_invite_by_hash`,
`release_invite_by_hash`, `redeem_invite`. Nicht aus Vorliebe für SQL, sondern
weil zwei Dinge anders nicht richtig zu bekommen sind:

**Der Code entsteht in der Datenbank.** Sein Klartext verlässt die Funktion
genau einmal – als Rückgabewert. Entstünde er im Browser, müsste der Browser
den Hash bilden, und wer den Hash bildet, kann auch etwas anderes
hineinschreiben.

**Die Höchstzahl ist atomar.** „Erst zählen, dann hochsetzen" ist zwischen zwei
gleichzeitigen Beitritten eine Lücke: Beide lesen 4 von 5, beide schreiben 5,
zwei Personen sitzen auf einem Platz. Prüfung und Hochzählen stehen deshalb im
`where` **derselben** `update`-Anweisung.

> **Ehrliche Grenze.** PGlite hat genau eine Verbindung; echte Gleichzeitigkeit
> ist damit nicht herstellbar. Geprüft ist deshalb beides: der Ablauf
> nacheinander (auf `max_uses = 1` kommt genau einer durch) **und** die Form
> der Anweisung selbst – ein Test liest `prosrc` und hält fest, dass die
> Bedingung im `update` steht und kein `select … into` davor.

### 2d.3 Ein Code erteilt niemals Lehrkraftrechte

In Phase 2 übernahm der Beitritt die globale Rolle der beitretenden Person.
Eine Lehrkraft, die einen Code einlöste, wäre damit Lehrkraft *dieses* Kurses
geworden – mit Mitgliederliste und Einladungen. Ein Code wird vorgelesen und
weitergegeben; er hätte Rechte verteilt, die niemand vergeben wollte.

Jetzt ist die Mitgliedschaft aus einem Code **immer** `student`. Weitere
Lehrkräfte trägt die Kursleitung ausdrücklich ein – das Datenmodell sieht
mehrere je Kurs vor, und der Vertrag prüft es.

### 2d.4 Archivierte Kurse

| | |
| --- | --- |
| Mitglieder | sehen ihn weiter, mit Vermerk |
| Neue Beitritte | keine – auch nicht mit gültigem Code |
| Platzverbrauch bei abgelehntem Beitritt | keiner (der eben gezählte wird zurückgedreht) |
| Wieder öffnen | jederzeit, Codes gelten dann wieder |

Archivieren heißt „das Halbjahr ist vorbei". Ein Code aus dem letzten Jahr soll
dann nicht mehr hineinführen; wer drin ist, bleibt drin.

### 2d.5 Registrierung

Ohne Code kein Konto. Ein Portal, in dem sich jede Person im Netz ein Konto
anlegen kann, wäre ein Einladungsdienst.

Der Ablauf: Code eingeben → „neu hier?" → Anzeigename und Kennwort → Lern-ID
und Wiederherstellungscode werden **einmal** angezeigt → der Code wird
abgeschrieben → Lernbereich.

### 2d.6 Die Serverfunktion ist jetzt prüfbar

`supabase/functions/learner-auth/` ist getrennt in:

| Datei | Inhalt | Stand |
| --- | --- | --- |
| `core.ts` | alle Entscheidungen, Seiteneffekte als `Ports` | **37 Prüfungen** mit Fakes |
| `index.ts` | Deno-Mantel: Herkunft, JSON, Ports bauen, antworten | nie ausgeführt |

Geprüft sind damit: Registrierung, Anmeldung, Wiederherstellung, Code-Hashing,
Einmalnutzung mit Austausch, Rücknahme eines halb angelegten Kontos,
Freigabe des Platzes bei jedem Fehlschlag, die Bremse je Aktion und je
Herkunft, der Vergleich ohne Zeitverrat, und dass jede Ablehnung gleich
aussieht.

Offen bleibt der Mantel und das Deployment – dreißig Zeilen und ein Projekt,
das es nicht gibt (§ 7.1).

### 2d.7 Die Bremse liegt in der Datenbank

`auth_rate_limit` und `note_auth_attempt`. Nicht im Arbeitsspeicher einer
Serverfunktion: Edge-Laufzeiten starten kalt, laufen nebeneinander und enden
ohne Vorwarnung. Ein Zähler darin wäre bei jedem zweiten Versuch wieder bei
null – also keine Bremse, sondern die Behauptung einer.

| Aktion | Versuche | Fenster |
| --- | --- | --- |
| Anmelden | 10 | 5 Minuten |
| Wiederherstellen | 5 | 15 Minuten |
| Registrieren | 10 | 1 Stunde |

Die Bremse greift **vor** jeder Prüfung und zählt auch unsinnige Eingaben –
sonst wäre sie mit einer ungültigen Lern-ID zu umgehen.

---

## 3. Schema

Drei Migrationen in `supabase/migrations/`, in dieser Reihenfolge:

| Datei | Inhalt |
| --- | --- |
| `20260913120000_grundgeruest.sql` | Typen, elf Tabellen, Indizes, der Einfrier-Trigger |
| `20260913120100_hilfsfunktionen.sql` | Sieben `security definer`-Funktionen und `redeem_invite` |
| `20260913120200_zugriffsregeln.sql` | Rechte und 23 Regeln |

### 3.1 Die Tabellen

| Tabelle | Wofür |
| --- | --- |
| `profiles` | Anzeigename, kurze neutrale Kennung, Rolle. **Keine E-Mail-Adresse** |
| `courses`, `course_members` | Lerngruppen und wer darin ist |
| `course_invites` | Einladungen – gespeichert ist nur der SHA-256 des Codes |
| `packs`, `pack_drafts`, `pack_revisions` | Identität, Arbeitsstand, eingefrorene Fassung |
| `course_packs` | Welche Revision in welchem Kurs, in welcher Reihenfolge |
| `pack_progress`, `entry_progress` | Lernstand – immer der der aufrufenden Person |
| `progress_events` | Verarbeitete Ereigniskennungen, für die Idempotenz |
| `learner_accounts` | Lern-ID → Konto; nur der Hash des Wiederherstellungscodes (Phase 3) |
| `auth_rate_limit` | Die Bremse gegen Durchprobieren – gehört der Serverfunktion (Phase 4) |

### 3.2 Drei Entscheidungen im Schema

**Das Paket liegt als JSONB.** Die Zod-Schemata in `src/domain/schema.ts` sind
die Wahrheit über das Paketformat und haben eine eigene Versionskette. Sie in
Spalten zu zerlegen hieße, dieselbe Wahrheit zweimal zu pflegen; die SQL-Kopie
veraltete als Erste. Was gefiltert wird – Titel, Jahrgang – steht zusätzlich
in Spalten.

**Zurückziehen löscht nicht.** `pack_revisions.withdrawn_at` statt `delete`.
Eine Lerngruppe, die mit einer Revision übt, soll nicht mitten im Halbjahr vor
einer leeren Seite stehen, und ein Verweis auf eine gelöschte Revision wäre
eine Lüge. Ein Trigger erzwingt, dass sich **nur** dieses eine Feld ändert –
auch für die Eigentümerin und für Wartungszugriffe.

**Es gibt keine Spalte für den Lernstand einer anderen Person.** Nicht
verborgen, nicht gesperrt: nicht vorhanden. Eine Klassenübersicht ließe sich in
diesem Schema nicht bauen, ohne es zu ändern.

## 4. Zugriffsregeln (RLS)

Der Publishable Key im Browser ist kein Geheimnis (ADR-3). Wer ihn hat, kann
jede Abfrage stellen, die ihm einfällt. Deshalb ist diese Datei die
Sicherheitsarchitektur und nicht ihr Anhang.

### 4.1 Die Regel, auf die es ankommt

Für `pack_progress`, `entry_progress` und `progress_events` gibt es je Tabelle
**genau eine** Regel, für alle vier Operationen, mit genau einer Bedingung:
`user_id = auth.uid()`. Keine Ausnahme für Lehrkräfte, keine für die
Verwaltung. Ein struktureller Test hält zusätzlich fest, dass in diesen Regeln
die Wörter `course_members`, `app_is_teacher_of`, `app_my_role` und
`app_is_member_of` **nicht vorkommen** – jede denkbare Auswertung bräuchte
eines davon.

### 4.2 Was sonst gilt

| Gegenstand | Wer sieht ihn |
| --- | --- |
| Kurs | Eigentümerin und Mitglieder |
| Mitgliederliste | Lehrkräfte des Kurses; Lernende sehen nur die eigene Zeile |
| Einladungen | **nur** Lehrkräfte des Kurses – Lernende sehen keine einzige Zeile |
| Paketentwurf | nur die Eigentümerin |
| Revision | Eigentümerin, sowie Mitglieder eines Kurses, dem sie zugewiesen ist |
| Profil | man selbst; dazu Lehrkräfte der eigenen Kurse |

Veröffentlicht heißt nicht sichtbar: Ohne Zuweisung an einen Kurs sieht eine
lernende Person eine Revision nicht.

Seit Phase 4 kommen zwei Tabellen hinzu, die **niemandem** außer der
Serverfunktion gehören: `auth_rate_limit` (ohne jede Regel und ohne jedes
Recht – wer sie läse, sähe, welche Lern-IDs versucht wurden) und, mit einer
einzigen Leseregel auf die eigene Zeile, `learner_accounts`. Von dieser ist
der Hash des Wiederherstellungscodes per Spaltenrecht ausgenommen: Ein lesbarer
Hash wäre eine Einladung, ihn offline durchzuprobieren.

### 4.3 Drei Feinheiten, die leicht übersehen werden

**`with check` neben `using`.** `using` prüft, was man anfassen darf; `with
check`, wie es hinterher aussehen darf. Ohne das Zweite könnte jede Person ihre
eigene Lernstandszeile jemand anderem zuschreiben.

**Ein Spaltenrecht statt einer Regel.** Eine Zugriffsregel sieht Zeilen, keine
Spalten – sie kann nicht sagen „ändere deine Zeile, aber nicht diese Spalte“.
Deshalb hat `authenticated` auf `profiles` nur `update (display_name)`. Sonst
könnte sich jede Person selbst zur Lehrkraft machen.

**Der Beitritt ist eine Funktion, keine Regel.** Um einen Code zu prüfen,
müsste man Einladungen lesen dürfen – und wer die eines Kurses liest, sieht
alle. `redeem_invite` dreht das um: Sie nimmt den Code, vergleicht Hash gegen
Hash und gibt den Kurs zurück oder einen Fehler. Derselbe Fehlertext für
„gibt es nicht“, „zurückgezogen“, „abgelaufen“ und „aufgebraucht“, damit
Durchprobieren nichts verrät.

### 4.4 Wie das geprüft wurde

`scripts/db/` – PGlite mit PostgreSQL 17.5, die echten Migrationen, echte
Rollenwechsel. Nach Phase 4: **59** Verhaltensprüfungen und **14**
strukturelle, dazu **29** Prüfungen des Kursvertrags gegen dieselbe Datenbank
(`src/cloud/courseRepositories.pglite.test.ts`).

**Gegenprobe.** Ein Test prüft die Prüfung: Dieselbe Zeile wird einmal mit
Einrichtungsrechten gesehen und einmal als andere Person nicht. Ohne ihn könnte
jede Regelprüfung aus dem falschen Grund bestehen – etwa weil das Einfügen
fehlschlug.

**Mutationsprobe.** Versuchsweise wurde eine Leseregel für Lehrkräfte auf
`pack_progress` ergänzt. Sechs Tests schlugen fehl, vier davon
verhaltensbezogen. Die Regel wurde danach entfernt; die Probe steht hier, weil
eine grüne Suite ohne sie nichts über ihre Schärfe sagt.

**Nicht geprüft, ausdrücklich:** GoTrue, PostgREST, die Edge-Laufzeit,
Supabase-eigene Rollen und Erweiterungen (ADR-6). Die Regeln sind echt geprüft,
die Plattform darunter ist nachgebildet.

## 5. Veröffentlichung und Lernstand

### 5.1 Drei Zustände eines Pakets

| Zustand | Wer sieht es |
| --- | --- |
| nur Entwurf | die Eigentümerin |
| veröffentlicht | die Eigentümerin; Kurse **erst nach Zuweisung** |
| veröffentlicht, Entwurf ist neuer | dieselbe Sicht – die Lerngruppe hat noch die alte Fassung |

Der dritte ist der, den eine Oberfläche gern verschweigt. Ohne ihn ändert
jemand ein Paket, sieht „veröffentlicht" und wundert sich wochenlang, warum
die Lerngruppe die Änderung nicht hat. Die Materialseite sagt ihn, und ein
Test hält das fest.

### 5.2 Die Abläufe

| Funktion | Was sie tut |
| --- | --- |
| `save_pack_draft` | Paket und Entwurf in **einem** Schritt – getrennt entstünde bei einem Fehlschlag ein Paket ohne Inhalt |
| `publish_pack` | friert den Entwurf als nächste Revision ein |
| `withdraw_pack_revision` | setzt `withdrawn_at` **und** nimmt die Fassung aus allen Kursen |
| `assign_pack_to_course` | weist eine Fassung zu – nicht in archivierte Kurse, nicht fremde Pakete |

**Die Revisionsnummer.** Sie entsteht in einer Anweisung, und der
Primärschlüssel `(pack_id, revision)` macht aus zwei gleichzeitigen
Veröffentlichungen einen Fehler statt zweier Fassungen mit derselben Nummer.
Erst unmöglich machen, dann abfangen.

**Zurückziehen wirkt.** Ohne die zweite Wirkung wäre „zurückgezogen" eine
Beschriftung, die nichts tut: Die Fassung bliebe in den Kursen und würde weiter
geübt.

### 5.3 Die Paketkennung ist Text, keine UUID

`packs.id` ist `text`. Der Grund ist fachlich: Die Kennung kommt vom Client,
steht seit Sprint 1 in jeder Paketdatei und in jedem lokalen Lernstand und muss
**unverändert** übernommen werden – sonst wäre „ein Paket ins Konto übernehmen"
beim zweiten Mal ein zweites Paket. `newId()` liefert heute UUIDs, hat aber
einen Rückfall für Umgebungen ohne sicheren Kontext; eine `uuid`-Spalte lehnte
eine so entstandene Kennung ab, und zwar erst Jahre später bei genau der Person
mit dem alten Browser.

> **Dazu eine offene Frage der Arbeitsweise.** Diese Änderung steht in der
> Migration aus Phase 2 und **nicht** in einer neuen. Das ist vertretbar, weil
> es nirgends eine Datenbank gibt, auf der sie schon gelaufen wäre (§ 7.1) –
> und es hält das Schema lesbar. Mit dem ersten echten Deployment endet das:
> Ab dann sind Migrationen ausschließlich additiv.

### 5.4 Übernahme vom eigenen Gerät

Beide Web-Auslieferungen liegen unter demselben Ursprung, und IndexedDB gehört
dem Ursprung und nicht dem Pfad. Das Portal liest damit denselben Speicher, in
dem die kontofreie Anwendung ihre Pakete hat: Wer bisher ohne Konto gearbeitet
hat, muss nichts exportieren und nichts hochladen.

Übernommen werden **nur Pakete**. Lernstände nicht – auch nicht die eigenen.

Der Bereich wird lazy geladen (98,8 kB, im Wesentlichen Dexie): Eine Lehrkraft
braucht ihn einmal.

### 5.5 Lernstand

#### 5.5.1 Die eine Entscheidung, aus der alles Weitere folgt

**Das Leitner-Rechnen bleibt auf dem Gerät.** Welche Box eine Vokabel nach
einer Antwort bekommt und wann sie wieder fällig ist, rechnet
`src/domain/leitner.ts` – seit Sprint 1, mit eigenen Prüfungen, und dieselbe
Rechnung läuft in jeder portablen Datei ohne Server.

Dieselbe Rechnung zusätzlich in SQL hieße, zwei Wahrheiten zu pflegen. Sie
würden auseinanderlaufen, und zwar unbemerkt: Wer abwechselnd im Portal und in
einer Lerndatei übt, bekäme zwei verschiedene Vorstellungen davon, was er kann.

Der Client rechnet also und schickt das Ergebnis mit – als Feld `entryState`
eines `ProgressEvent`. Gebaut wird ein solches Ereignis an **genau einer**
Stelle: `src/application/progressEvents.ts`. Jede Ansicht, die das selbst täte,
wäre eine zweite Stelle, an der jemand `streak` vergessen kann.

**Die Folge, offen gesagt:** Wer will, kann seinen **eigenen** Lernstand
beschönigen. Das ist hinnehmbar – er ist seiner, niemand sonst sieht ihn
(ADR-1), und aus ihm folgt nichts als die Auswahl der nächsten Vokabel. Wer
sich selbst belügt, hat weniger geübt; mehr passiert nicht.

#### 5.5.2 Idempotenz

Eine Antwort, die unterwegs verlorengeht, muss erneut gesendet werden können.
Ohne Vorkehrung zählte ein Wackler im WLAN eine Vokabel zweimal.

Die Vorkehrung ist `progress_events`: Der Client vergibt je Antwort eine
Kennung, und diese Tabelle merkt sich, welche verarbeitet wurden. Ein
`insert … on conflict do nothing` entscheidet in **einer** Anweisung, ob ein
Ereignis neu ist – zwei Anweisungen hätten dieselbe Lücke wie beim
Einladungscode (§ 2d.2).

Zurücksetzen löscht den Lernstand, **nicht** die Ereigniskennungen. Sonst
ließe sich eine alte Runde danach erneut einreichen.

#### 5.5.3 Wer gewinnt, wenn zwei Geräte schreiben

> **Korrektur nach Phase 6.** Der erste Entwurf entschied diesen Fall am
> Zeitstempel des Geräts (`occurredAt`). Das war falsch, Marc hat es gefunden,
> und es ist vor Phase 7 repariert worden. Was hier steht, ist die korrigierte
> Fassung; was falsch war und warum, steht in § 5.5.8.

**Die Fassung entscheidet – `entry_progress.rev`, und sonst nichts.**

Ein Gerät nennt beim Schreiben die Fassung, von der es ausging (`baseRev`).
Stimmt sie noch, wird übernommen und hochgezählt. Stimmt sie nicht, wird
**abgelehnt** und die aktuelle Fassung gemeldet.

Was ausdrücklich **nicht** entscheidet:

| Nicht | Warum nicht |
| --- | --- |
| die Fachnummer | Fach 5, dann eine falsche Antwort, Ergebnis Fach 1 – das ist ein **richtiges** Ergebnis. Ein Riegel, der „den besseren Stand" behielte, ließe die Vokabel in Fach 5 stehen, obwohl die Person sie gerade nicht konnte. Genau diese Vokabel käme dann nie wieder dran. |
| der Zeitstempel des Geräts | Geräteuhren gehen falsch, und niemand kann das nachprüfen. Entschiede `occurredAt`, gewänne dauerhaft das Gerät mit der am weitesten vorgestellten Uhr – unbemerkt. |
| Zähler oder Serien | Aus demselben Grund wie die Fachnummer. |

`occurredAt` wird deshalb **weder gespeichert noch verglichen**. Alle
Zeitstempel in dieser Datenbank kommen aus `now()`. Der Preis ist benannt:
Eine Runde, die offline entstand, trägt den Zeitpunkt des Hochladens.

**Eine Wiederholung ist kein Konflikt.** Die Zeile merkt sich in
`last_event_id`, welches Ereignis sie erzeugt hat. Ohne das würde ein zweites
Mal gesendetes Ereignis entweder doppelt angewandt oder fälschlich abgelehnt.

**Die Auflösung.** Das abgelehnte Gerät lädt den frischen Stand, rechnet
dieselbe Bewertung mit **derselben** Domainfunktion noch einmal
(`erneutRechnen` → `antwortEreignis` → `applyAnswer`) und sendet **dasselbe**
Ereignis erneut. Dass es dabei nicht doppelt zählt, sichert die `eventId`:
Sie schützt die **Zähler**, die Fassung schützt den **Stand**. Zwei
Idempotenzen in zwei Dimensionen, und beide werden gebraucht.

An der Oberfläche passiert das ohne ein Wort an die lernende Person. Ein
Hinweis „dein anderes Gerät war schneller" wäre die Erklärung für ein Problem,
das sie nicht hat.

#### 5.5.4 Was der Server nicht annimmt

Der Client rechnet (§ 5.5.1), aber er darf nicht alles schicken. Geprüft wird
in `app_check_progress_events` – **alles oder nichts**, bevor die erste Zeile
entsteht; eine halb übernommene Runde wäre schlimmer als eine abgelehnte.

| Prüfung | Warum |
| --- | --- |
| höchstens 200 Ereignisse | damit ein Aufruf nicht beliebig lange läuft |
| Fach 1 bis 5 | außerhalb ist es kein Leitner-Stand |
| Richtung `en-de` / `de-en` | die einzigen, die es gibt |
| Zähler und Fassung nicht negativ | dasselbe |
| Fälligkeit höchstens 22 Tage voraus | das längste Fach sind 21 Tage. Sonst legte jemand eine Vokabel auf das Jahr 2099 und wäre sie los. Nach hinten gibt es **keine** Grenze: „überfällig" heißt schlicht „jetzt dran". |
| Vokabel steht in der zugewiesenen Fassung | sonst entstünde ein Lernstand zu etwas, das es nicht gibt |
| Paket liegt in einem Kurs dieser Person | die Mitgliedschaft, nicht die Behauptung |
| keine fremde Personenkennung | es gibt keinen Parameter dafür – auch nicht in der inneren Prüfung |

Eine Folge davon, die eher hilft als stört: Eine grob falsch gestellte Uhr
gewinnt nicht nur nicht – sie kommt gar nicht erst an, weil sie eine
Fälligkeit außerhalb jedes Fachs errechnet.

**Zum abgeschlossenen Kurs siehe ADR-12 und § 5.5.7.**

#### 5.5.5 Die Abläufe

| Funktion | Was sie tut |
| --- | --- |
| `app_check_progress_events(jsonb)` | die Eingangsprüfung; sie schreibt nichts, sie lehnt ab. Nicht freigegeben – sie ist der Innenteil |
| `record_progress_events(jsonb)` | nimmt bis zu 200 Ereignisse, gibt zurück, was **nicht** übernommen wurde |
| `begin_practice_session(uuid, text)` | zählt eine begonnene Runde – mehr wird über Runden nicht geführt |
| `reset_my_progress(uuid, text)` | löscht den eigenen Lernstand, ohne Umweg über jemanden |

Keine davon nimmt eine Personenkennung entgegen. `auth.uid()`, und nichts
sonst – was nicht beschrieben ist, entsteht nicht aus Versehen. Zwei Prüfungen
halten das fest: eine Liste der Funktionen, die Lernstandstabellen überhaupt
anfassen dürfen (mit Begründung je Eintrag), und eine Prüfung, dass jeder
Vergleich auf `user_id` in ihnen gegen `v_me := auth.uid()` läuft.

#### 5.5.6 Üben im Portal

`src/hosted/learner/PracticePage.tsx`, lazy geladen (22,1 kB). Neu ist daran
**nichts außer dem Ziel des Lernstands**: Rundenplanung
(`domain/exercises.ts`), Ablauf (`domain/session.ts`), Aufgabenansicht
(`ExerciseView`) und Leitner-Rechnen stammen unverändert aus Sprint 1.

Zwei Dinge, die eine Oberfläche gern verschweigt, stehen dort:

- **Ein Senden, das scheitert, wird gesagt.** Wer weiterübt, während nichts
  ankommt, hätte am Ende eine Runde geübt, die es nirgends gibt.
- **Eine leere Runde ist kein Fehler.** „Gerade nichts fällig" samt dem Datum
  der nächsten Fälligkeit statt „0 Antworten".

Der Lernstand wird während der Runde im Speicher mitgeführt. Ihn nach jeder
Antwort neu vom Server zu holen hieße, mitten in der Übung auf das Netz zu
warten.

#### 5.5.7 Der abgeschlossene Kurs – entschieden

Die Frage stand offen und ist **von Marc entschieden**: ADR-12. Archiviert
heißt abgeschlossen, nicht geschlossen.

`app_check_progress_events` prüft deshalb Mitgliedschaft, Zuweisung und
Fassung – und ausdrücklich **nicht** `archived`. Die Gegenprobe steht daneben:
Wird die Mitgliedschaft entfernt, endet der Schreibweg sofort. Das ist der
Weg, der Zugriff beendet; das Archivieren ist es nicht.

#### 5.5.8 Was am ersten Entwurf falsch war

Der erste Entwurf aus Phase 6 entschied den Mehrgerätefall so:

```sql
where entry_progress.last_answered_at is null
   or entry_progress.last_answered_at <= excluded.last_answered_at
```

`excluded.last_answered_at` kam aus `occurredAt` – **einem Zeitstempel vom
Gerät**. Damit hing die Frage, wessen Lernstand gilt, an einer Uhr, die
niemand überprüfen kann. Ein Telefon, dessen Uhr um Jahre vorgeht, hätte
dauerhaft gewonnen und jeden späteren Stand von jedem anderen Gerät verworfen.

Zwei Dinge waren dabei **nicht** falsch, und das ist der Grund, warum es lange
unauffällig blieb: Die Fachnummer stand nie in der Bedingung, ein fachlicher
Rückfall von Fach 5 auf Fach 1 kam also immer durch. Und einen Bericht darüber
gab es auch nicht – ein abgelehnter Schreibvorgang verschwand still, und das
Gerät übte auf einem Stand weiter, den es gar nicht mehr gab.

Der Befund kam nicht von einer Prüfung, sondern von Marc. Die Prüfung, die ihn
gefunden hätte, gibt es jetzt: sieben Fälle im Lernstandsvertrag, zweimal
abgenommen, plus eine Prüfung am Quelltext, die den zweiten Riegel verhindert,
den später jemand „nur schnell" danebenstellt.

#### 5.5.9 Was Phase 6 **nicht** getan hat – und warum

Phase 1 hatte angekündigt, die bestehenden Lernseiten (`src/routes/student/`)
in Phase 6 an die Verträge zu hängen. Das ist nicht geschehen, und zwar
absichtlich.

`SessionPage.tsx` ist 541 Zeilen und seit Sprint 1 durch einen großen Teil der
159 E2E abgesichert. Sie umzubauen hieße, den Weg, auf dem heute jede lernende
Person ohne Konto übt, für einen Zugewinn anzufassen, den sie nicht hat: Ohne
Konto gibt es nur ein Gerät, und `LOCAL_SCOPE` beschreibt genau das. Der
Umbau brächte Risiko ohne Gegenwert.

Stattdessen gibt es eine eigene, kurze Portalseite über **denselben**
Domainfunktionen. Was dabei **nicht** doppelt vorliegt, ist der Punkt: die
Rundenplanung, der Ablauf, die Aufgabenansicht und das Leitner-Rechnen. Doppelt
ist nur das Zusammenstecken – rund 200 Zeilen, und sie sagen an jeder Stelle,
woher das Teil kommt.

Der Preis, offen benannt: Zwei Seiten können auseinanderlaufen. Fällt das
eines Tages auf, ist der Umbau von `SessionPage` die Antwort – dann aber mit
einem Anlass statt auf Vorrat.

## 5a. KI-Zugang (Phase 7)

### 5a.1 Zwei Wege, ohne Vermischung

ADR-8 steht seit Phase 0, und Phase 7 löst ihn ein:

| Gestalt | Weg zum Anbieter | Wer hat den Schlüssel |
| --- | --- | --- |
| portable Lehrkraftdatei | direkt aus dem Browser (seit Sprint 4C) | die Lehrkraft, auf ihrem Gerät |
| Portal | ausschließlich über die Serverfunktion `ai-gateway` | der Server – der Browser sieht ihn nie |

Beides ist für seine Lage richtig. Falsch wäre, sie zu vermischen: Ein
Browser, der je nach Zustand mal direkt und mal über den Server geht, hat zwei
Sicherheitsmodelle und keine prüfbare Zusage. Ein Test am Importgraphen hält
das fest – `src/cloud/aiGateway.ts` ist in keiner portablen Datei erreichbar,
und in keinem Browserbündel steht Code aus `supabase/functions/`.

### 5a.2 Der Tresor

`supabase/functions/ai-gateway/tresor.ts`. **AES-GCM aus WebCrypto**, keine
eigene Kryptografie.

| Baustein | Warum |
| --- | --- |
| 96-Bit-IV je Verschlüsselung, aus einer kryptografischen Quelle | Derselbe IV zweimal mit demselben Schlüssel gibt bei GCM **beide Klartexte** preis – nicht „wird schwächer" |
| Ein IV aus lauter Nullen wird abgelehnt | Rechnerisch möglich, praktisch immer eine kaputte Zufallsquelle |
| AAD bindet Schlüsselfassung, Eigentümerin, Verbindung und Anbieter | Verschlüsselt heißt nicht unverschiebbar. Ohne Bindung ließe sich ein Chiffretext in die Zeile einer anderen Lehrkraft kopieren – oder auf einen Anbieter mit freier Adresse umhängen |
| Trennzeichen der AAD ist `\u0000`, und jedes Feld wird dagegen geprüft | Mit einem gewöhnlichen Trennzeichen ergäben zwei verschiedene Bindungen dieselbe Zeichenkette |
| Hauptschlüssel **nur** aus den Function Secrets | Ein eingebauter Vorgabewert wäre ein Schlüssel, den jeder kennt, der den Quelltext liest |
| Nummerierte Fassungen, alte bleiben lesbar | Eine Rotation, die die alte Fassung wegwirft, ist ein Datenverlust mit Ankündigung |
| Die Maske entsteht **vor** dem Versiegeln | Sonst wäre jede Liste von Verbindungen ein Grund, jeden Schlüssel zu entsiegeln |

**Ein Fehlschlag meldet sich und räumt nicht auf.** Fehlender Hauptschlüssel,
falsche Fassung, veränderter Chiffretext: derselbe Satz, kein Löschen, keine
zurückgesetzte Zeile. Ein Hauptschlüssel, der versehentlich fehlt, ist ein
behebbarer Betriebsfehler; eine Funktion, die daraufhin Zeilen entfernte,
machte ihn unbehebbar.

### 5a.3 Wohin gesendet werden darf

`supabase/functions/ai-gateway/ziel.ts`. Zwei Tore, und beide müssen auf sein:

1. **Der Host steht auf einer Liste** – der der offiziellen Anbieter (fest im
   Quelltext) oder der, die eine Verwaltung gepflegt hat. **Exakter
   Vergleich.** Ein Suffixvergleich erlaubte
   `generativelanguage.googleapis.com.boese.example`.
2. **Die Adresse taugt**: HTTPS, keine Zugangsdaten im URL, nur Port 443,
   kein IP-Literal in irgendeiner Schreibweise, kein `localhost`/`.internal`/
   `.local`, nur ASCII.

**IP-Literale werden umgekehrt geprüft.** Nicht „ist das eine private
Adresse?" – diese Frage hat zu viele Schreibweisen (`2130706433`, `0x7f.1`,
`0177.0.0.1`, `[::ffff:127.0.0.1]`). Sondern: **Ein Anbieter hat einen
Namen.** Alles, was wie eine Zahlenadresse aussieht, fällt durch, ohne dass
entschieden werden muss, ob sie privat wäre. 53 Prüfungen zählen die
Schreibweisen auf; sie sind die Begründung, nicht die Verteidigung.

**Weiterleitungen werden nicht verfolgt.** Eine Umleitung ist der übliche Weg,
aus einer geprüften Adresse eine ungeprüfte zu machen. „Jedes neue Ziel erneut
prüfen" wäre die Alternative; ablehnen ist die kürzere und die sicherere.

**Keine Kopfzeilen von außen.** Die Serverfunktion baut sie vollständig selbst.
Mit freien Kopfzeilen ließe sich der `Host` umbiegen oder ein interner Dienst
mit einer Kennung ansprechen, die diese Funktion zufällig hat.

**Größen.** 32 KiB hinaus, 256 KiB herein – und die Antwort wird strömend
gelesen und abgebrochen, nicht erst vollständig in den Speicher geholt.

### 5a.4 Die ehrliche Grenze: DNS-Rebinding

**Nicht gelöst.** Ein Name auf der Freigabeliste kann auf `127.0.0.1` zeigen.
Dagegen hilft nur, den Namen selbst aufzulösen, die **Adresse** zu prüfen und
die Verbindung an genau diese Adresse zu binden – sonst löst der HTTP-Client
ein zweites Mal auf. Eine Edge-Laufzeit gibt beides nicht her.

Das wird nicht weggeredet. Eingegrenzt ist es allein dadurch, dass
benutzerdefinierte Hosts **ausschließlich über eine administrative
Freigabeliste** erreichbar sind: Wer einen Namen freigibt, gibt seine
Auflösung mit frei. Genau deshalb ist die Freigabe eine Verwaltungsaufgabe und
kein Feld im Formular.

### 5a.5 Die Anbieter

| Anbieter | Adresse | Eigene Adresse? | Schlüssel |
| --- | --- | --- | --- |
| Gemini | `generativelanguage.googleapis.com` | nein | Kopfzeile `x-goog-api-key`, **nie** `?key=` |
| OpenAI-kompatibel | `api.openai.com` voreingestellt | ja, nur freigegebene Hosts | `Authorization: Bearer` |
| Anthropic-kompatibel | `api.anthropic.com` voreingestellt | ja, nur freigegebene Hosts | `x-api-key` + feste `anthropic-version` |
| Modell im Browser | — | — | keiner |

Der Schlüssel geht nie in die Adresse: Adressen landen in Server-Logs, in
Proxy-Logs, im Verlauf und in Fehlerberichten.

Das **Browsermodell** steht in der Liste und hat trotzdem keine Adresse. Es
läuft im Gerät der Lehrkraft und geht nie ins Netz – ein Aufruf darüber wird
abgelehnt, nicht stillschweigend umgeleitet.

### 5a.6 Die Datenbank

| Tabelle | Wer darf was |
| --- | --- |
| `ai_allowed_hosts` | lesen: jede angemeldete Person (die Oberfläche braucht eine Auswahl). Ändern: nur `admin`, und nur auf den eigenen Namen |
| `ai_connections` | eine Regel: `owner_id = auth.uid()`; anlegen zusätzlich nur als Lehrkraft |

**Der eigentliche Riegel ist ein Spaltenrecht.** `secret_ciphertext`,
`secret_iv` und `secret_key_version` sind für `authenticated` **nicht lesbar** –
auch nicht über eine selbst formulierte PostgREST-Abfrage, auch nicht für die
Verwaltung, auch nicht über `select *`. Geschrieben wird dort ausschließlich
von der Serverfunktion mit Service Role.

Das ist der Unterschied zwischen „die Anwendung zeigt es nicht an" und „es wird
nicht herausgegeben".

**Kein Protokoll der Aufrufe.** Wer wann welchen Text an ein Modell geschickt
hat, wäre eine Auswertung über Lehrkräfte. Die Bremse (120 Aufrufe je Stunde)
zählt in `auth_rate_limit` und merkt sich nicht, worum es ging.

### 5a.7 Was ein Modell zu sehen bekommt

Wörter und Beispielsätze. Keine Namen, keine Lernstände, nichts aus dem
Lernbereich – das gilt seit Sprint 2A und unabhängig vom Anbieter. Der
Serverfunktion fehlt für Lernstände schlicht der Port; was sie nicht hat, kann
sie nicht weiterreichen.

## 6. Einrichtung

### 6.1 Das vorgesehene Ziel

| | |
| --- | --- |
| Repository | `https://github.com/mp-studio-official/LexiFlow.git` |
| GitHub Pages | `https://mp-studio-official.github.io/LexiFlow/` |
| Grundpfad | `LEXIFLOW_BASE=/LexiFlow/` |

**Stand: nur dokumentiert.** Es gibt in diesem Arbeitsverzeichnis **keinen**
Remote, und es wurde nichts gepusht. Vor dem Anlegen von `origin` ist zu
prüfen, ob bereits ein Remote existiert und ob die Historie dort leer oder mit
der lokalen vereinbar ist. Kein Force-Push, keine fremde Historie überschreiben,
kein Deployment vor grünem Build und grünen Tests.

### 6.2 Die beiden öffentlichen Werte

`.env.example` ist die Vorlage; die echte Datei heißt `.env` und ist von Git
ausgeschlossen. Beide Werte dürfen öffentlich sein und stehen im Bündel. Der
Secret Key und die Service Role gehören ausschließlich in die Function Secrets –
eine Variable mit dem Präfix `VITE_` landet im Bündel und wäre kein Geheimnis
mehr.

### 6.3 Befehle

| Befehl | Wirkung |
| --- | --- |
| `npm run dev` | kontofreie PWA unter `/` |
| `npm run dev:portal` | Portal unter `/portal.html`, Port 5174 |
| `npm run build` | beide Web-Auslieferungen nach `dist/` und `dist/portal/` |
| `npm run build:portable` | Lehrkraftdatei und Lernlaufzeit |
| `npm test` | alles – auch PostgreSQL (PGlite) und beide Serverfunktionen |
| `npm run test:db` | nur die Zugriffsregeln gegen PostgreSQL 17.5 |
| `npm run e2e` | die kontofreie Anwendung (159) |
| `npm run e2e:portable` | die portablen Dateien (29) |
| `npm run e2e:portal` | das Portal unter `/LexiFlow/` (31) |
| `npm run verify:portable` | Größenwacht und fachliche Prüfung |
| `npm run verify:deploy` | der Riegel vor dem Netz – prüft `dist/` |

### 6.4 Die Prüfkette (Phase 8)

Zwei Abläufe, zwei Fragen.

| Datei | Frage | Wann |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Ist der Stand in Ordnung? | jeder Zweig, jeder Pull Request |
| `.github/workflows/deploy.yml` | Darf das ins Netz? | nur `main`, und nur nach der vollständigen Kette |

**Warum getrennt.** Zusammen in einer Datei hinge die Prüfung am Deployment,
und ein Zweig ohne Deployment bekäme keine – genau der Zweig, auf dem
gearbeitet wird.

`scripts/ci.test.mjs` liest beide Dateien und prüft, dass sie aufrufen, was es
zu prüfen gibt. Eine Prüfkette, aus der jemand beim Umbauen einen Schritt
herausnimmt, meldet sonst weiterhin Erfolg – der unangenehmste Fehler, den eine
Werkstatt haben kann.

**Im CI wird nichts Echtes angefasst.** `LEXIFLOW_CI=1`: kein Browsermodell
wird heruntergeladen, kein Anbieter angerufen, kein Schlüssel gebraucht. Ein
Test hält fest, dass in keinem Ablauf ein Schlüssel im Klartext steht.

### 6.5 Der Riegel vor dem Netz

`npm run verify:deploy` prüft das **gebaute Verzeichnis**, nicht den Quelltext.
Das ist der Schritt zwischen „alle Tests grün" und „das Richtige liegt im
Netz", und er fehlte.

| Geprüft wird | Warum |
| --- | --- |
| beide Einstiege da, das Portal heißt `index.html` | `portal.html` hieße: das Umbenennen ist nicht gelaufen, und `/portal/` ginge ins Leere |
| keine Spur der Testfassung | erfundene Konten samt `testkennwort` im Netz sähen aus wie das Produkt |
| kein Geheimnis im Bündel | gesucht wird ein **Wert**, nicht ein Wort (siehe unten) |
| kein Serverfunktionscode | eine Prüfung, die im Browser läuft, ist keine Prüfung |
| alle Pfade unter dem Grundpfad | lokal unter `/` geht ein falscher Pfad nie kaputt |
| `.nojekyll` vorhanden | sonst lässt Pages jede Datei mit `_` am Anfang weg |

**Zwei Befunde beim allerersten Lauf**, und beide waren echt:

**1. Die kontrollierte Fälschung lag im produktiven Portalbündel.**
`HostedApp.tsx` importierte `fakeCloudRepositories.ts` gewöhnlich; die Fahne
`VITE_LEXIFLOW_FAKE_CLOUD` entschied nur, ob sie **benutzt** wird – nicht, ob
sie **ausgeliefert** wird. Damit standen `fuchs-7390`, `testkennwort` und der
Wiederherstellungscode in jeder Auslieferung.

Das ist derselbe Gedanke, den ADR-10 für die beiden Web-Auslieferungen schon
einmal geführt hat: *Eine Zusage, die an einer Bedingung hängt statt an einem
Import, ist am Bündel nicht prüfbar.* Die Antwort ist deshalb dieselbe – eine
**Bauzeitfahne** `__LEXIFLOW_FAKE_CLOUD__`, ein dynamischer Import dahinter,
und der Bundler faltet den Zweig weg. Nachgemessen: Das Portalbündel schrumpfte
von 582,98 kB auf **567,90 kB**, und `dist/` enthält die Testkonten nicht mehr.

Beide Richtungen sind nachgeprüft: Ohne die Fahne ist der Chunk nicht da und
die Wache schweigt; mit der Fahne ist er da und die Wache bricht ab.

**2. Die Wache hielt den Türsteher für den Einbrecher.** Der erste Entwurf
suchte die Zeichenkette `sb_secret` – und fand sie sofort in
`@supabase/supabase-js` selbst, wo sie dazu dient, einen falsch eingesetzten
Secret Key **abzulehnen**. Eine Wache, die beim ersten Lauf falschen Alarm
schlägt, wird abgeschaltet, und dann bewacht sie gar nichts mehr. Gesucht wird
jetzt ein Präfix **plus** genug Zeichen dahinter, dass es ein Schlüssel sein
könnte. Der Fund selbst wird nicht ins Protokoll geschrieben: Ein
CI-Protokoll ist der letzte Ort, an dem ein Schlüssel landen sollte.

### 6.6 Was noch zu tun ist – und von wem

Nichts davon ist gelaufen. Die Liste ist eine Anleitung, kein Bericht.

**Supabase-Projekt (Marc, einmalig):**

1. Projekt in der EU-Region anlegen. Die Region ist kein Datenschutznachweis
   (§ 7.2), aber ohne sie fängt die Prüfung gar nicht erst an.
2. `supabase/migrations/` anwenden – acht Dateien, in der Reihenfolge ihrer
   Namen.
3. Function Secrets setzen: `SUPABASE_SECRET_KEY`,
   `LEXIFLOW_ALLOWED_ORIGINS` (die beiden Pages-Adressen),
   `LEXIFLOW_AI_MASTER_KEY_V1` (32 Byte, base64, aus einer
   kryptografischen Quelle – **nicht** aus einem Passwortgenerator im
   Browser).
4. Beide Edge Functions deployen: `learner-auth`, `ai-gateway`.
5. Eine erste Lehrkraft anlegen und ihre Rolle setzen. Dafür gibt es
   absichtlich keinen Weg in der Oberfläche.

**GitHub (Marc, einmalig):**

6. Repository anlegen oder prüfen, dass es leer ist. Erst dann `origin`
   hinzufügen.
7. Pages auf „GitHub Actions" stellen.
8. Repository-Variablen `VITE_SUPABASE_URL` und
   `VITE_SUPABASE_PUBLISHABLE_KEY` setzen. **Variables, nicht Secrets** – sie
   stehen ohnehin im Bündel, und als Secret wären sie in Protokollen
   maskiert, was das Nachsehen erschwert, ohne etwas zu schützen.
9. Erst nach grünem `ci.yml` nach `main` bringen.

**Was danach zum ersten Mal wirklich geprüft ist** (§ 7.1): reales Supabase
Auth, JWT-Claims, PostgREST, beide Edge-Laufzeiten, Function Secrets,
E-Mail-Versand und das Deployment. Bis dahin steht in diesem Dokument an
keiner Stelle, dass LexiFlow im Portalbetrieb funktioniert.

## 7. Beweislage und offene Risiken

### 7.1 Was belegt ist – und wodurch

**Mit PGlite belegt** (PostgreSQL 17.5, echte Migrationen, echte Rollenwechsel):

- das Schema: Tabellen, Spalten, Typen, Fremdschlüssel
- die Constraints: `check`, `unique`, Primärschlüssel
- Transaktionen und die Atomarität einzelner Anweisungen
- die Zugriffsregeln (RLS) in **simulierten** Rollenfällen: `set role` auf
  `anon`/`authenticated` plus ein `auth.uid()`, das dieselben JWT-Claims liest,
  die PostgREST setzen würde
- Trigger und `security definer`-Funktionen

**Mit Fakes belegt** (reine Logik, injizierte Seiteneffekte, kein Netz):

- die Anmelde- und Wiederherstellungslogik der Serverfunktion
- die Repository-Verträge gegen zwei Implementierungen
- die Oberfläche des Portals einschließlich der Übungsseite
- **die Adressprüfung des KI-Gateways** (53 Prüfungen, jede Schreibweise einer
  IP-Adresse einzeln)
- **das Ver- und Entsiegeln der Anbieterschlüssel** (29 Prüfungen gegen echtes
  WebCrypto – AES-GCM selbst wird dabei nicht nachgeprüft, sondern das, was
  darum herum falsch gemacht werden kann)
- **die Abläufe des KI-Gateways** (41 Prüfungen mit Fakes)

**Nicht belegt – und zwar gar nicht:**

- **reales Supabase Auth (GoTrue).** Ob eine Anmeldung dort so abläuft wie hier
  angenommen, ist ungeprüft.
- **echte JWT-Claims.** Der Shim liest dieselbe Einstellung, aber kein echtes
  Token wurde je ausgestellt, signiert oder geprüft.
- **das API-Gateway (PostgREST).** Die SQL-Ebene ist geprüft, die HTTP-Ebene
  darüber nicht – einschließlich der Abbildung von Abfragen auf Anfragen.
- **die Edge-Function-Laufzeit.** Die Kerne sind getestet, die Deno-Mäntel nie
  ausgeführt – das gilt für `learner-auth` wie für `ai-gateway`.
- **Function Secrets.** Es gibt keinen Hauptschlüssel. Der Schlüsselbund wurde
  nie aus einer echten Umgebung gelesen, und keine Rotation ist je gelaufen.
- **jeder echte KI-Anbieter.** Kein Aufruf hat je ein Netz gesehen, kein
  echter Anbieterschlüssel existiert.
- **E-Mail-Versand.** Es wurde keine Nachricht verschickt und keine empfangen.
- **Deployment.** Es gibt kein Supabase-Projekt, keinen Remote, kein GitHub
  Pages. Nichts davon ist eingerichtet, und nichts wurde ausprobiert.

Solange es kein echtes Projekt gibt, sagt dieses Dokument an keiner Stelle,
dass LexiFlow im Portalbetrieb funktioniert. Es sagt, was geprüft wurde.

### 7.2 Offene Risiken

| Risiko | Stand |
| --- | --- |
| GoTrue, PostgREST und Edge-Laufzeit sind lokal nicht prüfbar | bekannt, ADR-6; muss am echten Projekt nachgeholt werden |
| DNS-Rebinding bei benutzerdefinierten KI-Hosts | bekannt, ADR-9; nur durch Freigabeliste eingegrenzt |
| Wiederherstellungscode geht verloren → Konto ist verloren | bewusst; Bestätigungsschritt beim Anlegen |
| EU-Region ist kein Datenschutznachweis | bekannt; organisatorische Prüfung vor Schulbetrieb nötig |
| Supabase-Backups löschen nicht sofort mit | zu dokumentieren, nicht zu behaupten |
| Lernende verlieren Kennwort **und** Code → Konto verloren | bewusst, ADR-11; steht so auf der Seite |
| `VITE_LEXIFLOW_FAKE_CLOUD=1` versehentlich deployt | eingegrenzt: rotes Band auf jeder Seite, Test hält es fest |
| Die Serverfunktion `learner-auth` ist geschrieben, aber **nie gelaufen** | bekannt; ohne Supabase-Projekt nicht ausführbar |
| Portalbündel 488 kB (Supabase-Client) | beobachtet; lazy laden ist eine Option für eine spätere Phase |
| Echte Gleichzeitigkeit auf dem letzten freien Platz nicht nachstellbar | PGlite hat eine Verbindung; belegt ist die Atomarität der Anweisung, nicht das Rennen selbst (§ 2d.2) |
| `supabaseCourseGateway.ts` (PostgREST) ungeprüft | bekannt; vier benannte offene Fragen stehen als Kommentar in der Datei |
| Wiederherstellungscode wird beim Anlegen zwar abgeschrieben, aber nicht sicher aufbewahrt | bewusst; mehr kann Software an dieser Stelle nicht |
| `supabasePackGateway.ts` (PostgREST) ungeprüft | bekannt; die abweichenden Stellen stehen als Kommentar in der Datei |
| Zwei gleichzeitige Veröffentlichungen ergeben einen Fehler statt einer Wartezeit | bewusst; der Primärschlüssel verhindert die Dopplung, die Wiederholung liegt beim Aufruf |
| Portalbündel 568 kB | beobachtet, § 8; zwei Hebel benannt und nicht gezogen |
| `supabaseProgressGateway.ts` (PostgREST) ungeprüft | bekannt; dieselbe Lage wie bei Kursen und Paketen |
| Der eigene Lernstand lässt sich beschönigen | bewusst, § 5.5.1; die Alternative wären zwei Leitner-Rechnungen, die auseinanderlaufen |
| Eine offline entstandene Runde trägt den Zeitpunkt des Hochladens | bewusst, § 5.5.3; die Alternative wäre ein Zeitstempel vom Gerät, und der ist nicht überprüfbar |
| Abgeschlossene Kurse erlauben weiterhin das Üben | **entschieden**, ADR-12 und § 5.5.7 – bewusst so, mit Prüfungen in beiden Verträgen und in `rls.test.mjs` |
| Ein drittes Gerät im selben Moment bleibt beim Konflikt | bewusst; ein zweiter Versuch, kein dritter. Der Hinweis steht dann da, die nächste Runde liest neu |
| **DNS-Rebinding ist nicht gelöst** | bekannt und nicht weggeredet, § 5a.4; eingegrenzt allein durch die administrative Freigabeliste, weil die Edge-Laufzeit keine eigene Namensauflösung hergibt |
| Ein freigegebener Host kann intern zeigen | dieselbe Grenze; eine Freigabe ist eine Verwaltungsentscheidung, keine Formulareinstellung |
| Der Hauptschlüssel liegt in den Function Secrets | wer sie liest, liest alle Anbieterschlüssel. Die Grenze jeder serverseitigen Verschlüsselung; benannt statt verschwiegen |
| Eine Schlüsselrotation ist vorgesehen, aber nie gelaufen | § 5a.2; geprüft ist die Logik, nicht der Vorgang |
| Die Fälschung lag im produktiven Portalbündel | **behoben in Phase 8**, § 6.5; gefunden von `verify-deploy.mjs` beim ersten Lauf, nicht von einem Test |
| `verify:deploy` prüft Zeichenketten, keine Semantik | bewusst; es ist die letzte grobe Wache vor dem Netz, nicht die einzige |
| `ai-gateway/index.ts` (Deno-Mantel) ungeprüft | bekannt; darin stehen nur zwei Dinge, die nirgends sonst stehen können – `redirect: 'manual'` und das strömende Lesen |
| Übungsseite im Portal und `SessionPage` können auseinanderlaufen | bewusst, § 5.5.9; die gemeinsame Grundlage ist die Domainschicht, doppelt ist nur das Zusammenstecken |

## 8. Größenwacht

Die Lernlaufzeit lag beim Start bei **674,6 KiB**. Jede Phase misst neu; ein
Wachstum durch Cloudcode wäre ein Fehler, kein Preis.

| Artefakt | Start | nach Phase 8 |
| --- | --- | --- |
| `LexiFlow-Lehrkraft.html` | 9482,1 KiB | **9482,3 KiB** |
| `LexiFlow-Lernlaufzeit.html` | 674,6 KiB | **674,7 KiB** |
| kontofreie PWA (`index-*.js`) | 441,53 kB | 441,59 kB |
| Portalbündel (`portal-*.js`) | – | 488,17 kB (Phase 3) → 574,85 kB (Phase 5) → 582,98 kB (Phase 7) → **567,90 kB** (Phase 8) |

Nach Phase 4 sind Lehrkraftdatei und Lernlaufzeit weiterhin bei **9482,1 KiB**
und **674,6 KiB**. Einmal wären sie um 0,5 und 0,2 KiB gewachsen: Eine
CSS-Regel für die Abmeldeschaltfläche des Portals lag zuerst in `global.css`
und wanderte damit in jede Lerndatei mit. Sie steht jetzt in
`src/styles/portal.css`, das nur `portal-main.tsx` importiert. Bei 0,2 KiB
klingt das kleinlich; die Gewohnheit ist der Punkt.

**Phase 6 kostet 0,1 KiB in beiden portablen Dateien** – und der Posten ist
benannt: `src/application/progressEvents.ts`, die eine Stelle, an der ein
Lernstandsereignis entsteht. Sie liegt in den portablen Dateien mit, weil auch
dort Ereignisse entstehen, und sie dort **nicht** zu haben hieße, das
Leitner-Ergebnis an zwei Stellen zusammenzubauen. 0,1 KiB gegen zwei
Wahrheiten ist ein guter Tausch; die Zahl steht hier trotzdem, weil die
Gewohnheit der Punkt ist.

**Das Portalbündel wächst dagegen.** 488 → 575 kB durch Phase 5, im
Wesentlichen Zod (die Paketprüfung) und die beiden Gateways. Das ist kein
Fehler – das Portal ist nicht portabel –, aber es ist beobachtet: Für ein
Telefon im Schulnetz sind 575 kB spürbar. Zwei Hebel liegen bereit und sind
noch nicht gezogen: den Supabase-Client und die Paketprüfung erst beim ersten
Bedarf laden. Die Übernahme vom Gerät ist bereits abgetrennt (98,8 kB), die Übungsseite
ebenfalls (22,6 kB) und die KI-Seite auch (5,5 kB): Eine Lehrkraft, die nur
Material verwaltet, lädt keine davon. Phase 6 hat dem Hauptbündel 4 kB
hinzugefügt, Phase 7 noch einmal 3 kB.

**Phase 8 macht das Portalbündel zum ersten Mal kleiner** – 583 → 568 kB. Der
Grund ist kein Aufräumen, sondern ein Befund: Die kontrollierte Fälschung lag
darin (§ 6.5). Sie liegt jetzt hinter einer Bauzeitfahne, und der Bundler
faltet sie weg.

**Phase 7 kostet die portablen Dateien nichts** – 9482,3 KiB und 674,7 KiB,
unverändert. Der ganze KI-Zugang des Kontos liegt in
`supabase/functions/ai-gateway/` und in `src/cloud/aiGateway.ts`, und ein Test
am Importgraphen hält fest, dass beides von keiner portablen Datei aus
erreichbar ist.

Einmal ist dabei etwas durchgerutscht und wurde bemerkt: Das Portal band
anfangs die Datenschutzseite der kontofreien Anwendung ein, und an der hing
über die Lizenztafel der Wiktionary-Datensatz – 6,3 MB in einem Bündel, das
ohne ihn 261 kB groß war. Aufgefallen ist es an der Bündelgröße, nicht am
Nachdenken. Seitdem prüft `portableIsolation.test.ts` auch den Portal-Einstieg
auf Wörterbuch und PDF-Zweig, und das Portal hat eine eigene Datenschutzseite –
die es ohnehin braucht, weil die andere hier schlicht nicht stimmt.

---

## 9. Fortsetzungsstand

**Erledigt – mit Commit und Abnahme:**

| Phase | Commit | Inhalt | Abnahme |
| --- | --- | --- | --- |
| 0 | `f8d5871` | Audit, Ausgangsmessung, ADR-1 bis ADR-9 | 2114 Tests, 159 E2E, 29 Portable-E2E, 32 Prüfungen – alle grün (Ausgangsmessung, § 1.2) |
| 1 | `b76a025` | Laufzeitmodus, Verträge, Injektion, Shells, Route Guards, Code-Split (§ 2b) | 2242 Tests, 159 E2E, 29 Portable-E2E, 32 Prüfungen; Größen unverändert |
| 2 | `6946139` | Schema, Hilfsfunktionen, Zugriffsregeln (§ 3, § 4) | 2301 Tests, davon 59 gegen PostgreSQL 17.5; Größen unverändert; Mutationsprobe bestanden |
| 3 | `a8a44a8` | Zweiter Web-Einstieg, vierter Modus, Anmeldung, Wiederherstellung (§ 2c, ADR-10/11) | 2384 Tests, 159 E2E unverändert, 29 Portable-E2E, 11 neue Portal-E2E, 32 Prüfungen; Größen unverändert |
| 4 | `56faa8c` | Kurse, Mitgliedschaft, Einladungen; Kursvertrag gegen zwei Erfüllungen; Serverfunktion aufgetrennt und geprüft (§ 2d) | 2487 Tests, 159 E2E unverändert, 29 Portable-E2E, **20** Portal-E2E, 32 Prüfungen; Größen unverändert |
| 5 | `085b0c8` | Pakete im Konto, unveränderliche Revisionen, Zuweisung, Übernahme vom Gerät (§ 5) | 2539 Tests, 159 E2E unverändert, 29 Portable-E2E, **22** Portal-E2E, 32 Prüfungen; Größen unverändert |
| 6 | `bfc41e9` | Lernstand im Konto, geräteübergreifend und idempotent; Üben im Portal (§ 5.5) | 2589 Tests, 159 E2E unverändert, 29 Portable-E2E, **26** Portal-E2E, 32 Prüfungen; portable Dateien +0,1 KiB (§ 8) |
| 6b | `3adef03` | Korrektur: Fassung statt Client-Zeitstempel; serverseitige Eingangsprüfung (§ 5.5.3, § 5.5.4, § 5.5.8) | 2625 Tests, davon Lernstandsvertrag 2 × 32; 159 E2E unverändert, 26 Portal-E2E |
| 8 | *(folgt)* | Prüfkette, Pages-Deployment, Riegel vor dem Netz; ADR-12 (§ 6.4–6.6) | 2830 Tests, 159 E2E unverändert, 29 Portable-E2E, 31 Portal-E2E; Portalbündel −15 kB |
| 7 | `0144644` | KI-Zugang: Tresor (AES-GCM), Adressprüfung, Freigabeliste, vier Anbieter (§ 5a) | 2792 Tests, davon 123 für die Serverfunktion; 159 E2E unverändert, **31** Portal-E2E; portable Dateien unverändert |

Die Zeile der jeweils letzten Phase trägt ihre Commit-ID mit dem **folgenden**
Commit nach – vorher gibt es sie nicht. Jede Abnahme ist eine tatsächlich
ausgeführte Messung; die Einzelheiten stehen in den Abschnitten darunter. Was dabei **nicht** geprüft wurde, steht in § 7.1 –
und zwar vollständig.

**Im Einzelnen:**

- Phase 0 – Audit, Ausgangsmessung, ADR-1 bis ADR-9.
- Phase 1 – Laufzeitmodus, Hosted-Konfiguration, Repository-Verträge,
  Injektion, lokale Adapter, kontrollierte Cloudfassung, Rollenmodell,
  Route Guards, getrennte Shells, öffentliche Routen, Code-Split. Siehe § 2b.

**Messung nach Phase 1** (13.09.2026):

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | fehlerfrei |
| `npx vitest run` | **2242** Tests in **135** Dateien, alle grün (Start: 2114/125) |
| `npm run build` | erfolgreich |
| `npm run build:portable` | erfolgreich |
| `npm run verify:portable` | 32 Prüfungen, alle grün |
| `npx playwright test` | 159 E2E, alle grün |
| `… --config playwright.portable.config.ts` | 29 Portable-E2E, alle grün |
| `LexiFlow-Lehrkraft.html` | **9482,1 KiB** – unverändert |
| `LexiFlow-Lernlaufzeit.html` | **674,6 KiB** – unverändert |

Die beiden letzten Zeilen sind der Punkt: Der Portalcode liegt im Quellbaum
und in **keiner** der beiden portablen Dateien.

- Phase 2 – Schema, Hilfsfunktionen und Zugriffsregeln; geprüft gegen echtes
  PostgreSQL 17.5 per PGlite. Siehe § 3 und § 4.
- Phase 3 – zweiter Web-Einstieg unter `/LexiFlow/portal/`, vierter
  Laufzeitmodus `web-solo`, Anmeldung über Supabase Auth, Anmeldung für
  Lernende über eine Serverfunktion, Wiederherstellung für beide Wege.
  Siehe § 2c, ADR-10 und ADR-11.

**Messung nach Phase 2** (13.09.2026):

| Prüfung | Ergebnis |
| --- | --- |
| `npx vitest run` | **2301** Tests in **137** Dateien, alle grün |
| davon `npm run test:db` | 59 (45 Verhalten, 14 Struktur) gegen PostgreSQL 17.5 |
| `npm run build:portable` | 9482,1 KiB / 674,6 KiB – beide unverändert |

Phase 2 hat keine Datei unter `src/` angefasst. Neu sind
`supabase/migrations/`, `scripts/db/` und eine Entwicklungsabhängigkeit
(`@electric-sql/pglite`, Apache-2.0).

**Messung nach Phase 3** (13.09.2026):

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | fehlerfrei |
| `npx vitest run` | **2384** Tests in **141** Dateien, alle grün |
| `npm run build` | beide Web-Auslieferungen erfolgreich |
| `npm run build:portable` | erfolgreich, Größen unverändert |
| `npm run verify:portable` | 32 Prüfungen, alle grün |
| `npx playwright test` | **159** E2E – unverändert, nicht angefasst |
| `npm run e2e:portable` | 29 Portable-E2E, alle grün |
| `npm run e2e:portal` | **11** neue Portal-E2E unter `/LexiFlow/`, alle grün |

Zwei Gegenproben in dieser Phase: Ohne `navigateFallbackDenylist` schlägt die
Service-Worker-Prüfung fehl (also prüft sie etwas), und der Wörterbuch-Einzug
ins Portalbündel wurde an der Größe bemerkt, bevor ein Test danach fragte –
seitdem fragt einer.

- Phase 4 – Kurse, Mitgliedschaft und Einladungen. Abläufe in SQL, Kursvertrag
  gegen Fälschung **und** echtes PostgreSQL, Registrierung mit Code,
  aufgetrennte und geprüfte Serverfunktion, Bremse in der Datenbank.
  Siehe § 2d und ADR-11.

**Messung nach Phase 4** (13.09.2026):

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | fehlerfrei |
| `npx vitest run` | **2487** Tests in **145** Dateien, alle grün |
| davon `npm run test:db` | 73 gegen PostgreSQL 17.5 |
| davon Kursvertrag | 2 × 23 – einmal Fälschung, einmal PostgreSQL |
| davon Serverfunktion | 37 mit Fakes |
| `npm run build` | beide Web-Auslieferungen erfolgreich |
| `npm run build:portable` | 9482,1 KiB / 674,6 KiB – beide unverändert |
| `npm run verify:portable` | 32 Prüfungen, alle grün |
| `npx playwright test` | **159** E2E – unverändert, nicht angefasst |
| `npm run e2e:portable` | 29 Portable-E2E, alle grün |
| `npm run e2e:portal` | **20** Portal-E2E unter `/LexiFlow/`, alle grün |

Drei Befunde in dieser Phase stammen von Prüfungen, nicht vom Hinsehen: Das
Warnband der Testfassung fiel mit 3,7 : 1 durch die Kontrastprüfung; die
Abmeldeschaltfläche in der Navigationsschiene brachte als `<button>` die
Voreinstellungen des Browsers mit; und die Kursoberfläche wäre um 0,2 KiB in
jede Lerndatei gewandert.

- Phase 5 – Pakete im Konto, unveränderliche Revisionen, Zuweisung an Kurse,
  Übernahme vom eigenen Gerät. Siehe § 5.

**Messung nach Phase 5** (13.09.2026):

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | fehlerfrei |
| `npx vitest run` | **2539** Tests in **148** Dateien, alle grün |
| davon `npm run test:db` | 72 gegen PostgreSQL 17.5 |
| davon Kursvertrag | 2 × 23 |
| davon Paketvertrag | 2 × 21 – einmal Fälschung, einmal PostgreSQL |
| `npm run build` | beide Web-Auslieferungen erfolgreich |
| `npm run build:portable` | 9482,1 KiB / 674,6 KiB – beide unverändert |
| `npm run verify:portable` | 32 Prüfungen, alle grün |
| `npx playwright test` | **159** E2E – unverändert, nicht angefasst |
| `npm run e2e:portable` | 29 Portable-E2E, alle grün |
| `npm run e2e:portal` | **22** Portal-E2E, alle grün |

Ein Befund in dieser Phase kam wieder von einer Prüfung: Die Fälschung meldete
„der Entwurf ist neuer" nie, weil zwei Schritte in derselben Millisekunde
denselben Zeitstempel bekamen. Die Datenbank hat das Problem nicht (`now()`
mit Mikrosekunden); die Fälschung hat jetzt eine Uhr, die nie stehenbleibt.

- Phase 6 – Lernstand im Konto: Schreibweg in SQL, Lernstandsvertrag gegen
  Fälschung **und** echtes PostgreSQL, Ereignisse an genau einer Stelle
  gebaut, Üben im Portal. Siehe § 5.5.

**Messung nach Phase 6** (13.09.2026):

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | fehlerfrei |
| `npx vitest run` | **2589** Tests in **152** Dateien, alle grün |
| davon `npm run test:db` | 79 gegen PostgreSQL 17.5 |
| davon Lernstandsvertrag | 2 × 17 – einmal Fälschung, einmal PostgreSQL |
| `npm run build` | beide Web-Auslieferungen erfolgreich |
| `npm run build:portable` | 9482,2 KiB / 674,7 KiB – **+0,1 KiB**, Posten benannt (§ 8) |
| `npm run verify:portable` | 32 Prüfungen, alle grün |
| `npx playwright test` | **159** E2E – unverändert, nicht angefasst |
| `npm run e2e:portable` | 29 Portable-E2E, alle grün |
| `npm run e2e:portal` | **26** Portal-E2E, alle grün |

Eine Gegenprobe in dieser Phase: Nimmt man den Riegel gegen rückwärtslaufende
Lernstände aus der Migration heraus, fällt genau die eine Prüfung um, die ihn
beschreibt – die Prüfung prüft also etwas. Ein Befund kam von einer bestehenden
Prüfung: `reset_my_progress` fiel in die grobe Suche nach Funktionen mit
`reset` im Namen, mit der seit Phase 3 ein „die Lehrkraft setzt eben ein neues
Kennwort" abgefangen wird. Statt das Muster enger zu ziehen, steht die Funktion
jetzt als begründete Ausnahme dort – enger hieße, dass `reset_password_for`
eines Tages durchrutscht.

Die neue Portal-E2E beginnt bewusst in der **kontofreien** Anwendung: Sie legt
dort ein Paket an, übernimmt es im Portal, veröffentlicht, weist zu und übt
damit. Das ist der einzige Ort, an dem die Zusage aus § 5.4 – beide
Auslieferungen, ein Ursprung, ein IndexedDB – tatsächlich nachprüfbar ist.

- Phase 6b – Korrektur des Mehrgerätefalls. Der Riegel hing am Zeitstempel des
  Geräts; er hängt jetzt an einer Fassung. Dazu die serverseitige
  Eingangsprüfung. Siehe § 5.5.3, § 5.5.4 und § 5.5.8.

**Messung nach Phase 6b** (13.09.2026):

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | fehlerfrei |
| `npx vitest run` | **2625** Tests in **152** Dateien, alle grün |
| davon `npm run test:db` | 83 gegen PostgreSQL 17.5 |
| davon Lernstandsvertrag | 2 × 32 – einmal Fälschung, einmal PostgreSQL |
| `npm run build` | beide Web-Auslieferungen erfolgreich |
| `npm run build:portable` | 9482,3 KiB / 674,7 KiB |
| `npm run verify:portable` | 32 Prüfungen, alle grün |
| `npx playwright test` | **159** E2E – unverändert, nicht angefasst |
| `npm run e2e:portable` | 29 Portable-E2E, alle grün |
| `npm run e2e:portal` | **26** Portal-E2E, alle grün |

Zwei Gegenproben, beide bestanden. Ersetzt man den Fassungsvergleich durch
„der bessere Stand gewinnt" (`v_zeile.box > …`), fallen fünf Prüfungen um –
darunter die, die den fachlichen Rückfall von Fach 5 auf Fach 1 verlangt.
Ersetzt man ihn durch einen Vergleich der Client-Zeitstempel, fallen ebenfalls
fünf – darunter die mit der vorgestellten Uhr.

- Phase 7 – KI-Zugang: Tresor mit AES-GCM und gebundenen Zusatzdaten,
  Adressprüfung gegen SSRF, administrative Freigabeliste, vier Anbieter,
  Lehrkraftseite. Siehe § 5a, ADR-8 und ADR-9.

**Messung nach Phase 7** (13.09.2026):

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | fehlerfrei |
| `npx vitest run` | **2792** Tests in **157** Dateien, alle grün |
| davon Serverfunktion `ai-gateway` | **123** – 53 Adressprüfung, 29 Tresor, 41 Abläufe |
| davon `npm run test:db` | 103 gegen PostgreSQL 17.5 |
| `npm run build` | beide Web-Auslieferungen erfolgreich |
| `npm run build:portable` | 9482,3 KiB / 674,7 KiB – **unverändert** |
| `npm run verify:portable` | 32 Prüfungen, alle grün |
| `npx playwright test` | **159** E2E – unverändert, nicht angefasst |
| `npm run e2e:portable` | 29 Portable-E2E, alle grün |
| `npm run e2e:portal` | **31** Portal-E2E, alle grün |

Eine Gegenprobe: Entfernt man die zweite Adressprüfung – die unmittelbar vor
dem Aufruf, zusätzlich zu der beim Speichern –, fällt genau die Prüfung um,
die beschreibt, warum es sie gibt. Eine Freigabe, die nur beim Eintragen gilt,
ist keine.

**In keinem Test dieser Phase steht ein echter Schlüssel, und keiner ruft
einen Anbieter an.** Der Hauptschlüssel ist eine Folge von Siebenen, die
Anbieterschlüssel heißen `sk-test-…`, und der Transport ist eine Funktion, die
ein Objekt zurückgibt.

- Phase 8 – die vollständige Prüfkette, das Pages-Deployment und der Riegel
  davor. Dazu ADR-12: archiviert heißt abgeschlossen, nicht geschlossen.
  Siehe § 6.4 bis § 6.6.

**Messung nach Phase 8** (13.09.2026):

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | fehlerfrei |
| `npx vitest run` | **2830** Tests in **158** Dateien, alle grün |
| `npm run build` | beide Web-Auslieferungen erfolgreich |
| `npm run verify:deploy` | in Ordnung – ohne Fahne keine Testfassung in `dist/` |
| `npm run build:portable` | 9482,3 KiB / 674,7 KiB – unverändert |
| `npm run verify:portable` | 32 Prüfungen, alle grün |
| `npx playwright test` | **159** E2E – unverändert, nicht angefasst |
| `npm run e2e:portable` | 29 Portable-E2E, alle grün |
| `npm run e2e:portal` | 31 Portal-E2E, alle grün |
| Portalbündel | 582,98 kB → **567,90 kB** |

Der Befund dieser Phase kam nicht von einem Test, sondern von der neuen Wache
bei ihrem ersten Lauf: Die kontrollierte Fälschung lag im produktiven
Portalbündel. Die Begründung und die Gegenprobe stehen in § 6.5.

**Als Nächstes:** Phase 9 – Datenschutz-, Sicherheits- und Übergabedokumente.
Danach der Abschlussbericht.

**Nicht vergessen:**

- `main` nicht anfassen, nicht mergen, nicht taggen, kein Remote, nicht pushen.
- Keine echten Schlüssel, URLs oder Kontodaten.
- Keine vorbereitete Prüfung als bestanden bezeichnen.
- Nach jeder Phase: Typecheck, betroffene Tests, ein eigener Commit, dieses
  Dokument nachziehen.
