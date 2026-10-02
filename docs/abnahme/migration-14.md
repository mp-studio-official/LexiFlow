# Migration 14 — Rollenriegel bei der Selbstanlage

**Noch nicht angewandt.** Diese Datei ist die Anleitung dorthin; nach dem
Lauf wird sie das Protokoll.

> **Nicht remote anwenden, solange der Pilot nicht entschieden ist.** Die
> Migration liegt fertig im Zweig und ist lokal belegt. `supabase db push`
> gehört nicht in diesen Arbeitsschritt.

## Worum es geht

`profiles_insert_self` schränkte nur `id = auth.uid()` ein, nicht `role`.
Ein Konto konnte sich sein eigenes Profil als `teacher` oder `admin`
anlegen. Erst das spätere **Ändern** scheiterte — an der zweiten Tür.

## Warum sie trotzdem kommt, wenn die Registrierung aus ist

Ausnutzbar ist der Befund nur, wenn überhaupt jemand ein Konto anlegen kann.

> **Die offene Registrierung per E-Mail muss im Stagingprojekt ausgeschaltet
> sein.** Dashboard → Authentication → Sign In / Providers → Email →
> „Allow new users to sign up" = **aus**. Das ist Schritt A0 in
> `migration-14.sql` und wird dort notiert.

Und sie reicht nicht. Eine Zugriffsregel, die nur hält, weil nebenan ein
Schalter richtig steht, ist keine: Der Schalter wird irgendwann umgelegt —
beim Einladen einer zweiten Lehrkraft, beim Ausprobieren, beim Umzug in ein
anderes Projekt — und dabei liest niemand die Migrationsdatei.

## Drei Riegel, nicht einer

| | Was | Wogegen |
| --- | --- | --- |
| 1 | `insert` nur noch auf `id`, `display_name`, `short_code` | wer `role` nennt, bekommt „permission denied", bevor eine Regel befragt wird |
| 2 | `profiles_insert_self` verlangt `role = 'student'` | greift, falls die Rechtevergabe später wieder geweitet wird |
| 3 | Auslöser `profiles_block_self_role_change` auf `update` | greift, falls eines Tages `grant update (role)` dazukäme |

Drei, weil jeder einzelne durch eine spätere, gut gemeinte Zeile an anderer
Stelle aufgehen kann. Jeder ist am Prüfstand **einzeln** belegt: In
`scripts/db/rollenriegel.test.mjs` stehen zwei Prüfungen, die das jeweils
fehlende Recht im Test wieder vergeben und zeigen, dass der nächste Riegel
hält.

## Was nicht zumacht

- `create_learner_account` ist `security definer` und läuft als Besitzer —
  der Einladungscode-Weg bleibt unberührt.
- Das Anlegen einer Lehrkraft von Hand (Inbetriebnahme §6.2) läuft ebenfalls
  als Besitzer und bleibt möglich.
- Der Anzeigename lässt sich weiter ändern.
- Eine Verwaltung, die eine **fremde** Rolle setzt, wird nicht behindert.

Alle vier stehen als eigene Prüfungen im Prüfstand. Der Auslöser hat genau
deshalb **keine** Besitzerrechte: In einer `security definer`-Funktion wäre
`current_user` der Besitzer, der Vergleich träfe nie zu, und der Riegel wäre
eine Zeile, die aussieht, als täte sie etwas. Der erste Entwurf war so; die
Prüfung hat es gezeigt.

## Der lokale Stand

| | ohne 14 | mit 14 |
| --- | --- | --- |
| Tabellen | 16 | 16 |
| Spalten | 101 | 101 |
| Regeln | 28 | 28 |
| Funktionen | 37 | **38** |
| Trigger | 5 | **6** |

Remote liegt die Funktionszahl um genau eine höher (`rls_auto_enable`):
erwartet also **38 → 39**.

> **Eine Zahl, die ich nicht erklären kann.** Das Protokoll zu Migration 13
> nennt remote **13** Trigger, der lokale Prüfstand zählt **5**. Die
> Differenz von 8 ist nicht untersucht. Erwartet wird remote 13 → 14; wer
> bei A1 etwas anderes sieht, wendet nicht an, sondern sieht nach.

## Was der SQL Editor nicht zeigen kann

Der Editor spricht als Besitzer. Für den gelten weder Zugriffsregeln noch
Spaltenrechte — ein Versuch, dort ein Profil als `admin` anzulegen, gelingt
und beweist nichts. Der Nachweis am echten System gehört deshalb in die
Pilotabnahme (`docs/pilot-abnahme.md`), mit einer angemeldeten Sitzung im
Portal und nicht im Dashboard.

## Reihenfolge

1. A0 bis A5 ausführen, Werte notieren.
2. Migration anwenden.
3. B1 bis B9 ausführen, gegen A vergleichen.
4. Diese Datei in ein Protokoll umschreiben: gemessene Werte eintragen, die
   Überschrift auf „angewandt und abgenommen am …" ändern — und damit wird
   `20261004090000_rollenriegel.sql` **unveränderlich**.
