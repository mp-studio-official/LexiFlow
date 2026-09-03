/**
 * Die Größenschranken der portablen Dateien – **eine** Quelle.
 *
 * Bis 4B.3 standen die Zahlen an vier Stellen: im Prüfskript und in zwei
 * Artefakttests je einmal, dazu in der Dokumentation. Vier Zahlen, die
 * dasselbe meinen, driften auseinander – und eine Schranke, die an einer
 * Stelle 700 und an einer anderen 1024 sagt, ist keine Schranke mehr.
 *
 * ## Wozu die Schranken da sind
 *
 * Sie sind ein **Warn-Gate**, kein Sparziel. Eine Datei, die per E-Mail nicht
 * mehr durchgeht, ist keine portable Datei mehr – und eine Lernlaufzeit, die
 * unbemerkt Wörterbuchdaten oder die PDF-Bibliothek mitschleppt, ist ein
 * Fehler, den man ohne Messung erst beim Versand bemerkt.
 *
 * Sie sind ausdrücklich **kein** Grund, Funktionen für Lernende wegzulassen
 * oder schlechter zu bauen. Schlägt eine Schranke an, ist die erste Frage,
 * *was* dazugekommen ist – und erst die zweite, ob die Zahl noch stimmt.
 */

/**
 * Die Lehrkraftdatei enthält das vollständige Offline-Wörterbuch und die
 * PDF-Bibliothek. Zwölf Mebibyte sind die Grenze aus dem Sprintauftrag 4B.2.
 */
export const TEACHER_LIMIT_MIB = 12;

/**
 * Die Lernlaufzeit: **1 MiB** (seit 4B.3, vorher 700 KiB).
 *
 * Die alte Zahl stammte aus 4A.2 und war an dem Stand von damals gemessen
 * (620,7 KiB vor dem Wörterbuch) – eine knappe Marke, die anschlagen sollte,
 * sobald jemand versehentlich Wörterbuchdaten in den Lernpfad zieht. Genau
 * das leistet sie weiterhin: Das Wörterbuch allein sind 6,1 MB, die
 * PDF-Bibliothek 1,3 MB; beides schlägt bei jeder denkbaren Marke an.
 *
 * Angehoben wurde sie, weil die Lernlaufzeit inzwischen echte Funktionen
 * dazubekommen hat – zuletzt die druckbare Vokabelliste – und eine Schranke,
 * die zum Funktionsabbau zwingt, das Falsche misst. 1 MiB lässt Luft für
 * Lernfunktionen und schlägt bei einem versehentlichen Lehrkraftimport
 * trotzdem sofort an.
 */
export const RUNTIME_LIMIT_KIB = 1024;
