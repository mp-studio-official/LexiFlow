# Persönlicher Lerncoach — Entwicklungsstand

## Ergebnis

Lernende können einen **eigenen API-Zugang** für den Lerncoach hinterlegen.
Der Zugang gehört ausschließlich dem eigenen Konto. Der Klartextschlüssel
geht einmal an `ai-gateway`, wird dort mit dem vorhandenen AES-GCM-Tresor
versiegelt und kommt nicht wieder zum Browser zurück.

Unterstützt sind:

- Google Gemini API,
- OpenAI API,
- Anthropic Claude API,
- ein OpenAI-kompatibler Anbieter, dessen Host eine Verwaltung vorher
  ausdrücklich freigegeben hat.

Ein ChatGPT-, Claude- oder Gemini-Abonnement ist nicht automatisch ein
API-Zugang. Ob ein Anbieter oder Modell kostenlos nutzbar ist, entscheidet
der Anbieter; LexiFlow verspricht keine kostenlosen Kontingente.

## Harte Grenze

Eine lernende Person darf mit ihrem Zugang ausschließlich vier fest benannte
Handlungen ausführen:

1. einen konkreten Fehler erklären,
2. einen Hinweis geben,
3. einen anderen Beispielsatz zeigen,
4. erklären, warum eine Antwort richtig ist.

Es gibt kein freies Chatfeld. Der Server akzeptiert für Lernende keinen
allgemeinen KI-Auftrag und auch keinen bloß ähnlich benannten Auftrag. Vor dem
Netz werden alle Nutzlastfelder verworfen, die nicht zur aktuellen Aufgabe
gehören. Name, Lern-ID, Kurskennung und Lernverlauf sind nicht Teil des
Vertrags.

Die KI-Antwort entscheidet niemals über richtig oder falsch und verändert den
Lernstand nicht. Das Urteil bleibt bei LexiFlows deterministischer
Antwortprüfung.

## Einwilligung und Löschen

Vor dem ersten Aufruf nennt LexiFlow direkt an der Handlung, welche Angaben
übertragen werden und welche nicht. Die Bestätigung wird pro Konto nur auf dem
aktuellen Gerät gespeichert. Ein anderes Gerät fragt erneut.

Der persönliche Zugang kann wieder entfernt werden. Vor dem Löschen steht
eine zweite, ausdrückliche Bestätigung, weil der Schlüssel anschließend nicht
wiederhergestellt werden kann.

## Noch nicht für den Pilot freigegeben

`KI_IM_PILOT` bleibt auf `gesperrt`. Dadurch entfernt `HostedApp` das
KI-Repository vollständig aus dem Pilot und `PracticePage` zeichnet keine
Lerncoach-Oberfläche.

Vor einer Freigabe mit Minderjährigen müssen außerhalb des Codes feststehen:

- welche Anbieter für die konkrete Pilotgruppe zulässig sind,
- ob deren Alters- und Kontobedingungen erfüllt sind,
- wer die datenschutzrechtliche Information und gegebenenfalls Einwilligung
  verantwortet,
- und ob ein kostenloses Kontingent tatsächlich vorhanden ist.

Die technische Freigabe ist danach ein eigener Commit und kein versteckter
Umgebungswert.

