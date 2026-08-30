/**
 * Schlanker, RFC-4180-orientierter CSV-Parser ohne externe Abhängigkeit.
 * Er erkennt das Trennzeichen selbst – deutsche Excel-Exporte nutzen `;`,
 * englische `,`, Kopien aus Tabellen häufig Tabulatoren.
 */

export const CANDIDATE_DELIMITERS = [';', ',', '\t', '|'] as const;
export type Delimiter = (typeof CANDIDATE_DELIMITERS)[number];

const BOM = '﻿';

export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(1) : text;
}

/**
 * Wählt das Trennzeichen, das die meisten Zeilen in gleich viele (>1) Felder
 * zerlegt. Bei Gleichstand gewinnt das häufigere Zeichen.
 */
export function detectDelimiter(text: string): Delimiter {
  const sample = stripBom(text).split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 30);
  if (sample.length === 0) return ';';

  let best: { delimiter: Delimiter; score: number } = { delimiter: ';', score: -1 };
  for (const delimiter of CANDIDATE_DELIMITERS) {
    const counts = sample.map((line) => splitLineNaively(line, delimiter).length);
    const max = Math.max(...counts);
    if (max < 2) continue;
    const consistent = counts.filter((count) => count === max).length;
    const score = consistent * 10 + max;
    if (score > best.score) best = { delimiter, score };
  }
  return best.score < 0 ? ';' : best.delimiter;
}

function splitLineNaively(line: string, delimiter: string): string[] {
  return line.split(delimiter);
}

/** Zerlegt CSV-Text in Zeilen und Felder. Leere Zeilen entfallen. */
export function parseCsv(text: string, delimiter?: Delimiter): string[][] {
  const input = stripBom(text).replace(/\r\n?/g, '\n');
  const sep = delimiter ?? detectDelimiter(input);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] as string;

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
    } else if (char === sep) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);

  return rows
    .map((cells) => cells.map((cell) => cell.trim()))
    .filter((cells) => cells.some((cell) => cell.length > 0));
}

/**
 * Freitext aus der Zwischenablage: eine Vokabel pro Zeile, Trennung durch
 * Tabulator, Semikolon, „ - “, „ – “, „=“ oder Komma.
 */
export function parsePastedText(text: string): string[][] {
  const lines = stripBom(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const separators: Array<{ label: string; pattern: RegExp }> = [
    { label: 'tab', pattern: /\t+/ },
    { label: 'semicolon', pattern: /\s*;\s*/ },
    { label: 'dash', pattern: /\s+[-–—]\s+/ },
    { label: 'equals', pattern: /\s*=\s*/ },
    { label: 'comma', pattern: /\s*,\s*/ },
  ];

  let bestPattern: RegExp | undefined;
  let bestHits = 0;
  for (const { pattern } of separators) {
    const hits = lines.filter((line) => pattern.test(line)).length;
    if (hits > bestHits) {
      bestHits = hits;
      bestPattern = pattern;
    }
  }

  if (!bestPattern) return lines.map((line) => [line]);

  const splitter = new RegExp(bestPattern.source, 'g');
  return lines.map((line) =>
    line
      .split(splitter)
      .map((part) => part.trim())
      .filter((part, index, all) => part.length > 0 || index < all.length - 1),
  );
}
