# Lerncoach-Anbindung — technischer Stand

Stand: 13. Oktober 2026 · Zweig `codex/learner-ai-wiring`

## Was jetzt trägt

- `createCoachAnbieter` verbindet die vier festen Handlungen der Oberfläche
  mit `AiGateway.invoke`.
- Der Browser sendet nur die aktuelle Aufgabe. Name, Lern-ID, Kurs und
  Lernverlauf sind nicht Teil des Vertrags.
- Die Edge Function whitelistet dieselben Felder erneut. Zusätzliche Felder
  aus einer manipulierten Browseranfrage gelangen nicht zum Anbieter.
- OpenAI erhält für Lerncoach-Antworten ein striktes JSON-Schema mit genau
  einem Feld `text`. Gemini erhält dasselbe Schema; Anthropic und frei
  konfigurierte kompatible Anbieter werden anschließend in LexiFlow noch
  einmal auf exakt diese Form geprüft.
- Abbruchsignale reichen bis zum `fetch` des Gateways. Drosselung,
  Nichterreichbarkeit, ungültige Antwort und Abbruch bleiben unterscheidbar.
- Ein Hinweis wird nach der Anbieterantwort nochmals lokal geprüft. Verrät er
  die Lösung, zeigt LexiFlow ihn nicht an.
- Die Bestätigung des Datenhinweises liegt vorerst nur auf dem Gerät, getrennt
  je Profilkennung. Gespeichert wird ausschließlich `verstanden`; ein
  Gerätewechsel fragt erneut.

Die OpenAI Responses API verwendet dafür `text.format` mit
`type: "json_schema"` und `strict: true`, entsprechend der
[offiziellen OpenAI-Dokumentation zu Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

## Pilotfreigabe vom 17. Oktober 2026

`LERNCOACH_KI_IM_PILOT = 'frei'` bindet den Adapter in die produktive
Übungsrunde ein. Die übergeordnete Pilotgrenze bleibt bestehen und lässt nur
die vier festen `learner-coach/*`-Fähigkeiten sowie die Lehrkraft-Textwerkstatt
durch. Freier Chat und unbekannte Fähigkeiten erreichen das Gateway nicht.

Die Serverfunktion liest ausschließlich die Verbindung der angemeldeten
Person. Lernende können einen eigenen Zugang verwalten, aber niemals den
Schlüssel einer Lehrkraft sehen oder benutzen.

## Eigene Schlüssel von Lernenden

Der persönliche Schlüsselweg ist mit Migration 17 und dem Gateway umgesetzt:

1. eine getrennte, verschlüsselte Verbindungstabelle oder eine explizit
   erweiterte Eigentumsregel für Lernende;
2. ausschließlich Selbstzugriff, niemals Lehrkraftsicht auf Schlüssel oder
   Nutzungsdaten;
3. Anbieterfreigabe und Hostprüfung wie bei Lehrkräften;
4. ein eigenes Rate-Limit pro Person und eine sofortige Löschmöglichkeit;
5. einen Datenhinweis vor dem Speichern des Schlüssels und vor dem ersten
   Aufruf;
6. eine Entscheidung, ob Minderjährige einen externen Anbieter selbständig
   beauftragen dürfen;
7. Abnahme mit einem künstlichen Lernkonto und ohne echte Schülerdaten.

Persönliche Chat-Abonnements sind keine API-Zugänge. Ob Anbieter- und
Altersbedingungen für die konkrete Pilotgruppe passen, bleibt eine
organisatorische Voraussetzung vor echten Schülerdaten.

## Übergabe an die produktive Übungsrunde

Nach der parallelen Arbeit an `PracticePage` sind dort nur noch diese Werte
anzuschließen:

- `freigegeben`: aus der bestehenden Pilotgrenze, niemals aus „ein Schlüssel
  existiert“;
- `anbieter`: `createCoachAnbieter(...)` mit einer serverseitig zulässigen
  Verbindung;
- `hinweisGesehen`: `coachHinweisGesehen(localStorage, profile.id)`;
- `aufHinweisVerstanden`: ruft
  `coachHinweisBestaetigen(localStorage, profile.id)` auf.

Diese Verdrahtung steht jetzt produktiv in `PracticePage`; die vier Werte
werden dort aus Pilotgrenze, Sitzung und persönlicher Verbindung gebildet.
