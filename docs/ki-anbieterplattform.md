# KI-Anbieterplattform – technischer Zwischenstand

Stand: 13. Oktober 2026

Diese Arbeit läuft parallel zum Pilot. `ai-gateway` und Migration 17 sind seit
dem 13. Oktober 2026 im Staging deployt. Seit dem 17. Oktober ist im Pilot
ausschließlich `teacher-text/suggestions` freigegeben: Eine Lehrkraft kann für
selbst ausgewählte Wörter Übersetzungsvorschläge abrufen. Lernendenassistenz
und alle anderen Fähigkeiten bleiben sichtbar und technisch gesperrt. Ein
echter Anbieteraufruf bleibt vor der Auslieferung abzunehmen.

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

Der technische Transport und der persönliche Zugang allein schalten für
Lernende **noch keine** KI im Pilot frei. Das ist Absicht: Vor einer Freigabe
für Minderjährige müssen mindestens diese Produktentscheidungen feststehen
und abgenommen sein:

1. Wer trägt den Schlüssel und die Kosten: Schule/Lehrkraft oder Lernende?
2. Welche Inhalte dürfen den Anbieter verlassen?
3. Welche Hilfe ist erlaubt (erklären und variieren), und was bleibt verboten
   (freie Unterhaltung, Bewertung oder Profilbildung)?
4. Welche Anbieter- und Datenschutzhinweise sehen Eltern und Lernende vor dem
   ersten Aufruf?
5. Welche Tages- und Sitzungsgrenzen verhindern Kosten- und Missbrauchsspitzen?

Migration 17 erlaubt einer lernenden Person ausschließlich die Verwaltung
ihres eigenen Schlüssels. Der Server lässt für sie nur die vier festen
Lerncoach-Aufträge zu; die sichtbare Oberfläche bleibt bis zur Freigabe durch
`KI_IM_PILOT = 'gesperrt'` aus dem Pilotbündel entfernt.

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
