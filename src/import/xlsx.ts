import { unzipSync } from 'fflate';

/**
 * Minimaler XLSX-Leser.
 *
 * Ein Vokabelimport braucht nur Text pro Zelle – keine Formeln, Formate oder
 * Diagramme. Deshalb wird die Datei direkt entpackt und das Tabellenblatt-XML
 * gelesen, statt eine große Tabellenbibliothek einzubinden. Das hält das Bundle
 * klein und vermeidet zusätzliche Abhängigkeiten in einer Offline-App.
 */

export interface XlsxSheet {
  name: string;
  rows: string[][];
}

export class XlsxReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XlsxReadError';
  }
}

const decoder = new TextDecoder('utf-8');

function parseXml(source: string): Document {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new XlsxReadError('Die Arbeitsmappe konnte nicht gelesen werden.');
  }
  return doc;
}

/** Wandelt „C“, „AB“ … in einen 0-basierten Spaltenindex. */
export function columnIndexFromRef(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1] ?? '';
  let index = 0;
  for (const char of letters) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
}

function textOf(element: Element | null | undefined): string {
  return element?.textContent ?? '';
}

function readSharedStrings(files: Record<string, Uint8Array>): string[] {
  const raw = files['xl/sharedStrings.xml'];
  if (!raw) return [];
  const doc = parseXml(decoder.decode(raw));
  return Array.from(doc.getElementsByTagName('si')).map((si) => {
    // Ein <si> kann aus mehreren <t>-Teilen bestehen (Rich Text).
    const parts = Array.from(si.getElementsByTagName('t')).map((t) => textOf(t));
    return parts.join('');
  });
}

function readSheetOrder(files: Record<string, Uint8Array>): Array<{ name: string; path: string }> {
  const workbook = files['xl/workbook.xml'];
  const rels = files['xl/_rels/workbook.xml.rels'];
  if (!workbook || !rels) return fallbackSheetOrder(files);

  const relMap = new Map<string, string>();
  for (const rel of Array.from(parseXml(decoder.decode(rels)).getElementsByTagName('Relationship'))) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) relMap.set(id, target.replace(/^\/?xl\//, '').replace(/^\.\//, ''));
  }

  const sheets = Array.from(parseXml(decoder.decode(workbook)).getElementsByTagName('sheet'));
  const ordered = sheets.flatMap((sheet) => {
    const name = sheet.getAttribute('name') ?? 'Tabelle';
    const rid =
      sheet.getAttribute('r:id') ??
      sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = rid ? relMap.get(rid) : undefined;
    if (!target) return [];
    const path = `xl/${target}`;
    return path in files ? [{ name, path }] : [];
  });

  return ordered.length > 0 ? ordered : fallbackSheetOrder(files);
}

function fallbackSheetOrder(files: Record<string, Uint8Array>): Array<{ name: string; path: string }> {
  return Object.keys(files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
    .sort((a, b) => Number(/(\d+)/.exec(a)?.[1] ?? 0) - Number(/(\d+)/.exec(b)?.[1] ?? 0))
    .map((path, index) => ({ name: `Tabelle${index + 1}`, path }));
}

function readSheet(xml: string, sharedStrings: readonly string[]): string[][] {
  const doc = parseXml(xml);
  const rows: string[][] = [];

  for (const rowEl of Array.from(doc.getElementsByTagName('row'))) {
    const cells: string[] = [];
    for (const cellEl of Array.from(rowEl.getElementsByTagName('c'))) {
      const ref = cellEl.getAttribute('r') ?? '';
      const index = ref ? columnIndexFromRef(ref) : cells.length;
      const type = cellEl.getAttribute('t');

      let value = '';
      if (type === 's') {
        const position = Number(textOf(cellEl.getElementsByTagName('v')[0]));
        value = sharedStrings[position] ?? '';
      } else if (type === 'inlineStr') {
        value = Array.from(cellEl.getElementsByTagName('t')).map(textOf).join('');
      } else {
        value = textOf(cellEl.getElementsByTagName('v')[0]);
      }

      while (cells.length < index) cells.push('');
      cells[index] = value.trim();
    }
    rows.push(cells);
  }

  return rows.filter((cells) => cells.some((cell) => cell.length > 0));
}

/** Liest alle Tabellenblätter einer XLSX-Datei. */
export function readXlsx(buffer: ArrayBuffer): XlsxSheet[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new XlsxReadError('Die Datei ist keine gültige XLSX-Arbeitsmappe.');
  }

  const sharedStrings = readSharedStrings(files);
  const sheets = readSheetOrder(files);
  if (sheets.length === 0) throw new XlsxReadError('Die Arbeitsmappe enthält kein Tabellenblatt.');

  return sheets.map(({ name, path }) => ({
    name,
    rows: readSheet(decoder.decode(files[path] as Uint8Array), sharedStrings),
  }));
}
