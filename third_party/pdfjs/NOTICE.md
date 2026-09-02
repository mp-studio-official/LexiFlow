# pdf.js (`pdfjs-dist`) – Herkunft, Lizenz und was wir daran ändern

LexiFlow liest PDF-Dateien mit **pdf.js** von der Mozilla Foundation. Die
Bibliothek wird **mitgeliefert**, nicht nachgeladen: Sie steckt im Bündel des
Lehrkraftbereichs und in der portablen Einzeldatei. Damit ist sie Teil dessen,
was wir weitergeben – und dieses Dokument ist die dazugehörige Angabe.

## Die Angaben

| | |
| --- | --- |
| Paket | [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) |
| Version | **4.10.38** |
| Urheberin | Mozilla Foundation und Mitwirkende |
| Copyright | Copyright 2024 Mozilla Foundation |
| Lizenz | **Apache License 2.0** |
| Lizenztext | `third_party/pdfjs/LICENSE` (unveränderte Kopie aus dem Paket) |
| Projektseite | https://github.com/mozilla/pdf.js |
| Verwendete Dateien | `legacy/build/pdf.mjs`, `legacy/build/pdf.worker.mjs` |

Das Paket selbst enthält **keine** `NOTICE`-Datei. Abschnitt 4 (d) der Apache
License verpflichtet damit zu keiner weiterzureichenden Hinweisdatei; die
Pflichten aus 4 (a) und 4 (b) – Lizenztext mitgeben, Änderungen kenntlich
machen – erfüllen die Kopie oben und der Abschnitt unten.

## Was wir am Verhalten ändern

Der ausgelieferte Code ist **unverändert**. Wir bearbeiten keine Datei des
Pakets und patchen nichts. Geändert ist allein, *wie* wir die Bibliothek
aufrufen, und das an drei Stellen (alle in `src/import/pdfText.ts`):

1. **Kein externer Worker.** `disableWorker: true`, und der Workercode wird
   über `globalThis.pdfjsWorker` bereitgestellt, statt ihn zur Laufzeit von
   einer URL zu holen. Ohne das schlüge der Import unter `file://` und in der
   portablen Einzeldatei fehl – dort gibt es keine zweite Datei und kein Netz.
2. **Keine externen Ressourcen.** `disableFontFace`, `useSystemFonts: false`,
   `isEvalSupported: false`. Wir rendern nicht, wir lesen Text; Schriften,
   CMaps und Standardschriften werden weder gebraucht noch geladen.
3. **`Promise.try` wird ergänzt, falls es fehlt.** pdf.js 4.10.38 benutzt
   `Promise.try`; Safari kennt es erst ab 18.2. Die Ergänzung steht *vor* dem
   Laden von pdf.js und überschreibt eine vorhandene Implementierung
   ausdrücklich **nicht** (`??=`). Beides ist in `src/import/pdfText.test.ts`
   geprüft.

## Warum diese Version und dieser Build

**4.10.38 statt 6.x:** Die 6er-Reihe setzt `Promise.try` als vorhanden voraus
und bricht in Safari vor 18.2 sowie in Node 22 beim Auswerten des Moduls ab –
also *vor* jeder Stelle, an der man das noch abfangen könnte. Der Legacy-Build
der 4er-Reihe zielt auf ältere Browser und läuft dort.

**`legacy/` statt `build/`:** Für ein Schul-iPad ohne Systemupdate ist das der
Unterschied zwischen „funktioniert“ und „weiße Seite“.

## Was das kostet

Die beiden Dateien sind zusammen rund 3,1 MB unkomprimiert. Sie liegen
**ausschließlich** im Lehrkraftbündel: Die Schülerlaufzeit importiert
`pdfText.ts` nirgends, und die Lerndatei wächst durch die PDF-Unterstützung
nicht. Nachweis in `scripts/verify-portable.mjs` und
`src/portability/*.test.ts`.
