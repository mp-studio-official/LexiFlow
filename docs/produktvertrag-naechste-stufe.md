# Produktvertrag: die nächste Stufe

Zweig `claude/next-product-experience`, ab `486abb6`. Eigener Worktree unter
`.worktrees/next-product-experience`; der Pilotcheckout bleibt auf
`sprint/5a-cloud-portal-foundation` stehen und wird nicht umgeschaltet.

Der Pilot 0.1 ist eingefroren. Hier entsteht die Stufe danach — als
**Bausteine mit Verträgen**, nicht als verdrahtete Routen. Die produktive
Verdrahtung übernimmt Codex nach der Übergabe.

## 1. Was hier gebaut wird

| Block | Inhalt |
| --- | --- |
| A | Universalimport und Portal-Werkstatt |
| B | Private Motivation — ohne Vergleich, ohne Lehrkraftsicht |
| C | Sprachlernverträge: Flexion, Ergänzungsmuster, gestufte Hinweise, Fehlererklärung |
| D | Schüler-KI als reine Oberfläche mit Fake-Anbieter |

## 2. Was hier **nicht** gebaut wird

Ausschließlich bei Codex, in diesem Zweig unverändert:

- `src/ai/**`, `src/cloud/**`
- `supabase/functions/**`, `supabase/migrations/**`
- `.github/workflows/**`
- Auslieferung, Domain, Secrets, produktive KI-Freigabeschalter

Keine echten KI-Netzaufrufe, keine Schlüsselablage, keine Migration, kein
Deployment. Kein Schlüssel — auch kein erfundener, der wie einer aussieht.

### Übergabedateien

Diese Dateien sind die Nahtstelle zur produktiven Anwendung. Sie bleiben in
diesem Auftrag unverändert; was sie bräuchten, steht stattdessen im
Übergabedokument:

- `src/hosted/HostedApp.tsx` (Routen)
- `src/hosted/teacher/AiPage.tsx`
- `src/hosted/learner/PracticePage.tsx`
- die zentralen Repositoryverträge in `src/application/repositories.ts`
- `package.json`

## 3. Wo neues entsteht

```
src/import/universal.ts          eine Eintrittsfunktion über die vorhandenen Leser
src/hosted/teacher/werkstatt/**  die Portal-Werkstatt
src/domain/motivation/**         Tagesziel, Auszeichnungen, Rundenfortschritt
src/hosted/learner/motivation/** deren Oberfläche
src/hosted/learner/ki-ui/**      die Lerncoach-Oberfläche samt Fake-Anbieter
docs/**                          Vertrag, Entscheidungen, Übergabe
```

## 4. Drei Befunde aus der Bestandsaufnahme

Sie ändern den Zuschnitt der Arbeit, und zwar nach unten. Festgehalten,
damit niemand später nach Code sucht, der absichtlich nicht entstanden ist.

**Der Import ist zu neun Zehnteln gebaut.** `src/import/` hat `parseCsv`,
`parsePastedText`, `readXlsx`, `looksStructured`, `parseStructuredList`,
`detectColumns`, `buildDrafts`, `validateDrafts`, `summarize` — und mit
`DraftRow`/`DraftIssue` ein Befundmodell, das Fehler, Warnungen und offene
fachliche Befunde bereits unterscheidet. Was fehlt, ist **eine** Funktion,
die Rohtext oder Datei entgegennimmt und das Format selbst bestimmt. Heute
entscheidet das ein Radiobutton in `ImportWizardPage.tsx`.

> Daraus folgt: `src/import/universal.ts` ist eine **Schicht darüber**, kein
> zweiter Importer. Ein zweiter Parser neben `parseCsv` wäre die Dopplung,
> die E18 verhindern soll.

**Die halbe Motivationsliste existiert.** Lernserie mit Ruhetagen
(`lernserie.ts`, 2 Ruhetage je Woche, Lerntag ab 10 Aufgaben), freiwilliges
Wochenziel (`zeitzone.ts`, `LearnerSettings.weeklyGoalDays`),
Beherrschungsfortschritt (`beherrschung.ts`) — alles gebaut und auf „Heute"
und „Mein Fortschritt" sichtbar.

> Neu ist deshalb nur: **Tagesaufgabe und Tagesziel**, der
> **Rundenfortschritt**, die **Abschlussfeier**, die **Auszeichnungen** und
> der Satz „Noch … bis zum Tagesziel". Alles andere wird benutzt, nicht
> nachgebaut.

**Die Sprachdaten sind da, die Oberfläche fehlt.** Schemafassung 3 trägt
`lemma`, `complementPattern`, `grammaticalNumber`, `grammarNote`,
`lexicalGroupId`, `occurrence`, mehrere `germanAnswers`, mehrere
`exampleSentences` und eine geprüfte `inflection` für Verb, Substantiv und
Adjektiv. `answerCheck` unterscheidet schon richtig, fast richtig und falsch
mit Hinweis.

> Block C ist deshalb überwiegend **Darstellung und gestufte Hinweise**, nicht
> ein neues Datenmodell. Wo doch ein Feld fehlt, wird es additiv und
> rückwärtskompatibel ergänzt — Fassung 3 bleibt lesbar.

## 5. Die Zusagen, die diese Arbeit nicht brechen darf

1. **Keine Lehrkraftkontrolle über individuelle Lernstände.** Motivation ist
   privat. Kein Punktestand, keine Serie, keine Auszeichnung erreicht eine
   Lehrkraftsicht. Es entstehen keine neuen personenbezogenen Daten: Alles
   Gezeigte ist aus dem eigenen, bereits zulässigen Lernstand ableitbar.
2. **Die deterministische Prüfung bleibt die Instanz.** `checkAnswer`
   entscheidet über richtig, fast richtig und falsch. Eine KI darf erklären
   und Beispiele anbieten; sie darf einen Lernstand nicht ändern und eine
   Antwort nicht nachträglich gutschreiben.
3. **Lehrkrafteingaben werden nie still überschrieben.** Was im Import von
   Hand geändert wurde, überlebt jede erneute Erkennung.
4. **Portable Auslieferungen bleiben funktionsgleich.** Sie kennen kein
   Konto; was hier entsteht, darf ihnen nichts wegnehmen und nichts
   aufzwingen.
5. **Die Leitner-Logik bleibt unverändert**, und zwar sichtbar: Wer sie
   ändern will, ändert sie in einem eigenen Commit mit eigener Begründung.
6. **Keine dritte Designsprache.** Portal-Variante B und die vorhandenen
   Bausteine, sonst nichts. Kein globaler Tokentausch, keine
   `global.css`-Bereinigung in diesem Auftrag.

## 6. Übergabeprinzip

Jeder Baustein hier ist **rein**: Daten hinein, Bild heraus, Handlungen als
Rückrufe. Keine Komponente holt sich selbst ein Repository, eine Sitzung,
eine Rolle oder eine Kennung. Das ist kein Stilgeschmack, sondern die
Bedingung dafür, dass Codex sie verdrahten kann, ohne sie zu zerlegen — und
dafür, dass sie prüfbar sind, ohne dass ein halbes Portal daneben läuft.

Die öffentlichen Props jedes Bausteins stehen am Ende in
`docs/uebergabe-naechste-stufe.md`, zusammen mit den genauen
Integrationsschritten.
