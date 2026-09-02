/**
 * pdf.js liefert für den Workerbau keine Typen mit – er ist nicht als
 * öffentliche API gedacht, sondern als Datei, die ein Browser-Worker lädt.
 *
 * Wir laden ihn trotzdem als Modul, weil die portable Einzeldatei keine
 * zweite Datei nachladen kann (siehe `pdfText.ts`). Gebraucht wird daraus
 * genau ein Export: der `WorkerMessageHandler`, den pdf.js unter
 * `globalThis.pdfjsWorker` erwartet.
 */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
