# Quelle und Lizenz des Offline-Wörterbuchs

Dieses Verzeichnis dokumentiert die Herkunft der Wörterbuchdaten. Es enthält
**keine Daten** – die Quelldatei ist 2,6 GB groß und wird nicht ins Repository
kopiert. Was hier steht, reicht aus, um den Datensatz jederzeit identisch neu zu
beschaffen und zu erzeugen.

## Der Datensatz

| | |
| --- | --- |
| Inhalt | englisches Wiktionary, maschinenlesbar extrahiert |
| Werkzeug | [wiktextract](https://github.com/tatuylonen/wiktextract) von Tatu Ylonen |
| Auslieferung | `https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz` |
| Quell-Dump | **enwiktionary vom 2026-08-05** |
| Extraktion | **2026-08-28**, wiktextract-Commits `872fc7b` und `4deed51` |
| Größe | 2 826 623 319 Bytes (2,63 GiB), entpackt 22,9 GB |
| Zeilen | 10 806 865 |

### Prüfsumme

```
SHA-256  4c27d202e875550c2cc7ea93a4d21ddf80440e5030606d3edbb8b0e65dc64006
```

**Diese Prüfsumme ist lokal berechnet, nicht offiziell.** kaikki.org
veröffentlicht keine Prüfsummen. Der Wert belegt also, dass unsere Pipeline
reproduzierbar auf *derselben* Datei läuft – er belegt **nicht** die Echtheit
gegenüber dem Anbieter. Wer die Datei neu herunterlädt, bekommt bei einem
neueren Dump zwangsläufig einen anderen Wert; dann ist die Version oben
mitzuändern und die Messung zu wiederholen.

Gegengeprüft wurde außerdem die Dateigröße gegen das `Content-Length` der
Auslieferung: 2 826 623 319 Bytes, identisch.

## Lizenz

Die Inhalte des Wiktionary stehen laut `Wiktionary:Copyrights` unter einer
Doppellizenz:

> The original texts of Wiktionary entries are dual-licensed to the public under
> both the Creative Commons Attribution-ShareAlike 4.0 International License
> (CC-BY-SA) and the GNU Free Documentation License (GFDL).

Das Extraktionswerkzeug wiktextract steht unter der MIT-Lizenz (© Tatu Ylonen)
und ist von der Lizenz der Daten unabhängig.

### Was daraus für LexiFlow folgt

1. **Namensnennung.** Quelle, Lizenz und ein Rückverweis auf das englische
   Wiktionary müssen dort stehen, wo das Wörterbuch benutzt wird – also in der
   Lehrkraftdatei selbst, nicht nur in diesem Repository.
2. **Weitergabe unter gleichen Bedingungen.** Der aus der Quelle abgeleitete
   Datensatz steht ebenfalls unter CC BY-SA 4.0.
3. **GFDL-Pflichten.** Autorschaft und „transparent copy“ sind laut derselben
   Seite durch einen deutlichen Rückverweis auf die Wiktionary-Seite erfüllt.
4. **Der Quellcode von LexiFlow bleibt unberührt.** ShareAlike greift auf die
   Daten, nicht auf das Programm: LexiFlow ist keine Bearbeitung eines
   Wörterbuchs, beide liegen in einer Datei nebeneinander. Das ist der
   entscheidende Unterschied zu den zuvor geprüften Quellen – FreeDict
   (GPLv3/AGPLv3, Quellcodepflichten) und PanLex (CC BY-**NC**-SA 4.0, keine
   kommerzielle Nutzung durch Empfänger der weitergegebenen Datei).

### Fremdmaterial in einzelnen Einträgen

Wiktionary weist darauf hin, dass einzelne Einträge Material aus fremden Quellen
unter abweichenden Bedingungen enthalten können – vor allem Belegzitate, Bilder
und Audiodateien. Die Umformung nimmt davon **nichts**: Übernommen werden
ausschließlich Stichwort, Wortart, Bedeutungsüberschrift, deutsche Übersetzung,
Genus und Marker. Zitate, Etymologien, Aussprache, Bilder und Audio werden
verworfen.

## Reproduktion

```
curl -LO https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz
shasum -a 256 raw-wiktextract-data.jsonl.gz

node scripts/dictionary/extract-wiktextract.mjs \
  --source raw-wiktextract-data.jsonl.gz \
  --out    build/dictionary/en-de.raw.jsonl \
  --report build/dictionary/report.json
```

Die Quelldatei wird dabei **nie vollständig entpackt**: `gunzip` läuft als
Transform-Stream, es liegt immer nur eine Zeile im Speicher. Ein voller
Durchlauf dauerte auf dem Prüfrechner 97 Sekunden.

Der zweite Schritt erzeugt den ausgelieferten Laufzeitdatensatz:

```
node scripts/dictionary/build-dictionary-runtime.mjs \
  --in   build/dictionary/en-de.raw.jsonl \
  --out  src/dictionary/data/dictionary.json \
  --meta src/dictionary/data/runtime-report.json \
  --source-report build/dictionary/report.json
```

Der erzeugte Bestand ist deterministisch – Schlüssel und Fächer sind sortiert,
zwei Läufe erzeugen dieselben Bytes. Die Prüfsumme der Ausgabe steht in
`src/dictionary/data/runtime-report.json` und wird bei jeder Neuerzeugung
mitgeschrieben.

Am erzeugten Datensatz wird **nichts von Hand geändert**. Korrekturen gehören in
die Transformationsregeln in `scripts/dictionary/wiktextract.mjs` – dort sind sie
nachvollziehbar, wiederholbar und durch `scripts/dictionary/wiktextract.test.mjs`
abgesichert.

## Transformationsregeln

Was aus einem Rohobjekt wird, entscheidet `scripts/dictionary/wiktextract.mjs`:

1. nur `lang_code === 'en'`, nur Übersetzungen mit `code === 'de'`;
2. gruppiert nach `translation.sense`, in der Reihenfolge der Quelle;
3. Genus aus `tags` (`masculine`/`feminine`/`neuter`), Registermarker getrennt
   davon erhalten (nie stillschweigend entfernt);
4. Klammerzusätze vom Wort getrennt;
5. Affixfragmente (`Militär-`, `-heit`) verworfen und gezählt;
6. Dubletten innerhalb einer Bedeutung entfernt, erstes Vorkommen gewinnt;
7. Flexionsformen (`form_of`/`alt_of`) nur, wenn der Eintrag **keine** eigenen
   Übersetzungen hat – sonst gingen `island` und `casualty` verloren;
8. Verweise zwischen Stichwörtern (`doctor` → `physician`) unter vier
   Bedingungen: erster Teilsatz gleich dem Link, gegenseitige Nennung, genau
   eine Bedeutung, Tiefe eins ohne Zyklen und über dieselbe Wortart;
9. Eigennamen (`pos: name`) fallen im Laufzeitschritt heraus.

## Was das Wörterbuch nicht ist

Es ist keine geprüfte fachliche Autorität. Wiktionary ist ein Wiki; die
Übersetzungen sind unterschiedlich gut belegt, manche veraltet, manche
regional, manche schlicht falsch. Deshalb gilt in LexiFlow ausnahmslos: **kein
Wörterbuchvorschlag wird ungeprüft als deutsche Antwort gespeichert.** Die
Lehrkraft entscheidet über jede einzelne Vokabel.
