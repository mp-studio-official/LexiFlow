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

## Für den Pilot freigegeben

Seit dem 17. Oktober 2026 ist `LERNCOACH_KI_IM_PILOT` auf `frei`. Das Portal
lässt ausschließlich die vier oben genannten Fähigkeiten zum Gateway durch;
ein freier oder nur ähnlich benannter Auftrag wird bereits davor abgewiesen.
Ohne selbst eingerichteten Zugang wird kein Anbieter angesprochen.

Für die tatsächliche Nutzung mit Minderjährigen müssen außerhalb des Codes
weiterhin feststehen und den Beteiligten mitgeteilt werden:

- welche Anbieter für die konkrete Pilotgruppe zulässig sind,
- ob deren Alters- und Kontobedingungen erfüllt sind,
- wer die datenschutzrechtliche Information und gegebenenfalls Einwilligung
  verantwortet,
- und ob ein kostenloses Kontingent tatsächlich vorhanden ist.

Die technische Freigabe ist ein eigener, sichtbarer Commit und kein
Umgebungswert. Der Datenhinweis steht vor dem ersten Aufruf direkt im Ablauf.

## Stagingstand vom 13. Oktober 2026

Migration 17 ist angewandt und `ai-gateway` ist mit der Lernendenbegrenzung
deployt. Ein fremder Ursprung wird mit 403 abgewiesen; der erlaubte
Pilotursprung ohne gültige Sitzung mit 401. Ein echter Anbieteraufruf und die
Prüfung mit einem künstlichen Lernendenkonto stehen vor der Auslieferung noch
aus.
