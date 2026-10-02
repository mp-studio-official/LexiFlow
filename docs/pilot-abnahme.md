# Pilot 0.1 – Abnahmeprotokoll

> **Noch nicht abgearbeitet.** Jedes offene Kästchen ist eine Handlung am
> echten System. `npm run pilot:pruefen` zählt sie: Solange eines offen ist,
> ist Prüfung 10 rot.

Jeder Punkt nennt **was zu tun ist**, **was dabei herauskommen muss** und
**was sich danach geändert hat**. Wo etwas anderes herauskommt: nicht
weitermachen, eintragen, melden.

---

## Teil A – Bevor jemand sich anmeldet

### A1 Die offene Registrierung ist aus

- [ ] **Tun:** Dashboard → Authentication → Sign In / Providers → Email →
      „Allow new users to sign up".
- **Erwartet:** **aus**.
- **Danach:** Niemand legt sich selbst ein Konto an. Ist sie an, ist der
  Rollenbefund aus `docs/abnahme/migration-14.md` scharf – dann erst
  ausschalten, dann weiter.

### A2 Migration 14 anwenden

- [ ] **Tun:** `docs/abnahme/migration-14.sql`, Abschnitt A, im SQL Editor.
      Werte notieren.
- **Erwartet:** `tabellen 16 · spalten 101 · regeln 28 · funktionen 38 ·
  trigger 13`. Bei A4: `with_check = (id = auth.uid())`.
- [ ] **Tun:** Migration anwenden.

```
npx --yes supabase@latest db push
```

- **Erwartet:** `20261004090000_rollenriegel` wird angewandt.
- [ ] **Tun:** Abschnitt B.
- **Erwartet:** `funktionen 39 · trigger 14`, Regeln und Nutzdaten
  unverändert; B4 nennt jetzt `role = 'student'`; B5 genau drei Spalten;
  B8 `prosecdef = false`.
- **Danach:** Kein Browser kann sich mehr als Lehrkraft oder Verwaltung
  anlegen. `20261004090000_rollenriegel.sql` ist ab jetzt **unveränderlich**.

### A3 Migration 15 anwenden

- [ ] **Tun:** `docs/abnahme/migration-15.sql`, Abschnitt A.
- [ ] **Tun:** anwenden (`db push`), dann Abschnitt B.
- **Erwartet:** `spalten 102 · funktionen 40`; B3 zeigt **0** stillgelegte
  Konten; B6 zeigt `service_role · disabled_at` und `authenticated ·
  display_name` – **nicht** `authenticated · disabled_at`.
- **Danach:** Ein Konto lässt sich stilllegen. Niemand ist es.

### A4 Die Protokolle umschreiben

- [ ] **Tun:** In `migration-14.sql` und `-15.sql` den Kopf von „NOCH NICHT
      AUSGEFÜHRT" auf „ausgeführt am …" ändern und die gemessenen Werte
      eintragen.
- **Danach:** `npm run pilot:pruefen` Prüfung 4 wird grün.

---

## Teil B – Der Live-Happy-Path

Dieser Teil holt nach, was `inbetriebnahme-staging.md` §0.5 als offen
führt. Er läuft auf der **Pilotadresse**, nicht lokal.

### B1 Lehrkraft anmelden

- [ ] **Tun:** Pilotadresse öffnen, anmelden.
- **Erwartet:** Oben steht das Band „Pilotfassung 0.1 …". Danach der Start
  der Lehrkraft.
- **Danach:** Eine Sitzung besteht.

### B2 Kurs anlegen

- [ ] **Tun:** Kurse → Neuer Kurs.
- **Erwartet:** Der Kurs steht in der Liste.

### B3 Paket übernehmen

- [ ] **Tun:** Material → Übernehmen, eine bestehende Paketdatei wählen.
- **Erwartet:** Das Paket steht als Entwurf im Konto.
- [ ] **Tun:** Dieselbe Datei ein zweites Mal übernehmen.
- **Erwartet:** **Dasselbe** Paket, kein zweites (ADR-4).

### B4 Veröffentlichen — §6.7

- [ ] **Tun:** Material → Veröffentlichen.
- **Erwartet:** Eine Fassung entsteht, Nummer 1.
- **Danach:** Es gibt eine unveränderliche Fassung. Der Entwurf lässt sich
  weiter bearbeiten, ohne dass die Lerngruppe etwas davon sieht.

### B5 Kurs zuweisen

- [ ] **Tun:** Zuweisen.
- **Erwartet:** Das Paket erscheint im Kurs.

### B6 Einladungscode

- [ ] **Tun:** Kurs → Einladungscode, Gültigkeit und Plätze setzen.
- **Erwartet:** Acht Zeichen.
- **Danach:** Der Code steht **nirgends** gespeichert – nur sein
  Fingerabdruck.

### B7 Zwei Lernende treten bei

- [ ] **Tun:** In einem **anderen** Browser (oder privaten Fenster) beitreten,
      zweimal.
- **Erwartet:** Je eine Lern-ID und ein Wiederherstellungscode, je **einmal**
  sichtbar. Beide notieren.
- **Danach:** Zwei Konten, beide `student`.

### B8 Beide Lernrichtungen und die Übungsformen — §6.7

- [ ] **Tun:** Als Lernende üben: Englisch → Deutsch **und** Deutsch →
      Englisch; Karteikarten, Selbsttest, freies Üben, Vokabelliste.
- **Erwartet:** Jede Form startet und zählt.
- **Danach:** Es gibt Lernstand und Ereignisse.

### B9 Fortschritt synchronisieren — §6.8

- [ ] **Tun:** Dieselbe Person auf einem **zweiten** Gerät anmelden.
- **Erwartet:** Derselbe Stand.
- **Danach:** Der Lernstand hängt am Konto, nicht am Gerät.

### B10 Revisionskonflikt — §6.9

- [ ] **Tun:** Auf beiden Geräten üben, ohne dazwischen neu zu laden.
- **Erwartet:** Kein stiller Verlust: Das zweite Gerät merkt den Konflikt.
- **Danach:** Der beschriebene Konfliktweg ist einmal wirklich gelaufen.

### B11 Archivieren und weiterlernen — §6.10

- [ ] **Tun:** Kurs archivieren, dann als Lernende weiterüben.
- **Erwartet:** Die Gruppe übt weiter, der Lernstand läuft weiter; niemand
  kommt neu hinzu, alte Codes führen nicht mehr hinein (ADR-12).

### B12 §0.5 berichtigen

- [ ] **Tun:** Die Zeilen 6.7 bis 6.10 in `inbetriebnahme-staging.md` §0.5
      auf **belegt** setzen.
- **Danach:** Prüfung 5 wird grün.

---

## Teil C – Rollen, Rechte, Wiederherstellung

### C1 Die Lehrkraft sieht keine Lernstände

- [ ] **Tun:** Als Lehrkraft jeden Bildschirm durchgehen.
- **Erwartet:** **Keine** Zahl über das Üben – nicht „zuletzt aktiv", nicht
  „x von y", kein Punkt hinter einem Namen.
- **Danach:** Das Produktversprechen ist einmal mit Augen geprüft.

### C2 Die Selbsterhebung geht nicht

- [ ] **Tun:** Als **lernende** Person, in der Browserkonsole auf der
      Pilotadresse, eine Rollenänderung am eigenen Profil versuchen.
- **Erwartet:** Abgelehnt.
- **Danach:** Riegel 3 aus Migration 14 ist am echten System belegt – das
  ist der Punkt, den der SQL Editor **nicht** zeigen kann, weil er als
  Besitzer spricht.

### C3 Mitgliedschaft entfernen

- [ ] **Tun:** Kurs → Mitglieder → Entfernen.
- **Erwartet:** Für die Person verschwinden Kurs und Pakete sofort.
- [ ] **Tun:** Wieder beitreten lassen.
- **Erwartet:** Der Lernstand ist noch da.

### C4 Ein Konto stilllegen

- [ ] **Tun:** Serverseitig `disabled_at` setzen (nur `service_role`).
- **Erwartet:** Die Person sieht **nichts** mehr – keine Kurse, keine Pakete.
- [ ] **Tun:** Dieselbe Person versucht sich anzumelden.
- **Erwartet:** Die Anmeldung **gelingt**, und danach ist nichts zu sehen.
  Das ist kein Fehler: Die Anmeldung führt Supabase Auth, nicht diese
  Datenbank. Steht es hier anders, ist etwas anderes passiert.
- [ ] **Tun:** `disabled_at` zurück auf `null`.
- **Erwartet:** Alles ist wieder da, einschließlich Lernstand.

### C5 Kennwort vergessen

- [ ] **Tun:** Als Lernende: Lern-ID + Wiederherstellungscode → neues
      Kennwort.
- **Erwartet:** Es klappt, und es kommt ein **neuer** Code.
- [ ] **Tun:** Den **alten** Code noch einmal benutzen.
- **Erwartet:** Abgelehnt.

### C6 Abmelden

- [ ] **Tun:** Abmelden, dann zurück-Taste.
- **Erwartet:** Keine Inhalte mehr, auch nicht kurz.
- [ ] **Tun:** Mitten in einer Übungsrunde abmelden.
- **Erwartet:** Die Rückfrage „ginge etwas verloren?" erscheint (E14).

---

## Teil D – Fehler, Offline, Leerzustände

### D1 Ohne Netz

- [ ] **Tun:** Netzwerk in den Entwicklerwerkzeugen auf „Offline", dann
      Kurse, Material, Heute, Mein Fortschritt und eine Übungsrunde öffnen.
- **Erwartet:** Überall **„Keine Verbindung"** und **„Erneut versuchen"**.
  Nirgends eine Ladeanzeige, die stehen bleibt. Nirgends „Noch kein Kurs"
  oder „Noch kein Paket".
- [ ] **Tun:** Netz wieder an, „Erneut versuchen".
- **Erwartet:** Die Ansicht lädt.

### D2 Nichts wird falsch zugesagt

- [ ] **Tun:** Offline eine Antwort geben.
- **Erwartet:** Keine Meldung, die Speichern behauptet.

### D3 Leere Zustände

- [ ] **Tun:** Mit einem frischen Lernendenkonto anmelden, **bevor** ein
      Paket zugewiesen ist.
- **Erwartet:** Erklärte Leerzustände, kein Fehler.

### D4 KI ist sichtbar gesperrt

- [ ] **Tun:** Als Lehrkraft den KI-Zugang öffnen.
- **Erwartet:** „Im Pilot nicht freigegeben", kein Feld für einen Schlüssel.
- [ ] **Tun:** Netzwerkanzeige mitlaufen lassen.
- **Erwartet:** **Kein** Aufruf von `ai-gateway`, in keiner Ansicht.

---

## Teil E – Datenschutz, Support, Sicherung, Rückfall

### E1 Einwilligung und Hinweis

- [ ] **Tun:** Die Erziehungsberechtigten der Lerngruppe informieren; den
      Datenschutzhinweis im Portal gegenlesen.
- **Erwartet:** Es steht dort, **was** gespeichert wird (Pseudonym,
  Kurzkennung, Lernstand), **was nicht** (kein Klarname, keine E-Mail für
  Lernende, keine Lernzeit) und **wer es sieht**.
- **Danach:** Der Pilot hat eine Grundlage. Ohne diesen Punkt beginnt er
  nicht.

### E2 Löschen auf Zuruf

- [ ] **Tun:** Den Weg aufschreiben, wie ein Konto samt Lernstand gelöscht
      wird, wenn jemand es verlangt. Einmal durchspielen.
- **Erwartet:** Es gibt einen Weg, und jemand hat ihn gemacht.
- **Danach:** „Wir löschen das dann" ist keine Behauptung mehr.

### E3 Ansprechperson

- [ ] **Tun:** In `docs/anleitung-portal-lehrkraft.md` die drei Zeilen
      ausfüllen: Name, Weg, Reaktionszeit.

### E4 Sicherung

- [ ] **Tun:** Im Dashboard nachsehen, **wie oft** gesichert wird und wie
      lange die Sicherungen bleiben. Eintragen.
- **Erwartet:** Zwei Zahlen, keine Vermutung.

### E5 Rückfall

- [ ] **Tun:** Die portable Lerndatei aller Pakete bauen und der Lehrkraft
      **vor** dem Pilot übergeben.
- [ ] **Tun:** Sie einmal öffnen, ohne Netz.
- **Erwartet:** Sie läuft.
- **Danach:** Der Unterricht hängt nicht an der Adresse. Was dabei verloren
  ginge – der gemeinsame Lernstand – ist bekannt und in Kauf genommen
  (`docs/pilot-auslieferung.md`).

---

## Teil F – Ausliefern

### F1 Werte hinterlegen

- [ ] **Tun:** Pilotprojekt anlegen, Pages einschalten, Variablen und das
      eine Geheimnis hinterlegen – alles nach `docs/pilot-auslieferung.md`.
      **Nichts davon in den Chat.**

### F2 Redirect-URL

- [ ] **Tun:** Die Pilotadresse in Supabase als Redirect-URL eintragen.
- **Erwartet:** Sonst führt die Kennwortwiederherstellung ins Leere.

### F3 Der Lauf

- [ ] **Tun:** Actions → „Pilot 0.1 ausliefern" → `pilot` eintippen.
- **Erwartet:** Prüfkette grün; `verify:deploy` meldet die geprüften Dateien
  und **keinen** Abbruch; der Schiebeschritt meldet das Ziel.
- **Danach:** Die Pilotadresse zeigt das Portal, mit Band.

### F4 Nachsehen

- [ ] **Tun:** Die Adresse in Safari und auf einem Telefon öffnen.
- **Erwartet:** Band oben, kein waagerechtes Scrollen, Anmeldung erreichbar.

---

## Was dieses Protokoll nicht kann

Es kann nicht sagen, ob der Pilot gelingt. Es sagt, was vorher einmal
gelaufen sein muss. Der erste Mensch, der Teil B abarbeitet, wird Dinge
finden, die hier nicht stehen – und genau dafür gibt es ihn.
