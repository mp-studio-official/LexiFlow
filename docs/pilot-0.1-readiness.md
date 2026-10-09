# Pilot 0.1 – Bereitschaftsplan

> **Stand 02.10.2026, Zweig `sprint/5a-cloud-portal-foundation`, Spitze
> `0ea0ade`.** Dieses Dokument ist die Bestandsaufnahme vor einem
> kontrollierten Pilot mit **einer** Lehrkraft und **einer kleinen
> Lerngruppe** – nicht der Pilot selbst und keine Freigabe.

## 0. Was hier steht und was nicht

Es steht hier, **was es gibt**, mit Fundstelle, und **was fehlt**, ohne
Beschönigung. Es steht hier **keine neue Produktfunktion**: Marc hat
ausdrücklich verlangt, dass die Pilotgrenze feststeht, bevor etwas gebaut
wird, und eine Bestandsaufnahme, die nebenbei Code mitbringt, ist keine.

Drei Dinge sind gesetzt und werden in keinem Schritt angetastet:

- **Kein Rücksetzen.** Weder bestehende Daten noch das Supabase-Staging.
- **`main` bleibt unverändert**, kein Merge, kein Tag – solange Marc nichts
  anderes entscheidet. Abschnitt 6.1 erklärt, warum genau das der härteste
  Punkt dieses Plans ist.
- **Keine bereits angewandte Migration wird geändert.** Migrationen 12 und 13
  liegen im Staging; jede Korrektur ist eine **neue additive** Migration.

---

## 0a. Die vier Entscheidungen – gefallen am 02.10.2026

| | Entscheidung | Folge |
| --- | --- | --- |
| **1** | Eigener **Pilotzweig** im bestehenden GitHub-Projekt. Die vorhandene Pages-Adresse wird für den Pilot verwendet; `main` bleibt unangetastet, bis der Pilot abgenommen ist. | `.github/workflows/pilot.yml`, nur auf Zuruf; offizieller Pages-Ablauf ohne persönlichen Deployment-Token; `docs/pilot-auslieferung.md` |
| **2** | **Migration 14 ist zwingend**, unabhängig von der Dashboard-Einstellung. Ein Client wird durch kein selbst angelegtes oder verändertes Profil `teacher` oder `admin`. Die offene Registrierung muss **zusätzlich** aus sein. | Migration 14, drei Riegel; `scripts/db/rollenriegel.test.mjs` |
| **3** | KI im Pilot **sichtbar und bestimmt abgeschaltet**. Kein Ausfall durch einen fehlenden Schlüssel. Schlüssel bleiben, Infrastruktur bleibt. | `src/hosted/pilot.ts`, `ohneGesperrteKi`; Freigabe ist ein eigener Abnahmeschritt |
| **4** | Das Portal ist **internetabhängig**. Jede betroffene Ansicht: eindeutiger Verbindungsfehler, „Erneut versuchen", keine endlose Ladeanzeige, keine falsche Speicherzusage. Offline bleibt die portable Lerndatei. | `src/hosted/verbindung.tsx`; keine allgemeine Offline-Synchronisierung |

> **Was sich dadurch an dieser Bestandsaufnahme ändert.** Abschnitt 1 bleibt
> stehen, wie er war – er beschreibt den Stand vom 02.10.2026 **vor** diesen
> vier Blöcken. Was seither gebaut wurde, steht in Abschnitt 3 und 4. Den
> Befund in 1.1 („es gibt heute keinen Weg ins Netz") hat Entscheidung 1
> beantwortet, nicht aufgehoben: Der Weg existiert jetzt, gelaufen ist er
> nicht.

---

## 1. Bestandsaufnahme

### 1.1 Frontend-Hosting und reproduzierbares Deployment

**Vorhanden, und zwar reif.**

| Was | Wo | Befund |
| --- | --- | --- |
| Auslieferung | `.github/workflows/deploy.yml` | baut und prüft in einem **eigenen** Auftrag mit frischem Auscheckvorgang, lädt erst danach hoch |
| Grundpfad | ebenda, `LEXIFLOW_BASE: /${{ github.event.repository.name }}/` | der Unterpfad von GitHub Pages ist abgedeckt |
| Konfiguration | ebenda, `vars.VITE_SUPABASE_URL`, `vars.VITE_SUPABASE_PUBLISHABLE_KEY` | nur die zwei Werte, die öffentlich sein dürfen |
| Testfassung | ebenda: `VITE_LEXIFLOW_FAKE_CLOUD` **ungesetzt** | die Fälschung mit Kennwort im Quelltext kann nicht ins Netz geraten |
| Riegel | `npm run verify:deploy` → `scripts/verify-deploy.mjs` | durchsucht `dist/` nach Spuren der Testfassung, nach Geheimnissen und nach Pfaden, die den Grundpfad verlassen, und **bricht ab** |
| Fehlende Konfiguration | `src/runtime/hostedConfig.ts` | zeigt eine Einrichtungsseite, statt zu werfen |
| Breitenprüfung der echten Adresse | `playwright.portal.config.ts`, gebaut unter `/LexiFlow/` | der Unterpfad wird wirklich durchlaufen |

**Die eine Lücke ist keine technische, sondern eine Zweiglücke.** Gemessen:

```
git rev-list --count main..HEAD   → 147
git ls-tree -r --name-only main -- src/hosted   → leer
```

`deploy.yml` läuft **nur auf `main`**. Auf `main` gibt es das Portal nicht.
Eine öffentlich erreichbare Pilotfassung setzt also voraus, dass dieser Stand
nach `main` gelangt – und das ist genau die Handlung, die Marc bisher
untersagt hat. **Entscheidung 6.1.**

### 1.2 Lehrkraftkonten anlegen und sperren, ohne Dashboard

**Die zentrale Lücke – und sie ist seit dem 29.09.2026 beschrieben.**

`docs/inbetriebnahme-staging.md` §14 benennt sie vollständig: Handarbeit über
den SQL-Editor ist **für genau eine Lehrkraft freigegeben**, für mehr nicht,
und zwar nicht aus Bequemlichkeit, sondern weil Dashboard-Zugang sich nicht
auf „darf Lehrkräfte anlegen" einschränken lässt. Wer dort anlegen darf, kann
dort auch Lernstände lesen – das widerspricht dem Produktversprechen.

Der Stand im Code:

- `/verwaltung` ist ein Platzhalter. `src/hosted/teacher/TeacherArea.tsx`
  zeigt eine Meldung „Kommt in Phase 3" mit dem Satz: *„Konten und Rollen.
  Auch hier gilt: keine Einsicht in individuelle Lernstände – die gibt es in
  keiner Rolle."*
- **Lernendenkonten gibt es fertig**: Einladungscode → Edge Function
  `learner-auth` → `create_learner_account`, Kurzkennung aus
  kryptografischem Zufall. Der Weg, den §14 für Lehrkräfte fordert,
  existiert für Lernende bereits – er müsste nicht erfunden, sondern
  übertragen werden.
- **Sperren gibt es für niemanden.** Gesucht und nicht gefunden: keine Spalte
  `disabled_at`, kein Zustand „gesperrt", keine Regel darauf. Was es gibt,
  ist das Entfernen einer **Mitgliedschaft** – belegt in §6.12, mit dem
  richtigen Verhalten (Zugriff endet, Lernstand bleibt). Für ein
  Lehrkraftkonto gibt es das Gegenstück nicht.

> **Gemessener Sicherheitsbefund, offen und nicht stillschweigend behoben.**
> Die Regel `profiles_insert_self` schränkt **nur** `id = auth.uid()` ein,
> **nicht** `role`. In der PGlite-Probe:
>
> ```
> SELBST ALS LEHRKRAFT: teacher
> ROLLE HOCHSETZEN: abgelehnt — permission denied for table profiles
> ```
>
> Ein neu angelegtes Konto kann sich sein eigenes Profil also mit
> `role = 'teacher'` (oder `'admin'`) anlegen; erst das spätere **Ändern** der
> Rolle scheitert am Spaltenrecht. **Ob das ausnutzbar ist, hängt allein
> daran, ob im Stagingprojekt die Registrierung per E-Mail eingeschaltet ist.
> Das kann ich von hier nicht prüfen, und ich rate nicht.** Ist sie aus, ist
> der Befund folgenlos; ist sie an, ist er ein Pilotblocker. Die Behebung wäre
> eine **Migration 14** (additiv) – sie wird hier **nicht** vorweggenommen.
> **Entscheidung 6.2.**

### 1.3 Der vollständige Live-Happy-Path

Alle Bausteine existieren im Code; belegt ist nur die erste Hälfte.
`docs/inbetriebnahme-staging.md` §0.5 (Stand 29.09.2026) sagt es selbst:

| Schritt | Code | Im Staging belegt |
| --- | --- | --- |
| Lehrkraft anmelden | `src/hosted/pages/LoginPage.tsx` | **ja** (§6.3) |
| Kurs anlegen | `src/hosted/teacher/CoursesPage.tsx` | **ja** (§6.4) |
| Bestehendes Paket übernehmen | `src/hosted/teacher/LocalImportPanel.tsx`, `MaterialPage.tsx` | nein |
| Veröffentlichen | `MaterialPage.tsx`, `CourseDetailPage.tsx` | **nein** (§6.7 offen) |
| Kurs zuweisen | `CourseDetailPage.tsx` | teilweise (Code §6.5 belegt) |
| Schülerkonto per Code | `src/hosted/pages/JoinPage.tsx` + `learner-auth` | **ja** (§6.6) |
| Beide Lernrichtungen, Übungsformen | `src/hosted/learner/UebenPage.tsx`, 5B.15 `9e14b81` | **nein** (§6.7 offen) |
| Fortschritt synchronisieren | `PracticePage.tsx`, `entry_progress` | **nein** (§6.8, §6.9 offen) |

Das heißt: **der Happy-Path bricht genau dort ab, wo der Pilot anfängt.**
Veröffentlichen, Üben und Synchronisieren sind nie an echtem Supabase
gelaufen. Sie sind nicht „wahrscheinlich in Ordnung" – sie sind ungeprüft.

### 1.4 Wiederherstellung, Abmelden, Rollen, Fehler, Offline, Leerzustände

| Thema | Stand |
| --- | --- |
| Wiederherstellung | `RecoveryPage.tsx`, `NewPasswordPage.tsx`, `src/hosted/recovery.test.tsx`; §7.8 belegt **ohne** SMTP, §7.9 (E-Mail-Weg) offen |
| Abmelden | `SessionContext.tsx`, `PortalShell.tsx` – vorhanden |
| Rollen und Rechte | `RequireArea.tsx` im Browser, **Zugriffsregeln** in der Datenbank; §7.1, §7.2, §7.7 teils belegt |
| Fehler- und Leerzustände | `src/ui/zustaende.tsx`, in jeder Lernseite benutzt |
| Offline | **keine eigene Behandlung im Portal.** Gesucht: `navigator.onLine` kommt im Portalpfad nicht vor. Offlinefähig ist die **portable** Lerndatei, nicht das Portal. |

Offline ist damit eine Entscheidung und kein Fehler: Ein Portal, das ohne Netz
nichts tut, ist für einen Pilot vertretbar – aber es muss **sagen**, dass es
das Netz braucht, statt in einen Ladezustand zu laufen. **Entscheidung 6.4.**

### 1.5 KI im Pilot

Heute gibt es **keinen Schalter**. Gesucht und nicht gefunden: kein
`ai_enabled`, keine Einrichtungs- oder Kurseinstellung dafür. Die Mechanik
ist „Schlüssel der Lehrkraft": `src/hosted/teacher/AiPage.tsx` nimmt ihn
entgegen, die Edge Function `ai-gateway` benutzt ihn serverseitig, der
Klartext ist für den Browser nicht lesbar. Trägt niemand einen Schlüssel ein,
passiert nichts; trägt die Lehrkraft einen ein, ist KI an.

Für einen Pilot mit Minderjährigen ist „zufällig aus, weil niemand etwas
eingetragen hat" kein Zustand, sondern eine Lücke. **Entscheidung 6.3.**

### 1.6 Datenschutz, Support, Sicherung, Rückfall

| Thema | Vorhanden | Fehlt |
| --- | --- | --- |
| Datenschutz | `docs/portal-datenschutz-und-sicherheit.md`, `src/hosted/pages/PortalPrivacyPage.tsx`, `docs/gemini-datenschutz-und-sicherheit.md` | Auftragsverarbeitung/Einwilligung für **Minderjährige**, Löschweg auf Zuruf, Aufbewahrungsdauer |
| Support | — | kein benannter Weg, wie eine Lehrkraft im Pilot ein Problem meldet |
| Sicherung | Supabase-eigene Sicherungen | **kein geprüfter Wiederherstellungsversuch**, keine Aussage über Häufigkeit und Rückhaltezeit |
| Rückfall | `docs/inbetriebnahme-staging.md` §12 „Rückbauplan" – vorhanden und brauchbar | nicht auf den Pilotfall zugeschnitten (laufende Lerngruppe statt leeres Staging) |

Ein Rückfall, der für einen Pilot taugt, muss eine Frage beantworten, die §12
nicht stellt: **Was tut die Lerngruppe am Mittwoch, wenn das Portal am
Dienstag abgeschaltet wird?** Die ehrliche Antwort gibt es schon – die
**portable Lerndatei** läuft ohne Konto und ohne Netz. Sie ist der Rückfall,
und sie muss vor dem Pilot in der Hand der Lehrkraft sein, nicht danach.

### 1.7 Bedienungsanleitungen

`docs/PILOT-ANLEITUNG.md` existiert, beschreibt aber die **portable** Datei –
erste Zeile sinngemäß „keine Installation, kein Konto, keine Anmeldung". Für
das Portal gibt es keine Anleitung. Für Lernende gibt es keine.

### 1.8 Pilotkennzeichnung

**Nirgends vorhanden.** Weder in der Hülle noch auf der Startseite noch in der
Anmeldung steht, dass dies ein Pilot ist. Für eine öffentlich erreichbare
Adresse mit Minderjährigen ist das keine Kosmetik.

---

## 2. Abhängigkeiten

```
            ┌─────────────────────────────────────────┐
            │ E1  Entscheidung: Pfad nach `main`      │  ← blockiert alles
            └───────────────┬─────────────────────────┘
                            │
            ┌───────────────┴─────────────┐
            │ Öffentliche Adresse         │
            └───────────────┬─────────────┘
                            │
   ┌────────────────────────┼────────────────────────┐
   │                        │                        │
┌──┴───────────────┐  ┌─────┴──────────────┐  ┌──────┴───────────┐
│ E2 Registrierung │  │ Happy-Path 6.7–    │  │ Pilotband        │
│ an/aus → ggf.    │  │ 6.10 am echten     │  │ (Kennzeichnung)  │
│ Migration 14     │  │ Staging nachholen  │  └──────┬───────────┘
└──┬───────────────┘  └─────┬──────────────┘         │
   │                        │                        │
   │                  ┌─────┴──────────────┐         │
   │                  │ Anleitungen        │◄────────┘
   │                  │ (Lehrkraft/Lernende)│
   │                  └─────┬──────────────┘
   │                        │
┌──┴────────────────────────┴───────────────────────┐
│ Datenschutz Minderjährige · Support · Rückfall    │
└───────────────────────────────────────────────────┘

Nicht im Pfad, weil für **eine** Lehrkraft nach §14 freigegeben:
   Verwaltungsoberfläche zum Anlegen   → nach dem Pilot
Im Pfad, weil es sie für niemanden gibt:
   Sperren eines Kontos                → E4
```

Drei Abhängigkeiten sind echt und nicht verhandelbar:

1. **Ohne Entscheidung zu `main` gibt es keine öffentliche Adresse.** Jede
   andere Arbeit ist davor sinnlos oder danach ohnehin nötig.
2. **Ohne geklärte Registrierung ist der Rollenbefund (1.2) ungeklärt.** Eine
   öffentliche Adresse mit offener Registrierung und selbst setzbarer Rolle
   wäre ein Fehler, den man nicht nachträglich zurücknimmt.
3. **Ohne gelaufenen Happy-Path 6.7–6.10 weiß niemand, ob der Pilot am ersten
   Tag funktioniert.** Das ist keine Absicherung, das ist die Grundlage.

---

## 3. Die Prüfungen – Stand nach A bis G

`npm run pilot:pruefen` prüft zwölf Punkte. Acht stehen; die vier offenen
sind genau die Handlungen, die ein Mensch am echten System tun muss.

> **Stand 09.10.2026.** Prüfung 4 ist grün: Migration 14 wurde im SQL Editor
> angewandt und die Historie nachgetragen, Migration 15 danach einzeln per
> `db push` – beide gemessen, beide Protokolle umgeschrieben. Der Live-Happy-
> Path ist bis auf die Beitrittsgegenprobe nach der Archivierung gelaufen;
> Prüfung 5 bleibt deshalb bewusst rot. Prüfung 11 ist wegen des fehlenden
> Sicherungsverfahrens weiterhin rot (siehe unten).

| # | Prüfung | Stand |
| --- | --- | --- |
| 1 | Der Auslieferungsweg für den Pilotzweig ist bereit | **grün** |
| 2 | Der Rollenriegel liegt bereit (Migration 14) | **grün** |
| 3 | Der Sperrweg liegt bereit (Migration 15) | **grün** |
| 4 | Die Migrationen 14 und 15 sind im Staging angewandt | **grün** (06.10.2026) |
| 5 | Der Happy-Path 6.7 bis 6.10 ist im Staging belegt | **rot** – 6.7 bis 6.9 belegt; in 6.10 fehlt nur die Live-Gegenprobe „neues Konto + alter Code" |
| 6 | Die Anwendung trägt eine Pilotkennzeichnung | **grün** |
| 7 | KI ist bestimmt gesperrt, nicht zufällig aus | **grün** |
| 8 | Jede Ansicht, die Daten holt, kennt den Verbindungsfehler | **grün** |
| 9 | Es gibt Anleitungen für das Portal – für beide Seiten | **grün** |
| 10 | Das Pilot-Abnahmeprotokoll ist abgearbeitet | **rot** |
| 11 | Für das Stagingprojekt ist ein Sicherungsverfahren belegt | **rot** |
| 12 | Der anonyme Beitritt in archivierte Kurse ist geschlossen | **rot** – Migration 16 liegt geprüft bereit, ist im Staging aber noch nicht angewandt |

> **Zwei Prüfungen aus der ersten Fassung sind weggefallen, und warum.**
>
> „`src/hosted` liegt auf `main`" wäre mit Entscheidung 1 eine Prüfung
> geworden, die man grün macht, indem man genau das tut, was untersagt ist.
> An ihre Stelle tritt der Pilotzweig.
>
> „`/verwaltung` ist kein Platzhalter mehr" gehört nicht in die Pflichtliste:
> Das **Anlegen** einer Lehrkraft ist nach §14 der Inbetriebnahme für genau
> eine Lehrkraft als Handarbeit freigegeben. Was fehlte, war das **Sperren**
> – und das ist jetzt Prüfung 3.

Die Prüfung bleibt bewusst außerhalb von `npm run verify`: Sie misst den
Abstand zu einem Ziel, nicht die Richtigkeit des Quelltextes.

---

## 4. Was gebaut wurde

| Commit | Inhalt |
| --- | --- |
| `bba32b6` | Bestandsaufnahme, Dreiteilung; 5B.9–5B.14 pausiert |
| `94f33dd` | `npm run pilot:pruefen`, erste Fassung – acht rote Prüfungen |
| `f0eddc7` | **Migration 14**, Rollenriegel; roter Ausgangstest zuerst |
| `1da6edd` | Pilotband, bestimmte KI-Sperre, ehrliche Verbindungszustände |
| `12cb401` | **Migration 15**, ein Konto stilllegen |
| `745123d` | Auslieferungsweg für den Pilotzweig; Bandriegel in `verify:deploy` |
| `18ba48d` | Anleitungen für Lehrkraft und Lernende |
| *dieser* | Prüfungen auf den neuen Schnitt, Abnahmeprotokoll, dieses Kapitel |

Keine der beiden Migrationen ist angewandt. Nichts ist ausgeliefert. `main`
ist unverändert.

### Drei Befunde aus der Arbeit, die nicht geplant waren

1. **Der Auslöser aus Migration 14 war zweimal falsch.** Erst rief er
   `auth.uid()` – die wirft, wenn die Ansprüche leer sind, also genau beim
   Besitzer, und damit hätte niemand mehr eine Lehrkraft anlegen können.
   Dann war er `security definer` – dort ist `current_user` der Besitzer, der
   Vergleich traf nie zu, und der Riegel war eine Zeile, die nur so aussah.
2. **Der Sperrschalter in Migration 15 griff zuerst nicht beim Besitz.** Die
   Regeln auf `courses`, `packs` und `ai_connections` fragen die
   Hilfsfunktionen gar nicht. Der naheliegende Schluss – sie eben durch die
   Funktionen zu schicken – war schlimmer: `insert … returning` prüft die
   Leseregel auf der neu entstehenden Zeile, und eine `stable` Funktion sieht
   sie dort nicht. 27 Prüfungen wurden rot, zu Recht.
3. **Der Offlinebefund war schlimmer als gedacht.** Nicht „keine
   Offlinemeldung", sondern drei falsche Auskünfte: eine Ladeanzeige ohne
   Ende, „Noch kein Kurs", „Kurs nicht gefunden" – jede davon sieht aus wie
   eine Auskunft.

---

## 5. Zwingend vor Pilot · darf während fehlen · erst nach Pilot

### 5.1 Zwingend vor dem Pilot

> **Die beiden Migrationen werden einzeln angewandt, nicht zusammen.**
> `db push` kennt keine Zielfassung und würde 14 und 15 gemeinsam anwenden —
> danach wäre Abschnitt B von Migration 14 nicht mehr prüfbar (er erwartet
> 101 Spalten und 39 Funktionen; mit 15 stünden dort 102 und 40). Der Weg
> steht als zwei getrennte Befehlsfolgen in `docs/pilot-abnahme.md`, Teil A.


| Punkt | Stand |
| --- | --- |
| Pilotkennzeichnung auf jeder Seite | **gebaut** |
| KI bestimmt abgeschaltet | **gebaut** |
| Ehrliche Verbindungs- und Leerzustände | **gebaut** |
| Rollenriegel (Migration 14) | **liegt bereit**, Folge A des Protokolls (A3) |
| Ein Weg, ein Konto stillzulegen (Migration 15) | **liegt bereit**, Folge B des Protokolls (A4) |
| Offene Registrierung aus | Teil A1 |
| Happy-Path 6.7–6.10 am echten Staging | Teil B |
| Datenschutzhinweis und Löschweg für Minderjährige | **vorbereitet** – `docs/pilot-information-eltern.md`, `docs/pilot-loeschprobe.md`; beide noch nicht ausgeführt |
| Benannte Ansprechperson | Teil E3 |
| **Ein Sicherungsverfahren** | **offen und blockierend** – siehe 6.1 |
| Rückfall: portable Lerndatei – technisch | **belegt** (06.10.2026): 32 + 29 Prüfungen grün, Prüfsummen in Teil E5 |
| Rückfall: portable Lerndatei – **übergeben** | **offen.** Eine geprüfte Datei im Projektordner hilft am Mittwoch niemandem |
| Anleitungen für beide Seiten | **gebaut** |
| Öffentliche Adresse mit dem echten Stand | Teil F |

### 5.2 Darf während des Pilots fehlen

| Punkt | Umgang im Pilot |
| --- | --- |
| Verwaltungsoberfläche zum **Anlegen** von Lehrkräften | §14: Handarbeit für genau eine Lehrkraft, dokumentiert |
| Eine Lehrkraftbefugnis zum Stilllegen fremder Konten | serverseitig; die Lehrkraft entfernt die Mitgliedschaft, das wirkt sofort |
| Anmeldesperre für stillgelegte Konten | sie sehen nichts; die Anmeldung führt Supabase Auth |
| Offlinefähigkeit des Portals | ehrlicher Hinweis, portable Lerndatei als Offlineweg |
| E-Mail-Wiederherstellung mit SMTP (§7.9) | bei einer Lehrkraft genügt der Weg über die Administration |
| Titelbilder (5B.9), Zeitformen (5B.10), geplante Veröffentlichung (5B.11) | pausiert |
| Werkstatt im Portal (5B.13, 5B.14) | portable Werkstatt, dann übernehmen |
| Mobile Sonderfälle (5B.12) | die Breitensuite deckt 390 px ab |
| Geprüfter Wiederherstellungsversuch der Sicherung | vertretbar, **wenn** der Rückfall steht (E4, E5) |

### 5.3 Erst nach dem Pilot

| Punkt | Warum erst dann |
| --- | --- |
| Mehrere Lehrkräfte, volle Verwaltung nach §14 | dafür ist der Pilot der Erkenntnisgewinn |
| Vermerk „wer gab wem wann welche Rolle" | braucht die Verwaltung darüber |
| KI-Freigabe | eigener Abnahmeschritt: Anbieter, Datenfluss, Datenschutzhinweis, echter Durchlauf |
| Echter Betrieb statt Staging, getrennte Projekte | Entscheidung mit Kosten, die der Pilot begründen soll |
| Merge nach `main` und Etikett | nach der Abnahme, nicht davor |
| 5B.16 Endabnahme | setzt die pausierten Blöcke voraus |

---

## 6. Was offen bleibt – und bei wem

### 6.1 Die Sicherung – eine Entscheidung, und sie blockiert

> **Befund vom 06.10.2026.** Das Stagingprojekt läuft im kostenfreien Tarif
> von Supabase. Der enthält **keine** Projektsicherungen; planmäßige
> Sicherungen über sieben Tage gibt es erst im Pro-Tarif. Es gibt damit
> derzeit **kein Sicherungsintervall und keine Aufbewahrungsdauer**.
>
> Die frühere Zeile in diesem Dokument („Supabase-eigene Sicherungen") war
> damit falsch. Sie stand da, weil ich angenommen habe, was im Dashboard
> allgemein über tägliche Sicherungen steht, gelte auch für dieses Projekt.

Vor dem ersten echten Konto ist zu entscheiden:

| | Weg | Was dann gilt |
| --- | --- | --- |
| **a** | Pro-Tarif vor echten Schülerdaten | tägliche Sicherung, sieben Tage Aufbewahrung |
| **b** | Ein eigenes Verfahren, beschrieben **und** praktisch getestet | Intervall, Ablageort, Aufbewahrungsdauer und ein gelaufener Wiederherstellungsversuch – alle vier |

**Bis dahin: nur künstliche Testdaten.** Ein verlorener Lernstand einer
echten Lerngruppe wäre nicht wiederherstellbar, und das ist keine Lage, in
die man eine Schulklasse bringt.

### 6.2 Wer gerade was macht

| | |
| --- | --- |
| **Codex** | GitHub-Anbindung, Pilotzweig, Ablauf, Pages, Deployment, technische Browserabnahme |
| **Hier** | Protokolle, Elternblatt, Löschprobe, Prüfungen, Datenbank |

Teil F wird in diesem Protokoll mitgeführt, aber nicht parallel abgearbeitet.

### 6.3 Eine Frage, die beim Abarbeiten auftauchen wird

> **Darf eine Lehrkraft ein Konto über ihren eigenen Kurs hinaus
> stilllegen?** Heute nicht: `authenticated` hat auf `disabled_at` kein
> Schreibrecht, der Schalter ist serverseitig. Das ist bewusst so – es wäre
> die erste Befugnis dieser Art im Produkt. Für einen Pilot mit **einer**
> Lehrkraft reicht das Entfernen aus dem Kurs. Für eine Schule wird die
> Frage neu gestellt.

---

## 7. Was dieses Dokument nicht kann

Es kann nicht sagen, ob der Pilot gelingt. Es kann sagen, was gebaut ist,
was belegt ist und was noch niemand getan hat – und es trennt die drei. Der
erste Mensch, der `docs/pilot-abnahme.md` abarbeitet, wird Dinge finden, die
hier nicht stehen, aus demselben Grund, aus dem
`docs/inbetriebnahme-staging.md` §15 dasselbe sagt.
