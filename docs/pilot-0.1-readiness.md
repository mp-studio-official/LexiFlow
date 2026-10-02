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

## 3. Rote Ausgangsprüfungen

`npm run pilot:pruefen` (→ `scripts/pilotreife.mjs`) prüft acht Punkte und
**ist heute rot**. Sie ist bewusst **kein** Vitest und **nicht** Teil von
`npm run verify`: Sie misst nicht den Quelltext, sondern den Abstand zum
Pilot, und sie soll rot bleiben dürfen, ohne CI zu brechen.

| # | Prüfung | heute |
| --- | --- | --- |
| 1 | Der Auslieferungszweig trägt das Portal (`src/hosted` in `main`) | **rot** |
| 2 | `/verwaltung` ist kein Platzhalter mehr | **rot** |
| 3 | Es gibt einen Weg, ein Konto zu sperren | **rot** |
| 4 | `profiles_insert_self` schränkt die Rolle ein | **rot** |
| 5 | §0.5 belegt 6.7 bis 6.10 | **rot** |
| 6 | Es gibt eine Pilotkennzeichnung in der Hülle | **rot** |
| 7 | Es gibt eine Portalanleitung für Lehrkraft und für Lernende | **rot** |
| 8 | Die KI-Entscheidung ist im Produkt verankert, nicht nur im Dokument | **rot** |

Jede dieser acht Prüfungen hat eine Gegenprobe: Sie wird grün, wenn – und nur
wenn – das Fehlende wirklich da ist. Das Skript nennt bei jedem roten Punkt
die Fundstelle, an der er grün würde.

---

## 4. Commitfolge

So kompakt, wie es geht, und **keiner dieser Commits beginnt eine neue
Produktfunktion**:

| # | Commit | Inhalt |
| --- | --- | --- |
| **P0** | *dieser* | Bestandsaufnahme, Abhängigkeiten, Dreiteilung; 5B.9–5B.14 pausiert |
| **P1** | *dieser* | `scripts/pilotreife.mjs`, `npm run pilot:pruefen`; acht rote Prüfungen mit Gegenproben |
| — | **Halt** | **Entscheidungen 6.1 bis 6.4.** Ohne sie steht die Pilotgrenze nicht fest. |
| P2 | Pilotband | Kennzeichnung in der Hülle, auf Anmeldung und Beitritt; Prüfung 6 wird grün |
| P3 | Rollenriegel | **nur falls Entscheidung 6.2 es verlangt**: Migration 14, additiv, lokal am Harness geprüft, **nicht** deployt; Prüfung 4 |
| P4 | KI-Grenze | der in 6.3 entschiedene Zustand, sichtbar statt zufällig; Prüfung 8 |
| P5 | Sperren | der kleinste tragfähige Weg, ein Konto stillzulegen; Prüfung 3 |
| P6 | Anleitungen | Portalanleitung Lehrkraft, Anleitung Lernende; Prüfung 7 |
| P7 | Abnahmeprotokoll | 6.7–6.10 am echten Staging, mit gemessenen Zahlen; Prüfung 5 |
| P8 | Auslieferung | der in 6.1 entschiedene Weg; Prüfung 1 |

P2 bis P8 sind **Vorschlag**, nicht Zusage: Nach den Entscheidungen kann die
Reihenfolge anders richtig sein, und P3 entfällt womöglich ganz.

---

## 5. Zwingend vor Pilot · darf während fehlen · erst nach Pilot

### 5.1 Zwingend vor dem Pilot

| Punkt | Warum nicht später |
| --- | --- |
| Öffentliche Adresse mit dem **echten** Stand | ohne sie gibt es keinen Pilot |
| **Pilotkennzeichnung** sichtbar auf jeder Seite | niemand darf das für ein fertiges Produkt halten |
| Happy-Path **6.7 bis 6.10** am echten Staging gelaufen | sonst ist der erste Schultag die erste Prüfung |
| **Registrierung geklärt**, ggf. Rollenriegel (Migration 14) | eine offene Rollenvergabe im Netz nimmt man nicht zurück |
| **KI-Zustand entschieden und sichtbar** | bei Minderjährigen kein Zufallszustand |
| Ein Weg, ein Konto **zu sperren** | ohne ihn gibt es keine Reaktion auf einen Vorfall |
| **Datenschutzhinweis für Minderjährige**, Löschweg benannt | rechtliche Voraussetzung, nicht Komfort |
| **Rückfall**: portable Lerndatei in der Hand der Lehrkraft | sonst steht der Unterricht bei jeder Störung |
| **Anleitungen** für Lehrkraft und Lernende | eine Lehrkraft ohne Dashboard braucht sie |
| Ein **benannter Supportweg** | sonst endet jedes Problem in Stille |

### 5.2 Darf während des Pilots fehlen

| Punkt | Umgang im Pilot |
| --- | --- |
| Verwaltungsoberfläche zum **Anlegen** von Lehrkräften | §14: Handarbeit für **genau eine** Lehrkraft ist freigegeben und dokumentiert |
| Offlinefähigkeit des Portals | ein ehrlicher Hinweis „ohne Netz geht hier nichts" genügt |
| E-Mail-Wiederherstellung mit SMTP (§7.9) | bei einer Lehrkraft genügt der Weg über die Administration |
| Titelbilder (5B.9), Zeitformen (5B.10), zeitgesteuerte Veröffentlichung (5B.11) | pausiert, siehe `docs/umsetzungsplan-5b.md` |
| Werkstatt im Portal (5B.13, 5B.14) | die Lehrkraft baut Pakete weiter in der portablen Werkstatt und übernimmt sie |
| Mobile Sonderfälle (5B.12) | die Breitensuite deckt 390 px ab; Feinschliff kann warten |
| Geprüfter Wiederherstellungsversuch der Sicherung | bei kleiner Datenmenge vertretbar, **wenn** der Rückfall steht |

### 5.3 Erst nach dem Pilot

| Punkt | Warum erst dann |
| --- | --- |
| Mehrere Lehrkräfte und damit die volle Verwaltung nach §14 (1–5) | genau dafür ist der Pilot der Erkenntnisgewinn |
| Fachlicher Vermerk „wer gab wem wann welche Rolle" | braucht die Verwaltung darüber |
| Rollenwechsel und -entzug in der Oberfläche | dito |
| Echter Betrieb statt Staging, getrennte Projekte | eine Entscheidung mit Kosten, die der Pilot begründen soll |
| 5B.16 Endabnahme | setzt die pausierten Blöcke voraus |

---

## 6. Offene fachliche Entscheidungen

Keine davon treffe ich still. Jede ändert den Plan erheblich.

### 6.1 Wie kommt der echte Stand ins Netz?

147 Commits liegen zwischen `main` und diesem Zweig, und `deploy.yml` läuft
nur auf `main`. Denkbar sind unter anderem: ein Merge nach `main` (heute
untersagt), eine Auslieferung aus einem Pilotzweig (verlangt eine Änderung an
`deploy.yml`), oder eine getrennte Pilotadresse. **Ohne diese Entscheidung
steht alles still.**

### 6.2 Ist die Registrierung per E-Mail im Stagingprojekt eingeschaltet?

Das entscheidet, ob der Befund aus 1.2 ein Blocker oder folgenlos ist. Es ist
**eine Einstellung im Supabase-Dashboard**, die ich von hier nicht lesen kann.
Ist sie an, braucht es vor dem Pilot Migration 14.

### 6.3 KI im Pilot: vollständig frei oder sichtbar abgeschaltet?

Heute: keine Entscheidung, nur ein Nebeneffekt. „Sichtbar abgeschaltet" ist
die Variante mit weniger Arbeit **und** weniger Risiko; „frei" verlangt
zusätzlich eine Aussage über den Anbieter im Datenschutzhinweis.

### 6.4 Was tut das Portal ohne Netz?

Ein ehrlicher Hinweis genügt für den Pilot – aber es muss einer sein und kein
ewiger Ladezustand.

---

## 7. Was dieses Dokument nicht kann

Es kann nicht sagen, ob der Pilot gelingt. Es kann sagen, was heute fehlt, und
das tut es ohne Rundung. Der erste Mensch, der Abschnitt 5.1 abarbeitet, wird
Dinge finden, die hier nicht stehen – aus demselben Grund, aus dem
`docs/inbetriebnahme-staging.md` §15 dasselbe sagt.
