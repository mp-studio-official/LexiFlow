import {
  APP_NAME,
  APP_VERSION,
  describeZodErrors,
  parsePackFile,
  toPackFile,
} from '../domain/vocabpack';
import { vocabPackFileSchema, type PackMeta, type VocabPack, type VocabPackFile } from '../domain/schema';

/**
 * Schülerdatei erzeugen – ein Paket, eine HTML-Datei, kein Server.
 *
 * Diese Datei ist rein: kein React, kein IndexedDB, kein `document`. Sie nimmt
 * die generische Schülerlaufzeit (eine vollständige HTML-Datei mit
 * eingebettetem JavaScript, CSS und Schriften) und setzt genau ein Paket
 * hinein.
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

/** Markierung in der Laufzeitdatei, an deren Stelle das Paket kommt. */
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

/** Der Fenstertitel der Schülerdatei – ohne HTML-Sonderzeichen. */
export function studentDocumentTitle(meta: Pick<PackMeta, 'title'>): string {
  const clean = meta.title.replace(/[<>&"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${clean || 'Vokabelpaket'} – LexiFlow`;
}

/**
 * Genau das übergebene Paket – und sonst nichts.
 *
 * Bewusst über `toPackFile` statt über eine eigene Struktur: Was in der
 * Schülerdatei landet, ist Zeichen für Zeichen dasselbe wie in einer
 * `.vocabpack.json`. Lernstände, andere Pakete, Entwurfszustände, KI-Prompts
 * und Providerdaten kommen dort nicht vor, weil `VocabPackFile` sie gar nicht
 * kennt.
 */
export function toStudentPayload(pack: VocabPack): VocabPackFile {
  return toPackFile(pack);
}

/**
 * Setzt ein Paket in die Schülerlaufzeit ein.
 *
 * Vor dem Einsetzen wird gegen dasselbe Schema geprüft wie beim Import einer
 * `.vocabpack.json`. Was hier nicht durchkommt, wird nicht ausgeliefert – eine
 * kaputte Datei bei 28 Lernenden ist teurer als eine Fehlermeldung bei einer
 * Lehrkraft.
 */
export function buildStudentHtml(runtime: string, pack: VocabPack): StudentExportResult {
  const payload = toStudentPayload(pack);
  const parsed = vocabPackFileSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, errors: describeZodErrors(parsed.error) };

  if (!runtime.includes(PACK_PLACEHOLDER)) {
    return {
      ok: false,
      errors: ['Die Schülerlaufzeit enthält keine Stelle für das Paket. Der Build ist unvollständig.'],
    };
  }

  const html = runtime
    .replace(PACK_PLACEHOLDER, encodeEmbeddedJson(payload))
    .replace(TITLE_PLACEHOLDER, studentDocumentTitle(pack.meta));

  return { ok: true, html, filename: studentFileName(pack.meta) };
}

/**
 * Liest das eingebettete Paket wieder aus – der Weg, den die Schülerdatei
 * beim Öffnen geht, und zugleich der Weg, auf dem Tests einen Export prüfen.
 */
export type EmbeddedPackResult =
  | { ok: true; pack: VocabPackFile }
  | { ok: false; errors: string[] };

export function readEmbeddedJson(text: string | null | undefined): EmbeddedPackResult {
  const raw = (text ?? '').trim();
  if (!raw || raw === PACK_PLACEHOLDER || raw === 'null') {
    return { ok: false, errors: ['In dieser Datei ist kein Vokabelpaket enthalten.'] };
  }
  // Derselbe Weg wie beim Dateiimport: JSON lesen, migrieren, gegen das Schema
  // prüfen. Eine zweite, laxere Prüfung gäbe es damit nirgends.
  return parsePackFile(raw);
}

/** Kennzeichnung der Datei – für Kopfzeile und Fehlerseite. */
export const PORTABLE_APP = { name: APP_NAME, version: APP_VERSION } as const;
