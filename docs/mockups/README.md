# Mockups: drei Routen für den Lehrkraftweg

Diese drei HTML-Dateien sind **Entwürfe, kein Produktcode**. Sie werden nicht
gebaut, nicht getestet, nicht ausgeliefert und von nichts importiert. Am
laufenden Design ist nichts geändert.

| Datei | Route | Risiko |
| --- | --- | --- |
| `route-a-papierbogen.html` | Kästen weg, Typografie gliedert | gering |
| `route-b-werkbank.html` | Zweispaltig, Quelle bleibt sichtbar | mittel |
| `route-c-karteikasten.html` | Marke sichtbar, Vokabeln als Kartenstapel | höher |

Jede Datei zeigt dieselben drei Bildschirme, damit sie vergleichbar sind:

1. **Material** – die Startseite mit den drei Wegen und der Paketliste
2. **Importassistent** – der Empfehlungsschritt
3. **Paketseite** – die fertige Liste mit „Weitergeben an die Lerngruppe“

Öffnen per Doppelklick. Kein Server, kein Netz, keine Abhängigkeit.

## Was in allen dreien gleich bleibt

- **Die Palette.** Aubergine `#2F092D`, Tomato `#FF2E2D`, Parchment `#F8EFE3`
  und die daraus abgeleiteten Töne aus `src/styles/tokens.css`. Keine vierte
  Farbe, in keiner Route.
- **Die Kontrastregeln.** Primäre Aktion ist Aubergine, nicht Tomato. Tomato
  ist auf Papier Fläche und Grafik, kein kleiner Text.
- **Farbe trägt nie allein eine Information.** Jeder Zustand hat ein Wort und
  ein Zeichen neben sich – auch in den Entwürfen.
- **Die Texte.** Beschriftungen und Sätze sind wörtlich aus der Anwendung
  übernommen. Ein Entwurf mit erfundenen, kürzeren Texten sieht immer besser
  aus als das, was hinterher dasteht.

## Was sie bewusst **nicht** zeigen

- **Keine echten Schriften.** Manrope und Newsreader liegen im Produkt als
  eingebettete Dateien; hier greift die Systemschrift. Die Proportionen
  stimmen ungefähr, die Anmutung ist etwas anders.
- **Keine Zustände.** Kein Laden, kein Fehler, kein leerer Zustand, kein
  Fortschritt. Die Entwürfe zeigen den Normalfall.
- **Keine Barrierefreiheitsprüfung.** Die Kontraste stimmen, weil die Palette
  stimmt; getestet ist hier nichts. Im Produkt läuft `axe` über jeden
  Bildschirm.
- **Kein Lernbereich.** Diese Runde betrifft nur den Lehrkraftweg.

## Wie es weitergehen könnte

Die drei Routen schließen sich nicht aus. Route A ist überwiegend CSS und
ließe sich schrittweise einführen, ohne dass jemand die App neu lernt.
Route B ist eine echte Umstellung des Importwegs. Route C betrifft vor allem
Kopfbereiche und Listen und ließe sich mit A oder B kombinieren.

Wenn eine Richtung gefällt, ist der nächste Schritt kein Umbau, sondern ein
Prototyp einer einzigen echten Seite gegen die echten Daten – dort zeigt sich,
was bei 41 Vokabeln und einem 390 px breiten Fenster übrig bleibt.
