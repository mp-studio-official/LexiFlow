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
PostgREST (die HTTP-Schicht), die Edge-Function-Laufzeit, Supabase-eigene
Rollen und Erweiterungen. Die Policies sind echt geprüft, die Plattform
darunter ist nachgebildet. Diese Unterscheidung gehört in jeden Bericht.

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
Rollenwechsel. 45 Verhaltensprüfungen und 14 strukturelle.

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

*Wird in Phase 5 und 6 gefüllt.*

## 6. Einrichtung

*Wird in Phase 8 gefüllt.*

## 7. Offene Risiken

| Risiko | Stand |
| --- | --- |
| GoTrue, PostgREST und Edge-Laufzeit sind lokal nicht prüfbar | bekannt, ADR-6; muss am echten Projekt nachgeholt werden |
| DNS-Rebinding bei benutzerdefinierten KI-Hosts | bekannt, ADR-9; nur durch Freigabeliste eingegrenzt |
| Wiederherstellungscode geht verloren → Konto ist verloren | bewusst; Bestätigungsschritt beim Anlegen |
| EU-Region ist kein Datenschutznachweis | bekannt; organisatorische Prüfung vor Schulbetrieb nötig |
| Supabase-Backups löschen nicht sofort mit | zu dokumentieren, nicht zu behaupten |

## 8. Größenwacht

Die Lernlaufzeit lag beim Start bei **674,6 KiB**. Jede Phase misst neu; ein
Wachstum durch Cloudcode wäre ein Fehler, kein Preis.

---

## 9. Fortsetzungsstand

**Erledigt:**

- Phase 0 – Audit, Ausgangsmessung, ADR-1 bis ADR-9 (`f8d5871`).
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

**Messung nach Phase 2** (13.09.2026):

| Prüfung | Ergebnis |
| --- | --- |
| `npx vitest run` | **2301** Tests in **137** Dateien, alle grün |
| davon `npm run test:db` | 59 (45 Verhalten, 14 Struktur) gegen PostgreSQL 17.5 |
| `npm run build:portable` | 9482,1 KiB / 674,6 KiB – beide unverändert |

Phase 2 hat keine Datei unter `src/` angefasst. Neu sind
`supabase/migrations/`, `scripts/db/` und eine Entwicklungsabhängigkeit
(`@electric-sql/pglite`, Apache-2.0).

**Als Nächstes:** Phase 3 – Anmeldung und Wiederherstellung. Erst dort rendert
`src/main.tsx` das Portal statt `App`.

**Nicht vergessen:**

- `main` nicht anfassen, nicht mergen, nicht taggen, kein Remote, nicht pushen.
- Keine echten Schlüssel, URLs oder Kontodaten.
- Keine vorbereitete Prüfung als bestanden bezeichnen.
- Nach jeder Phase: Typecheck, betroffene Tests, ein eigener Commit, dieses
  Dokument nachziehen.
