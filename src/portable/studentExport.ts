import { APP_NAME, APP_VERSION, describeZodErrors, toPackFile } from '../domain/vocabpack';
import {
  learningAreaDocumentTitle,
  learningAreaFileName,
  learningAreaFileSchema,
  parseLearningArea,
  singlePackArea,
  toLearningAreaFile,
  type LearningArea,
  type LearningAreaFile,
} from '../domain/learningArea';
import { type PackMeta, type VocabPack, type VocabPackFile } from '../domain/schema';

/**
 * Lerndatei erzeugen – ein Lernbereich, eine HTML-Datei, kein Server.
 *
 * Diese Datei ist rein: kein React, kein IndexedDB, kein `document`. Sie nimmt
 * die generische Lernlaufzeit (eine vollständige HTML-Datei mit
 * eingebettetem JavaScript, CSS und Schriften) und setzt einen Lernbereich
 * hinein.
 *
 * ## Warum immer ein Lernbereich, auch bei einem Paket
 *
 * Seit 4B.7 kann eine Lehrkraft mehrere Pakete in **eine** Datei geben. Der
 * naheliegende Weg wäre gewesen, das neben dem Einzelpaket-Export
 * einzurichten – zwei Wege, zwei Datenformen, zwei Leseroutinen. Der Weg hier
 * ist der andere: Es gibt nur noch Lernbereiche, und ein einzelnes Paket ist
 * einer mit genau einem Paket. Warum das für den Lernstand entscheidend ist,
 * steht in `domain/learningArea.ts`.
 *
 * ## Warum die Daten in einem `application/json`-Script-Tag stehen
 *
 * Der naheliegende Weg – `<script>window.PACK = {…}</script>` – wäre eine
 * Einladung zur Skriptinjektion: Eine Vokabel mit dem Text `</script><script>…`
 * bräche aus dem String aus. Deshalb:
 *
 * 1. Die Daten stehen in einem Element mit `type="application/json"`. Der
 *    Browser führt es nicht aus, sondern hält es als Text bereit.
 * 2. Beim Serialisieren wird jedes `<` zu `<`. Damit kann die Zeichenkette
 *    `</script` im JSON gar nicht mehr vorkommen – unabhängig davon, was in den
 *    Vokabeln steht. `&` und Zeilentrenner werden aus demselben Grund
 *    maskiert.
 * 3. Gelesen wird mit `JSON.parse(el.textContent)` und **erneut** gegen das
 *    Schema geprüft. Kein `eval`, kein `document.write`, kein `innerHTML`.
 */

/** Markierung in der Laufzeitdatei, an deren Stelle der Lernbereich kommt. */
export const PACK_PLACEHOLDER = '"__LEXIFLOW_PACK__"';
/** Markierung für den Fenstertitel. */
export const TITLE_PLACEHOLDER = '<!--LEXIFLOW_TITLE-->';
/** Id des Script-Tags, in dem das Paket steht. */
export const PACK_ELEMENT_ID = 'lexiflow-pack';

/**
 * JSON, das in einem HTML-Script-Tag sicher steht.
 *
 * `<` ist der einzige Weg, ein Element zu beenden – wer ihn ausnahmslos
 * maskiert, kann das Dokument nicht mehr verlassen. `&` verhindert, dass ein
 * HTML-Parser Entitäten hineinliest; U+2028/U+2029 sind in JavaScript
 * Zeilentrenner und haben in JSON-Strings nichts verloren.
 */
export function encodeEmbeddedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export type StudentExportResult =
  | { ok: true; html: string; filename: string }
  | { ok: false; errors: string[] };

/**
 * Ein Dateiname, den man einer Klasse schicken kann.
 *
 * Umlaute werden ausgeschrieben, alles Übrige auf ASCII reduziert: Der Name
 * überlebt Windows, macOS, Moodle und E-Mail-Anhänge unverändert. Punkte,
 * Schrägstriche und Steuerzeichen können nicht entstehen – ein Titel wie
 * `../../etc/passwd` ergibt `etc-passwd`.
 */
export function studentFileName(meta: Pick<PackMeta, 'title' | 'grade'>): string {
  const slug = meta.title
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  const grade = meta.grade
    .toLocaleLowerCase('de-DE')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = slug || 'vokabelpaket';
  return `${base}${grade ? `-${grade}` : ''}-lexiflow.html`;
}

/** Der Fenstertitel der Lerndatei – ohne HTML-Sonderzeichen. */
export function studentDocumentTitle(meta: Pick<PackMeta, 'title'>): string {
  const clean = meta.title.replace(/[<>&"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${clean || 'Vokabelpaket'} – LexiFlow`;
}

/**
 * Genau die übergebenen Pakete – und sonst nichts.
 *
 * Bewusst über `toPackFile` statt über eine eigene Struktur: Was in der
 * Lerndatei landet, ist Zeichen für Zeichen dasselbe wie in einer
 * `.vocabpack.json`. Lernstände, andere Pakete, Entwurfszustände, KI-Prompts
 * und Providerdaten kommen dort nicht vor, weil `VocabPackFile` sie gar nicht
 * kennt.
 */
export function toStudentPayload(pack: VocabPack): VocabPackFile {
  return toPackFile(pack);
}

/**
 * Setzt einen Lernbereich in die Lernlaufzeit ein.
 *
 * Vor dem Einsetzen wird gegen dasselbe Schema geprüft, mit dem die fertige
 * Datei ihn beim Öffnen wieder liest. Was hier nicht durchkommt, wird nicht
 * ausgeliefert – eine kaputte Datei bei 28 Lernenden ist teurer als eine
 * Fehlermeldung bei einer Lehrkraft.
 */
export function buildLearningAreaHtml(
  runtime: string,
  area: Pick<LearningArea, 'id' | 'title' | 'description'>,
  packs: readonly VocabPack[],
): StudentExportResult {
  return embed(runtime, toLearningAreaFile(area, packs), learningAreaFileName(area.title));
}

/**
 * Setzt ein einzelnes Paket in die Lernlaufzeit ein.
 *
 * Derselbe Weg wie oben, nur mit einem Bereich aus einem Paket – und mit dem
 * gewohnten Dateinamen, der die Klassenstufe trägt. Die Kennung des Bereichs
 * ist die des Pakets; daran hängt, dass eine erneut ausgegebene Datei den
 * Lernstand der vorigen wiederfindet.
 */
export function buildStudentHtml(runtime: string, pack: VocabPack): StudentExportResult {
  return embed(runtime, singlePackArea(pack), studentFileName(pack.meta));
}

/** Der gemeinsame Weg: prüfen, einsetzen, benennen. */
function embed(runtime: string, area: LearningAreaFile, filename: string): StudentExportResult {
  const parsed = learningAreaFileSchema.safeParse(area);
  if (!parsed.success) return { ok: false, errors: describeZodErrors(parsed.error) };

  if (!runtime.includes(PACK_PLACEHOLDER)) {
    return {
      ok: false,
      errors: [
        'Die Lernlaufzeit enthält keine Stelle für den Lernbereich. Der Build ist unvollständig.',
      ],
    };
  }

  const html = runtime
    .replace(PACK_PLACEHOLDER, encodeEmbeddedJson(area))
    .replace(TITLE_PLACEHOLDER, learningAreaDocumentTitle(area.title));

  return { ok: true, html, filename };
}

/**
 * Liest den eingebetteten Lernbereich wieder aus – der Weg, den die
 * Lerndatei beim Öffnen geht, und zugleich der Weg, auf dem Tests einen
 * Export prüfen.
 *
 * `parseLearningArea` nimmt auch eine Datei aus der Zeit vor den
 * Lernbereichen an, in der ein nacktes Paket steht.
 */
export type EmbeddedAreaResult =
  | { ok: true; area: LearningAreaFile }
  | { ok: false; errors: string[] };

export function readEmbeddedJson(text: string | null | undefined): EmbeddedAreaResult {
  const raw = (text ?? '').trim();
  if (!raw || raw === PACK_PLACEHOLDER || raw === 'null') {
    return { ok: false, errors: ['In dieser Datei sind keine Vokabeln enthalten.'] };
  }
  // Derselbe Weg wie beim Dateiimport: JSON lesen, migrieren, gegen das Schema
  // prüfen. Eine zweite, laxere Prüfung gäbe es damit nirgends.
  return parseLearningArea(raw);
}

/** Kennzeichnung der Datei – für Kopfzeile und Fehlerseite. */
export const PORTABLE_APP = { name: APP_NAME, version: APP_VERSION } as const;
