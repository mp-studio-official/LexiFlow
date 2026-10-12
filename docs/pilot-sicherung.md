# Sicherungsverfahren für Pilot 0.1

## Geltungsbereich

Dieses Verfahren gilt für das Supabase-Projekt `lexiflow` im kostenlosen
Tarif. Dort gibt es keine vom Tarif bereitgestellten Projektsicherungen.
Der unten beschriebene Ablauf ist am 12.10.2026 erstmals vollständig grün
gelaufen. Damit ist die technische Sicherungsgrenze für den Pilot belegt.

Die technische Grundlage folgt der Empfehlung von Supabase für Free-Projekte:
regelmäßige logische Exporte mit der Supabase CLI und eine Ablage außerhalb
des Supabase-Projekts.

## Verbindliche Werte

| Punkt | Festlegung |
| --- | --- |
| Intervall | täglich um **02:17 UTC** und zusätzlich jederzeit von Hand |
| Ablage | GitHub-Actions-Artefakt im Projekt `mp-studio-official/LexiFlow` |
| Schutz | symmetrisch mit **AES-256** verschlüsselt; Kennwort nur als GitHub-Secret |
| Aufbewahrung | **14 Tage** |
| Inhalt | Rollen, öffentliche Struktur und Daten sowie `auth.users` und `auth.identities` |
| Prüfung | Entschlüsselung, Prüfsumme und Wiederherstellung aller LexiFlow-Anwendungsdaten in eine frische PostgreSQL-17-Datenbank; Zählwerte vorher/nachher müssen identisch sein |

Der Ablauf liegt in `.github/workflows/pilot-sicherung.yml`. Er läuft weder
bei einem Push noch bei einem Pull Request. Eine Quelltextänderung darf keine
echten Daten auslesen.

**Erster vollständiger Beleg:** GitHub-Actions-Lauf
[`38234499377`](https://github.com/mp-studio-official/LexiFlow/actions/runs/38234499377),
12.10.2026. Export, AES-256-Verschlüsselung, Entschlüsselung, Prüfsumme,
Wiederherstellung in eine frische Supabase-kompatible PostgreSQL-17-Datenbank
und der exakte Zählwertvergleich waren grün. Aufbewahrt wurde ausschließlich
das verschlüsselte Artefakt `lexiflow-pilot-sicherung-38234499377`
(27.341 Byte), mit Ablauf am 26.10.2026.

## Einmalige Einrichtung

Im GitHub-Projekt unter *Settings → Secrets and variables → Actions → New
repository secret* werden genau zwei Secrets angelegt:

1. `SUPABASE_DB_URL`: die **Session-pooler connection string** aus Supabase
   (*Connect*), mit dem Datenbankkennwort anstelle des Platzhalters. Sie wird
   nie in eine Datei oder Nachricht kopiert.
2. `LEXIFLOW_BACKUP_PASSPHRASE`: ein zufälliges Kennwort mit mindestens
   32 Zeichen, ausschließlich für diese Sicherungen. Es wird zusätzlich im
   persönlichen Kennwortspeicher des Projektinhabers abgelegt. Ohne dieses
   Kennwort ist der Chiffretext absichtlich nicht wiederherstellbar.

Danach unter *Actions → Pilotdaten sichern → Run workflow* einmal von Hand
starten. Erst ein vollständig grüner Lauf belegt das Verfahren.

## Was der Ablauf tatsächlich beweist

1. Die echte Datenbank lässt sich logisch exportieren.
2. Der Export enthält jede der 16 LexiFlow-Tabellen und die Kennungen der
   Auth-Konten.
3. Das Archiv lässt sich mit dem getrennt verwahrten Kennwort entschlüsseln;
   seine Prüfsumme bleibt identisch.
4. Rollen, Struktur und Daten lassen sich in einer leeren PostgreSQL-17-
   Datenbank einspielen.
5. Für `auth.users` und jede LexiFlow-Tabelle stimmen die Zeilenzahlen vor
   und nach der Wiederherstellung überein.

Die vollständigen verwalteten Auth-Datensätze (`auth.users` und
`auth.identities`) liegen zusätzlich als `auth-data.dump` im verschlüsselten
Archiv. Die automatische Prüfdatenbank bildet Supabase Auth bewusst nur mit
Kennung und E-Mail nach; sie behauptet nicht, GoTrue zu sein. Bei einem
vollständigen Projektverlust wird deshalb in ein neues Supabase-Projekt
wiederhergestellt und der Zugang anschließend mit den vorhandenen
Wiederherstellungswegen geprüft.

## Wiederherstellung im Ernstfall

1. Den letzten grünen Lauf unter *Actions → Pilotdaten sichern* öffnen und
   das Artefakt herunterladen.
2. **Nicht** in das laufende Projekt zurückspielen. Zuerst ein leeres
   Supabase-Ersatzprojekt anlegen.
3. Chiffretext mit dem Kennwort aus dem persönlichen Kennwortspeicher
   entschlüsseln.
4. Rollen, Struktur und Daten nach der offiziellen Supabase-Reihenfolge in
   das Ersatzprojekt einspielen; `auth-data.dump` gehört zum Auth-Teil.
5. Die Abfrage `scripts/sicherung/zaehlwerte.sql` gegen Quelle beziehungsweise
   Sicherungsprotokoll und Ziel vergleichen.
6. Mit einem Lehrkraft-Testkonto und einem Lernenden-Testkonto anmelden und
   Kurs, Paket und Lernstand öffnen. Erst danach die Adresse umstellen.

Eine Wiederherstellung in das laufende Projekt oder das Löschen eines
Projekts ist immer ein eigener, ausdrücklich bestätigter Vorgang.

## Regelmäßige Kontrolle

- Ein fehlgeschlagener geplanter Lauf ist am selben Tag zu untersuchen.
- Vor Beginn einer Pilotstunde muss mindestens ein grünes Artefakt innerhalb
  der letzten 24 Stunden vorliegen.
- Das Kennwort wird nie zusammen mit dem Artefakt gespeichert.
- Beim Ende des Pilots werden die Artefakte durch die 14-Tage-Frist
  automatisch entfernt; eine frühere Löschung ist ein eigener bestätigter
  Vorgang.
