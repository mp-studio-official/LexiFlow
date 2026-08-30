import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { columnIndexFromRef, readXlsx, XlsxReadError } from './xlsx';

/** Baut eine minimale, aber formal gültige XLSX-Datei im Speicher. */
function makeWorkbook(options: { withSharedStrings?: boolean } = {}): ArrayBuffer {
  const shared = ['Englisch', 'Deutsch', 'crowded', 'überfüllt', 'litter', 'Müll'];

  const sheet = options.withSharedStrings === false
    ? `<worksheet><sheetData>
         <row r="1"><c r="A1" t="inlineStr"><is><t>Englisch</t></is></c><c r="B1" t="inlineStr"><is><t>Deutsch</t></is></c></row>
         <row r="2"><c r="A2" t="inlineStr"><is><t>crowded</t></is></c><c r="B2" t="inlineStr"><is><t>überfüllt</t></is></c></row>
       </sheetData></worksheet>`
    : `<worksheet><sheetData>
         <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
         <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>
         <row r="3"><c r="A3" t="s"><v>4</v></c><c r="C3" t="s"><v>5</v></c></row>
       </sheetData></worksheet>`;

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8(
      `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Vokabeln" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  };

  if (options.withSharedStrings !== false) {
    files['xl/sharedStrings.xml'] = strToU8(
      `<sst>${shared.map((value) => `<si><t>${value}</t></si>`).join('')}</sst>`,
    );
  }

  const zipped = zipSync(files);
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

describe('columnIndexFromRef', () => {
  it('rechnet Spaltenbuchstaben in Indizes um', () => {
    expect(columnIndexFromRef('A1')).toBe(0);
    expect(columnIndexFromRef('C3')).toBe(2);
    expect(columnIndexFromRef('AA10')).toBe(26);
  });
});

describe('readXlsx', () => {
  it('liest Zellen über die gemeinsame Zeichenkettentabelle', () => {
    const sheets = readXlsx(makeWorkbook());
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.name).toBe('Vokabeln');
    expect(sheets[0]?.rows[0]).toEqual(['Englisch', 'Deutsch']);
    expect(sheets[0]?.rows[1]).toEqual(['crowded', 'überfüllt']);
  });

  it('füllt Lücken zwischen Spalten auf', () => {
    const rows = readXlsx(makeWorkbook())[0]?.rows ?? [];
    expect(rows[2]).toEqual(['litter', '', 'Müll']);
  });

  it('liest auch eingebettete Zeichenketten', () => {
    const sheets = readXlsx(makeWorkbook({ withSharedStrings: false }));
    expect(sheets[0]?.rows[1]).toEqual(['crowded', 'überfüllt']);
  });

  it('meldet ungültige Dateien verständlich', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(() => readXlsx(bytes.buffer as ArrayBuffer)).toThrow(XlsxReadError);
  });
});
