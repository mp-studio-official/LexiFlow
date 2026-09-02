# Mockups: drei Routen für den Lehrkraftweg

Diese drei HTML-Dateien sind **Entwürfe, kein Produktcode**. Sie werden nicht
gebaut, nicht getestet, nicht ausgeliefert und von nichts importiert. Am
laufenden Design ist nichts geändert.

| Datei | Route | Risiko |
| --- | --- | --- |
| `route-a-papierbogen.html` | Kästen weg, Typografie gliedert | gering |
| `route-b-werkbank.html` | Zweispaltig, Quelle bleibt sichtbar (**Fassung 2**) | mittel |
| `route-c-karteikasten.html` | Marke sichtbar, Vokabeln als Kartenstapel | höher |

Jede Datei zeigt dieselben drei Bildschirme, damit sie vergleichbar sind:

1. **Material** – die Startseite mit den drei Wegen und der Paketliste
2. **Importassistent** – der Empfehlungsschritt
3. **Paketseite** – die fertige Liste mit „Weitergeben an die Lerngruppe“

Öffnen per Doppelklick. Kein Server, kein Netz, keine Abhängigkeit.

## Route B, Fassung 2

Nach der ersten Durchsicht überarbeitet:

- Pakete als **Blöcke** statt Tabellenzeilen – eigene Fläche, weiche Ecke, Kante
  in Aubergine. Herunterladen geht direkt aus der Liste, über ein Symbol
  (Einzeldatei und LexiFlow-Paket, beide mit Namen für die Vorlesehilfe).
- Der Kasten „Auf diesem Gerät“ ist weg; das Öffnen einer Paketdatei steht
  jetzt am Kopf der Liste.
- Die Textansicht ist **verstellbar**: die Spalte in der Breite (Griff
  dazwischen, auch mit den Pfeiltasten), das Textfeld zusätzlich in der Höhe.
  Beides funktioniert in der Datei wirklich.
- **Keine Umrandung** um die Listen. Feine Striche trennen die Zeilen; Satz,
  Wörterbuchangaben und der Beispielsatz-Knopf stehen unten in der Zeile und
  beginnen ganz links.
- Der **Beispielsatz** steht auf der Paketseite in jeder Zeile – eingeklappt,
  benannt, mit Anzahl – und ist aufgeklappt bearbeitbar.

Dafür trägt diese eine Datei rund dreißig Zeilen JavaScript: Dass sich eine
Spalte ziehen lässt und ein Bereich wirklich auf- und zuklappt, lässt sich als
Bild nur behaupten.

## Was in allen dreien gleich bleibt

- **Das echte Signet.** Oben links steht in allen drei Routen das
  LexiFlow-Zeichen mit den Pfaden aus `src/ui/logoPaths.ts` – kein
  Platzhalter. Auf dunklem Grund gilt die Variante `onAubergine`, auf hellem
  `onParchment`; das sind dieselben drei Markenfarben in getauschten Rollen.
  In Route B steht nur das Signet: In eine 56 px schmale Schiene passt keine
  Wortmarke.

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
