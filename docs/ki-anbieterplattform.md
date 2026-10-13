# KI-Anbieterplattform – technischer Zwischenstand

Stand: 13. Oktober 2026

Diese Arbeit läuft parallel zum Pilot. Sie ist **nicht deployt**, im Pilot
bleibt KI sichtbar gesperrt. Sie ändert weder Datenbank noch Schlüsselbestand.

## Was dieser Block leistet

Der Browser sendet weiterhin nur einen neutralen LexiFlow-Auftrag an
`ai-gateway`. Erst die Serverfunktion erzeugt daraus das echte
Anbieterprotokoll:

| Verbindung | Serverprotokoll |
| --- | --- |
| OpenAI an `api.openai.com` | Responses API unter `/v1/responses`, `store: false`, JSON-Ausgabe |
| freigegebener OpenAI-kompatibler Schulhost | `/chat/completions`, JSON-Ausgabe |
| Anthropic an `api.anthropic.com` | Messages API unter `/v1/messages` |
| Gemini | `models/{modell}:generateContent` |

Die offizielle OpenAI-Dokumentation empfiehlt Structured Outputs gegenüber
freiem JSON, wenn ein festes Schema vorliegt. Der erste gemeinsame Vertrag
nutzt bewusst zunächst JSON-Objekte: Die fachlichen Schemata für Import,
Erklärung und Satzvorschlag entstehen im nächsten Block gemeinsam mit ihren
Evals und dürfen nicht im Transport erfunden werden.

## Feste Grenzen

- Schlüssel bleiben im bestehenden, serverseitig versiegelten Tresor.
- Keine freien Kopfzeilen und keine ungeprüften Hosts.
- Keine Weiterleitungen.
- Höchstens 32 KiB Anfrage und 256 KiB Antwort.
- Nach 20 Sekunden wird die Anbieteranfrage abgebrochen.
- Keine Namen, Lernstände oder Lernaktivitäten im Systemauftrag.
- Keine Protokollierung der fachlichen Anfrage oder Antwort.
- Eine formal erfolgreiche, aber unlesbare Anbieterantwort gilt als Fehler.

## Lernendenassistenz

Der technische Transport allein gibt Lernenden **noch keinen** KI-Zugang.
Das ist Absicht: Vor einer Freigabe für Minderjährige müssen mindestens diese
Produktentscheidungen feststehen und abgenommen sein:

1. Wer trägt den Schlüssel und die Kosten: Schule/Lehrkraft oder Lernende?
2. Welche Inhalte dürfen den Anbieter verlassen?
3. Welche Hilfe ist erlaubt (erklären und variieren), und was bleibt verboten
   (freie Unterhaltung, Bewertung oder Profilbildung)?
4. Welche Anbieter- und Datenschutzhinweise sehen Eltern und Lernende vor dem
   ersten Aufruf?
5. Welche Tages- und Sitzungsgrenzen verhindern Kosten- und Missbrauchsspitzen?

Bis dahin bleibt die vorhandene Serverregel unverändert: Nur Lehrkraft und
Verwaltung dürfen eine Verbindung speichern oder aufrufen. Ein persönlicher
Schlüssel einer lernenden Person wird in diesem Block nicht eingeführt.

## Nachweise

- Protokolltests bilden die echten Anfrage- und Antworthüllen aller drei
  Cloudanbieter ab.
- Kerntests prüfen Rollen, Eigentum, Tresor, Hostfreigabe, Weiterleitungen,
  Größen, Laufzeitgrenze und kontrollierte Netzfehler gemeinsam.
- Gegenproben werden rot, wenn der offizielle OpenAI-Endpunkt oder die
  Laufzeitgrenze entfernt wird.

Offizielle Grundlage für OpenAI:
[Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
und
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

